import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
import {attendanceLocal} from '../web/attendance-model.js';
const ctx={waitUntil:p=>p.catch(()=>{})};
async function setup(){const env=environment();const call=async(path,who=people.owner,method='GET',input)=>{const r=await api(request(path,who,method,input),env,ctx);return {status:r.status,...await r.json()};};await call('/api/me');await call('/api/invitations',people.owner,'POST',{email:people.worker.email,role:'worker'});await call('/api/me',people.worker);return {env,call};}
const month=()=>attendanceLocal(Date.now()).slice(0,7);
const punch=(id,kind,at,extra={})=>({mutationId:id,kind,at,gpsStatus:'disabled',...extra});
test('Standalone attendance breaks use the same ledger and shift, resume to unallocated, replay once',async()=>{
 const {env,call}=await setup(),at=Date.now()-3600000;
 let r=await call('/api/attendance/punch',people.worker,'POST',punch('arrival','arrival',at));assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.shift.startAt,at);
 const b={operationId:'pause',action:'break',at:at+1000,shiftId:r.shift.id,shiftVersion:r.shift.version,version:0};r=await call('/api/attendance/activities',people.worker,'POST',b);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.state.active.kind,'break');assert.equal(r.state.active.jobId,null);
 assert.equal((await call('/api/attendance/activities',people.worker,'POST',b)).replayed,true);
 r=await call('/api/attendance/activities',people.worker,'POST',{...b,operationId:'resume',action:'resume',at:at+600000,version:1});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.state.active,null);
 assert.equal(env.sqlite.prepare('SELECT count(*) n FROM jobs').get().n,0);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,1);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,1);
 r=await call('/api/attendance?month='+month()+'&userId='+people.worker.id+'&detail=1',people.worker);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.detail.activitySchema,1);assert.equal(r.detail.intervals.length,1);assert.equal(JSON.stringify(r.detail).includes('hourlyMinor'),false);
});
test('Pause, resume a job and departure never finish another worker or the global job',async()=>{
 const {env,call}=await setup(),at=Date.now()-3600000;
 await call('/api/jobs/a',people.owner,'PUT',{version:0,title:'A',assignedTo:people.worker.id,assignedTos:[people.worker.id,people.owner.id],status:'planned'});
 let r=await call('/api/jobs/a/time/actions',people.owner,'POST',{operationId:'work',action:'work',at,workers:[{userId:people.worker.id,version:0},{userId:people.owner.id,version:0}]});assert.equal(r.status,200,JSON.stringify(r));
 const s=env.sqlite.prepare('SELECT * FROM attendance_shifts WHERE user_id=?').get(people.worker.id),b={operationId:'pause-job',action:'break',at:at+1000,shiftId:s.id,shiftVersion:s.version,version:1};
 r=await call('/api/attendance/activities',people.worker,'POST',b);assert.equal(r.status,200,JSON.stringify(r));
 r=await call('/api/attendance/activities',people.worker,'POST',{...b,operationId:'resume-job',action:'resume',at:at+2000,version:2});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.state.active.jobId,'a');assert.equal(r.state.active.kind,'work');
 r=await call('/api/attendance/punch',people.worker,'POST',punch('departure','departure',at+3000,{shiftId:s.id,version:s.version}));assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.state.active,null);
 assert.equal(env.sqlite.prepare("SELECT status FROM jobs WHERE id='a'").get().status,'in_progress');assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals WHERE user_id=? AND end_at IS NULL').get(people.owner.id).n,1);
});
test('Detail enforces own attendance, filters category on server and hides inaccessible job metadata',async()=>{
 const {env,call}=await setup(),at=Date.now()-3600000;
 await call('/api/attendance/punch',people.worker,'POST',punch('shift','arrival',at));
 assert.equal((await call('/api/attendance?month='+month()+'&detail=1&userId=all',people.worker)).status,403);
 let r=await call('/api/attendance?month='+month()+'&detail=1&userId=all&discipline=garden');assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.detail.shifts.length,0);assert.equal(r.detail.people.length,0);
 await call('/api/jobs/secret',people.owner,'PUT',{version:0,title:'PRIVATE JOB',assignedTo:people.owner.id,status:'planned'});
 env.sqlite.prepare("INSERT INTO job_time_intervals(id,job_id,user_id,user_name,kind,start_at,end_at,shift_id,created_by,created_at,updated_by,updated_at) VALUES('old','secret',?,'Worker','work',?,?, 'shift',?,?,?,?)").run(people.worker.id,at,at+1000,people.worker.id,at,people.worker.id,at);
 r=await call('/api/attendance?month='+month()+'&detail=1',people.worker);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.detail.intervals[0].job,null);assert.equal(r.detail.intervals[0].jobId,null);assert.equal(JSON.stringify(r).includes('PRIVATE JOB'),false);
});
test('Stale activity version rolls back atomically; offline punches retain captured time and old records stay',async()=>{
 const {env,call}=await setup(),at=Date.now()-7200000;
 let r=await call('/api/attendance/punch',people.worker,'POST',punch('s','arrival',at));const s=r.shift;
 const b={operationId:'stale',action:'break',at:at+1000,shiftId:s.id,shiftVersion:s.version,version:10};assert.equal((await call('/api/attendance/activities',people.worker,'POST',b)).status,409);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,0);
 r=await call('/api/attendance/punch',people.worker,'POST',punch('out','departure',at+3600000,{shiftId:s.id,version:s.version}));assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.shift.endAt,at+3600000);assert.equal((await call('/api/attendance/punch',people.worker,'POST',punch('out','departure',at+3600000,{shiftId:s.id,version:s.version}))).replayed,true);
 const stored=env.sqlite.prepare('SELECT recorded_end_at,end_at FROM attendance_shifts').get();assert.ok(stored.recorded_end_at>stored.end_at);
});

