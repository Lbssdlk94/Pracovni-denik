import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
import {subToday} from '../web/subscription-model.js';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(e,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),e,ctx);
const good=async response=>{assert.equal(response.status,200,await response.clone().text());return response.json();};
async function setup(){const e=environment();await good(await call(e,'/api/me'));for(const role of ['worker','reader','admin']){await good(await call(e,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await good(await call(e,'/api/me',people[role]));}await good(await call(e,'/api/gardens',people.owner,'POST',{id:'site',name:'Testovací zahrada',address:'Test 12',notes:''}));await good(await call(e,'/api/jobs/build',people.owner,'PUT',{version:0,title:'Realizace závlahy',jobType:'installation',gardenId:'site',assignedTo:people.worker.id,assignedTos:[people.worker.id,people.admin.id],status:'planned'}));await good(await api(new Request('https://zavlahy.test/api/jobs/build/service/photos/day-photo',{method:'PUT',headers:{'x-zavlahy-request':'1','oai-authenticated-user-id':people.worker.id,'oai-authenticated-user-email':people.worker.email,'content-type':'image/jpeg','x-file-name':'Prubeh.jpg','x-workspace-client-version':'shared-directory-v1'},body:new Uint8Array([255,216,255,219,0,1])}),e,ctx));return e;}
const write=(version=0,operationId='day-op',work='Položeno potrubí a zapojeny sekce 1–3')=>({version,operationId,date:subToday(),work,material:'PE potrubí 32 mm',notes:'',nextStep:'Dokončit šachtu',photoIds:['day-photo']});
test('Daily job entries reuse permissions, author identity and idempotency without changing the job or service report',async()=>{const e=await setup();try{
 const before=e.sqlite.prepare("SELECT version,status FROM jobs WHERE id='build'").get();const saved=await good(await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',{...write(),authorName:'SPOOFED',createdBy:'someone'}));assert.equal(saved.entry.authorName,people.worker.email);assert.equal(saved.entry.createdBy,people.worker.id);
 const replay=await good(await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',{...write(),authorName:'SPOOFED',createdBy:'someone'}));assert.equal(replay.replayed,true);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM job_diary_entries').get().n,1);assert.deepEqual(e.sqlite.prepare("SELECT version,status FROM jobs WHERE id='build'").get(),before);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n,0);
 assert.equal((await call(e,'/api/jobs/build/diary/day2',people.worker,'PUT',write(0,'day-op'))).status,409);
 const updated=await good(await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',write(1,'edit-op','Dokončena šachta')));assert.equal(updated.entry.version,2);assert.equal(updated.entry.authorName,people.worker.email);assert.equal((await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',write(1,'stale'))).status,409);
 assert.equal((await call(e,'/api/jobs/build/diary/day1',people.reader,'PUT',write(2,'reader-write'))).status,404);assert.equal((await call(e,'/api/jobs/build/diary',people.outsider)).status,403);assert.equal((await call(e,'/api/jobs/build/diary')).status,200);
 await good(await call(e,'/api/jobs/build/diary/admin-entry',people.admin,'PUT',write(0,'admin-op')));assert.equal((await call(e,'/api/jobs/build/diary/admin-entry',people.worker,'PUT',write(1,'edit-foreign'))).status,403);
 const history=await good(await call(e,'/api/gardens/site/history'));assert.equal(history.visits.filter(v=>v.jobId==='build').length,1);assert.equal(history.visits.find(v=>v.jobId==='build').diaryEntries.length,2);
 }finally{e.sqlite.close();}});
