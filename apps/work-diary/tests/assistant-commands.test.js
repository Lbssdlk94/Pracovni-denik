import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAssistantCommand, contextualCommand, assistantModeInfo, ASSISTANT_MODES, ASSISTANT_PROVIDERS, KNOWLEDGE_KINDS, foldCzech, nextWeekday, parseMaterialAddition, planMaterialLines, weekdayDate, weekSpan, parseServiceDictation, reviseServiceDraft, matchProtocolQuery, annotateProtocolMaterials, serviceDraftQuestions, applyAssistantDictionary, followUpDate, mentionedWorkDate} from '../web/assistant-commands.js';
import {answerOffline, queueOfflineWrite} from '../web/assistant-offline.js';

const today = '2026-11-21';
const intent = text => parseAssistantCommand(text, today).intent;

test('Czech examples map to safe intents without an AI model', ()=>{
  assert.equal(intent('Co máme dnes za práci?'), 'jobs.today');
  assert.equal(intent('Najdi zákazníka Nováka.'), 'customers.search');
  assert.equal(parseAssistantCommand('Najdi zákazníka Nováka.', today).params.query, 'Novák');
  assert.equal(intent('Kolik hodin odpracoval Marek v listopadu?'), 'attendance.hours');
  const hours = parseAssistantCommand('Kolik hodin odpracoval Marek v listopadu?', today);
  assert.equal(hours.params.person, 'Marek');
  assert.equal(hours.params.month, '2026-11');
  assert.equal(intent('Ukaž nedokončené zakázky.'), 'jobs.incomplete');
  assert.equal(intent('Vytvoř servisní protokol.'), 'protocol.draft');
  assert.equal(intent('Jaký materiál potřebujeme na zítřek?'), 'jobs.materials');
  assert.equal(parseAssistantCommand('Jaký materiál potřebujeme na zítřek?', today).params.when, 'tomorrow');
  assert.equal(intent('Kolik hodin jsem dnes odpracoval?'), 'attendance.hours');
  assert.equal(parseAssistantCommand('Kolik hodin jsem dnes odpracoval?', today).params.period, 'today');
  assert.equal(parseAssistantCommand('Kolik hodin jsem dnes odpracoval?', today).params.person, '');
  const onJob = parseAssistantCommand('Kolik hodin strávil Marek na této zakázce?', today);
  assert.equal(onJob.intent, 'jobs.hours');
  assert.equal(onJob.params.person, 'Marek');
  assert.equal(onJob.params.current, true);
  assert.equal(intent('Kolik hodin jsme celkem strávili na realizaci?'), 'jobs.realizationHours');
  const waiting = parseAssistantCommand('Kteří zákazníci čekají na servis?', today);
  assert.equal(waiting.intent, 'jobs.selection');
  assert.equal(waiting.params.kind, 'service');
  assert.equal(waiting.params.phase, 'open');
  assert.equal(waiting.params.ask, false);
  assert.equal(intent('Vytvoř pracovní výkaz za tento měsíc.'), 'attendance.report');
  assert.equal(parseAssistantCommand('Vytvoř pracovní výkaz za tento měsíc.', today).params.period, 'month');
  assert.equal(intent('Co máme zítra za práci?'), 'jobs.tomorrow');
  assert.equal(intent('Co máme tento týden za práci?'), 'jobs.week');
  const lastWeek = parseAssistantCommand('Najdi mi zakázky za minulý týden.', today);
  assert.equal(lastWeek.intent, 'jobs.search');
  assert.equal(lastWeek.params.mine, false);
  assert.deepEqual([lastWeek.params.from, lastWeek.params.to], [weekSpan(today, 'last').start, weekSpan(today, 'last').end]);
  assert.equal(lastWeek.params.from, '2026-11-09');
  const wednesday = parseAssistantCommand('Najdi mé zakázky na středu.', today);
  assert.equal(wednesday.intent, 'jobs.search');
  assert.equal(wednesday.params.mine, true);
  assert.equal(wednesday.params.dueDate, weekdayDate(today, 'streda', 'this'));
  assert.equal(wednesday.params.dueDate, '2026-11-25');
  const person = parseAssistantCommand('Najdi mi zakázky pro Petříka.', today);
  assert.equal(person.intent, 'jobs.search');
  assert.equal(person.params.person, 'Petřík');
  assert.equal(person.params.mine, false);
  assert.equal(parseAssistantCommand('Najdi mi zakázky pro Petrika.', today).params.person, 'Petrik');
  assert.equal(intent('Ukaž všechny nedokončené zakázky.'), 'jobs.incomplete');
  assert.equal(intent('Jsem na cestě k zákazníkovi.'), 'jobs.depart');
  assert.equal(intent('Kdo má stále aktivní docházku?'), 'attendance.active');
  assert.equal(intent('Začni docházku.'), 'attendance.arrive');
  assert.equal(intent('Ukonči docházku.'), 'attendance.leave');
  const move = parseAssistantCommand('Přesuň zakázku u Nováka na pátek.', today);
  assert.equal(move.intent, 'jobs.reschedule');
  assert.equal(move.params.query, 'Novák');
  assert.equal(move.params.dueDate, '2026-11-27');
  assert.equal(nextWeekday('2026-11-21', 'patek'), '2026-11-27');
  const assign = parseAssistantCommand('Přiřaď Marka k realizaci v Plzni.', today);
  assert.equal(assign.intent, 'jobs.assign');
  assert.equal(assign.params.person, 'Mark');
  assert.equal(intent('Označ zakázku Beta jako probíhá.'), 'jobs.status');
  assert.equal(parseAssistantCommand('Označ zakázku Beta jako probíhá.', today).params.status, 'in_progress');
  const addition = parseMaterialAddition('Přidej k aktuální zakázce pět postřikovačů R-VAN 14 a dvacet metrů potrubí 32 mm.');
  assert.equal(addition.current, true);
  assert.deepEqual(addition.lines[0], {quantity:5, unit:'', name:'postrikovacu r van 14'});
  assert.equal(addition.lines[1].quantity, 20);
  assert.equal(addition.lines[1].unit, 'm');
  assert.match(addition.lines[1].name, /potrubi 32 mm/);
  assert.equal(intent('Kolik stojí materiál na zakázce Beta?'), 'materials.price');
  assert.equal(intent('Je materiál připravený k zakázce Beta?'), 'materials.readiness');
  assert.equal(intent('Připrav nákupní seznam materiálu na zítra.'), 'materials.shopping');
  assert.equal(intent('Zkontroluj protokol u zakázky Beta.'), 'protocol.check');
  assert.equal(parseAssistantCommand('Zapiš do protokolu závadu nefunguje sekce 3.', today).intent, 'protocol.note');
  const catalog = [{id:'rvan',version:1,name:'Postřikovač R-VAN 14',sku:'RV14',unit:'ks',priceMinor:12500,currency:'CZK',active:true},{id:'pipe',version:1,name:'Potrubí PE 32 mm',sku:'PE32',unit:'m',priceMinor:4500,currency:'CZK',active:true}];
  const planned = planMaterialLines(addition.lines, catalog);
  assert.deepEqual(planned.lines.map(line=>[line.itemId, line.quantity, line.unit]), [['rvan',5,'ks'],['pipe',20,'m']]);
  assert.match(planMaterialLines([{quantity:5, unit:'m', name:'postrikovacu r-van 14'}], catalog).error, /jednotce ks/);
  assert.match(planMaterialLines([{quantity:1, unit:'ks', name:'neexistujici ventil'}], catalog).error, /nevidím/);
});

