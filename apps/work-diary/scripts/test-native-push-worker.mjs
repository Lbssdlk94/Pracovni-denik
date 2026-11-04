// Real workerd Web Crypto + fetch, synthetic keys and an isolated mock APNs service.
// This verifies the sender, not live HTTP/2 negotiation or physical delivery.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {Miniflare} from 'miniflare';
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const env={APNS_TEAM_ID:'TEAM123456',APNS_KEY_ID:'KEY1234567',APNS_BUNDLE_ID:'cz.pracovnidenik.app',APNS_PRIVATE_KEY:'-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----'};
const device={native_token:'ab'.repeat(32),native_environment:'production',native_topic:env.APNS_BUNDLE_ID};
const source=readFileSync('worker/apns.js','utf8').replaceAll('export function ','function ').replaceAll('export async function ','async function ');
let count=0,status=200,reason='';const mf=new Miniflare({modules:true,compatibilityDate:'2026-08-06',script:source+'\nexport default{async fetch(r){const b=await r.json();return Response.json(await sendAPNs(b.device,b.env));}}',outboundService:async r=>{
 count++;assert.equal(r.url,'https://api.push.apple.com/3/device/'+device.native_token);assert.equal(r.method,'POST');assert.equal(r.headers.get('apns-topic'),env.APNS_BUNDLE_ID);assert.equal(r.headers.get('apns-push-type'),'alert');
 const jwt=r.headers.get('authorization').slice(7).split('.');assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,Buffer.from(jwt[2],'base64url'),new TextEncoder().encode(jwt.slice(0,2).join('.'))),true);
 const payload=await r.json();assert.deepEqual(Object.keys(payload).sort(),['aps','workDiaryInbox']);assert.equal(payload.workDiaryInbox,1);assert.ok(!JSON.stringify(payload).match(/customer|jobId|address|GPS|userId/));
 return status===200?new Response(null,{status}):status===302?Response.redirect('https://unapproved.test/',302):Response.json({reason},{status});
}});
try{const call=async()=>(await(await mf.dispatchFetch('http://test/',{method:'POST',body:JSON.stringify({env,device})})).json());
 assert.equal((await call()).status,200);status=429;reason='TooManyRequests';assert.deepEqual(await call(),{status,reason,expired:false});status=400;reason='BadDeviceToken';assert.equal((await call()).expired,true);status=302;await call();assert.equal(count,4,'Redirects must never be followed');
 console.log('PASS APNs in workerd: ES256 signature independently verified, strict provider host and headers, generic payload, acceptance/retry/invalid token, redirects blocked. No live Apple delivery claimed.');
}finally{await mf.dispose()}
