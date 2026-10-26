import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})};const call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx);
async function ok(r){assert.equal(r.status,200,await r.clone().text());return r.json();}
const job=(gardenId='g1',extra={})=>({version:0,title:'Servis',gardenId,assignedTo:people.worker.id,description:'',address:'Adresa',dueDate:'2026-10-01',status:'planned',incompleteReason:'',...extra});
const defect=(extra={})=>({gardenId:'g1',version:0,mutationId:crypto.randomUUID(),title:'Ventil netěsní',description:'Protéká i po zavření',location:'Šachta u terasy, sekce 3',priority:'low',status:'new',discoveredOn:'2026-10-01',assignedTo:null,nextStep:'Objednat ventil',resolution:'',photos:[],...extra});
async function setup(){const env=environment();await ok(await call(env,'/api/me'));for(const role of ['worker','admin','reader']){await ok(await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await ok(await call(env,'/api/me',people[role]));}for(const id of ['g1','g2'])await ok(await call(env,'/api/gardens',people.owner,'POST',{id,name:'Stejný zákazník '+id,address:'Ulice '+id,notes:''}));await ok(await call(env,'/api/jobs/original',people.owner,'PUT',job()));return env;}
test('Garden lifecycle: explicit protocol conversion, no automatic closure, one repair for multiple defects, history preserves both visits',async()=>{
 const env=await setup();const report={date:'2026-10-01',work:'Zazimování',material:'Spojka 1 ks',defects:'Ventil netěsní',notes:'',recommendations:'Vyměnit ventil',photoIds:[]};
 await ok(await call(env,'/api/jobs/original/service',people.worker,'PUT',{operationId:'report1',version:1,report}));
 assert.equal((await ok(await call(env,'/api/defects'))).defects.length,0,'Protocol text alone never creates a tracked defect');
 const input=defect({sourceJobId:'original',fromProtocol:true});let d=(await ok(await call(env,'/api/defects/first',people.worker,'PUT',input))).defect;assert.equal(d.createdBy,people.worker.id);assert.equal(d.priority,'low');
 const replay=await ok(await call(env,'/api/defects/first',people.worker,'PUT',input));assert.equal(replay.replayed,true);assert.equal(replay.defect.version,1);
 const converted=await ok(await call(env,'/api/defects/second-copy',people.worker,'PUT',defect({sourceJobId:'original',fromProtocol:true})));assert.equal(converted.defect.id,'first');assert.equal(converted.alreadyConverted,true);
 await ok(await call(env,'/api/jobs/original/service',people.worker,'PUT',{operationId:'report2',version:2,complete:true,report}));
 assert.equal((await ok(await call(env,'/api/defects/first'))).defect.status,'new');
 await ok(await call(env,'/api/defects/second',people.worker,'PUT',defect({title:'Poškozená tryska'})));
 d=(await ok(await call(env,'/api/defects/first',people.admin,'PUT',defect({version:d.version,sourceJobId:'original',status:'awaiting_part',assignedTo:people.worker.id})))).defect;
 await ok(await call(env,'/api/jobs/repair',people.admin,'PUT',job('g1',{defectIds:['first','second'],title:'Výměna ventilu a trysky'})));
 const linked=await ok(await call(env,'/api/defects?jobId=repair',people.worker));assert.deepEqual(linked.linkedIds.sort(),['first','second']);assert.equal(linked.defects.find(d=>d.id==='first').repairJobs[0].id,'repair');
 await ok(await call(env,'/api/jobs/repair/status',people.worker,'PATCH',{version:1,status:'done'}));assert.equal((await ok(await call(env,'/api/defects/first'))).defect.status,'awaiting_part');
 d=(await ok(await call(env,'/api/defects/first',people.worker,'PUT',defect({version:d.version,status:'resolved',assignedTo:people.worker.id,resolution:'Vyměněn ventil, tlaková zkouška OK'})))).defect;
 assert.ok(d.resolvedAt);assert.equal(d.resolvedBy,people.worker.id);assert.equal((await ok(await call(env,'/api/defects'))).defects.filter(d=>d.status!=='resolved').length,1);
 const history=await ok(await call(env,'/api/gardens/g1/history',people.worker));assert.deepEqual(history.visits.map(v=>v.jobId).sort(),['original','repair']);assert.equal(history.visits.find(v=>v.jobId==='original').work,'Zazimování');assert.equal(history.visits.find(v=>v.jobId==='original').material,'Spojka 1 ks');assert.equal(history.visits.find(v=>v.jobId==='original').hasReport,true);
 const detail=await ok(await call(env,'/api/defects/first'));assert.equal(detail.events.length,4);assert.ok(detail.events.every(e=>e.actorName&&e.at));assert.ok(detail.events.some(e=>e.record.kind==='repair_link'));
 d=(await ok(await call(env,'/api/defects/first',people.worker,'PUT',defect({version:d.version,status:'new',resolution:'Při kontrole znovu protéká'})))).defect;assert.equal(d.resolvedAt,null);assert.equal(d.resolvedBy,null);
});
test('Garden IDs isolate multi-garden customers, jobs and photo permissions stay scoped, writes are versioned and reader-proof',async()=>{
 const env=await setup();await ok(await call(env,'/api/jobs/other',people.owner,'PUT',job('g2',{customerName:'Novák',assignedTo:people.reader.id})));
 await ok(await call(env,'/api/jobs/secret',people.owner,'PUT',job('g1',{assignedTo:people.reader.id,description:'Secret job'})));
 assert.deepEqual((await ok(await call(env,'/api/gardens/g1/history',people.worker))).visits.map(v=>v.jobId),['original']);assert.equal((await ok(await call(env,'/api/gardens/g2/history',people.worker))).visits.length,0);
 assert.equal((await call(env,'/api/defects/x',people.reader,'PUT',defect())).status,403);assert.equal((await call(env,'/api/defects',people.outsider)).status,403);assert.equal((await call(env,'/api/defects',null)).status,401);
 assert.equal((await call(env,'/api/defects/wrong',people.worker,'PUT',defect({gardenId:'g2',sourceJobId:'original'}))).status,400);assert.equal((await call(env,'/api/defects/secret',people.worker,'PUT',defect({sourceJobId:'secret'}))).status,404);
 const value=defect();await ok(await call(env,'/api/defects/d1',people.worker,'PUT',value));assert.equal((await call(env,'/api/defects/d1',people.worker,'PUT',{...value,title:'Different body'})).status,409);
 assert.equal((await call(env,'/api/defects/d1',people.worker,'PUT',defect({version:0}))).status,409);assert.equal((await call(env,'/api/defects/d1',people.worker,'PUT',defect({version:1,status:'resolved'}))).status,400);
 assert.equal((await call(env,'/api/jobs/wrong-repair',people.admin,'PUT',job('g2',{defectIds:['d1']}))).status,400);assert.equal((await call(env,'/api/jobs/wrong-repair')).status,404);
 assert.equal((await call(env,'/api/defects/d2',people.worker,'PUT',defect({photos:[{jobId:'secret',id:'fake'}]}))).status,404);
 assert.equal((await call(env,'/api/defects/d2',people.worker,'PUT',defect({assignedTo:'outsider-id'}))).status,400);
 await ok(await call(env,'/api/jobs/repair',people.admin,'PUT',job('g1',{defectIds:['d1']})));assert.equal((await call(env,'/api/jobs/repair',people.admin,'PUT',job('g2',{version:1}))).status,400);
 await ok(await call(env,'/api/jobs/repair',people.admin,'PUT',job('g1',{version:1,defectIds:['d1']})));assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM garden_defect_jobs').get().n,1);assert.equal(env.sqlite.prepare("SELECT COUNT(*) n FROM garden_defect_events WHERE hash='link'").get().n,1);
});
test('Historical garden service logs are reused; source/photo files never get copied or deleted and feature gates apply',async()=>{
 const env=await setup();await ok(await call(env,'/api/gardens/g1/services/legacy',people.worker,'PUT',{version:0,mutationId:'legacy-mutation',date:'2025-10-01',work:'Starší servis',parts:'Filtr',notes:'Bez zakázky'}));
 const h=await ok(await call(env,'/api/gardens/g1/history'));assert.ok(h.visits.some(v=>v.id==='service:legacy'&&v.material==='Filtr'));assert.equal(env.objects.size,0);
 env.sqlite.prepare("UPDATE gardens SET deleted=1 WHERE id='g2'").run();assert.equal((await call(env,'/api/defects/deleted',people.worker,'PUT',defect({gardenId:'g2'}))).status,404);
 const session=await ok(await call(env,'/api/me'));await ok(await call(env,'/api/features',people.owner,'PUT',{version:session.featuresVersion,features:{...session.features,gardens:false}}));assert.equal((await call(env,'/api/defects')).status,403);assert.equal((await call(env,'/api/gardens/g1/history')).status,403);
});

test('Legacy jobs are inferred only by customer ID and one exact stored address, never by customer name or ambiguous gardens',async()=>{
 const env=await setup();await ok(await call(env,'/api/customers/c',people.owner,'PUT',{version:0,name:'Novák',phones:[],addresses:[]}));env.sqlite.prepare("UPDATE gardens SET customer_id='c',address=CASE id WHEN 'g1' THEN 'Ulice 10, Praha' ELSE 'Ulice 20, Praha' END").run();
 await ok(await call(env,'/api/jobs/legacy-address',people.owner,'PUT',job(null,{customerName:'Old name',address:'  Ulice 10, Praha  '})));
 await ok(await call(env,'/api/jobs/name-only',people.owner,'PUT',job(null,{customerName:'Novák',address:'Ulice 10, Praha'})));
 await ok(await call(env,'/api/jobs/other-garden',people.owner,'PUT',job(null,{customerName:'Novák',address:'Ulice 20, Praha'})));
 env.sqlite.prepare("UPDATE jobs SET customer_id='c' WHERE id IN ('legacy-address','other-garden')").run();
 let rows=(await ok(await call(env,'/api/gardens/g1/history'))).visits;assert.ok(rows.some(v=>v.jobId==='legacy-address'&&v.inferred));assert.ok(!rows.some(v=>['name-only','other-garden'].includes(v.jobId)));
 env.sqlite.prepare("UPDATE gardens SET address='Ulice 10, Praha' WHERE id='g2'").run();rows=(await ok(await call(env,'/api/gardens/g1/history'))).visits;assert.ok(!rows.some(v=>v.jobId==='legacy-address'));
});
test('History and defects reference private originals, respect source-job media access, and do not leak material prices',async()=>{
 const env=await setup(),headers={'x-zavlahy-request':'1','oai-authenticated-user-id':people.worker.id,'oai-authenticated-user-email':people.worker.email,'content-type':'image/jpeg','x-file-name':'ventil.jpg'};
 await ok(await api(new Request('https://zavlahy.test/api/jobs/original/service/photos/photo1',{method:'PUT',headers,body:new Uint8Array([255,216,255,219,0,1])}),env,ctx));
 await ok(await call(env,'/api/defects/photo-defect',people.worker,'PUT',defect({sourceJobId:'original',photos:[{id:'photo1',jobId:'original'}]})));
 env.sqlite.prepare("INSERT INTO service_reports(job_id,date,work,material,material_items,work_charges,billing_details,defects,notes,recommendations,photo_ids,version,updated_at,updated_by) VALUES('original','2026-10-01','Kontrola','','[{\"name\":\"Ventil\",\"quantity\":1,\"unit\":\"ks\",\"priceMinor\":99900}]','null','null','','','','[\"photo1\"]',1,1,'worker-id')").run();
 const history=await ok(await call(env,'/api/gardens/g1/history',people.worker));assert.equal(history.visits[0].photos[0].id,'photo1');assert.match(history.visits[0].material,/Ventil 1 ks/);assert.ok(!JSON.stringify(history).includes('99900'));assert.equal(env.objects.size,1);
 const visible=(await ok(await call(env,'/api/defects/photo-defect',people.worker))).defect;assert.equal(visible.photos[0].url,'/api/jobs/original/service/photos/photo1');
 const hidden=(await ok(await call(env,'/api/defects/photo-defect',people.reader))).defect;assert.equal(hidden.sourceJobId,null);assert.equal(hidden.photos.length,0);assert.equal((await call(env,visible.photos[0].url,people.reader)).status,404);
 await ok(await call(env,'/api/jobs/original',people.owner,'DELETE',{version:1}));assert.equal(env.objects.size,1);assert.equal((await ok(await call(env,'/api/defects/photo-defect'))).defect.status,'new');assert.equal((await ok(await call(env,'/api/gardens/g1/history'))).visits[0].status,'cancelled');
});
