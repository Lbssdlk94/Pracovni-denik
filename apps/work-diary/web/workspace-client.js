import {workspaceInventory,workspaceSameAccount,planWorkspaceReconciliation} from './workspace-sync-model.js?v=shared-directory-v1';
import {sealWorkspaceRecovery} from './workspace-recovery-crypto.js?v=shared-directory-v1';

const kinds=['records','gardens','services','serviceWork','defects'];
export async function verifyWorkspaceInventory(send,inventory){
 const result={allowed:Object.fromEntries(kinds.map(key=>[key,[]])),requestedCounts:Object.fromEntries(kinds.map(key=>[key,inventory[key].length])),completeForRequestedIds:true};
 const count=Math.max(1,...kinds.map(key=>Math.ceil(inventory[key].length/1000)));
 for(let offset=0;offset<count;offset++){
  const slice=Object.fromEntries(kinds.map(key=>[key,inventory[key].slice(offset*1000,(offset+1)*1000)]));
  const page=await send('/api/workspace/manifest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...slice,...(result.stamp?{expectedStamp:result.stamp}:{})})});
  if(!page.completeForRequestedIds||!page.stamp||result.stamp&&page.stamp!==result.stamp||kinds.some(key=>page.requestedCounts?.[key]!==slice[key].length||!Array.isArray(page.allowed?.[key])||page.allowed[key].some(id=>!slice[key].includes(id))))throw Error('Server nepotvrdil úplné ověření místní práce.');
  for(const key of kinds)result.allowed[key].push(...page.allowed[key]);
  Object.assign(result,{stamp:page.stamp,workspace:page.workspace,writable:page.writable,features:page.features});
 }
 // A final empty query prevents an earlier page being used after reassignment.
 const final=await send('/api/workspace/manifest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...Object.fromEntries(kinds.map(key=>[key,[]])),expectedStamp:result.stamp})});
 if(final.stamp!==result.stamp)throw Error('Oprávnění se během ověřování změnila.');
 return result;
}

export function createWorkspaceClient(adapter){
 let flight;
 async function reconcile(previous,current){
  if(!current.workspace)return null;
  if(!workspaceSameAccount(previous,current))throw Object.assign(Error('Místní práce patří jinému účtu. Otevřete původní přístup.'),{code:'pending_account',status:403});
  const caches=await adapter.readCaches(),seen=await adapter.readSeen();
  // Source gardens/jobs of new local records must be checked even when not in a list page.
  const refs={gardens:[...(seen.gardens||[])],serviceWork:[...(seen.serviceWork||[])]};
  for(const key of kinds)for(const entry of caches[key]||[]){
   const garden=entry.gardenId||entry.payload?.gardenId||entry.snapshot?.gardenId||entry.snapshot?.job?.gardenId;
   if(garden)refs.gardens.push(garden);
   for(const id of [entry.payload?.sourceJobId,entry.snapshot?.sourceJobId,...(entry.snapshot?.photos||[]).map(photo=>photo.jobId)])if(id)refs.serviceWork.push(id);
  }
  const inventory=workspaceInventory(caches,{...seen,...refs});
  const manifest=await verifyWorkspaceInventory(adapter.send,inventory);
  if(manifest.workspace.authorizationVersion!==current.workspace.authorizationVersion||manifest.workspace.role!==current.workspace.role||JSON.stringify(manifest.workspace.disciplines)!==JSON.stringify(current.workspace.disciplines))throw Object.assign(Error('Oprávnění se během přihlášení změnila. Obnovte přehled.'),{code:'workspace_conflict',status:409});
  const plan=planWorkspaceReconciliation(previous,current,caches,inventory,manifest);
  const accountRebased=!!previous?.user?.id&&previous.user.id!==current.user.id;
  if(accountRebased){plan.resetSettings=true;plan.reduced=true;}
  if(plan.reduced||plan.revoked.length){
   const drafts=await adapter.captureDrafts();
   const info=current.recovery||await adapter.recoveryInfo();
   const archives=[];
   adapter.beginReduction?.();
   // Separate bundles keep a single large set of photos from exceeding the per-bundle limit.
   for(const item of [...plan.revoked,...drafts.map(record=>({kind:'formDraft',record}))])archives.push(await sealWorkspaceRecovery(info,current.user.id,{originalIdentity:{userId:previous?.user?.id,installationId:previous?.installation?.id},...item}));
   await adapter.replace({plan,current,archives});
   await adapter.onReduced({archives:archives.length,rebased:accountRebased});
  }else if(!previous?.workspace)await adapter.replace({plan,current,archives:[]});
  return plan;
 }
 return {
  reconcile(previous,current){if(flight)return flight;flight=reconcile(previous,current).catch(error=>{adapter.onFailure?.(error);throw error;}).finally(()=>{flight=null;});return flight;},
  async revoke(previous){
   const info=await adapter.recoveryInfo();if(!info?.workspaceId)return false;
   const caches=await adapter.readCaches(),drafts=await adapter.captureDrafts(),archives=[];adapter.beginReduction?.();
   for(const kind of kinds)for(const record of caches[kind]||[])if(record.pending||record._pending)archives.push(await sealWorkspaceRecovery(info,previous.user.id,{kind,record,originalIdentity:{userId:previous.user.id,installationId:previous.installation?.id}}));
   for(const record of drafts)archives.push(await sealWorkspaceRecovery(info,previous.user.id,{kind:'formDraft',record}));
   await adapter.replace({plan:{keep:Object.fromEntries(kinds.map(key=>[key,[]])),resetSettings:true,reduced:true},current:null,archives});
   await adapter.onReduced({archives:archives.length,revoked:true});return true;
  }
 };
}
