import test from 'node:test';
import assert from 'node:assert/strict';
import {planWorkspaceReconciliation} from '../web/workspace-sync-model.js';

const stores=['records','gardens','services','serviceWork','defects'];
const empty=()=>Object.fromEntries(stores.map(store=>[store,[]]));

function session({role='owner',write=true,disciplines=['irrigation'],authorizationVersion=1,installation='inst-1',user='user-1'}={}){
  return {
    user:{id:user,role},
    installation:{id:installation},
    permissions:{write,manage:role==='owner'},
    workspace:{authorizationVersion,disciplines,role,entryInstallations:[{id:installation,discipline:'irrigation'}]}
  };
}
function manifest(inventory,allowed){
  return {
    completeForRequestedIds:true,
    stamp:'stamp-1',
    writable:true,
    features:{},
    allowed,
    requestedCounts:Object.fromEntries(stores.map(store=>[store,inventory[store].length]))
  };
}

test('seen and related ids the server does not allow do not lock the workspace',()=>{
  const previous=session(),next=session();
  const caches={...empty(),records:[{id:'shaft-1',version:4,gardenId:'garden-1'}]};
  const inventory={...empty(),records:['shaft-1'],gardens:['garden-1'],serviceWork:['job-from-photo']};
  const allowed={...empty(),records:['shaft-1'],gardens:['garden-1']};
  const plan=planWorkspaceReconciliation(previous,next,caches,inventory,manifest(inventory,allowed));
  assert.equal(plan.reduced,false);
  assert.deepEqual(plan.revoked,[]);
  assert.equal(plan.resetSettings,false);
  assert.deepEqual(plan.keep.records,caches.records);
});

test('a real role or authorization change still keeps only pending local work',()=>{
  const previous=session({authorizationVersion:1});
  const next=session({authorizationVersion:2});
  const caches={...empty(),records:[{id:'shaft-1',version:4},{id:'draft-1',version:0,_pending:true,gardenId:'garden-1'}]};
  const inventory={...empty(),records:['draft-1','shaft-1']};
  const allowed={...empty(),records:['draft-1','shaft-1']};
  const plan=planWorkspaceReconciliation(previous,next,caches,inventory,manifest(inventory,allowed));
  assert.equal(plan.reduced,true);
  assert.equal(plan.resetSettings,true);
  assert.deepEqual(plan.keep.records.map(record=>record.id),['draft-1']);
});

test('a cached record the manifest no longer allows is still a reduction',()=>{
  const previous=session(),next=session();
  const caches={...empty(),records:[{id:'secret',version:2}]};
  const inventory={...empty(),records:['secret']};
  const allowed=empty();
  const plan=planWorkspaceReconciliation(previous,next,caches,inventory,manifest(inventory,allowed));
  assert.equal(plan.reduced,true);
  assert.deepEqual(plan.keep.records,[]);
});
