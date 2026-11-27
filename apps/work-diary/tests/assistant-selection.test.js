import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment, people, request} from './fixtures.mjs';

const ctx = {waitUntil:task=>task.catch(()=>{})};
const call = (env, path, person=people.owner, method='GET', value)=>api(request(path, person, method, value), env, ctx);
const body = async response=>{const text=await response.text();let json={};try{json=text?JSON.parse(text):{};}catch{json={raw:text};}return {status:response.status, json, text};};

async function setup(){
  const env = environment();
  assert.equal((await call(env, '/api/me')).status, 200);
  for(const role of ['worker','reader']){
    assert.equal((await call(env, '/api/invitations', people.owner, 'POST', {email:people[role].email, role})).status, 200);
    assert.equal((await call(env, '/api/me', people[role])).status, 200);
  }
  return env;
}
async function customer(env, id, name){
  const response = await body(await call(env, '/api/customers/'+id, people.owner, 'PUT', {version:0, name, phones:[], addresses:[]}));
  assert.equal(response.status, 200, response.text);
}
function job(extra){
  return {version:0, title:'Zakázka', jobType:'installation', customerId:null, customerName:'', description:'', address:'', gardenId:null, assignedTo:'', assignedTos:[], dueDate:'', startTime:'', endTime:'', status:'planned', incompleteReason:'', ...extra};
}
async function save(env, id, extra, person=people.owner){
  const response = await body(await call(env, '/api/jobs/'+id, person, 'PUT', job(extra)));
  assert.equal(response.status, 200, response.text);
  return response.json.job;
}
async function ask(env, text, person=people.owner){
  const response = await body(await call(env, '/api/assistant', person, 'POST', {text}));
  assert.equal(response.status, 200, response.text);
  return response.json;
}
async function listed(env, query, person=people.owner){
  const response = await body(await call(env, '/api/jobs?'+query, person));
  assert.equal(response.status, 200, response.text);
  return response.json;
}

