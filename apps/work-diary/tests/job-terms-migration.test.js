import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {api} from '../worker/api.js';
import {environment, people, request} from './fixtures.mjs';

test('0059, 0060 and 0061 apply after 0058 without rewriting the job', async()=>{
  const env = environment(':memory:', 58);
  const ctx = {waitUntil:task=>task.catch(()=>{})};
  try{
    assert.equal((await api(request('/api/me', people.owner), env, ctx)).status, 200);
    assert.equal((await api(request('/api/jobs/kept', people.owner, 'PUT', {version:0, title:'Původní', assignedTo:people.owner.id, status:'planned', dueDate:'2026-11-02', address:'Stará adresa'}), env, ctx)).status, 200);
    const before = env.sqlite.prepare('SELECT * FROM jobs WHERE id=?').get('kept');
    for(const tag of ['0059_attendance_activities','0060_protocol_design','0061_job_terms']){
      for(const sql of readFileSync('drizzle/'+tag+'.sql','utf8').split('--> statement-breakpoint')) if(sql.trim()) env.sqlite.exec(sql);
    }
    const after = env.sqlite.prepare('SELECT * FROM jobs WHERE id=?').get('kept');
    assert.equal(after.title, before.title);
    assert.equal(after.address, 'Stará adresa');
    assert.equal(after.status, before.status);
    assert.equal(after.version, before.version);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_terms').get().n, 0);
    const bad = await api(request('/api/jobs/broken', people.owner, 'PUT', {version:0, title:'Rozbitá', assignedTo:people.owner.id, status:'planned', dueDate:'2026-11-03', terms:[{date:'ne-datum'}]}), env, ctx);
    assert.equal(bad.status, 400);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE id='broken'").get().n, 0);
  }finally{env.sqlite.close();}
});
