import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment, people, request} from './fixtures.mjs';
import {nextWeekday} from '../web/assistant-commands.js';

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

test('Confirmation is scoped to the person and can be cancelled once', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Vytvoř zakázku Výměna filtru'}));
    assert.ok(proposed.body.confirm?.id);
    const stolen = await json(await call(env, '/api/assistant', people.worker, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(stolen.status, 404);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Výměna filtru'").get().n, 0);
    const foreign = env.sqlite.prepare('SELECT company_id FROM assistant_events WHERE id=?').get(proposed.body.confirm.id);
    env.sqlite.prepare("UPDATE assistant_events SET company_id='jina-firma' WHERE id=?").run(proposed.body.confirm.id);
    const otherCompany = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(otherCompany.status, 404);
    env.sqlite.prepare('UPDATE assistant_events SET company_id=? WHERE id=?').run(foreign.company_id, proposed.body.confirm.id);
    const cancelled = await json(await call(env, '/api/assistant', people.owner, 'POST', {cancelId:proposed.body.confirm.id}));
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.match(cancelled.body.reply, /zrušené/);
    const after = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(after.status, 200);
    assert.match(after.body.reply, /zrušené/);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Výměna filtru'").get().n, 0);
    const local = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kolik hodin jsem dnes odpracoval?', mode:'local'}));
    assert.equal(local.body.unavailable, true);
    assert.match(local.body.reply, /Nedostupné/);
    const catalog = await json(await call(env, '/api/assistant', people.owner, 'POST', {catalog:true}));
    assert.equal(catalog.body.providers.find(item=>item.id==='qwen').available, false);
    assert.ok(catalog.body.knowledge.every(item=>item.available===false));
  }finally{env.sqlite.close();}
});

test('Job hours come from recorded time, not a schedule estimate', async()=>{
  const env = environment();
  try{
    await ready(env);
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const created = await call(env, '/api/jobs/job-hours', people.owner, 'PUT', {version:0, title:'Beta', status:'planned', jobType:'service', dueDate:today, customerName:'Novák', startTime:'08:00', endTime:'12:00', incompleteReason:'', assignedTo:people.owner.id});
    assert.equal(created.status, 200, await created.clone().text());
    const hours = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kolik hodin strávil Marek na zakázce Beta?'}));
    assert.equal(hours.status, 200, JSON.stringify(hours.body));
    assert.match(hours.body.reply, /nepoužívám|nemám/);
    assert.doesNotMatch(hours.body.reply, /plánovaný čas/);
    const waiting = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kteří zákazníci čekají na servis?'}));
    assert.match(waiting.body.reply, /Novák/);
    const todayHours = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kolik hodin jsem dnes odpracoval?'}));
    assert.match(todayHours.body.reply, /0 h 00 min|hodin/);
    const report = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Vytvoř pracovní výkaz za tento měsíc.'}));
    assert.match(report.body.reply, /Pracovní výkaz/);
    const realization = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kolik hodin jsme celkem strávili na realizaci?'}));
    assert.match(realization.body.reply, /nevidím|nemám|nepoužívám/);
  }finally{env.sqlite.close();}
});

test('Planning and attendance commands preview the change and write only after confirmation', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const created = await call(env, '/api/jobs/job-beta', people.owner, 'PUT', {version:0, title:'Beta', status:'planned', jobType:'service', dueDate:today, customerName:'Novák', incompleteReason:'', assignedTo:people.owner.id});
    assert.equal(created.status, 200, await created.clone().text());
    const friday = nextWeekday(today, 'patek');
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Přesuň zakázku Beta na pátek.'}));
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.match(proposed.body.reply, new RegExp(friday));
    assert.equal(env.sqlite.prepare('SELECT due_date FROM jobs WHERE id=?').get('job-beta').due_date, today);
    const blocked = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Přesuň zakázku Beta na pátek.'}));
    assert.match(blocked.body.reply, /správce/);
    const moved = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(env.sqlite.prepare('SELECT due_date FROM jobs WHERE id=?').get('job-beta').due_date, friday);
    const week = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Co máme tento týden za práci?'}));
    assert.match(week.body.reply, /Beta|Tento týden/);
    const status = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Označ zakázku Beta jako probíhá.'}));
    assert.ok(status.body.confirm?.id);
    const started = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:status.body.confirm.id}));
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(env.sqlite.prepare('SELECT status FROM jobs WHERE id=?').get('job-beta').status, 'in_progress');
    const arrival = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Začni docházku.'}));
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n, 0);
    const punched = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:arrival.body.confirm.id}));
    assert.equal(punched.status, 200, JSON.stringify(punched.body));
    assert.match(punched.body.reply, /Příchod/);
    const active = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kdo má stále aktivní docházku?'}));
    assert.match(active.body.reply, /Otevřená docházka/);
  }finally{env.sqlite.close();}
});

