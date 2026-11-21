import {createJobDiaryClient} from './job-diary-client.js?v=job-diary-v1';
import {createJobListCache,JOB_CACHE_KEY} from './job-list-cache.js?v=job-three-month-v1';
import {rolePreviewSession,rolePreviewTargets} from './role-preview-model.js?v=role-preview-v1';
import {createWorkspaceClient} from './workspace-client.js?v=job-diary-v1';
import {workspaceSameAccount} from './workspace-sync-model.js?v=job-diary-v1';
import {captureActiveFormDrafts} from './form-drafts.js?v=draft-recovery-v1';
import {pendingGardenHistory} from './garden-history-model.js?v=workspace-roles-v1';
import {packLocalPhotos,unpackLocalPhotos} from './photo-storage.js?v=workspace-roles-v1';
import {readFromServer,openLocalDatabase,finishLocalTransaction,transientConnectionError} from './io.js?v=connection-recovery-v1';
import {normalizeAddress} from './nearby.js?v=workspace-roles-v1';
import {featureEnabled} from './features.js?v=fleet-photo-v1';
import {DEFAULT_ZONES} from './model.js?v=workspace-roles-v1';
let pendingSyncFlight=null,previewRole=null;
const communicationSamples=[];
export const communicationDiagnostics=()=>communicationSamples.map(sample=>({...sample}));
let database,opening,identity,zonesVersion=0,refreshFlight=null,workspaceBlocked=false,workspaceEpoch=0,workspaceReconciling=false,identityFlight=null,identityGeneration=0;
const workspaceSeen={records:new Set(),gardens:new Set(),services:new Set(),serviceWork:new Set(),defects:new Set()};
const open=()=>database?Promise.resolve(database):opening||(opening=openLocalDatabase('zavlahovy-denik-team',5,r=>{const db=r.result;if(!db.objectStoreNames.contains('recovery'))db.createObjectStore('recovery',{keyPath:'id'});if(!db.objectStoreNames.contains('defects'))db.createObjectStore('defects',{keyPath:'id'});if(!db.objectStoreNames.contains('serviceWork'))db.createObjectStore('serviceWork',{keyPath:'id'});if(!db.objectStoreNames.contains('records'))db.createObjectStore('records',{keyPath:'id'});if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings');if(!db.objectStoreNames.contains('services')){const target=db.createObjectStore('services',{keyPath:'id'}),cursor=r.transaction.objectStore('settings').openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;if(String(c.key).startsWith('services:')&&Array.isArray(c.value))for(const value of c.value)target.put({...value,gardenId:value.gardenId||String(c.key).slice(9)});c.continue();};}}).then(db=>{database=db;database.onversionchange=()=>{database.close();database=null;opening=null;};return db;}).catch(error=>{opening=null;throw error;}));
async function store(name,mode,action){const epoch=workspaceEpoch;const db=await open();if(mode==='readwrite'&&name!=='recovery'&&(workspaceBlocked||epoch!==workspaceEpoch))throw workspaceResetError();const tx=db.transaction(name,mode);let result;try{result=action(tx.objectStore(name));}catch(error){tx.abort();throw error;}return finishLocalTransaction(tx,result);}
const put=r=>store('records','readwrite',s=>s.put(r));
const remove=id=>store('records','readwrite',s=>s.delete(id));
const get=id=>store('records','readonly',s=>s.get(id));
const setting=(key,value)=>store('settings','readwrite',s=>s.put(value,key));
const getSetting=key=>store('settings','readonly',s=>s.get(key));
export const getRecords=()=>store('records','readonly',s=>s.getAll());
export const session=()=>rolePreviewSession(identity,previewRole);
export const isRolePreview=()=>!!previewRole;
export function setRolePreview(role=null){if(role&&!rolePreviewTargets(identity?.user?.role).includes(role))throw Error('Tento náhled není dostupný pro váš účet.');previewRole=role||null;return session();}
// A local preview is a form validation failure, not a revoked account/session.
// The server independently rejects marked mutations with HTTP 403.
function requireLiveRole(){if(previewRole)throw Object.assign(Error('V náhledu role nelze ukládat změny. Vraťte se ke své roli.'),{status:400,code:'role_preview_readonly'});}
export async function saveFeatures(features,version){const data=await request('/api/features',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({features,version})});identity={...identity,...data};await setting('session',identity);return data;}
function checkOfflineWrite(){requireLiveRole();if(workspaceBlocked)throw workspaceResetError();if(identity?.license&&(!identity.license.active||identity.license.expiresAt<=Date.now()))throw new Error('Licence vyžaduje ověření po připojení k internetu. Rozepsané změny zůstávají zachované.');if(!featureEnabled('offline',identity?.features)&&!navigator.onLine)throw new Error('Ukládání bez internetu je v nastavení týmu vypnuté. Připojte se k internetu.');}
const jobListCache=createJobListCache({read:()=>getSetting(JOB_CACHE_KEY),change:update=>store('settings','readwrite',target=>{const value=target.get(JOB_CACHE_KEY);value.onsuccess=()=>target.put(update(value.result),JOB_CACHE_KEY);return value;}),send:(path,options)=>serverRequest(path,options),getSession:()=>session(),online:()=>navigator.onLine,notify:detail=>window.dispatchEvent(new CustomEvent(detail.denied?'job-cache-denied':'job-cache-updated',{detail}))});
export const peekCachedJobs=path=>workspaceBlocked?Promise.resolve(null):jobListCache.peek(path);
export const warmJobMonths=()=>workspaceBlocked?Promise.resolve():jobListCache.warm();
export async function request(path,options={}){
 if(workspaceBlocked)throw workspaceResetError();
 const route=path.split('?')[0],method=(options.method||'GET').toUpperCase();
 const changesJobs=method!=='GET'&&method!=='HEAD'&&/^\/api\/(?:jobs|customers|gardens|subscriptions|tariffs|members|features|local-accounts|workspace\/members)(?:\/|$)/.test(route);
 if(changesJobs)jobListCache.beginChange();
 if(route==='/api/jobs'&&method==='GET')return jobListCache.request(path,options);
 try{const result=await serverRequest(path,options);if(changesJobs)await jobListCache.changed(result,route,method);return result;}catch(error){if((error.status===401||error.status===403&&(route==='/api/me'||route.startsWith('/api/jobs'))||error.status===404&&/^\/api\/jobs\//.test(route))&&!workspaceReconciling){await jobListCache.invalidate();if(route.startsWith('/api/jobs/'))window.dispatchEvent(new CustomEvent('job-cache-denied',{detail:{error}}));}throw error;}
}
async function serverRequest(path,options={}){
  if(workspaceBlocked)throw workspaceResetError();
  if(previewRole&&options.method&&!['GET','HEAD'].includes(options.method)&&path.split('?')[0]!=='/api/workspace/manifest'&&path.split('?')[0]!=='/api/assistant')requireLiveRole();
  if(identity?.workspace?.selectedDiscipline&&['/api/jobs','/api/customers','/api/gardens','/api/defects'].includes(path.split('?')[0])){const selected=new URL(path,location.origin);if(!selected.searchParams.has('discipline'))selected.searchParams.set('discipline',identity.workspace.selectedDiscipline);path=selected.pathname+selected.search;}
  const epoch=workspaceEpoch,headers=new Headers(options.headers);if(previewRole)headers.set('x-work-diary-preview-role',previewRole);headers.set('x-workspace-client-version','shared-directory-v1');if(identity?.workspace?.selectedDiscipline&&!headers.has('x-work-discipline'))headers.set('x-work-discipline',identity.workspace.selectedDiscipline);if(options.method&&options.method!=='GET')headers.set('x-zavlahy-request','1');
  const {timeoutMs,jobCacheRefresh,...fetchOptions}=options;
  const started=performance.now();let failure;
  try{return await readFromServer(path,{...fetchOptions,headers,credentials:'same-origin',cache:'no-store'},async response=>{
    if(!response.ok){const data=await response.json().catch(()=>({error:'Přihlášení vypršelo. Přihlaste se jménem a heslem.'}));const error=new Error(data.error||'Operace se nepodařila.');error.status=response.status;error.code=data.code;error.preview=data.preview;error.email=data.email;throw error;}
    const value=await response.json();if(epoch!==workspaceEpoch||workspaceBlocked)throw workspaceResetError();rememberWorkspaceIds(value);if((path==='/api/auth/login'&&typeof value.mustChange==='boolean')||path==='/api/auth/password'||path==='/api/access-logout')announceSessionChange();return value;
  },timeoutMs??(options.method&&options.method!=='GET'?60000:15000),{retries:1});}
  catch(error){failure=error;if(transientConnectionError(error))window.dispatchEvent(new CustomEvent('communication-retry-needed'));throw error;}
  finally{communicationSamples.push({route:'/api/'+path.split('/')[2]?.split('?')[0],method:options.method||'GET',ms:Math.round(performance.now()-started),status:failure?.status||(!failure?200:0),code:failure?.code||null});if(communicationSamples.length>50)communicationSamples.shift();}
}
export async function checkAccountSwitch(id,info=null){const previous=await getSetting('session');if(previous?.user.id&&!workspaceSameAccount(previous,{user:{id},installation:info?.installation,workspace:info?.workspace})&&(await pendingSummary()).total){const error=new Error('V tomto zařízení čekají nesdílené změny jiného uživatele. Nejdříve se přihlaste původním účtem a změny sdílejte.');error.code='pending_account';throw error;}}
// Lock cached access before changing the server cookie, including mandatory
// first-change sessions. Preserve every pending record for the verified account.
export async function prepareAccountLogin(){await jobListCache.invalidate();invalidateIdentity();await setting('locked',true);}
export async function checkChatGPTSwitch(){const previous=await getSetting('session');if(['link','password'].includes(previous?.user.authMethod)&&(await pendingSummary()).total)throw new Error('Nejdříve sdílejte čekající změny pod původním účtem.');}
async function acceptIdentity(current){if(!current.workspace)await jobListCache.invalidate();const previous=await getSetting('session');if(current.workspace){const preferred=await getSetting('workspace-selected-discipline');if(preferred==='all'&&current.workspace.disciplines.length>1||current.workspace.disciplines.includes(preferred))current.workspace.selectedDiscipline=preferred;workspaceReconciling=true;try{await workspaceClient.reconcile(previous,current);}finally{workspaceReconciling=false;}}if(previous?.user.id&&!workspaceSameAccount(previous,current)){if((await pendingSummary()).total){const error=new Error('V tomto telefonu čekají nesdílené změny jiného účtu. Přihlaste se původním účtem a nejdříve je sdílejte nebo zálohujte.');error.status=403;error.code='pending_account';throw error;}await store('records','readwrite',s=>s.clear());await store('services','readwrite',s=>s.clear());await store('serviceWork','readwrite',s=>s.clear());await store('defects','readwrite',s=>s.clear());await store('settings','readwrite',s=>s.clear());}if(previous?.user.role&&previous.user.role!==current.user.role){await clearFormDrafts();await invalidateServiceWork();}if(!current.permissions.manage)for(const entry of await allServiceWork()){if(entry.ownerId!==current.user.id||!entry.snapshot?.subscription)continue;await changeServiceWork(entry.id,old=>{if(!old?.snapshot?.subscription)return old;const subscription=old.snapshot.subscription;return {...old,snapshot:{...old.snapshot,subscription:{...subscription,payments:[],periods:subscription.periods.map(({agreedPrice,received,...period})=>{const {priceMinor,...snapshot}=period.snapshot;return {...period,snapshot};})}}};});}if(!featureEnabled('materials',current.features))await setting('owner-materials-catalog',null);identity=current;await setting('session',current);await setting('locked',false);return current;}
// Discover account/role/modules once per document. Regular sync, writes,
// settings navigation and the legacy iPhone bridge reuse this in-memory identity.
// Actual resource requests remain independently authorized by the server.
export async function connect({refresh=false}={}){
 if(workspaceBlocked)throw workspaceResetError();
 if(identity&&!refresh)return session();
 if(identityFlight){await identityFlight;return session();}
 const generation=identityGeneration;
 const task=(async()=>{try{const selected=await getSetting('workspace-selected-discipline');const current=await request('/api/me',{headers:['all','irrigation','garden'].includes(selected)?{'x-work-discipline':selected}:{}});if(generation!==identityGeneration)throw workspaceResetError();return await acceptIdentity(current);}catch(error){if(generation!==identityGeneration)throw workspaceResetError();if([401,403].includes(error.status)&&error.code!=='pending_account'){const previous=await getSetting('session');if(previous?.user){workspaceReconciling=true;try{await workspaceClient.revoke(previous);}catch(recoveryError){workspaceBlocked=true;workspaceEpoch++;window.dispatchEvent(new CustomEvent('workspace-access-freeze'));throw Object.assign(new Error('Přístup byl odvolán. Neodeslanou práci se zatím nepodařilo zabezpečit: '+recoveryError.message+' Připojte se a zkuste otevřít aplikaci znovu; místní zápisy nebyly smazány.'),{status:403,code:'workspace_recovery_failed'});}finally{workspaceReconciling=false;}}}throw error;}})();identityFlight=task;
 try{await task;return session();}finally{if(identityFlight===task)identityFlight=null;}
}
function invalidateIdentity(){previewRole=null;identityGeneration++;identityFlight=null;identity=null;}
// Login/logout in another tab is an explicit account transition, not a timer.
// Reuse the existing cross-tab reset so old UI cannot keep using a new cookie.
function announceSessionChange(){try{localStorage.setItem('work-diary-workspace-reset',String(Date.now())+':'+crypto.randomUUID());}catch{}}

export async function offlineSession(){if(workspaceBlocked||await getSetting('locked'))return null;const previous=await getSetting('session');if(!previous)return null;if(previous.user?.authMethod==='link'){identity=null;return null;}if(previous.license&&(!previous.license.active||previous.license.expiresAt<=Date.now()))return null;if(!previous.verifiedAt||Date.now()-previous.verifiedAt>86400000)return null;identity=previous;return previous;}
export async function lockSession(){await jobListCache.invalidate();if(workspaceBlocked)return;invalidateIdentity();await invalidateServiceWork();await setting('locked',true);}
export async function forgetSession(){requireLiveRole();invalidateIdentity();await store('settings','readwrite',s=>s.clear());await store('records','readwrite',s=>s.clear());await store('services','readwrite',s=>s.clear());await store('serviceWork','readwrite',s=>s.clear());await store('defects','readwrite',s=>s.clear());}
export async function getZones(seed=DEFAULT_ZONES){if(!featureEnabled('zoneManagement',identity?.features))return [];if(identity?.license&&(!identity.license.active||!identity.license.modules.zoneManagement))return await cachedZones()||DEFAULT_ZONES.map(z=>({...z}));
  const data=await request('/api/zones');zonesVersion=data.version;
  if(data.zones===null&&identity.permissions.write&&!previewRole){return await saveZones(seed.map(z=>({...z})));}
  const zones=data.zones||DEFAULT_ZONES.map(z=>({...z}));await setting('zones',zones);return zones;
}
export const cachedZones=()=>getSetting('zones');
export async function saveZones(zones){const data=await request('/api/zones',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({zones,version:zonesVersion})});zonesVersion=data.version;await setting('zones',data.zones);return data.zones;}
async function upload(record){
  const form=new FormData();form.append('record',JSON.stringify({name:record.name,gardenId:record.gardenId||null,location:record.location,notes:record.notes,markers:record.markers,...(Object.hasOwn(record,'position')?{position:record.position}:{}),version:record.version||0}));
  if(!record.imageVersion)form.append('image',record.image,'photo.jpg');
  const data=await request('/api/shafts/'+encodeURIComponent(record.id),{method:'PUT',body:form});
  const saved={...data.record,image:record.image,_pending:false,_conflict:false};await put(saved);return saved;
}
export async function saveRecord(record){
  checkOfflineWrite();
  if(!identity?.permissions.write)throw new Error('Máte oprávnění pouze k prohlížení.');
  try{return await upload(record);}catch(error){
    if(error.status===409){await put({...record,_pending:true,_conflict:true});throw error;}
    if(!error.status||error.status>=500){const pending={...record,_pending:true,_conflict:false};await put(pending);return pending;}
    throw error;
  }
}
export async function waitForRefresh(){await Promise.allSettled([refreshFlight,pendingSyncFlight].filter(Boolean));}
export async function refreshRecords({reconnect=true}={}){
  if(refreshFlight)return refreshFlight;
  refreshFlight=(async()=>{
    if(reconnect)await connect();if(identity.license&&!identity.license.active)return getRecords();
    if(!featureEnabled('shafts',identity.features)||identity.license&&!identity.license.modules.shafts)return [];const data=await request('/api/shafts');
    for(const remote of data.records){const local=await get(remote.id);if(local?._pending){if(remote.version!==local.version||remote.deleted)await put({...local,_conflict:true});continue;}if(remote.deleted){if(local)await remove(remote.id);continue;}
      if(local?.version===remote.version&&!local._needsRefresh)continue;
      let image=local?.image;
      if(!image||local.imageVersion!==remote.imageVersion){image=await readFromServer('/api/shafts/'+encodeURIComponent(remote.id)+'/photo',{credentials:'same-origin',cache:'no-store'},response=>{if(!response.ok){const error=new Error('Fotografii nelze načíst. Zkuste obnovit přehled.');error.status=response.status;throw error;}return response.blob();},20000);}
      await put({...remote,image,_pending:false,_conflict:false});
    }
    return await getRecords();
  })();
  try{return await refreshFlight;}finally{refreshFlight=null;}
}
// A failed photo/upload is independent of loading jobs, customers and gardens.
// No queue is removed here: each sender acknowledges only its own operation ID.
export async function syncPendingChanges(){
 if(previewRole)return;
 if(!identity||workspaceBlocked||!navigator.onLine||identity.license&&!identity.license.active)return;
 if(pendingSyncFlight)return pendingSyncFlight;
 const task=(async()=>{
  for(const send of [()=>featureEnabled('service',identity?.features)&&syncServices(),()=>syncServiceWork(),()=>featureEnabled('defects',identity?.features)&&syncDefects(),async()=>{
    for(const pending of (await getRecords()).filter(r=>r._pending&&!r._conflict)){
      if(!identity.permissions.write||!featureEnabled('shafts',identity.features)||identity.license&&!identity.license.modules.shafts)break;
      try{await upload(pending);}catch(error){if(error.status===409||error.code==='garden_missing')await put({...pending,_conflict:true});else throw error;}
    }
  }]){
   try{await send();}catch(error){if([401,403].includes(error.status)||workspaceBlocked)throw error;window.dispatchEvent(new CustomEvent('communication-retry-needed'));}
  }
 })();pendingSyncFlight=task;
 try{return await task;}finally{if(pendingSyncFlight===task)pendingSyncFlight=null;}
}
export async function discardConflict(id){requireLiveRole();await remove(id);return refreshRecords();}
export async function deleteRecord(id){requireLiveRole();const record=await get(id);if(!record?.version){await remove(id);return;}await request('/api/shafts/'+encodeURIComponent(id),{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({version:record.version})});await remove(id);}
export async function getGardens(){if(!featureEnabled('gardens',identity?.features))return [];if(identity?.license&&(!identity.license.active||!identity.license.modules.gardens))return [];const data=await request('/api/gardens');await setting('gardens',data.gardens);return data.gardens;}
export const cachedGardens=async()=>await getSetting('gardens')||[];
export const gardenSort=async()=>(await getSetting('garden-sort'))==='nearest'?'nearest':'name';
export const saveGardenSort=mode=>setting('garden-sort',mode==='nearest'?'nearest':'name');
export const gardenChoices=async()=>await getSetting('garden-address-choices')||{};
export async function chooseGardenAddress(garden,candidate){requireLiveRole();const choices=await gardenChoices();choices[garden.id]={address:normalizeAddress(garden.address),candidate};await setting('garden-address-choices',choices);return choices;}
export const addressFromPosition=(position,signal)=>request('/api/gardens/address-from-position',{method:'POST',signal,headers:{'content-type':'application/json'},body:JSON.stringify({latitude:position.latitude,longitude:position.longitude})});
export async function resolveGardenAddress(garden,signal){const data=await request('/api/gardens/'+encodeURIComponent(garden.id)+'/geocode',{method:'POST',signal,headers:{'content-type':'application/json'},body:JSON.stringify({address:garden.address})});const gardens=await cachedGardens();await setting('gardens',gardens.map(g=>g.id===garden.id&&normalizeAddress(g.address)===data.address?{...g,geocode:data}:g));return data;}
export async function gardenDeletionPreview(id){if(!navigator.onLine)throw new Error('Zahradu mažte s připojením k internetu.');if((await getRecords()).some(r=>r.gardenId===id&&r._pending)||(await cachedServices(id)).some(s=>s._pending))throw new Error('V této zahradě čekají místní změny na sdílení. Nejdříve je synchronizujte nebo vyřešte jejich konflikt.');return request('/api/gardens/'+encodeURIComponent(id)+'/delete-preview');}
export async function deleteGarden(preview,mode){if(!navigator.onLine)throw new Error('Zahradu mažte s připojením k internetu.');const id=preview.garden.id;await gardenDeletionPreview(id);const result=await request('/api/gardens/'+encodeURIComponent(id),{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({version:preview.garden.version,shafts:preview.shafts,services:preview.services,mode})});for(const s of await cachedServices(id))if(!s._pending)await changeService(s.id,()=>null);await store('settings','readwrite',s=>{s.delete('plan:'+id);s.delete('blowout:'+id);const cursor=s.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;if(String(c.key).startsWith('blowout-photo:'+id+':'))c.delete();c.continue();};});await setting('gardens',(await cachedGardens()).filter(g=>g.id!==id));for(const r of await getRecords())if(r.gardenId===id&&!r._pending){if(mode==='keep-shafts')await put({...r,gardenId:null,version:r.version+1,_needsRefresh:true});else await remove(r.id);}try{await getGardens();await refreshRecords();}catch{}return result;}
export const pendingServices=async()=>(await allServices()).filter(s=>s._pending);
export async function movePendingService(id,gardenId,newId){const value=await serviceGet(id);if(!value?._pending)throw new Error('Tento záznam už nečeká na sdílení.');const saved=await saveService(gardenId,{...value,id:newId,version:0});await changeService(id,()=>null);return saved;}
export async function saveGarden(value){const data=await request('/api/gardens'+(value.version?'/'+encodeURIComponent(value.id):''),{method:value.version?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});await getGardens();return data.garden;}
export async function uploadPlan(garden,file){const form=new FormData();form.append('version',String(garden.version));form.append('plan',file,file.name||garden.plan?.name||'plan.pdf');const data=await request('/api/gardens/'+encodeURIComponent(garden.id)+'/plan',{method:'PUT',body:form});await setting('plan:'+garden.id,{version:data.garden.plan.version,blob:new Blob([file],{type:data.garden.plan.type})});await getGardens();return data.garden;}
export async function savePlanMarkers(garden,markers){if(!navigator.onLine)throw new Error('Uložení značek v plánu vyžaduje internet.');const data=await request('/api/gardens/'+encodeURIComponent(garden.id)+'/plan-markers',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({version:garden.version,planVersion:garden.plan.version,markers})});await getGardens();return data.garden;}
export async function restorePlanMarkers(gardens){requireLiveRole();for(const g of gardens){if(!g.plan?.markers?.length)continue;const current=(await getGardens()).find(v=>v.id===g.id);if(current?.plan?.type.startsWith('image/'))await savePlanMarkers(current,g.plan.markers);}}
export async function getPlan(garden){const cached=await getSetting('plan:'+garden.id);if(cached?.version===garden.plan?.version)return cached.blob;const response=await fetch('/api/gardens/'+encodeURIComponent(garden.id)+'/plan',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('Plán nelze načíst. Připojte se k internetu a ověřte svůj přístup.');const blob=await response.blob();await setting('plan:'+garden.id,{version:garden.plan.version,blob});return blob;}

const servicePath=gardenId=>'/api/gardens/'+encodeURIComponent(gardenId)+'/services';
const allServices=()=>store('services','readonly',s=>s.getAll());
const serviceGet=id=>store('services','readonly',s=>s.get(id));
async function changeService(id,change){if(workspaceBlocked)throw workspaceResetError();const epoch=workspaceEpoch,db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('services','readwrite'),s=tx.objectStore('services'),r=s.get(id);let value;r.onsuccess=()=>{try{if(workspaceBlocked||epoch!==workspaceEpoch)throw workspaceResetError();value=change(r.result);if(value===null)s.delete(id);else if(value!==undefined)s.put(value);else value=r.result;}catch(error){tx.abort();reject(error);}};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Servis se nepodařilo uložit do telefonu.'));});}
export const cachedServices=async gardenId=>(await allServices()).filter(s=>s.gardenId===gardenId);
export async function pendingSummary(){const work=(await allServiceWork()).filter(w=>w.pending);const shafts=(await getRecords()).filter(s=>s._pending),services=(await allServices()).filter(s=>s._pending);const defects=(await allDefectEntries()).filter(d=>d.pending);return {defects:defects.length,total:shafts.length+services.length+work.length+defects.length,services:services.length,serviceWork:work.length,conflicts:services.filter(s=>s._conflict).length+work.filter(w=>w.conflict).length+defects.filter(d=>d.conflict).length,blocked:services.filter(s=>s._blocked).length+work.filter(w=>w.blocked).length+defects.filter(d=>d.blocked).length};}
const serviceFlights=new Map();let servicesSync;
async function sendService(id){if(serviceFlights.has(id))return serviceFlights.get(id);const task=(async()=>{const sent=await serviceGet(id);if(!sent?._pending||sent._conflict||sent._blocked)return sent;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const data=await request(servicePath(sent.gardenId)+'/'+encodeURIComponent(id),{method:'PUT',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({version:sent.version||0,mutationId:sent._mutationId,discipline:sent.discipline,date:sent.date,work:sent.work,parts:sent.parts,notes:sent.notes})});return await changeService(id,current=>{if(!current)return data.service;if(current._mutationId===sent._mutationId)return {...data.service,_pending:false,_conflict:false};if(current._pending&&current.version===sent.version)return {...current,version:data.service.version};return current;});}catch(error){await changeService(id,current=>{if(!current||current._mutationId!==sent._mutationId)return current;if(error.status===409)return {...current,_conflict:true,_error:error.message,_remote:undefined};if(error.status&&error.status<500)return {...current,_blocked:true,_blockedReason:[401,403].includes(error.status)?'permission':'validation',_error:error.message};return current;});throw error;}finally{clearTimeout(timer);}})();serviceFlights.set(id,task);try{return await task;}finally{serviceFlights.delete(id);}}
function validateServiceInput(value){const date=new Date(value.date+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value.date||Number(value.date.slice(0,4))<1000)throw new Error('Vyberte platné datum servisu.');for(const [key,max] of [['work',4000],['parts',2000],['notes',2000]])if(typeof value[key]!=='string'||value[key].length>max||(key==='work'&&!value[key].trim()))throw new Error('Zkontrolujte vyplněné údaje servisu.');}
export async function saveService(gardenId,value){checkOfflineWrite();if(!identity?.permissions.write)throw new Error('Máte oprávnění pouze k prohlížení.');validateServiceInput(value);const now=Date.now();await changeService(value.id,old=>({...old,id:value.id,gardenId,discipline:value.discipline||old?.discipline||identity?.workspace?.selectedDiscipline||identity?.workspace?.disciplines?.[0],date:value.date,work:value.work.trim(),parts:value.parts.trim(),notes:value.notes.trim(),version:old?._pending?old.version:(value.version??old?.version??0),createdAt:old?.createdAt||now,updatedAt:now,createdBy:old?.createdBy||identity.user.id,updatedBy:identity.user.id,authorName:old?.authorName||identity.user.name,updaterName:identity.user.name,_pending:true,_conflict:!!old?._conflict,_blocked:false,_error:null,_mutationId:crypto.randomUUID()}));if(navigator.onLine){try{await sendService(value.id);}catch(error){if(error.status&&error.status<500)throw error;}}return serviceGet(value.id);}
export async function syncServices(){if(previewRole)return;if(!navigator.onLine)return pendingSummary();if(servicesSync)return servicesSync;servicesSync=(async()=>{for(const entry of (await allServices()).filter(s=>s._pending&&!s._conflict)){if(!identity?.permissions.write){await changeService(entry.id,current=>current?{...current,_blocked:true,_blockedReason:'permission',_error:'Pro sdílení servisu potřebujete oprávnění pracovníka nebo správce.'}:current);continue;}if(entry._blocked&&entry._blockedReason==='permission')await changeService(entry.id,current=>current?{...current,_blocked:false}:current);else if(entry._blocked)continue;try{await sendService(entry.id);}catch(error){if(error.status===401||error.status===403)throw error;if(!error.status||error.status>=500)break;}}return pendingSummary();})();try{return await servicesSync;}finally{servicesSync=null;}}
export async function getServices(gardenId){const snapshot=new Map((await cachedServices(gardenId)).map(s=>[s.id,s]));const data=await request(servicePath(gardenId)),ids=new Set(data.services.map(s=>s.id));for(const remote of data.services)await changeService(remote.id,current=>{if(current&&remote.version<current.version)return current;if(!current?._pending)return remote;if(current._mutationId===remote.mutationId&&current.updatedBy===remote.updatedBy)return {...remote,_pending:false,_conflict:false};return {...current,_conflict:current._conflict||remote.version!==current.version,_remote:remote};});for(const local of await cachedServices(gardenId))if(!ids.has(local.id))await changeService(local.id,current=>{const previous=snapshot.get(local.id);if(!current||!previous||current.version!==previous.version||current._mutationId!==previous._mutationId)return current;if(!current._pending)return null;return current.version?{...current,_conflict:true,_remote:null,_error:'Tento servisní záznam už kolega smazal.'}:current;});await setting('serviceLoaded:'+gardenId,true);return cachedServices(gardenId);}
export async function discardService(gardenId,id){requireLiveRole();let remote;if(navigator.onLine){const data=await request(servicePath(gardenId));remote=data.services.find(s=>s.id===id)||null;}else{const local=await serviceGet(id);if(!local||!Object.hasOwn(local,'_remote')||local._remote===undefined)throw new Error('Pro načtení týmové verze připojte internet.');remote=local._remote;}await changeService(id,()=>remote);return cachedServices(gardenId);}
export async function deleteService(gardenId,value){if(!navigator.onLine)throw new Error('Servisní záznamy mažte po připojení k internetu.');const local=await serviceGet(value.id);if(local?._pending)throw new Error('Nejdříve sdílejte nebo vyřešte místní změny tohoto servisu.');await request(servicePath(gardenId)+'/'+encodeURIComponent(value.id),{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({version:value.version})});await changeService(value.id,()=>null);}
export async function restoreServices(gardens){requireLiveRole();for(const g of gardens){const existing=await getServices(g.id);for(const s of g.services||[]){const old=existing.find(r=>r.id===s.id);if(old?._pending)throw new Error('Nejdříve sdílejte nebo vyřešte místní servisní změny, potom obnovte zálohu.');await saveService(g.id,{...s,version:old?.version||0});}}}
export async function servicesForBackup(gardenId){if(navigator.onLine)return getServices(gardenId);if(!await getSetting('serviceLoaded:'+gardenId)&&!await getSetting('services:'+gardenId))throw new Error('Pro úplnou zálohu připojte internet. Servis této zahrady ještě nebyl načten.');return cachedServices(gardenId);}
export async function restoreGardens(gardens){requireLiveRole();for(const g of gardens){const existing=(await getGardens()).find(v=>v.id===g.id);let saved=await saveGarden({id:g.id,name:g.name,address:g.address,notes:g.notes,...(Object.hasOwn(g,'pumpType')?{pumpType:g.pumpType}:{}),version:existing?.version});if(g.plan?.data){const file=new File([await(await fetch(g.plan.data)).blob()],g.plan.name,{type:g.plan.type});await uploadPlan(saved,file);}}}
export async function restoreBackup(records,zones){requireLiveRole();await saveZones(zones);for(const r of records){const existing=await get(r.id);await saveRecord({...r,version:existing?.version||0,imageVersion:undefined});}}

const blowoutPath=id=>'/api/gardens/'+encodeURIComponent(id)+'/blowout';
export const cachedBlowout=id=>getSetting('blowout:'+id);
export async function getBlowout(id){
 const actor=identity?.user.id,data=await request(blowoutPath(id));
 if(identity?.user.id===actor){const old=await cachedBlowout(id);if(!old||old.version<=data.version)await setting('blowout:'+id,data);}
 return data;
}
export async function blowoutPhoto(gardenId,photo){
 const key='blowout-photo:'+gardenId+':'+photo.id,cached=await getSetting(key);if(cached)return cached;
 const actor=identity?.user.id,blob=await readFromServer(blowoutPath(gardenId)+'/photos/'+encodeURIComponent(photo.id),{credentials:'same-origin',cache:'no-store'},async response=>{if(!response.ok)throw new Error('Fotografii nelze načíst. Připojte se k internetu.');return response.blob();},20000);
 if(identity?.user.id===actor)await setting(key,blob);return blob;
}
export async function saveBlowout(id,version,steps){
 if(!navigator.onLine)throw new Error('Pokyny k vyfukování ukládejte s připojením k internetu.');
 if(!identity?.permissions.write)throw new Error('Máte oprávnění pouze k prohlížení.');
 const actor=identity.user.id,form=new FormData();form.set('document',JSON.stringify({version,steps:steps.map(s=>({...s,photos:s.photos.map(p=>({id:p.id}))}))}));
 let total=0;for(const s of steps)for(const p of s.photos)if(p.blob){total+=p.blob.size;form.set('photo:'+p.id,p.blob,'photo.jpg');}
 if(total>24*1024*1024)throw new Error('Fotografie jsou příliš velké. Přidávejte je postupně.');
 const data=await request(blowoutPath(id),{method:'PUT',body:form});
 if(identity?.user.id===actor){await setting('blowout:'+id,data);for(const s of steps)for(const p of s.photos)if(p.blob)await setting('blowout-photo:'+id+':'+p.id,p.blob);await getGardens();}
 return data;
}
export async function blowoutForBackup(id){
 const data=navigator.onLine?await getBlowout(id):await cachedBlowout(id);if(!data)throw new Error('Pro úplnou zálohu načtěte pokyny k vyfukování s připojením k internetu.');
 const steps=[];for(const s of data.steps){const photos=[];for(const p of s.photos){const blob=await blowoutPhoto(id,p);const inline=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});photos.push({...p,data:inline});}steps.push({...s,photos});}return steps;
}
export async function restoreBlowout(gardens){requireLiveRole();
 for(const g of gardens){
  if(!Object.hasOwn(g,'blowout'))continue;
  let current=await getBlowout(g.id),steps=[];
  // Import one photo per request so complete backups can exceed the upload size limit.
  for(const s of g.blowout){
   const step={...(s.hidden?{hidden:true}:{}),id:s.id,title:s.title,notes:s.notes,photos:[]};steps.push(step);
   current=await saveBlowout(g.id,current.version,steps);steps=current.steps;
   for(const p of s.photos){
    const blob=await(await fetch(p.data)).blob();steps=steps.map(v=>v.id===s.id?{...v,photos:[...v.photos,{id:crypto.randomUUID(),blob}]}:v);
    current=await saveBlowout(g.id,current.version,steps);steps=current.steps;
   }
  }
  if(!g.blowout.length)await saveBlowout(g.id,current.version,[]);
 }
}

// Only service visits explicitly authorized by the server enter this per-user
// offline cache. Commercial mutations never enter the offline outbox.
const serviceWorkFlights=new Map();let serviceWorkSync;
const localWorkEntry=entry=>entry?{...entry,photos:unpackLocalPhotos(entry.photos||[])}:entry;
const allServiceWork=async()=>(await store('serviceWork','readonly',s=>s.getAll())).map(localWorkEntry);
const workKey=jobId=>identity?.user.id+'|'+jobId;
async function changeServiceWork(id,change){if(workspaceBlocked)throw workspaceResetError();const epoch=workspaceEpoch,database=await open();return new Promise((resolve,reject)=>{const tx=database.transaction('serviceWork','readwrite'),s=tx.objectStore('serviceWork'),r=s.get(id);let value;r.onsuccess=()=>{try{if(workspaceBlocked||epoch!==workspaceEpoch)throw workspaceResetError();value=change(r.result);if(value===null)s.delete(id);else if(value!==undefined)s.put(value);}catch(e){tx.abort();reject(e);}};tx.oncomplete=()=>resolve(localWorkEntry(value));tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Ukládání bylo přerušeno.'));});}
async function invalidateServiceWork(){for(const entry of await allServiceWork())await changeServiceWork(entry.id,e=>e?.pending?{...e,snapshot:null,blocked:true,error:'Oprávnění se změnila. Připojte se a znovu ověřte přístup.'}:null);}
export async function cachedServiceWork(){if(!identity||await getSetting('locked'))return [];return (await allServiceWork()).filter(e=>!e.kind?.startsWith('jobDiary')&&e.ownerId===identity.user.id).map(e=>({...e,snapshot:e.expiresAt>Date.now()&&e.accessRole===identity.user.role?e.snapshot:null}));}
export async function serviceWork(jobId,refresh=navigator.onLine){
 if(!identity||await getSetting('locked'))throw new Error('Přihlaste se pro přístup k servisním údajům.');const key=workKey(jobId),actor=identity.user.id,role=identity.user.role;
 if(refresh&&navigator.onLine){try{const snapshot=await request('/api/jobs/'+encodeURIComponent(jobId)+'/service');if(identity?.user.id!==actor||identity?.user.role!==role)return null;return await changeServiceWork(key,old=>old?.snapshot?.job.version>snapshot.job.version?old:({...old,id:key,jobId,ownerId:actor,accessRole:role,snapshot,expiresAt:Date.now()+86400000,updatedAt:Date.now()}));}catch(e){if([401,403,404].includes(e.status)){await changeServiceWork(key,old=>old?.pending?{...old,snapshot:null,blocked:true,error:e.message}:null);throw e;}const saved=(await cachedServiceWork()).find(e=>e.jobId===jobId);if(!saved?.snapshot)throw e;return saved;}}
 const saved=(await cachedServiceWork()).find(e=>e.jobId===jobId);if(!saved?.snapshot&&!saved?.pending)throw new Error('Tato návštěva ještě není uložená pro offline práci, nebo její ověření vypršelo. Otevřete ji s internetem.');return saved;
}
export async function prefetchServiceWork(jobs){if(!navigator.onLine||!identity||!featureEnabled('jobs',identity.features)||!featureEnabled('offline',identity.features))return;for(const job of jobs.filter(j=>(!j.servicePeriodId||featureEnabled('subscriptions',identity.features))&&j.serviceApproval==='confirmed'&&(j.assignedTo===identity.user.id||j.assignedTos?.includes(identity.user.id))&&j.status!=='done').slice(0,8)){try{await serviceWork(job.id,true);}catch(e){if([401,403].includes(e.status))break;}}}
export async function saveServiceWork(jobId,value,photos=[]){
 checkOfflineWrite();if(!identity?.permissions.write)throw new Error('Pro zápis protokolu potřebujete oprávnění pracovníka.');const key=workKey(jobId),actor=identity.user.id,role=identity.user.role;photos=await packLocalPhotos(photos);if(identity?.user.id!==actor||identity?.user.role!==role)throw Error('Přihlášení se změnilo.');
 await changeServiceWork(key,old=>{if(!old?.snapshot)throw new Error('Nejdříve načtěte návštěvu s internetem.');const ids=value.report?.photoIds||[],kept=(old.photos||[]).filter(p=>ids.includes(p.id)),payload={...value,version:old.pending?old.payload.version:value.version,operationId:crypto.randomUUID()};return {...old,payload,photos:[...kept,...photos.filter(p=>!kept.some(k=>k.id===p.id))],pending:true,mutationId:payload.operationId,error:'',blocked:false,conflict:false,updatedAt:Date.now(),ownerId:actor};});
 if(navigator.onLine){try{await sendServiceWork(key);}catch(e){if(e.status&&e.status<500)throw e;}}
 return (await cachedServiceWork()).find(e=>e.id===key);
}
async function sendServiceWork(key){
 if(serviceWorkFlights.has(key))return serviceWorkFlights.get(key);
 const task=(async()=>{const entry=(await allServiceWork()).find(e=>e.id===key);if(!entry?.pending||entry.ownerId!==identity?.user.id)return;
  const mutationId=entry.mutationId,actor=identity.user.id,role=identity.user.role;
  try{
   for(const photo of entry.photos||[]){await request('/api/jobs/'+encodeURIComponent(entry.jobId)+'/service/photos/'+encodeURIComponent(photo.id),{method:'PUT',headers:{'content-type':photo.file.type||(/\.hei[cf]$/i.test(photo.file.name)?'image/heic':'image/jpeg'),'x-file-name':encodeURIComponent(photo.file.name||'fotografie.jpg')},body:photo.file,timeoutMs:120000});}
   const snapshot=await request('/api/jobs/'+encodeURIComponent(entry.jobId)+(entry.kind==='jobDiary'?'/diary/'+encodeURIComponent(entry.entryId):'/service'),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(entry.payload)});
   if(identity?.user.id!==actor||identity?.user.role!==role)return;if(entry.kind==='jobDiary'){await jobDiaryClient.acknowledge(entry,snapshot);return;}await changeServiceWork(key,current=>{if(!current)return current;if(current.mutationId!==mutationId)return {...current,snapshot,expiresAt:Date.now()+86400000,payload:{...current.payload,version:snapshot.job.version}};return {...current,snapshot,expiresAt:Date.now()+86400000,pending:false,photos:[],payload:null,error:'',conflict:false,blocked:false};});
  }catch(e){await changeServiceWork(key,current=>current?{...current,conflict:['service_conflict','diary_conflict'].includes(e.code),blocked:e.status>=400&&e.status<500&&!['service_conflict','diary_conflict'].includes(e.code),snapshot:[401,403,404].includes(e.status)?null:current.snapshot,error:e.message,blockedCode:e.code}:current);if([403,404].includes(e.status)&&e.code!=='subscriptions_disabled')window.dispatchEvent(new CustomEvent('service-work-access-revoked',{detail:{jobId:entry.jobId}}));throw e;}
 })();serviceWorkFlights.set(key,task);try{return await task;}finally{serviceWorkFlights.delete(key);}
}
const jobDiaryClient=createJobDiaryClient({all:allServiceWork,change:changeServiceWork,send:sendServiceWork,request,getSession:()=>identity,isPreview:()=>!!previewRole,isLocked:()=>getSetting('locked'),checkWrite:checkOfflineWrite,packPhotos:packLocalPhotos});
export const jobDiary=(...args)=>jobDiaryClient.load(...args);
export const saveJobDiary=(...args)=>jobDiaryClient.save(...args);
export const resolveJobDiary=(...args)=>jobDiaryClient.resolve(...args);
export const retryJobDiary=(...args)=>jobDiaryClient.retry(...args);
export async function syncServiceWork(){if(previewRole)return;if(!navigator.onLine||!identity||!featureEnabled('jobs',identity.features))return;if(serviceWorkSync)return serviceWorkSync;serviceWorkSync=(async()=>{for(const entry of await allServiceWork()){if(entry.blockedCode==='jobs_disabled'&&featureEnabled('jobs',identity.features)||entry.blockedCode==='subscriptions_disabled'&&featureEnabled('subscriptions',identity.features))await changeServiceWork(entry.id,e=>({...e,blocked:false,blockedCode:null}));else if(entry.blocked)continue;if(!entry.pending||entry.ownerId!==identity?.user.id||entry.conflict)continue;try{await sendServiceWork(entry.id);}catch(e){if([401,403].includes(e.status)&&e.code!=='subscriptions_disabled')throw e;if(!e.status||e.status>=500)break;}}
 // Revalidate cached assignments on reconnect; stale access is never used to sync.
 for(const entry of (await allServiceWork()).filter(e=>!e.kind?.startsWith('jobDiary')&&e.ownerId===identity?.user.id&&e.snapshot).slice(0,12)){try{await serviceWork(entry.jobId,true);}catch(e){if([401,403].includes(e.status)&&e.code!=='subscriptions_disabled')throw e;}}
 for(const entry of (await allServiceWork()).filter(e=>e.kind==='jobDiaryIndex'&&e.ownerId===identity?.user.id&&e.snapshot).slice(0,8)){try{await jobDiary(entry.jobId,true);}catch(e){if(e.status===401)throw e;}}
 })();try{return await serviceWorkSync;}finally{serviceWorkSync=null;}}
export async function resolveServiceWork(jobId,keepLocal){const key=workKey(jobId),entry=(await allServiceWork()).find(e=>e.id===key);if(!entry?.pending)return;if(!navigator.onLine)throw new Error('Pro řešení konfliktu se připojte k internetu.');const fresh=await request('/api/jobs/'+encodeURIComponent(jobId)+'/service');await changeServiceWork(key,old=>keepLocal?{...old,snapshot:fresh,payload:{...old.payload,version:fresh.job.version,operationId:crypto.randomUUID()},mutationId:crypto.randomUUID(),conflict:false,blocked:false,error:''}:{...old,snapshot:fresh,pending:false,payload:null,photos:[],conflict:false,blocked:false,error:''});if(keepLocal)await sendServiceWork(key);return serviceWork(jobId,true);}
export async function discardServiceWork(jobId){requireLiveRole();return changeServiceWork(workKey(jobId),()=>null);}

// Offline catalogues remain scoped to the authenticated account and enabled module.
export async function materialCatalog(refresh=navigator.onLine){
 if(!identity||!featureEnabled('materials',identity.features)||await getSetting('locked'))throw Error('Přihlaste se k účtu s povoleným katalogem materiálu.');
 const user=identity.user.id,key='owner-materials-catalog',cached=await getSetting(key);
 const valid=()=>identity?.user.id===user&&featureEnabled('materials',identity.features)&&cached?.ownerId===user&&cached.expiresAt>Date.now();
 if(refresh&&navigator.onLine){try{let after=null,items=[],categories=[];do{const page=await request('/api/materials'+(after?'?after='+encodeURIComponent(after):''));if(identity?.user.id!==user||!featureEnabled('materials',identity.features))throw Error('Přihlášení se změnilo.');categories=page.categories;items.push(...page.items);after=page.nextCursor;}while(after);const result={categories,items};await setting(key,{ownerId:user,expiresAt:Date.now()+86400000,data:result});return result;}catch(e){if([401,403].includes(e.status)){await setting(key,null);throw e;}if(valid())return cached.data;throw e;}}
 if(valid())return cached.data;throw Error('Nejdříve otevřete katalog materiálu s internetem, aby byl dostupný offline.');
}

export async function invalidateMaterialCatalog(){
 if(!identity||!['owner','administrator','admin'].includes(identity.user.role))throw Error('Katalog spravuje pouze správce.');await setting('owner-materials-catalog',null);
}

// Personal, local-only working copies. They never enter the server outbox.
const formDraftKey=key=>{if(typeof key!=='string'||!/^[-\w:]{1,220}$/.test(key))throw Error('Neplatný formulář.');return 'form-draft:'+key;};
export async function getFormDraft(key){if(previewRole)return null;const user=identity?.user;if(!user||await getSetting('locked'))return null;const value=await getSetting(formDraftKey(key));return identity?.user.id===user.id&&identity?.user.role===user.role&&value?.ownerId===user.id&&value.role===user.role&&value.expiresAt>Date.now()?{...value,value:{...value.value,...(Array.isArray(value.value?.photos)?{photos:unpackLocalPhotos(value.value.photos)}:{})}}:null;}
export async function putFormDraft(key,baseVersion,value){requireLiveRole();if(workspaceBlocked)throw workspaceResetError();const user=identity?.user;if(!user||await getSetting('locked'))throw Error('Obnovte přihlášení pro uchování formuláře.');const storageKey=formDraftKey(key),now=Date.now();if(Array.isArray(value?.photos))value={...value,photos:await packLocalPhotos(value.photos)};await store('settings','readwrite',s=>{if(identity?.user.id!==user.id||identity?.user.role!==user.role)return;s.put({ownerId:user.id,role:user.role,baseVersion,value,updatedAt:now,expiresAt:now+7*86400000},storageKey);const entries=[],r=s.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(String(c.key).startsWith('form-draft:')){if(c.value?.expiresAt<=now||c.value?.ownerId!==user.id||c.value?.role!==user.role)c.delete();else entries.push({key:c.key,time:c.value.updatedAt});}c.continue();}else for(const old of entries.sort((a,b)=>b.time-a.time).slice(20))s.delete(old.key);};});}
export async function removeFormDraft(key){if(previewRole)return;const user=identity?.user;if(!user)return;await store('settings','readwrite',s=>{if(identity?.user.id===user.id)s.delete(formDraftKey(key));});}
async function clearFormDrafts(){await store('settings','readwrite',s=>{const r=s.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(String(c.key).startsWith('form-draft:'))c.delete();c.continue();}};});}

