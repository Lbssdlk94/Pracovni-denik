import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {dispatchNotifications} from '../worker/notifications.js';import {pushPacket,pushBytes,pushBase64,pushEndpoint} from '../worker/web-push.js';import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,path,person=people.owner,method='GET',data)=>api(request(path,person,method,data),env,ctx);
const job=(extra={})=>({version:0,title:'Novák – tajná adresa',description:'Montáž',address:'Ulice 12',gardenId:null,assignedTo:people.worker.id,dueDate:'2026-10-20',status:'planned',...extra});
async function setup(){const env=environment();await call(env,'/api/me');for(const role of ['worker','reader','admin']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}return env;}
const inbox=async(env,p=people.worker)=>(await(await call(env,'/api/notifications',p)).json());
async function credentials(){const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',keys.privateKey),publicKey=pushBase64(await crypto.subtle.exportKey('raw',keys.publicKey));return {keys,env:{WEB_PUSH_PUBLIC_KEY:publicKey,WEB_PUSH_PRIVATE_KEY:jwk.d,PUBLIC_APP_URL:'https://zavlahy.test'}};}
async function device(){const keys=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {keys,value:{endpoint:'https://web.push.apple.com/Qtest-'+crypto.randomUUID(),keys:{p256dh:pushBase64(await crypto.subtle.exportKey('raw',keys.publicKey)),auth:pushBase64(crypto.getRandomValues(new Uint8Array(16)))}}};}
test('Atomic job notifications are private, deduplicated, read per user, and recheck current permissions',async()=>{
 const env=await setup();assert.equal((await call(env,'/api/jobs/a',people.owner,'PUT',job())).status,200);let data=await inbox(env);assert.equal(data.unread,1);assert.equal(data.notifications[0].kind,'job_assigned');assert.equal((await inbox(env,people.reader)).unread,0);assert.equal((await inbox(env,people.owner)).unread,0);
 assert.equal((await call(env,'/api/jobs/a',people.owner,'PUT',job())).status,409);assert.equal((await inbox(env)).unread,1);
 const id=data.notifications[0].id;await call(env,'/api/notifications/read',people.reader,'POST',{ids:[id]});assert.equal((await inbox(env)).unread,1);await call(env,'/api/notifications/read',people.worker,'POST',{ids:[id]});assert.equal((await inbox(env)).unread,0);
 await call(env,'/api/jobs/a/status',people.worker,'PATCH',{version:1,status:'incomplete',incompleteReason:'Chybí díl'});assert.equal((await inbox(env,people.admin)).unread,1);assert.equal((await inbox(env,people.owner)).notifications[0].kind,'job_status');
 await call(env,'/api/jobs/a',people.owner,'PUT',job({version:2,assignedTo:people.reader.id}));assert.equal((await inbox(env)).notifications.length,0);assert.equal((await inbox(env,people.reader)).unread,1);
 env.sqlite.exec("UPDATE members SET role='worker' WHERE user_id='admin-id'");assert.equal((await inbox(env,people.admin)).notifications.length,0);
 await call(env,'/api/jobs/a',people.owner,'DELETE',{version:3});assert.equal((await inbox(env,people.reader)).notifications.length,0);
 assert.equal((await call(env,'/api/notifications',null)).status,401);assert.equal((await call(env,'/api/notifications',people.outsider)).status,403);
 assert.equal((await call(env,'/api/notifications?before=bad')).status,400);
});
test('Attendance requests and both review decisions notify the correct people without GPS',async()=>{
 const env=await setup(),now=Date.now(),base={shiftId:'manual',version:0,startAt:now-3600000,endAt:now-1800000,reason:'Zapomenutý příchod'};
 assert.equal((await call(env,'/api/attendance/corrections',people.worker,'POST',{...base,id:'edit'})).status,200);assert.equal((await call(env,'/api/attendance/corrections',people.worker,'POST',{...base,id:'edit'})).status,200);
 assert.equal((await inbox(env,people.owner)).unread,1);assert.equal((await inbox(env,people.admin)).unread,1);assert.equal((await inbox(env)).unread,0);
 assert.equal((await call(env,'/api/attendance/corrections/edit/review',people.admin,'POST',{decision:'approve'})).status,200);assert.equal((await inbox(env)).notifications[0].title,'Docházka: žádost schválena');
 const before=(await inbox(env)).unread;assert.equal((await call(env,'/api/attendance/corrections/edit/review',people.admin,'POST',{decision:'approve'})).status,409);assert.equal((await inbox(env)).unread,before);
 await call(env,'/api/attendance/corrections',people.worker,'POST',{id:'del',kind:'delete',shiftId:'manual',version:1,reason:'Duplicitní záznam'});await call(env,'/api/attendance/corrections/del/review',people.owner,'POST',{decision:'reject'});
 const data=await inbox(env);assert.equal(data.notifications.length,2);assert.ok(data.notifications.some(n=>n.title.includes('zamítnuta')));assert.ok(!JSON.stringify(data).match(/position|latitude|longitude|GPS/));assert.equal((await inbox(env,people.reader)).notifications.length,0);
});
test('Feature controls and per-user preferences work; disabling a module hides its notifications',async()=>{
 const env=await setup();await call(env,'/api/jobs/a',people.owner,'PUT',job());await call(env,'/api/notifications/preferences',people.worker,'PUT',{jobs:false,attendance:true});const prefs=await(await call(env,'/api/notifications/preferences',people.worker)).json();assert.deepEqual(prefs.preferences,{jobs:false,attendance:true});assert.equal((await inbox(env)).unread,1);
 let f=await(await call(env,'/api/features')).json();await call(env,'/api/features',people.owner,'PUT',{features:{...f.features,jobs:false},version:f.featuresVersion});assert.equal((await inbox(env)).unread,0);
 f=await(await call(env,'/api/features')).json();await call(env,'/api/features',people.owner,'PUT',{features:{...f.features,notifications:false,jobs:true},version:f.featuresVersion});assert.equal((await call(env,'/api/notifications',people.worker)).status,403);await call(env,'/api/jobs/b',people.owner,'PUT',job());assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM notifications').get().n,1);
 assert.equal((await call(env,'/api/notifications/subscription',people.worker,'POST',{})).status,403);
});
test('RFC 8291 packet independently decrypts and RFC 8292 JWT verifies',async()=>{
 const {keys,env}=await credentials(),d=await device(),payload={title:'Závlahy',body:'Pouze obecná zpráva'},packet=await pushPacket({endpoint:d.value.endpoint,...d.value.keys},{publicKey:env.WEB_PUSH_PUBLIC_KEY,privateKey:env.WEB_PUSH_PRIVATE_KEY,subject:env.PUBLIC_APP_URL},payload);
 assert.equal(new Headers(packet.headers).has('topic'),false,'Apple must not receive the rejected optional Topic header');
 const bytes=packet.body,salt=bytes.slice(0,16),record=new DataView(bytes.buffer,bytes.byteOffset+16,4).getUint32(0),server=bytes.slice(21,86);assert.equal(record,4096);assert.equal(bytes[20],65);
 const peer=await crypto.subtle.importKey('raw',server,{name:'ECDH',namedCurve:'P-256'},false,[]),secret=await crypto.subtle.deriveBits({name:'ECDH',public:peer},d.keys.privateKey,256),enc=new TextEncoder();
 const hkdf=async(input,salt,info,n)=>crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},await crypto.subtle.importKey('raw',input,'HKDF',false,['deriveBits']),n*8);
 const info=new Uint8Array([...enc.encode('WebPush: info\0'),...pushBytes(d.value.keys.p256dh),...server]),ikm=await hkdf(secret,pushBytes(d.value.keys.auth),info,32),cek=await hkdf(ikm,salt,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(ikm,salt,enc.encode('Content-Encoding: nonce\0'),12);
 const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),bytes.slice(86)));assert.equal(plain.at(-1),2);assert.deepEqual(JSON.parse(new TextDecoder().decode(plain.slice(0,-1))),payload);
 const jwt=packet.headers.authorization.match(/vapid t=([^,]+)/)[1].split('.');assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keys.publicKey,pushBytes(jwt[2]),enc.encode(jwt.slice(0,2).join('.'))),true);assert.equal(JSON.parse(new TextDecoder().decode(pushBytes(jwt[1]))).aud,'https://web.push.apple.com');
 for(const endpoint of ['http://web.push.apple.com/x','https://localhost/x','https://web.push.apple.com.evil.test/x','https://127.0.0.1/x','https://web.push.apple.com:8443/x','https://user:pass@web.push.apple.com/x'])assert.throws(()=>pushEndpoint(endpoint));
});
test('Subscriptions, concurrent delivery claims, retries, expired endpoints and logout detach are scoped',async()=>{
 const env=await setup(),c=await credentials(),d=await device();Object.assign(env,c.env);assert.equal((await call(env,'/api/notifications/subscription',people.worker,'POST',d.value)).status,200);
 const original=globalThis.fetch,sent=[];try{
  globalThis.fetch=async(url,options)=>{sent.push({url,options});return new Response('',{status:201});};
  // Direct mutations keep this test in control of draining instead of background ctx calls.
  env.sqlite.prepare("INSERT INTO jobs(id,title,description,address,assigned_to,assigned_name,due_date,status,created_at,updated_at,created_by,updated_by) VALUES('a','Tajné jméno','','','worker-id','','','planned',?,?, 'owner-id','owner-id')").run(Date.now()+1,Date.now()+1);
  await Promise.all([dispatchNotifications(env),dispatchNotifications(env)]);assert.equal(sent.length,1);await dispatchNotifications(env);assert.equal(sent.length,1);
  assert.equal(env.sqlite.prepare("SELECT state FROM push_deliveries").get().state,'sent');assert.ok(!new TextDecoder().decode(sent[0].options.body).includes('Tajné'));
  env.sqlite.prepare("UPDATE jobs SET description='Změněno',version=version+1,updated_at=?").run(Date.now()+2);
  globalThis.fetch=async()=>new Response('',{status:503});await dispatchNotifications(env);assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM push_deliveries WHERE state='pending'").get().n,1);
  env.sqlite.exec('UPDATE push_deliveries SET next_attempt_at=0');globalThis.fetch=async()=>new Response('',{status:410});await dispatchNotifications(env);assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,0);
  await call(env,'/api/notifications/subscription',people.worker,'POST',d.value);assert.equal((await(await call(env,'/api/notifications/subscription?endpoint='+encodeURIComponent(d.value.endpoint),people.reader)).json()).subscribed,false);
  await call(env,'/api/notifications/subscription?endpoint='+encodeURIComponent(d.value.endpoint),people.reader,'DELETE');assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,1);
  await call(env,'/api/notifications/subscription?endpoint='+encodeURIComponent(d.value.endpoint),people.worker,'DELETE');assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,0);
 }finally{globalThis.fetch=original;}
});
test('Service worker displays only a generic message and notification clicks stay inside this app',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm'),handlers={},shown=[],opened=[],messages=[];
 const self={location:{origin:'https://zavlahy.test'},addEventListener:(type,handler)=>handlers[type]=handler,registration:{showNotification:async(title,options)=>shown.push({title,...options})},clients:{matchAll:async()=>[{url:'https://zavlahy.test/',postMessage:m=>messages.push(m),focus:async()=>{}}],openWindow:async url=>opened.push(url)}};
 runInNewContext(readFileSync('web/sw.js','utf8'),{self,URL});let pending;handlers.push({data:{json:()=>({title:'Tajné jméno',body:'Privátní adresa',url:'https://evil.test'})},waitUntil:p=>pending=p});await pending;
 assert.equal(shown[0].body,'Máte nové upozornění. Otevřete aplikaci.');assert.equal(shown[0].data.url,'/?notifications=1');assert.equal(messages[0].type,'notifications-refresh');
 handlers.notificationclick({notification:{close(){},data:{url:'https://evil.test'}},waitUntil:p=>pending=p});await pending;assert.equal(messages.at(-1).type,'notifications-open');assert.equal(opened.length,0);
 self.clients.matchAll=async()=>[];handlers.notificationclick({notification:{close(){},data:{url:'https://evil.test'}},waitUntil:p=>pending=p});await pending;assert.deepEqual(opened,['/?notifications=1']);
});
