import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
import {timeSummary,attendanceAllocation} from '../web/job-time-model.js';
const ctx={waitUntil:p=>p.catch(()=>{})};
async function setup(){const env=environment(),call=async(path,person=people.owner,method='GET',data)=>{const response=await api(request(path,person,method,data),env,ctx);return {status:response.status,...await response.json()};};
 await call('/api/me');for(const role of ['worker','admin','reader']){await call('/api/invitations',people.owner,'POST',{email:people[role].email,role});await call('/api/me',people[role]);}
 for(const id of ['a','b'])assert.equal((await call('/api/jobs/'+id,people.owner,'PUT',{version:0,title:id,assignedTo:people.worker.id,assignedTos:[people.worker.id,people.admin.id,people.owner.id],status:'planned'})).status,200);
 return {env,call,action:(id,person,body)=>call('/api/jobs/'+id+'/time/actions',person,'POST',body)};}
const worker=(role,version)=>({userId:people[role].id,version});
test('Individual transport, work, breaks, return and stop survive reload without finishing the job',async()=>{
 const f=await setup(),base=Date.now()-60000;
 let r=await f.action('a',people.worker,{operationId:'travel',action:'travel',at:base,workers:[worker('worker',0)]});assert.equal(r.status,200);assert.equal(r.states.find(s=>s.userId===people.worker.id).active.kind,'travel');
 for(const [i,kind] of ['work','break','work','stop','work','stop'].entries()){r=await f.action('a',people.worker,{operationId:'step-'+i,action:kind,at:base+(i+1)*1000,workers:[worker('worker',i+1)]});assert.equal(r.status,200,JSON.stringify(r));}
 const fresh=await f.call('/api/jobs/a/time',people.worker);assert.equal(fresh.intervals.length,5);assert.equal(fresh.job.status,'in_progress');assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,1);assert.equal(fresh.summary.total.workMs,3000);
 assert.equal((await f.call('/api/jobs/a',people.worker)).job.myTime.version,7);
});
test('Bulk operations are individual; stopping one and then the last worker never completes a job',async()=>{
 const f=await setup(),at=Date.now()-60000,workers=[worker('worker',0),worker('admin',0)];
 const input={operationId:'bulk-start',action:'work',at,workers};let r=await f.action('a',people.owner,input);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.intervals.length,2);
 assert.equal((await f.action('a',people.owner,input)).replayed,true);assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,2);
 r=await f.action('a',people.worker,{operationId:'own-stop',action:'stop',at:at+1000,workers:[worker('worker',1)]});assert.equal(r.status,200);assert.equal(r.states.find(s=>s.userId===people.admin.id).active.kind,'work');
 r=await f.action('a',people.owner,{operationId:'last-stop',action:'stop',at:at+2000,workers:[worker('admin',1)]});assert.equal(r.job.status,'in_progress');
});
test('Switching jobs requires explicit confirmation and closes exactly one previous interval',async()=>{
 const f=await setup(),at=Date.now()-60000;await f.action('a',people.worker,{operationId:'a-start',action:'work',at,workers:[worker('worker',0)]});
 const input={operationId:'b-start',action:'work',at:at+1000,workers:[worker('worker',1)]};let r=await f.action('b',people.worker,input);assert.equal(r.status,409);assert.equal(r.code,'job_time_switch');
 r=await f.action('b',people.worker,{...input,allowSwitch:true});assert.equal(r.status,200,JSON.stringify(r));assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals WHERE end_at IS NULL').get().n,1);assert.equal(f.env.sqlite.prepare("SELECT end_at FROM job_time_intervals WHERE job_id='a'").get().end_at,at+1000);
});
test('Workers cannot manage colleagues, see costs or operate unassigned jobs',async()=>{
 const f=await setup(),b={operationId:'denied',action:'work',at:Date.now()-1000,workers:[worker('admin',0)]};assert.equal((await f.action('a',people.worker,b)).status,403);
 assert.equal((await f.call('/api/jobs/a/time',people.reader)).status,404);
 let r=await f.call('/api/jobs/a/time/rates',people.owner,'PUT',{operationId:'rate',userId:people.worker.id,version:0,workMinor:50000,travelMinor:20000});assert.equal(r.status,200,JSON.stringify(r));
 r=await f.action('a',people.worker,{...b,operationId:'own',workers:[worker('worker',0)]});assert.equal(r.status,200);assert.equal(JSON.stringify(r).includes('hourlyMinor'),false);assert.equal('rates' in r,false);assert.equal('workCostMinor' in r.summary.total,false);
 assert.equal((await f.call('/api/jobs/a/time/rates',people.worker,'PUT',{operationId:'rate-hack',userId:people.worker.id,version:1,workMinor:1,travelMinor:1})).status,403);
});
test('Compare-and-swap rejects a concurrent device before any partial attendance or time writes',async()=>{
 const f=await setup(),batch=f.env.DB.batch;f.env.DB.batch=async statements=>{f.env.sqlite.prepare('INSERT INTO job_time_states(user_id,version) VALUES(?,1)').run(people.worker.id);f.env.DB.batch=batch;return batch(statements);};
 const r=await f.action('a',people.worker,{operationId:'race',action:'work',at:Date.now()-1000,workers:[worker('worker',0)]});assert.equal(r.status,409,JSON.stringify(r));assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,0);assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,0);
});
test('Attendance punch closes the linked active interval and preserves global job status',async()=>{
 const f=await setup();let r=await f.action('a',people.worker,{operationId:'start',action:'work',at:Date.now()-60000,workers:[worker('worker',0)]});const shift=f.env.sqlite.prepare('SELECT * FROM attendance_shifts').get();
 r=await f.call('/api/attendance/punch',people.worker,'POST',{mutationId:'departure',kind:'departure',shiftId:shift.id,version:shift.version,gpsStatus:'unavailable'});assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals WHERE end_at IS NULL').get().n,0);assert.equal((await f.call('/api/jobs/a',people.worker)).job.status,'in_progress');
});
test('Three workers over three days total 62 person hours; transport and breaks stay separate',()=>{
 const rows=[],hours=[[8,3,8],[8,8,8],[8,3,8]],base=Date.UTC(2026,10,10,7);
 hours.forEach((days,user)=>days.forEach((h,day)=>rows.push({userId:String(user),userName:String(user),kind:'work',startAt:base+day*86400000,endAt:base+day*86400000+h*3600000,hourlyMinor:50000})));
 rows.push({userId:'0',kind:'travel',startAt:base-3600000,endAt:base,hourlyMinor:10000});
 const result=timeSummary(rows,base+4*86400000,true);assert.equal(result.total.workMs/3600000,62);assert.deepEqual(result.workers.map(w=>w.workMs/3600000),[19,24,19]);assert.equal(result.total.travelMs/3600000,1);assert.equal(result.total.workCostMinor,3100000);
 assert.equal(timeSummary(rows,base+4*86400000,false).total.workCostMinor,undefined);
});
test('Attendance allocations do not add job hours a second time and handle midnight/DST',()=>{
 const start=Date.parse('2026-10-24T22:00:00Z'),end=Date.parse('2026-10-25T23:00:00Z'),rows=[{userId:'one',kind:'work',startAt:start,endAt:end}],summary=timeSummary(rows,end);
 assert.equal(summary.days.length,1);assert.equal(summary.total.workMs/3600000,25);
 const split=attendanceAllocation([{startAt:0,endAt:3600000}],[{kind:'work',startAt:0,endAt:1800000},{kind:'travel',startAt:1800000,endAt:2700000}],3600000);assert.equal(split.attendanceMs,3600000);assert.equal(split.workMs,1800000);assert.equal(split.unallocatedMs,900000);
});