test('Photos reuse original private storage and never cross jobs; invalid dates/content and disabled modules are rejected',async()=>{const e=await setup();try{
 const path='/api/jobs/build/service/photos/day-photo',bytes=new Uint8Array([255,216,255,219,0,1]);const upload=()=>api(new Request('https://zavlahy.test'+path,{method:'PUT',headers:{'x-zavlahy-request':'1','oai-authenticated-user-id':people.worker.id,'oai-authenticated-user-email':people.worker.email,'content-type':'image/jpeg','x-file-name':'Prubeh.jpg','x-workspace-client-version':'shared-directory-v1'},body:bytes}),e,ctx);await good(await upload());await good(await upload());
 const payload={...write(),photoIds:['day-photo']};const saved=await good(await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',payload));assert.equal(saved.entry.photos[0].url,path);assert.equal((await call(e,path,people.reader)).status,404);assert.deepEqual([...new Uint8Array(await(await call(e,path,people.worker)).arrayBuffer())],[...bytes]);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM service_photos').get().n,1);assert.equal(e.objects.size,1);
 assert.equal((await call(e,'/api/jobs/build/diary/other',people.worker,'PUT',{...write(0,'bad-photo'),photoIds:['not-this-job']})).status,400);
 for(const [date,work]of [['2026-02-30','Popis'],['2999-12-31','Popis'],[subToday(),'']])assert.equal((await call(e,'/api/jobs/build/diary/bad',people.worker,'PUT',{...write(0,'invalid'),date,work})).status,400);
 e.sqlite.prepare("UPDATE jobs SET job_type='service' WHERE id='build'").run();assert.equal((await call(e,'/api/jobs/build/diary')).status,404);e.sqlite.prepare("UPDATE jobs SET job_type='installation' WHERE id='build'").run();
 e.sqlite.prepare("INSERT INTO settings(key,value,version) VALUES('features',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({jobs:false}));assert.equal((await call(e,'/api/jobs/build/diary')).status,403);
 }finally{e.sqlite.close();}});
test('Read and write access are withdrawn after reassignment, while repeated text does not close defects',async()=>{const e=await setup();try{await good(await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',write()));e.sqlite.prepare("UPDATE jobs SET assigned_to=?,assigned_users=? WHERE id='build'").run(people.admin.id,JSON.stringify([people.admin.id]));assert.equal((await call(e,'/api/jobs/build/diary',people.worker)).status,404);assert.equal((await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',write(1,'revoked'))).status,404);assert.equal((await call(e,'/api/jobs/build/diary',people.owner)).status,200);}finally{e.sqlite.close();}});

test('Shared workspace keeps diary API, photos and garden history within the job discipline and assignment',async()=>{const e=await setup();try{
 const s=e.sqlite,installation=s.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").get().instance_id;
 s.exec("INSERT INTO workspaces VALUES('pair','preparing',1,1,1)");s.prepare("INSERT INTO workspace_organizations VALUES('source-org','pair',?,'irrigation','Test')").run(installation);
 for(const role of ['owner','worker','admin','reader']){const person=s.prepare('SELECT * FROM members WHERE user_id=?').get(people[role].id);s.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,?, 'original')").run(installation,person.user_id,person.user_id,person.role,person.email,person.name,people.owner.id,1);s.prepare("INSERT INTO workspace_member_grants VALUES(?,'source-org',?)").run(person.user_id,person.role);s.prepare('INSERT INTO member_disciplines VALUES(?,?)').run(person.user_id,role==='worker'?'garden':'irrigation');}
 s.exec("UPDATE jobs SET discipline='irrigation';UPDATE workspaces SET state='active'");
 await good(await call(e,'/api/jobs/build/diary/entry',people.owner,'PUT',write()));
 assert.equal((await call(e,'/api/jobs/build/diary',people.worker)).status,404,'Even assigned Garden worker cannot read irrigation progress');assert.equal((await call(e,'/api/jobs/build/diary/entry',people.worker)).status,404);assert.equal((await call(e,'/api/jobs/build/diary/entry',people.worker,'PUT',write(1,'other-discipline'))).status,404);
 s.prepare('INSERT INTO member_disciplines VALUES(?,?)').run(people.worker.id,'irrigation');assert.equal((await call(e,'/api/jobs/build/diary',people.worker)).status,200);
 }finally{e.sqlite.close();}});

