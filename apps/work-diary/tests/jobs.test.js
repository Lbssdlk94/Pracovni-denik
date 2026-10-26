import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx);
const value=(assignedTo=people.worker.id,extra={})=>({version:0,title:'Soukromá zakázka pracovníka',description:'Oprava ventilu',address:'Ulice 12',gardenId:null,assignedTo,dueDate:'2026-10-20',status:'planned',incompleteReason:'',...extra});
async function setup(){const env=environment();await call(env,'/api/me');for(const role of ['worker','reader','admin']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}await call(env,'/api/jobs/a',people.owner,'PUT',value());await call(env,'/api/jobs/b',people.owner,'PUT',value(people.reader.id,{title:'Tajná zakázka druhého kolegy'}));return env;}
const getJobs=async(env,person=people.owner,query='')=>(await(await call(env,'/api/jobs'+query,person)).json()).jobs;
test('Only managers see all jobs; colleagues see their assignments on every list and detail route',async()=>{
 const env=await setup();assert.equal((await getJobs(env)).length,2);assert.equal((await getJobs(env,people.admin)).length,2);
 assert.deepEqual((await getJobs(env,people.worker)).map(j=>j.id),['a']);assert.deepEqual((await getJobs(env,people.reader)).map(j=>j.id),['b']);
 assert.equal((await call(env,'/api/jobs',null)).status,401);assert.equal((await call(env,'/api/jobs',people.outsider)).status,403);
 for(const suffix of ['', '?state=all','?q=Tajná','?userId='+people.reader.id]){const response=await call(env,'/api/jobs'+suffix,people.worker);assert.equal(response.status,200);assert.ok(!(await response.text()).includes('Tajná'));}
 assert.equal((await call(env,'/api/jobs?assignee='+people.reader.id,people.worker)).status,403);
 assert.equal((await call(env,'/api/jobs/b',people.worker)).status,404);assert.equal((await call(env,'/api/jobs/missing',people.worker)).status,404);assert.equal((await call(env,'/api/jobs/a',people.worker)).status,200);
 assert.equal((await call(env,'/api/jobs/people',people.worker)).status,403);assert.equal((await call(env,'/api/jobs/people',people.admin)).status,200);
 for(const method of ['PUT','DELETE'])assert.equal((await call(env,'/api/jobs/a',people.worker,method,method==='PUT'?value(people.reader.id,{version:1}):{version:1})).status,403);
 assert.equal((await call(env,'/api/jobs/b/status',people.worker,'PATCH',{version:1,status:'done'})).status,404);
});
test('Assigned colleagues change only the state; incomplete requires a reason and retains it for the manager',async()=>{
 const env=await setup(),path='/api/jobs/a/status';
 for(const body of [{version:1,status:'unknown'},{version:1,status:'incomplete'},{version:1,status:'incomplete',incompleteReason:'   '},{version:1,status:'done',assignedTo:people.reader.id}])assert.equal((await call(env,path,people.worker,'PATCH',body)).status,400);
 let r=await call(env,path,people.worker,'PATCH',{version:1,status:'in_progress'});assert.equal(r.status,200);let job=(await r.json()).job;assert.equal(job.version,2);
 assert.equal((await call(env,path,people.worker,'PATCH',{version:1,status:'done'})).status,409);
 r=await call(env,path,people.worker,'PATCH',{version:2,status:'incomplete',incompleteReason:'Chybí náhradní díl.'});assert.equal(r.status,200);job=(await r.json()).job;assert.equal(job.incompleteReason,'Chybí náhradní díl.');assert.equal((await getJobs(env,people.admin,'?state=incomplete'))[0].incompleteReason,'Chybí náhradní díl.');
 assert.equal((await call(env,path,people.worker,'PATCH',{version:3,status:'done'})).status,200);assert.equal((await getJobs(env,people.worker)).length,0);assert.equal((await getJobs(env,people.worker,'?state=done'))[0].incompleteReason,'');
 assert.equal((await call(env,'/api/jobs/b/status',people.reader,'PATCH',{version:1,status:'in_progress'})).status,200);
});
test('Reassignment revokes previous access, deletion cannot be undone by a stale editor and garden deletion preserves the job',async()=>{
 const env=await setup();assert.equal((await call(env,'/api/jobs/a',people.admin,'PUT',value(people.reader.id,{version:1}))).status,200);
 assert.equal((await call(env,'/api/jobs/a',people.worker)).status,404);assert.equal((await call(env,'/api/jobs/a/status',people.worker,'PATCH',{version:1,status:'done'})).status,404);assert.equal((await getJobs(env,people.reader)).length,2);
 await call(env,'/api/gardens',people.owner,'POST',{id:'g1',name:'Zahrada',address:'',notes:''});assert.equal((await call(env,'/api/jobs/a',people.owner,'PUT',value(people.reader.id,{version:2,gardenId:'g1'}))).status,200);
 const preview=await(await call(env,'/api/gardens/g1/delete-preview')).json();assert.equal((await call(env,'/api/gardens/g1',people.owner,'DELETE',{version:preview.garden.version,mode:'keep-shafts',shafts:[],services:[]})).status,200);assert.equal((await call(env,'/api/jobs/a',people.reader)).status,200);
 assert.equal((await call(env,'/api/jobs/a',people.admin,'DELETE',{version:3})).status,200);assert.equal((await call(env,'/api/jobs/a',people.reader)).status,404);assert.equal((await call(env,'/api/jobs/a',people.admin,'PUT',value(people.reader.id,{version:3}))).status,409);
});
test('Membership and assignment races are guarded at the database operation',async()=>{
 {const env=await setup(),prepare=env.DB.prepare;env.DB.prepare=sql=>{if(sql.startsWith('UPDATE jobs SET status='))env.sqlite.exec("UPDATE jobs SET assigned_to='reader-id',version=version+1 WHERE id='a'");return prepare(sql);};assert.equal((await call(env,'/api/jobs/a/status',people.worker,'PATCH',{version:1,status:'done'})).status,409);assert.equal(env.sqlite.prepare("SELECT status FROM jobs WHERE id='a'").get().status,'planned');}
 {const env=await setup(),prepare=env.DB.prepare;env.DB.prepare=sql=>{if(sql.startsWith('UPDATE jobs SET title='))env.sqlite.exec("UPDATE members SET role='worker' WHERE user_id='admin-id'");return prepare(sql);};assert.equal((await call(env,'/api/jobs/a',people.admin,'PUT',value(people.reader.id,{version:1,title:'Unauthorized'}))).status,409);assert.notEqual(env.sqlite.prepare("SELECT title FROM jobs WHERE id='a'").get().title,'Unauthorized');}
 for(const remove of [false,true]){const env=await setup(),prepare=env.DB.prepare;env.DB.prepare=sql=>{if(sql.startsWith('SELECT j.*'))env.sqlite.exec(remove?"DELETE FROM members WHERE user_id='admin-id'":"UPDATE members SET role='worker' WHERE user_id='admin-id'");return prepare(sql);};assert.deepEqual(await getJobs(env,people.admin),[]);}
});
test('Validation, literal search, pagination and disabled feature do not bypass access rules',async()=>{
 const env=await setup();for(const extra of [{assignedTo:'missing'},{gardenId:'missing'},{dueDate:'2026-02-30'},{title:''},{status:'incomplete'}])assert.equal((await call(env,'/api/jobs/invalid',people.owner,'PUT',value(people.worker.id,extra))).status,400);
 assert.deepEqual(await getJobs(env,people.worker,'?q=%25'),[]);assert.equal((await call(env,'/api/jobs?cursor=bad',people.owner)).status,400);
 for(let i=0;i<105;i++)assert.equal((await call(env,'/api/jobs/j'+i,people.owner,'PUT',value(people.worker.id,{title:'Zakázka '+i}))).status,200);
 const first=await(await call(env,'/api/jobs',people.worker)).json();assert.equal(first.jobs.length,100);assert.ok(first.nextCursor);const second=await(await call(env,'/api/jobs?cursor='+encodeURIComponent(first.nextCursor),people.worker)).json();assert.equal(second.jobs.length,6);assert.equal(new Set([...first.jobs,...second.jobs].map(j=>j.id)).size,106);assert.ok([...first.jobs,...second.jobs].every(j=>j.assignedTo===people.worker.id));
 const f=await(await call(env,'/api/features')).json();await call(env,'/api/features',people.owner,'PUT',{version:f.featuresVersion,features:{...f.features,jobs:false}});for(const path of ['/api/jobs','/api/jobs/a','/api/jobs/people'])assert.equal((await call(env,path,people.owner)).status,403);assert.equal((await call(env,'/api/jobs/a/status',people.worker,'PATCH',{version:1,status:'done'})).status,403);
});

