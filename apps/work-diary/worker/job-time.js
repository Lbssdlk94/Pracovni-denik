import {attendanceInstant,attendanceDayBounds} from '../web/attendance-model.js';
import {workspaceJobScope} from './workspace-policy.js';
import {jobAssignedIds,jobAssignment} from './assignments.js';
import {subHash} from './subscriptions.js';
import {timeSummary,attendanceAllocation} from '../web/job-time-model.js';

const timeManagers="('owner','administrator','admin')",timeWriters="('owner','administrator','admin','worker')";
const tmManager=m=>['owner','administrator','admin'].includes(m.role);
const tmOne=async(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const tmAll=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results;
export const timeIntervalDTO=(r,financial=false)=>({id:r.id,jobId:r.job_id,userId:r.user_id,userName:r.user_name,kind:r.kind,arrivalDate:r.arrival_date||null,arrivalTime:r.arrival_time||null,startAt:r.start_at,endAt:r.end_at,shiftId:r.shift_id,version:r.version,approval:r.approval,createdBy:r.created_by,updatedBy:r.updated_by,...financial?{hourlyMinor:r.hourly_minor}:{}});
export async function timeJob(env,m,id,fail){const j=await tmOne(env,`SELECT j.* FROM jobs j WHERE j.id=? AND j.deleted=0 AND ${workspaceJobScope()}`,id,m.user_id);if(!j)fail(404,'Zakázka není dostupná.');return j;}
async function timeMayManage(env,m,job){return tmManager(m)||m.role==='worker'&&jobAssignedIds(job).includes(m.user_id)&&!!await tmOne(env,'SELECT 1 FROM job_time_leads WHERE job_id=? AND user_id=?',job.id,m.user_id);}
export async function timeState(env,userId,viewer=null){const version=(await tmOne(env,'SELECT version FROM job_time_states WHERE user_id=?',userId))?.version||0,active=await tmOne(env,'SELECT * FROM job_time_intervals WHERE user_id=? AND end_at IS NULL',userId);let dto=active?timeIntervalDTO(active):null;if(dto?.jobId&&viewer&&!await tmOne(env,`SELECT 1 FROM jobs j WHERE j.id=? AND j.deleted=0 AND ${workspaceJobScope()}`,dto.jobId,viewer.user_id))dto={jobId:'unavailable',kind:'other'};return {userId,version,active:dto};}
function timeFailure(error,fail){if(/job_time_|CHECK constraint failed|UNIQUE constraint failed/.test(String(error.message)))fail(409,'Čas, směna nebo oprávnění se změnily. Obnovte údaje; původní záznamy zůstaly zachované.',{code:'job_time_conflict'});throw error;}
function timePeopleGate(ids,discipline){return {sql:`NOT EXISTS(SELECT 1 FROM json_each(?) selected LEFT JOIN members person ON person.user_id=selected.value WHERE person.user_id IS NULL OR person.role NOT IN ${timeWriters} OR (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND person.role NOT IN ${timeManagers} AND NOT EXISTS(SELECT 1 FROM member_disciplines d WHERE d.user_id=person.user_id AND d.discipline=?)))`,args:[JSON.stringify(ids),discipline]};}
const timeHash=input=>subHash(JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b)))));
async function timeReplay(env,m,jobId,input,fail){const op=await tmOne(env,'SELECT * FROM job_time_operations WHERE id=?',input.operationId);if(!op)return false;if(op.job_id!==jobId||op.actor_id!==m.user_id||op.hash!==await timeHash({...input,action:input.action||op.action}))fail(409,'Tento identifikátor už patří jiné změně.',{code:'job_time_conflict'});return true;}

// D1 batch is a transaction. The CHECK fence aborts the entire batch on stale
// person versions or a live permission change, before any shift/interval changes.
async function timeFence(env,m,job,input,workers,{manage=false,assign=false,jobVersion=null,managerOnly=false,extra='1=1',extraArgs=[],actorRoles=timeWriters}={}){
 const gate=`EXISTS(SELECT 1 FROM jobs j JOIN members actor ON actor.user_id=? WHERE j.id=? AND j.deleted=0 AND NOT EXISTS(SELECT 1 FROM workspaces WHERE state<>'active') AND actor.role IN ${actorRoles} AND (?=0 OR actor.role IN ${timeManagers}) AND ${workspaceJobScope()} AND (? IS NULL OR j.version=?) AND (actor.role IN ${timeManagers} OR ?=0 OR EXISTS(SELECT 1 FROM job_time_leads l WHERE l.job_id=j.id AND l.user_id=actor.user_id)))
 AND (${extra}) AND NOT EXISTS(SELECT 1 FROM json_each(?) item LEFT JOIN members target ON target.user_id=json_extract(item.value,'$.userId') LEFT JOIN job_time_states state ON state.user_id=target.user_id WHERE target.user_id IS NULL OR target.role NOT IN ${timeWriters} OR COALESCE(state.version,0)<>json_extract(item.value,'$.version') OR (SELECT COUNT(*) FROM jobs selected WHERE selected.id=? AND (?=1 OR selected.assigned_to=target.user_id OR EXISTS(SELECT 1 FROM json_each(selected.assigned_users) ids WHERE ids.value=target.user_id)) AND (NOT EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) OR target.role IN ${timeManagers} OR EXISTS(SELECT 1 FROM member_disciplines d WHERE d.user_id=target.user_id AND d.discipline=selected.discipline)))=0)`;
 return env.DB.prepare(`INSERT INTO job_time_operations(id,job_id,actor_id,hash,action,payload,created_at,valid) VALUES(?,?,?,?,?,?,?,CASE WHEN ${gate} THEN 1 ELSE 0 END)`).bind(input.operationId,job.id,m.user_id,await timeHash(input),input.action,JSON.stringify(input),Date.now(),m.user_id,job.id,managerOnly?1:0,m.user_id,jobVersion,jobVersion,manage?1:0,...extraArgs,JSON.stringify(workers),job.id,assign?1:0);
}

