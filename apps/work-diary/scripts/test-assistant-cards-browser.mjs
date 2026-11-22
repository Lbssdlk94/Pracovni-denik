// Clicks real assistant cards in Chromium. No production site is contacted.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire('/opt/app-template/node_modules/playwright/package.json');
const {chromium} = require('playwright');
const root = path.resolve('web');
const cards = [
  {type:'customer', id:`cust-'&"<>`, title:`Jan "Novák" <firma> & syn`, subtitle:'Plzeň · Záloha', countLabel:'1 aktivní zakázka', openLabel:'Otevřít zákazníka'},
  {type:'job', id:'job-quote', title:`O'Brien — kontrola`, subtitle:'Plzeň', status:'in_progress', statusLabel:'Probíhá', openLabel:'Otevřít zakázku'},
  {type:'material', id:'mat-quote', title:`Žluťoučký <filtr> "20mm"`, subtitle:'Filtry · ks', openLabel:'Otevřít materiál'}
];
const harness = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="./design-tokens.css"><link rel="stylesheet" href="./assistant.css?v=assistant-v3"><div id="assistant-page"></div><script type="module">
import {mountWorkAssistant} from './assistant-ui.js?v=assistant-v5';
const cards = ${JSON.stringify(cards)};
const opened = [];
window.__opened = opened;
window.__requests = [];
localStorage.setItem('pd-assistant-threads-v1:co:u1', JSON.stringify([{id:'t1', title:'Najdi zákazníka', updatedAt:Date.now(), draft:'', context:{customerId:cards[0].id, customerName:cards[0].title}, items:[{role:'user', text:'Najdi zákazníka Nováka', at:Date.now()},{role:'assistant', text:'Našel jsem 1 zákazníka.', at:Date.now(), cards, suggestions:['Zobraz jeho zakázky']}]}]));
const db = {async request(url){
  window.__requests.push(url);
  if(url.startsWith('/api/customers/')) return {customer:{id:cards[0].id, name:cards[0].title, email:'jan@example.cz', phones:[{number:'+420602318746'}], addresses:[{address:'Klatovská 128', city:'Plzeň'}]}};
  if(url.startsWith('/api/jobs?')) return {jobs:[{id:'job-side', title:cards[1].title, customerId:cards[0].id, customerName:cards[0].title, dueDate:'2026-11-22', status:'in_progress', city:'Plzeň'}]};
  if(url.startsWith('/api/jobs/')) return {job:{id:cards[1].id, title:cards[1].title, customerName:cards[0].title, dueDate:'2026-11-22', status:'in_progress', assignedName:'Petr', city:'Plzeň'}};
  if(url==='/api/materials') return {categories:[{id:'cat', name:'Filtry'}], items:[{id:cards[2].id, categoryId:'cat', name:cards[2].title, sku:'F-20', unit:'ks', priceMinor:12500, currency:'CZK'}]};
  throw Error('neočekávaný požadavek '+url);
}};
mountWorkAssistant({db, getSession:()=>({user:{id:'u1', name:'Luboš', role:'owner'}, installation:{id:'co'}}), openCustomer:id=>opened.push(['customer', id]), openJob:id=>opened.push(['job', id]), openMaterial:id=>opened.push(['material', id])});
window.__ready = true;
</script>`;
const types = {'.js':'text/javascript', '.css':'text/css', '.html':'text/html; charset=utf-8', '.svg':'image/svg+xml', '.woff2':'font/woff2'};
const server = http.createServer(async (request, response)=>{
  const url = new URL(request.url, 'http://127.0.0.1');
  if(url.pathname==='/harness.html'){response.writeHead(200, {'content-type':'text/html; charset=utf-8'}); response.end(harness); return;}
  if(url.pathname==='/bubble.html'){response.writeHead(200, {'content-type':'text/html; charset=utf-8'}); response.end(harness.replace('<div id="assistant-page"></div>', '<nav><button data-page="jobs">Zakázky</button></nav>')); return;}
  const file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if(!file.startsWith(root)){response.writeHead(403); response.end(); return;}
  try{const body = await readFile(file); response.writeHead(200, {'content-type':types[path.extname(file)]||'application/octet-stream'}); response.end(body);}
  catch{response.writeHead(404); response.end();}
});
await new Promise(resolve=>server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/harness.html`;
const browser = await chromium.launch({headless:true, args:['--no-sandbox']});
const errors = [];
try{
  async function openPage(width){
    const page = await browser.newPage({viewport:{width, height:900}});
    page.on('pageerror', error=>errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(()=>window.__ready);
    await page.waitForSelector('text=Našel jsem 1 zákazníka.');
    return page;
  }
  async function clickType(page, type, id){
    const buttons = page.locator(`[data-open-type="${type}"]`);
    const count = await buttons.count();
    for(let index=0; index<count; index++){
      const button = buttons.nth(index);
      if(await button.getAttribute('data-open-id')===id){await button.click(); return;}
    }
    throw Error('Karta nenalezena: '+type);
  }
  const desktop = await openPage(1280);
  assert.equal(await desktop.locator('[data-open-card]').count(), 0);
  for(const card of cards){
    await clickType(desktop, card.type, card.id);
    await desktop.waitForSelector('.assistant-detail:not([hidden])');
    const panel = await desktop.locator('.assistant-detail').innerText();
    assert.match(panel, new RegExp(card.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(await desktop.locator('.assistant-log').innerText(), /Našel jsem 1 zákazníka/);
    assert.deepEqual(await desktop.evaluate(()=>window.__opened), []);
  }
  await desktop.locator('[data-open-type="customer"]').click();
  await desktop.locator('.assistant-detail').getByText('+420602318746').waitFor();
  await desktop.locator('.assistant-detail [data-open-id="job-side"]').click();
  await desktop.locator('.assistant-detail').getByText("O'Brien").waitFor();
  await desktop.locator('.assistant-detail [data-full-profile]').click();
  assert.deepEqual(await desktop.evaluate(()=>window.__opened), [['job','job-side']]);
  await clickType(desktop, 'material', 'mat-quote');
  await desktop.locator('.assistant-detail').getByText('F-20').waitFor();
  await desktop.locator('.assistant-detail [data-full-profile]').click();
  const opened = await desktop.evaluate(()=>window.__opened);
  assert.deepEqual(opened, [['job','job-side'], ['material','mat-quote']]);
  await desktop.locator(`[data-open-type="customer"]`).click();
  await desktop.locator('[data-full-profile]').click();
  assert.deepEqual(await desktop.evaluate(()=>window.__opened.at(-1)), ['customer', cards[0].id]);
  assert.match(await desktop.locator('.assistant-log').innerText(), /Našel jsem 1 zákazníka/);

  const mobile = await openPage(390);
  for(const card of cards){
    await mobile.locator(`article.assistant-card [data-open-type="${card.type}"]`).click();
  }
  assert.deepEqual(await mobile.evaluate(()=>window.__opened), cards.map(card=>[card.type, card.id]));
  assert.equal(await mobile.locator('.assistant-detail').isVisible(), false);
  assert.match(await mobile.locator('.assistant-log').innerText(), /Našel jsem 1 zákazníka/);
  assert.deepEqual(errors, []);
  const bubble = await browser.newPage({viewport:{width:390, height:844}});
  bubble.on('pageerror', error=>errors.push(error.message));
  await bubble.goto(base.replace('harness.html','bubble.html'));
  await bubble.waitForFunction(()=>window.__ready);
  assert.equal(await bubble.locator('[data-page="assistant"]').count(), 0);
  assert.equal(await bubble.locator('#assistant-page').isVisible(), false);
  await bubble.locator('.assistant-launch').click();
  await bubble.locator('.assistant-log').getByText('Našel jsem 1 zákazníka.').waitFor();
  await bubble.locator('[data-close-assistant]').click();
  assert.equal(await bubble.locator('#assistant-page').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS desktop panel and mobile existing detail for customer, job and material, including quotes, apostrophe, diacritics and HTML characters. The assistant opens from a bubble and is not in the bottom row. Production untouched.');
}finally{
  await browser.close();
  server.close();
}
