import {subOne} from './subscriptions.js';
export function validateBilling(value,cleanText){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Zkontrolujte fakturační údaje.');
 return {name:cleanText(value.name??'',160),address:cleanText(value.address??'',500),companyId:cleanText(value.companyId??'',40),taxId:cleanText(value.taxId??'',40),email:cleanText(value.email??'',254),phone:cleanText(value.phone??'',60),bankAccount:cleanText(value.bankAccount??'',100)};
}
export async function protocolBilling(env,job){
 const company=await subOne(env.DB,"SELECT value FROM settings WHERE key='invoice-company'"),customer=job.customer_id?await subOne(env.DB,'SELECT * FROM customers WHERE id=? AND deleted=0',job.customer_id):null,b=customer?JSON.parse(customer.billing):{},addresses=customer?JSON.parse(customer.addresses):[],a=addresses[0],phones=customer?JSON.parse(customer.phones):[];
 return {company:company?JSON.parse(company.value):{},customer:{...b,name:b.name||customer?.name||job.customer_name||'',address:b.address||[a?.address,a?.city].filter(Boolean).join(', ')||job.address||'',email:customer?.email||'',phone:phones[0]?.number||''}};
}
export async function handleInvoiceCompany(request,env,m,h){
 const {json,fail,body,cleanText}=h;if(!['owner','administrator','admin'].includes(m.role))fail(403,'Firemní údaje nastavuje správce.');
 const read=async()=>{const row=await subOne(env.DB,"SELECT value,version FROM settings WHERE key='invoice-company'");return {company:row?JSON.parse(row.value):{},version:row?.version||0};};
 if(request.method==='GET')return json(await read());if(request.method!=='PUT')fail(405,'Nepodporovaná operace.');const b=await body(request,6000);if(!Number.isSafeInteger(b.version)||b.version<0)fail(400,'Obnovte firemní údaje.');let company;try{company=validateBilling(b.company,cleanText);}catch(e){fail(400,e.message);}
 const result=await env.DB.prepare("INSERT INTO settings(key,value,version) SELECT 'invoice-company',?,1 WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ('owner','administrator','admin')) AND (?=0 OR EXISTS(SELECT 1 FROM settings WHERE key='invoice-company' AND version=?)) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=settings.version+1 WHERE settings.version=?").bind(JSON.stringify(company),m.user_id,b.version,b.version,b.version).run();if(!result.meta.changes)fail(409,'Firemní údaje mezitím někdo změnil. Obnovte je.');return json(await read());
}
