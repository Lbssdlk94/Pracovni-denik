// Full application + real local Worker/D1/R2. All identities/data are synthetic.
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFileSync,mkdirSync} from 'node:fs';import {createRequire} from 'node:module';import {Miniflare} from 'miniflare';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json')('playwright'));}
const workerSource=process.env.DIARY_TEST_WORKER||'dist/server/index.js';
const bakedInstallation=JSON.parse(readFileSync(workerSource,'utf8').match(/const EXPECTED_INSTALLATION_ID=(null|"[^"]+");/)?.[1]||'null');
const installation=bakedInstallation||'inst-ui-isolated-123456789',people={owner:{id:'owner-ui',email:'owner@ui.test'},worker:{id:'worker-ui',email:'worker@ui.test'},gardenWorker:{id:'garden-worker-ui',email:'garden@ui.test'}};
const apiRequests=[],apiResponses=[];const startupDelayMs=Number(process.env.DIARY_STARTUP_DELAY_MS||0);let startupDelayUsed=false,startupTimingMeasured=false;let actor=people.owner,mf,browser,server;const origin='http://127.0.0.1';
const headers=(person=people.owner)=>({'oai-authenticated-user-id':person.id,'oai-authenticated-user-email':person.email,'x-zavlahy-request':'1','x-workspace-client-version':'shared-directory-v1','content-type':'application/json'});
async function call(path,method='GET',value,person=people.owner){const response=await mf.dispatchFetch('http://ui.test'+path,{method,headers:headers(person),...(value===undefined?{}:{body:JSON.stringify(value)})});assert.equal(response.status,200,await response.clone().text());return response.json();}
try{
 mf=new Miniflare({modules:true,scriptPath:workerSource,compatibilityDate:'2026-08-06',d1Databases:{DB:'workspace-ui-isolated'},r2Buckets:['BUCKET'],bindings:{TEAM_OWNER_EMAIL:people.owner.email,INSTALLATION_ID:installation,DRIVE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64url')}});
 const db=await mf.getD1Database('DB');for(const entry of JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries)for(const sql of readFileSync('drizzle/'+entry.tag+'.sql','utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare("UPDATE installation_state SET instance_id=? WHERE singleton='primary'").bind(installation).run();await call('/api/me');
 for(const role of ['worker','gardenWorker']){await call('/api/invitations','POST',{email:people[role].email,role:'worker'});await call('/api/me','GET',undefined,people[role]);}
 for(const id of ['both','irr','green'])await call('/api/customers/ui-'+id,'PUT',{version:0,name:id==='both'?'Jméno se dvěma zahradami':id==='irr'?'Jen závlaha':'Jen Garden',phones:[],addresses:[{id:'mother-address',address:'Lipová 1488',city:'Blatná'},{id:'home-address',address:'Jiná 22',city:'Písek'}]});
 const mother=(await call('/api/customers/ui-both')).customer.gardens[0].id;
 await call('/api/gardens','POST',{id:'second-garden',name:'Druhá zahrada',address:'Jiná 22, Písek',customerId:'ui-both',notes:''});
 await call('/api/gardens/'+mother,'PATCH',{version:1,name:'Zahrada maminky s dlouhým názvem',address:'Lipová 1488',notes:'IRR_PRIVATE_NOTE'});
 for(const [id,garden,address,discipline,assigned] of [['irrigation-job',mother,'mother-address','irrigation',people.worker.id],['garden-job','second-garden','home-address','garden',people.gardenWorker.id]])await call('/api/jobs/'+id,'PUT',{version:0,title:id==='irrigation-job'?'Závlahářská návštěva':'Garden návštěva',customerId:'ui-both',customerAddressId:address,gardenId:garden,assignedTo:assigned,status:'planned',dueDate:'2026-10-30',plannedStart:'09:00',estimatedMinutes:60,legacyTimeMeaning:'unknown'});
 await db.prepare("INSERT INTO workspaces VALUES('ui-pair','preparing',1,1,1)").run();
 for(const [id,entry,discipline] of [['source-org',installation,'irrigation'],['garden-org','inst-ui-garden-123456789','garden']])await db.prepare('INSERT INTO workspace_organizations VALUES(?,?,?,?,?)').bind(id,'ui-pair',entry,discipline,id).run();
 for(const role of Object.keys(people)){const p=people[role];await db.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,? ,?,?,?,1,'original')").bind(installation,p.id,p.id,role==='owner'?'owner':'worker',p.email,role,people.owner.id).run();await db.prepare("INSERT INTO workspace_member_grants VALUES(?,'source-org',?)").bind(p.id,role==='owner'?'owner':'worker').run();await db.prepare("INSERT INTO workspace_entity_versions(entity,entity_id) VALUES('member',?)").bind(p.id).run();if(role!=='owner')await db.prepare('INSERT INTO member_disciplines VALUES(?,?)').bind(p.id,role==='gardenWorker'?'garden':'irrigation').run();}
 for(const [id,values] of [['ui-both',['irrigation','garden']],['ui-irr',['irrigation']],['ui-green',['garden']]]){for(const discipline of values)await db.prepare('INSERT INTO customer_disciplines VALUES(?,?)').bind(id,discipline).run();await db.prepare("INSERT INTO workspace_entity_versions(entity,entity_id) VALUES('customer',?)").bind(id).run();}
 await db.prepare("UPDATE jobs SET discipline=CASE WHEN id='garden-job' THEN 'garden' ELSE 'irrigation' END").run();
 for(const key of ['features','workspace:garden-org:features'])await db.prepare('INSERT INTO settings(key,value,version) VALUES(?,?,1)').bind(key,JSON.stringify({notifications:false,location:false,zoneManagement:false,shafts:false,plans:false})).run();
 await db.prepare("UPDATE workspaces SET state='active'").run();await call('/api/me');await call('/api/workspace/recovery/setup','POST',{});
 server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),h=new Headers(req.headers);h.set('oai-authenticated-user-id',actor.id);h.set('oai-authenticated-user-email',actor.email);const url='http://127.0.0.1:'+server.address().port+req.url;const path=new URL(url).pathname;if(path.startsWith('/api/'))apiRequests.push({path,method:req.method});if(startupDelayMs&&!startupDelayUsed&&path==='/api/gardens'&&req.method==='GET'){startupDelayUsed=true;await new Promise(resolve=>setTimeout(resolve,startupDelayMs));}const response=await mf.dispatchFetch(url,{method:req.method,headers:h,...(['GET','HEAD'].includes(req.method)?{}:{body})});const result=Buffer.from(await response.arrayBuffer());apiResponses.push({path,at:performance.now()});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(result);}catch(error){res.statusCode=500;res.end(error.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=origin+':'+server.address().port;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const nativeSignals=[];
 async function nativePage(){const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(()=>{window.__nativeSignals=[];window.webkit={messageHandlers:{workDiaryState:{postMessage:value=>{window.__nativeSignals.push(value.type);window.__recordNativeSignal(value.type);}}}};});const page=await context.newPage();page.on('dialog',dialog=>dialog.accept());await page.exposeFunction('__recordNativeSignal',type=>nativeSignals.push(type));const started=performance.now();await page.goto(base);await page.locator('.shell').waitFor();if(startupDelayMs&&actor===people.owner&&!startupTimingMeasured){startupTimingMeasured=true;const at=performance.now(),me=apiResponses.find(r=>r.path==='/api/me'),garden=apiResponses.find(r=>r.path==='/api/gardens');console.log('STARTUP TIMING',JSON.stringify({delayMs:startupDelayMs,documentToShellMs:Math.round(at-started),identityResponseToShellMs:Math.round(at-(me?.at||started)),shellBeforeGardens:!garden||garden.at>at}));if(process.env.DIARY_SESSION_BASELINE!=='1')assert.ok(!garden||garden.at>at,'Overview must render before the delayed garden response');}await page.waitForFunction(()=>!!window.__workDiaryNative);return {context,page};}
 let {context,page}=await nativePage();
 if(startupDelayMs&&process.env.DIARY_SESSION_BASELINE!=='1'){
  await page.evaluate(()=>window.__workDiaryNative.execute('open',{page:'customers'}));await page.locator('#customers-new').click();await page.locator('#customer-name').fill('Text během načítání zahrad');
  await page.waitForLoadState('networkidle');assert.equal(await page.locator('#customer-name').inputValue(),'Text během načítání zahrad','Late startup data must preserve an open form');await page.locator('#modal [data-close]').click();
  console.log('PASS early navigation and form text survive late startup reference data');
 }
 await page.waitForLoadState('networkidle');
 const discoveryCounts=()=>({me:apiRequests.filter(r=>r.path==='/api/me').length,manifest:apiRequests.filter(r=>r.path==='/api/workspace/manifest').length});
 const initialDiscovery=discoveryCounts(),measureStart=performance.now();
 for(let i=0;i<3;i++)await page.evaluate(()=>window.__workDiaryNative.execute('context'));
 await page.evaluate(()=>{const button=document.querySelector('[data-page="settings"]');if(!button)throw Error('Missing settings navigation');button.click();});
 await page.locator('.settings-workspace').waitFor();
 await page.evaluate(()=>window.__workDiaryNative.execute('open',{page:'home'}));
 await page.locator('[data-action="sync"]').waitFor();
 await page.evaluate(()=>{document.querySelector('.top-status').title='Čekám na testované obnovení';document.querySelector('[data-action="sync"]').click();});
 await page.waitForFunction(()=>{const text=document.querySelector('.top-status')?.title||'';return text==='Spojení obnoveno'||text.startsWith('Čeká ');});
 await page.waitForLoadState('networkidle');
 const afterDiscovery=discoveryCounts();
 const metrics={initialDiscovery,extraMe:afterDiscovery.me-initialDiscovery.me,extraManifest:afterDiscovery.manifest-initialDiscovery.manifest,scenarioMs:Math.round(performance.now()-measureStart)};
 console.log('SESSION DISCOVERY METRICS',JSON.stringify(metrics));
 if(process.env.DIARY_SESSION_BASELINE!=='1'){assert.equal(initialDiscovery.me,1);assert.equal(initialDiscovery.manifest,1);assert.equal(metrics.extraMe,0,'Routine refresh/settings/native context must not reload identity');assert.equal(metrics.extraManifest,0,'Routine work must not revalidate the full offline inventory');}
 if(process.env.DIARY_SESSION_BASELINE==='1'){await context.close();}else{

 await page.evaluate(async()=> (await import('/cloud.js?v=job-month-cache-v1')).putFormDraft('role-preview-fixture',1,{work:'Skutečný rozepsaný protokol'}));
 await page.evaluate(async()=>{await (await import('/cloud.js?v=job-month-cache-v1')).warmJobMonths();});const warmBefore=discoveryCounts();await page.reload();await page.locator('.shell').waitFor();await page.waitForLoadState('networkidle');const warmAfter=discoveryCounts();assert.equal(warmAfter.me-warmBefore.me,1);assert.equal(warmAfter.manifest-warmBefore.manifest,2,'Warm startup must still fence cached IDs');assert.ok(await page.evaluate(async()=>!!await (await import('/cloud.js?v=job-month-cache-v1')).peekCachedJobs('/api/jobs?order=schedule&state=all&month=2026-10&day=2026-10-30')),'Authorized month cache must survive restart');console.log('PASS warm startup still verifies identity and all cached IDs');
 await page.evaluate(async()=>{const db=await import('/cloud.js?v=job-month-cache-v1');await db.warmJobMonths();});
 const listCalls=()=>apiRequests.filter(r=>r.path==='/api/jobs').length,beforeCachedReads=listCalls();
 const cachedMonth=await page.evaluate(async()=>{const db=await import('/cloud.js?v=job-month-cache-v1');const current=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit'}).format(new Date());const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date()).slice(0,10);const a=await db.request('/api/jobs?order=schedule&state=all&month='+today.slice(0,7)+'&day='+today);const b=await db.request('/api/jobs?order=schedule&state=all&month=2026-10&day=2026-10-30');return {current:!!a._jobCache,previous:!!b._jobCache,ids:b.jobs.map(j=>j.id)};});
 assert.equal(cachedMonth.current,true);assert.equal(cachedMonth.previous,true);assert.ok(cachedMonth.ids.includes('irrigation-job'));assert.equal(listCalls(),beforeCachedReads,'Two-month stored reads must not make another jobs request');
 await context.setOffline(true);await page.evaluate(()=>document.querySelector('.nav [data-page="jobs"]').click());await page.locator('#jobs-daily-day').fill('2026-10-30');await page.locator('#jobs-daily-day').dispatchEvent('change');await page.locator('.job-card[data-job="irrigation-job"]').waitFor();await page.locator('.job-cache-status').filter({hasText:'Offline'}).waitFor();assert.equal((await db.prepare('SELECT status FROM jobs WHERE id=?').bind('irrigation-job').first()).status,'planned');
 await context.setOffline(false);await page.waitForLoadState('networkidle');console.log('PASS real IndexedDB two-month cache: current and previous month, no repeated list request, survives restart, offline day card, unchanged real job');
 const previewIdentityCounts=discoveryCounts();
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});await page.locator('[data-role-preview]').selectOption('reader');
  await page.locator('.role-preview.is-active').waitFor();
  const view=await page.evaluate(()=>window.__workDiaryNative.execute('context'));assert.equal(view.user.role,'reader');assert.equal(view.permissions.write,false);assert.equal(view.permissions.manage,false);
  assert.equal(await page.evaluate(async()=> (await import('/cloud.js?v=job-month-cache-v1')).getFormDraft('role-preview-fixture')),null,'Preview must not expose or edit the live draft');
  assert.equal(await page.locator('[data-page="team"]').count(),0);
  assert.equal((await db.prepare('SELECT role FROM members WHERE user_id=?').bind(people.owner.id).first()).role,'owner');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='1400px';document.querySelector('.main').append(spacer);scrollTo(0,600);});
  const exit=page.locator('.role-preview-quick-exit [data-role-preview-exit]');const box=await exit.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=900,'Return to actual role must stay in the viewport');
  await exit.click();await page.waitForFunction(()=>!document.querySelector('.role-preview.is-active'));
  assert.equal((await page.evaluate(()=>window.__workDiaryNative.execute('context'))).user.role,'owner');
  assert.equal((await page.evaluate(async()=> (await import('/cloud.js?v=job-month-cache-v1')).getFormDraft('role-preview-fixture'))).value.work,'Skutečný rozepsaný protokol');
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-role-preview]').selectOption('admin');await page.locator('.role-preview.is-active').waitFor();
 await page.evaluate(()=>window.__workDiaryNative.execute('open',{jobId:'irrigation-job',action:'status'}));await page.locator('#job-status-form').waitFor();
 await page.locator('#job-status').selectOption('in_progress');await page.locator('#job-status-form [type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#job-status-form')?.textContent.includes('V náhledu role'));
 assert.equal((await db.prepare('SELECT status FROM jobs WHERE id=?').bind('irrigation-job').first()).status,'planned','Preview form must not change a real test job');
 await page.locator('#modal [data-close]').click();
 const beforeOffline=await page.evaluate(async()=> (await import('/cloud.js?v=job-month-cache-v1')).pendingSummary());
 await context.setOffline(true);
 const offlineDenied=await page.evaluate(async()=>{const db=await import('/cloud.js?v=job-month-cache-v1');try{await db.saveServiceWork('irrigation-job',{version:1,report:{work:'PREVIEW MUST NOT PERSIST'}});return false;}catch(error){return error.code==='role_preview_readonly';}});assert.equal(offlineDenied,true);
 const afterOffline=await page.evaluate(async()=> (await import('/cloud.js?v=job-month-cache-v1')).pendingSummary());assert.deepEqual(afterOffline,beforeOffline);
 await context.setOffline(false);await page.locator('.role-preview-quick-exit [data-role-preview-exit]').click();await page.waitForLoadState('networkidle');
 assert.deepEqual(discoveryCounts(),previewIdentityCounts,'Role appearance changes must reuse the startup identity');
 await page.evaluate(async()=> (await import('/cloud.js?v=job-month-cache-v1')).removeFormDraft('role-preview-fixture'));
 console.log('PASS role appearance preview: owner -> reader/admin -> owner, visible return at 390/1440, no overflow, unchanged membership, server-backed form blocked, offline queue unchanged, no identity polling');
 const snapshot=await page.evaluate(()=>window.__workDiaryNative.execute('context'));
 assert.equal(snapshot.user.role,'owner');assert.equal(snapshot.recovery,undefined);assert.equal(snapshot.installation,undefined);assert.ok((await page.evaluate(()=>window.__nativeSignals)).includes('ready'));
 const list=await page.evaluate(()=>window.__workDiaryNative.execute('jobs',{state:'all',day:'2026-10-30'}));assert.ok(list.jobs.some(j=>j.id==='irrigation-job'));
 const detail=await page.evaluate(()=>window.__workDiaryNative.execute('job',{id:'irrigation-job'}));assert.equal(detail.job.gardenId,mother);assert.equal(detail.job.plannedStart,'09:00');assert.equal(detail.job.estimatedMinutes,60);
 const arbitrary=await page.evaluate(async()=>{try{await window.__workDiaryNative.execute('open',{page:'javascript:alert(1)'});return false;}catch{return true;}});assert.equal(arbitrary,true);
 await page.evaluate(()=>window.__workDiaryNative.execute('open',{jobId:'irrigation-job',action:'status'}));await page.locator('#job-status-form').waitFor();await page.locator('#job-status').selectOption('incomplete');await page.locator('#job-incomplete-reason').fill('Nativní předání formuláře – zachovat text');
 const blocked=await page.evaluate(async()=>{try{await window.__workDiaryNative.execute('context');return null;}catch(e){return e.code;}});assert.equal(blocked,'native_form_open');assert.equal(await page.locator('#job-incomplete-reason').inputValue(),'Nativní předání formuláře – zachovat text');
 await page.locator('#modal [data-close]').click();await page.evaluate(()=>window.__workDiaryNative.execute('context'));
 assert.equal((await db.prepare('SELECT status FROM jobs WHERE id=?').bind('irrigation-job').first()).status,'planned','opening/cancelling native handoff mutated a job');
 const beforeSave=discoveryCounts();
 await page.evaluate(()=>window.__workDiaryNative.execute('open',{jobId:'irrigation-job',action:'status'}));await page.locator('#job-status-form').waitFor();
 await page.locator('#job-status').selectOption('in_progress');await page.locator('#job-status-form [type="submit"]').click();
 await page.waitForFunction(()=>!document.querySelector('#modal').open);
 assert.equal((await db.prepare('SELECT status FROM jobs WHERE id=?').bind('irrigation-job').first()).status,'in_progress');
 assert.deepEqual(discoveryCounts(),beforeSave,'A real saved status change must not recheck identity or the complete offline inventory');
 await db.prepare("UPDATE settings SET value=json_set(value,'$.jobDay',json('false'),'$.jobList',json('true'),'$.jobs',json('false')),version=version+1 WHERE key='features'").run();
 const cachedContext=await page.evaluate(()=>window.__workDiaryNative.execute('context'));
 assert.equal(cachedContext.features.jobDay,true,'Role/module discovery remains the startup snapshot');
 const serverDenied=await page.evaluate(async()=>{try{await window.__workDiaryNative.execute('jobs',{day:'2026-10-30'});return 200;}catch(e){return e.status;}});
 assert.equal(serverDenied,403,'The server must enforce the current module restriction even before restarting the client');
 await context.close();({context,page}=await nativePage());
 const policy=await page.evaluate(()=>window.__workDiaryNative.execute('context'));assert.equal(policy.features.jobDay,false);
 assert.equal(await page.evaluate(async()=>{try{await window.__workDiaryNative.execute('jobs',{day:'2026-10-30'});return false;}catch{return true;}}),true);
 await context.close();await db.prepare("UPDATE settings SET value=json_set(value,'$.jobs',json('true')),version=version+1 WHERE key='features'").run();actor=people.worker;({context,page}=await nativePage());
 assert.equal(await page.locator('[data-role-preview]').count(),0,'Actual worker must not receive the preview selector');
 const workerSnapshot=await page.evaluate(()=>window.__workDiaryNative.execute('context'));assert.equal(workerSnapshot.user.role,'worker');assert.equal(workerSnapshot.permissions.manage,false);
 const own=await page.evaluate(()=>window.__workDiaryNative.execute('jobs',{state:'all'}));assert.deepEqual(own.jobs.map(j=>j.id),['irrigation-job']);
 const denied=await page.evaluate(async()=>{try{await window.__workDiaryNative.execute('job',{id:'garden-job'});return 200;}catch(e){return e.status;}});assert.equal(denied,404);
 await page.evaluate(()=>window.__workDiaryNative.execute('open',{page:'materials'}));await page.locator('#materials').waitFor();assert.equal(await page.locator('#material-new').isVisible(),false,'worker must not manage catalog items');
 await context.setOffline(true);await page.waitForFunction(()=>window.__nativeSignals.includes('invalidated'));assert.equal(await page.evaluate(async()=>{try{await window.__workDiaryNative.execute('context');return false;}catch{return true;}}),true);
 await context.close();console.log('PASS native bridge + real isolated Worker/D1/R2: scoped lists/details, no private recovery metadata, feature-disabled day rejected, arbitrary navigation rejected, form text preserved, cancel creates no write, assigned worker cannot read other department, can read materials without catalog management, offline invalidates native snapshots.');
}
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await mf?.dispose();}
