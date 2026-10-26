const {chromium}=require('playwright'),assert=require('node:assert/strict'),{nav}=require('./browser-nav.cjs');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const base='http://127.0.0.1:5187',owner=await browser.newPage({viewport:{width:1440,height:960}});
 await owner.goto(base+'/__qa/login?user=owner');await owner.locator('#overview').waitFor();
 const send=(path,method,value)=>owner.evaluate(async({path,method,value})=>{const r=await fetch(path,{method,headers:{'content-type':'application/json','x-zavlahy-request':'1'},body:JSON.stringify(value)});if(!r.ok)throw Error(await r.text());return r.json();},{path,method,value});
 for(const role of ['admin','worker','reader'])await send('/api/invitations','POST',{email:role+'@example.com',role});
 // A separate QA-only member uses an existing fixture login; the real role is asserted below.
 for(const role of ['owner','admin','worker','reader','administrator']){
  if(role==='administrator')await send('/api/members/admin-id','PATCH',{role:'administrator'});
  for(const width of [390,430,1440]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:width<761,hasTouch:width<761}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/__qa/login?user='+(role==='administrator'?'admin':role));await page.locator('#overview').waitFor();
   if(await page.locator('[data-device-later]').count())await page.locator('[data-device-later]').click();
   assert.equal(await page.evaluate(async()=> (await(await fetch('/api/me')).json()).user.role),role);
   assert.equal(await page.locator('.nav [data-page=overview]').getAttribute('aria-current'),'page');
   if(['worker','reader'].includes(role))assert.equal(await page.locator('[data-page=team],[data-page=materials]').count(),0);
   await page.locator('.overview-attendance [data-page=attendance]').click();await page.locator('#attendance').waitFor();
   await nav(page,'jobs');await page.locator('#jobs-refresh:not([disabled])').waitFor();
   await page.reload();await page.locator('#overview').waitFor();
   await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   await context.setOffline(true);await page.reload();await page.locator('#overview').waitFor();assert.equal(await page.locator('.nav [data-page=overview]').getAttribute('aria-current'),'page');assert.equal(await page.locator('[data-overview-job]').count(),0);
   await context.setOffline(false);await page.reload();await page.locator('#overview').waitFor();assert.deepEqual(errors,[]);
   await context.close();
  }
 }
 await owner.close();console.log('PASS: all five roles start on overview on first entry, reload and offline (390/430/1440); attendance and jobs navigation, server-reported roles and worker/reader restrictions. Isolated data only.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
