import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,person=people.owner,value={latitude:50.087,longitude:14.421})=>api(request('/api/gardens/address-from-position',person,'POST',value),env,ctx);
const result={features:[{geometry:{type:'Point',coordinates:[14.421,50.087]},properties:{street:'Jabloňová',housenumber:'7',city:'Praha',postcode:'17000',country:'Česko',type:'house'}}]};
async function setup(){const env=environment();await api(request('/api/me',people.owner),env,ctx);for(const role of ['worker','reader']){await api(request('/api/invitations',people.owner,'POST',{email:people[role].email,role}),env,ctx);await api(request('/api/me',people[role]),env,ctx);}return env;}
test('Address lookup validates identity, write role and coordinates before sending a location',async()=>{
 const env=await setup(),native=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(result);};
 try{assert.equal((await call(env,undefined)).status,200); // Default owner.
 assert.equal((await api(request('/api/gardens/address-from-position',undefined,'POST',{latitude:50,longitude:14}),env,ctx)).status,401);
 for(const p of [people.reader,people.outsider])assert.equal((await call(env,p)).status,403);
 for(const v of [{latitude:91,longitude:14},{latitude:50,longitude:-181},{latitude:'50',longitude:14},{latitude:null,longitude:14},{}])assert.equal((await call(env,people.worker,v)).status,400);
 assert.equal(calls,1);
 }finally{globalThis.fetch=native;}
});
test('GPS address fills a suggestion without saving a garden or the current coordinates',async()=>{
 const env=await setup(),native=globalThis.fetch;globalThis.fetch=async(input)=>{const u=new URL(input);assert.equal(u.hostname,'photon.komoot.io');assert.equal(u.pathname,'/reverse');assert.deepEqual(Object.fromEntries(u.searchParams),{lat:'50.087',lon:'14.421',limit:'1'});return Response.json(result);};
 try{const r=await call(env,people.worker);assert.equal(r.status,200);assert.deepEqual(await r.json(),{address:'Jabloňová 7, 17000 Praha, Česko',precision:'address'});assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM gardens').get().n,0);assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM garden_geocodes').get().n,0);assert.equal((await call(env)).status,429);const settings=env.sqlite.prepare('SELECT key,value FROM settings').all();assert.ok(settings.every(s=>!s.value.includes('50.087')&&!s.value.includes('14.421')));
 }finally{globalThis.fetch=native;}
});
test('Unavailable, unmatched and approximate reverse results are handled without inventing an address',async()=>{
 const native=globalThis.fetch;
 try{for(const [reply,status,precision] of [[new Response('Down',{status:503}),503],[Response.json({features:[]}),404],[Response.json({features:[{...result.features[0],geometry:{type:'Point',coordinates:[14,999]}}]}),404],[Response.json({features:[{...result.features[0],properties:{city:'Praha',country:'Česko'}}]}),200,'area']]){const env=await setup();globalThis.fetch=async()=>reply;const r=await call(env);assert.equal(r.status,status);if(precision)assert.equal((await r.json()).precision,precision);assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM gardens').get().n,0);}
 }finally{globalThis.fetch=native;}
});
