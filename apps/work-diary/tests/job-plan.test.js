import test from 'node:test';
import assert from 'node:assert/strict';
import {planWork, revisePlan, matchPeople, planCollisions} from '../web/job-plan.js';
import {parseAssistantCommand, contextualCommand} from '../web/assistant-commands.js';

const sentence = 'V pondělí budeme dělat realizaci závlahy u Bambošové asi na 4 dny. Bude tam Luboš a Zdeněk.';

test('Four work days stay one plan and Wednesday can move to Friday', ()=>{
  const plan = planWork(sentence, '2026-11-22');
  assert.deepEqual(plan.terms.map(term=>term.date), ['2026-11-23','2026-11-24','2026-11-25','2026-11-26']);
  assert.deepEqual(plan.terms[0].people, ['Luboš','Zdeněk']);
  assert.equal(plan.customerStem, 'bambos');
  const moved = revisePlan(plan, 'Ve středu pojedeme jinam, čtvrtý den bude v pátek.');
  assert.deepEqual(moved.terms.map(term=>term.date), ['2026-11-23','2026-11-24','2026-11-26','2026-11-27']);
  const late = revisePlan(moved, 'Zdeněk přijede až v úterý.');
  assert.deepEqual(late.terms[0].people, ['Luboš']);
  assert.deepEqual(late.terms[1].people, ['Luboš','Zdeněk']);
  const material = revisePlan(late, 'Potřebujeme jednotku Rain Bird a 100 m potrubí 32 mm.');
  assert.equal(material.materials[0].readiness, 'buy');
  assert.equal(material.materials[1].quantity, 100);
  const owned = revisePlan(material, 'Jednotku už máme.');
  assert.equal(owned.materials[0].readiness, 'on_hand');
  const withMarek = revisePlan(owned, 'Přidej ještě Marka.');
  assert.equal(withMarek.terms.every(term=>term.people.includes('Marka')), true);
  const matched = matchPeople(['Marka'], [{id:'marek', name:'Marek'}]);
  assert.equal(matched.resolved[0].id, 'marek');
});

test('Duplicate names and collisions are reported before any write', ()=>{
  const plan = planWork(sentence, '2026-11-22');
  const matched = matchPeople(['Zdeněk'], [{id:'a', name:'Zdeněk'},{id:'b', name:'Zdeněk'}]);
  assert.equal(matched.resolved.length, 0);
  assert.equal(matched.ambiguous[0].options.length, 2);
  const hits = planCollisions(plan, [{title:'Jiná práce', dueDate:'2026-11-23', assignedNames:['Luboš']}]);
  assert.equal(hits[0].title, 'Jiná práce');
  assert.equal(parseAssistantCommand(sentence, '2026-11-22').intent, 'jobs.plan');
  const follow = contextualCommand(parseAssistantCommand('Ve středu pojedeme jinam.', '2026-11-22'), {plan});
  assert.equal(follow.intent, 'jobs.plan');
  assert.equal(parseAssistantCommand('Vytvoř zakázku servis u Petříka na zítra', '2026-11-22').intent, 'jobs.create');
  const petrik = 'Vytvoř zakázku na pondělí a středu u pana Petříka. Realizace závlahy od 8 hodin do 16 hodin.';
  const planned = planWork(petrik, '2026-11-22');
  assert.equal(parseAssistantCommand(petrik, '2026-11-22').intent, 'jobs.plan');
  assert.equal(planned.customerStem, 'petrik');
  assert.deepEqual(planned.terms.map(term=>[term.date, term.start, term.end]), [['2026-11-23','08:00','16:00'],['2026-11-25','08:00','16:00']]);
  const crew = revisePlan(planned, 'V pondělí bude Luboš a ve středu Zdeněk. Potřebujeme 10 m potrubí k nákupu.');
  assert.deepEqual(crew.terms[0].people, ['Luboš']);
  assert.deepEqual(crew.terms[1].people, ['Zdeněk']);
  assert.match(crew.materials[0].name, /potrubí/i);
  const again = revisePlan(crew, 'V pondělí bude Luboš a ve středu Zdeněk. Potřebujeme 10 m potrubí k nákupu.');
  assert.equal(again.materials.length, 1);
  const both = revisePlan(planned, 'Oba dny bude Luboš a Zdeněk.');
  assert.equal(both.terms.every(term=>term.people.join()==='Luboš,Zdeněk'), true);
  assert.equal(planWork('Kolik hodin jsme celkem strávili na realizaci?', '2026-11-22'), null);
  assert.equal(planWork('Vytvoř zakázku servis u Petříka na zítra', '2026-11-22'), null);
});
