import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
import {subToday,subAddDays} from '../web/subscription-model.js';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(e,path,user=people.owner,method='GET',value)=>api(request(path,user,method,value),e,ctx),good=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
async function setup(){const e=environment();await good(await call(e,'/api/me'));for(const role of ['worker','reader']){await good(await call(e,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await good(await call(e,'/api/me',people[role]));}return e;}
const job=(type,day=3,extra={})=>({version:0,title:'Test '+type,jobType:type,assignedTo:people.worker.id,assignedTos:[people.worker.id,people.reader.id],dueDate:subAddDays(subToday(),day),status:'planned',...extra});
test('Kinds persist, survive legacy edits, filter the calendar, and only managers can change them',async()=>{
 const e=await setup();for(const type of ['service','installation','survey']){const {job:created}=await good(await call(e,'/api/jobs/'+type,people.owner,'PUT',job(type)));assert.equal(created.jobType,type);}
 assert.equal((await call(e,'/api/jobs/bad',people.owner,'PUT',job('nope'))).status,400);assert.equal((await call(e,'/api/jobs?type=bad')).status,400);
 for(const type of ['blowout','maintenance']){const {job:created}=await good(await call(e,'/api/jobs/'+type,people.owner,'PUT',job(type)));assert.equal(created.jobType,type);}
 const due=subAddDays(subToday(),3),filtered=await good(await call(e,'/api/jobs?type=survey&order=schedule&month='+due.slice(0,7),people.worker));assert.deepEqual(filtered.jobs.map(j=>j.id),['survey']);assert.equal(filtered.calendar.days[0].count,1);
 assert.equal((await call(e,'/api/jobs/survey',people.worker,'PUT',job('installation',3,{version:1}))).status,403);assert.equal((await call(e,'/api/jobs/survey/status',people.worker,'PATCH',{version:1,status:'done',jobType:'installation'})).status,400);
 const legacy=job('survey',3,{version:1});delete legacy.jobType;assert.equal((await good(await call(e,'/api/jobs/survey',people.owner,'PUT',legacy))).job.jobType,'survey');e.sqlite.close();
});
test('Only installation gets material reminders with the configured lead, including a newly added visit inside that window',async()=>{
 const e=await setup();await good(await call(e,'/api/service-reminders/settings',people.owner,'PUT',{version:0,settings:{enabled:true,days:3,dayMode:'calendar',shiftNonWorking:false}}));for(const type of ['service','installation','survey'])await good(await call(e,'/api/jobs/'+type,people.owner,'PUT',job(type)));
 await good(await call(e,'/api/jobs/too-soon',people.owner,'PUT',job('installation',2)));await good(await call(e,'/api/jobs/too-late',people.owner,'PUT',job('installation',4)));await good(await call(e,'/api/jobs/finished',people.owner,'PUT',job('installation',3,{status:'done'})));
 e.sqlite.prepare("INSERT INTO settings(key,value,version) VALUES('features',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({subscriptions:false,jobs:true,notifications:true}));
 assert.equal((await good(await call(e,'/api/service-reminders/check',people.owner,'POST'))).created,4);assert.equal((await good(await call(e,'/api/service-reminders/check',people.owner,'POST'))).created,0);
 const reminders=e.sqlite.prepare("SELECT * FROM notifications WHERE kind='job_reminder'").all();assert.equal(reminders.length,4);assert.ok(reminders.every(n=>['installation','too-soon'].includes(n.resource_id)&&n.body.includes('všechen potřebný materiál')));assert.equal(reminders.filter(n=>n.resource_id==='installation').length,2);
 for(const user of [people.worker,people.reader])assert.ok(JSON.stringify(await good(await call(e,'/api/notifications',user))).includes('job_reminder'));
 await good(await call(e,'/api/jobs/installation',people.owner,'PUT',job('service',3,{version:1})));for(const user of [people.worker,people.reader]){const inbox=await good(await call(e,'/api/notifications',user));assert.ok(!inbox.notifications.some(n=>n.kind==='job_reminder'&&n.resourceId==='installation'));assert.ok(inbox.notifications.some(n=>n.kind==='job_reminder'&&n.resourceId==='too-soon'));}e.sqlite.close();
});
