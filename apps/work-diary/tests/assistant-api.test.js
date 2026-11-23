import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment, people, request} from './fixtures.mjs';
import {nextWeekday, followUpDate, foldCzech, mentionedWorkDate} from '../web/assistant-commands.js';
import {describeApiFailure} from '../worker/api.js';

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
    const createdCustomer = await call(env, '/api/customers/novak', people.owner, 'PUT', {version:0, name:'Novák', phones:[{id:'phone-novak', number:'777111222'}], addresses:[{id:'addr-novak', address:'Zahradní 1', city:'Brno'}], email:'novak@example.com'});
    assert.equal(createdCustomer.status, 200, await createdCustomer.clone().text());
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const created = await call(env, '/api/jobs/job-today', people.owner, 'PUT', {version:0, title:'Kontrola čerpadla', status:'planned', dueDate:today, customerName:'Novák', incompleteReason:'', assignedTo:people.owner.id});
    assert.equal(created.status, 200, await created.clone().text());
    const jobs = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Co máme dnes za práci?', mode:'basic'}));
    assert.equal(jobs.status, 200, JSON.stringify(jobs.body));
    assert.match(jobs.body.reply, /Kontrola čerpadla/);
    assert.equal(jobs.body.confirm, null);
    const customer = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Najdi zákazníka Nováka.'}));
    assert.equal(customer.status, 200, JSON.stringify(customer.body));
    assert.match(customer.body.reply, /Našel jsem 1 zákazníka/);
    assert.equal(customer.body.cards[0].type, 'customer');
    assert.equal(customer.body.cards[0].title, 'Novák');
    assert.equal(customer.body.cards[0].id, 'novak');
    assert.deepEqual(customer.body.context, {customerId:'novak', customerName:'Novák'});
    const follow = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Zobraz jeho zakázky', context:customer.body.context}));
    assert.equal(follow.status, 200, JSON.stringify(follow.body));
    assert.match(follow.body.reply, /Kontrola čerpadla/);
    assert.equal(follow.body.cards[0].type, 'job');
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
    assert.equal(local.body.unavailable, false);
    assert.match(local.body.reply, /0 h 00 min/);
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

test('Assistant adds a customer and a job only after confirmation', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    const denied = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Přidej zákazníka Petřík'}));
    assert.match(denied.body.reply, /správce/);
    assert.equal(denied.body.confirm, null);
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Přidej zákazníka Petřík, telefon 777 222 333, adresa Zahradní 1, Brno'}));
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.ok(proposed.body.confirm?.id);
    assert.match(proposed.body.reply, /Petřík/);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM customers WHERE name='Petřík'").get().n, 0);
    const saved = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.mutated, 'customers');
    const customer = env.sqlite.prepare("SELECT id, phones, addresses FROM customers WHERE name='Petřík' AND deleted=0").get();
    assert.ok(customer);
    assert.match(customer.phones, /777 222 333/);
    const duplicate = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Přidej zákazníka Petřík'}));
    assert.match(duplicate.body.reply, /už v evidenci/);
    assert.equal(duplicate.body.confirm, null);
    const missing = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Vytvoř zakázku servis u Nováka na zítra'}));
    assert.match(missing.body.reply, /nenašel/);
    assert.equal(missing.body.confirm, null);
    const job = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Vytvoř zakázku servis u Petříka na zítra'}));
    assert.equal(job.status, 200, JSON.stringify(job.body));
    assert.match(job.body.reply, /Petřík/);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='servis'").get().n, 0);
    const done = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:job.body.confirm.id}));
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.match(done.body.reply, /založená/);
    const row = env.sqlite.prepare("SELECT customer_id, customer_name FROM jobs WHERE title='servis' AND deleted=0").get();
    assert.equal(row.customer_id, customer.id);
    assert.equal(row.customer_name, 'Petřík');
  }finally{env.sqlite.close();}
});

