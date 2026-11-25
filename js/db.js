import { firebaseConfig } from './firebase-config.js';

const placeholder = !firebaseConfig || Object.values(firebaseConfig).some(v => typeof v !== 'string' || v.includes('YOUR_'));
const demoMode = placeholder;

let uid = localStorage.getItem('classCalendarDemoUid');
if (!uid) {
  uid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  localStorage.setItem('classCalendarDemoUid', uid);
}

const nowIso = () => new Date().toISOString();
const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const demo = {
  key: 'classCalendarDemoData',
  read() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return { events: [], tasks: {}, attendees: {}, claims: {} };
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.events) || typeof data.tasks !== 'object' || typeof data.attendees !== 'object' || typeof data.claims !== 'object') {
        throw new Error('מבנה נתונים לא תקין');
      }
      return data;
    } catch (error) {
      const empty = { events: [], tasks: {}, attendees: {}, claims: {} };
      localStorage.setItem(this.key, JSON.stringify(empty));
      return empty;
    }
  },
  write(data) { localStorage.setItem(this.key, JSON.stringify(data)); },
};

let firebase = null;
let authReady = Promise.resolve(uid);

if (!demoMode) {
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);
  firebase = { ...fs, app, db, auth };
  authReady = (async () => {
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);
    const credential = authMod.currentUser ? null : await authMod.signInAnonymously(auth);
    uid = (authMod.currentUser || credential?.user).uid;
    return uid;
  })();
}

export { demoMode, uid, authReady };

export async function createEvent(input) {
  await authReady;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) throw new Error('נא לבחור תאריך תקין');
  if (!input.title || input.title.trim().length > 80) throw new Error('כותרת לא תקינה');
  if (!input.hostName || input.hostName.trim().length > 60) throw new Error('שם מארחת לא תקין');
  if ((input.description || '').length > 1000) throw new Error('התיאור ארוך מדי');
  if ((input.location || '').length > 120) throw new Error('המיקום ארוך מדי');
  if ((input.personalLines || []).length > 5 || input.personalLines.some(line => line.length > 120)) throw new Error('שורות אישיות לא תקינות');
  if (input.imageDataUrl && input.imageDataUrl.length > 700 * 1024) throw new Error('התמונה גדולה מדי');
  const id = makeId();
  const event = {
    id, title: input.title.trim(), date: input.date, time: input.time || '', location: (input.location || '').trim(),
    hostName: input.hostName.trim(), description: (input.description || '').trim(), imageDataUrl: input.imageDataUrl || '',
    personalLines: input.personalLines || [], ownerUid: uid, tasksEnabled: !!input.tasksEnabled,
    createdAt: nowIso()
  };
  if (demoMode) {
    const data = demo.read();
    data.events.push(event);
    data.tasks[id] = (input.tasks || []).filter(t => t.label && t.label.trim()).map(t => ({
      id: makeId(), label: t.label.trim(), quantity: Number(t.quantity), allowMultiple: !!t.allowMultiple
    }));
    demo.write(data);
  } else {
    const { doc, setDoc } = firebase;
    await setDoc(doc(firebase.db, 'events', id), event);
    for (const task of (input.tasks || []).filter(t => t.label && t.label.trim())) {
      await setDoc(doc(firebase.db, 'events', id, 'tasks', makeId()), {
        label: task.label.trim(), quantity: Number(task.quantity), allowMultiple: !!task.allowMultiple
      });
    }
  }
  return { event };
}

