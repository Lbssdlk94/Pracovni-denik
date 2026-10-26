import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,path,person=people.worker,method='GET',value)=>api(request(path,person,method,value),env,ctx),month='/api/attendance?month=2026-10';
async function setup(){const env=environment();await call(env,'/api/me',people.owner);for(const role of ['admin','worker','reader']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}return env;}
async function clock(task){const original=Date.now;let now=Date.parse('2026-10-14T06:00:00Z');Date.now=()=>now;try{await task(value=>{now=Date.parse(value);});}finally{Date.now=original;}}
const punch=(env,id,kind='arrival',extra={})=>call(env,'/api/attendance/punch',people.worker,'POST',{mutationId:id,kind,position:{latitude:50,longitude:14,accuracy:5},gpsStatus:'captured',...extra});
const deletion=(env,id,version=2,person=people.worker,shiftId='shift')=>call(env,'/api/attendance/corrections',person,'POST',{id,kind:'delete',shiftId,version,reason:'Omylem zapsaná směna'});
const review=(env,id,decision='approve',person=people.admin,extra={})=>call(env,'/api/attendance/corrections/'+id+'/review',person,'POST',{decision,kind:'delete',...extra});
test('Deletion needs an approved request; rejected requests and old clients cannot erase hours',()=>clock(async set=>{
 const env=await setup();await punch(env,'shift');set('2026-10-14T14:00:00Z');await punch(env,'end','departure',{shiftId:'shift',version:1});
 assert.equal((await deletion(env,'other-user',2,people.reader)).status,403);assert.equal((await call(env,'/api/attendance/shift',people.worker,'DELETE')).status,404);
 assert.equal((await deletion(env,'delete-1')).status,200);assert.equal((await deletion(env,'delete-1')).status,200);let data=await(await call(env,month)).json();assert.equal(data.shifts.length,1);assert.equal(data.overview.todayMs,8*3600000);assert.equal(data.summary[0].durationMs,8*3600000);assert.equal(data.pendingCorrections[0].kind,'delete');assert.equal(JSON.stringify(data).includes('latitude'),false);
 assert.equal((await review(env,'delete-1','approve',people.worker)).status,403);assert.equal((await review(env,'delete-1','reject')).status,200);assert.equal((await(await call(env,month)).json()).summary[0].durationMs,8*3600000);
 // Even a manager creates a pending request; the explicit approval is a separate action.
 assert.equal((await deletion(env,'delete-2',2,people.admin)).status,200);assert.equal((await(await call(env,month)).json()).shifts.length,1);
 assert.equal((await call(env,'/api/attendance/corrections/delete-2/review',people.admin,'POST',{decision:'approve'})).status,400);assert.equal((await review(env,'delete-2')).status,200);assert.equal((await review(env,'delete-2')).status,409);
 data=await(await call(env,month)).json();assert.equal(data.shifts.length,0);assert.equal(data.activeShift,null);assert.equal(data.overview.todayMs,0);assert.equal(data.overview.monthMs,0);assert.equal(data.summary[0].durationMs,0);assert.equal(data.pendingCorrections.length,0);assert.ok(data.corrections.some(c=>c.kind==='delete'&&c.status==='approved'&&c.oldStartAt===Date.parse('2026-10-14T06:00:00Z')));
 const row=env.sqlite.prepare('SELECT * FROM attendance_shifts WHERE id=?').get('shift');assert.equal(row.deleted_at,Date.now());assert.equal(row.start_position,null);assert.equal(row.end_position,null);
 assert.equal((await punch(env,'shift')).status,409);assert.equal((await call(env,'/api/attendance/corrections',people.worker,'POST',{id:'revive',shiftId:'shift',version:row.version,startAt:row.start_at,endAt:row.end_at,reason:'Zastaralý klient'})).status,409);
}));
test('Approved removal of an open shift resets presence and allows a new arrival',()=>clock(async set=>{
 const env=await setup();await punch(env,'shift');set('2026-10-14T08:00:00Z');assert.equal((await deletion(env,'delete-live',1)).status,200);assert.equal((await(await call(env,'/api/me')).json()).attendance.active,true);assert.equal((await(await call(env,month)).json()).overview.todayMs,2*3600000);await review(env,'delete-live');
 assert.equal((await(await call(env,'/api/me')).json()).attendance.active,false);assert.equal((await(await call(env,month)).json()).overview.todayMs,0);assert.equal((await punch(env,'new-arrival')).status,200);assert.equal((await punch(env,'duplicate')).status,409);
 // The tombstone neither blocks an earlier manual shift nor resurrects through a retry.
 const manual={id:'restore-earlier',shiftId:'earlier',version:0,startAt:Date.parse('2026-10-14T06:00:00Z'),endAt:Date.parse('2026-10-14T07:00:00Z'),reason:'Skutečně odpracovaná hodina'};assert.equal((await call(env,'/api/attendance/corrections',people.worker,'POST',manual)).status,200);assert.equal((await call(env,'/api/attendance/corrections/restore-earlier/review',people.admin,'POST',{decision:'approve'})).status,200);assert.equal((await(await call(env,month)).json()).overview.todayMs,3600000);
}));
test('Deletion cannot approve a shift changed after the request, including a race inside the batch',()=>clock(async set=>{
 const env=await setup();await punch(env,'shift');set('2026-10-14T08:00:00Z');await deletion(env,'stale-delete',1);await punch(env,'end','departure',{shiftId:'shift',version:1});assert.equal((await review(env,'stale-delete')).status,409);assert.equal((await(await call(env,month)).json()).summary[0].durationMs,2*3600000);await review(env,'stale-delete','reject');await deletion(env,'race-delete',2);
 const batch=env.DB.batch.bind(env.DB);let first=true;env.DB.batch=async statements=>{if(first){first=false;env.sqlite.prepare('UPDATE attendance_shifts SET version=version+1 WHERE id=?').run('shift');}return batch(statements);};assert.equal((await review(env,'race-delete')).status,409);assert.equal(env.sqlite.prepare('SELECT deleted_at FROM attendance_shifts WHERE id=?').get('shift').deleted_at,null);assert.equal(env.sqlite.prepare('SELECT status FROM attendance_corrections WHERE id=?').get('race-delete').status,'pending');
}));

test('Deletion migration preserves existing shifts and defaults older requests to time edits',()=>{
 const db=new DatabaseSync(':memory:'),entries=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')).entries;
 for(const e of entries.filter(e=>e.idx<9))db.exec(readFileSync('drizzle/'+e.tag+'.sql','utf8'));
 db.exec("INSERT INTO attendance_shifts(id,user_id,user_name,start_at,start_gps_status,version,created_at,updated_at) VALUES('old-shift','old-user','Kolega',1000,'denied',1,1000,1000)");
 db.exec("INSERT INTO attendance_corrections(id,shift_id,user_id,user_name,base_version,old_start_at,proposed_start_at,reason,status,created_by,created_at) VALUES('old-edit','old-shift','old-user','Kolega',1,1000,2000,'Oprava','pending','old-user',2000)");
 db.exec(readFileSync('drizzle/'+entries.find(e=>e.idx===9).tag+'.sql','utf8'));const shift=db.prepare('SELECT * FROM attendance_shifts').get(),edit=db.prepare('SELECT * FROM attendance_corrections').get();assert.equal(shift.start_at,1000);assert.equal(shift.deleted_at,null);assert.equal(edit.kind,'edit');assert.equal(edit.status,'pending');assert.equal(edit.proposed_start_at,2000);db.close();
});
