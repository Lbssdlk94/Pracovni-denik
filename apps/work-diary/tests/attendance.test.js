import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';import {DEFAULT_FEATURES} from '../web/features.js';
import {attendanceLocal,attendanceInstant,attendanceDuration,attendanceMonthBounds,attendanceOverview,attendanceDayBounds} from '../web/attendance-model.js';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,path,person=people.worker,method='GET',value)=>api(request(path,person,method,value),env,ctx),month='/api/attendance?month=2026-10',position={latitude:50.087,longitude:14.421,accuracy:6};
async function setup(){const env=environment();await call(env,'/api/me',people.owner);for(const role of ['admin','worker','reader']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}return env;}
async function clock(task){const original=Date.now;let now=Date.parse('2026-10-14T06:00:00Z');Date.now=()=>now;try{await task(ms=>{now=typeof ms==='string'?Date.parse(ms):ms;});}finally{Date.now=original;}}
const punch=(env,id,kind='arrival',extra={})=>call(env,'/api/attendance/punch',people.worker,'POST',{mutationId:id,kind,position,gpsStatus:'captured',...extra});
test('Attendance protects identities and GPS on the server, captures server time and deduplicates punches',()=>clock(async set=>{
 const env=await setup();assert.equal((await api(request(month),env,ctx)).status,401);for(const scope of ['all',people.reader.id])assert.equal((await call(env,month+'&userId='+scope)).status,403);
 assert.equal((await punch(env,'spoof','arrival',{userId:people.reader.id})).status,403);
 const arrived=await punch(env,'arrival');assert.equal(arrived.status,200);const first=(await arrived.json()).shift;assert.equal(first.startAt,Date.now());assert.equal(Object.hasOwn(first,'startPosition'),false);
 assert.equal((await punch(env,'arrival')).status,200);assert.equal((await punch(env,'duplicate')).status,409);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,1);
 const own=await(await call(env,month)).json();assert.equal(own.shifts.length,1);assert.equal(JSON.stringify(own).includes('latitude'),false);assert.equal(Object.hasOwn(own,'employees'),false);assert.equal(own.summary[0].durationMs,0);
 const admin=await(await call(env,month+'&userId=all',people.admin)).json();assert.deepEqual(admin.shifts[0].startPosition,position);assert.equal(admin.shifts[0].recordedStartAt,first.startAt);assert.equal((await(await call(env,month,people.reader)).json()).shifts.length,0);
 set('2026-10-14T14:00:00Z');assert.equal((await punch(env,'end','departure',{shiftId:'arrival',version:1,position:null,gpsStatus:'denied'})).status,200);assert.equal((await punch(env,'end','departure',{shiftId:'arrival',version:1,position:null,gpsStatus:'denied'})).status,200);assert.equal((await punch(env,'new-end','departure',{shiftId:'arrival',version:1})).status,409);
 const result=await(await call(env,month)).json();assert.equal(result.summary[0].durationMs,8*3600000);assert.equal(result.shifts[0].endGpsStatus,'denied');assert.equal(result.activeShift,null);
 // A read-only irrigation colleague can still record their own attendance.
 assert.equal((await call(env,'/api/attendance/punch',people.reader,'POST',{kind:'arrival',mutationId:'reader-arrival',position:null,gpsStatus:'unavailable'})).status,200);
}));
test('Corrections affect totals only after manager approval and retain original GPS and audit history',()=>clock(async set=>{
 const env=await setup();await punch(env,'shift');set('2026-10-14T16:00:00Z');await punch(env,'end','departure',{shiftId:'shift',version:1});
 const propose={id:'edit1',shiftId:'shift',version:2,startAt:Date.parse('2026-10-14T07:00:00Z'),endAt:Date.parse('2026-10-14T15:00:00Z'),reason:'Zapomněl jsem zaznamenat správný čas.'};
 assert.equal((await call(env,'/api/attendance/corrections',people.reader,'POST',propose)).status,403);assert.equal((await call(env,'/api/attendance/corrections',people.worker,'POST',propose)).status,200);assert.equal((await call(env,'/api/attendance/corrections',people.worker,'POST',propose)).status,200);
 assert.equal((await(await call(env,month)).json()).summary[0].durationMs,10*3600000);assert.equal((await call(env,'/api/attendance/corrections/edit1/review',people.worker,'POST',{decision:'approve'})).status,403);
 assert.equal((await call(env,'/api/attendance/corrections/edit1/review',people.admin,'POST',{decision:'reject',note:'Nesprávný čas'})).status,200);assert.equal((await(await call(env,month)).json()).summary[0].durationMs,10*3600000);
 await call(env,'/api/attendance/corrections',people.worker,'POST',{...propose,id:'edit2'});assert.equal((await call(env,'/api/attendance/corrections/edit2/review',people.admin,'POST',{decision:'approve'})).status,200);assert.equal((await call(env,'/api/attendance/corrections/edit2/review',people.owner,'POST',{decision:'approve'})).status,409);
 const own=await(await call(env,month)).json();assert.equal(own.summary[0].durationMs,8*3600000);assert.equal(own.shifts[0].version,3);assert.equal(JSON.stringify(own).includes('latitude'),false);assert.deepEqual(own.corrections.map(c=>c.status).sort(),['approved','rejected']);
 const admin=await(await call(env,month+'&userId=all',people.admin)).json();assert.deepEqual(admin.shifts[0].startPosition,position);assert.equal(admin.shifts[0].recordedStartAt,Date.parse('2026-10-14T06:00:00Z'));
}));
test('Forgotten shifts, overlaps and stale approvals cannot silently replace counted time',()=>clock(async set=>{
 const env=await setup();set('2026-10-15T16:00:00Z');const proposal={id:'manual1',shiftId:'manual-shift',version:0,startAt:Date.parse('2026-10-14T06:00:00Z'),endAt:Date.parse('2026-10-14T14:00:00Z'),reason:'Zapomenutá směna'};
 assert.equal((await call(env,'/api/attendance/corrections',people.worker,'POST',{...proposal,userId:people.reader.id})).status,403);assert.equal((await call(env,'/api/attendance/corrections',people.worker,'POST',{...proposal,endAt:Date.now()+1000})).status,400);
 await call(env,'/api/attendance/corrections',people.worker,'POST',proposal);assert.equal((await(await call(env,month)).json()).shifts.length,0);assert.equal((await call(env,'/api/attendance/corrections/manual1/review',people.admin,'POST',{decision:'approve'})).status,200);
 const saved=await(await call(env,month)).json();assert.equal(saved.summary[0].durationMs,8*3600000);assert.equal(saved.shifts[0].startGpsStatus,'manual');
 await call(env,'/api/attendance/corrections',people.worker,'POST',{...proposal,id:'overlap',shiftId:'overlap-shift'});assert.equal((await call(env,'/api/attendance/corrections/overlap/review',people.admin,'POST',{decision:'approve'})).status,409);assert.equal((await(await call(env,month)).json()).summary[0].durationMs,8*3600000);
 await punch(env,'live');await call(env,'/api/attendance/corrections',people.worker,'POST',{id:'stale',shiftId:'live',version:1,startAt:Date.now()-3600000,endAt:null,reason:'Oprava příchodu'});set('2026-10-15T17:00:00Z');await punch(env,'live-end','departure',{shiftId:'live',version:1});assert.equal((await call(env,'/api/attendance/corrections/stale/review',people.admin,'POST',{decision:'approve'})).status,409);assert.equal((await(await call(env,month)).json()).summary[0].durationMs,9*3600000);
 const before=env.sqlite.prepare('SELECT * FROM attendance_shifts').all();await call(env,'/api/features',people.owner,'PUT',{features:{...DEFAULT_FEATURES,attendance:false},version:0});assert.equal((await call(env,month)).status,403);assert.deepEqual(env.sqlite.prepare('SELECT * FROM attendance_shifts').all(),before);
 const legacy={...DEFAULT_FEATURES};delete legacy.attendance;assert.equal((await call(env,'/api/features',people.owner,'PUT',{features:legacy,version:1})).status,200);assert.equal((await(await call(env,'/api/features',people.owner)).json()).features.attendance,false);
}));
test('Prague month boundaries, overnight work and daylight saving use elapsed time',()=>{
 assert.equal(attendanceLocal(Date.parse('2026-07-01T06:00Z')),'2026-07-01T08:00');assert.throws(()=>attendanceInstant('2026-03-29T02:30'));assert.throws(()=>attendanceInstant('2026-10-25T02:30'));assert.throws(()=>attendanceMonthBounds('2026-13'));
 const shift={startAt:attendanceInstant('2026-09-30T23:00'),endAt:attendanceInstant('2026-10-01T01:00')};assert.equal(attendanceDuration(shift,'2026-09'),3600000);assert.equal(attendanceDuration(shift,'2026-10'),3600000);assert.equal(attendanceDuration({...shift,endAt:null},'2026-10'),0);
 assert.equal(attendanceInstant('2026-03-29T05:00')-attendanceInstant('2026-03-29T00:00'),4*3600000);assert.equal(attendanceInstant('2026-10-25T05:00')-attendanceInstant('2026-10-25T00:00'),6*3600000);
});

