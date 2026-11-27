import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {handleOfficeFinance} from '../worker/office-finance.js';
import {DEFAULT_FEATURES} from '../web/features.js';
const ctx={waitUntil:p=>Promise.resolve(p).catch(()=>{})},uuid=()=>crypto.randomUUID();
const call=(e,path='',user=people.owner,method='GET',body,headers)=>api(request('/api/office-finance'+path,user,method,body,headers),e,ctx);
const office=(e,path='',user=people.owner,method='GET',body)=>api(request('/api/team-office'+path,user,method,body),e,ctx);
async function ok(r){assert.equal(r.status,200,await r.clone().text());return r.json();}
async function setup(){const e=environment();await ok(await api(request('/api/me',people.owner),e,ctx));for(const role of ['worker','reader','admin']){await ok(await api(request('/api/invitations',people.owner,'POST',{email:people[role].email,role}),e,ctx));await ok(await api(request('/api/me',people[role]),e,ctx));}return e;}
const bill=(extra={})=>({id:uuid(),operationId:uuid(),kind:'bill',discipline:'irrigation',title:'Doplatek',direction:'income',amountMinor:100000,counterparty:'Jan Novák',reference:uuid(),dueDate:'2026-12-10',...extra});
const action=(e,row,name,extra={})=>call(e,'/'+row.id+'/action',people.owner,'POST',{operationId:uuid(),version:row.version,action:name,...extra});

test('Partial payments, replay and assignment of existing money cannot count the same payment twice',async()=>{
 const e=await setup();let row=(await ok(await call(e,'',people.owner,'POST',bill()))).item;
 const payload={operationId:uuid(),version:row.version,action:'pay',amountMinor:30000,date:'2026-12-01'};
 row=(await ok(await call(e,'/'+row.id+'/action',people.admin,'POST',payload))).item;assert.equal(row.data.paidMinor,30000);
 assert.equal((await ok(await call(e,'/'+row.id+'/action',people.admin,'POST',payload))).replayed,true);
 let totals=await ok(await office(e,'/summary?month=2026-12'));assert.equal(totals.income,30000);
 const report=await ok(await call(e,'?month=2026-12'));assert.equal(report.report.receivables,70000);
 assert.equal((await action(e,row,'pay',{amountMinor:70001,date:'2026-12-01'})).status,400);
 const payment=(await ok(await office(e,'',people.owner,'POST',{id:uuid(),operationId:uuid(),kind:'money',title:'Uložená platba',direction:'income',amountMinor:70000,status:'paid',date:'2026-12-02',discipline:'irrigation'}))).record;
 row=(await ok(await action(e,row,'pay',{paymentId:payment.id}))).item;assert.equal(row.status,'settled');
 totals=await ok(await office(e,'/summary?month=2026-12'));assert.equal(totals.income,100000);
 const other=(await ok(await call(e,'',people.owner,'POST',bill()))).item;assert.equal((await action(e,other,'pay',{paymentId:payment.id})).status,409);
 const linked=await ok(await office(e,'?kind=money&month=2026-12'));assert.equal(linked.records.length,2);
 assert.equal((await office(e,'/'+payment.id+'/action',people.owner,'POST',{operationId:uuid(),version:2,action:'void',reason:'Nechci propojení'})).status,400);
});

test('Recurring templates prepare once per month, clamp month-end and do not invent an actual payment',async()=>{
 const e=await setup();await ok(await call(e,'',people.owner,'POST',{id:uuid(),operationId:uuid(),kind:'recurring',title:'Nájem skladu',discipline:'irrigation',direction:'expense',amountMinor:150000,counterparty:'Pronajímatel',reference:'Nájem',day:31,startMonth:'2026-11'}));
 const prepare=()=>call(e,'/prepare-month',people.owner,'POST',{month:'2027-02',operationId:uuid()});assert.equal((await ok(await prepare())).created,1);assert.equal((await ok(await prepare())).created,0);
 const data=await ok(await call(e,'?month=2027-02'));const generated=data.items.find(r=>r.kind==='bill');assert.equal(generated.data.dueDate,'2027-02-28');assert.equal(data.report.payables,150000);assert.equal(data.report.forecast['2027-02'].expense,150000);
 assert.equal((await ok(await office(e,'/summary?month=2027-02'))).expense,0);
});

