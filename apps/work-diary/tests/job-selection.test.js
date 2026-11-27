import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAssistantCommand} from '../web/assistant-commands.js';
import {answerOffline} from '../web/assistant-offline.js';
import {mergeJobKinds, parseWorkQuestion, workPhase, phaseClause, filterJobs, formatSelectionReply, groupByCustomer, selectionSummary} from '../web/job-selection.js';

const today = '2026-11-23';
const kinds = mergeJobKinds([{id:'hedge', label:'Střih živého plotu', aliases:['strih','strihy']}]);

function selected(text, catalog = kinds){
  return parseAssistantCommand(text, today, catalog);
}

test('Work questions pick the stored kind and phase, including colloquial text without diacritics', ()=>{
  const cases = [
    ['Kteří zákazníci čekají na realizaci?', 'installation', 'open', false],
    ['Co máme ještě realizovat?', 'installation', 'open', false],
    ['Kdo čeká na realizaci?', 'installation', 'open', false],
    ['Co zbývá z realizací?', 'installation', 'open', false],
    ['Které realizace ještě nejsou hotové?', 'installation', 'open', false],
    ['Ktery realizace jeste nejsou hotovy?', 'installation', 'open', false],
    ['Které realizace čekají na naplánování?', 'installation', 'waiting', false],
    ['Jaké realizace jsou naplánované?', 'installation', 'scheduled', false],
    ['Kde teď probíhá realizace?', 'installation', 'active', false],
    ['Které realizace jsou hotové?', 'installation', 'done', false],
    ['Ukaž všechny realizace včetně hotových.', 'installation', 'open_done', false],
    ['Kdo čeká na servis?', 'service', 'open', false],
    ['Kde ještě musíme vyfouknout závlahu?', 'blowout', 'open', false],
    ['Které údržby nemají termín?', 'maintenance', 'waiting', false],
    ['Kdo čeká na střih?', 'hedge', 'open', false],
    ['Ktere strihy jeste nejsou hotovy?', 'hedge', 'open', false]
  ];
  for(const [text, kind, phase, ask] of cases){
    const command = selected(text);
    assert.equal(command.intent, 'jobs.selection', text);
    assert.equal(command.params.kind, kind, text);
    assert.equal(command.params.phase, phase, text);
    assert.equal(command.params.ask, ask, text);
  }
  const plain = selected('Ktery realizace jeste nejsou hotovy?');
  const accented = selected('Které realizace ještě nejsou hotové?');
  assert.deepEqual([plain.params.kind, plain.params.phase], [accented.params.kind, accented.params.phase]);
  const irrigation = selected('Kde máme ještě dělat závlahu?');
  assert.equal(irrigation.intent, 'jobs.selection');
  assert.equal(irrigation.params.ask, true);
  assert.equal(irrigation.params.reason, 'irrigation');
  assert.equal(selected('Kdo čeká na střih?', mergeJobKinds([])).params.ask, true);
  assert.equal(selected('Co máme dnes za práci?').intent, 'jobs.today');
  assert.equal(selected('Kolik hodin jsme celkem strávili na realizaci?').intent, 'jobs.realizationHours');
  assert.equal(selected('Označ zakázku Beta jako probíhá.').intent, 'jobs.status');
  assert.equal(selected('Ukaž nedokončené zakázky.').intent, 'jobs.incomplete');
});

test('Phase comes from stored status and every appointment, never from a note or a passed date', ()=>{
  assert.equal(workPhase({status:'planned', dueDate:''}), 'waiting');
  assert.equal(workPhase({status:'planned', dueDate:'2020-01-02'}), 'scheduled');
  assert.equal(workPhase({status:'planned', dueDate:'', terms:[{date:'2026-12-01'},{date:'2026-12-02'}]}), 'scheduled');
  assert.equal(workPhase({status:'planned'}), 'scheduled');
  assert.equal(workPhase({status:'in_progress', dueDate:''}), 'active');
  assert.equal(workPhase({status:'on_way', dueDate:'2020-01-02'}), 'active');
  assert.equal(workPhase({status:'done', dueDate:'', protocolStatus:'draft'}), 'done');
  assert.equal(workPhase({status:'incomplete', dueDate:''}), 'incomplete');
  assert.equal(workPhase({status:'planned', dueDate:'', deleted:1}), 'cancelled');
  assert.equal(phaseClause('open', true).includes('description'), false);
  assert.match(phaseClause('open', true), /job_terms/);
  assert.equal(phaseClause('archived', true), '1=0');
  assert.equal(phaseClause('nope', true), '');
  const rows = [
    {id:'wait', customerId:'a', customerName:'Novák', title:'Čeká', jobType:'installation', status:'planned', dueDate:'', description:'zmínka o servisu'},
    {id:'plan', customerId:'a', customerName:'Novák', title:'Termín', jobType:'installation', status:'planned', dueDate:'2026-12-01'},
    {id:'live', customerId:'b', customerName:'Novák', title:'Práce', jobType:'installation', status:'in_progress', dueDate:'2026-12-02'},
    {id:'done', customerId:'a', customerName:'Novák', title:'Hotovo', jobType:'installation', status:'done', dueDate:'2026-12-01', protocolStatus:'missing'},
    {id:'service', customerId:'a', customerName:'Novák', title:'Servis', jobType:'service', status:'planned', dueDate:''}
  ];
  const open = filterJobs(rows, {kind:'installation', phase:'open'});
  assert.deepEqual(open.jobs.map(job=>job.id), ['wait','plan','live']);
  assert.equal(open.customers, 2);
  const waiting = filterJobs(rows, {kind:'installation', phase:'waiting'});
  assert.deepEqual(waiting.jobs.map(job=>job.id), ['wait']);
  assert.equal(groupByCustomer([{customerId:'a', customerName:'Novák', id:'1'},{customerId:'b', customerName:'Novák', id:'2'}]).length, 2);
  const reply = formatSelectionReply(open.jobs.slice(0, 1), {total:5, customers:4, counts:{waiting:2, scheduled:2, active:1}, phase:'open', kindLabel:'Realizace'});
  assert.match(reply, /Našel jsem 5 neukončených zakázek druhu Realizace u 4 zákazníků: 2 čekají na naplánování, 2 jsou naplánované a 1 probíhá/);
  assert.match(reply, /Ukazuji 1 z 5/);
  assert.match(selectionSummary({phase:'open', kindLabel:'Realizace', total:0, customers:0, counts:{}}), /nenahradil hotovými/);
  const offline = answerOffline(parseWorkQuestion('Kteří zákazníci čekají na realizaci?') && selected('Kteří zákazníci čekají na realizaci?'), {jobs:rows});
  assert.match(offline.reply, /uložených dat/);
  assert.match(offline.reply, /Čeká/);
  assert.doesNotMatch(offline.reply, /Hotovo/);
  assert.doesNotMatch(offline.reply, /Servis/);
});

