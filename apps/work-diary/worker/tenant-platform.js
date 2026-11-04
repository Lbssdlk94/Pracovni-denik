import {workspacePreferenceKey} from './workspace-context.js';
import {licensedFeature} from '../web/features.js';
// Optional narrow control plane connector. No jobs, contacts, photographs or work reports leave the tenant.
const tpEncoder=new TextEncoder();
const tpBase64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const tpConfigured=env=>!!env.PLATFORM_CONTROL_URL;
const tpFlights=new WeakMap();
const tpRefreshFailures=new WeakMap();
// Reuse only a cryptographically valid, unexpired policy. A transient control
// plane outage must not sit in front of every operational read. Expiry and a
// verified suspension still take effect normally; no grace period is invented.
function tpRefreshState(env){let states=tpRefreshFailures.get(env.DB);if(!states){states=new Map();tpRefreshFailures.set(env.DB,states);}return states;}
async function tpVerified(env,envelope,instanceId,minRevision=0,allowExpired=false){try{if(envelope.keyId!==env.PLATFORM_SIGNING_KEY_ID)return null;const key=await crypto.subtle.importKey('spki',tpBase64(env.PLATFORM_SIGNING_PUBLIC_KEY),{name:'ECDSA',namedCurve:'P-256'},false,['verify']),raw=tpBase64(envelope.payload);if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,tpBase64(envelope.signature),raw))return null;const p=JSON.parse(new TextDecoder().decode(raw)),now=Date.now();if(p.format!=='work-diary-policy-v1'||p.companyId!==env.PLATFORM_COMPANY_ID||p.installationId!==instanceId||!Number.isSafeInteger(p.revision)||p.revision<minRevision||!Number.isSafeInteger(p.expiresAt)||!Number.isSafeInteger(p.issuedAt)||(!allowExpired&&p.expiresAt<=now)||p.expiresAt-p.issuedAt>86400000||p.issuedAt>now+60000||typeof p.active!=='boolean'||p.featureOverrides!==undefined&&(!p.featureOverrides||Array.isArray(p.featureOverrides)||typeof p.featureOverrides!=='object'||Object.values(p.featureOverrides).some(v=>typeof v!=='boolean'))||!p.modules||typeof p.modules!=='object'||Object.values(p.modules).some(v=>typeof v!=='boolean')||!Number.isSafeInteger(p.maxUsers)||p.maxUsers<1||p.maxUsers>10000)return null;return p;}catch{return null;}}
async function tpCall(env,path,value){const origin=new URL(env.PLATFORM_CONTROL_URL);if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw Error('Invalid control origin');const headers={authorization:'Bearer '+env.PLATFORM_SERVICE_TOKEN,'content-type':'application/json'};if(env.PLATFORM_CONTROL_BYPASS_TOKEN)headers['OAI-Sites-Authorization']='Bearer '+env.PLATFORM_CONTROL_BYPASS_TOKEN;const response=await fetch(origin.origin+path,{method:value===undefined?'GET':'POST',headers,...(value===undefined?{}:{body:JSON.stringify(value)}),signal:AbortSignal.timeout(8000),redirect:'manual'});if(!response.ok)throw Error('Control connection unavailable');return response.json();}
export async function tenantPolicy(env,{refresh=false}={}){
 if(!tpConfigured(env))return null;
 if(!env.PLATFORM_COMPANY_ID||!env.PLATFORM_SERVICE_TOKEN||!env.PLATFORM_SIGNING_PUBLIC_KEY||!env.PLATFORM_SIGNING_KEY_ID)throw Error('Neúplné propojení platformy.');
 let flights=tpFlights.get(env.DB);if(!flights){flights=new Map();tpFlights.set(env.DB,flights);}
 const flightKey=env.PLATFORM_COMPANY_ID+'|'+(env.WORKSPACE_POLICY_INSTALLATION_ID||'physical');
 const info=await env.DB.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").first();
 const row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(workspacePreferenceKey(env,'platform-policy')).first();
 let cache=null;try{cache=JSON.parse(row?.value||'null');}catch{}
 const installation=env.WORKSPACE_POLICY_INSTALLATION_ID||info.instance_id;
 const previous=cache?await tpVerified(env,cache.envelope,installation,cache.revision):null;
 if(previous&&!refresh&&cache.checkedAt>Date.now()-300000)return tpCurrentPolicy(previous);
 const update=()=>{
  if(flights.has(flightKey))return flights.get(flightKey);
  const flight=(async()=>{
   try{
    const {policy:envelope}=await tpCall(env,'/api/service/policy?companyId='+encodeURIComponent(env.PLATFORM_COMPANY_ID));
    const policy=await tpVerified(env,envelope,installation,cache?.revision||0);
    if(!policy)throw Error('Invalid signed policy');
    const data=JSON.stringify({envelope,revision:policy.revision,checkedAt:Date.now()});
    const saved=await env.DB.prepare("INSERT INTO settings(key,value,version) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=settings.version+1 WHERE COALESCE(json_extract(settings.value,'$.revision'),-1)<=?").bind(workspacePreferenceKey(env,'platform-policy'),data,policy.revision).run();
    if(!saved.meta.changes)throw Error('Policy revision changed');
    tpRefreshState(env).delete(flightKey);return policy;
   }catch(error){
    tpRefreshState(env).set(flightKey,Date.now()+30000);
    // Never return a policy which expired during the failed network request.
    if(previous&&previous.expiresAt>Date.now())return previous;
    const expired=cache?await tpVerified(env,cache.envelope,installation,cache.revision,true):null;
    if(expired)return {...expired,active:false,configurationExpired:true};
    throw Error('Platnost licence nelze ověřit. Uložené změny zůstávají zachované; obnovte připojení.');
   }
  })().finally(()=>{if(flights.get(flightKey)===flight)flights.delete(flightKey);});
  flights.set(flightKey,flight);return flight;
 };
 if(previous&&!refresh&&env._workspaceWaitUntil){
  if(!(tpRefreshState(env).get(flightKey)>Date.now()))env._workspaceWaitUntil(update().catch(()=>{}));
  return tpCurrentPolicy(previous);
 }
 // Requests without a background lifetime (including explicit initialization)
 // continue to await verification. A control-plane error never grants a licence.
 return tpCurrentPolicy(await update());
}
export async function tenantFeaturePolicy(env,preferences){const policy=await tenantPolicy(env);if(!policy)return {features:preferences};const active=tpActive(policy);return {features:Object.fromEntries(Object.entries(preferences).map(([key,value])=>[key,active&&(policy.featureOverrides?.[key]??value)&&licensedFeature(key,policy.modules,policy.featureOverrides)])),license:{active,companyId:policy.companyId,revision:policy.revision,expiresAt:policy.expiresAt,maxUsers:policy.maxUsers,modules:policy.modules,featureOverrides:policy.featureOverrides||{},labels:policy.labels}};}
const tpCurrentPolicy=p=>({...p,active:tpActive(p)});
function tpActive(p){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return p.active&&p.expiresAt>Date.now()&&(!p.startDate||day>=p.startDate)&&(!p.endDate||day<=p.endDate)&&(p.status!=='trial'||p.trialStart&&p.trialEnd&&day>=p.trialStart&&day<=p.trialEnd);}
const tpPatterns=[['teamManagement',/^\/api\/workspace\/members(?:\/|$)/],['customers',/^\/api\/workspace\/customers(?:\/|$)/],['gardens',/^\/api\/workspace\/gardens(?:\/|$)/],['vehicles',/^\/api\/vehicles(?:\/|$)/],['materials',/^\/api\/(?:materials|work-rates)(?:\/|$)/],['jobs',/^\/api\/jobs(?:\/|$)/],['customers',/^\/api\/customers(?:\/|$)/],['defects',/^\/api\/defects(?:\/|$)/],['gardenHistory',/^\/api\/gardens\/[^/]+\/history$/],['service',/^\/api\/gardens\/[^/]+\/services(?:\/|$)/],['plans',/^\/api\/gardens\/[^/]+\/plan(?:-|\/|$)/],['blowout',/^\/api\/gardens\/[^/]+\/blowout(?:\/|$)/],['gardens',/^\/api\/gardens(?:\/|$)/],['shafts',/^\/api\/shafts(?:\/|$)/],['zoneManagement',/^\/api\/zones$/],['subscriptions',/^\/api\/(?:subscriptions|tariffs)(?:\/|$)/],['attendance',/^\/api\/attendance(?:\/|$)/],['notifications',/^\/api\/notifications(?:\/|$)/],['teamManagement',/^\/api\/(?:team|invitations|members)(?:\/|$)/],['drivePhotos',/^\/api\/drive(?:\/|$)/]];
export async function tenantPlatformGate(request,env,h){const path=new URL(request.url).pathname,method=request.method;if(path.startsWith('/api/privacy/')||path.startsWith('/api/system-backups')||path.startsWith('/api/workspace/recovery')||path==='/api/workspace/manifest')return null;const p=await tenantPolicy(env);if(!p)return null;const exempt=method==='DELETE'&&path==='/api/notifications/native'||path==='/api/me'||method==='GET'&&['/api/features','/api/installation','/api/operations/health'].includes(path)||path.startsWith('/api/privacy/')||path.startsWith('/api/system-backups')||path.startsWith('/api/workspace/recovery')||path==='/api/workspace/manifest'||path.startsWith('/api/access-sessions');if(exempt)return p;if(!tpActive(p))h.fail(403,'Firemní licence je pozastavená nebo skončila. Kontaktujte správce; záloha a export zůstávají dostupné.',{code:'license_inactive'});let required=tpPatterns.filter(([,pattern])=>pattern.test(path)).map(([key])=>key);if(/\/jobs\/[^/]+\/photos(?:\/|$)/.test(path))required.push('drivePhotos');if(path.startsWith('/api/service-reminders/'))required.push('notifications');if(path==='/api/record-links')required.push('customers','gardens');const disabled=required.find(key=>p.modules[key]!==true);if(disabled)h.fail(403,'Tato funkce není součástí licence firmy.',{code:'module_not_licensed',module:disabled});return p;}
export async function tenantHeartbeat(env,member){if(!tpConfigured(env))return;const p=await tenantPolicy(env),now=Date.now(),last=await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(workspacePreferenceKey(env,'platform-heartbeat')).first();if(member)await env.DB.prepare("INSERT INTO settings(key,value,version) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=settings.version+1").bind(workspacePreferenceKey(env,'platform-activity:'+member.user_id),String(now)).run();if(last&&Number(last.value)>now-300000)return;const counts=await workspaceHeartbeatCounts(env,now);await tpCall(env,'/api/service/heartbeat',{companyId:p.companyId,installationId:p.installationId,...counts,lastBackupAt:counts.lastBackupAt||null,appVersion:'work-diary-platform-2',schemaVersion:'0049',policyRevision:p.revision,databaseReady:true,storageReady:true});await env.DB.prepare("INSERT INTO settings(key,value,version) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=settings.version+1").bind(workspacePreferenceKey(env,'platform-heartbeat'),String(now)).run();}
export async function tenantClaimInvitation(request,env,h){if(!tpConfigured(env)||request.method!=='POST')h.fail(404,'Pozvánka platformy není dostupná.');const user=h.userFrom(request),b=await h.body(request,1000);if(typeof b.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(b.token))h.fail(400,'Neplatná pozvánka.');const p=await tenantPolicy(env);if(!tpActive(p))h.fail(403,'Licence firmy není aktivní.');const old=await env.DB.prepare("SELECT * FROM members WHERE role='owner' LIMIT 1").first();if(old&&old.user_id!==user.id)h.fail(409,'Firma už má vlastníka. Přístup musí pozvat vlastník firmy.');const confirmed=await tpCall(env,'/api/service/invitation',{token:b.token,email:user.email,userId:user.id});if(confirmed.email!==user.email||confirmed.role!=='owner')h.fail(403,'Pozvánka neodpovídá přihlášenému účtu.');await env.DB.prepare("INSERT OR IGNORE INTO members(user_id,email,name,role,created_at) SELECT ?,?,?,'owner',? WHERE NOT EXISTS(SELECT 1 FROM members WHERE role='owner')").bind(user.id,user.email,user.name,Date.now()).run();const saved=await env.DB.prepare('SELECT * FROM members WHERE user_id=?').bind(user.id).first();if(saved?.role!=='owner')h.fail(409,'Vlastník byl mezitím nastaven.');return h.json({ok:true});}

