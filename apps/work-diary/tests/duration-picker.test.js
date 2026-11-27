import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {extname, join} from 'node:path';
import {createRequire} from 'node:module';
import {durationChoiceResult, durationFromParts, durationLabel, plannedEnd, termSpan} from '../web/planning-model.js';
import {planningFields, readPlanningFields} from '../web/planning-fields.js';
import {termEditorMarkup, scheduleMarkup} from '../web/job-terms-ui.js';

const esc = value => String(value??'').replaceAll('&','&').replaceAll('<','<').replaceAll('>','>').replaceAll('"','"');

test('Duration stays in minutes and speaks in hours', ()=>{
  assert.equal(durationFromParts('', ''), null);
  assert.equal(durationFromParts('1', ''), 60);
  assert.equal(durationFromParts('', '30'), 30);
  assert.equal(durationFromParts('0', '0'), null);
  assert.equal(durationFromParts('1', '30'), 90);
  assert.equal(durationFromParts('24', '0'), 1440);
  assert.equal(durationFromParts('24', '1'), null);
  assert.equal(durationFromParts('1.5', '0'), null);
  assert.equal(durationLabel(30), '30 minut');
  assert.equal(durationLabel(60), '1 hodina');
  assert.equal(durationLabel(120), '2 hodiny');
  assert.equal(durationLabel(300), '5 hodin');
  assert.equal(durationLabel(90), '1 hodina 30 minut');
  assert.equal(durationLabel(11*60), '11 hodin');
  assert.deepEqual(plannedEnd('08:00', 90), {end:'09:30', overflow:false});
  assert.deepEqual(plannedEnd('20:00', 12*60), {end:'', overflow:true});
  assert.equal(plannedEnd('08:00', 16*60).end, '24:00');
  assert.equal(durationChoiceResult({start:'08:00', minutes:16*60, term:true}).blocked, true);
  assert.equal(durationChoiceResult({start:'08:00', minutes:16*60, term:true}).end, '');
  assert.equal(durationChoiceResult({start:'08:00', minutes:90}).end, '09:30');
  assert.equal(durationChoiceResult({start:'7:00', minutes:480, term:true}).end, '15:00');
  assert.equal(termSpan('07:00', '15:00'), 480);
  assert.equal(termSpan('08:00', '10:30'), 150);
  assert.equal(termSpan('20:00', '15:00'), null);
});

test('Job and multi-day forms offer hour choices and keep the minute field hidden', ()=>{
  const single = planningFields({plannedStart:'08:00', estimatedMinutes:90}, esc, 'job');
  assert.match(single, /Vlastní délka/);
  assert.match(single, /1 hodina/);
  assert.match(single, /12 hodin/);
  assert.match(single, /name="estimatedMinutes"/);
  assert.match(single, /value="90"/);
  assert.match(single, /Konec: 09:30/);
  assert.doesNotMatch(single, /Odhad délky práce \(minuty\)/);
  assert.match(single, /aria-pressed="true"/);
  const preset = planningFields({plannedStart:'08:00', estimatedMinutes:60}, esc, 'side');
  assert.match(preset, /id="side-estimated-minutes"/);
  assert.match(preset, /data-duration-choice="60" aria-pressed="true"/);
  const empty = planningFields({plannedStart:'', estimatedMinutes:null}, esc, 'planner');
  assert.match(empty, /id="planner-estimated-minutes" value=""/);
  const people = [{id:'owner-id', name:'Luboš'}];
  const terms = termEditorMarkup({dueDate:'2026-11-24', terms:[
    {date:'2026-11-24', start:'07:00', end:'15:00', people:[], status:'planned', note:''},
    {date:'2026-11-25', start:'08:00', end:'10:30', people:[], status:'planned', note:''}
  ]}, people, esc);
  assert.match(terms, /data-duration-total/);
  assert.match(terms, /data-term-end[^>]*value="15:00"/);
  assert.match(terms, /data-term-end[^>]*value="10:30"/);
  assert.doesNotMatch(terms, />Do</);
  const schedule = scheduleMarkup({terms:[
    {date:'2026-11-24', start:'07:00', end:'15:00', people:[], status:'planned', workedMs:0},
    {date:'2026-11-25', start:'08:00', end:'10:30', people:[], status:'planned', workedMs:3_600_000}
  ]}, people, esc);
  assert.match(schedule, /Celková plánovaná délka: 10 hodin 30 minut/);
  assert.match(schedule, /Odpracováno:/);
  const assistant = readFileSync('web/assistant-ui.js', 'utf8');
  assert.match(assistant, /durationPickerMarkup/);
  assert.match(assistant, /data-duration-total/);
  assert.doesNotMatch(assistant, /aria-label="Do"/);
});

