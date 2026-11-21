import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAssistantCommand, assistantModeInfo, ASSISTANT_MODES, foldCzech} from '../web/assistant-commands.js';

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
});

test('Synonyms, destructive refusals and mode registry stay local', ()=>{
  assert.equal(intent('co je zítra za návštěvy'), 'jobs.tomorrow');
  assert.equal(intent('budoucí zakázky'), 'jobs.upcoming');
  assert.equal(intent('historie zakázky Novák'), 'jobs.history');
  assert.equal(intent('pracovní výkaz za týden'), 'attendance.report');
  assert.equal(intent('smaž zakázku Novák'), 'refused.destructive');
  assert.equal(intent(''), 'unknown');
  assert.equal(foldCzech('Příště'), 'priste');
  assert.deepEqual(ASSISTANT_MODES.map(mode=>mode.id), ['basic','local','cloud']);
  assert.equal(assistantModeInfo('cloud').id, 'cloud');
  assert.equal(assistantModeInfo('nope').id, 'basic');
  assert.match(assistantModeInfo('local').detail, /nestahuje/);
  assert.match(assistantModeInfo('cloud').detail, /není zapojený/);
});
