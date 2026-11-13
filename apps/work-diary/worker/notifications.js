import {apnsConfiguration,apnsDeviceToken,sendAPNs} from './apns.js';
import {workspacePreferenceKey} from './workspace-context.js';
import {workspaceDisciplineSql} from './workspace-policy.js';
import {normalizeFeatures,featureEnabled} from '../web/features.js';
import {tenantPolicy,tenantFeaturePolicy} from './tenant-platform.js';
import {pushBytes,pushEndpoint,sendWebPush,pushDiagnostic} from './web-push.js';
// Recheck access on every inbox read, mark-read and delivery, including assignment/role changes.
const notificationAccess=`EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=n.user_id AND (
 (n.kind IN ('job_assigned','job_reminder','job_handoff') AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=n.resource_id AND ${workspaceDisciplineSql('j.discipline','actor','jobs')} AND j.deleted=0 AND j.service_approval='confirmed' AND (n.kind<>'job_reminder' OR (j.job_type='installation' AND j.status<>'done' AND n.event_key='service-reminder:'||j.id||':'||j.due_date||':'||n.user_id)) AND ((j.assigned_to=actor.user_id OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) selected WHERE selected.value=actor.user_id)) OR actor.role IN ('owner','administrator','admin')))) OR
 (n.kind IN ('job_status','job_material') AND actor.role IN ('owner','administrator','admin') AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=n.resource_id AND ${workspaceDisciplineSql('j.discipline','actor','jobs')} AND j.deleted=0)) OR
 (n.kind='attendance_request' AND actor.role IN ('owner','administrator','admin') AND EXISTS(SELECT 1 FROM attendance_corrections c WHERE c.id=n.resource_id)) OR
 (n.kind='vehicle_deadline' AND EXISTS(SELECT 1 FROM vehicles v WHERE v.id=n.resource_id AND v.archived_at IS NULL AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM vehicle_drivers d WHERE d.user_id=actor.user_id AND d.enabled=1 AND d.vehicle_id=v.id)))) OR
 (n.kind='attendance_review' AND EXISTS(SELECT 1 FROM attendance_corrections c WHERE c.id=n.resource_id AND c.user_id=actor.user_id))))`;