export async function timeCommands(env,m,job,input,fail,{jobVersion=null,advanceJob=true,reopen=false}={}){
 if(!['owner','administrator','admin','worker'].includes(m.role))fail(403,'Pracovní dobu zapisuje pracovník nebo správce.');
 if(!['travel','work','break','other','stop','move'].includes(input.action))fail(400,'Vyberte platnou pracovní akci.');
 if(input.action!=='stop'&&(job.service_approval!=='confirmed'||['done','incomplete'].includes(job.status)&&!reopen))fail(409,'Nejdříve zakázku potvrďte nebo ji vraťte do aktivního plánu.');
 const workers=input.workers;if(!Array.isArray(workers)||!workers.length||workers.length>50||new Set(workers.map(w=>w.userId)).size!==workers.length||workers.some(w=>!/^[-\w]{1,100}$/.test(w.userId)||!Number.isSafeInteger(w.version)||w.version<0))fail(400,'Vyberte nejvýše 50 různých pracovníků s aktuální verzí.');
 const manage=workers.some(w=>w.userId!==m.user_id);if(manage&&!await timeMayManage(env,m,job))fail(403,'Čas ostatních spravuje správce nebo vedoucí této zakázky.');
 const at=input.at,now=Date.now();if(!Number.isSafeInteger(at)||at<now-86400000||at>now+120000)fail(400,'Čas akce musí být skutečný, nejvýše 24 hodin starý. Starší dobu navrhněte jako opravu.');
 let target=job,assign=false,assignment=null;
 if(input.action==='move'){
  target=await timeJob(env,m,input.targetJobId,fail);if(target.id===job.id)fail(400,'Vyberte jinou zakázku.');
  if(['done','incomplete'].includes(target.status)||target.service_approval!=='confirmed')fail(409,'Cílová zakázka není aktivní.');
  if(manage&&!tmManager(m)&&!await timeMayManage(env,m,target))fail(403,'Přesun skupiny na tuto zakázku musí potvrdit správce nebo její vedoucí.');
  assign=workers.some(w=>!jobAssignedIds(target).includes(w.userId));
  if(assign){if(!tmManager(m))fail(403,'Přidání k cílové zakázce provádí správce.');assignment=await jobAssignment(env,{assignedTo:target.assigned_to||workers[0].userId,assignedTos:[...new Set([...jobAssignedIds(target),...workers.map(w=>w.userId)])]},target,fail);}
 }
 const kind=input.action==='move'?'work':input.action,states=[],statements=[];
 if(kind==='travel'&&(input.arrivalDate||input.arrivalTime)){let arrival;try{arrival=attendanceInstant(input.arrivalDate+'T'+input.arrivalTime);}catch(e){fail(400,e.message);}if(arrival<Math.floor(at/60000)*60000||arrival>at+36*3600000)fail(400,'Příjezd musí následovat po výjezdu, nejpozději do 36 hodin.');}
 for(const [index,worker] of workers.entries()){
  const person=await tmOne(env,'SELECT * FROM members WHERE user_id=?',worker.userId);if(!person)fail(404,'Pracovník už není v týmu.');
  if(!jobAssignedIds(job).includes(worker.userId)&&!tmManager(m))fail(403,'Pracovník není přiřazený k této zakázce.');
  const state=await timeState(env,worker.userId);if(state.version!==worker.version)fail(409,'Pracovní interval mezitím změnilo jiné zařízení.',{code:'job_time_conflict',states:[state]});
  const current=state.active;if(current&&at<=current.startAt)fail(409,'Akce musí následovat po začátku otevřeného intervalu.');
  if(current?.jobId&&current.jobId!==job.id&&worker.userId!==m.user_id&&!tmManager(m))fail(403,'Pracovník už je na jiné zakázce. Jeho přesun musí potvrdit správce.');
  if(current&&current.jobId!==target.id&&!input.allowSwitch&&kind!=='stop')fail(409,'Pracovník má otevřený interval jinde. Potvrďte jeho ukončení a přechod.',{code:'job_time_switch',states:[state]});
  if(input.action==='stop'&&current&&current.jobId!==job.id)fail(409,'Vybraný pracovník pracuje na jiné zakázce.');
  const same=current&&current.jobId===target.id&&current.kind===kind;
  states.push(state);
  if(same&&kind==='travel'&&input.arrivalDate&&input.arrivalTime){statements.push(env.DB.prepare('INSERT INTO job_time_events(id,job_id,interval_id,actor_id,at,operation_id,before_value,after_value,reason) VALUES(?,?,?,?,?,?,?,?,?)').bind(input.operationId+'_arrival_'+index,current.jobId||'',current.id,m.user_id,now,input.operationId,JSON.stringify(current),JSON.stringify({...current,arrivalDate:input.arrivalDate,arrivalTime:input.arrivalTime,version:current.version+1}),'Změna odhadovaného příjezdu'));statements.push(env.DB.prepare('UPDATE job_time_intervals SET arrival_date=?,arrival_time=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND end_at IS NULL').bind(input.arrivalDate,input.arrivalTime,m.user_id,now,current.id));}
  if(current&&!same){
   statements.push(env.DB.prepare('INSERT INTO job_time_events(id,job_id,interval_id,actor_id,at,operation_id,before_value,after_value,reason) VALUES(?,?,?,?,?,?,?,?,?)').bind(input.operationId+'_close_'+index,current.jobId||'',current.id,m.user_id,now,input.operationId,JSON.stringify(current),JSON.stringify({...current,endAt:at,version:current.version+1}),'Ukončení nebo přechod'));
   statements.push(env.DB.prepare('UPDATE job_time_intervals SET end_at=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND end_at IS NULL').bind(at,m.user_id,now,current.id));
  }
  if(kind!=='stop'&&!same){
   const shift=await tmOne(env,'SELECT * FROM attendance_shifts WHERE user_id=? AND deleted_at IS NULL AND end_at IS NULL',worker.userId);
   if(shift&&shift.start_at>at||!shift&&await tmOne(env,'SELECT 1 FROM attendance_shifts WHERE user_id=? AND deleted_at IS NULL AND (end_at IS NULL OR end_at>?)',worker.userId,at))fail(409,'Čas neodpovídá docházce. Nejdříve opravte směnu.',{code:'job_time_attendance'});
   const shiftId=input.operationId+'_shift_'+index,intervalId=input.operationId+'_'+index,rate=await tmOne(env,'SELECT * FROM job_time_rates WHERE user_id=?',worker.userId),hourly=kind==='work'?rate?.work_minor:kind==='travel'?rate?.travel_minor:null;
   statements.push(env.DB.prepare("INSERT INTO attendance_shifts(id,user_id,user_name,start_at,start_gps_status,recorded_start_at,version,created_at,updated_at) SELECT ?,?,?,?,'unavailable',?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM attendance_shifts WHERE user_id=? AND deleted_at IS NULL AND (end_at IS NULL OR end_at>?))").bind(shiftId,worker.userId,person.name,at,now,now,now,worker.userId,at));
   statements.push(env.DB.prepare(`INSERT INTO job_time_intervals(id,job_id,user_id,user_name,kind,start_at,arrival_date,arrival_time,shift_id,hourly_minor,created_by,created_at,updated_by,updated_at) SELECT ?,?,?,?,?,?,?,?,s.id,?,?,?,?,? FROM attendance_shifts s WHERE s.user_id=? AND s.deleted_at IS NULL AND s.end_at IS NULL AND s.start_at<=?`).bind(intervalId,target.id,worker.userId,person.name,kind,at,input.arrivalDate||null,input.arrivalTime||null,hourly??null,m.user_id,now,m.user_id,now,worker.userId,at));
   statements.push(env.DB.prepare('INSERT INTO job_time_events(id,job_id,interval_id,actor_id,at,operation_id,after_value,reason) VALUES(?,?,?,?,?,?,?,?)').bind(input.operationId+'_open_'+index,target.id,intervalId,m.user_id,now,input.operationId,JSON.stringify({userId:worker.userId,kind,startAt:at}),'Zahájení intervalu'));
  }
  statements.push(env.DB.prepare('INSERT INTO job_time_states(user_id,version) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1').bind(worker.userId));
 }
 if(input.action==='move')await jobAssignment(env,{assignedTo:target.assigned_to||workers[0].userId,assignedTos:[...new Set([...jobAssignedIds(target),...workers.map(w=>w.userId)])]},target,fail);
 const extra=target.id!==job.id?`EXISTS(SELECT 1 FROM jobs j WHERE j.id=? AND j.version=? AND j.deleted=0 AND j.status NOT IN ('done','incomplete') AND j.service_approval='confirmed' AND ${workspaceJobScope()})`:'1=1';
 const attendanceGuard=kind==='stop'?'1=1':`NOT EXISTS(SELECT 1 FROM json_each(?) x WHERE EXISTS(SELECT 1 FROM attendance_shifts s WHERE s.user_id=json_extract(x.value,'$.userId') AND s.deleted_at IS NULL AND s.end_at IS NULL AND s.start_at>?) OR NOT EXISTS(SELECT 1 FROM attendance_shifts s WHERE s.user_id=json_extract(x.value,'$.userId') AND s.deleted_at IS NULL AND s.end_at IS NULL) AND EXISTS(SELECT 1 FROM attendance_shifts s WHERE s.user_id=json_extract(x.value,'$.userId') AND s.deleted_at IS NULL AND s.end_at>?))`;
 const peopleGate=timePeopleGate(workers.map(w=>w.userId),target.discipline),activeGate=kind==='stop'||reopen?'1=1':`EXISTS(SELECT 1 FROM jobs WHERE id=? AND deleted=0 AND status NOT IN ('done','incomplete') AND service_approval='confirmed')`;
 const fence=await timeFence(env,m,job,input,workers,{manage,jobVersion,extra:'('+extra+') AND ('+attendanceGuard+') AND ('+peopleGate.sql+') AND ('+activeGate+')',extraArgs:[...(target.id!==job.id?[target.id,target.version,m.user_id]:[]),...(kind==='stop'?[]:[JSON.stringify(workers),at,at]),...peopleGate.args,...(kind==='stop'||reopen?[]:[job.id])]});
 if(assignment){statements.unshift(env.DB.prepare('UPDATE jobs SET assigned_to=?,assigned_users=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?').bind(assignment.assignedTo,JSON.stringify(assignment.additional),m.user_id,now,target.id,target.version));}
 if(advanceJob&&['travel','work'].includes(kind))statements.push(env.DB.prepare(`UPDATE jobs SET status=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND status IN (${kind==='work'?"'planned','on_way'":"'planned'"}) AND deleted=0`).bind(kind==='work'?'in_progress':'on_way',m.user_id,now,target.id));
 if(advanceJob&&kind==='travel'&&input.arrivalDate&&input.arrivalTime)statements.push(env.DB.prepare("UPDATE jobs SET arrival_date=?,arrival_time=?,departure_at=?,departure_by=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND status='on_way'").bind(input.arrivalDate,input.arrivalTime,at,m.user_id,now,m.user_id,target.id));
 return [fence,...statements];
}

