import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request,shaftForm} from './fixtures.mjs';
import {DEFAULT_FEATURES,normalizeFeatures,featureEnabled} from '../web/features.js';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx);
async function setup(){const env=environment();await call(env,'/api/me');for(const role of ['admin','worker','reader']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}return env;}
test('Team feature settings default on, are shared and require manager permissions',async()=>{
 const env=await setup();assert.deepEqual((await(await call(env,'/api/features',people.reader)).json()).features,DEFAULT_FEATURES);
 const features={...DEFAULT_FEATURES,service:false,map:false};
 for(const person of [people.worker,people.reader])assert.equal((await call(env,'/api/features',person,'PUT',{features,version:0})).status,403);
 const r=await call(env,'/api/features',people.admin,'PUT',{features,version:0});assert.equal(r.status,200);assert.equal((await r.json()).featuresVersion,1);
 for(const person of [people.worker,people.reader]){const session=await(await call(env,'/api/me',person)).json();assert.equal(session.features.service,false);assert.equal(session.featuresVersion,1);}
 assert.equal((await api(request('/api/features'),env,ctx)).status,401);assert.equal((await call(env,'/api/features',people.outsider)).status,403);
 assert.equal((await call(env,'/api/features',people.owner,'PUT',{features:DEFAULT_FEATURES,version:0})).status,409);
 for(const bad of [{...features,service:'false'},{...features,unknown:true},{service:false},null])assert.equal((await call(env,'/api/features',people.owner,'PUT',{features:bad,version:1})).status,400);
 assert.equal((await(await call(env,'/api/features')).json()).featuresVersion,1);
});
test('Disabling and re-enabling functions preserves gardens, plans, services, zones and photos',async()=>{
 const env=await setup();await call(env,'/api/gardens',people.owner,'POST',{id:'g1',name:'Zahrada',address:'Adresa',notes:'',pumpType:'Grundfos'});
 await call(env,'/api/gardens/g1/services/s1',people.owner,'PUT',{version:0,date:'2026-10-10',work:'Servis',parts:'Filtr',notes:''});
 const form=shaftForm('Šachta'),value=JSON.parse(form.get('record'));form.set('record',JSON.stringify({...value,gardenId:'g1',position:{latitude:50,longitude:14,accuracy:null}}));await call(env,'/api/shafts/shaft1',people.owner,'PUT',form);
 const before={gardens:env.sqlite.prepare('SELECT * FROM gardens').all(),shafts:env.sqlite.prepare('SELECT * FROM shafts').all(),services:env.sqlite.prepare('SELECT * FROM service_logs').all(),files:env.objects.size};
 const off=Object.fromEntries(Object.keys(DEFAULT_FEATURES).map(k=>[k,false]));assert.equal((await call(env,'/api/features',people.owner,'PUT',{features:off,version:0})).status,200);assert.equal((await call(env,'/api/features',people.owner,'PUT',{features:DEFAULT_FEATURES,version:1})).status,200);
 assert.deepEqual({gardens:env.sqlite.prepare('SELECT * FROM gardens').all(),shafts:env.sqlite.prepare('SELECT * FROM shafts').all(),services:env.sqlite.prepare('SELECT * FROM service_logs').all(),files:env.objects.size},before);
 assert.equal(featureEnabled('service',{...DEFAULT_FEATURES,gardens:false}),false);assert.equal(featureEnabled('map',{...DEFAULT_FEATURES,location:false}),false);assert.equal(normalizeFeatures({service:false}).pump,true);
});