test('One sentence plans one multi-day job and writes nothing before confirmation', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    env.sqlite.prepare('UPDATE members SET name=? WHERE user_id=?').run('Luboš', people.owner.id);
    env.sqlite.prepare('UPDATE members SET name=? WHERE user_id=?').run('Zdeněk', people.worker.id);
    const customer = await call(env, '/api/customers/bambosova', people.owner, 'PUT', {version:0, name:'Bambošová', phones:[], addresses:[{id:'addr-bambos', address:'Zahradní 1', city:'Plzeň'}]});
    assert.equal(customer.status, 200, await customer.clone().text());
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const monday = (await import('../web/job-plan.js')).nearestWeekday(today, 'pondeli');
    const occupied = await call(env, '/api/jobs/other-monday', people.owner, 'PUT', {version:0, title:'Jiná práce', status:'planned', dueDate:monday, incompleteReason:'', assignedTo:people.owner.id});
    assert.equal(occupied.status, 200, await occupied.clone().text());
    const before = env.sqlite.prepare('SELECT count(*) n FROM jobs').get().n;
    const text = 'V pondělí budeme dělat realizaci závlahy u Bambošové asi na 4 dny. Bude tam Luboš a Zdeněk.';
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text}));
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.ok(proposed.body.confirm?.id, proposed.body.reply);
    assert.match(proposed.body.reply, /Kolize/);
    assert.equal(proposed.body.concept.terms.length, 4);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM jobs').get().n, before);
    env.sqlite.prepare("INSERT INTO members(user_id,email,name,role,created_at) VALUES('marek','marek@example.com','Marek','worker',1)").run();
    const revised = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Ve středu pojedeme jinam, čtvrtý den bude v pátek. Potřebujeme jednotku Rain Bird a 100 metrů potrubí 32 mm. Přidej ještě Marka.', context:proposed.body.context}));
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM jobs').get().n, before);
    assert.deepEqual(revised.body.concept.terms.map(term=>new Date(term.date+'T12:00:00Z').getUTCDay()), [1,2,4,5]);
    const saved = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:revised.body.confirm.id}));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.match(saved.body.reply, /Zahradní 1/);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Realizace závlahy' AND deleted=0").get().n, 1, saved.body.reply);
    const job = env.sqlite.prepare("SELECT id, status, address, city, material_note, material_status FROM jobs WHERE title='Realizace závlahy' AND deleted=0").get();
    assert.equal(job.address, 'Zahradní 1');
    assert.equal(job.city, 'Plzeň');
    assert.match(job.material_note, /Rain Bird/);
    assert.equal(job.material_status, 'missing');
    const terms = env.sqlite.prepare('SELECT term_date, assigned_users FROM job_terms WHERE job_id=? ORDER BY sort_order').all(job.id);
    assert.equal(terms.length, 4);
    assert.deepEqual(terms.map(term=>new Date(term.term_date+'T12:00:00Z').getUTCDay()), [1,2,4,5]);
    const friday = terms[3].term_date;
    const month = friday.slice(0, 7);
    const visible = await json(await call(env, `/api/jobs?order=schedule&state=all&month=${month}&day=${friday}`, people.owner));
    assert.equal(visible.body.jobs.some(item=>item.id===job.id), true);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n, 0);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_terms WHERE job_id=?').get(job.id).n, 4);
    env.sqlite.prepare("UPDATE job_terms SET status='done' WHERE job_id=? AND sort_order=0").run(job.id);
    const loaded = await json(await call(env, '/api/jobs/'+job.id, people.owner));
    assert.equal(loaded.body.job.status, 'planned');
    assert.equal(loaded.body.job.terms.filter(term=>term.status==='done').length, 1);
    const worker = await json(await call(env, '/api/assistant', people.worker, 'POST', {text}));
    assert.equal(worker.body.confirm, null);
    env.sqlite.prepare("INSERT INTO members(user_id,email,name,role,created_at) VALUES('zdenek-2','z2@example.com','Zdeněk','worker',1)").run();
    const ambiguous = await json(await call(env, '/api/assistant', people.owner, 'POST', {text}));
    assert.equal(ambiguous.body.confirm, null);
    assert.match(ambiguous.body.reply, /není jednoznačné/);
  }finally{env.sqlite.close();}
});

test('The result form saves the edited day instead of the original proposal', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    env.sqlite.prepare('UPDATE members SET name=? WHERE user_id=?').run('Luboš', people.owner.id);
    env.sqlite.prepare('UPDATE members SET name=? WHERE user_id=?').run('Zdeněk', people.worker.id);
    assert.equal((await call(env, '/api/customers/bambosova-form', people.owner, 'PUT', {version:0, name:'Bambošová', phones:[], addresses:[{id:'addr-form', address:'Zahradní 1', city:'Plzeň'}]})).status, 200);
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'V pondělí budeme dělat realizaci závlahy u Bambošové asi na 4 dny. Bude tam Luboš a Zdeněk.'}));
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.ok(proposed.body.concept, proposed.body.reply);
    const concept = proposed.body.concept;
    concept.terms[0].date = '2026-12-01';
    concept.notes = 'Ruční poznámka z formuláře';
    const saved = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id, concept}));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const job = env.sqlite.prepare("SELECT id, description FROM jobs WHERE title='Realizace závlahy' AND deleted=0").get();
    assert.match(job.description, /Ruční poznámka/);
    const days = env.sqlite.prepare('SELECT term_date FROM job_terms WHERE job_id=? ORDER BY term_date').all(job.id).map(row=>row.term_date);
    assert.equal(days.includes('2026-12-01'), true);
    assert.equal(days.length, 4);
  }finally{env.sqlite.close();}
});

test('Job search understands last week, Wednesday, declined names, and a 30 hour day is flagged', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    env.sqlite.prepare('UPDATE members SET name=? WHERE user_id=?').run('Petřík', people.worker.id);
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const {weekSpan, weekdayDate} = await import('../web/assistant-commands.js');
    const {attendanceInstant} = await import('../web/attendance-model.js');
    const last = weekSpan(today, 'last');
    const wednesday = weekdayDate(today, 'streda', 'this');
    const put = (id, title, dueDate, assignedTo)=>call(env, '/api/jobs/'+id, people.owner, 'PUT', {version:0, title, status:'planned', dueDate, startTime:'07:00', endTime:'12:00', customerName:'Novák', incompleteReason:'', assignedTo});
    assert.equal((await put('job-last', 'Zavážení štěrku', last.start, people.owner.id)).status, 200);
    assert.equal((await put('job-wed-me', 'Realizace závlahy', wednesday, people.owner.id)).status, 200);
    assert.equal((await put('job-wed-him', 'Servis u Petříka', wednesday, people.worker.id)).status, 200);
    assert.equal((await put('job-today', 'Dnešní kontrola', today, people.worker.id)).status, 200);
    const week = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Najdi mi zakázky za minulý týden.'}));
    assert.equal(week.status, 200, JSON.stringify(week.body));
    assert.match(week.body.reply, /Zavážení štěrku/);
    assert.doesNotMatch(week.body.reply, /Dnešní kontrola|Realizace závlahy/);
    const mine = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Najdi mé zakázky na středu.'}));
    assert.match(mine.body.reply, /Realizace závlahy/);
    assert.match(mine.body.reply, /středu/);
    assert.doesNotMatch(mine.body.reply, /Servis u Petříka|Zavážení/);
    const person = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Najdi mi zakázky pro Petříka.'}));
    assert.match(person.body.reply, /Servis u Petříka/);
    assert.match(person.body.reply, /Petřík/);
    assert.doesNotMatch(person.body.reply, /Realizace závlahy/);
    const typo = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Najdi mi zakázky pro Petrika.'}));
    assert.match(typo.body.reply, /Servis u Petříka/);
    const start = attendanceInstant(today+'T00:00');
    const hour = 60*60*1000;
    const insert = env.sqlite.prepare('INSERT INTO attendance_shifts(id,user_id,user_name,start_at,end_at,start_gps_status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1,1)');
    insert.run('shift-a', people.owner.id, 'Majitel', start, start+15*hour, 'unavailable');
    insert.run('shift-b', people.owner.id, 'Majitel', start+hour, start+16*hour, 'unavailable');
    insert.run('shift-c', people.worker.id, 'Petřík', start, start+15*hour, 'unavailable');
    const hours = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kolik hodin jsem dnes odpracoval?'}));
    assert.equal(hours.status, 200, JSON.stringify(hours.body));
    assert.match(hours.body.reply, /30 h/);
    assert.match(hours.body.reply, /chybně/);
    assert.doesNotMatch(hours.body.reply, /45 h/);
  }finally{env.sqlite.close();}
});