test('A diary save requires a ready photograph from this job; legacy entries remain readable and failed writes change nothing',async()=>{const e=await setup();try{
 const before=e.sqlite.prepare("SELECT version,status FROM jobs WHERE id='build'").get();
 for(const value of [[],['missing-photo']]){const response=await call(e,'/api/jobs/build/diary/no-photo',people.worker,'PUT',{...write(0,'without-photo'),photoIds:value});assert.equal(response.status,400);if(!value.length)assert.equal((await response.json()).code,'diary_photo_required');}
 assert.equal(e.sqlite.prepare('SELECT count(*) n FROM job_diary_entries').get().n,0);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM subscription_operations').get().n,0);
 await good(await call(e,'/api/jobs/build/diary/legacy',people.worker,'PUT',write()));
 e.sqlite.prepare("UPDATE job_diary_entries SET photo_ids='[]' WHERE id='legacy'").run();
 const legacy=(await good(await call(e,'/api/jobs/build/diary/legacy',people.worker))).entry;assert.deepEqual(legacy.photoIds,[]);assert.equal(legacy.work,write().work);
 assert.equal((await call(e,'/api/jobs/build/diary/legacy',people.worker,'PUT',{...write(1,'empty-edit'),photoIds:[]})).status,400);
 assert.equal((await good(await call(e,'/api/jobs/build/diary/legacy',people.worker))).entry.version,1);
 const saved=await good(await call(e,'/api/jobs/build/diary/legacy',people.worker,'PUT',write(1,'add-required-photo')));assert.deepEqual(saved.entry.photoIds,['day-photo']);assert.equal(saved.entry.version,2);
 const replay=await good(await call(e,'/api/jobs/build/diary/legacy',people.worker,'PUT',write(1,'add-required-photo')));assert.equal(replay.replayed,true);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM job_diary_entries').get().n,1);assert.deepEqual(e.sqlite.prepare("SELECT version,status FROM jobs WHERE id='build'").get(),before);
 }finally{e.sqlite.close();}});

test('Only owner/administrator can delete an entry; CAS, audit, idempotency, history and private photos survive',async()=>{const e=await setup();try{
 await good(await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',write()));
 const del={version:1,operationId:'delete-day1',confirm:'DELETE_JOB_DIARY_ENTRY'};
 for(const who of [people.worker,people.admin,people.reader,people.outsider])assert.ok([403,404].includes((await call(e,'/api/jobs/build/diary/day1',who,'DELETE',del)).status));
 assert.equal((await call(e,'/api/jobs/build/diary/day1',people.owner,'DELETE',{...del,version:99})).status,409);
 assert.equal((await call(e,'/api/jobs/build/diary/day1',people.owner,'DELETE',{...del,confirm:'no'})).status,400);
 const before=e.sqlite.prepare("SELECT status,version FROM jobs WHERE id='build'").get();await good(await call(e,'/api/jobs/build/diary/day1',people.owner,'DELETE',del));
 assert.equal((await good(await call(e,'/api/jobs/build/diary/day1',people.owner,'DELETE',del))).replayed,true);
 assert.equal((await call(e,'/api/jobs/build/diary/day1',people.owner)).status,404);assert.equal((await good(await call(e,'/api/jobs/build/diary'))).entries.length,0);
 const row=e.sqlite.prepare("SELECT * FROM job_diary_entries WHERE id='day1'").get();assert.ok(row.deleted_at);assert.equal(row.deleted_by,people.owner.id);assert.equal(row.work,write().work);assert.equal(row.version,2);
 assert.equal((await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',write(0,'recreate'))).status,409);assert.equal((await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',write())).status,409);
 assert.equal((await good(await call(e,'/api/gardens/site/history'))).visits.find(v=>v.jobId==='build').diaryEntries.length,0);assert.deepEqual(e.sqlite.prepare("SELECT status,version FROM jobs WHERE id='build'").get(),before);assert.equal(e.objects.size,1);assert.equal((await call(e,'/api/jobs/build/service/photos/day-photo',people.worker)).status,200);
 // An administrator is a distinct assignable role, not the ordinary admin/správce.
 e.sqlite.prepare('UPDATE members SET role=? WHERE user_id=?').run('administrator',people.admin.id);
 await good(await call(e,'/api/jobs/build/diary/day2',people.worker,'PUT',write(0,'second-day')));assert.equal((await good(await call(e,'/api/jobs/build/diary/day2',people.admin))).entry.canDelete,true);
 await good(await call(e,'/api/jobs/build/diary/day2',people.admin,'DELETE',{...del,operationId:'admin-delete'}));assert.equal(e.sqlite.prepare("SELECT deleted_by FROM job_diary_entries WHERE id='day2'").get().deleted_by,people.admin.id);
 }finally{e.sqlite.close();}});