export async function timeLegacyStatements(env,m,job,kind,fail,extra={}){
 if(kind==='stop'&&await tmOne(env,'SELECT 1 FROM job_time_intervals WHERE job_id=? AND end_at IS NULL AND user_id<>?',job.id,m.user_id))fail(409,'Na zakázce mají otevřenou práci další kolegové. Ukončete nejdříve jejich intervaly; vlastní práci lze ukončit samostatně.',{code:'job_time_others_active'});
 if(!jobAssignedIds(job).includes(m.user_id)||!['owner','administrator','admin','worker'].includes(m.role))return [];
 const state=await timeState(env,m.user_id);if(kind==='stop'&&state.active?.jobId!==job.id)return [];const operationId='legacy-'+await subHash(job.id+'|'+job.version+'|'+m.user_id+'|'+kind),input={operationId,action:kind,at:Date.now(),workers:[{userId:m.user_id,version:state.version}],...extra};
 return timeCommands(env,m,job,input,fail,{jobVersion:job.version,advanceJob:false,reopen:true});
}
export function timeAssertApplied(env,jobId,actorId,token){return env.DB.prepare('UPDATE job_time_operations SET valid=CASE WHEN EXISTS(SELECT 1 FROM jobs WHERE id=? AND service_operation=?) THEN 1 ELSE 0 END WHERE job_id=? AND actor_id=?').bind(jobId,token,jobId,actorId);}
export async function timeBatch(env,statements,fail){try{return await env.DB.batch(statements);}catch(e){timeFailure(e,fail);}}