test('Separate weekdays become one unsent concept and save only after people are confirmed', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    env.sqlite.prepare('UPDATE members SET name=? WHERE user_id=?').run('Luboš', people.owner.id);
    env.sqlite.prepare('UPDATE members SET name=? WHERE user_id=?').run('Zdeněk', people.worker.id);
    assert.equal((await call(env, '/api/customers/petrik', people.owner, 'PUT', {version:0, name:'Pan Petřík', phones:[], addresses:[{id:'addr-petrik', address:'Lipová 8', city:'Plzeň'}]})).status, 200);
    const text = 'Vytvoř zakázku na pondělí a středu u pana Petříka. Realizace závlahy od 8 hodin do 16 hodin.';
    const basic = await json(await call(env, '/api/assistant', people.owner, 'POST', {text, mode:'basic'}));
    assert.equal(basic.status, 200, JSON.stringify(basic.body));
    assert.equal(basic.body.concept.customerName, 'Pan Petřík');
    assert.equal(basic.body.concept.address, 'Lipová 8');
    assert.equal(basic.body.concept.city, 'Plzeň');
    assert.equal(basic.body.concept.title, 'Realizace závlahy');
    assert.equal(basic.body.concept.terms.length, 2);
    assert.deepEqual(basic.body.concept.terms.map(term=>[term.start, term.end]), [['08:00','16:00'],['08:00','16:00']]);
    assert.notEqual(basic.body.concept.terms[0].date, basic.body.concept.terms[1].date);
    assert.match(basic.body.reply, /16 hodin/);
    assert.match(basic.body.reply, /Kdo bude/);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Realizace závlahy'").get().n, 0);
    const local = await json(await call(env, '/api/assistant', people.owner, 'POST', {text, mode:'local'}));
    assert.equal(local.status, 200, JSON.stringify(local.body));
    assert.equal(local.body.concept.terms.length, 2);
    assert.doesNotMatch(local.body.reply, /Týmové úložiště není dostupné/);
    const denied = await json(await call(env, '/api/assistant', people.worker, 'POST', {text, mode:'basic'}));
    assert.equal(denied.body.confirm, null);
    assert.match(denied.body.reply, /správce/);
    const missing = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Vytvoř zakázku na pondělí a středu u pana Neznámého. Realizace závlahy od 8 hodin do 16 hodin.'}));
    assert.equal(missing.body.confirm, null);
    assert.match(missing.body.reply, /nenašel/);
    const crew = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'V pondělí bude Luboš a ve středu Zdeněk. Potřebujeme 10 m potrubí k nákupu.', context:basic.body.context, mode:'local'}));
    assert.equal(crew.status, 200, JSON.stringify(crew.body));
    assert.deepEqual(crew.body.concept.terms.map(term=>term.people), [['Luboš'],['Zdeněk']]);
    assert.match(crew.body.concept.materials[0].name, /potrubí/i);
    const tooSoon = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:basic.body.confirm.id, concept:basic.body.concept}));
    assert.equal(tooSoon.status, 400);
    assert.match(tooSoon.body.error, /pracovníka/);
    assert.doesNotMatch(tooSoon.body.error, /Týmové úložiště není dostupné/);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Realizace závlahy'").get().n, 0);
    const concept = crew.body.concept;
    concept.notes = 'Ruční poznámka';
    concept.terms[1].end = '12:00';
    const saved = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:crew.body.confirm.id, concept}));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.match(saved.body.reply, /Lipová 8/);
    const job = env.sqlite.prepare("SELECT id, description, estimated_minutes FROM jobs WHERE title='Realizace závlahy' AND deleted=0").get();
    assert.match(job.description, /Ruční poznámka/);
    assert.equal(job.estimated_minutes, null);
    const terms = env.sqlite.prepare('SELECT term_date, start_time, end_time, assigned_users FROM job_terms WHERE job_id=? ORDER BY term_date').all(job.id);
    assert.equal(terms.length, 2);
    assert.equal(terms[0].start_time, '08:00');
    assert.equal(terms[0].end_time, '16:00');
    assert.equal(terms[1].end_time, '12:00');
    assert.notEqual(terms[0].term_date, terms[1].term_date);
    assert.match(terms[0].assigned_users, new RegExp(people.owner.id));
    assert.match(terms[1].assigned_users, new RegExp(people.worker.id));
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n, 0);
    const again = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:basic.body.confirm.id, concept}));
    assert.ok(again.status===400||again.status===409, JSON.stringify(again.body));
    assert.match(again.body.error||again.body.reply||'', /koliz|pracovníka|už byla provedena|zrušené|vypršelo|Zkontrolujte/);
    assert.doesNotMatch(JSON.stringify(again.body), /Týmové úložiště není dostupné/);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM jobs WHERE title='Realizace závlahy' AND deleted=0").get().n, 1);
    assert.match(describeApiFailure(Object.assign(new Error(''), {name:'D1Error', cause:new Error('D1_ERROR: no such table: assistant_events')})), /no such table/);
    assert.doesNotMatch(describeApiFailure(new Error('')), /Týmové úložiště není dostupné/);
  }finally{env.sqlite.close();}
});

