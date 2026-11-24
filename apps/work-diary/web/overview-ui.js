import {interfaceIcon as icon} from './interface-icons.js?v=approved-b-v2';
import {navigationIcon} from './navigation-icons.js?v=workspace-controls-v1';
import {pragueToday,jobDayLabel,jobTimeLabel,scheduledJobTitle} from './job-schedule.js?v=workspace-roles-v1';
import {shortJobAddress} from './job-mobile-model.js?v=workspace-roles-v1';
import {compareWorkJobs} from './job-workflow-model.js?v=workspace-roles-v1';
import {fieldTodayMarkup, jobsOnDay} from './field-today.js?v=field-mobile-v2';

export function overviewVisits(jobs){return jobs.filter(j=>!['done','incomplete'].includes(j.status)).slice().sort(compareWorkJobs);}
export function createOverviewUI({db,esc,getSession,enabled,getGardenCount,onToday,onProtocols,onJob,onAdvance,onDepart,onAssistant,onPhoto,toast}){
 let rows=null,nearest=null,partial=false,error='',loading=false,epoch=0,actor='',flight=null,field=null,fieldError='',fieldMode='personal';
 const key=()=>getSession()?.user.id+'|'+getSession()?.user.role;
 const online=()=>navigator.onLine;
 const mobileField=()=>typeof matchMedia==='function'&&matchMedia('(max-width:760px)').matches;
 let wasMobile=mobileField();
 window.addEventListener('resize',()=>{const next=mobileField();if(next===wasMobile)return;wasMobile=next;if(document.querySelector('#overview'))paint();});
 function clear(){epoch++;rows=null;nearest=null;partial=false;error='';loading=false;actor='';flight=null;field=null;fieldError='';}
 function tile(title,sub,art,attrs,first=false){return `<button type="button" class="overview-link ${first?'overview-link-first':''}" ${attrs}><span class="overview-tile-icon">${art}</span><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>${icon('chevron')}</button>`;}
 function markup(){
  if(actor&&actor!==key())clear();
  const active=overviewVisits(rows||[]),done=(rows||[]).filter(j=>j.status==='done').length,today=pragueToday(),next=active[0]||nearest;
  const listed=rows?jobsOnDay(rows,today):null;
  const dashboard=field?{...field,todayJobs:listed!=null?listed:field.todayJobs}:listed?{todayJobs:listed,day:today,asOf:Date.now(),attendance:null,myState:null,people:[]}:null;
  const count=rows?`${active.length}${partial?'+':''} ${active.length>=1&&active.length<=4?'aktivní':'aktivních'} · ${done}${partial?'+':''} ${done===1?'dokončená':done>=2&&done<=4?'dokončené':'dokončených'}`:'Dnešní plán podle času';
  return `<section id="overview" aria-label="Pracovní přehled"><p class="overview-inquiry-hint" data-overview-inquiries hidden></p>${enabled('jobs')&&mobileField()?fieldTodayMarkup({dashboard,error:fieldError,mode:fieldMode,canManage:!!getSession()?.permissions?.manage,canWrite:!!getSession()?.permissions?.write,travelEnabled:getSession()?.features?.jobTravel!==false,esc,online:online()}):''}${enabled('attendance')&&!getSession()?.attendance?.active?`<div class="overview-attendance"><span>Začínáte pracovní den?</span><button type="button" class="btn soft" data-page="attendance">Zaznamenat příchod</button></div>`:''}<div class="overview-links">${enabled('jobs')?tile('Dnešní návštěvy',online()||rows?count:'Plán návštěv vyžaduje připojení',icon('calendar'),'data-overview-today',true)+tile('Zakázky','Přehled a plánování práce',navigationIcon('jobs'),'data-page="jobs"'):''}${enabled('attendance')?tile('Docházka','Příchod, odchod a dnešní doba',navigationIcon('attendance'),'data-page="attendance"'):''}${enabled('customers')?tile('Zákazníci','Kontakty a jejich zahrady',navigationIcon('customers'),'data-page="customers"'):''}${enabled('jobs')?tile('Servisní protokoly','Protokoly a servisní historie',icon('record'),'data-overview-protocols'):''}</div>${enabled('jobs')?`<div class="overview-next-heading"><h2>${active.length?'Další návštěva':'Nejbližší návštěva'}</h2><button type="button" class="text-link" data-overview-today>Zobrazit vše</button></div><div id="overview-visits" aria-live="polite">${!online()&&!rows?'<p class="mini-empty">Jste offline. Zahrady a uložené pracovní zápisy zůstávají dostupné; aktuální plán návštěv načtete po připojení.</p>':error?'<p class="mini-empty" role="alert">'+esc(error)+'</p><button type="button" class="btn small" data-overview-retry>Zkusit znovu</button>':loading&&!rows?'<p class="mini-empty" role="status">Načítám dnešní návštěvy…</p>':next?`<button type="button" class="overview-visit" data-overview-job="${esc(next.id)}"><span class="overview-visit-time">${esc(next.plannedStart||next.startTime||'—')}</span><span class="overview-visit-line"></span><span class="overview-visit-content"><strong>${esc(next.customerName||next.customerContact?.name||next.title)}</strong><span>${esc([next.gardenName,shortJobAddress(next.address||'')].filter(Boolean).join(' · '))}</span><small>${esc(scheduledJobTitle(next))}${next.dueDate!==today?' · '+esc(jobDayLabel(next.dueDate)):''}</small></span>${icon('chevron')}</button>${!active.length&&rows?'<p class="mini-empty">Na dnešek nemáte další aktivní návštěvu.</p>':''}`:rows?'<p class="mini-empty">Na dnešek ani další dny zatím není naplánovaná aktivní návštěva.</p>':''}</div>`:''}<div class="overview-more-links">${enabled('gardens')?tile(getSession()?.license?.labels?.sites||'Zahrady',`${getGardenCount()} uložených míst`,navigationIcon('home'),'data-page="home"'):''}${enabled('vehicles')?tile('Vozidla','Vybrané auto a tankování',navigationIcon('vehicles'),'data-page="vehicles"'):''}</div><p class="overview-date">${esc(jobDayLabel(today))}</p></section>`;
 }
 function paint(){const root=document.querySelector('#overview');if(!root)return;const holder=document.createElement('div');holder.innerHTML=markup();root.replaceWith(holder.firstElementChild);bind(false);}
 async function refresh(){
  if(flight)return flight;if(!enabled('jobs')){rows=null;nearest=null;paint();return;}
  actor=key();const who=actor,ticket=epoch,day=pragueToday();loading=true;error='';paint();
  const task=(async()=>{try{
   const params=new URLSearchParams({state:'all',order:'schedule',month:day.slice(0,7),day});const all=[];let cursor=null;
   do{if(cursor)params.set('cursor',cursor);const result=await db.request('/api/jobs?'+params,{jobCacheRefresh:true});if(ticket!==epoch||who!==key())return;all.push(...result.jobs.filter(j=>!all.some(a=>a.id===j.id)));cursor=result.nextCursor;}while(cursor&&all.length<500);
   let next=null;if(online()&&!overviewVisits(all).length){const result=await db.request('/api/jobs?'+new URLSearchParams({state:'active',order:'schedule',after:day}));if(ticket!==epoch||who!==key())return;next=overviewVisits(result.jobs)[0]||null;}
   if(ticket!==epoch||who!==key())return;rows=all;partial=!!cursor;nearest=next;
  }catch(e){if(ticket!==epoch||who!==key())return;rows=null;nearest=null;error=e.message||'Přehled se nepodařilo načíst.';}
  finally{if(ticket===epoch&&who===key()){await loadField();if(ticket!==epoch||who!==key())return;loading=false;paint();}}})();flight=task;try{await task;}finally{if(flight===task)flight=null;}
 }
 async function loadField(){
  if(!enabled('jobs')){field=null;fieldError='';return;}
  if(!online()){field=null;fieldError='';return;}
  try{const mode=fieldMode==='company'&&getSession()?.permissions?.manage?'company':'personal';field=await db.request('/api/overview?mode='+mode);fieldError='';}
  catch(e){field=null;fieldError=e.message||'Dnešní přehled se nepodařilo načíst.';}
 }
 function bind(load=true){const root=document.querySelector('#overview');if(!root)return;for(const b of root.querySelectorAll('[data-overview-today]'))b.onclick=()=>onToday();root.querySelector('[data-overview-protocols]')?.addEventListener('click',onProtocols);root.querySelectorAll('[data-overview-job]').forEach(button=>button.addEventListener('click',e=>{e.preventDefault();const id=e.currentTarget.dataset.overviewJob;onJob(id,overviewVisits(rows||[]).find(job=>job.id===id)||(field?.todayJobs||[]).find(job=>job.id===id)||field?.currentJob||nearest).catch(err=>toast(err.message,true));}));root.querySelector('[data-overview-retry]')?.addEventListener('click',refresh);const run=fn=>()=>{Promise.resolve().then(fn).catch(err=>toast(err.message,true));};root.querySelectorAll('[data-field-mode]').forEach(button=>button.onclick=()=>{if(button.dataset.fieldMode===fieldMode)return;fieldMode=button.dataset.fieldMode;refresh();});root.querySelectorAll('[data-field-advance]').forEach(button=>button.onclick=run(()=>onAdvance?.(button.dataset.fieldAdvance,button.dataset.fieldFrom)));root.querySelectorAll('[data-field-depart]').forEach(button=>button.onclick=run(()=>onDepart?.(button.dataset.fieldDepart)));root.querySelectorAll('[data-field-assistant]').forEach(button=>button.onclick=run(()=>onAssistant?.(button.dataset.fieldAssistant)));root.querySelectorAll('[data-field-photo]').forEach(button=>button.onclick=run(()=>onPhoto?.(button.dataset.fieldPhoto)));loadInquiryHint();if(load)refresh();}
 async function loadInquiryHint(){const node=document.querySelector('#overview [data-overview-inquiries]');if(!node||!getSession()?.permissions?.manage||!online())return;try{const data=await db.request('/api/inquiries/summary');if(!node.isConnected)return;const count=Number(data.newCount)||0;node.hidden=!count;const word=count===1?'nová poptávka':count>=2&&count<=4?'nové poptávky':'nových poptávek';node.innerHTML=count?`<button type="button" class="text-link" data-page="inquiries">${count} ${word}</button>`:'';}catch{if(node.isConnected)node.hidden=true;}}
 window.addEventListener('offline',()=>{epoch++;rows=null;nearest=null;loading=false;flight=null;paint();if(document.querySelector('#overview'))refresh();});
 window.addEventListener('job-cache-updated',()=>{if(document.querySelector('#overview'))refresh();});
 window.addEventListener('job-cache-denied',()=>{epoch++;rows=null;nearest=null;error='Přístup k uloženému plánu je potřeba znovu ověřit.';paint();});window.addEventListener('online',()=>{if(document.querySelector('#overview'))refresh();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'){epoch++;rows=null;nearest=null;flight=null;loading=false;paint();}else if(document.querySelector('#overview'))refresh();});
 return {markup,bind,clear,refresh};
}
