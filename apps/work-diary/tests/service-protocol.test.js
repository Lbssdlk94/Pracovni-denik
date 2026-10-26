import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {subToday} from '../web/subscription-model.js';
const ctx={waitUntil:p=>p.catch(()=>{})};
const call=(e,path,person=people.owner,method='GET',body)=>api(request(path,person,method,body),e,ctx);
async function good(response){assert.equal(response.status,200,await response.clone().text());return response.json();}
async function setup(){
 const e=environment();await good(await call(e,'/api/me'));
 for(const role of ['worker','reader']){await good(await call(e,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await good(await call(e,'/api/me',people[role]));}
 await good(await call(e,'/api/jobs/ordinary',people.owner,'PUT',{version:0,title:'Kontrola závlahy',customerName:'Jiří Novák',address:'Zahradní 1, Praha',assignedTos:[people.worker.id,people.reader.id],assignedTo:people.worker.id,status:'planned'}));
 return e;
}
test('Ordinary job protocols use existing records, stay private and work without subscriptions',async()=>{
 const e=await setup();try{
  const feature=await good(await call(e,'/api/features'));await good(await call(e,'/api/features',people.owner,'PUT',{version:feature.featuresVersion,features:{...feature.features,subscriptions:false,customers:false}}));
  let current=await good(await call(e,'/api/jobs/ordinary/service',people.worker));assert.equal(current.subscription,null);assert.equal(current.job.customerName,'Jiří Novák');assert.deepEqual(current.job.assignedNames.sort(),['reader@example.com','worker@example.com']);
  const value={version:current.job.version,operationId:'protocol-write',report:{date:subToday(),work:'Seřízení postřikovačů',material:'Těsnění',defects:'Poškozená tryska',notes:'Poznámka',recommendations:'Výměna trysky',photoIds:[]}};
  current=await good(await call(e,'/api/jobs/ordinary/service',people.worker,'PUT',value));assert.equal(current.report.work,value.report.work);assert.equal(current.report.authorName,people.worker.email);assert.equal(current.job.status,'planned');
  const replay=await good(await call(e,'/api/jobs/ordinary/service',people.worker,'PUT',value));assert.equal(replay.replayed,true);assert.equal(replay.report.version,1);
  assert.equal((await call(e,'/api/jobs/ordinary/service',people.worker,'PUT',{...value,operationId:'stale-protocol'})).status,409);
  assert.equal((await call(e,'/api/jobs/ordinary/service',people.reader,'PUT',{...value,version:current.job.version,operationId:'reader-write'})).status,403);
  assert.equal((await call(e,'/api/jobs/ordinary/service',people.outsider)).status,403);
  current=await good(await call(e,'/api/jobs/ordinary/service',people.worker,'PUT',{version:current.job.version,operationId:'finish-protocol',complete:true,report:{date:subToday()}}));assert.equal(current.job.status,'done');assert.equal(current.report.work,'');
  assert.equal(e.sqlite.prepare('SELECT count(*) n FROM subscription_usage').get().n,0);
  assert.equal((await good(await call(e,'/api/jobs/ordinary/service',people.reader))).report.date,subToday());
  assert.equal((await call(e,'/api/jobs/ordinary/service',people.owner,'PUT',{version:current.job.version,operationId:'quota-ordinary',deductOverride:true,overrideReason:'Test'})).status,400);
 }finally{e.sqlite.close();}
});
test('Protocol photos and history are scoped to the assigned job, even after reassignment',async()=>{
 const e=await setup();try{
  const path='/api/jobs/ordinary/service/photos/picture',upload=request(path,people.worker,'PUT',undefined,{'content-type':'image/png','x-file-name':'photo.png'});
  const photo=new Request(upload,{body:new Uint8Array([137,80,78,71,13,10,26,10])});await good(await api(photo,e,ctx));
  assert.equal((await call(e,path,people.reader)).status,200);assert.equal((await call(e,path)).headers.get('cache-control'),'no-store');
  let {job}=await good(await call(e,'/api/jobs/ordinary/service',people.worker));
  const value={version:job.version,operationId:'with-photo',report:{date:subToday(),photoIds:['picture']}};
  await good(await call(e,'/api/jobs/ordinary/service',people.worker,'PUT',value));
  assert.equal((await call(e,'/api/jobs/ordinary/service',people.worker,'PUT',{...value,version:job.version+1,operationId:'foreign-photo',report:{date:subToday(),photoIds:['not-this-job']}})).status,400);
  const history=await good(await call(e,'/api/jobs/ordinary/service'));assert.equal(history.history.length,1);assert.equal((await good(await call(e,'/api/jobs/ordinary/service',people.worker))).history.length,0);
  ({job}=await good(await call(e,'/api/jobs/ordinary')));await good(await call(e,'/api/jobs/ordinary',people.owner,'PUT',{version:job.version,title:job.title,assignedTo:people.owner.id,assignedTos:[people.owner.id],status:job.status}));
  assert.equal((await call(e,'/api/jobs/ordinary/service',people.worker)).status,404);assert.equal((await call(e,path,people.worker)).status,404);
 }finally{e.sqlite.close();}
});
const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
test('Customer signature is stored with the protocol, kept when an older client omits it, and rejected when it is not a small PNG',async()=>{
 const e=await setup();try{
  let {job}=await good(await call(e,'/api/jobs/ordinary/service',people.worker));
  let saved=await good(await call(e,'/api/jobs/ordinary/service',people.worker,'PUT',{version:job.version,operationId:'sign',report:{date:subToday(),work:'Kontrola',customerSignature:signature,photoIds:[]}}));
  assert.equal(saved.report.customerSignature,signature);assert.equal(e.sqlite.prepare('SELECT customer_signature s FROM service_reports').get().s,signature);
  assert.equal((await good(await call(e,'/api/jobs/ordinary/service',people.reader))).report.customerSignature,signature);
  saved=await good(await call(e,'/api/jobs/ordinary/service',people.worker,'PUT',{version:saved.job.version,operationId:'older-client',report:{date:subToday(),work:'Kontrola filtru',photoIds:[]}}));
  assert.equal(saved.report.customerSignature,signature);assert.equal(saved.report.work,'Kontrola filtru');
  saved=await good(await call(e,'/api/jobs/ordinary/service',people.worker,'PUT',{version:saved.job.version,operationId:'clear-sign',report:{date:subToday(),work:'Kontrola filtru',customerSignature:'',photoIds:[]}}));
  assert.equal(saved.report.customerSignature,'');
  assert.equal((await call(e,'/api/jobs/ordinary/service',people.worker,'PUT',{version:saved.job.version,operationId:'bad-sign',report:{date:subToday(),customerSignature:'data:image/jpeg;base64,aaaa',photoIds:[]}})).status,400);
  assert.equal(e.sqlite.prepare('SELECT customer_signature s FROM service_reports').get().s,'');
 }finally{e.sqlite.close();}
});
