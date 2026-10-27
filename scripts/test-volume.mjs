// Entirely local: a fresh Miniflare D1/R2 instance, loopback server and synthetic people.
// No target URL or production binding can be supplied to this test.
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {Miniflare} from 'miniflare';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),tenant=path.join(root,'apps/work-diary');
const output=path.resolve(process.argv[process.argv.indexOf('--output')+1]&&process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:path.join(root,'.qa/volume'));
await mkdir(output,{recursive:true});
const storage=await mkdtemp(path.join(tmpdir(),'work-diary-volume-'));
const people=Object.fromEntries(['owner','worker','mate','third','reader','outsider'].map(name=>[name,{id:name+'-id',email:name+'@example.com'}]));
const report={scenario:{customers:300,gardens:300,from:'2026-11-01',to:'2026-12-31',calendarDays:61,jobsPerDay:5,jobs:305,photos:false},api:{},browser:[],checks:[],errors:[]};
const timings={};let mf,server,browser,currentPage,stage='initializing';
function runtime(){return new Miniflare({modules:true,scriptPath:path.join(tenant,'dist/server/index.js'),compatibilityDate:'2026-08-06',d1Databases:{DB:'volume-isolated'},r2Buckets:['BUCKET'],d1Persist:path.join(storage,'d1'),r2Persist:path.join(storage,'r2'),bindings:{TEAM_OWNER_EMAIL:people.owner.email}});}
function record(label,value){(timings[label]??=[]).push(value);}
function summary(values){const a=values.slice().sort((a,b)=>a-b),pct=p=>Math.round(a[Math.min(a.length-1,Math.ceil(a.length*p)-1)]*10)/10;return {samples:a.length,medianMs:pct(.5),p95Ms:pct(.95),maxMs:pct(1)};}
async function call(url,user='owner',method='GET',value,expected=200){
 const started=performance.now(),p=people[user];assert.ok(p);
 const response=await mf.dispatchFetch('http://isolated.test'+url,{method,headers:{'oai-authenticated-user-id':p.id,'oai-authenticated-user-email':p.email,'x-zavlahy-request':'1','content-type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});
 const text=await response.text();assert.equal(response.status,expected,url+': '+text.slice(0,500));record(method+' '+url.split('?')[0],performance.now()-started);return text?JSON.parse(text):null;
}
async function paginate(url,key,user='owner'){
 const all=[],seen=new Set();let cursor=null,pages=0;
 do{const u=new URL('http://isolated.test'+url);if(cursor)u.searchParams.set('cursor',cursor);const value=await call(u.pathname+u.search,user);pages++;for(const row of value[key]){assert.ok(!seen.has(row.id),'duplicate across pages: '+row.id);seen.add(row.id);all.push(row);}cursor=value.nextCursor;if(pages>10)throw Error('Pagination loop');}while(cursor);
 return {rows:all,pages};
}
async function measure(page,label,action,ready){const started=performance.now();await action();await ready();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const ms=Math.round(performance.now()-started);report.browser.push({label,width:page.viewportSize().width,ms});console.log(label+': '+ms+' ms');return ms;}
function ids(page,selector,field){return page.locator(selector).evaluateAll((nodes,field)=>nodes.map(n=>n.dataset[field]),field);}
const nav=async(page,id)=>{const b=page.locator('.nav [data-page="'+id+'"]');if(page.viewportSize().width<=760&&!await b.isVisible())await page.locator('[data-mobile-more]').click();await b.click();};
const idle=page=>page.locator('#jobs-refresh:not([disabled])').waitFor();
const noOverflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
const pad=n=>String(n).padStart(4,'0');
try{
 stage='migrations';mf=runtime();let db=await mf.getD1Database('DB');
 for(const migration of JSON.parse(await readFile(path.join(tenant,'drizzle/meta/_journal.json'),'utf8')).entries){for(const sql of (await readFile(path.join(tenant,'drizzle',migration.tag+'.sql'),'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();}
 await call('/api/me');for(const user of ['worker','mate','third','reader']){await call('/api/invitations','owner','POST',{email:people[user].email,role:user==='reader'?'reader':'worker'});await call('/api/me',user);}
 stage='create customers and companion gardens';console.log(stage);const seedStart=performance.now();
 for(let i=1;i<=300;i++){await call('/api/customers/volume-customer-'+pad(i),'owner','PUT',{version:0,name:'Testovací zákazník '+pad(i),gardenName:'Testovací zahrada '+pad(i),email:'customer'+i+'@example.invalid',phones:[],addresses:[{id:'address-'+i,label:'Testovací místo',address:'Testovací ulice '+i,city:'Testovací obec'}]});if(i%100===0)console.log('Created '+i+' customers and companion gardens');}
 const gardens=(await call('/api/gardens')).gardens;assert.equal(gardens.length,300);const byCustomer=new Map(gardens.map(g=>[g.customerId,g]));assert.equal(byCustomer.size,300);
 stage='create 305 scheduled jobs';const assignments=['worker','mate','worker','third','mate'],jobs=[];
 for(let d=0;d<61;d++)for(let slot=0;slot<5;slot++){
  const n=d*5+slot+1,i=(n-1)%300+1,dueDate=new Date(Date.parse('2026-11-01T12:00:00Z')+d*86400000).toISOString().slice(0,10),customerId='volume-customer-'+pad(i),garden=byCustomer.get(customerId);
  const value={version:0,title:'Testovací servis '+pad(n),jobType:'service',customerId,customerAddressId:'address-'+i,gardenId:garden.id,customerName:'Testovací zákazník '+pad(i),address:garden.address,city:'Testovací obec',description:'Syntetická návštěva pro lokální objemový test.',assignedTo:people[assignments[slot]].id,dueDate,plannedStart:String(8+slot*2).padStart(2,'0')+':00',estimatedMinutes:60,status:'planned'};
  const result=await call('/api/jobs/volume-job-'+pad(n),'owner','PUT',value);jobs.push(result.job);if(n%100===0)console.log('Created '+n+' jobs');
 }
 report.seedMs=Math.round(performance.now()-seedStart);
 const counts=await db.prepare('SELECT (SELECT COUNT(*) FROM customers WHERE deleted=0) customers,(SELECT COUNT(*) FROM gardens WHERE deleted=0) gardens,(SELECT COUNT(*) FROM jobs WHERE deleted=0) jobs').first();assert.deepEqual(counts,{customers:300,gardens:300,jobs:305});
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM jobs j JOIN gardens g ON g.id=j.garden_id JOIN customers c ON c.id=j.customer_id WHERE g.customer_id=c.id').first()).n,305);
 const days=(await db.prepare('SELECT due_date,COUNT(*) n FROM jobs WHERE deleted=0 GROUP BY due_date').all()).results;assert.equal(days.length,61);assert.ok(days.every(d=>d.n===5));report.checks.push('300 customers, 300 unique companion gardens, 305 correctly linked jobs and 5 per every calendar day');
 stage='pagination and calendar data';const customers=await paginate('/api/customers','customers'),allJobs=await paginate('/api/jobs?state=all&order=schedule','jobs');assert.equal(customers.rows.length,300);assert.equal(customers.pages,3);assert.equal(allJobs.rows.length,305);assert.equal(allJobs.pages,4);
 for(const [month,expected]of[['2026-11',150],['2026-12',155]]){const data=await call('/api/jobs?state=all&order=schedule&month='+month);assert.equal(data.calendar.days.reduce((n,v)=>n+v.count,0),expected);assert.ok(data.calendar.days.every(d=>d.count===5));}
 const own=await paginate('/api/jobs?state=all&order=schedule','jobs','worker');assert.equal(own.rows.length,122);await call('/api/jobs/volume-job-0002','worker','GET',undefined,404);await call('/api/jobs','outsider','GET',undefined,403);await call('/api/customers/denied-volume','reader','PUT',{version:0,name:'Forbidden'},403);
 report.checks.push('All pagination pages without duplicates; both calendars complete; worker sees exactly 122 assigned jobs; forbidden reads/writes rejected');
 stage='parallel API reads';console.log(stage);
 for(let round=0;round<10;round++)await Promise.all(['owner','worker','mate','third','reader'].map(user=>call('/api/jobs?state=all&order=schedule&month=2026-12&day=2026-12-15',user)));
 report.concurrentReadRequests=50;report.checks.push('50 reads in groups of 5 simultaneous users without server errors');
 stage='restart persistent test database';await mf.dispose();mf=runtime();db=await mf.getD1Database('DB');assert.equal((await db.prepare('SELECT COUNT(*) n FROM jobs WHERE deleted=0').first()).n,305);assert.equal((await call('/api/gardens')).gardens.length,300);report.checks.push('Counts and links survive actual Worker/runtime restart with isolated persisted D1/R2');
 stage='start loopback browser bridge';
 server=http.createServer(async(req,res)=>{try{
  const host='http://127.0.0.1:'+server.address().port,u=new URL(req.url,host);
  if(u.pathname==='/__qa/login'){const user=u.searchParams.get('user');assert.ok(people[user]);res.writeHead(302,{'set-cookie':'qa-person='+user+'; Path=/; SameSite=Lax',location:'/'});res.end();return;}
  const user=(req.headers.cookie||'').match(/qa-person=(\w+)/)?.[1],p=people[user],headers=new Headers(req.headers);headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');if(p){headers.set('oai-authenticated-user-id',p.id);headers.set('oai-authenticated-user-email',p.email);}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const response=await mf.dispatchFetch(u.href,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  if(response.status>=500)report.errors.push('HTTP '+response.status+' '+u.pathname);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){report.errors.push(e.message);res.writeHead(500);res.end('Isolated volume bridge error');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const desktop=await browser.newContext({viewport:{width:1440,height:960},locale:'cs-CZ'}),page=await desktop.newPage();currentPage=page;page.setDefaultTimeout(20000);
 const watch=p=>{p.on('pageerror',e=>report.errors.push(e.message));p.on('crash',()=>report.errors.push('Browser page crashed'));};watch(page);
 stage='desktop overview';await measure(page,'desktop cold overview',()=>page.goto(base+'/__qa/login?user=owner'),()=>page.locator('#overview [data-overview-job]').waitFor());if(await page.locator('[data-device-later]').count())await page.locator('[data-device-later]').click();
 stage='desktop customers';await measure(page,'desktop first 100 customers',()=>nav(page,'customers'),()=>page.locator('[data-customer-open]').nth(99).waitFor());
 for(const count of[200,300])await measure(page,'desktop customers to '+count,()=>page.locator('#customers-more').click(),()=>page.waitForFunction(n=>document.querySelectorAll('[data-customer-open]').length===n,count));assert.equal(new Set(await ids(page,'[data-customer-open]','customerOpen')).size,300);
 await measure(page,'desktop search customer 300',async()=>{await page.locator('#customers-query').fill('0300');await page.locator('#customers-search [type=submit]').click();},()=>page.waitForFunction(()=>document.querySelectorAll('[data-customer-open]').length===1));await page.locator('[data-customer-open=volume-customer-0300]').click();await page.locator('[data-customer-view]').waitFor();assert.match(await page.locator('#modal').innerText(),/Testovací zahrada 0300/);await page.locator('#modal [data-close]').click();
 stage='desktop gardens';await measure(page,'desktop 300 garden cards',()=>nav(page,'home'),()=>page.locator('.garden-card').nth(299).waitFor());await noOverflow(page);await page.screenshot({path:path.join(output,'desktop-gardens.png')});
 stage='desktop job pagination';await nav(page,'jobs');await idle(page);await page.locator('[data-jobs-view=list]').click();await idle(page);assert.equal(await page.locator('.job-card').count(),100);
 for(const count of[200,300,305])await measure(page,'desktop jobs to '+count,()=>page.locator('#jobs-more').click(),()=>page.waitForFunction(n=>document.querySelectorAll('.job-card').length===n,count));assert.equal(new Set(await ids(page,'.job-card','job')).size,305);
 stage='desktop calendar';await page.locator('[data-jobs-view=calendar]').click();await idle(page);
 for(const [month,expectedDays]of[['2026-11',30],['2026-12',31]]){
  await measure(page,'desktop calendar '+month,async()=>{await page.locator('#jobs-month').fill(month);await page.locator('#jobs-month').dispatchEvent('change');},async()=>{await idle(page);await page.locator('[data-jobs-day="'+month+'-01"] small').waitFor();});
  const badges=await page.locator('[data-jobs-day^="'+month+'-"] small').allTextContents();assert.equal(badges.length,expectedDays);assert.ok(badges.every(s=>s==='5'));
 }
 await page.locator('[data-jobs-day="2026-12-31"]').click();await idle(page);assert.equal(await page.locator('.job-card').count(),5);await page.screenshot({path:path.join(output,'desktop-calendar.png')});
 stage='desktop timeline';await measure(page,'desktop timeline 5 visits',()=>page.locator('[data-jobs-view=timeline]').click(),async()=>{await idle(page);await page.locator('#timeline-day').fill('2026-12-31');await page.locator('#timeline-day').dispatchEvent('change');await idle(page);});assert.equal(await page.locator('.jobs-timeline-event').count(),5);await noOverflow(page);await page.screenshot({path:path.join(output,'desktop-timeline.png')});
 stage='desktop workload';await page.locator('[data-jobs-view=workload]').click();await idle(page);await page.locator('#timeline-day').fill('2026-11-16');await page.locator('#timeline-day').dispatchEvent('change');await idle(page);assert.match(await page.locator('[data-workload-person=worker-id]').innerText(),/14 h 00 min/);assert.match(await page.locator('[data-workload-person=third-id]').innerText(),/7 h 00 min/);
 stage='mobile worker';const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'cs-CZ'}),w=await mobile.newPage();currentPage=w;watch(w);w.setDefaultTimeout(20000);
 await measure(w,'mobile cold overview',()=>w.goto(base+'/__qa/login?user=worker'),()=>w.locator('#overview [data-overview-job]').waitFor());if(await w.locator('[data-device-later]').count())await w.locator('[data-device-later]').click();await nav(w,'jobs');await idle(w);
 await measure(w,'mobile daily 2 own visits',async()=>{await w.locator('#jobs-daily-day').fill('2026-12-31');await w.locator('#jobs-daily-day').dispatchEvent('change');},()=>idle(w));assert.equal(await w.locator('.job-card').count(),2);assert.equal(await w.locator('[data-jobs-scope=team],[data-jobs-view=map]').count(),0);await noOverflow(w);await w.screenshot({path:path.join(output,'mobile-day.png')});
 await w.reload();await w.locator('#overview').waitFor();await nav(w,'jobs');await idle(w);await w.locator('#jobs-daily-day').fill('2026-12-31');await w.locator('#jobs-daily-day').dispatchEvent('change');await idle(w);assert.equal(await w.locator('.job-card').count(),2);
 stage='repeated mobile navigation';const cdp=await mobile.newCDPSession(w);const heapBefore=await cdp.send('Runtime.getHeapUsage');
 for(let i=0;i<10;i++){await nav(w,'overview');await w.locator('#overview').waitFor();await nav(w,'jobs');await idle(w);assert.equal(await w.locator('.job-card').count(),2);}
 const heapAfter=await cdp.send('Runtime.getHeapUsage');report.browserHeap={beforeBytes:heapBefore.usedSize,afterBytes:heapAfter.usedSize,note:'Chromium JS heap samples, not total device RAM or a proof of absence of leaks'};
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await measure(w,'mobile daily render with 4x CPU slowdown',async()=>{await nav(w,'overview');await w.locator('#overview').waitFor();await nav(w,'jobs');},()=>idle(w));await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await noOverflow(w);
 stage='mobile manager large lists';const phoneContext=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,locale:'cs-CZ'}),phone=await phoneContext.newPage();currentPage=phone;watch(phone);phone.setDefaultTimeout(20000);
 await measure(phone,'mobile manager cold overview',()=>phone.goto(base+'/__qa/login?user=owner'),()=>phone.locator('#overview [data-overview-job]').waitFor());if(await phone.locator('[data-device-later]').count())await phone.locator('[data-device-later]').click();
 const phoneCPU=await phoneContext.newCDPSession(phone);await phoneCPU.send('Emulation.setCPUThrottlingRate',{rate:4});
 await measure(phone,'mobile manager 300 gardens with 4x CPU slowdown',()=>nav(phone,'home'),()=>phone.locator('.garden-card').nth(299).waitFor());await noOverflow(phone);await phoneCPU.send('Emulation.setCPUThrottlingRate',{rate:1});
 await measure(phone,'mobile manager first 100 customers',()=>nav(phone,'customers'),()=>phone.locator('[data-customer-open]').nth(99).waitFor());for(const count of[200,300])await measure(phone,'mobile manager customers to '+count,()=>phone.locator('#customers-more').click(),()=>phone.waitForFunction(n=>document.querySelectorAll('[data-customer-open]').length===n,count));await noOverflow(phone);
 await measure(phone,'mobile manager search customer 300',async()=>{await phone.locator('#customers-query').fill('0300');await phone.locator('#customers-search [type=submit]').click();},()=>phone.waitForFunction(()=>document.querySelectorAll('[data-customer-open]').length===1));await phone.locator('[data-customer-open=volume-customer-0300]').click();await phone.locator('[data-customer-view]').waitFor();assert.match(await phone.locator('#modal').innerText(),/Testovací zahrada 0300/);await noOverflow(phone);await phone.screenshot({path:path.join(output,'mobile-customer-detail.png')});
 report.checks.push('Mobile manager 430px: all 300 garden cards at 4x CPU slowdown; customer pagination to 300, search and correct garden detail without overflow');
 report.checks.push('Browser: customer pagination to 300, search/detail at end, 300 gardens, job pagination to 305, both full month calendars, last day, timeline, 35-visit workload week, worker scope, reload and 10 navigation cycles; no horizontal overflow');
 stage='final counts';assert.equal((await db.prepare('SELECT COUNT(*) n FROM customers WHERE deleted=0').first()).n,300);assert.equal((await db.prepare('SELECT COUNT(*) n FROM gardens WHERE deleted=0').first()).n,300);assert.equal((await db.prepare('SELECT COUNT(*) n FROM jobs WHERE deleted=0').first()).n,305);assert.deepEqual(report.errors,[]);
 for(const [label,values]of Object.entries(timings))report.api[label]=summary(values);report.status='passed';report.completedAt=new Date().toISOString();await rm(path.join(output,'failure.png'),{force:true});console.log('PASS: isolated volume scenario, persistent real D1/R2 restart, API and desktop/mobile checks.');
}catch(e){report.status='failed';report.failedStage=stage;report.errors.push(e.stack||String(e));console.error('FAILED at '+stage+': '+e.message);if(currentPage)await currentPage.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{
 for(const [label,values]of Object.entries(timings))report.api[label]=summary(values);
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(mf)await mf.dispose();await rm(storage,{recursive:true,force:true});
 console.log('Report: '+path.join(output,'report.json'));console.log('Synthetic database and private storage removed.');
}
