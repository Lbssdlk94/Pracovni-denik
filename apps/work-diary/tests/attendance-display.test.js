import test from 'node:test';import assert from 'node:assert/strict';
import {attendanceDisplayDays} from '../web/job-time-model.js';
import {attendanceMonthBounds,attendanceInstant} from '../web/attendance-model.js';
const at=attendanceInstant,bounds=attendanceMonthBounds('2026-10'),shift=(id,start,end)=>({id,userId:'p',userName:'Pracovník',startAt:at(start),endAt:end?at(end):null});
test('Display partitions overnight and DST days using actual timestamps and keeps unassigned time separate',()=>{
 const s=shift('s','2026-10-24T22:00','2026-10-25T05:00'),interval={...s,id:'i',kind:'work',startAt:at('2026-10-24T23:00'),endAt:at('2026-10-25T04:00')};
 const days=attendanceDisplayDays([s],[interval],bounds,at('2026-10-26T08:00'));assert.equal(days.length,2);assert.equal(days.reduce((n,d)=>n+d.grossMs,0),8*3600000);assert.equal(days.reduce((n,d)=>n+d.workMs,0),6*3600000);assert.equal(days.flatMap(d=>d.slices).filter(s=>s.kind==='unallocated').reduce((n,s)=>n+s.endAt-s.startAt,0),2*3600000);
});
test('Overlapping shifts/activities never inflate confirmed time; open shifts remain provisional',()=>{
 const a=shift('a','2026-10-20T08:00','2026-10-20T10:00'),b=shift('b','2026-10-20T09:00','2026-10-20T11:00');const [day]=attendanceDisplayDays([a,b],[],bounds,at('2026-10-21T08:00'));assert.equal(day.grossMs,3*3600000);assert.equal(day.confirmedMs,2*3600000);assert.ok(day.issues.includes('Překrývající se směny'));
 const [open]=attendanceDisplayDays([shift('open','2026-10-21T07:00',null)],[],bounds,at('2026-10-21T08:00'));assert.equal(open.netMs,3600000);assert.equal(open.confirmedMs,0);assert.equal(open.open,true);
});
