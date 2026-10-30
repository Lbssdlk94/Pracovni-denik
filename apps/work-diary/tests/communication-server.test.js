import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,people,request} from './fixtures.mjs';
import {api} from '../worker/api.js';
import {tenantPolicy} from '../worker/tenant-platform.js';

async function signedFixture(){
 const e=environment(),ctx={waitUntil:promise=>promise.catch(()=>{})};await api(request('/api/me',people.owner),e,ctx);
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 Object.assign(e,{PLATFORM_CONTROL_URL:'https://control.test',PLATFORM_COMPANY_ID:'technical-test',PLATFORM_SERVICE_TOKEN:'isolated',PLATFORM_SIGNING_KEY_ID:'test-key',PLATFORM_SIGNING_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('spki',keys.publicKey)).toString('base64url')});
 const installation=e.sqlite.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").get().instance_id;
 const policy=async(extra={})=>{const value={format:'work-diary-policy-v1',companyId:e.PLATFORM_COMPANY_ID,installationId:installation,revision:1,issuedAt:Date.now()-600000,expiresAt:Date.now()+600000,active:true,maxUsers:10,modules:{jobs:true},...extra},raw=new TextEncoder().encode(JSON.stringify(value));return {keyId:e.PLATFORM_SIGNING_KEY_ID,payload:Buffer.from(raw).toString('base64url'),signature:Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,raw)).toString('base64url')};};
 const seed=async extra=>e.sqlite.prepare("INSERT INTO settings(key,value,version) VALUES('platform-policy',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({revision:1,checkedAt:Date.now()-600000,envelope:await policy(extra)}));
 await seed();return {e,policy,seed};
}
test('Operational policy reads do not wait for a stalled control plane; refresh is coalesced and failures back off',async()=>{
 const {e}=await signedFixture(),original=globalThis.fetch;let release,calls=0;const tasks=[];
 e._workspaceWaitUntil=promise=>tasks.push(promise);
 globalThis.fetch=()=>{calls++;return new Promise((resolve,reject)=>release=()=>reject(Error('Control outage')));};
 try{
  const result=await Promise.race([tenantPolicy(e),new Promise((_,reject)=>setTimeout(()=>reject(Error('Operational read blocked on remote policy')),200))]);
  assert.equal(result.active,true);assert.equal(calls,1);assert.equal((await tenantPolicy(e)).active,true);assert.equal(calls,1);
  release();await Promise.all(tasks);assert.equal((await tenantPolicy(e)).active,true);assert.equal(calls,1,'failure cooldown prevents control request storm');
 }finally{globalThis.fetch=original;e.sqlite.close();}
});
test('Expired or revoked policies never become active during recovery, and a suspension is persisted',async()=>{
 const {e,seed,policy}=await signedFixture(),original=globalThis.fetch,tasks=[];e._workspaceWaitUntil=p=>tasks.push(p);
 try{
  globalThis.fetch=async()=>Response.json({policy:await policy({active:false,revision:2})});assert.equal((await tenantPolicy(e)).active,true);await Promise.all(tasks);assert.equal((await tenantPolicy(e)).active,false);
  await seed({expiresAt:Date.now()-1});globalThis.fetch=async()=>{throw Error('Unavailable');};const expired=await tenantPolicy(e);assert.equal(expired.active,false);assert.equal(expired.configurationExpired,true);
  e.sqlite.prepare("DELETE FROM settings WHERE key='platform-policy'").run();await assert.rejects(tenantPolicy(e),/licence nelze ověřit/);
 }finally{globalThis.fetch=original;e.sqlite.close();}
});
test('Connection probe reads only database liveness; failure returns a retryable 503 without private error details',async()=>{
 const e=environment(),ctx={waitUntil:()=>{}};try{
  const response=await api(request('/api/connection-health'),e,ctx);assert.equal(response.status,200);assert.deepEqual(Object.keys(await response.json()).sort(),['databaseMs','ok']);assert.match(response.headers.get('server-timing'),/db;dur=.*app;dur=/);assert.ok(response.headers.get('x-request-id'));assert.equal(e.sqlite.prepare('SELECT count(*) n FROM customers').get().n,0);
  const broken={DB:{prepare:()=>({first:async()=>{throw Error('PRIVATE SQL SECRET');}})}};const failed=await api(request('/api/connection-health'),broken,ctx);assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{ok:false,code:'database_unavailable'});
 }finally{e.sqlite.close();}
});
