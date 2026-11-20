import {attendanceDayBounds,attendanceMonthBounds,attendanceInstant,attendanceLocal} from '../web/attendance-model.js';
import {timeIntervalDTO,timeState,timeBatch,timeJob} from './job-time.js';
import {workspaceJobScope} from './workspace-policy.js';
import {subHash} from './subscriptions.js';
const attendanceManagers=['owner','administrator','admin'],attendanceWriters=[...attendanceManagers,'worker'];
const attendanceOne=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const attendanceAll=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results;

// Optional read-only extension. No rates or inaccessible job metadata leave the server.
export async function attendanceDetail(env,m,month,userId,discipline,fail){
 if(!['all','irrigation','garden','both'].includes(discipline))fail(400,'Vyberte platnou kategorii.');
 const manager=attendanceManagers.includes(m.role),now=Date.now(),bounds=attendanceMonthBounds(month),today=attendanceDayBounds(now);
 const [year,mon,day]=attendanceLocal(now).slice(0,10).split('-').map(Number),weekday=new Date(Date.UTC(year,mon-1,day)).getUTCDay();
 const monday=new Date(Date.UTC(year,mon-1,day-(weekday+6)%7)).toISOString().slice(0,10),recent={start:attendanceInstant(monday+'T00:00')};
 const members=await attendanceAll(env,'SELECT user_id AS id,name,role FROM members ORDER BY name'),grants=await attendanceAll(env,'SELECT user_id,discipline FROM member_disciplines');
 const matches=id=>discipline==='all'||(discipline==='both'?['irrigation','garden'].every(d=>grants.some(g=>g.user_id===id&&g.discipline===d)):grants.some(g=>g.user_id===id&&g.discipline===discipline));
 if(!manager&&(!matches(m.user_id)||userId!==m.user_id))fail(403,'Tato docházka není dostupná.');
 const people=members.filter(p=>(manager||p.id===m.user_id)&&(userId==='all'||userId===p.id)&&matches(p.id));
 if(manager&&discipline==='all')for(const p of await attendanceAll(env,'SELECT user_id AS id,user_name AS name FROM attendance_shifts WHERE deleted_at IS NULL GROUP BY user_id'))if((userId==='all'||userId===p.id)&&!people.some(x=>x.id===p.id))people.push(p);
 const ids=people.map(p=>p.id),rows=ids.length?await attendanceAll(env,'SELECT * FROM attendance_shifts WHERE deleted_at IS NULL AND user_id IN(SELECT value FROM json_each(?)) AND ((start_at<? AND (end_at IS NULL OR end_at>?)) OR (start_at<? AND (end_at IS NULL OR end_at>?))) ORDER BY start_at DESC',JSON.stringify(ids),bounds.end,bounds.start,today.end,recent.start):[];
 const ownRows=await attendanceAll(env,'SELECT * FROM attendance_shifts WHERE user_id=? AND deleted_at IS NULL AND start_at<? AND (end_at IS NULL OR end_at>?)',m.user_id,today.end,recent.start);
 const raw=await attendanceAll(env,'SELECT * FROM job_time_intervals WHERE shift_id IN(SELECT value FROM json_each(?)) ORDER BY start_at,id',JSON.stringify([...new Set([...rows,...ownRows].map(s=>s.id))]));
 const jobs=await attendanceAll(env,`SELECT j.id,j.title,j.customer_name AS customerName,j.status,j.discipline,j.version FROM jobs j WHERE j.id IN(SELECT value FROM json_each(?)) AND j.deleted=0 AND ${workspaceJobScope()}`,JSON.stringify([...new Set(raw.map(i=>i.job_id).filter(Boolean))]),m.user_id),byJob=new Map(jobs.map(j=>[j.id,j]));
 const intervals=raw.map(r=>{const j=byJob.get(r.job_id);return {...timeIntervalDTO(r),jobId:j?r.job_id:null,recordedJob:r.job_id!==null,job:j||null};});
 const shift=r=>({id:r.id,userId:r.user_id,userName:r.user_name,startAt:r.start_at,endAt:r.end_at,version:r.version,corrected:!!r.last_correction_id,startGpsStatus:r.start_gps_status,endGpsStatus:r.end_gps_status});
 const versions=await attendanceAll(env,'SELECT user_id,version FROM job_time_states WHERE user_id IN(SELECT value FROM json_each(?))',JSON.stringify([...new Set([...ids,m.user_id])]));
 const stateFor=id=>{const row=raw.find(r=>r.user_id===id&&r.end_at===null);let active=row?timeIntervalDTO(row):null;if(active?.jobId&&!byJob.has(active.jobId))active=id===m.user_id?{...active,jobId:null,recordedJob:true}:{jobId:'unavailable',kind:'other'};return {userId:id,version:versions.find(v=>v.user_id===id)?.version||0,active};};
 const selectedShiftIds=JSON.stringify([...new Set(rows.map(s=>s.id))]);
 const corrections=ids.length?await attendanceAll(env,"SELECT * FROM attendance_corrections WHERE user_id IN(SELECT value FROM json_each(?)) AND (status='pending' OR shift_id IN(SELECT value FROM json_each(?))) ORDER BY created_at DESC",JSON.stringify(ids),selectedShiftIds):[];
 return {activitySchema:1,asOf:now,people:people.map(p=>({id:p.id,name:p.name,disciplines:grants.filter(g=>g.user_id===p.id).map(g=>g.discipline)})),shifts:rows.filter(s=>s.start_at<bounds.end&&(s.end_at==null||s.end_at>bounds.start)).map(shift),intervals:intervals.filter(i=>ids.includes(i.userId)),states:people.map(p=>stateFor(p.id)),corrections:corrections.map(c=>({id:c.id,kind:c.kind,shiftId:c.shift_id,userId:c.user_id,userName:c.user_name,status:c.status,reason:c.reason,oldStartAt:c.old_start_at,oldEndAt:c.old_end_at,startAt:c.proposed_start_at,endAt:c.proposed_end_at,createdBy:c.created_by,createdAt:c.created_at,reviewedBy:c.reviewed_by,reviewedAt:c.reviewed_at,reviewNote:c.review_note,baseVersion:c.base_version})),recentShifts:rows.map(shift),todayShifts:rows.filter(s=>s.start_at<today.end&&(s.end_at==null||s.end_at>today.start)).map(shift),ownToday:{shifts:ownRows.map(shift),intervals:intervals.filter(i=>i.userId===m.user_id),state:stateFor(m.user_id)}};
}

