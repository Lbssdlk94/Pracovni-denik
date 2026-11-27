import {protocolBilling} from './protocol-billing.js';
import {officeOne,officeAll,officeManager,officeToday,officeDate,officeMoney,officeScope,officeDiscipline,officeJob} from './team-office.js';
const ofBody=async(request,max,h)=>{const value=await h.body(request,max);if(!value||typeof value!=='object'||Array.isArray(value))h.fail(400,'Zkontrolujte finanční formulář.');return value;};
const ofTypes=['contract','bill','advance','recurring'];
const ofData=row=>JSON.parse(row.data);
const ofDTO=row=>({id:row.id,kind:row.kind,beneficiaryId:row.beneficiary_id,beneficiaryName:row.beneficiary_name||'',discipline:row.discipline,jobId:row.job_id,jobTitle:row.job_title||'',status:row.status,data:ofData(row),version:row.version,createdAt:row.created_at});
function ofMonth(value,fail){if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))fail(400,'Vyberte platný měsíc.');return value;}
function ofDue(month,day){const [y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();return `${month}-${String(Math.min(last,day)).padStart(2,'0')}`;}
async function ofRead(env,m,id,fail){const s=officeScope(m);const r=await officeOne(env,'SELECT r.* FROM office_finance r WHERE r.id=? AND '+s.sql,id,...s.args);if(!r)fail(404,'Finanční záznam není dostupný.');return r;}
function ofEvent(env,row,m,op,action,before=null){return env.DB.prepare('INSERT INTO office_finance_events(id,record_id,actor_id,action,before_data,after_data,at) SELECT ?,id,?,?,?,?,? FROM office_finance WHERE id=? AND operation_id=? AND NOT EXISTS(SELECT 1 FROM office_finance_events WHERE id=?)').bind(op,m.user_id,action,before,JSON.stringify({status:row.status,data:ofData(row)}),Date.now(),row.id,op,op);}
async function ofInsert(env,m,row,op,fail){
 const now=Date.now();try{await env.DB.batch([
  env.DB.prepare('INSERT INTO office_finance(id,kind,owner_id,beneficiary_id,discipline,job_id,status,data,version,operation_id,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,1,?,?,? WHERE NOT EXISTS(SELECT 1 FROM office_finance WHERE id=?) AND NOT EXISTS(SELECT 1 FROM office_finance_events WHERE id=?)').bind(row.id,row.kind,m.user_id,row.beneficiary_id,row.discipline,row.job_id,row.status,row.data,op,now,now,row.id,op),
  ofEvent(env,row,m,op,'created')
 ]);}catch(e){if(/UNIQUE constraint/i.test(e.message||''))fail(409,'Tato zakázka už má finanční kartu nebo existuje doklad stejné protistrany se stejnou referencí.');throw e;}
 const r=await ofRead(env,m,row.id,fail);if(r.operation_id!==op||r.kind!==row.kind||r.owner_id!==m.user_id||r.data!==row.data||r.discipline!==row.discipline||r.job_id!==row.job_id||r.beneficiary_id!==row.beneficiary_id)fail(409,'Záznam nebo operace už existuje s jinými údaji.');return r;
}
async function ofUpdate(env,m,row,next,status,b,action,fail,extra=[]){
 const op=b.operationId;if(row.operation_id===op)return row;if(row.version!==b.version)fail(409,'Finanční záznam mezitím změnil kolega. Obnovte přehled.');
 const changed={...row,status,data:JSON.stringify(next)};const results=await env.DB.batch([
  env.DB.prepare('UPDATE office_finance SET data=?,status=?,version=version+1,operation_id=?,updated_at=? WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM office_finance_events WHERE id=?)').bind(changed.data,status,op,Date.now(),row.id,row.version,op),
  ofEvent(env,changed,m,op,action,JSON.stringify({status:row.status,data:ofData(row)})),...extra
 ]);if(!results[0].meta.changes)fail(409,'Finanční záznam se změnil. Nic nebylo přepsáno.');return ofRead(env,m,row.id,fail);
}
async function ofInvoiceJob(env,m,id,fail){
 const scope=officeScope(m),job=await officeOne(env,'SELECT r.* FROM jobs r WHERE r.id=? AND r.deleted=0 AND '+scope.sql,id,...scope.args);
 if(!job)fail(404,'Zakázka není dostupná.');
 const discipline=await officeDiscipline(env,m,{discipline:job.discipline||'irrigation'},fail);await officeJob(env,m,id,discipline,fail);return {...job,discipline};
}
function ofInvoiceMetadata(input,reference,fail,cleanText){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Doplňte datum vystavení faktury.');
 const number=cleanText(reference||'',100,true),currency=input.currency||'CZK';if(currency!=='CZK')fail(400,'Evidence podporuje Kč. Cizí měnu nelze uložit jako korunovou částku.');const variableSymbol=cleanText(input.variableSymbol||'',10);if(variableSymbol&&!/^\d{1,10}$/.test(variableSymbol))fail(400,'Variabilní symbol musí obsahovat nejvýše 10 číslic.');return {number,issuedOn:officeDate(input.issuedOn,fail),currency,variableSymbol,bankAccount:cleanText(input.bankAccount||'',100),supplierName:cleanText(input.supplierName||'',200),customerName:cleanText(input.customerName||'',200)};
}
function ofExpectedBill(row){const d=ofData(row);return Math.max(0,d.amountMinor-d.paidMinor);}
function ofLedgerInsert(env,m,row,op,amount,date){
 const d=ofData(row),value=JSON.stringify({title:d.title,direction:d.direction,amountMinor:amount,date,category:d.category||'other',reference:d.reference||'',financeId:row.id,counterparty:d.counterparty});
 return env.DB.prepare("INSERT INTO office_records(id,kind,owner_id,discipline,job_id,status,data,version,created_at,updated_at,updated_by,operation_id) SELECT ?,'money',?,?,?,'paid',?,1,?,?,?,? WHERE EXISTS(SELECT 1 FROM office_finance WHERE id=? AND operation_id=?)").bind('fin-'+op,m.user_id,row.discipline,row.job_id,value,Date.now(),Date.now(),m.user_id,op,row.id,op);
}
export async function handleOfficeFinance(request,env,m,h){
 const {fail,json,body,validId,cleanText}=h,url=new URL(request.url),path=url.pathname,method=request.method,manager=officeManager(m);
 if(request.headers.get('x-work-diary-preview-role'))fail(403,'Finance nejsou dostupné v náhledu role.');
 // Staff access is restricted to their own advance summaries; no finance SQL or ledger is sent.
 if(!manager){
  if(method!=='GET'||path!=='/api/office-finance'||url.searchParams.get('view')!=='advances'||m.role==='reader')fail(403,'Finance spravuje správce a vyšší role.');
  const ws={...m,role:'admin'},s=officeScope(ws);const items=await officeAll(env,"SELECT r.*,p.name beneficiary_name FROM office_finance r JOIN members p ON p.user_id=r.beneficiary_id WHERE r.kind='advance' AND r.beneficiary_id=? AND "+s.sql+' ORDER BY r.created_at DESC',m.user_id,...s.args);const pendingExpenses=await officeAll(env,"SELECT r.id,r.data,r.status FROM office_records r WHERE r.kind='purchase' AND r.status='expense_pending' AND r.owner_id=? AND json_extract(r.data,'$.advanceId') IS NOT NULL AND "+s.sql,m.user_id,...s.args);return json({manager:false,items:items.map(ofDTO),pendingExpenses:pendingExpenses.map(r=>({id:r.id,...ofData(r)}))});
 }
 const s=officeScope(m);
 if(path==='/api/office-finance/job-invoices'&&method==='GET'){
  const job=await ofInvoiceJob(env,m,validId(url.searchParams.get('jobId')),fail);
  const items=await officeAll(env,"SELECT r.* FROM office_finance r WHERE r.kind='bill' AND r.job_id=? AND "+s.sql+' ORDER BY r.created_at DESC',job.id,...s.args);
  const billing=await protocolBilling(env,job);return json({company:billing.company,job:{id:job.id,title:job.title,discipline:job.discipline,customerName:job.customer_name||''},items:items.map(ofDTO)});
 }
 const invoiceFile=path.match(/^\/api\/office-finance\/([-\w]{1,100})\/invoice-file(?:\/([-\w]{1,100}))?$/);
 if(invoiceFile){
  const row=await ofRead(env,m,invoiceFile[1],fail),d=ofData(row);if(row.kind!=='bill'||!row.job_id||!d.invoice)fail(404,'Faktura není dostupná.');
  if(method==='GET'&&!invoiceFile[2]){
   const file=d.invoiceFile;if(!file)fail(404,'PDF faktury zatím není přiložené.');const object=await env.BUCKET.get(file.objectKey);if(!object)fail(404,'Soubor faktury není dostupný.');
   return new Response(object.body,{headers:{'content-type':'application/pdf','content-disposition':"attachment; filename=\"faktura.pdf\"; filename*=UTF-8''"+encodeURIComponent(file.name).replace(/'/g,'%27'),'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  if(method!=='PUT'||!invoiceFile[2])fail(405,'Nepodporovaná operace.');if(row.status==='void')fail(409,'Ke stornované faktuře nelze přidat PDF.');
  await ofInvoiceJob(env,m,row.job_id,fail);const fileId=validId(invoiceFile[2]),bytes=await h.boundedBytes(request,4*1024*1024);
  if((request.headers.get('content-type')||'').split(';')[0]!=='application/pdf'||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')fail(400,'Přiložte PDF faktury, nejvýše 4 MB.');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(d.invoiceFile){if(d.invoiceFile.id===fileId&&d.invoiceFile.digest===digest)return json({item:ofDTO(row),replayed:true});fail(409,'Faktura již má přiložené PDF. Původní soubor se nepřepisuje.');}
  const version=Number(request.headers.get('if-match'));if(version!==row.version)fail(409,'Faktura se změnila. Obnovte ji před nahráním PDF.');
  let name=request.headers.get('x-file-name')||'faktura.pdf';try{name=decodeURIComponent(name);}catch{}name=cleanText(name,160).replace(/[\r\n"\\/]/g,'_')||'faktura.pdf';
  const objectKey='office-invoices/'+row.id+'/'+fileId+'/'+digest;await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:'application/pdf'}});
  const next={...d,invoiceFile:{id:fileId,objectKey,name,size:bytes.length,digest,uploadedAt:Date.now()}};
  return json({item:ofDTO(await ofUpdate(env,m,row,next,row.status,{version,operationId:'invoice-'+fileId},'invoice_file',fail))});
 }
 if(path==='/api/office-finance'&&method==='GET'){
  const month=ofMonth(url.searchParams.get('month')||officeToday().slice(0,7),fail);
  const items=(await officeAll(env,'SELECT r.*,p.name beneficiary_name,j.title job_title FROM office_finance r LEFT JOIN members p ON p.user_id=r.beneficiary_id LEFT JOIN jobs j ON j.id=r.job_id WHERE '+s.sql+' ORDER BY r.created_at DESC',...s.args)).map(ofDTO);
  const ledger=await officeAll(env,"SELECT r.*,p.name owner_name FROM office_records r LEFT JOIN members p ON p.user_id=r.owner_id WHERE r.kind='money' AND r.status<>'void' AND "+s.sql,...s.args);
  const purchases=await officeAll(env,"SELECT r.id,r.owner_id,r.data,r.job_id,r.discipline,p.name owner_name,a.advance_id FROM office_records r JOIN members p ON p.user_id=r.owner_id LEFT JOIN office_advance_purchases a ON a.purchase_id=r.id WHERE r.kind='purchase' AND r.status='bought' AND "+s.sql,...s.args);
  const bills=items.filter(r=>r.kind==='bill'&&r.status!=='void'),contracts=items.filter(r=>r.kind==='contract'&&r.status!=='void');
  const records=ledger.map(r=>({id:r.id,status:r.status,jobId:r.job_id,discipline:r.discipline,ownerName:r.owner_name,data:ofData(r)}));
  const monthly={},byDiscipline={};for(const r of records){const d=r.data,key=d.date?.slice(0,7);if(r.status!=='paid'||!key)continue;monthly[key]??={income:0,expense:0};monthly[key][d.direction]+=d.amountMinor;if(key===month){byDiscipline[r.discipline]??={income:0,expense:0};byDiscipline[r.discipline][d.direction]+=d.amountMinor;}}
  let receivables=0,payables=0,overdue=0;const forecast={};
  const forecastAdd=(date,direction,amount)=>{if(!date||!amount)return;const key=date.slice(0,7);forecast[key]??={income:0,expense:0};forecast[key][direction]+=amount;};
  for(const r of bills){const d=r.data,remaining=Math.max(0,d.amountMinor-d.paidMinor);if(d.direction==='income')receivables+=remaining;else payables+=remaining;if(d.dueDate<officeToday())overdue+=remaining;forecastAdd(d.dueDate,d.direction,remaining);}
  for(const r of records.filter(r=>r.status==='expected'&&!r.data.financeId)){if(r.data.direction==='income')receivables+=r.data.amountMinor;else payables+=r.data.amountMinor;forecastAdd(r.data.date,r.data.direction,r.data.amountMinor);}
  const jobResults=contracts.map(r=>{const d=r.data,paid=records.filter(p=>p.jobId===r.jobId&&p.status==='paid'),income=paid.filter(p=>p.data.direction==='income').reduce((n,p)=>n+p.data.amountMinor,0),expense=paid.filter(p=>p.data.direction==='expense').reduce((n,p)=>n+p.data.amountMinor,0),extras=(d.extras||[]).reduce((n,p)=>n+p.amountMinor,0),price=d.priceMinor+extras,outstanding=bills.filter(b=>b.jobId===r.jobId&&b.data.direction==='income').reduce((n,b)=>n+Math.max(0,b.data.amountMinor-b.data.paidMinor),0);return {id:r.id,jobId:r.jobId,title:r.jobTitle,priceMinor:price,extrasMinor:extras,paidMinor:income,costMinor:expense,remainingMinor:Math.max(0,price-income),unbilledMinor:Math.max(0,price-income-outstanding),overpaidMinor:Math.max(0,income-price),budgetMinor:d.budgetMinor??null,overBudget:d.budgetMinor!=null&&expense>d.budgetMinor,cashDifference:income-expense};});
  const jobScope=officeScope(m,'j'),protocolJobs=(await officeAll(env,"SELECT j.id jobId,j.title,j.discipline,p.document_state protocolState,p.date protocolDate,p.updated_at protocolUpdatedAt,m.name protocolAuthor FROM jobs j JOIN service_reports p ON p.job_id=j.id LEFT JOIN members m ON m.user_id=p.updated_by WHERE j.deleted=0 AND "+jobScope.sql+' ORDER BY p.updated_at DESC',...jobScope.args)).filter(j=>!contracts.some(c=>c.jobId===j.jobId));
  // Future template occurrences are a forecast only. Generating a bill replaces that occurrence.
  const start=new Date(month+'-01T00:00:00Z');for(let i=0;i<3;i++){const date=new Date(start);date.setUTCMonth(date.getUTCMonth()+i);const mk=date.toISOString().slice(0,7);for(const r of items.filter(r=>r.kind==='recurring'&&r.status==='active')){const d=r.data;if(mk<d.startMonth||d.endMonth&&mk>d.endMonth||bills.some(b=>b.data.templateId===r.id&&b.data.period===mk))continue;forecastAdd(ofDue(mk,d.day),d.direction,d.amountMinor);}}
  return json({manager:true,month,items,records,purchases:purchases.map(r=>({...r,data:ofData(r)})),report:{receivables,payables,overdue,monthly,byDiscipline,forecast,jobResults,protocolJobs},notice:'Rozpočty porovnávají pouze evidované zaplacené náklady. Zbývající materiál, práce a doprava mohou být neúplné. Předpověď není zůstatek bankovního účtu.'});
 }
 if(path==='/api/office-finance/export'&&method==='GET'){
  const month=ofMonth(url.searchParams.get('month')||officeToday().slice(0,7),fail);
  const records=await officeAll(env,"SELECT r.*,j.title job_title FROM office_records r LEFT JOIN jobs j ON j.id=r.job_id WHERE r.kind='money' AND r.status<>'void' AND substr(json_extract(r.data,'$.date'),1,7)=? AND "+s.sql+' ORDER BY json_extract(r.data,\'$.date\'),r.id',month,...s.args);
  const receipts=[];const seen=new Set();for(const r of records){const purchaseId=ofData(r).purchaseId;if(!purchaseId||seen.has(purchaseId))continue;seen.add(purchaseId);for(const f of await officeAll(env,'SELECT id,name,size FROM office_receipts WHERE record_id=?',purchaseId))receipts.push({...f,path:'/api/team-office/'+purchaseId+'/receipt/'+f.id});}
  const bills=await officeAll(env,"SELECT r.*,j.title job_title FROM office_finance r LEFT JOIN jobs j ON j.id=r.job_id WHERE r.kind='bill' AND r.status='open' AND substr(json_extract(r.data,'$.dueDate'),1,7)=? AND "+s.sql,month,...s.args);
  const invoiceBills=await officeAll(env,"SELECT r.id,r.data FROM office_finance r WHERE r.kind='bill' AND json_extract(r.data,'$.invoiceFile.objectKey') IS NOT NULL AND "+s.sql,...s.args);
  for(const r of invoiceBills){if(!bills.some(b=>b.id===r.id)&&!records.some(p=>ofData(p).financeId===r.id))continue;const f=ofData(r).invoiceFile;receipts.push({id:f.id,name:f.name,size:f.size,path:'/api/office-finance/'+r.id+'/invoice-file'});}
  return json({month,bills:bills.map(r=>({id:r.id,status:'expected',jobTitle:r.job_title||'',discipline:r.discipline,...ofData(r),date:ofData(r).dueDate,amountMinor:ofExpectedBill(r)})),records:records.map(r=>({id:r.id,status:r.status,jobTitle:r.job_title||'',discipline:r.discipline,...ofData(r)})),receipts});
 }
 if(path==='/api/office-finance/prepare-month'&&method==='POST'){
  const b=await ofBody(request,10000,h),month=ofMonth(b.month,fail),op=validId(b.operationId);let created=0;
  const templates=await officeAll(env,"SELECT r.* FROM office_finance r WHERE r.kind='recurring' AND r.status='active' AND "+s.sql,...s.args);
  for(const r of templates){const d=ofData(r);if(month<d.startMonth||d.endMonth&&month>d.endMonth)continue;const id='rec-'+r.id+'-'+month;if(await officeOne(env,'SELECT id FROM office_finance WHERE id=?',id))continue;
   const data={...d,paidMinor:0,dueDate:ofDue(month,d.day),templateId:r.id,period:month,reference:(d.reference||r.id)+' / '+month};delete data.day;delete data.startMonth;delete data.endMonth;
   await ofInsert(env,m,{id,kind:'bill',beneficiary_id:null,discipline:r.discipline,job_id:r.job_id,status:'open',data:JSON.stringify(data)},op+'-'+r.id,fail);created++;
  }return json({created});
 }
 if(path==='/api/office-finance'&&method==='POST'){
  const b=await ofBody(request,16000,h),kind=b.kind,id=validId(b.id),op=validId(b.operationId);if(id.length>60||op.length>60||!ofTypes.includes(kind))fail(400,'Neplatný finanční záznam.');
  const discipline=await officeDiscipline(env,m,b,fail),jobId=b.jobId?validId(b.jobId):null;await officeJob(env,m,jobId,discipline,fail);const data={title:cleanText(b.title||'',200,true),note:cleanText(b.note||'',2000)};let beneficiary=null,status='active';
  if(kind==='contract'){if(!jobId)fail(400,'Finanční karta musí patřit konkrétní zakázce.');data.priceMinor=officeMoney(b.priceMinor,fail);data.depositMinor=b.depositMinor?officeMoney(b.depositMinor,fail):0;if(data.depositMinor>data.priceMinor)fail(400,'Záloha nesmí převyšovat celkovou cenu.');data.depositDue=b.depositDue?officeDate(b.depositDue,fail):'';data.budgetMinor=b.budgetMinor==null?null:officeMoney(b.budgetMinor,fail);data.extras=[];}
  if(kind==='bill'||kind==='recurring'){
   if(!['income','expense'].includes(b.direction))fail(400,'Vyberte pohledávku nebo závazek.');data.direction=b.direction;data.amountMinor=officeMoney(b.amountMinor,fail);data.counterparty=cleanText(b.counterparty||'',200,true);data.reference=cleanText(b.reference||'',100);data.category=['material','vehicles','tools','services','wages','other'].includes(b.category)?b.category:'other';
   if(kind==='bill'){data.dueDate=officeDate(b.dueDate,fail);data.paidMinor=0;status='open';if(b.invoice!==undefined){if(!jobId)fail(400,'Faktura musí patřit konkrétní zakázce.');data.invoice=ofInvoiceMetadata(b.invoice,data.reference,fail,cleanText);data.reference=data.invoice.number;}}
   else{data.day=Number(b.day);if(!Number.isInteger(data.day)||data.day<1||data.day>31)fail(400,'Den splatnosti musí být 1 až 31.');data.startMonth=ofMonth(b.startMonth,fail);data.endMonth=b.endMonth?ofMonth(b.endMonth,fail):'';if(data.endMonth&&data.endMonth<data.startMonth)fail(400,'Konec opakování nesmí být před začátkem.');}
  }
  if(kind==='advance'){
   beneficiary=validId(b.beneficiaryId);const user=await officeOne(env,"SELECT user_id FROM members WHERE user_id=? AND role IN ('owner','administrator','admin','worker')",beneficiary);if(!user)fail(400,'Vyberte pracovníka týmu.');
   if(m._workspace&&!await officeOne(env,'SELECT 1 ok FROM member_disciplines WHERE user_id=? AND discipline=?',beneficiary,discipline)&&!await officeOne(env,"SELECT 1 ok FROM members WHERE user_id=? AND role IN ('owner','administrator','admin')",beneficiary))fail(403,'Pracovník nepatří do vybraného oboru.');
   data.givenMinor=officeMoney(b.amountMinor,fail);data.spentMinor=0;data.returnedMinor=0;data.date=officeDate(b.date||officeToday(),fail);
  }
  return json({item:ofDTO(await ofInsert(env,m,{id,kind,beneficiary_id:beneficiary,discipline,job_id:jobId,status,data:JSON.stringify(data)},op,fail))});
 }
 const match=path.match(/^\/api\/office-finance\/([-\w]{1,100})(?:\/(action))?$/);if(!match)fail(404,'Nenalezeno.');const row=await ofRead(env,m,match[1],fail),d=ofData(row);
 if(method==='GET'&&!match[2])return json({item:ofDTO(row),history:await officeAll(env,'SELECT e.action,e.at,e.before_data,e.after_data,m.name FROM office_finance_events e LEFT JOIN members m ON m.user_id=e.actor_id WHERE record_id=? ORDER BY at',row.id)});
 if(method!=='POST'||match[2]!=='action')fail(405,'Nepodporovaná operace.');const b=await ofBody(request,16000,h);validId(b.operationId);if(b.operationId.length>60)fail(400,'Neplatná operace.');if(row.operation_id===b.operationId)return json({item:ofDTO(row),replayed:true});const next={...d},extra=[];let status=row.status;if(status==='void')fail(409,'Záznam je stornovaný.');
 if(row.kind==='bill'){
  if(b.action==='invoice'){if(!row.job_id)fail(400,'Faktura musí patřit konkrétní zakázce.');await ofInvoiceJob(env,m,row.job_id,fail);if(d.invoice)fail(409,'Tento doklad už má přiřazenou fakturu.');next.invoice=ofInvoiceMetadata(b.invoice,b.reference,fail,cleanText);next.reference=next.invoice.number;}
  else if(b.action==='pay'){
   if(row.status==='settled')fail(409,'Doklad je již uhrazený.');let amount,date;
   if(b.paymentId){
    const p=await officeOne(env,"SELECT r.* FROM office_records r WHERE r.id=? AND r.kind='money' AND r.status='paid' AND "+s.sql,b.paymentId,...s.args);if(!p)fail(404,'Platba není dostupná.');const pd=ofData(p);if(pd.financeId||pd.direction!==d.direction||p.discipline!==row.discipline||row.job_id&&p.job_id!==row.job_id)fail(409,'Platba už je přiřazená nebo neodpovídá oboru, zakázce či směru dokladu.');amount=pd.amountMinor;date=pd.date;
    extra.push(env.DB.prepare('UPDATE office_records SET data=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND json_extract(data,\'$.financeId\') IS NULL AND EXISTS(SELECT 1 FROM office_finance WHERE id=? AND operation_id=?)').bind(JSON.stringify({...pd,financeId:row.id}),Date.now(),m.user_id,p.id,p.version,row.id,b.operationId));
    // Abort atomically if another bill attached this payment after it was read.
    extra.push(env.DB.prepare("INSERT INTO office_finance_events(id,record_id,actor_id,action,after_data,at) SELECT ?,NULL,?,'conflict','{}',? WHERE EXISTS(SELECT 1 FROM office_finance WHERE id=? AND operation_id=?) AND NOT EXISTS(SELECT 1 FROM office_records WHERE id=? AND json_extract(data,'$.financeId')=?)").bind('guard-'+b.operationId,m.user_id,Date.now(),row.id,b.operationId,p.id,row.id));
   }else{amount=officeMoney(b.amountMinor,fail);date=officeDate(b.date,fail);extra.push(ofLedgerInsert(env,m,row,b.operationId,amount,date));}
   if(amount>ofExpectedBill(row))fail(400,'Úhrada převyšuje zbývající částku. Přiřazení musí odpovídat celé uložené platbě.');next.paidMinor=d.paidMinor+amount;status=next.paidMinor===d.amountMinor?'settled':'open';
  }else if(b.action==='void'&&d.paidMinor===0){status='void';next.reason=cleanText(b.reason||'',1000,true);}else fail(409,'Uhrazený doklad nelze stornovat bez samostatné opravy plateb.');
 }else if(row.kind==='contract'){
  if(b.action==='price'){next.priceMinor=officeMoney(b.amountMinor,fail);if(next.priceMinor<d.depositMinor)fail(400,'Celková cena nesmí být nižší než sjednaná záloha.');next.priceReason=cleanText(b.reason||'',1000,true);}
  else if(b.action==='extra'){next.extras=[...(d.extras||[]),{amountMinor:officeMoney(b.amountMinor,fail),reason:cleanText(b.reason||'',1000,true),at:Date.now(),by:m.user_id}];}
  else if(b.action==='budget'){next.budgetMinor=b.amountMinor==null?null:officeMoney(b.amountMinor,fail);next.budgetReason=cleanText(b.reason||'',1000,true);}
  else fail(400,'Neplatná změna finanční karty.');
 }else if(row.kind==='advance'){
  if(row.status==='closed')fail(409,'Vyúčtování zálohy je uzavřené.');
  if(b.action==='allocate'){
   const p=await officeOne(env,"SELECT r.* FROM office_records r WHERE r.id=? AND r.kind='purchase' AND r.status='bought' AND "+s.sql,b.purchaseId,...s.args);if(!p||p.owner_id!==row.beneficiary_id||p.discipline!==row.discipline)fail(403,'Přiřadit lze schválený nákup daného pracovníka ve stejném oboru.');if(await officeOne(env,'SELECT 1 ok FROM office_advance_purchases WHERE purchase_id=?',p.id))fail(409,'Nákup už je přiřazený k záloze.');const amount=officeMoney(ofData(p).actualMinor,fail);next.spentMinor=d.spentMinor+amount;
   extra.push(env.DB.prepare('INSERT INTO office_advance_purchases(purchase_id,advance_id,amount_minor,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM office_finance WHERE id=? AND operation_id=?)').bind(p.id,row.id,amount,Date.now(),row.id,b.operationId));
  }else if(b.action==='give'){next.givenMinor=d.givenMinor+officeMoney(b.amountMinor,fail);next.lastReason=cleanText(b.reason||'',1000,true);}
  else if(b.action==='return'){const amount=officeMoney(b.amountMinor,fail);if(amount>d.givenMinor-d.spentMinor-d.returnedMinor)fail(400,'Vratka přesahuje nevyčerpané prostředky.');next.returnedMinor=d.returnedMinor+amount;next.lastReason=cleanText(b.reason||'',1000,true);}
  else if(b.action==='close'){if(d.givenMinor-d.spentMinor-d.returnedMinor!==0)fail(400,'Nejprve vyrovnejte vratku nebo doplatek pracovníkovi.');status='closed';}
  else fail(400,'Neplatná změna zálohy.');
 }else if(row.kind==='recurring'){
  if(b.action==='pause'&&status==='active')status='paused';else if(b.action==='resume'&&status==='paused')status='active';else fail(409,'Tato změna opakování není dostupná.');
 }
 try{return json({item:ofDTO(await ofUpdate(env,m,row,next,status,b,b.action,fail,extra))});}catch(e){if(/UNIQUE constraint|NOT NULL constraint/i.test(e.message||''))fail(409,b.action==='invoice'?'Faktura s tímto číslem a protistranou už je evidovaná. Vyberte původní doklad.':'Platba nebo nákup byly mezitím přiřazeny jinam. Nic se nepřepsalo.');throw e;}
}