export async function timeDetail(env,m,job,fail,{compact=false}={}){
 const manager=tmManager(m),canManage=await timeMayManage(env,m,job),now=Date.now(),day=attendanceDayBounds(now),rows=await tmAll(env,'SELECT * FROM job_time_intervals WHERE job_id=?'+(compact?' AND start_at<? AND (end_at IS NULL OR end_at>?)':'')+' ORDER BY start_at DESC,id DESC',job.id,...(compact?[now,day.start]:[])),ids=[...new Set([...jobAssignedIds(job),...rows.map(r=>r.user_id)])];
 const people=ids.length?await tmAll(env,'SELECT user_id AS id,name,role FROM members WHERE user_id IN (SELECT value FROM json_each(?)) ORDER BY name',JSON.stringify(ids)):[];
 const versions=ids.length?await tmAll(env,'SELECT user_id,version FROM job_time_states WHERE user_id IN (SELECT value FROM json_each(?))',JSON.stringify(ids)):[];
 const open=ids.length?await tmAll(env,'SELECT * FROM job_time_intervals WHERE end_at IS NULL AND user_id IN (SELECT value FROM json_each(?))',JSON.stringify(ids)):[];
 const states=people.map(person=>({userId:person.id,version:versions.find(v=>v.user_id===person.id)?.version||0,active:open.find(i=>i.user_id===person.id)?timeIntervalDTO(open.find(i=>i.user_id===person.id)):null,name:person.name,assigned:jobAssignedIds(job).includes(person.id)}));
 // A colleague's timer can be on a job outside this actor's discipline/assignment.
 // Expose only an anonymous 'elsewhere' indication in that case.
 const elsewhere=[...new Set(states.map(s=>s.active?.jobId).filter(id=>id&&id!==job.id))];
 const allowed=elsewhere.length?new Set((await tmAll(env,`SELECT j.id FROM jobs j WHERE j.id IN(SELECT value FROM json_each(?)) AND j.deleted=0 AND ${workspaceJobScope()}`,JSON.stringify(elsewhere),m.user_id)).map(j=>j.id)):new Set();
 for(const state of states)if(state.active&&state.active.jobId!==job.id&&!allowed.has(state.active.jobId))state.active={jobId:'unavailable',kind:'other'};
 const seeCrew=manager||canManage;
 if(!seeCrew)for(const state of states)if(state.userId!==m.user_id){state.active=null;state.timeVisible=false;}
 const intervals=(seeCrew?rows:rows.filter(r=>r.user_id===m.user_id)).map(r=>timeIntervalDTO(r,manager));
 const candidates=!compact&&canManage?await tmAll(env,`SELECT p.user_id AS id,p.name,p.role FROM members p WHERE p.role IN ${timeWriters} AND (p.role IN ${timeManagers} OR NOT EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) OR EXISTS(SELECT 1 FROM member_disciplines d WHERE d.user_id=p.user_id AND d.discipline=?)) ORDER BY p.name`,job.discipline):[];
 const result={job:{id:job.id,status:job.status,version:job.version,myTime:await timeState(env,m.user_id),assignedTos:jobAssignedIds(job)},intervals,states,serverNow:now,canManage,canManageCosts:manager,canSeeCrew:seeCrew,canRequest:['owner','administrator','admin','worker','reader'].includes(m.role),canWrite:['owner','administrator','admin','worker'].includes(m.role)};
 if(compact){result.projection='dashboard';}else{
  let reviews=await tmAll(env,'SELECT r.*,p.name AS author_name FROM job_time_reviews r LEFT JOIN members p ON p.user_id=r.created_by WHERE r.job_id=? ORDER BY r.created_at DESC',job.id);
  if(!seeCrew)reviews=reviews.filter(r=>r.user_id===m.user_id||r.created_by===m.user_id);
  const versionsByInterval=new Map(rows.map(r=>[r.id,r.version]));
  reviews=reviews.map(r=>({...r,conflict:r.status==='pending'&&versionsByInterval.get(r.interval_id)!==r.base_version?1:0}));
  Object.assign(result,{summary:timeSummary(intervals,now,manager),candidates,lead:(await tmOne(env,'SELECT * FROM job_time_leads WHERE job_id=?',job.id))||null,reviews});
  if(manager){result.rates=await tmAll(env,'SELECT * FROM job_time_rates WHERE user_id IN (SELECT value FROM json_each(?))',JSON.stringify(ids));result.history=await tmAll(env,'SELECT e.*,p.name AS actor_name FROM job_time_events e LEFT JOIN members p ON p.user_id=e.actor_id WHERE e.job_id=? ORDER BY e.at DESC,e.id DESC',job.id);}
 }
 // Recheck the live grant after reading private rates/history. A role reduction
 // during an asynchronous read must not serialize an earlier manager snapshot.
 const live=await tmOne(env,'SELECT role FROM members WHERE user_id=?',m.user_id);
 if(!live||live.role!==m.role)fail(403,'Oprávnění se změnila. Ověřte znovu svůj přístup.');
 await timeJob(env,m,job.id,fail);return result;
}