test('One job supports several colleagues with scoped contacts, filters, notifications and immediate revocation',async()=>{
 const env=await setup();await call(env,'/api/customers/shared-customer',people.owner,'PUT',{version:0,name:'Společný zákazník',phones:[{id:'phone',number:'+420123456789',label:''}],addresses:[]});
 let r=await call(env,'/api/jobs/shared',people.owner,'PUT',value(people.worker.id,{assignedTos:[people.worker.id,people.reader.id],customerId:'shared-customer'}));assert.equal(r.status,200);let job=(await r.json()).job;assert.deepEqual(job.assignedTos,[people.worker.id,people.reader.id]);
 for(const person of [people.worker,people.reader]){assert.equal((await call(env,'/api/jobs/shared',person)).status,200);assert.equal((await call(env,'/api/customers/shared-customer',person)).status,200);assert.ok((await getJobs(env,person,'?assignee='+person.id)).some(j=>j.id==='shared'));const inbox=await(await call(env,'/api/notifications',person)).json();assert.ok(JSON.stringify(inbox).includes('shared'));}
 assert.equal((await call(env,'/api/jobs/shared',people.outsider)).status,403);assert.equal((await call(env,'/api/jobs/shared',people.worker,'PUT',value(people.worker.id,{version:job.version,assignedTos:[people.worker.id]}))).status,403);
 r=await call(env,'/api/jobs/shared/status',people.reader,'PATCH',{version:job.version,status:'in_progress'});assert.equal(r.status,200);job=(await r.json()).job;assert.equal((await call(env,'/api/jobs/shared/status',people.worker,'PATCH',{version:1,status:'done'})).status,409);
 // Legacy clients changing other fields must not silently drop extra colleagues.
 r=await call(env,'/api/jobs/shared',people.owner,'PUT',value(people.worker.id,{version:job.version,customerId:'shared-customer',status:'in_progress'}));assert.equal(r.status,200);job=(await r.json()).job;assert.ok(job.assignedTos.includes(people.reader.id));
 r=await call(env,'/api/jobs/shared',people.owner,'PUT',value(people.worker.id,{version:job.version,customerId:'shared-customer',assignedTos:[people.worker.id]}));assert.equal(r.status,200);assert.equal((await call(env,'/api/jobs/shared',people.reader)).status,404);assert.equal((await call(env,'/api/customers/shared-customer',people.reader)).status,404);const inbox=await(await call(env,'/api/notifications',people.reader)).json();assert.ok(!JSON.stringify(inbox).includes('shared'));env.sqlite.close();
});
