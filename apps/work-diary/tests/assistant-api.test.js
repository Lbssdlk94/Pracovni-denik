import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment, people, request} from './fixtures.mjs';

const ctx = {waitUntil:task=>task.catch(()=>{})};
const call = (env, path, person, method='GET', value, extra)=>api(request(path, person, method, value, extra), env, ctx);
const json = async response=>{const body=await response.json().catch(()=>({}));return {status:response.status, body};};

async function ready(env){
  const me = await call(env, '/api/me', people.owner);
  assert.equal(me.status, 200, await me.clone().text());
}

test('Assistant reads existing jobs and customers and refuses deletion', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/customers/novak', people.owner, 'PUT', {version:0, name:'Novák', phones:[{number:'777111222'}], addresses:[{address:'Zahradní 1', city:'Brno'}], email:'novak@example.com'});
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const created = await call(env, '/api/jobs/job-today', people.owner, 'PUT', {version:0, title:'Kontrola čerpadla', status:'planned', dueDate:today, customerName:'Novák', incompleteReason:'', assignedTo:people.owner.id});
    assert.equal(created.status, 200, await created.clone().text());
    const jobs = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Co máme dnes za práci?', mode:'basic'}));
    assert.equal(jobs.status, 200, JSON.stringify(jobs.body));
    assert.match(jobs.body.reply, /Kontrola čerpadla/);
    assert.equal(jobs.body.confirm, null);
    const customer = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Najdi zákazníka Nováka.'}));
    assert.equal(customer.status, 200);
    assert.match(customer.body.reply, /Novák/);
    const before = env.sqlite.prepare('SELECT count(*) n FROM jobs WHERE deleted=0').get().n;
    const refused = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Smaž zakázku Novák'}));
    assert.equal(refused.status, 200);
    assert.match(refused.body.reply, /Smazání/);
    assert.equal(refused.body.confirm, null);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM jobs WHERE deleted=0').get().n, before);
    const unknown = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'objednej pizzu'}));
    assert.equal(unknown.status, 200);
    assert.ok(unknown.body.suggestions.length>=3);
  }finally{env.sqlite.close();}
});

test('Writes wait for confirmation and role preview cannot commit them', async()=>{
  const env = environment();
  try{
    await ready(env);
    const preview = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Co máme dnes za práci?'}, {'x-work-diary-preview-role':'reader'}));
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.match(preview.body.reply, /Žádná návštěva|Dnes/);
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Vytvoř zakázku Kontrola filtru'}));
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.ok(proposed.body.confirm?.id);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Kontrola filtru'").get().n, 0);
    const blocked = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}, {'x-work-diary-preview-role':'reader'}));
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'role_preview_readonly');
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Kontrola filtru'").get().n, 0);
    const done = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.match(done.body.reply, /založená/);
    assert.equal(done.body.mutated, 'jobs');
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Kontrola filtru' AND deleted=0").get().n, 1);
    const again = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(again.status, 200);
    assert.match(again.body.reply, /už byla provedena/);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Kontrola filtru' AND deleted=0").get().n, 1);
  }finally{env.sqlite.close();}
});
