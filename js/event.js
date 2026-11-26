import * as db from './db.js';
import { compressImage } from './image-utils.js';

const banner=document.querySelector('#demo-banner');banner.hidden=!db.demoMode;
const id=new URL(location.href).searchParams.get('id');
const box=document.querySelector('#event-content');
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
let event,isHost=false,attending=false,tasks=[];

async function load(){if(!id){box.textContent='חסר מזהה אירוע';return}event=await db.getEvent(id);if(!event){box.textContent='האירוע לא נמצא';return}isHost=event.ownerUid===db.uid;attending=await db.isAttending(id);await render()}

async function render(){
  box.replaceChildren();document.querySelector('#page-title').textContent=event.title;
  const card=el('article','event-card');card.append(el('h2','',event.title));card.append(el('p','event-meta',`${event.date}${event.time?' • '+event.time:''}${event.location?' • '+event.location:''}`));
  if(event.hostName)card.append(el('p','','מארחת: '+event.hostName));if(event.description)card.append(el('p','',event.description));
  if(event.imageDataUrl){const img=el('img','event-image');img.src=event.imageDataUrl;img.alt='תמונת הזמנה';card.append(img)}
  if(event.personalLines?.length){const p=el('div','personal-lines');p.append(el('strong','','פרטים אישיים'));const ul=el('ul');event.personalLines.forEach(x=>ul.append(el('li','',x)));p.append(ul);card.append(p)}
  const actions=el('div','action-row');const count=await db.getAttendeeCount(id);
  const attend=el('button','primary',attending?'ביטול הגעה':'אני מגיעה');attend.onclick=async()=>{try{await db.toggleAttendance(id);attending=await db.isAttending(id);await render()}catch(e){alert(e.message)}};actions.append(attend);
  actions.append(el('span','claim-name',`מגיעות: ${count}`));
  const share=el('button','secondary','שיתוף');share.onclick=shareLink;actions.append(share);
  const whatsapp=el('button','secondary','WhatsApp');whatsapp.onclick=shareWhatsApp;actions.append(whatsapp);
  const calendar=el('button','secondary','הוספה ליומן');calendar.onclick=downloadICS;actions.append(calendar);
  if(isHost){const edit=el('button','secondary','עריכה');edit.onclick=openEdit;actions.append(edit);const del=el('button','secondary danger','מחיקה');del.onclick=async()=>{if(confirm('למחוק את האירוע והנתונים שלו?')){await db.deleteEvent(id);location.href='index.html'}};actions.append(del)}
  card.append(actions);box.append(card);
  if(event.tasksEnabled){const sec=el('section','task-list');sec.append(el('h2','','דברים שאנחנו צריכים לארגן'));tasks=await db.getTasks(id);
    if(!tasks.length)sec.append(el('p','event-meta','אין פריטים עדיין'));
    if(tasks.length){const table=el('div','task-table-view');const head=el('div','task-view-row task-view-head');['פריט','כמות','שמות','נותרו','פעולה'].forEach(x=>head.append(el('strong','',x)));table.append(head);tasks.forEach(task=>table.append(renderTaskRow(task)));sec.append(table)}box.append(sec)
  }
}

function renderTaskRow(task){
  const row=el('div','task-view-row');row.append(el('strong','task-name',task.label));row.append(el('span','',String(task.quantity||1)));
  const names=task.claims.map(c=>c.firstName).join(', ')||'—';row.append(el('span','',names));
  const remaining=Math.max(0,(task.quantity||1)-task.claims.length);row.append(el('span','',String(remaining)));
  const mine=task.claims.find(c=>c.uid===db.uid);
  if(mine){const cancel=el('button','secondary','בטל הרשמה');cancel.onclick=()=>claim(task,true);row.append(cancel)}
  else if(remaining>0){const sign=el('button','primary','אני מביאה');sign.onclick=()=>claim(task,false);row.append(sign)}
  else{row.append(el('span','', 'מלא'))}return row;
}

async function claim(task,cancel){
  try{let firstName='';if(!cancel){firstName=(localStorage.getItem('classCalendarFirstName')||'').trim();if(!firstName){firstName=prompt('מה שמך הפרטי?','')?.trim()||''}if(!firstName||firstName.length>30){alert('נא לכתוב שם פרטי');return}localStorage.setItem('classCalendarFirstName',firstName)}await db.toggleClaim(id,task.id,cancel?'':firstName);await render()}catch(e){alert(e.message)}
}

