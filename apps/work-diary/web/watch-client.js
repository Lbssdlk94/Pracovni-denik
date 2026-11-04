// Companion-only projection. No cookies, passwords, prices, files or arbitrary
// requests cross WatchConnectivity. All reads/mutations use the existing API.
export function createWatchClient({db,getName,onSession,canResume,isOnline,today,identityKey,now=()=>Date.now()}){
 const fail=(message,code='watch_unavailable')=>{throw Object.assign(Error(message),{code});};
 const text=(value,max=200)=>typeof value==='string'?value.slice(0,max):'';
 const token=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
 const assigned=(job,id)=>(job.assignedTos||[job.assignedTo]).includes(id)&&job.serviceApproval==='confirmed';
 async function verified(){
  if(!isOnline())fail('Připojte iPhone k internetu. Změna nebyla odeslána.');
  const session=await db.connect();onSession?.(session);
  if(!session?.user)fail('Přihlaste se do deníku na iPhonu.');
  return {session,key:identityKey(session),binding:await token(identityKey(session))};
 }
 function guard(key){if(!isOnline()||identityKey(db.session())!==key)fail('Přístup se změnil. Obnovte hodinky.','watch_identity_changed');}
 function jobsEnabled(s){return s.features?.jobs!==false&&s.features?.jobDay!==false;}
 const active=j=>!['done','incomplete'].includes(j.status);
 function project(job,s){
  const mine=assigned(job,s.user.id),working=mine&&active(job),handoff=job.handoffs?.find(h=>h.userId===s.user.id);
  return {id:job.id,version:job.version,title:text(job.title,120),customerName:text(job.customerName||job.customerContact?.name||job.title,160),address:text(job.address,500),gardenName:text(job.gardenName,160),dueDate:text(job.dueDate,10),status:job.status,kind:text(job.jobType,30),discipline:text(job.discipline,30),plannedStart:text(job.plannedStart,5),arrivalStart:text(job.arrivalWindowStart,5),arrivalEnd:text(job.arrivalWindowEnd,5),originalStart:text(job.startTime,5),estimatedMinutes:job.estimatedMinutes??null,arrivalTime:text(job.arrivalTime,5),handoffStatus:handoff?.status||'pending',protocolStatus:job.protocolStatus||'missing',incompleteReason:text(job.incompleteReason,300),canStart:working&&job.status!=='in_progress',canComplete:working,requiresProtocol:!!job.servicePeriodId,canDepart:working&&s.permissions?.write===true&&s.features?.jobTravel!==false,canAccept:working&&s.features?.jobHandoffs!==false&&handoff?.status!=='accepted'};
 }
 async function snapshot(verifiedContext){
  const {session:s,key,binding}=verifiedContext||await verified(),day=today();let jobs=[],hasMoreJobs=false;
  if(jobsEnabled(s)){
   const params=new URLSearchParams({state:'all',order:'schedule',month:day.slice(0,7),day,assignee:s.user.id});
   const page=await db.request('/api/jobs?'+params);guard(key);
   jobs=page.jobs.filter(j=>j.dueDate===day&&assigned(j,s.user.id));hasMoreJobs=!!page.nextCursor||jobs.length>30;jobs=jobs.slice(0,30).map(j=>project(j,s));
  }
  let notices=[],unread=0;
  if(s.features?.notifications!==false){
   const inbox=await db.request('/api/notifications');guard(key);unread=Number(inbox.unread)||0;
   notices=inbox.notifications.slice(0,10).map(n=>({id:text(n.id,100),title:text(n.title,140),body:text(n.body,350),createdAt:n.createdAt,read:n.readAt!=null}));
  }
  guard(key);
  return {protocolVersion:1,binding,generatedAt:now(),today:day,companyName:text(getName(s),120),userName:text(s.user.name||s.user.email,160),jobsEnabled:jobsEnabled(s),notificationsEnabled:s.features?.notifications!==false,jobs,hasMoreJobs,notices,unread};
 }
 return {async execute(input={}){
  if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!['protocolVersion','requestId','kind','action','jobId','jobVersion','binding','snapshotAt','arrivalTime'].includes(k))||input.protocolVersion!==1||typeof input.requestId!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.requestId))fail('Neplatný požadavek hodinek.');
  if(input.kind==='refresh')return {requestId:input.requestId,snapshot:await snapshot()};
  if(input.kind!=='action'||!['accept','start','complete','depart','openPhone'].includes(input.action)||!/^[-\w]{1,100}$/.test(input.jobId||'')||!Number.isSafeInteger(input.jobVersion)||input.jobVersion<1)fail('Nepodporovaná operace hodinek.');
  if(!canResume())fail('Na iPhonu je rozepsaný formulář. Nejprve ho uložte nebo zavřete.','native_form_open');
  const context=await verified(),{session:s,key,binding}=context;
  if(binding!==input.binding)fail('Účet nebo oprávnění se změnily. Obnovte hodinky.','watch_identity_changed');
  if(!Number.isFinite(input.snapshotAt)||input.snapshotAt>now()+30000||now()-input.snapshotAt>120000)fail('Přehled je starší. Nejdříve obnovte zakázky.','watch_stale');
  if(!jobsEnabled(s))fail('Dnešní zakázky jsou ve firmě vypnuté.');
  const path='/api/jobs/'+encodeURIComponent(input.jobId),{job}=await db.request(path);guard(key);
  if(!assigned(job,s.user.id)||job.dueDate!==today())fail('Zakázka už nepatří do vašich dnešních návštěv.');
  if(job.version!==input.jobVersion)fail('Zakázku mezitím někdo změnil. Obnovte ji a akci potvrďte znovu.','watch_conflict');
  let phoneAction=null,message='Změna byla uložena.';const send=(route,method,body)=>db.request(route,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(input.action==='openPhone'||input.action==='complete'&&job.servicePeriodId){phoneAction=job.servicePeriodId?'protocol':'detail';message='Otevřete iPhone a potvrďte otevření zakázky.';}
  else if(input.action==='accept'){
   if(!active(job)||s.features?.jobHandoffs===false)fail('Převzetí není dostupné.');
   const state=await db.request(path+'/handoffs');guard(key);const own=state.handoffs.find(h=>h.userId===s.user.id);
   if(state.jobVersion!==input.jobVersion||!own)fail('Zadání se změnilo. Obnovte hodinky.','watch_conflict');
   await send(path+'/handoffs','POST',{operationId:input.requestId,jobVersion:input.jobVersion,revision:state.revision,version:own.version,status:'accepted',note:''});message='Zakázku jste převzali.';
  }else if(input.action==='depart'){
   if(!active(job)||s.permissions?.write!==true||s.features?.jobTravel===false)fail('Odjezd není dostupný.');
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.arrivalTime||''))fail('Vyberte přesný čas příjezdu.');
   await send(path+'/departure','POST',{version:input.jobVersion,arrivalDate:today(),arrivalTime:input.arrivalTime});phoneAction='travelSms';message='Odjezd je uložený. SMS můžete připravit na iPhonu.';
  }else{
   if(!active(job))fail('Pracovní pokus už skončil. Obnovte návštěvy.');
   await send(path+'/status','PATCH',{version:input.jobVersion,status:input.action==='start'?'in_progress':'done',incompleteReason:''});message=input.action==='start'?'Práce byla zahájena.':'Zakázka je hotová. Závady zůstávají otevřené, dokud je výslovně nevyřešíte.';
  }
  guard(key);
  // A successful write is acknowledged even if the following refresh fails.
  // Never repeat a status update with a freshly fetched version automatically.
  let refreshed=null;try{refreshed=await snapshot(context);}catch{guard(key);message+=' Přehled se nepodařilo obnovit; obnovte ho ručně.';}
  return {requestId:input.requestId,snapshot:refreshed,message,phoneAction,phoneJobId:phoneAction?job.id:null};
 }};
}