// Same per-account IndexedDB, authorization lifetime and explicit conflict handling
// as serviceWork. Pending entries participate in account-switch protection.
const allDefectEntries=()=>store('defects','readonly',s=>s.getAll());
const defectEntry=id=>store('defects','readonly',s=>s.get(id));
const putDefectEntry=d=>store('defects','readwrite',s=>s.put(d));
const defectFresh=d=>identity&&d?.ownerId===identity.user.id&&d.role===identity.user.role&&d.expiresAt>Date.now()&&!d.revoked;
function defectLocal(d){return {...(d.snapshot||{}),...(d.pending?d.payload:{}),id:d.id,_pending:!!d.pending,_conflict:!!d.conflict,_blocked:!!d.blocked,_error:d.error||''};}
export async function getDefects({gardenId='',jobId=''}={}){
 const who=identity?.user.id,role=identity?.user.role;if(!who)throw Error('Obnovte přihlášení.');
 let remote=null;if(navigator.onLine){try{remote=await request('/api/defects'+(jobId?'?jobId='+encodeURIComponent(jobId):gardenId?'?gardenId='+encodeURIComponent(gardenId):''));if(identity?.user.id!==who||identity?.user.role!==role)throw Error('Přihlášení se změnilo.');if(jobId)await setting('defect-links:'+who+':'+jobId,{ids:remote.linkedIds||[],role,expiresAt:Date.now()+86400000});const ids=new Set(remote.defects.map(d=>d.id));for(const old of await allDefectEntries()){if(!old.pending&&(!gardenId&&!jobId||gardenId&&old.snapshot?.gardenId===gardenId)&&!ids.has(old.id))await store('defects','readwrite',s=>s.delete(old.id));}for(const d of remote.defects){const old=await defectEntry(d.id);await putDefectEntry({...old,id:d.id,ownerId:who,role,snapshot:d,expiresAt:Date.now()+86400000,revoked:false});}}catch(e){if([401,403,404].includes(e.status)){for(const d of await allDefectEntries())await putDefectEntry({...d,revoked:true});throw e;}if(!gardenId&&!jobId&&!((await allDefectEntries()).some(defectFresh)))throw e;}}
 if(jobId&&!gardenId){const work=(await cachedServiceWork()).find(v=>v.jobId===jobId);gardenId=work?.snapshot?.job.gardenId||remote?.defects[0]?.gardenId||'';}
 const entries=(await allDefectEntries()).filter(d=>defectFresh(d)&&(!gardenId||d.snapshot?.gardenId===gardenId||d.payload?.gardenId===gardenId));
 const links=jobId?await getSetting('defect-links:'+who+':'+jobId):null;return {defects:entries.map(defectLocal),linkedIds:remote?.linkedIds||(links?.role===role&&links.expiresAt>Date.now()?links.ids:[]),offline:!remote};
}
export async function getDefect(id){const who=identity?.user.id,role=identity?.user.role;let old=await defectEntry(id);if(navigator.onLine){try{const data=await request('/api/defects/'+encodeURIComponent(id));if(identity?.user.id!==who||identity?.user.role!==role)throw Error('Přihlášení se změnilo.');old={...old,id,ownerId:who,role,snapshot:data.defect,events:data.events,expiresAt:Date.now()+86400000,revoked:false};await putDefectEntry(old);}catch(e){if([401,403,404].includes(e.status)){if(old)await putDefectEntry({...old,revoked:true});throw e;}if(!defectFresh(old))throw e;}}if(!defectFresh(old))throw Error('Závadu je nutné nejdříve načíst s internetem.');return {defect:defectLocal(old),events:old.events||[],remote:old.snapshot};}
const defectFlights=new Map();
async function sendDefect(id){if(defectFlights.has(id))return defectFlights.get(id);const task=(async()=>{const sent=await defectEntry(id);if(!sent?.pending||sent.conflict||sent.blocked||sent.ownerId!==identity?.user.id)return;try{const response=await request('/api/defects/'+encodeURIComponent(id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(sent.payload)}),current=await defectEntry(id);if(current?.payload?.mutationId===sent.payload.mutationId){const saved={...current,id:response.defect.id,snapshot:response.defect,payload:null,pending:false,error:'',expiresAt:Date.now()+86400000};await store('defects','readwrite',s=>{if(saved.id!==id)s.delete(id);s.put(saved);});}return response.defect.id;}catch(e){const current=await defectEntry(id);if(current?.payload?.mutationId===sent.payload.mutationId)await putDefectEntry({...current,conflict:e.status===409,blocked:!!e.status&&e.status<500&&e.status!==409,revoked:[401,403,404].includes(e.status),error:e.message});throw e;}})();defectFlights.set(id,task);try{return await task;}finally{defectFlights.delete(id);}}
export async function saveDefect(value){checkOfflineWrite();if(!identity?.permissions.write)throw Error('Pro zápis závady potřebujete oprávnění pracovníka.');const old=await defectEntry(value.id);if(old?.pending&&(!old.blocked||old.conflict))throw Error('Nejdříve sdílejte nebo vyřešte předchozí změnu této závady.');if(navigator.onLine)await getGardens();if(!(await cachedGardens()).some(g=>g.id===value.gardenId))throw Error('Zahradu nejdříve načtěte s internetem.');const payload={...value,discipline:value.discipline||old?.snapshot?.discipline||identity?.workspace?.selectedDiscipline||identity?.workspace?.disciplines?.[0],mutationId:crypto.randomUUID()};delete payload.id;await putDefectEntry({...old,id:value.id,ownerId:identity.user.id,role:identity.user.role,expiresAt:Date.now()+86400000,payload,pending:true,conflict:false,blocked:false,revoked:false,error:'',snapshot:old?.snapshot||{...value,authorName:identity.user.name,createdBy:identity.user.id,createdAt:Date.now(),repairJobs:[]}});let savedId=value.id;if(navigator.onLine){try{savedId=await sendDefect(value.id)||value.id;}catch(e){if(e.status&&e.status<500)throw e;}}return defectLocal(await defectEntry(savedId));}
export async function syncDefects(){if(previewRole)return;if(!navigator.onLine)return;for(const d of await allDefectEntries()){if(!d.pending||d.ownerId!==identity?.user.id||d.conflict||d.blocked)continue;try{await sendDefect(d.id);}catch(e){if(!e.status||[401,403].includes(e.status)||e.status>=500)break;}}}
export async function resolveDefectSync(id,keepLocal){requireLiveRole();const old=await defectEntry(id);if(!old?.pending||old.ownerId!==identity?.user.id)throw Error('Čekající zápis není dostupný.');if(!navigator.onLine)throw Error('Porovnání změn vyžaduje připojení.');const remote=(await request('/api/defects/'+encodeURIComponent(id))).defect;await putDefectEntry({...old,snapshot:remote,expiresAt:Date.now()+86400000,revoked:false,pending:keepLocal,payload:keepLocal?{...old.payload,version:remote.version,mutationId:crypto.randomUUID()}:null,conflict:false,blocked:false,error:''});if(keepLocal)await sendDefect(id);}
export async function retryDefect(id){const d=await defectEntry(id);if(!d?.pending||d.ownerId!==identity?.user.id)throw Error('Zápis není dostupný.');if(d.conflict)throw Error('Nejdříve porovnejte konfliktní změny.');await putDefectEntry({...d,blocked:false});await sendDefect(id);}
export async function gardenHistory(id){if(!identity||await getSetting('locked'))throw Error('Přihlaste se pro přístup k historii.');const overlay=async data=>{const work=await cachedServiceWork(),services=await cachedServices(id);if(identity?.user.id!==who||identity?.user.role!==role||await getSetting('locked'))throw Error('Přihlášení se změnilo.');return pendingGardenHistory(data,id,work,services,identity?.user.name||'');};const key='garden-history:'+identity?.user.id+':'+id,old=await getSetting(key),who=identity?.user.id,role=identity?.user.role;if(navigator.onLine){try{const data=await request('/api/gardens/'+encodeURIComponent(id)+'/history');if(identity?.user.id!==who||identity?.user.role!==role)throw Error('Přihlášení se změnilo.');await setting(key,{data,role,expiresAt:Date.now()+86400000});return overlay(data);}catch(e){if([401,403,404].includes(e.status)){await setting(key,null);throw e;}if(old?.role!==role||old.expiresAt<Date.now())throw e;}}if(old?.role===role&&old.expiresAt>Date.now())return overlay({...old.data,offline:true});throw Error('Historii nejdříve načtěte s internetem.');}

