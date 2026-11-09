import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';

test('Feature reads are coalesced within a request, but never retained across requests or changed policy',async()=>{
 const env=environment(),ctx={waitUntil:p=>p.catch(()=>{})};
 try{
  assert.equal((await api(request('/api/me',people.owner),env,ctx)).status,200);
  assert.equal((await api(request('/api/jobs/performance-job',people.owner,'PUT',{version:0,title:'Test výkonu',status:'planned',assignedTo:people.owner.id,assignedTos:[people.owner.id]}),env,ctx)).status,200);
  const photo=id=>new Request(request('/api/jobs/performance-job/service/photos/'+id,people.owner,'PUT',undefined,{'content-type':'image/png','x-file-name':'photo.png'}),{body:new Uint8Array([137,80,78,71,13,10,26,10])});
  const original=env.DB.prepare;let reads=0;
  env.DB.prepare=sql=>{const statement=original(sql);if(sql==="SELECT * FROM settings WHERE key=?")reads++;return statement;};
  const saved=await api(photo('first-picture'),env,ctx);
  assert.equal(saved.status,200,await saved.clone().text());assert.equal(reads,1,'Multiple photograph/module gates must share one feature read');
  const settings=await (await api(request('/api/features',people.owner),env,ctx)).json();
  env.sqlite.prepare("INSERT INTO settings(key,value,version) VALUES('features',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=settings.version+1").run(JSON.stringify({...settings.features,photoUploads:false}));
  reads=0;
  const denied=await api(photo('second-picture'),env,ctx);
  assert.equal(denied.status,403);assert.equal((await denied.json()).feature,'photoUploads');assert.equal(reads,1);
  assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_photos').get().n,1);
 }finally{env.sqlite.close();}
});

function workerFixture(){
 const handlers={},requests=[],releases=[],written=[],self={addEventListener:(type,fn)=>handlers[type]=fn,skipWaiting:async()=>{self.activated=true;}};
 const cache={put:async(asset)=>written.push(asset)};
 const context={self,caches:{open:async()=>cache},URL,Response,fetch:asset=>{requests.push(asset);return new Promise(resolve=>releases.push(()=>resolve(new Response('asset'))));}};
 vm.runInNewContext(readFileSync('web/sw.js','utf8'),context);
 let install;handlers.install({waitUntil:value=>install=value});return {requests,releases,written,self,get install(){return install;}};
}

test('Offline installation downloads at most eight assets concurrently and activates only after all complete',async()=>{
 const f=workerFixture();await new Promise(setImmediate);
 assert.equal(f.requests.length,8);assert.equal(f.written.length,0);assert.equal(f.self.activated,undefined);
 while(f.releases.length){const batch=f.releases.splice(0);assert.ok(batch.length<=8);batch.forEach(release=>release());await new Promise(setImmediate);}
 await f.install;
 assert.equal(f.self.activated,true);assert.equal(f.requests.length,f.written.length);
 assert.ok(f.requests.some(p=>p.includes('role-preview-model.js')));assert.ok(f.requests.some(p=>p.includes('local-auth-ui.js')));
 assert.ok(f.requests.some(p=>p.includes('jspdf.umd.min.js')));assert.ok(f.requests.some(p=>p.includes('protocol-font.ttf')));
});

test('A failed offline asset rejects the new installation without activating a partial cache',async()=>{
 const handlers={},self={addEventListener:(type,fn)=>handlers[type]=fn,skipWaiting:async()=>{self.activated=true;}};
 vm.runInNewContext(readFileSync('web/sw.js','utf8'),{self,caches:{open:async()=>({put:async()=>{}})},URL,fetch:async()=>new Response('Unavailable',{status:503})});
 let install;handlers.install({waitUntil:value=>install=value});await assert.rejects(install,/offline/);assert.equal(self.activated,undefined);
});
