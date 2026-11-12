// Full application + real local Worker/D1/R2. All identities/data are synthetic.
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFileSync,mkdirSync} from 'node:fs';import {createRequire} from 'node:module';import {Miniflare} from 'miniflare';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json')('playwright'));}
const bakedInstallation=JSON.parse(readFileSync('dist/server/index.js','utf8').match(/const EXPECTED_INSTALLATION_ID=(null|"[^"]+");/)?.[1]||'null');
const installation=bakedInstallation||'inst-ui-isolated-123456789',people={owner:{id:'owner-ui',email:'owner@ui.test'},worker:{id:'worker-ui',email:'worker@ui.test'},gardenWorker:{id:'garden-worker-ui',email:'garden@ui.test'}};
let actor=people.owner,mf,browser,server;const origin='http://127.0.0.1';
const headers=(person=people.owner)=>({'oai-authenticated-user-id':person.id,'oai-authenticated-user-email':person.email,'x-zavlahy-request':'1','x-workspace-client-version':'shared-directory-v1','content-type':'application/json'});
async function call(path,method='GET',value,person=people.owner){const response=await mf.dispatchFetch('http://ui.test'+path,{method,headers:headers(person),...(value===undefined?{}:{body:JSON.stringify(value)})});assert.equal(response.status,200,await response.clone().text());return response.json();}
try{
 mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'workspace-ui-isolated'},r2Buckets:['BUCKET'],bindings:{TEAM_OWNER_EMAIL:people.owner.email,INSTALLATION_ID:installation,DRIVE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64url')}});
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
 for(const key of ['features','workspace:garden-org:features'])await db.prepare('INSERT INTO settings(key,value,version) VALUES(?,?,1)').bind(key,JSON.stringify({notifications:true,location:true,zoneManagement:true,shafts:true,plans:true,vehicles:true})).run();
 await db.prepare("UPDATE workspaces SET state='active'").run();await call('/api/me');await call('/api/workspace/recovery/setup','POST',{});
 server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),h=new Headers(req.headers);h.set('oai-authenticated-user-id',actor.id);h.set('oai-authenticated-user-email',actor.email);const url='http://127.0.0.1:'+server.address().port+req.url;const response=await mf.dispatchFetch(url,{method:req.method,headers:h,...(['GET','HEAD'].includes(req.method)?{}:{body})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){res.statusCode=500;res.end(error.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=origin+':'+server.address().port;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.addInitScript(()=>{window.webkit={messageHandlers:{workDiaryState:{postMessage:()=>{}}}}});
 const page=await context.newPage();page.on('pageerror',e=>console.error('UI error:',e.message));page.on('dialog',d=>d.accept());await page.goto(base);await page.locator('.shell').waitFor();
 await page.evaluate(()=>{const box=document.createElement('section');box.id='native-visibility-fixture';box.innerHTML='<p>Viditelné<span hidden>SKRYTA_CENA</span></p><div style="display:none"><button>SKRYTA_AKCE</button></div><details><summary>Rozbalit zkoušku</summary><button class="primary">SKRYTE_ULOZENI</button></details><form><label>Testovací pole<input name="native-ui-test"></label><div class="actions"><button type="button" class="primary">Testovací akce</button></div></form>';document.querySelector('#app .main').append(box);});
 const visibility=await page.evaluate(()=>window.__workDiaryNative.execute('screen'));
 const allNodes=nodes=>nodes.flatMap(n=>[n,...allNodes(n.children||[])]), visibleNodes=allNodes(visibility.nodes);
 assert.ok(!JSON.stringify(visibility).includes('SKRYTA_'),'Hidden text/action leaked into native rendering');assert.ok(!JSON.stringify(visibility).includes('SKRYTE_ULOZENI'),'Closed disclosure exposed primary action');
 assert.ok(visibleNodes.some(n=>n.kind==='form'));assert.ok(visibleNodes.some(n=>n.kind==='actions'));assert.equal(visibleNodes.find(n=>n.text==='Testovací akce').intent,null);
 const disclosure=visibleNodes.find(n=>n.kind==='disclosure'&&n.text==='Rozbalit zkoušku');assert.ok(disclosure);
 const expanded=await page.evaluate(handle=>window.__workDiaryNative.execute('control',{handle,action:'toggle',checked:true}),disclosure.handle);assert.ok(allNodes(expanded.nodes).some(n=>n.text==='SKRYTE_ULOZENI'));
 await page.evaluate(()=>document.getElementById('native-visibility-fixture').remove());console.log('PASS native grouping and visibility: hidden text/buttons and closed disclosure actions stay hidden');
 await page.evaluate(()=>{const label=document.createElement('label');label.id='qa-decimal-field';label.innerHTML='Množství<input id=qa-decimal type=number step=0.1>';document.querySelector('#app .main').append(label);});
 const localeScreen=await page.evaluate(()=>window.__workDiaryNative.execute('screen'));const collect=nodes=>nodes.flatMap(n=>[n,...collect(n.children||[])]);const decimal=collect(localeScreen.nodes).find(n=>n.id==='id:qa-decimal');assert.ok(decimal);const decimalReply=await page.evaluate(handle=>window.__workDiaryNative.execute('control',{handle,action:'value',value:'1,5'}),decimal.handle);assert.equal(collect(decimalReply.nodes).find(n=>n.id==='id:qa-decimal').value,'1.5');await page.evaluate(()=>document.getElementById('qa-decimal-field').remove());
 const execute=(command,input={})=>page.evaluate(({command,input})=>window.__workDiaryNative.execute(command,input),{command,input});
 const flatten=items=>items.flatMap(n=>[n,...flatten(n.children||[])]);
 async function screen(){return execute('screen');}
 async function node(text,kind=null){const value=flatten((await screen()).nodes).find(n=>(n.text||'').includes(text)&&(!kind||n.kind===kind));assert.ok(value,'Native control missing: '+text);return value;}
 async function click(text){for(let attempt=0;;attempt++){const n=await node(text,'button');try{return await execute('control',{handle:n.handle,action:'click'});}catch(error){if(attempt>=2||!error.message.includes('Obrazovka se změnila'))throw error;await page.waitForTimeout(80);}}}
 async function value(text,value){const n=await node(text,'field');return execute('control',{handle:n.handle,action:'value',value});}
 for(const [module,selector] of [['customers','#customers'],['home','.garden-overview'],['defects','#defects'],['attendance','#attendance'],['subscriptions','#subscriptions'],['materials','#materials'],['vehicles','#vehicles'],['team','#team'],['settings','.settings-workspace'],['jobs','#jobs']]){
  await execute('open',{page:module});await page.locator('.nav [data-page="'+module+'"][aria-current=page]').first().waitFor({state:'attached',timeout:12000});const s=await screen();assert.ok(s.nodes.length,module+' empty native descriptor');assert.ok(flatten(s.nodes).some(n=>['button','field','toggle','select'].includes(n.kind)),module+' has no usable native controls');console.log('PASS native contract module',module);
 }
 // Compact native rows retain IDs and live click/call handles, not joined text.
 await execute('open',{page:'customers'});await page.locator('.customer-compact').first().waitFor();
 const customerRow=await node('Jméno se dvěma zahradami','contact');assert.equal(customerRow.id,'customer:ui-both');
 assert.ok(customerRow.children.some(n=>n.kind==='button'&&n.intent==='open'));
 await execute('control',{handle:customerRow.handle,action:'click'});await page.locator('[data-customer-view]').waitFor();
 const customerDetail=await screen();assert.equal(customerDetail.presentation,'page');assert.equal(customerDetail.title,'Jméno se dvěma zahradami');
 assert.ok(customerDetail.nodes.some(n=>n.kind==='category'&&n.text==='Kontakt a adresa'));
 assert.ok(flatten(customerDetail.nodes).some(n=>n.text?.includes('Lipová 1488')),'Address must remain accessible in the details');
 await click('Zavřít');
 await execute('open',{page:'home'});await page.locator('.garden-card[data-garden]').first().waitFor();
 const gardenRow=await node('Zahrada maminky','destination');assert.equal(gardenRow.id,'garden:'+mother);
 assert.equal(gardenRow.text,'Zahrada maminky s dlouhým názvem');assert.equal(gardenRow.subtitle,'');
 assert.ok(!gardenRow.text.includes('Lipová'));assert.ok(!gardenRow.text.includes('šachet'));
 assert.ok((await screen()).nodes.some(n=>n.kind==='category'&&n.text==='Řazení a poloha'));
 await execute('control',{handle:gardenRow.handle,action:'click'});await page.locator('.garden-title').waitFor();
 const gardenDetail=await screen();assert.ok(gardenDetail.nodes.some(n=>n.kind==='category'&&n.text==='Kontakt a adresa'));
 const historyCategory=gardenDetail.nodes.find(n=>n.id==='garden-section:history');assert.ok(historyCategory);
 assert.ok(historyCategory.children.some(n=>n.kind==='button'));
 assert.ok(!gardenDetail.nodes.some(n=>n.kind==='text'&&n.text?.includes('Lipová')),'Full address leaked onto native garden summary');
 const gardenBack=flatten(gardenDetail.nodes).find(n=>n.intent==='back');assert.ok(gardenBack);
 await execute('control',{handle:gardenBack.handle,action:'click'});await page.locator('.garden-card[data-garden]').first().waitFor();
 await execute('open',{page:'settings'});await page.locator('.settings-workspace').waitFor();
 const settingsScreen=await screen();assert.ok(settingsScreen.nodes.some(n=>n.kind==='category'));
 assert.ok(!settingsScreen.nodes.some(n=>['field','toggle','select','form'].includes(n.kind)&&!n.id.startsWith('header.')),'Settings forms must start behind categories');
 for(const width of [360,390,430]){await page.setViewportSize({width,height:844});await execute('open',{page:'home'});assert.ok(flatten((await screen()).nodes).some(n=>n.kind==='destination'&&n.id==='garden:'+mother));}
 console.log('PASS compact native customer/garden destinations, stable identifiers, inline customer detail, collapsed settings and mobile descriptor visibility');
 await execute('open',{page:'customers'});await page.locator('#customers-new').waitFor();await click('Nový zákazník');await page.locator('#customer-form').waitFor();
 await value('Jméno nebo název','Nativní zákazník');await value('Telefonní číslo','+420777123456');await value('Ulice, číslo','Ukázková 12');await value('Město / obec','Blatná');await click('Uložit zákazníka');await page.locator('#customer-form').waitFor({state:'hidden'});
 assert.equal((await db.prepare("SELECT count(*) n FROM customers WHERE name='Nativní zákazník'").first()).n,1);assert.equal((await db.prepare("SELECT count(*) n FROM gardens WHERE customer_id IN (SELECT id FROM customers WHERE name='Nativní zákazník')").first()).n,1);
 await page.locator('[data-customer-open]').filter({hasText:'Nativní zákazník'}).first().waitFor();const savedContact=await node('Nativní zákazník','contact');assert.ok(savedContact.children.some(n=>n.intent==='call'&&n.handle),'Customer row must retain a separate live call action');
 await execute('open',{jobId:'irrigation-job',action:'protocol'});await page.locator('#service-work-form').waitFor();
 await value('Provedené práce','Nativní ovládací prvky – servis systému');
 const canvas=await node('Podpis zákazníka','canvas');await execute('control',{handle:canvas.handle,action:'draw',points:[{x:.1,y:.5},{x:.3,y:.2},{x:.6,y:.8},{x:.8,y:.4}]});
 const signature=await execute('asset',{handle:canvas.handle});assert.equal(signature.type,'image/png');assert.ok(signature.data.length>100);
 const gallery=await node('Vybrat fotografie','file');const selection=await execute('control',{handle:gallery.handle,action:'click'});assert.ok(selection.file,'Native picker was not requested');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=80;const x=c.getContext('2d');x.fillStyle='#183f35';x.fillRect(0,0,100,80);return c.toDataURL('image/png').split(',')[1];});
 await execute('control',{handle:selection.file.id,action:'fileStart',name:'Ukazka.png',type:'image/png',size:Buffer.from(png,'base64').length});await execute('control',{handle:selection.file.id,action:'fileChunk',index:0,data:png});await execute('control',{handle:selection.file.id,action:'fileFinish',last:true});await page.locator('#service-photo-list img').waitFor();
 await click('Uložit rozpracovaný protokol');await page.locator('#service-work-form').waitFor({state:'hidden'});
 const saved=await call('/api/jobs/irrigation-job/service');assert.equal(saved.report.work,'Nativní ovládací prvky – servis systému');assert.ok(saved.report.customerSignature.startsWith('data:image/png;base64,'));assert.equal(saved.photos.length,1);assert.equal(saved.job.status,'planned');
 console.log('PASS native controls save customer + paired garden, protocol, signature and a photograph through existing real Worker/D1/R2');
 await execute('open',{jobId:'irrigation-job',action:'protocol'});await page.locator('#service-work-form').waitFor();await click('Zobrazit PDF');await page.locator('.protocol-pdf-frame').waitFor();
 const pdfNode=flatten((await screen()).nodes).find(n=>n.kind==='document');assert.ok(pdfNode);const pdf=await execute('asset',{handle:pdfNode.handle});assert.ok(Buffer.from(pdf.data,'base64').subarray(0,5).toString()==='%PDF-');await click('Zavřít');await click('Zavřít');
 await execute('open',{page:'home'});await click('Zahrada maminky');await click('Šachty');await click('Přidat šachtu');await click('Vybrat fotografii');
 const shaftFile=(await screen()).file;assert.ok(shaftFile);await execute('control',{handle:shaftFile.id,action:'file',files:[{name:'Sachta.png',type:'image/png',data:png}]});await page.locator('#photo-wrap img').waitFor();await value('Název šachty','Nativní šachta');
 let picture=flatten((await screen()).nodes).find(n=>n.kind==='picture');assert.ok(picture);await execute('control',{handle:picture.handle,action:'point',x:.2,y:.3});await page.locator('#valve-label-form').waitFor();await value('Popisek ventilu','Nativní ventil');await click('Přidat popisek');
 picture=flatten((await screen()).nodes).find(n=>n.kind==='picture');const pin=picture.pins.find(p=>p.text==='1');assert.ok(pin);await execute('control',{handle:pin.handle,action:'draw',points:[{x:pin.x,y:pin.y},{x:.7,y:.6},{x:.7,y:.6}]});
 await click('Umístit špendlík');await page.locator('#position-picker-map').waitFor();const mapNode=flatten((await screen()).nodes).find(n=>n.kind==='map');assert.ok(mapNode,'MapKit contract lacks its map');await execute('control',{handle:mapNode.handle,action:'map',latitude:49.34,longitude:14.12,select:true});await click('Použít polohu');await click('Uložit');
 await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='Uloženo ve společném týmu');const records=(await call('/api/shafts')).records;const shaft=records.find(r=>r.name==='Nativní šachta');assert.ok(shaft);assert.ok(Math.abs(shaft.markers[0].x-.7)<.001);assert.ok(Math.abs(shaft.markers[0].y-.6)<.001);assert.ok(Math.abs(shaft.position.latitude-49.34)<1e-9);assert.ok(Math.abs(shaft.position.longitude-14.12)<1e-9);
 console.log('PASS native document contract creates actual PDF; photo annotation add/drag and native map selection persist into the real record');await click('Zpět na šachty');

 await execute('open',{jobId:'irrigation-job',action:'protocol'});await page.locator('#service-work-form').waitFor();await context.setOffline(true);await value('Provedené práce','Nativní zápis offline');await click('Uložit rozpracovaný protokol');await page.locator('#service-work-form').waitFor({state:'hidden'});
 const pending=await page.evaluate(async()=> (await import('/cloud.js?v=job-month-cache-v1')).pendingSummary());assert.ok(pending.total>0);
 await context.setOffline(false);await page.waitForFunction(async()=>{const r=await fetch('/api/jobs/irrigation-job/service',{headers:{'x-workspace-client-version':'shared-directory-v1'}});const v=await r.json();return v.report?.work==='Nativní zápis offline';},{},{timeout:30000});
 assert.equal((await db.prepare("SELECT count(*) n FROM service_reports WHERE job_id='irrigation-job'").first()).n,1);assert.equal((await db.prepare("SELECT count(*) n FROM service_photos WHERE job_id='irrigation-job'").first()).n,1);
 console.log('PASS native offline edit and reconnection synchronize one report without duplicating a report or photograph');
 const pushConfig=await execute('nativePush',{action:'config'});assert.equal(pushConfig.configured,false);assert.equal(pushConfig.userId,people.owner.id);assert.ok(pushConfig.missing.includes('APNS_PRIVATE_KEY'));
 await page.evaluate(()=>{window.webkit.messageHandlers.workDiaryPush={postMessage:message=>{window.nativePushSettingsRequested=message.type==='push-settings';}};});
 await execute('open',{page:'notifications'});await page.locator('#notifications-center').waitFor();const options=flatten((await screen()).nodes).find(n=>n.kind==='disclosure'&&n.text==='Nastavení oznámení');assert.ok(options);await execute('control',{handle:options.handle,action:'toggle',checked:true});await click('Otevřít nastavení oznámení iPhonu');assert.equal(await page.evaluate(()=>window.nativePushSettingsRequested),true);await click('Zavřít upozornění');
 await execute('nativePush',{action:'detach'});console.log('PASS native notification settings handoff, honest missing-credentials state and logout cleanup through the real Worker');

 await context.close();
 actor=people.gardenWorker;
 const gardenContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await gardenContext.addInitScript(()=>{window.webkit={messageHandlers:{workDiaryState:{postMessage:()=>{}}}}});
 const gardenPage=await gardenContext.newPage();await gardenPage.goto(base);await gardenPage.locator('.shell').waitFor();
 await gardenPage.evaluate(()=>window.__workDiaryNative.execute('open',{page:'home'}));await gardenPage.locator('.garden-card[data-garden]').first().waitFor();
 const greenList=await gardenPage.evaluate(()=>window.__workDiaryNative.execute('screen'));
 const sharedGarden=flatten(greenList.nodes).find(n=>n.kind==='destination'&&n.id==='garden:'+mother);assert.ok(sharedGarden,'Shared garden basic information must stay accessible');
 await gardenPage.evaluate(handle=>window.__workDiaryNative.execute('control',{handle,action:'click'}),sharedGarden.handle);await gardenPage.locator('.garden-title').waitFor();
 const greenDetail=await gardenPage.evaluate(()=>window.__workDiaryNative.execute('screen'));
 assert.ok(!flatten(greenDetail.nodes).some(n=>['garden-section:shafts','garden-section:blowout'].includes(n.id)),'Irrigation-only sections leaked into progressive Garden navigation');
 assert.ok(!JSON.stringify(greenDetail).includes('IRR_PRIVATE_NOTE'));
 await gardenContext.close();console.log('PASS progressive shared-garden navigation still excludes irrigation shafts, blowout and private notes for a Garden worker');
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await mf?.dispose();}
