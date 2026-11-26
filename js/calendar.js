import * as db from './db.js';
import { compressImage } from './image-utils.js';

const banner = document.querySelector('#demo-banner'); banner.hidden = !db.demoMode;
const calendar = document.querySelector('#calendar');
let events = []; let view = 'month'; let cursor = new Date();

const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const hebrewDate = d => new Intl.DateTimeFormat('he-u-ca-hebrew',{day:'numeric',month:'long'}).format(d);

function el(tag, cls, text){ const n=document.createElement(tag); if(cls)n.className=cls; if(text!=null)n.textContent=text; return n; }

async function load(){ events=await db.getEvents(); render(); }

function eventAt(s){ return events.filter(e=>e.date===s); }
function nav(title, prev, next, today){
  const nav=el('div','calendar-nav'); const p=el('button','', '‹'); p.onclick=prev;
  nav.append(p, el('h2','',title)); const n=el('button','', '›'); n.onclick=next; nav.append(n);
  const t=el('button','','היום'); t.onclick=today; nav.append(t); return nav;
}

function monthView(){
  const y=cursor.getFullYear(),m=cursor.getMonth(), first=new Date(y,m,1), start=new Date(y,m,1-first.getDay());
  const title=new Intl.DateTimeFormat('he',{month:'long',year:'numeric'}).format(first);
  calendar.replaceChildren(nav(title,()=>{cursor=new Date(y,m-1,1);render()},()=>{cursor=new Date(y,m+1,1);render()},()=>{cursor=new Date();render()}));
  const grid=el('div','calendar-grid');
  ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].forEach(x=>grid.append(el('div','',x)));
  grid.className='calendar-grid weekdays'; calendar.append(grid);
  const days=el('div','calendar-grid'); days.className='calendar-grid';
  for(let i=0;i<42;i++){ const d=new Date(start); d.setDate(start.getDate()+i); const cell=el('div','day-cell');
    if(d.getMonth()!=m)cell.classList.add('outside');
    if(ymd(d)==ymd(new Date()))cell.classList.add('today');
    cell.append(el('strong','',String(d.getDate()))); cell.append(el('span','hebrew-date',hebrewDate(d)));
    eventAt(ymd(d)).forEach(e=>{const b=el('button','event-chip',e.title);b.onclick=()=>location.href=`event.html?id=${encodeURIComponent(e.id)}`;cell.append(b)}); days.append(cell);
  } calendar.append(days);
}
function dayView(){
  const title=new Intl.DateTimeFormat('he',{weekday:'long',day:'numeric',month:'long'}).format(cursor);
  calendar.replaceChildren(nav(title,()=>{cursor.setDate(cursor.getDate()-1);render()},()=>{cursor.setDate(cursor.getDate()+1);render()},()=>{cursor=new Date();render()}));
  const box=el('div','day-view'); box.append(el('h3','',hebrewDate(cursor))); const list=eventAt(ymd(cursor));
  if(!list.length)box.append(el('p','','אין אירועים לתאריך הזה'));
  list.forEach(e=>box.append(eventRow(e))); calendar.append(box);
}
function weekView(){
  const start=new Date(cursor); start.setDate(cursor.getDate()-cursor.getDay());
  const end=new Date(start);end.setDate(start.getDate()+6);
  const title=`${pad(start.getDate())}.${pad(start.getMonth()+1)} – ${pad(end.getDate())}.${pad(end.getMonth()+1)}`;
  calendar.replaceChildren(nav(title,()=>{cursor.setDate(cursor.getDate()-7);render()},()=>{cursor.setDate(cursor.getDate()+7);render()},()=>{cursor=new Date();render()}));
  const box=el('div','week-view');
  for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i); box.append(el('h3','',new Intl.DateTimeFormat('he',{weekday:'long',day:'numeric',month:'long'}).format(d))); const list=eventAt(ymd(d));
    if(!list.length)box.append(el('p','event-meta','אין אירועים'));
    list.forEach(e=>box.append(eventRow(e))); }
  calendar.append(box);
}
function eventRow(e){
  const a=el('a','event-row');a.href=`event.html?id=${encodeURIComponent(e.id)}`;
  a.append(el('strong','',e.title));a.append(el('span','event-meta',` • ${e.date}${e.time?' • '+e.time:''}${e.location?' • '+e.location:''}`));return a;
}
function listView(){
  calendar.replaceChildren(el('h2','','אירועים עתידיים והיום'));
  const today=ymd(new Date()); const sorted=[...events].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  const future=sorted.filter(e=>e.date>=today), past=sorted.filter(e=>e.date<today);
  const box=el('div','events-list'); if(!future.length)box.append(el('p','','אין אירועים קרובים')); future.forEach(e=>box.append(eventRow(e))); calendar.append(box);
  if(past.length){const btn=el('button','past-toggle','אירועים שעברו ('+past.length+')');btn.onclick=()=>{list.hidden=!list.hidden;btn.textContent=(list.hidden?'הצגת ':'הסתרת ')+'אירועים שעברו ('+past.length+')'};calendar.append(btn);const list=el('div','events-list');list.hidden=true;past.forEach(e=>list.append(eventRow(e)));calendar.append(list)}
}
function render(){ if(view==='month')monthView(); if(view==='day')dayView(); if(view==='week')weekView(); if(view==='list')listView(); }