test('Open installation questions skip finished, cancelled, other kinds and unfinished paperwork', async()=>{
  const env = await setup();
  try{
    for(const [id, name] of [['ca','Novák'],['cb','Svoboda'],['cc','Dvořák'],['cd','Malá'],['ce','Horák']]) await customer(env, id, name);
    await save(env, 'wait-a', {title:'Čekající A', customerId:'ca', customerName:'Novák', dueDate:''});
    await save(env, 'wait-b', {title:'Čekající B', customerId:'cb', customerName:'Svoboda', dueDate:''});
    await save(env, 'plan-a', {title:'Naplánovaná A', customerId:'ca', customerName:'Novák', dueDate:'2026-12-02'});
    await save(env, 'plan-c', {title:'Naplánovaná C', customerId:'cc', customerName:'Dvořák', dueDate:'2026-12-03'});
    await save(env, 'live-d', {title:'Probíhá D', customerId:'cd', customerName:'Malá', dueDate:'2020-01-02', status:'in_progress'});
    await save(env, 'done-a', {title:'Hotová A', customerId:'ca', customerName:'Novák', dueDate:'2026-11-01', status:'done', description:'Nevyřízený servisní protokol a fakturace.'});
    await save(env, 'done-e', {title:'Hotová E', customerId:'ce', customerName:'Horák', dueDate:'2026-11-02', status:'done'});
    const cancelled = await save(env, 'cancel-e', {title:'Zrušená E', customerId:'ce', customerName:'Horák', dueDate:''});
    assert.equal((await call(env, '/api/jobs/cancel-e', people.owner, 'DELETE', {version:cancelled.version})).status, 200);
    await save(env, 'incomplete-e', {title:'Nedokončená E', customerId:'ce', customerName:'Horák', dueDate:'2026-12-05', status:'incomplete', incompleteReason:'Chyběl díl'});
    await save(env, 'service-b', {title:'Servis B', jobType:'service', customerId:'cb', customerName:'Svoboda', dueDate:'', description:'realizace je jen v poznámce'});

    const open = await listed(env, 'phase=open&type=installation&order=schedule');
    assert.equal(open.selection.total, 5);
    assert.equal(open.selection.customers, 4);
    assert.deepEqual(open.selection.counts, {waiting:2, scheduled:2, active:1, done:0});
    assert.deepEqual(open.jobs.map(job=>job.id).sort(), ['live-d','plan-a','plan-c','wait-a','wait-b']);
    assert.ok(open.jobs.every(job=>job.jobType==='installation' && job.status!=='done'));
    assert.equal(env.sqlite.prepare("SELECT status FROM jobs WHERE id='done-a'").get().status, 'done');

    const waiting = await listed(env, 'phase=waiting&type=installation&order=schedule');
    assert.deepEqual(waiting.jobs.map(job=>job.id).sort(), ['wait-a','wait-b']);
    assert.equal(waiting.selection.total, 2);
    const scheduled = await listed(env, 'phase=scheduled&type=installation&order=schedule');
    assert.deepEqual(scheduled.jobs.map(job=>job.id).sort(), ['plan-a','plan-c']);
    const active = await listed(env, 'phase=active&type=installation&order=schedule');
    assert.deepEqual(active.jobs.map(job=>job.id), ['live-d']);
    assert.equal(active.jobs[0].workPhaseLabel, 'Probíhá');
    const done = await listed(env, 'phase=done&type=installation&order=schedule');
    assert.deepEqual(done.jobs.map(job=>job.id).sort(), ['done-a','done-e']);
    assert.ok(done.jobs.every(job=>job.protocolStatus==='missing'));
    const removed = await listed(env, 'phase=cancelled&type=installation&order=schedule');
    assert.deepEqual(removed.jobs.map(job=>job.id), ['cancel-e']);
    assert.equal(removed.jobs[0].workPhaseLabel, 'Zrušeno');
    assert.equal((await listed(env, 'phase=archived&type=installation&order=schedule')).selection.total, 0);
    const service = await listed(env, 'phase=open&type=service&order=schedule');
    assert.deepEqual(service.jobs.map(job=>job.id), ['service-b']);

    const reply = await ask(env, 'Kteří zákazníci čekají na realizaci?');
    assert.match(reply.reply, /Našel jsem 5 neukončených zakázek druhu Realizace u 4 zákazníků: 2 čekají na naplánování, 2 jsou naplánované a 1 probíhá/);
    assert.match(reply.reply, /Čekající A/);
    assert.match(reply.reply, /Naplánovaná A/);
    assert.match(reply.reply, /Probíhá D/);
    assert.match(reply.reply, /Bez termínu – čeká na naplánování/);
    assert.doesNotMatch(reply.reply, /Hotová|Zrušená|Nedokončená|Servis B/);
    const folded = await ask(env, 'Ktery realizace jeste nejsou hotovy?');
    assert.equal(folded.reply, reply.reply);
    const onlyWaiting = await ask(env, 'Které realizace čekají na naplánování?');
    assert.match(onlyWaiting.reply, /2 čekajících na naplánování/);
    assert.doesNotMatch(onlyWaiting.reply, /Naplánovaná|Probíhá|Hotová|Servis/);
    const services = await ask(env, 'Kdo čeká na servis?');
    assert.match(services.reply, /Servis B/);
    assert.doesNotMatch(services.reply, /Čekající|Naplánovaná|Probíhá/);
    const worker = await listed(env, 'phase=open&type=installation&order=schedule', people.worker);
    assert.equal(worker.selection.total, 0);
    assert.deepEqual(worker.jobs, []);
    const workerReply = await ask(env, 'Kteří zákazníci čekají na realizaci?', people.worker);
    assert.match(workerReply.reply, /Nenašel jsem/);
    assert.doesNotMatch(workerReply.reply, /Novák|Čekající/);
  }finally{env.sqlite.close();}
});

