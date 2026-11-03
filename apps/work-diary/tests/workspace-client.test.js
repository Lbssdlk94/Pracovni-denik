import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkspaceClient,verifyWorkspaceInventory} from '../web/workspace-client.js';
import {workspaceBase64,workspaceRecoveryAES,openWorkspaceRecoveryPart} from '../web/workspace-recovery-crypto.js';
const empty=()=>({records:[],gardens:[],services:[],serviceWork:[],defects:[]});
async function keyInfo(){const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);return {info:{workspaceId:'workspace-test',key:{id:'key-test',publicKey:workspaceBase64(new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey)))}},privateKey:workspaceBase64(new Uint8Array(await crypto.subtle.exportKey('pkcs8',pair.privateKey)))};}
function session(){return {user:{id:'worker',role:'worker'},installation:{id:'inst-source'},permissions:{write:true},features:{jobs:true,service:true,defects:true},workspace:{workspaceId:'workspace-test',authorizationVersion:1,role:'worker',disciplines:['garden'],entryInstallations:[{id:'inst-source',discipline:'garden'}]}};}
function manifestSend(current,visible=()=>true){return async(path,options)=>{assert.equal(path,'/api/workspace/manifest');const input=JSON.parse(options.body);if(input.expectedStamp)assert.equal(input.expectedStamp,'w:1:p:1');return {stamp:'w:1:p:1',completeForRequestedIds:true,requestedCounts:Object.fromEntries(Object.keys(empty()).map(k=>[k,input[k].length])),allowed:Object.fromEntries(Object.keys(empty()).map(k=>[k,input[k].filter(id=>visible(k,id))])),workspace:current.workspace,features:current.features,writable:true};};}

test('GitHub fix does not report a completed reduction as recovery failure or navigate twice',async()=>{
 const current={...session(),recovery:{workspaceId:'workspace-test'}},previous=structuredClone(current);previous.workspace.authorizationVersion=0;
 let failures=0,replaced=0,navigations=0;const original=globalThis.location;globalThis.location={reload:()=>navigations++};
 try{const client=createWorkspaceClient({readCaches:async()=>empty(),readSeen:async()=>({}),send:manifestSend(current),captureDrafts:async()=>[],replace:async()=>{replaced++;},onReduced:async()=>{throw Object.assign(Error('Handled by host'),{code:'workspace_reload'});},onFailure:()=>failures++});
  await assert.rejects(client.reconcile(previous,current),error=>error.code==='workspace_reload');assert.equal(replaced,1);assert.equal(failures,0);assert.equal(navigations,0);
 }finally{if(original===undefined)delete globalThis.location;else globalThis.location=original;}
});
test('GitHub fix completes account removal when the host has handled its intentional reset',async()=>{
 const current=session();let replaced=0,failures=0;
 const client=createWorkspaceClient({readCaches:async()=>empty(),captureDrafts:async()=>[],recoveryInfo:async()=>({workspaceId:'workspace-test'}),replace:async()=>{replaced++;},onReduced:async()=>{throw Object.assign(Error('Handled by host'),{code:'workspace_reload'});},onFailure:()=>failures++});
 assert.equal(await client.revoke(current),true);assert.equal(replaced,1);assert.equal(failures,0);
});