test('Spoken service work is stored only after confirmation and catalogue lines are not doubled', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/materials/categories/cat-protocol', people.owner, 'PUT', {version:0, name:'Protokol', sortOrder:9, active:true});
    await call(env, '/api/materials/items/item-pe32', people.owner, 'PUT', {version:0, name:'Potrubí PE 32 mm', categoryId:'cat-protocol', sku:'PE32', unit:'m', priceMinor:4500, currency:'CZK', active:true});
    await call(env, '/api/materials/items/item-tkus', people.owner, 'PUT', {version:0, name:'T-kus', categoryId:'cat-protocol', sku:'TEE', unit:'ks', priceMinor:2300, currency:'CZK', active:true});
    await call(env, '/api/materials/items/item-rain', people.owner, 'PUT', {version:0, name:'Postřikovač Rain Bird', categoryId:'cat-protocol', sku:'RB', unit:'ks', priceMinor:12500, currency:'CZK', active:true});
    const catalogCount = env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n;
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const created = await call(env, '/api/jobs/job-service', people.owner, 'PUT', {version:0, title:'Severní zahrada', status:'in_progress', jobType:'service', dueDate:today, customerName:'Novák', address:'Zahradní 1', city:'Brno', incompleteReason:'', assignedTo:people.owner.id});
    assert.equal(created.status, 200, await created.clone().text());
    const spoken = 'Na zakázce jsme vyměnili 4 ventily, 2 postřikovače, opravili prasklé potrubí a nastavili třetí sekci.';
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:spoken, mode:'basic'}));
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.equal(proposed.body.concept.kind, 'protocol');
    assert.equal(proposed.body.concept.jobId, 'job-service');
    assert.equal(proposed.body.concept.work, 'V rámci servisního zásahu byla provedena výměna čtyř ventilů a dvou postřikovačů závlahového systému. Dále bylo opraveno poškozené potrubí a upraveno nastavení třetí závlahové sekce.');
    assert.doesNotMatch(proposed.body.concept.work, /těsnost|plně funkční/);
    assert.ok(proposed.body.concept.optionalQuestions.includes('Byla provedena kontrola těsnosti?'));
    assert.ok(proposed.body.concept.questions.some(item=>/Kolik metrů potrubí/.test(item)));
    assert.ok(proposed.body.concept.questions.some(item=>/Novou položku nezakládám/.test(item)));
    assert.ok(proposed.body.confirm?.id);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n, 0);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n, catalogCount);
    const first = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id, concept:proposed.body.concept}));
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const plain = env.sqlite.prepare('SELECT work, material, material_items FROM service_reports WHERE job_id=?').get('job-service');
    assert.equal(plain.work, proposed.body.concept.work);
    assert.doesNotMatch(plain.work, /těsnost|plně funkční/);
    assert.equal(plain.material, '');
    assert.deepEqual(JSON.parse(plain.material_items), []);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n, catalogCount);
    const repeated = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
    assert.match(repeated.body.reply, /už byla provedena/);
    assert.deepEqual(JSON.parse(env.sqlite.prepare('SELECT material_items FROM service_reports WHERE job_id=?').get('job-service').material_items), []);

    const fittings = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Použili jsme 20 metrů třicet dvojky, čtyři kolena, dva T-kusy a šest postřikovačů Rain Bird.', mode:'basic', context:{jobId:'job-service'}}));
    assert.equal(fittings.status, 200, JSON.stringify(fittings.body));
    assert.equal(fittings.body.concept.work, 'V rámci servisního zásahu bylo použito dvacet metrů potrubí o průměru 32 mm, čtyři kolena, dva T-kusy a šest postřikovačů Rain Bird.');
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_reports WHERE job_id=?').get('job-service').n, 1);
    const concept = structuredClone(fittings.body.concept);
    concept.materials.find(line=>line.key==='postrkovac').quantity = '9';
    concept.materials.find(line=>line.key==='koleno').choiceId = 'item-pe32';
    const billed = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:fittings.body.confirm.id, concept}));
    assert.equal(billed.status, 200, JSON.stringify(billed.body));
    assert.match(billed.body.reply, /není zapsané ještě jednou/);
    const rows = JSON.parse(env.sqlite.prepare('SELECT work, material, material_items FROM service_reports WHERE job_id=?').get('job-service').material_items);
    assert.deepEqual(rows.map(item=>[item.itemId, item.quantity]).sort(), [['item-pe32',20],['item-rain',9],['item-tkus',2]]);
    assert.equal(env.sqlite.prepare('SELECT material FROM service_reports WHERE job_id=?').get('job-service').material, '');
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM material_items WHERE name LIKE '%Koleno%'").get().n, env.sqlite.prepare("SELECT count(*) n FROM material_items WHERE name='Koleno postřikovač'").get().n);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n, catalogCount);
    const corrected = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Oprav množství potrubí na 25 metrů.', context:billed.body.context}));
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
    assert.ok(corrected.body.confirm?.id);
    assert.equal(JSON.parse(env.sqlite.prepare('SELECT material_items FROM service_reports WHERE job_id=?').get('job-service').material_items).find(item=>item.itemId==='item-pe32').quantity, 20);
    const stored = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:corrected.body.confirm.id}));
    assert.equal(stored.status, 200, JSON.stringify(stored.body));
    const after = JSON.parse(env.sqlite.prepare('SELECT material_items FROM service_reports WHERE job_id=?').get('job-service').material_items);
    assert.equal(after.find(item=>item.itemId==='item-pe32').quantity, 25);
    assert.equal(after.find(item=>item.itemId==='item-rain').quantity, 9);
    assert.equal(after.find(item=>item.itemId==='item-tkus').quantity, 2);
    assert.equal(after.length, 3);
    const twice = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:corrected.body.confirm.id}));
    assert.match(twice.body.reply, /už byla provedena/);
    assert.equal(JSON.parse(env.sqlite.prepare('SELECT material_items FROM service_reports WHERE job_id=?').get('job-service').material_items).find(item=>item.itemId==='item-pe32').quantity, 25);
  }finally{env.sqlite.close();}
});