test('Scheduling a dateless job changes only the derived phase and a multi-day job stays one row', async()=>{
  const env = await setup();
  try{
    await customer(env, 'ca', 'Novák');
    const created = await save(env, 'bare', {title:'Bez termínu', customerId:'ca', customerName:'Novák', dueDate:'', address:'Zahradní 1'});
    assert.equal(created.status, 'planned');
    let detail = await body(await call(env, '/api/jobs/bare'));
    assert.equal(detail.json.job.workPhase, 'waiting');
    assert.equal(detail.json.job.workPhaseLabel, 'Čeká na naplánování');
    const month = await listed(env, 'order=schedule&month=2026-12&day=2026-12-01&state=all');
    assert.ok(!month.jobs.some(job=>job.id==='bare'));
    const undated = await listed(env, 'phase=waiting&type=installation&order=schedule&month=2026-12&day=undated');
    assert.deepEqual(undated.jobs.map(job=>job.id), ['bare']);

    const dated = await save(env, 'bare', {version:created.version, title:'Bez termínu', customerId:'ca', customerName:'Novák', dueDate:'2026-12-01', address:'Zahradní 1', status:'planned'});
    assert.equal(dated.status, 'planned');
    detail = await body(await call(env, '/api/jobs/bare'));
    assert.equal(detail.json.job.workPhase, 'scheduled');
    assert.equal(detail.json.job.status, 'planned');
    const day = await listed(env, 'phase=scheduled&type=installation&order=schedule&month=2026-12&day=2026-12-01');
    assert.deepEqual(day.jobs.map(job=>job.id), ['bare']);
    assert.equal((await listed(env, 'phase=waiting&type=installation&order=schedule')).selection.total, 0);

    const cleared = await save(env, 'bare', {version:dated.version, title:'Bez termínu', customerId:'ca', customerName:'Novák', dueDate:'', address:'Zahradní 1', status:'planned', terms:[]});
    assert.equal(cleared.status, 'planned');
    detail = await body(await call(env, '/api/jobs/bare'));
    assert.equal(detail.json.job.workPhase, 'waiting');

    const running = await save(env, 'live', {title:'Už běží', customerId:'ca', customerName:'Novák', dueDate:'', status:'in_progress'});
    detail = await body(await call(env, '/api/jobs/live'));
    assert.equal(detail.json.job.status, 'in_progress');
    assert.equal(detail.json.job.workPhase, 'active');
    assert.equal((await listed(env, 'phase=waiting&type=installation&order=schedule')).jobs.some(job=>job.id==='live'), false);

    const passed = await save(env, 'old', {title:'Po termínu', customerId:'ca', customerName:'Novák', dueDate:'2020-01-02', status:'planned'});
    detail = await body(await call(env, '/api/jobs/old'));
    assert.equal(detail.json.job.status, 'planned');
    assert.equal(detail.json.job.workPhase, 'scheduled');
    assert.equal(passed.status, 'planned');

    const savedMulti = await save(env, 'multi', {title:'Vícedenní', customerId:'ca', customerName:'Novák', dueDate:'2026-12-08', status:'planned', terms:[
      {date:'2026-12-08', start:'08:00', end:'12:00', people:[], status:'planned', note:''},
      {date:'2026-12-09', start:'08:00', end:'12:00', people:[], status:'planned', note:''}
    ]});
    const many = await listed(env, 'phase=scheduled&type=installation&order=schedule');
    const multiRows = many.jobs.filter(job=>job.id==='multi');
    assert.equal(multiRows.length, 1);
    assert.equal(many.selection.total, many.jobs.length);
    assert.deepEqual(multiRows[0].schedule.dates, ['2026-12-08','2026-12-09']);
    const clearedMulti = await save(env, 'multi', {version:savedMulti.version, title:'Vícedenní', customerId:'ca', customerName:'Novák', dueDate:'', status:'planned', terms:[]});
    assert.equal(clearedMulti.status, 'planned');
    detail = await body(await call(env, '/api/jobs/multi'));
    assert.equal(detail.json.job.workPhase, 'waiting');
    assert.equal(env.sqlite.prepare("SELECT status FROM jobs WHERE id='old'").get().status, 'planned');
  }finally{env.sqlite.close();}
});