test('Stale global status never closes an interval, and completion cannot stop a colleague',async()=>{
 const f=await setup(),at=Date.now()-60000;
 await f.action('a',people.owner,{operationId:'two-start',action:'work',at,workers:[worker('worker',0),worker('admin',0)]});
 const job=(await f.call('/api/jobs/a')).job;
 assert.equal((await f.call('/api/jobs/a/status',people.worker,'PATCH',{version:job.version-1,status:'done'})).status,409);
 assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals WHERE end_at IS NULL').get().n,2);
 assert.equal((await f.call('/api/jobs/a/status',people.worker,'PATCH',{version:job.version,status:'done'})).status,409);
 assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_operations').get().n,1);
 await f.action('a',people.admin,{operationId:'admin-stop',action:'stop',at:at+1000,workers:[worker('admin',1)]});
 const result=await f.call('/api/jobs/a/status',people.worker,'PATCH',{version:job.version,status:'done'});assert.equal(result.status,200,JSON.stringify(result));
 assert.equal(result.job.status,'done');assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals WHERE end_at IS NULL').get().n,0);
});
test('An installed client without time support retains its old flow and does not silently start timers',async()=>{
 const f=await setup(),old=async(path,method='GET',body)=>{const req=request(path,people.worker,method,body);req.headers.delete('x-work-time-client');const r=await api(req,f.env,ctx);return {status:r.status,...await r.json()};};
 const job=(await old('/api/jobs/a')).job;assert.equal('myTime' in job,false);
 assert.equal((await old('/api/jobs/a/status','PATCH',{version:job.version,status:'in_progress'})).status,200);
 assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,0);
 assert.equal((await f.call('/api/jobs/a',people.worker)).job.myTime.version,0);
});
test('A job lead can add and operate the assigned crew but cannot change costs or company roles',async()=>{
 const f=await setup();let r=await f.call('/api/jobs/a/time/lead',people.owner,'PUT',{operationId:'lead',userId:people.worker.id,version:0});assert.equal(r.status,200,JSON.stringify(r));
 const extra={id:'new-worker',email:'new-worker@example.com'};await f.call('/api/invitations',people.owner,'POST',{email:extra.email,role:'worker'});await f.call('/api/me',extra);
 r=await f.call('/api/jobs/a/time/assign',people.worker,'POST',{operationId:'add-person',jobVersion:r.job.version,userIds:[extra.id]});assert.equal(r.status,200,JSON.stringify(r));assert.ok(r.job.assignedTos.includes(extra.id));
 r=await f.action('a',people.worker,{operationId:'lead-bulk',action:'work',at:Date.now()-1000,workers:[worker('worker',0),{userId:extra.id,version:0}]});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.intervals.length,2);assert.equal(r.canManage,true);assert.equal('rates' in r,false);
 assert.equal((await f.call('/api/jobs/a/time/lead',people.worker,'PUT',{operationId:'lead-hack',userId:extra.id,version:1})).status,403);
 assert.equal((await f.call('/api/jobs/a/time/rates',people.worker,'PUT',{operationId:'cost-hack',userId:extra.id,version:0,workMinor:1,travelMinor:1})).status,403);
});
test('Bulk move assigns the target with existing handoff rules and closes only the selected intervals',async()=>{
 const f=await setup(),at=Date.now()-60000;await f.action('a',people.owner,{operationId:'source',action:'work',at,workers:[worker('worker',0),worker('admin',0)]});
 f.env.sqlite.prepare("UPDATE jobs SET assigned_to=?,assigned_users='[]' WHERE id='b'").run(people.owner.id);
 const r=await f.action('a',people.owner,{operationId:'move',action:'move',targetJobId:'b',allowSwitch:true,at:at+2000,workers:[worker('worker',1)]});assert.equal(r.status,200,JSON.stringify(r));
 const active=f.env.sqlite.prepare('SELECT user_id,job_id FROM job_time_intervals WHERE end_at IS NULL ORDER BY user_id').all();assert.deepEqual(active.map(v=>[v.user_id,v.job_id]),[[people.admin.id,'a'],[people.worker.id,'b']]);
 const target=(await f.call('/api/jobs/b',people.worker)).job;assert.ok(target.assignedTos.includes(people.worker.id));assert.equal(target.status,'in_progress');assert.equal(r.job.status,'in_progress');
});
test('Approval reuses attendance, preserves original values and historical rates, and sends idempotent review notices',async()=>{
 const f=await setup(),at=Date.now()-7200000;
 assert.equal((await f.call('/api/jobs/a/time/rates',people.owner,'PUT',{operationId:'initial-rate',userId:people.worker.id,version:0,workMinor:50000,travelMinor:20000})).status,200);
 await f.action('a',people.worker,{operationId:'cost-work',action:'work',at,workers:[worker('worker',0)]});
 await f.action('a',people.worker,{operationId:'cost-stop',action:'stop',at:at+3600000,workers:[worker('worker',1)]});
 await f.call('/api/jobs/a/time/rates',people.owner,'PUT',{operationId:'new-rate',userId:people.worker.id,version:1,workMinor:90000,travelMinor:null});
 const row=(await f.call('/api/jobs/a/time')).intervals[0];assert.equal(row.hourlyMinor,50000);
 const proposal={operationId:'fix-hours',intervalId:row.id,userId:people.worker.id,version:row.version,kind:'work',startAt:row.startAt,endAt:row.endAt+1800000,reason:'Oprava odchodu podle skutečné návštěvy'};
 let r=await f.call('/api/jobs/a/time/proposals',people.worker,'POST',proposal);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.intervals[0].endAt,row.endAt);assert.equal(f.env.sqlite.prepare("SELECT count(*) n FROM notifications WHERE kind='job_time_request'").get().n,2);
 const approval={operationId:'approval',decision:'approve'};r=await f.call('/api/jobs/a/time/reviews/fix-hours',people.owner,'POST',approval);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.intervals[0].approval,'approved');assert.equal(r.intervals[0].hourlyMinor,50000);assert.equal(r.summary.total.workCostMinor,75000);
 assert.ok(r.history.some(e=>e.before_value&&JSON.parse(e.before_value).endAt===row.endAt));
 assert.equal((await f.call('/api/jobs/a/time/reviews/fix-hours',people.owner,'POST',approval)).replayed,true);assert.equal(f.env.sqlite.prepare("SELECT count(*) n FROM notifications WHERE kind='job_time_review'").get().n,1);
 const n=await f.call('/api/notifications',people.worker);assert.equal(n.status,200,JSON.stringify(n));assert.ok(n.notifications.some(v=>v.kind==='job_time_review'));
 const shift=f.env.sqlite.prepare('SELECT * FROM attendance_shifts').get();assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,1);
 assert.throws(()=>f.env.sqlite.prepare('UPDATE attendance_shifts SET end_at=? WHERE id=?').run(at+1000,shift.id),/job_time_attendance_has_allocations/);
 const missing={...proposal,operationId:'missing-shift',intervalId:'new-manual',version:0,startAt:at-7200000,endAt:at-3600000};assert.equal((await f.call('/api/jobs/a/time/proposals',people.worker,'POST',missing)).status,409);
});
test('A concurrent role or job closure rejects the whole time transaction before creating attendance',async()=>{
 for(const change of ["UPDATE members SET role='reader' WHERE user_id='worker-id'","UPDATE jobs SET status='done' WHERE id='a'"]){
  const f=await setup(),batch=f.env.DB.batch;f.env.DB.batch=async statements=>{f.env.sqlite.exec(change);f.env.DB.batch=batch;return batch(statements);};
  const r=await f.action('a',people.worker,{operationId:'concurrent-grant',action:'work',at:Date.now()-1000,workers:[worker('worker',0)]});assert.equal(r.status,409,JSON.stringify(r));assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,0);assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_operations').get().n,0);
 }
});
test('Garden/Závlaha assignment and read-only workspace restrictions are checked by the server',async()=>{
 const f=await setup(),s=f.env.sqlite,inst=s.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").get().instance_id;
 s.exec("INSERT INTO workspaces VALUES('pair','preparing',1,1,1)");s.prepare("INSERT INTO workspace_organizations VALUES('source-org','pair',?,'irrigation','Test')").run(inst);s.prepare("INSERT INTO workspace_organizations VALUES('garden-org','pair','inst-test-garden','garden','Garden')").run();
 for(const role of ['owner','worker','admin','reader']){const p=s.prepare('SELECT * FROM members WHERE user_id=?').get(people[role].id);s.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,?, 'original')").run(inst,p.user_id,p.user_id,p.role,p.email,p.name,people.owner.id,1);s.prepare("INSERT INTO workspace_member_grants VALUES(?,'source-org',?)").run(p.user_id,p.role);s.prepare('INSERT INTO member_disciplines VALUES(?,?)').run(p.user_id,role==='worker'?'garden':'irrigation');}
 s.exec("UPDATE jobs SET discipline='irrigation';UPDATE workspaces SET state='active'");await f.call('/api/me');
 assert.equal((await f.call('/api/jobs/a/time',people.worker)).status,404);assert.equal((await f.action('a',people.worker,{operationId:'wrong-team',action:'work',at:Date.now()-1000,workers:[worker('worker',0)]})).status,404);
 assert.equal((await f.action('a',people.owner,{operationId:'bulk-wrong-team',action:'work',at:Date.now()-1000,workers:[worker('worker',0)]})).status,409);
 s.prepare("INSERT INTO member_disciplines VALUES(?,'irrigation')").run(people.worker.id);assert.equal((await f.call('/api/jobs/a/time',people.worker)).status,200);
 s.exec("UPDATE workspaces SET state='read_only'");assert.equal((await f.action('a',people.worker,{operationId:'read-only',action:'work',at:Date.now()-1000,workers:[worker('worker',0)]})).status,409);
 assert.equal(s.prepare('SELECT count(*) n FROM job_time_intervals').get().n,0);
});

