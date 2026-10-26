import test from 'node:test';import assert from 'node:assert/strict';
import {MATERIAL_REMINDER_DEFAULTS,materialReminderDate,materialWorkingDay} from '../web/reminder-model.js';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(e,p,u=people.owner,method='GET',value)=>api(request(p,u,method,value),e,ctx),good=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
test('Working days and optional calendar shifts avoid weekends, Czech public holidays and Easter',()=>{
 const work={...MATERIAL_REMINDER_DEFAULTS},calendar={...work,dayMode:'calendar'};
 assert.equal(materialReminderDate('2026-10-20',work),'2026-10-15');assert.equal(materialReminderDate('2026-11-02',work),'2026-10-27');assert.equal(materialReminderDate('2026-04-07',work),'2026-03-31');assert.equal(materialReminderDate('2026-12-29',work),'2026-12-22');
 assert.equal(materialReminderDate('2026-10-20',calendar),'2026-10-16');assert.equal(materialReminderDate('2026-10-20',{...calendar,shiftNonWorking:false}),'2026-10-17');assert.equal(materialReminderDate('2026-10-30',{...calendar,days:2}),'2026-10-27');assert.equal(materialWorkingDay('2026-10-28'),false);assert.equal(materialReminderDate('invalid',work),null);
});
test('Team settings are validated and versioned on the server; reminder date follows working-day and calendar choices',async()=>{
 const OriginalDate=Date;let stamp=OriginalDate.parse('2026-10-16T09:00:00Z');globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[stamp]));}static now(){return stamp;}};
 let e;try{e=environment();await good(await call(e,'/api/me'));await good(await call(e,'/api/invitations',people.owner,'POST',{email:people.worker.email,role:'worker'}));await good(await call(e,'/api/me',people.worker));
 const defaults=await good(await call(e,'/api/service-reminders/settings'));assert.deepEqual(defaults.settings,MATERIAL_REMINDER_DEFAULTS);assert.equal(defaults.version,0);assert.equal((await call(e,'/api/service-reminders/settings',people.worker,'PUT',{version:0,settings:defaults.settings})).status,403);
 for(const [id,date] of [['working','2026-10-21']])await good(await call(e,'/api/jobs/'+id,people.owner,'PUT',{version:0,title:id,jobType:'installation',assignedTo:people.worker.id,dueDate:date,status:'planned'}));
 assert.equal((await good(await call(e,'/api/service-reminders/check',people.owner,'POST'))).created,1);assert.equal(e.sqlite.prepare("SELECT resource_id FROM notifications WHERE kind='job_reminder'").get().resource_id,'working');
 await good(await call(e,'/api/jobs/calendar',people.owner,'PUT',{version:0,title:'Nová realizace s kratším předstihem',jobType:'installation',assignedTo:people.worker.id,dueDate:'2026-10-20',status:'planned'}));
 const config={...defaults.settings,dayMode:'calendar'},saved=await good(await call(e,'/api/service-reminders/settings',people.owner,'PUT',{version:0,settings:config}));assert.equal(saved.version,1);assert.equal((await call(e,'/api/service-reminders/settings',people.owner,'PUT',{version:0,settings:config})).status,409);assert.equal((await call(e,'/api/service-reminders/settings',people.owner,'PUT',{version:1,settings:{...config,days:61}})).status,400);
 assert.equal((await good(await call(e,'/api/service-reminders/check',people.owner,'POST'))).created,1);assert.equal((await good(await call(e,'/api/service-reminders/check',people.owner,'POST'))).created,0);assert.equal(e.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE kind='job_reminder'").get().n,2);
 stamp=OriginalDate.parse('2026-10-17T09:00:00Z');await good(await call(e,'/api/jobs/weekend-late',people.owner,'PUT',{version:0,title:'Nová realizace o víkendu',jobType:'installation',assignedTo:people.worker.id,dueDate:'2026-10-20',status:'planned'}));assert.equal((await good(await call(e,'/api/service-reminders/check',people.owner,'POST'))).created,0);
 stamp=OriginalDate.parse('2026-10-19T09:00:00Z');assert.equal((await good(await call(e,'/api/service-reminders/check',people.owner,'POST'))).created,1);
 await good(await call(e,'/api/service-reminders/settings',people.owner,'PUT',{version:1,settings:{...config,enabled:false}}));assert.equal((await good(await call(e,'/api/service-reminders/check',people.owner,'POST'))).disabled,true);assert.ok(!JSON.stringify(await good(await call(e,'/api/notifications',people.worker))).includes('job_reminder'));
 }finally{globalThis.Date=OriginalDate;e?.sqlite.close();}
});
