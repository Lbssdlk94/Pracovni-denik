import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
import {subToday} from '../web/subscription-model.js';import {materialTotals,materialQuantity} from '../web/material-model.js';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(e,path,p=people.owner,method='GET',value)=>api(request(path,p,method,value),e,ctx);
async function good(r){assert.equal(r.status,200,await r.clone().text());return r.json();}
async function setup(){const e=environment();await good(await call(e,'/api/me'));for(const role of ['admin','worker','reader']){await good(await call(e,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await good(await call(e,'/api/me',people[role]));}await good(await call(e,'/api/jobs/material-job',people.owner,'PUT',{version:0,title:'Protokol s materiálem',assignedTo:people.worker.id,status:'planned'}));return e;}
const item={version:0,name:'Trubka PE 32',categoryId:'material-category-pipes',sku:'PE32',unit:'m',priceMinor:2501,currency:'CZK',active:true};
test('Preferred material confirms the exact reviewed rows when D1 counts include trigger writes',async()=>{
 const e=await setup();try{
  for(const id of ['count-a','count-b','count-c'])await good(await call(e,'/api/materials/items/'+id,people.owner,'PUT',{...item,sku:id}));
  const batch=e.DB.batch;e.DB.batch=async statements=>(await batch(statements)).map(result=>({...result,meta:{...result.meta,changes:result.meta.changes?result.meta.changes+3:0}}));
  const result=await good(await call(e,'/api/materials/preferred',people.owner,'POST',{primaryId:'count-a',items:['count-a','count-b','count-c'].map(id=>({id,version:1}))}));
  assert.deepEqual(result,{ok:true,primaryId:'count-a',hidden:2});assert.deepEqual(e.sqlite.prepare("SELECT id,active,version FROM material_items WHERE id LIKE 'count-%' ORDER BY id").all().map(row=>({...row})),[{id:'count-a',active:1,version:1},{id:'count-b',active:0,version:2},{id:'count-c',active:0,version:2}]);
 }finally{e.sqlite.close();}
});
test('Every authenticated role reads materials; only managers edit catalogue and prices',async()=>{
 const e=await setup();try{const catalog=await good(await call(e,'/api/materials'));assert.ok(catalog.categories.some(c=>c.name==='Trubky'));assert.ok(catalog.categories.some(c=>c.name==='Elektro'));assert.ok(catalog.items.length>=29);
 for(const person of [people.admin,people.worker,people.reader])await good(await call(e,'/api/materials',person));
 for(const person of [people.worker,people.reader]){for(const [path,method,value]of [['/api/materials/categories/test','PUT',{version:0,name:'Kategorie',sortOrder:1,active:true}],['/api/materials/items/private','PUT',item],['/api/materials/items/private','DELETE',{version:1}]])assert.equal((await call(e,path,person,method,value)).status,403);}
 assert.equal((await api(request('/api/materials'),e,ctx)).status,401);
 await good(await call(e,'/api/materials/categories/test',people.owner,'PUT',{version:0,name:'Filtrace',sortOrder:-1,active:true}));assert.equal((await good(await call(e,'/api/materials'))).categories[0].name,'Filtrace');
 await good(await call(e,'/api/materials/categories/test',people.owner,'PUT',{version:1,name:'Filtry a filtrace',sortOrder:7,active:true}));assert.equal((await call(e,'/api/materials/categories/test',people.owner,'PUT',{version:1,name:'Starý zápis',sortOrder:7,active:true})).status,409);
 await good(await call(e,'/api/materials/categories/test',people.owner,'DELETE',{version:2}));assert.equal((await good(await call(e,'/api/materials'))).categories.find(c=>c.id==='test').active,false);
 }finally{e.sqlite.close();}
});
test('Reports share material snapshots, preserve prices through team edits and keep work charges private',async()=>{
 const e=await setup();try{
 await good(await call(e,'/api/materials/items/pipe',people.owner,'PUT',item));const path='/api/jobs/material-job/service',value={version:1,operationId:'material-report',report:{date:subToday(),material:'Ruční poznámka',materialItems:[{itemId:'pipe',itemVersion:1,quantity:12.345,name:'Podvržený název',priceMinor:1}]}};
 let r=await good(await call(e,path,people.owner,'PUT',value));assert.equal(r.report.materialItems[0].name,item.name);assert.equal(r.report.materialItems[0].priceMinor,2501);assert.deepEqual(materialTotals(r.report.materialItems),[{currency:'CZK',amount:30875}]);
 await good(await call(e,path,people.owner,'PUT',value));assert.equal(e.sqlite.prepare('SELECT count(*) n FROM service_report_history').get().n,1);
 await good(await call(e,'/api/materials/items/pipe',people.owner,'PUT',{...item,version:1,name:'Trubka PE 32 nová',priceMinor:9999}));r=await good(await call(e,path));assert.equal(r.report.materialItems[0].priceMinor,2501);
 for(const person of [people.admin,people.worker]){const other=await good(await call(e,path,person));assert.equal(other.report.materialItems[0].priceMinor,2501);assert.ok(!Object.hasOwn(other.report,'workCharges'));assert.ok(other.history.every(h=>!JSON.stringify(h).includes('workCharges')));assert.equal((await call(e,path,person,'PUT',{version:other.job.version,operationId:'forged-'+person.id,report:{date:subToday(),workCharges:{}}})).status,403);}
 const worker=await good(await call(e,path,people.worker));await good(await call(e,path,people.worker,'PUT',{version:worker.job.version,operationId:'worker-note',report:{date:subToday(),work:'Kontrola systému'}}));r=await good(await call(e,path));assert.equal(r.report.materialItems[0].priceMinor,2501);assert.equal(r.report.materialItems[0].quantity,12.345);
 // A previously selected catalogue revision can be synchronized later without repricing.
 await good(await call(e,'/api/jobs/old-selection',people.owner,'PUT',{version:0,title:'Dříve vybraný materiál',assignedTo:people.owner.id,status:'planned'}));const old=await good(await call(e,'/api/jobs/old-selection/service',people.owner,'PUT',{version:1,operationId:'offline-price',report:{date:subToday(),materialItems:[{itemId:'pipe',itemVersion:1,quantity:2}]}}));assert.equal(old.report.materialItems[0].priceMinor,2501);
 await good(await call(e,'/api/materials/items/pipe',people.owner,'DELETE',{version:2}));const before=await good(await call(e,path));await good(await call(e,path,people.owner,'PUT',{version:before.job.version,operationId:'old-hidden-price',report:{date:subToday(),materialItems:[{itemId:'pipe',itemVersion:1,quantity:3}]}}));assert.equal((await call(e,'/api/jobs/old-selection/service',people.owner,'PUT',{version:old.job.version,operationId:'hidden-new-version',report:{date:subToday(),materialItems:[{itemId:'pipe',itemVersion:2,quantity:1}]}})).status,409);
 }finally{e.sqlite.close();}
});
test('Quantity precision and minor-unit totals are validated',()=>{assert.equal(materialQuantity('12,345'),12.345);for(const v of [0,-1,'',NaN,1.0001,1000001])assert.throws(()=>materialQuantity(v));assert.deepEqual(materialTotals([{priceMinor:2501,quantity:12.345,currency:'CZK'},{priceMinor:10,quantity:.5,currency:'CZK'},{priceMinor:100,quantity:2,currency:'EUR'}]),[{currency:'CZK',amount:30880},{currency:'EUR',amount:200}]);});
test('Removing material is distinct from hiding, keeps frozen reports and revisions, and prevents resurrection',async()=>{
 const e=await setup();try{
  await good(await call(e,'/api/materials/items/delete-pipe',people.owner,'PUT',item));
  const path='/api/jobs/material-job/service';let report=await good(await call(e,path,people.owner,'PUT',{version:1,operationId:'before-delete',report:{date:subToday(),materialItems:[{itemId:'delete-pipe',itemVersion:1,quantity:2}]}}));
  const frozen=report.report.materialItems[0],remove={version:1,remove:true};
  for(const p of [people.worker,people.reader])assert.equal((await call(e,'/api/materials/items/delete-pipe',p,'DELETE',remove)).status,403);
  assert.equal((await call(e,'/api/materials/items/delete-pipe',people.owner,'DELETE',{version:0,remove:true})).status,409);
  await good(await call(e,'/api/materials/items/delete-pipe',people.owner,'DELETE',remove));await good(await call(e,'/api/materials/items/delete-pipe',people.owner,'DELETE',remove));
  const deleted=e.sqlite.prepare("SELECT deleted,active,version FROM material_items WHERE id='delete-pipe'").get();assert.deepEqual({...deleted},{deleted:1,active:0,version:2});
  assert.equal((await good(await call(e,'/api/materials'))).items.some(i=>i.id==='delete-pipe'),false);assert.equal(e.sqlite.prepare("SELECT count(*) n FROM material_item_revisions WHERE item_id='delete-pipe'").get().n,1);
  assert.equal((await call(e,'/api/materials/items/delete-pipe',people.owner,'PUT',{...item,version:2,active:true})).status,404);
  assert.deepEqual((await good(await call(e,path))).report.materialItems[0],frozen);
  report=await good(await call(e,path,people.owner,'PUT',{version:report.job.version,operationId:'after-delete',report:{date:subToday(),work:'Doplněná kontrola',materialItems:[{itemId:'delete-pipe',itemVersion:1,quantity:3}]}}));assert.equal(report.report.materialItems[0].priceMinor,frozen.priceMinor);assert.equal(report.report.materialItems[0].quantity,3);
  await good(await call(e,'/api/jobs/new-material-job',people.owner,'PUT',{version:0,title:'Nová práce',assignedTo:people.owner.id,status:'planned'}));assert.equal((await call(e,'/api/jobs/new-material-job/service',people.owner,'PUT',{version:1,operationId:'deleted-selection',report:{date:subToday(),materialItems:[{itemId:'delete-pipe',itemVersion:1,quantity:1}]}})).status,409);
  await good(await call(e,'/api/materials/items/hidden-pipe',people.owner,'PUT',item));await good(await call(e,'/api/materials/items/hidden-pipe',people.owner,'DELETE',{version:1}));assert.equal((await good(await call(e,'/api/materials'))).items.find(i=>i.id==='hidden-pipe').active,false);await good(await call(e,'/api/materials/items/hidden-pipe',people.owner,'DELETE',{version:2,remove:true}));assert.equal((await good(await call(e,'/api/materials'))).items.some(i=>i.id==='hidden-pipe'),false);
 }finally{e.sqlite.close();}
});
test('Explicit preferred material hides only reviewed alternatives atomically and preserves report snapshots',async()=>{const e=await setup();try{
 for(const id of ['preferred-a','preferred-b'])await good(await call(e,'/api/materials/items/'+id,people.owner,'PUT',{...item,name:'Blazing',sku:id==='preferred-a'?'Rozměr A':'Rozměr B'}));
 const path='/api/jobs/material-job/service';await good(await call(e,path,people.owner,'PUT',{version:1,operationId:'freeze-choice',report:{date:subToday(),materialItems:[{itemId:'preferred-b',itemVersion:1,quantity:2}]}}));const snapshot=(await good(await call(e,path))).report.materialItems;
 const value={primaryId:'preferred-a',items:[{id:'preferred-a',version:1},{id:'preferred-b',version:1}]};for(const who of [people.worker,people.reader])assert.equal((await call(e,'/api/materials/preferred',who,'POST',value)).status,403);
 assert.equal((await call(e,'/api/materials/preferred',people.owner,'POST',{...value,items:[{id:'preferred-a',version:1},{id:'preferred-b',version:2}]})).status,409);assert.equal(e.sqlite.prepare("SELECT active FROM material_items WHERE id='preferred-b'").get().active,1);
 await good(await call(e,'/api/materials/preferred',people.owner,'POST',value));assert.equal(e.sqlite.prepare("SELECT active FROM material_items WHERE id='preferred-b'").get().active,0);assert.equal(e.sqlite.prepare("SELECT version FROM material_items WHERE id='preferred-a'").get().version,1);assert.deepEqual((await good(await call(e,path))).report.materialItems,snapshot);
 const prepare=e.DB.prepare;e.DB.prepare=sql=>{if(sql.startsWith('UPDATE material_items SET active=0,version='))e.sqlite.exec("UPDATE members SET role='worker' WHERE user_id='owner-id'");return prepare(sql);};
 // Restore alternative then revoke owner only at mutation time.
 e.sqlite.prepare("UPDATE material_items SET active=1,version=3 WHERE id='preferred-b'").run();assert.equal((await call(e,'/api/materials/preferred',people.owner,'POST',{...value,items:[{id:'preferred-a',version:1},{id:'preferred-b',version:3}]})).status,409);assert.equal(e.sqlite.prepare("SELECT active FROM material_items WHERE id='preferred-b'").get().active,1);
 }finally{e.sqlite.close();}});

test('Managers manage materials; assigned workers select canonical revisions, readers and unassigned workers cannot write protocols',async()=>{const e=await setup();try{
 await good(await call(e,'/api/materials/items/admin-pipe',people.admin,'PUT',item));
 const administrator={id:'administrator-id',email:'administrator@example.com'};
 await good(await call(e,'/api/invitations',people.owner,'POST',{email:administrator.email,role:'administrator'}));await good(await call(e,'/api/me',administrator));
 await good(await call(e,'/api/materials/items/administrator-pipe',administrator,'PUT',item));
 const path='/api/jobs/material-job/service',value={version:1,operationId:'worker-catalogue',report:{date:subToday(),work:'Výměna trubky',materialItems:[{itemId:'admin-pipe',itemVersion:1,quantity:2,priceMinor:1}]}};
 let saved=await good(await call(e,path,people.worker,'PUT',value));assert.equal(saved.report.materialItems[0].priceMinor,2501);assert.equal(saved.report.materialItems[0].quantity,2);
 const repeated=await good(await call(e,path,people.worker,'PUT',value));assert.equal(repeated.replayed,true);
 assert.equal((await call(e,path,people.reader)).status,404);
 assert.equal((await call(e,path,people.reader,'PUT',{...value,version:saved.job.version,operationId:'reader-write'})).status,404);
 await good(await call(e,'/api/jobs/another-team-job',people.owner,'PUT',{version:0,title:'Jiná návštěva',assignedTo:people.owner.id,status:'planned'}));
 assert.equal((await call(e,'/api/jobs/another-team-job/service',people.worker)).status,404);
 assert.equal((await call(e,'/api/jobs/another-team-job/service',people.worker,'PUT',{...value,operationId:'unassigned-write'})).status,404);
 await good(await call(e,'/api/materials/items/admin-pipe',people.admin,'PUT',{...item,version:1,priceMinor:9999}));
 saved=await good(await call(e,path,people.worker,'PUT',{...value,version:saved.job.version,operationId:'worker-offline',report:{...value.report,materialItems:[{itemId:'admin-pipe',itemVersion:1,quantity:3}]}}));assert.equal(saved.report.materialItems[0].priceMinor,2501);
 }finally{e.sqlite.close();}});
test('A disabled material module blocks every catalogue role and new protocol selections without erasing historical lines',async()=>{const e=await setup();try{
 await good(await call(e,'/api/materials/items/disabled-pipe',people.owner,'PUT',item));
 e.sqlite.prepare("INSERT OR REPLACE INTO settings(key,value,version) VALUES('features',?,1)").run(JSON.stringify({materials:false}));
 for(const actor of [people.owner,people.admin,people.worker,people.reader])assert.equal((await call(e,'/api/materials',actor)).status,403);
 assert.equal((await call(e,'/api/jobs/material-job/service',people.worker,'PUT',{version:1,operationId:'disabled-selection',report:{materialItems:[{itemId:'disabled-pipe',itemVersion:1,quantity:1}]}})).status,403);
 assert.equal(e.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n,0);
 }finally{e.sqlite.close();}});
