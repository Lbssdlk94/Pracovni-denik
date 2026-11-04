import test from 'node:test';import assert from 'node:assert/strict';import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(e,p,who=people.owner,method='GET',value,headers={})=>api(request(p,who,method,value,headers),e,ctx),ok=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
const cookie=r=>r.headers.get('set-cookie').split(';')[0],password='Isolated-device-password-123';
async function setup(){const e=environment();await ok(await call(e,'/api/me'));return e;}
test('Password devices use independent expiring tokens; logout and device revocation close only the chosen session',async()=>{const e=await setup();try{
 const first=await call(e,'/api/auth/password',people.owner,'PUT',{username:'session-owner',password,version:0});await ok(first);const one=cookie(first),second=await call(e,'/api/auth/login',null,'POST',{username:'session-owner',password});await ok(second);const two=cookie(second);assert.notEqual(one,two);
 const devices=await ok(await call(e,'/api/access-sessions?userId=all'));assert.equal(devices.sessions.length,2);assert.ok(!JSON.stringify(devices).includes('token_hash'));
 await ok(await call(e,'/api/access-logout',null,'POST',{}, {cookie:one}));assert.equal((await call(e,'/api/me',null,'GET',undefined,{cookie:one})).status,401);assert.equal((await call(e,'/api/me',null,'GET',undefined,{cookie:two})).status,200);
 const remaining=await ok(await call(e,'/api/access-sessions?userId=all'));await ok(await call(e,'/api/access-sessions/'+remaining.sessions[0].id,people.owner,'DELETE'));assert.equal((await call(e,'/api/me',null,'GET',undefined,{cookie:two})).status,401);
 }finally{e.sqlite.close();}});
test('Misbound company database or object storage fails closed after link login removal',async()=>{const e=await setup(),other=await setup();try{
 other.BUCKET=e.BUCKET;assert.equal((await call(other,'/api/me')).status,503);e.INSTALLATION_ID='other-firm';assert.equal((await call(e,'/api/me')).status,503);
 }finally{e.sqlite.close();other.sqlite.close();}});
test('Expired password device sessions cannot fall back to a hosted identity',async()=>{const e=await setup();try{
 const response=await call(e,'/api/auth/password',people.owner,'PUT',{username:'expiry-owner',password,version:0});await ok(response);const c=cookie(response);e.sqlite.prepare('UPDATE access_sessions SET expires_at=0').run();
 for(const actor of [null,people.owner])assert.equal((await call(e,'/api/me',actor,'GET',undefined,{cookie:c})).status,401);assert.equal((await call(e,'/api/me',people.owner)).status,200);
 }finally{e.sqlite.close();}});
