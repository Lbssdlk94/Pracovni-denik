import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionRecovery} from '../web/connection-recovery.js';
test('Recovery has one timer/flight, backs off, resumes on reconnect and stops cleanly',async()=>{
 const timers=new Map();let id=0,calls=0,available=true,release;
 const recovery=createConnectionRecovery({run:async()=>{calls++;return false;},available:()=>available,setTimer:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimer:id=>timers.delete(id),random:()=>0});
 recovery.start();assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,120000);
 await recovery.retryNow();assert.equal(calls,1);assert.equal([...timers.values()][0].ms,6000);
 await recovery.retryNow();assert.equal(calls,2);assert.equal([...timers.values()][0].ms,12000);
 available=false;await recovery.retryNow();assert.equal(calls,2);assert.equal(timers.size,1);
 recovery.stop();assert.equal(timers.size,0);recovery.failed();assert.equal(timers.size,0);
 const parallel=createConnectionRecovery({run:()=>{calls++;return new Promise(resolve=>release=resolve);},setTimer:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimer:id=>timers.delete(id),random:()=>0});
 parallel.start();const a=parallel.retryNow(),b=parallel.retryNow();await Promise.resolve();assert.equal(calls,3);release(true);await Promise.all([a,b]);assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,120000);parallel.stop();
});
