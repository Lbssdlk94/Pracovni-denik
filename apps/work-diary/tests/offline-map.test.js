import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request,shaftForm} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})};
const call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx);
async function setup(){const env=environment();await call(env,'/api/me');await call(env,'/api/gardens',people.owner,'POST',{id:'garden1',name:'GPS zahrada',address:'',notes:''});for(const role of ['worker','reader']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}return env;}
test('Service retries after a lost acknowledgement are idempotent and preserve concurrent changes',async()=>{
 const env=await setup(),url='/api/gardens/garden1/services/service1';
 const original={version:0,mutationId:'mutation1',date:'2026-10-10',work:'Kontrola',parts:'Filtr',notes:''};
 for(let i=0;i<3;i++){const r=await call(env,url,people.worker,'PUT',original);assert.equal(r.status,200);assert.equal((await r.json()).service.version,1);}
 const edit={...original,version:1,mutationId:'mutation2',work:'Zazimování'};
 for(let i=0;i<2;i++){const r=await call(env,url,people.worker,'PUT',edit);assert.equal(r.status,200);assert.equal((await r.json()).service.version,2);}
 assert.equal((await call(env,url,people.owner,'PUT',edit)).status,409);
 assert.equal((await call(env,url,people.reader,'PUT',edit)).status,403);
 await call(env,url,people.owner,'PUT',{...edit,version:2,mutationId:'mutation3',work:'Kolega změnil filtr'});
 assert.equal((await call(env,url,people.worker,'PUT',edit)).status,409);
 const rows=(await(await call(env,'/api/gardens/garden1/services')).json()).services;assert.equal(rows.length,1);assert.equal(rows[0].work,'Kolega změnil filtr');assert.equal(rows[0].version,3);
});
test('Shaft GPS is shared, old clients preserve it, removal and bounds are validated',async()=>{
 const env=await setup(),url='/api/shafts/gps-shaft',position={latitude:50.087,longitude:14.421,accuracy:7};
 const form=shaftForm('GPS šachta'),value=JSON.parse(form.get('record'));form.set('record',JSON.stringify({...value,gardenId:'garden1',position}));
 assert.equal((await call(env,url,people.worker,'PUT',form)).status,200);
 assert.deepEqual((await(await call(env,'/api/shafts',people.reader)).json()).records[0].position,position);
 assert.equal((await call(env,url,people.worker,'PUT',shaftForm('Starý klient',1,false))).status,200);
 assert.deepEqual((await(await call(env,'/api/shafts')).json()).records[0].position,position);
 for(const invalid of [{...position,latitude:91},{...position,longitude:-181},{...position,accuracy:-1},{...position,latitude:'50.087'}]){const bad=shaftForm('Chyba',2,false);bad.set('record',JSON.stringify({...JSON.parse(bad.get('record')),position:invalid}));assert.equal((await call(env,url,people.worker,'PUT',bad)).status,400);}
 const remove=shaftForm('Bez polohy',2,false);remove.set('record',JSON.stringify({...JSON.parse(remove.get('record')),position:null}));assert.equal((await call(env,url,people.reader,'PUT',remove)).status,403);assert.equal((await call(env,url,people.worker,'PUT',remove)).status,200);assert.equal((await(await call(env,'/api/shafts')).json()).records[0].position,null);
});
