import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {inspectWorkSchedule} from '../worker/planning.js';
import {handleTeamOffice} from '../worker/team-office.js';
import {DEFAULT_FEATURES} from '../web/features.js';
const ctx={waitUntil:p=>Promise.resolve(p).catch(()=>{})};
const call=(e,path,user=people.owner,method='GET',body,headers)=>api(request('/api/team-office'+path,user,method,body,headers),e,ctx);
async function ok(r){assert.equal(r.status,200,await r.clone().text());return r.json();}
async function setup(){const e=environment();await ok(await api(request('/api/me',people.owner),e,ctx));for(const role of ['admin','worker','reader']){await ok(await api(request('/api/invitations',people.owner,'POST',{email:people[role].email,role}),e,ctx));await ok(await api(request('/api/me',people[role]),e,ctx));}return e;}
const uuid=()=>crypto.randomUUID();
const leave=()=>({id:uuid(),operationId:uuid(),kind:'leave',type:'holiday',startAt:Date.parse('2026-12-01T07:00:00Z'),endAt:Date.parse('2026-12-01T11:00:00Z'),reason:'Soukromá informace'});
const purchase=()=>({id:uuid(),operationId:uuid(),kind:'purchase',title:'Ventily',quantity:4,unit:'ks',estimatedMinor:40000,category:'material',discipline:'irrigation'});
async function action(e,row,verb,user=people.owner,extra={}){return call(e,'/'+row.id+'/action',user,'POST',{action:verb,version:row.version,operationId:uuid(),...extra});}

test('Personal leave stays private, readers can submit their own leave, and only managers can approve',async()=>{
 const e=await setup(),input=leave();const r=(await ok(await call(e,'',people.worker,'POST',input))).record;
 assert.equal(r.ownerId,people.worker.id);assert.equal(r.status,'pending');
 assert.equal((await call(e,'/'+r.id,people.reader)).status,404);
 assert.equal((await call(e,'/summary',people.worker)).status,403);
 assert.equal((await call(e,'?kind=money',people.reader)).status,403);
 assert.equal((await action(e,r,'approve',people.worker)).status,403);
 assert.equal((await call(e,'?kind=leave',people.reader)).status,200);
 assert.equal((await ok(await call(e,'?kind=leave',people.reader))).records.length,0);
 const rr=(await ok(await call(e,'',people.reader,'POST',leave()))).record;
 assert.equal(rr.ownerId,people.reader.id);
 const approved=(await ok(await action(e,r,'approve',people.admin))).record;
 assert.equal(approved.status,'approved');
 const availability=await ok(await call(e,'/availability?from=2026-12-01&to=2026-12-02'));
 assert.equal(availability.absences.length,1);assert.equal(JSON.stringify(availability).includes('Soukromá informace'),false);
 assert.equal((await call(e,'/availability',people.worker)).status,403);
 assert.equal((await action(e,r,'reject',people.owner,{reason:'Stará verze'})).status,409);
 assert.equal((await call(e,'',people.worker,'POST',{...leave(),endAt:1})).status,400);
});

test('Purchase approval creates exactly one paid expense; a worker can neither approve nor read other purchases',async()=>{
 const e=await setup(),input=purchase();let row=(await ok(await call(e,'',people.worker,'POST',input))).record;
 assert.equal((await call(e,'',people.reader,'POST',purchase())).status,403);
 assert.equal((await action(e,row,'buy',people.worker,{actualMinor:42000,date:'2026-12-01'})).status,403);
 assert.equal((await call(e,'/'+row.id,people.reader)).status,404);
 assert.equal((await ok(await call(e,'',people.worker,'POST',input))).record.id,row.id);
 row=(await ok(await action(e,row,'approve'))).record;
 row=(await ok(await action(e,row,'submit_expense',people.worker,{actualMinor:42000,date:'2026-12-01',supplier:'Dodavatel'}))).record;
 assert.equal(row.status,'expense_pending');
 assert.equal((await ok(await call(e,'/summary?month=2026-12'))).expense,0);
 const payload={action:'buy',version:row.version,operationId:uuid()};
 row=(await ok(await call(e,'/'+row.id+'/action',people.owner,'POST',payload))).record;
 assert.equal(row.status,'bought');
 assert.equal((await ok(await call(e,'/'+row.id+'/action',people.owner,'POST',payload))).replayed,true);
 assert.equal(e.sqlite.prepare("SELECT count(*) n FROM office_records WHERE kind='money'").get().n,1);
 const summary=await ok(await call(e,'/summary?month=2026-12'));assert.equal(summary.expense,42000);assert.equal(summary.difference,-42000);assert.equal(summary.categories.material,42000);
 assert.equal((await call(e,'/'+('expense-'+row.id),people.worker)).status,403);
 assert.equal((await action(e,row,'buy',people.owner,{actualMinor:42000,date:'2026-12-01'})).status,409);
});