test('Employee advances settle already approved purchases without another cost and workers see only their own advances',async()=>{
 const e=await setup();let advance=(await ok(await call(e,'',people.owner,'POST',{id:uuid(),operationId:uuid(),kind:'advance',discipline:'irrigation',title:'Materiál na servis',beneficiaryId:people.worker.id,amountMinor:10000,date:'2026-12-01'}))).item;
 assert.equal((await call(e)).status,200);assert.equal((await call(e,'',people.worker)).status,403);assert.equal((await call(e,'?view=advances',people.reader)).status,403);
 const own=await ok(await call(e,'?view=advances',people.worker));assert.equal(own.items.length,1);assert.equal(own.records,undefined);assert.equal(own.report,undefined);
 let purchase=(await ok(await office(e,'',people.worker,'POST',{id:uuid(),operationId:uuid(),kind:'purchase',title:'Ventily',discipline:'irrigation',quantity:2,unit:'ks'}))).record;
 const pa=(r,a,extra={})=>office(e,'/'+r.id+'/action',people.owner,'POST',{operationId:uuid(),version:r.version,action:a,...extra});purchase=(await ok(await pa(purchase,'approve'))).record;purchase=(await ok(await pa(purchase,'buy',{actualMinor:12000,date:'2026-12-01'}))).record;
 advance=(await ok(await action(e,advance,'allocate',{purchaseId:purchase.id}))).item;assert.equal(advance.data.spentMinor,12000);assert.equal(advance.data.givenMinor-advance.data.spentMinor,-2000);
 assert.equal((await action(e,advance,'close')).status,400);advance=(await ok(await action(e,advance,'give',{amountMinor:2000,reason:'Doplaceno pracovníkovi'}))).item;advance=(await ok(await action(e,advance,'close'))).item;assert.equal(advance.status,'closed');
 assert.equal((await ok(await office(e,'/summary?month=2026-12'))).expense,12000);
 assert.equal((await call(e,'/'+advance.id,people.worker)).status,403);
});

test('Job finance derives deposits and outstanding balance from existing income; approved extra work and budget are audited',async()=>{
 const e=await setup();await ok(await api(request('/api/jobs/finance-job',people.owner,'PUT',{version:0,title:'Realizace Novák',status:'planned',jobType:'installation',assignedTo:people.worker.id}),e,ctx));
 let card=(await ok(await call(e,'',people.owner,'POST',{id:uuid(),operationId:uuid(),kind:'contract',title:'Cena realizace',discipline:'irrigation',jobId:'finance-job',priceMinor:800000,depositMinor:300000,budgetMinor:500000}))).item;
 await ok(await office(e,'',people.owner,'POST',{id:uuid(),operationId:uuid(),kind:'money',title:'Přijatá záloha',direction:'income',amountMinor:300000,status:'paid',date:'2026-12-01',discipline:'irrigation',jobId:'finance-job'}));
 card=(await ok(await action(e,card,'extra',{amountMinor:100000,reason:'Rozšíření o sekci'}))).item;
 const data=await ok(await call(e,'?month=2026-12'));const result=data.report.jobResults[0];assert.equal(result.priceMinor,900000);assert.equal(result.paidMinor,300000);assert.equal(result.remainingMinor,600000);assert.equal(result.budgetMinor,500000);
 assert.equal((await call(e,'/'+card.id,people.reader)).status,403);
 const data2=await ok(await call(e,'/'+card.id));assert.equal(data2.history.length,2);
 card=(await ok(await action(e,card,'price',{amountMinor:750000,reason:'Upravená dohoda se zákazníkem'}))).item;const changed=await ok(await call(e,'?month=2026-12'));assert.equal(changed.report.jobResults[0].priceMinor,850000);assert.equal(changed.report.jobResults[0].paidMinor,300000);
 const input=bill({reference:'STEJNY-1'});await ok(await call(e,'',people.owner,'POST',input));assert.equal((await call(e,'',people.owner,'POST',{...input,id:uuid(),operationId:uuid()})).status,409);
});

test('Finance export and mutations require a manager; invalid dates, negative money and stale versions are rejected',async()=>{
 const e=await setup();assert.equal((await call(e,'/export?month=2026-12',people.worker)).status,403);assert.equal((await call(e,'/export',null)).status,401);
 assert.equal((await call(e,'',people.reader,'POST',bill())).status,403);assert.equal((await call(e,'',people.owner,'POST',bill({amountMinor:-100}))).status,400);assert.equal((await call(e,'',people.owner,'POST',bill({dueDate:'2026-02-31'}))).status,400);
 let row=(await ok(await call(e,'',people.owner,'POST',bill()))).item;const old=row;row=(await ok(await action(e,row,'pay',{amountMinor:100,date:'2026-12-01'}))).item;assert.equal((await action(e,old,'pay',{amountMinor:100,date:'2026-12-01'})).status,409);
 const data=await ok(await call(e,'/export?month=2026-12'));assert.equal(data.records.length,1);assert.equal(data.records[0].amountMinor,100);assert.equal(data.receipts.length,0);
});

