import {workspaceInventory,workspaceSameAccount,planWorkspaceReconciliation} from './workspace-sync-model.js?v=github-sync-fix-v3';
import {sealWorkspaceRecovery} from './workspace-recovery-crypto.js?v=shared-directory-v1';

const STORES=['records','gardens','services','serviceWork','defects'];

export async function verifyWorkspaceInventory(send,inventory){
  const manifest={allowed:Object.fromEntries(STORES.map(store=>[store,[]])),requestedCounts:Object.fromEntries(STORES.map(store=>[store,inventory[store].length])),completeForRequestedIds:true};
  const batches=Math.max(1,...STORES.map(store=>Math.ceil(inventory[store].length/1000)));
  for(let index=0;index<batches;index++){
    const slice=Object.fromEntries(STORES.map(store=>[store,inventory[store].slice(index*1000,(index+1)*1000)]));
    const response=await send('/api/workspace/manifest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...slice,...manifest.stamp?{expectedStamp:manifest.stamp}:{} })});
    if(!response.completeForRequestedIds||!response.stamp||manifest.stamp&&response.stamp!==manifest.stamp||STORES.some(store=>response.requestedCounts?.[store]!==slice[store].length||!Array.isArray(response.allowed?.[store])||response.allowed[store].some(id=>!slice[store].includes(id))))throw Error('Server nepotvrdil úplné ověření místní práce.');
    for(const store of STORES)manifest.allowed[store].push(...response.allowed[store]);
    Object.assign(manifest,{stamp:response.stamp,workspace:response.workspace,writable:response.writable,features:response.features});
  }
  if((await send('/api/workspace/manifest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...Object.fromEntries(STORES.map(store=>[store,[]])),expectedStamp:manifest.stamp})})).stamp!==manifest.stamp)throw Error('Oprávnění se během ověřování změnila.');
  return manifest;
}

export function createWorkspaceClient(handlers){
  let flight;
  async function reconcileBody(previous,next){
    if(!next.workspace)return null;
    if(!workspaceSameAccount(previous,next))throw Object.assign(Error('Místní práce patří jinému účtu. Otevřete původní přístup.'),{code:'pending_account',status:403});
    const caches=await handlers.readCaches(),seen=await handlers.readSeen();
    const related={gardens:[...seen.gardens||[]],serviceWork:[...seen.serviceWork||[]]};
    for(const store of STORES)for(const record of caches[store]||[]){
      const gardenId=record.gardenId||record.payload?.gardenId||record.snapshot?.gardenId||record.snapshot?.job?.gardenId;
      if(gardenId)related.gardens.push(gardenId);
      for(const jobId of [record.payload?.sourceJobId,record.snapshot?.sourceJobId,...(record.snapshot?.photos||[]).map(photo=>photo.jobId)])if(jobId)related.serviceWork.push(jobId);
    }
    const inventory=workspaceInventory(caches,{...seen,...related});
    const manifest=await verifyWorkspaceInventory(handlers.send,inventory);
    if(manifest.workspace.authorizationVersion!==next.workspace.authorizationVersion||manifest.workspace.role!==next.workspace.role||JSON.stringify(manifest.workspace.disciplines)!==JSON.stringify(next.workspace.disciplines))throw Object.assign(Error('Oprávnění se během přihlášení změnila. Obnovte přehled.'),{code:'workspace_conflict',status:409});
    const plan=planWorkspaceReconciliation(previous,next,caches,inventory,manifest);
    const rebased=!!previous?.user?.id&&previous.user.id!==next.user.id;
    if(rebased){plan.resetSettings=true;plan.reduced=true;}
    if(plan.reduced||plan.revoked.length){
      const drafts=await handlers.captureDrafts();
      const recovery=next.recovery||await handlers.recoveryInfo();
      const archives=[];
      handlers.beginReduction?.();
      for(const entry of [...plan.revoked,...drafts.map(record=>({kind:'formDraft',record}))])archives.push(await sealWorkspaceRecovery(recovery,next.user.id,{originalIdentity:{userId:previous?.user?.id,installationId:previous?.installation?.id},...entry}));
      await handlers.replace({plan,current:next,archives});
      await handlers.onReduced({archives:archives.length,rebased});
    }else if(!previous?.workspace)await handlers.replace({plan,current:next,archives:[]});
    return plan;
  }
  return {
    reconcile(previous,next){
      return flight||(flight=reconcileBody(previous,next).catch(error=>{
        // Successful reduction reloads the page by throwing workspace_reload.
        // That is not a failed seal and must not show the access-changed lock.
        if(error?.code==='workspace_reload')throw error; // The host onReduced callback owns navigation.
        throw handlers.onFailure?.(error),error;
      }).finally(()=>{flight=null;}),flight);
    },
    async revoke(session){
      const recovery=await handlers.recoveryInfo();
      if(!recovery?.workspaceId)return false;
      const caches=await handlers.readCaches(),drafts=await handlers.captureDrafts(),archives=[];
      handlers.beginReduction?.();
      for(const store of STORES)for(const record of caches[store]||[])if(record.pending||record._pending)archives.push(await sealWorkspaceRecovery(recovery,session.user.id,{kind:store,record,originalIdentity:{userId:session.user.id,installationId:session.installation?.id}}));
      for(const record of drafts)archives.push(await sealWorkspaceRecovery(recovery,session.user.id,{kind:'formDraft',record}));
      await handlers.replace({plan:{keep:Object.fromEntries(STORES.map(store=>[store,[]])),resetSettings:true,reduced:true},current:null,archives});
      try{await handlers.onReduced({archives:archives.length,revoked:true});}
      catch(error){if(error?.code!=='workspace_reload')throw error;} // Already handled by the host callback.
      return true;
    }
  };
}
