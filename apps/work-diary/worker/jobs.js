import {jobProjection} from './job-projection.js';
import {dashboardJobFilter} from './dashboard-filters.js';
import {handleJobCompletion} from './job-completion.js';
import {timeLegacyStatements,timeBatch,timeState,timeAssertApplied} from './job-time.js';
import {workspaceWriteDiscipline} from './workspace-resources.js';
import {workspaceJobScope,workspaceGardenNotesSql} from './workspace-policy.js';
import {jobRankSql,protocolStateSql,jobAttempts} from './job-workflow.js';
import {validateWorkSchedule,inspectWorkSchedule,handlePlanningSettings} from './planning.js';
import {handleJobGeocode,jobGeocode} from './job-map.js';
import {jobAssignedIds,jobAssignment} from './assignments.js';
// Every read and write is scoped on the server; client filters are only presentation.
export async function handleJobs(request,env,m,h){
 const {all,one,execute,body,fail,json,validId,cleanText,expectedVersion}=h,url=new URL(request.url),path=url.pathname,method=request.method;
 const manager=['owner','administrator','admin'].includes(m.role),managerGate="EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role IN ('owner','administrator','admin'))";
 const scope=workspaceJobScope();
 let myTime=h.timeTracking&&h.features?.attendance!==false?await timeState(env,m.user_id,m):null;
 const {select,record}=jobProjection(m,h,myTime);
 const calendarDate=v=>typeof v==='string'&&/^[1-9]\d{3}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const clock=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
 const checkManager=()=>{if(!manager)fail(403,'Zakázky vytváří a přiřazuje vlastník nebo správce.');};
 const statusData=b=>{if(!['planned','on_way','in_progress','done','incomplete'].includes(b.status))fail(400,'Vyberte platný stav zakázky.');const reason=cleanText(b.incompleteReason??'',2000,b.status==='incomplete');return {status:b.status,reason:b.status==='incomplete'?reason:''};};
 const checkKeys=(b,keys)=>{if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!keys.includes(k)))fail(400,'Neplatné údaje zakázky.');};
 if(path==='/api/jobs/planning-settings')return await handlePlanningSettings(request,env,m,h);
 if(path==='/api/jobs/people'&&method==='GET'){
  checkManager();return json({people:await all(env.DB,`SELECT user_id AS id,name,role FROM members WHERE ${managerGate} ORDER BY name COLLATE NOCASE`,m.user_id)});
 }
 if(path==='/api/jobs/backlog'&&method==='GET'){
  checkManager();const q=cleanText(url.searchParams.get('q')||'',100),cursor=url.searchParams.get('cursor'),missingAssignee="NOT EXISTS(SELECT 1 FROM members target WHERE target.user_id=j.assigned_to OR target.user_id IN (SELECT value FROM json_each(j.assigned_users)))",unplanned="(j.due_date='' OR NOT EXISTS(SELECT 1 FROM members target WHERE target.user_id=j.assigned_to OR target.user_id IN (SELECT value FROM json_each(j.assigned_users))))",unclear="(j.planned_start='' OR j.estimated_minutes IS NULL OR ((j.start_time<>'' OR j.end_time<>'') AND j.legacy_time_meaning='unknown'))",clauses=["j.deleted=0","j.status<>'done'",managerGate,"(j.status='incomplete' OR "+unplanned+' OR '+unclear+')'],args=[m.user_id];
  if(q){clauses.push('(j.title LIKE ? OR j.customer_name LIKE ? OR j.address LIKE ? OR g.name LIKE ?)');args.push(...Array(4).fill('%'+q+'%'));}
  const count=await one(env.DB,`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN j.status<>'incomplete' AND ${unplanned} THEN 1 ELSE 0 END),0) unplanned,COALESCE(SUM(CASE WHEN j.status='incomplete' THEN 1 ELSE 0 END),0) incomplete FROM jobs j LEFT JOIN gardens g ON g.id=j.garden_id WHERE `+clauses.join(' AND '),...args);
  if(cursor){validId(cursor);clauses.push('j.id>?');args.push(cursor);}const rows=await all(env.DB,select.replace('SELECT j.*,','SELECT j.*,('+missingAssignee+') AS planning_missing_assignee,')+' WHERE '+clauses.join(' AND ')+' ORDER BY j.id LIMIT 101',...args),list=rows.slice(0,100);return json({jobs:list.map(r=>({...record(r),planningMissingAssignee:!!r.planning_missing_assignee})),total:count.total,counts:{unplanned:count.unplanned,clarify:count.total-count.unplanned-count.incomplete,incomplete:count.incomplete},nextCursor:rows.length>100?list.at(-1).id:null});
 }
 if(path==='/api/jobs'&&method==='GET'){
  const after=url.searchParams.get('after')||'',jobType=url.searchParams.get('type')||'',state=url.searchParams.get('state')||'active',q=cleanText(url.searchParams.get('q')||'',100),assignee=url.searchParams.get('assignee')||'',order=url.searchParams.get('order')||'created',month=url.searchParams.get('month')||'',day=url.searchParams.get('day')||'',from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'',protocol=url.searchParams.get('protocol')||'';
  if(!['created','schedule'].includes(order)||month&&(!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)||order!=='schedule')||day&&(!month||day!=='undated'&&(!calendarDate(day)||!day.startsWith(month+'-'))))fail(400,'Vyberte platný měsíc a den kalendáře.');
  if((from||to)&&(!calendarDate(from)||!calendarDate(to)||to<from||Date.parse(to)-Date.parse(from)>6*86400000||month||day||order!=='schedule'))fail(400,'Vyberte platné období nejvýše sedmi dnů.');
  if(after&&(!calendarDate(after)||order!=='schedule'||month||day||from||to))fail(400,'Vyberte platný začátek následujících návštěv.');
  if(jobType&&!['service','installation','survey'].includes(jobType))fail(400,'Vyberte platný druh zakázky.');
  if(!['active','all','planned','on_way','in_progress','done','incomplete'].includes(state))fail(400,'Neplatný filtr zakázek.');
  if(protocol&&!['unfinished','missing','draft','ready'].includes(protocol))fail(400,'Neplatný filtr protokolu.');
  if(assignee){validId(assignee);if(!manager&&assignee!==m.user_id)fail(403,'Můžete zobrazit pouze vlastní zakázky.');}
  const cacheSnapshot=url.searchParams.get('cacheSnapshot')==='1',listRevision=cacheSnapshot?((await one(env.DB,"SELECT version FROM settings WHERE key='job-planner-revision'"))?.version||0):null;
  const clauses=['j.deleted=0',scope],args=[m.user_id];
  const disciplineFilter=url.searchParams.get('discipline');if(m._workspace&&disciplineFilter&&disciplineFilter!=='all'){clauses.push('j.discipline=?');args.push(disciplineFilter);}
  const attention=url.searchParams.get('attention');if(attention){const f=dashboardJobFilter(attention,new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'}));if(!f)fail(400,'Neplatný filtr pozornosti.');clauses.push(f.sql);args.push(...f.args);}
  if(protocol){clauses.push("j.status='done'");clauses.push(protocol==='unfinished'?"("+protocolStateSql+") IN ('missing','draft')":"("+protocolStateSql+")=?");if(protocol!=='unfinished')args.push(protocol);}
  if(jobType){clauses.push('j.job_type=?');args.push(jobType);}
  if(state==='active')clauses.push("j.status<>'done'");else if(state!=='all'){clauses.push('j.status=?');args.push(state);}
  if(assignee){clauses.push('(j.assigned_to=? OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) selected WHERE selected.value=?))');args.push(assignee,assignee);}
  if(q){clauses.push("(j.title LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\' OR j.address LIKE ? ESCAPE '\\' OR j.customer_name LIKE ? ESCAPE '\\')");const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(pattern,pattern,pattern,pattern);}
  if(after){clauses.push('j.due_date>=?');args.push(after);}
  let calendar;if(from){clauses.push('j.due_date BETWEEN ? AND ?');args.push(from,to);}
  if(month){
   clauses.push("(j.due_date BETWEEN ? AND ? OR j.due_date='')");args.push(month+'-01',month+'-31');
   const counts=await all(env.DB,'SELECT j.due_date AS date,COUNT(*) AS count FROM jobs j LEFT JOIN service_reports pr ON pr.job_id=j.id WHERE '+clauses.join(' AND ')+' GROUP BY j.due_date',...args);
   calendar={days:counts.filter(c=>c.date),undatedCount:counts.find(c=>!c.date)?.count||0};
   if(day){clauses.push('j.due_date=?');args.push(day==='undated'?'':day);}
  }
  const statusKey=jobRankSql,dateKey="CASE WHEN j.due_date='' THEN '9999-99-99' ELSE j.due_date END",timeKey="CASE WHEN j.planned_start<>'' THEN j.planned_start WHEN j.start_time='' THEN '24:00' ELSE j.start_time END",filter=encodeURIComponent(JSON.stringify([state,assignee,q,month,day,...(attention?[attention]:[]),...(jobType?[jobType]:[]),...(from?[from,to]:[]),...(after?[after]:[]),protocol,url.searchParams.get('discipline')||'',m._workspace?.authorizationVersion||0,'work-order-v3']));
  const cursor=url.searchParams.get('cursor');if(cursor){let c;try{if(cursor.length>3000)throw Error();c=JSON.parse(atob(cursor));}catch{fail(400,'Neplatná stránka zakázek.');}if(!c)fail(400,'Neplatná stránka zakázek.');validId(c.id);
   if(order==='schedule'){
    if(c.order!=='schedule'||c.filter!==filter||![0,1,2,3].includes(c.completed)||!calendarDate(c.date)&&c.date!=='9999-99-99'||!clock(c.time)&&c.time!=='24:00')fail(400,'Řazení se změnilo nebo stránka není platná. Obnovte seznam zakázek.');
    clauses.push(`(${statusKey},${dateKey},${timeKey},j.id)>(?,?,?,?)`);args.push(c.completed,c.date,c.time,c.id);
   }else{if(!Number.isSafeInteger(c.at)||c.at<0)fail(400,'Neplatná stránka zakázek.');clauses.push('(j.created_at<? OR (j.created_at=? AND j.id<?))');args.push(c.at,c.at,c.id);}
  }
  const ordering=order==='schedule'?`${statusKey},${dateKey},${timeKey},j.id`:'j.created_at DESC,j.id DESC';
  const rows=await all(env.DB,select+' WHERE '+clauses.join(' AND ')+' ORDER BY '+ordering+' LIMIT 101',...args),more=rows.length>100,list=rows.slice(0,100),last=list.at(-1);
  const listRevisionAfter=cacheSnapshot?((await one(env.DB,"SELECT version FROM settings WHERE key='job-planner-revision'"))?.version||0):null;
  return json({...cacheSnapshot?{listRevision:listRevision===listRevisionAfter?listRevision:null}:{},jobs:list.map(record),nextCursor:more?btoa(JSON.stringify(order==='schedule'?{order,filter,completed:last.status==='in_progress'?0:last.status==='incomplete'?2:last.status==='done'?3:1,date:last.due_date||'9999-99-99',time:last.planned_start||last.start_time||'24:00',id:last.id}:{at:last.created_at,id:last.id})):null,...(calendar?{calendar}:{})});
 }
 const match=path.match(/^\/api\/jobs\/([-a-zA-Z0-9_]{1,100})(\/(?:status|departure|geocode|completion|completion-target))?$/);if(!match)fail(404,'Zakázka nebyla nalezena.');
 const id=match[1],statusOnly=match[2]==='/status',departure=match[2]==='/departure';
 const find=()=>one(env.DB,select+' WHERE j.id=? AND j.deleted=0 AND '+scope,id,m.user_id);
 if(match[2]==='/geocode')return await handleJobGeocode(request,env,m,h,()=>one(env.DB,select+' WHERE j.id=? AND j.deleted=0 AND '+managerGate,id,m.user_id));
 if(method==='GET'&&!statusOnly&&!departure&&!['/completion','/completion-target'].includes(match[2])){const row=await find();if(!row)fail(404,'Zakázka nebyla nalezena.');return json({job:{...record(row),attempts:await jobAttempts(env,id)}});}
 if(['/completion','/completion-target'].includes(match[2])){const result=await handleJobCompletion(request,env,m,id,h);const row=await find();if(!row)fail(404,'Zakázka již není dostupná.');return json({job:record(row),...result});}
 if(departure&&method==='POST'){
  const old=await find();if(!old)fail(404,'Zakázka nebyla nalezena.');if(!['owner','administrator','admin','worker'].includes(m.role))fail(403,'Odjezd může zaznamenat přiřazený pracovník nebo správce.');
  const b=await body(request,4000);checkKeys(b,['version','arrivalDate','arrivalTime']);const version=expectedVersion(b.version),arrivalDate=cleanText(b.arrivalDate,10,true),arrivalTime=cleanText(b.arrivalTime,5,true);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value])),today=parts.year+'-'+parts.month+'-'+parts.day,tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10),nowTime=parts.hour+':'+parts.minute;
  if(!calendarDate(arrivalDate)||!clock(arrivalTime)||arrivalDate<today||arrivalDate>tomorrow||arrivalDate===today&&arrivalTime<nowTime)fail(400,'Zadejte předpokládaný příjezd dnes nebo zítra, který ještě nenastal.');
  if(old.status==='incomplete')fail(409,'Pokus skončil. Nejdříve zakázku znovu naplánujte nebo vraťte do práce.');
  if(old.status==='done')fail(409,'Dokončenou zakázku nejdříve znovu otevřete.');
  if(old.status==='on_way'&&old.version===version+1&&old.departure_by===m.user_id&&old.arrival_date===arrivalDate&&old.arrival_time===arrivalTime)return json({job:record(old),replayed:true});
  const gate="EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND (actor.role IN ('owner','administrator','admin') OR (actor.role='worker' AND (jobs.assigned_to=actor.user_id OR EXISTS(SELECT 1 FROM json_each(jobs.assigned_users) selected WHERE selected.value=actor.user_id)) AND jobs.service_approval='confirmed')))";
  if(old.version!==version)fail(409,'Zakázku mezitím změnil kolega. Obnovte ji.');
  const time= h.timeTracking&&h.features?.attendance!==false?await timeLegacyStatements(env,m,old,'travel',fail,{arrivalDate,arrivalTime}):[];
  const result=(await timeBatch(env,[...time,env.DB.prepare("UPDATE jobs SET status='on_way',incomplete_reason='',arrival_date=?,arrival_time=?,departure_at=?,departure_by=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND deleted=0 AND status<>'done' AND "+gate).bind(arrivalDate,arrivalTime,Date.now(),m.user_id,Date.now(),m.user_id,id,version,m.user_id)],fail)).at(-1);if(time.length)myTime=await timeState(env,m.user_id,m);
  if(!result.meta.changes)fail(409,'Zakázku mezitím změnil kolega. Obnovte ji a čas příjezdu zkontrolujte.');const row=await find();if(!row)fail(404,'Zakázka už vám není přiřazená.');return json({job:record(row)});
 }
 if(statusOnly&&method==='PATCH'){
  // Assigned readers can update their task's state, without editing the assignment or brief.
  const old=await find();if(!old)fail(404,'Zakázka nebyla nalezena.');
  const b=await body(request,12000);checkKeys(b,['version','status','incompleteReason']);const version=expectedVersion(b.version),{status,reason}=statusData(b);
  if(status==='on_way'&&old.status!=='on_way')fail(400,'Použijte tlačítko Jsem na cestě a vyplňte příjezd.');
  if(old.service_period_id&&status==='done')fail(400,'Před dokončením servisní zakázky vyplňte servisní protokol.');
  const gate="EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND (actor.role IN ('owner','administrator','admin') OR ((jobs.assigned_to=actor.user_id OR EXISTS(SELECT 1 FROM json_each(jobs.assigned_users) selected WHERE selected.value=actor.user_id)) AND jobs.service_approval='confirmed')))";
  if(old.version!==version)fail(409,'Zakázku mezitím změnil kolega. Obnovte ji.');
  const timeKind=status==='in_progress'?'work':['done','incomplete'].includes(status)?'stop':null,time=timeKind&&(timeKind==='stop'||h.timeTracking&&h.features?.attendance!==false)?await timeLegacyStatements(env,m,old,timeKind,fail):[];
  const result=(await timeBatch(env,[...time,env.DB.prepare('UPDATE jobs SET status=?,incomplete_reason=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND deleted=0 AND '+gate).bind(status,reason,Date.now(),m.user_id,id,version,m.user_id)],fail)).at(-1);if(time.length)myTime=await timeState(env,m.user_id,m);
  if(!result.meta.changes)fail(409,'Zakázku mezitím změnil správce nebo kolega. Obnovte seznam.');const row=await find();if(!row)fail(404,'Zakázka už vám není přiřazená.');return json({job:record(row)});
 }
 if(!statusOnly&&!departure&&['PUT','DELETE'].includes(method)){
  checkManager();const b=await body(request,16000);checkKeys(b,method==='DELETE'?['version']:['version','discipline','title','jobType','customerId','customerAddressId','customerName','city','description','address','gardenId','assignedTo','assignedTos','dueDate','startTime','endTime','status','incompleteReason','defectIds','plannedStart','estimatedMinutes','arrivalWindowStart','arrivalWindowEnd','legacyTimeMeaning','allowOverlaps','previewRevision']);
  const version=expectedVersion(b.version),old=await one(env.DB,'SELECT * FROM jobs WHERE id=?',id);
  if(old?.deleted)fail(409,'Tato zakázka už byla smazána.',{code:'job_deleted'});if((old?.version||0)!==version)fail(409,'Zakázku mezitím změnil správce nebo kolega. Obnovte seznam.');
  if(method==='DELETE'){
   if(!old)fail(404,'Zakázka nebyla nalezena.');if(await one(env.DB,'SELECT 1 FROM job_time_intervals WHERE job_id=? AND end_at IS NULL',id))fail(409,'Nejdříve ukončete otevřenou pracovní dobu zakázky.');const result=await execute(env.DB,'UPDATE jobs SET deleted=1,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND deleted=0 AND '+managerGate,Date.now(),m.user_id,id,version,m.user_id);if(!result.meta.changes)fail(409,'Zakázku se nepodařilo smazat. Obnovte seznam a ověřte oprávnění.');return json({ok:true});
  }
  const discipline=workspaceWriteDiscipline(m,b,old,fail);
  const jobType=b.jobType??old?.job_type??'service';if(!['service','installation','survey'].includes(jobType))fail(400,'Vyberte druh Servis, Realizace nebo Zaměření.');
  const customerId=Object.hasOwn(b,'customerId')?(b.customerId===null?null:validId(b.customerId)):(old?.customer_id||null);
  const customerAddressId=customerId?(Object.hasOwn(b,'customerAddressId')?(b.customerAddressId===null?null:validId(b.customerAddressId)):(old?.customer_id===customerId?old?.customer_address_id||null:null)):null;
  if(!customerId&&b.customerAddressId!=null)fail(400,'Nejdříve vyberte zákazníka pro tuto adresu.');
  if(h.features?.customers===false&&customerId!==(old?.customer_id||null))fail(403,'Seznam zákazníků je v nastavení týmu vypnutý.');
  const contact=customerId?await one(env.DB,'SELECT * FROM customers WHERE id=?',customerId):null;
  if(customerId&&(!contact||contact.deleted&&customerId!==old?.customer_id))fail(400,'Vyberte dostupného zákazníka.');
  if(customerAddressId&&contact&&!JSON.parse(contact.addresses).some(a=>a.id===customerAddressId)&&!(customerId===old?.customer_id&&customerAddressId===old?.customer_address_id))fail(400,'Vybraná adresa už u zákazníka není. Vyberte ji znovu.');
  const selectedAddress=contact&&customerAddressId?JSON.parse(contact.addresses).find(address=>address.id===customerAddressId):null;
  const customerName=Object.hasOwn(b,'customerName')?cleanText(b.customerName,160):(old?.customer_name??contact?.name??''),city=Object.hasOwn(b,'city')?cleanText(b.city,120):(old?.city??selectedAddress?.city??'');
  const title=cleanText(b.title,120,true),description=cleanText(b.description??'',4000),address=cleanText(b.address??'',500),assignment=await jobAssignment(env,{...b,discipline},old,fail,{allowUnassigned:true}),assignedTo=assignment.assignedTo,dueDate=cleanText(b.dueDate??'',10),gardenId=b.gardenId==null?null:validId(b.gardenId),initialStatus=statusData(b),now=Date.now();let {status,reason}=initialStatus;
  if(dueDate){const date=new Date(dueDate+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==dueDate||Number(dueDate.slice(0,4))<1000)fail(400,'Vyberte platný termín zakázky.');}
  const startTime=cleanText(Object.hasOwn(b,'startTime')?b.startTime:old?.start_time||'',5),endTime=cleanText(Object.hasOwn(b,'endTime')?b.endTime:old?.end_time||'',5);
  if(startTime&&!clock(startTime)||endTime&&!clock(endTime))fail(400,'Čas zadejte ve formátu HH:MM.');
  if((startTime||endTime)&&!dueDate)fail(400,'K času návštěvy vyberte také datum.');
  if(endTime&&(!startTime||endTime<=startTime))fail(400,'Čas do musí být později než čas od v témže dni.');
  if(status==='on_way'&&old?.status!=='on_way')fail(400,'Použijte tlačítko Jsem na cestě a vyplňte příjezd.');
  const work=validateWorkSchedule(b,old,fail);
  const rescheduled=old?.status==='incomplete'&&(dueDate!==old.due_date||startTime!==old.start_time||endTime!==old.end_time||work.plannedStart!==old.planned_start||work.estimatedMinutes!==old.estimated_minutes||assignedTo!==old.assigned_to||JSON.stringify(assignment.additional)!==old.assigned_users);
  if(rescheduled&&status==='incomplete'){status='planned';reason='';}
  if(old?.service_period_id){if(status==='done'&&old.status!=='done')fail(400,'Dokončete zakázku přes servisní protokol.');if(customerId!==old.customer_id||gardenId!==old.garden_id)fail(400,'Zákazníka a zahradu servisního předplatného nelze měnit v zakázce.');const p=await one(env.DB,'SELECT start_date,end_date FROM subscription_periods WHERE id=?',old.service_period_id);if(!dueDate||dueDate<p.start_date||dueDate>p.end_date)fail(400,'Servisní termín musí být v platnosti sjednaného období.');}
  const assignee=assignedTo?await one(env.DB,'SELECT user_id,name FROM members WHERE user_id=?',assignedTo):{user_id:'',name:''};if(!assignee)fail(400,'Vyberte současného člena týmu.');
  if(gardenId&&!await one(env.DB,'SELECT id FROM gardens WHERE id=? AND deleted=0',gardenId))fail(400,'Vyberte dostupnou zahradu nebo zakázku bez zahrady.');
  if(customerId&&!gardenId&&(!old||old.customer_id!==customerId)&&(await one(env.DB,'SELECT COUNT(*) count FROM gardens WHERE customer_id=? AND deleted=0',customerId)).count>1)fail(400,'Zákazník má více zahrad. Vyberte konkrétní zahradu.');if(gardenId&&customerId){const g=await one(env.DB,'SELECT customer_id FROM gardens WHERE id=? AND deleted=0',gardenId);if(g?.customer_id&&g.customer_id!==customerId)fail(400,'Vybraná zahrada patří jinému zákazníkovi.');}
  if((work.plannedStart||work.arrivalWindowStart)&&!dueDate)fail(400,'K času vyberte datum návštěvy.');if(b.allowOverlaps!==undefined&&typeof b.allowOverlaps!=='boolean')fail(400,'Neplatné potvrzení kolize.');const explicitPlan=['plannedStart','estimatedMinutes','arrivalWindowStart','arrivalWindowEnd'].some(k=>Object.hasOwn(b,k));const movedKnownWork=!!work.plannedStart&&old&&(dueDate!==old.due_date||assignedTo!==old.assigned_to||JSON.stringify(assignment.additional)!==old.assigned_users||old.status==='done'&&status!=='done');let inspection=null;if(explicitPlan||movedKnownWork){inspection=await inspectWorkSchedule(env,[{id,title,dueDate,status,assignedTos:[assignedTo,...assignment.additional],...work}]);if((inspection.overlaps.length||inspection.warnings.length)&&!b.allowOverlaps)fail(409,'Zkontrolujte plán práce před uložením.',{code:'job_schedule_warning',preview:inspection});if(b.allowOverlaps&&b.previewRevision!==inspection.revision)fail(409,'Rozpis se od kontroly změnil. Obnovte jej před uložením.',{code:'planner_conflict'});}
  const linked=await all(env.DB,'SELECT d.id,d.garden_id,d.status,d.discipline FROM garden_defect_jobs l JOIN garden_defects d ON d.id=l.defect_id WHERE l.job_id=?',id);
  if(m._workspace&&linked.some(d=>d.discipline!==discipline))fail(400,'Zakázka a závada musí patřit stejnému oboru.');
  if(linked.some(d=>d.garden_id!==gardenId))fail(400,'Zakázka už řeší závady jiné zahrady. Zahradu nelze změnit.');
  const defectIds=b.defectIds===undefined?[]:b.defectIds;if(!Array.isArray(defectIds)||defectIds.length>100||new Set(defectIds).size!==defectIds.length)fail(400,'Vyberte nejvýše 100 závad.');
  for(const did of defectIds){validId(did);if(m._workspace&&!await one(env.DB,'SELECT id FROM garden_defects WHERE id=? AND discipline=?',did,discipline))fail(400,'Závada musí patřit oboru zakázky.');if(!await one(env.DB,"SELECT id FROM garden_defects WHERE id=? AND garden_id=? AND (status<>'resolved' OR EXISTS(SELECT 1 FROM garden_defect_jobs WHERE defect_id=? AND job_id=?))",did,gardenId,did,id))fail(400,'Závada musí patřit vybrané zahradě a být otevřená.');}
  const linkOperation=crypto.randomUUID(),jobStatements=[],queue=(db,sql,...args)=>{const stmt=db.prepare(sql).bind(...args);jobStatements.push(stmt);return null;};
  const targets="(?='' OR EXISTS(SELECT 1 FROM members target WHERE target.user_id=?)) AND (? IS NULL OR EXISTS(SELECT 1 FROM gardens g WHERE g.id=? AND g.deleted=0)) AND (? IS NULL OR EXISTS(SELECT 1 FROM customers c WHERE c.id=? AND (c.deleted=0 OR c.id=?)))";
  const planGate=inspection?' AND EXISTS(SELECT 1 FROM settings WHERE key=\'job-planner-revision\' AND version=?)':'',planArgs=inspection?[inspection.revision]:[];let result;
  if(old)result=queue(env.DB,'UPDATE jobs SET title=?,job_type=?,customer_id=?,customer_address_id=?,customer_name=?,city=?,description=?,address=?,garden_id=?,assigned_to=?,assigned_users=?,assigned_name=?,due_date=?,start_time=?,end_time=?,status=?,incomplete_reason=?,version=version+1,updated_at=?,updated_by=?,service_operation=?,planned_start=?,estimated_minutes=?,arrival_window_start=?,arrival_window_end=?,legacy_time_meaning=? WHERE id=? AND version=? AND deleted=0 AND '+managerGate+' AND '+targets+planGate,title,jobType,customerId,customerAddressId,customerName,city,description,address,gardenId,assignedTo,JSON.stringify(assignment.additional),assignee.name,dueDate,startTime,endTime,status,reason,now,m.user_id,linkOperation,work.plannedStart,work.estimatedMinutes,work.arrivalWindowStart,work.arrivalWindowEnd,work.legacyTimeMeaning,id,version,m.user_id,assignedTo,assignedTo,gardenId,gardenId,customerId,customerId,old?.customer_id||null,...planArgs);
  else result=queue(env.DB,'INSERT OR IGNORE INTO jobs(discipline,id,service_operation,planned_start,estimated_minutes,arrival_window_start,arrival_window_end,legacy_time_meaning,title,job_type,customer_id,customer_address_id,customer_name,city,description,address,garden_id,assigned_to,assigned_users,assigned_name,due_date,start_time,end_time,status,incomplete_reason,version,created_at,updated_at,created_by,updated_by,deleted) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,0 WHERE '+managerGate+' AND '+targets+planGate,discipline,id,linkOperation,work.plannedStart,work.estimatedMinutes,work.arrivalWindowStart,work.arrivalWindowEnd,work.legacyTimeMeaning,title,jobType,customerId,customerAddressId,customerName,city,description,address,gardenId,assignedTo,JSON.stringify(assignment.additional),assignee.name,dueDate,startTime,endTime,status,reason,now,now,m.user_id,m.user_id,m.user_id,assignedTo,assignedTo,gardenId,gardenId,customerId,customerId,old?.customer_id||null,...planArgs);
  for(const did of defectIds){const eid=crypto.randomUUID(),gate="EXISTS(SELECT 1 FROM jobs WHERE id=? AND version=? AND garden_id=? AND service_operation=? AND updated_by=? AND deleted=0) AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ('owner','administrator','admin'))",args=[id,version+1,gardenId,linkOperation,m.user_id,m.user_id];
   jobStatements.push(env.DB.prepare(`INSERT OR IGNORE INTO garden_defect_events(id,defect_id,actor_id,actor_name,at,hash,record) SELECT ?,?,?,?,?,?,? WHERE ${gate} AND NOT EXISTS(SELECT 1 FROM garden_defect_jobs WHERE defect_id=? AND job_id=?)`).bind(eid,did,m.user_id,m.name,now,'link',JSON.stringify({kind:'repair_link',jobId:id}),...args,did,id));
   jobStatements.push(env.DB.prepare(`INSERT OR IGNORE INTO garden_defect_jobs(defect_id,job_id,created_at,created_by) SELECT ?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM garden_defects WHERE id=? AND garden_id=?)`).bind(did,id,now,m.user_id,...args,did,gardenId));
  }
  const kind=old&&old.status!==status?(status==='in_progress'?'work':['done','incomplete'].includes(status)?'stop':null):null,time=kind&&(kind==='stop'||h.timeTracking&&h.features?.attendance!==false)?await timeLegacyStatements(env,m,old,kind,fail):[];
  result=(await timeBatch(env,[...time,...jobStatements,...(time.length?[timeAssertApplied(env,id,m.user_id,linkOperation)]:[])],fail))[time.length];if(time.length)myTime=await timeState(env,m.user_id,m);
  if(!result.meta.changes)fail(409,'Zakázku nebo její přiřazení mezitím někdo změnil. Obnovte seznam a ověřte oprávnění.');
  const row=await find();if(!row)fail(404,'Zakázka už není dostupná.');return json({job:record(row)});
 }
 fail(405,'Nepodporovaná operace.');
}
