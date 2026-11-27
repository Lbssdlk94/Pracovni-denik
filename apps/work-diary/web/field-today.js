// Mobile "Dnes" projection. Reads the existing dashboard payload and never invents a job, hour or status.
import {jobProgressAction} from './job-travel.js?v=person-hours-v1';

export function pickFieldFocus(dashboard){
  const jobs=dashboard?.todayJobs||[];
  const active=dashboard?.myState?.active;
  if(active&&['work','travel','break'].includes(active.kind)&&active.jobId&&active.jobId!=='unavailable'){
    return {mode:'current', job:dashboard.currentJob||jobs.find(job=>job.id===active.jobId)||null, kind:active.kind, since:active.startAt||null, choices:[]};
  }
  const open=jobs.filter(job=>!['done','incomplete'].includes(job.status));
  if(open.length===1) return {mode:'single', job:open[0], kind:'', since:null, choices:[]};
  if(open.length>1) return {mode:'choose', job:null, kind:'', since:null, choices:open};
  return {mode:'empty', job:null, kind:'', since:null, choices:[]};
}

export function fieldPrimaryAction(job,{canWrite=false,travelEnabled=true,myTime=null}={}){
  if(!job) return null;
  const action=jobProgressAction({...job, myTime:myTime||job.myTime||null},{canWrite:!!canWrite, travelEnabled:travelEnabled!==false});
  if(!action) return {kind:'open', label:'Otevřít'};
  if(action.kind==='time'&&action.action==='stop') return {kind:'advance', label:'Ukončit práci', from:job.status};
  if(action.kind==='time') return {kind:'advance', label:action.label||'Zahájit práci', from:job.status};
  if(action.kind==='departure') return {kind:'depart', label:'Vyjet'};
  if(action.kind==='status'&&action.status==='in_progress') return {kind:'advance', label:'Zahájit práci', from:job.status};
  if(action.kind==='status'&&action.status==='done') return {kind:'assistant', label:'Zapsat práci'};
  return {kind:'open', label:action.label||'Otevřít'};
}

export function fieldElapsed(since, asOf){
  if(!Number.isFinite(since)||!Number.isFinite(asOf)||asOf<since) return '';
  const minutes=Math.floor((asOf-since)/60000);
  const hours=Math.floor(minutes/60), rest=minutes%60;
  return hours?hours+' h '+String(rest).padStart(2,'0')+' min':minutes+' min';
}

const KIND={work:'Pracuji', travel:'Na cestě', break:'Přerušeno'};

function clock(value){
  if(!Number.isFinite(value)) return '';
  try{return new Intl.DateTimeFormat('cs-CZ',{hour:'2-digit', minute:'2-digit', timeZone:'Europe/Prague'}).format(value);}catch{return '';}
}
function dayLabel(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')) return '';
  try{const label=new Intl.DateTimeFormat('cs-CZ',{weekday:'long', day:'numeric', month:'long', timeZone:'UTC'}).format(new Date(day+'T12:00:00Z')); return label.charAt(0).toLocaleUpperCase('cs')+label.slice(1);}catch{return day;}
}
function phoneOf(job){
  const number=job?.customerContact?.phones?.find(item=>/[0-9]/.test(item.number||''))?.number||'';
  const compact=String(number).replace(/[^\d+]/g,'');
  return /^\+?\d{6,15}$/.test(compact)?compact:'';
}
function primaryButton(job, options, esc){
  const action=fieldPrimaryAction(job, options);
  if(!action) return '';
  if(action.kind==='depart') return `<button type="button" class="btn primary" data-field-depart="${esc(job.id)}">${esc(action.label)}</button>`;
  if(action.kind==='advance') return `<button type="button" class="btn primary" data-field-advance="${esc(job.id)}" data-field-from="${esc(action.from||'')}">${esc(action.label)}</button>`;
  if(action.kind==='assistant') return `<button type="button" class="btn primary" data-field-assistant="${esc(job.id)}">${esc(action.label)}</button>`;
  return '';
}

export function jobsOnDay(jobs, day){
  return (jobs||[]).filter(job=>job?.dueDate===day||(job?.schedule?.dates||[]).includes(day)||(job?.terms||[]).some(term=>term?.date===day));
}

