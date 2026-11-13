const STORES=['records','gardens','services','serviceWork','defects'];
const wsId=value=>typeof value==='string'&&/^[-\w]{1,100}$/.test(value);

export function workspaceSameAccount(previous,next){
  if(!previous?.user?.id)return true;
  const previousInstallation=previous.installation?.id,nextInstallation=next?.installation?.id;
  if(previous.user.id===next?.user?.id&&previousInstallation===nextInstallation)return true;
  const workspace=next?.workspace;
  return !!workspace?.identityBindings?.some(binding=>binding.userId===previous.user.id&&binding.installationId===previousInstallation)&&!!workspace.entryInstallations?.some(entry=>entry.id===previousInstallation)&&(!nextInstallation||workspace.entryInstallations.some(entry=>entry.id===nextInstallation));
}

export function workspaceInventory(caches,seen={}){
  const inventory={records:[],gardens:[],services:[],serviceWork:[],defects:[]};
  for(const store of STORES){
    const ids=(caches[store]||[]).map(record=>store==='serviceWork'?record.jobId:record.id);
    inventory[store]=[...new Set([...ids,...seen[store]||[]].filter(wsId))].sort();
  }
  return inventory;
}

export function workspaceCanKeepPending(store,record,next,manifest,legacyDiscipline){
  if(!next.permissions?.write||manifest.writable===false)return false;
  const features=manifest.features||next.features||{},allowed=manifest.allowed;
  const gardenId=record.gardenId||record.payload?.gardenId||record.snapshot?.gardenId||record.snapshot?.job?.gardenId;
  const discipline=record.discipline||record.payload?.discipline||record.snapshot?.discipline||record.snapshot?.job?.discipline||legacyDiscipline;
  const gardenAllowed=!gardenId||allowed.gardens.includes(gardenId);
  const disciplineAllowed=next.workspace.disciplines.includes(discipline);
  if(store==='records')return features.shafts!==false&&next.workspace.disciplines.includes('irrigation')&&(allowed.records.includes(record.id)||!record.version&&gardenAllowed);
  if(store==='services')return features.service!==false&&disciplineAllowed&&(allowed.services.includes(record.id)||!record.version&&gardenAllowed&&!!gardenId);
  if(store==='defects')return features.defects!==false&&disciplineAllowed&&(allowed.defects.includes(record.id)||!record.payload?.version&&gardenAllowed&&!!gardenId&&(record.payload?.version>0||!record.payload?.sourceJobId||allowed.serviceWork.includes(record.payload.sourceJobId)));
  if(store==='serviceWork')return !(features.jobs===false||!allowed.serviceWork.includes(record.jobId)||next.user.role!=='owner'&&(record.payload?.report?.materialItems!==undefined||record.payload?.report?.workCharges!==undefined)||!next.permissions.manage&&record.payload?.deductOverride!==undefined);
  return false;
}

export function planWorkspaceReconciliation(previous,next,caches,inventory,manifest){
  if(!workspaceSameAccount(previous,next))throw Object.assign(Error('V zařízení jsou údaje jiného účtu.'),{code:'pending_account'});
  if(!manifest?.completeForRequestedIds||!manifest.allowed||STORES.some(store=>manifest.requestedCounts?.[store]!==inventory[store].length||!Array.isArray(manifest.allowed[store])||manifest.allowed[store].some(id=>!inventory[store].includes(id))))throw Error('Server nepotvrdil úplný rozsah ověřovaných místních identifikátorů.');
  const legacyDiscipline=previous?.workspace?.entryInstallations?.find(entry=>entry.id===previous.installation?.id)?.discipline||next.workspace.entryInstallations?.find(entry=>entry.id===previous?.installation?.id)?.discipline;
  const revoked=[];
  const keep={};
  let reduced=!!previous?.user&&(previous.user.role!==next.user.role||previous.workspace?.authorizationVersion!==undefined&&previous.workspace.authorizationVersion!==next.workspace.authorizationVersion)||!!previous?.workspace?.disciplines?.some(discipline=>!next.workspace.disciplines.includes(discipline));
  for(const store of STORES){
    keep[store]=[];
    // Referenced and previously seen ids are not stored records. Missing them from
    // the manifest is normal after a background refresh and must not lock the device.
    for(const id of inventory[store].filter(candidate=>!manifest.allowed[store].includes(candidate))){
      const record=(caches[store]||[]).find(item=>(store==='serviceWork'?item.jobId:item.id)===id);
      if(!record)continue;
      if(!(record._pending||record.pending)||!workspaceCanKeepPending(store,record,next,manifest,legacyDiscipline))reduced=true;
    }
    for(const record of caches[store]||[]){
      if(record._pending||record.pending){
        if(workspaceCanKeepPending(store,record,next,manifest,legacyDiscipline))keep[store].push({...record,...record.ownerId?{ownerId:next.user.id}:{},...store==='serviceWork'?{id:next.user.id+'|'+record.jobId+(record.kind==='jobDiary'?'|diary|'+record.entryId:record.kind==='jobDiaryIndex'?'|diary':'')}:{},...store!=='records'&&store!=='serviceWork'?{discipline:record.discipline||record.payload?.discipline||legacyDiscipline}:{}});
        else revoked.push({kind:store,record});
      }else if(manifest.allowed[store].includes(store==='serviceWork'?record.jobId:record.id))keep[store].push(record);
    }
  }
  if(previous?.user&&!next.workspace.disciplines.includes('irrigation')&&(previous.workspace?.disciplines?.includes('irrigation')||!previous.workspace&&legacyDiscipline==='irrigation'))reduced=true;
  if(previous?.permissions?.write&&!next.permissions?.write)reduced=true;
  if(reduced)for(const store of STORES)keep[store]=keep[store].filter(record=>record._pending||record.pending).map(record=>({...record,...store==='serviceWork'||store==='defects'?{snapshot:null}:{}}));
  return {keep,revoked,reduced:!!reduced,legacyDiscipline,resetSettings:!!reduced,stamp:manifest.stamp};
}
