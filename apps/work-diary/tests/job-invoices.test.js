import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
const ctx={waitUntil:p=>Promise.resolve(p).catch(()=>{})},uuid=()=>crypto.randomUUID();
const call=(e,path,user=people.owner,method='GET',body,headers)=>api(request(path,user,method,body,headers),e,ctx);
const finance=(e,path='',user=people.owner,method='GET',body,headers)=>call(e,'/api/office-finance'+path,user,method,body,headers);
async function ok(r){assert.equal(r.status,200,await r.clone().text());return r.json();}
async function setup(){const e=environment();await ok(await call(e,'/api/me'));for(const role of ['worker','reader','admin']){await ok(await call(e,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await ok(await call(e,'/api/me',people[role]));}await ok(await call(e,'/api/jobs/invoice-job',people.owner,'PUT',{version:0,title:'Realizace Novák',status:'planned',jobType:'installation',assignedTo:people.worker.id}));return e;}
const input=(extra={})=>({id:uuid(),operationId:uuid(),kind:'bill',discipline:'irrigation',jobId:'invoice-job',title:'Faktura',direction:'income',amountMinor:100000,counterparty:'Novák',reference:uuid(),dueDate:'2026-12-15',invoice:{issuedOn:'2026-12-01'},...extra});
const pdf=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
function upload(e,row,fileId=uuid(),extra={}){const r=request('/api/office-finance/'+row.id+'/invoice-file/'+fileId,extra.user||people.owner,'PUT');return api(new Request(r,{headers:{...Object.fromEntries(r.headers),'content-type':extra.mime||'application/pdf','if-match':String(extra.version??row.version),'x-file-name':encodeURIComponent('Faktura Novák.pdf')},body:extra.bytes||pdf}),e,ctx);}

test('One job invoice and private PDF are visible in both job and finance views without recording a payment',async()=>{
 const e=await setup(),payload=input();let row=(await ok(await finance(e,'',people.owner,'POST',payload))).item;const fileId=uuid();row=(await ok(await upload(e,row,fileId))).item;assert.equal(row.data.invoice.number,payload.reference);
 assert.equal((await ok(await upload(e,row,fileId))).replayed,true);
 const job=await ok(await finance(e,'/job-invoices?jobId=invoice-job'));assert.equal(job.items.length,1);assert.equal(job.items[0].id,row.id);assert.equal(job.items[0].data.invoiceFile.id,fileId);
 const all=await ok(await finance(e,'?month=2026-12'));assert.equal(all.items[0].id,row.id);assert.equal(all.report.receivables,100000);assert.equal(all.records.length,0);
 const download=await finance(e,'/'+row.id+'/invoice-file');assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'application/pdf');assert.equal(download.headers.get('cache-control'),'private, no-store');assert.deepEqual(new Uint8Array(await download.arrayBuffer()),pdf);
 for(const user of [people.worker,people.reader]){assert.equal((await finance(e,'/job-invoices?jobId=invoice-job',user)).status,403);assert.equal((await finance(e,'/'+row.id+'/invoice-file',user)).status,403);assert.equal((await upload(e,row,uuid(),{user})).status,403);}
 assert.equal((await finance(e,'/'+row.id+'/invoice-file',people.owner,'GET',undefined,{'x-work-diary-preview-role':'worker'})).status,403);
 assert.equal((await finance(e,'/'+row.id+'/invoice-file',null)).status,401);
});

test('Attaching an invoice to an existing partially paid bill preserves the one receivable and one payment, and exports its PDF once',async()=>{
 const e=await setup();let row=(await ok(await finance(e,'',people.owner,'POST',input({invoice:undefined,reference:''})))).item;
 row=(await ok(await finance(e,'/'+row.id+'/action',people.owner,'POST',{operationId:uuid(),version:row.version,action:'pay',amountMinor:20000,date:'2026-12-02'}))).item;
 const body={operationId:uuid(),version:row.version,action:'invoice',reference:'FV-2026-001',invoice:{issuedOn:'2026-12-01'}};
 row=(await ok(await finance(e,'/'+row.id+'/action',people.admin,'POST',body))).item;assert.equal(row.data.paidMinor,20000);assert.equal((await ok(await finance(e,'/'+row.id+'/action',people.admin,'POST',body))).replayed,true);
 row=(await ok(await upload(e,row))).item;const all=await ok(await finance(e,'?month=2026-12'));assert.equal(all.items.length,1);assert.equal(all.report.receivables,80000);assert.equal(all.records.length,1);assert.equal(all.report.monthly['2026-12'].income,20000);
 const exported=await ok(await finance(e,'/export?month=2026-12'));assert.equal(exported.receipts.length,1);assert.equal(exported.receipts[0].path,'/api/office-finance/'+row.id+'/invoice-file');
 assert.equal(e.sqlite.prepare("SELECT count(*) n FROM office_finance_events WHERE action='invoice'").get().n,1);assert.equal(e.sqlite.prepare("SELECT count(*) n FROM office_finance_events WHERE action='invoice_file'").get().n,1);
});

test('Invalid PDFs, stale uploads, duplicate references and invoice metadata without a job are rejected',async()=>{
 const e=await setup();assert.equal((await finance(e,'',people.owner,'POST',input({jobId:null}))).status,400);assert.equal((await finance(e,'',people.owner,'POST',input({invoice:{issuedOn:'2026-02-30'}}))).status,400);
 const payload=input({reference:'FV-DUPLICATE'});let row=(await ok(await finance(e,'',people.owner,'POST',payload))).item;
 assert.equal((await finance(e,'',people.owner,'POST',{...payload,id:uuid(),operationId:uuid()})).status,409);
 assert.equal((await upload(e,row,uuid(),{bytes:new TextEncoder().encode('<html>fake</html>')})).status,400);
 assert.equal((await upload(e,row,uuid(),{version:row.version+1})).status,409);
 assert.equal((await upload(e,row,uuid(),{bytes:new Uint8Array(4*1024*1024+1)})).status,413);
 assert.equal(e.objects.size,0);const fileId=uuid();row=(await ok(await upload(e,row,fileId))).item;
 assert.equal((await upload(e,row,fileId,{bytes:new TextEncoder().encode('%PDF-Changed')})).status,409);
 const stored=await finance(e,'/'+row.id+'/invoice-file');assert.deepEqual(new Uint8Array(await stored.arrayBuffer()),pdf);
});

test('The compiled production Worker accepts and serves the private invoice PDF and includes the shared invoice UI',async()=>{
 const {readFileSync}=await import('node:fs'),source=readFileSync('dist/server/index.js','utf8'),worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default,e=await setup();
 const row=(await ok(await worker.fetch(request('/api/office-finance',people.owner,'POST',input()),e,ctx))).item;
 const uploadRequest=request('/api/office-finance/'+row.id+'/invoice-file/compiled-invoice-pdf',people.owner,'PUT');
 await ok(await worker.fetch(new Request(uploadRequest,{headers:{...Object.fromEntries(uploadRequest.headers),'content-type':'application/pdf','if-match':String(row.version)},body:pdf}),e,ctx));
 const file=await worker.fetch(request('/api/office-finance/'+row.id+'/invoice-file',people.owner),e,ctx);assert.equal(file.status,200);assert.deepEqual(new Uint8Array(await file.arrayBuffer()),pdf);
 const asset=await worker.fetch(new Request('https://test/job-invoices-ui.js?v=job-invoices-v1'),e,ctx);assert.equal(asset.status,200);assert.match(await asset.text(),/mountJobInvoices/);
});

test('Reviewed extraction metadata persists without paid status and foreign currency cannot be booked as CZK',async()=>{
 const e=await setup();await ok(await call(e,'/api/invoice-company',people.owner,'PUT',{version:0,company:{name:'Dr. Závlaha',companyId:'87654321'}}));const view=await ok(await finance(e,'/job-invoices?jobId=invoice-job'));assert.equal(view.company.companyId,'87654321');
 const invoice={issuedOn:'2026-12-01',currency:'CZK',variableSymbol:'2026001',bankAccount:'123456/0100',supplierName:'Dodavatel',customerName:'Dr. Závlaha'};
 const row=(await ok(await finance(e,'',people.owner,'POST',input({invoice})))).item;assert.equal(row.data.invoice.variableSymbol,'2026001');assert.equal(row.data.invoice.bankAccount,'123456/0100');assert.equal(row.data.paidMinor,0);assert.equal(row.status,'open');
 assert.equal((await finance(e,'',people.owner,'POST',input({invoice:{...invoice,currency:'EUR'}}))).status,400);assert.equal((await finance(e,'',people.owner,'POST',input({invoice:{...invoice,variableSymbol:'ABC'}}))).status,400);
});
