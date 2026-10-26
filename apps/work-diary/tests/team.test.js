import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request,shaftForm} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})};
test('Invitations bind membership to authenticated email; uninvited visitors cannot read records or photos',async()=>{
 const env=environment();assert.equal((await api(request('/api/me'),env,ctx)).status,401);assert.equal((await api(request('/api/me',people.outsider),env,ctx)).status,403);
 assert.equal((await api(request('/api/me',people.owner),env,ctx)).status,200);
 assert.equal((await api(request('/api/invitations',people.owner,'POST',{email:people.worker.email,role:'worker'}),env,ctx)).status,200);
 assert.equal((await api(request('/api/me',people.worker),env,ctx)).status,200);
 assert.equal((await api(request('/api/shafts/shaft1',people.worker,'PUT',shaftForm('Šachta')),env,ctx)).status,200);
 for(const path of ['/api/shafts','/api/shafts/shaft1/photo','/api/team'])assert.equal((await api(request(path,people.outsider),env,ctx)).status,403);
 assert.equal((await api(request('/api/shafts/shaft1/photo',people.worker),env,ctx)).status,200);
});
test('Readers cannot mutate; workers cannot manage members or delete shafts; owner role is protected',async()=>{
 const env=environment();await api(request('/api/me',people.owner),env,ctx);
 for(const [person,role] of [[people.worker,'worker'],[people.reader,'reader'],[people.admin,'admin']]){await api(request('/api/invitations',people.owner,'POST',{email:person.email,role}),env,ctx);await api(request('/api/me',person),env,ctx);}
 await api(request('/api/shafts/shaft1',people.worker,'PUT',shaftForm('Společná šachta')),env,ctx);
 assert.equal((await api(request('/api/shafts',people.reader),env,ctx)).status,200);
 for(const [path,method,value] of [['/api/shafts/shaft1','PUT',shaftForm('Nesmí změnit',1,false)],['/api/shafts/shaft1','DELETE',{version:1}],['/api/zones','PUT',{zones:[],version:0}],['/api/invitations','POST',{email:'x@y.test',role:'worker'}]])assert.equal((await api(request(path,people.reader,method,value),env,ctx)).status,403);
 assert.equal((await api(request('/api/shafts/shaft1',people.worker,'DELETE',{version:1}),env,ctx)).status,403);
 assert.equal((await api(request('/api/members/owner-id',people.admin,'PATCH',{role:'reader'}),env,ctx)).status,403);
 assert.equal((await api(request('/api/invitations',people.admin,'POST',{email:'newadmin@example.com',role:'admin'}),env,ctx)).status,403);
 assert.equal((await api(request('/api/members/worker-id',people.owner,'PATCH',{role:'reader'}),env,ctx)).status,200);
 assert.equal((await api(request('/api/shafts/shaft1',people.worker,'PUT',shaftForm('Role byla změněná',1,false)),env,ctx)).status,403);
});
test('A second account sees the saved shaft, stale edits are rejected and deletion prevents resurrection',async()=>{
 const env=environment();await api(request('/api/me',people.owner),env,ctx);await api(request('/api/invitations',people.owner,'POST',{email:people.worker.email,role:'worker'}),env,ctx);await api(request('/api/me',people.worker),env,ctx);
 const saved=await (await api(request('/api/shafts/shaft1',people.owner,'PUT',shaftForm('První')),env,ctx)).json();assert.equal(saved.record.version,1);
 const list=await (await api(request('/api/shafts',people.worker),env,ctx)).json();assert.equal(list.records[0].name,'První');assert.equal(list.records[0].markers[0].zoneName,'Trávník');
 assert.equal((await api(request('/api/shafts/shaft1',people.worker,'PUT',shaftForm('Změna kolegy',1,false)),env,ctx)).status,200);
 assert.equal((await api(request('/api/shafts/shaft1',people.owner,'PUT',shaftForm('Stará verze',1,false)),env,ctx)).status,409);
 assert.equal((await api(request('/api/shafts/shaft1',people.owner,'DELETE',{version:2}),env,ctx)).status,200);
 assert.equal((await api(request('/api/shafts/shaft1/photo',people.worker),env,ctx)).status,404);
 assert.equal((await api(request('/api/shafts/shaft1',people.owner,'PUT',shaftForm('Obnova smazané',3)),env,ctx)).status,409);
});
test('Revoked users lose API/photo access and cross-origin write requests are rejected',async()=>{
 const env=environment();await api(request('/api/me',people.owner),env,ctx);await api(request('/api/invitations',people.owner,'POST',{email:people.worker.email,role:'worker'}),env,ctx);await api(request('/api/me',people.worker),env,ctx);await api(request('/api/shafts/shaft1',people.owner,'PUT',shaftForm('Šachta')),env,ctx);
 assert.equal((await api(request('/api/shafts/shaft1',people.worker,'PUT',shaftForm('CSRF',1,false),{origin:'https://evil.test'}),env,ctx)).status,403);
 assert.equal((await api(request('/api/members/worker-id',people.owner,'DELETE'),env,ctx)).status,200);
 assert.equal((await api(request('/api/shafts',people.worker),env,ctx)).status,403);assert.equal((await api(request('/api/shafts/shaft1/photo',people.worker),env,ctx)).status,403);
});
