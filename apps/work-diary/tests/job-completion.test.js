import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
import {completionTrend} from '../web/job-completion-model.js';import {jobCompletionMarkup,canEditCompletion} from '../web/job-completion-ui.js';
const ctx={waitUntil:p=>p.catch(()=>{})},esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function setup(){const env=environment(),call=async(path,user=people.owner,method='GET',value)=>{const r=await api(request(path,user,method,value),env,ctx);return {status:r.status,...await r.json()};};await call('/api/me');for(const role of ['worker','admin','reader']){await call('/api/invitations',people.owner,'POST',{email:people[role].email,role});await call('/api/me',people[role]);}for(const id of ['a','b'])assert.equal((await call('/api/jobs/'+id,people.owner,'PUT',{version:0,title:'Realizace '+id,jobType:'installation',assignedTo:id==='a'?people.worker.id:people.admin.id,assignedTos:id==='a'?[people.worker.id,people.admin.id]:[people.admin.id],status:'planned',dueDate:'2026-11-19'})).status,200);return {env,call,write:(body,user=people.worker,id='a')=>call('/api/jobs/'+id+'/completion',user,'PATCH',body)};}
test('Assigned worker updates a shared estimate, author and timestamp; 100% never completes work or creates attendance',async()=>{
 const f=await setup();let r=await f.call('/api/jobs/a',people.worker);assert.equal(r.job.completionPercent,null);assert.equal(r.job.completionTargetPoints,20);
 r=await f.write({version:0,operationId:'first',percent:65,note:'Zapojená kapková závlaha'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.job.completionPercent,65);assert.equal(r.job.completionUpdatedBy,people.worker.id);assert.ok(r.job.completionUpdatedName);assert.ok(r.job.completionUpdatedAt);assert.equal(r.job.completionVersion,1);assert.equal(r.job.status,'planned');
 const list=await f.call('/api/jobs?state=all',people.admin);assert.equal(list.jobs.find(j=>j.id==='a').completionPercent,65);
 r=await f.write({version:1,operationId:'complete-estimate',percent:100});assert.equal(r.status,200);assert.equal(r.job.status,'planned');assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,0);assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,0);
});
test('Same operation is idempotent, a reused ID with changed data fails, stale estimates do not overwrite colleagues',async()=>{
 const f=await setup(),input={version:0,operationId:'repeat',percent:10};const initial=await f.write(input);assert.equal((await f.write(input)).replayed,true);assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_completion_events').get().n,1);
 assert.equal((await f.write({...input,percent:20})).status,409);assert.equal((await f.write({...input,operationId:'stale',percent:50})).status,409);assert.equal((await f.call('/api/jobs/a')).job.completionPercent,10);assert.equal((await f.call('/api/jobs/a')).job.version,initial.job.version);
});
test('Input validates integer percentages, comments and bounds; zero differs from an unset estimate',async()=>{
 const f=await setup();for(const percent of [-1,101,1.5,'20',null])assert.equal((await f.write({version:0,operationId:crypto.randomUUID(),percent})).status,400);
 assert.equal((await f.write({version:0,operationId:'too-long',percent:30,note:'x'.repeat(1001)})).status,400);
 const r=await f.write({version:0,operationId:'zero',percent:0});assert.equal(r.status,200);assert.equal(r.job.completionPercent,0);assert.match(jobCompletionMarkup(r.job,esc,{compact:true}),/>0 %</);assert.match(jobCompletionMarkup({id:'unset',completionPercent:null},esc,{compact:true}),/Nezadán/);
});
test('Readers and unassigned workers cannot write; an estimate does not grant assignment or finance rights',async()=>{
 const f=await setup();f.env.sqlite.prepare("UPDATE jobs SET assigned_users=? WHERE id='a'").run(JSON.stringify([people.reader.id]));assert.equal((await f.call('/api/jobs/a',people.reader)).status,200);assert.equal((await f.write({version:0,operationId:'reader',percent:20},people.reader)).status,403);assert.equal((await f.write({version:0,operationId:'unassigned',percent:20},people.worker,'b')).status,404);assert.equal((await f.write({version:0,operationId:'outsider',percent:20},people.outsider)).status,403);
 assert.equal(canEditCompletion({user:{role:'reader'},permissions:{write:false}}),false);assert.equal(canEditCompletion({user:{role:'owner'},permissions:{write:true},rolePreview:{selectedRole:'worker'}}),false);
});
test('Version and live role races abort the complete atomic update and preserve the job revision',async()=>{
 for(const mode of ['role','version']){const f=await setup();if(mode==='version')await f.write({version:0,operationId:'base',percent:10});const before=f.env.sqlite.prepare("SELECT version FROM jobs WHERE id='a'").get().version,batch=f.env.DB.batch;
 f.env.DB.batch=async statements=>{f.env.DB.batch=batch;if(mode==='role')f.env.sqlite.prepare("UPDATE members SET role='reader' WHERE user_id=?").run(people.worker.id);else f.env.sqlite.exec("UPDATE job_completion SET version=2,percent=80 WHERE job_id='a'");return batch(statements);};
 const r=await f.write({version:mode==='role'?0:1,operationId:'race',percent:30});assert.equal(r.status,409,JSON.stringify(r));assert.equal(f.env.sqlite.prepare("SELECT version FROM jobs WHERE id='a'").get().version,before);assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_completion_events').get().n,mode==='role'?0:1);
 }
});
test('Daily baseline uses the last estimate of a previous Prague day; same-day edits retain the baseline',async t=>{
 const original=Date.now,base=Date.UTC(2026,10,17,23,30);let now=base;t.mock.method(Date,'now',()=>now);const f=await setup();
 let r=await f.write({version:0,operationId:'day-one',percent:10});assert.equal(r.job.completionDay,'2026-11-18');assert.equal(completionTrend(r.job).tone,'neutral');
 now+=86400000;r=await f.write({version:1,operationId:'slow',percent:12,note:'Chyběl materiál'});assert.equal(r.job.completionBaselinePercent,10);assert.equal(completionTrend(r.job).delta,2);assert.equal(completionTrend(r.job).tone,'slow');assert.equal(r.job.completionNote,'Chyběl materiál');
 r=await f.write({version:2,operationId:'faster',percent:30,note:''});assert.equal(r.job.completionBaselinePercent,10);assert.equal(completionTrend(r.job).delta,20);assert.equal(completionTrend(r.job).tone,'on-track');
 const persisted=f.env.sqlite.prepare("SELECT percent,version FROM job_completion WHERE job_id='a'").get();now+=3*86400000;const later=await f.call('/api/jobs/a');assert.equal(later.job.completionDay,'2026-11-19');assert.equal(completionTrend(later.job).tone,'on-track');assert.deepEqual(f.env.sqlite.prepare("SELECT percent,version FROM job_completion WHERE job_id='a'").get(),persisted);
 assert.equal(f.env.sqlite.prepare("SELECT count(*) n FROM job_completion_events WHERE kind='estimate'").get().n,3);assert.equal(original()>0,true);
});
test('Managers set an independent threshold without inventing an estimate; workers cannot change it',async()=>{
 const f=await setup(),body={operationId:'target',version:0,points:25};assert.equal((await f.call('/api/jobs/a/completion-target',people.worker,'PATCH',body)).status,403);
 let r=await f.call('/api/jobs/a/completion-target',people.admin,'PATCH',body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.job.completionTargetPoints,25);assert.equal(r.job.completionPercent,null);assert.equal((await f.call('/api/jobs/a/completion-target',people.admin,'PATCH',body)).replayed,true);
 assert.equal((await f.call('/api/jobs/a/completion-target',people.admin,'PATCH',{...body,operationId:'stale-target',points:30})).status,409);
 for(const points of [0,101,2.5])assert.equal((await f.call('/api/jobs/a/completion-target',people.admin,'PATCH',{operationId:crypto.randomUUID(),version:1,points})).status,400);
 r=await f.write({operationId:'actual-estimate',version:0,percent:40});assert.equal(r.status,200);assert.equal(r.job.completionTargetPoints,25);assert.equal(r.job.completionTargetVersion,1);
});
test('Trend and markup identify insufficient progress without depending on color; comments are escaped',()=>{
 for(const [percent,tone,delta] of [[12,'slow',2],[30,'on-track',20],[29,'slow',19],[5,'slow',-5],[100,'on-track',90]]){const job={id:'a',completionPercent:percent,completionBaselinePercent:10,completionBaselineDay:'2026-11-18',completionTargetPoints:20,completionNote:'<img src=x onerror=alert(1)>'};assert.equal(completionTrend(job).tone,tone);assert.equal(completionTrend(job).delta,delta);const html=jobCompletionMarkup(job,esc,{compact:true});assert.ok(!html.includes('<img'));assert.match(html,/Odhad dokončení/);assert.match(html,/p\. b\.|Odhad 100/);}
});
test('0058 is additive and leaves existing job status, assignment and revision unchanged',async()=>{
 const env=environment(':memory:',57);await api(request('/api/me',people.owner),env,ctx);env.sqlite.prepare("INSERT INTO jobs(id,title,description,address,assigned_to,assigned_name,due_date,status,created_at,updated_at,created_by,updated_by) VALUES('original','Původní','','',?,'Vlastník','','in_progress',?,?,?,?)").run(people.owner.id,Date.now(),Date.now(),people.owner.id,people.owner.id);const old=env.sqlite.prepare("SELECT * FROM jobs WHERE id='original'").get();env.sqlite.exec(readFileSync('drizzle/0058_job_completion.sql','utf8'));assert.deepEqual(env.sqlite.prepare("SELECT * FROM jobs WHERE id='original'").get(),old);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_completion').get().n,0);assert.deepEqual(env.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('Shared Garden/Závlaha scope, read-only state, role preview and disabled job module apply to completion API',async()=>{
 const f=await setup(),s=f.env.sqlite,inst=s.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").get().instance_id;
 s.exec("INSERT INTO workspaces VALUES('pair','preparing',1,1,1)");s.prepare("INSERT INTO workspace_organizations VALUES('source-org','pair',?,'irrigation','Test')").run(inst);s.prepare("INSERT INTO workspace_organizations VALUES('garden-org','pair','inst-completion-garden','garden','Garden')").run();
 for(const role of ['owner','worker','admin','reader']){const person=s.prepare('SELECT * FROM members WHERE user_id=?').get(people[role].id);s.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,?, 'original')").run(inst,person.user_id,person.user_id,person.role,person.email,person.name,people.owner.id,1);s.prepare("INSERT INTO workspace_member_grants VALUES(?,'source-org',?)").run(person.user_id,person.role);s.prepare('INSERT INTO member_disciplines VALUES(?,?)').run(person.user_id,role==='worker'?'garden':'irrigation');}
 s.exec("UPDATE jobs SET discipline='irrigation';UPDATE workspaces SET state='active'");await f.call('/api/me');
 const input={operationId:'scope',version:0,percent:20};assert.equal((await f.write(input)).status,404);s.prepare("INSERT INTO member_disciplines VALUES(?,'irrigation')").run(people.worker.id);assert.equal((await f.write(input)).status,200);
 s.exec("UPDATE workspaces SET state='read_only'");assert.equal((await f.write({operationId:'readonly',version:1,percent:30})).status,409);assert.equal(s.prepare('SELECT count(*) n FROM job_completion_events').get().n,1);
 s.exec("UPDATE workspaces SET state='active'");const preview=await api(request('/api/jobs/a/completion',people.owner,'PATCH',{operationId:'preview',version:1,percent:30},{'x-work-diary-preview-role':'worker'}),f.env,ctx);assert.equal(preview.status,403);
 const disabled=await setup();disabled.env.sqlite.prepare("INSERT INTO settings(key,value,version) VALUES('features',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({jobs:false}));assert.equal((await disabled.write(input)).status,403);
});