const notificationLegacyFeatureGate=`(n.kind<>'job_handoff' OR COALESCE((SELECT json_extract(value,'$.jobHandoffs') FROM settings WHERE key='features'),1)=1) AND (n.kind<>'job_reminder' OR COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='material-reminders'),1)=1) AND (n.kind<>'job_material' OR COALESCE((SELECT json_extract(value,'$.subscriptions') FROM settings WHERE key='features'),1)=1) AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1 AND ((n.kind LIKE 'job_%' AND COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1) OR (n.kind LIKE 'attendance_%' AND COALESCE((SELECT json_extract(value,'$.attendance') FROM settings WHERE key='features'),1)=1) OR n.kind='vehicle_deadline')`;
const notificationBaseFeatureGate=`(CASE WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND n.kind LIKE 'job_%' THEN EXISTS(SELECT 1 FROM jobs j JOIN workspace_organizations o ON o.discipline=j.discipline JOIN workspace_organization_policies wp ON wp.organization_id=o.id WHERE j.id=n.resource_id AND wp.active=1 AND wp.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(wp.features,'$.jobs')=1 AND json_extract(wp.features,'$.notifications')=1 AND (n.kind<>'job_handoff' OR json_extract(wp.features,'$.jobHandoffs')=1) AND (n.kind<>'job_material' OR json_extract(wp.features,'$.subscriptions')=1) AND (n.kind<>'job_reminder' OR COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key=CASE WHEN o.installation_id=(SELECT instance_id FROM installation_state WHERE singleton='primary') THEN 'material-reminders' ELSE 'workspace:'||o.id||':material-reminders' END),1)=1)) ELSE (${notificationLegacyFeatureGate}) END)`;
const notificationPreferenceGate="((n.kind LIKE 'job_%' AND COALESCE(p.jobs,1)=1) OR (n.kind LIKE 'attendance_%' AND COALESCE(p.attendance,1)=1) OR (n.kind='vehicle_deadline' AND COALESCE(p.jobs,1)=1))";
const notificationGate=features=>notificationBaseFeatureGate+(!featureEnabled('fleetAlerts',features)?" AND n.kind<>'vehicle_deadline'":(!featureEnabled('fleetStk',features)?" AND NOT(n.kind='vehicle_deadline' AND n.title LIKE 'STK · %')":'')+(!featureEnabled('fleetVignette',features)?" AND NOT(n.kind='vehicle_deadline' AND n.title LIKE 'Dálniční známka · %')":''));
const pushKeys=env=>env.WEB_PUSH_PUBLIC_KEY&&env.WEB_PUSH_PRIVATE_KEY&&/^https:\/\//.test(env.PUBLIC_APP_URL||'')?{publicKey:env.WEB_PUSH_PUBLIC_KEY,privateKey:env.WEB_PUSH_PRIVATE_KEY,subject:env.PUBLIC_APP_URL}:null;
const notificationRows=(db,sql,...args)=>db.prepare(sql).bind(...args).all().then(r=>r.results);
const notificationRun=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
export async function dispatchNotifications(env){if(env.PLATFORM_CONTROL_URL){const policy=await tenantPolicy(env);if(!policy.active||!policy.modules.notifications)return {sent:0,skipped:'license'};}
 const flags=(await tenantFeaturePolicy(env,normalizeFeatures(JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(workspacePreferenceKey(env,'features')).first())?.value||'{}')))).features,notificationFeatureGate=notificationGate(flags);
 const keys=pushKeys(env),native=apnsConfiguration(env);if(!keys&&!native.configured)return;const transports=[...(keys?["'web'"]:[]),...(native.configured?["'apns'"]:[])].join(',');const transportGate="s.transport IN ("+transports+") AND (s.transport<>'apns' OR s.native_topic=?)";
 const now=Date.now(),db=env.DB;
 await notificationRun(db,`INSERT OR IGNORE INTO push_deliveries(id,notification_id,subscription_id) SELECT n.id||':'||s.id,n.id,s.id FROM notifications n JOIN push_subscriptions s ON s.user_id=n.user_id LEFT JOIN notification_preferences p ON p.user_id=n.user_id WHERE ${transportGate} AND NOT EXISTS(SELECT 1 FROM push_deliveries old WHERE old.id=n.id||':'||s.id) AND n.read_at IS NULL AND n.created_at>=s.created_at AND n.created_at>? AND ${notificationAccess} AND ${notificationFeatureGate} AND ${notificationPreferenceGate} ORDER BY n.created_at DESC LIMIT 100`,env.APNS_BUNDLE_ID||'',now-86400000);
 const rows=await notificationRows(db,`SELECT d.id AS delivery_id,d.attempts,s.id AS subscription_id,s.endpoint,s.p256dh,s.auth,s.transport,s.native_token,s.native_environment,s.native_topic,n.id AS notification_id FROM push_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN push_subscriptions s ON s.id=d.subscription_id AND s.user_id=n.user_id LEFT JOIN notification_preferences p ON p.user_id=n.user_id WHERE ${transportGate} AND d.state='pending' AND d.attempts<5 AND d.next_attempt_at<=? AND d.lease_until<? AND n.read_at IS NULL AND n.created_at>? AND ${notificationAccess} AND ${notificationFeatureGate} AND ${notificationPreferenceGate} ORDER BY n.created_at LIMIT 24`,env.APNS_BUNDLE_ID||'',now,now,now-86400000);
 const started=Date.now();
 for(let offset=0;offset<rows.length&&Date.now()-started<20000;offset+=4){await Promise.all(rows.slice(offset,offset+4).map(async row=>{
  const token=crypto.randomUUID(),id=row.subscription_id,deliveryId=row.delivery_id;
  const claim=await notificationRun(db,"UPDATE push_deliveries SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND state='pending' AND lease_until<? AND next_attempt_at<=? AND attempts<5",token,Date.now()+30000,deliveryId,Date.now(),Date.now());if(!claim.meta.changes)return;
  let status=0,reason='',expired=false;
  try{
   // No private names, job IDs, attendance details or GPS on the lock screen.
   const response=row.transport==='apns'?await sendAPNs(row,env):await sendWebPush(row,keys,{title:'Závlahový deník',body:'Máte nové upozornění. Otevřete aplikaci.',tag:'zavlahy-inbox',url:'/?notifications=1'});status=response.status;reason=response.reason||'';expired=!!response.expired;
  }catch(error){if(row.transport==='apns'){reason='TransportError';}else{const info=pushDiagnostic(error);status=info.status||0;}}
  if(expired||status===404||status===410){await notificationRun(db,'DELETE FROM push_subscriptions WHERE id=?',id);return;}
  await notificationRun(db,"UPDATE push_deliveries SET state=?,next_attempt_at=?,last_error=?,lease_until=0,lease_token=NULL WHERE id=? AND lease_token=?",status>=200&&status<300?'sent':'pending',Date.now()+Math.min(3600000,30000*2**row.attempts),status>=200&&status<300?'':String(status)+':'+reason,deliveryId,token);
 }));}
}
export async function handleNotifications(request,env,m,h){
 const notificationFeatureGate=notificationGate(h.features||normalizeFeatures({vehicles:false}));
 const {body,fail,json,one,all,execute}=h,url=new URL(request.url),path=url.pathname,method=request.method;
 if(path.startsWith('/api/notifications/native'))return handleNativeNotifications(request,env,m,h);
 const preferences=async()=>{const p=await one(env.DB,'SELECT jobs,attendance FROM notification_preferences WHERE user_id=?',m.user_id);return {jobs:p?.jobs!==0,attendance:p?.attendance!==0};};
 if(path==='/api/notifications'&&method==='GET'){
  const cursor=url.searchParams.get('before');if(cursor&&(!/^\d{1,16}:[a-f0-9]{32}$/.test(cursor)||!Number.isSafeInteger(Number(cursor.split(':')[0]))))fail(400,'Neplatná stránka upozornění.');
  const filter=cursor?' AND (n.created_at<? OR (n.created_at=? AND n.id<?))':'',args=cursor?[Number(cursor.split(':')[0]),Number(cursor.split(':')[0]),cursor.split(':')[1]]:[];
  const rows=await all(env.DB,`SELECT n.* FROM notifications n WHERE n.user_id=? AND ${notificationAccess} AND ${notificationFeatureGate}${filter} ORDER BY n.created_at DESC,n.id DESC LIMIT 51`,m.user_id,...args),list=rows.slice(0,50),last=list.at(-1);
  const count=await one(env.DB,`SELECT COUNT(*) AS count FROM notifications n WHERE n.user_id=? AND n.read_at IS NULL AND ${notificationAccess} AND ${notificationFeatureGate}`,m.user_id);
  return json({notifications:list.map(r=>({id:r.id,kind:r.kind,resourceId:r.resource_id,title:r.title,body:r.body,createdAt:r.created_at,readAt:r.read_at})),unread:count.count,nextCursor:rows.length>50?last.created_at+':'+last.id:null});
 }
 if(path==='/api/notifications/read'&&method==='POST'){
  const b=await body(request,4000);if(b.all!==true&&(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>50||b.ids.some(id=>typeof id!=='string'||!/^([a-f0-9]{32})$/.test(id))))fail(400,'Vyberte upozornění.');
  await execute(env.DB,`UPDATE notifications AS n SET read_at=? WHERE n.user_id=? AND n.read_at IS NULL AND ${notificationAccess} AND ${notificationFeatureGate}`+(b.all===true?'':` AND n.id IN (${b.ids.map(()=>'?').join(',')})`),Date.now(),m.user_id,...(b.all===true?[]:b.ids));return json({ok:true});
 }
 if(path==='/api/notifications/preferences'&&method==='GET')return json({preferences:await preferences(),publicKey:pushKeys(env)?.publicKey||null});
 if(path==='/api/notifications/preferences'&&method==='PUT'){
  const b=await body(request,1000);if(typeof b.jobs!=='boolean'||typeof b.attendance!=='boolean'||Object.keys(b).some(k=>!['jobs','attendance'].includes(k)))fail(400,'Zkontrolujte nastavení upozornění.');
  await execute(env.DB,'INSERT INTO notification_preferences(user_id,jobs,attendance) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET jobs=excluded.jobs,attendance=excluded.attendance',m.user_id,+b.jobs,+b.attendance);return json({preferences:await preferences()});
 }
 if(path==='/api/notifications/test'&&method==='POST'){
  const keys=pushKeys(env);if(!keys)fail(503,'Push oznámení nejsou nastavena.');const b=await body(request,3000);if(typeof b.endpoint!=='string')fail(400,'Nejdříve zapněte oznámení.');
  const sub=await one(env.DB,"SELECT * FROM push_subscriptions WHERE transport='web' AND endpoint=? AND user_id=?",b.endpoint,m.user_id);if(!sub)fail(404,'Zapněte oznámení v tomto zařízení.');
  const now=Date.now(),rate=await execute(env.DB,"INSERT INTO settings(key,value,version) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<?",'push-test:'+m.user_id,String(now),now-30000);if(!rate.meta.changes)fail(429,'Další zkoušku odešlete za půl minuty.');
  try{await sendWebPush(sub,keys,{title:'Závlahový deník',body:'Zkušební oznámení funguje.',tag:'zavlahy-test',url:'/?notifications=1'});}catch(error){const info=pushDiagnostic(error);if(info.status===404||info.status===410){await execute(env.DB,'DELETE FROM push_subscriptions WHERE id=?',sub.id);fail(503,'Přihlášení k oznámením vypršelo. Vypněte a znovu zapněte oznámení.',{code:'PUSH_EXPIRED'});}const hint=info.code==='PUSH_CRYPTO'?'Server nedokázal připravit oznámení.':info.code==='PUSH_NETWORK'?'Server se nemohl spojit se službou oznámení.':'Služba oznámení zprávu odmítla.';fail(503,hint+' Kód: '+info.code+(info.status?' / '+info.status:'')+(info.reason?' / '+info.reason:'')+'.',{code:info.code});}return json({ok:true});
 }
 if(path==='/api/notifications/subscription'&&method==='POST'){
  if(!pushKeys(env))fail(503,'Push oznámení zatím nejsou na serveru nastavena.');const b=await body(request,5000);let endpoint,dh,auth;
  try{endpoint=pushEndpoint(b.endpoint);dh=pushBytes(b.keys?.p256dh);auth=pushBytes(b.keys?.auth);if(dh.length!==65||dh[0]!==4||auth.length!==16)throw new Error();await crypto.subtle.importKey('raw',dh,{name:'ECDH',namedCurve:'P-256'},false,[]);}catch{fail(400,'Telefon neposlal platné přihlášení k oznámením.');}
  const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))),v=>v.toString(16).padStart(2,'0')).join(''),now=Date.now();
  // Endpoint is an unguessable capability; a shared browser can explicitly move it to its new signed-in user.
  await execute(env.DB,'INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,created_at=CASE WHEN push_subscriptions.user_id<>excluded.user_id THEN excluded.created_at ELSE push_subscriptions.created_at END,updated_at=excluded.updated_at',id,m.user_id,endpoint,b.keys.p256dh,b.keys.auth,now,now);return json({ok:true});
 }
 if(path==='/api/notifications/subscription'&&['GET','DELETE'].includes(method)){
  const endpoint=url.searchParams.get('endpoint');if(!endpoint||endpoint.length>2048)fail(400,'Chybí přihlášení zařízení.');
  if(method==='GET'){const s=await one(env.DB,"SELECT id FROM push_subscriptions WHERE transport='web' AND endpoint=? AND user_id=?",endpoint,m.user_id);return json({subscribed:!!s});}
  await execute(env.DB,"DELETE FROM push_subscriptions WHERE transport='web' AND endpoint=? AND user_id=?",endpoint,m.user_id);return json({ok:true});
 }
 fail(404,'Upozornění nebylo nalezeno.');
}

