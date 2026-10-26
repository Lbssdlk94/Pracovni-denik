import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {subToday,subAddDays} from '../web/subscription-model.js';
import {travelMessage,travelSmsLink} from '../web/job-travel.js';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(e,path,p=people.owner,method='GET',body)=>api(request(path,p,method,body),e,ctx);
async function good(r){assert.equal(r.status,200,await r.clone().text());return r.json();}
async function setup(){const e=environment();await good(await call(e,'/api/me'));for(const role of ['worker','reader','admin']){await good(await call(e,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await good(await call(e,'/api/me',people[role]));}await good(await call(e,'/api/jobs/travel',people.owner,'PUT',{version:0,title:'Servis zahrady',address:'Zahradní 1',assignedTo:people.worker.id,assignedTos:[people.worker.id,people.reader.id],status:'planned'}));return e;}
const departure={version:1,arrivalDate:subAddDays(subToday(),1),arrivalTime:'10:15'};
test('Departure persists an exact ETA, notifies managers, retries once and shares a scoped status',async()=>{
 const e=await setup();try{
  const url='/api/jobs/travel/departure',result=await good(await call(e,url,people.worker,'POST',departure));assert.equal(result.job.status,'on_way');assert.equal(result.job.arrivalTime,'10:15');assert.equal(result.job.arrivalDate,departure.arrivalDate);assert.equal(result.job.departureBy,people.worker.id);assert.ok(result.job.departureAt>0);
  const replay=await good(await call(e,url,people.worker,'POST',departure));assert.equal(replay.replayed,true);assert.equal(replay.job.version,2);
  assert.equal((await good(await call(e,'/api/jobs?state=on_way',people.reader))).jobs[0].arrivalTime,'10:15');
  const notice=(await good(await call(e,'/api/notifications',people.owner))).notifications.find(n=>n.kind==='job_status');assert.equal(notice.title,'Pracovník je na cestě');assert.ok(notice.body.includes('10:15'));assert.ok(!notice.body.includes('Nedokončeno'));
  assert.equal(e.sqlite.prepare("SELECT count(*) n FROM notifications WHERE kind='job_status'").get().n,2);
  assert.equal((await call(e,url,people.worker,'POST',{...departure,arrivalTime:'10:30'})).status,409);
  const changed=await good(await call(e,url,people.worker,'POST',{...departure,version:2,arrivalTime:'10:30'}));assert.equal(changed.job.arrivalTime,'10:30');assert.ok((await good(await call(e,'/api/notifications',people.admin))).notifications.some(n=>n.body.includes('10:30')));
  const next=await good(await call(e,'/api/jobs/travel/status',people.worker,'PATCH',{version:3,status:'in_progress'}));assert.equal(next.job.status,'in_progress');
 }finally{e.sqlite.close();}
});
test('Departure checks role, assignment, ETA and concurrent versions on the server',async()=>{
 const e=await setup();try{
  const url='/api/jobs/travel/departure';assert.equal((await call(e,url,people.reader,'POST',departure)).status,403);assert.equal((await call(e,url,people.outsider,'POST',departure)).status,403);
  for(const extra of [{arrivalTime:'25:00'},{arrivalTime:'10:15:00'},{arrivalTime:''},{arrivalDate:'2026-02-30'},{arrivalDate:subAddDays(subToday(),-1)},{version:0},{status:'done'}])assert.ok((await call(e,url,people.worker,'POST',{...departure,...extra})).status>=400);
  assert.equal((await call(e,'/api/jobs/travel/status',people.worker,'PATCH',{version:1,status:'on_way'})).status,400);
  const done=await good(await call(e,'/api/jobs/travel/status',people.worker,'PATCH',{version:1,status:'done'}));assert.equal((await call(e,url,people.worker,'POST',{...departure,version:done.job.version})).status,409);
  assert.equal((await call(e,url,people.worker,'GET')).status,405);
 }finally{e.sqlite.close();}
});
test('SMS drafts encode exact arrival, validate a single number and support iPhone and Android',()=>{
 const message=travelMessage({address:'Zahradní 1, Písek',arrivalDate:'2026-10-16',arrivalTime:'10:15'});assert.ok(message.includes('10:15'));assert.ok(message.includes('16. 10. 2026'));
 assert.equal(travelSmsLink('+420 777 123 456',message,{userAgent:'iPhone'}),'sms:+420777123456&body='+encodeURIComponent(message));
 assert.equal(travelSmsLink('777123456',message,{userAgent:'Android'}),'sms:777123456?body='+encodeURIComponent(message));
 for(const number of ['javascript:alert(1)','+420777123456,+420888123456','123',''])assert.equal(travelSmsLink(number,message),null);
});