test('0059 preserves populated 0058 data and restores overlap, shift and departure guards',async()=>{
 const {readFileSync}=await import('node:fs'),env=environment(':memory:',58);
 const call=async(path,method='GET',body)=>{const r=await api(request(path,people.owner,method,body),env,ctx);assert.equal(r.status,200,await r.clone().text());return r.json();};
 await call('/api/me');await call('/api/jobs/a','PUT',{version:0,title:'Preserved',assignedTo:people.owner.id,status:'planned'});
 await call('/api/jobs/a/time/actions','POST',{operationId:'existing-work',action:'work',at:Date.now()-60000,workers:[{userId:people.owner.id,version:0}]});
 const tables=['jobs','attendance_shifts','job_time_intervals','job_time_events','job_time_operations','job_time_states'],before=Object.fromEntries(tables.map(t=>[t,env.sqlite.prepare('SELECT * FROM '+t).all()]));
 env.sqlite.exec(readFileSync('drizzle/0059_attendance_activities.sql','utf8'));
 for(const t of tables)assert.deepEqual(env.sqlite.prepare('SELECT * FROM '+t).all(),before[t]);assert.deepEqual(env.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(env.sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'job_time_%'").get().n,9);
 const s=env.sqlite.prepare('SELECT * FROM attendance_shifts').get();const paused=await call('/api/attendance/activities','POST',{operationId:'p',action:'break',at:Date.now()-10000,shiftId:s.id,shiftVersion:s.version,version:1});assert.equal(paused.state.active.kind,'break');
 await call('/api/attendance/punch','POST',{mutationId:'close',kind:'departure',shiftId:s.id,version:s.version,gpsStatus:'disabled'});
 assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals WHERE end_at IS NULL').get().n,0);
 assert.ok(env.sqlite.prepare("SELECT count(*) n FROM job_time_events WHERE reason='Ukončení směny'").get().n>0);
});
test('A concurrent role revocation rolls back activity closure and audit operations',async()=>{
 const {env,call}=await setup(),at=Date.now()-60000;
 const r=await call('/api/attendance/punch',people.worker,'POST',punch('s','arrival',at));
 const batch=env.DB.batch;env.DB.batch=async statements=>{env.sqlite.prepare("UPDATE members SET role='reader' WHERE user_id=?").run(people.worker.id);env.DB.batch=batch;return batch(statements);};
 const result=await call('/api/attendance/activities',people.worker,'POST',{operationId:'revoked',action:'break',at:at+1000,shiftId:r.shift.id,shiftVersion:r.shift.version,version:0});assert.equal(result.status,409);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,0);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_time_operations').get().n,0);
});
test('Starting a job from a standalone break requires confirmation and closes exactly one prior interval',async()=>{
 const {env,call}=await setup(),at=Date.now()-3600000;
 const r=await call('/api/attendance/punch',people.worker,'POST',punch('shift','arrival',at));
 await call('/api/attendance/activities',people.worker,'POST',{operationId:'pause',action:'break',at:at+1000,shiftId:r.shift.id,shiftVersion:r.shift.version,version:0});
 await call('/api/jobs/a',people.owner,'PUT',{version:0,title:'A',assignedTo:people.worker.id,status:'planned'});
 const input={operationId:'start-job',action:'work',at:at+600000,workers:[{userId:people.worker.id,version:1}]};
 assert.equal((await call('/api/jobs/a/time/actions',people.worker,'POST',input)).status,409);
 const started=await call('/api/jobs/a/time/actions',people.worker,'POST',{...input,allowSwitch:true});assert.equal(started.status,200,JSON.stringify(started));
 assert.equal(env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,1);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals WHERE end_at IS NULL').get().n,1);assert.equal(env.sqlite.prepare("SELECT end_at FROM job_time_intervals WHERE job_id IS NULL").get().end_at,at+600000);
});