test('Material lines come from the catalogue and a protocol note waits for confirmation', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/materials/categories/cat-sprinkler', people.owner, 'PUT', {version:0, name:'Závlaha', sortOrder:1, active:true});
    await call(env, '/api/materials/items/item-rvan', people.owner, 'PUT', {version:0, name:'Postřikovač R-VAN 14', categoryId:'cat-sprinkler', sku:'RV14', unit:'ks', priceMinor:12500, currency:'CZK', active:true});
    await call(env, '/api/materials/items/item-pipe', people.owner, 'PUT', {version:0, name:'Potrubí PE 32 mm', categoryId:'cat-sprinkler', sku:'PE32', unit:'m', priceMinor:4500, currency:'CZK', active:true});
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const created = await call(env, '/api/jobs/job-water', people.owner, 'PUT', {version:0, title:'Závlaha Novák', status:'planned', jobType:'service', dueDate:today, customerName:'Novák', incompleteReason:'', assignedTo:people.owner.id});
    assert.equal(created.status, 200, await created.clone().text());
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Přidej k aktuální zakázce pět postřikovačů R-VAN 14 a dvacet metrů potrubí 32 mm.', context:{jobId:'job-water'}}));
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.match(proposed.body.reply, /R-VAN 14/);
    assert.match(proposed.body.reply, /5 ks/);
    assert.match(proposed.body.reply, /20 m/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_reports WHERE job_id=?').get('job-water').n, 0);
    const rejected = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Přidej k aktuální zakázce pět metrů R-VAN 14.', context:{jobId:'job-water'}}));
    assert.match(rejected.body.reply, /jednotce ks/);
    assert.equal(rejected.body.confirm, null);
    const saved = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const items = JSON.parse(env.sqlite.prepare('SELECT material_items FROM service_reports WHERE job_id=?').get('job-water').material_items);
    assert.deepEqual(items.map(item=>[item.itemId, item.quantity, item.unit, item.priceMinor]).sort(), [['item-pipe',20,'m',4500],['item-rvan',5,'ks',12500]]);
    const price = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kolik stojí materiál na aktuální zakázce?', context:{jobId:'job-water'}}));
    assert.match(price.body.reply, /1[\s\u00a0]?525/);
    const note = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Zapiš do protokolu závadu nefunguje sekce 3.', context:{jobId:'job-water'}}));
    assert.ok(note.body.confirm?.id);
    assert.match(env.sqlite.prepare('SELECT defects FROM service_reports WHERE job_id=?').get('job-water').defects, /^$/);
    const written = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:note.body.confirm.id}));
    assert.equal(written.status, 200, JSON.stringify(written.body));
    const report = env.sqlite.prepare('SELECT defects, material_items FROM service_reports WHERE job_id=?').get('job-water');
    assert.match(report.defects, /nefunguje sekce 3/);
    assert.equal(JSON.parse(report.material_items).length, 2);
    const check = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Zkontroluj protokol u zakázky Závlaha Novák.'}));
    assert.match(check.body.reply, /podpis/);
    assert.match(check.body.reply, /fotografie/);
  }finally{env.sqlite.close();}
});

test('A CSV file is previewed and written only after confirmation', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    const csv = 'Jméno;Telefon;E-mail;Adresa;Město\nNovák;777111222;;Lesní 1;Plzeň\nŠpatný;abc;;;\n';
    const blocked = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Načti zákazníky', file:{name:'zakaznici.csv', text:csv}}));
    assert.match(blocked.body.reply, /správce/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n, 0);
    const excel = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Načti zákazníky', file:{name:'zakaznici.xlsx', text:csv}}));
    assert.match(excel.body.reply, /CSV/);
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Načti zákazníky', file:{name:'zakaznici.csv', text:csv}}));
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.match(proposed.body.reply, /Novák/);
    assert.match(proposed.body.reply, /777111222/);
    assert.match(proposed.body.reply, /zahrada/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n, 0);
    const saved = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const customer = env.sqlite.prepare("SELECT id, phones, addresses FROM customers WHERE name='Novák'").get();
    assert.ok(customer);
    assert.match(customer.phones, /777111222/);
    assert.match(customer.addresses, /Lesní 1/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM gardens WHERE customer_id=?').get(customer.id).n, 1);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM customers WHERE name='Špatný'").get().n, 0);
    await call(env, '/api/materials/categories/cat-import', people.owner, 'PUT', {version:0, name:'Závlaha', sortOrder:1, active:true});
    const materials = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Načti materiál do kategorie Závlaha', file:{name:'material.csv', text:'Název;Jednotka;Cena\nPostřikovač R-VAN 14;ks;125,50\nPotrubí;m;\n'}}));
    assert.match(materials.body.reply, /125,50|125.50|125/);
    const imported = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:materials.body.confirm.id}));
    assert.equal(imported.status, 200, JSON.stringify(imported.body));
    const item = env.sqlite.prepare("SELECT unit, price_minor FROM material_items WHERE name='Postřikovač R-VAN 14'").get();
    assert.equal(item.unit, 'ks');
    assert.equal(item.price_minor, 12550);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM material_items WHERE name='Potrubí'").get().n, 0);
  }finally{env.sqlite.close();}
});




