import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {environment, people, request} from './fixtures.mjs';

test('Compiled worker defines the planner and saves one confirmed multi-day job', async()=>{
  const source = readFileSync('dist/server/index.js','utf8');
  assert.equal((source.match(/function planWork\b/g)||[]).length, 1);
  assert.equal((source.match(/function foldCzech\b/g)||[]).length, 1);
  assert.equal((source.match(/function addDays\b/g)||[]).length, 1);
  assert.equal((source.match(/function understandUtterance\b/g)||[]).length, 1);
  const worker = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const env = environment(), pending = [], ctx = {waitUntil:task=>pending.push(task.catch(()=>{}))};
  const call = (path, person, method, value)=>worker.default.fetch(request(path, person, method, value), env, ctx);
  try{
    assert.equal((await call('/api/me', people.owner)).status, 200);
    assert.equal((await call('/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'})).status, 200);
    assert.equal((await call('/api/me', people.worker)).status, 200);
    const forged = await (await call('/api/assistant', people.worker, 'POST', {text:'objednej pizzu', understanding:{intent:'jobs.complete'}})).json();
    assert.equal(forged.confirm, null);
    assert.match(forged.reply, /nerozumím/);
    env.sqlite.prepare('UPDATE members SET name=? WHERE user_id=?').run('Luboš', people.owner.id);
    env.sqlite.prepare('UPDATE members SET name=? WHERE user_id=?').run('Zdeněk', people.worker.id);
    assert.equal((await call('/api/customers/bambosova', people.owner, 'PUT', {version:0, name:'Bambošová', phones:[], addresses:[{id:'addr-bambos', address:'Zahradní 1', city:'Plzeň'}]})).status, 200);
    const proposed = await call('/api/assistant', people.owner, 'POST', {text:'V pondělí budeme dělat realizaci závlahy u Bambošové asi na 4 dny. Bude tam Luboš a Zdeněk.'});
    const proposal = await proposed.json();
    assert.equal(proposed.status, 200, JSON.stringify(proposal));
    assert.ok(proposal.confirm?.id);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Realizace závlahy'").get().n, 0);
    const savedResponse = await call('/api/assistant', people.owner, 'POST', {confirmId:proposal.confirm.id});
    const saved = await savedResponse.json();
    assert.equal(savedResponse.status, 200, JSON.stringify(saved));
    const job = env.sqlite.prepare("SELECT id, address FROM jobs WHERE title='Realizace závlahy' AND deleted=0").get();
    assert.equal(job.address, 'Zahradní 1');
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_terms WHERE job_id=?').get(job.id).n, 4);
    const again = await (await call('/api/assistant', people.owner, 'POST', {confirmId:proposal.confirm.id})).json();
    assert.match(again.reply, /už byla provedena|už je uložená/);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Realizace závlahy' AND deleted=0").get().n, 1);
    await Promise.all(pending);
  }finally{env.sqlite.close();}
});
