import test from 'node:test';import assert from 'node:assert/strict';
import {workspaceSameAccount,workspaceInventory,planWorkspaceReconciliation} from '../web/workspace-sync-model.js';
const current={user:{id:'worker',role:'worker'},permissions:{write:true,manage:false},features:{shafts:false,service:true,jobs:true,defects:true},workspace:{disciplines:['garden'],entryInstallations:[{id:'inst-old-original',discipline:'irrigation'}],identityBindings:[{userId:'worker',installationId:'inst-old-original'}]}};
const previous={user:{id:'worker',role:'worker'},installation:{id:'inst-old-original'},workspace:{disciplines:['irrigation'],entryInstallations:current.workspace.entryInstallations}};
function manifest(inventory,overrides={}){return {stamp:'w:2:p:9',completeForRequestedIds:true,requestedCounts:Object.fromEntries(Object.entries(inventory).map(([key,values])=>[key,values.length])),allowed:{records:[],gardens:inventory.gardens.filter(id=>id==='shared-garden'),services:[],serviceWork:inventory.serviceWork.filter(id=>id==='garden-job'),defects:[]},writable:true,features:current.features,...overrides};}
test('permission revocation archives old work while retaining allowed pending changes and removing cached private content',()=>{
 const caches={records:[{id:'shaft',gardenId:'shared-garden',version:1,_pending:true,notes:'Irrigation'}],gardens:[{id:'shared-garden',notes:'Old private notes'}],services:[],serviceWork:[{id:'worker|irrigation-job',jobId:'irrigation-job',ownerId:'worker',pending:true,payload:{operationId:'one'}},{id:'worker|garden-job',jobId:'garden-job',ownerId:'worker',pending:true,payload:{operationId:'two'},snapshot:{job:{id:'garden-job'},privateOldField:'hidden'}}],defects:[]};
 const inventory=workspaceInventory(caches),plan=planWorkspaceReconciliation(previous,current,caches,inventory,manifest(inventory));
 assert.deepEqual(plan.revoked.map(row=>row.kind),['records','serviceWork']);assert.equal(plan.keep.serviceWork.length,1);assert.equal(plan.keep.serviceWork[0].payload.operationId,'two');assert.equal(plan.keep.serviceWork[0].snapshot,null);assert.equal(plan.resetSettings,true);assert.deepEqual(plan.keep.gardens,[]);
 assert.equal(caches.serviceWork[1].snapshot.privateOldField,'hidden');
});
test('a newly created offline visit is retained only with a known allowed garden and explicit discipline',()=>{
 const caches={records:[],gardens:[{id:'shared-garden'}],services:[{id:'new-log',gardenId:'shared-garden',discipline:'garden',version:0,_pending:true,work:'Keep'},{id:'wrong',gardenId:'shared-garden',discipline:'irrigation',version:0,_pending:true}],serviceWork:[],defects:[]},inventory=workspaceInventory(caches);
 const plan=planWorkspaceReconciliation(current,current,caches,inventory,manifest(inventory));assert.deepEqual(plan.keep.services.map(row=>row.id),['new-log']);assert.equal(plan.revoked[0].record.id,'wrong');
});
test('partial page or mismatched manifest can never revoke cached data',()=>{
 const caches={records:[],gardens:[{id:'shared-garden'}],services:[],serviceWork:[],defects:[]},inventory=workspaceInventory(caches);
 assert.throws(()=>planWorkspaceReconciliation(current,current,caches,inventory,manifest(inventory,{completeForRequestedIds:false})));
 assert.throws(()=>planWorkspaceReconciliation(current,current,caches,inventory,manifest(inventory,{requestedCounts:{}})));
});
test('only explicit server-approved identity bindings allow rebasing the original account ID',()=>{
 const old={...previous,user:{id:'original-peer-id',role:'worker'}},linked={...current,workspace:{...current.workspace,identityBindings:[{userId:'original-peer-id',installationId:'inst-old-original'}]}};
 assert.equal(workspaceSameAccount(old,current),false);assert.equal(workspaceSameAccount(old,linked),true);assert.equal(workspaceSameAccount({...old,installation:{id:'unrelated-installation'}},linked),false);
});


test('same user ID on an unrelated installation cannot silently receive the old offline queue',()=>{
 const old={user:{id:'worker'},installation:{id:'unrelated-installation'}};
 assert.equal(workspaceSameAccount(old,{...current,installation:{id:'inst-current'}}),false);
 const caches={records:[],gardens:[{id:'shared-garden'}],services:[{id:'new-allowed',gardenId:'shared-garden',discipline:'garden',version:0,_pending:true}],serviceWork:[],defects:[]},inventory=workspaceInventory(caches),result=planWorkspaceReconciliation(current,current,caches,inventory,manifest(inventory));
 assert.equal(result.reduced,false);assert.equal(result.keep.services.length,1);
});


test('Daily entry queues share job authorization without collapsing their identities into the protocol key',()=>{
 const caches={records:[],gardens:[],services:[],defects:[],serviceWork:[{id:'worker|garden-job',jobId:'garden-job',ownerId:'worker',pending:true,payload:{operationId:'protocol'}},{id:'worker|garden-job|diary|entry-a',kind:'jobDiary',entryId:'entry-a',jobId:'garden-job',ownerId:'worker',pending:true,payload:{operationId:'diary-a'}},{id:'worker|garden-job|diary|entry-b',kind:'jobDiary',entryId:'entry-b',jobId:'garden-job',ownerId:'worker',pending:true,payload:{operationId:'diary-b'}}]};
 const inventory=workspaceInventory(caches);assert.deepEqual(inventory.serviceWork,['garden-job']);const plan=planWorkspaceReconciliation(current,current,caches,inventory,manifest(inventory));assert.equal(plan.keep.serviceWork.length,3);assert.equal(new Set(plan.keep.serviceWork.map(row=>row.id)).size,3);assert.equal(plan.revoked.length,0);
});