const timeOwnRoles="('owner','administrator','admin','worker','reader')";
const timeHas=(body,key)=>Object.prototype.hasOwnProperty.call(body,key);
function timeInstant(value,fail,label){
 if(value===undefined)return undefined;
 if(value===null||value==='')fail(400,label+' se neposílá prázdný. Chybějící pole znamená, že se tato část nemění.');
 if(!Number.isSafeInteger(value))fail(400,'Zadejte platný čas: '+label+'.');
 return value;
}
async function timeCoveringShift(env,userId,startAt,endAt){
 return tmOne(env,'SELECT * FROM attendance_shifts WHERE user_id=? AND deleted_at IS NULL AND start_at<=? AND (end_at IS NULL OR ? IS NOT NULL AND end_at>=?) ORDER BY start_at DESC LIMIT 1',userId,startAt,endAt,endAt);
}
async function timeOverlaps(env,userId,intervalId,startAt,endAt){
 return tmOne(env,'SELECT id FROM job_time_intervals WHERE user_id=? AND id<>? AND (end_at IS NULL OR end_at>?) AND (? IS NULL OR start_at<?)',userId,intervalId||'',startAt,endAt,endAt);
}
function timeCheckRange(startAt,endAt,now,fail){
 if(startAt<Date.UTC(2000,0,1)||startAt>now||endAt!==null&&(!Number.isSafeInteger(endAt)||endAt<=startAt||endAt>now||endAt-startAt>7*86400000))fail(400,'Zadejte skutečný interval v minulosti. Konec musí být později než začátek a směna může trvat nejvýše sedm dní.');
}
async function timeMergedProposal(env,old,b,fail,now){
 const removing=b.remove===true;
 if(removing){if(!old||old.end_at===null)fail(409,'Smazat lze jen ukončený interval. Otevřenou práci nejdříve ukončete.');return {remove:true,kind:old.kind,startAt:old.start_at,endAt:old.end_at,shiftId:old.shift_id};}
 const keys=['operationId','intervalId','userId','version','kind','startAt','endAt','reason','remove'];
 if(Object.keys(b).some(k=>!keys.includes(k)))fail(400,'Neplatné údaje návrhu.');
 if(b.remove!==undefined)fail(400,'Neplatný návrh smazání.');
 const startSent=timeHas(b,'startAt'),endSent=timeHas(b,'endAt'),kindSent=timeHas(b,'kind');
 const startAt=startSent?timeInstant(b.startAt,fail,'Začátek'):undefined,endAt=endSent?timeInstant(b.endAt,fail,'Konec'):undefined;
 if(kindSent&&!['work','travel','break','other'].includes(b.kind))fail(400,'Vyberte druh činnosti.');
 if(!old){
  if(!startSent||!endSent||!kindSent)fail(400,'Nový interval potřebuje začátek, konec i druh činnosti.');
  timeCheckRange(startAt,endAt,now,fail);
  if(await timeOverlaps(env,b.userId,b.intervalId,startAt,endAt))fail(409,'Interval se překrývá s jinou vaší pracovní dobou.',{code:'job_time_overlap'});
  const shift=await timeCoveringShift(env,b.userId,startAt,endAt);if(!shift)fail(409,'Nejdříve doplňte nebo opravte tuto směnu v existující docházce.',{code:'job_time_attendance'});
  return {kind:b.kind,startAt,endAt,shiftId:shift.id};
 }
 if(old.end_at===null&&endSent)fail(400,'Ukončení probíhajícího intervalu proveďte akcí Ukončit práci, ne žádostí o opravu.');
 if(!startSent&&!endSent&&!kindSent)fail(400,'Vyberte, zda se mění začátek, konec, nebo obojí.');
 const mergedStart=startSent?startAt:old.start_at,mergedEnd=endSent?endAt:old.end_at,mergedKind=kindSent?b.kind:old.kind;
 timeCheckRange(mergedStart,mergedEnd,now,fail);
 if(await timeOverlaps(env,old.user_id,old.id,mergedStart,mergedEnd))fail(409,'Interval se překrývá s jinou vaší pracovní dobou.',{code:'job_time_overlap'});
 const shift=await timeCoveringShift(env,old.user_id,mergedStart,mergedEnd);if(!shift)fail(409,'Nejdříve doplňte nebo opravte tuto směnu v existující docházce.',{code:'job_time_attendance'});
 const proposed={shiftId:shift.id};if(kindSent)proposed.kind=mergedKind;if(startSent)proposed.startAt=mergedStart;if(endSent)proposed.endAt=mergedEnd;return proposed;
}

