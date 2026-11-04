import {passwordOnly,handleLocalPublicAuth,handleLocalSelf,handleLocalAccounts} from './local-auth.js';
import {handleWorkspaceTransfer} from './workspace-transfer.js';
import {workspaceTransferStamp,workspaceTransferFrozen,workspaceFencedDatabase,workspaceTransferEnsureControl} from './workspace-transfer-control.js';
import {workspaceRequestContext,workspacePreferenceKey} from './workspace-context.js';
import {workspaceRecoveryPublicInfo} from './workspace-recovery.js';
import {normalizeDisciplines} from '../web/discipline-model.js';
import {workspaceIdentityMember,workspaceInvitationStatements} from './workspace-identities.js';
import {workspaceActor,workspaceGardenScope,workspaceDisciplineSql} from './workspace-policy.js';
import {workspaceResourceAccess,workspaceWriteDiscipline,workspaceFilterResponse,workspaceGardenNotesStatement} from './workspace-resources.js';
import {handleWorkspace} from './workspace-api.js';
import {handleVehicles} from './vehicles.js';
import {tenantPolicy,tenantFeaturePolicy,tenantPlatformGate,tenantHeartbeat,tenantClaimInvitation} from './tenant-platform.js';
import {TEAM_ROLE_NAMES,assignableTeamRoles,canAssignTeamRole,canEditTeamMember} from '../web/team-roles.js';
import {ensureInitialAdministrator} from './team-setup.js';
import {handlePrivacy} from './privacy.js';
import {handleSystemBackups} from './system-backups.js';
import {operationsHealth} from './operations.js';
import {installationInfo,handleInstallation,assertInstallation} from './installation.js';
import {sessionMember,handleAccessSessions} from './access-sessions.js';
import {gardenAddressLinks} from './garden-address-links.js';
import {handleRecordLinks} from './record-links.js';
import {insertGardenWithCustomer} from './paired-records.js';
import {handleJobHandoffs} from './job-handoffs.js';
import {handleGardenHistory} from './garden-history.js';
import {handleJobPlanner} from './job-planner.js';
import {handleEmailConfiguration} from './email-config.js';
import {handleProtocolEmails} from './protocol-emails.js';
import {handleInvoiceCompany} from './protocol-billing.js';
import {handleWorkRates} from './work-charges.js';
import {handleMaterials} from './materials.js';
import {handleSubscriptions} from './subscriptions.js';
import {handleServiceWork} from './service-work.js';
import {handleServiceReminders} from './service-reminders.js';
import {handleApprovedImport} from './approved-import.js';
import {handleCustomers} from './customers.js';
import {handleNotifications,dispatchNotifications} from './notifications.js';
import {handleDrive} from './drive.js';
import {handleJobPhotos} from './job-photos.js';
import {handleJobs} from './jobs.js';
import {handleBlowout} from './blowout.js';
import {handleAttendance} from './attendance.js';
import {DEFAULT_FEATURES,normalizeFeatures,FEATURE_OPTIONS,licensedFeature,featureEnabled} from '../web/features.js';
import {normalizeAddress,parseAddressCandidates} from '../web/nearby.js';
const ROLE_NAMES=TEAM_ROLE_NAMES;
const ROLES=['administrator','admin','worker','reader'];
class HttpError extends Error{constructor(status,message,extra={}){super(message);this.status=status;this.extra=extra;}}
const fail=(status,message,extra)=>{throw new HttpError(status,message,extra);};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const canWrite=m=>['owner','administrator','admin','worker'].includes(m.role),canManage=m=>['owner','administrator','admin'].includes(m.role);
const checkWrite=m=>{if(!canWrite(m))fail(403,'Máte oprávnění pouze k prohlížení.');};
const checkManage=m=>{if(!canManage(m))fail(403,'Správu týmu může měnit pouze správce.');};
const all=(db,sql,...args)=>db.prepare(sql).bind(...args).all().then(r=>r.results);
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const execute=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const ACCESS_COOKIE='__Host-zavlahy-access';
const accessToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const accessHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const accessURL=(origin,token)=>origin+'/#access='+token;
const accessCookie=token=>`${ACCESS_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${token?30*86400:0}`;
async function linkedMember(env,hash){return one(env.DB,'SELECT m.*,a.expires_at,a.single_use FROM guest_access a JOIN members m ON m.user_id=a.user_id AND m.email=a.email WHERE a.token_hash=? AND a.expires_at>?',hash,Date.now());}
async function accessRate(request,env,ctx){
 const minute=Math.floor(Date.now()/60000),key=await accessHash(request.headers.get('cf-connecting-ip')||'unknown');
 await execute(env.DB,'INSERT INTO link_attempts(key,window,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,attempts=CASE WHEN link_attempts.window=excluded.window THEN link_attempts.attempts+1 ELSE 1 END',key,minute);
 const rate=await one(env.DB,'SELECT attempts FROM link_attempts WHERE key=?',key);if(rate.attempts>60)fail(429,'Příliš mnoho pokusů o otevření odkazu. Zkuste to za minutu.');
 if(rate.attempts===1)ctx.waitUntil(execute(env.DB,'DELETE FROM link_attempts WHERE window<?',minute-1440));
}
async function accessInfo(request,env,ctx){
 if(!env.DB||!env.BUCKET||!env.TEAM_OWNER_EMAIL)fail(503,'Týmové úložiště není dostupné.');
 await assertInstallation(env);if(await passwordOnly(env))fail(403,'Použijte přihlašovací jméno a heslo.',{code:'password_login_required'});await accessRate(request,env,ctx);const b=await body(request,2000);if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))fail(401,'Odkaz není platný nebo už byl zrušen. Požádejte správce o nový.',{code:'link_invalid'});
 const hash=await accessHash(b.token),member=await linkedMember(env,hash),invite=member?null:await one(env.DB,'SELECT * FROM invitations WHERE access_token_hash=? AND expires_at>?',hash,Date.now());
 if(!member&&!invite)fail(401,'Odkaz není platný nebo už byl zrušen. Požádejte správce o nový.',{code:'link_invalid'});
 return {token:b.token,hash,member,invite};
}
async function redeemAccess(request,env,ctx,preview=false){
 const info=await accessInfo(request,env,ctx),{hash,invite}=info,now=Date.now();
 if(preview)return json({workspace:info.member?await workspaceActor(env.DB,info.member.user_id):null,installation:await installationInfo(env),userId:info.member?.user_id||invite.guest_user_id,email:info.member?.email||invite.email,role:info.member?.role||invite.role,expiresAt:invite?.expires_at||info.member?.expires_at,oneTime:!!invite||!!info.member?.single_use});
 const sessionToken=accessToken(),sessionHash=await accessHash(sessionToken),sessionId=crypto.randomUUID(),userId=info.member?.user_id||invite.guest_user_id,role=info.member?.role||invite.role,expires=now+(['administrator','admin'].includes(role)?7:30)*86400000,agent=(request.headers.get('user-agent')||'Zařízení').slice(0,240);
 const statements=[];
 if(invite){
 statements.push(env.DB.prepare('INSERT OR IGNORE INTO members(user_id,email,name,role,created_at) SELECT guest_user_id,email,email,role,? FROM invitations WHERE access_token_hash=? AND expires_at>?').bind(now,hash,now));
 statements.push(...await workspaceInvitationStatements(env,invite.email,invite.guest_user_id));
 statements.push(env.DB.prepare('INSERT INTO access_sessions(id,user_id,token_hash,created_at,expires_at,last_seen_at,agent) SELECT ?,i.guest_user_id,?,?,?,?,? FROM invitations i JOIN members m ON m.user_id=i.guest_user_id AND m.email=i.email WHERE i.access_token_hash=? AND i.expires_at>?').bind(sessionId,sessionHash,now,expires,now,agent,hash,now));
 statements.push(env.DB.prepare('INSERT INTO guest_access(user_id,email,token_hash,created_at,expires_at,single_use) SELECT i.guest_user_id,i.email,NULL,?,NULL,1 FROM invitations i WHERE i.access_token_hash=? AND EXISTS(SELECT 1 FROM access_sessions WHERE id=?) ON CONFLICT(user_id) DO UPDATE SET token_hash=NULL,expires_at=NULL,single_use=1').bind(now,hash,sessionId));
 statements.push(env.DB.prepare('DELETE FROM invitations WHERE access_token_hash=? AND EXISTS(SELECT 1 FROM access_sessions WHERE id=?)').bind(hash,sessionId));
 }else{
 statements.push(env.DB.prepare('INSERT INTO access_sessions(id,user_id,token_hash,created_at,expires_at,last_seen_at,agent) SELECT ?,a.user_id,?,?,?,?,? FROM guest_access a JOIN members m ON m.user_id=a.user_id AND m.email=a.email WHERE a.token_hash=? AND a.expires_at>?').bind(sessionId,sessionHash,now,expires,now,agent,hash,now));
 statements.push(env.DB.prepare('UPDATE guest_access SET token_hash=NULL,expires_at=NULL WHERE token_hash=? AND single_use=1 AND EXISTS(SELECT 1 FROM access_sessions WHERE id=?)').bind(hash,sessionId));
 }
 await env.DB.batch(statements);
 if(!await sessionMember(env,sessionHash))fail(401,'Pozvánka už byla použita, vypršela nebo byla zrušena. Požádejte správce o novou.',{code:'link_invalid'});
 const response=json({ok:true});response.headers.set('set-cookie',accessCookie(sessionToken));return response;
}
function userFrom(request){
  const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if(!id||!email)fail(401,'Přihlaste se nebo otevřete osobní odkaz od správce.');
  let name=request.headers.get('oai-authenticated-user-full-name')||email;
  if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(name);}catch{name=email;}}
  return {id,email,name:name.slice(0,160)};
}
async function memberFor(request,env){
  if(!env.DB||!env.BUCKET||!env.TEAM_OWNER_EMAIL)fail(503,'Týmové úložiště se připravuje. Zkuste to za chvíli.');
  await assertInstallation(env);await ensureInitialAdministrator(env);
  const cookie=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(ACCESS_COOKIE+'='));
  const onlyPassword=await passwordOnly(env);
  if(cookie!==undefined){const token=cookie.slice(ACCESS_COOKIE.length+1),hash=await accessHash(token),guest=/^[a-f0-9]{64}$/.test(token)?await sessionMember(env,hash)||(!onlyPassword?await linkedMember(env,hash):null):null;if(!guest||onlyPassword&&guest.session_auth_method!=='password')fail(401,'Přihlaste se svým přihlašovacím jménem a heslem.',{code:'session_expired'});return {...guest,_authMethod:guest.session_auth_method||'link',_mustChange:guest.session_auth_method==='password'&&!!guest.password_must_change,_sessionHash:hash};}
  if(onlyPassword)fail(401,'Přihlaste se svým přihlašovacím jménem a heslem.',{code:'password_login_required'});
  const user=userFrom(request),workspaceIdentity=await workspaceIdentityMember(env,user);
  if(workspaceIdentity.member)return workspaceIdentity.member;
  if(!workspaceIdentity.active&&user.email===env.TEAM_OWNER_EMAIL.toLowerCase()&&env.PLATFORM_REQUIRE_INVITATION!=='1')await execute(env.DB,"INSERT OR IGNORE INTO members(user_id,email,name,role,created_at) VALUES(?,?,?,'owner',?)",user.id,user.email,user.name,Date.now());
  let m=workspaceIdentity.active?null:await one(env.DB,'SELECT * FROM members WHERE user_id=?',user.id);
  if(!m){
    const invited=await one(env.DB,'SELECT * FROM invitations WHERE email=? AND access_token_hash IS NULL',user.email);
    if(invited){await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO members(user_id,email,name,role,created_at) SELECT ?,?,?,role,? FROM invitations WHERE email=? AND access_token_hash IS NULL').bind(user.id,user.email,user.name,Date.now(),user.email),...await workspaceInvitationStatements(env,user.email,user.id,user.id),env.DB.prepare('DELETE FROM invitations WHERE email=? AND access_token_hash IS NULL AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND email=?)').bind(user.email,user.id,user.email)]);m=await one(env.DB,'SELECT * FROM members WHERE user_id=?',user.id);}
  }
  if(!m)fail(403,'Váš účet zatím není členem týmu. Požádejte správce o pozvánku.',{email:user.email});
  return m;
}
async function boundedBytes(request,max){const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let total=0;while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();fail(413,'Záznam nebo fotografie jsou příliš velké.');}chunks.push(value);}const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;}
async function body(request,max=100_000){const raw=new TextDecoder().decode(await boundedBytes(request,max));try{return JSON.parse(raw);}catch{fail(400,'Neplatná data.');}}
function cleanText(value,max,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(400,'Zkontrolujte vyplněné údaje.');return value.trim();}
function validId(value){if(typeof value!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(value))fail(400,'Neplatný identifikátor.');return value;}
function validEmail(value){const email=cleanText(value,254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Zadejte platný e-mail.');return email;}
function validRole(role){if(!ROLES.includes(role))fail(400,'Vyberte platné oprávnění.');return role;}
function markerData(markers){
  if(!Array.isArray(markers)||markers.length>100)fail(400,'Na fotografii může být nejvýše 100 značek.');
  return markers.map(m=>{validId(m.id);validId(m.zoneId);if(!/^#[0-9a-f]{6}$/i.test(m.color))fail(400,'Neplatná barva.');for(const k of ['x','y','labelX','labelY'])if(!Number.isFinite(m[k])||m[k]<0||m[k]>1)fail(400,'Neplatná poloha značky.');return {id:m.id,zoneId:m.zoneId,zoneName:cleanText(m.zoneName,100,true),color:m.color,x:m.x,y:m.y,labelX:m.labelX,labelY:m.labelY};});
}
function record(row){return {id:row.id,name:row.name,gardenId:row.garden_id||null,location:row.location,notes:row.notes,markers:JSON.parse(row.markers),position:row.latitude==null||row.longitude==null?null:{latitude:row.latitude,longitude:row.longitude,accuracy:row.accuracy},imageVersion:row.image_version,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,createdBy:row.created_by,updatedBy:row.updated_by,deleted:!!row.deleted,updatedByName:row.updater_name||null};}
function garden(row){return {id:row.id,customerId:row.customer_id||null,name:row.name,address:row.address,addressDetails:row.addressDetails||null,sharedDescription:row.shared_description||'',geocode:row.geocode_address===normalizeAddress(row.address)?{address:row.geocode_address,candidates:JSON.parse(row.geocode_candidates||'[]'),checkedAt:row.geocode_checked_at}:null,pumpType:row.pump_type||'',notes:row.notes,version:row.version,plan:row.plan_key?{name:row.plan_name,type:row.plan_type,size:row.plan_size,version:row.plan_version,markers:JSON.parse(row.plan_markers||'[]')}:null,createdAt:row.created_at,updatedAt:row.updated_at};}
async function checkGeocodeRate(env){
 const now=Date.now();
 const rate=await execute(env.DB,"INSERT INTO settings(key,value,version) VALUES('geocode-rate',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=settings.version+1 WHERE CAST(settings.value AS INTEGER)<=?",String(now),now-1100);
 if(!rate.meta.changes)fail(429,'Vyhledávání adres probíhá příliš rychle. Zkuste to za chvíli.',{code:'geocode_rate',retryAfterMs:1200});
}
async function addressFromPosition(request,env){
 const b=await body(request,1000);
 if(!Number.isFinite(b.latitude)||b.latitude<-90||b.latitude>90||!Number.isFinite(b.longitude)||b.longitude<-180||b.longitude>180)fail(400,'Zkontrolujte souřadnice polohy.');
 await checkGeocodeRate(env);
 const url=new URL('https://photon.komoot.io/reverse');url.searchParams.set('lat',String(b.latitude));url.searchParams.set('lon',String(b.longitude));url.searchParams.set('limit','1');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(url,{headers:{accept:'application/json','User-Agent':'ZavlahovyDenik/1.0 (+https://zavlahovy-denik.purplecedar.chatgpt.site)'},signal:controller.signal});
  if(!response.ok)fail(503,'Služba pro dohledání adresy je nyní nedostupná. Zkuste adresu zadat ručně.');
  const data=JSON.parse(new TextDecoder().decode(await boundedBytes(response,300000)));
  for(const feature of (Array.isArray(data?.features)?data.features:[]).slice(0,5)){
   if(!parseAddressCandidates({features:[feature]}).length)continue;
   const p=feature.properties||{},clean=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,160):'';
   const street=clean(p.street),number=clean(p.housenumber),city=clean(p.city)||clean(p.town)||clean(p.village)||clean(p.county);
   if(!street&&!city)continue;
   const address=[[street,number].filter(Boolean).join(' '),[clean(p.postcode),city].filter(Boolean).join(' '),clean(p.country)].filter(Boolean).join(', ');
   if(address.length>160)fail(422,'Nalezená adresa je příliš dlouhá. Zadejte ji ručně.');
   return json({address,precision:street&&number?'address':street?'street':'area'});
  }
  fail(404,'Adresu této polohy se nepodařilo najít. Zadejte ji ručně.');
 }catch(error){if(String(error?.message).includes('workspace_member_capacity'))return json({error:'Limit členů nebo pozvánek je v jednom z pracovních oborů vyčerpaný. Upravte příslušnost nebo licenci.',code:'workspace_member_capacity'},409);if(String(error?.message).includes('workspace_'))return json({error:'Změna neodpovídá aktuálnímu oboru nebo oprávnění. Obnovte údaje.',code:'workspace_conflict'},409);if(error instanceof HttpError)throw error;fail(503,'Adresu se nepodařilo dohledat. Zkontrolujte připojení nebo ji zadejte ručně.');}finally{clearTimeout(timer);}
}
async function resolveGardenAddress(request,env,old){
 const b=await body(request,2000),address=cleanText(b.address,160,true),normalized=normalizeAddress(address);
 if(normalized!==normalizeAddress(old.address))fail(409,'Adresa zahrady se změnila. Obnovte přehled a zkuste to znovu.');
 const cached=await one(env.DB,'SELECT * FROM garden_geocodes WHERE garden_id=?',old.id),now=Date.now();
 if(cached?.address===normalized&&(JSON.parse(cached.candidates).length||now-cached.checked_at<86400000))return json({address:normalized,candidates:JSON.parse(cached.candidates),checkedAt:cached.checked_at});
 await checkGeocodeRate(env);
 const url=new URL('https://photon.komoot.io/api/');url.searchParams.set('q',address);url.searchParams.set('limit','5');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let candidates;
 try{const response=await fetch(url,{headers:{accept:'application/json','User-Agent':'ZavlahovyDenik/1.0 (+https://zavlahovy-denik.purplecedar.chatgpt.site)'},signal:controller.signal});if(!response.ok)fail(503,'Služba pro vyhledání adresy je nyní nedostupná. Zkuste to později.');candidates=parseAddressCandidates(JSON.parse(new TextDecoder().decode(await boundedBytes(response,300000))));}catch(error){if(String(error?.message).includes('workspace_member_capacity'))return json({error:'Limit členů nebo pozvánek je v jednom z pracovních oborů vyčerpaný. Upravte příslušnost nebo licenci.',code:'workspace_member_capacity'},409);if(String(error?.message).includes('workspace_'))return json({error:'Změna neodpovídá aktuálnímu oboru nebo oprávnění. Obnovte údaje.',code:'workspace_conflict'},409);if(error instanceof HttpError)throw error;fail(503,'Adresu se nepodařilo vyhledat. Zkontrolujte připojení a zkuste to znovu.');}finally{clearTimeout(timer);}
 const latest=await one(env.DB,'SELECT address,deleted FROM gardens WHERE id=?',old.id);if(!latest||latest.deleted)fail(404,'Zahrada byla smazána.');if(normalizeAddress(latest.address)!==normalized)fail(409,'Adresa zahrady se během vyhledávání změnila. Zkuste to znovu.');
 await execute(env.DB,'INSERT INTO garden_geocodes(garden_id,address,candidates,checked_at) VALUES(?,?,?,?) ON CONFLICT(garden_id) DO UPDATE SET address=excluded.address,candidates=excluded.candidates,checked_at=excluded.checked_at',old.id,normalized,JSON.stringify(candidates),now);
 return json({address:normalized,candidates,checkedAt:now});
}
function validPosition(value){if(value===null)return null;if(!value||!Number.isFinite(value.latitude)||value.latitude<-90||value.latitude>90||!Number.isFinite(value.longitude)||value.longitude<-180||value.longitude>180||(value.accuracy!=null&&(!Number.isFinite(value.accuracy)||value.accuracy<0||value.accuracy>50000)))fail(400,'Zkontrolujte GPS souřadnice šachty.');return {latitude:value.latitude,longitude:value.longitude,accuracy:value.accuracy??null};}
function validServiceDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail(400,'Vyberte platné datum servisu.');const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value||Number(value.slice(0,4))<1000)fail(400,'Vyberte platné datum servisu.');return value;}
function serviceLog(row){return {id:row.id,gardenId:row.garden_id,date:row.date,work:row.work,parts:row.parts,notes:row.notes,version:row.version,mutationId:row.last_mutation_id||null,createdAt:row.created_at,updatedAt:row.updated_at,createdBy:row.created_by,updatedBy:row.updated_by,authorName:row.author_name||'Kolega',updaterName:row.updater_name||'Kolega'};}
const serviceSelect="SELECT service_logs.*,COALESCE(author.name,'Kolega') AS author_name,COALESCE(updater.name,'Kolega') AS updater_name FROM service_logs LEFT JOIN members AS author ON author.user_id=service_logs.created_by LEFT JOIN members AS updater ON updater.user_id=service_logs.updated_by";
function serviceConflict(){fail(409,'Servisní záznam mezitím změnil kolega. Váš rozepsaný text zůstal ve formuláři.',{code:'service_conflict'});}
function gardenConflict(){fail(409,'Zahradu mezitím změnil kolega. Obnovte přehled a zkuste to znovu.');}
function expectedVersion(v){if(!Number.isInteger(v)||v<0)fail(400,'Neplatná verze záznamu.');return v;}
function deletionSnapshot(values){if(!Array.isArray(values)||values.length>20000)fail(400,'Neplatný přehled zahrady.');const result=values.map(v=>({id:validId(v.id),version:expectedVersion(v.version)}));if(new Set(result.map(v=>v.id)).size!==result.length)fail(400,'Neplatný přehled zahrady.');return result;}
async function gardenDeletionPreview(env,id){return {shafts:await all(env.DB,'SELECT id,version FROM shafts WHERE garden_id=? AND deleted=0 ORDER BY id',id),services:await all(env.DB,'SELECT id,version FROM service_logs WHERE garden_id=? AND deleted=0 ORDER BY id',id)};}
async function deleteGarden(request,env,ctx,m,old){
 checkManage(m);const b=await body(request,1000000),version=expectedVersion(b.version);
 if(!['keep-shafts','delete-shafts'].includes(b.mode))fail(400,'Vyberte, zda šachty zachovat.');
 const shafts=deletionSnapshot(b.shafts),services=deletionSnapshot(b.services),now=Date.now(),token=crypto.randomUUID();
 const files=await all(env.DB,'SELECT image_key FROM shafts WHERE garden_id=? AND deleted=0',old.id);
 const matches=table=>`(SELECT COUNT(*) FROM ${table} WHERE garden_id=? AND deleted=0)=? AND NOT EXISTS (SELECT 1 FROM ${table} s WHERE s.garden_id=? AND s.deleted=0 AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.id')=s.id AND json_extract(j.value,'$.version')=s.version))`;
 const gate='EXISTS(SELECT 1 FROM gardens WHERE id=? AND deleted=1 AND deletion_token=?)';
 const result=await env.DB.batch([
  env.DB.prepare(`UPDATE gardens SET deleted=1,deletion_token=?,version=version+1,updated_at=?,updated_by=?,plan_key=NULL,plan_name=NULL,plan_type=NULL,plan_size=NULL,plan_version=NULL,plan_markers='[]',blowout='[]' WHERE id=? AND version=? AND deleted=0 AND ${matches('shafts')} AND ${matches('service_logs')}`).bind(token,now,m.user_id,old.id,version,old.id,shafts.length,old.id,JSON.stringify(shafts),old.id,services.length,old.id,JSON.stringify(services)),
  env.DB.prepare(`UPDATE shafts SET ${b.mode==='keep-shafts'?'garden_id=NULL':'deleted=1'},version=version+1,updated_at=?,updated_by=? WHERE garden_id=? AND deleted=0 AND ${gate}`).bind(now,m.user_id,old.id,old.id,token),
  env.DB.prepare(`UPDATE service_logs SET deleted=1,last_mutation_id=NULL,version=version+1,updated_at=?,updated_by=? WHERE garden_id=? AND deleted=0 AND ${gate}`).bind(now,m.user_id,old.id,old.id,token)
 ]);
 if(!result[0].meta.changes)fail(409,'Zahradu nebo její obsah mezitím změnil kolega. Načtěte nový přehled před smazáním.',{code:'garden_delete_conflict'});
 const keys=[...JSON.parse(old.blowout||'[]').flatMap(s=>s.photos.map(p=>p.key)),...(old.plan_key?[old.plan_key]:[]),...(b.mode==='delete-shafts'?files.map(f=>f.image_key):[])];
 if(keys.length)ctx.waitUntil(Promise.all(keys.map(key=>env.BUCKET.delete(key))));
 return json({ok:true,mode:b.mode,shaftsAffected:result[1].meta.changes,servicesDeleted:result[2].meta.changes});
}
function conflict(){fail(409,'Šachtu mezitím změnil kolega. Vaše změny zůstaly v tomto zařízení.',{code:'conflict'});}
function mutationAllowed(request){
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)fail(403,'Požadavek musí pocházet z této aplikace.');
  if(request.headers.get('sec-fetch-site')==='cross-site')fail(403,'Požadavek musí pocházet z této aplikace.');
  if(request.headers.get('x-zavlahy-request')!=='1')fail(403,'Neplatný požadavek.');
}
async function featureSettings(env){const row=await one(env.DB,"SELECT * FROM settings WHERE key=?",workspacePreferenceKey(env,'features'));return {...await tenantFeaturePolicy(env,normalizeFeatures(row?JSON.parse(row.value):null)),featuresVersion:row?.version||0};}
export async function api(request,env,ctx){
 const started=performance.now(),requestId=crypto.randomUUID(),route='/api/'+(new URL(request.url).pathname.split('/')[2]||'');
 let response;
 try{response=await workspaceAPI(request,env,ctx);}
 catch(error){console.error('API communication failure',{requestId,route,code:'api_unavailable',name:error?.name});response=json({error:'Server nyní neodpovídá. Neodeslané změny ponechte v zařízení a zkuste to znovu.',code:'api_unavailable'},503);}
 const duration=Math.round((performance.now()-started)*10)/10;
 if(duration>=3000||response.status>=500)console.warn('API communication diagnostic',{requestId,route,method:request.method,status:response.status,durationMs:duration});
 const result=new Response(response.body,response);result.headers.append('server-timing','app;dur='+duration);result.headers.set('x-request-id',requestId);return result;
}
async function workspaceAPI(request,env,ctx){
 if(new URL(request.url).pathname==='/api/connection-health'&&request.method==='GET'){
  const started=performance.now();
  try{await env.DB.prepare('SELECT 1 AS ready').first();const databaseMs=Math.round((performance.now()-started)*10)/10;return new Response(JSON.stringify({ok:true,databaseMs}),{headers:{'content-type':'application/json','cache-control':'no-store','server-timing':'db;dur='+databaseMs}});}
  catch{console.error('Connection probe failed',{code:'database_unavailable'});return json({ok:false,code:'database_unavailable'},503);}
 }
 await workspaceTransferEnsureControl(env);
 if(new URL(request.url).pathname.startsWith('/api/workspace-transfer/')){
  try{if(!['GET','HEAD'].includes(request.method))mutationAllowed(request);return await handleWorkspaceTransfer(request,env,{json,fail,body});}
  catch(error){if(error instanceof HttpError)return json({error:error.message,...error.extra},error.status);console.error('Workspace transfer failed',error?.name,error?.message);return json({error:'Řízený převod nebyl uložen. Ověřte stav a plán.',code:'workspace_transfer_failed'},409);}
 }
 const scopedEnv={...env,_workspaceWaitUntil:task=>ctx.waitUntil(task),_workspaceStartStamp:await workspaceTransferStamp(env)};
 scopedEnv.DB=workspaceFencedDatabase(env.DB,scopedEnv._workspaceStartStamp);
 const response=await workspaceRawApi(request,scopedEnv,ctx);
 try{return await workspaceFilterResponse(response,request,scopedEnv);}catch{return json({error:'Přehled se nepodařilo bezpečně načíst. Zkuste jej obnovit.'},503);}
}
async function workspaceRawApi(request,env,ctx){
  try{
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(!['GET','HEAD'].includes(method))mutationAllowed(request);
    if(await workspaceTransferFrozen(env))return json({error:'Probíhá bezpečné propojení adresářů. Rozepsané změny ponechte v zařízení a zkuste to po chvíli.',code:'workspace_transfer_frozen'},503);
    if(path==='/api/workspace/recovery-key'&&method==='GET'){await assertInstallation(env);return json({recovery:await workspaceRecoveryPublicInfo(env)});}
    if(['/api/auth/options','/api/auth/login','/api/auth/recover'].includes(path)){await assertInstallation(env);return await handleLocalPublicAuth(request,env,{body,json,fail});}
    if(path==='/api/platform-invitation'){if(await passwordOnly(env))fail(403,'Účty nyní vytváří správce jménem a heslem.');await assertInstallation(env);return await tenantClaimInvitation(request,env,{fail,json,body,userFrom});}
    if(path==='/api/maintenance/approved-job-import'){await tenantPlatformGate(request,env,{fail});
      const response=await handleApprovedImport(request,env,{fail,json,one,cleanText,validId,accessHash,boundedBytes});
      ctx.waitUntil(dispatchNotifications(env).catch(()=>{}));return response;
    }
    if(path==='/api/service-reminders/run'){await assertInstallation(env);const policy=await tenantPolicy(env),shared=await one(env.DB,"SELECT id FROM workspaces WHERE state IN ('active','read_only') LIMIT 1");if(!shared&&policy&&!policy.active)fail(403,'Licence firmy není aktivní.',{code:'license_inactive'});if(!shared&&policy&&!policy.modules.notifications)fail(403,'Upozornění nejsou v licenci.',{code:'module_not_licensed'});ctx.waitUntil(tenantHeartbeat(env).catch(()=>{}));if(await one(env.DB,"SELECT id FROM system_backups WHERE state='restoring' LIMIT 1"))fail(503,'Probíhá obnova instalace.');return await handleServiceReminders(request,env,null,{json,fail,boundedBytes,body});}
    if(path==='/api/access-info'&&method==='POST')return await redeemAccess(request,env,ctx,true);
    if(path==='/api/platform-initialize'&&method==='POST'){Object.assign(env,await workspaceRequestContext(env,request));
      const supplied=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1],expected=env.PLATFORM_SERVICE_TOKEN;
      if(!supplied||!expected)fail(401,'Neplatné technické připojení.');
      const hash=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),a=await hash(supplied),b=await hash(expected);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];if(diff)fail(401,'Neplatné technické připojení.');
      await assertInstallation(env);const policy=await tenantPolicy(env,{refresh:true});if(!policy)fail(409,'Instalace není propojená s platformou.');await tenantHeartbeat(env,null);
      return json({ready:true,installationId:policy.installationId,companyId:policy.companyId,policyRevision:policy.revision,licensedActive:policy.active});
    }
    if(path==='/api/access-link'&&method==='POST')return await redeemAccess(request,env,ctx);
    if(path==='/api/access-logout'&&method==='POST'){const c=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(ACCESS_COOKIE+'='));if(c)await execute(env.DB,'UPDATE access_sessions SET revoked_at=? WHERE token_hash=?',Date.now(),await accessHash(c.slice(ACCESS_COOKIE.length+1)));const response=json({ok:true});response.headers.set('set-cookie',accessCookie(''));return response;}
    if(['/api/workspace/identity-invite','/api/workspace/link-identity'].includes(path)&&await passwordOnly(env))fail(403,'Původní způsob přihlašování je vypnutý.');
    const m=await memberFor(request,env);Object.assign(env,await workspaceRequestContext(env,request,m));
    if(m._mustChange&&!['/api/auth/account','/api/auth/password'].includes(path))fail(403,'Před prvním použitím si změňte dočasné heslo.',{code:'password_change_required'});
    await workspaceResourceAccess(request,env,m,fail);env._workspaceScope=m._workspace||null;
    if(['/api/auth/account','/api/auth/password','/api/auth/policy'].includes(path))return await handleLocalSelf(request,env,m,{body,json,fail});
    const platformPolicy=await tenantPlatformGate(request,env,{fail});
    if(path==='/api/workspace'||path.startsWith('/api/workspace/')){const {features}=await featureSettings(env);const needed=path.includes('/members/')?'teamManagement':path.includes('/customers/')?'customers':path.includes('/gardens/')?'gardens':null;if(needed&&features[needed]===false)fail(403,'Tato funkce je v nastavení firmy vypnutá.');return await handleWorkspace(request,env,m,{fail,json,body,boundedBytes,features});}
    if(!['GET','HEAD'].includes(method)&&!path.startsWith('/api/system-backups')&&await one(env.DB,"SELECT id FROM system_backups WHERE state='restoring' LIMIT 1"))fail(503,'Probíhá obnova prázdné instalace. Zkuste to po jejím dokončení.',{code:'restore_in_progress'});
    if(path.startsWith('/api/privacy/'))return await handlePrivacy(request,env,m,{json,fail,body,validId});
    if(path==='/api/system-backups'||path.startsWith('/api/system-backups/'))return await handleSystemBackups(request,env,m,{json,fail,body,validId,boundedBytes});
    if(path==='/api/operations/health'&&method==='GET'){checkManage(m);return json(await operationsHealth(env));}
    if(path==='/api/installation')return await handleInstallation(request,env,m,{json,fail,body,cleanText});
    if(path==='/api/local-accounts'||path.startsWith('/api/local-accounts/')){const {features}=await featureSettings(env);if(!features.teamManagement)fail(403,'Správa týmu je vypnutá.');return await handleLocalAccounts(request,env,m,{body,json,fail,maxUsers:platformPolicy?.maxUsers});}
    if(path==='/api/access-sessions'||path.startsWith('/api/access-sessions/'))return await handleAccessSessions(request,env,m,{json,fail,validId});
    if(method==='PUT'&&/\/service\/photos\//.test(path)||['POST','PUT'].includes(method)&&/\/jobs\/[^/]+\/photos(?:$|\/[^/]+\/(?:upload|content)$)/.test(path)){const {features}=await featureSettings(env);if(!features.photoUploads)fail(403,'Přidávání fotografií je vypnuté.',{code:'feature_disabled',feature:'photoUploads'});}
    if(path==='/api/vehicles'||path.startsWith('/api/vehicles/')){const {features}=await featureSettings(env);return await handleVehicles(request,env,m,{fail,json,body,validId,cleanText,boundedBytes},features);}
    const granularFeature=path==='/api/work-rates'?'workCharges':/\/jobs\/[^/]+\/handoffs$/.test(path)?'jobHandoffs':path==='/api/jobs/backlog'?'jobBacklog':/\/jobs\/[^/]+\/departure$/.test(path)?'jobTravel':/\/jobs\/[^/]+\/service\/photos\//.test(path)&&method==='PUT'?'protocolPhotos':null;
    if(granularFeature){const {features}=await featureSettings(env);if(!featureEnabled(granularFeature,features))fail(403,'Tato funkce je v nastavení firmy vypnutá.',{code:'feature_disabled',feature:granularFeature});}
    const deliver=()=>ctx.waitUntil(dispatchNotifications(env).catch(()=>{}));
    if(path==='/api/record-links'){const {features}=await featureSettings(env);return await handleRecordLinks(request,env,m,{all,json,fail,features});}
    if(path==='/api/defects'||path.startsWith('/api/defects/')||/^\/api\/gardens\/[-\w]+\/history$/.test(path)){const {features}=await featureSettings(env);if(!features.gardens)fail(403,'Zahrady jsou v nastavení vypnuté.');return await handleGardenHistory(request,env,m,{all,one,body,json,fail,validId,cleanText,features});}
    if(path==='/api/email-settings')return await handleEmailConfiguration(request,env,m,{body,fail,json});
    if(path==='/api/invoice-company')return await handleInvoiceCompany(request,env,m,{body,fail,json,cleanText});
    if(path==='/api/work-rates')return await handleWorkRates(request,env,m,{body,fail,json});
    if(path==='/api/materials'||path.startsWith('/api/materials/'))return await handleMaterials(request,env,m,{body,fail,json,validId,cleanText,expectedVersion});
    if(path.startsWith('/api/service-reminders/'))return await handleServiceReminders(request,env,m,{json,fail,boundedBytes,body});
    if(/^\/api\/jobs\/[-\w]+\/protocol-emails(?:\/|$)/.test(path)){const {features}=await featureSettings(env);if(!features.jobs)fail(403,'Zakázky jsou vypnuté.');return await handleProtocolEmails(request,env,ctx,m,{body,fail,json,validId,cleanText,boundedBytes});}
    if(/^\/api\/jobs\/[-\w]+\/service(?:\/|$)/.test(path)){const {features}=await featureSettings(env);if(!features.jobs)fail(403,'Zakázky jsou v nastavení vypnuté.',{code:'jobs_disabled'});const response=await handleServiceWork(request,env,ctx,m,{body,fail,json,validId,cleanText,boundedBytes,features});if(method!=='GET')deliver();return response;}
    if(path.startsWith('/api/subscriptions')||path.startsWith('/api/tariffs')){const {features}=await featureSettings(env);if(!features.subscriptions||!features.jobs||!features.customers)fail(403,'Předplatné, zákazníci nebo zakázky jsou v nastavení vypnuté.',{code:'subscriptions_disabled'});const response=await handleSubscriptions(request,env,m,{body,fail,json,validId,cleanText,boundedBytes});if(method!=='GET')deliver();return response;}
    if(path==='/api/notifications'||path.startsWith('/api/notifications/')){const {features}=await featureSettings(env);if(!features.notifications&&!(method==='GET'&&['/api/notifications/subscription','/api/notifications/preferences','/api/notifications/native/config','/api/notifications/native'].includes(path))&&!(method==='DELETE'&&['/api/notifications/subscription','/api/notifications/native'].includes(path)))fail(403,'Upozornění jsou v nastavení týmu vypnutá.');const response=await handleNotifications(request,env,m,{body,fail,json,one,all,execute,features});if(method==='GET'&&path==='/api/notifications')deliver();return response;}
    if(path==='/api/customers'||path.startsWith('/api/customers/')){const {features}=await featureSettings(env);if(!features.customers)fail(403,'Seznam zákazníků je v nastavení týmu vypnutý.');return await handleCustomers(request,env,m,{all,one,execute,body,fail,json,validId,cleanText,expectedVersion,features});}
    if(path.startsWith('/api/drive/')){const {features}=await featureSettings(env);if(!features.googleDrive)fail(403,'Google Disk je v nastavení vypnutý.',{code:'feature_disabled',feature:'googleDrive'});return await handleDrive(request,env,ctx,m,{one,all,execute,body,json,fail,cleanText,boundedBytes});}
    if(/^\/api\/jobs\/[-\w]{1,100}\/photos(?:\/|$)/.test(path)){const {features}=await featureSettings(env);if(!features.jobs||!features.drivePhotos||!features.googleDrive)fail(403,'Fotodokumentace zakázek je v nastavení vypnutá.');return await handleJobPhotos(request,env,ctx,m,{one,all,execute,body,boundedBytes,json,fail,cleanText,validId});}
    if(/^\/api\/jobs\/[-\w]+\/handoffs$/.test(path)){const {features}=await featureSettings(env);if(!features.jobs)fail(403,'Zakázky jsou vypnuté.');const response=await handleJobHandoffs(request,env,m,{body,fail,json,validId,cleanText});if(method!=='GET')deliver();return response;}
    if(path==='/api/jobs/schedule'){const {features}=await featureSettings(env);if(!features.jobs)fail(403,'Zakázky jsou vypnuté.');const response=await handleJobPlanner(request,env,m,{body,fail,json,validId});deliver();return response;}
    if(path==='/api/jobs'||path.startsWith('/api/jobs/')){const {features}=await featureSettings(env);if(!features.jobs)fail(403,'Zakázky jsou v nastavení týmu vypnuté.');const response=await handleJobs(request,env,m,{all,one,execute,body,fail,json,validId,cleanText,expectedVersion,features,checkGeocodeRate,boundedBytes});if(method!=='GET')deliver();return response;}
    if(path==='/api/attendance'||path.startsWith('/api/attendance/')){const {features}=await featureSettings(env);if(features.attendance===false)fail(403,'Docházka je v nastavení týmu vypnutá.');const response=await handleAttendance(request,env,m,{all,one,execute,body,fail,json,validId,cleanText},features);if(method!=='GET')deliver();return response;}
    if(path==='/api/me'&&method==='GET'){deliver();ctx.waitUntil(tenantHeartbeat(env,m).catch(e=>console.error('Platform heartbeat unavailable',e.name)));const settings=await featureSettings(env);const active=settings.features.attendance?await one(env.DB,'SELECT id FROM attendance_shifts WHERE user_id=? AND deleted_at IS NULL AND end_at IS NULL',m.user_id):null;return json({...settings,installation:await installationInfo(env),verifiedAt:Date.now(),attendance:{active:!!active},user:{id:m.user_id,email:m.email,name:m.name,role:m.role,authMethod:m._authMethod||'chatgpt',username:m.username||null},workspace:m._workspace||null,recovery:await workspaceRecoveryPublicInfo(env),permissions:{write:canWrite(m)&&(!settings.license||settings.license.active),manage:canManage(m),delete:['owner','administrator','admin'].includes(m.role)},roleNames:ROLE_NAMES});}
    if(path==='/api/features'&&method==='GET')return json(await featureSettings(env));
    if(path==='/api/features'&&method==='PUT'){
      if(platformPolicy)fail(403,'Moduly této firmy spravuje pouze Super Admin.',{code:'central_modules_only'});
      checkManage(m);const b=await body(request,5000),version=expectedVersion(b.version);
      if(!b.features||Array.isArray(b.features)||typeof b.features!=='object'||Object.keys(b.features).some(key=>!Object.hasOwn(DEFAULT_FEATURES,key))||Object.keys(DEFAULT_FEATURES).some(key=>typeof b.features[key]!=='boolean'&&!(['vehicles','shafts','gardenHistory','defects','materials','jobMap','nearby','attendance','blowout','jobs','drivePhotos','notifications','customers',...FEATURE_OPTIONS.filter(f=>f.licenseParent||f.controlOnly).map(f=>f.key)].includes(key)&&!Object.hasOwn(b.features,key))))fail(400,'Zkontrolujte přepínače funkcí.');
      const previous=await featureSettings(env);if(m.role!=='owner'&&FEATURE_OPTIONS.some(f=>f.ownerOnly&&Object.hasOwn(b.features,f.key)&&b.features[f.key]!==previous.features[f.key]))fail(403,'Prototypy materiálu a účtování nastavuje pouze vlastník.');const features=normalizeFeatures({...previous.features,...b.features});if(previous.license&&Object.entries(features).some(([key,on])=>on&&!licensedFeature(key,previous.license.modules,previous.license.featureOverrides)))fail(403,'Některá funkce není součástí licence firmy.',{code:'module_not_licensed'});let result;
      if(version===0)result=await execute(env.DB,"INSERT OR IGNORE INTO settings(key,value,version) VALUES(?,?,1)",workspacePreferenceKey(env,'features'),JSON.stringify(features));
      else result=await execute(env.DB,"UPDATE settings SET value=?,version=version+1 WHERE key=? AND version=?",JSON.stringify(features),workspacePreferenceKey(env,'features'),version);
      if(!result.meta.changes)fail(409,'Nastavení mezitím změnil jiný správce. Načtěte aktuální nastavení a zkuste to znovu.');
      return json({features,featuresVersion:version+1});
    }
    if(path==='/api/team'&&method==='GET'){checkManage(m);return json({members:(await all(env.DB,'SELECT user_id,email,name,role,created_at,(SELECT json_group_array(md.discipline) FROM member_disciplines md WHERE md.user_id=members.user_id) AS disciplines,(SELECT version FROM workspace_entity_versions v WHERE v.entity=\'member\' AND v.entity_id=members.user_id) AS membership_version,EXISTS(SELECT 1 FROM guest_access a WHERE a.user_id=members.user_id) AS personal_link FROM members ORDER BY created_at')).map(v=>({id:v.user_id,email:v.email,name:v.name,role:v.role,createdAt:v.created_at,personalLink:!!v.personal_link,...(m._workspace?{disciplines:JSON.parse(v.disciplines||'[]'),membershipVersion:v.membership_version||0}:{})})),invitations:await all(env.DB,'SELECT email,role,created_at,access_token_hash IS NOT NULL AS personal_link FROM invitations ORDER BY created_at')});}
    if(path==='/api/invitations'&&method==='POST'){
      checkManage(m);if(await passwordOnly(env))fail(403,'Použijte vytvoření účtu jménem a heslem.');const b=await body(request,1000),email=validEmail(b.email),role=validRole(b.role),mode=b.mode??'chatgpt';if(!['chatgpt','link'].includes(mode))fail(400,'Vyberte způsob připojení kolegy.');
      let disciplines=[];if(m._workspace){try{disciplines=normalizeDisciplines(b.disciplines||[m._workspace.selectedDiscipline]);}catch(error){fail(400,error.message);}}const originOrganization=m._workspace?await one(env.DB,'SELECT id FROM workspace_organizations WHERE workspace_id=? AND discipline=?',m._workspace.workspaceId,disciplines.includes(m._workspace.selectedDiscipline)?m._workspace.selectedDiscipline:disciplines[0]):null;
      if(!canAssignTeamRole(m.role,role))fail(403,'Toto oprávnění nemůžete přidělit.');
      const existingInvitation=await one(env.DB,'SELECT * FROM invitations WHERE email=?',email);if(existingInvitation&&!canAssignTeamRole(m.role,existingInvitation.role))fail(403,'Tuto pozvánku nemůžete měnit.');
      if(await one(env.DB,'SELECT 1 FROM members WHERE email=?',email))fail(409,'Tento kolega už je členem týmu.');
      const count=await one(env.DB,'SELECT (SELECT COUNT(*) FROM members)+(SELECT COUNT(*) FROM invitations) AS total');const maxUsers=m._workspace?10000:platformPolicy?.maxUsers||100;if(!existingInvitation&&count.total>=maxUsers)fail(400,'Licence dovoluje nejvýše '+maxUsers+' členů a pozvánek.');
      const token=mode==='link'?accessToken():null,hash=token?await accessHash(token):null,known=mode==='link'?await one(env.DB,'SELECT user_id FROM guest_access WHERE email=?',email):null,guestId=token?(known?.user_id||existingInvitation?.guest_user_id||'guest_'+crypto.randomUUID()):null;
      const invitedResult=await execute(env.DB,'INSERT INTO invitations(disciplines,origin_organization_id,email,role,created_by,created_at,access_token_hash,guest_user_id,expires_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role=?) AND NOT EXISTS(SELECT 1 FROM invitations WHERE email=? AND role<>?) AND ((SELECT COUNT(*) FROM members)+(SELECT COUNT(*) FROM invitations)<? OR EXISTS(SELECT 1 FROM invitations WHERE email=?)) ON CONFLICT(email) DO UPDATE SET role=excluded.role,created_by=excluded.created_by,created_at=excluded.created_at,access_token_hash=excluded.access_token_hash,guest_user_id=excluded.guest_user_id,expires_at=excluded.expires_at,disciplines=excluded.disciplines,origin_organization_id=excluded.origin_organization_id',JSON.stringify(disciplines),originOrganization?.id||null,email,role,m.user_id,Date.now(),hash,guestId,Date.now()+(['administrator','admin'].includes(role)?1:7)*86400000,m.user_id,m.role,email,existingInvitation?.role||role,maxUsers,email);if(!invitedResult.meta.changes)fail(409,'Pozvánku nebo oprávnění mezitím někdo změnil. Obnovte tým.');return json({email,role,mode,url:token?accessURL(env.WORKSPACE_ENTRY_ORIGIN||url.origin,token):url.origin});
    }
    if(path==='/api/invitations'&&method==='DELETE'){checkManage(m);const b=await body(request,1000),email=validEmail(b.email),old=await one(env.DB,'SELECT role FROM invitations WHERE email=?',email);if(old&&!canAssignTeamRole(m.role,old.role))fail(403,'Tuto pozvánku nemůžete zrušit.');await execute(env.DB,'DELETE FROM invitations WHERE email=? AND role=? AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role=?)',email,old?.role||'',m.user_id,m.role);return json({ok:true});}
    const renew=path.match(/^\/api\/members\/([-a-zA-Z0-9_]{1,100})\/(access-link|device-invite)$/);
    if(renew&&method==='POST'){checkManage(m);if(await passwordOnly(env))fail(403,'Použijte nastavení přihlášení jménem a heslem.');const target=await one(env.DB,'SELECT m.* FROM members m JOIN guest_access a ON a.user_id=m.user_id WHERE m.user_id=?',renew[1]);if(!target)fail(404,'Kolega s osobním odkazem nebyl nalezen.');if(!canEditTeamMember(m,target))fail(403,'Nemůžete obnovit přístup tohoto kolegy.');const token=accessToken();const renewed=await execute(env.DB,'UPDATE guest_access SET token_hash=?,expires_at=?,single_use=1 WHERE user_id=? AND EXISTS(SELECT 1 FROM members target WHERE target.user_id=guest_access.user_id AND target.role=?) AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role=?)',await accessHash(token),Date.now()+(['administrator','admin'].includes(target.role)?1:7)*86400000,target.user_id,target.role,m.user_id,m.role);if(!renewed.meta.changes)fail(409,'Oprávnění mezitím někdo změnil. Obnovte tým.');if(renew[2]==='access-link')await execute(env.DB,'UPDATE access_sessions SET revoked_at=? WHERE user_id=?',Date.now(),target.user_id);return json({email:target.email,role:target.role,mode:'link',url:accessURL(env.WORKSPACE_ENTRY_ORIGIN||url.origin,token)});}
    if(path.startsWith('/api/members/')&&['PATCH','DELETE'].includes(method)){
      checkManage(m);const id=decodeURIComponent(path.slice('/api/members/'.length));const target=await one(env.DB,'SELECT * FROM members WHERE user_id=?',id);if(!target)fail(404,'Člen nebyl nalezen.');if(!canEditTeamMember(m,target))fail(403,'Nemůžete měnit oprávnění tohoto kolegy.');
      if(method==='DELETE'){const gate='EXISTS(SELECT 1 FROM members target WHERE target.user_id=? AND target.role=?) AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role=?)',args=[id,target.role,m.user_id,m.role],now=Date.now();const result=await env.DB.batch([env.DB.prepare('UPDATE access_sessions SET revoked_at=? WHERE user_id=? AND '+gate).bind(now,id,...args),env.DB.prepare('UPDATE guest_access SET token_hash=NULL,expires_at=NULL WHERE user_id=? AND '+gate).bind(id,...args),env.DB.prepare('DELETE FROM members WHERE user_id=? AND '+gate).bind(id,...args)]);if(!result[2].meta.changes)fail(409,'Oprávnění mezitím někdo změnil. Obnovte tým.');return json({ok:true});}
      const b=await body(request,1000),role=validRole(b.role);if(!canAssignTeamRole(m.role,role))fail(403,'Toto oprávnění nemůžete přidělit.');const r=await execute(env.DB,'UPDATE members SET role=? WHERE user_id=? AND role=? AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role=?)',role,id,target.role,m.user_id,m.role);if(!r.meta.changes)fail(409,'Oprávnění mezitím někdo změnil. Obnovte tým.');return json({ok:true});
    }
    if(path==='/api/zones'&&method==='GET'){const settings=await one(env.DB,"SELECT * FROM settings WHERE key='zones'");return json({zones:settings?JSON.parse(settings.value):null,version:settings?.version||0});}
    if(path==='/api/zones'&&method==='PUT'){
      checkWrite(m);const b=await body(request,50_000),version=expectedVersion(b.version);if(!Array.isArray(b.zones)||b.zones.length>200)fail(400,'Neplatný seznam zón.');const zones=b.zones.map(z=>{validId(z.id);if(!/^#[0-9a-f]{6}$/i.test(z.color))fail(400,'Neplatná barva zóny.');return {id:z.id,name:cleanText(z.name,100,true),color:z.color};});if(new Set(zones.map(z=>z.id)).size!==zones.length)fail(400,'Zóny obsahují opakované ID.');
      let result;if(version===0)result=await execute(env.DB,"INSERT OR IGNORE INTO settings(key,value,version) VALUES('zones',?,1)",JSON.stringify(zones));else result=await execute(env.DB,"UPDATE settings SET value=?,version=version+1 WHERE key='zones' AND version=?",JSON.stringify(zones),version);if(!result.meta.changes)fail(409,'Seznam zón mezitím změnil kolega. Obnovte stránku.');return json({zones,version:version+1});
    }

    const gardenCustomerMatch=path.match(/^\/api\/gardens\/([-a-zA-Z0-9_]{1,100})\/customer$/);
    if(gardenCustomerMatch&&method==='PATCH'){
      checkManage(m);const {features}=await featureSettings(env);if(!features.customers||!features.gardens)fail(403,'Zapněte seznam zákazníků a zahrady v nastavení týmu.');
      const b=await body(request,2000);if(!b||Object.keys(b).some(k=>!['version','customerId'].includes(k))||!Object.hasOwn(b,'customerId'))fail(400,'Vyberte zákazníka nebo zrušte propojení.');
      const version=expectedVersion(b.version),customerId=b.customerId===null?null:validId(b.customerId),id=gardenCustomerMatch[1];
      if(!await one(env.DB,'SELECT id FROM gardens WHERE id=? AND deleted=0',id))fail(404,'Zahrada nebyla nalezena.');
      if(customerId&&!await one(env.DB,'SELECT id FROM customers WHERE id=? AND deleted=0',customerId))fail(400,'Zákazník už není v adresáři. Obnovte výběr.');
      const result=await execute(env.DB,"UPDATE gardens SET customer_id=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND deleted=0 AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role IN ('owner','administrator','admin')) AND (? IS NULL OR EXISTS(SELECT 1 FROM customers c WHERE c.id=? AND c.deleted=0))",customerId,Date.now(),m.user_id,id,version,m.user_id,customerId,customerId);
      if(!result.meta.changes)fail(409,'Zahradu nebo zákazníka mezitím změnil kolega. Obnovte přehled a ověřte oprávnění.');return json({garden:garden(await one(env.DB,'SELECT * FROM gardens WHERE id=?',id))});
    }
    if(path==='/api/gardens/address-from-position'&&method==='POST'){checkWrite(m);return await addressFromPosition(request,env);}
    if(path==='/api/gardens'&&method==='GET'){const {features}=await featureSettings(env),rows=await all(env.DB,'SELECT gardens.*,garden_geocodes.address AS geocode_address,garden_geocodes.candidates AS geocode_candidates,garden_geocodes.checked_at AS geocode_checked_at FROM gardens LEFT JOIN garden_geocodes ON garden_geocodes.garden_id=gardens.id WHERE gardens.deleted=0 AND '+workspaceGardenScope('gardens')+' ORDER BY gardens.name COLLATE NOCASE',m.user_id);const selected=m._workspace&&url.searchParams.get('discipline');let visible=rows;if(selected&&selected!=='all'){const ids=new Set((await all(env.DB,'SELECT g.id FROM gardens g WHERE (g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines c WHERE c.customer_id=g.customer_id AND c.discipline=?)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines d WHERE d.garden_id=g.id AND d.discipline=?))',selected,selected)).map(g=>g.id));visible=rows.filter(g=>ids.has(g.id));}return json({gardens:(await gardenAddressLinks(env,m,visible,{all,features})).map(garden)});}
    if(path==='/api/gardens'&&method==='POST'){
      checkWrite(m);const b=await body(request,10_000),id=validId(b.id),name=cleanText(b.name,100,true),address=cleanText(b.address,500),notes=cleanText(b.notes,2000),pumpType=cleanText(b.pumpType??'',160),now=Date.now(),old=await one(env.DB,'SELECT * FROM gardens WHERE id=?',id),{features}=await featureSettings(env);
      const creationDiscipline=workspaceWriteDiscipline(m,b,null,fail),storedNotes=m._workspace&&creationDiscipline==='garden'?'':notes;
      const replay=async row=>row&&!row.deleted&&row.created_by===m.user_id&&row.name===name&&row.address===address&&row.notes===storedNotes&&(!m._workspace||creationDiscipline!=='garden'||(await one(env.DB,'SELECT notes FROM garden_discipline_data WHERE garden_id=? AND discipline=?',id,creationDiscipline))?.notes===notes)&&(row.pump_type||'')===pumpType&&(!b.customerId||row.customer_id===b.customerId);
      if(old){if(await replay(old))return json({garden:garden(old),replayed:true});gardenConflict();}
      const result=await insertGardenWithCustomer(env,m,b,{id,name,address,notes,pumpType,now},features,{fail,validId,cleanText});
      const saved=await one(env.DB,'SELECT * FROM gardens WHERE id=?',id);if(!result.meta.changes&&!await replay(saved))gardenConflict();return json({garden:garden(saved),replayed:!result.meta.changes});
    }

    const serviceMatch=path.match(/^\/api\/gardens\/([-a-zA-Z0-9_]{1,100})\/services(?:\/([-a-zA-Z0-9_]{1,100}))?$/);
    if(serviceMatch){
      const gardenId=serviceMatch[1],id=serviceMatch[2];if(!await one(env.DB,'SELECT id FROM gardens WHERE id=? AND deleted=0',gardenId))fail(404,'Zahrada nebyla nalezena.');
      if(!id&&method==='GET')return json({services:(await all(env.DB,serviceSelect+' WHERE service_logs.garden_id=? AND service_logs.deleted=0 AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND '+workspaceDisciplineSql('service_logs.discipline','actor','service')+') ORDER BY service_logs.date DESC,service_logs.created_at DESC',gardenId,m.user_id)).map(serviceLog)});
      if(id&&['PUT','DELETE'].includes(method)){
        if(method==='DELETE'){if(!['owner','administrator','admin'].includes(m.role))fail(403,'Servisní záznamy může mazat pouze správce.');}else checkWrite(m);
        const b=await body(request,25_000),version=expectedVersion(b.version),mutationId=b.mutationId==null?null:validId(b.mutationId),old=await one(env.DB,'SELECT * FROM service_logs WHERE id=?',id);
        if(old&&m._workspace&&!m._workspace.disciplines.includes(old.discipline))fail(404,'Servisní záznam není dostupný.');
        if(old&&old.garden_id!==gardenId)fail(404,'Servisní záznam nebyl nalezen v této zahradě.');
        if(old?.deleted)fail(409,'Tento servisní záznam už kolega smazal.',{code:'service_deleted'});if(method==='PUT'&&mutationId&&old?.last_mutation_id===mutationId&&old.updated_by===m.user_id)return json({service:serviceLog(await one(env.DB,serviceSelect+' WHERE service_logs.id=?',id))});if((old?.version||0)!==version)serviceConflict();
        if(method==='DELETE'){if(!old)fail(404,'Servisní záznam nebyl nalezen.');const result=await execute(env.DB,'UPDATE service_logs SET deleted=1,version=version+1,updated_at=?,updated_by=? WHERE id=? AND garden_id=? AND version=? AND deleted=0',Date.now(),m.user_id,id,gardenId,version);if(!result.meta.changes)serviceConflict();return json({ok:true});}
        const discipline=workspaceWriteDiscipline(m,b,old,fail);
        const date=validServiceDate(b.date),work=cleanText(b.work,4000,true),parts=cleanText(b.parts,2000),notes=cleanText(b.notes,2000),now=Date.now();let result;
        if(old)result=await execute(env.DB,'UPDATE service_logs SET date=?,work=?,parts=?,notes=?,last_mutation_id=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND garden_id=? AND version=? AND deleted=0 AND EXISTS(SELECT 1 FROM gardens WHERE id=? AND deleted=0)',date,work,parts,notes,mutationId,now,m.user_id,id,gardenId,version,gardenId);
        else result=await execute(env.DB,'INSERT OR IGNORE INTO service_logs(discipline,id,garden_id,date,work,parts,notes,last_mutation_id,version,created_at,updated_at,created_by,updated_by,deleted) SELECT ?,?,?,?,?,?,?,?,1,?,?,?,?,0 WHERE EXISTS(SELECT 1 FROM gardens WHERE id=? AND deleted=0)',discipline,id,gardenId,date,work,parts,notes,mutationId,now,now,m.user_id,m.user_id,gardenId);
        if(!result.meta.changes){const latest=await one(env.DB,'SELECT * FROM service_logs WHERE id=?',id);if(!mutationId||latest?.deleted||latest?.last_mutation_id!==mutationId||latest?.updated_by!==m.user_id)serviceConflict();}return json({service:serviceLog(await one(env.DB,serviceSelect+' WHERE service_logs.id=?',id))});
      }
    }
    const blowoutMatch=path.match(/^\/api\/gardens\/([-a-zA-Z0-9_]{1,100})\/blowout(?:\/photos\/([-a-zA-Z0-9_]{1,100}))?$/);
    if(blowoutMatch){const old=await one(env.DB,'SELECT * FROM gardens WHERE id=? AND deleted=0',blowoutMatch[1]);if(!old)fail(404,'Zahrada nebyla nalezena.');return await handleBlowout(request,env,ctx,m,old,blowoutMatch[2],{fail,json,checkWrite,boundedBytes,expectedVersion,validId,cleanText,execute,one,photoUploads:(await featureSettings(env)).features.photoUploads});}
    const gardenMatch=path.match(/^\/api\/gardens\/([-a-zA-Z0-9_]{1,100})(\/plan|\/plan-markers|\/delete-preview|\/geocode)?$/);
    if(gardenMatch){
      const id=gardenMatch[1],isPlan=gardenMatch[2]==='/plan',isPreview=gardenMatch[2]==='/delete-preview',old=await one(env.DB,'SELECT * FROM gardens WHERE id=? AND deleted=0',id);if(!old)fail(404,'Zahrada nebyla nalezena.');
      if(gardenMatch[2]==='/geocode'&&method==='POST')return await resolveGardenAddress(request,env,old);
      if(gardenMatch[2]==='/plan-markers'&&method==='PUT'){
        checkWrite(m);const b=await body(request,100000),version=expectedVersion(b.version),planVersion=validId(b.planVersion);
        if(!old.plan_key||!old.plan_type.startsWith('image/'))fail(400,'Šachty lze označovat v obrázkovém plánu (JPG, PNG nebo WebP).');
        if(old.version!==version||old.plan_version!==planVersion)fail(409,'Plán nebo zahradu mezitím změnil kolega. Vaše rozepsané značky zůstaly zachované.',{code:'plan_conflict'});
        if(!Array.isArray(b.markers)||b.markers.length>500)fail(400,'Plán může obsahovat nejvýše 500 šachet.');
        const markers=b.markers.map(p=>{const shaftId=validId(p?.shaftId);if(!Number.isFinite(p.x)||p.x<0||p.x>1||!Number.isFinite(p.y)||p.y<0||p.y>1)fail(400,'Neplatná poloha šachty v plánu.');return {shaftId,x:p.x,y:p.y};});
        if(new Set(markers.map(p=>p.shaftId)).size!==markers.length)fail(400,'Každá šachta může mít v plánu jen jednu značku.');
        const encoded=JSON.stringify(markers),invalid="EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN shafts s ON s.id=json_extract(j.value,'$.shaftId') WHERE s.id IS NULL OR s.deleted<>0 OR s.garden_id IS NOT ?)";
        if((await one(env.DB,`SELECT ${invalid} AS invalid`,encoded,id)).invalid)fail(400,'Některá šachta už nepatří do této zahrady. Obnovte přehled a značku odeberte.');
        const result=await execute(env.DB,`UPDATE gardens SET plan_markers=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND plan_version=? AND deleted=0 AND NOT ${invalid}`,encoded,Date.now(),m.user_id,id,version,planVersion,encoded,id);
        if(!result.meta.changes)fail(409,'Plán nebo jeho šachty mezitím změnil kolega. Vaše značky zůstaly zachované.',{code:'plan_conflict'});
        return json({garden:garden(await one(env.DB,'SELECT * FROM gardens WHERE id=?',id))});
      }
      if(isPreview&&method==='GET'){checkManage(m);return json({garden:garden(old),...await gardenDeletionPreview(env,id)});}
      if(!gardenMatch[2]&&method==='DELETE')return await deleteGarden(request,env,ctx,m,old);
      if(!gardenMatch[2]&&method==='PATCH'){
        checkWrite(m);const b=await body(request,10_000),version=expectedVersion(b.version),name=cleanText(b.name,100,true),address=cleanText(b.address,500),notes=cleanText(b.notes,2000),pumpType=Object.hasOwn(b,'pumpType')?cleanText(b.pumpType,160):(old.pump_type||'');
        const discipline=workspaceWriteDiscipline(m,b,null,fail);if(m._workspace&&discipline==='garden'&&Object.hasOwn(b,'pumpType')&&pumpType!==(old.pump_type||''))fail(403,'Údaje o čerpadle patří závlahám.');
        const sharedDescription=cleanText(b.sharedDescription??old.shared_description??'',2000),storedNotes=m._workspace&&discipline==='garden'?old.notes:notes;
        const primary=env.DB.prepare('UPDATE gardens SET name=?,address=?,notes=?,pump_type=?,shared_description=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND deleted=0').bind(name,address,storedNotes,pumpType,sharedDescription,Date.now(),m.user_id,id,version);
        const statements=[primary];if(m._workspace)statements.push(workspaceGardenNotesStatement(env,m,id,discipline,notes,'EXISTS(SELECT 1 FROM gardens WHERE id=? AND version=? AND updated_by=?)',id,version+1,m.user_id));
        const result=(await env.DB.batch(statements))[0];if(!result.meta.changes)gardenConflict();return json({garden:garden(await one(env.DB,'SELECT * FROM gardens WHERE id=?',id))});
      }
      if(isPlan&&method==='GET'){
        if(!old.plan_key)fail(404,'Zahrada zatím nemá plán.');const obj=await env.BUCKET.get(old.plan_key);if(!obj)fail(404,'Plán nebyl nalezen.');
        return new Response(obj.body,{headers:{'content-type':old.plan_type,'content-disposition':`${url.searchParams.has('download')?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(old.plan_name).replace(/'/g,'%27')}`,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'"}});
      }
      if(isPlan&&method==='PUT'){
        checkWrite(m);const bytes=await boundedBytes(request,21*1024*1024),form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')||''},body:bytes}).formData(),file=form.get('plan'),version=expectedVersion(Number(form.get('version')));
        if(old.version!==version)gardenConflict();if(!file||typeof file.arrayBuffer!=='function'||!file.size)fail(400,'Vyberte plán závlahy.');if(file.size>20*1024*1024)fail(413,'Plán může mít nejvýše 20 MB.');
        const buffer=await file.arrayBuffer(),head=new Uint8Array(buffer),ascii=new TextDecoder().decode(head.slice(0,12));let type,ext;
        if(ascii.startsWith('%PDF-')){type='application/pdf';ext='pdf';}
        else if(head[0]===255&&head[1]===216&&head[2]===255){type='image/jpeg';ext='jpg';}
        else if([137,80,78,71,13,10,26,10].every((v,i)=>head[i]===v)){type='image/png';ext='png';}
        else if(ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP'){type='image/webp';ext='webp';}
        else fail(400,'Plán nahrajte jako PDF, JPG, PNG nebo WebP.');
        const name=(file.name||`plan.${ext}`).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180)||`plan.${ext}`,planVersion=crypto.randomUUID(),key=`gardens/${id}/${planVersion}.${ext}`;
        if(type.startsWith('image/')&&!(await featureSettings(env)).features.photoUploads)fail(403,'Přidávání fotografií je vypnuté.',{code:'feature_disabled',feature:'photoUploads'});await env.BUCKET.put(key,buffer,{httpMetadata:{contentType:type}});let result;
        try{result=await execute(env.DB,`UPDATE gardens SET plan_key=?,plan_name=?,plan_type=?,plan_size=?,plan_version=?,plan_markers='[]',version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND deleted=0`,key,name,type,file.size,planVersion,Date.now(),m.user_id,id,version);}catch(error){await env.BUCKET.delete(key);throw error;}
        if(!result.meta.changes){await env.BUCKET.delete(key);gardenConflict();}if(old.plan_key)ctx.waitUntil(env.BUCKET.delete(old.plan_key));return json({garden:garden(await one(env.DB,'SELECT * FROM gardens WHERE id=?',id))});
      }
    }
    if(path==='/api/shafts'&&method==='GET'){return json({records:(await all(env.DB,"SELECT shafts.*, COALESCE(members.name,'Kolega') AS updater_name FROM shafts LEFT JOIN members ON members.user_id=shafts.updated_by WHERE shafts.garden_id IS NULL OR EXISTS(SELECT 1 FROM gardens g WHERE g.id=shafts.garden_id AND "+workspaceGardenScope()+") ORDER BY shafts.updated_at DESC LIMIT 2000",m.user_id)).map(record)});}
    const match=path.match(/^\/api\/shafts\/([-a-zA-Z0-9_]{1,100})(\/photo)?$/);
    if(match){
      const id=match[1],photo=!!match[2],old=await one(env.DB,'SELECT * FROM shafts WHERE id=?',id);
      if(photo&&method==='GET'){
        if(!old||old.deleted)fail(404,'Fotografie nebyla nalezena.');const obj=await env.BUCKET.get(old.image_key);if(!obj)fail(404,'Fotografie nebyla nalezena.');return new Response(obj.body,{headers:{'content-type':'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
      }
      if(!photo&&method==='PUT'){
        checkWrite(m);const length=Number(request.headers.get('content-length')||0);if(length>8*1024*1024)fail(413,'Fotografie je příliš velká.');const bytes=await boundedBytes(request,8*1024*1024);const form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')||''},body:bytes}).formData(),raw=form.get('record'),image=form.get('image');if(typeof raw!=='string'||raw.length>100_000)fail(400,'Neplatný záznam.');let b;try{b=JSON.parse(raw);}catch{fail(400,'Neplatný záznam.');}
        const version=expectedVersion(b.version);if(old?.deleted)fail(409,'Tuto šachtu už kolega smazal.',{code:'deleted'});if((old?.version||0)!==version)conflict();
        const name=cleanText(b.name,100,true),location=cleanText(b.location,160),notes=cleanText(b.notes,2000),markers=markerData(b.markers),now=Date.now();
        const gardenId=Object.hasOwn(b,'gardenId')?(b.gardenId===null?null:validId(b.gardenId)):(old?.garden_id||null);if(gardenId&&!await one(env.DB,'SELECT id FROM gardens WHERE id=? AND deleted=0',gardenId))fail(400,'Tato zahrada už není dostupná. Vyberte jinou nebo Nezařazené.',{code:'garden_missing'});
        const position=Object.hasOwn(b,'position')?validPosition(b.position):(old?.latitude==null||old?.longitude==null?null:{latitude:old.latitude,longitude:old.longitude,accuracy:old.accuracy});
        let imageKey=old?.image_key,imageVersion=old?.image_version,newKey;
        if(!old&&!(await featureSettings(env)).features.photoUploads)fail(403,'Přidávání fotografií je vypnuté.',{code:'feature_disabled',feature:'photoUploads'});
        if(image&&typeof image.arrayBuffer==='function'&&(!old||(await featureSettings(env)).features.photoUploads)){
          if(image.size>6*1024*1024)fail(413,'Fotografie je příliš velká.');const bytes=await image.arrayBuffer(),first=new Uint8Array(bytes);if(first[0]!==255||first[1]!==216||first[2]!==255)fail(400,'Fotografie musí být ve formátu JPEG.');imageVersion=crypto.randomUUID();newKey=imageKey=`shafts/${id}/${imageVersion}.jpg`;await env.BUCKET.put(imageKey,bytes,{httpMetadata:{contentType:'image/jpeg'}});
        }
        if(!imageKey&&!(await featureSettings(env)).features.photoUploads)fail(403,'Přidávání fotografií je vypnuté.',{code:'feature_disabled',feature:'photoUploads'});if(!imageKey)fail(400,'Přidejte fotografii šachty.');
        let result;
        try{if(!old)result=await execute(env.DB,'INSERT OR IGNORE INTO shafts(id,garden_id,name,location,notes,markers,image_key,image_version,latitude,longitude,accuracy,version,created_at,updated_at,created_by,updated_by,deleted) SELECT ?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,0 WHERE ? IS NULL OR EXISTS(SELECT 1 FROM gardens WHERE id=? AND deleted=0)',id,gardenId,name,location,notes,JSON.stringify(markers),imageKey,imageVersion,position?.latitude??null,position?.longitude??null,position?.accuracy??null,now,now,m.user_id,m.user_id,gardenId,gardenId);else result=await execute(env.DB,'UPDATE shafts SET garden_id=?,name=?,location=?,notes=?,markers=?,image_key=?,image_version=?,latitude=?,longitude=?,accuracy=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND deleted=0 AND (? IS NULL OR EXISTS(SELECT 1 FROM gardens WHERE id=? AND deleted=0))',gardenId,name,location,notes,JSON.stringify(markers),imageKey,imageVersion,position?.latitude??null,position?.longitude??null,position?.accuracy??null,now,m.user_id,id,version,gardenId,gardenId);}
        catch(error){if(newKey)await env.BUCKET.delete(newKey);throw error;}
        if(!result.meta.changes){if(newKey)await env.BUCKET.delete(newKey);conflict();}
        if(newKey&&old?.image_key)ctx.waitUntil(env.BUCKET.delete(old.image_key));const row=await one(env.DB,'SELECT * FROM shafts WHERE id=?',id);return json({record:record(row)});
      }
      if(!photo&&method==='DELETE'){
        if(!['owner','administrator','admin'].includes(m.role))fail(403,'Šachty může mazat pouze správce.');const b=await body(request,1000),version=expectedVersion(b.version);if(!old||old.deleted)fail(404,'Šachta nebyla nalezena.');const result=await execute(env.DB,'UPDATE shafts SET deleted=1,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND deleted=0',Date.now(),m.user_id,id,version);if(!result.meta.changes)conflict();ctx.waitUntil(env.BUCKET.delete(old.image_key));return json({ok:true});
      }
    }
    fail(404,'Požadavek nebyl nalezen.');
  }catch(error){if(new URL(request.url).pathname.startsWith('/api/auth/')||new URL(request.url).pathname.startsWith('/api/local-accounts')){if(String(error?.message).includes('UNIQUE constraint'))return json({error:'Účet nebo přihlašovací jméno se mezitím změnilo. Obnovte údaje.'},409);if(error?.status===503)return json({error:'Přihlašování je vytížené. Zkuste to za chvíli.'},503);}
 if(String(error?.message).includes('workspace_member_capacity'))return json({error:'Limit členů nebo pozvánek je v jednom z pracovních oborů vyčerpaný. Upravte příslušnost nebo licenci.',code:'workspace_member_capacity'},409);if(String(error?.message).includes('workspace_'))return json({error:'Změna neodpovídá aktuálnímu oboru nebo oprávnění. Obnovte údaje.',code:'workspace_conflict'},409);if(error instanceof HttpError)return json({error:error.message,...error.extra},error.status);console.error('Team API error',error?.name,error?.message);return json({error:'Týmové úložiště není dostupné. Zkuste to za chvíli.'},503);}
}
