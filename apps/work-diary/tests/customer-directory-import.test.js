import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:task=>task.catch(()=>{})},token='a'.repeat(64);
const hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
const call=async(env,path,method='GET',value,headers={})=>{const r=await api(request(path,people.owner,method,value,headers),env,ctx);return {status:r.status,body:await r.json()};};
const run=(env,value,secret=token)=>call(env,'/api/maintenance/customer-directory-import','POST',value,{authorization:'Bearer '+secret});
async function fixture(){
 const env=environment();assert.equal((await call(env,'/api/me')).status,200);
 for(const id of ['legacy','obsolete'])assert.equal((await call(env,'/api/customers/'+id,'PUT',{version:0,name:id,phones:[],addresses:[{id:'old-address',label:'Zahrada',address:'Lesní 1',city:'Příbram'}]})).status,200);
 const job=await call(env,'/api/jobs/existing-job','PUT',{version:0,title:'Původní zakázka',status:'planned',dueDate:'2026-12-01',customerId:'legacy',customerAddressId:'old-address',assignedTo:people.owner.id});assert.equal(job.status,200,JSON.stringify(job.body));
 const profile=(id,version)=>({id,expectedVersion:version,name:'Nové '+id,email:'',phones:[],contacts:[{id:'contact-1',name:'Správce',email:'spravce@example.cz',phone:'777111222',note:''}],addresses:[{id:'old-address',label:'Zahrada',address:'Lesní 1',city:'Příbram'}],billing:{name:'Jiná fakturační firma',address:'Fakturační 20'},contactKind:id==='legacy'?'customer':'supplier',disciplines:['irrigation','garden'],sourceRef:'mwork:'+id,importDetails:{original:[{'moje poznamka':'Pouze pro správce'}]}});
 const records=[profile('legacy',1),profile('new-contact',0)],finalizePlan={activeIds:['legacy','new-contact'],archive:[{id:'obsolete',version:1}]};
 const plan={id:'test-directory-import',sourceDigest:'b'.repeat(64),tokenHash:await hash(token),expiresAt:Date.now()+3600000,chunks:[await hash(JSON.stringify(records))],finalizeHash:await hash(JSON.stringify(finalizePlan))};env.APPROVED_CUSTOMER_DIRECTORY_IMPORT=JSON.stringify(plan);
 return {env,records,finalizePlan,plan};
}
test('Approved replacement preserves IDs, address links and jobs; obsolete entries are reversibly archived',async()=>{
 const {env,records,finalizePlan}=await fixture();try{
  const originalJob=env.sqlite.prepare("SELECT * FROM jobs WHERE id='existing-job'").get();
  const first=await run(env,{index:0,records});assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.processed,2);
  const replay=await run(env,{index:0,records});assert.equal(replay.body.replayed,true);assert.equal(env.sqlite.prepare("SELECT version FROM customers WHERE id='legacy'").get().version,2);
  const final=await run(env,{finalize:true,finalizePlan});assert.equal(final.status,200,JSON.stringify(final.body));assert.equal(final.body.activeContacts,2);
  assert.equal(env.sqlite.prepare("SELECT deleted FROM customers WHERE id='obsolete'").get().deleted,0);assert.equal(env.sqlite.prepare("SELECT directory_archived FROM customers WHERE id='obsolete'").get().directory_archived,1);
  assert.deepEqual(env.sqlite.prepare("SELECT * FROM jobs WHERE id='existing-job'").get(),originalJob);
  assert.equal((await call(env,'/api/customers')).body.customers.length,2);assert.equal((await call(env,'/api/customers/obsolete')).status,200);
  assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customer_directory_import_events').get().n,3);
 }finally{env.sqlite.close();}
});
test('No credential, wrong token, changed data, expired permission or premature finalization never writes contacts',async()=>{
 const {env,records,finalizePlan,plan}=await fixture();try{
  assert.equal((await run(env,{index:0,records},'c'.repeat(64))).status,401);
  assert.equal((await run(env,{index:0,records:[{...records[0],name:'Podvrh'}]})).status,403);
  assert.equal((await run(env,{finalize:true,finalizePlan})).status,409);
  env.APPROVED_CUSTOMER_DIRECTORY_IMPORT=JSON.stringify({...plan,expiresAt:Date.now()-1});assert.equal((await run(env,{index:0,records})).status,401);
  assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n,2);
 }finally{env.sqlite.close();}
});
test('A stale record aborts the whole chunk, including creation of other contacts',async()=>{
 const {env,records}=await fixture();try{
  env.sqlite.prepare("UPDATE customers SET version=2 WHERE id='legacy'").run();const r=await run(env,{index:0,records});assert.equal(r.status,409);
  assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n,2);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customer_directory_import_events').get().n,0);
 }finally{env.sqlite.close();}
});
test('A new contact created during migration prevents final archiving until the plan is reviewed',async()=>{
 const {env,records,finalizePlan}=await fixture();try{
  assert.equal((await run(env,{index:0,records})).status,200);
  assert.equal((await call(env,'/api/customers/concurrent','PUT',{version:0,name:'Nový během importu',phones:[],addresses:[]})).status,200);
  const done=await run(env,{finalize:true,finalizePlan});assert.equal(done.status,409);assert.equal(env.sqlite.prepare("SELECT directory_archived FROM customers WHERE id='obsolete'").get().directory_archived,0);
 }finally{env.sqlite.close();}
});
