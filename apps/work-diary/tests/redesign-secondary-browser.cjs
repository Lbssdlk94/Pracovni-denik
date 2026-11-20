const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {nav}=require('./browser-nav.cjs');
const base='http://127.0.0.1:5198',root='/workspace/reports/complete-redesign/secondary';
(async()=>{await fs.mkdir(root,{recursive:true});const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});let captures=0;
try{for(const role of ['owner','admin','worker','reader'])for(const width of [390,1440])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:960},colorScheme:theme,locale:'cs-CZ',reducedMotion:'reduce'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/__qa/login?user='+role);await page.locator('.nav').waitFor();if(await page.locator('[data-device-later]').count())await page.locator('[data-device-later]').click();
 for(const route of ['home','materials','defects','subscriptions','vehicles','settings',...(['owner','admin'].includes(role)?['team']:[])]){
  if(!await page.locator('[data-page="'+route+'"]').count())continue;
  await nav(page,route);await page.waitForLoadState('networkidle');assert.equal(await page.locator('.pd-secondary').count(),1,route+' scoped');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' overflow '+width);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
  await page.screenshot({path:`${root}/${role}-${width}-${theme}-${route}.png`,fullPage:true,animations:'disabled'});captures++;
 }
 await nav(page,'settings');assert.equal(await page.locator('[data-protocol-templates]').count(),['owner','admin'].includes(role)?1:0,'manager-only template settings');
 if(role==='owner'&&width===1440&&theme==='light'){
  await page.locator('[data-protocol-templates]').click();await page.locator('[data-template-index]').first().waitFor();await page.locator('[data-template-index]').first().click();await page.locator('#protocol-template-form').waitFor();
  const form=page.locator('#protocol-template-form');await form.locator('[name=name]').fill('Servis · ověřená webová šablona');await form.locator('[data-activity-add]').click();await form.locator('.protocol-template-activity input[type=text]').last().fill('Kontrola v testu');await form.locator('button[type=submit]').click();await page.locator('[data-template-index]').first().waitFor();
  assert.ok(await page.locator('.protocol-template-list').innerText().then(t=>t.includes('Servis · ověřená webová šablona')));
  const configuration=await page.evaluate(async()=>{const r=await fetch('/api/protocol-templates');return r.json()});assert.ok(configuration.templates.some(t=>t.name==='Servis · ověřená webová šablona'&&t.activities.some(a=>a.title==='Kontrola v testu')),'actual shared API write');
  await page.locator('#modal [data-close]').click();
  const rail=page.locator('[data-secondary-rail]');await rail.click();assert.equal(await rail.getAttribute('aria-expanded'),'false');await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));await rail.click();
 }
 const appearance=page.locator('#interface-appearance');await appearance.selectOption(theme==='dark'?'light':'dark');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme==='dark'?'light':'dark');await appearance.selectOption('system');
 assert.deepEqual(errors,[],`${role} ${width} ${theme}`);await context.close();
}console.log(`PASS ${captures} secondary mobile/desktop role/theme captures; real template write; permission visibility, appearance and keyboard/rail`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
