import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
import {createJobTimeClient} from '../web/job-time-client.js';
import {planWorkspaceReconciliation,workspaceInventory} from '../web/workspace-sync-model.js';
globalThis.window=new EventTarget();
async function fixture(){
 let connected=true,records=[],responseGate=null;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get onLine(){return connected;}}});
 const env=environment(),ctx={waitUntil:p=>p.catch(()=>{})};
 async function remote(path,options={}){const response=await api(request(path,people.owner,options.method||'GET',options.body?JSON.parse(options.body):undefined),env,ctx),body=await response.json();if(!response.ok)throw Object.assign(Error(body.error),{status:response.status,code:body.code});if(path.endsWith('/time')&&responseGate){const wait=responseGate;responseGate=null;await wait;}return body;}
 const session=await remote('/api/me');for(const id of ['a','b'])await remote('/api/jobs/'+id,{method:'PUT',body:JSON.stringify({version:0,title:id,assignedTo:people.owner.id,status:'planned'})});
 const deps={all:async()=>structuredClone(records),change:async(id,fn)=>{const next=fn(records.find(r=>r.id===id));records=records.filter(r=>r.id!==id);if(next)records.push(structuredClone(next));return next;},request:remote,getSession:()=>session,isLocked:async()=>false,isPreview:()=>false,checkWrite:()=>{}};
 let client;const send=async id=>{const row=records.find(r=>r.id===id);try{const value=await remote('/api/jobs/'+row.jobId+'/time/actions',{method:'POST',body:JSON.stringify(row.payload)});await client.acknowledge(row,value);}catch(e){await deps.change(id,r=>({...r,conflict:e.status===409,error:e.message}));throw e;}};
 const restart=()=>client=createJobTimeClient({...deps,send});restart();
 return {env,session,remote,send,restart,get client(){return client;},get records(){return records;},set online(v){connected=v;},set responseGate(v){responseGate=v;}};
}
test('Travel/work/break/return/stop survives a client restart and syncs original timestamps once into real SQLite',async()=>{
 const f=await fixture();await f.client.load('a');f.online=false;const at=Date.now()-60000;
 for(const [index,action]of ['travel','work','break','work','stop'].entries())await f.client.action('a',{action,at:at+index*1000});
 const before=structuredClone(f.records.filter(r=>r.pending));assert.equal(before.length,5);
 f.restart();const local=await f.client.load('a',false);assert.equal(local.states[0].version,5);assert.equal(local.states[0].active,null);assert.equal(local.summary.total.workMs,2000);
 f.online=true;for(const op of before)await f.send(op.id);
 const fresh=await f.client.load('a');assert.equal(fresh.intervals.length,4);assert.equal(fresh.summary.total.workMs,2000);assert.equal(fresh.job.status,'in_progress');assert.equal(f.records.filter(r=>r.pending).length,0);
 for(const op of before){const result=await f.remote('/api/jobs/a/time/actions',{method:'POST',body:JSON.stringify(op.payload)});assert.equal(result.replayed,true);}
 assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,4);
});
test('Cross-job offline switch projects one worker globally; queued actions retain separate identities',async()=>{
 const f=await fixture();await f.client.load('a');await f.client.load('b');f.online=false;const at=Date.now()-60000;
 await f.client.action('a',{action:'work',at});await assert.rejects(f.client.action('b',{action:'work',at:at+1000}),e=>e.code==='job_time_switch');
 // Start b explicitly. The source interval is closed in the local projection.
 await f.client.action('b',{action:'work',at:at+2000,allowSwitch:true});
 assert.equal((await f.client.load('b',false)).states[0].active.jobId,'b');assert.equal((await f.client.load('a',false)).intervals.filter(r=>r.endAt===null).length,0);
 assert.equal(new Set(f.records.filter(r=>r.pending).map(r=>r.id)).size,f.records.filter(r=>r.pending).length);
});
test('Conflict retains the original payload, refuses a blind next action and never rebases its timestamp',async()=>{
 const f=await fixture();await f.client.load('a');f.online=false;const at=Date.now()-60000;await f.client.action('a',{action:'work',at});const row=f.records.find(r=>r.pending);
 // Another device starts work after our local timestamp.
 await f.remote('/api/jobs/a/time/actions',{method:'POST',body:JSON.stringify({operationId:'other-device',action:'work',at:at+1000,workers:[{userId:people.owner.id,version:0}]})});
 f.online=true;await assert.rejects(f.send(row.id),e=>e.status===409);assert.deepEqual(f.records.find(r=>r.id===row.id).payload,row.payload);
 await assert.rejects(f.client.action('a',{action:'stop',at:Date.now()}),/předchozí neodeslanou/);
 await assert.rejects(f.client.resolve(row.id,true),e=>e.status===409);
 const kept=f.records.find(r=>r.pending);assert.equal(kept.payload.at,at);assert.deepEqual(kept.previousPayload,row.payload);assert.equal(kept.conflict,true);
 assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,1);
});
test('Account/role/offline lease changes cannot expose or replay a cached time index',async()=>{
 const f=await fixture();await f.client.load('a');f.online=false;f.session.user.id='another-account';await assert.rejects(f.client.load('a',false));f.session.user.id=people.owner.id;f.session.user.role='worker';await assert.rejects(f.client.load('a',false));f.session.user.role='owner';f.session.verifiedAt=Date.now()-86400001;await assert.rejects(f.client.action('a',{action:'work'}));assert.equal(f.records.filter(r=>r.pending).length,0);
});
test('Permission reconciliation preserves pending time payloads without keeping forbidden snapshots',async()=>{
 const f=await fixture();await f.client.load('a');f.online=false;await f.client.action('a',{action:'work',at:Date.now()-1000});
 const caches={records:[],gardens:[],services:[],defects:[],serviceWork:f.records},inventory=workspaceInventory(caches);
 const before={...f.session,workspace:{authorizationVersion:1,disciplines:['irrigation'],entryInstallations:[]}},after={...before,workspace:{...before.workspace,authorizationVersion:2}};
 const manifest={completeForRequestedIds:true,requestedCounts:Object.fromEntries(Object.entries(inventory).map(([k,v])=>[k,v.length])),allowed:{records:[],gardens:[],services:[],defects:[],serviceWork:['a']},writable:true,features:after.features};
 const plan=planWorkspaceReconciliation(before,after,caches,inventory,manifest);assert.equal(plan.keep.serviceWork.length,1);assert.equal(plan.keep.serviceWork[0].kind,'jobTimeAction');assert.equal(plan.keep.serviceWork[0].snapshot,null);assert.ok(plan.keep.serviceWork[0].payload.operationId);
});


test('A delayed GET cannot overwrite a newer acknowledged timer state',async()=>{
 const f=await fixture();await f.client.load('a');let release;f.responseGate=new Promise(r=>release=r);
 const stale=f.client.load('a',true);await new Promise(r=>setTimeout(r,10));
 const saved=await f.client.action('a',{action:'work',at:Date.now()-1000});assert.equal(saved.states[0].version,1);
 release();await stale;assert.equal((await f.client.load('a',false)).states[0].version,1);
 assert.equal(f.records.find(r=>r.kind==='jobTimeIndex').snapshot.states[0].active.kind,'work');
});


test('A new online stop first sends the older offline pause for the same worker',async()=>{
 const f=await fixture();await f.client.load('a');const at=Date.now()-60000;
 await f.client.action('a',{action:'work',at});f.online=false;await f.client.action('a',{action:'break',at:at+1000});
 f.online=true;const result=await f.client.action('a',{action:'stop',at:at+2000});
 assert.equal(result.states[0].version,3);assert.equal(result.states[0].active,null);assert.equal(result.summary.total.workMs,1000);assert.equal(result.summary.total.breakMs,1000);assert.equal(f.records.filter(r=>r.pending).length,0);
});
