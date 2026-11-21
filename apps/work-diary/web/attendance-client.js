import {jobCacheScope} from './job-list-cache.js?v=completion-v1';
import {attendanceOverview} from './attendance-model.js?v=workspace-roles-v1';

export const attendanceBinding=session=>session?.user?JSON.stringify([session.user.id,session.user.role,session.installation?.id,session.workspace?.workspaceId,session.workspace?.authorizationVersion]):null;
const upsert=(rows,item)=>{if(!item)return rows||[];const old=(rows||[]).find(r=>r.id===item.id);return old&&(old.version||0)>(item.version||0)?rows:[...(rows||[]).filter(r=>r.id!==item.id),item];};

// A projection of pending requests in the existing outbox, not a second ledger.
export function projectAttendance(snapshot,records,session,path,at=Date.now()){
 const value=structuredClone(snapshot),user=session.user,detail=value.detail;
 if(detail?.activitySchema!==1)return value;
 const target=new URL(path,'https://local.invalid').searchParams.get('userId')||user.id,selected=target==='all'||target===user.id;
 let state=structuredClone(detail.ownToday?.state||{userId:user.id,version:0,active:null}),shift=value.activeShift;
 const ownShifts=detail.ownToday?.shifts||[],ownIntervals=detail.ownToday?.intervals||[];
 const close=(active,end)=>{if(!active)return;for(const rows of [ownIntervals,detail.intervals]){const row=rows?.find(i=>i.id===active.id);if(row&&row.endAt==null){row.endAt=end;row.version=(row.version||0)+1;row.pending=true;}}};
 const shiftUpdate=row=>{const put=rows=>{if(!rows)return;const next=upsert(rows,row);rows.splice(0,rows.length,...next);};put(ownShifts);if(selected){put(detail.shifts);put(detail.todayShifts);put(value.shifts);}};
 const pending=records.filter(r=>r.pending&&(r.kind==='jobTimeAttendanceAction'&&r.binding===attendanceBinding(session)||r.kind==='jobTimeAction'&&r.ownerId===user.id&&r.accessRole===user.role&&r.payload.workers.some(w=>w.userId===user.id))).sort((a,b)=>a.payload.at-b.payload.at||a.updatedAt-b.updatedAt);
 for(const record of pending){if(record.blocked||record.conflict)continue;const b=record.payload;
  if(record.kind==='jobTimeAction'){
   const index=b.workers.findIndex(w=>w.userId===user.id),worker=b.workers[index];if(state.version!==worker.version)continue;
   const kind=b.action==='move'?'work':b.action,target=b.targetJobId||record.jobId,old=state.active,same=old?.jobId===target&&old.kind===kind;
   if(old&&!same)close(old,b.at);
   if(kind!=='stop'&&!shift){shift={id:b.operationId+'_shift_'+index,userId:user.id,userName:user.name,startAt:b.at,endAt:null,version:1,pending:true};shiftUpdate(shift);}
   const active=kind==='stop'?null:same?old:{id:b.operationId+'_'+index,userId:user.id,userName:user.name,shiftId:shift?.id,jobId:target,job:record.snapshot?.job?.id===target?record.snapshot.job:null,kind,startAt:b.at,endAt:null,version:1,pending:true};
   if(active&&!same){ownIntervals.push(active);if(selected&&!detail.intervals.some(i=>i.id===active.id))detail.intervals.push(active);}
   state={...state,active,version:state.version+1,pending:true};
  }else if(record.path==='/api/attendance/punch'){
   if(b.kind==='arrival'){
    if(shift&&shift.id!==b.mutationId)continue;
    shift={id:b.mutationId,userId:user.id,userName:user.name,startAt:b.at,endAt:null,version:1,startGpsStatus:b.gpsStatus,pending:true};shiftUpdate(shift);
   }else{
    if(!shift||shift.id!==b.shiftId||shift.version!==b.version)continue;
    shift={...shift,endAt:b.at,version:shift.version+1,endGpsStatus:b.gpsStatus,pending:true};shiftUpdate(shift);shift=null;
    if(state.active){close(state.active,b.at);state={...state,version:state.version+1,active:null,pending:true};}
   }
  }else{
   if(!shift||shift.id!==b.shiftId||shift.version!==b.shiftVersion||state.version!==b.version)continue;
   const old=state.active;close(old,b.at);const kind=b.action==='resume'?b.resumeKind:b.action==='stop'?null:b.action,jobId=b.action==='resume'?b.resumeJobId:b.action==='break'?old?.jobId:null;
   const active=kind?{id:b.operationId+'_interval',userId:user.id,userName:user.name,shiftId:shift.id,kind,jobId:jobId||null,job:jobId===old?.jobId?old?.job:null,startAt:b.at,endAt:null,version:1,pending:true}:null;
   if(active){ownIntervals.push(active);if(selected&&!detail.intervals.some(i=>i.id===active.id))detail.intervals.push(active);}
   state={...state,version:state.version+1,active,pending:true};
  }
 }
 detail.ownToday={...detail.ownToday,shifts:ownShifts,intervals:ownIntervals,state};
 if(selected)detail.states=detail.states.map(s=>s.userId===user.id?{...s,...state}:s);
 value.activeShift=shift;value.overview={...value.overview,...attendanceOverview(ownShifts,at)};
 // Server time remains in the cache label. This timestamp is explicitly local.
 detail.asOf=at;value._localProjection=true;value._attendancePending=pending.filter(r=>r.kind==='jobTimeAttendanceAction').map(r=>({id:r.id,path:r.path,payload:r.payload,error:r.error||'',blocked:!!r.blocked,conflict:!!r.conflict}));
 return value;
}

