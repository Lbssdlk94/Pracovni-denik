import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {googleFixture} from './google-drive-fixture.mjs';
async function harness(){
 const env=environment(),google=googleFixture(),previous=globalThis.fetch;globalThis.fetch=google.fetch;env.DRIVE_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64url');
 const ctx={waitUntil:p=>p.catch(()=>{})},call=(path,person=null,method='GET',body,headers={})=>api(request(path,person,method,body,headers),env,ctx);
 await call('/api/me',people.owner);
 assert.equal((await call('/api/drive/config',people.owner,'PUT',{version:0,clientId:'client.apps.googleusercontent.com',clientSecret:'TEST_SECRET'})).status,200);
 const account=await(await call('/api/auth/account',people.owner)).json();
 const password=await call('/api/auth/password',people.owner,'PUT',{username:'owner.native',password:'Test-Only-Native-Password-2026',version:account.version});assert.equal(password.status,200,await password.clone().text());
 const cookie=password.headers.get('set-cookie').split(';')[0];
 const start=async()=>{const r=await call('/api/drive/connect',null,'POST',{mode:'connect',native:true},{cookie});assert.equal(r.status,200,await r.clone().text());return new URL((await r.json()).url);};
 return {env,google,call,start,cookie,restore(){globalThis.fetch=previous;env.sqlite.close();}};
}
test('native Google handoff uses one-time OAuth cookie, never a diary browser login',async()=>{const h=await harness();try{
 const link=await h.start();assert.equal(link.pathname,'/api/drive/native-start');const state=link.searchParams.get('state');
 const bootstrap=await h.call(link.pathname+link.search);assert.equal(bootstrap.status,303);assert.equal(bootstrap.headers.get('referrer-policy'),'no-referrer');assert.equal(bootstrap.headers.get('cache-control'),'no-store');const google=new URL(bootstrap.headers.get('location'));assert.equal(google.hostname,'accounts.google.com');assert.equal(google.searchParams.get('state'),state);assert.equal(google.searchParams.get('code_challenge_method'),'S256');
 const browserCookie=bootstrap.headers.get('set-cookie').split(';')[0];assert.match(browserCookie,/^__Host-zavlahy-drive-oauth=/);assert.ok(!browserCookie.includes('__Host-zavlahy-access='));
 assert.equal((await h.call(link.pathname+link.search)).status,401);
 const code=h.google.issueCode(),callback='/api/drive/oauth/callback?state='+state+'&code='+code;
 assert.equal((await h.call(callback)).status,401);
 const complete=await h.call(callback,null,'GET',undefined,{cookie:browserCookie});assert.equal(complete.status,303);const native=new URL(complete.headers.get('location'));assert.equal(native.protocol,'pracovnidenik:');assert.equal(native.hostname,'drive-callback');assert.equal(native.searchParams.get('state'),state);assert.equal(native.searchParams.get('result'),'connected');
 assert.equal((await h.call(callback,null,'GET',undefined,{cookie:browserCookie})).status,401);
 assert.equal((await h.call('/api/jobs',null,'GET',undefined,{cookie:browserCookie})).status,401);
 const status=await(await h.call('/api/drive/status',null,'GET',undefined,{cookie:h.cookie})).json();assert.equal(status.nativeOAuth,true);assert.equal(status.connections.length,1);assert.ok(!JSON.stringify(status).includes('TEST_SECRET'));
 }finally{h.restore();}});
test('native Google handoff rejects changed role, revoked password session and another origin',async()=>{const h=await harness();try{
 const first=await h.start();h.env.sqlite.prepare("UPDATE members SET role='worker' WHERE user_id=?").run(people.owner.id);assert.equal((await h.call(first.pathname+first.search)).status,401);h.env.sqlite.prepare("UPDATE members SET role='owner' WHERE user_id=?").run(people.owner.id);
 const second=await h.start();assert.equal((await api(new Request('https://another.test'+second.pathname+second.search),h.env,{waitUntil:p=>p.catch(()=>{})})).status,401);
 h.env.sqlite.prepare('UPDATE access_sessions SET revoked_at=?').run(Date.now());assert.equal((await h.call(second.pathname+second.search)).status,401);
 }finally{h.restore();}});

test('revoking the diary session while Google responds prevents native OAuth commit',async()=>{const h=await harness();try{
 const link=await h.start(),bootstrap=await h.call(link.pathname+link.search),cookie=bootstrap.headers.get('set-cookie').split(';')[0];
 globalThis.fetch=async(input,init)=>{const response=await h.google.fetch(input,init);if(String(input).includes('oauth2.googleapis.com/token'))h.env.sqlite.prepare('UPDATE access_sessions SET revoked_at=?').run(Date.now());return response;};
 const response=await h.call('/api/drive/oauth/callback?state='+link.searchParams.get('state')+'&code='+h.google.issueCode(),null,'GET',undefined,{cookie});assert.equal(new URL(response.headers.get('location')).searchParams.get('result'),'error');assert.equal(h.env.sqlite.prepare('SELECT COUNT(*) n FROM drive_connections').get().n,0);
 }finally{h.restore();}});
