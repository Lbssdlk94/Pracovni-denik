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