// Same interval ledger, concurrency version and audit log. Empty audit job_id
// denotes an attendance activity; no dummy job or parallel timer is created.
export async function attendancePublicIntervals(env,m,rows){
 const ids=[...new Set(rows.map(r=>r.job_id).filter(Boolean))];
 const allowed=new Set(ids.length?(await attendanceAll(env,`SELECT j.id FROM jobs j WHERE j.id IN(SELECT value FROM json_each(?)) AND j.deleted=0 AND ${workspaceJobScope()}`,JSON.stringify(ids),m.user_id)).map(j=>j.id):[]);
 return rows.map(r=>({...timeIntervalDTO(r),jobId:allowed.has(r.job_id)?r.job_id:null,recordedJob:r.job_id!==null}));
}
export async function attendanceOwnState(env,m){
 const state=await timeState(env,m.user_id);
 if(state.active?.jobId&&!await attendanceOne(env,`SELECT j.id FROM jobs j WHERE j.id=? AND j.deleted=0 AND ${workspaceJobScope()}`,state.active.jobId,m.user_id))state.active={...state.active,jobId:null,recordedJob:true};
 return state;
}
export async function attendanceActivity(env,m,input,fail){
 if(!attendanceWriters.includes(m.role))fail(403,'Pracovní dobu zapisuje pracovník nebo správce.');
 const {operationId,action,at,shiftId,shiftVersion,version}=input;
 if(!/^[-\w]{1,100}$/.test(operationId)||!/^[-\w]{1,100}$/.test(shiftId)||!['break','other','stop','resume'].includes(action)||!Number.isSafeInteger(version)||!Number.isSafeInteger(shiftVersion))fail(400,'Obnovte pracovní stav a vyberte platnou akci.');
 const hash=await subHash(JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b))))),existing=await attendanceOne(env,'SELECT * FROM job_time_operations WHERE id=?',operationId);
 const response=async()=>({state:await attendanceOwnState(env,m),intervals:await attendancePublicIntervals(env,m,await attendanceAll(env,'SELECT * FROM job_time_intervals WHERE user_id=? AND (id=? OR id IN(SELECT interval_id FROM job_time_events WHERE operation_id=?))',m.user_id,operationId+'_interval',operationId))});
 if(existing){if(existing.job_id!==''||existing.actor_id!==m.user_id||existing.hash!==hash)fail(409,'Tento identifikátor již patří jiné změně.');return {...await response(),replayed:true};}
 const now=Date.now();if(!Number.isSafeInteger(at)||at<now-86400000||at>now+120000)fail(400,'Zachovejte původní čas, nejvýše 24 hodin starý. Starší změnu řešte opravou.');
 const shift=await attendanceOne(env,'SELECT * FROM attendance_shifts WHERE id=? AND user_id=? AND deleted_at IS NULL AND end_at IS NULL',shiftId,m.user_id),state=await timeState(env,m.user_id);
 if(!shift||shift.version!==shiftVersion||state.version!==version||at<shift.start_at||state.active&&at<=state.active.startAt)fail(409,'Směna nebo pracovní stav se změnil. Obnovte údaje.');
 if(action==='stop'&&!['break','other'].includes(state.active?.kind)||action==='break'&&state.active?.kind==='break')fail(409,'Stav přestávky se změnil. Obnovte údaje.');
 let kind=action==='stop'?null:action,jobId=action==='break'?state.active?.jobId||null:null,target=null;
 if(action==='resume'){
  if(state.active?.kind!=='break')fail(409,'Přestávka již není otevřená.');
  const prior=await attendanceOne(env,'SELECT * FROM job_time_intervals WHERE user_id=? AND shift_id=? AND end_at=? ORDER BY start_at DESC LIMIT 1',m.user_id,shiftId,state.active.startAt);
  kind=prior&&prior.kind!=='break'?prior.kind:null;jobId=prior?.job_id||null;
  if(jobId){target=await timeJob(env,m,jobId,fail);if(!['planned','on_way','in_progress'].includes(target.status)||target.service_approval!=='confirmed')fail(409,'Předchozí zakázka není aktivní. Ukončete přestávku bez obnovení zakázky.');}
 }
 const gate=`EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ('owner','administrator','admin','worker')) AND NOT EXISTS(SELECT 1 FROM workspaces WHERE state<>'active') AND EXISTS(SELECT 1 FROM attendance_shifts WHERE id=? AND user_id=? AND version=? AND end_at IS NULL AND deleted_at IS NULL) AND COALESCE((SELECT version FROM job_time_states WHERE user_id=?),0)=?`;
 const statements=[env.DB.prepare(`INSERT INTO job_time_operations(id,job_id,actor_id,hash,action,payload,created_at,valid) VALUES(?,'',?,?,?,?,?,CASE WHEN ${gate}${target?` AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=? AND j.version=? AND j.status IN ('planned','on_way','in_progress') AND j.deleted=0 AND j.service_approval='confirmed' AND ${workspaceJobScope()})`:''} THEN 1 ELSE 0 END)`).bind(operationId,m.user_id,hash,'attendance-'+action,JSON.stringify(input),now,m.user_id,shiftId,m.user_id,shiftVersion,m.user_id,version,...(target?[target.id,target.version,m.user_id]:[]))];
 if(state.active){statements.push(env.DB.prepare('INSERT INTO job_time_events(id,job_id,interval_id,actor_id,at,operation_id,before_value,after_value,reason) VALUES(?,?,?,?,?,?,?,?,?)').bind(operationId+'_close',state.active.jobId||'',state.active.id,m.user_id,now,operationId,JSON.stringify(state.active),JSON.stringify({...state.active,endAt:at}),'Přestávka nebo změna činnosti v docházce'));statements.push(env.DB.prepare('UPDATE job_time_intervals SET end_at=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND end_at IS NULL').bind(at,m.user_id,now,state.active.id));}
 const rate=target&&['work','travel'].includes(kind)?await attendanceOne(env,'SELECT * FROM job_time_rates WHERE user_id=?',m.user_id):null;
 const hourly=kind==='work'?rate?.work_minor:kind==='travel'?rate?.travel_minor:null;
 if(kind){statements.push(env.DB.prepare('INSERT INTO job_time_intervals(id,job_id,user_id,user_name,kind,start_at,shift_id,hourly_minor,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(operationId+'_interval',jobId,m.user_id,m.name,kind,at,shiftId,hourly??null,m.user_id,now,m.user_id,now));statements.push(env.DB.prepare('INSERT INTO job_time_events(id,job_id,interval_id,actor_id,at,operation_id,after_value,reason) VALUES(?,?,?,?,?,?,?,?)').bind(operationId+'_open',jobId||'',operationId+'_interval',m.user_id,now,operationId,JSON.stringify({kind,jobId,startAt:at}),'Zahájení činnosti v docházce'));}
 if(target&&['work','travel'].includes(kind))statements.push(env.DB.prepare("UPDATE jobs SET status=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND status IN ('planned','on_way')").bind(kind==='work'?'in_progress':'on_way',m.user_id,now,target.id));
 statements.push(env.DB.prepare('INSERT INTO job_time_states(user_id,version) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1').bind(m.user_id));
 await timeBatch(env,statements,fail);return response();
}