test('A service note is not guessed onto a job, another company, or someone else', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const job = (id, title, status)=>({version:0, title, status, jobType:'service', dueDate:today, customerName:'Novák', incompleteReason:'', assignedTo:people.owner.id});
    assert.equal((await call(env, '/api/jobs/job-north', people.owner, 'PUT', job('job-north','Severní zahrada','in_progress'))).status, 200);
    assert.equal((await call(env, '/api/jobs/job-south', people.owner, 'PUT', job('job-south','Jižní zahrada','in_progress'))).status, 200);
    const ambiguous = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Na zakázce jsme vyměnili 4 ventily a nastavili třetí sekci.'}));
    assert.equal(ambiguous.body.confirm, null);
    assert.match(ambiguous.body.reply, /Severní zahrada/);
    assert.match(ambiguous.body.reply, /Jižní zahrada/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n, 0);
    const named = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Zakázka Severní zahrada', context:ambiguous.body.context}));
    assert.equal(named.status, 200, JSON.stringify(named.body));
    assert.equal(named.body.concept.jobId, 'job-north');
    assert.ok(named.body.confirm?.id);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n, 0);
    const outsider = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Na zakázce jsme vyměnili 4 ventily a nastavili třetí sekci.'}));
    assert.equal(outsider.body.confirm, null);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n, 0);
    const foreign = env.sqlite.prepare('SELECT company_id FROM assistant_events WHERE id=?').get(named.body.confirm.id);
    env.sqlite.prepare("UPDATE assistant_events SET company_id='jina-firma' WHERE id=?").run(named.body.confirm.id);
    const denied = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:named.body.confirm.id}));
    assert.equal(denied.status, 404);
    env.sqlite.prepare('UPDATE assistant_events SET company_id=? WHERE id=?').run(foreign.company_id, named.body.confirm.id);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n, 0);
  }finally{env.sqlite.close();}
});

test('One job due today is used only when nothing is already in progress', async()=>{
  const env = environment();
  try{
    await ready(env);
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const created = await call(env, '/api/jobs/job-today-only', people.owner, 'PUT', {version:0, title:'Dnešní servis', status:'planned', jobType:'service', dueDate:today, customerName:'Novák', incompleteReason:'', assignedTo:people.owner.id});
    assert.equal(created.status, 200, await created.clone().text());
    const one = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Na zakázce jsme opravili prasklé potrubí.'}));
    assert.equal(one.body.concept?.jobId, 'job-today-only');
    assert.ok(one.body.confirm?.id);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n, 0);
    const second = await call(env, '/api/jobs/job-today-two', people.owner, 'PUT', {version:0, title:'Druhý servis', status:'planned', jobType:'service', dueDate:today, customerName:'Novák', incompleteReason:'', assignedTo:people.owner.id});
    assert.equal(second.status, 200, await second.clone().text());
    const many = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Na zakázce jsme opravili prasklé potrubí.'}));
    assert.equal(many.body.confirm, null);
    assert.match(many.body.reply, /Dnešní servis/);
    assert.match(many.body.reply, /Druhý servis/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n, 0);
  }finally{env.sqlite.close();}
});

function mailCount(env){
  const names = env.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('protocol_emails','service_email_deliveries')").all().map(row=>row.name);
  return names.reduce((sum, name)=>sum+env.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get().n, 0);
}

