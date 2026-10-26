import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';import {validateBackup} from '../web/model.js';
const ctx={waitUntil:p=>p.catch(()=>{})},g={id:'garden1',name:'Zahrada Novákovi',address:'Ulice 12',notes:'',pumpType:'Ponorné – Grundfos SQ 2-55'},s={version:0,date:'2026-10-09',work:'Kontrola filtru a pročištění systému',parts:'Ventil Hunter PGV a těsnění filtru',notes:'Příště zkontrolovat tlak'};
const call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx);
async function setup(){const env=environment();await call(env,'/api/me');await call(env,'/api/gardens',people.owner,'POST',g);await call(env,'/api/gardens',people.owner,'POST',{...g,id:'garden2'});for(const role of ['worker','reader']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}return env;}
const url='/api/gardens/garden1/services';
test('Pump type is shared; old clients preserve it and existing data survives migration',async()=>{
 const env=await setup();const gardens=await(await call(env,'/api/gardens',people.reader)).json();assert.equal(gardens.gardens[0].pumpType,g.pumpType);
 const oldClient={...g,version:1};delete oldClient.pumpType;assert.equal((await call(env,'/api/gardens/garden1',people.worker,'PATCH',oldClient)).status,200);assert.equal((await(await call(env,'/api/gardens')).json()).gardens[0].pumpType,g.pumpType);
 assert.equal((await call(env,'/api/gardens/garden1',people.worker,'PATCH',{...g,version:2,pumpType:'Povrchové – DAB'})).status,200);
 assert.equal((await call(env,'/api/gardens/garden1',people.reader,'PATCH',{...g,version:3})).status,403);
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('drizzle/0000_eminent_black_panther.sql','utf8'));db.exec(readFileSync('drizzle/0001_mixed_vector.sql','utf8'));db.exec("INSERT INTO gardens(id,name,address,notes,version,plan_key,created_at,updated_at,created_by,updated_by) VALUES('old','Původní','Adresa','Poznámka',4,'old-plan',1,2,'owner','owner')");db.exec(readFileSync('drizzle/0002_lush_mattie_franklin.sql','utf8'));const row=db.prepare('SELECT * FROM gardens').get();assert.equal(row.version,4);assert.equal(row.plan_key,'old-plan');assert.equal(row.pump_type,null);db.close();
});
test('Service entries are scoped to each garden, shared with colleagues and ordered by service date',async()=>{
 const env=await setup();const saved=await(await call(env,url+'/s1',people.worker,'PUT',s)).json();assert.equal(saved.service.version,1);assert.equal(saved.service.createdBy,people.worker.id);assert.equal(saved.service.authorName,people.worker.email);
 await call(env,url+'/s2',people.owner,'PUT',{...s,date:'2026-03-01',work:'Jarní spuštění'});const rows=await(await call(env,url,people.reader)).json();assert.deepEqual(rows.services.map(r=>r.id),['s1','s2']);assert.equal(rows.services[0].parts,s.parts);
 assert.equal((await(await call(env,'/api/gardens/garden2/services',people.reader)).json()).services.length,0);
 assert.equal((await call(env,'/api/gardens/garden2/services/s1',people.owner,'PUT',{...s,version:1})).status,404);
 assert.equal((await call(env,url+'/s1',people.reader,'PUT',{...s,version:1})).status,403);assert.equal((await call(env,url+'/s1',people.worker,'DELETE',{version:1})).status,403);
 assert.equal((await call(env,url,people.outsider)).status,403);assert.equal((await api(request(url),env,ctx)).status,401);
});
test('Concurrent edits preserve winner; deletion prevents resurrection; invalid service dates and CSRF are rejected',async()=>{
 const env=await setup();await call(env,url+'/s1',people.worker,'PUT',s);assert.equal((await call(env,url+'/s1',people.owner,'PUT',{...s,version:1,work:'Změna kolegy'})).status,200);
 const conflict=await call(env,url+'/s1',people.worker,'PUT',{...s,version:1,work:'Starší verze'});assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'service_conflict');assert.equal((await(await call(env,url)).json()).services[0].work,'Změna kolegy');
 for(const date of ['2026-02-30','2026-13-01','9.10.2026'])assert.equal((await call(env,url+'/bad',people.owner,'PUT',{...s,date})).status,400);
 assert.equal((await call(env,url+'/bad',people.owner,'PUT',{...s,work:''})).status,400);
 assert.equal((await api(request(url+'/s1',people.worker,'PUT',{...s,version:2},{origin:'https://evil.test'}),env,ctx)).status,403);
 assert.equal((await call(env,url+'/s1',people.owner,'DELETE',{version:2})).status,200);assert.equal((await call(env,url+'/s1',people.owner,'PUT',{...s,version:3})).status,409);assert.equal((await(await call(env,url)).json()).services.length,0);
 await call(env,'/api/members/worker-id',people.owner,'DELETE');assert.equal((await call(env,url,people.worker)).status,403);
});
test('Backups include pump and service history, accept older formats, and reject invalid dates or cross-garden service IDs',()=>{
 const backup={format:'zavlahovy-denik',version:3,records:[],zones:[],gardens:[{...g,plan:null,services:[{...s,id:'s1',gardenId:g.id}]}]};assert.equal(validateBackup(backup),backup);
 for(const version of [1,2])assert.equal(validateBackup({format:'zavlahovy-denik',version,records:[],zones:[],gardens:version===2?[{...g,plan:null}]:undefined}).version,version);
 for(const bad of [{...s,id:'s1',date:'2026-02-30'},{...s,id:'s1',gardenId:'garden2'},{...s,id:'s1',work:''}])assert.throws(()=>validateBackup({...backup,gardens:[{...g,services:[bad]}]}));
 assert.throws(()=>validateBackup({...backup,gardens:[backup.gardens[0],{...g,id:'garden2',services:[{...s,id:'s1'}]}]}));
});
