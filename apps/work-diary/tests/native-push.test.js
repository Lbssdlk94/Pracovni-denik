import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {dispatchNotifications} from '../worker/notifications.js';
import {apnsConfiguration,apnsDeviceToken,apnsProviderToken,apnsPayload,sendAPNs} from '../worker/apns.js';
import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,path,actor=people.worker,method='GET',body)=>api(request(path,actor,method,body),env,ctx);
async function setup(){const env=environment();await call(env,'/api/me',people.owner);for(const role of ['worker','reader']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}return env;}
async function keys(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {pair,config:{APNS_TEAM_ID:'TEAM123456',APNS_KEY_ID:'KEY1234567',APNS_BUNDLE_ID:'cz.pracovnidenik.app',APNS_PRIVATE_KEY:'-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----'}};}
const device={token:'ab'.repeat(32),environment:'development',bundleId:'cz.pracovnidenik.app'};
const register=async(env,actor=people.worker)=>{const r=await call(env,'/api/notifications/native',actor,'POST',device);assert.equal(r.status,200,await r.clone().text());return r.json();};
const addJob=(env,id='native-a',who=people.worker.id)=>env.sqlite.prepare("INSERT INTO jobs(id,title,description,address,assigned_to,assigned_name,due_date,status,created_at,updated_at,created_by,updated_by) VALUES(?, 'PRIVATE CUSTOMER','PRIVATE WORK','PRIVATE ADDRESS',?,'','','planned',?,?,'owner-id','owner-id')").run(id,who,Date.now()+1,Date.now()+1);
test('APNs signs independently verifiable ES256 JWTs, caches them, validates token lengths and sends only generic data',async()=>{
 const {pair,config}=await keys(),now=Date.now(),parallel=await Promise.all(Array.from({length:8},()=>apnsProviderToken(config,now))),jwt=parallel[0],parts=jwt.split('.');assert.ok(parallel.every(value=>value===jwt),'Concurrent deliveries must share a provider JWT instead of triggering Apple token-rotation limits');
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts.slice(0,2).join('.'))),true);
 assert.deepEqual(JSON.parse(Buffer.from(parts[0],'base64url')),{alg:'ES256',kid:config.APNS_KEY_ID});assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).iss,config.APNS_TEAM_ID);
 assert.equal(await apnsProviderToken(config,now+60000),jwt);assert.notEqual(await apnsProviderToken(config,now+41*60000),jwt);
 assert.equal(apnsDeviceToken('AB'.repeat(40)),'ab'.repeat(40));for(const t of ['bad', 'a'.repeat(63),'https://evil.test','ab'.repeat(257)])assert.throws(()=>apnsDeviceToken(t));
 assert.deepEqual(Object.keys(apnsPayload()).sort(),['aps','workDiaryInbox']);assert.ok(!JSON.stringify(apnsPayload()).match(/userId|customer|address|jobId|url|GPS/));assert.equal(apnsConfiguration({}).configured,false);
});
test('Native registrations are authenticated, idempotent, private and cannot set another user or another app',async()=>{
 const env=await setup(),{config}=await keys();Object.assign(env,config);
 assert.equal((await call(env,'/api/notifications/native/config',null)).status,401);assert.equal((await call(env,'/api/notifications/native/config',people.outsider)).status,403);
 assert.equal((await call(env,'/api/notifications/native',people.worker,'POST',{...device,userId:people.owner.id})).status,400);
 assert.equal((await call(env,'/api/notifications/native',people.worker,'POST',{...device,bundleId:'other.app'})).status,400);
 const first=await register(env),again=await register(env);assert.equal(first.deviceId,again.deviceId);assert.equal(env.sqlite.prepare("SELECT count(*) n FROM push_subscriptions").get().n,1);
 const own=await(await call(env,'/api/notifications/native?deviceId='+first.deviceId)).json();assert.equal(own.registered,true);assert.ok(!JSON.stringify(own).includes(device.token));
 assert.equal((await(await call(env,'/api/notifications/native?deviceId='+first.deviceId,people.reader)).json()).registered,false);
 await call(env,'/api/notifications/native',people.reader,'DELETE',{deviceId:first.deviceId});assert.equal(env.sqlite.prepare('SELECT count(*) n FROM push_subscriptions').get().n,1);
});
test('APNs uses the existing atomic queue, concurrent claims and preferences without requiring Web Push keys',async()=>{
 const env=await setup(),{config}=await keys(),original=globalThis.fetch,sent=[];Object.assign(env,config);
 try{
  globalThis.fetch=async(url,options)=>{sent.push({url,options});return new Response(null,{status:200});};
  const d=await register(env);addJob(env);await Promise.all([dispatchNotifications(env),dispatchNotifications(env)]);await dispatchNotifications(env);assert.equal(sent.length,1);
  assert.ok(sent[0].url.startsWith('https://api.sandbox.push.apple.com/3/device/'));assert.equal(sent[0].options.headers['apns-push-type'],'alert');assert.equal(sent[0].options.headers['apns-topic'],config.APNS_BUNDLE_ID);assert.equal(sent[0].options.redirect,'manual');assert.equal(sent[0].options.body,JSON.stringify(apnsPayload()));
  assert.equal(env.sqlite.prepare('SELECT state FROM push_deliveries').get().state,'sent');
  await call(env,'/api/notifications/preferences',people.worker,'PUT',{jobs:false,attendance:true});assert.equal((await(await call(env,'/api/notifications/native/config')).json()).preferences.jobs,false);addJob(env,'b');await dispatchNotifications(env);assert.equal(sent.length,1);
  await call(env,'/api/notifications/native',people.worker,'DELETE',{deviceId:d.deviceId});assert.equal(env.sqlite.prepare('SELECT count(*) n FROM push_subscriptions').get().n,0);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM push_deliveries').get().n,0);
 }finally{globalThis.fetch=original;}
});
test('Rebinding a shared phone clears the old queue and timestamp; deleted/reassigned resources never push',async()=>{
 const env=await setup(),{config}=await keys(),original=globalThis.fetch;Object.assign(env,config);let sent=0;
 try{
  globalThis.fetch=async()=>{sent++;return new Response(null,{status:200});};const d=await register(env);addJob(env);
  env.sqlite.prepare("UPDATE jobs SET assigned_to='reader-id',assigned_users='[]'").run();await dispatchNotifications(env);assert.equal(sent,0);
  await register(env,people.reader);assert.equal(env.sqlite.prepare('SELECT user_id FROM push_subscriptions WHERE id=?').get(d.deviceId).user_id,people.reader.id);
  assert.equal(env.sqlite.prepare('SELECT count(*) n FROM push_deliveries').get().n,0);
  env.sqlite.prepare('DELETE FROM notifications').run();addJob(env,'after-rebind',people.reader.id);env.sqlite.prepare("UPDATE jobs SET deleted=1 WHERE id='after-rebind'").run();await dispatchNotifications(env);assert.equal(sent,0);
 }finally{globalThis.fetch=original;}
});
test('Temporary APNs errors retry; invalid device tokens are removed; redirects never follow',async()=>{
 const env=await setup(),{config}=await keys(),original=globalThis.fetch;Object.assign(env,config);let calls=0,status=503,reason='ServiceUnavailable';
 try{
  globalThis.fetch=async()=>{calls++;return status===302?Response.redirect('https://unapproved.test',302):Response.json({reason},{status});};await register(env);addJob(env);await dispatchNotifications(env);
  let row=env.sqlite.prepare('SELECT * FROM push_deliveries').get();assert.equal(row.state,'pending');assert.equal(row.attempts,1);assert.equal(row.last_error,'503:ServiceUnavailable');
  env.sqlite.prepare('UPDATE push_deliveries SET next_attempt_at=0').run();status=302;await dispatchNotifications(env);assert.equal(calls,2);
  env.sqlite.prepare('UPDATE push_deliveries SET next_attempt_at=0').run();status=410;reason='Unregistered';await dispatchNotifications(env);assert.equal(calls,3);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM push_subscriptions').get().n,0);
 }finally{globalThis.fetch=original;}
});
test('Unconfigured server never claims success and disabling notifications still allows device logout',async()=>{
 const env=await setup();let c=await(await call(env,'/api/notifications/native/config')).json();assert.equal(c.configured,false);assert.ok(c.missing.includes('APNS_PRIVATE_KEY'));assert.equal((await call(env,'/api/notifications/native',people.worker,'POST',device)).status,503);
 Object.assign(env,(await keys()).config);const d=await register(env);env.sqlite.prepare("INSERT INTO settings(key,value,version) VALUES('features',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({notifications:false}));
 assert.equal((await call(env,'/api/notifications/native',people.worker,'POST',device)).status,403);assert.equal((await call(env,'/api/notifications/native',people.worker,'DELETE',{deviceId:d.deviceId})).status,200);
});