test('New configured kinds, ambiguous irrigation and same display names stay separate', async()=>{
  const env = await setup();
  try{
    await customer(env, 'one', 'Novák');
    await customer(env, 'two', 'Novák');
    env.sqlite.prepare("INSERT INTO settings(key,value,version) VALUES('job-kinds',?,1)").run(JSON.stringify([{id:'hedge', label:'Střih živého plotu', aliases:['strih','strihy']}]));
    await save(env, 'hedge-job', {title:'Plot u plotu', jobType:'hedge', customerId:'one', customerName:'Novák', dueDate:''});
    await save(env, 'install-job', {title:'Nová závlaha', jobType:'installation', customerId:'two', customerName:'Novák', dueDate:'', description:'až potom servis'});
    await save(env, 'hedge-done', {title:'Hotový plot', jobType:'hedge', customerId:'one', customerName:'Novák', dueDate:'2026-11-01', status:'done'});
    assert.equal((await call(env, '/api/jobs/unknown', people.owner, 'PUT', job({title:'Neznámá', jobType:'not-a-kind'}))).status, 400);
    const hedge = await ask(env, 'Kdo čeká na střih?');
    assert.match(hedge.reply, /Plot u plotu/);
    assert.doesNotMatch(hedge.reply, /Nová závlaha|Hotový plot/);
    const installs = await ask(env, 'Kdo čeká na realizaci?');
    assert.match(installs.reply, /Nová závlaha/);
    assert.doesNotMatch(installs.reply, /Plot u plotu/);
    assert.equal((await listed(env, 'phase=open&type=hedge&order=schedule')).selection.total, 1);
    const sameName = await listed(env, 'phase=open&type=installation&order=schedule');
    assert.equal(sameName.selection.customers, 1);
    await save(env, 'other-novak', {title:'Druhá zahrada', jobType:'installation', customerId:'one', customerName:'Novák', dueDate:''});
    const both = await listed(env, 'phase=waiting&type=installation&order=schedule');
    assert.equal(both.selection.customers, 2);
    assert.equal(both.selection.total, 2);
    const grouped = await ask(env, 'Které realizace čekají na naplánování?');
    assert.match(grouped.reply, /Nová závlaha/);
    assert.match(grouped.reply, /Druhá zahrada/);

    await save(env, 'blow-open', {title:'Vyfouknutí sever', jobType:'blowout', customerId:'one', customerName:'Novák', dueDate:''});
    await save(env, 'blow-done', {title:'Vyfouknutí hotové', jobType:'blowout', customerId:'one', customerName:'Novák', dueDate:'2026-11-02', status:'done'});
    const blow = await ask(env, 'Kde ještě musíme vyfouknout závlahu?');
    assert.match(blow.reply, /Vyfouknutí sever/);
    assert.doesNotMatch(blow.reply, /Vyfouknutí hotové|Nová závlaha/);
    await save(env, 'care-open', {title:'Údržba bez dne', jobType:'maintenance', customerId:'one', customerName:'Novák', dueDate:'', gardenId:null, address:'Severní zahrada'});
    await save(env, 'care-plan', {title:'Údržba s dnem', jobType:'maintenance', customerId:'one', customerName:'Novák', dueDate:'2026-12-02'});
    const care = await ask(env, 'Které údržby nemají termín?');
    assert.match(care.reply, /Údržba bez dne/);
    assert.match(care.reply, /Severní zahrada/);
    assert.doesNotMatch(care.reply, /Údržba s dnem|Nová závlaha/);
    const vague = await ask(env, 'Kde máme ještě dělat závlahu?');
    assert.match(vague.reply, /závlaha neurčuje druh práce/);
    assert.doesNotMatch(vague.reply, /Nová závlaha|Vyfouknutí|Údržba/);
    const services = await listed(env, 'phase=open&type=service&order=schedule');
    assert.equal(services.selection.total, 0);
  }finally{env.sqlite.close();}
});

test('Selection totals count the whole authorized result, not the first page', async()=>{
  const env = await setup();
  try{
    await customer(env, 'ca', 'Novák');
    await save(env, 'seed', {title:'První', customerId:'ca', customerName:'Novák', dueDate:''});
    const source = env.sqlite.prepare('SELECT * FROM jobs WHERE id=?').get('seed');
    const cols = Object.keys(source);
    const insert = env.sqlite.prepare(`INSERT INTO jobs (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`);
    for(let i=0;i<100;i++){
      insert.run(...cols.map(col=>{
        if(col==='id') return 'extra-'+i;
        if(col==='title') return 'Další '+i;
        if(i===0 && col==='assigned_to') return people.worker.id;
        if(i===0 && col==='assigned_name') return 'Pracovník';
        return source[col];
      }));
    }
    const owner = await listed(env, 'phase=waiting&type=installation&order=schedule');
    assert.equal(owner.jobs.length, 100);
    assert.equal(owner.selection.total, 101);
    assert.equal(owner.selection.customers, 1);
    const reply = await ask(env, 'Které realizace čekají na naplánování?');
    assert.match(reply.reply, /Našel jsem 101/);
    assert.match(reply.reply, /Ukazuji 100 z 101/);
    assert.doesNotMatch(reply.reply, /Našel jsem 100/);
    const worker = await listed(env, 'phase=waiting&type=installation&order=schedule', people.worker);
    assert.equal(worker.selection.total, 1);
    assert.deepEqual(worker.jobs.map(job=>job.id), ['extra-0']);
    const workerReply = await ask(env, 'Které realizace čekají na naplánování?', people.worker);
    assert.match(workerReply.reply, /Našel jsem 1/);
    assert.doesNotMatch(workerReply.reply, /101|Ukazuji/);
  }finally{env.sqlite.close();}
});