test('Synonyms, destructive refusals and mode registry stay local', ()=>{
  assert.equal(intent('co je zítra za návštěvy'), 'jobs.tomorrow');
  assert.equal(intent('budoucí zakázky'), 'jobs.upcoming');
  assert.equal(intent('historie zakázky Novák'), 'jobs.history');
  assert.equal(intent('pracovní výkaz za týden'), 'attendance.report');
  assert.equal(intent('Přidej zákazníka Petříka.'), 'customers.create');
  const draft = parseAssistantCommand('Přidej zákazníka Petříka, telefon 777 123 456, adresa Zahradní 1, Brno.', today);
  assert.equal(draft.params.name, 'Petřík');
  assert.equal(draft.params.phone, '777 123 456');
  assert.equal(draft.params.address, 'Zahradní 1');
  assert.equal(draft.params.city, 'Brno');
  assert.equal(intent('Najdi zákazníka Petříka.'), 'customers.search');
  const job = parseAssistantCommand('Vytvoř zakázku servis u Petříka na zítra.', today);
  assert.equal(job.intent, 'jobs.create');
  assert.equal(job.params.title, 'servis');
  assert.equal(job.params.customer, 'Petřík');
  assert.equal(job.params.when, 'tomorrow');
  assert.equal(parseAssistantCommand('Vytvoř zakázku Kontrola filtru', today).params.title, 'Kontrola filtru');
  assert.equal(parseAssistantCommand('Vytvoř zakázku Kontrola filtru', today).params.customer, '');
  const follow = contextualCommand(parseAssistantCommand('Zobraz jeho zakázky', today), {customerName:'Novák'});
  assert.equal(follow.intent, 'jobs.search');
  assert.equal(follow.params.query, 'Novák');
  const visits = contextualCommand(parseAssistantCommand('Historie návštěv', today), {customerName:'Novák'});
  assert.equal(visits.intent, 'customers.history');
  assert.equal(visits.params.query, 'Novák');
  assert.equal(intent('smaž zakázku Novák'), 'refused.destructive');
  assert.equal(intent(''), 'unknown');
  assert.equal(foldCzech('Příště'), 'priste');
  assert.deepEqual(ASSISTANT_MODES.map(mode=>mode.id), ['basic','local','cloud']);
  assert.equal(assistantModeInfo('cloud').id, 'cloud');
  assert.equal(assistantModeInfo('nope').id, 'basic');
  assert.equal(assistantModeInfo('local').available, true);
  assert.equal(assistantModeInfo('cloud').available, false);
  assert.match(assistantModeInfo('local').detail, /2,2 GB/);
  assert.match(assistantModeInfo('cloud').detail, /není zapojený/);
  assert.deepEqual(ASSISTANT_PROVIDERS.filter(item=>item.available).map(item=>item.id), ['basic','ministral-3b']);
  assert.ok(ASSISTANT_PROVIDERS.some(item=>item.id==='ministral-3b'&&item.available===true));
  assert.ok(ASSISTANT_PROVIDERS.some(item=>item.id==='qwen'&&item.available===false));
  assert.ok(ASSISTANT_PROVIDERS.some(item=>item.id==='apple-foundation'&&item.available===false));
  assert.deepEqual(KNOWLEDGE_KINDS.map(item=>item.available), [false, false, false]);
});