test('A confirmed defect, visit, photo and realization stay on one job and do not invent records', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    const garden = await call(env, '/api/gardens', people.owner, 'POST', {id:'garden-live', name:'Severní zahrada', address:'Zahradní 4', notes:''});
    assert.equal(garden.status, 200, await garden.clone().text());
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const created = await call(env, '/api/jobs/job-live', people.owner, 'PUT', {version:0, title:'Realizace Sever', status:'in_progress', jobType:'installation', dueDate:today, customerName:'Novák', address:'Zahradní 4', city:'Brno', gardenId:'garden-live', incompleteReason:'', assignedTo:people.owner.id, description:''});
    assert.equal(created.status, 200, await created.clone().text());
    const materialsAtStart = env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n;
    const before = ()=>({jobs:env.sqlite.prepare('SELECT count(*) n FROM jobs WHERE deleted=0').get().n, defects:env.sqlite.prepare('SELECT count(*) n FROM garden_defects').get().n, reports:env.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n, photos:env.sqlite.prepare('SELECT count(*) n FROM service_photos').get().n, diary:env.sqlite.prepare('SELECT count(*) n FROM job_diary_entries').get().n, materials:env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n, mail:mailCount(env)});
    const defectText = 'Čtvrtý ventil netěsní, budeme ho muset příště vyměnit.';
    const proposedDefect = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:defectText}));
    assert.equal(proposedDefect.status, 200, JSON.stringify(proposedDefect.body));
    assert.equal(proposedDefect.body.concept.kind, 'defect');
    assert.match(proposedDefect.body.reply, /Netěsnící čtvrtý ventil/);
    assert.match(proposedDefect.body.reply, /neodešlu|neodeslal/);
    assert.ok(proposedDefect.body.confirm?.id);
    assert.deepEqual(before(), {jobs:1, defects:0, reports:0, photos:0, diary:0, materials:materialsAtStart, mail:0});
    const savedDefect = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposedDefect.body.confirm.id}));
    assert.equal(savedDefect.status, 200, JSON.stringify(savedDefect.body));
    assert.match(savedDefect.body.reply, /neodeslal/);
    const report = env.sqlite.prepare('SELECT defects, work, photo_ids FROM service_reports WHERE job_id=?').get('job-live');
    assert.equal(report.defects, 'Čtvrtý ventil závlahového systému netěsní. Doporučená oprava je výměna ventilu při další návštěvě.');
    const tracked = env.sqlite.prepare('SELECT id, title, description, next_step, garden_id, source_job_id, status FROM garden_defects').all();
    assert.equal(tracked.length, 1);
    assert.equal(tracked[0].title, 'Netěsnící čtvrtý ventil');
    assert.equal(tracked[0].description, report.defects);
    assert.equal(tracked[0].next_step, 'Vyměnit ventil při další návštěvě.');
    assert.equal(tracked[0].garden_id, 'garden-live');
    assert.equal(tracked[0].source_job_id, 'job-live');
    assert.equal(tracked[0].status, 'new');
    assert.equal(savedDefect.body.context.defectId, tracked[0].id);
    assert.equal(mailCount(env), 0);
    const blockedDone = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Zakázku máme hotovou.'}));
    assert.equal(blockedDone.body.confirm, null);
    assert.match(blockedDone.body.reply, /otevřené sledované závady|nezměnil/);
    assert.equal(env.sqlite.prepare('SELECT status FROM jobs WHERE id=?').get('job-live').status, 'in_progress');
    const visitText = 'Musíme se sem vrátit příští středu, potřebujeme vyměnit ještě dva ventily.';
    const workerVisit = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:visitText, context:savedDefect.body.context}));
    assert.match(workerVisit.body.reply, /správce|vlastník/);
    assert.equal(workerVisit.body.confirm, null);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM jobs WHERE deleted=0').get().n, 1);
    const proposedVisit = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:visitText, context:savedDefect.body.context}));
    assert.equal(proposedVisit.status, 200, JSON.stringify(proposedVisit.body));
    assert.equal(proposedVisit.body.concept.kind, 'followup');
    assert.match(proposedVisit.body.reply, new RegExp(followUpDate(today, foldCzech(visitText))));
    assert.match(proposedVisit.body.reply, /2 ks ventil|Propojení/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM jobs WHERE deleted=0').get().n, 1);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n, materialsAtStart);
    const savedVisit = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposedVisit.body.confirm.id}));
    assert.equal(savedVisit.status, 200, JSON.stringify(savedVisit.body));
    assert.match(savedVisit.body.reply, /neodešel/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM jobs WHERE deleted=0').get().n, 2);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n, materialsAtStart);
    const extra = env.sqlite.prepare("SELECT id, title, garden_id, address, customer_name, due_date, assigned_to, start_time, end_time, job_type, status FROM jobs WHERE id<>'job-live' AND deleted=0").get();
    assert.equal(extra.garden_id, 'garden-live');
    assert.equal(extra.address, 'Zahradní 4');
    assert.equal(extra.customer_name, 'Novák');
    assert.equal(extra.due_date, followUpDate(today, foldCzech(visitText)));
    assert.equal(extra.assigned_to, '');
    assert.equal(extra.start_time, '');
    assert.equal(extra.end_time, '');
    assert.equal(extra.job_type, 'installation');
    assert.equal(extra.status, 'planned');
    const link = env.sqlite.prepare('SELECT defect_id, job_id FROM garden_defect_jobs').get();
    assert.equal(link.defect_id, tracked[0].id);
    assert.equal(link.job_id, extra.id);
    assert.equal(mailCount(env), 0);
    const noPhoto = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Připoj poslední fotografii k protokolu.'}));
    assert.equal(noPhoto.body.confirm, null);
    assert.match(noPhoto.body.reply, /není nahraná|neodhaduji/);
    assert.equal(env.sqlite.prepare('SELECT photo_ids FROM service_reports WHERE job_id=?').get('job-live').photo_ids, '[]');
    const invented = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Přidej fotku opraveného ventilu.'}));
    assert.equal(invented.body.confirm, null);
    assert.match(invented.body.reply, /nevyfotím|nepopisuji/);
    assert.equal(invented.body.concept.kind, 'photo');
    assert.equal(invented.body.concept.capture, 'after');
    assert.equal(invented.body.context.jobId, 'job-live');
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM service_photos").get().n, 0);
    env.sqlite.prepare("INSERT INTO service_photos(id,job_id,object_key,mime_type,size,name,sha256,status,created_at,created_by) VALUES('photo-live','job-live','private/photo-live','image/jpeg',6,'ventil.jpg','hash','ready',1,'owner-id')").run();
    const proposedPhoto = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Připoj poslední fotografii k protokolu.'}));
    assert.ok(proposedPhoto.body.confirm?.id);
    assert.match(proposedPhoto.body.reply, /neposuzuji/);
    assert.equal(env.sqlite.prepare('SELECT photo_ids FROM service_reports WHERE job_id=?').get('job-live').photo_ids, '[]');
    const savedPhoto = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposedPhoto.body.confirm.id}));
    assert.equal(savedPhoto.status, 200, JSON.stringify(savedPhoto.body));
    assert.equal(env.sqlite.prepare('SELECT photo_ids FROM service_reports WHERE job_id=?').get('job-live').photo_ids, '["photo-live"]');
    const days = [
      'V pondělí jsme vykopali 80 metrů rýh a položili potrubí.',
      'V úterý jsme namontovali 12 postřikovačů a 4 ventily.',
      'Ve čtvrtek jsme zapojili jednotku a odzkoušeli systém.'
    ];
    let context = savedDefect.body.context;
    let last = null;
    for(const text of days){
      last = await json(await call(env, '/api/assistant', people.owner, 'POST', {text, context}));
      assert.equal(last.status, 200, JSON.stringify(last.body));
      assert.equal(last.body.concept.kind, 'diary');
      assert.ok(last.body.confirm?.id);
      context = last.body.context;
      assert.equal(env.sqlite.prepare('SELECT count(*) n FROM jobs WHERE deleted=0').get().n, 2);
      assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_diary_entries').get().n, 0);
    }
    assert.deepEqual(context.diary.days.map(day=>day.date), days.map(text=>mentionedWorkDate(today, foldCzech(text))).sort());
    const savedDiary = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:last.body.confirm.id}));
    assert.equal(savedDiary.status, 200, JSON.stringify(savedDiary.body));
    assert.match(savedDiary.body.reply, /jedné zakázky|fotografie chybí|neúčtoval/);
    const work = env.sqlite.prepare('SELECT work FROM service_reports WHERE job_id=?').get('job-live').work;
    assert.match(work, /vykopáno/);
    assert.match(work, /položeno potrubí/);
    assert.match(work, /postřikovač/);
    assert.match(work, /ventil/);
    assert.match(work, /zapojeno/);
    assert.match(work, /odzkoušení/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM jobs WHERE deleted=0').get().n, 2);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM job_diary_entries').get().n, 0);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n, materialsAtStart);
    const crew = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kdo dnes pracoval na realizaci?'}));
    assert.equal(crew.body.confirm, null);
    assert.match(crew.body.reply, /nevidím|nedoplnil/);
    assert.doesNotMatch(crew.body.reply, /Luboš|Novák/);
    const hours = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kolik hodin jsme dnes strávili na zakázce?'}));
    assert.equal(hours.body.confirm, null);
    assert.match(hours.body.reply, /Realizace Sever|nemám|nepoužívám/);
    assert.doesNotMatch(hours.body.reply, /plánovaný čas/);
    const person = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Kolik hodin odpracoval Luboš?'}));
    assert.equal(person.body.confirm, null);
    assert.doesNotMatch(person.body.reply, /8 h|vymyslel/);
    const workerWord = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Do slovníku přidej výraz kohouty jako ventily.'}));
    assert.match(workerWord.body.reply, /správce|vlastník/);
    assert.equal(workerWord.body.confirm, null);
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM settings WHERE key='assistant-dictionary'").get().n, 0);
    const emptyList = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Ukaž slovník.'}));
    assert.equal(emptyList.status, 200, JSON.stringify(emptyList.body));
    assert.equal(emptyList.body.confirm ?? null, null);
    assert.match(emptyList.body.reply, /zatím nic není/);
    assert.match(emptyList.body.reply, /nepřeučuje/);
    const proposedWord = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Do slovníku přidej výraz kohouty jako ventily.'}));
    assert.equal(proposedWord.body.concept.kind, 'dictionary');
    assert.equal(env.sqlite.prepare("SELECT count(*) n FROM settings WHERE key='assistant-dictionary'").get().n, 0);
    const savedWord = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposedWord.body.confirm.id}));
    assert.equal(savedWord.status, 200, JSON.stringify(savedWord.body));
    assert.deepEqual(JSON.parse(env.sqlite.prepare("SELECT value FROM settings WHERE key='assistant-dictionary'").get().value), [{phrase:'kohouty', replacement:'ventily'}]);
    const slang = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Použili jsme 4 kohouty.'}));
    assert.equal(slang.body.concept.kind, 'protocol');
    assert.match(slang.body.concept.work, /ventil/);
    assert.doesNotMatch(slang.body.concept.work, /kohout/);
    assert.equal(slang.body.concept.materials[0].query, 'ventil');
    assert.equal(slang.body.concept.materials[0].quantity, '4');
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n, materialsAtStart);
    assert.doesNotMatch(env.sqlite.prepare('SELECT work FROM service_reports WHERE job_id=?').get('job-live').work, /kohout|bylo použito/);
    const listed = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Ukaž slovník.'}));
    assert.equal(listed.body.confirm ?? null, null);
    assert.match(listed.body.reply, /kohouty → ventily/);
    assert.match(listed.body.reply, /nepřeučuje/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM material_items').get().n, materialsAtStart);
    assert.equal(mailCount(env), 0);
  }finally{env.sqlite.close();}
});

