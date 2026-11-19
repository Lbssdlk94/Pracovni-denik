import test from 'node:test';import assert from 'node:assert/strict';
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