test('Offline answers stay inside the stored snapshot', ()=>{
  const today = '2026-11-21';
  const jobs = [{title:'Kontrola', dueDate:today, status:'planned', customerName:'Novák', jobType:'service'}];
  const todayReply = answerOffline(parseAssistantCommand('Co máme dnes za práci?', today), {jobs, today, tomorrow:'2026-11-22'});
  assert.match(todayReply.reply, /Kontrola/);
  const missing = answerOffline(parseAssistantCommand('Kolik hodin jsem dnes odpracoval?', today), {jobs, today});
  assert.equal(missing.missing, true);
  assert.match(missing.reply, /nevymyslel/);
  const empty = answerOffline(parseAssistantCommand('Co máme dnes za práci?', today), {});
  assert.equal(empty.missing, true);
});

const CANONICAL_WORK = 'V rámci servisního zásahu byla provedena výměna čtyř ventilů a dvou postřikovačů závlahového systému. Dále bylo opraveno poškozené potrubí a upraveno nastavení třetí závlahové sekce.';
const SPOKEN_WORK = 'Na zakázce jsme vyměnili 4 ventily, 2 postřikovače, opravili prasklé potrubí a nastavili třetí sekci.';
const FITTING_WORK = 'Použili jsme 20 metrů třicet dvojky, čtyři kolena, dva T-kusy a šest postřikovačů Rain Bird.';

