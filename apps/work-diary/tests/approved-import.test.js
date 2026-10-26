import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,request,people} from './fixtures.mjs';
import {createHash} from 'node:crypto';
const token='a'.repeat(64),ctx={waitUntil(){}};
function setup(){
 const env=environment();
 for(const [key,p]of Object.entries(people))if(key!=='outsider')env.sqlite.prepare('INSERT INTO members VALUES(?,?,?,?,?)').run(p.id,p.email,key,key,1);
 const batch={id:'test-batch',tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:Date.now()+60000,assigneeEmail:people.worker.email,
  customers:[{id:'contact',name:'Testovací zákazník',phones:[{id:'phone',number:'+420123456789'}],addresses:[{id:'address',address:'Testovací 1',city:'Praha'}]}],
  gardens:[{id:'garden',customerId:'contact',name:'Zahrada',address:'Testovací 1'}],
  jobs:[{id:'job',title:'Zazimování #1',description:'Čas v Europe/Prague.',customerId:'contact',customerAddressId:'address',gardenId:'garden',dueDate:'2026-10-16',startTime:'08:15',endTime:'10:00'}]};
 env.APPROVED_JOB_IMPORT=JSON.stringify(batch);return {env,batch};
}
const send=(env,key=token,value)=>api(request('/api/maintenance/approved-job-import',null,'POST',value,{authorization:'Bearer '+key}),env,ctx);
test('server-approved import authenticates narrowly, is atomic and idempotent, and retains job permissions',async()=>{
 const {env}=setup();
 assert.equal((await send(env,'b'.repeat(64))).status,401);
 assert.equal((await send(env,token,{jobs:[]})).status,400);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,0);
 // Cloudflare may represent a zero-byte HTTP body as a readable empty stream.
 const empty=new Request('https://zavlahy.test/api/maintenance/approved-job-import',{method:'POST',headers:{authorization:'Bearer '+token,'x-zavlahy-request':'1'},body:new ReadableStream({start(c){c.close();}}),duplex:'half'});
 const result=await api(empty,env,ctx);assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'done',customers:1,gardens:1,jobs:1});
 const again=await send(env);assert.equal((await again.json()).replayed,true);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,1);
 const job=await (await api(request('/api/jobs/job',people.worker),env,ctx)).json();assert.equal(job.job.assignedTo,people.worker.id);assert.equal(job.job.customerContact.phones[0].number,'+420123456789');assert.equal(job.job.startTime,'08:15');assert.equal(job.job.endTime,'10:00');
 assert.equal((await api(request('/api/jobs/job',people.reader),env,ctx)).status,404);
 assert.equal((await api(request('/api/customers/contact',people.reader),env,ctx)).status,404);
 delete env.APPROVED_JOB_IMPORT;assert.equal((await send(env)).status,404);env.sqlite.close();
});
test('a collision rolls back the whole import, including completion marker and contacts',async()=>{
 const {env}=setup();env.sqlite.prepare("INSERT INTO gardens(id,name,address,notes,created_at,updated_at,created_by,updated_by) VALUES('garden','Original','','',1,1,'owner-id','owner-id')").run();
 assert.equal((await send(env)).status,503);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM customers').get().n,0);
 assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'approved-job-import:%'").get().n,0);env.sqlite.close();
});
test('expired capability or removed assignee cannot create records',async()=>{
 const {env,batch}=setup();batch.expiresAt=Date.now()-1;env.APPROVED_JOB_IMPORT=JSON.stringify(batch);assert.equal((await send(env)).status,401);
 batch.expiresAt=Date.now()+60000;env.APPROVED_JOB_IMPORT=JSON.stringify(batch);env.sqlite.prepare('DELETE FROM members WHERE user_id=?').run(people.worker.id);assert.equal((await send(env)).status,409);env.sqlite.close();
});
