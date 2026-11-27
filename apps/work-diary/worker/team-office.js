import {workspaceJobScope} from './workspace-policy.js';
import {jobAssignedIds} from './assignments.js';

const officeManagers=['owner','administrator','admin'];
const officeKinds=['leave','purchase','money'];
const officeCategories=['material','vehicles','tools','services','wages','other'];
export const officeOne=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
export const officeAll=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
export const officeManager=m=>officeManagers.includes(m.role);
export const officeToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'});
export function officeDate(value,fail){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00Z'))||new Date(value+'T00:00Z').toISOString().slice(0,10)!==value)fail(400,'Vyberte platné datum.');return value;}
export function officeMoney(value,fail){if(!Number.isSafeInteger(value)||value<=0||value>100000000000)fail(400,'Zadejte kladnou částku v korunách, nejvýše se dvěma desetinnými místy.');return value;}
export function officeScope(m,alias='r'){
 const clauses=[],args=[];
 if(!officeManager(m)){clauses.push(`${alias}.owner_id=?`);args.push(m.user_id);}
 if(m._workspace){const ds=m._workspace.disciplines||[];const selected=m._workspace.selectedDiscipline;const allowed=selected&&selected!=='all'?ds.filter(d=>d===selected):ds;if(!allowed.length){clauses.push(`${alias}.discipline IS NULL`);}else{clauses.push(`(${alias}.discipline IS NULL OR ${alias}.discipline IN (${allowed.map(()=>'?').join(',')}))`);args.push(...allowed);}}
 if(m._workspace){clauses.push(`(${alias}.discipline IS NULL OR EXISTS(SELECT 1 FROM workspace_organizations oo JOIN workspace_organization_policies pp ON pp.organization_id=oo.id WHERE oo.discipline=${alias}.discipline AND pp.active=1 AND pp.expires_at>?))`);args.push(Date.now());}
 return {sql:clauses.join(' AND ')||'1=1',args};
}
async function officeRead(env,m,id,fail){const s=officeScope(m);const r=await officeOne(env,'SELECT r.* FROM office_records r WHERE r.id=? AND '+s.sql,id,...s.args);if(!r)fail(404,'Záznam není dostupný.');if(r.kind==='money'&&!officeManager(m))fail(403,'Finance spravuje pouze správce a vyšší role.');return r;}
function officeDTO(row){return {id:row.id,kind:row.kind,ownerId:row.owner_id,ownerName:row.owner_name||'',discipline:row.discipline,jobId:row.job_id,status:row.status,data:JSON.parse(row.data),version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,receiptCount:row.receipt_count||0};}
export async function officeDiscipline(env,m,input,fail){
 if(!m._workspace)return input.discipline==='garden'?'garden':'irrigation';
 const allowed=m._workspace.disciplines||[],selected=m._workspace.selectedDiscipline;
 const discipline=input.discipline||(selected!=='all'?selected:null)||(allowed.length===1?allowed[0]:null);
 if(!discipline||!allowed.includes(discipline))fail(400,'Vyberte dostupný obor: Závlaha nebo Garden.');
 if(!await officeOne(env,'SELECT 1 ok FROM workspace_organizations oo JOIN workspace_organization_policies pp ON pp.organization_id=oo.id WHERE oo.discipline=? AND pp.active=1 AND pp.expires_at>?',discipline,Date.now()))fail(403,'Vybraný obor nemá aktivní přístup.');
 return discipline;
}
export async function officeJob(env,m,id,discipline,fail){
 if(!id)return null;
 const feature=await officeOne(env,"SELECT value FROM settings WHERE key='features'");if(feature&&JSON.parse(feature.value).jobs===false)fail(403,'Vazba na zakázku není dostupná, protože zakázky jsou vypnuté.');
 const r=await officeOne(env,'SELECT j.* FROM jobs j WHERE j.id=? AND j.deleted=0 AND '+workspaceJobScope('j'),id,m.user_id);
 if(!r||m._workspace&&r.discipline!==discipline)fail(403,'Zakázka není dostupná ve vybraném oboru.');return r;
}
function officeSnapshot(row){return JSON.stringify({status:row.status,data:JSON.parse(row.data)});}
function officeEvent(env,row,actor,action,operation,before=null){return env.DB.prepare('INSERT OR IGNORE INTO office_events(id,record_id,actor_id,action,at,before_data,after_data) SELECT ?,id,?,?,?, ?,? FROM office_records WHERE id=? AND operation_id=?').bind(operation,actor,action,Date.now(),before,officeSnapshot(row),row.id,operation);}
async function officeInsert(env,m,row,operation,fail){
 const now=Date.now();const r=await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO office_records(id,kind,owner_id,discipline,job_id,status,data,version,created_at,updated_at,updated_by,operation_id) SELECT ?,?,?,?,?,?,?,1,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM office_events WHERE id=?)').bind(row.id,row.kind,m.user_id,row.discipline,row.job_id,row.status,row.data,now,now,m.user_id,operation,operation),
  officeEvent(env,row,m.user_id,'created',operation)
 ]);
 const saved=await officeOne(env,'SELECT * FROM office_records WHERE id=?',row.id);
 if(!saved)fail(409,'Operace již byla použita u jiného záznamu.');
 if(!r[0].meta.changes&&(saved.owner_id!==m.user_id||saved.kind!==row.kind||saved.data!==row.data||saved.job_id!==row.job_id||saved.discipline!==row.discipline))fail(409,'Toto označení už patří jinému záznamu.');
 return saved;
}
async function officeUpdate(env,m,row,status,data,version,operation,action,fail,extra=[]){
 if(row.operation_id===operation)return row;
 if(version!==row.version)fail(409,'Záznam mezitím změnil kolega. Obnovte přehled.');
 const next={...row,status,data:JSON.stringify(data)};let result;try{result=await env.DB.batch([
  env.DB.prepare('UPDATE office_records SET status=?,data=?,version=version+1,updated_at=?,updated_by=?,operation_id=? WHERE id=? AND version=? AND status=? AND NOT EXISTS(SELECT 1 FROM office_events WHERE id=?)').bind(status,next.data,Date.now(),m.user_id,operation,row.id,version,row.status,operation),
  officeEvent(env,next,m.user_id,action,operation,officeSnapshot(row)),...extra
 ]);}catch(error){if(extra.length&&/office_finance_events|office_advance_purchases/.test(String(error)))fail(409,'Vyúčtování mezitím změnil kolega. Obnovte přehled a schválení zopakujte.');throw error;}
 if(!result[0].meta.changes)fail(409,'Záznam se změnil. Nic se nepřepsalo.');
 return officeOne(env,'SELECT * FROM office_records WHERE id=?',row.id);
}
function officeInterval(input,fail){
 const start=Number(input.startAt),end=Number(input.endAt);
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end-start>366*86400000||start<Date.UTC(2020,0,1)||end>Date.UTC(2100,0,1))fail(400,'Vyberte začátek a konec nepřítomnosti, nejvýše na jeden rok.');
 return {startAt:start,endAt:end};
}
async function officeExpenseAdvance(env,m,id,fail){
 const s=officeScope({...m,role:'admin'});
 const row=await officeOne(env,"SELECT r.* FROM office_finance r WHERE r.id=? AND r.kind='advance' AND r.status='active' AND r.beneficiary_id=? AND "+s.sql,id,m.user_id,...s.args);
 if(!row)fail(403,'Výdaj lze hlásit pouze k vlastní aktivní záloze v dostupném oboru.');return row;
}
async function officeAdvanceApproval(env,m,purchase,amount,operation,fail){
 const advanceId=JSON.parse(purchase.data).advanceId;if(!advanceId)return [];
 const s=officeScope(m),advance=await officeOne(env,"SELECT r.* FROM office_finance r WHERE r.id=? AND r.kind='advance' AND r.status='active' AND "+s.sql,advanceId,...s.args);
 if(!advance||advance.beneficiary_id!==purchase.owner_id||advance.discipline!==purchase.discipline)fail(409,'Navázaná záloha není dostupná nebo je uzavřená. Výdaj zatím nelze schválit.');
 if(await officeOne(env,'SELECT 1 ok FROM office_advance_purchases WHERE purchase_id=?',purchase.id))fail(409,'Nákup už byl k záloze přiřazen.');
 const before=JSON.parse(advance.data),after={...before,spentMinor:before.spentMinor+amount};
 return [
  env.DB.prepare("UPDATE office_finance SET data=?,version=version+1,operation_id=?,updated_at=? WHERE id=? AND version=? AND status='active' AND EXISTS(SELECT 1 FROM office_records WHERE id=? AND operation_id=?)").bind(JSON.stringify(after),operation,Date.now(),advance.id,advance.version,purchase.id,operation),
  env.DB.prepare('INSERT INTO office_advance_purchases(purchase_id,advance_id,amount_minor,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM office_records WHERE id=? AND operation_id=?) AND EXISTS(SELECT 1 FROM office_finance WHERE id=? AND operation_id=?)').bind(purchase.id,advance.id,amount,Date.now(),purchase.id,operation,advance.id,operation),
  env.DB.prepare("INSERT INTO office_finance_events(id,record_id,actor_id,action,before_data,after_data,at) SELECT ?,id,?,'allocate',?,?,? FROM office_finance WHERE id=? AND operation_id=?").bind('purchase-'+operation,m.user_id,JSON.stringify(before),JSON.stringify(after),Date.now(),advance.id,operation),
  env.DB.prepare("INSERT INTO office_finance_events(id,record_id,actor_id,action,after_data,at) SELECT ?,NULL,?,'conflict','{}',? WHERE EXISTS(SELECT 1 FROM office_records WHERE id=? AND operation_id=?) AND NOT EXISTS(SELECT 1 FROM office_finance WHERE id=? AND operation_id=?)").bind('guard-'+operation,m.user_id,Date.now(),purchase.id,operation,advance.id,operation)
 ];
}
async function officeConflicts(env,m,userId,data){
 const first=new Date(data.startAt).toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'}),last=new Date(data.endAt-1).toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'});
 const rows=await officeAll(env,`SELECT j.* FROM jobs j WHERE j.deleted=0 AND j.status IN ('planned','on_way','in_progress','incomplete') AND ${workspaceJobScope('j')} AND (j.due_date BETWEEN ? AND ? OR EXISTS(SELECT 1 FROM job_terms t WHERE t.job_id=j.id AND t.term_date BETWEEN ? AND ?))`,m.user_id,first,last,first,last);
 const conflicts=[];
 for(const row of rows){
  const terms=await officeAll(env,'SELECT term_date,assigned_users,status FROM job_terms WHERE job_id=? AND term_date BETWEEN ? AND ?',row.id,first,last);
  const relevant=terms.filter(t=>t.status!=='done'&&JSON.parse(t.assigned_users||'[]').includes(userId));
  if(jobAssignedIds(row).includes(userId)&&row.due_date>=first&&row.due_date<=last||relevant.length)conflicts.push({id:row.id,title:row.title,date:relevant[0]?.term_date||row.due_date,precision:'day'});
 }
 return conflicts;
}
export async function officeAbsencesForPlan(env,proposals){
 const exists=await officeOne(env,"SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='office_records'");if(!exists)return [];
 const leaves=await officeAll(env,"SELECT owner_id,data FROM office_records WHERE kind='leave' AND status='approved'");const conflicts=[];
 for(const p of proposals){if(!p.dueDate)continue;for(const r of leaves){if(!(p.assignedTos||[]).includes(r.owner_id))continue;const d=JSON.parse(r.data),from=new Date(d.startAt).toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'}),to=new Date(d.endAt-1).toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'});if(p.dueDate>=from&&p.dueDate<=to)conflicts.push({jobId:p.id,title:p.title,userId:r.owner_id,date:p.dueDate,message:'Pracovník má v tento den schválenou nepřítomnost. Zkontrolujte konkrétní hodiny.'});}}
 return conflicts;
}
export async function handleTeamOffice(request,env,m,h){
 const {fail,json,body,validId,cleanText,boundedBytes}=h,url=new URL(request.url),path=url.pathname,method=request.method;
 if(request.headers.get('x-work-diary-preview-role'))fail(403,'Tým a finance nejsou dostupné v náhledu role.');
 const manager=officeManager(m),s=officeScope(m);
 if(path==='/api/team-office/report-expense'&&method==='POST'){
  if(m.role==='reader')fail(403,'Výdaje mohou hlásit pracovníci, nikoli čtenář.');
  const b=await body(request,16000);if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Zkontrolujte formulář výdaje.');
  const advance=await officeExpenseAdvance(env,m,validId(b.advanceId),fail),id=validId(b.id),op=validId(b.operationId);if(id.length>80)fail(400,'Neplatné označení výdaje.');
  const jobId=b.jobId?validId(b.jobId):advance.job_id;if(b.jobId)await officeJob(env,m,jobId,advance.discipline,fail);
  const data={title:cleanText(b.title,200,true),quantity:1,unit:'nákup',category:officeCategories.includes(b.category)?b.category:'other',note:cleanText(b.note||'',2000),supplier:cleanText(b.supplier||'',160),actualMinor:officeMoney(b.actualMinor,fail),paidOn:officeDate(b.date,fail),advanceId:advance.id,estimatedMinor:null,neededOn:''};
  return json({record:officeDTO(await officeInsert(env,m,{id,kind:'purchase',discipline:advance.discipline,job_id:jobId,status:'expense_pending',data:JSON.stringify(data)},op,fail))});
 }
 if(path==='/api/team-office/options'&&method==='GET'){
  const jobs=await officeAll(env,"SELECT j.id,j.title,j.discipline FROM jobs j WHERE COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1 AND j.deleted=0 AND "+workspaceJobScope('j')+' ORDER BY j.updated_at DESC LIMIT 500',m.user_id);
  const members=manager?await officeAll(env,'SELECT user_id id,name,role FROM members ORDER BY name'):[];
  return json({manager,financial:manager,jobs,members,currency:'CZK',disciplineChoices:m._workspace?.disciplines||['irrigation','garden']});
 }
 if(path==='/api/team-office/summary'&&method==='GET'){
  if(!manager)fail(403,'Souhrn financí je dostupný pouze správci.');
  const month=url.searchParams.get('month')||officeToday().slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail(400,'Vyberte měsíc.');
  const records=await officeAll(env,"SELECT r.* FROM office_records r WHERE r.kind='money' AND r.status<>'void' AND substr(json_extract(r.data,'$.date'),1,7)=? AND "+s.sql,month,...s.args);
  const totals={income:0,expense:0,expectedIncome:0,expectedExpense:0};const categories={},days={};
  for(const row of records){const d=JSON.parse(row.data),key=row.status==='paid'?d.direction:d.direction==='income'?'expectedIncome':'expectedExpense';totals[key]+=d.amountMinor;if(row.status==='paid'){if(d.direction==='expense')categories[d.category]=(categories[d.category]||0)+d.amountMinor;days[d.date]??={income:0,expense:0};days[d.date][d.direction]+=d.amountMinor;}}
  const pending=await officeAll(env,"SELECT kind,COUNT(*) count FROM office_records r WHERE status IN ('pending','proposed','expense_pending') AND "+s.sql+' GROUP BY kind',...s.args);
  return json({month,currency:'CZK',...totals,difference:totals.income-totals.expense,categories,days,pending,scope:'office_ledger',notice:'Součet této evidence. Bez automatického načítání banky a starších nákladů vozidel. Rozdíl příjmů a výdajů není účetní zisk.'});
 }
 if(path==='/api/team-office/availability'&&method==='GET'){
  if(!manager)fail(403,'Dostupnost týmu spravuje správce.');
  const from=officeDate(url.searchParams.get('from')||officeToday(),fail),to=officeDate(url.searchParams.get('to')||from,fail);if(to<from||Date.parse(to)-Date.parse(from)>92*86400000)fail(400,'Vyberte nejvýše tři měsíce.');
  const rows=await officeAll(env,"SELECT r.*,m.name owner_name FROM office_records r JOIN members m ON m.user_id=r.owner_id WHERE r.kind='leave' AND r.status='approved'");
  return json({absences:rows.filter(r=>{const d=JSON.parse(r.data);return new Date(d.startAt).toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'})<=to&&new Date(d.endAt-1).toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'})>=from;}).map(r=>({id:r.id,userId:r.owner_id,name:r.owner_name,...officeInterval(JSON.parse(r.data),fail),label:'Nedostupný'}))});
 }
 if(path==='/api/team-office'&&method==='GET'){
  const kind=url.searchParams.get('kind');if(!officeKinds.includes(kind))fail(400,'Vyberte volno, nákupy nebo finance.');if(kind==='money'&&!manager)fail(403,'Finance spravuje správce.');
  const args=[kind,...s.args];let monthSql='';if(kind==='money'){const month=url.searchParams.get('month')||officeToday().slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail(400,'Vyberte měsíc.');monthSql=" AND substr(json_extract(r.data,'$.date'),1,7)=?";args.push(month);}
  const rows=await officeAll(env,'SELECT r.*,m.name owner_name,(SELECT COUNT(*) FROM office_receipts f WHERE f.record_id=r.id) receipt_count FROM office_records r JOIN members m ON m.user_id=r.owner_id WHERE r.kind=? AND '+s.sql+monthSql+' ORDER BY r.created_at DESC',...args);
  return json({records:rows.map(officeDTO)});
 }
 if(path==='/api/team-office'&&method==='POST'){
  const b=await body(request,20000),kind=b.kind;if(!officeKinds.includes(kind))fail(400,'Neplatný druh záznamu.');if(kind==='money'&&!manager)fail(403,'Příjmy a výdaje zapisuje správce.');if(kind==='purchase'&&m.role==='reader')fail(403,'Čtenář může oznámit vlastní nepřítomnost.');
  const id=validId(b.id),op=validId(b.operationId),data={};if(id.length>80)fail(400,'Označení záznamu je příliš dlouhé.');let status,discipline=null,jobId=null;
  if(kind==='leave'){
   Object.assign(data,officeInterval(b,fail));if(!['holiday','doctor','personal','other'].includes(b.type))fail(400,'Vyberte druh nepřítomnosti.');data.type=b.type;data.reason=cleanText(b.reason||'',1000);status='pending';
  }else{
   discipline=await officeDiscipline(env,m,b,fail);jobId=b.jobId?validId(b.jobId):null;await officeJob(env,m,jobId,discipline,fail);
   data.title=cleanText(b.title,200,true);if(!data.title)fail(400,'Doplňte název.');data.category=officeCategories.includes(b.category)?b.category:'other';data.note=cleanText(b.note||'',2000);
   if(kind==='purchase'){
    if(typeof b.quantity!=='number'||!Number.isFinite(b.quantity)||b.quantity<=0||b.quantity>1000000)fail(400,'Doplňte kladné množství.');data.quantity=b.quantity;data.unit=cleanText(b.unit||'ks',30);data.supplier=cleanText(b.supplier||'',160);data.estimatedMinor=b.estimatedMinor?officeMoney(b.estimatedMinor,fail):null;data.neededOn=b.neededOn?officeDate(b.neededOn,fail):'';status='proposed';
   }else{
    if(!['income','expense'].includes(b.direction)||!['paid','expected'].includes(b.status))fail(400,'Vyberte příjem nebo výdaj a stav platby.');data.direction=b.direction;data.amountMinor=officeMoney(b.amountMinor,fail);data.date=officeDate(b.date,fail);data.reference=cleanText(b.reference||'',100);status=b.status;
   }
  }
  const row=await officeInsert(env,m,{id,kind,discipline,job_id:jobId,status,data:JSON.stringify(data)},op,fail);return json({record:officeDTO(row)});
 }
 const match=path.match(/^\/api\/team-office\/([-\w]{1,100})(?:\/(action|receipts|receipt)(?:\/([-\w]{1,100}))?)?$/);if(!match)fail(404,'Nenalezeno.');
 const id=match[1],part=match[2],fileId=match[3],row=await officeRead(env,m,id,fail),data=JSON.parse(row.data);
 if(part==='receipts'&&method==='PUT'){
  if(row.kind!=='purchase'||m.role==='reader')fail(403,'Účtenku může přidat autor nákupu nebo správce.');
  const receiptId=validId(fileId),bytes=await boundedBytes(request,4*1024*1024);const mime=(request.headers.get('content-type')||'').split(';')[0];
  const valid=mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255||mime==='image/png'&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||mime==='application/pdf'&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
  if(!valid)fail(400,'Účtenka musí být skutečný JPG, PNG nebo PDF, nejvýše 4 MB.');
  let name=request.headers.get('x-file-name')||'uctenka';try{name=decodeURIComponent(name);}catch{}name=cleanText(name,160).replace(/[\r\n"\\/]/g,'_');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  const previous=await officeOne(env,'SELECT * FROM office_receipts WHERE id=?',receiptId);if(previous){if(previous.record_id!==id||previous.digest!==digest)fail(409,'Tato příloha už existuje s jiným obsahem.');return json({ok:true,replayed:true});}
  if((await officeOne(env,'SELECT COUNT(*) count FROM office_receipts WHERE record_id=?',id)).count>=20)fail(400,'K nákupu lze připojit nejvýše 20 dokladů.');
  const key='office-receipts/'+id+'/'+receiptId+'/'+digest;await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
  await env.DB.prepare('INSERT OR IGNORE INTO office_receipts(id,record_id,uploaded_by,object_key,name,mime,size,digest,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(receiptId,id,m.user_id,key,name,mime,bytes.length,digest,Date.now()).run();
  const saved=await officeOne(env,'SELECT record_id,digest FROM office_receipts WHERE id=?',receiptId);if(saved.record_id!==id||saved.digest!==digest){await env.BUCKET.delete(key);fail(409,'Přílohu mezitím uložil někdo jiný.');}return json({ok:true});
 }
 if(part==='receipt'&&method==='GET'){
  const file=await officeOne(env,'SELECT * FROM office_receipts WHERE id=? AND record_id=?',fileId,id);if(!file)fail(404,'Příloha není dostupná.');const object=await env.BUCKET.get(file.object_key);if(!object)fail(404,'Soubor chybí.');return new Response(object.body,{headers:{'content-type':file.mime,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});
 }
 if(!part&&method==='GET'){
  const receipts=await officeAll(env,'SELECT id,name,mime,size,created_at FROM office_receipts WHERE record_id=? ORDER BY created_at',id),history=await officeAll(env,'SELECT e.action,e.at,m.name actor_name FROM office_events e LEFT JOIN members m ON m.user_id=e.actor_id WHERE record_id=? ORDER BY at',id);
  return json({record:officeDTO(row),receipts,history,conflicts:row.kind==='leave'&&manager?await officeConflicts(env,m,row.owner_id,data):[]});
 }
 if(part!=='action'||method!=='POST')fail(405,'Nepodporovaná operace.');
 const b=await body(request,12000),op=validId(b.operationId);if(row.operation_id===op)return json({record:officeDTO(row),replayed:true});let status=row.status;const next={...data},extra=[];
 if(row.kind==='leave'){
  if(b.action==='withdraw'&&row.owner_id===m.user_id&&row.status==='pending')status='withdrawn';
  else{if(!manager)fail(403,'Volno schvaluje správce.');if(!['approve','reject','revoke'].includes(b.action))fail(400,'Neplatná akce.');if(b.action==='revoke'?row.status!=='approved':row.status!=='pending')fail(409,'Tuto žádost již nelze takto změnit.');
   if(b.action==='approve'){const conflicts=await officeConflicts(env,m,row.owner_id,data);if(conflicts.length&&b.acknowledgeConflicts!==true)fail(409,'Nepřítomnost zasahuje do naplánovaných návštěv. Zkontrolujte je a potvrďte schválení.',{conflicts});}
   if(['reject','revoke'].includes(b.action)&&!cleanText(b.reason||'',1000))fail(400,'Doplňte důvod rozhodnutí.');status={approve:'approved',reject:'rejected',revoke:'revoked'}[b.action];next.decisionReason=cleanText(b.reason||'',1000);
  }
 }else if(row.kind==='purchase'){
  if(b.action==='withdraw'&&row.owner_id===m.user_id&&row.status==='proposed')status='withdrawn';
  else if(b.action==='submit_expense'&&row.owner_id===m.user_id&&['approved','ordered'].includes(row.status)){next.actualMinor=officeMoney(b.actualMinor,fail);next.paidOn=officeDate(b.date||officeToday(),fail);next.supplier=cleanText(b.supplier||data.supplier||'',160);status='expense_pending';}
  else{
   if(!manager)fail(403,'Nákupy schvaluje správce.');
   if(b.action==='approve'&&row.status==='proposed')status='approved';
   else if(b.action==='order'&&row.status==='approved')status='ordered';
   else if(b.action==='reject'&&['proposed','approved','ordered','expense_pending'].includes(row.status)){if(!cleanText(b.reason||'',1000))fail(400,'Doplňte důvod zamítnutí.');next.decisionReason=cleanText(b.reason,1000);status='rejected';}
   else if(b.action==='buy'&&['approved','ordered','expense_pending'].includes(row.status)){
    next.actualMinor=officeMoney(b.actualMinor??data.actualMinor,fail);next.paidOn=officeDate(b.date||data.paidOn||officeToday(),fail);next.supplier=cleanText(b.supplier||data.supplier||'',160);status='bought';
    const moneyId='expense-'+row.id,moneyData=JSON.stringify({title:data.title,direction:'expense',amountMinor:next.actualMinor,date:next.paidOn,category:data.category,supplier:next.supplier,purchaseId:row.id,note:'Schválený nákup'});
    extra.push(env.DB.prepare("INSERT INTO office_records(id,kind,owner_id,discipline,job_id,status,data,version,created_at,updated_at,updated_by,operation_id) SELECT ?,'money',owner_id,discipline,job_id,'paid',?,1,?,?,?,? FROM office_records WHERE id=? AND operation_id=?").bind(moneyId,moneyData,Date.now(),Date.now(),m.user_id,op,row.id,op));
    extra.push(...await officeAdvanceApproval(env,m,row,next.actualMinor,op,fail));
   }else fail(409,'Tuto změnu stav nákupu neumožňuje.');
  }
 }else{
  if(!manager)fail(403,'Finance spravuje správce.');
  if(data.financeId)fail(400,'Tato platba je propojená s pohledávkou nebo závazkem. Otevřete původní doklad; jeho úhrady nelze měnit samostatně.');
  if(b.action==='pay'&&row.status==='expected'){status='paid';next.date=officeDate(b.date||officeToday(),fail);next.expectedDate=data.date;}
  else if(b.action==='void'&&row.status!=='void'){if(data.purchaseId)fail(400,'Výdaj vznikl schválením nákupu. Opravu zaznamenejte samostatným příjmem s odkazem na nákup.');if(!cleanText(b.reason||'',1000))fail(400,'Doplňte důvod storna.');status='void';next.voidReason=cleanText(b.reason,1000);}
  else fail(409,'Tato změna platby není dostupná.');
 }
 const saved=await officeUpdate(env,m,row,status,next,b.version,op,b.action,fail,extra);return json({record:officeDTO(saved)});
}