test('A purchase cannot settle two advances and returns cannot exceed the actual balance',async()=>{
 const e=await setup(),newAdvance=()=>call(e,'',people.owner,'POST',{id:uuid(),operationId:uuid(),kind:'advance',discipline:'irrigation',title:'Nákup',beneficiaryId:people.worker.id,amountMinor:50000,date:'2026-12-01'});
 let first=(await ok(await newAdvance())).item;const other=(await ok(await newAdvance())).item;
 assert.equal((await action(e,first,'return',{amountMinor:50001,reason:'Vratka'})).status,400);
 first=(await ok(await action(e,first,'return',{amountMinor:20000,reason:'Vráceno v hotovosti'}))).item;
 assert.equal(first.data.returnedMinor,20000);
 let p=(await ok(await office(e,'',people.worker,'POST',{id:uuid(),operationId:uuid(),kind:'purchase',title:'Díl',discipline:'irrigation',quantity:1,unit:'ks'}))).record;
 p=(await ok(await office(e,'/'+p.id+'/action',people.owner,'POST',{operationId:uuid(),version:p.version,action:'approve'}))).record;
 p=(await ok(await office(e,'/'+p.id+'/action',people.owner,'POST',{operationId:uuid(),version:p.version,action:'buy',actualMinor:30000,date:'2026-12-01'}))).record;
 first=(await ok(await action(e,first,'allocate',{purchaseId:p.id}))).item;
 assert.equal((await action(e,other,'allocate',{purchaseId:p.id})).status,409);
 assert.equal(e.sqlite.prepare('SELECT count(*) n FROM office_advance_purchases').get().n,1);
 assert.equal((await ok(await action(e,first,'close'))).item.status,'closed');
});

test('Shared workspace finance and export keep the selected discipline and deny role previews',async()=>{
 const e=await setup(),s=e.sqlite,inst=s.prepare('SELECT instance_id FROM installation_state').get().instance_id;e.INSTALLATION_ID=inst;
 s.exec("INSERT INTO workspaces VALUES('pair','preparing',1,1,1)");s.prepare("INSERT INTO workspace_organizations VALUES('source-org','pair',?,'irrigation','Source')").run(inst);s.exec("INSERT INTO workspace_organizations VALUES('garden-org','pair','inst-finance-garden','garden','Garden')");
 const p=s.prepare('SELECT * FROM members WHERE user_id=?').get(people.owner.id);s.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,?, 'original')").run(inst,p.user_id,p.user_id,p.role,p.email,p.name,p.user_id,1);s.prepare("INSERT INTO workspace_member_grants VALUES(?,'source-org','owner')").run(p.user_id);s.prepare("INSERT INTO member_disciplines VALUES(?,'irrigation')").run(p.user_id);
 for(const org of ['source-org','garden-org'])s.prepare('INSERT INTO workspace_organization_policies VALUES(?,1,?,1,?,20,?)').run(org,Date.now()+86400000,JSON.stringify(DEFAULT_FEATURES),Date.now());s.exec("UPDATE workspaces SET state='active'");
 let garden;
 for(const discipline of ['garden','irrigation']){const r=(await ok(await call(e,'',people.owner,'POST',bill({discipline}),{'x-work-discipline':'all'}))).item;if(discipline==='garden')garden=r;}
 const only=await ok(await call(e,'?month=2026-12',people.owner,'GET',undefined,{'x-work-discipline':'irrigation'}));assert.equal(only.items.length,1);assert.equal(only.items[0].discipline,'irrigation');
 assert.equal((await call(e,'/'+garden.id,people.owner,'GET',undefined,{'x-work-discipline':'irrigation'})).status,404);
 assert.equal((await call(e,'',people.owner,'GET',undefined,{'x-work-diary-preview-role':'reader'})).status,403);
 const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
 const direct=await handleOfficeFinance(new Request('https://test/api/office-finance'),e,{role:'admin',user_id:p.user_id,_workspace:{disciplines:['irrigation'],selectedDiscipline:'irrigation'}},{fail,json:v=>Response.json(v)});assert.equal((await direct.json()).items.every(r=>r.discipline==='irrigation'),true);
});

