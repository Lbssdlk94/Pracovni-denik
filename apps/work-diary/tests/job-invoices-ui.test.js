import test from 'node:test';import assert from 'node:assert/strict';import {jobInvoiceRows,mountJobInvoices} from '../web/job-invoices-ui.js';
const esc=v=>String(v??'').replaceAll('<','&lt;').replaceAll('"','&quot;');
test('Invoice cards distinguish partial payments, issued/received invoices and missing PDFs',()=>{
 const data={invoice:{number:'FV <script>',issuedOn:'2026-12-01'},direction:'income',counterparty:'Novák',amountMinor:100000,paidMinor:20000,dueDate:'2026-12-15'};
 const html=jobInvoiceRows([{id:'bill',status:'open',data}],esc);assert.match(html,/Částečně uhrazeno/);assert.match(html,/Vydaná faktura/);assert.match(html,/FV &lt;script>/);assert.match(html,/data-invoice-upload="bill"/);assert.doesNotMatch(html,/data-invoice-download/);
 const attached=jobInvoiceRows([{id:'bill',status:'settled',data:{...data,direction:'expense',invoiceFile:{name:'invoice.pdf'}}}],esc);assert.match(attached,/Uhrazeno/);assert.match(attached,/Přijatá faktura/);assert.match(attached,/data-invoice-download="bill"/);
});
test('Staff and role previews cannot mount invoice UI or fetch financial records',()=>{
 for(const session of [{user:{role:'worker'},permissions:{manage:false}},{user:{role:'owner'},permissions:{manage:true},rolePreview:{active:true}}]){let cleared=false;mountJobInvoices({isConnected:true,replaceChildren(){cleared=true;}},{job:{id:'j'},db:{request(){throw Error('Must not fetch');}},getSession:()=>session,esc});assert.equal(cleared,true);}
});

test('A late invoice response cannot paint financial data after an account or role change',async()=>{
 let session={user:{id:'owner',role:'owner'},permissions:{manage:true}},resolve;
 const root={isConnected:true,innerHTML:'',replaceChildren(){this.innerHTML='';},querySelector(){return {};},querySelectorAll(){return [];}};
 mountJobInvoices(root,{job:{id:'j'},db:{request:()=>new Promise(done=>{resolve=done;})},getSession:()=>session,esc});
 session={user:{id:'reader',role:'reader'},permissions:{manage:false}};resolve({items:[{id:'private',data:{invoice:{number:'PRIVATE'}}}]});await new Promise(done=>setImmediate(done));assert.equal(root.innerHTML,'');
});
