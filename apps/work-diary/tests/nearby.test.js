import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
import {distanceMeters,formatDistance,normalizeAddress,parseAddressCandidates,automaticCandidate,gardensByDistance,gardenAddressLocation} from '../web/nearby.js';
import {DEFAULT_FEATURES} from '../web/features.js';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx);
const feature=(lat=50.087,lon=14.421)=>({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{type:'house',street:'Testovací',housenumber:'12',city:'Praha',country:'Česko'}});
async function setup(){const env=environment();await call(env,'/api/me');await call(env,'/api/gardens',people.owner,'POST',{id:'g1',name:'Zahrada',address:'Testovací 12, Praha',notes:''});await call(env,'/api/invitations',people.owner,'POST',{email:people.reader.email,role:'reader'});await call(env,'/api/me',people.reader);return env;}
test('Distance sorting handles equal points, unknown addresses and the date line without changing inputs',()=>{
 const origin={latitude:50,longitude:14};assert.equal(distanceMeters(origin,origin),0);assert.ok(Math.abs(distanceMeters({latitude:0,longitude:0},{latitude:0,longitude:1})-111195)<2);assert.ok(distanceMeters({latitude:0,longitude:179.9},{latitude:0,longitude:-179.9})<23000);assert.equal(distanceMeters(origin,{latitude:100,longitude:1}),null);
 const gardens=[{id:'far',name:'A vzdálená',address:'Dál'},{id:'near',name:'Z blízká',address:'Blízko'},{id:'unknown',name:'Bez adresy',address:''}],choices={far:{address:normalizeAddress('Dál'),candidate:{position:{latitude:51,longitude:14}}},near:{address:normalizeAddress('Blízko'),candidate:{position:{latitude:50.001,longitude:14}}}};
 assert.deepEqual(gardensByDistance(gardens,origin,choices).map(r=>r.garden.id),['near','far','unknown']);assert.equal(gardens[0].id,'far');assert.equal(gardenAddressLocation({...gardens[1],address:'Jiná'},choices),null);assert.equal(formatDistance(1200),'1,2 km');
});
test('Address results reject bad coordinates; distant or area matches require choosing a location',()=>{
 const c=parseAddressCandidates({features:[feature(),feature(50.08701),feature(999,14),{geometry:{type:'LineString',coordinates:[14,50]}}]});assert.equal(c.length,1);assert.equal(c[0].position.latitude,50.087);assert.match(c[0].label,/Testovací 12/);assert.equal(automaticCandidate(c),c[0]);assert.equal(automaticCandidate([...c,...parseAddressCandidates({features:[feature(49,16)]})]),null);assert.equal(automaticCandidate([{...c[0],precision:'area'}]),null);
});
test('Members resolve and cache an address; GPS is never sent to the provider; garden version stays unchanged',async()=>{
 const env=await setup(),original=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{calls++;const parsed=new URL(url);assert.equal(parsed.hostname,'photon.komoot.io');assert.deepEqual([...parsed.searchParams.keys()],['q','limit']);assert.equal(parsed.searchParams.get('q'),'Testovací 12, Praha');return new Response(JSON.stringify({features:[feature()]}));};
 try{const response=await call(env,'/api/gardens/g1/geocode',people.reader,'POST',{address:'Testovací 12, Praha'});assert.equal(response.status,200);assert.equal((await response.json()).candidates.length,1);assert.equal((await call(env,'/api/gardens/g1/geocode',people.reader,'POST',{address:'Testovací 12, Praha'})).status,200);assert.equal(calls,1);const g=(await(await call(env,'/api/gardens')).json()).gardens[0];assert.equal(g.version,1);assert.equal(g.geocode.candidates[0].position.latitude,50.087);
 assert.equal((await call(env,'/api/gardens/g1/geocode',people.outsider,'POST',{address:g.address})).status,403);assert.equal((await api(request('/api/gardens/g1/geocode',undefined,'POST',{address:g.address}),env,ctx)).status,401);
 await call(env,'/api/gardens/g1',people.owner,'PATCH',{...g,address:'Jiná 1, Brno'});assert.equal((await(await call(env,'/api/gardens')).json()).gardens[0].geocode,null);assert.equal((await call(env,'/api/gardens/g1/geocode',people.reader,'POST',{address:g.address})).status,409);
 }finally{globalThis.fetch=original;}
});
test('Provider failures, rate limits and changing addresses do not store false positions',async()=>{
 const original=globalThis.fetch;try{
 let env=await setup();globalThis.fetch=async()=>new Response('Unavailable',{status:503});assert.equal((await call(env,'/api/gardens/g1/geocode',people.reader,'POST',{address:'Testovací 12, Praha'})).status,503);assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM garden_geocodes').get().n,0);assert.equal((await call(env,'/api/gardens/g1/geocode',people.reader,'POST',{address:'Testovací 12, Praha'})).status,429);
 env=await setup();globalThis.fetch=async()=>{env.sqlite.exec("UPDATE gardens SET address='Kolega změnil adresu'");return new Response(JSON.stringify({features:[feature()]}));};assert.equal((await call(env,'/api/gardens/g1/geocode',people.reader,'POST',{address:'Testovací 12, Praha'})).status,409);assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM garden_geocodes').get().n,0);
 }finally{globalThis.fetch=original;}
});
test('Legacy feature settings preserve the new nearby preference',async()=>{const env=await setup();await call(env,'/api/features',people.owner,'PUT',{version:0,features:{...DEFAULT_FEATURES,nearby:false}});const legacy={...DEFAULT_FEATURES};delete legacy.nearby;assert.equal((await call(env,'/api/features',people.owner,'PUT',{version:1,features:legacy})).status,200);assert.equal((await(await call(env,'/api/features')).json()).features.nearby,false);});
