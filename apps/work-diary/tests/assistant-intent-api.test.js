import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment, people, request} from './fixtures.mjs';

const ctx = {waitUntil:task=>task.catch(()=>{})};
const call = (env, path, person, method='GET', value, extra)=>api(request(path, person, method, value, extra), env, ctx);
const json = async response=>{const body=await response.json().catch(()=>({}));return {status:response.status, body};};
const day = offset=>{
  const date = new Date(new Date().toLocaleString('en-US', {timeZone:'Europe/Prague'}));
  date.setDate(date.getDate()+offset);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
};

test('Intent reads do not write and the next job comes from the real schedule', async()=>{
  const env = environment();
  try{
    assert.equal((await call(env, '/api/me', people.owner)).status, 200);
    assert.equal((await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'})).status, 200);
    assert.equal((await call(env, '/api/me', people.worker)).status, 200);
    const today = day(0), tomorrow = day(1);
    assert.equal((await call(env, '/api/jobs/job-now', people.owner, 'PUT', {version:0, title:'Dnešní filtr', status:'in_progress', dueDate:today, startTime:'08:00', customerName:'Novák', address:'Zahradní 1', city:'Brno', incompleteReason:'', assignedTo:people.worker.id})).status, 200);
    assert.equal((await call(env, '/api/jobs/job-next', people.owner, 'PUT', {version:0, title:'Pozdější ventil', status:'planned', dueDate:tomorrow, startTime:'09:30', customerName:'Dvořák', address:'Lipová 8', city:'Plzeň', incompleteReason:'', assignedTo:people.worker.id})).status, 200);
    const before = env.sqlite.prepare('SELECT count(*) n FROM jobs WHERE deleted=0').get().n;
    const phrases = ['Kam mám jet až potom?', 'Kde pak budeme pracovat?', 'kamm pojedu pootm'];
    for(const text of phrases){
      const answer = await json(await call(env, '/api/assistant', people.worker, 'POST', {text, context:{jobId:'job-now'}}));
      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      assert.match(answer.body.reply, /Pozdější ventil/);
      assert.match(answer.body.reply, /Lipová 8|Dvořák/);
      assert.equal(answer.body.confirm, null);
      assert.equal(answer.body.cards?.[0]?.id, 'job-next');
      assert.match(answer.body.cards[0].href, /^https:\/\/www\.google\.com\/maps\/search\//);
    }
    const vague = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Další práci prosím'}));
    assert.equal(vague.body.confirm, null);
    assert.match(vague.body.reply, /neodhad|konkrét/);
    const refused = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Další zakázku ještě nezačínej.'}));
    assert.equal(refused.body.confirm, null);
    assert.match(refused.body.reply, /zákaz|Nic jsem/);
    const hypothetical = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Co se stane, když zakázku dokončím?'}));
    assert.equal(hypothetical.body.confirm, null);
    assert.match(hypothetical.body.reply, /nedokončil/);
    const ending = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Končím.'}));
    assert.equal(ending.body.confirm, null);
    assert.match(ending.body.reply, /docházky/);
    assert.equal(env.sqlite.prepare("SELECT status FROM jobs WHERE id='job-now'").get().status, 'in_progress');
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM jobs WHERE deleted=0').get().n, before);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n, 0);
    const same = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Kam mám jet až potom?', context:{jobId:'job-now'}}, {'x-garden-host':'dr-garden'}));
    assert.match(same.body.reply, /Pozdější ventil/);
    assert.equal(same.body.confirm, null);
  }finally{env.sqlite.close();}
});

test('Catalog price, stock and planned material never become consumption', async()=>{
  const env = environment();
  try{
    assert.equal((await call(env, '/api/me', people.owner)).status, 200);
    assert.equal((await call(env, '/api/materials/categories/cat-lava', people.owner, 'PUT', {version:0, name:'Nové', sortOrder:3, active:true})).status, 200);
    assert.equal((await call(env, '/api/materials/items/item-lava', people.owner, 'PUT', {version:0, name:'Lavalit', categoryId:'cat-lava', sku:'LAVA', unit:'ks', priceMinor:12345, currency:'CZK', active:true})).status, 200);
    assert.equal((await call(env, '/api/materials/items/item-coarse', people.owner, 'PUT', {version:0, name:'Lavalit hrubý', categoryId:'cat-lava', sku:'LAVA-H', unit:'ks', priceMinor:100, currency:'CZK', active:true})).status, 200);
    assert.equal((await call(env, '/api/materials/items/item-fine', people.owner, 'PUT', {version:0, name:'Lavalit jemný', categoryId:'cat-lava', sku:'LAVA-J', unit:'ks', priceMinor:200, currency:'CZK', active:true})).status, 200);
    const catalogCount = env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n;
    const today = day(0);
    assert.equal((await call(env, '/api/jobs/job-lava', people.owner, 'PUT', {version:0, title:'Zkouška katalogu', status:'in_progress', jobType:'service', dueDate:today, customerName:'Novák', address:'Zahradní 1', city:'Brno', incompleteReason:'', assignedTo:people.owner.id})).status, 200);
    const price = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kolik stojí jeden lavalit?'}));
    assert.equal(price.body.confirm, null);
    assert.match(price.body.reply, /123/);
    assert.match(price.body.reply, /nezapsal/);
    const stock = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Je lavalit skladem?'}));
    assert.match(stock.body.reply, /neeviduje|nevymýšlím/);
    assert.equal(stock.body.confirm, null);
    const planned = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Budeme potřebovat čtyři lavalit.'}));
    assert.match(planned.body.reply, /plán|spotřebu/);
    assert.equal(planned.body.confirm, null);
    const used = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Použili jsme pět kusů lavalit hrubý a dva lavalit jemný.', context:{jobId:'job-lava'}}));
    assert.equal(used.status, 200, JSON.stringify(used.body));
    assert.match(used.body.reply, /hrub|jemn/i);
    assert.equal((used.body.concept?.materials||[]).filter(line=>line.status==='matched' && line.itemId).length, 2);
    assert.ok(used.body.confirm?.id);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n, 0);
    const negated = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Čtyři lavalit jsme nepoužili.'}));
    assert.equal(negated.body.confirm, null);
    assert.match(negated.body.reply, /zákaz|nezapsal|Nic jsem/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n, catalogCount);
  }finally{env.sqlite.close();}
});

test('An unknown model intent cannot bypass the server and a read hint can', async()=>{
  const env = environment();
  try{
    assert.equal((await call(env, '/api/me', people.owner)).status, 200);
    assert.equal((await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'})).status, 200);
    assert.equal((await call(env, '/api/me', people.worker)).status, 200);
    const forged = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'objednej pizzu', understanding:{intent:'jobs.complete'}}));
    assert.equal(forged.body.confirm, null);
    assert.match(forged.body.reply, /nerozumím|dostupných/);
    const hinted = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'něco nejasného', understanding:{intent:'jobs.next'}}));
    assert.equal(hinted.body.confirm, null);
    assert.match(hinted.body.reply, /nevidím|Pořadí|další/i);
  }finally{env.sqlite.close();}
});

