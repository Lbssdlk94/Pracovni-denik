import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {api} from '../worker/api.js';import {environment,people,request,shaftForm} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})};
const call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx);
async function setup(){const env=environment();await call(env,'/api/me');for(const role of ['worker','reader']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}return env;}
const newGarden={id:'garden1',name:'Novákovi',address:'Ulice 12',notes:'Tři šachty'};
function assigned(name,gardenId,version=0,photo=true){const form=shaftForm(name,version,photo),record=JSON.parse(form.get('record'));record.gardenId=gardenId;form.set('record',JSON.stringify(record));return form;}
function plan(version,text='%PDF-1.4\nplan závlahy',name='plán.pdf'){const form=new FormData();form.set('version',String(version));form.set('plan',new Blob([text],{type:'application/pdf'}),name);return form;}
test('Three shafts share a garden, old clients preserve assignment and invalid folders leave no uploaded files',async()=>{
 const env=await setup();assert.equal((await call(env,'/api/gardens',people.worker,'POST',newGarden)).status,200);
 for(let i=1;i<=3;i++)assert.equal((await call(env,'/api/shafts/shaft'+i,people.worker,'PUT',assigned('Šachta '+i,'garden1'))).status,200);
 const list=await(await call(env,'/api/shafts',people.reader)).json();assert.equal(list.records.filter(r=>r.gardenId==='garden1').length,3);
 assert.equal((await call(env,'/api/shafts/shaft1',people.owner,'PUT',shaftForm('Starší aplikace',1,false))).status,200);
 assert.equal((await(await call(env,'/api/shafts')).json()).records.find(r=>r.id==='shaft1').gardenId,'garden1');
 const count=env.objects.size;assert.equal((await call(env,'/api/shafts/invalid',people.owner,'PUT',assigned('Chyba','missing'))).status,400);assert.equal(env.objects.size,count);
 assert.equal((await call(env,'/api/shafts/shaft1',people.owner,'PUT',assigned('Přesun',null,2,false))).status,200);assert.equal((await(await call(env,'/api/shafts')).json()).records.find(r=>r.id==='shaft1').gardenId,null);
});
test('Team members can read plans; readers and outsiders cannot upload; conflicts preserve winner and metadata edits retain plans',async()=>{
 const env=await setup();await call(env,'/api/gardens',people.owner,'POST',newGarden);
 assert.equal((await call(env,'/api/gardens/garden1/plan',people.reader,'PUT',plan(1))).status,403);
 assert.equal((await call(env,'/api/gardens',people.reader,'POST',{...newGarden,id:'forbidden'})).status,403);
 const saved=await(await call(env,'/api/gardens/garden1/plan',people.worker,'PUT',plan(1))).json();assert.equal(saved.garden.plan.type,'application/pdf');assert.equal(saved.garden.version,2);
 const read=await call(env,'/api/gardens/garden1/plan',people.reader);assert.equal(read.status,200);assert.equal(await read.text(),'%PDF-1.4\nplan závlahy');assert.match(read.headers.get('content-disposition'),/UTF-8/);
 assert.equal((await call(env,'/api/gardens/garden1/plan',people.outsider)).status,403);assert.equal((await api(request('/api/gardens/garden1/plan'),env,ctx)).status,401);
 assert.equal((await call(env,'/api/gardens/garden1/plan',people.owner,'PUT',plan(1,'wrong'))).status,409);assert.equal(env.objects.size,1);
 assert.equal((await call(env,'/api/gardens/garden1',people.worker,'PATCH',{...newGarden,name:'Novákovi – zahrada',version:2})).status,200);
 assert.equal((await(await call(env,'/api/gardens')).json()).gardens[0].plan.version,saved.garden.plan.version);
 assert.equal((await call(env,'/api/gardens/garden1/plan',people.worker,'PUT',plan(3,'<svg/>','x.pdf'))).status,400);assert.equal(env.objects.size,1);
 assert.equal((await call(env,'/api/gardens/garden1/plan',people.worker,'PUT',plan(3,new Uint8Array([137,80,78,71,13,10,26,10]),'plan.png'))).status,200);assert.equal(env.objects.size,1);
 await call(env,'/api/members/reader-id',people.owner,'DELETE');assert.equal((await call(env,'/api/gardens/garden1/plan',people.reader)).status,403);
});
test('Garden migration preserves all existing shafts without assigning a guessed garden',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('drizzle/0000_eminent_black_panther.sql','utf8'));
 db.exec("INSERT INTO shafts VALUES('old','Původní','Místo','Poznámka','[]','photo','v',3,100,200,'owner','owner',0)");
 db.exec(readFileSync('drizzle/0001_mixed_vector.sql','utf8'));const row=db.prepare('SELECT * FROM shafts').get();assert.equal(row.name,'Původní');assert.equal(row.version,3);assert.equal(row.garden_id,null);assert.equal(row.image_key,'photo');db.close();
});