test('Completion confirms only a protocol without open defects and never sends a document', async()=>{
  const env = environment();
  try{
    await ready(env);
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const created = await call(env, '/api/jobs/job-ready', people.owner, 'PUT', {version:0, title:'Servis filtru', status:'in_progress', jobType:'service', dueDate:today, customerName:'Novák', incompleteReason:'', assignedTo:people.owner.id, description:''});
    assert.equal(created.status, 200, await created.clone().text());
    const report = await call(env, '/api/jobs/job-ready/service', people.owner, 'PUT', {operationId:'ready-report', version:1, report:{date:today, work:'Vyměněn filtr.', material:'', defects:'', notes:'', recommendations:'', photoIds:[]}});
    assert.equal(report.status, 200, await report.clone().text());
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:'Zakázku máme hotovou.'}));
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.equal(proposed.body.concept.kind, 'complete');
    assert.ok(proposed.body.confirm?.id);
    assert.match(proposed.body.reply, /neodešlu/);
    assert.equal(env.sqlite.prepare('SELECT status FROM jobs WHERE id=?').get('job-ready').status, 'in_progress');
    const done = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id}));
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.match(done.body.reply, /neodešel/);
    assert.equal(env.sqlite.prepare('SELECT status FROM jobs WHERE id=?').get('job-ready').status, 'done');
    assert.equal(mailCount(env), 0);
  }finally{env.sqlite.close();}
});