test('Picker clicks store minutes and rewrite each day end without touching worked time', async ()=>{
  const root = 'web';
  const types = {'.js':'text/javascript', '.css':'text/css', '.html':'text/html'};
  const harness = `<!doctype html><meta charset="utf-8"><form id="job"></form><div id="terms"></div>
    <script type="module">
      import {planningFields, readPlanningFields} from '/planning-fields.js?v=workspace-roles-v1';
      import {termEditorMarkup, bindTermEditor, readTermPayload} from '/job-terms-ui.js?v=job-terms-v1';
      const esc = value => String(value??'');
      const people = [{id:'owner-id', name:'Luboš'}];
      document.querySelector('#job').innerHTML = planningFields({plannedStart:'08:00', estimatedMinutes:90}, esc, 'job');
      document.querySelector('#terms').innerHTML = '<form id="multi">'+termEditorMarkup({dueDate:'2026-11-24', terms:[
        {date:'2026-11-24', start:'07:00', end:'15:00', people:['owner-id'], status:'planned', note:''},
        {date:'2026-11-25', start:'08:00', end:'10:30', people:['owner-id'], status:'planned', note:''}
      ]}, people, esc)+'</form>';
      bindTermEditor(document.querySelector('#multi'), people, esc);
      window.readJob = () => readPlanningFields(document.querySelector('#job'));
      window.readTerms = () => readTermPayload(document.querySelector('#multi'));
      window.ready = true;
    </script>`;
  const server = createServer(async (request, response)=>{
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if(path==='/harness.html'){response.setHeader('content-type','text/html;charset=utf-8');response.end(harness);return;}
    try{
      const body = await readFile(join(root, path));
      response.setHeader('content-type', types[extname(path)] || 'text/plain');
      response.end(body);
    }catch{response.statusCode=404;response.end('missing');}
  });
  await new Promise(resolve=>server.listen(0, '127.0.0.1', resolve));
  const {chromium} = createRequire('/workspace/package.json')('playwright');
  let browser;
  try{
    browser = await chromium.launch({args:['--no-sandbox']});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error=>errors.push(String(error)));
    await page.goto('http://127.0.0.1:'+server.address().port+'/harness.html');
    await page.waitForFunction(()=>window.ready);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(()=>window.readJob()), {plannedStart:'08:00', estimatedMinutes:90, arrivalWindowStart:'', arrivalWindowEnd:''});
    assert.equal(await page.locator('#job [data-duration-status]').innerText(), 'Konec: 09:30');
    await page.locator('#job [data-duration-choice="120"]').click();
    assert.equal(await page.locator('#job-estimated-minutes').inputValue(), '120');
    assert.equal(await page.locator('#job [data-duration-status]').innerText(), 'Konec: 10:00');
    await page.locator('#job [name=plannedStart]').fill('09:15');
    assert.equal(await page.locator('#job [data-duration-status]').innerText(), 'Konec: 11:15');
    assert.equal((await page.evaluate(()=>window.readJob())).estimatedMinutes, 120);
    await page.locator('#job [data-duration-choice="custom"]').click();
    await page.locator('#job [data-duration-hours]').fill('1');
    await page.locator('#job [data-duration-minutes]').fill('30');
    assert.equal((await page.evaluate(()=>window.readJob())).estimatedMinutes, 90);
    assert.equal(await page.locator('#job [data-duration-status]').innerText(), 'Konec: 10:45');
    await page.locator('#job [name=plannedStart]').fill('20:00');
    await page.locator('#job [data-duration-choice="720"]').click();
    assert.match(await page.locator('#job [data-duration-status]').innerText(), /půlnoc/i);
    assert.equal((await page.evaluate(()=>window.readJob())).estimatedMinutes, 90);
    assert.equal(await page.locator('[data-duration-total]').innerText(), 'Celková plánovaná délka: 10 hodin 30 minut');
    const second = page.locator('#multi [data-term-row]').nth(1);
    await second.locator('[data-duration-choice="120"]').click();
    assert.equal(await second.locator('[data-term-end]').inputValue(), '10:00');
    assert.equal(await page.locator('[data-duration-total]').innerText(), 'Celková plánovaná délka: 10 hodin');
    const terms = await page.evaluate(()=>window.readTerms());
    assert.deepEqual(terms.map(term=>[term.start, term.end]), [['07:00','15:00'],['08:00','10:00']]);
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
});

test('readPlanningFields still returns integer minutes', ()=>{
  const form = {elements:{plannedStart:{value:'08:00'}, estimatedMinutes:{value:'90'}, arrivalWindowStart:{value:''}, arrivalWindowEnd:{value:''}}};
  assert.equal(readPlanningFields(form).estimatedMinutes, 90);
  form.elements.estimatedMinutes.value = '';
  assert.equal(readPlanningFields(form).estimatedMinutes, null);
});
