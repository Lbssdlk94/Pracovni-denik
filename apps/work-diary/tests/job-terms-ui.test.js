import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTermDates} from '../web/job-terms-ui.js';
import {planWork, revisePlan} from '../web/job-plan.js';
import {api} from '../worker/api.js';
import {environment, people, request} from './fixtures.mjs';

test('Work days skip the weekend unless it is included', ()=>{
  assert.deepEqual(buildTermDates('2026-11-27', 3, false), ['2026-11-27','2026-11-30','2026-12-01']);
  assert.deepEqual(buildTermDates('2026-11-27', 3, true), ['2026-11-27','2026-11-28','2026-11-29']);
});

test('Assistant revisions understand the multi-day phrases', ()=>{
  const plan = planWork('V pondělí začneme realizaci závlahy u Bambošové na čtyři dny. Bude tam Luboš a Zdeněk.', '2026-11-22');
  assert.equal(plan.terms.length, 4);
  const skipped = revisePlan(plan, 'Ve středu tam nepojedeme, pokračujeme ve čtvrtek.');
  assert.equal(skipped.terms.some(term=>new Date(term.date+'T12:00:00Z').getUTCDay()===3), false);
  assert.equal(skipped.terms.length, 3);
  const thursday = revisePlan(skipped, 'Ve čtvrtek tam bude pouze Zdeněk.');
  assert.deepEqual(thursday.terms.find(term=>new Date(term.date+'T12:00:00Z').getUTCDay()===4).people, ['Zdeněk']);
  const longer = revisePlan(thursday, 'Prodluž zakázku o dva dny.');
  assert.equal(longer.terms.length, 5);
});

test('Manual multi-day job stays one record, can move one day, and a title edit keeps the days', async()=>{
  const env = environment();
  const ctx = {waitUntil(task){return task.catch(()=>{});}};
  const call = (path, person, method, body)=>api(request(path, person, method, body), env, ctx).then(async response=>({status:response.status, body:await response.json()}));
  try{
    assert.equal((await call('/api/me', people.owner)).status, 200);
    assert.equal((await call('/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'})).status, 200);
    assert.equal((await call('/api/me', people.worker)).status, 200);
    const terms = [
      {date:'2026-11-23', start:'07:00', end:'15:00', people:[people.owner.id, people.worker.id], note:'', status:'planned'},
      {date:'2026-11-24', start:'07:00', end:'15:00', people:[people.owner.id], note:'', status:'planned'},
      {date:'2026-11-26', start:'07:00', end:'15:00', people:[people.owner.id], note:'', status:'planned'},
      {date:'2026-11-27', start:'07:00', end:'12:00', people:[people.worker.id], note:'Kratší den', status:'planned'}
    ];
    const created = await call('/api/jobs/multi-job', people.owner, 'PUT', {version:0, title:'Realizace závlahy', jobType:'installation', status:'planned', dueDate:'2026-11-23', assignedTo:people.owner.id, assignedTos:[people.owner.id, people.worker.id], terms});
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const friday = await call('/api/jobs?order=schedule&state=all&month=2026-11&day=2026-11-27', people.owner);
    assert.equal(friday.body.jobs.filter(job=>job.id==='multi-job').length, 1);
    assert.equal(friday.body.jobs.find(job=>job.id==='multi-job').schedule.days, 4);
    const renamed = await call('/api/jobs/multi-job', people.owner, 'PUT', {version:created.body.job.version, title:'Realizace závlahy – Bambošová', jobType:'installation', status:'planned', dueDate:'2026-11-23', assignedTo:people.owner.id, assignedTos:[people.owner.id, people.worker.id]});
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_terms WHERE job_id=?').get('multi-job').n, 4);
    const moved = terms.map(term=>term.date==='2026-11-24'?{...term, date:'2026-11-25', note:'Přesunuto'}:term);
    const saved = await call('/api/jobs/multi-job', people.owner, 'PUT', {version:renamed.body.job.version, title:'Realizace závlahy – Bambošová', jobType:'installation', status:'planned', dueDate:'2026-11-23', assignedTo:people.owner.id, assignedTos:[people.owner.id, people.worker.id], terms:moved.map((term,index)=>index===0?{...term, status:'done'}:term)});
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.job.status, 'planned');
    const detail = await call('/api/jobs/multi-job', people.owner);
    assert.equal(detail.body.job.terms.find(term=>term.date==='2026-11-23').status, 'done');
    assert.equal(detail.body.job.terms.some(term=>term.date==='2026-11-25'), true);
    assert.equal(detail.body.job.terms.find(term=>term.date==='2026-11-23').workedMs, 0);
  }finally{env.sqlite.close();}
});
