import test from 'node:test';import assert from 'node:assert/strict';
import {createWatchClient} from '../web/watch-client.js';import {nativeIdentityKey} from '../web/native-client.js';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})},day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
async function setup(){
 const env=environment();let actor=people.owner,session,online=true,formClosed=true;const requests=[];
 const call=async(path,person,method='GET',value)=>{const r=await api(request(path,person,method,value),env,ctx),data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{status:r.status,code:data.code});return data;};
 await call('/api/me',people.owner);for(const role of ['worker','reader']){await call('/api/invitations',people.owner,'POST',{email:people[role].email,role});await call('/api/me',people[role]);}
 for(const [id,who,date]of [['mine',people.worker.id,day],['other',people.reader.id,day],['tomorrow',people.worker.id,'2099-01-01']])await call('/api/jobs/'+id,people.owner,'PUT',{version:0,title:'Work '+id,customerName:'Customer '+id,address:'Lipová 1488, Blatná',assignedTo:who,dueDate:date,status:'planned',plannedStart:'09:00',estimatedMinutes:30});
 actor=people.worker;const db={session:()=>session,connect:async()=>session=await call('/api/me',actor),request:async(path,options={})=>{requests.push({path,...options});return call(path,actor,options.method||'GET',options.body?JSON.parse(options.body):undefined);}};
 const client=createWatchClient({db,getName:()=> 'Test firma',onSession:s=>session=s,canResume:()=>formClosed,isOnline:()=>online,today:()=>day,identityKey:nativeIdentityKey});
 const refresh=async()=>client.execute({protocolVersion:1,requestId:crypto.randomUUID(),kind:'refresh'}),change=(state,action,extra={})=>({protocolVersion:1,requestId:crypto.randomUUID(),kind:'action',binding:state.binding,snapshotAt:state.generatedAt,jobId:state.jobs[0].id,jobVersion:state.jobs[0].version,action,...extra});
 return {env,db,client,call,refresh,change,requests,setActor:value=>actor=value,setOnline:value=>online=value,setClosed:value=>formClosed=value};
}
test('watch projects only assigned today jobs and excludes credentials, prices and files',async()=>{
 const t=await setup(),{snapshot:s}=await t.refresh();assert.equal(s.jobs.length,1);assert.equal(s.jobs[0].id,'mine');assert.equal(s.binding.length,64);assert.equal(s.jobs[0].plannedStart,'09:00');assert.equal(s.jobs[0].estimatedMinutes,30);assert.equal(s.jobs[0].canAccept,true);
 const text=JSON.stringify(s);for(const field of ['customerContact','password','cookie','agreedPrice','materialItems','gardenNotes','photoIds'])assert.ok(!text.includes(field));assert.ok(!text.includes('Customer other'));
});
test('watch start and completion persist through real versioned API without duplicate records',async()=>{
 const t=await setup(),s=(await t.refresh()).snapshot,started=await t.client.execute(t.change(s,'start'));assert.equal(started.snapshot.jobs[0].status,'in_progress');const finished=await t.client.execute(t.change(started.snapshot,'complete'));assert.equal(finished.snapshot.jobs[0].status,'done');assert.equal(t.env.sqlite.prepare("SELECT assigned_to FROM jobs WHERE id='mine'").get().assigned_to,'worker-id');assert.equal(t.env.sqlite.prepare('SELECT count(*) n FROM jobs').get().n,3);assert.equal(t.env.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n,0);
});
test('replaying a version, switching accounts or an open phone form cannot silently overwrite work',async()=>{
 const t=await setup(),s=(await t.refresh()).snapshot,operation=t.change(s,'start');await t.client.execute(operation);await assert.rejects(t.client.execute(operation),e=>e.code==='watch_conflict');const fresh=(await t.refresh()).snapshot;t.setActor(people.reader);await assert.rejects(t.client.execute(t.change(fresh,'complete')),e=>e.code==='watch_identity_changed');t.setActor(people.worker);t.setClosed(false);await assert.rejects(t.client.execute(t.change(fresh,'complete')),e=>e.code==='native_form_open');assert.equal(t.env.sqlite.prepare("SELECT status FROM jobs WHERE id='mine'").get().status,'in_progress');
});
test('watch rejects stale or offline changes and arbitrary paths or actor overrides',async()=>{
 const t=await setup(),s=(await t.refresh()).snapshot;await assert.rejects(t.client.execute(t.change(s,'start',{snapshotAt:Date.now()-121000})),e=>e.code==='watch_stale');await assert.rejects(t.client.execute(t.change(s,'start',{userId:people.owner.id})));await assert.rejects(t.client.execute(t.change(s,'erase',{jobId:'../../members/owner-id'})));t.setOnline(false);await assert.rejects(t.client.execute(t.change(s,'start')));assert.equal(t.env.sqlite.prepare("SELECT status FROM jobs WHERE id='mine'").get().status,'planned');
});
test('watch handoff accepts only for the authenticated assigned worker',async()=>{
 const t=await setup(),s=(await t.refresh()).snapshot;await t.client.execute(t.change(s,'accept'));const accepted=t.env.sqlite.prepare("SELECT * FROM job_handoffs WHERE job_id='mine'").get();assert.equal(accepted.user_id,'worker-id');assert.equal(accepted.status,'accepted');assert.equal(t.env.sqlite.prepare("SELECT status FROM jobs WHERE id='mine'").get().status,'planned');await assert.rejects(t.client.execute(t.change(s,'accept',{jobId:'other'})));
});
test('departure requires exact future time and preserves the manual SMS follow-up',async()=>{
 const t=await setup(),s=(await t.refresh()).snapshot;await assert.rejects(t.client.execute(t.change(s,'depart',{arrivalTime:'za 15 minut'})));const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value])),time=parts.hour+':'+parts.minute;const result=await t.client.execute(t.change(s,'depart',{arrivalTime:time}));assert.equal(result.phoneAction,'travelSms');assert.equal(result.phoneJobId,'mine');const job=t.env.sqlite.prepare("SELECT status,arrival_time,departure_by FROM jobs WHERE id='mine'").get();assert.equal(job.status,'on_way');assert.equal(job.arrival_time,time);assert.equal(job.departure_by,'worker-id');
});
test('required subscription protocol hands completion to phone with no credit consumption',async()=>{
 const t=await setup(),real=t.db.request;t.db.request=async(path,options)=>{const value=await real(path,options);if(path==='/api/jobs/mine'&&!options?.method)value.job.servicePeriodId='fixture-protocol-required';if(path.startsWith('/api/jobs?'))for(const j of value.jobs)if(j.id==='mine')j.servicePeriodId='fixture-protocol-required';return value;};const s=(await t.refresh()).snapshot;assert.equal(s.jobs[0].requiresProtocol,true);const result=await t.client.execute(t.change(s,'complete'));assert.equal(result.phoneAction,'protocol');assert.equal(t.env.sqlite.prepare("SELECT status FROM jobs WHERE id='mine'").get().status,'planned');assert.equal(t.requests.filter(r=>r.method).length,0);
});
test('disabled modules and revoked membership are checked before watch data leaves phone',async()=>{
 const t=await setup();t.env.sqlite.prepare("INSERT INTO settings(key,value,version) VALUES('features',?,1)").run(JSON.stringify({jobs:false,notifications:false}));const s=(await t.refresh()).snapshot;assert.equal(s.jobsEnabled,false);assert.deepEqual(s.jobs,[]);assert.deepEqual(s.notices,[]);t.env.sqlite.prepare("DELETE FROM members WHERE user_id='worker-id'").run();await assert.rejects(t.refresh(),e=>e.status===403);
});