test('Expected money is separate from cash and becomes one payment in the actual payment month',async()=>{
 const e=await setup(),input={id:uuid(),operationId:uuid(),kind:'money',direction:'income',title:'Úhrada realizace',amountMinor:125050,status:'expected',date:'2026-11-30',discipline:'irrigation'};
 assert.equal((await call(e,'',people.worker,'POST',input)).status,403);
 let row=(await ok(await call(e,'',people.owner,'POST',input))).record;
 let s=await ok(await call(e,'/summary?month=2026-11'));assert.equal(s.income,0);assert.equal(s.expectedIncome,125050);
 row=(await ok(await action(e,row,'pay',people.owner,{date:'2026-12-02'}))).record;
 s=await ok(await call(e,'/summary?month=2026-11'));assert.equal(s.expectedIncome,0);
 s=await ok(await call(e,'/summary?month=2026-12'));assert.equal(s.income,125050);assert.equal(s.expectedIncome,0);
 await ok(await action(e,row,'void',people.owner,{reason:'Opravný záznam'}));assert.equal((await ok(await call(e,'/summary?month=2026-12'))).income,0);
 assert.equal((await call(e,'',people.owner,'POST',{...input,id:uuid(),operationId:uuid(),amountMinor:1.5})).status,400);
 assert.equal((await call(e,'/summary?month=2026-13')).status,400);
});

test('Receipts are validated and private and do not create a payment',async()=>{
 const e=await setup(),row=(await ok(await call(e,'',people.worker,'POST',purchase()))).record,file=uuid(),bytes=new Uint8Array([255,216,255,1,2,3]);
 const upload=()=>api(new Request('https://zavlahy.test/api/team-office/'+row.id+'/receipts/'+file,{method:'PUT',headers:{'content-type':'image/jpeg','x-file-name':encodeURIComponent('Účtenka.jpg'),'x-zavlahy-request':'1','oai-authenticated-user-id':people.worker.id,'oai-authenticated-user-email':people.worker.email},body:bytes}),e,ctx);
 await ok(await upload());assert.equal((await ok(await upload())).replayed,true);
 const detail=await ok(await call(e,'/'+row.id,people.worker));assert.equal(detail.receipts.length,1);
 const r=await call(e,'/'+row.id+'/receipt/'+file,people.worker);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment/);
 assert.equal((await call(e,'/'+row.id+'/receipt/'+file,people.reader)).status,404);
 assert.equal((await ok(await call(e,'/summary?month=2026-12'))).expense,0);
 const bad=await api(new Request('https://zavlahy.test/api/team-office/'+row.id+'/receipts/'+uuid(),{method:'PUT',headers:{'content-type':'image/jpeg','x-zavlahy-request':'1','oai-authenticated-user-id':people.worker.id,'oai-authenticated-user-email':people.worker.email},body:'<script>bad</script>'}),e,ctx);assert.equal(bad.status,400);
});

test('Approved absences appear in existing planner warnings without disclosing private reasons',async()=>{
 const e=await setup();const row=(await ok(await call(e,'',people.worker,'POST',leave()))).record;await ok(await action(e,row,'approve'));
 const result=await inspectWorkSchedule(e,[{id:'new-job',title:'Návštěva',dueDate:'2026-12-01',assignedTos:[people.worker.id],plannedStart:'08:00',estimatedMinutes:60,status:'planned'}]);
 assert.ok(result.warnings.some(w=>w.kind==='absence'&&w.userId===people.worker.id));assert.equal(JSON.stringify(result.warnings).includes('Soukromá informace'),false);
});

test('A leave approval reports assigned visits and requires acknowledgement without moving a job',async()=>{
 const e=await setup();
 await ok(await api(request('/api/jobs/office-conflict',people.owner,'PUT',{version:0,title:'Servis v den volna',status:'planned',assignedTo:people.worker.id,dueDate:'2026-12-01',plannedStart:'08:00',estimatedMinutes:60}),e,ctx));
 const row=(await ok(await call(e,'',people.worker,'POST',leave()))).record;
 const denied=await action(e,row,'approve');assert.equal(denied.status,409);const detail=await denied.json();assert.equal(detail.conflicts[0].id,'office-conflict');
 const after=e.sqlite.prepare('SELECT status,due_date FROM jobs WHERE id=?').get('office-conflict');assert.equal(after.status,'planned');assert.equal(after.due_date,'2026-12-01');
 await ok(await action(e,row,'approve',people.owner,{acknowledgeConflicts:true}));
 assert.equal(e.sqlite.prepare('SELECT due_date FROM jobs WHERE id=?').get('office-conflict').due_date,'2026-12-01');
});

