import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {attendanceDayBounds} from '../web/attendance-model.js';
const ctx={waitUntil:p=>p.catch(()=>{})};
async function setup(){
 const env=environment();
 const call=async(path,person=people.owner,method='GET',body)=>{const r=await api(request(path,person,method,body),env,ctx);return {http:r.status,...await r.json()};};
 await call('/api/me');
 for(const role of ['worker','admin','reader']){await call('/api/invitations',people.owner,'POST',{email:people[role].email,role});await call('/api/me',people[role]);}
 const day=attendanceDayBounds(Date.now()).date;
 for(const id of ['work','other'])assert.equal((await call('/api/jobs/'+id,people.owner,'PUT',{version:0,title:id,jobType:'installation',dueDate:day,assignedTo:people.worker.id,assignedTos:[people.worker.id,people.admin.id,people.owner.id],status:'planned'})).http,200);
 return {env,call,day};
}
test('Company projection uses actual intervals; personal projection never counts colleagues as my hours',async()=>{
 const f=await setup(),at=Date.now()-60000;
 const start=await f.call('/api/jobs/work/time/actions',people.owner,'POST',{operationId:'start-both',action:'work',at,workers:[{userId:people.worker.id,version:0},{userId:people.admin.id,version:0}]});assert.equal(start.http,200,JSON.stringify(start));
 const company=await f.call('/api/overview?mode=company');assert.equal(company.http,200,JSON.stringify(company));assert.equal(company.people.length,3);assert.equal(company.stats.workersInWork,2);assert.equal(company.stats.workersTotal,3);assert.equal(company.stats.inProgress,1);assert.ok(company.stats.todayWorkMs>=120000);assert.equal(company.activeJobs[0].time.activeCount,2);assert.equal(company.unread>=0,true);
 const own=await f.call('/api/overview?mode=personal',people.worker);assert.equal(own.http,200,JSON.stringify(own));assert.deepEqual(own.people,[]);assert.equal(own.currentJob.id,'work');assert.equal(own.timeSnapshot.states.find(s=>s.userId===people.worker.id).active.kind,'work');assert.ok(own.stats.todayWorkMs>=60000&&own.stats.todayWorkMs<company.stats.todayWorkMs);assert.equal(JSON.stringify(own).includes('hourlyMinor'),false);
});
test('Worker cannot request company data or discover an unassigned job using dashboard filters',async()=>{
 const f=await setup();
 assert.equal((await f.call('/api/overview?mode=company',people.worker)).http,403);
 assert.equal((await f.call('/api/overview?mode=company',people.reader)).http,403);
 assert.equal((await f.call('/api/jobs/private',people.owner,'PUT',{version:0,title:'secret',jobType:'installation',assignedTo:people.owner.id,status:'planned'})).http,200);
 const own=await f.call('/api/overview?mode=personal',people.worker);assert.equal(own.http,200);assert.equal(JSON.stringify(own).includes('secret'),false);
 assert.equal((await f.call('/api/overview?mode=bad')).http,400);
 assert.equal((await f.call('/api/overview?discipline=invalid')).http,400);
});
test('Attention count and the existing filtered list agree, and stopping one person preserves the job',async()=>{
 const f=await setup(),at=Date.now()-60000;
 await f.call('/api/jobs/work/time/actions',people.worker,'POST',{operationId:'begin',action:'work',at,workers:[{userId:people.worker.id,version:0}]});
 const snapshot=await f.call('/api/overview?mode=personal',people.worker);
 for(const item of snapshot.attention.filter(a=>a.kind==='jobs')){const list=await f.call('/api/jobs?state=all&attention='+item.filter,people.worker);assert.equal(list.http,200,JSON.stringify(list));assert.equal(list.jobs.length,item.count);}
 await f.call('/api/jobs/work/time/actions',people.worker,'POST',{operationId:'end',action:'stop',at:at+1000,workers:[{userId:people.worker.id,version:1}]});
 const after=await f.call('/api/overview?mode=personal',people.worker);assert.equal(after.currentJob,null);assert.equal((await f.call('/api/jobs/work',people.worker)).job.status,'in_progress');
});
test('Dashboard has no synthetic shifts, reports or attendance writes and preserves empty values',async()=>{
 const f=await setup(),before=f.env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n;
 const r=await f.call('/api/overview?mode=personal',people.worker);assert.equal(r.http,200);assert.equal(r.attendance.activeShift,null);assert.deepEqual(r.attendance.shifts,[]);assert.equal(r.stats.todayWorkMs,0);assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,before);
});