test('Leaving for the next job waits for confirmation and does not invent a route', async()=>{
  const env = environment();
  try{
    assert.equal((await call(env, '/api/me', people.owner)).status, 200);
    assert.equal((await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'})).status, 200);
    assert.equal((await call(env, '/api/me', people.worker)).status, 200);
    env.sqlite.prepare('UPDATE members SET name=? WHERE user_id=?').run('Marek', people.worker.id);
    const today = day(0), tomorrow = day(1);
    assert.equal((await call(env, '/api/jobs/job-now', people.owner, 'PUT', {version:0, title:'Dnešní filtr', status:'in_progress', dueDate:today, startTime:'08:00', customerName:'Novák', address:'Zahradní 1', city:'Brno', incompleteReason:'', assignedTo:people.worker.id})).status, 200);
    assert.equal((await call(env, '/api/jobs/job-next', people.owner, 'PUT', {version:0, title:'Pozdější ventil', status:'planned', dueDate:tomorrow, startTime:'09:30', customerName:'Dvořák', address:'Lipová 8', city:'Plzeň', incompleteReason:'', assignedTo:people.worker.id})).status, 200);
    assert.equal((await call(env, '/api/jobs/job-open', people.owner, 'PUT', {version:0, title:'Servis bez data', status:'planned', dueDate:'', customerName:'Horák', incompleteReason:'', assignedTo:people.worker.id})).status, 200);
    for(const text of ['Jedu na další zakázku.','Jedu dál.','Vyjíždím na další práci.','Jedu k dalšímu zákazníkovi.']){
      const answer = await json(await call(env, '/api/assistant', people.worker, 'POST', {text, context:{jobId:'job-now'}}));
      assert.equal(answer.status, 200, text+' '+JSON.stringify(answer.body));
      assert.match(answer.body.reply, /Pozdější ventil/, text);
      assert.match(answer.body.reply, /na cestě/, text);
      assert.ok(answer.body.confirm?.id, text);
      assert.equal(env.sqlite.prepare("SELECT status FROM jobs WHERE id='job-next'").get().status, 'planned', text);
    }
    const shown = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Jaká je další zakázka?', context:{jobId:'job-now'}}));
    assert.equal(shown.body.confirm, null);
    assert.match(shown.body.reply, /nezměnil/);
    const proposed = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Jedu na další zakázku.', context:{jobId:'job-now'}}));
    const done = await json(await call(env, '/api/assistant', people.worker, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.match(done.body.reply, /na cestě/);
    assert.equal(env.sqlite.prepare("SELECT status FROM jobs WHERE id='job-next'").get().status, 'on_way');
    assert.equal(env.sqlite.prepare("SELECT status FROM jobs WHERE id='job-now'").get().status, 'in_progress');
    const stopped = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Ukonči práci.', context:{jobId:'job-now'}}));
    assert.equal(stopped.body.confirm, null);
    assert.match(stopped.body.reply, /interval|Docházku/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n, 0);
    const loose = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Co ještě nemá termín?'}));
    assert.equal(loose.body.confirm, null);
    assert.match(loose.body.reply, /Servis bez data/);
    assert.doesNotMatch(loose.body.reply, /Pozdější ventil/);
    const dayOf = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Co má dnes Marek?'}));
    assert.equal(dayOf.body.confirm, null);
    assert.match(dayOf.body.reply, /Dnešní filtr/);
    const moved = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Dej Nováka na čtvrtek.'}));
    assert.ok(moved.body.confirm?.id, JSON.stringify(moved.body));
    assert.match(moved.body.reply, /Dnešní filtr|Novák/);
    assert.equal(env.sqlite.prepare("SELECT due_date FROM jobs WHERE id='job-now'").get().due_date, today);
  }finally{env.sqlite.close();}
});