test('Shared installations keep financial records in authorized disciplines; unknown users and role previews cannot read them',async()=>{
 const e=await setup(),s=e.sqlite,inst=s.prepare('SELECT instance_id FROM installation_state').get().instance_id;e.INSTALLATION_ID=inst;
 s.exec("INSERT INTO workspaces VALUES('pair','preparing',1,1,1)");
 s.prepare("INSERT INTO workspace_organizations VALUES('source-org','pair',?,'irrigation','Source')").run(inst);
 s.exec("INSERT INTO workspace_organizations VALUES('garden-org','pair','inst-office-garden','garden','Garden')");
 for(const role of ['owner','admin','worker','reader']){const p=s.prepare('SELECT * FROM members WHERE user_id=?').get(people[role].id);s.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,?, 'original')").run(inst,p.user_id,p.user_id,p.role,p.email,p.name,people.owner.id,1);s.prepare("INSERT INTO workspace_member_grants VALUES(?,'source-org',?)").run(p.user_id,p.role);s.prepare("INSERT INTO member_disciplines VALUES(?,'irrigation')").run(p.user_id);}
 for(const org of ['source-org','garden-org'])s.prepare('INSERT INTO workspace_organization_policies VALUES(?,1,?,1,?,20,?)').run(org,Date.now()+86400000,JSON.stringify(DEFAULT_FEATURES),Date.now());s.exec("UPDATE workspaces SET state='active'");
 const base={kind:'money',direction:'income',title:'Platba',amountMinor:10000,date:'2026-12-01',status:'paid'};
 for(const discipline of ['irrigation','garden'])await ok(await call(e,'',people.owner,'POST',{...base,id:uuid(),operationId:uuid(),discipline},{'x-work-discipline':'all'}));
 assert.equal((await ok(await call(e,'/summary?month=2026-12',people.owner,'GET',undefined,{'x-work-discipline':'irrigation'}))).income,10000);
 assert.equal((await ok(await call(e,'/summary?month=2026-12',people.owner,'GET',undefined,{'x-work-discipline':'all'}))).income,20000);
 assert.equal((await call(e,'',people.worker,'POST',{...purchase(),discipline:'garden'},{'x-work-discipline':'all'})).status,400);
 assert.equal((await call(e,'/options',people.outsider)).status,403);
 assert.equal((await call(e,'/summary',people.owner,'GET',undefined,{'x-work-diary-preview-role':'reader'})).status,403);
 // The handler must still reject an actor with no allowed discipline, even if called directly.
 const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
 const r=await handleTeamOffice(new Request('https://local/api/team-office/summary?month=2026-12'),e,{user_id:people.admin.id,role:'admin',_workspace:{disciplines:[],selectedDiscipline:'all'}},{fail,json:v=>Response.json(v)});
 assert.equal((await r.json()).income,0);
});

test('The deployable worker includes the office route and all new tables',async()=>{
 const {readFileSync}=await import('node:fs');const source=readFileSync('dist/server/index.js','utf8');const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 const e=await setup(),row=(await ok(await worker.fetch(request('/api/team-office',people.worker,'POST',leave()),e,ctx))).record;
 assert.equal(row.status,'pending');assert.equal((await worker.fetch(request('/api/team-office/summary',people.worker),e,ctx)).status,403);
});

test('Reusing another record operation cannot skip the audit trail or create a second expense',async()=>{
 const e=await setup(),input=purchase();const first=(await ok(await call(e,'',people.worker,'POST',input))).record;
 const duplicate=await call(e,'',people.worker,'POST',{...purchase(),operationId:input.operationId});assert.equal(duplicate.status,409);
 const second=(await ok(await call(e,'',people.worker,'POST',purchase()))).record;
 assert.equal((await action(e,second,'approve',people.owner,{operationId:input.operationId})).status,409);
 assert.equal(e.sqlite.prepare('SELECT status FROM office_records WHERE id=?').get(second.id).status,'proposed');
 assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM office_events WHERE record_id=?').get(first.id).n,1);
 assert.equal(e.sqlite.prepare("SELECT COUNT(*) n FROM office_records WHERE kind='money'").get().n,0);
});