// Native device registrations share the existing inbox, leases, preferences and
// delivery queue. They never create a second stream of business notifications.
async function handleNativeNotifications(request,env,m,h){
 const {body,fail,json,one,execute}=h,path=new URL(request.url).pathname,method=request.method,config=apnsConfiguration(env);
 if(path==='/api/notifications/native/config'&&method==='GET'){const p=await one(env.DB,'SELECT jobs,attendance FROM notification_preferences WHERE user_id=?',m.user_id);return json({...config,enabled:h.features?.notifications!==false,preferences:{jobs:p?.jobs!==0,attendance:p?.attendance!==0}});}
 const idValue=value=>{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail(400,'Neplatné přihlášení telefonu.');return value;};
 if(path==='/api/notifications/native'&&method==='GET'){
  const id=idValue(new URL(request.url).searchParams.get('deviceId')),device=await one(env.DB,"SELECT id,updated_at FROM push_subscriptions WHERE id=? AND user_id=? AND transport='apns'",id,m.user_id);
  const last=device?await one(env.DB,'SELECT state,attempts,last_error FROM push_deliveries WHERE subscription_id=? ORDER BY rowid DESC LIMIT 1',id):null;
  return json({registered:!!device,deviceId:device?.id||null,lastDelivery:last?{state:last.state,attempts:last.attempts,error:last.last_error}:null});
 }
 if(path==='/api/notifications/native'&&method==='DELETE'){
  const b=await body(request,500),id=idValue(b.deviceId);await execute(env.DB,"DELETE FROM push_subscriptions WHERE id=? AND user_id=? AND transport='apns'",id,m.user_id);return json({ok:true});
 }
 if(!config.configured)fail(503,'Nativní push čeká na nastavení Apple Developer klíče na serveru.',{code:config.code});
 if(path==='/api/notifications/native'&&method==='POST'){
  const b=await body(request,2000);if(Object.keys(b).some(k=>!['token','environment','bundleId'].includes(k))||!['development','production'].includes(b.environment)||b.bundleId!==config.topic)fail(400,'Podepsaná aplikace neodpovídá nastavení push na serveru.');
  let token;try{token=apnsDeviceToken(b.token);}catch{fail(400,'Telefon neposlal platný APNs token.');}
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('apns|'+config.topic+'|'+b.environment+'|'+token)),id=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''),now=Date.now();
  await env.DB.batch([
   env.DB.prepare('DELETE FROM push_deliveries WHERE subscription_id=? AND EXISTS(SELECT 1 FROM push_subscriptions WHERE id=? AND user_id<>?)').bind(id,id,m.user_id),
   env.DB.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at,updated_at,transport,native_token,native_environment,native_topic) VALUES(?,?,?,'','',?,?,'apns',?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,created_at=CASE WHEN push_subscriptions.user_id<>excluded.user_id THEN excluded.created_at ELSE push_subscriptions.created_at END,updated_at=excluded.updated_at,native_token=excluded.native_token,native_environment=excluded.native_environment,native_topic=excluded.native_topic").bind(id,m.user_id,'apns:'+id,now,now,token,b.environment,config.topic)
  ]);return json({registered:true,deviceId:id});
 }
 if(path==='/api/notifications/native/test'&&method==='POST'){
  const b=await body(request,500),id=idValue(b.deviceId),device=await one(env.DB,"SELECT * FROM push_subscriptions WHERE id=? AND user_id=? AND transport='apns'",id,m.user_id);if(!device)fail(404,'Nejdříve zapněte oznámení v tomto telefonu.');
  const now=Date.now(),rate=await execute(env.DB,"INSERT INTO settings(key,value,version) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<?",'native-push-test:'+m.user_id,String(now),now-30000);if(!rate.meta.changes)fail(429,'Další zkoušku odešlete za půl minuty.');
  let result;try{result=await sendAPNs(device,env,{test:true});}catch{fail(503,'Server se nespojil s APNs. Ověřte Apple klíč a spojení.',{code:'apns_transport_failed'});}
  if(result.expired)await execute(env.DB,'DELETE FROM push_subscriptions WHERE id=? AND user_id=?',id,m.user_id);
  if(result.status!==200)fail(503,'APNs zprávu odmítlo: '+result.status+(result.reason?' / '+result.reason:''),{code:'apns_provider_rejected'});
  return json({accepted:true,message:'APNs zprávu přijalo. Doručení do telefonu zatím není potvrzené.'});
 }
 fail(404,'Nativní upozornění nebylo nalezeno.');
}