// Only technical totals leave the common API; no operational contents are sent.
export async function workspaceHeartbeatCounts(env,now=Date.now()){
 const discipline=env.WORKSPACE_ORGANIZATION_DISCIPLINE;
 if(!discipline)return env.DB.prepare("SELECT (SELECT COUNT(*) FROM members) members,(SELECT COUNT(*) FROM invitations) pendingInvites,(SELECT COUNT(*) FROM settings WHERE key LIKE 'platform-activity:%' AND substr(key,19) IN (SELECT user_id FROM members) AND CAST(value AS INTEGER)>?) activeUsers30d,(SELECT MAX(created_at) FROM system_backups WHERE state='ready') lastBackupAt").bind(now-30*86400000).first();
 const gate=alias=>"("+alias+".role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id="+alias+".user_id AND md.discipline=?))";
 const backup=discipline==='garden'?" AND created_at>=(SELECT created_at FROM workspaces LIMIT 1)":"";
 return env.DB.prepare("SELECT (SELECT count(*) FROM members total WHERE "+gate('total')+") members,(SELECT count(*) FROM invitations invite WHERE invite.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM json_each(invite.disciplines) d WHERE d.value=?)) pendingInvites,(SELECT count(*) FROM settings activity JOIN members active ON activity.key=?||active.user_id WHERE CAST(activity.value AS INTEGER)>? AND "+gate('active')+") activeUsers30d,(SELECT MAX(created_at) FROM system_backups WHERE state='ready'"+backup+") lastBackupAt").bind(discipline,discipline,workspacePreferenceKey(env,'platform-activity:'),now-30*86400000,discipline).first();
}