test('client verifies all requested IDs over multiple bounded pages and a final revision check',async()=>{
 const inventory=empty();inventory.serviceWork=Array.from({length:2305},(_,i)=>'job-'+i);let calls=0;const current=session(),send=manifestSend(current);
 const result=await verifyWorkspaceInventory(async(...args)=>{calls++;return send(...args);},inventory);
 assert.equal(calls,4);assert.equal(result.allowed.serviceWork.length,2305);assert.equal(result.requestedCounts.serviceWork,2305);
});
test('a partial manifest never calls the local replace/purge adapter',async()=>{
 let replaced=false;const current=session(),caches=empty();caches.gardens=[{id:'garden'}];
 const client=createWorkspaceClient({readCaches:async()=>caches,readSeen:async()=>({}),send:async()=>({completeForRequestedIds:false}),replace:async()=>{replaced=true;}});
 await assert.rejects(client.reconcile(current,current));assert.equal(replaced,false);
});
test('revocation seals pending photos and drafts before an atomic replacement; retained operations keep their IDs',async()=>{
 const {info,privateKey}=await keyInfo(),current={...session(),recovery:info},previous=structuredClone(current),caches=empty();
 previous.workspace.disciplines=['irrigation'];
 caches.gardens=[{id:'garden',notes:'OLD_PRIVATE_NOTE'}];
 caches.serviceWork=[{id:'worker|revoked',jobId:'revoked',ownerId:'worker',pending:true,payload:{operationId:'original-operation',report:{work:'SECRET_WORK'}},photos:[{id:'photo',file:new File(['SECRET_PHOTO'],'private.jpg',{type:'image/jpeg'})}]},{id:'worker|allowed',jobId:'allowed',ownerId:'worker',pending:true,payload:{operationId:'kept-operation'},snapshot:{job:{id:'allowed',gardenId:'garden'}}}];
 const events=[];let replacement;
 const client=createWorkspaceClient({readCaches:async()=>caches,readSeen:async()=>({}),send:manifestSend(current,(kind,id)=>kind!=='serviceWork'||id==='allowed'),captureDrafts:async()=>[{key:'job-draft',value:{work:'SECRET_DRAFT'}}],beginReduction:()=>events.push('freeze'),replace:async value=>{events.push('replace');replacement=value;},onReduced:async()=>events.push('reset')});
 await client.reconcile(previous,current);
 assert.deepEqual(events,['freeze','replace','reset']);assert.equal(replacement.archives.length,2);assert.equal(replacement.plan.keep.serviceWork[0].payload.operationId,'kept-operation');assert.equal(replacement.plan.keep.serviceWork[0].snapshot,null);
 const archive=replacement.archives[0];assert.ok(!JSON.stringify(archive).includes('SECRET'));assert.ok(!JSON.stringify(archive.manifest).includes('private.jpg'));
 const aes=await workspaceRecoveryAES(privateKey,archive.manifest),text=await openWorkspaceRecoveryPart(aes,archive.manifest,0,new Uint8Array(await archive.parts[0].blob.arrayBuffer()));
 const document=JSON.parse(new TextDecoder().decode(text));assert.equal(document.record.payload.operationId,'original-operation');assert.equal(document.record.photos[0].file.name,'private.jpg');
 const photo=await openWorkspaceRecoveryPart(aes,archive.manifest,1,new Uint8Array(await archive.parts[1].blob.arrayBuffer()));assert.equal(new TextDecoder().decode(photo),'SECRET_PHOTO');
});
test('complete account removal preserves opaque work and wipes every readable cache',async()=>{
 const {info}=await keyInfo(),previous=session(),caches=empty();caches.services=[{id:'new',gardenId:'garden',discipline:'garden',_pending:true,work:'Unsent'}];let replacement;
 const client=createWorkspaceClient({readCaches:async()=>caches,captureDrafts:async()=>[],recoveryInfo:async()=>info,replace:async value=>{replacement=value;},onReduced:async()=>{}});
 assert.equal(await client.revoke(previous),true);assert.equal(replacement.current,null);assert.equal(replacement.archives.length,1);assert.deepEqual(replacement.plan.keep,empty());assert.ok(!JSON.stringify(replacement.archives).includes('Unsent'));
});
test('encryption failure never falsely reports successful recovery or erases original work',async()=>{
 const current=session(),previous={...current,workspace:{...current.workspace,disciplines:['irrigation']}},caches=empty();caches.records=[{id:'shaft',_pending:true,version:1}];let replaced=false;
 const client=createWorkspaceClient({readCaches:async()=>caches,readSeen:async()=>({}),send:manifestSend(current,()=>false),captureDrafts:async()=>[],recoveryInfo:async()=>null,replace:async()=>{replaced=true;}});
 await assert.rejects(client.reconcile(previous,current),/klíč/);assert.equal(replaced,false);assert.equal(caches.records[0]._pending,true);
});