async function shareLink(){const url=location.href;try{await navigator.clipboard.writeText(url);alert('קישור האירוע הועתק')}catch(e){prompt('העתיקי את הקישור:',url)}}
function shareWhatsApp(){const text=`${event.title} — ${event.date}${event.time?' • '+event.time:''}\n${location.href}`;location.href=`https://wa.me/?text=${encodeURIComponent(text)}`}
function downloadICS(){const dt=event.date.replace(/-/g,'');const time=(event.time||'').replace(':','');const start=time?`${dt}T${time}00`:dt;const end=start.includes('T')?start:dt;const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Class Calendar//HE','BEGIN:VEVENT',`UID:${id}@class-calendar`,`DTSTART:${start}`,`DTEND:${end}`,`SUMMARY:${escapeICS(event.title)}`,`LOCATION:${escapeICS(event.location||'')}`,`DESCRIPTION:${escapeICS(event.description||'')}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`event-${dt}.ics`;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function escapeICS(s){return String(s).replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n')}

const editDialog=document.querySelector('#event-edit-dialog'),editForm=document.querySelector('#event-edit-form');
const editLines=document.querySelector('#edit-personal-lines'),editAddLine=document.querySelector('#edit-add-line');
const editTaskEditor=document.querySelector('#edit-task-editor'),editTaskRows=document.querySelector('#edit-task-rows');
function setEditLines(lines=[]){editLines.replaceChildren();for(const value of [...lines,''].slice(0,5)){if(editLines.children.length>=5)break;const row=el('div','personal-input-row');const input=document.createElement('input');input.maxLength=120;input.value=value||'';input.placeholder='שורה אישית';const remove=el('button','secondary danger','הסרה');remove.type='button';remove.onclick=()=>row.remove();row.append(input,remove);editLines.append(row)}editAddLine.hidden=editLines.children.length>=5}
editAddLine.onclick=()=>{if(editLines.children.length<5)setEditLines([...editLines.querySelectorAll('input')].map(i=>i.value))};
function addEditTask(task={}){const row=el('div','task-editor-row');row.dataset.taskId=task.id||'';const name=document.createElement('input');name.placeholder='שם הפריט';name.maxLength=80;name.value=task.label||'';const quantity=document.createElement('input');quantity.type='number';quantity.min='1';quantity.max='99';quantity.value=task.quantity||1;const allow=document.createElement('input');allow.type='checkbox';allow.checked=!!task.allowMultiple;const allowLabel=el('label','task-check','מספר בנות');allowLabel.prepend(allow);const remove=el('button','secondary danger','מחיקה');remove.type='button';remove.onclick=()=>row.remove();row.append(name,quantity,allowLabel,remove);editTaskRows.append(row)}
function readEditTasks(){return [...editTaskRows.children].map(row=>{const controls=row.querySelectorAll('input');return{id:row.dataset.taskId||'',label:controls[0].value.trim(),quantity:Number(controls[1].value),allowMultiple:controls[2].checked}})}

function setEditTasksVisible(visible){
  editTaskEditor.hidden=!visible;
  editTaskEditor.classList.toggle('is-visible',visible);
  if(visible&&editTaskRows.children.length===0)addEditTask();
}
function openEdit(){editForm.elements.title.value=event.title;editForm.elements.date.value=event.date;editForm.elements.time.value=event.time||'';editForm.elements.location.value=event.location||'';editForm.elements.hostName.value=event.hostName||'';editForm.elements.description.value=event.description||'';editForm.elements.tasksEnabled.checked=!!event.tasksEnabled;setEditLines(event.personalLines||[]);editTaskRows.replaceChildren();if(event.tasksEnabled)tasks.forEach(addEditTask);setEditTasksVisible(editForm.elements.tasksEnabled.checked);editDialog.showModal()}
editForm.querySelector('#edit-tasks-enabled').addEventListener('change',()=>setEditTasksVisible(editForm.elements.tasksEnabled.checked));document.querySelector('#edit-add-task').onclick=()=>{if(editTaskRows.children.length<20)addEditTask()};document.querySelector('#close-edit').onclick=()=>editDialog.close();
editForm.onsubmit=async e=>{e.preventDefault();const changes={title:editForm.elements.title.value.trim(),date:editForm.elements.date.value,time:editForm.elements.time.value,location:editForm.elements.location.value.trim(),hostName:editForm.elements.hostName.value.trim(),description:editForm.elements.description.value.trim(),tasksEnabled:editForm.elements.tasksEnabled.checked,personalLines:[...editLines.querySelectorAll('input')].map(i=>i.value.trim()).filter(Boolean).slice(0,5)};if(!changes.title||changes.title.length>80||!changes.hostName||changes.hostName.length>60){document.querySelector('#edit-error').textContent='כותרת ושם מארחת חובה';return}if(changes.personalLines.some(x=>x.length>120)){document.querySelector('#edit-error').textContent='שורה אישית ארוכה מדי';return}const rows=readEditTasks();for(const row of rows){if(row.label&&!row.label.length||row.label&&row.label.length>80||row.quantity&&!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>99){document.querySelector('#edit-error').textContent='נא למלא פריט תקין ולכמות בין 1 ל-99';return}}try{const file=editForm.elements.image.files[0];if(file)changes.imageDataUrl=await compressImage(file);await db.updateEvent(id,changes);if(changes.tasksEnabled)await db.syncTasks(id,rows);else await db.syncTasks(id,[]);Object.assign(event,changes);editDialog.close();await load()}catch(x){document.querySelector('#edit-error').textContent=x.message}};

load();
