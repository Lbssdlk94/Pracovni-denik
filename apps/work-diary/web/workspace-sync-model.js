const wsKinds=['records','gardens','services','serviceWork','defects'];
const wsId=value=>typeof value==='string'&&/^[-\w]{1,100}$/.test(value);
export function workspaceSameAccount(previous,current){
 if(!previous?.user?.id)return true;
 const oldInstallation=previous.installation?.id,newInstallation=current?.installation?.id;
 if(previous.user.id===current?.user?.id&&oldInstallation===newInstallation)return true;
 const workspace=current?.workspace;
 const bound=workspace?.identityBindings?.some(binding=>binding.userId===previous.user.id&&binding.installationId===oldInstallation);
 return !!bound&&!!workspace.entryInstallations?.some(entry=>entry.id===oldInstallation)&&(!newInstallation||workspace.entryInstallations.some(entry=>entry.id===newInstallation));
}
export function workspaceInventory(caches,seen={}){
 const values={records:[],gardens:[],services:[],serviceWork:[],defects:[]};
 for(const kind of wsKinds){const ids=(caches[kind]||[]).map(row=>kind==='serviceWork'?row.jobId:row.id);values[kind]=[...new Set([...ids,...(seen[kind]||[])].filter(wsId))].sort();}
 return values;
}
export function workspaceCanKeepPending(kind,entry,current,manifest,legacyDiscipline){
 if(!current.permissions?.write||manifest.writable===false)return false;
 const features=manifest.features||current.features||{},allowed=manifest.allowed;
 const gardenId=entry.gardenId||entry.payload?.gardenId||entry.snapshot?.gardenId||entry.snapshot?.job?.gardenId;
 const discipline=entry.discipline||entry.payload?.discipline||entry.snapshot?.discipline||entry.snapshot?.job?.discipline||legacyDiscipline;
 const permitsGarden=!gardenId||allowed.gardens.includes(gardenId);
 const scoped=current.workspace.disciplines.includes(discipline);
 if(kind==='records')return features.shafts!==false&&current.workspace.disciplines.includes('irrigation')&&(allowed.records.includes(entry.id)||!entry.version&&permitsGarden);
 if(kind==='services')return features.service!==false&&scoped&&(allowed.services.includes(entry.id)||!entry.version&&permitsGarden&&!!gardenId);
 if(kind==='defects')return features.defects!==false&&scoped&&(allowed.defects.includes(entry.id)||!entry.payload?.version&&permitsGarden&&!!gardenId&&(entry.payload?.version>0||!entry.payload?.sourceJobId||allowed.serviceWork.includes(entry.payload.sourceJobId)));
 if(kind==='serviceWork'){
  if(features.jobs===false||!allowed.serviceWork.includes(entry.jobId))return false;
  if(current.user.role!=='owner'&&(entry.payload?.report?.materialItems!==undefined||entry.payload?.report?.workCharges!==undefined))return false;
  if(!current.permissions.manage&&entry.payload?.deductOverride!==undefined)return false;
  return true;
 }
 return false;
}
export function planWorkspaceReconciliation(previous,current,caches,inventory,manifest){
 if(!workspaceSameAccount(previous,current))throw Object.assign(Error('V zařízení jsou údaje jiného účtu.'),{code:'pending_account'});
 if(!manifest?.completeForRequestedIds||!manifest.allowed||wsKinds.some(kind=>manifest.requestedCounts?.[kind]!==inventory[kind].length||!Array.isArray(manifest.allowed[kind])||manifest.allowed[kind].some(id=>!inventory[kind].includes(id))))throw Error('Server nepotvrdil úplný rozsah ověřovaných místních identifikátorů.');
 const legacyDiscipline=previous?.workspace?.entryInstallations?.find(entry=>entry.id===previous.installation?.id)?.discipline||current.workspace.entryInstallations?.find(entry=>entry.id===previous?.installation?.id)?.discipline;
 const revoked=[],keep={};let reduced=!!previous?.user&&(previous.user.role!==current.user.role||previous.workspace?.authorizationVersion!==undefined&&previous.workspace.authorizationVersion!==current.workspace.authorizationVersion)||previous?.workspace?.disciplines?.some(value=>!current.workspace.disciplines.includes(value));
 for(const kind of wsKinds){keep[kind]=[];for(const id of inventory[kind].filter(value=>!manifest.allowed[kind].includes(value))){const row=(caches[kind]||[]).find(value=>(kind==='serviceWork'?value.jobId:value.id)===id);if(!row||!(row._pending||row.pending)||!workspaceCanKeepPending(kind,row,current,manifest,legacyDiscipline))reduced=true;}
  for(const row of caches[kind]||[]){const pending=!!(row._pending||row.pending);
   if(pending){if(workspaceCanKeepPending(kind,row,current,manifest,legacyDiscipline))keep[kind].push({...row,...(row.ownerId?{ownerId:current.user.id}:{}),...(kind==='serviceWork'?{id:current.user.id+'|'+row.jobId}:{}),...(kind!=='records'&&kind!=='serviceWork'?{discipline:row.discipline||row.payload?.discipline||legacyDiscipline}:{} )});else revoked.push({kind,record:row});}
   else if(manifest.allowed[kind].includes(kind==='serviceWork'?row.jobId:row.id))keep[kind].push(row);
  }
 }
 if(previous?.user&&!current.workspace.disciplines.includes('irrigation')&&(previous.workspace?.disciplines?.includes('irrigation')||!previous.workspace&&legacyDiscipline==='irrigation'))reduced=true;
 if(previous?.permissions?.write&&!current.permissions?.write)reduced=true;
 if(reduced){for(const kind of wsKinds)keep[kind]=keep[kind].filter(row=>row._pending||row.pending).map(row=>({...row,...(kind==='serviceWork'||kind==='defects'?{snapshot:null}:{} )}));}
 return {keep,revoked,reduced,legacyDiscipline,resetSettings:!!reduced,stamp:manifest.stamp};
}