export async function getEvents() {
  await authReady;
  if (demoMode) return demo.read().events;
  const { collection, getDocs, query, orderBy } = firebase;
  const snap = await getDocs(query(collection(firebase.db, 'events'), orderBy('date')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getEvent(id) {
  await authReady;
  if (demoMode) return demo.read().events.find(e => e.id === id) || null;
  const { doc, getDoc } = firebase;
  const snap = await getDoc(doc(firebase.db, 'events', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateEvent(id, changes) {
  await authReady;
  if (demoMode) {
    const data = demo.read(); const i = data.events.findIndex(e => e.id === id);
    if (i < 0) throw new Error('האירוע לא נמצא');
    if (data.events[i].ownerUid !== uid) throw new Error('רק המארחת יכולה לערוך את האירוע');
    data.events[i] = { ...data.events[i], ...changes }; demo.write(data); return;
  }
  const { doc, updateDoc } = firebase;
  await updateDoc(doc(firebase.db, 'events', id), changes);
}

export async function deleteEvent(id) {
  await authReady;
  if (demoMode) {
    const data = demo.read(); const event = data.events.find(e => e.id === id);
    if (!event) throw new Error('האירוע לא נמצא');
    if (event.ownerUid !== uid) throw new Error('רק המארחת יכולה למחוק את האירוע');
    data.events = data.events.filter(e => e.id !== id);
    delete data.tasks[id]; delete data.attendees[id]; delete data.claims[id]; demo.write(data); return;
  }
  const { doc, deleteDoc, collection, getDocs, writeBatch } = firebase;
  const root = doc(firebase.db, 'events', id);
  const batch = writeBatch(firebase.db);
  const attendeesSnap = await getDocs(collection(firebase.db, 'events', id, 'attendees'));
  attendeesSnap.docs.forEach(d => batch.delete(d.ref));
  const tasksSnap = await getDocs(collection(firebase.db, 'events', id, 'tasks'));
  for (const taskDoc of tasksSnap.docs) {
    const claimsSnap = await getDocs(collection(firebase.db, 'events', id, 'tasks', taskDoc.id, 'claims'));
    claimsSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(taskDoc.ref);
  }
  batch.delete(root); await batch.commit();
}

export async function toggleAttendance(id) {
  await authReady;
  if (demoMode) {
    const data = demo.read();
    data.attendees[id] ||= {};
    if (!data.events.some(e => e.id === id)) throw new Error('האירוע לא נמצא');
    if (data.attendees[id][uid]) delete data.attendees[id][uid];
    else data.attendees[id][uid] = { createdAt: nowIso() };
    demo.write(data);
    return Object.keys(data.attendees[id]).length;
  }
  const fs = firebase;
  const eventRef = fs.doc(fs.db, 'events', id);
  const attendeeRef = fs.doc(fs.db, 'events', id, 'attendees', uid);
  await fs.runTransaction(fs.db, async transaction => {
    const [eventSnap, attendeeSnap] = await Promise.all([transaction.get(eventRef), transaction.get(attendeeRef)]);
    if (!eventSnap.exists()) throw new Error('האירוע לא נמצא');
    if (attendeeSnap.exists()) transaction.delete(attendeeRef);
    else transaction.set(attendeeRef, { createdAt: nowIso() });
  });
  return await getAttendeeCount(id);
}

export async function getAttendeeCount(id) {
  await authReady;
  if (demoMode) {
    const data = demo.read();
    return Object.keys(data.attendees[id] || {}).length;
  }
  const fs = firebase;
  if (fs.getCountFromServer) {
    const countSnap = await fs.getCountFromServer(fs.collection(fs.db, 'events', id, 'attendees'));
    return countSnap.data().count;
  }
  const snap = await fs.getDocs(fs.collection(fs.db, 'events', id, 'attendees'));
  return snap.size;
}

export async function isAttending(id) {
  await authReady;
  if (demoMode) return !!demo.read().attendees[id]?.[uid];
  const snap = await firebase.getDoc(firebase.doc(firebase.db, 'events', id, 'attendees', uid));
  return snap.exists();
}

export async function getTasks(id) {
  await authReady;
  if (demoMode) {
    const data = demo.read();
    return (data.tasks[id] || []).map(t => ({ ...t, claims: Object.entries(data.claims[id]?.[t.id] || {}).map(([claimUid, c]) => ({ uid: claimUid, ...c })) }));
  }
  const fs = firebase;
  const tasksSnap = await fs.getDocs(fs.collection(fs.db, 'events', id, 'tasks'));
  const result = [];
  for (const d of tasksSnap.docs) {
    const claimsSnap = await fs.getDocs(fs.collection(fs.db, 'events', id, 'tasks', d.id, 'claims'));
    result.push({ id: d.id, ...d.data(), claims: claimsSnap.docs.map(c => ({ uid: c.id, ...c.data() })) });
  }
  return result;
}

export async function saveTask(id, taskId, input) {
  await authReady;
  if (!input.label || input.label.trim().length > 80) throw new Error('שם הפריט לא תקין');
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('כמות לא תקינה');
  if (demoMode) {
    const data = demo.read(); const event = data.events.find(e => e.id === id);
    if (!event) throw new Error('האירוע לא נמצא');
    if (event.ownerUid !== uid) throw new Error('רק המארחת יכולה לנהל פריטים');
    data.tasks[id] ||= [];
    const i = data.tasks[id].findIndex(t => t.id === taskId);
    const task = { id: taskId || makeId(), label: input.label.trim(), quantity, allowMultiple: !!input.allowMultiple };
    if (i >= 0) data.tasks[id][i] = task; else data.tasks[id].push(task); demo.write(data); return;
  }
  const fs = firebase;
  const ref = fs.doc(fs.db, 'events', id, 'tasks', taskId || makeId());
  await fs.setDoc(ref, { label: input.label.trim(), quantity, allowMultiple: !!input.allowMultiple }, { merge: !!taskId });
}

export async function deleteTask(id, taskId) {
  await authReady;
  if (demoMode) {
    const data = demo.read(); const event = data.events.find(e => e.id === id);
    if (!event) throw new Error('האירוע לא נמצא');
    if (event.ownerUid !== uid) throw new Error('רק המארחת יכולה למחוק פריטים');
    data.tasks[id] = (data.tasks[id] || []).filter(t => t.id !== taskId);
    delete data.claims[id]?.[taskId]; demo.write(data); return;
  }
  const fs = firebase;
  const claims = await fs.getDocs(fs.collection(fs.db, 'events', id, 'tasks', taskId, 'claims'));
  const batch = fs.writeBatch(fs.db);
  claims.docs.forEach(d => batch.delete(d.ref));
  batch.delete(fs.doc(fs.db, 'events', id, 'tasks', taskId));
  await batch.commit();
}

export async function toggleClaim(id, taskId, firstName) {
  await authReady;
  if (demoMode) {
    const data = demo.read(); data.claims[id] ||= {}; data.claims[id][taskId] ||= {};
    if (data.claims[id][taskId][uid]) {
      delete data.claims[id][taskId][uid]; demo.write(data); return;
    }
    const task = (data.tasks[id] || []).find(t => t.id === taskId);
    if (!task) throw new Error('הפריט לא נמצא');
    if (!firstName || firstName.trim().length > 30) throw new Error('נא לכתוב שם תקין');
    const claimCount = Object.keys(data.claims[id][taskId]).length;
    if (claimCount >= (task.quantity || 1)) throw new Error('הכמות מלאה');
    if (!task.allowMultiple && claimCount > 0) throw new Error('כבר יש הירשמות לפריט הזה');
    data.claims[id][taskId][uid] = { firstName: firstName.trim(), createdAt: nowIso() }; demo.write(data); return;
  }
  const fs = firebase;
  const taskRef = fs.doc(fs.db, 'events', id, 'tasks', taskId);
  const claimRef = fs.doc(fs.db, 'events', id, 'tasks', taskId, 'claims', uid);
  await fs.runTransaction(fs.db, async transaction => {
    const [taskSnap, claimSnap] = await Promise.all([transaction.get(taskRef), transaction.get(claimRef)]);
    if (!taskSnap.exists()) throw new Error('הפריט לא נמצא');
    if (claimSnap.exists()) { transaction.delete(claimRef); return; }
    if (!firstName || firstName.trim().length > 30) throw new Error('נא לכתוב שם תקין');
    const claimsSnap = await transaction.get(fs.collection(fs.db, 'events', id, 'tasks', taskId, 'claims'));
    if (!taskSnap.data().allowMultiple && claimsSnap.size > 0) throw new Error('כבר יש הירשמות לפריט הזה');
    if (claimsSnap.size >= (taskSnap.data().quantity || 1)) throw new Error('הכמות מלאה');
    transaction.set(claimRef, { firstName: firstName.trim(), createdAt: nowIso() });
  });
}

export async function syncTasks(id, rows) {
  await authReady;
  const clean = rows.filter(r => r.label && r.label.trim()).map(r => ({
    id: r.id || makeId(), label: r.label.trim(), quantity: Number(r.quantity), allowMultiple: !!r.allowMultiple
  })).filter(t => t.quantity >= 1 && t.quantity <= 99);
  if (clean.length !== rows.filter(r => r.label && r.label.trim()).length) throw new Error('כמות פריט חייבת להיות בין 1 ל-99');

  if (demoMode) {
    const data = demo.read();
    const event = data.events.find(e => e.id === id);
    if (!event) throw new Error('האירוע לא נמצא');
    if (event.ownerUid !== uid) throw new Error('רק המארחת יכולה לערוך פריטים');
    const oldIds = new Set((data.tasks[id] || []).map(t => t.id));
    data.tasks[id] = clean;
    data.claims[id] ||= {};
    for (const oldId of oldIds) if (!clean.some(t => t.id === oldId)) delete data.claims[id][oldId];
    demo.write(data);
    return;
  }

  const fs = firebase;
  const existing = await fs.getDocs(fs.collection(fs.db, 'events', id, 'tasks'));
  const keptIds = new Set(clean.filter(t => t.id && existing.docs.some(d => d.id === t.id)).map(t => t.id));
  const batch = fs.writeBatch(fs.db);
  for (const d of existing.docs) {
    if (!keptIds.has(d.id)) {
      const claims = await fs.getDocs(fs.collection(fs.db, 'events', id, 'tasks', d.id, 'claims'));
      claims.docs.forEach(claim => batch.delete(claim.ref));
      batch.delete(d.ref);
    }
  }
  for (const task of clean) {
    const taskId = keptIds.has(task.id) ? task.id : makeId();
    batch.set(fs.doc(fs.db, 'events', id, 'tasks', taskId), { label: task.label, quantity: task.quantity, allowMultiple: task.allowMultiple }, { merge: true });
  }
  await batch.commit();
}