test('A second worker does not overwrite a different protocol and a chosen photo uses the existing upload', async()=>{
  const env = environment();
  try{
    await ready(env);
    await call(env, '/api/invitations', people.owner, 'POST', {email:people.worker.email, role:'worker'});
    await call(env, '/api/me', people.worker);
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const created = await call(env, '/api/jobs/job-shared', people.owner, 'PUT', {version:0, title:'Společný servis', status:'in_progress', jobType:'service', dueDate:today, customerName:'Novák', address:'Zahradní 1', city:'Brno', incompleteReason:'', assignedTo:people.worker.id, assignedTos:[people.worker.id]});
    assert.equal(created.status, 200, await created.clone().text());
    const spoken = 'Na zakázce jsme vyměnili 4 ventily, 2 postřikovače, opravili prasklé potrubí a nastavili třetí sekci.';
    const proposed = await json(await call(env, '/api/assistant', people.owner, 'POST', {text:spoken, context:{jobId:'job-shared'}}));
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    const first = await json(await call(env, '/api/assistant', people.owner, 'POST', {confirmId:proposed.body.confirm.id, concept:proposed.body.concept}));
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const kept = env.sqlite.prepare('SELECT work FROM service_reports WHERE job_id=?').get('job-shared').work;
    const other = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Použili jsme 2 ventily.', context:{jobId:'job-shared'}}));
    assert.ok(other.body.confirm?.id);
    const blocked = await json(await call(env, '/api/assistant', people.worker, 'POST', {confirmId:other.body.confirm.id, concept:other.body.concept}));
    assert.equal(blocked.status, 200, JSON.stringify(blocked.body));
    assert.match(blocked.body.reply, /nepřepsal|jiný text/);
    assert.equal(env.sqlite.prepare('SELECT work FROM service_reports WHERE job_id=?').get('job-shared').work, kept);
    const before = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Ulož tuto fotku jako stav před opravou.', context:{jobId:'job-shared'}}));
    assert.equal(before.body.confirm ?? null, null);
    assert.equal(before.body.concept.capture, 'before');
    assert.match(before.body.reply, /nevyfotím|nepopisuji/);
    const bytes = new Uint8Array([255,216,255,219,0,1,2,3]);
    const uploaded = await api(new Request('https://zavlahy.test/api/jobs/job-shared/service/photos/photo-shot', {method:'PUT', headers:{'x-zavlahy-request':'1','x-workspace-client-version':'shared-directory-v1','oai-authenticated-user-id':people.worker.id,'oai-authenticated-user-email':people.worker.email,'content-type':'image/jpeg','x-file-name':'pred.jpg'}, body:bytes}), env, ctx);
    assert.equal(uploaded.status, 200, await uploaded.clone().text());
    const phased = await call(env, '/api/jobs/job-shared/photos/photo-shot', people.worker, 'PATCH', {category:'before', note:'', version:1});
    assert.equal(phased.status, 200, await phased.clone().text());
    assert.equal(env.sqlite.prepare('SELECT gallery_category FROM service_photos WHERE id=?').get('photo-shot').gallery_category, 'before');
    const attach = await json(await call(env, '/api/assistant', people.worker, 'POST', {text:'Připoj poslední fotografii k protokolu.', context:{jobId:'job-shared'}}));
    assert.ok(attach.body.confirm?.id);
    assert.match(attach.body.reply, /neposuzuji/);
    assert.equal(env.sqlite.prepare('SELECT photo_ids FROM service_reports WHERE job_id=?').get('job-shared').photo_ids, '[]');
    const saved = await json(await call(env, '/api/assistant', people.worker, 'POST', {confirmId:attach.body.confirm.id}));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(env.sqlite.prepare('SELECT photo_ids FROM service_reports WHERE job_id=?').get('job-shared').photo_ids, '["photo-shot"]');
    assert.equal(env.sqlite.prepare('SELECT work FROM service_reports WHERE job_id=?').get('job-shared').work, kept);
  }finally{env.sqlite.close();}
});