export function fieldTodayMarkup({dashboard, error, mode, canManage, canWrite, travelEnabled, esc, online}){
  const ready=dashboard?1:0;
  if(!online) return `<section id="field-today" data-ready="0" aria-label="Dnes"><p class="field-today-note">Jste offline. Dnešní plán se znovu načte po připojení. Rozepsané zápisy zůstávají v telefonu.</p></section>`;
  if(!dashboard) return `<section id="field-today" data-ready="0" aria-label="Dnes"><p class="field-today-note">${esc(error||'Načítám dnešní práci…')}</p></section>`;
  const focus=pickFieldFocus(dashboard);
  const options={canWrite, travelEnabled, myTime:dashboard.myState||null};
  const current=focus.job;
  const shown=new Set(focus.choices.map(job=>job.id));
  if(current?.id) shown.add(current.id);
  const others=(dashboard.todayJobs||[]).filter(job=>!shown.has(job.id));
  const shift=dashboard.attendance?.activeShift;
  const elapsed=fieldElapsed(focus.since, dashboard.asOf);
  const phone=phoneOf(current);
  const address=current?.address||'';
  const colleagues=Array.isArray(dashboard.people)&&dashboard.people.length?dashboard.people.filter(person=>person.job?.id===current?.id).map(person=>person.name):String(current?.assignedName||'').split(',').map(name=>name.trim()).filter(Boolean);
  const primary=current?fieldPrimaryAction(current, options):null;
  const card=current?`<article class="field-today-card"><p class="field-kicker">${esc(focus.mode==='current'?(KIND[focus.kind]||'Rozpracováno'):'Dnešní zakázka')}</p><h2>${esc(current.customerName||current.title||'Zakázka')}</h2>${current.title&&current.title!==current.customerName?`<p>${esc(current.title)}</p>`:''}${address?`<p>${esc(address)}</p>`:''}${focus.mode==='current'&&elapsed?`<p class="field-elapsed"><strong>${esc(elapsed)}</strong> ${esc(focus.kind==='travel'?'vaší cesty':'vaší práce')}</p>`:current.plannedStart?`<p>Plán ${esc(current.plannedStart)}</p>`:''}${colleagues.length?`<p>Kolegové: ${esc(colleagues.join(', '))}</p>`:''}<div class="field-today-actions">${address?`<a class="btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}" target="_blank" rel="noopener noreferrer">Navigovat</a>`:''}${phone?`<a class="btn" href="tel:${esc(phone)}">Zavolat</a>`:''}<button type="button" class="btn" data-field-photo="${esc(current.id)}">Vyfotit</button><button type="button" class="btn" data-overview-job="${esc(current.id)}">Otevřít</button>${primaryButton(current, options, esc)}${canWrite&&primary?.kind!=='assistant'?`<button type="button" class="btn" data-field-assistant="${esc(current.id)}">Zapsat</button>`:''}</div><p class="mini-empty">Ukončení práce zavře jen váš interval. Docházku a celou zakázku to samo nedokončí.</p></article>`:'';
  const choices=focus.mode==='choose'?`<section class="field-today-choices" aria-label="Vyberte zakázku"><h2>Vyberte zakázku</h2><p>Dnes jich máte víc. Žádnou nezvolím sám.</p>${focus.choices.map(job=>`<button type="button" class="btn" data-overview-job="${esc(job.id)}">${esc(job.customerName||job.title)}${job.plannedStart?' · '+esc(job.plannedStart):''}</button>`).join('')}</section>`:'';
  const list=others.length?`<section class="field-today-rest" aria-label="Další dnešní zakázky"><h2>Další dnes</h2>${others.map(job=>`<button type="button" class="field-today-row" data-overview-job="${esc(job.id)}"><strong>${esc(job.customerName||job.title)}</strong><span>${esc([job.plannedStart, job.address].filter(Boolean).join(' · '))}</span></button>`).join('')}</section>`:'';
  return `<section id="field-today" data-ready="${ready}" aria-label="Dnes"><div class="field-today-head"><h1>${esc(dayLabel(dashboard.day)||'Dnes')}</h1>${canManage?`<div class="field-today-mode" role="group" aria-label="Rozsah přehledu"><button type="button" data-field-mode="personal" aria-pressed="${mode==='company'?'false':'true'}">Moje práce</button><button type="button" data-field-mode="company" aria-pressed="${mode==='company'?'true':'false'}">Celý tým</button></div>`:''}</div><p class="field-attendance-line">${dashboard.attendance==null?'Stav docházky otevřete v její obrazovce.':shift?`Docházka běží${clock(shift.startAt)?' od '+esc(clock(shift.startAt)):''}.`:'Docházka není zahájená.'} <button type="button" class="btn" data-page="attendance">${dashboard.attendance==null?'Otevřít docházku':shift?'Otevřít docházku':'Zaznamenat příchod'}</button></p>${card}${choices}${list}<button type="button" class="btn" data-overview-today>Všechny zakázky</button></section>`;
}

