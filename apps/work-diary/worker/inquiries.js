import {inquiryAllowsService,inquiryCategoryLabel,inquiryClosed,inquiryService,inquiryServiceLabel,inquiryStatusLabel,INQUIRY_CONSENT,INQUIRY_STATUSES} from '../web/inquiry-catalog.js';
import {handleCustomers} from './customers.js';
import {handleJobs} from './jobs.js';
import {readEmailConfiguration} from './email-config.js';
import {installationInfo} from './installation.js';
import {readJobKinds} from './job-kinds.js';
const INQUIRY_MANAGERS=['owner','administrator','admin'];
const QUOTE_STATUSES=['quote_prep','quote_sent','awaiting'];
const licenseSql=discipline=>`EXISTS(SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline='${discipline}' AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000)`;
const categoryVisible=`(NOT EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) OR ((category='irrigation' AND ${licenseSql('irrigation')}) OR (category='garden' AND ${licenseSql('garden')}) OR (category='both' AND ${licenseSql('irrigation')} AND ${licenseSql('garden')})))`;
const managerSql=`EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role IN ('owner','administrator','admin') AND ${categoryVisible.replaceAll('category','inquiries.category')})`;
const digits=value=>String(value||'').replace(/\D/g,'').slice(-9);
const mailKey=value=>String(value||'').trim().toLowerCase();
const yearOf=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric'}).format(new Date());
async function inquirySha256(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
function imageKind(bytes){
 if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff) return {mime:'image/jpeg',ext:'jpg'};
 if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47) return {mime:'image/png',ext:'png'};
 if(bytes.length>=12&&bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50) return {mime:'image/webp',ext:'webp'};
 return null;
}
async function clientBucket(request){
 const ip=request.headers.get('cf-connecting-ip')||(request.headers.get('x-forwarded-for')||'').split(',')[0].trim()||'local';
 return (await inquirySha256('inquiry|'+ip)).slice(0,32);
}
async function takeRate(env,bucket,limit,windowMs){
 const now=Date.now();
 const result=await env.DB.prepare(`INSERT INTO inquiry_rates(bucket,window_start,count) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN inquiry_rates.window_start<=? THEN 1 ELSE inquiry_rates.count+1 END, window_start=CASE WHEN inquiry_rates.window_start<=? THEN ? ELSE inquiry_rates.window_start END WHERE CASE WHEN inquiry_rates.window_start<=? THEN 0 ELSE inquiry_rates.count END<?`).bind(bucket,now,now-windowMs,now-windowMs,now,now-windowMs,limit).run();
 return !!result.meta.changes;
}
function inquiryManager(m,fail){if(!INQUIRY_MANAGERS.includes(m.role)) fail(403,'Poptávky spravuje správce.');}
function dto(row,extra={}){
 return {id:row.id,number:row.public_number,category:row.category,categoryLabel:inquiryCategoryLabel(row.category),serviceType:row.service_type,serviceLabel:inquiryServiceLabel(row.service_type),status:row.status,statusLabel:inquiryStatusLabel(row.status),closed:inquiryClosed(row.status),firstName:row.first_name,lastName:row.last_name,company:row.company,phone:row.phone,email:row.email,street:row.street,city:row.city,zip:row.zip,address:row.address,position:row.latitude==null?null:{latitude:row.latitude,longitude:row.longitude},description:row.description,preferredDate:row.preferred_date,extras:JSON.parse(row.extras||'{}'),assigneeId:row.assignee_id,internalNote:row.internal_note,customerId:row.customer_id,gardenId:row.garden_id,jobId:row.job_id,photoCount:row.photo_count,createdAt:row.created_at,updatedAt:row.updated_at,version:row.version,...extra};
}
async function notify(env,inquiry,title,body,key){
 await env.DB.prepare(`INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at) SELECT lower(hex(randomblob(16))),?,m.user_id,?, ?,?,?,? FROM members m WHERE m.role IN ('owner','administrator','admin')`).bind(key,key.endsWith(':new')?'inquiry_new':'inquiry_status',inquiry.id,title,body,Date.now()).run();
}
async function sendMails(env,inquiry){
 const config=(await readEmailConfiguration(env)).config;
 if(!config) return false;
 const name=`${inquiry.first_name} ${inquiry.last_name}`.trim();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 let sent=false;
 try{
  const customer=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:controller.signal,headers:{authorization:'Bearer '+config.apiKey,'content-type':'application/json','idempotency-key':'inquiry-customer-'+inquiry.id},body:JSON.stringify({from:config.from,to:[inquiry.email],subject:'Poptávku jsme přijali '+inquiry.public_number,text:`Dobrý den,\n\npoptávku ${inquiry.public_number} jsme přijali. Ozveme se vám na tento e-mail nebo na telefon ${inquiry.phone}.\n\n${name}\n${inquiry.address}`})});
  sent=customer.status>=200&&customer.status<300;
  const flags=JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key='features'").first())?.value||'{}');
  if(flags.emailNotifications===false||flags.notifications===false) return sent;
  const managers=await env.DB.prepare("SELECT email FROM members WHERE role IN ('owner','administrator','admin') AND email<>''").all();
  for(const person of managers.results||[]){
   if(person.email.toLowerCase()===inquiry.email_key) continue;
   await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:controller.signal,headers:{authorization:'Bearer '+config.apiKey,'content-type':'application/json','idempotency-key':'inquiry-manager-'+inquiry.id+'-'+person.email},body:JSON.stringify({from:config.from,to:[person.email],subject:'Nová poptávka '+inquiry.public_number,text:`Nová poptávka ${inquiry.public_number}\n${name}\n${inquiry.phone}\n${inquiryCategoryLabel(inquiry.category)} · ${inquiryServiceLabel(inquiry.service_type)}\n${inquiry.address}\n\nOtevřete ji po přihlášení v sekci Poptávky.`})});
  }
 }catch{return sent;}finally{clearTimeout(timer);}
 return sent;
}
function publicPayload(b,fail,clean){
 if(!b||typeof b!=='object'||Array.isArray(b)) fail(400,'Zkontrolujte vyplněné údaje.');
 if(typeof b.website==='string'&&b.website.trim()) fail(400,'Poptávku se nepodařilo odeslat.');
 const firstName=clean(b.firstName,80,true),lastName=clean(b.lastName,80,true),company=clean(b.company||'',160);
 const phone=clean(b.phone,50,true);
 if(!/^\+?[0-9 ()\-./]{6,50}$/.test(phone)||digits(phone).length<9) fail(400,'Zkontrolujte telefon. Použijte číslice a případně předvolbu +420.');
 const email=clean(b.email,254,true).toLowerCase();
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) fail(400,'Zadejte platný e-mail.');
 const street=clean(b.street,160,true),city=clean(b.city,80,true),zip=clean(b.zip||'',12);
 if(zip&&!/^[0-9 ]{4,8}$/.test(zip)) fail(400,'PSČ zadejte čísly.');
 const category=b.category,serviceType=b.serviceType;
 if(!inquiryAllowsService(category,serviceType)) fail(400,'Vyberte kategorii a k ní odpovídající typ práce.');
 const description=clean(b.description,4000,true);
 if(description.length<8) fail(400,'Doplňte, co potřebujete. Stačí pár vět.');
 const preferredDate=clean(b.preferredDate||'',10);
 if(preferredDate&&!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) fail(400,'Preferovaný termín zadejte jako datum, nebo ho nechte prázdný.');
 const extras=b.extras&&typeof b.extras==='object'&&!Array.isArray(b.extras)?b.extras:{};
 if(Object.keys(extras).some(key=>!['area','water','gardenNote'].includes(key))) fail(400,'Zkontrolujte doplňující otázky.');
 const cleanExtras={};
 if(category!=='garden'){cleanExtras.area=clean(extras.area||'',80);cleanExtras.water=clean(extras.water||'',160);}
 if(category!=='irrigation') cleanExtras.gardenNote=clean(extras.gardenNote||'',500);
 let latitude=null,longitude=null;
 if(b.latitude!=null||b.longitude!=null){
  if(!Number.isFinite(b.latitude)||b.latitude<-90||b.latitude>90||!Number.isFinite(b.longitude)||b.longitude<-180||b.longitude>180) fail(400,'Polohu se nepodařilo přečíst. Adresu můžete nechat bez GPS.');
  latitude=b.latitude;longitude=b.longitude;
 }
 if(b.consent!==true) fail(400,'Bez souhlasu se zpracováním údajů poptávku nelze odeslat.');
 if(typeof b.clientToken!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.clientToken)) fail(400,'Formulář se nepodařilo ověřit. Načtěte stránku znovu.');
 return {firstName,lastName,company,phone,phoneKey:digits(phone),email,emailKey:mailKey(email),street,city,zip,address:[street,zip,city].filter(Boolean).join(', '),latitude,longitude,category,serviceType,description,preferredDate,extras:cleanExtras,clientToken:b.clientToken.toLowerCase()};
}
export async function handlePublicInquiry(request,env,ctx,h){
 const {fail,json,body,cleanText,boundedBytes}=h,url=new URL(request.url),path=url.pathname,method=request.method;
 if(path==='/api/inquiries/public/challenge'&&method==='GET'){
  if(!await takeRate(env,'challenge:'+await clientBucket(request),30,3600000)) fail(429,'Zkuste formulář otevřít později.');
  const id=crypto.randomUUID().replaceAll('-',''),now=Date.now();
  await env.DB.prepare('INSERT INTO inquiry_challenges(id,issued_at,expires_at) VALUES(?,?,?)').bind(id,now,now+2*3600000).run();
  const info=await installationInfo(env);
  return json({challenge:id,companyName:info.name||'Pracovní deník',consent:INQUIRY_CONSENT});
 }
 if(path==='/api/inquiries/public/suggest'&&method==='POST') return suggestAddress(request,env,h);
 const photo=path.match(/^\/api\/inquiries\/public\/([0-9a-f-]{36})\/photos$/i);
 if(photo&&method==='PUT') return storePublicPhoto(request,env,h,photo[1]);
 if(path!=='/api/inquiries/public'||method!=='POST') fail(404,'Veřejně lze poptávku jen odeslat.');
 const raw=await body(request,80000);
 const replay=typeof raw?.clientToken==='string'?await env.DB.prepare('SELECT id,public_number FROM inquiries WHERE client_token=?').bind(raw.clientToken.toLowerCase()).first():null;
 if(replay) return json({ok:true,id:replay.id,number:replay.public_number,uploadToken:null,emailed:false,replayed:true});
 if(!await takeRate(env,'submit:'+await clientBucket(request),8,3600000)) fail(429,'Z této sítě už přišlo hodně poptávek. Zkuste to později.');
 const challenge=typeof raw?.challenge==='string'?raw.challenge:'';
 if(!/^[a-f0-9]{32}$/.test(challenge)) fail(400,'Formulář vypršel. Načtěte stránku znovu.');
 const issued=await env.DB.prepare('SELECT * FROM inquiry_challenges WHERE id=?').bind(challenge).first();
 if(!issued||issued.used_at||issued.expires_at<Date.now()) fail(400,'Formulář vypršel. Načtěte stránku znovu.');
 if(Date.now()-issued.issued_at<3000) fail(400,'Formulář byl odeslán příliš rychle. Chvíli počkejte a odešlete ho znovu.');
 const value=publicPayload(raw,fail,cleanText);
 const used=await env.DB.prepare('UPDATE inquiry_challenges SET used_at=? WHERE id=? AND used_at IS NULL').bind(Date.now(),challenge).run();
 if(!used.meta.changes) fail(400,'Formulář už byl odeslaný. Obnovte stránku, pokud poptávka nedorazila.');
 const id=crypto.randomUUID(),upload=crypto.randomUUID(),now=Date.now(),year=yearOf();
 const inserted=await env.DB.prepare(`INSERT INTO inquiries(id,public_number,category,service_type,status,first_name,last_name,company,phone,phone_key,email,email_key,street,city,zip,address,latitude,longitude,description,preferred_date,extras,consent_text,assignee_id,internal_note,customer_id,garden_id,job_id,client_token,upload_token_hash,upload_expires_at,photo_count,created_at,updated_at,version) SELECT ?, (SELECT 'P-'||?||'-'||printf('%04d', COALESCE(MAX(CAST(substr(public_number,8) AS INTEGER)),0)+1) FROM inquiries WHERE public_number LIKE 'P-'||?||'-%'), ?,?, 'new', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, NULL,'',NULL,NULL,NULL, ?,?, ?,0,?,?,1 WHERE NOT EXISTS(SELECT 1 FROM inquiries WHERE client_token=?)`).bind(id,year,year,value.category,value.serviceType,value.firstName,value.lastName,value.company,value.phone,value.phoneKey,value.email,value.emailKey,value.street,value.city,value.zip,value.address,value.latitude,value.longitude,value.description,value.preferredDate,JSON.stringify(value.extras),INQUIRY_CONSENT,value.clientToken,await inquirySha256(upload),now+2*3600000,now,now,value.clientToken).run();
 const saved=await env.DB.prepare('SELECT * FROM inquiries WHERE client_token=?').bind(value.clientToken).first();
 if(!saved) fail(503,'Poptávku se nepodařilo uložit. Zkuste to znovu, stejné odeslání ji nezdvojí.');
 if(!inserted.meta.changes) return json({ok:true,id:saved.id,number:saved.public_number,uploadToken:null,emailed:false,replayed:true});
 await env.DB.prepare('INSERT INTO inquiry_events(id,inquiry_id,kind,actor_id,summary,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),saved.id,'created',null,'Zákazník odeslal poptávku.',now).run();
 await notify(env,saved,'Nová poptávka',`${saved.public_number} · ${saved.first_name} ${saved.last_name} · ${inquiryCategoryLabel(saved.category)}`,'inquiry:'+saved.id+':new');
 let emailed=false;
 try{emailed=await sendMails(env,saved);}catch{emailed=false;}
 if(ctx) ctx.waitUntil(Promise.resolve());
 return json({ok:true,id:saved.id,number:saved.public_number,uploadToken:upload,emailed,replayed:false});
}
async function storePublicPhoto(request,env,h,id){
 const {fail,json,boundedBytes}=h;
 if(!/^[0-9a-f-]{36}$/i.test(id)) fail(404,'Poptávka nebyla nalezena.');
 const row=await env.DB.prepare('SELECT id,upload_token_hash,upload_expires_at,photo_count FROM inquiries WHERE id=?').bind(id).first();
 const token=request.headers.get('x-inquiry-upload')||'';
 if(!row||!token||await inquirySha256(token)!==row.upload_token_hash) fail(403,'Fotografie k této poptávce nelze přidat.');
 if(row.upload_expires_at<Date.now()) fail(403,'Čas pro přidání fotografií vypršel. Pošlete je prosím k číslu poptávky.');
 if(row.photo_count>=6) fail(400,'K poptávce lze přidat nejvýše 6 fotografií.');
 const claimed=request.headers.get('content-type')||'';
 if(!['image/jpeg','image/png','image/webp'].includes(claimed)) fail(400,'Fotografie musí být JPEG, PNG nebo WEBP.');
 const bytes=await boundedBytes(request,6_500_000);
 if(bytes.length<16||bytes.length>6_000_000) fail(400,'Fotografie je prázdná nebo větší než 6 MB.');
 const kind=imageKind(bytes);
 if(!kind||kind.mime!==claimed) fail(400,'Soubor není platná fotografie vybraného typu.');
 const hash=await inquirySha256(bytes),existing=await env.DB.prepare('SELECT id FROM inquiry_photos WHERE inquiry_id=? AND sha256=?').bind(id,hash).first();
 if(existing) return json({ok:true,id:existing.id,replayed:true});
 const photoId=crypto.randomUUID(),key=`inquiries/${id}/${photoId}.${kind.ext}`,name=(request.headers.get('x-file-name')||'foto.'+kind.ext).replace(/[^\p{L}\p{N} ._()-]+/gu,'').slice(0,80)||'foto.'+kind.ext;
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:kind.mime}});
 const saved=await env.DB.prepare('INSERT INTO inquiry_photos(id,inquiry_id,object_key,mime_type,size,name,sha256,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT photo_count FROM inquiries WHERE id=? AND upload_token_hash=?)<6').bind(photoId,id,key,kind.mime,bytes.length,name,hash,Date.now(),id,await inquirySha256(token)).run();
 if(!saved.meta.changes){await env.BUCKET.delete(key);fail(400,'Další fotografii už nelze přidat.');}
 await env.DB.prepare('UPDATE inquiries SET photo_count=photo_count+1,updated_at=? WHERE id=?').bind(Date.now(),id).run();
 await env.DB.prepare('INSERT INTO inquiry_events(id,inquiry_id,kind,actor_id,summary,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,'photo',null,'Zákazník přidal fotografii.',Date.now()).run();
 return json({ok:true,id:photoId,replayed:false});
}
async function suggestAddress(request,env,h){
 const {fail,json,body}=h,b=await body(request,2000);
 if(typeof b?.challenge!=='string'||!/^[a-f0-9]{32}$/.test(b.challenge)) fail(400,'Našeptávání adresy vypršelo. Obnovte formulář.');
 const issued=await env.DB.prepare('SELECT id FROM inquiry_challenges WHERE id=? AND used_at IS NULL AND expires_at>?').bind(b.challenge,Date.now()).first();
 if(!issued) fail(400,'Našeptávání adresy vypršelo. Obnovte formulář.');
 if(!await takeRate(env,'suggest:'+await clientBucket(request),40,3600000)) fail(429,'Vyhledávání adresy probíhá příliš často.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const url=new URL(b.query?'https://photon.komoot.io/api/':'https://photon.komoot.io/reverse');
  if(b.query){if(typeof b.query!=='string'||b.query.trim().length<3||b.query.length>160) fail(400,'Napište aspoň začátek adresy.');url.searchParams.set('q',b.query.trim());url.searchParams.set('limit','5');}
  else{if(!Number.isFinite(b.latitude)||!Number.isFinite(b.longitude)) fail(400,'Polohu se nepodařilo přečíst.');url.searchParams.set('lat',String(b.latitude));url.searchParams.set('lon',String(b.longitude));}
  const response=await fetch(url,{headers:{accept:'application/json','User-Agent':'PracovniDenik/1.0'},signal:controller.signal});
  if(!response.ok) fail(503,'Našeptávání adresy teď není dostupné. Adresu můžete vyplnit ručně.');
  const data=await response.json();
  const suggestions=[];
  for(const feature of (data.features||[]).slice(0,5)){
   const p=feature.properties||{},text=value=>typeof value==='string'?value.trim().slice(0,160):'';
   const street=[text(p.street),text(p.housenumber)].filter(Boolean).join(' '),city=text(p.city)||text(p.town)||text(p.village),zip=text(p.postcode);
   if(street||city) suggestions.push({street,city,zip});
  }
  return json({suggestions});
 }catch(error){if(error?.status) throw error;fail(503,'Našeptávání adresy teď není dostupné. Adresu můžete vyplnit ručně.');}
 finally{clearTimeout(timer);}
}
async function visible(env,m,id){
 return env.DB.prepare('SELECT * FROM inquiries WHERE id=? AND '+managerSql).bind(id,m.user_id).first();
}
async function duplicates(env,row){
 const customers=(await env.DB.prepare("SELECT id,name,email,phones,addresses FROM customers WHERE deleted=0 AND (lower(email)=? OR phones LIKE ? OR phones LIKE ?) ORDER BY name LIMIT 20").bind(row.email_key,'%'+row.phone_key+'%','%'+row.phone.slice(-6)+'%').all()).results||[];
 const matched=customers.filter(customer=>mailKey(customer.email)===row.email_key||JSON.parse(customer.phones||'[]').some(phone=>digits(phone.number)===row.phone_key)).map(customer=>({id:customer.id,name:customer.name,email:customer.email,kind:'customer'}));
 const others=(await env.DB.prepare("SELECT id,public_number,first_name,last_name,status FROM inquiries WHERE id<>? AND (phone_key=? OR email_key=?) ORDER BY created_at DESC LIMIT 8").bind(row.id,row.phone_key,row.email_key).all()).results||[];
 return {customers:matched,inquiries:others.map(item=>({id:item.id,number:item.public_number,name:`${item.first_name} ${item.last_name}`,status:item.status,statusLabel:inquiryStatusLabel(item.status)}))};
}
export async function handleInquiries(request,env,m,h){
 const {fail,json,body,cleanText,expectedVersion,validId}=h,url=new URL(request.url),path=url.pathname,method=request.method;
 inquiryManager(m,fail);
 if(path==='/api/inquiries/summary'&&method==='GET'){
  const count=await env.DB.prepare(`SELECT COUNT(*) AS count FROM inquiries WHERE status='new' AND ${managerSql}`).bind(m.user_id).first();
  const people=await env.DB.prepare("SELECT user_id,name FROM members ORDER BY name").all();
  return json({newCount:count?.count||0,statuses:INQUIRY_STATUSES,members:(people.results||[]).map(person=>({id:person.user_id,name:person.name}))});
 }
 if(path==='/api/inquiries'&&method==='GET') return json(await listInquiries(env,m,h,url));
 const photo=path.match(/^\/api\/inquiries\/([0-9a-f-]{36})\/photos\/([0-9a-f-]{36})$/i);
 if(photo&&method==='GET') return readPhoto(env,m,fail,photo[1],photo[2]);
 const onePath=path.match(/^\/api\/inquiries\/([0-9a-f-]{36})$/i);
 if(onePath&&method==='GET'){
  const row=await visible(env,m,onePath[1]);if(!row) fail(404,'Poptávka nebyla nalezena.');
  const events=await env.DB.prepare('SELECT e.kind,e.summary,e.created_at,e.actor_id,COALESCE(members.name,\'Zákazník\') AS actor_name FROM inquiry_events e LEFT JOIN members ON members.user_id=e.actor_id WHERE e.inquiry_id=? ORDER BY e.created_at,e.id').bind(row.id).all();
  const photos=await env.DB.prepare('SELECT id,name,mime_type,size,created_at FROM inquiry_photos WHERE inquiry_id=? ORDER BY created_at').bind(row.id).all();
  return json({inquiry:{...dto(row),events:(events.results||[]).map(event=>({kind:event.kind,summary:event.summary,at:event.created_at,actorName:event.actor_name})),photos:photos.results||[]},duplicates:await duplicates(env,row)});
 }
 if(onePath&&method==='PATCH') return patchInquiry(request,env,m,h,onePath[1]);
 const link=path.match(/^\/api\/inquiries\/([0-9a-f-]{36})\/link$/i);
 if(link&&method==='POST') return linkCustomer(request,env,m,h,link[1]);
 const convert=path.match(/^\/api\/inquiries\/([0-9a-f-]{36})\/convert$/i);
 if(convert&&method==='POST') return convertInquiry(request,env,m,h,convert[1]);
 fail(404,'Poptávka nebyla nalezena.');
}
async function listInquiries(env,m,h,url){
 const {fail,cleanText,validId}=h,closed=url.searchParams.get('closed')==='1',args=[m.user_id];
 const where=[managerSql,closed?`status IN ('converted','rejected','archived')`:`status NOT IN ('converted','rejected','archived')`];
 const status=url.searchParams.get('status')||'';
 if(status){const ids=status.split(',').filter(Boolean);if(!ids.length||ids.some(id=>!INQUIRY_STATUSES.some(item=>item.id===id))) fail(400,'Vyberte platný stav.');where.push(`status IN (${ids.map(()=>'?').join(',')})`);args.push(...ids);}
 const category=url.searchParams.get('category')||'';
 if(category){if(!['irrigation','garden','both'].includes(category)) fail(400,'Vyberte kategorii.');where.push('category=?');args.push(category);}
 const assignee=url.searchParams.get('assignee')||'';
 if(assignee==='none') where.push('assignee_id IS NULL');
 else if(assignee){validId(assignee);where.push('assignee_id=?');args.push(assignee);}
 const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
 if(from||to){if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))) fail(400,'Zkontrolujte rozsah data.');}
 if(from){where.push('created_at>=?');args.push(Date.parse(from+'T00:00:00Z')||0);}
 if(to){where.push('created_at<?');args.push((Date.parse(to+'T00:00:00Z')||0)+86400000);}
 const q=cleanText(url.searchParams.get('q')||'',120);
 if(q){const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';where.push("(public_number LIKE ? ESCAPE '\\' OR first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");args.push(pattern,pattern,pattern,pattern,pattern,pattern,pattern,pattern);}
 const rows=await env.DB.prepare('SELECT * FROM inquiries WHERE '+where.join(' AND ')+` ORDER BY CASE WHEN status='new' THEN 0 ELSE 1 END, created_at DESC LIMIT 200`).bind(...args).all();
 return {inquiries:(rows.results||[]).map(row=>dto(row))};
}
async function readPhoto(env,m,fail,inquiryId,photoId){
 const row=await visible(env,m,inquiryId);if(!row) fail(404,'Fotografie nebyla nalezena.');
 const photo=await env.DB.prepare('SELECT * FROM inquiry_photos WHERE id=? AND inquiry_id=?').bind(photoId,inquiryId).first();
 if(!photo) fail(404,'Fotografie nebyla nalezena.');
 const object=await env.BUCKET.get(photo.object_key);if(!object) fail(404,'Fotografie nebyla nalezena.');
 return new Response(object.body,{headers:{'content-type':photo.mime_type,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
async function event(env,inquiryId,actorId,kind,summary){
 await env.DB.prepare('INSERT INTO inquiry_events(id,inquiry_id,kind,actor_id,summary,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),inquiryId,kind,actorId,summary.slice(0,300),Date.now()).run();
}
async function patchInquiry(request,env,m,h,id){
 const {fail,json,body,cleanText,expectedVersion,validId}=h,b=await body(request,12000);
 if(!b||typeof b!=='object'||Object.keys(b).some(key=>!['version','status','assigneeId','internalNote'].includes(key))) fail(400,'Zkontrolujte úpravu poptávky.');
 const version=expectedVersion(b.version),row=await visible(env,m,id);if(!row) fail(404,'Poptávka nebyla nalezena.');
 if(row.version!==version) fail(409,'Poptávku mezitím změnil kolega. Načtěte ji znovu.');
 let status=row.status,assignee=row.assignee_id,note=row.internal_note,changed=[];
 if(Object.hasOwn(b,'status')){
  if(!INQUIRY_STATUSES.some(item=>item.id===b.status)||b.status==='converted') fail(400,'Tento stav se nastavuje jen převodem na zakázku, nebo vyberte jiný.');
  if(row.status==='converted'&&b.status!=='converted') fail(409,'Převedená poptávka už zůstává propojená se zakázkou.');
  if(b.status!==row.status){status=b.status;changed.push('status');}
 }
 if(Object.hasOwn(b,'assigneeId')){
  if(b.assigneeId===null||b.assigneeId==='') assignee=null;
  else{validId(b.assigneeId);if(!await env.DB.prepare('SELECT user_id FROM members WHERE user_id=?').bind(b.assigneeId).first()) fail(400,'Vyberte člověka z týmu.');assignee=b.assigneeId;}
  if(assignee!==row.assignee_id) changed.push('assignee');
 }
 if(Object.hasOwn(b,'internalNote')){note=cleanText(b.internalNote,4000);if(note!==row.internal_note) changed.push('note');}
 if(!changed.length) return json({inquiry:dto(row)});
 const now=Date.now();
 const saved=await env.DB.prepare('UPDATE inquiries SET status=?,assignee_id=?,internal_note=?,version=version+1,updated_at=? WHERE id=? AND version=? AND '+managerSql).bind(status,assignee,note,now,id,version,m.user_id).run();
 if(!saved.meta.changes) fail(409,'Poptávku mezitím změnil kolega. Načtěte ji znovu.');
 if(changed.includes('status')) await event(env,id,m.user_id,'status',`Stav: ${inquiryStatusLabel(status)}.`);
 if(changed.includes('assignee')) await event(env,id,m.user_id,'assignee',assignee?'Přiřazena odpovědná osoba.':'Odpovědná osoba byla odebrána.');
 if(changed.includes('note')) await event(env,id,m.user_id,'note','Upravena interní poznámka.');
 const next=await visible(env,m,id);
 if(changed.includes('status')) await notify(env,next,'Poptávka '+next.public_number,inquiryStatusLabel(status),'inquiry:'+id+':status:'+next.version);
 return json({inquiry:dto(next)});
}
async function linkCustomer(request,env,m,h,id){
 const {fail,json,body,expectedVersion,validId}=h,b=await body(request,2000);
 const version=expectedVersion(b?.version),customerId=validId(b?.customerId),row=await visible(env,m,id);
 if(!row) fail(404,'Poptávka nebyla nalezena.');
 if(row.job_id) fail(409,'Poptávka už je převedená na zakázku.');
 if(row.version!==version) fail(409,'Poptávku mezitím změnil kolega. Načtěte ji znovu.');
 const customer=await env.DB.prepare('SELECT id,name FROM customers WHERE id=? AND deleted=0').bind(customerId).first();
 if(!customer) fail(404,'Zákazník nebyl nalezen.');
 const saved=await env.DB.prepare('UPDATE inquiries SET customer_id=?,version=version+1,updated_at=? WHERE id=? AND version=? AND job_id IS NULL AND '+managerSql).bind(customerId,Date.now(),id,version,m.user_id).run();
 if(!saved.meta.changes) fail(409,'Poptávku mezitím změnil kolega. Načtěte ji znovu.');
 await event(env,id,m.user_id,'link','Propojena se zákazníkem '+customer.name+'.');
 return json({inquiry:dto(await visible(env,m,id))});
}
function jobTypeFor(serviceType){return inquiryService(serviceType)?.jobType||'service';}
export function inquiryWriteDiscipline(member, row, requested, fail){
  const asked = requested && requested !== 'all' ? requested : '';
  const fromInquiry = row?.category === 'irrigation' || row?.category === 'garden' ? row.category : '';
  if(!member?._workspace) return asked || fromInquiry || null;
  const allowed = (member._workspace.disciplines||[]).filter(item=>item==='irrigation'||item==='garden');
  const choice = asked || fromInquiry;
  if(choice && allowed.includes(choice)) return choice;
  if(fromInquiry && !allowed.includes(fromInquiry)) fail(403,'K oboru této poptávky nemáte přístup.');
  fail(409,'Poptávka patří oběma oborům. Vyberte závlahu, nebo Garden.',{code:'discipline_required',choices:allowed});
}
async function convertInquiry(request,env,m,h,id){
 const {fail,json,body,cleanText,expectedVersion,validId}=h,b=await body(request,20000);
 if(!b||typeof b!=='object') fail(400,'Zkontrolujte převod.');
 const row=await visible(env,m,id);if(!row) fail(404,'Poptávka nebyla nalezena.');
 const found=await duplicates(env,row);
 if(b.preview===true){
  const unambiguous=row.category==='irrigation'||row.category==='garden'?row.category:null;
  const choices=unambiguous?[]:(m._workspace?.disciplines||['irrigation','garden']).filter(item=>item==='irrigation'||item==='garden');
  return json({preview:true,inquiry:dto(row),duplicates:found,discipline:unambiguous,disciplineChoices:choices,suggestion:{title:`${inquiryServiceLabel(row.service_type)} · ${row.last_name}`.slice(0,120),jobType:jobTypeFor(row.service_type),description:row.description,address:row.address,city:row.city,dueDate:row.preferred_date,customerName:`${row.first_name} ${row.last_name}`.trim(),company:row.company,discipline:unambiguous}});
 }
 const version=expectedVersion(b.version);
 if(row.version!==version) fail(409,'Poptávku mezitím změnil kolega. Načtěte ji znovu.');
 if(row.job_id) fail(409,'Z této poptávky už zakázka vznikla.',{jobId:row.job_id});
 const discipline=inquiryWriteDiscipline(m,row,b.discipline||b.job?.discipline,fail);
 if(!['existing','new'].includes(b.mode)) fail(400,'Vyberte existujícího zákazníka, nebo založení nového.');
 if(b.mode==='new'&&found.customers.length&&b.acknowledgeDuplicates!==true) fail(409,'Stejný telefon nebo e-mail už v adresáři je. Propojte ho, nebo potvrďte, že chcete přesto založit nového.',{code:'duplicate_customer',matches:found.customers});
 let customerId=b.mode==='existing'?validId(b.customerId):null;
 if(b.mode==='existing'){if(!await env.DB.prepare('SELECT id FROM customers WHERE id=? AND deleted=0').bind(customerId).first()) fail(404,'Zákazník nebyl nalezen.');}
 else customerId='inq_'+id.replaceAll('-','').slice(0,24);
 const jobInput=b.job&&typeof b.job==='object'?b.job:{};
 const title=cleanText(jobInput.title||`${inquiryServiceLabel(row.service_type)} · ${row.last_name}`,120,true);
 const description=cleanText(jobInput.description??row.description,4000);
 const address=cleanText(jobInput.address??row.address,500);
 const city=cleanText(jobInput.city??row.city,120);
 const dueDate=cleanText(jobInput.dueDate??row.preferred_date,10);
 const kinds=await readJobKinds(env);
 const requestedType=jobInput.jobType;
 const jobType=kinds.some(kind=>kind.id===requestedType)?requestedType:jobTypeFor(row.service_type);
 if(!kinds.some(kind=>kind.id===jobType)) fail(400,'Vyberte druh práce z číselníku zakázek.');
 const assignedTo=jobInput.assignedTo?validId(jobInput.assignedTo):m.user_id;
 if(!await env.DB.prepare('SELECT user_id FROM members WHERE user_id=?').bind(assignedTo).first()) fail(400,'Vyberte člověka z týmu.');
 const claimed=await env.DB.prepare(`UPDATE inquiries SET version=version+1,updated_at=? WHERE id=? AND version=? AND job_id IS NULL AND ${managerSql}`).bind(Date.now(),id,version,m.user_id).run();
 if(!claimed.meta.changes) fail(409,'Poptávku právě převádí někdo jiný, nebo se změnila.');
 let gardenId=row.garden_id;
 if(b.mode==='new'&&!await env.DB.prepare('SELECT id FROM customers WHERE id=?').bind(customerId).first()){
  const name=cleanText(jobInput.customerName||`${row.first_name} ${row.last_name}`,160,true);
  const created=await handleCustomers(jsonRequest(request,`/api/customers/${customerId}`,{version:0,...(discipline?{discipline}:{}),name,email:row.email,phones:[{id:'phone',label:'Mobil',number:row.phone}],addresses:[{id:'site',label:'Realizace',address:row.street,city:row.city}],contactNotes:row.company?`Firma: ${row.company}`:'',irrigationOrigin:'unknown'}),env,m,h);
  const data=await created.json();
  if(!created.ok) fail(created.status,data.error||'Zákazníka se nepodařilo založit.');
  const garden=await env.DB.prepare('SELECT id FROM gardens WHERE customer_id=? AND deleted=0 ORDER BY created_at LIMIT 1').bind(customerId).first();
  gardenId=garden?.id||null;
 }
 if(b.mode==='existing'&&!gardenId){
  const gardens=await env.DB.prepare('SELECT id FROM gardens WHERE customer_id=? AND deleted=0 ORDER BY created_at LIMIT 1').bind(customerId).first();
  gardenId=gardens?.id||null;
 }
 const jobId='job_'+id.replaceAll('-','').slice(0,20);
 const job=await handleJobs(jsonRequest(request,`/api/jobs/${jobId}`,{version:0,...(discipline?{discipline}:{}),title,jobType,customerId,customerAddressId:b.mode==='new'?'site':null,customerName:`${row.first_name} ${row.last_name}`.trim(),city,description,address,gardenId,assignedTo,dueDate,status:'planned',incompleteReason:''}),env,m,h);
 const jobData=await job.json();
 if(!job.ok) fail(job.status,jobData.error||'Zakázku se nepodařilo založit.');
 const finalGarden=jobData.job?.gardenId||gardenId||null;
 await env.DB.prepare(`UPDATE inquiries SET status='converted',customer_id=?,garden_id=?,job_id=?,updated_at=? WHERE id=? AND job_id IS NULL`).bind(customerId,finalGarden,jobId,Date.now(),id).run();
 await event(env,id,m.user_id,'convert','Převedena na zakázku '+title+'.');
 await copyPhotos(env,m,row,jobId);
 const next=await visible(env,m,id);
 await notify(env,next,'Poptávka převedena na zakázku',next.public_number+' · '+title,'inquiry:'+id+':converted');
 return json({inquiry:dto(next),jobId,customerId});
}
function jsonRequest(original,path,value){
 const headers=new Headers(original.headers);headers.set('content-type','application/json');
 return new Request(new URL(original.url).origin+path,{method:'PUT',headers,body:JSON.stringify(value)});
}
async function copyPhotos(env,m,row,jobId){
 const photos=(await env.DB.prepare('SELECT * FROM inquiry_photos WHERE inquiry_id=?').bind(row.id).all()).results||[];
 for(const photo of photos){
  try{
   const object=await env.BUCKET.get(photo.object_key);if(!object) continue;
   const bytes=new Uint8Array(await object.arrayBuffer()),key=`jobs/${jobId}/inquiry-${photo.id}`;
   await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:photo.mime_type}});
   await env.DB.prepare(`INSERT OR IGNORE INTO service_photos(id,job_id,object_key,mime_type,size,name,sha256,status,created_at,created_by,gallery_upload) VALUES(?,?,?,?,?,?,?,'ready',?,?,1)`).bind('inq'+photo.id.replaceAll('-','').slice(0,16),jobId,key,photo.mime_type,photo.size,photo.name,photo.sha256,Date.now(),m.user_id).run();
  }catch{/* The inquiry keeps the original photo if the job gallery rejects the copy. */}
 }
}
function lineOf(row){return `• ${row.public_number} · ${row.first_name} ${row.last_name} · ${inquiryCategoryLabel(row.category)} · ${inquiryStatusLabel(row.status)} · ${row.city}`;}
async function accessibleRows(env,m,where,args,limit=8){
 const rows=await env.DB.prepare(`SELECT * FROM inquiries WHERE ${managerSql} AND ${where} ORDER BY CASE WHEN status='new' THEN 0 ELSE 1 END, created_at DESC LIMIT ${limit}`).bind(m.user_id,...args).all();
 return rows.results||[];
}
export async function inquiryCommand(env,m,h,intent,params,options){
 if(!INQUIRY_MANAGERS.includes(m.role)) return {reply:'Poptávky vidí správce. Nic jsem nezměnil.'};
 if(intent==='inquiries.count'){
  const rows=await accessibleRows(env,m,params.category?`status='new' AND category=?`:`status='new'`,params.category?[params.category]:[],200);
  const label=params.category?inquiryCategoryLabel(params.category):'';
  return {reply:rows.length?`Nové poptávky${label?' · '+label:''}: ${rows.length}.\n`+rows.slice(0,8).map(lineOf).join('\n'):`Nová poptávka${label?' v kategorii '+label:''} tu není. Dokončené a archivované do toho nepočítám.`};
 }
 if(intent==='inquiries.open'){
  const clauses=["status NOT IN ('converted','rejected','archived')"],args=[];
  if(params.statuses?.length){clauses.push(`status IN (${params.statuses.map(()=>'?').join(',')})`);args.push(...params.statuses);}
  else if(params.status){clauses.push('status=?');args.push(params.status);}
  if(params.category){clauses.push('category=?');args.push(params.category);}
  if(params.query){const pattern='%'+String(params.query).replace(/[\\%_]/g,'\\$&')+'%';clauses.push("(public_number LIKE ? ESCAPE '\\' OR first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\')");args.push(pattern,pattern,pattern,pattern,pattern,pattern);}
  const rows=await accessibleRows(env,m,clauses.join(' AND '),args,12);
  const title=params.statuses? 'Poptávky, které čekají na nabídku nebo rozhodnutí':'Poptávky';
  return {reply:rows.length?`${title}:\n`+rows.map(lineOf).join('\n'):'Tomuto filtru neodpovídá žádná otevřená poptávka. Uzavřené jsem do výběru nedal.'};
 }
 const row=await pickInquiry(env,m,params);
 if(row?.choices) return {reply:'Vidím víc poptávek:\n'+row.choices.map(lineOf).join('\n')+'\nUpřesněte číslo nebo jméno. Nic jsem nezměnil.'};
 if(!row) return {reply:'Žádnou odpovídající otevřenou poptávku jsem nenašel. Uzavřenou jsem si za ni nedosadil.'};
 if(intent==='inquiries.detail') return {reply:detailReply(row,params.mode||'summary')};
 if(intent==='inquiries.status'){
  if(!INQUIRY_STATUSES.some(item=>item.id===params.status)||params.status==='converted') return {reply:'Jaký stav mám nastavit? Převod na zakázku je samostatné potvrzení. Nic jsem nezměnil.'};
  if(row.status==='converted') return {reply:`${row.public_number} už je převedená na zakázku. Stav jsem neměnil.`};
  if(!options.propose){
   const saved=await env.DB.prepare(`UPDATE inquiries SET status=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status<>'converted' AND ${managerSql}`).bind(params.status,Date.now(),row.id,row.version,m.user_id).run();
   if(!saved.meta.changes) return {reply:'Poptávku mezitím někdo změnil. Stav jsem nenastavil.'};
   await event(env,row.id,m.user_id,'status','Stav: '+inquiryStatusLabel(params.status)+'.');
   return {reply:`${row.public_number} má stav ${inquiryStatusLabel(params.status)}.`,mutated:'inquiries'};
  }
  return {reply:`Mám u ${row.public_number} (${row.first_name} ${row.last_name}) nastavit stav ${inquiryStatusLabel(params.status)}? Zatím jsem nic neuložil.`,proposal:{params:{...params,inquiryId:row.id,status:params.status},summary:`Nastavit ${row.public_number} na ${inquiryStatusLabel(params.status)}.`}};
 }
 if(intent==='inquiries.convert'){
  if(row.job_id) return {reply:`${row.public_number} už má zakázku. Druhou jsem nezaložil.`};
  const found=await duplicates(env,row);
  const mode=found.customers.length===1?'existing':'new';
  const customerId=found.customers.length===1?found.customers[0].id:null;
  const proposalParams={inquiryId:row.id,mode,customerId,acknowledgeDuplicates:false,job:{title:`${inquiryServiceLabel(row.service_type)} · ${row.last_name}`.slice(0,120),jobType:jobTypeFor(row.service_type),description:row.description,address:row.address,city:row.city,dueDate:row.preferred_date,assignedTo:m.user_id}};
  if(found.customers.length>1) return {reply:`U ${row.public_number} vidím víc zákazníků se stejným kontaktem:\n`+found.customers.map(item=>'• '+item.name).join('\n')+'\nVyberte propojení v detailu poptávky. Nového jsem nezaložil.'};
  if(!options.propose){
   const current=await visible(env,m,row.id);
   const result=await convertInquiry(jsonRequest({url:'https://diary.internal/api/inquiries/'+row.id+'/convert',headers:h._headers||new Headers()},`/api/inquiries/${row.id}/convert`,{...proposalParams,version:current.version}),env,m,h,row.id);
   const data=await result.json();
   if(!result.ok) return {reply:data.error||'Převod se nepodařil. Nic dalšího jsem nezaložil.'};
   return {reply:`Z poptávky ${row.public_number} je zakázka. Původní poptávka zůstala v historii.`,mutated:'inquiries'};
  }
  const who=customerId?`propojím ji se zákazníkem ${found.customers[0].name}`:'založím nového zákazníka';
  return {reply:`Mám z ${row.public_number} (${row.first_name} ${row.last_name}, ${inquiryServiceLabel(row.service_type)}) udělat zakázku? ${who[0].toUpperCase()}${who.slice(1)}. Zatím jsem nic neuložil.`,proposal:{params:proposalParams,summary:`Převést ${row.public_number} na zakázku.`}};
 }
 return {reply:'Tomuhle u poptávek nerozumím. Nic jsem nezměnil.'};
}
async function pickInquiry(env,m,params){
 if(params.inquiryId){const row=await visible(env,m,params.inquiryId);return row||null;}
 if(params.query){
  const needle=String(params.query).replace(/\D/g,'');
  const rows=await accessibleRows(env,m,needle.length>=6?"(phone_key=? OR public_number LIKE ? OR last_name LIKE ? OR first_name LIKE ?)":"(public_number LIKE ? OR last_name LIKE ? OR first_name LIKE ?)",needle.length>=6?[needle.slice(-9),'%'+params.query+'%','%'+params.query+'%','%'+params.query+'%']:['%'+params.query+'%','%'+params.query+'%','%'+params.query+'%'],8);
  if(rows.length===1) return rows[0];
  if(rows.length>1) return {choices:rows};
  return null;
 }
 const rows=await accessibleRows(env,m,`status NOT IN ('converted','rejected','archived')`,[],1);
 return rows[0]||null;
}
function detailReply(row,mode){
 const base=`${row.public_number} · ${row.first_name} ${row.last_name}${row.company?' · '+row.company:''}\n${inquiryCategoryLabel(row.category)} · ${inquiryServiceLabel(row.service_type)} · ${inquiryStatusLabel(row.status)}\n${row.address}\n${row.phone} · ${row.email}\n${row.description}`;
 const extras=JSON.parse(row.extras||'{}');
 const missing=[];
 if(!row.preferred_date) missing.push('preferovaný termín');
 if(!row.photo_count) missing.push('fotografie místa');
 if(row.category!=='garden'&&!extras.area) missing.push('přibližná velikost zavlažované plochy');
 if(row.category!=='garden'&&!extras.water) missing.push('zdroj vody');
 if(row.description.length<40) missing.push('podrobnější popis toho, co je špatně nebo co se má udělat');
 if(mode==='missing') return missing.length?`U ${row.public_number} ještě nemáme:\n`+missing.map(item=>'• '+item).join('\n')+'\nNic jsem zákazníkovi neposlal.':`U ${row.public_number} nevidím prázdnou povinnou položku. Cenu ani termín realizace jsem si nevymyslel.`;
 if(mode==='reply') return `Návrh odpovědi, nic jsem neodeslal:\n\nDobrý den, ${row.first_name},\n\nděkujeme za poptávku ${row.public_number} (${inquiryServiceLabel(row.service_type).toLowerCase()}, ${row.city}).${missing.length?' Abychom připravili konkrétní postup, potřebujeme ještě: '+missing.join(', ')+'.':''}\nOzveme se vám na ${row.phone}.\n\nS pozdravem`;
 const extraText=extras.area||extras.water||extras.gardenNote?`\nDoplnění: ${[extras.area,extras.water,extras.gardenNote].filter(Boolean).join(' · ')}`:'';
 return `Shrnutí podle uložených údajů, bez odhadu ceny:\n${base}${extraText}${row.preferred_date?'\nPreferovaný termín: '+row.preferred_date:''}${missing.length?'\nChybí: '+missing.join(', '):''}`;
}
