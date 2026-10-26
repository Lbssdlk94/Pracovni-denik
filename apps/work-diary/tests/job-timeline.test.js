import test from 'node:test';
import assert from 'node:assert/strict';
import {buildJobTimeline,moveTimelineDay,timelineMinute} from '../web/job-timeline-model.js';
const job=(id,startTime,endTime,extra={})=>({id,startTime,endTime,assignedTo:'a',assignedTos:['a'],plannedStart:startTime,estimatedMinutes:startTime&&endTime?(timelineMinute(endTime)-timelineMinute(startTime)):null,...extra});
test('Timeline packs overlaps into tracks, adjacent visits share a track, shared jobs keep separate employee rows',()=>{
 const jobs=[job('1','08:00','10:00'),job('2','09:00','11:00'),job('3','10:00','12:00'),job('4','12:00','13:00',{assignedTos:['a','b']})],people=[{id:'a',name:'Adam'},{id:'b',name:'Bára'}],r=buildJobTimeline(jobs,people);assert.equal(r.rows.length,2);assert.equal(r.rows[0].tracks,2);assert.deepEqual(r.rows[0].events.map(e=>e.track),[0,1,0,0]);assert.deepEqual(r.rows[0].events.map(e=>e.overlap),[true,true,true,false]);assert.equal(r.rows[1].events[0].job.id,'4');assert.equal(r.overlapCount,3);assert.equal(r.timedCount,4);
 const adjacent=buildJobTimeline([job('a','08:00','09:00'),job('b','09:00','10:00')]);assert.equal(adjacent.rows[0].tracks,1);assert.equal(adjacent.overlapCount,0);
 const nested=buildJobTimeline([job('a','08:00','12:00'),job('b','09:00','11:00'),job('c','09:30','10:00')]);assert.equal(nested.rows[0].tracks,3);
 const worker=buildJobTimeline(jobs,[],{id:'b',name:'Bára'});assert.equal(worker.rows.length,1);assert.equal(worker.rows[0].name,'Bára');assert.equal(worker.timedCount,1);
});
test('Timeline never fabricates missing end times, preserves exact positions and includes midnight/late visits',()=>{
 const r=buildJobTimeline([job('early','00:00','00:30'),job('late','23:15','23:59'),job('partial','08:00','',{plannedStart:''}),job('none','',''),job('invalid','24:00','25:00'),job('backward','12:00','11:00',{plannedStart:''})]);assert.equal(r.from,0);assert.equal(r.to,1440);assert.equal(r.untimed.length,4);assert.equal(r.rows[0].events[0].left,0);assert.equal(r.rows[0].events[0].width,30/1440*100);assert.equal(r.rows[0].events[1].left,1395/1440*100);assert.equal(timelineMinute('00:00'),0);assert.equal(timelineMinute('23:59'),1439);assert.equal(timelineMinute('24:00'),null);
 const duplicate=buildJobTimeline([job('a','08:00','09:00'),job('a','08:00','09:00')]);assert.equal(duplicate.timedCount,1);assert.equal(duplicate.rows[0].events.length,1);
});
test('Day navigation handles month/year boundaries, leap days and supported date limits',()=>{assert.equal(moveTimelineDay('2026-12-31',1),'2027-01-01');assert.equal(moveTimelineDay('2028-02-28',1),'2028-02-29');assert.equal(moveTimelineDay('2026-03-01',-1),'2026-02-28');assert.equal(moveTimelineDay('1000-01-01',-1),'1000-01-01');assert.equal(moveTimelineDay('9999-12-31',1),'9999-12-31');});

test("Legacy arrival-like windows and unknown duration never manufacture work conflicts",()=>{const r=buildJobTimeline([job("old","08:00","12:00",{plannedStart:"",estimatedMinutes:null}),job("known","09:00","10:00"),job("unknown","09:15","",{estimatedMinutes:null})]);assert.equal(r.overlapCount,0);assert.equal(r.legacyCount,1);assert.equal(r.missingDurationCount,1);});
