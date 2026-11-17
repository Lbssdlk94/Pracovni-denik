// Geometry regressions only: actual application styles, no connection to production.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json')('playwright'));}
const styles=[...readFileSync('web/index.html','utf8').matchAll(/rel="stylesheet" href="\.\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>readFileSync('web/'+m[1],'utf8')).join('\n');
const actions=[['id="job-open-service"','Servisní protokol'],['data-job-navigate','Navigovat'],['data-job-depart','Jsem na cestě'],['data-job-status','Změnit stav'],['id="job-jump-photos"','Fotodokumentace']];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
let checked=0;
try{
 const page=await browser.newPage();
 for(const width of [360,390,430,1280,1440]){
  await page.setViewportSize({width,height:1000});
  await page.setContent('<style>'+styles+'</style><main style="padding:20px;max-width:600px;margin:auto"><h1>Realizace Pan Petřík</h1><section id="test"></section></main>');
  // Both server-omitted and dynamically hidden buttons must pack in logical order.
  for(const mode of ['omitted','hidden'])for(let mask=0;mask<32;mask++){
   const buttons=actions.map(([attrs,label],i)=>mask&(1<<i)?`<button class="btn" ${attrs}>${label}</button>`:mode==='hidden'?`<button class="btn" ${attrs} hidden>${label}</button>`:'').join('');
   await page.locator('#test').evaluate((el,html)=>{el.innerHTML='<div class="job-detail-actions">'+html+'</div>';},buttons);
   const result=await page.locator('.job-detail-actions').evaluate(group=>{
    const r=group.getBoundingClientRect(),visible=[...group.children].filter(el=>getComputedStyle(el).display!=='none');
    return {display:getComputedStyle(group).display,left:r.left,width:r.width,buttons:visible.map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,x:r.x,y:r.y,w:r.width,h:r.height};}),overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert.equal(result.buttons.length,actions.filter((_,i)=>mask&(1<<i)).length);
   assert.equal(result.overflow,false);
   if(!mask){assert.equal(result.display,'none');continue;}
   let previous=null;
   for(const button of result.buttons){
    assert.ok(button.w>=44&&button.h>=44,JSON.stringify({width,mode,mask,button}));
    if(!previous||button.y>previous.y+2)assert.ok(Math.abs(button.x-result.left)<2,'Blank slot before '+JSON.stringify({width,mode,mask,button}));
    else assert.ok(button.x>=previous.x+previous.w-1,'Overlap or visual reordering');
    previous=button;
   }
   checked++;
  }
  // Shared flex action groups on other pages collapse completely when all actions are hidden.
  for(const name of ['actions','modal-actions','editor-actions','subscription-actions']){
   await page.locator('#test').evaluate((el,name)=>{el.innerHTML=`<div class="${name}" id="group"><button hidden class="btn">Správa</button><button class="btn">Podrobnosti</button><button hidden class="btn">Smazat</button></div>`;},name);
   assert.equal(await page.locator('#group button:visible').count(),1);
   assert.equal(await page.locator('#group button:visible').getAttribute('hidden'),null);
   await page.locator('#group button').evaluateAll(nodes=>nodes.forEach(el=>el.hidden=true));
   assert.equal(await page.locator('#group').isVisible(),false);
  }
  // Navigation overrides must never force a permission-hidden button back on screen.
  await page.locator('#test').evaluate(el=>{el.innerHTML='<div class="shell"><aside class="sidebar"><nav class="nav"><button>Zakázky</button><button hidden class="mobile-more-toggle">Více</button><button>Zákazníci</button></nav></aside></div>';});
  assert.equal(await page.locator('.mobile-more-toggle').isVisible(),false);
  // Material readers have no actions column reserved for management buttons.
  await page.locator('#test').evaluate(el=>{el.innerHTML='<div class="material-item-row"><div>Materiál</div><div class="material-item-price">100 Kč</div><div class="material-item-actions" hidden><button class="btn">Upravit</button></div></div>';});
  assert.equal(await page.locator('.material-item-row').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
  // Card parity counts available buttons rather than hidden DOM siblings.
  for(let mask=1;mask<16;mask++){
   await page.locator('#test').evaluate((el,mask)=>{el.innerHTML='<div id="jobs"><article class="job-card-compact"><div class="actions">'+['Cesta','Navigace','Stav','Podrobnosti'].map((x,i)=>`<button class="btn" ${mask&(1<<i)?'':'hidden'}>${x}</button>`).join('')+'</div></article></div>';},mask);
   const data=await page.locator('#jobs .actions').evaluate(group=>{const r=group.getBoundingClientRect();return {columns:getComputedStyle(group).gridTemplateColumns.split(' ').length,left:r.left,items:[...group.children].filter(e=>!e.hidden).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width};})};});
   assert.equal(data.columns,width>760&&data.items.length===4?4:2,'Hidden card actions must not reserve desktop columns');
   if(width<=760){let prev;for(const item of data.items){if(!prev||item.y>prev.y+2)assert.ok(Math.abs(item.x-data.left)<2,'Card starts with a blank slot');prev=item;}}
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#test').evaluate((el,actions)=>{el.innerHTML='<p>Naplánováno · Realizace</p><p>Dřevníky 39 · středa 18. listopadu</p><div class="job-detail-actions">'+actions.filter((_,i)=>i!==2).map(([attrs,label])=>`<button class="btn" ${attrs}>${label}</button>`).join('')+'</div>';},actions);
 mkdirSync('/workspace/artifacts/compact-actions-2026-11-17',{recursive:true});await page.screenshot({path:'/workspace/artifacts/compact-actions-2026-11-17/mobile-no-travel.png'});
 console.log(`PASS ${checked} nonempty detail combinations across omitted/hidden actions and 360/390/430/1280/1440 px; empty shared action groups; card hidden-button parity; logical visual order, no gaps/overlap/overflow and 44 px targets. Production untouched.`);
}finally{await browser.close();}
