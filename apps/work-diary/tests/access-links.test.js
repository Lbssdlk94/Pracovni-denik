import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {api} from '../worker/api.js';import {environment,people,request,shaftForm} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(e,path,actor=people.owner,method='GET',value,headers={})=>api(request(path,actor,method,value,headers),e,ctx);
const good=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();},hash=t=>createHash('sha256').update(t).digest('hex');
async function setup(){const e=environment();await good(await call(e,'/api/me'));for(const role of ['admin','worker','reader']){await good(await call(e,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await good(await call(e,'/api/me',people[role]));}return e;}
test('Every role is prevented from issuing, renewing or using a personal login link',async()=>{const e=await setup();try{
 const before=e.sqlite.prepare('SELECT count(*) n FROM invitations').get().n;
 for(const actor of [people.owner,people.admin,people.worker,people.reader]){
  assert.equal((await call(e,'/api/invitations',actor,'POST',{email:'no-link@example.test',role:'worker',mode:'link'})).status,403);
  for(const path of ['/api/members/worker-id/access-link','/api/members/worker-id/device-invite','/api/workspace/identity-invite','/api/workspace/link-identity']){const response=await call(e,path,actor,'POST',{memberId:'worker-id',confirm:'PROPOJIT'});assert.equal(response.status,403);assert.equal((await response.json()).code,'access_link_disabled');}
 }
 for(const actor of [null,people.owner,people.worker])for(const path of ['/api/access-info','/api/access-link']){const r=await call(e,path,actor,'POST',{token:'a'.repeat(64)});assert.equal(r.status,403);assert.equal((await r.json()).code,'access_link_disabled');assert.equal(r.headers.get('set-cookie'),null);}
 assert.equal(e.sqlite.prepare('SELECT count(*) n FROM invitations').get().n,before);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM guest_access').get().n,0);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM access_sessions').get().n,0);
 }finally{e.sqlite.close();}});
test('Previously valid pending links cannot create accounts or sessions, even with concurrent redemption',async()=>{const e=await setup();try{
 const token='b'.repeat(64),now=Date.now();e.sqlite.prepare('INSERT INTO invitations(email,role,created_by,created_at,access_token_hash,guest_user_id,expires_at) VALUES(?,?,?,?,?,?,?)').run('previous@example.test','worker',people.owner.id,now,hash(token),'old-guest',now+86400000);
 const before=e.sqlite.prepare('SELECT count(*) n FROM members').get().n;
 const results=await Promise.all([call(e,'/api/access-link',null,'POST',{token}),call(e,'/api/access-link',null,'POST',{token}),call(e,'/api/access-info',null,'POST',{token})]);assert.ok(results.every(r=>r.status===403));
 assert.equal(e.sqlite.prepare('SELECT count(*) n FROM members').get().n,before);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM invitations').get().n,1);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM access_sessions').get().n,0);
 }finally{e.sqlite.close();}});
test('Old device and legacy-token cookies are rejected without deleting business data; logout still works',async()=>{const e=await setup();try{
 const token='c'.repeat(64),legacy='d'.repeat(64),now=Date.now();e.sqlite.prepare('INSERT INTO access_sessions(id,user_id,token_hash,created_at,expires_at,last_seen_at,agent,auth_method) VALUES(?,?,?,?,?,?,?,?)').run('old-device','worker-id',hash(token),now,now+86400000,now,'Old test device','link');
 e.sqlite.prepare('INSERT INTO guest_access(user_id,email,token_hash,created_at,expires_at,single_use) VALUES(?,?,?,?,?,0)').run('worker-id',people.worker.email,hash(legacy),now,now+86400000);
 await good(await call(e,'/api/shafts/keep',people.owner,'PUT',shaftForm('Zachovaná šachta')));const before=e.sqlite.prepare('SELECT * FROM shafts').all();
 for(const value of [token,legacy,'not-a-key'])for(const actor of [null,people.owner])assert.equal((await call(e,'/api/me',actor,'GET',undefined,{cookie:'__Host-zavlahy-access='+value})).status,401);
 assert.deepEqual(e.sqlite.prepare('SELECT * FROM shafts').all(),before);const list=await good(await call(e,'/api/access-sessions?userId=all'));assert.equal(list.sessions.length,0);
 const response=await call(e,'/api/access-logout',null,'POST',{}, {cookie:'__Host-zavlahy-access='+token});await good(response);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await call(e,'/api/access-logout',null,'POST',{}, {origin:'https://evil.test'})).status,403);
 }finally{e.sqlite.close();}});
test('Password sessions retain the exact original member and permissions; options explicitly disable links',async()=>{const e=await setup();try{
 const response=await call(e,'/api/auth/password',people.worker,'PUT',{username:'existing-worker',password:'Isolated-strong-password-123',version:0});await good(response);const cookie=response.headers.get('set-cookie').split(';')[0];const me=await good(await call(e,'/api/me',null,'GET',undefined,{cookie}));assert.equal(me.user.id,people.worker.id);assert.equal(me.user.authMethod,'password');assert.equal(me.user.role,'worker');assert.equal((await call(e,'/api/team',null,'GET',undefined,{cookie})).status,403);
 assert.equal((await good(await call(e,'/api/auth/options',null))).linkAllowed,false);assert.equal((await good(await call(e,'/api/auth/options',null))).legacyAllowed,true);assert.equal((await good(await call(e,'/api/auth/account',null,'GET',undefined,{cookie}))).linkAllowed,false);
 }finally{e.sqlite.close();}});