test('A manager reduction during a private time read fails closed before serializing costs or audit data',async()=>{
 const f=await setup(),prepare=f.env.DB.prepare;
 const wrap=statement=>({ ...statement,bind(...args){return wrap(statement.bind(...args));},async all(){const value=await statement.all();f.env.sqlite.prepare("UPDATE members SET role='worker' WHERE user_id=?").run(people.admin.id);return value;}});
 f.env.DB.prepare=sql=>sql.startsWith('SELECT * FROM job_time_rates WHERE user_id IN')?wrap(prepare(sql)):prepare(sql);
 const r=await f.call('/api/jobs/a/time',people.admin);assert.equal(r.status,403,JSON.stringify(r));assert.equal('rates' in r,false);assert.equal('history' in r,false);assert.equal('summary' in r,false);
});


test('Applying 0057 to a populated 0056 database preserves original records and does not invent historical hours',async()=>{
 const env=environment(':memory:',56),call=async(path,method='GET',body)=>{const req=request(path,people.owner,method,body);req.headers.delete('x-work-time-client');const r=await api(req,env,ctx);assert.equal(r.status,200,await r.clone().text());return r.json();};
 await call('/api/me');await call('/api/customers/original','PUT',{version:0,name:'Zachovaný zákazník',phones:[],addresses:[{id:'original-address',address:'Původní 123',city:'Blatná'}]});
 await call('/api/jobs/original','PUT',{version:0,title:'Zachovaná zakázka',assignedTo:people.owner.id,customerId:'original',status:'in_progress'});
 await call('/api/attendance/punch','POST',{mutationId:'existing-shift',kind:'arrival',gpsStatus:'unavailable'});
 const tables=['members','customers','gardens','jobs','attendance_shifts','attendance_corrections','notifications'],before=Object.fromEntries(tables.map(table=>[table,env.sqlite.prepare('SELECT * FROM '+table).all()]));
 env.sqlite.exec(readFileSync('drizzle/0057_job_person_hours.sql','utf8'));
 for(const table of tables)assert.deepEqual(env.sqlite.prepare('SELECT * FROM '+table).all(),before[table],table+' must be unchanged');
 assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,0);assert.deepEqual(env.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 const r=await api(request('/api/jobs/original/time',people.owner),env,ctx);assert.equal(r.status,200);assert.equal((await r.json()).intervals.length,0);
});