document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));render()});

const dialog=document.querySelector('#event-dialog'), form=document.querySelector('#event-form'), addLine=document.querySelector('#add-line');
function setPersonalLines(lines=[]){const box=document.querySelector('#personal-lines');box.replaceChildren(); [...lines, ''].slice(0,5).forEach(v=>{if(box.children.length>=5)return;const row=el('div','personal-input-row');const input=document.createElement('input');input.maxLength=120;input.value=v||'';input.placeholder='שורה אישית';row.append(input);box.append(row)});addLine.hidden=box.children.length>=5}
setPersonalLines(); addLine.onclick=()=>{if(document.querySelector('#personal-lines').children.length<5)setPersonalLines([...document.querySelectorAll('#personal-lines input')].map(i=>i.value))};

const createTaskEditor=document.querySelector('#create-task-editor');
const createTaskRows=document.querySelector('#create-task-rows');
function addCreateTaskRow(task={}){
  const row=el('div','task-editor-row');
  const name=document.createElement('input');name.placeholder='שם הפריט';name.maxLength=80;name.value=task.label||'';
  const quantity=document.createElement('input');quantity.type='number';quantity.min='1';quantity.max='99';quantity.value=task.quantity||1;
  const allow=document.createElement('input');allow.type='checkbox';allow.checked=!!task.allowMultiple;
  const allowLabel=el('label','task-check','מספר בנות');allowLabel.prepend(allow);
  const remove=el('button','secondary danger','מחיקה');remove.type='button';remove.onclick=()=>row.remove();
  row.append(name,quantity,allowLabel,remove);createTaskRows.append(row);
}
function readCreateTaskRows(){return [...createTaskRows.children].map(row=>{const controls=row.querySelectorAll('input');return{label:controls[0].value.trim(),quantity:Number(controls[1].value),allowMultiple:controls[2].checked}})}
const tasksEnabled=document.querySelector('#create-tasks-enabled');
function setCreateTasksVisible(visible){
  createTaskEditor.hidden=!visible;
  createTaskEditor.classList.toggle('is-visible',visible);
  if(visible&&createTaskRows.children.length===0)addCreateTaskRow();
}
tasksEnabled.addEventListener('change',()=>setCreateTasksVisible(tasksEnabled.checked));
document.querySelector('#add-create-task').onclick=()=>{if(createTaskRows.children.length<20)addCreateTaskRow()};

document.querySelector('#add-event-btn').onclick=()=>{form.reset();setPersonalLines();createTaskRows.replaceChildren();setCreateTasksVisible(false);form.elements.date.value=ymd(new Date());dialog.showModal()};
document.querySelector('#close-dialog').onclick=()=>dialog.close();
form.onsubmit=async e=>{e.preventDefault();const error=document.querySelector('#event-error');error.textContent='';const fd=new FormData(form);const title=fd.get('title').trim(),host=fd.get('hostName').trim();
 if(!title||title.length>80||!host||host.length>60){error.textContent='נא למלא כותרת ושם מארחת תקינים';return}const personalLines=[...document.querySelectorAll('#personal-lines input')].map(i=>i.value.trim()).filter(Boolean).slice(0,5); if(personalLines.some(x=>x.length>120)){error.textContent='שורה אישית ארוכה מדי';return}
 let imageDataUrl='';try{const f=form.elements.image.files[0];if(f)imageDataUrl=await compressImage(f)}catch(x){error.textContent=x.message;return}
 const tasks=readCreateTaskRows();
 for(const task of tasks){if(!task.label||task.label.length>80||!Number.isInteger(task.quantity)||task.quantity<1||task.quantity>99){error.textContent='נא למלא שם פריט ולכמות בין 1 ל-99';return}}
 try{const result=await db.createEvent({title,date:fd.get('date'),time:fd.get('time'),location:fd.get('location').trim(),hostName:host,description:fd.get('description').trim(),imageDataUrl,personalLines,tasksEnabled:fd.get('tasksEnabled')==='on',tasks:tasksEnabled.checked?tasks:[]});dialog.close();alert(`אירוע נוצר!`);location.href=`event.html?id=${encodeURIComponent(result.event.id)}`}catch(x){error.textContent=x.message||'שמירת האירוע נכשלה'};
};
load();