test('Service dictation becomes an editable protocol, not invented work', ()=>{
  const command = parseAssistantCommand(SPOKEN_WORK, today);
  assert.equal(command.intent, 'protocol.report');
  const draft = command.params.draft;
  assert.equal(draft.work, CANONICAL_WORK);
  assert.doesNotMatch(draft.work, /těsnost|plně funkční/);
  assert.deepEqual(draft.materials.map(line=>[line.key, line.query, line.quantity, line.unit]), [
    ['ventil', 'ventil', 4, 'ks'],
    ['postrkovac', 'postřikovač', 2, 'ks'],
    ['potrubi', 'potrubí', null, 'm']
  ]);
  const questions = serviceDraftQuestions(draft);
  assert.ok(questions.required.some(item=>item==='Kolik metrů potrubí bylo spotřebováno?'));
  assert.ok(questions.optional.includes('Byla provedena kontrola těsnosti?'));
  assert.ok(questions.optional.includes('Je systém plně funkční?'));
  assert.ok(questions.optional.includes('Je nutná další návštěva?'));
  assert.ok(questions.optional.includes('Byly zjištěny další závady?'));
  const quiet = serviceDraftQuestions({...draft, asked:['tightness','functional','next','defects']});
  assert.equal(quiet.optional.some(item=>/těsnosti|funkční|návštěva|závady/.test(item)), false);
  const typed = serviceDraftQuestions({materials:[{key:'ventil', label:'Ventily', quantity:4, generic:true, status:'matched'}], asked:['tightness','functional','next','defects']});
  assert.ok(typed.optional.some(item=>/typ ventilů/.test(item)));

  const fittings = parseServiceDictation(FITTING_WORK);
  assert.equal(fittings.work, 'V rámci servisního zásahu bylo použito dvacet metrů potrubí o průměru 32 mm, čtyři kolena, dva T-kusy a šest postřikovačů Rain Bird.');
  assert.deepEqual(fittings.materials.map(line=>[line.key, line.query, line.quantity, line.unit, line.generic]), [
    ['potrubi', 'potrubí PE 32 mm', 20, 'm', false],
    ['koleno', 'koleno', 4, 'ks', true],
    ['tkus', 'T-kus', 2, 'ks', true],
    ['postrkovac', 'postřikovač Rain Bird', 6, 'ks', false]
  ]);
  assert.equal(intent('Zkontroluj protokol u zakázky Beta.'), 'protocol.check');
  assert.equal(intent('Přidej k aktuální zakázce pět postřikovačů.'), 'materials.add');
  assert.equal(intent('Vytvoř zakázku servis u Petříka na zítra.'), 'jobs.create');
  assert.equal(intent('Kolik hodin jsem dnes odpracoval?'), 'attendance.hours');
});

