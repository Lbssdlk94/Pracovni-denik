import test from 'node:test';
import assert from 'node:assert/strict';
import {pickFieldFocus, fieldPrimaryAction, fieldElapsed, jobsOnDay} from '../web/field-today.js';

const job=(id, status='planned')=>({id, status, title:id, customerName:id, plannedStart:'08:00'});

test('Dnešní karta bere otevřený interval a při více zakázkách nehádá',()=>{
  const mine={id:'a', status:'in_progress', title:'Ventily', customerName:'Petr'};
  const other=job('b','planned');
  const focus=pickFieldFocus({myState:{active:{jobId:'a', kind:'work', startAt:1}}, currentJob:mine, todayJobs:[other, mine]});
  assert.equal(focus.mode,'current');
  assert.equal(focus.job.id,'a');
  assert.equal(pickFieldFocus({todayJobs:[job('a'), job('b')]}).mode,'choose');
  assert.equal(pickFieldFocus({todayJobs:[job('only')]}).job.id,'only');
  assert.equal(pickFieldFocus({todayJobs:[job('done','done')]}).mode,'empty');
  assert.equal(pickFieldFocus({myState:{active:{jobId:'unavailable', kind:'work'}}, todayJobs:[job('a'), job('b')]}).mode,'choose');
});

test('Ukončení práce není dokončení zakázky ani odchod z docházky',()=>{
  const running={id:'a', status:'in_progress', serviceApproval:'confirmed'};
  const stop=fieldPrimaryAction(running,{canWrite:true, myTime:{active:{jobId:'a', kind:'work'}}});
  assert.equal(stop.label,'Ukončit práci');
  assert.equal(stop.kind,'advance');
  assert.notEqual(stop.label,'Hotovo');
  assert.doesNotMatch(stop.label,/docház/i);
  const travel=fieldPrimaryAction({id:'a', status:'on_way', serviceApproval:'confirmed'},{canWrite:true, myTime:{active:{jobId:'a', kind:'travel'}}});
  assert.equal(travel.label,'Zahájit práci');
  const depart=fieldPrimaryAction({id:'a', status:'planned', serviceApproval:'confirmed'},{canWrite:true, travelEnabled:true});
  assert.equal(depart.label,'Vyjet');
  const writing=fieldPrimaryAction({id:'a', status:'in_progress', serviceApproval:'confirmed'},{canWrite:true});
  assert.equal(writing.kind,'assistant');
  assert.equal(writing.label,'Zapsat práci');
  const paused=fieldPrimaryAction({id:'a', status:'in_progress', serviceApproval:'confirmed'},{canWrite:true, myTime:{active:{jobId:'a', kind:'break'}}});
  assert.equal(paused.label,'Pokračovat v práci');
  assert.equal(fieldElapsed(0, 90*60000),'1 h 30 min');
  assert.deepEqual(jobsOnDay([{id:'due', dueDate:'2026-11-23'},{id:'term', dueDate:'2026-11-01', schedule:{dates:['2026-11-01','2026-11-23']}},{id:'other', dueDate:'2026-11-02'}],'2026-11-23').map(job=>job.id),['due','term']);
});

