import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request,shaftForm} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})};
const call=(env,path,person,method='GET',value,headers={})=>api(request(path,person,method,value,headers),env,ctx);
const cookie=response=>response.headers.get('set-cookie').split(';')[0];
const tokenFrom=data=>new URLSearchParams(new URL(data.url).hash.slice(1)).get('access');
async function setup(){const env=environment();await call(env,'/api/me',people.owner);await call(env,'/api/shafts/s1',people.owner,'PUT',shaftForm('Soukromá šachta'));return env;}
async function invite(env,email='guest@example.com',role='worker',person=people.owner){const r=await call(env,'/api/invitations',person,'POST',{email,role,mode:'link'});assert.equal(r.status,200);return r.json();}
async function join(env,data){const r=await call(env,'/api/access-link',undefined,'POST',{token:tokenFrom(data)});assert.equal(r.status,200);return cookie(r);}
test('Personal links authenticate without platform headers and keep their keys out of stored metadata',async()=>{
 const env=await setup(),i=await invite(env),token=tokenFrom(i);assert.match(token,/^[a-f0-9]{64}$/);assert.equal((await call(env,'/api/shafts')).status,401);
 const info=await call(env,'/api/access-info',undefined,'POST',{token});assert.equal(info.status,200);assert.equal((await info.json()).role,'worker');assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM members WHERE email='guest@example.com'").get().n,0);
 assert.equal((await call(env,'/api/me',{id:'pretend-platform-user',email:i.email})).status,403);
 const r=await call(env,'/api/access-link',undefined,'POST',{token});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/Secure/);assert.match(r.headers.get('set-cookie'),/SameSite=Lax/);
 const c=cookie(r),me=await(await call(env,'/api/me',undefined,'GET',undefined,{cookie:c})).json();assert.equal(me.user.authMethod,'link');assert.equal(me.user.role,'worker');assert.equal((await(await call(env,'/api/me',people.owner,'GET',undefined,{cookie:c})).json()).user.role,'worker');assert.ok(me.user.id.startsWith('guest_'));assert.equal((await call(env,'/api/shafts/s1/photo',undefined,'GET',undefined,{cookie:c})).status,200);assert.equal((await call(env,'/api/shafts/s1',undefined,'PUT',shaftForm('Úprava kolegy',1,false),{cookie:c})).status,200);
 for(const row of env.sqlite.prepare('SELECT token_hash FROM guest_access').all())assert.notEqual(row.token_hash,token);
 const teamText=await(await call(env,'/api/team',people.owner)).text();assert.ok(!teamText.includes(token));assert.ok(!teamText.includes('token_hash'));
 assert.equal((await call(env,'/api/shafts/s1',undefined,'PUT',shaftForm('CSRF',2,false),{cookie:c,origin:'https://evil.test'})).status,403);
 assert.equal((await call(env,'/api/invitations',undefined,'POST',{email:'bad@example.com',role:'admin',mode:'link'},{cookie:c})).status,403);
});
test('Role changes and link rotation immediately restrict old credentials and preserve the colleague identity',async()=>{
 const env=await setup(),i=await invite(env),old=await join(env,i),first=(await(await call(env,'/api/me',undefined,'GET',undefined,{cookie:old})).json()).user.id;
 await call(env,'/api/members/'+first,people.owner,'PATCH',{role:'reader'});assert.equal((await call(env,'/api/shafts/s1',undefined,'PUT',shaftForm('Zakázáno',1,false),{cookie:old})).status,403);
 const renewal=await call(env,'/api/members/'+first+'/access-link',people.owner,'POST');assert.equal(renewal.status,200);const next=await renewal.json();assert.equal((await call(env,'/api/me',undefined,'GET',undefined,{cookie:old})).status,401);assert.equal((await call(env,'/api/access-link',undefined,'POST',{token:tokenFrom(i)})).status,401);
 const current=await join(env,next),id=(await(await call(env,'/api/me',undefined,'GET',undefined,{cookie:current})).json()).user.id;assert.equal(id,first);
 await call(env,'/api/members/'+first,people.owner,'DELETE');assert.equal((await call(env,'/api/shafts/s1/photo',undefined,'GET',undefined,{cookie:current})).status,401);assert.equal((await call(env,'/api/access-link',undefined,'POST',{token:tokenFrom(next)})).status,401);
 const fresh=await invite(env,i.email),restored=await join(env,fresh);assert.equal((await(await call(env,'/api/me',undefined,'GET',undefined,{cookie:restored})).json()).user.id,first);
});
test('Cancelled and reissued invitations are unusable; administrators cannot create or rotate elevated links',async()=>{
 const env=await setup(),one=await invite(env),two=await invite(env);assert.equal((await call(env,'/api/access-info',undefined,'POST',{token:tokenFrom(one)})).status,401);await call(env,'/api/invitations',people.owner,'DELETE',{email:two.email});assert.equal((await call(env,'/api/access-link',undefined,'POST',{token:tokenFrom(two)})).status,401);
 await call(env,'/api/invitations',people.owner,'POST',{email:people.admin.email,role:'admin'});await call(env,'/api/me',people.admin);
 assert.equal((await call(env,'/api/invitations',people.admin,'POST',{email:'another-admin@example.com',role:'admin',mode:'link'})).status,403);
 const elevated=await invite(env,'guest-admin@example.com','admin'),c=await join(env,elevated),id=(await(await call(env,'/api/me',undefined,'GET',undefined,{cookie:c})).json()).user.id;
 assert.equal((await call(env,'/api/members/'+id+'/access-link',people.admin,'POST')).status,403);assert.equal((await call(env,'/api/members/'+id,people.admin,'DELETE')).status,403);
 assert.equal((await call(env,'/api/invitations',people.owner,'POST',{email:people.owner.email,role:'admin',mode:'link'})).status,409);
});
test('Anonymous link attempts are throttled, invalid cookies cannot select a member, and logout clears the cookie',async()=>{
 const env=await setup();for(let n=0;n<60;n++)assert.equal((await call(env,'/api/access-info',undefined,'POST',{token:'0'.repeat(64)})).status,401);assert.equal((await call(env,'/api/access-info',undefined,'POST',{token:'0'.repeat(64)})).status,429);
 assert.equal((await call(env,'/api/me',people.owner,'GET',undefined,{cookie:'__Host-zavlahy-access=not-a-key'})).status,401);
 const r=await call(env,'/api/access-logout',undefined,'POST');assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await call(env,'/api/access-logout',undefined,'POST',undefined,{origin:'https://evil.test'})).status,403);
});