test('Protocol follow-ups edit the open draft and do not steal other intents', ()=>{
  let revised = reviseServiceDraft(parseServiceDictation(SPOKEN_WORK), 'Přidej ještě jeden ventil.');
  assert.equal(revised.draft.materials.find(line=>line.key==='ventil').quantity, 5);
  revised = reviseServiceDraft(revised.draft, 'Přidej ještě dva ventily.');
  assert.equal(revised.draft.materials.find(line=>line.key==='ventil').quantity, 7);
  revised = reviseServiceDraft(revised.draft, 'Ty postřikovače byly Rain Bird.');
  assert.equal(revised.draft.materials.find(line=>line.key==='postrkovac').query, 'postřikovač Rain Bird');
  assert.equal(revised.draft.materials.find(line=>line.key==='postrkovac').generic, false);
  revised = reviseServiceDraft(revised.draft, 'Oprav množství potrubí na 25 metrů.');
  assert.equal(revised.draft.materials.find(line=>line.key==='potrubi').quantity, 25);
  assert.equal(revised.draft.materials.find(line=>line.key==='potrubi').unit, 'm');
  revised = reviseServiceDraft(revised.draft, 'Dva ventily nakonec nebyly potřeba.');
  assert.equal(revised.draft.materials.find(line=>line.key==='ventil').quantity, 5);
  revised = reviseServiceDraft(revised.draft, 'Připiš, že jsme zkontrolovali všechny sekce.');
  assert.match(revised.draft.work, /Dále byla provedena kontrola všech závlahových sekcí\.$/);
  assert.equal(revised.draft.work.startsWith(CANONICAL_WORK), true);
  const shown = reviseServiceDraft(revised.draft, 'Ukaž mi celý protokol.');
  assert.equal(shown.show, true);
  assert.match(shown.draft.work, /kontrola všech závlahových sekcí/);
  const undone = reviseServiceDraft(shown.draft, 'Vrať poslední změnu.');
  assert.equal(undone.undo, true);
  assert.doesNotMatch(undone.draft.work, /kontrola všech závlahových sekcí/);
  assert.equal(reviseServiceDraft({work:'x', materials:[], asked:[], history:[]}, 'Vrať poslední změnu.').undo, 'empty');

  const open = parseServiceDictation(SPOKEN_WORK);
  const hours = contextualCommand(parseAssistantCommand('Kolik hodin jsme dnes strávili na zakázce?', today), {protocol:open, jobId:'job-1'});
  assert.equal(hours.intent, 'jobs.hours');
  const check = contextualCommand(parseAssistantCommand('Zkontroluj protokol.', today), {protocol:open});
  assert.equal(check.intent, 'protocol.check');
  const named = contextualCommand(parseAssistantCommand('Zakázka Severní zahrada', today), {protocol:open});
  assert.equal(named.intent, 'protocol.report');
  assert.equal(named.params.jobQuery, 'Severní zahrad');
  const offline = answerOffline(parseAssistantCommand(SPOKEN_WORK, today), {jobs:[], today});
  assert.equal(offline.missing, true);
  assert.match(offline.reply, /neukládám/);
});

test('Protocol catalogue match bills one exact item and never invents a row', ()=>{
  const items = [
    {id:'pe', version:1, name:'Potrubí PE 32 mm', sku:'PE32', unit:'m', active:true},
    {id:'elbow-pe', version:1, name:'Koleno PE', unit:'ks', active:true},
    {id:'elbow-head', version:1, name:'Koleno postřikovač', unit:'ks', active:true},
    {id:'tee16', version:1, name:'T - kus 16mm', unit:'ks', active:true},
    {id:'tee', version:1, name:'T-kus', unit:'ks', active:true},
    {id:'rain', version:1, name:'Postřikovač Rain Bird', unit:'ks', active:true},
    {id:'drip', version:1, name:'Kapkovací potrubí / kapka', unit:'m', active:true}
  ];
  assert.equal(matchProtocolQuery('potrubí PE 32 mm', items).item.id, 'pe');
  assert.ok(matchProtocolQuery('koleno', items).choices?.length>=2);
  assert.equal(matchProtocolQuery('koleno', items).item, undefined);
  assert.equal(matchProtocolQuery('T-kus', items).item.id, 'tee');
  assert.equal(matchProtocolQuery('postřikovač Rain Bird', items).item.id, 'rain');
  assert.ok(matchProtocolQuery('postřikovač', items).choices?.length);
  assert.equal(matchProtocolQuery('postřikovač', items).item, undefined);
  assert.equal(matchProtocolQuery('ventil', items).missing, true);
  assert.equal(matchProtocolQuery('potrubí', items).missing, true);
  const annotated = annotateProtocolMaterials(parseServiceDictation(FITTING_WORK), items);
  assert.equal(annotated.materials.find(line=>line.key==='potrubi').status, 'matched');
  assert.equal(annotated.materials.find(line=>line.key==='potrubi').itemId, 'pe');
  assert.equal(annotated.materials.find(line=>line.key==='koleno').status, 'choices');
  assert.equal(annotated.materials.find(line=>line.key==='koleno').itemId, '');
  assert.equal(annotated.materials.find(line=>line.key==='tkus').itemId, 'tee');
  assert.equal(annotated.materials.find(line=>line.key==='postrkovac').itemId, 'rain');
  const asked = serviceDraftQuestions(annotated);
  assert.ok(asked.required.some(item=>/Kolena/.test(item)&&/nezakládám/.test(item)));
  assert.equal(asked.required.some(item=>/Rain Bird/.test(item)), false);
});