test('A shared-directory worker cannot cross Garden/Závlaha; manager discipline filters apply to counts and staff',async()=>{
 const f=await setup(),s=f.env.sqlite,inst=s.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").get().instance_id;
 s.exec("INSERT INTO workspaces VALUES('pair','preparing',1,1,1)");
 s.prepare("INSERT INTO workspace_organizations VALUES('source-org','pair',?,'irrigation','Test')").run(inst);
 s.prepare("INSERT INTO workspace_organizations VALUES('garden-org','pair','inst-test-garden','garden','Garden')").run();
 for(const role of ['owner','worker','admin','reader']){const p=s.prepare('SELECT * FROM members WHERE user_id=?').get(people[role].id);s.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,?, 'original')").run(inst,p.user_id,p.user_id,p.role,p.email,p.name,people.owner.id,1);s.prepare("INSERT INTO workspace_member_grants VALUES(?,'source-org',?)").run(p.user_id,p.role);s.prepare('INSERT INTO member_disciplines VALUES(?,?)').run(p.user_id,role==='worker'?'garden':'irrigation');}
 s.exec("UPDATE jobs SET discipline=CASE id WHEN 'work' THEN 'irrigation' ELSE 'garden' END;UPDATE workspaces SET state='active'");await f.call('/api/me');
 const own=await f.call('/api/overview?mode=personal&discipline=garden',people.worker);assert.equal(own.http,200,JSON.stringify(own));assert.deepEqual(own.todayJobs.map(j=>j.id),['other']);assert.equal(JSON.stringify(own).includes('hourlyMinor'),false);
 const denied=await f.call('/api/overview?mode=personal&discipline=irrigation',people.worker);assert.equal(denied.http,403,JSON.stringify(denied));
 const company=await f.call('/api/overview?mode=company&discipline=irrigation');assert.equal(company.http,200,JSON.stringify(company));assert.deepEqual(company.todayJobs.map(j=>j.id),['work']);assert.equal(company.people.some(p=>p.id===people.worker.id),false);
});
test('A role reduction during aggregation denies the whole response',async()=>{
 const f=await setup(),prepare=f.env.DB.prepare;
 const wrap=statement=>({...statement,bind(...args){return wrap(statement.bind(...args));},async all(){const value=await statement.all();f.env.sqlite.prepare("UPDATE members SET role='worker' WHERE user_id=?").run(people.admin.id);return value;}});
 f.env.DB.prepare=sql=>sql.startsWith('SELECT p.user_id AS id,p.name,p.role FROM members')?wrap(prepare(sql)):prepare(sql);
 const result=await f.call('/api/overview?mode=company',people.admin);assert.equal(result.http,403,JSON.stringify(result));assert.equal(result.people,undefined);assert.equal(result.stats,undefined);
});

test('A large day retains exact totals while returning a bounded mobile timeline',async t=>{
 const f=await setup();
 for(let index=0;index<300;index++){
  const r=await f.call('/api/jobs/load-'+index,people.owner,'PUT',{version:0,title:'Zkušební zakázka '+index,jobType:'installation',dueDate:f.day,assignedTo:people.worker.id,status:'planned'});assert.equal(r.http,200);
 }
 const started=performance.now(),r=await f.call('/api/overview?mode=company'),elapsed=performance.now()-started;
 assert.equal(r.http,200,JSON.stringify(r));assert.equal(r.stats.todayVisits,302);assert.equal(r.todayJobs.length,30);assert.equal(r.todayTruncated,true);
 assert.ok(JSON.stringify(r).length<200000);t.diagnostic('In-memory SQLite dashboard with 302 jobs: '+elapsed.toFixed(1)+' ms, '+JSON.stringify(r).length+' JSON characters; not a production latency measurement.');
});

test('Company dashboard shows a real standalone break and net attendance without inventing a job',async()=>{
 const f=await setup(),at=Date.now()-600000;
 const shift=await f.call('/api/attendance/punch',people.worker,'POST',{mutationId:'standalone-shift',kind:'arrival',at,gpsStatus:'unavailable'});assert.equal(shift.http,200,JSON.stringify(shift));
 const pause=await f.call('/api/attendance/activities',people.worker,'POST',{operationId:'standalone-pause',action:'break',at:at+300000,shiftId:shift.shift.id,shiftVersion:shift.shift.version,version:0});assert.equal(pause.http,200,JSON.stringify(pause));
 const company=await f.call('/api/overview?mode=company'),person=company.people.find(p=>p.id===people.worker.id);
 assert.equal(person.state,'break');assert.equal(person.job,null);assert.equal(person.workMs,0);assert.ok(person.netMs>=300000&&person.netMs<305000);assert.equal(company.stats.todayAttendanceMs,person.netMs);
 assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM jobs').get().n,2);
});
