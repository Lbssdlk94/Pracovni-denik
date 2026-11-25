import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Safari keyboard inset and iPhone assistant status are source contracts, not a device run', ()=>{
  const css = readFileSync('web/assistant.css','utf8');
  const ui = readFileSync('web/assistant-ui.js','utf8');
  const swift = readFileSync('../iphone/NativeAPI/APIAssistantWorkspace.swift','utf8');
  const project = readFileSync('../iphone/project.yml','utf8');
  assert.match(css, /#assistant-page \.assistant-composer textarea\{font-size:16px\}/);
  assert.match(css, /--vv-height/);
  assert.match(css, /--kb-pad/);
  assert.match(ui, /visualViewport/);
  assert.match(ui, /window\.innerHeight - view\.height - view\.offsetTop > 80/);
  assert.match(ui, /image\/jpeg,image\/png,image\/heic,image\/heif/);
  assert.doesNotMatch(ui, /capture="environment"/);
  assert.match(swift, /Bez vybrané zakázky/);
  assert.match(swift, /Základní režim/);
  assert.match(swift, /store\.outbox\.count/);
  assert.match(swift, /pd\.assistant\.pending\.v1/);
  assert.match(swift, /PhotosPicker/);
  const thread = swift.slice(swift.indexOf('struct Thread'), swift.indexOf('private struct Saved'));
  assert.doesNotMatch(thread, /pending/);
  assert.match(project, /CURRENT_PROJECT_VERSION: 20/);
  assert.match(project, /MARKETING_VERSION: 0\.8\.11/);
  assert.doesNotMatch(swift, /\]=\./);
});

test('A stuck concept can be dropped on the phone without a live confirm', ()=>{
  const ui = readFileSync('web/assistant-ui.js','utf8');
  const css = readFileSync('web/assistant.css','utf8');
  assert.match(ui, /data-discard-concept/);
  assert.match(ui, /conceptDismissed/);
  assert.match(ui, /Koncept je zahozený\. Nic se neuložilo\./);
  assert.match(ui, /Nic se nezapíše, dokud neklepnete na Uložit/);
  assert.match(ui, /v katalogu nejsou, nezakládám/);
  assert.match(ui, /Návrh je v rozhovoru/);
  assert.doesNotMatch(ui, /Koncept je otevřený v panelu Výsledek/);
  assert.match(ui, /function discardConcept/);
  assert.doesNotMatch(ui, /data-cancel="\$\{esc\(confirm\?\.id\|\|''\)\}" \$\{confirm\?'':'disabled'\}>Zrušit/);
  assert.match(css, /\.assistant-concept-scroll/);
  assert.match(css, /#assistant-page \.assistant-concept-actions button\{flex:1/);
});
