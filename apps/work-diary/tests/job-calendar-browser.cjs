const {nav,jobAction}=require('./browser-nav.cjs');
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const desktop=await browser.newContext({viewport:{width:1440,height:1000}}),mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),owner=await desktop.newPage(),worker=await mobile.newPage(),errors=[];
  for(const p of [owner,worker]){p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());}
  const base='http://127.0.0.1:5187';await owner.goto(base+'/__qa/login?user=owner');await nav(owner,'attendance');await owner.locator('#attendance-arrival').waitFor();
  await owner.evaluate(async()=>{const r=await fetch('/api/invitations',{method:'POST',headers:{'content-type':'application/json','x-zavlahy-request':'1'},body:JSON.stringify({email:'worker@example.com',role:'worker'})});if(!r.ok)throw Error('invite');});
  await worker.goto(base+'/__qa/login?user=worker');await nav(worker,'attendance');await worker.locator('#attendance-arrival').waitFor();
  const fixture=await owner.evaluate(async()=>{
   const model=await import('/job-schedule.js?v=workspace-v59'),today=model.pragueToday(),month=today.slice(0,7),day=month+'-16',nextDay=month+'-17',nextMonth=model.moveJobMonth(month,1);
   const jobs=[['late','Odpolední návštěva',day,'13:00','16:00','worker-id'],['early','Ranní návštěva',day,'08:15','10:00','worker-id'],['untimed','Návštěva bez času',day,'','','worker-id'],['tomorrow','Další den',nextDay,'09:00','11:00','worker-id'],['undated','Dosud nenaplánováno','','','','worker-id'],['private','Soukromá zakázka správce',day,'10:00','11:00','owner-id'],['next-month','Návštěva příští měsíc',nextMonth+'-01','08:00','09:00','worker-id']];
   for(const [id,title,dueDate,startTime,endTime,assignedTo]of jobs){const r=await fetch('/api/jobs/calendar-'+id,{method:'PUT',headers:{'content-type':'application/json','x-zavlahy-request':'1'},body:JSON.stringify({version:0,title,dueDate,startTime,endTime,assignedTo,customerName:'Zákazník '+id,description:'Zazimování a servis.',address:'Testovací 1',gardenId:null,status:'planned',incompleteReason:''})});if(!r.ok)throw Error('job '+id+': '+await r.text());}
   return {month,day,nextDay,nextMonth};
  });
  const ids=page=>page.locator('.job-card').evaluateAll(cards=>cards.map(c=>c.dataset.job));
  const waitIdle=page=>page.waitForFunction(()=>!document.querySelector('#jobs-refresh')?.disabled);
  await owner.locator('[data-page=jobs]').click();await owner.locator('.job-card').first().waitFor();await waitIdle(owner);
  assert.deepEqual(await ids(owner),['calendar-early','calendar-private','calendar-late','calendar-untimed','calendar-tomorrow','calendar-undated']);
  assert.equal(await owner.locator(`[data-jobs-day="${fixture.day}"] small`).textContent(),'4');
  await owner.locator(`[data-jobs-day="${fixture.day}"]`).click();await waitIdle(owner);assert.equal(await owner.locator('.job-card').count(),4);
  await owner.locator('#jobs-assignee').selectOption('worker-id');await waitIdle(owner);assert.deepEqual(await ids(owner),['calendar-early','calendar-late','calendar-untimed']);
  await jobAction(owner,'edit','[data-job-open=calendar-late]');await owner.locator('#job-start-time').fill('07:00');await owner.locator('#job-end-time').fill('08:00');await owner.getByRole('button',{name:'Uložit zakázku',exact:true}).click();await owner.getByText('Zakázka byla uložena a přiřazena kolegovi.',{exact:true}).waitFor();await waitIdle(owner);
  assert.equal((await ids(owner))[0],'calendar-late');assert.equal(await owner.locator('[data-job=calendar-late] .job-time').count(),0);
  await owner.locator('[data-job-open=calendar-late]').click();await owner.locator('[data-panel-full]').click();await owner.locator('[data-jobs-dialog]').waitFor();assert.match(await owner.locator('[data-jobs-dialog]').textContent(),/07:00–08:00/);await owner.locator('#modal [data-close]').click();
  await owner.screenshot({path:'.qa/job-calendar-desktop.png',fullPage:true});
  await worker.locator('[data-page=jobs]').click();await worker.locator('.job-card').first().waitFor();await waitIdle(worker);
  assert.equal(await worker.getByText('Soukromá zakázka správce',{exact:true}).count(),0);assert.equal(await worker.locator(`[data-jobs-day="${fixture.day}"] small`).textContent(),'3');
  await worker.locator(`[data-jobs-day="${fixture.day}"]`).click();await waitIdle(worker);assert.deepEqual(await ids(worker),['calendar-late','calendar-early','calendar-untimed']);
  assert.equal(await worker.locator('[data-job-edit],#jobs-new,#jobs-assignee').count(),0);assert.ok(await worker.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await worker.screenshot({path:'.qa/job-calendar-mobile.png',fullPage:true});
  await worker.locator('[data-jobs-day=undated]').click();await waitIdle(worker);assert.deepEqual(await ids(worker),['calendar-undated']);
  await worker.locator('#jobs-next-month').click();await waitIdle(worker);assert.equal(await worker.locator('#jobs-month').inputValue(),fixture.nextMonth);assert.deepEqual(await ids(worker),['calendar-next-month','calendar-undated']);
  await worker.locator('[data-jobs-view=list]').click();await waitIdle(worker);assert.equal(await worker.locator('.jobs-calendar').count(),0);assert.equal(await worker.locator('.job-card').count(),6);assert.equal((await ids(worker)).at(-1),'calendar-undated');
  await worker.reload();await nav(worker,'attendance');await worker.locator('#attendance-arrival').waitFor();await worker.locator('[data-page=jobs]').click();await worker.locator('.job-card').first().waitFor();assert.equal(await worker.locator('[data-jobs-view=list]').getAttribute('aria-pressed'),'true');
  await worker.locator('[data-jobs-view=calendar]').click();await waitIdle(worker);await worker.locator('#jobs-today').click();await waitIdle(worker);const today=await worker.evaluate(async()=>(await import('/job-schedule.js?v=workspace-v59')).pragueToday());assert.equal(await worker.locator(`[data-jobs-day="${today}"]`).getAttribute('aria-pressed'),'true');
  await mobile.setOffline(true);await worker.getByText('Zakázky zobrazíte s připojením k internetu.',{exact:false}).waitFor();assert.equal(await worker.locator('.job-card,.jobs-calendar-day small').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: month/day calendar, chronological visits and edits, mobile layout, own-only counts, undated visits, month navigation, list preference, Czech today and offline privacy.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