test('Dashboard counts only own approved time today and this month, including a running shift',()=>clock(async set=>{
 const env=await setup();await punch(env,'morning');set('2026-10-14T08:00:00Z');await punch(env,'morning-end','departure',{shiftId:'morning',version:1});set('2026-10-14T09:00:00Z');await punch(env,'afternoon');set('2026-10-14T10:30:00Z');
 const result=await(await call(env,month)).json();assert.equal(result.overview.todayMs,3.5*3600000);assert.equal(result.overview.monthMs,3.5*3600000);assert.equal(result.summary[0].durationMs,2*3600000);
 const proposal={id:'dashboard-edit',shiftId:'morning',version:2,startAt:Date.parse('2026-10-14T05:00:00Z'),endAt:Date.parse('2026-10-14T08:00:00Z'),reason:'Oprava začátku'};await call(env,'/api/attendance/corrections',people.worker,'POST',proposal);
 const admin=await(await call(env,month,people.admin)).json();assert.equal(admin.overview.todayMs,0);assert.equal(admin.pendingCorrections.length,1);assert.equal(admin.pendingCorrections[0].userId,people.worker.id);assert.equal(admin.corrections.length,0);
 const reader=await(await call(env,month,people.reader)).json();assert.equal(reader.pendingCorrections.length,0);assert.equal(reader.overview.todayMs,0);
 const past=await(await call(env,'/api/attendance?month=2026-09')).json();assert.equal(past.overview.todayMs,result.overview.todayMs);assert.equal(past.overview.monthMs,result.overview.monthMs);assert.equal((await(await call(env,month)).json()).overview.todayMs,3.5*3600000);
 await call(env,'/api/attendance/corrections/dashboard-edit/review',people.admin,'POST',{decision:'approve'});const updated=await(await call(env,month)).json();assert.equal(updated.overview.todayMs,4.5*3600000);assert.equal(updated.pendingCorrections.length,0);
}));
test('Daily counters split overnight and month boundaries using Prague time and daylight saving',()=>{
 const t=attendanceInstant,now=t('2026-10-01T12:00'),s=[{startAt:t('2026-09-30T23:00'),endAt:t('2026-10-01T01:00')},{startAt:t('2026-10-01T10:00'),endAt:null}];const o=attendanceOverview(s,now);assert.equal(o.todayMs,3*3600000);assert.equal(o.monthMs,3*3600000);
 assert.equal(attendanceDayBounds(t('2026-03-29T12:00')).end-attendanceDayBounds(t('2026-03-29T12:00')).start,23*3600000);assert.equal(attendanceDayBounds(t('2026-10-25T12:00')).end-attendanceDayBounds(t('2026-10-25T12:00')).start,25*3600000);
 assert.equal(attendanceOverview([{startAt:t('2026-03-29T00:00'),endAt:null}],t('2026-03-29T05:00')).todayMs,4*3600000);
});