test('Deleting cannot race past a role revocation or affect an entry in another job',async()=>{const e=await setup();try{
 await good(await call(e,'/api/jobs/build/diary/day1',people.worker,'PUT',write()));await good(await call(e,'/api/jobs/other',people.owner,'PUT',{version:0,title:'Jiná realizace',jobType:'installation',assignedTo:people.worker.id,status:'planned'}));
 const b={version:1,operationId:'delete-race',confirm:'DELETE_JOB_DIARY_ENTRY'};assert.equal((await call(e,'/api/jobs/other/diary/day1',people.owner,'DELETE',b)).status,404);
 const batch=e.DB.batch;e.DB.batch=async statements=>{e.sqlite.prepare("UPDATE members SET role='worker' WHERE user_id=?").run(people.owner.id);return batch(statements);};
 assert.ok([403,404,409].includes((await call(e,'/api/jobs/build/diary/day1',people.owner,'DELETE',b)).status));assert.equal(e.sqlite.prepare("SELECT deleted_at FROM job_diary_entries WHERE id='day1'").get().deleted_at,null);assert.equal(e.sqlite.prepare("SELECT count(*) n FROM subscription_operations WHERE id='delete-race'").get().n,0);
 }finally{e.sqlite.close();}});

test('Every existing role can write its own diary, including reader photos, but only owner/administrator can delete',async()=>{const e=await setup();try{
 e.sqlite.prepare("UPDATE jobs SET assigned_users=? WHERE id='build'").run(JSON.stringify([people.worker.id,people.reader.id,people.admin.id]));
 const path='/api/jobs/build/diary',upload=(photo,user=people.reader)=>api(new Request('https://zavlahy.test'+path+'/photos/'+photo,{method:'PUT',headers:{'x-zavlahy-request':'1','x-workspace-client-version':'shared-directory-v1','oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email,'content-type':'image/jpeg'},body:new Uint8Array([255,216,255,219,0,1])}),e,ctx);
 await good(await upload('reader-photo'));await good(await upload('reader-photo'));
 assert.equal(e.sqlite.prepare("SELECT count(*) n FROM service_photos WHERE id='reader-photo'").get().n,1);
 const saved=await good(await call(e,path+'/reader-entry',people.reader,'PUT',{...write(0,'reader-create'),photoIds:['reader-photo']}));assert.equal(saved.entry.createdBy,people.reader.id);assert.equal(saved.entry.canEdit,true);assert.equal(saved.entry.canDelete,false);
 await good(await call(e,path+'/reader-entry',people.reader,'PUT',{...write(1,'reader-edit','Doplněný postup'),photoIds:['reader-photo']}));
 assert.equal((await call(e,path+'/reader-entry',people.worker,'PUT',write(2,'foreign-edit'))).status,403);
 for(const role of ['reader','worker'])assert.equal((await call(e,path+'/reader-entry',people[role],'DELETE',{version:2,operationId:'deny-'+role,confirm:'DELETE_JOB_DIARY_ENTRY'})).status,403);
 // The reader exception must not grant protocol or job editing.
 assert.equal((await call(e,'/api/jobs/build/service',people.reader,'PUT',{version:1,operationId:'reader-protocol',report:{work:'Forbidden'}})).status,403);
 assert.equal((await call(e,'/api/jobs/build',people.reader,'PUT',{version:1,title:'Forbidden reassignment',jobType:'installation',assignedTo:people.reader.id,status:'planned'})).status,403);
 e.sqlite.prepare("UPDATE members SET role='admin' WHERE user_id=?").run(people.admin.id);
 assert.equal((await call(e,path+'/reader-entry',people.admin,'DELETE',{version:2,operationId:'deny-manager',confirm:'DELETE_JOB_DIARY_ENTRY'})).status,403);
 e.sqlite.prepare("UPDATE members SET role='administrator' WHERE user_id=?").run(people.admin.id);
 await good(await call(e,path+'/reader-entry',people.admin,'DELETE',{version:2,operationId:'delete-admin',confirm:'DELETE_JOB_DIARY_ENTRY'}));
 assert.equal((await call(e,'/api/jobs/build/service/photos/reader-photo',people.reader)).status,200);
 e.sqlite.prepare("UPDATE jobs SET assigned_users=? WHERE id='build'").run(JSON.stringify([people.worker.id]));
 assert.equal((await upload('revoked')).status,404);assert.equal((await call(e,path+'/new',people.reader,'PUT',write(0,'revoked-entry'))).status,404);
 }finally{e.sqlite.close();}});