test('Defects, visits, realization days, photos and the garden dictionary stay commands', ()=>{
  const defect = parseAssistantCommand('Čtvrtý ventil netěsní, budeme ho muset příště vyměnit.', today);
  assert.equal(defect.intent, 'defects.track');
  assert.equal(defect.params.note.title, 'Netěsnící čtvrtý ventil');
  assert.equal(defect.params.note.description, 'Čtvrtý ventil závlahového systému netěsní. Doporučená oprava je výměna ventilu při další návštěvě.');
  assert.equal(defect.params.note.nextStep, 'Vyměnit ventil při další návštěvě.');
  assert.equal(intent(SPOKEN_WORK), 'protocol.report');
  const visit = parseAssistantCommand('Musíme se sem vrátit příští středu, potřebujeme vyměnit ještě dva ventily.', today);
  assert.equal(visit.intent, 'jobs.followup');
  assert.equal(visit.params.visit.dueDate, '2026-11-25');
  assert.equal(visit.params.visit.dueDate, followUpDate(today, foldCzech(visit.text)));
  assert.deepEqual(visit.params.visit.materials, [{name:'ventil', quantity:2, unit:'ks'}]);
  assert.equal(intent('Zakázku máme hotovou.'), 'jobs.complete');
  assert.equal(intent('Připoj poslední fotografii k protokolu.'), 'protocol.photo');
  assert.equal(parseAssistantCommand('Připoj poslední fotografii k protokolu.', today).params.when, 'latest');
  assert.equal(parseAssistantCommand('Přidej fotku opraveného ventilu.', today).params.when, 'after');
  assert.equal(parseAssistantCommand('Ulož tuto fotku jako stav před opravou.', today).params.when, 'before');
  assert.equal(intent('Zkontroluj protokol u zakázky Beta.'), 'protocol.check');
  const monday = parseAssistantCommand('V pondělí jsme vykopali 80 metrů rýh a položili potrubí.', today);
  const tuesday = parseAssistantCommand('V úterý jsme namontovali 12 postřikovačů a 4 ventily.', today);
  const thursday = parseAssistantCommand('Ve čtvrtek jsme zapojili jednotku a odzkoušeli systém.', today);
  assert.equal(monday.intent, 'diary.day');
  assert.equal(tuesday.intent, 'diary.day');
  assert.equal(thursday.intent, 'diary.day');
  assert.deepEqual([monday.params.day.date, tuesday.params.day.date, thursday.params.day.date], ['2026-11-16','2026-11-17','2026-11-19']);
  assert.equal(monday.params.day.date, mentionedWorkDate(today, foldCzech(monday.text)));
  assert.match(monday.params.day.work, /vykopáno/);
  assert.match(monday.params.day.work, /položeno potrubí/);
  assert.match(tuesday.params.day.work, /postřikovač/);
  assert.match(tuesday.params.day.work, /ventil/);
  assert.match(thursday.params.day.work, /zapojeno/);
  assert.match(thursday.params.day.work, /odzkoušení/);
  const kept = contextualCommand(tuesday, {diary:{jobId:'job-1', days:[monday.params.day]}});
  assert.equal(kept.intent, 'diary.day');
  assert.equal(kept.params.base.jobId, 'job-1');
  const mow = parseAssistantCommand('Posekali jsme trávník.', today);
  assert.equal(mow.intent, 'protocol.report');
  assert.match(mow.params.draft.work, /posečeno/);
  assert.match(mow.params.draft.work, /trávník/);
  assert.equal(mow.params.draft.materials.length, 0);
  assert.equal(intent('Vertikutovali jsme trávník.'), 'protocol.report');
  assert.equal(intent('Hnojili jsme záhon.'), 'protocol.report');
  assert.equal(intent('Vysadili jsme keře.'), 'protocol.report');
  const dictionary = parseAssistantCommand('Do slovníku přidej výraz kohouty jako ventily.', today);
  assert.equal(dictionary.intent, 'dictionary.add');
  assert.deepEqual(dictionary.params, {phrase:'kohouty', replacement:'ventily'});
  assert.equal(intent('Ukaž slovník.'), 'dictionary.list');
  assert.equal(intent('Vypiš slovník.'), 'dictionary.list');
  assert.equal(intent('Jaké výrazy jsou ve slovníku?'), 'dictionary.list');
  const listed = answerOffline(parseAssistantCommand('Ukaž slovník.', today), {jobs:[], today});
  assert.equal(listed.missing, true);
  assert.match(listed.reply, /třicet dvojka/);
  assert.doesNotMatch(listed.reply, /neukládám/);
  assert.equal(applyAssistantDictionary('Použili jsme 4 kohouty.', [{phrase:'kohouty', replacement:'ventily'}]), 'Použili jsme 4 ventily.');
  assert.equal(intent('Kolik hodin jsme dnes strávili na zakázce?'), 'jobs.hours');
  assert.equal(parseAssistantCommand('Kolik hodin jsme dnes strávili na zakázce?', today).params.current, true);
  assert.equal(intent('Kdo dnes pracoval na realizaci?'), 'jobs.crew');
  assert.equal(intent('Kolik hodin odpracoval Luboš?'), 'attendance.hours');
  for(const text of ['Čtvrtý ventil netěsní, budeme ho muset příště vyměnit.','Musíme se sem vrátit příští středu, potřebujeme vyměnit ještě dva ventily.','Zakázku máme hotovou.','Připoj poslední fotografii k protokolu.','V pondělí jsme vykopali 80 metrů rýh a položili potrubí.','Do slovníku přidej výraz kohouty jako ventily.']){
    const offline = answerOffline(parseAssistantCommand(text, today), {jobs:[], today});
    assert.equal(offline.missing, true);
    assert.match(offline.reply, /neukládám|nezměnilo/);
  }
  const crew = answerOffline(parseAssistantCommand('Kdo dnes pracoval na realizaci?', today), {jobs:[], today});
  assert.equal(crew.missing, true);
  assert.match(crew.reply, /nemám/);
  assert.doesNotMatch(crew.reply, /neukládám/);
  const queued = queueOfflineWrite([], parseAssistantCommand(SPOKEN_WORK, today));
  assert.equal(queued.queued, true);
  assert.equal(queued.queue.length, 1);
  assert.match(queued.reply, /neukládám/);
  assert.match(queued.reply, /potvrzení/);
  const again = queueOfflineWrite(queued.queue, parseAssistantCommand(SPOKEN_WORK, today));
  assert.equal(again.duplicate, true);
  assert.equal(again.queue.length, 1);
  assert.equal(queueOfflineWrite([], parseAssistantCommand('Co máme dnes za práci?', today)).queued, false);
});