export async function handleJobTime(request,env,m,h){
 const {fail,json,body,validId,cleanText}=h,url=new URL(request.url),parts=url.pathname.split('/'),job=await timeJob(env,m,parts[3],fail),tail=parts.slice(5),method=request.method;
 if(h.features?.attendance===false)fail(403,'Pracovní doba vyžaduje zapnutou docházku.');
 if(method==='GET'&&!tail.length)return json(await timeDetail(env,m,job,fail));
 if(method==='GET')fail(404,'Přehled pracovní doby nebyl nalezen.');
 const b=await body(request,50000);if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Neplatná pracovní doba.');validId(b.operationId);if(b.operationId.length>80)fail(400,'Identifikátor operace je příliš dlouhý.');
 if(await timeReplay(env,m,job.id,b,fail))return json({...await timeDetail(env,m,job,fail),replayed:true});
 if(tail[0]==='actions'&&method==='POST'){
  if(Object.keys(b).some(k=>!['operationId','action','at','workers','allowSwitch','targetJobId','arrivalDate','arrivalTime'].includes(k)))fail(400,'Neplatné údaje pracovní akce.');
  if(b.action==='travel'&&h.features?.jobTravel===false)fail(403,'Evidence dopravy je v nastavení vypnutá.');
  const statements=await timeCommands(env,m,job,b,fail);await timeBatch(env,statements,fail);return json({...await timeDetail(env,m,await timeJob(env,m,job.id,fail),fail),targetJobId:b.targetJobId||null,smsEligible:b.action==='travel'});
 }
 if(tail[0]==='assign'&&method==='POST'){
  if(!await timeMayManage(env,m,job))fail(403,'Pracovníky přidává správce nebo vedoucí zakázky.');
  if(b.jobVersion!==job.version)fail(409,'Přiřazení se změnilo. Obnovte zakázku.');
  if(!Array.isArray(b.userIds)||!b.userIds.length||b.userIds.length>50)fail(400,'Vyberte pracovníky.');for(const id of b.userIds)validId(id);
  const peopleGate=timePeopleGate(b.userIds,job.discipline);const ids=[...new Set([...jobAssignedIds(job),...b.userIds])],assignment=await jobAssignment(env,{assignedTo:job.assigned_to||ids[0],assignedTos:ids},job,fail),op=await timeFence(env,m,job,{...b,action:'assign'},[],{manage:true,jobVersion:job.version,extra:peopleGate.sql,extraArgs:peopleGate.args});
  await timeBatch(env,[op,env.DB.prepare('UPDATE jobs SET assigned_to=?,assigned_users=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(assignment.assignedTo,JSON.stringify(assignment.additional),Date.now(),m.user_id,job.id,job.version)],fail);
  return json(await timeDetail(env,m,await timeJob(env,m,job.id,fail),fail));
 }
 if(tail[0]==='lead'&&method==='PUT'){
  if(!tmManager(m))fail(403,'Vedoucího určuje správce.');if(b.userId&&(!jobAssignedIds(job).includes(validId(b.userId))||!(await tmOne(env,`SELECT 1 FROM members WHERE user_id=? AND role IN ${timeWriters}`,b.userId))))fail(400,'Vedoucí musí být přiřazený k zakázce.');
  const old=await tmOne(env,'SELECT * FROM job_time_leads WHERE job_id=?',job.id);if(b.version!==(old?.version||0))fail(409,'Vedoucí se změnil.');
  const op=await timeFence(env,m,job,{...b,action:'lead'},[],{manage:true,managerOnly:true,jobVersion:job.version,extra:`COALESCE((SELECT version FROM job_time_leads WHERE job_id=?),0)=? AND (?='' OR EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ${timeWriters}))`,extraArgs:[job.id,b.version,b.userId||'',b.userId||'']});
  await timeBatch(env,[op,env.DB.prepare('INSERT INTO job_time_leads(job_id,user_id,version) VALUES(?,?,1) ON CONFLICT(job_id) DO UPDATE SET user_id=excluded.user_id,version=version+1').bind(job.id,b.userId||'')],fail);return json(await timeDetail(env,m,job,fail));
 }
 if(tail[0]==='rates'&&method==='PUT'){
  if(!tmManager(m))fail(403,'Nákladové sazby spravuje pouze správce.');validId(b.userId);
  if(!jobAssignedIds(job).includes(b.userId)||[b.workMinor,b.travelMinor].some(v=>v!==null&&(!Number.isSafeInteger(v)||v<0||v>100000000)))fail(400,'Vyberte přiřazeného pracovníka a platné sazby v haléřích, nebo nechte sazbu neurčenou.');
  const old=await tmOne(env,'SELECT * FROM job_time_rates WHERE user_id=?',b.userId);if(b.version!==(old?.version||0))fail(409,'Sazbu mezitím změnil jiný správce.');
  const op=await timeFence(env,m,job,{...b,action:'rates'},[],{manage:true,managerOnly:true,extra:'COALESCE((SELECT version FROM job_time_rates WHERE user_id=?),0)=?',extraArgs:[b.userId,b.version]});
  await timeBatch(env,[op,env.DB.prepare('INSERT INTO job_time_rates(user_id,work_minor,travel_minor,version,updated_by,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET work_minor=excluded.work_minor,travel_minor=excluded.travel_minor,version=version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(b.userId,b.workMinor,b.travelMinor,m.user_id,Date.now()),env.DB.prepare('INSERT INTO job_time_events(id,job_id,actor_id,at,operation_id,before_value,after_value,reason) VALUES(?,?,?,?,?,?,?,?)').bind(b.operationId+'_rate',job.id,m.user_id,Date.now(),b.operationId,JSON.stringify(old),JSON.stringify(b),'Změna nákladové sazby pro budoucí intervaly')],fail);return json(await timeDetail(env,m,job,fail));
 }
 if(tail[0]==='proposals'&&method==='POST'){
  const keys=['operationId','intervalId','userId','version','kind','startAt','endAt','reason','remove'];
  if(Object.keys(b).some(k=>!keys.includes(k)))fail(400,'Neplatné údaje návrhu.');
  validId(b.intervalId);validId(b.userId);const old=await tmOne(env,'SELECT * FROM job_time_intervals WHERE id=?',b.intervalId),manage=await timeMayManage(env,m,job),own=b.userId===m.user_id,historical=old?.job_id===job.id&&old.user_id===b.userId;
  const roleOk=['owner','administrator','admin','worker'].includes(m.role)||m.role==='reader'&&own;
  if(!roleOk||(!jobAssignedIds(job).includes(b.userId)&&!(historical&&manage))||!own&&!manage)fail(403,'Opravu navrhuje pracovník nebo čtenář za sebe, vedoucí za svůj tým.');
  if(old&&(old.job_id!==job.id||old.user_id!==b.userId)||b.version!==(old?.version||0))fail(409,'Záznam se změnil. Obnovte pracovní dobu a podejte novou žádost.',{code:'job_time_conflict'});
  if(b.remove!==undefined&&b.remove!==true)fail(400,'Neplatný návrh smazání.');
  if(await tmOne(env,"SELECT id FROM job_time_reviews WHERE interval_id=? AND status='pending'",b.intervalId))fail(409,'U tohoto intervalu už čeká žádost. Nejdříve ji stáhněte nebo nechte vyřídit.');
  const now=Date.now(),proposed=await timeMergedProposal(env,old,b,fail,now),reason=cleanText(b.reason,1000,true);
  const op=await timeFence(env,m,job,{...b,action:'proposal'},[],{manage:!own,jobVersion:job.version,actorRoles:m.role==='reader'?timeOwnRoles:timeWriters});
  await timeBatch(env,[op,env.DB.prepare("INSERT INTO job_time_reviews(id,job_id,interval_id,user_id,base_version,old_value,proposed,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(b.operationId,job.id,b.intervalId,b.userId,b.version,old?JSON.stringify(timeIntervalDTO(old)):null,JSON.stringify(proposed),reason,m.user_id,now)],fail);return json(await timeDetail(env,m,job,fail));
 }
 if(tail[0]==='reviews'&&tail[1]&&method==='POST'){
  const review=await tmOne(env,'SELECT * FROM job_time_reviews WHERE id=? AND job_id=?',validId(tail[1]),job.id);if(!review)fail(409,'Návrh už byl vyřízen.');
  if(!['approve','reject','withdraw'].includes(b.decision))fail(400,'Vyberte schválení, zamítnutí nebo stažení.');
  const note=cleanText(b.note||'',1000),now=Date.now();
  if(b.decision==='withdraw'){
   if(review.created_by!==m.user_id&&review.user_id!==m.user_id)fail(403,'Stažení žádosti je jen pro jejího autora.');
   if(review.status!=='pending')fail(409,'Návrh už byl vyřízen.');
   const withdrawn=await timeBatch(env,[env.DB.prepare("UPDATE job_time_reviews SET status='withdrawn',reviewed_by=?,reviewed_at=?,review_note=? WHERE id=? AND status='pending'").bind(m.user_id,now,note||'Staženo autorem',review.id)],fail);
   if(!withdrawn[0].meta.changes)fail(409,'Návrh už byl vyřízen.');
   return json(await timeDetail(env,m,job,fail));
  }
  if(!tmManager(m))fail(403,'Hodiny schvaluje pouze správce.');if(review.status!=='pending')fail(409,'Návrh už byl vyřízen.');
  const op=await timeFence(env,m,job,{...b,action:'review'},[],{manage:true,managerOnly:true,extra:"EXISTS(SELECT 1 FROM job_time_reviews r WHERE r.id=? AND r.status='pending' AND COALESCE((SELECT version FROM job_time_intervals i WHERE i.id=r.interval_id),0)=r.base_version)",extraArgs:[review.id]}),statements=[op];
  if(b.decision==='approve'){
   const old=await tmOne(env,'SELECT * FROM job_time_intervals WHERE id=?',review.interval_id),value=JSON.parse(review.proposed);if((old?.version||0)!==review.base_version)fail(409,'Interval se od návrhu změnil. Žádost ho nepřepisuje. Připravte nové posouzení.',{code:'job_time_conflict'});
   if(value.remove===true){if(!old||old.end_at===null)fail(409,'Smazat lze jen ukončený interval. Otevřenou práci nejdříve ukončete.');statements.push(env.DB.prepare('DELETE FROM job_time_intervals WHERE id=? AND version=? AND user_id=? AND end_at IS NOT NULL').bind(old.id,old.version,review.user_id));statements.push(env.DB.prepare('INSERT INTO job_time_events(id,job_id,interval_id,actor_id,at,operation_id,before_value,after_value,reason) VALUES(?,?,?,?,?,?,?,?,?)').bind(b.operationId+'_review',job.id,review.interval_id,m.user_id,now,b.operationId,review.old_value,JSON.stringify(value),review.reason));}
   else{const rate=await tmOne(env,'SELECT * FROM job_time_rates WHERE user_id=?',review.user_id),person=await tmOne(env,'SELECT * FROM members WHERE user_id=?',review.user_id);
   const startAt=timeHas(value,'startAt')?value.startAt:old?.start_at,endAt=timeHas(value,'endAt')?value.endAt:old?.end_at??null,kind=value.kind||old?.kind;
   if(!old&&(!timeHas(value,'startAt')||!timeHas(value,'endAt')||!value.kind))fail(409,'Nový interval v žádosti není úplný.');
   timeCheckRange(startAt,endAt,now,fail);
   if(old?.end_at===null&&endAt!==null)fail(409,'Probíhající interval se žádostí neukončuje.');
   if(await timeOverlaps(env,review.user_id,old?.id||review.interval_id,startAt,endAt))fail(409,'Interval se překrývá s jinou pracovní dobou tohoto pracovníka.',{code:'job_time_overlap'});
   let shift=value.shiftId?await tmOne(env,'SELECT * FROM attendance_shifts WHERE id=? AND user_id=? AND deleted_at IS NULL',value.shiftId,review.user_id):null;
   if(!shift||shift.start_at>startAt||shift.end_at!==null&&(endAt===null||endAt>shift.end_at))shift=await timeCoveringShift(env,review.user_id,startAt,endAt);
   if(!shift)fail(409,'Nejdříve doplňte nebo opravte tuto směnu v existující docházce.',{code:'job_time_attendance'});
   const applied={kind,startAt,endAt,shiftId:shift.id,remove:false};
   if(old)statements.push(env.DB.prepare("UPDATE job_time_intervals SET hourly_minor=CASE WHEN kind=? THEN hourly_minor ELSE NULL END,kind=?,start_at=?,end_at=?,shift_id=?,approval='approved',version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND user_id=?").bind(kind,kind,startAt,endAt,shift.id,m.user_id,now,old.id,old.version,review.user_id));
   else statements.push(env.DB.prepare("INSERT INTO job_time_intervals(id,job_id,user_id,user_name,kind,start_at,end_at,shift_id,hourly_minor,approval,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'approved',?,?,?,?)").bind(review.interval_id,job.id,review.user_id,person?.name||review.user_id,kind,startAt,endAt,shift.id,kind==='work'?rate?.work_minor??null:kind==='travel'?rate?.travel_minor??null:null,m.user_id,now,m.user_id,now));
   statements.push(env.DB.prepare('INSERT INTO job_time_events(id,job_id,interval_id,actor_id,at,operation_id,before_value,after_value,reason) VALUES(?,?,?,?,?,?,?,?,?)').bind(b.operationId+'_review',job.id,review.interval_id,m.user_id,now,b.operationId,review.old_value,JSON.stringify(applied),review.reason));
   }
   statements.push(env.DB.prepare('INSERT INTO job_time_states(user_id,version) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1').bind(review.user_id));
  }
  statements.push(env.DB.prepare("UPDATE job_time_reviews SET status=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE id=? AND status='pending'").bind(b.decision==='approve'?'approved':'rejected',m.user_id,now,note,review.id));
  await timeBatch(env,statements,fail);return json(await timeDetail(env,m,job,fail));
 }
 fail(404,'Operace pracovní doby nebyla nalezena.');
}

export async function timeAttendanceSummary(env,shifts,now){
 const ids=shifts.map(s=>s.id);if(!ids.length)return {};
 const rows=await tmAll(env,'SELECT * FROM job_time_intervals WHERE shift_id IN (SELECT value FROM json_each(?))',JSON.stringify(ids)),users=[...new Set(shifts.map(s=>s.userId))],result={};
 for(const id of users)result[id]=attendanceAllocation(shifts.filter(s=>s.userId===id),rows.filter(r=>r.user_id===id).map(r=>timeIntervalDTO(r)),now);return result;
}
