import {readEmailConfiguration,emailConfigured,emailConfigurationHash} from './email-config.js';
import {subOne,subAll} from './subscriptions.js';
// Prototype is owner-only, including documents and approval. Owner is also a
// manager. Do not widen this to admin while the material prototype is private.
const protocolOwnerGate="EXISTS(SELECT 1 FROM members WHERE user_id=? AND role='owner')";
export async function dispatchProtocolEmails(env,{id=null,send=fetch}={}){
 const {config}=await readEmailConfiguration(env);if(!config)return {configured:false,sent:0};
 const now=Date.now(),configHash=await emailConfigurationHash(config);
 await env.DB.prepare("UPDATE protocol_emails SET state='failed',last_error='Lhůta pro bezpečné opakování vypršela. Před novou žádostí ověřte doručení u poskytovatele.' WHERE state='approved' AND lease_until<? AND (attempts>=5 OR reviewed_at<?)").bind(now,now-23*3600000).run();
 const rows=await subAll(env.DB,"SELECT e.* FROM protocol_emails e WHERE e.state='approved' AND e.attempts<5 AND e.lease_until<? AND e.next_attempt_at<=? AND e.reviewed_at>? AND (? IS NULL OR e.id=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM jobs j WHERE j.id=e.job_id AND j.discipline=?)) ORDER BY e.created_at LIMIT 5",now,now,now-23*3600000,id,id,env.WORKSPACE_ORGANIZATION_DISCIPLINE||null,env.WORKSPACE_ORGANIZATION_DISCIPLINE||null);let sent=0;
 for(const row of rows){
  if(row.attempts>0&&row.config_hash!==configHash){await env.DB.prepare("UPDATE protocol_emails SET state='failed',last_error='Po zahájení odesílání se změnil účet nebo odesílatel Resend. Před novou žádostí ověřte doručení původní zprávy.' WHERE id=? AND state='approved' AND lease_until<?").bind(row.id,now).run();continue;}
  const token=crypto.randomUUID(),claim=await env.DB.prepare("UPDATE protocol_emails SET lease_token=?,lease_until=?,attempts=attempts+1,config_hash=? WHERE id=? AND state='approved' AND lease_until<? AND attempts<5 AND (attempts=0 OR config_hash=?)").bind(token,now+60000,configHash,row.id,now,configHash).run();if(!claim.meta.changes)continue;
  let success=false,permanent=false,error='Odeslání se nepodařilo. Zpráva čeká na bezpečné opakování.';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   // A changed/deleted job or removed reviewer can never authorize a new send.
   const valid=await subOne(env.DB,"SELECT j.id FROM jobs j JOIN service_reports r ON r.job_id=j.id JOIN members m ON m.user_id=? WHERE j.id=? AND j.deleted=0 AND j.version=? AND r.version=? AND m.role='owner'",row.reviewed_by,row.job_id,row.job_version,row.report_version);
   if(!valid){permanent=true;error='Zakázka, protokol nebo oprávnění se změnily. Připravte a schvalte nový výkaz.';}
   else{
    const object=await env.BUCKET.get(row.object_key);if(!object)throw Error('missing_pdf');const bytes=new Uint8Array(await new Response(object.body).arrayBuffer());if(bytes.length!==row.size||await subHashBytes(bytes)!==row.sha256)throw Error('invalid_pdf');
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const response=await send('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:controller.signal,headers:{authorization:'Bearer '+config.apiKey,'content-type':'application/json','idempotency-key':'zavlahy-protocol-'+row.id},body:JSON.stringify({from:config.from,to:[row.recipient],subject:'Servisní výkaz – Dr. Závlaha',text:'Dobrý den,\n\nv příloze zasíláme servisní výkaz k provedené zakázce.\n\nDr. Závlaha',attachments:[{filename:row.filename,content:btoa(binary)}]})});
    success=response.ok;permanent=!success&&response.status>=400&&response.status<500&&![408,429].includes(response.status);if(!success)error='E-mailová služba odeslání '+(permanent?'odmítla':'dočasně nepřijala')+' (HTTP '+response.status+').';
   }
  }catch(e){if(['missing_pdf','invalid_pdf'].includes(e.message)){permanent=true;error='Uložené PDF není dostupné nebo neprošlo kontrolou. Připravte novou žádost.';}}finally{clearTimeout(timer);}
  await env.DB.prepare('UPDATE protocol_emails SET state=?,sent_at=?,lease_token=NULL,lease_until=0,next_attempt_at=?,last_error=? WHERE id=? AND lease_token=?').bind(success?'sent':permanent?'failed':'approved',success?Date.now():null,Date.now()+3600000,success?'':error,row.id,token).run();sent+=Number(success);
 }
 return {configured:true,sent};
}
async function subHashBytes(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function handleProtocolEmails(request,env,ctx,m,h){
 const {fail,json,body,validId,cleanText,boundedBytes}=h;if(m.role!=='owner')fail(403,'Prototyp výkazů e-mailem je dostupný pouze vlastníkovi.');
 const match=new URL(request.url).pathname.match(/^\/api\/jobs\/([-\w]{1,100})\/protocol-emails(?:\/([-\w]{1,100})(?:\/(pdf|approve|reject|retry))?)?$/);if(!match)fail(404,'Nenalezeno.');const [,jobId,id,action]=match,method=request.method;
 const job=await subOne(env.DB,'SELECT j.*,r.version report_version FROM jobs j LEFT JOIN service_reports r ON r.job_id=j.id WHERE j.id=? AND j.deleted=0',jobId);if(!job)fail(404,'Zakázka nebyla nalezena.');
 const list=async()=>({emailConfigured:await emailConfigured(env),requests:(await subAll(env.DB,'SELECT id,recipient,filename,sha256,job_version,report_version,state,created_at,reviewed_at,sent_at,last_error,attempts,next_attempt_at FROM protocol_emails WHERE job_id=? AND '+protocolOwnerGate+' ORDER BY created_at DESC LIMIT 30',jobId,m.user_id)).map(r=>({...r,stale:r.job_version!==job.version||r.report_version!==job.report_version}))});
 if(!id){if(method!=='GET')fail(405,'Nepodporovaná operace.');return json(await list());}
 if(action==='pdf'&&method==='GET'){
  const row=await subOne(env.DB,'SELECT * FROM protocol_emails WHERE id=? AND job_id=? AND '+protocolOwnerGate,id,jobId,m.user_id);if(!row||row.state==='uploading')fail(404,'PDF nebylo nalezeno.');const object=await env.BUCKET.get(row.object_key);if(!object)fail(404,'PDF není dostupné.');return new Response(object.body,{headers:{'content-type':'application/pdf','cache-control':'no-store','content-disposition':`inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,'x-content-type-options':'nosniff'}});
 }
 if(!action&&method==='PUT'){
  validId(id);if(!/^multipart\/form-data;.*boundary=/i.test(request.headers.get('content-type')||''))fail(400,'Nahrajte PDF jako přílohu formuláře.');const bytes=await boundedBytes(request,13*1024*1024);let form;try{form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')||''},body:bytes}).formData();}catch{fail(400,'Přílohu se nepodařilo přečíst. Zkuste žádost připravit znovu.');}const file=form.get('pdf');let meta;try{meta=JSON.parse(form.get('metadata'));}catch{fail(400,'Neplatné údaje žádosti.');}
  if(!meta||typeof meta!=='object'||!Number.isSafeInteger(meta.jobVersion)||!Number.isSafeInteger(meta.reportVersion)||!job.report_version)fail(400,'Nejdříve uložte a synchronizujte protokol.');
  const recipient=cleanText(meta.recipient,254,true);if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient))fail(400,'Zadejte platný e-mail zákazníka.');
  if(!file||typeof file.arrayBuffer!=='function'||file.type!=='application/pdf'||file.size>12*1024*1024)fail(400,'Příloha musí být PDF do 12 MB.');const pdf=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(pdf.slice(0,5))!=='%PDF-')fail(400,'Příloha není PDF.');
  const sha=await subHashBytes(pdf),key='protocol-emails/'+jobId+'/'+id+'/'+sha,filename='Servisni-vykaz-'+jobId.slice(0,30)+'-v'+meta.reportVersion+'.pdf',existing=await subOne(env.DB,'SELECT * FROM protocol_emails WHERE id=?',id);
  if(existing&&(existing.job_id!==jobId||existing.created_by!==m.user_id||existing.recipient!==recipient||existing.sha256!==sha||existing.job_version!==meta.jobVersion||existing.report_version!==meta.reportVersion))fail(409,'Pod stejným ID už je jiná žádost.');
  if(existing&&existing.state!=='uploading')return json(await list());
  if(job.version!==meta.jobVersion||job.report_version!==meta.reportVersion)fail(409,'Protokol nebo zakázka se změnily. Vytvořte aktuální PDF.');
  if((await subOne(env.DB,"SELECT COUNT(*) n FROM protocol_emails WHERE job_id=? AND state IN ('uploading','pending','approved')",jobId)).n>=10&&!existing)fail(409,'Nejprve vyřešte čekající žádosti o odeslání.');
  await env.DB.prepare("INSERT OR IGNORE INTO protocol_emails(id,job_id,job_version,report_version,recipient,filename,object_key,sha256,size,state,created_at,created_by) SELECT ?,?,?,?,?,?,?,?,?,'uploading',?,? WHERE "+protocolOwnerGate).bind(id,jobId,meta.jobVersion,meta.reportVersion,recipient,filename,key,sha,pdf.length,Date.now(),m.user_id,m.user_id).run();
  const row=await subOne(env.DB,'SELECT * FROM protocol_emails WHERE id=?',id);if(!row||row.sha256!==sha||row.recipient!==recipient||row.job_id!==jobId||row.created_by!==m.user_id||row.job_version!==meta.jobVersion||row.report_version!==meta.reportVersion)fail(409,'Žádost rezervovalo jiné zařízení.');
  await env.BUCKET.put(key,pdf,{httpMetadata:{contentType:'application/pdf'}});
  await env.DB.prepare("UPDATE protocol_emails SET state='pending' WHERE id=? AND state='uploading' AND "+protocolOwnerGate).bind(id,m.user_id).run();return json(await list());
 }
 if(!['approve','reject','retry'].includes(action)||method!=='POST')fail(405,'Nepodporovaná operace.');
 const b=await body(request,1000),row=await subOne(env.DB,'SELECT * FROM protocol_emails WHERE id=? AND job_id=?',id,jobId);if(!row)fail(404,'Žádost nebyla nalezena.');
 if(b.recipient!==row.recipient||b.sha256!==row.sha256)fail(409,'Před schválením zkontrolujte příjemce a uložené PDF.');
 if(action==='reject'){
  const r=await env.DB.prepare("UPDATE protocol_emails SET state='rejected',reviewed_at=?,reviewed_by=? WHERE id=? AND state IN ('pending','uploading','approved') AND lease_until<? AND attempts=0 AND "+protocolOwnerGate).bind(Date.now(),m.user_id,id,Date.now(),m.user_id).run();if(!r.meta.changes&&row.state!=='rejected')fail(409,'Odeslání už probíhá nebo je žádost vyřízená.');return json(await list());
 }
 if(job.version!==row.job_version||job.report_version!==row.report_version)fail(409,'Zakázka nebo protokol se změnily. Tuto žádost neposílejte a připravte aktuální PDF.');
 if(action==='approve'){
  await env.DB.prepare("UPDATE protocol_emails SET state='approved',reviewed_at=?,reviewed_by=? WHERE id=? AND state='pending' AND "+protocolOwnerGate+" AND EXISTS(SELECT 1 FROM jobs j JOIN service_reports r ON r.job_id=j.id WHERE j.id=protocol_emails.job_id AND j.version=protocol_emails.job_version AND r.version=protocol_emails.report_version AND j.deleted=0)").bind(Date.now(),m.user_id,id,m.user_id).run();
 }else if(row.state!=='approved'&&row.state!=='sent')fail(409,'Žádost zatím nebyla schválená nebo ji nelze bezpečně opakovat.');
 const current=await subOne(env.DB,'SELECT state FROM protocol_emails WHERE id=?',id);if(!['approved','sent'].includes(current.state))fail(409,'Žádost již nelze schválit.');
 await dispatchProtocolEmails(env,{id});return json(await list());
}
