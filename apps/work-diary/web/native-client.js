import {createNativeScreens} from './native-screens.js?v=native-all-v1';
// A narrow, read-only data bridge for the first native iPhone screens.
// Mutations and offline forms continue through the existing guarded web UI.
const formOpen=()=>Object.assign(Error('Nejdříve uložte nebo zavřete otevřený formulář.'),{code:'native_form_open'});
const states=new Set(['all','active','planned','on_way','in_progress','incomplete','done']);
const validId=v=>typeof v==='string'&&/^[-\w]{1,100}$/.test(v);
export function nativeIdentityKey(s){return JSON.stringify([s?.installation?.id,s?.user?.id,s?.user?.role,s?.workspace?.authorizationVersion,s?.workspace?.selectedDiscipline,s?.workspace?.disciplines,s?.features]);}
export function createNativeClient({db,getName,onSession,openTarget,canResume,isOnline=()=>navigator.onLine,screens=null,today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date())}){
 const current=()=>{const s=db.session();if(!s?.user||!isOnline())throw Error('Přehled vyžaduje ověřené připojení. Offline práci otevřete.');return s;};
 const guard=(key)=>{if(nativeIdentityKey(current())!==key)throw Error('Oprávnění nebo pracovní obor se změnily. Obnovte přehled.');};
 const jobsAllowed=(s,day)=>{if(s.features?.jobs===false||s.features?.[day?'jobDay':'jobList']===false)throw Error('Tento pohled zakázek je pro firmu vypnutý.');};
 async function list(input={}){const s=current(),key=nativeIdentityKey(s),day=input.day||'';jobsAllowed(s,day);if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day)||!states.has(input.state||'all'))throw Error('Neplatný filtr zakázek.');
  const params=new URLSearchParams({state:input.state||'all',order:'schedule'});if(day){params.set('month',day.slice(0,7));params.set('day',day);}if(input.q)params.set('q',String(input.q).slice(0,100));if(input.cursor)params.set('cursor',String(input.cursor));if(input.mine||!s.permissions?.manage)params.set('assignee',s.user.id);
  const result=await db.request('/api/jobs?'+params);guard(key);return result;
 }
 return Object.freeze({async execute(command,input={}){
  if(command==='screen')return screens?.snapshot();
  if(command==='control')return screens?.action(input);
  if(command==='asset')return screens?.asset(input);
  if(command==='context'){
   if(!canResume())throw formOpen();
   if(!isOnline())throw Error('Jste offline. Uložené údaje a zápisy jsou dostupné.');
   const s=await db.connect();onSession?.(s);current();
   return {user:{id:s.user.id,name:s.user.name||s.user.email,role:s.user.role},companyName:getName(s),features:s.features||{},permissions:s.permissions,workspace:s.workspace?{selectedDiscipline:s.workspace.selectedDiscipline,disciplines:s.workspace.disciplines,authorizationVersion:s.workspace.authorizationVersion}:null,identityKey:nativeIdentityKey(s),today:today()};
  }
  if(command==='jobs')return list(input);
  if(command==='overview'){
   const s=current(),key=nativeIdentityKey(s);if(s.features?.jobs===false||s.features?.jobDay===false)return {jobs:[],nextCursor:null};
   const result=await list({day:today(),state:'all',mine:input.mine});
   if(!result.jobs.some(j=>!['done','incomplete'].includes(j.status))){const params=new URLSearchParams({state:'active',order:'schedule',after:today()});if(input.mine||!s.permissions?.manage)params.set('assignee',s.user.id);const next=await db.request('/api/jobs?'+params);guard(key);result.nextJob=next.jobs.find(j=>!['done','incomplete'].includes(j.status))||null;}
   guard(key);return result;
  }
  if(command==='job'){
   const s=current(),key=nativeIdentityKey(s);if(s.features?.jobs===false||!validId(input.id))throw Error('Zakázka není dostupná.');
   const result=await db.request('/api/jobs/'+encodeURIComponent(input.id));let defects=[];
   if(result.job.gardenId&&s.features?.defects!==false)defects=(await db.getDefects({jobId:input.id})).defects.filter(d=>d.status!=='resolved').map(({id,title,discoveredOn,priority,status})=>({id,title,discoveredOn,priority,status}));
   guard(key);return {...result,defects};
  }
  if(command==='open'){
   current();if(!canResume())throw formOpen();
   await openTarget(input);return {opened:true};
  }
  if(command==='resume'){if(!canResume())throw formOpen();return {allowed:true};}
  throw Error('Nepodporovaná nativní operace.');
 }});
}
export function installNativeClient(options){
 const handler=globalThis.webkit?.messageHandlers?.workDiaryState;if(!handler)return;
 const screens=createNativeScreens({db:options.db,getSession:options.db.session});const client=createNativeClient({...options,screens});Object.defineProperty(window,'__workDiaryNative',{value:client,configurable:false});
 let ready=false;const notify=type=>handler.postMessage({type});const check=()=>{const next=!!document.querySelector('.shell')&&!!options.db.session()?.user;if(next!==ready){ready=next;notify(next?'ready':'invalidated');}};
 let timer;new MutationObserver(()=>{check();clearTimeout(timer);timer=setTimeout(()=>notify('screen'),150);}).observe(document.querySelector('#app'),{subtree:true,childList:true});
 for(const event of ['workspace-access-freeze','workspace-access-reset','workspace-recovery-failed','offline'])window.addEventListener(event,()=>{ready=false;notify('invalidated');});
 window.addEventListener('online',()=>{check();if(ready)notify('ready');});
 document.addEventListener('click',event=>{if(event.target.closest('[data-signout]')){ready=false;notify('invalidated');}},true);
 check();
}
