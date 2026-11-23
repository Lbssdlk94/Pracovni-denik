import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interpretAssistant, parseAssistantCommand, parseServiceDictation, reviseServiceDraft, matchProtocolQuery, annotateProtocolMaterials} from '../web/assistant-commands.js';
import {pickNextWork, modelReadCommand} from '../web/assistant-intent.js';
import {extractLocalUnderstanding} from '../web/assistant-local.js';

const today = '2026-11-23';
const intent = (text, context)=>interpretAssistant(text, today, context||null).intent;

test('Held-out Czech paraphrases share an intent without being stored as sentences', ()=>{
  const source = readFileSync(new URL('../web/assistant-intent.js', import.meta.url), 'utf8');
  for(const phrase of ['Kam mám jet až potom?', 'Kde pak budeme pracovat?', 'kamm pojedu pootm']){
    assert.equal(source.includes(phrase), false);
    assert.equal(intent(phrase), 'jobs.next');
  }
  assert.equal(intent('Jaká je další zakázka?'), 'jobs.next');
  assert.equal(intent('dalsi zakazka'), 'jobs.next');
  assert.equal(intent('Co je dalšího na řadě?'), 'jobs.next');
  assert.equal(intent('Další práce.'), 'assistant.clarify');
  assert.equal(intent('Další práci prosím'), 'assistant.clarify');
  assert.equal(intent('Další práce.', {jobId:'job-1'}), 'jobs.next');
  assert.equal(intent('Přidej další práci.'), 'assistant.clarify');
  assert.notEqual(intent('Přidej další zakázku.'), 'jobs.next');
  assert.equal(intent('Další zakázku ještě nezačínej.'), 'assistant.refuse');
  assert.equal(intent('Čtyři ventily jsme nepoužili.'), 'assistant.refuse');
  assert.equal(intent('Čtyři lavalit jsme nepoužili.'), 'assistant.refuse');
  assert.equal(intent('Co se stane, když zakázku dokončím?'), 'assistant.explain');
  assert.notEqual(parseAssistantCommand('Co se stane, když zakázku dokončím?', today).intent, 'assistant.explain');
  assert.equal(intent('Končím.'), 'assistant.clarify');
  assert.equal(intent('Zapni docházku.'), 'attendance.arrive');
  assert.equal(intent('Zapiš příchod.'), 'attendance.arrive');
  assert.equal(intent('Dnes končím, zapiš odchod.'), 'attendance.leave');
  assert.equal(intent('Kolik stojí ten lavalit?'), 'materials.price');
  assert.equal(interpretAssistant('Kolik stojí jeden lavalit?', today).params.query, 'lavalit');
  assert.equal(intent('Je ten lavalit skladem?'), 'materials.stock');
  assert.equal(intent('Budeme potřebovat čtyři lavalit.'), 'materials.plan');
  assert.equal(intent('Použili jsme čtyři lavalit.'), 'protocol.report');
  assert.equal(intent('Ventil jsme jen zkontrolovali.'), 'assistant.explain');
  assert.equal(intent('Ukaž nedokončené zakázky.'), 'jobs.incomplete');
  assert.equal(intent('Co máme dnes za práci?'), 'jobs.today');
  const batch = interpretAssistant('Dorazil jsem k Novákovi, vyměnili jsme tři ventily a musíme se sem vrátit v pátek.', today);
  assert.equal(batch.intent, 'assistant.batch');
  assert.match(batch.params.reply, /Nic jsem neprovedl/);
});

test('Next work uses every term and does not invent an order', ()=>{
  const jobs = [
    {id:'a', title:'Dnešní filtr', status:'planned', dueDate:'2026-11-23', plannedStart:'08:00', customerName:'Novák', address:'Zahradní 1'},
    {id:'b', title:'Pozdější ventil', status:'planned', dueDate:'2026-11-20', customerName:'Dvořák', address:'Lipová 8', schedule:{dates:['2026-11-20','2026-11-25']}, terms:[{date:'2026-11-20', status:'done', start:'08:00'},{date:'2026-11-25', status:'planned', start:'09:30'}]}
  ];
  const picked = pickNextWork(jobs, today, 'a');
  assert.equal(picked.next.job.id, 'b');
  assert.equal(picked.next.date, '2026-11-25');
  assert.equal(picked.next.time, '09:30');
  const tie = pickNextWork([
    {id:'c', title:'Sever', status:'planned', dueDate:today, customerName:'Sever'},
    {id:'d', title:'Jih', status:'planned', dueDate:today, customerName:'Jih'}
  ], today, '');
  assert.equal(tie.next, undefined);
  assert.equal(tie.choices.length, 2);
  assert.equal(tie.untimed, true);
});

test('A catalog item added only in data is usable and ambiguous variants stay a choice', ()=>{
  const spoken = parseServiceDictation('Použili jsme pět kusů lavalit.');
  assert.equal(spoken.materials[0].key, 'catalog');
  assert.equal(spoken.materials[0].quantity, 5);
  assert.equal(spoken.materials[0].unit, 'ks');
  const one = [{id:'lava', version:1, name:'Lavalit', sku:'LAVA', unit:'ks', active:true}];
  assert.equal(matchProtocolQuery('lavalit', one).item.id, 'lava');
  const variants = [
    {id:'coarse', version:1, name:'Lavalit hrubý', unit:'ks', active:true},
    {id:'fine', version:1, name:'Lavalit jemný', unit:'ks', active:true}
  ];
  const choice = matchProtocolQuery(spoken.materials[0].query, variants);
  assert.equal(choice.item, undefined);
  assert.ok(choice.choices.length>=2);
  const annotated = annotateProtocolMaterials(spoken, variants);
  assert.equal(annotated.materials[0].status, 'choices');
  assert.equal(annotated.materials[0].itemId, '');
});

test('A follow-up quantity changes only a clear row and a no does not invent a check', ()=>{
  const draft = parseServiceDictation('Použili jsme čtyři lavalit a dva ventily.');
  assert.equal(draft.materials.length, 2);
  const vague = reviseServiceDraft(draft, 'Nakonec jen tři.');
  assert.match(vague.clarify, /kterou/i);
  assert.equal(vague.draft.materials[0].quantity, 4);
  const exact = reviseServiceDraft(draft, 'Lavalit byly to jen tři.');
  assert.equal(exact.draft.materials.find(line=>line.key==='catalog').quantity, 3);
  const asked = {...draft, pendingQuestion:'tightness', asked:[]};
  const no = reviseServiceDraft(asked, 'ne');
  assert.ok(no.draft.asked.includes('tightness'));
  assert.doesNotMatch(no.draft.work, /těsnosti|funkční/);
  const yes = reviseServiceDraft(asked, 'Odpověď na kontrolu těsnosti: ano');
  assert.match(yes.draft.work, /Pracovník potvrdil/);
  const removed = reviseServiceDraft(draft, 'Smaž druhý řádek.');
  assert.equal(removed.draft.materials.length, 1);
});

test('The local model may only name a supported read intent', ()=>{
  const read = extractLocalUnderstanding('{"intent":"jobs.next","entities":{"person":"self"}}');
  assert.equal(read.intent, 'jobs.next');
  assert.equal(read.read.intent, 'jobs.next');
  assert.equal(extractLocalUnderstanding('{"intent":"invoice.create","command":"Vytvoř fakturu"}'), null);
  assert.equal(modelReadCommand({intent:'jobs.complete'}), null);
  assert.equal(modelReadCommand({intent:'not-a-real-intent'}), null);
});
