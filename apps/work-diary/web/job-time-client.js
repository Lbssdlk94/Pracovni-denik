import {timeSummary} from './job-time-model.js?v=person-hours-v1';
const timeNewer=(old,next)=>!!old?.states?.some(state=>(next.states?.find(s=>s.userId===state.userId)?.version??-1)<state.version);
export const timeRecordKey=(user,job,suffix='index')=>user+'|'+job+'|jobTime|'+suffix;
export function projectJobTime(snapshot,records,jobId){
 const result=structuredClone(snapshot),states=new Map(result.states.map(s=>[s.userId,s]));
 for(const record of records.filter(r=>r.kind==='jobTimeIndex'&&r.snapshot&&r.expiresAt>Date.now()))for(const state of record.snapshot.states||[]){if((states.get(state.userId)?.version??-1)<state.version)states.set(state.userId,structuredClone(state));}
 for(const record of records.filter(r=>r.kind==='jobTimeAction'&&r.pending&&!r.blocked&&!r.conflict).sort((a,b)=>a.payload.at-b.payload.at||a.updatedAt-b.updatedAt)){
  const p=record.payload,target=p.targetJobId||record.jobId;
  p.workers.forEach((worker,index)=>{
   const state=states.get(worker.userId)||{userId:worker.userId,version:worker.version,name:worker.userId,active:null};
   if(state.version!==worker.version)return;
   const kind=p.action==='move'?'work':p.action,same=state.active?.jobId===target&&state.active.kind===kind;
   if(state.active&&!same){const old=result.intervals.find(i=>i.id===state.active.id);if(old){old.endAt=p.at;old.version++;old.pending=true;}}
   let active=state.active;
   if(kind==='stop')active=null;
   else if(!same){active={id:p.operationId+'_'+index,jobId:target,userId:worker.userId,userName:state.name,kind,startAt:p.at,endAt:null,arrivalDate:p.arrivalDate,arrivalTime:p.arrivalTime,version:1,approval:'pending',pending:true};if(target===jobId)result.intervals.push(active);}
   states.set(worker.userId,{...state,version:state.version+1,active,pending:true});
  });
 }
 result.states=result.states.map(s=>({...s,...states.get(s.userId)}));result.summary=timeSummary(result.intervals,Date.now(),!!result.canManageCosts);result.pending=records.filter(r=>r.kind==='jobTimeAction'&&r.jobId===jobId&&r.pending).map(r=>({id:r.id,payload:r.payload,error:r.error,blocked:r.blocked,conflict:r.conflict}));
 return result;
}
export function createJobTimeClient({all,change,send,request,getSession,isLocked,isPreview,checkWrite}){
 const session=()=>getSession(),key=(job,suffix)=>timeRecordKey(session()?.user.id,job,suffix),base=job=>'/api/jobs/'+encodeURIComponent(job)+'/time';
 async function valid(){const s=session();if(!s?.user||await isLocked()||s.features.jobs===false||s.features.attendance===false)throw Error('Přihlaste se s povolenými zakázkami a docházkou.');if(s.license&&(!s.license.active||s.license.expiresAt<=Date.now())||!navigator.onLine&&(s.features.offline===false||!s.verifiedAt||Date.now()-s.verifiedAt>=86400000))throw Error('Pracovní doba vyžaduje ověření přístupu po připojení.');return s;}
 async function load(jobId,refresh=navigator.onLine){
  const s=await valid(),who=s.user.id+'|'+s.user.role;let index=(await all()).find(r=>r.id===key(jobId));
  if(isPreview()){if(!navigator.onLine)throw Error('Náhled pracovní doby vyžaduje připojení.');return request(base(jobId));}
  if(refresh&&navigator.onLine)try{const snapshot=await request(base(jobId));if(who!==session()?.user.id+'|'+session()?.user.role)throw Error('Přihlášení se změnilo.');index=await change(key(jobId),old=>old?.snapshot&&old.accessRole===s.user.role&&timeNewer(old.snapshot,snapshot)?old:({id:key(jobId),kind:'jobTimeIndex',jobId,ownerId:s.user.id,accessRole:s.user.role,snapshot,expiresAt:Date.now()+86400000,updatedAt:Date.now()}));}catch(e){if([401,403,404].includes(e.status)){for(const record of (await all()).filter(r=>r.kind?.startsWith('jobTime')&&r.jobId===jobId))await change(record.id,old=>old?.pending?{...old,snapshot:null,blocked:true,error:e.message}:null);throw e;}if(!index?.snapshot||index.expiresAt<=Date.now())throw e;}
  if(!index?.snapshot||index.accessRole!==s.user.role||index.expiresAt<=Date.now())throw Error('Pracovní dobu této zakázky nejdříve otevřete s internetem.');
  return {...projectJobTime(index.snapshot,(await all()).filter(r=>r.ownerId===s.user.id&&r.accessRole===s.user.role),jobId),offline:!navigator.onLine};
 }
 async function sendOrdered(id){
  const records=await all(),record=records.find(r=>r.id===id);if(!record)return;
  const ids=new Set(record.payload.workers.map(w=>w.userId)),order=(a,b)=>a.payload.at-b.payload.at||a.updatedAt-b.updatedAt||a.id.localeCompare(b.id);
  const previous=records.filter(r=>r.kind==='jobTimeAction'&&r.pending&&r.ownerId===record.ownerId&&r.accessRole===record.accessRole&&order(r,record)<0&&r.payload.workers.some(w=>ids.has(w.userId))).sort(order);
  try{for(const row of previous){if(row.blocked||row.conflict)throw Object.assign(Error('Předchozí interval vyžaduje porovnání.'),{status:409,code:'job_time_dependency'});await send(row.id);}}
  catch(e){await change(id,r=>r?{...r,conflict:!!e.status&&e.status<500,error:'Nejdříve dokončete odeslání předchozího intervalu. '+e.message,blockedCode:'job_time_dependency'}:r);throw e;}
  return send(id);
 }
 async function action(jobId,value){
  checkWrite();const s=await valid();if(isPreview()||!s.permissions.write)throw Error('Pracovní dobu zapisuje přihlášený pracovník.');
  const snapshot=await load(jobId,false),ids=value.userIds||[s.user.id];if(!snapshot.canManage&&ids.some(id=>id!==s.user.id))throw Error('Pracovní dobu ostatních mění vedoucí nebo správce.');
  const selected=ids.map(id=>{const state=snapshot.states.find(v=>v.userId===id);if(!state)throw Error('Pracovník není v načteném týmu.');return state;});
  if((await all()).some(r=>r.kind==='jobTimeAction'&&r.pending&&(r.blocked||r.conflict||r.expiresAt<=Date.now())&&r.payload.workers.some(w=>ids.includes(w.userId))))throw Error('Nejdříve vyřešte předchozí neodeslanou změnu tohoto pracovníka.');
  const target=value.targetJobId||jobId;
  if(value.action!=='stop'&&!value.allowSwitch&&selected.some(v=>v.active&&v.active.jobId!==target))throw Object.assign(Error('Ukončit předchozí otevřený interval a přejít na tuto zakázku?'),{code:'job_time_switch'});
  const operationId=crypto.randomUUID(),payload={operationId,action:value.action,at:value.at??Date.now(),workers:selected.map(s=>({userId:s.userId,version:s.version})),...(value.allowSwitch?{allowSwitch:true}:{}),...(value.targetJobId?{targetJobId:value.targetJobId}:{}),...(value.arrivalDate?{arrivalDate:value.arrivalDate,arrivalTime:value.arrivalTime}:{})},id=key(jobId,operationId);
  await change(id,()=>({id,kind:'jobTimeAction',jobId,ownerId:s.user.id,accessRole:s.user.role,snapshot:{job:snapshot.job},expiresAt:Date.now()+86400000,payload,mutationId:operationId,pending:true,conflict:false,blocked:false,error:'',updatedAt:Date.now()}));
  if(navigator.onLine)try{await sendOrdered(id);}catch(e){if(e.status&&e.status<500)throw e;}
  return load(jobId,false);
 }
 async function acknowledge(record,snapshot){
  const s=await valid();if(s.user.id!==record.ownerId||s.user.role!==record.accessRole)return;
  await change(key(record.jobId),old=>old?.snapshot&&old.accessRole===s.user.role&&timeNewer(old.snapshot,snapshot)?old:({id:key(record.jobId),kind:'jobTimeIndex',jobId:record.jobId,ownerId:s.user.id,accessRole:s.user.role,snapshot,expiresAt:Date.now()+86400000,updatedAt:Date.now()}));
  for(const index of (await all()).filter(r=>r.kind==='jobTimeIndex'&&r.ownerId===s.user.id&&r.jobId!==record.jobId&&r.snapshot))await change(index.id,old=>{
   if(!old?.snapshot)return old;const next=structuredClone(old.snapshot);
   for(const worker of record.payload.workers){const fresh=snapshot.states.find(s=>s.userId===worker.userId);if(!fresh||(next.states.find(s=>s.userId===worker.userId)?.version??-1)>fresh.version)continue;for(const interval of next.intervals.filter(i=>i.userId===worker.userId&&i.endAt===null&&i.id!==fresh.active?.id)){interval.endAt=record.payload.at;interval.version++;}if(fresh.active?.jobId===index.jobId&&!next.intervals.some(i=>i.id===fresh.active.id))next.intervals.push(fresh.active);next.states=next.states.map(s=>s.userId===worker.userId?{...s,...fresh}:s);}
   return {...old,snapshot:next};
  });
  await change(record.id,current=>current?.mutationId===record.mutationId?null:current);window.dispatchEvent(new CustomEvent('job-time-updated',{detail:{jobId:record.jobId}}));
 }
 async function resolve(id,retry=false){
  checkWrite();if(!navigator.onLine)throw Error('Porovnání vyžaduje připojení.');const old=(await all()).find(r=>r.id===id&&r.kind==='jobTimeAction'&&r.ownerId===session()?.user.id);if(!old)return;
  if(!retry){await change(id,()=>null);return load(old.jobId,true);}
  const current=await load(old.jobId,true),workers=old.payload.workers.map(w=>{const state=current.states.find(s=>s.userId===w.userId);if(!state)throw Error('Pracovník už není přiřazený.');return {userId:w.userId,version:state.version};}),operationId=crypto.randomUUID();
  const next={...old,id:key(old.jobId,operationId),payload:{...old.payload,operationId,workers,allowSwitch:true},mutationId:operationId,blocked:false,conflict:false,error:'',previousPayload:old.payload,updatedAt:Date.now()};
  await change(next.id,()=>next);await change(id,()=>null);await sendOrdered(next.id);return load(old.jobId,true);
 }
 return {load,action,acknowledge,resolve};
}
