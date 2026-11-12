// Real Worker/D1/R2 and browser storage, with faults injected only on loopback.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Miniflare} from 'miniflare';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json')('playwright'));}
const baked=JSON.parse(readFileSync('dist/server/index.js','utf8').match(/const EXPECTED_INSTALLATION_ID=(null|"[^"]+");/)?.[1]||'null');
const identity={'oai-authenticated-user-id':'diagnostic-owner','oai-authenticated-user-email':'owner@diagnostic.test','x-workspace-client-version':'shared-directory-v1','x-zavlahy-request':'1'};
let mf,server,browser,releasePhoto,photoRequested=false,jobsFailures=0,jobsAttempts=0,blockWrites=true,blockMe=false,writeAttempts=0;
const photoGate=new Promise(resolve=>releasePhoto=resolve);
try{
 mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'communication-isolated'},r2Buckets:['BUCKET'],bindings:{TEAM_OWNER_EMAIL:identity['oai-authenticated-user-email'],...(baked?{INSTALLATION_ID:baked}:{})}});
 const db=await mf.getD1Database('DB');for(const entry of JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries)for(const sql of readFileSync('drizzle/'+entry.tag+'.sql','utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 if(baked)await db.prepare("UPDATE installation_state SET instance_id=? WHERE singleton='primary'").bind(baked).run();
 async function call(path,method='GET',body){
  const req=new Request('http://diagnostic.test'+path,{method,headers:{...identity,...(body instanceof FormData?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
  const r=await mf.dispatchFetch(req.url,{method,headers:req.headers,...(body===undefined?{}:{body:await req.arrayBuffer()})});assert.equal(r.status,200,await r.clone().text());return r.json();
 }
 await call('/api/me');
 await call('/api/customers/test-contact','PUT',{version:0,name:'Diagnostický zákazník',phones:[],addresses:[{id:'test-address',address:'Testovací 1',city:'Písek'}]});
 const gardens=(await call('/api/gardens')).gardens,gardenId=gardens[0].id;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague'}).format(new Date());
 await call('/api/jobs/test-job','PUT',{version:0,title:'Diagnostická návštěva',customerId:'test-contact',gardenId,assignedTo:identity['oai-authenticated-user-id'],status:'planned',dueDate:day,plannedStart:'09:00',estimatedMinutes:60});
 const form=new FormData();form.set('record',JSON.stringify({name:'Zkušební šachta',gardenId,location:'',notes:'',markers:[],version:0}));form.set('image',new Blob([new Uint8Array([255,216,255,219,0,1,2,3])],{type:'image/jpeg'}),'photo.jpg');await call('/api/shafts/test-shaft','PUT',form);
 server=createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost'),parts=[];for await(const chunk of req)parts.push(chunk);const body=Buffer.concat(parts);
  if(u.pathname==='/api/shafts/test-shaft/photo'){photoRequested=true;await photoGate;}
  if(u.pathname==='/api/jobs'){jobsAttempts++;if(jobsFailures-->0){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'Isolated injected 503'}));return;}}
  if(u.pathname==='/api/me'&&blockMe){res.writeHead(504,{'content-type':'application/json'});res.end(JSON.stringify({error:'Isolated injected 504'}));return;}
  if(u.pathname==='/api/jobs/test-job/service'&&req.method==='PUT'){writeAttempts++;if(blockWrites){res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({error:'Isolated injected 502'}));return;}}
  const response=await mf.dispatchFetch('http://127.0.0.1:'+server.address().port+req.url,{method:req.method,headers:{...req.headers,...identity},...(['GET','HEAD'].includes(req.method)?{}:{body})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end(error.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.shell').waitFor();
 await page.waitForFunction(()=>!!document.querySelector('.shell'));for(let i=0;i<20&&!photoRequested;i++)await new Promise(r=>setTimeout(r,25));assert.equal(photoRequested,true);
 jobsFailures=1;const before=jobsAttempts;await page.locator('[data-page="jobs"]:visible').first().click();await page.locator('[data-job="test-job"]').first().waitFor();assert.ok(jobsAttempts-before>=2,'503 read was not retried');
 await page.locator('[data-page="customers"]:visible').first().click();await page.locator('[data-customer-open="test-contact"]').waitFor();assert.equal(photoRequested,true,'jobs and customers load before stalled photograph');
 // Upload fails after the report/photo are durably queued. Keep the exact IDs.
 const pending=await page.evaluate(async()=>{const db=await import('/cloud.js?v=job-three-month-v1');await db.serviceWork('test-job',true);const file=new File([new Uint8Array([255,216,255,219,0,1,2,3])],'original.jpg',{type:'image/jpeg'});const saved=await db.saveServiceWork('test-job',{version:1,report:{date:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague'}).format(new Date()),work:'Neodeslaná práce',photoIds:['queued-photo']}},[{id:'queued-photo',file}]);return {pending:saved.pending,id:saved.payload.operationId,photos:saved.photos.length};});
 assert.equal(pending.pending,true);assert.equal(pending.photos,1);assert.equal(writeAttempts,1,'failed write was replayed without outbox ownership');
 // A global identity refresh fails, but it cannot disable independent reads.
 blockMe=true;const fault=await page.evaluate(async()=>{try{await (await import('/cloud.js?v=job-three-month-v1')).connect({refresh:true});}catch(e){return e.status;}});assert.equal(fault,504);
 await page.locator('[data-page="jobs"]:visible').first().click();await page.locator('[data-job="test-job"]').first().waitFor();
 blockMe=false;releasePhoto();await page.reload();await page.locator('.shell').waitFor();
 const afterReload=await page.evaluate(async()=>{const db=await import('/cloud.js?v=job-three-month-v1');return (await db.cachedServiceWork()).find(e=>e.jobId==='test-job')?.payload?.operationId;});assert.equal(afterReload,pending.id);
 await page.evaluate(async()=>{await (await import('/cloud.js?v=job-three-month-v1')).waitForRefresh();});
 blockWrites=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.waitForFunction(async()=>{const db=await import('/cloud.js?v=job-three-month-v1');return (await db.cachedServiceWork()).find(e=>e.jobId==='test-job')?.pending===false;},{},{timeout:20000});
 const flushed=await page.evaluate(async()=>{const db=await import('/cloud.js?v=job-three-month-v1');await db.syncPendingChanges();await db.syncPendingChanges();const entry=(await db.cachedServiceWork()).find(e=>e.jobId==='test-job');return {pending:entry.pending,photos:entry.photos.length};});assert.deepEqual(flushed,{pending:false,photos:0});
 assert.equal((await db.prepare("SELECT count(*) n FROM service_report_history WHERE job_id='test-job'").first()).n,1);
 assert.equal((await db.prepare("SELECT count(*) n FROM service_photos WHERE job_id='test-job'").first()).n,1);
 assert.deepEqual(errors,[]);await context.close();
 const swContext=await browser.newContext({viewport:{width:430,height:900}}),swPage=await swContext.newPage();swPage.on('pageerror',error=>console.log('SW browser error',error.message));
 await swPage.goto(base);await swPage.locator('.shell').waitFor();
 await swPage.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
 const assets=await swPage.evaluate(async()=>{const names=(await caches.keys()).filter(name=>name.startsWith('zavlahovy-denik-'));if(names.length!==1)throw Error('Service Worker did not retire old application caches');const cache=await caches.open(names[0]);return (await cache.keys()).map(r=>r.url);});
 assert.ok(assets.some(url=>url.endsWith('/cloud.js?v=job-three-month-v1')));assert.ok(assets.some(url=>url.endsWith('/io.js?v=connection-recovery-v1')));
 await swContext.setOffline(true);await swPage.reload();await swPage.locator('.shell').waitFor();await swPage.waitForFunction(()=>/Offline|Server nyní neodpovídá/.test(document.querySelector('.top-status')?.textContent||''));
 await swContext.setOffline(false);await swPage.evaluate(()=>window.dispatchEvent(new Event('online')));await swPage.waitForFunction(()=>document.querySelector('.top-status')?.textContent.includes('Spojení obnoveno'));
 await swContext.close();
 console.log('PASS actual Chromium390 + Worker/D1/R2: stalled shaft photograph does not block jobs/customers; 503 read retry; 504 identity error does not disable other reads; 502 report upload stays queued with original photo and operation ID through reload; automatic reconnect saves report/photo exactly once; actual Service Worker caches new module versions and restores the shell offline, then reconnects. Isolated data only.');
}finally{releasePhoto?.();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mf?.dispose();}