test('Startup presence is scoped to the current member and follows arrival and departure',()=>clock(async set=>{
 const env=await setup();assert.equal((await(await call(env,'/api/me')).json()).attendance.active,false);await punch(env,'startup-arrival');assert.equal((await(await call(env,'/api/me')).json()).attendance.active,true);assert.equal((await(await call(env,'/api/me',people.reader)).json()).attendance.active,false);assert.equal((await(await call(env,'/api/me',people.admin)).json()).attendance.active,false);
 set('2026-10-14T14:00:00Z');await punch(env,'startup-end','departure',{shiftId:'startup-arrival',version:1});assert.equal((await(await call(env,'/api/me')).json()).attendance.active,false);
 await punch(env,'startup-again');await call(env,'/api/features',people.owner,'PUT',{features:{...DEFAULT_FEATURES,attendance:false},version:0});assert.equal((await(await call(env,'/api/me')).json()).attendance.active,false);
}));

test('Only managers receive current staff presence, independently of the selected month or employee',()=>clock(async set=>{
 const env=await setup();await punch(env,'presence-worker');
 const arrival=Date.now();const ownerArrival=await call(env,'/api/attendance/punch',people.owner,'POST',{mutationId:'presence-owner',kind:'arrival',gpsStatus:'disabled'});assert.equal(ownerArrival.status,200);
 for(const role of ['owner','admin']){const r=await(await call(env,'/api/attendance?month=2026-09&userId='+people[role].id,people[role])).json();assert.deepEqual(r.presence,[{userId:people.worker.id,userName:people.worker.email,startAt:arrival}]);assert.equal(r.presenceAsOf,Date.now());}
 env.sqlite.prepare("UPDATE members SET role='administrator' WHERE user_id=?").run(people.admin.id);
 assert.equal((await(await call(env,month,people.admin)).json()).presence.length,1);
 for(const person of [people.worker,people.reader]){const r=await(await call(env,month,person)).json();assert.equal(r.presence,undefined);assert.equal((await call(env,month+'&userId=all',person)).status,403);}
 set('2026-10-14T08:00:00Z');await punch(env,'presence-end','departure',{shiftId:'presence-worker',version:1});assert.deepEqual((await(await call(env,month,people.owner)).json()).presence,[]);
}));