export async function forgetSubscription(id){requireLiveRole();for(const entry of await allServiceWork()){if(entry.ownerId!==identity?.user.id||entry.snapshot?.subscription?.id!==id)continue;await changeServiceWork(entry.id,old=>old?.snapshot?.subscription?.id===id?{...old,snapshot:{...old.snapshot,subscription:null}}:old);}}
export async function refreshCachedSubscriptions(){if(!navigator.onLine||!identity)return;const actor=identity.user.id,role=identity.user.role,ids=[...new Set((await cachedServiceWork()).filter(e=>e.snapshot?.subscription).map(e=>e.snapshot.subscription.id))];for(const id of ids){let subscription;try{subscription=(await request('/api/subscriptions/'+encodeURIComponent(id),{timeoutMs:5000})).subscription;}catch(e){if(e.status===401)throw e;if(![403,404].includes(e.status))continue;subscription=null;}if(identity?.user.id!==actor||identity?.user.role!==role)return;for(const entry of await allServiceWork()){if(entry.ownerId!==actor||entry.snapshot?.subscription?.id!==id)continue;await changeServiceWork(entry.id,old=>old?.snapshot?.subscription?.id===id?{...old,snapshot:{...old.snapshot,subscription}}:old);}}}


function workspaceResetError(){return Object.assign(new Error('Oprávnění se změnila. Aplikace obnovuje bezpečný přehled; neodeslaná práce je uchována v šifrovaném balíčku.'),{code:'workspace_reload',status:409});}
function rememberWorkspaceIds(value){
 if(!identity?.workspace||workspaceReconciling)return;
 for(const row of [...(value?.visits||[]),value?.defect,...(value?.defects||[])].filter(Boolean))for(const id of [row.jobId,row.sourceJobId,...(row.photos||[]).map(photo=>photo.jobId)])if(/^[-\w]{1,100}$/.test(id||''))workspaceSeen.serviceWork.add(id);
 for(const [kind,key,one] of [['records','records','record'],['gardens','gardens','garden'],['services','services','service'],['serviceWork','jobs','job'],['defects','defects','defect']])for(const row of [...(Array.isArray(value?.[key])?value[key]:[]),...(value?.[one]?[value[one]]:[])])if(/^[-\w]{1,100}$/.test(row?.id||''))workspaceSeen[kind].add(row.id);
 setting('workspace-seen',Object.fromEntries(Object.entries(workspaceSeen).map(([key,ids])=>[key,[...ids]]))).catch(()=>{});
}
async function workspaceCaches(){return {records:await getRecords(),gardens:await cachedGardens(),services:await allServices(),serviceWork:await allServiceWork(),defects:await allDefectEntries()};}
async function workspaceDrafts(){
 const db=await open(),tx=db.transaction('settings','readonly'),s=tx.objectStore('settings'),values=s.getAll(),keys=s.getAllKeys();await finishLocalTransaction(tx,values);
 const saved=keys.result.map((key,index)=>({key,record:values.result[index]})).filter(row=>String(row.key).startsWith('form-draft:'));
 const extra=[];window.dispatchEvent(new CustomEvent('workspace-capture-extra',{detail:extra}));return [...saved,...captureActiveFormDrafts().map(record=>({key:record.key,record})),...extra];
}
async function replaceWorkspaceLocal({plan,current,archives}){
 // One transaction replaces plaintext with ciphertext; there is no quota-heavy
 // intermediate copy and no partially purged database if the transaction fails.
 const packedWork=await Promise.all(plan.keep.serviceWork.map(async row=>({...row,photos:await packLocalPhotos(row.photos||[])})));
 const db=await open();if(plan.reduced){workspaceEpoch++;workspaceBlocked=true;}
 const tx=db.transaction(['settings','records','services','serviceWork','defects','recovery'],'readwrite');
 for(const archive of archives)tx.objectStore('recovery').put({...archive,createdAt:Date.now(),uploaded:false});
 if(plan.resetSettings){tx.objectStore('settings').clear();for(const ids of Object.values(workspaceSeen))ids.clear();}
 for(const kind of ['records','services','serviceWork','defects']){const target=tx.objectStore(kind);target.clear();for(const row of kind==='serviceWork'?packedWork:plan.keep[kind])target.put(row);}
 tx.objectStore('settings').put(plan.keep.gardens||[],'gardens');
 if(current)tx.objectStore('settings').put(current,'session');else tx.objectStore('settings').put(true,'locked');
 await finishLocalTransaction(tx,null);
 if(plan.reduced){try{localStorage.setItem('work-diary-workspace-reset',String(Date.now())+':'+crypto.randomUUID());}catch{}}
}
const workspaceClient=createWorkspaceClient({readCaches:workspaceCaches,readSeen:async()=>{const saved=await getSetting('workspace-seen')||{};saved.serviceWork=[...(saved.serviceWork||[]),...await jobListCache.ids()];return Object.fromEntries(Object.entries(workspaceSeen).map(([key,ids])=>[key,[...new Set([...(saved[key]||[]),...ids])]]));},send:request,onVerified:({manifest,current})=>jobListCache.reconcile(current,manifest.allowed.serviceWork,manifest.jobVersions),captureDrafts:workspaceDrafts,onFailure:error=>{if(workspaceBlocked)window.dispatchEvent(new CustomEvent('workspace-recovery-failed',{detail:{message:error.message}}));},beginReduction:()=>{workspaceBlocked=true;workspaceEpoch++;window.dispatchEvent(new CustomEvent('workspace-access-freeze'));},recoveryInfo:async()=>(await request('/api/workspace/recovery-key')).recovery,replace:replaceWorkspaceLocal,onReduced:async detail=>{window.dispatchEvent(new CustomEvent('workspace-access-reset',{detail}));throw workspaceResetError();}});
export async function localWorkspaceRecovery(){return store('recovery','readonly',s=>s.getAll());}
export async function uploadWorkspaceRecovery(bundle,{ownerImport=false}={}){
 const root='/api/workspace/recovery/'+encodeURIComponent(bundle.id),headers={'content-type':'application/json',...(ownerImport?{'x-workspace-recovery-import':'1'}:{})};
 await request(root,{method:'POST',headers,body:JSON.stringify(bundle.manifest)});
 for(const part of bundle.parts)await request(root+'/parts/'+part.index,{method:'PUT',headers:{...headers,'content-type':'application/octet-stream'},body:part.blob,timeoutMs:60000});
 await request(root+'/complete',{method:'POST',headers,body:'{}'});
 await store('recovery','readwrite',s=>s.put({...bundle,uploaded:true}));
}
window.addEventListener('storage',event=>{if(event.key==='work-diary-workspace-reset'){workspaceBlocked=true;workspaceEpoch++;window.dispatchEvent(new CustomEvent('workspace-access-reset',{detail:{otherTab:true}}));}});

export async function setWorkspaceDiscipline(value){if(!identity?.workspace||!(value==='all'&&identity.workspace.disciplines.length>1||identity.workspace.disciplines.includes(value)))throw Error('K tomuto oboru nemáte přístup.');await jobListCache.invalidate();await setting('workspace-selected-discipline',value);identity.workspace.selectedDiscipline=value;await setting('session',identity);}
