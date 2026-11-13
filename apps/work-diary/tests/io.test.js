import test from 'node:test';
import assert from 'node:assert/strict';
import {readFromServer} from '../web/io.js';
// A response can arrive while its body remains stalled. The deadline must cover both.
test('A stalled response body releases the startup request and cancels the download',async()=>{
 const original=globalThis.fetch;let cancelled=false;
 globalThis.fetch=async(path,{signal})=>({json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{cancelled=true;reject(new DOMException('Aborted','AbortError'));},{once:true}))});
 try{await assert.rejects(readFromServer('/api/me',{},r=>r.json(),20),e=>e.code==='connection_timeout');assert.equal(cancelled,true);}finally{globalThis.fetch=original;}
});
test('Caller cancellation remains distinct from a network timeout',async()=>{
 const original=globalThis.fetch,controller=new AbortController();globalThis.fetch=async(path,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 try{const task=readFromServer('/api/me',{signal:controller.signal},r=>r.json(),1000);controller.abort();await assert.rejects(task,e=>e.name==='AbortError'&&e.code!=='connection_timeout');}finally{globalThis.fetch=original;}
});

test('Transient read failures retry once, including a deadline on the body, then release the caller',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{if(++calls===1)throw new TypeError('Network unavailable');return Response.json({ok:true});};
  assert.deepEqual(await readFromServer('/api/jobs',{},r=>r.json(),100,{retries:1,delayMs:0}),{ok:true});assert.equal(calls,2);
  for(const status of [429,500,502,503,504]){calls=0;globalThis.fetch=async()=>new Response('',{status:++calls===1?status:200});assert.equal(await readFromServer('/api/customers',{},r=>{if(!r.ok)throw Object.assign(Error('Unavailable'),{status:r.status});return r.status;},100,{retries:1,delayMs:0}),200);assert.equal(calls,2);}
  calls=0;globalThis.fetch=async(path,{signal})=>{calls++;return {json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))};};
  await assert.rejects(readFromServer('/api/me',{},r=>r.json(),10,{retries:1,delayMs:0}),e=>e.code==='connection_timeout');assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
test('Writes, authorization failures and explicit cancellations are never automatically replayed',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;throw new TypeError('Connection lost after commit');};
  await assert.rejects(readFromServer('/api/jobs',{method:'PUT'},r=>r.json(),100,{retries:1,delayMs:0}));assert.equal(calls,1);
  for(const status of [400,401,403,404,409]){calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status});};await assert.rejects(readFromServer('/api/jobs',{},r=>{throw Object.assign(Error('Denied'),{status:r.status});},100,{retries:1,delayMs:0}));assert.equal(calls,1);}
  const controller=new AbortController();calls=0;globalThis.fetch=async()=>{calls++;controller.abort();throw new DOMException('Aborted','AbortError');};await assert.rejects(readFromServer('/api/me',{signal:controller.signal},r=>r.json(),100,{retries:1,delayMs:0}));assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