test('The actual compiled Worker can create and settle a financial document with the new migration',async()=>{
 const {readFileSync}=await import('node:fs');const source=readFileSync('dist/server/index.js','utf8'),worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default,e=await setup();
 const row=(await ok(await worker.fetch(request('/api/office-finance',people.owner,'POST',bill()),e,ctx))).item;
 await ok(await worker.fetch(request('/api/office-finance/'+row.id+'/action',people.owner,'POST',{operationId:uuid(),version:row.version,action:'pay',amountMinor:100000,date:'2026-12-01'}),e,ctx));
 const data=await ok(await worker.fetch(request('/api/office-finance?month=2026-12',people.owner),e,ctx));assert.equal(data.report.receivables,0);assert.equal(data.report.monthly['2026-12'].income,100000);
 assert.equal((await worker.fetch(request('/api/office-finance',people.worker),e,ctx)).status,403);
});

test('Workers report their own advance expenses; manager approval records cost and settlement exactly once',async()=>{
 const e=await setup();const advance=(await ok(await call(e,'',people.owner,'POST',{id:uuid(),operationId:uuid(),kind:'advance',discipline:'irrigation',title:'Na nákup',beneficiaryId:people.worker.id,amountMinor:100000,date:'2026-12-01'}))).item;
 const payload={id:uuid(),operationId:uuid(),advanceId:advance.id,title:'Benzín a díly',actualMinor:25000,date:'2026-12-02',supplier:'Prodejna',category:'material',ownerId:people.owner.id,status:'bought'};
 assert.equal((await office(e,'/report-expense',people.reader,'POST',payload)).status,403);
 assert.equal((await office(e,'/report-expense',people.admin,'POST',payload)).status,403);
 let p=(await ok(await office(e,'/report-expense',people.worker,'POST',payload))).record;assert.equal(p.status,'expense_pending');assert.equal(p.ownerId,people.worker.id);assert.equal(p.data.actualMinor,25000);
 await ok(await office(e,'/report-expense',people.worker,'POST',payload));
 assert.equal((await ok(await office(e,'/summary?month=2026-12'))).expense,0);
 let own=await ok(await call(e,'?view=advances',people.worker));assert.equal(own.items[0].data.spentMinor,0);assert.equal(own.pendingExpenses.length,1);
 const approval={operationId:uuid(),version:p.version,action:'buy',actualMinor:25000,date:'2026-12-02'};
 assert.equal((await office(e,'/'+p.id+'/action',people.worker,'POST',approval)).status,403);
 p=(await ok(await office(e,'/'+p.id+'/action',people.owner,'POST',approval))).record;
 await ok(await office(e,'/'+p.id+'/action',people.owner,'POST',approval));
 own=await ok(await call(e,'?view=advances',people.worker));assert.equal(own.items[0].data.spentMinor,25000);assert.equal(own.pendingExpenses.length,0);
 assert.equal((await ok(await office(e,'/summary?month=2026-12'))).expense,25000);
 assert.equal(e.sqlite.prepare('SELECT count(*) n FROM office_advance_purchases').get().n,1);
 assert.equal(e.sqlite.prepare("SELECT count(*) n FROM office_finance_events WHERE action='allocate'").get().n,1);
});

test('Rejected expenses and expenses against closed or foreign advances cannot spend entrusted funds',async()=>{
 const e=await setup(),create=beneficiaryId=>call(e,'',people.owner,'POST',{id:uuid(),operationId:uuid(),kind:'advance',discipline:'irrigation',title:'Záloha',beneficiaryId,amountMinor:10000,date:'2026-12-01'});
 const foreign=(await ok(await create(people.admin.id))).item;
 const payload=advanceId=>({id:uuid(),operationId:uuid(),advanceId,title:'Díly',actualMinor:1000,date:'2026-12-02'});
 assert.equal((await office(e,'/report-expense',people.worker,'POST',payload(foreign.id))).status,403);
 let advance=(await ok(await create(people.worker.id))).item;
 let p=(await ok(await office(e,'/report-expense',people.worker,'POST',payload(advance.id)))).record;
 await ok(await office(e,'/'+p.id+'/action',people.owner,'POST',{operationId:uuid(),version:p.version,action:'reject',reason:'Nesprávný doklad'}));
 assert.equal((await ok(await call(e,'?view=advances',people.worker))).items[0].data.spentMinor,0);
 advance=(await ok(await action(e,advance,'return',{amountMinor:10000,reason:'Vráceno'}))).item;
 advance=(await ok(await action(e,advance,'close'))).item;
 assert.equal((await office(e,'/report-expense',people.worker,'POST',payload(advance.id))).status,403);
 assert.equal((await ok(await office(e,'/summary?month=2026-12'))).expense,0);
});
