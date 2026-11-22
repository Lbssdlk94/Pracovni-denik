import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment, people, request} from './fixtures.mjs';
import {termSpan} from '../web/planning-model.js';

test('Single-day and multi-day plans save minutes and clocks, not a new duration column', async ()=>{
  const env = environment();
  const ctx = {waitUntil(task){return task.catch(()=>{});}};
  const call = (path, person, method, body)=>api(request(path, person, method, body), env, ctx).then(async response=>({status:response.status, body:await response.json()}));
  try{
    assert.equal((await call('/api/me', people.owner)).status, 200);
    const one = await call('/api/jobs/duration-one', people.owner, 'PUT', {version:0, title:'Servis ventilu', jobType:'service', status:'planned', dueDate:'2026-11-24', assignedTo:people.owner.id, assignedTos:[people.owner.id], plannedStart:'08:00', estimatedMinutes:90});
    assert.equal(one.status, 200, JSON.stringify(one.body));
    assert.equal(one.body.job.estimatedMinutes, 90);
    assert.equal(env.sqlite.prepare('SELECT estimated_minutes FROM jobs WHERE id=?').get('duration-one').estimated_minutes, 90);
    const edited = await call('/api/jobs/duration-one', people.owner, 'PUT', {version:one.body.job.version, title:'Servis ventilu', jobType:'service', status:'planned', dueDate:'2026-11-24', assignedTo:people.owner.id, assignedTos:[people.owner.id], plannedStart:'08:00', estimatedMinutes:45});
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.job.estimatedMinutes, 45);
    const columns = env.sqlite.prepare('PRAGMA table_info(jobs)').all().map(column=>column.name);
    assert.equal(columns.includes('estimated_minutes'), true);
    assert.equal(columns.includes('estimated_hours'), false);
    const terms = [
      {date:'2026-11-24', start:'07:00', end:'15:00', people:[people.owner.id], note:'', status:'planned'},
      {date:'2026-11-25', start:'08:00', end:'10:30', people:[people.owner.id], note:'Kratší den', status:'planned'}
    ];
    const multi = await call('/api/jobs/duration-multi', people.owner, 'PUT', {version:0, title:'Realizace', jobType:'installation', status:'planned', dueDate:'2026-11-24', assignedTo:people.owner.id, assignedTos:[people.owner.id], plannedStart:'07:00', estimatedMinutes:60, terms});
    assert.equal(multi.status, 200, JSON.stringify(multi.body));
    const detail = await call('/api/jobs/duration-multi', people.owner);
    assert.equal(detail.body.job.estimatedMinutes, 60);
    assert.deepEqual(detail.body.job.terms.map(term=>[term.date, term.start, term.end]), [['2026-11-24','07:00','15:00'],['2026-11-25','08:00','10:30']]);
    assert.equal(detail.body.job.terms.reduce((sum, term)=>sum+(termSpan(term.start, term.end)||0), 0), 630);
    assert.equal(detail.body.job.terms.every(term=>term.workedMs===0), true);
    const stored = env.sqlite.prepare('SELECT term_date, start_time, end_time FROM job_terms WHERE job_id=? ORDER BY sort_order').all('duration-multi');
    assert.deepEqual(stored.map(row=>({date:row.term_date, start:row.start_time, end:row.end_time})), [
      {date:'2026-11-24', start:'07:00', end:'15:00'},
      {date:'2026-11-25', start:'08:00', end:'10:30'}
    ]);
    for(const table of env.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%attendance%'").all()){
      assert.equal(env.sqlite.prepare('SELECT count(*) n FROM '+table.name).get().n, 0, table.name);
    }
  }finally{env.sqlite.close();}
});
