import {workspaceDisciplineSql} from './workspace-policy.js';
import {workspaceWriteDiscipline} from './workspace-resources.js';
import {jobAssignedIds,jobAssignment} from './assignments.js';
import {subDate,subAddDays,subPeriodEnd,subToday,subSuggestedDates,subBalances} from '../web/subscription-model.js';
export const subAll=(db,sql,...args)=>db.prepare(sql).bind(...args).all().then(r=>r.results);
export const subOne=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
export const subScope=`EXISTS(SELECT 1 FROM members a WHERE a.user_id=? AND ${workspaceDisciplineSql('s.discipline','a','subscriptions')} AND (a.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM subscription_periods sp JOIN jobs sj ON sj.service_period_id=sp.id WHERE sp.subscription_id=s.id AND (sj.assigned_to=a.user_id OR EXISTS(SELECT 1 FROM json_each(sj.assigned_users) selected WHERE selected.value=a.user_id)) AND sj.deleted=0 AND sj.service_approval='confirmed')))`;
const subManagerGate="EXISTS(SELECT 1 FROM members a WHERE a.user_id=? AND a.role IN ('owner','administrator','admin'))";
export async function subHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function subReplay(env,id,userId,entity,hash,fail){const old=await subOne(env.DB,'SELECT * FROM subscription_operations WHERE id=?',id);if(!old)return false;if(old.user_id!==userId||old.entity_id!==entity||old.hash!==hash)fail(409,'Identifikátor požadavku už byl použit pro jinou změnu.');return true;}
export function subOperation(env,id,user,entity,hash,gate,args){return env.DB.prepare(`INSERT OR IGNORE INTO subscription_operations(id,user_id,entity_id,hash,created_at) SELECT ?,?,?,?,? WHERE ${gate}`).bind(id,user,entity,hash,Date.now(),...args);}
export async function subBundle(env,m,rows){
 if(!rows.length)return [];const ids=rows.map(r=>r.id),marks=ids.map(()=>'?').join(','),manager=['owner','administrator','admin'].includes((await subOne(env.DB,'SELECT role FROM members WHERE user_id=?',m.user_id))?.role);
 const [rawPeriods,usage,visits,payments]=await Promise.all([
  subAll(env.DB,`SELECT * FROM subscription_periods WHERE subscription_id IN (${marks}) ORDER BY start_date`,...ids),
  subAll(env.DB,`SELECT u.* FROM subscription_usage u JOIN subscription_periods p ON p.id=u.period_id WHERE p.subscription_id IN (${marks})`,...ids),
  subAll(env.DB,`SELECT j.deleted,j.id,j.title,j.job_type,j.service_period_id,j.service_item_id,j.service_unit,j.service_approval,j.material_status,j.material_note,j.status,j.due_date,j.start_time,j.end_time,j.assigned_to,j.assigned_users,COALESCE((SELECT group_concat(member.name, ', ') FROM members member WHERE member.user_id=j.assigned_to OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) selected WHERE selected.value=member.user_id)),j.assigned_name) assigned_name,(SELECT date FROM service_reports sr WHERE sr.job_id=j.id) completed_date,j.version FROM jobs j JOIN subscription_periods p ON p.id=j.service_period_id WHERE p.subscription_id IN (${marks}) ${manager?'':"AND j.deleted=0 AND (j.assigned_to=? OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) selected WHERE selected.value=?)) AND j.service_approval='confirmed'"} ORDER BY j.due_date,j.start_time,j.id`,...ids,...(manager?[]:[m.user_id,m.user_id])),
  manager?subAll(env.DB,`SELECT pay.* FROM subscription_payments pay JOIN subscription_periods p ON p.id=pay.period_id WHERE p.subscription_id IN (${marks}) ORDER BY pay.date DESC`,...ids):Promise.resolve([])
 ]);
 const periods=rawPeriods.map(p=>({id:p.id,subscriptionId:p.subscription_id,tariffId:p.tariff_id,snapshot:JSON.parse(p.snapshot),startDate:p.start_date,endDate:p.end_date,agreedPrice:p.agreed_price,initialUsage:JSON.parse(p.initial_usage),carryFromId:p.carry_from_id,paymentStatus:p.payment_status,dueDate:p.due_date,settlement:p.settlement,planningMode:p.planning_mode,planConfirmedAt:p.plan_confirmed_at}));
 const balances=subBalances(periods,usage.map(u=>({periodId:u.period_id,serviceId:u.service_id,units:u.units,active:!!u.active}))),today=subToday();
 return rows.map(row=>{
  const ownPeriods=periods.filter(p=>p.subscriptionId===row.id).map(p=>({...p,services:balances[p.id],paymentStatus:p.paymentStatus!=='paid'&&p.dueDate<today?'overdue':p.paymentStatus,received:payments.filter(pay=>pay.period_id===p.id).reduce((s,pay)=>s+pay.amount,0)}));
  const current=ownPeriods.find(p=>p.startDate<=today&&p.endDate>=today)||ownPeriods.filter(p=>p.startDate>today)[0]||ownPeriods.at(-1);
  const jobs=visits.filter(j=>ownPeriods.some(p=>p.id===j.service_period_id)).map(j=>({id:j.id,cancelled:!!j.deleted,title:j.title,jobType:j.job_type,periodId:j.service_period_id,serviceId:j.service_item_id,unit:j.service_unit,approval:j.service_approval,materialStatus:j.material_status,materialNote:j.material_note,status:j.status,dueDate:j.due_date,startTime:j.start_time,endTime:j.end_time,assignedTo:j.assigned_to,assignedTos:jobAssignedIds(j),assignedName:j.assigned_name,version:j.version,completedDate:j.completed_date}));
  return {id:row.id,...(m._workspace?{discipline:row.discipline}:{}),customerId:row.customer_id,customerName:row.customer_name||'Smazaný zákazník',gardenId:row.garden_id,gardenName:row.garden_name||'',status:row.status,version:row.version,periods:manager?ownPeriods:ownPeriods.map(({agreedPrice,received,...period})=>{const {priceMinor,...snapshot}=period.snapshot;return {...period,snapshot};}),currentPeriodId:current?.id||null,jobs,nearestVisit:jobs.find(j=>!j.cancelled&&j.approval==='confirmed'&&j.status!=='done'&&j.dueDate>=today)||null,payments:payments.filter(pay=>ownPeriods.some(p=>p.id===pay.period_id)).map(p=>({id:p.id,periodId:p.period_id,date:p.date,amount:p.amount,note:p.note}))};
 });
}
export async function subRead(env,m,id,fail){const row=await subOne(env.DB,`SELECT s.*,c.name customer_name,g.name garden_name FROM subscriptions s LEFT JOIN customers c ON c.id=s.customer_id AND c.deleted=0 LEFT JOIN gardens g ON g.id=s.garden_id AND g.deleted=0 WHERE s.id=? AND s.deleted_at IS NULL AND ${subScope}`,id,m.user_id);if(!row)fail(404,'Předplatné nebylo nalezeno.');return (await subBundle(env,m,[row]))[0];}
export async function handleSubscriptions(request,env,m,h){
 const {body,fail,json,cleanText,validId}=h,path=new URL(request.url).pathname,method=request.method,manager=['owner','administrator','admin'].includes(m.role);
 const manage=()=>{if(!manager)fail(403,'Předplatné, ceny a tarify spravuje vlastník nebo správce.');};
 const integer=(v,max=100000000)=>{if(!Number.isSafeInteger(v)||v<0||v>max)fail(400,'Zadejte platné nezáporné číslo.');return v;};
 const flag=v=>{if(typeof v!=='boolean')fail(400,'Neplatné přepnutí služby.');return v;};
 const date=v=>{if(!subDate(v))fail(400,'Vyberte platné datum.');return v;};
 const tariffDTO=r=>({id:r.id,...(m._workspace?{discipline:r.discipline}:{}),definition:JSON.parse(r.definition),active:!!r.active,version:r.version});
 const definition=v=>{
  if(!v||!Array.isArray(v.services)||!v.services.length||v.services.length>30||!Array.isArray(v.benefits)||v.benefits.length>30)fail(400,'Tarif musí obsahovat 1 až 30 služeb.');
  const services=v.services.map(s=>{if(!['service','blowout','spring','other'].includes(s.kind)||!['yearly','monthly','quarterly','custom'].includes(s.frequency)||!Array.isArray(s.months)||s.months.some(n=>!Number.isInteger(n)||n<1||n>12))fail(400,'Zkontrolujte druh, frekvenci a měsíce služby.');return {id:s.kind==='other'?validId(s.id):s.kind,kind:s.kind,name:cleanText(s.name,120,true),description:cleanText(s.description||'',2000),count:integer(s.count,120),frequency:s.frequency,months:[...new Set(s.months)],autoPlan:flag(s.autoPlan),deduct:flag(s.deduct),included:flag(s.included),limit:cleanText(s.limit||'',1000)};});
  if(new Set(services.map(s=>s.id)).size!==services.length||services.filter(s=>s.autoPlan).reduce((n,s)=>n+s.count,0)>80)fail(400,'Identifikátory služeb musí být jedinečné. Automatický plán podporuje nejvýše 80 návštěv za období.');
  const currency=cleanText(v.currency,3,true).toUpperCase();try{new Intl.NumberFormat('cs-CZ',{style:'currency',currency}).format(1);}catch{fail(400,'Zadejte třípísmenný kód měny, například CZK.');}
  if(!['monthly','yearly'].includes(v.billingPeriod))fail(400,'Vyberte fakturační období.');
  return {code:cleanText(v.code||'',30),name:cleanText(v.name,120,true),priceMinor:integer(v.priceMinor),currency,billingPeriod:v.billingPeriod,description:cleanText(v.description||'',3000),priority:flag(v.priority),autoConfirm:flag(v.autoConfirm),partsIncluded:flag(v.partsIncluded),extraRepairsIncluded:flag(v.extraRepairsIncluded),visitLimit:cleanText(v.visitLimit||'',1000),terms:cleanText(v.terms||'',4000),benefits:v.benefits.map(b=>cleanText(b,300,true)),services};
 };
 const catalogWhere=m._workspace?"discipline IN ('irrigation','garden') AND (? IS NULL OR discipline=?)":'1=1',catalogDiscipline=m._workspace?.selectedDiscipline==='all'?null:m._workspace?.selectedDiscipline,catalogArgs=m._workspace?[catalogDiscipline,catalogDiscipline]:[];
 if(path==='/api/tariffs'&&method==='GET'){manage();return json({tariffs:(await subAll(env.DB,`SELECT * FROM service_tariffs WHERE ${catalogWhere} ORDER BY json_extract(definition,'$.priceMinor'),created_at,id`,...catalogArgs)).map(tariffDTO)});}
 if(path==='/api/tariffs/options'&&method==='GET'){manage();return json({tariffs:(await subAll(env.DB,`SELECT * FROM service_tariffs WHERE active=1 AND ${catalogWhere} ORDER BY json_extract(definition,'$.priceMinor'),created_at,id`,...catalogArgs)).map(tariffDTO)});}
 const tariffMatch=path.match(/^\/api\/tariffs\/([-\w]{1,100})$/);
 if(tariffMatch&&method==='PUT'){
  manage();const id=tariffMatch[1],b=await body(request,60000),d=definition(b.definition),active=flag(b.active),version=integer(b.version),now=Date.now();
  const old=await subOne(env.DB,'SELECT * FROM service_tariffs WHERE id=?',id),discipline=workspaceWriteDiscipline(m,b,old,fail);if((old?.version||0)!==version)fail(409,'Tarif se mezitím změnil. Obnovte jej před uložením.');
  const sql=old?'UPDATE service_tariffs SET definition=?,active=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND '+subManagerGate:'INSERT OR IGNORE INTO service_tariffs(discipline,id,definition,active,version,created_at,updated_at,updated_by) SELECT ?,?,?,?,1,?,?,? WHERE '+subManagerGate;
  const args=old?[JSON.stringify(d),Number(active),now,m.user_id,id,version,m.user_id]:[discipline,id,JSON.stringify(d),Number(active),now,now,m.user_id,m.user_id];
  const result=await env.DB.prepare(sql).bind(...args).run();if(!result.meta.changes)fail(409,'Tarif nelze uložit, obnovte jej a ověřte oprávnění.');return json({tariff:tariffDTO(await subOne(env.DB,'SELECT * FROM service_tariffs WHERE id=?',id))});
 }
 if(path==='/api/subscriptions'&&method==='GET'){
  const u=new URL(request.url),q=cleanText(u.searchParams.get('q')||'',100),clauses=['s.deleted_at IS NULL',subScope],args=[m.user_id],today=subToday();
  if(q){clauses.push("c.name LIKE ? ESCAPE '\\'");args.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');}
  for(const [param,column,allowed]of [['status','s.status',['active','paused','ended']],['payment','cp.payment_status',['unpaid','partial','paid','overdue']]]){const v=u.searchParams.get(param);if(v){if(!allowed.includes(v))fail(400,'Neplatný filtr.');if(param==='payment'){clauses.push("(CASE WHEN cp.payment_status<>'paid' AND cp.due_date<? THEN 'overdue' ELSE cp.payment_status END)=?");args.push(today,v);}else{clauses.push(column+'=?');args.push(v);}}}
  if(u.searchParams.get('customerId')){clauses.push('s.customer_id=?');args.push(validId(u.searchParams.get('customerId')));}
  if(u.searchParams.get('tariff')){clauses.push('cp.tariff_id=?');args.push(validId(u.searchParams.get('tariff')));}
  if(u.searchParams.get('expiring')==='1'){clauses.push('cp.end_date BETWEEN ? AND ?');args.push(today,subAddDays(today,30));}
  if(u.searchParams.get('until')){clauses.push('cp.end_date<=?');args.push(date(u.searchParams.get('until')));}
  const cursor=u.searchParams.get('cursor');if(cursor){validId(cursor);clauses.push('s.id>?');args.push(cursor);}
  const rows=await subAll(env.DB,`SELECT s.*,c.name customer_name,g.name garden_name FROM subscriptions s LEFT JOIN customers c ON c.id=s.customer_id AND c.deleted=0 LEFT JOIN gardens g ON g.id=s.garden_id AND g.deleted=0 LEFT JOIN subscription_periods cp ON cp.id=(SELECT p.id FROM subscription_periods p WHERE p.subscription_id=s.id ORDER BY CASE WHEN p.start_date<=? AND p.end_date>=? THEN 0 WHEN p.start_date>? THEN 1 ELSE 2 END,CASE WHEN p.start_date>? THEN p.start_date END ASC,p.start_date DESC LIMIT 1) WHERE ${clauses.join(' AND ')} ORDER BY s.id LIMIT 26`,today,today,today,today,...args);
  return json({subscriptions:await subBundle(env,m,rows.slice(0,25)),nextCursor:rows.length>25?rows[24].id:null});
 }
 const match=path.match(/^\/api\/subscriptions\/([-\w]{1,100})(?:\/(activate|change|renew|state|payment|plan|confirm-plan|visit))?$/);if(!match)fail(404,'Nenalezeno.');
 const id=match[1],action=match[2];if(!action&&method==='GET')return json({subscription:await subRead(env,m,id,fail)});
 manage();
 if(!action&&method==='DELETE'){
  const b=await body(request,2000),operationId=validId(b.operationId),version=integer(b.version),hash=await subHash(JSON.stringify({path,body:b}));
  if(await subReplay(env,operationId,m.user_id,id,hash,fail))return json({ok:true,replayed:true});
  const old=await subOne(env.DB,'SELECT * FROM subscriptions WHERE id=? AND deleted_at IS NULL',id);if(!old){if(await subReplay(env,operationId,m.user_id,id,hash,fail))return json({ok:true,replayed:true});fail(404,'Předplatné nebylo nalezeno.');}if(old.status!=='ended')fail(409,'Smazat lze pouze ukončené předplatné. Nejdříve ho ukončete.');if(old.version!==version)fail(409,'Předplatné mezitím změnil jiný správce. Obnovte detail.');
  const now=Date.now(),gate="EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND deleted_at IS NOT NULL AND last_operation=? AND version=?) AND NOT EXISTS(SELECT 1 FROM subscription_operations WHERE id=?)",args=[id,operationId,version+1,operationId];
  const result=await env.DB.batch([
   env.DB.prepare(`UPDATE subscriptions SET deleted_at=?,deleted_by=?,last_operation=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND status='ended' AND deleted_at IS NULL AND ${subManagerGate}`).bind(now,m.user_id,operationId,now,m.user_id,id,version,m.user_id),
   subOperation(env,operationId,m.user_id,id,hash,gate,args)
  ]);
  if(!result[0].meta.changes&&!await subReplay(env,operationId,m.user_id,id,hash,fail))fail(409,'Předplatné se změnilo nebo již nemáte oprávnění ke smazání. Obnovte detail.');
  return json({ok:true});
 }
 if(method!=='POST')fail(405,'Nepodporovaná operace.');
 const b=await body(request,20000),operationId=validId(b.operationId),hash=await subHash(JSON.stringify({path,body:b}));
 if(await subReplay(env,operationId,m.user_id,id,hash,fail))return json({subscription:await subRead(env,m,id,fail),replayed:true});
 const old=await subOne(env.DB,'SELECT * FROM subscriptions WHERE id=?',id),version=integer(b.version),now=Date.now();if(old?.deleted_at)fail(404,'Předplatné bylo smazáno.');
 if((old?.version||0)!==version)fail(409,'Předplatné mezitím změnil jiný správce. Obnovte detail.');
 if(action!=='activate'&&!old)fail(404,'Předplatné nebylo nalezeno.');if(action==='activate'&&old)fail(409,'Předplatné už existuje.');
 const discipline=workspaceWriteDiscipline(m,b,old,fail);
 const gate="EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND last_operation=? AND version=?) AND NOT EXISTS(SELECT 1 FROM subscription_operations WHERE id=?)",gateArgs=[id,operationId,version+1,operationId];
 const statements=[];let newPeriod=null,newJobs=[];
 if(['activate','change','renew'].includes(action)){
  const tariff=await subOne(env.DB,'SELECT * FROM service_tariffs WHERE id=? AND active=1',validId(b.tariffId));if(!tariff||m._workspace&&tariff.discipline!==discipline)fail(400,'Vyberte aktivní tarif stejného pracovního oboru.');
  if(b.tariffVersion!==undefined&&b.tariffVersion!==tariff.version)fail(409,'Tarif se od výběru změnil. Obnovte nabídku a zkontrolujte podmínky.');
  const snapshot=JSON.parse(tariff.definition),customer=await subOne(env.DB,'SELECT * FROM customers WHERE id=? AND deleted=0',validId(old?.customer_id||b.customerId));if(!customer)fail(400,'Vyberte zákazníka z adresáře.');
  const gardenId=old?old.garden_id:(b.gardenId==null?null:validId(b.gardenId)),garden=gardenId?await subOne(env.DB,'SELECT * FROM gardens WHERE id=? AND customer_id=? AND deleted=0',gardenId,customer.id):null;if(gardenId&&!garden)fail(400,'Vyberte zahradu propojenou s tímto zákazníkem.');
  if(b.planLater!==undefined&&typeof b.planLater!=='boolean')fail(400,'Neplatná volba plánování.');const planLater=b.planLater===true,assignment=planLater?null:await jobAssignment(env,{...b,discipline},null,fail),assignee=assignment?.primary;if(!planLater&&!assignee)fail(400,'Vyberte člena týmu.');
  const start=date(b.startDate),end=date(b.endDate||subPeriodEnd(start,snapshot.billingPeriod));if(end<start||end>subAddDays(start,1096))fail(400,'Období musí být platné a nejvýše tříleté.');
  const current=old?await subRead(env,m,id,fail):null,previous=current?.periods.at(-1),settlement=action==='change'?b.settlement:'reset';
  if(!['reset','carry','manual'].includes(settlement))fail(400,'Vyberte způsob vypořádání služeb.');
  if(action==='change'&&(!previous||start<subToday()||start<=previous.startDate||start>previous.endDate))fail(400,'Změna musí začít od dneška do konce posledního sjednaného období, po jeho začátku.');
  if(action==='renew'&&(!previous||start<=previous.endDate))fail(400,'Prodloužení musí začít po konci posledního sjednaného období.');
  if(action==='change'&&current.jobs.some(j=>j.periodId===previous.id&&!j.cancelled&&j.status==='done'&&(j.completedDate||j.dueDate)>=start))fail(409,'Za tímto datem je dokončený servis. Zvolte pozdější účinnost změny.');
  const initialUsage={};if(settlement==='manual'){for(const service of snapshot.services)initialUsage[service.id]=integer(b.initialUsage?.[service.id]??0,10000);}
  newPeriod={id:validId(b.periodId),start,end,snapshot,tariffId:tariff.id,price:integer(b.agreedPrice??snapshot.priceMinor),dueDate:date(b.dueDate||start),settlement,carryFromId:settlement==='carry'?previous.id:null,initialUsage};
  const projected={id:newPeriod.id,subscriptionId:id,snapshot,initialUsage,carryFromId:newPeriod.carryFromId},allPeriods=[...(current?.periods||[]),projected];
  const usage=old?await subAll(env.DB,'SELECT u.* FROM subscription_usage u JOIN subscription_periods p ON p.id=u.period_id WHERE p.subscription_id=?',id):[];
  const balances=subBalances(allPeriods,usage.map(u=>({periodId:u.period_id,serviceId:u.service_id,units:u.units,active:!!u.active})))[newPeriod.id];
  const address=garden?.address||JSON.parse(customer.addresses)[0]?.address||'',city=JSON.parse(customer.addresses).find(a=>a.address===address)?.city||'';
  for(const service of snapshot.services.filter(s=>s.autoPlan&&!planLater)){
   const remaining=balances.find(s=>s.id===service.id).remaining,dates=subSuggestedDates(service,start,end,remaining);
   if(remaining&&!dates.length)fail(400,'Doporučené měsíce služby '+service.name+' neleží ve zvoleném období. Upravte období či tarif.');
   for(let i=0;i<dates.length;i++)newJobs.push({id:'svc-'+(await subHash(newPeriod.id+'|'+service.id+'|'+i)).slice(0,40),service,unit:i+1,date:dates[i],title:service.name+' – '+customer.name,address,city,customer,gardenId,assignedTo:assignee.user_id,additional:assignment.additional,assignedName:assignee.name,approval:b.autoConfirm===true?'confirmed':'pending'});
  }
  if(newJobs.length>80)fail(400,'Plán je příliš rozsáhlý. Zmenšete počet automatických návštěv.');
  if(b.autoConfirm===undefined)for(const j of newJobs)j.approval=snapshot.autoConfirm?'confirmed':'pending';
  if(!old)statements.push(env.DB.prepare(`INSERT OR IGNORE INTO subscriptions(discipline,id,customer_id,garden_id,status,version,last_operation,created_at,updated_at,updated_by) SELECT ?,?,?,?,'active',1,?,?,?,? WHERE ${subManagerGate}`).bind(discipline,id,customer.id,gardenId,operationId,now,now,m.user_id,m.user_id));
  if(action==='change'){
   statements.push(env.DB.prepare(`UPDATE subscription_periods SET end_date=? WHERE id=? AND ${gate}`).bind(subAddDays(start,-1),previous.id,...gateArgs));
   statements.push(env.DB.prepare(`UPDATE jobs SET deleted=1,version=version+1,updated_at=?,updated_by=? WHERE service_period_id=? AND due_date>=? AND status<>'done' AND deleted=0 AND ${gate}`).bind(now,m.user_id,previous.id,start,...gateArgs));
  }
  statements.push(env.DB.prepare(`INSERT INTO subscription_periods(id,subscription_id,tariff_id,snapshot,start_date,end_date,agreed_price,initial_usage,payment_status,due_date,settlement,carry_from_id,created_at,planning_mode,plan_confirmed_at,plan_confirmed_by) SELECT ?,?,?,?,?,?,?,?,'unpaid',?,?,?,?,?,?,? WHERE ${gate}`).bind(newPeriod.id,id,newPeriod.tariffId,JSON.stringify(snapshot),start,end,newPeriod.price,JSON.stringify(initialUsage),newPeriod.dueDate,settlement,newPeriod.carryFromId,now,planLater?'gradual':'automatic',planLater?now:null,planLater?m.user_id:null,...gateArgs));
 }
 if(old)statements.unshift(env.DB.prepare(`UPDATE subscriptions SET version=version+1,last_operation=?,updated_at=?,updated_by=? ${action==='state'?',status=?':''} WHERE id=? AND version=? AND deleted_at IS NULL AND ${subManagerGate}`).bind(operationId,now,m.user_id,...(action==='state'?[Object.keys({active:1,paused:1,ended:1}).includes(b.status)?b.status:fail(400,'Neplatný stav předplatného.')]:[]),id,version,m.user_id));
 if(action==='state'&&b.status==='ended')statements.push(env.DB.prepare(`UPDATE jobs SET deleted=1,version=version+1,updated_at=?,updated_by=? WHERE service_period_id IN (SELECT id FROM subscription_periods WHERE subscription_id=?) AND status<>'done' AND deleted=0 AND ${gate}`).bind(now,m.user_id,id,...gateArgs));
 if(action==='payment'){
  const period=await subOne(env.DB,'SELECT * FROM subscription_periods WHERE id=? AND subscription_id=?',validId(b.periodId),id);if(!period||!['unpaid','partial','paid','overdue'].includes(b.paymentStatus))fail(400,'Vyberte období a stav platby.');
  statements.push(env.DB.prepare(`UPDATE subscription_periods SET payment_status=? WHERE id=? AND ${gate}`).bind(b.paymentStatus,period.id,...gateArgs));
  if(b.amount!==undefined&&b.amount!==null&&b.amount!==''){const amount=integer(b.amount);if(!amount)fail(400,'Částka platby musí být kladná.');statements.push(env.DB.prepare(`INSERT INTO subscription_payments(id,period_id,date,amount,note,created_at,created_by) SELECT ?,?,?,?,?,?,? WHERE ${gate}`).bind(operationId,period.id,date(b.date),amount,cleanText(b.note||'',1000),now,m.user_id,...gateArgs));}
 }
 if(action==='confirm-plan'){
  const period=await subOne(env.DB,'SELECT * FROM subscription_periods WHERE id=? AND subscription_id=?',validId(b.periodId),id);if(!period)fail(404,'Období nebylo nalezeno.');if(old.status!=='active'||period.end_date<subToday())fail(400,'Potvrďte plán aktivního nebo budoucího období.');
  statements.push(env.DB.prepare(`UPDATE subscription_periods SET planning_mode='gradual',plan_confirmed_at=COALESCE(plan_confirmed_at,?),plan_confirmed_by=COALESCE(plan_confirmed_by,?) WHERE id=? AND ${gate}`).bind(now,m.user_id,period.id,...gateArgs));
  // Archive only untouched automatic suggestions; preserve manually added, confirmed and worked visits.
  const proposals=await subAll(env.DB,"SELECT id,service_item_id,service_unit,version FROM jobs j WHERE service_period_id=? AND deleted=0 AND service_approval='pending' AND status='planned' AND material_status='unchecked' AND material_note='' AND NOT EXISTS(SELECT 1 FROM service_photos photo WHERE photo.job_id=j.id) AND NOT EXISTS(SELECT 1 FROM job_photos photo WHERE photo.job_id=j.id) AND NOT EXISTS(SELECT 1 FROM service_reports r WHERE r.job_id=j.id)",period.id);
  for(const proposal of proposals){if(proposal.id!=='svc-'+(await subHash(period.id+'|'+proposal.service_item_id+'|'+(proposal.service_unit-1))).slice(0,40))continue;statements.push(env.DB.prepare(`UPDATE jobs SET deleted=1,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND service_approval='pending' AND status='planned' AND material_status='unchecked' AND material_note='' AND NOT EXISTS(SELECT 1 FROM service_photos photo WHERE photo.job_id=jobs.id) AND NOT EXISTS(SELECT 1 FROM job_photos photo WHERE photo.job_id=jobs.id) AND NOT EXISTS(SELECT 1 FROM service_reports r WHERE r.job_id=jobs.id) AND ${gate}`).bind(now,m.user_id,proposal.id,proposal.version,...gateArgs));}
 }
 if(action==='plan'){
  if(!Array.isArray(b.jobs)||!b.jobs.length||b.jobs.length>80)fail(400,'Vyberte návštěvy ke schválení.');
  for(const update of b.jobs){const visit=await subOne(env.DB,'SELECT j.* FROM jobs j JOIN subscription_periods p ON p.id=j.service_period_id WHERE j.id=? AND p.subscription_id=? AND j.deleted=0',validId(update.id),id);if(!visit||visit.version!==update.version||visit.status==='done')fail(409,'Návštěva se mezitím změnila. Obnovte plán.');
   const p=await subOne(env.DB,'SELECT * FROM subscription_periods WHERE id=?',visit.service_period_id),day=date(update.dueDate);if(day<p.start_date||day>p.end_date)fail(400,'Návštěva musí být v platnosti období.');
   const assignment=await jobAssignment(env,update,visit,fail),person=assignment.primary;
   const start=cleanText(update.startTime||'',5),end=cleanText(update.endTime||'',5);if(start&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||end&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||!start||end<=start))fail(400,'Zkontrolujte časy návštěvy.');
   statements.push(env.DB.prepare(`UPDATE subscriptions SET status=CASE WHEN EXISTS(SELECT 1 FROM jobs WHERE id=? AND version=? AND deleted=0) AND EXISTS(SELECT 1 FROM members WHERE user_id=?) THEN status ELSE NULL END WHERE id=? AND ${gate}`).bind(visit.id,visit.version,person.user_id,id,...gateArgs));
   statements.push(env.DB.prepare(`UPDATE jobs SET due_date=?,start_time=?,end_time=?,assigned_to=?,assigned_users=?,assigned_name=?,service_approval=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND ${gate}`).bind(day,start,end,person.user_id,JSON.stringify(assignment.additional),person.name,update.confirm===false?'pending':'confirmed',now,m.user_id,visit.id,visit.version,...gateArgs));
  }
 }
 if(action==='visit'){
  const p=await subOne(env.DB,'SELECT * FROM subscription_periods WHERE id=? AND subscription_id=?',validId(b.periodId),id);if(!p)fail(404,'Období nebylo nalezeno.');const service=JSON.parse(p.snapshot).services.find(s=>s.id===b.serviceId);if(!service)fail(400,'Vyberte zahrnutou službu.');
  const day=date(b.date);if(day<p.start_date||day>p.end_date)fail(400,'Návštěva musí být v platnosti období.');const assignment=await jobAssignment(env,{...b,discipline},null,fail),person=assignment.primary;
  const customer=await subOne(env.DB,'SELECT * FROM customers WHERE id=? AND deleted=0',old.customer_id),garden=old.garden_id?await subOne(env.DB,'SELECT * FROM gardens WHERE id=? AND deleted=0',old.garden_id):null;if(!customer)fail(400,'Zákazník už není dostupný.');
  const last=await subOne(env.DB,'SELECT MAX(service_unit) n FROM jobs WHERE service_period_id=? AND service_item_id=?',p.id,service.id);
  newPeriod={id:p.id};newJobs.push({id:validId(b.jobId),service,unit:(last.n||0)+1,date:day,title:service.name+' – '+customer.name,address:garden?.address||JSON.parse(customer.addresses)[0]?.address||'',city:'',customer,gardenId:old.garden_id,assignedTo:person.user_id,additional:assignment.additional,assignedName:person.name,approval:b.confirm===true?'confirmed':'pending'});
 }
 if(!['activate','change','renew','state','payment','plan','confirm-plan','visit'].includes(action))fail(404,'Neznámá změna.');
 for(const j of newJobs)statements.push(env.DB.prepare(`INSERT INTO jobs(discipline,id,title,description,address,garden_id,assigned_to,assigned_users,assigned_name,due_date,status,incomplete_reason,version,created_at,updated_at,created_by,updated_by,deleted,customer_name,city,customer_id,service_period_id,service_item_id,service_unit,service_approval,service_deduct) SELECT ?,?,?,?,?,?,?,?,?,?,'planned','',1,?,?,?,?,0,?,?,?,?,?,?,?,? WHERE ${gate}`).bind(discipline,j.id,j.title.slice(0,120),j.service.description,j.address.slice(0,200),j.gardenId,j.assignedTo,JSON.stringify(j.additional||[]),j.assignedName,j.date,now,now,m.user_id,m.user_id,j.customer.name,j.city,j.customer.id,newPeriod.id,j.service.id,j.unit,j.approval,j.service.deduct?1:0,...gateArgs));
 statements.push(subOperation(env,operationId,m.user_id,id,hash,gate,gateArgs));
 let results;try{results=await env.DB.batch(statements);}catch(error){if(String(error.message).includes('subscriptions.status'))fail(409,'Servisní plán nebo přiřazení se mezitím změnilo. Obnovte detail.');if(await subReplay(env,operationId,m.user_id,id,hash,fail))return json({subscription:await subRead(env,m,id,fail),replayed:true});throw error;}
 if(!results[0].meta.changes&&!await subReplay(env,operationId,m.user_id,id,hash,fail))fail(409,'Změna nebyla uložena. Obnovte detail a ověřte oprávnění.');
 return json({subscription:await subRead(env,m,id,fail)});
}
