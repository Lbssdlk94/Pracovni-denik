import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {createDirectoryCache} from '../web/directory-cache.js';

test('Actual workspace API retains discipline visibility and revokes saved directory after grant reduction',async()=>{
 const env=environment(),ctx={waitUntil:p=>p.catch(()=>{})};
 const call=async(path,person=people.owner,method='GET',data)=>{
  const response=await api(request(path,person,method,data),env,ctx);
  assert.equal(response.status,200,await response.clone().text());return response.json();
 };
 try{
  await call('/api/me');await call('/api/invitations',people.owner,'POST',{email:people.worker.email,role:'worker'});await call('/api/me',people.worker);
  for(const id of ['shared','hidden'])await call('/api/customers/'+id,people.owner,'PUT',{version:0,name:id,phones:[],addresses:[{id:id+'-address',address:'Lipová 1',city:'Blatná'}]});
  const garden=(await call('/api/gardens')).gardens.find(g=>g.customerId==='shared');assert.ok(garden);
  const job={title:'Izolovaná návštěva',customerId:'shared',gardenId:garden.id,assignedTo:people.worker.id,status:'planned'};
  await call('/api/jobs/assigned',people.owner,'PUT',{...job,version:0});
  const s=env.sqlite,installation=s.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").get().instance_id;
  s.exec("INSERT INTO workspaces VALUES('w','preparing',1,1,1)");
  s.prepare("INSERT INTO workspace_organizations VALUES('source-org','w',?,'irrigation','Test')").run(installation);
  for(const role of ['owner','worker']){
   const p=s.prepare('SELECT * FROM members WHERE user_id=?').get(people[role].id);
   s.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,?, 'original')").run(installation,p.user_id,p.user_id,p.role,p.email,p.name,people.owner.id,1);
   s.prepare("INSERT INTO workspace_member_grants VALUES(?,'source-org',?)").run(p.user_id,p.role);
   s.prepare("INSERT INTO member_disciplines VALUES(?,'irrigation')").run(p.user_id);
  }
  s.exec("INSERT OR IGNORE INTO customer_disciplines VALUES('shared','irrigation'),('hidden','garden');INSERT OR IGNORE INTO garden_disciplines SELECT id,'irrigation' FROM gardens;UPDATE jobs SET discipline='irrigation';UPDATE workspaces SET state='active'");
  const session=await call('/api/me',people.worker);let saved=null,online=true;
  const cache=createDirectoryCache({read:async()=>structuredClone(saved),write:async v=>{saved=structuredClone(v);},scope:()=>JSON.stringify([session.user.id,session.workspace]),getSession:()=>session,online:()=>online,send:async(path,options={})=>{
   const response=await api(request(path,people.worker,options.method||'GET',options.body?JSON.parse(options.body):undefined,{'x-work-discipline':session.workspace.selectedDiscipline}),env,ctx);
   const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return value;
  }});
  assert.deepEqual((await cache.request('/api/customers')).customers.map(c=>c.id),['shared']);
  assert.equal((await cache.request('/api/customers/shared')).customer.gardens.length,1);
  online=false;assert.equal((await cache.request('/api/customers?q=blatna')).customers.length,1);online=true;
  // Existing workspace customer access follows discipline, not job assignment.
  await call('/api/jobs/assigned',people.owner,'PUT',{...job,version:1,assignedTo:people.owner.id,discipline:'irrigation'});
  assert.deepEqual((await cache.request('/api/customers',{forceNetwork:true})).customers.map(c=>c.id),['shared']);
  s.prepare('DELETE FROM member_disciplines WHERE user_id=?').run(people.worker.id);s.exec('UPDATE workspaces SET authorization_revision=authorization_revision+1');
  await assert.rejects(cache.request('/api/customers',{forceNetwork:true}));assert.equal(saved,null);
 }finally{env.sqlite.close();}
});
