const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(new URL(r.url()).pathname+new URL(r.url()).search)});
 let zonesStarted;const zoneGate=new Promise(resolve=>zonesStarted=resolve);let timer;
 await page.route('**/api/gardens',async r=>{await Promise.race([zoneGate,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Garden request blocked independent zone load')),5000)})]);clearTimeout(timer);await r.continue()});
 await page.route('**/api/zones',async r=>{zonesStarted();await r.continue()});
 await page.goto('http://127.0.0.1:5187/__qa/login?user=owner');await page.locator('#overview').waitFor();await page.waitForFunction(()=>document.querySelector('.top-status')?.textContent.includes('Synchronizováno'));await page.waitForTimeout(200);
 assert.equal(calls.filter(p=>p.startsWith('/api/jobs?state=all')).length,1,'one today query');assert.equal(calls.filter(p=>p.startsWith('/api/jobs?state=active')).length,1,'one upcoming query');assert.equal(calls.filter(p=>p==='/api/notifications').length,1,'no overview remount refetch');
 const asset=await page.request.get('http://127.0.0.1:5187/app.js?v=performance-v1'),etag=asset.headers().etag;assert.equal(asset.status(),200);assert.ok(etag);assert.match(asset.headers()['cache-control'],/must-revalidate/);
 const same=await page.request.get('http://127.0.0.1:5187/app.js?v=performance-v1',{headers:{'if-none-match':etag}});assert.equal(same.status(),304);assert.equal((await same.body()).length,0);
 assert.equal((await page.request.get('http://127.0.0.1:5187/app.js?v=performance-v1',{headers:{'if-none-match':'"previous-build"'}})).status(),200);
 const privateData=await page.request.get('http://127.0.0.1:5187/api/me',{headers:{'if-none-match':etag}});assert.equal(privateData.status(),200);assert.equal(privateData.headers()['cache-control'],'no-store');assert.equal(privateData.headers().etag,undefined);
 calls.length=0;const completed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/gardens');await page.evaluate(()=>{for(let i=0;i<3;i++)dispatchEvent(new Event('online'))});await completed;await page.waitForFunction(()=>document.querySelector('.top-status')?.textContent.includes('Synchronizováno'));await page.waitForTimeout(150);
 assert.equal(calls.filter(p=>p==='/api/me').length,1,'one shared synchronization');assert.equal(calls.filter(p=>p==='/api/gardens').length,1,'one metadata refresh');assert.deepEqual(errors,[]);await context.close();
 console.log('PASS: parallel startup, no duplicate overview fetch, coalesced online events, conditional 304/changed-200 static assets, API stays no-store. Isolated data only.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
