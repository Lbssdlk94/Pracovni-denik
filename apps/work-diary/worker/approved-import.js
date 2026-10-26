// A short-lived, server-provisioned import capability. The caller cannot supply
// records or an identity: only the exact batch approved in runtime secrets runs.
export async function handleApprovedImport(request,env,h){
 const {fail,json,one,cleanText,validId,accessHash}=h;
 if(request.method!=='POST'||!env.APPROVED_JOB_IMPORT)fail(404,'Nenalezeno.');
 let batch;try{batch=JSON.parse(env.APPROVED_JOB_IMPORT);}catch{fail(503,'Import není připraven.');}
 const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 const hash=token?await accessHash(token):'';let difference=hash.length^String(batch.tokenHash).length;
 for(let i=0;i<64;i++)difference|=(hash.charCodeAt(i)||0)^(String(batch.tokenHash).charCodeAt(i)||0);
 if(!token||difference||!Number.isSafeInteger(batch.expiresAt)||Date.now()>batch.expiresAt)fail(401,'Import není autorizován nebo vypršel.');
 if((await h.boundedBytes(request,1000)).byteLength)fail(400,'Import přijímá pouze předem schválenou dávku.');
 const batchId=validId(batch.id),key='approved-job-import:'+batchId;
 const completed=await one(env.DB,'SELECT value FROM settings WHERE key=?',key);
 if(completed){try{const result=JSON.parse(completed.value);if(result.status==='done')return json({...result,replayed:true});}catch{}fail(409,'Import už probíhá.');}
 if(!Array.isArray(batch.customers)||!Array.isArray(batch.gardens)||!Array.isArray(batch.jobs)||batch.customers.length>50||batch.gardens.length>50||!batch.jobs.length||batch.jobs.length>50)fail(400,'Neplatná dávka.');
 const owner=await one(env.DB,"SELECT * FROM members WHERE email=? AND role='owner'",String(env.TEAM_OWNER_EMAIL).toLowerCase());
 const assignee=await one(env.DB,'SELECT * FROM members WHERE email=?',cleanText(batch.assigneeEmail,200,true).toLowerCase());
 if(!owner||!assignee)fail(409,'Vlastník nebo přiřazený pracovník není členem týmu.');
 const unique=items=>{const ids=items.map(v=>validId(v.id));if(new Set(ids).size!==ids.length)fail(400,'Duplicitní identifikátor v dávce.');return new Set(ids);};
 const customerIds=unique(batch.customers),gardenIds=unique(batch.gardens);unique(batch.jobs);
 const customers=batch.customers.map(c=>{
  const phones=c.phones,addresses=c.addresses;if(!Array.isArray(phones)||!Array.isArray(addresses)||phones.length>20||addresses.length>20)fail(400,'Neplatné kontakty.');
  unique(phones);unique(addresses);
  return {...c,name:cleanText(c.name,160,true),phones:phones.map(p=>({id:validId(p.id),label:cleanText(p.label||'',60),number:cleanText(p.number,50,true)})),addresses:addresses.map(a=>({id:validId(a.id),label:cleanText(a.label||'',60),address:cleanText(a.address,300,true),city:cleanText(a.city||'',120)}))};
 });
 const gardens=batch.gardens.map(g=>{if(!customerIds.has(g.customerId))fail(400,'Zahrada nemá zákazníka.');return {...g,name:cleanText(g.name,160,true),address:cleanText(g.address,160,true),notes:cleanText(g.notes||'',4000)};});
 const jobs=batch.jobs.map(j=>{
  const c=customers.find(c=>c.id===j.customerId),a=c?.addresses.find(a=>a.id===j.customerAddressId),g=gardens.find(g=>g.id===j.gardenId);
  if(!c||!a||!gardenIds.has(j.gardenId)||g.customerId!==c.id||g.address!==a.address)fail(400,'Nesouhlasí propojení zakázky.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(j.dueDate)||new Date(j.dueDate+'T00:00:00Z').toISOString().slice(0,10)!==j.dueDate)fail(400,'Neplatný termín.');
  const startTime=cleanText(j.startTime??'',5),endTime=cleanText(j.endTime??'',5),clock=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if(startTime&&!clock(startTime)||endTime&&(!clock(endTime)||!startTime||endTime<=startTime))fail(400,'Neplatný čas návštěvy.');
  return {...j,startTime,endTime,title:cleanText(j.title,120,true),description:cleanText(j.description,4000),customerName:c.name,address:a.address,city:a.city};
 });
 const nonce=crypto.randomUUID(),now=Date.now(),result={status:'done',customers:customers.length,gardens:gardens.length,jobs:jobs.length};
 const gate='EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',statements=[env.DB.prepare('INSERT OR IGNORE INTO settings(key,value,version) VALUES(?,?,1)').bind(key,nonce)];
 // The NOT NULL constraint makes membership changes abort the entire D1 batch.
 statements.push(env.DB.prepare("UPDATE settings SET version=CASE WHEN EXISTS(SELECT 1 FROM members WHERE user_id=? AND email=? AND role='owner') AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND email=?) THEN version ELSE NULL END WHERE key=? AND value=?").bind(owner.user_id,owner.email,assignee.user_id,assignee.email,key,nonce));
 for(const c of customers)statements.push(env.DB.prepare(`INSERT INTO customers(id,name,phones,addresses,version,created_at,updated_at,created_by,updated_by,deleted,irrigation_origin) SELECT ?,?,?,?,1,?,?,?,?,0,'unknown' WHERE ${gate}`).bind(c.id,c.name,JSON.stringify(c.phones),JSON.stringify(c.addresses),now,now,owner.user_id,owner.user_id,key,nonce));
 for(const g of gardens)statements.push(env.DB.prepare(`INSERT INTO gardens(id,customer_id,name,address,notes,version,created_at,updated_at,created_by,updated_by) SELECT ?,?,?,?,?,1,?,?,?,? WHERE ${gate}`).bind(g.id,g.customerId,g.name,g.address,g.notes,now,now,owner.user_id,owner.user_id,key,nonce));
 for(const j of jobs)statements.push(env.DB.prepare(`INSERT INTO jobs(id,title,customer_id,customer_address_id,customer_name,city,description,address,garden_id,assigned_to,assigned_name,due_date,start_time,end_time,status,incomplete_reason,version,created_at,updated_at,created_by,updated_by,deleted) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'planned','',1,?,?,?,?,0 WHERE ${gate}`).bind(j.id,j.title,j.customerId,j.customerAddressId,j.customerName,j.city,j.description,j.address,j.gardenId,assignee.user_id,assignee.name,j.dueDate,j.startTime,j.endTime,now,now,owner.user_id,owner.user_id,key,nonce));
 statements.push(env.DB.prepare('UPDATE settings SET value=? WHERE key=? AND value=?').bind(JSON.stringify(result),key,nonce));
 await env.DB.batch(statements);
 const saved=await one(env.DB,'SELECT value FROM settings WHERE key=?',key);return json(JSON.parse(saved.value));
}