export function createAttendanceClient({readCache,changeCache,all,change,send,request,getSession,isLocked,checkWrite,online=()=>navigator.onLine,now=()=>Date.now(),notify=()=>{}}){
 let revision=0;const flights=new Map();
 const scope=()=>jobCacheScope(getSession());
 async function valid(write=false){const session=getSession();if(session?.rolePreview?.active&&!online())throw Error('Náhled docházky vyžaduje připojení.');if(session?.license&&(!session.license.active||session.license.expiresAt<=now()))throw Error('Obnovte ověření licence s připojením.');if(!session?.user||await isLocked())throw Error('Obnovte přihlášení.');if(session.features?.attendance===false)throw Error('Docházka není pro tuto firmu dostupná.');if(!online()&&session.features?.offline===false)throw Error('Offline přístup není pro tuto firmu povolený.');if(!online()&&(!session.verifiedAt||now()-session.verifiedAt>86400000))throw Error('Platnost offline přístupu vypršela. Obnovte přihlášení s internetem.');if(write){checkWrite();if(!session.permissions?.write||session.rolePreview?.active)throw Error('Docházku zapisuje pracovník ve vlastním účtu.');}return session;}
 const assertScope=who=>{if(who!==scope())throw Error('Účet nebo oprávnění se změnily.');};
 const ownPending=async session=>(await all()).filter(r=>['jobTimeAttendanceAction','jobTimeAction'].includes(r.kind)&&r.pending&&r.ownerId===session.user.id);
 async function cached(path,session){const box=await readCache();return box?.entries?.find(e=>e.path===path&&e.scope===scope()&&e.expiresAt>now())||null;}
 async function remember(path,value,who){if(JSON.stringify(value).length>500000)return false;try{await changeCache(box=>{assertScope(who);const entry={path,scope:who,value:structuredClone(value),at:now(),expiresAt:Math.min(now()+86400000,(getSession().verifiedAt||now())+86400000)};return {entries:[entry,...(box?.entries||[]).filter(e=>!(e.path===path&&e.scope===who)&&e.expiresAt>now())].slice(0,8)};});return true;}catch{return false;}}
 async function read(path,refresh=true){const session=await valid(),who=scope(),ticket=revision,key=who+'|'+path+'|'+ticket;let entry=await cached(path,session);assertScope(who);
  if(online()&&(refresh||!entry)){
   if(!flights.has(key)){const task=(async()=>{try{const value=await request(path);assertScope(who);if(ticket!==revision)throw Object.assign(Error('Docházka se během načítání změnila. Obnovte ji.'),{code:'attendance_read_changed'});const persistent=await remember(path,value,who);return {value,at:now(),persistent};}catch(error){if([401,403,404].includes(error.status)){await changeCache(box=>({entries:(box?.entries||[]).filter(e=>e.scope!==who)}));throw error;}if(error.code==='attendance_read_changed'){const latest=await cached(path,session);if(latest)return {...latest,persistent:true,stale:true};throw error;}if(!entry)throw error;return {...entry,persistent:true,stale:true};}})();flights.set(key,task);task.finally(()=>flights.delete(key)).catch(()=>{});}
   entry=await flights.get(key);
  }
  if(!entry)throw Error('Tento výkaz ještě není uložený pro offline práci. Otevřete jej s připojením.');assertScope(who);
  const value=projectAttendance(entry.value,await ownPending(session),session,path,now());value._attendanceCache={at:entry.at,offline:!online(),stale:!!entry.stale,persistent:entry.persistent!==false};return value;
 }
 async function write(path,payload,base){const session=await valid(true),who=scope(),binding=attendanceBinding(session);
  if(!['/api/attendance/punch','/api/attendance/activities'].includes(path))throw Error('Nepodporovaná operace docházky.');if(!Number.isSafeInteger(payload.at)||payload.at<now()-86400000||payload.at>now()+120000)throw Error('Zachovejte původní čas. Starší změnu navrhněte jako opravu.');
  if(base?.detail?.activitySchema!==1){if(!online())throw Error('Offline docházka vyžaduje aktualizaci serveru.');return request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});}
  const records=await all();assertScope(who);if(records.some(r=>r.pending&&(r.kind==='jobTimeAttendanceAction'&&r.ownerId===session.user.id||r.kind==='jobTimeAction'&&r.payload.workers.some(w=>w.userId===session.user.id))&&(r.blocked||r.conflict)))throw Error('Nejdříve vyřešte předchozí neodeslanou změnu pracovní doby.');
  const operation=payload.operationId||payload.mutationId,id=session.user.id+'|attendance|'+operation;
  const entry={id,kind:'jobTimeAttendanceAction',ownerId:session.user.id,accessRole:session.user.role,binding,path,stateVersion:base.detail.ownToday?.state?.version||0,payload:structuredClone(payload),mutationId:operation,expiresAt:(session.verifiedAt||now())+86400000,pending:true,blocked:false,conflict:false,updatedAt:now()};
  await change(id,old=>{assertScope(who);if(old&&JSON.stringify(old.payload)!==JSON.stringify(payload))throw Error('Identifikátor už patří jiné změně docházky.');return old||entry;});revision++;notify();
  if(online())try{const ordered=(await all()).filter(r=>r.pending&&r.ownerId===session.user.id&&(r.kind==='jobTimeAttendanceAction'||r.kind==='jobTimeAction'&&r.payload.workers.some(w=>w.userId===session.user.id))).sort((a,b)=>a.payload.at-b.payload.at||a.updatedAt-b.updatedAt||a.id.localeCompare(b.id));for(const previous of ordered){if(previous.blocked||previous.conflict)throw Object.assign(Error('Předchozí změna pracovní doby vyžaduje porovnání.'),{status:409});await send(previous.id);if(previous.id===id)break;}}catch(error){if(error.status&&error.status<500)throw error;}
  assertScope(who);return {pending:(await all()).some(r=>r.id===id&&r.pending)};
 }
 async function acknowledge(record,result){const session=await valid();if(record.kind==='jobTimeAttendanceAction'&&record.binding!==attendanceBinding(session)||record.ownerId!==session.user.id||record.accessRole!==session.user.role)return;const who=scope();revision++;
  await changeCache(box=>{assertScope(who);return {entries:(box?.entries||[]).map(entry=>{if(entry.scope!==who)return entry;const value=projectAttendance(entry.value,[{...record,pending:true,blocked:false,conflict:false}],session,entry.path,now()),selected=new URL(entry.path,'https://local.invalid').searchParams.get('userId')||session.user.id,include=selected==='all'||selected===session.user.id,detail=value.detail;if(!detail)return entry;
   for(const row of [...(value.shifts||[]),...(detail.shifts||[]),...(detail.ownToday?.shifts||[]),...(detail.intervals||[]),...(detail.ownToday?.intervals||[])])delete row.pending;
   if(value.activeShift)delete value.activeShift.pending;
   if(result.shift){value.activeShift=result.shift.endAt==null?result.shift:null;detail.ownToday.shifts=upsert(detail.ownToday.shifts,result.shift);if(include){value.shifts=upsert(value.shifts,result.shift);detail.shifts=upsert(detail.shifts,result.shift);}}
   const state=result.state||result.states?.find(s=>s.userId===session.user.id);if(state){detail.ownToday.state=state;if(include)detail.states=detail.states.map(s=>s.userId===session.user.id?{...s,...state,pending:false}:s);}
   for(const interval of result.intervals||[]){detail.ownToday.intervals=upsert(detail.ownToday.intervals,interval);if(include)detail.intervals=upsert(detail.intervals,interval);}
   delete value._attendancePending;delete value._localProjection;return {...entry,value};})};});
  if(record.kind==='jobTimeAttendanceAction')await change(record.id,current=>{assertScope(who);return current?.mutationId===record.mutationId?null:current;});notify();
 }
 async function discard(id){const session=await valid(true),who=scope(),rows=await all(),record=rows.find(r=>r.id===id);assertScope(who);if(record&&rows.some(r=>r.pending&&r.id!==id&&r.payload?.at>=record.payload.at&&(r.kind==='jobTimeAttendanceAction'&&r.ownerId===session.user.id||r.kind==='jobTimeAction'&&r.ownerId===session.user.id&&r.payload.workers.some(w=>w.userId===session.user.id))))throw Error('Nejdříve zkontrolujte navazující neodeslané změny tohoto pracovníka. Původní pořadí musí zůstat zachované.');await change(id,entry=>{assertScope(who);if(!entry)return null;if(entry?.kind!=='jobTimeAttendanceAction'||entry.binding!==attendanceBinding(session))throw Error('Změna není dostupná v tomto účtu.');return null;});revision++;notify();}
 async function retry(id){const session=await valid(true),record=(await all()).find(r=>r.id===id);if(!record)return;if(record?.binding!==attendanceBinding(session))throw Error('Změna není dostupná v tomto účtu.');if(!online())throw Error('Opakování vyžaduje připojení.');await change(id,r=>({...r,blocked:false,conflict:false,error:''}));await send(id);notify();}
 async function peekOwn(){const session=await valid(),who=scope(),box=await readCache();assertScope(who);const entry=box?.entries?.find(e=>e.scope===who&&e.expiresAt>now()&&e.value?.detail?.ownToday);return entry?read(entry.path,false):null;}
 return {read,write,acknowledge,discard,retry,peekOwn};
}
