// Reuses the protocol store, original-photo packing, access lease and outbox sender.
export const diaryRecordKey=(user,job,entry='')=>user+'|'+job+'|diary'+(entry?'|'+entry:'');
export const mergeDiaryEntries=(snapshot,pending)=>[...new Map([...(snapshot?.entries||[]),...pending.map(record=>({...record.snapshot?.entry,...record.payload,id:record.entryId,jobId:record.jobId,authorName:record.snapshot?.entry?.authorName||record.authorName,createdBy:record.snapshot?.entry?.createdBy||record.ownerId,canEdit:true,photos:[...(record.snapshot?.entry?.photos||[]),...(record.photos||[]).map(p=>({id:p.id,name:p.file.name,file:p.file}))],pending:true,conflict:!!record.conflict,blocked:!!record.blocked,photoRequired:record.blockedCode==='diary_photo_required',error:record.error||''}))].map(e=>[e.id,e])).values()].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
export function createJobDiaryClient({all,change,send,request,getSession,isPreview,isLocked,checkWrite,packPhotos}){
 const key=(job,id='')=>diaryRecordKey(getSession()?.user.id,job,id),base=job=>'/api/jobs/'+encodeURIComponent(job)+'/diary';
 const valid=async()=>{if(!getSession()?.user||await isLocked()||getSession()?.features.jobs===false)throw Error('Přihlaste se k účtu s povolenými zakázkami.');const s=getSession();if(s.license&&(!s.license.active||s.license.expiresAt<=Date.now())||!navigator.onLine&&(s.features.offline===false||!s.verifiedAt||Date.now()-s.verifiedAt>86400000))throw Error('Platnost offline přístupu vyžaduje ověření s internetem.');};
 async function load(jobId,refresh=navigator.onLine,more=false){
  await valid();const user=getSession().user,who=user.id+'|'+user.role,indexKey=key(jobId);let records=await all(),index=records.find(r=>r.id===indexKey);
  if(isPreview()){if(!navigator.onLine)throw Error('Náhled deníku vyžaduje připojení.');return request(base(jobId));}
  if(refresh&&navigator.onLine){try{
   const cursor=more?index?.snapshot?.nextCursor:null,result=await request(base(jobId)+(cursor?'?cursor='+encodeURIComponent(cursor):''));if(who!==getSession()?.user.id+'|'+getSession()?.user.role)throw Error('Přihlášení se změnilo.');
   const entries=more?[...new Map([...(index?.snapshot?.entries||[]),...result.entries].map(e=>[e.id,e])).values()]:result.entries;
   index=await change(indexKey,()=>({id:indexKey,kind:'jobDiaryIndex',jobId,ownerId:user.id,accessRole:user.role,snapshot:{...result,entries},expiresAt:Date.now()+86400000,updatedAt:Date.now()}));
  }catch(e){if([401,403,404].includes(e.status)){for(const r of records.filter(r=>r.jobId===jobId&&r.kind?.startsWith('jobDiary')))await change(r.id,old=>old?.pending?{...old,snapshot:null,blocked:true,error:e.message}:null);throw e;}if(!index?.snapshot||index.expiresAt<Date.now()||index.accessRole!==user.role)throw e;}}
  if(!index?.snapshot||index.expiresAt<Date.now()||index.accessRole!==user.role)throw Error('Deník nejdříve otevřete s internetem. Platnost offline kopie je nejvýše 24 hodin.');
  records=await all();const pending=records.filter(r=>r.kind==='jobDiary'&&r.jobId===jobId&&r.ownerId===user.id&&r.pending);
  if(who!==getSession()?.user.id+'|'+getSession()?.user.role||await isLocked())throw Error('Přihlášení se změnilo.');return {...index.snapshot,entries:mergeDiaryEntries(index.snapshot,pending),offline:!navigator.onLine};
 }
 async function save(jobId,value,photos=[]){
  checkWrite();await valid();if(isPreview()||!['owner','administrator','admin','worker','reader'].includes(getSession()?.user.role))throw Error('Pro zápis deníku se přihlaste firemním účtem.');
  const user=getSession().user,id=key(jobId,value.id),records=await all(),index=records.find(r=>r.id===key(jobId)),old=records.find(r=>r.id===id);
  const repairing=old?.pending&&old.blockedCode==='diary_photo_required'&&!old.conflict;
  if(old?.pending&&!repairing)throw Error('Nejdříve sdílejte nebo porovnejte předchozí změnu zápisu.');
  if(!value.photoIds?.length)throw Error('K dennímu zápisu přidejte alespoň jednu fotografii.');
  if(!index?.snapshot||index.expiresAt<Date.now()||index.accessRole!==user.role||index.snapshot.job.cancelled)throw Error('Nejdříve načtěte aktuální deník s připojením.');
  const packed=await packPhotos(photos);if(user.id!==getSession()?.user.id||user.role!==getSession()?.user.role)throw Error('Přihlášení se změnilo.');
  const payload={...value,operationId:crypto.randomUUID()};delete payload.id;
  await change(id,current=>{if(repairing&&current?.mutationId!==old.mutationId)throw Error('Neodeslaný zápis se změnil. Obnovte deník.');return {id,kind:'jobDiary',entryId:value.id,jobId,ownerId:user.id,authorName:user.name,accessRole:user.role,snapshot:{job:index.snapshot.job,entry:index.snapshot.entries.find(e=>e.id===value.id)||null},expiresAt:index.expiresAt,photos:packed,payload,mutationId:payload.operationId,pending:true,conflict:false,blocked:false,error:'',updatedAt:Date.now()};});
  if(navigator.onLine){try{await send(id);}catch(e){if(e.status&&e.status<500)throw e;}}
  return load(jobId,false);
 }
 async function remove(jobId,entryId,version){
  checkWrite();await valid();if(!navigator.onLine)throw Error('Pro smazání zápisu se připojte k internetu.');const user=getSession().user,who=user.id+'|'+user.role;if(isPreview()||!['owner','administrator'].includes(user.role))throw Error('Zápisy může mazat pouze vlastník nebo administrátor.');
  const records=await all();if(records.some(r=>r.id===diaryRecordKey(user.id,jobId,entryId)&&r.pending))throw Error('Nejdříve vyřešte neodeslané změny tohoto zápisu.');
  await request(base(jobId)+'/'+encodeURIComponent(entryId),{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({version,operationId:crypto.randomUUID(),confirm:'DELETE_JOB_DIARY_ENTRY'})});
  if(who!==getSession()?.user.id+'|'+getSession()?.user.role||await isLocked())throw Error('Přihlášení se změnilo.');
  await change(diaryRecordKey(user.id,jobId),old=>old?.snapshot?{...old,snapshot:{...old.snapshot,entries:old.snapshot.entries.filter(e=>e.id!==entryId)}}:old);
  window.dispatchEvent(new CustomEvent('job-diary-updated',{detail:{jobId}}));return load(jobId,false);
 }
 async function acknowledge(record,result){
  await change(key(record.jobId),old=>old?.snapshot?{...old,snapshot:{...old.snapshot,job:result.job,entries:[...old.snapshot.entries.filter(e=>e.id!==result.entry.id),result.entry].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))},expiresAt:Date.now()+86400000}:old);
  await change(record.id,current=>current?.mutationId===record.mutationId?null:current);
  window.dispatchEvent(new CustomEvent('job-diary-updated',{detail:{jobId:record.jobId}}));
 }
 async function resolve(jobId,entryId,keepLocal){
  checkWrite();if(!navigator.onLine)throw Error('Porovnání změn vyžaduje internet.');const id=key(jobId,entryId),record=(await all()).find(r=>r.id===id);if(!record?.pending)return;
  if(!keepLocal){await change(id,()=>null);return load(jobId,true);}
  let fresh;try{fresh=await request(base(jobId)+'/'+entryId);}catch(e){if(e.status!==404||record.payload.version!==0)throw e;fresh={entry:null};}
  const mutationId=crypto.randomUUID();await change(id,old=>({...old,snapshot:{...old.snapshot,entry:fresh.entry},payload:{...old.payload,version:fresh.entry?.version||0,operationId:mutationId},mutationId,blocked:false,conflict:false,error:''}));await send(id);return load(jobId,true);
 }
 async function retry(jobId,entryId){checkWrite();const id=key(jobId,entryId),record=(await all()).find(r=>r.id===id);if(record?.conflict)throw Error('Nejdříve porovnejte obě verze.');await change(id,old=>old?{...old,blocked:false}:old);await send(id);return load(jobId,true);}
 return {load,save,remove,acknowledge,resolve,retry};
}
