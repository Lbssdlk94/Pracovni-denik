import {parseAssistantCommand, assistantModeInfo, assistantSuggestions, ASSISTANT_PROVIDERS, KNOWLEDGE_KINDS} from '../web/assistant-commands.js';
import {featureEnabled} from '../web/features.js';
import {attendanceHours, attendanceInstant} from '../web/attendance-model.js';
import {installationInfo} from './installation.js';
import {handleJobs} from './jobs.js';
import {handleAttendance} from './attendance.js';
import {handleCustomers} from './customers.js';
import {handleMaterials} from './materials.js';
import {handleServiceWork} from './service-work.js';
import {handleJobDiary} from './job-diary.js';
import {handleSubscriptions} from './subscriptions.js';

const MANAGERS = ['owner','administrator','admin'];
const STATUS = {planned:'plánovaná', on_way:'na cestě', in_progress:'probíhá', done:'hotová', incomplete:'nedokončená'};
let auditReady = new WeakMap();

function pragueDate(now){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function addDays(iso, days){
  const date = new Date(iso+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
function weekRange(today){
  const day = new Date(today+'T12:00:00Z').getUTCDay()||7;
  const start = addDays(today, 1-day);
  return {start, end:addDays(start, 6)};
}
function manager(member){return MANAGERS.includes(member.role);}
function writer(member){return manager(member)||member.role==='worker';}
function on(features, key){return featureEnabled(key, features);}
function lines(items, render, empty){
  if(!items.length) return empty;
  const shown = items.slice(0,8).map(render);
  return shown.join('\n')+(items.length>8?`\n…a dalších ${items.length-8}.`: '');
}
function jobLine(job){
  const when = [job.dueDate, job.startTime&&job.endTime?job.startTime+'–'+job.endTime:job.startTime].filter(Boolean).join(' ');
  const who = [job.customerName, job.assignedName].filter(Boolean).join(' · ');
  return `• ${when?when+' · ':''}${job.title}${who?' · '+who:''} (${STATUS[job.status]||job.status})`;
}
function reply(mode, text, extra={}){
  const info = assistantModeInfo(mode);
  return {mode:info.id, modeLabel:info.label, modeNote:info.detail, available:info.available===true, reply:text, suggestions:extra.suggestions||[], confirm:extra.confirm||null, mutated:extra.mutated||null, unavailable:extra.unavailable===true||info.available!==true};
}

async function companyOf(env, m){
  const installation = await installationInfo(env);
  const workspace = m?._workspace?.workspaceId || '';
  return String(`${installation.id}:${workspace}`).slice(0, 120);
}
async function ensureAudit(env){
  if(!auditReady.has(env)){
    auditReady.set(env, (async()=>{
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS assistant_events (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    company_id TEXT NOT NULL DEFAULT 'installation',
    kind TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    committed_at INTEGER
  )`).run();
      await env.DB.prepare('ALTER TABLE assistant_events ADD COLUMN company_id TEXT').run().catch(()=>{});
    })().catch(error=>{auditReady.delete(env);throw error;}));
  }
  await auditReady.get(env);
}
async function callJson(run){
  try{
    const response = await run();
    const data = await response.json().catch(()=>({}));
    return {ok:response.ok, status:response.status, data};
  }catch(error){
    if(error?.status) return {ok:false, status:error.status, data:{error:error.message, ...(error.extra||{})}};
    throw error;
  }
}
function get(path, headers){return new Request('https://diary.internal'+path,{method:'GET',headers});}
function write(path, method, body, headers){
  return new Request('https://diary.internal'+path,{method,headers:{...Object.fromEntries(headers.entries()),'content-type':'application/json'},body:JSON.stringify(body)});
}

async function jobsGet(env, m, h, path){return callJson(()=>handleJobs(get(path, h._headers), env, m, h));}
async function customersGet(env, m, h, path){return callJson(()=>handleCustomers(get(path, h._headers), env, m, h));}
async function attendanceGet(env, m, h, path){return callJson(()=>handleAttendance(get(path, h._headers), env, m, h, h.features));}
async function materialsGet(env, m, h){return callJson(()=>handleMaterials(get('/api/materials', h._headers), env, m, h));}
async function serviceGet(env, ctx, m, h, id){return callJson(()=>handleServiceWork(get('/api/jobs/'+encodeURIComponent(id)+'/service', h._headers), env, ctx, m, h));}
async function diaryGet(env, m, h, id){return callJson(()=>handleJobDiary(get('/api/jobs/'+encodeURIComponent(id)+'/diary', h._headers), env, m, h));}
async function subscriptionsGet(env, m, h, path){return callJson(()=>handleSubscriptions(get(path, h._headers), env, m, h));}

function blocked(result, fallback){
  if(result.ok) return null;
  if(result.status===403) return result.data.error||'K těmto údajům nemáte oprávnění.';
  if(result.status===404) return fallback;
  return result.data.error||'Údaje se nepodařilo načíst.';
}
function oneJob(list, label){
  if(!list.length) return {error:`Zakázku${label?' „'+label+'“':''} jsem nenašel, nebo k ní nemáte přístup.`};
  if(list.length>1) return {choices:list};
  return {job:list[0]};
}

async function propose(env, m, action, summary){
  await ensureAudit(env);
  const id = crypto.randomUUID(), now = Date.now(), company = await companyOf(env, m);
  await env.DB.prepare('INSERT INTO assistant_events(id,actor_id,company_id,kind,action,payload,summary,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(id, m.user_id, company, 'proposal', action.intent, JSON.stringify(action), summary.slice(0,500), now, now+10*60*1000).run();
  return {id, title:'Potvrdit akci', detail:summary};
}
async function ownEvent(env, id, m){
  return env.DB.prepare('SELECT * FROM assistant_events WHERE id=? AND actor_id=? AND company_id=?').bind(id, m.user_id, await companyOf(env, m)).first();
}
async function auditCommit(env, row, summary){
  const result = await env.DB.prepare("UPDATE assistant_events SET kind='committed', summary=?, committed_at=? WHERE id=? AND actor_id=? AND kind='committing'")
    .bind(summary.slice(0,500), Date.now(), row.id, row.actor_id).run();
  if(!result.meta.changes) throw Error('Potvrzení už není rozpracované.');
}

export async function handleAssistant(request, env, ctx, m, h){
  const body = await h.body(request, 8000);
  if(!body||typeof body!=='object'||Array.isArray(body)) h.fail(400,'Neplatný příkaz.');
  const mode = assistantModeInfo(typeof body.mode==='string'?body.mode:'basic').id;
  const info = assistantModeInfo(mode);
  if(body.catalog===true) return h.json({mode:info.id, modeLabel:info.label, modeNote:info.detail, available:info.available===true, providers:ASSISTANT_PROVIDERS, knowledge:KNOWLEDGE_KINDS, reply:'Katalog režimů a znalostí. Modely ani manuály se nestahují.'});
  if(info.available!==true) return h.json(reply(mode, info.detail, {unavailable:true}));
  const preview = request.headers.get('x-work-diary-preview-role');
  h._headers = request.headers;
  if(body.cancelId) return h.json(await cancel(env, m, h, body.cancelId, mode));
  if(body.confirmId) return h.json(await confirm(env, ctx, m, h, body.confirmId, mode, preview));
  const today = pragueDate(new Date());
  const command = parseAssistantCommand(typeof body.text==='string'?body.text:'', today);
  const answer = await run(env, ctx, m, h, command, today, {propose:true, preview, context:body.context&&typeof body.context==='object'?body.context:null});
  return h.json(reply(mode, answer.reply, answer));
}

async function cancel(env, m, h, id, mode){
  if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(id)) h.fail(400,'Neplatné potvrzení.');
  await ensureAudit(env);
  const company = await companyOf(env, m);
  const result = await env.DB.prepare("UPDATE assistant_events SET kind='cancelled', summary=? WHERE id=? AND actor_id=? AND company_id=? AND kind='proposal'")
    .bind('Potvrzení je zrušené. Nic jsem neuložil.', id, m.user_id, company).run();
  if(result.meta.changes) return reply(mode, 'Potvrzení je zrušené. Nic jsem neuložil.');
  const row = await ownEvent(env, id, m);
  if(row?.kind==='committed') return reply(mode, 'Tato akce už byla provedena. '+row.summary);
  if(row?.kind==='cancelled') return reply(mode, 'Potvrzení už je zrušené. Nic se neuložilo.');
  h.fail(404,'Potvrzení už není platné. Zadejte příkaz znovu.');
}

async function confirm(env, ctx, m, h, id, mode, preview){
  if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(id)) h.fail(400,'Neplatné potvrzení.');
  if(preview) h.fail(403,'V náhledu role nelze ukládat změny. Nejdříve se vraťte ke své roli.',{code:'role_preview_readonly'});
  await ensureAudit(env);
  const company = await companyOf(env, m), now = Date.now();
  const claimed = await env.DB.prepare("UPDATE assistant_events SET kind='committing' WHERE id=? AND actor_id=? AND company_id=? AND kind='proposal' AND expires_at>=?")
    .bind(id, m.user_id, company, now).run();
  const row = await ownEvent(env, id, m);
  if(!row) h.fail(404,'Potvrzení už není platné. Zadejte příkaz znovu.');
  if(!claimed.meta.changes){
    if(row.kind==='committed') return reply(mode, 'Tato akce už byla provedena. '+row.summary);
    if(row.kind==='cancelled') return reply(mode, 'Potvrzení je zrušené. Nic jsem neuložil.');
    if(row.kind==='committing') return reply(mode, 'Toto potvrzení se právě zpracovává. Znovu ho nespouštím.');
    h.fail(409,'Potvrzení vypršelo. Zadejte příkaz znovu.');
  }
  const action = JSON.parse(row.payload);
  let done;
  try{
    done = await run(env, ctx, m, h, action, pragueDate(new Date()), {propose:false, preview});
  }catch(error){
    await env.DB.prepare("UPDATE assistant_events SET kind='proposal' WHERE id=? AND actor_id=? AND company_id=? AND kind='committing'").bind(id, m.user_id, company).run();
    throw error;
  }
  if(done.confirm){
    await auditCommit(env, row, 'Vyžaduje další potvrzení. '+done.reply);
    return reply(mode, done.reply, {confirm:done.confirm});
  }
  await auditCommit(env, row, done.reply);
  return reply(mode, done.reply, {mutated:done.mutated||null});
}

async function run(env, ctx, m, h, command, today, options){
  const {intent, params} = command;
  const tomorrow = addDays(today, 1);
  if(!options.propose&&intent==='protocol.draft'&&params.jobId) return protocolDraft(env, ctx, m, h, {id:params.jobId, title:params.title, description:params.description||'', dueDate:params.dueDate||''}, options);
  if(!options.propose&&intent==='jobs.create'&&params.dueDate) return createJob(env, m, h, params, today, tomorrow, options);
  if(!options.propose&&intent==='jobs.reschedule'&&params.jobId) return applyJobChange(env, m, h, params);
  if(!options.propose&&intent==='jobs.assign'&&params.jobId) return applyJobChange(env, m, h, params);
  if(!options.propose&&intent==='jobs.status'&&params.jobId) return applyStatus(env, m, h, params);
  if(!options.propose&&intent==='jobs.depart'&&params.jobId) return applyDeparture(env, m, h, params);
  if(!options.propose&&intent==='attendance.arrive') return applyPunch(env, m, h, 'arrival', params);
  if(!options.propose&&intent==='attendance.leave') return applyPunch(env, m, h, 'departure', params);
  if(intent==='unknown') return {reply:'Tomuhle příkazu nerozumím. Můžete zkusit některou z dostupných akcí.', suggestions:assistantSuggestions()};
  if(intent==='help') return {reply:'Umím zakázky, docházku, hodiny na zakázce z evidence, zákazníky, materiál a přípravu servisního protokolu. Zápis vždy nejdřív potvrdíte a stejné potvrzení se nespustí dvakrát. Mazání nechávám na stávajících obrazovkách.', suggestions:assistantSuggestions()};
  if(intent==='refused.destructive') return {reply:'Smazání nebo zrušení tady nespouštím, aby se nic omylem neztratilo. Použijte stávající obrazovku záznamu.'};

  if(intent.startsWith('jobs.')||intent==='protocol.draft'){
    if(!on(h.features,'jobs')) return {reply:'Zakázky jsou v nastavení firmy vypnuté.'};
  }
  if(intent.startsWith('attendance.')&&!on(h.features,'attendance')) return {reply:'Docházka je v nastavení firmy vypnutá.'};
  if(intent.startsWith('customers.')&&!on(h.features,'customers')) return {reply:'Zákazníci jsou v nastavení firmy vypnutí.'};
  if(intent.startsWith('materials.')&&!on(h.features,'materials')) return {reply:'Materiál je v nastavení firmy vypnutý.'};

  if(intent==='jobs.today'||intent==='jobs.tomorrow'){
    const day = intent==='jobs.today'?today:tomorrow;
    const result = await jobsGet(env,m,h,`/api/jobs?state=all&order=schedule&month=${day.slice(0,7)}&day=${day}`);
    const error = blocked(result,'Zakázky se nepodařilo načíst.');
    if(error) return {reply:error};
    const label = intent==='jobs.today'?'Dnes':'Zítra';
    return {reply:`${label} (${day}):\n`+lines(result.data.jobs||[], jobLine, 'Žádná návštěva v tento den není.')};
  }
  if(intent==='jobs.upcoming'||intent==='jobs.plannedServices'||intent==='jobs.week'){
    const type = intent==='jobs.plannedServices'?'&type=service':'';
    const range = weekRange(today);
    const span = intent==='jobs.week'?`&from=${range.start}&to=${range.end}`:`&after=${today}`;
    const result = await jobsGet(env,m,h,`/api/jobs?state=active&order=schedule${intent==='jobs.week'?span:'&after='+today}${type}`);
    const error = blocked(result);
    if(error) return {reply:error};
    const title = intent==='jobs.plannedServices'?'Plánované servisy':intent==='jobs.week'?`Tento týden (${range.start} až ${range.end})`:'Nadcházející zakázky';
    return {reply:`${title}:\n`+lines(result.data.jobs||[], jobLine, 'Nic dalšího v plánu není.')};
  }
  if(intent==='jobs.incomplete'){
    const result = await jobsGet(env,m,h,'/api/jobs?state=incomplete&order=schedule');
    const error = blocked(result);
    if(error) return {reply:error};
    return {reply:'Nedokončené zakázky:\n'+lines(result.data.jobs||[], jobLine, 'Nedokončená zakázka tu není.')};
  }
  if(intent==='customers.waitingService'){
    if(!on(h.features,'jobs')) return {reply:'Zakázky jsou v nastavení firmy vypnuté.'};
    const result = await jobsGet(env,m,h,'/api/jobs?state=active&type=service&order=schedule');
    const error = blocked(result);
    if(error) return {reply:error};
    return {reply:'Zákazníci, kteří čekají na servis:\n'+lines(result.data.jobs||[], job=>`• ${job.customerName||'Zákazník bez jména'} · ${job.title} (${STATUS[job.status]||job.status})`, 'Žádný otevřený servis v zakázkách nevidím.')};
  }
  if(intent==='jobs.realizationHours') return realizationHours(env, m, h);
  if(intent==='jobs.reschedule'||intent==='jobs.assign'||intent==='jobs.depart'||intent==='jobs.status') return prepareJobCommand(env, m, h, intent, params, today, tomorrow, options);
  if(intent==='attendance.active'||intent==='attendance.arrive'||intent==='attendance.leave') return attendanceCommand(env, m, h, intent, params, today, options);
  if(intent==='jobs.search'||intent==='jobs.history'||intent==='jobs.hours'||intent==='jobs.materials'||intent==='protocol.draft'){
    return jobIntent(env, ctx, m, h, intent, params, today, tomorrow, options);
  }
  if(intent==='jobs.create') return createJob(env, m, h, params, today, tomorrow, options);
  if(intent==='attendance.hours'||intent==='attendance.report') return attendanceIntent(env, m, h, intent, params, today);
  if(intent==='customers.search'||intent==='customers.contact'||intent==='customers.history'||intent==='customers.tariffs') return customerIntent(env, m, h, intent, params);
  if(intent==='materials.search') return materialSearch(env, m, h, params.query||'');
  return {reply:'Tomuhle příkazu nerozumím.', suggestions:assistantSuggestions()};
}

async function findJobs(env, m, h, query){
  const q = query?`&q=${encodeURIComponent(query.slice(0,100))}`:'';
  const result = await jobsGet(env,m,h,`/api/jobs?state=all${q}`);
  const error = blocked(result);
  if(error) return {error};
  return {jobs:result.data.jobs||[]};
}

function jobBody(job, patch){
  const assignedTo = patch.assignedTo??job.assignedTo??'';
  const body = {
    version:job.version, title:job.title, jobType:job.jobType||'service', customerId:job.customerId??null, customerAddressId:job.customerAddressId??null,
    customerName:job.customerName||'', city:job.city||'', description:job.description||'', address:job.address||'', gardenId:job.gardenId??null,
    assignedTo, assignedTos:patch.assignedTos||(assignedTo?[assignedTo]:[]), dueDate:(patch.dueDate??job.dueDate)||'', startTime:job.startTime||'', endTime:job.endTime||'',
    status:patch.status||job.status, incompleteReason:(patch.incompleteReason??job.incompleteReason)||''
  };
  if(job.discipline) body.discipline = job.discipline;
  if(job.plannedStart){body.plannedStart=job.plannedStart; body.estimatedMinutes=job.estimatedMinutes; body.arrivalWindowStart=job.arrivalWindowStart||''; body.arrivalWindowEnd=job.arrivalWindowEnd||''; body.legacyTimeMeaning=job.legacyTimeMeaning||'unknown';}
  if(patch.allowOverlaps){body.allowOverlaps=true; body.previewRevision=patch.previewRevision;}
  return body;
}
function arrivalPlan(now=new Date()){
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(part=>[part.type,part.value]));
  let hour = Number(parts.hour)+1, day = `${parts.year}-${parts.month}-${parts.day}`;
  if(hour>23){hour=8; day=addDays(day,1);}
  return {arrivalDate:day, arrivalTime:`${String(hour).padStart(2,'0')}:${parts.minute}`};
}
async function prepareJobCommand(env, m, h, intent, params, today, tomorrow, options){
  if((intent==='jobs.reschedule'||intent==='jobs.assign')&&!manager(m)) return {reply:'Termín a přiřazení mění vlastník nebo správce.'};
  if(intent==='jobs.status'&&!params.status) return {reply:'Řekněte, jaký stav mám nastavit: plánovaná, probíhá, hotová nebo nedokončená.'};
  if(intent==='jobs.reschedule'&&!params.dueDate) return {reply:'Řekněte den, třeba pátek nebo zítra. Termín jsem nezměnil.'};
  const dueDate = params.dueDate==='tomorrow'?tomorrow:params.dueDate;
  let found;
  if(params.current&&!params.query&&options.context?.jobId) found = {jobs:[]};
  else found = await findJobs(env, m, h, params.query||'');
  if(found.error) return {reply:found.error};
  let job;
  if(params.current&&options.context?.jobId){
    const loaded = await jobsGet(env,m,h,'/api/jobs/'+encodeURIComponent(options.context.jobId));
    if(!loaded.ok) return {reply:blocked(loaded)||'Otevřenou zakázku se nepodařilo načíst.'};
    job = loaded.data.job;
  }else{
    const picked = oneJob(found.jobs, params.query);
    if(picked.error) return {reply:picked.error};
    if(picked.choices) return {reply:'Našel jsem víc zakázek. Upřesněte název:\n'+lines(picked.choices, jobLine, '')};
    job = picked.job;
  }
  if(intent==='jobs.assign'){
    const people = await attendanceGet(env, m, h, `/api/attendance?month=${today.slice(0,7)}`+(manager(m)?'&userId=all':''));
    if(!people.ok) return {reply:blocked(people)||'Kolegy se nepodařilo načíst.'};
    const hits = (people.data.employees||[]).filter(person=>person.name.toLocaleLowerCase('cs').includes(String(params.person||'').toLocaleLowerCase('cs')));
    if(!params.person||!hits.length) return {reply:params.person?`Pracovníka „${params.person}“ v týmu nevidím.`:'Řekněte, koho mám přiřadit.'};
    if(hits.length>1) return {reply:'Vyhovuje víc lidí: '+hits.map(person=>person.name).join(', ')+'.'};
    const summary = `Přiřadit ${hits[0].name} k zakázce „${job.title}“? Dosavadní přiřazení se nahradí tímto člověkem.`;
    if(options.propose) return {reply:summary, confirm:await propose(env, m, {intent, params:{jobId:job.id, assignedTo:hits[0].id, assignedTos:[hits[0].id]}}, summary)};
  }
  if(intent==='jobs.reschedule'){
    const summary = `Přesunout zakázku „${job.title}“ z ${job.dueDate||'bez termínu'} na ${dueDate}? Čas návštěvy zůstane ${job.startTime||'bez času'}.`;
    if(options.propose) return {reply:summary, confirm:await propose(env, m, {intent, params:{jobId:job.id, dueDate}}, summary)};
  }
  if(intent==='jobs.status'){
    const summary = `Změnit stav zakázky „${job.title}“ na ${STATUS[params.status]||params.status}?`;
    if(options.propose) return {reply:summary, confirm:await propose(env, m, {intent, params:{jobId:job.id, status:params.status, version:job.version}}, summary)};
  }
  if(intent==='jobs.depart'){
    const plan = arrivalPlan();
    const summary = `Označit „${job.title}“ jako na cestě a příjezd ${plan.arrivalDate} v ${plan.arrivalTime}? Stav se změní jen když jste k zakázce přiřazený.`;
    if(options.propose) return {reply:summary, confirm:await propose(env, m, {intent, params:{jobId:job.id, version:job.version, ...plan}}, summary)};
  }
  return applyStored(env, m, h, intent, {...params, jobId:job.id, dueDate});
}
async function applyStored(env, m, h, intent, params){
  if(intent==='jobs.reschedule'||intent==='jobs.assign') return applyJobChange(env, m, h, params);
  if(intent==='jobs.status') return applyStatus(env, m, h, params);
  return applyDeparture(env, m, h, params);
}
async function applyJobChange(env, m, h, params){
  if(!manager(m)) return {reply:'Termín a přiřazení mění vlastník nebo správce.'};
  const loaded = await jobsGet(env,m,h,'/api/jobs/'+encodeURIComponent(params.jobId));
  if(!loaded.ok) return {reply:blocked(loaded)||'Zakázku se nepodařilo načíst.'};
  const job = loaded.data.job;
  const result = await callJson(()=>handleJobs(write('/api/jobs/'+encodeURIComponent(job.id),'PUT', jobBody(job, params), h._headers), env, m, h));
  if(!result.ok&&result.data.code==='job_schedule_warning'){
    const summary = `V plánu je kolize. Uložit „${job.title}“ přesto? ${result.data.error||''}`;
    const confirm = await propose(env, m, {intent:params.assignedTo?'jobs.assign':'jobs.reschedule', params:{...params, allowOverlaps:true, previewRevision:result.data.preview?.revision}}, summary);
    return {reply:summary, confirm};
  }
  if(!result.ok) return {reply:result.data.error||'Zakázku se nepodařilo změnit.'};
  return {reply:`Zakázka „${result.data.job?.title||job.title}“ je uložená${params.dueDate?' na '+params.dueDate:''}.`, mutated:'jobs'};
}
async function applyStatus(env, m, h, params){
  const loaded = await jobsGet(env,m,h,'/api/jobs/'+encodeURIComponent(params.jobId));
  if(!loaded.ok) return {reply:blocked(loaded)||'Zakázku se nepodařilo načíst.'};
  const result = await callJson(()=>handleJobs(write('/api/jobs/'+encodeURIComponent(params.jobId)+'/status','PATCH',{version:loaded.data.job.version, status:params.status, incompleteReason:params.status==='incomplete'?'Označeno asistentem po potvrzení.':''}, h._headers), env, m, h));
  if(!result.ok) return {reply:result.data.error||'Stav se nepodařilo změnit.'};
  return {reply:`Zakázka „${result.data.job?.title||''}“ je teď ${STATUS[result.data.job?.status]||params.status}.`, mutated:'jobs'};
}
async function applyDeparture(env, m, h, params){
  const loaded = await jobsGet(env,m,h,'/api/jobs/'+encodeURIComponent(params.jobId));
  if(!loaded.ok) return {reply:blocked(loaded)||'Zakázku se nepodařilo načíst.'};
  const result = await callJson(()=>handleJobs(write('/api/jobs/'+encodeURIComponent(params.jobId)+'/departure','POST',{version:loaded.data.job.version, arrivalDate:params.arrivalDate, arrivalTime:params.arrivalTime}, h._headers), env, m, h));
  if(!result.ok) return {reply:result.data.error||'Odjezd se nepodařilo zapsat.'};
  return {reply:`U zakázky „${result.data.job?.title||''}“ je stav na cestě, příjezd ${params.arrivalDate} v ${params.arrivalTime}.`, mutated:'jobs'};
}
async function attendanceCommand(env, m, h, intent, params, today, options){
  if(!on(h.features,'attendance')) return {reply:'Docházka je v nastavení firmy vypnutá.'};
  const month = today.slice(0,7);
  const people = await attendanceGet(env, m, h, `/api/attendance?month=${month}`+(manager(m)&&intent==='attendance.active'?'&userId=all':''));
  if(!people.ok) return {reply:blocked(people)||'Docházku se nepodařilo načíst.'};
  if(intent==='attendance.active'){
    const open = (people.data.shifts||[]).filter(shift=>shift.endAt==null);
    return {reply:open.length?('Otevřená docházka:\n'+open.map(shift=>`• ${shift.userName}`).join('\n')):'Nikdo nemá otevřenou docházku.'};
  }
  if(options.preview) return {reply:'V náhledu role docházku nezapisuji.'};
  if(intent==='attendance.arrive'){
    if(people.data.activeShift) return {reply:'Příchod už máte zaznamenaný. Nejdříve zapište odchod.'};
    const summary = 'Zapsat váš příchod teď? Poloha se neukládá, GPS stav bude nedostupný.';
    if(options.propose) return {reply:summary, confirm:await propose(env, m, {intent, params:{}}, summary)};
  }
  if(intent==='attendance.leave'){
    const shift = people.data.activeShift;
    if(!shift) return {reply:'Nemáte otevřenou docházku, odchod není kam zapsat.'};
    const summary = 'Zapsat váš odchod teď?';
    if(options.propose) return {reply:summary, confirm:await propose(env, m, {intent, params:{shiftId:shift.id, version:shift.version}}, summary)};
  }
  return applyPunch(env, m, h, intent==='attendance.arrive'?'arrival':'departure', params);
}
async function applyPunch(env, m, h, kind, params){
  const body = {mutationId:crypto.randomUUID(), kind, gpsStatus:'unavailable', ...(kind==='departure'?{shiftId:params.shiftId, version:params.version}:{})};
  const result = await callJson(()=>handleAttendance(write('/api/attendance/punch','POST', body, h._headers), env, m, h, h.features));
  if(!result.ok) return {reply:result.data.error||'Docházku se nepodařilo zapsat.'};
  return {reply:kind==='arrival'?'Příchod je zapsaný.':'Odchod je zapsaný.', mutated:'attendance'};
}

async function jobIntent(env, ctx, m, h, intent, params, today, tomorrow, options){
  if(intent==='jobs.materials'&&!params.query){
    const day = params.when==='today'?today:tomorrow;
    const result = await jobsGet(env,m,h,`/api/jobs?state=all&order=schedule&month=${day.slice(0,7)}&day=${day}`);
    const error = blocked(result);
    if(error) return {reply:error};
    return materialForJobs(env, ctx, m, h, result.data.jobs||[], day);
  }
  if(intent==='jobs.hours'&&params.current&&!params.query){
    const id = options.context?.jobId;
    if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(id)) return {reply:'Napište název zakázky. Otevřenou zakázku v tomto příkazu nevidím a čas z rozvrhu neodhaduji.'};
    const one = await jobsGet(env,m,h,'/api/jobs/'+encodeURIComponent(id));
    const error = blocked(one, 'Zakázku se nepodařilo načíst.');
    if(error) return {reply:error};
    return recordedJobHours(env, m, h, one.data.job, params.person);
  }
  const found = await findJobs(env, m, h, params.query||'');
  if(found.error) return {reply:found.error};
  if(intent==='jobs.search') return {reply:params.query?`Zakázky pro „${params.query}“:\n`+lines(found.jobs, jobLine, 'Nic jsem nenašel.'):'Napište, jakou zakázku mám hledat.'};
  const picked = oneJob(found.jobs, params.query);
  if(picked.error) return {reply:picked.error};
  if(picked.choices) return {reply:`Našel jsem víc zakázek. Upřesněte název:\n`+lines(picked.choices, jobLine, '')};
  const job = picked.job;
  if(intent==='jobs.history') return jobHistory(env, ctx, m, h, job);
  if(intent==='jobs.hours') return recordedJobHours(env, m, h, job, params.person);
  if(intent==='jobs.materials') return materialForJobs(env, ctx, m, h, [job], job.dueDate||today);
  return protocolDraft(env, ctx, m, h, job, options);
}

function jobHoursUnavailable(){
  return {reply:'Odpracované hodiny na zakázce v téhle evidenci nemám. Plánovaný čas z rozvrhu nepoužívám, abych nic neodhadoval.'};
}
async function recordedJobHours(env, m, h, job, person){
  let handleJobTime;
  try{({handleJobTime} = await import('./job-time.js'));}
  catch{return jobHoursUnavailable();}
  const result = await callJson(()=>handleJobTime(get('/api/jobs/'+encodeURIComponent(job.id)+'/time', h._headers), env, m, h));
  if(!result.ok) return {reply:blocked(result)||'Hodiny zakázky se nepodařilo načíst.'};
  const summary = result.data.summary;
  if(!summary?.total) return jobHoursUnavailable();
  const workers = summary.workers||[];
  const wanted = person?workers.filter(worker=>String(worker.name||'').toLocaleLowerCase('cs').includes(person.toLocaleLowerCase('cs'))):workers;
  if(person&&!wanted.length) return {reply:`V evidenci zakázky „${job.title}“ nevidím hodiny člověka „${person}“. Plánovaný čas z rozvrhu nepoužívám.`};
  const rows = (person?wanted:workers).map(worker=>`• ${worker.name}: práce ${attendanceHours(worker.workMs||0)}, cesta ${attendanceHours(worker.travelMs||0)}`);
  const workMs = (person?wanted:[{workMs:summary.total.workMs}]).reduce((sum,worker)=>sum+(worker.workMs||0),0);
  const travelMs = (person?wanted:[{travelMs:summary.total.travelMs}]).reduce((sum,worker)=>sum+(worker.travelMs||0),0);
  const who = person?wanted.map(worker=>worker.name).join(', '):'celkem';
  return {reply:`${job.title}, ${who}: práce ${attendanceHours(workMs)}, cesta ${attendanceHours(travelMs)}.\n`+rows.join('\n'), workMs, travelMs};
}
async function realizationHours(env, m, h){
  if(!on(h.features,'jobs')) return {reply:'Zakázky jsou v nastavení firmy vypnuté.'};
  const result = await jobsGet(env,m,h,'/api/jobs?state=all&type=installation&order=schedule');
  const error = blocked(result);
  if(error) return {reply:error};
  const jobs = result.data.jobs||[];
  if(!jobs.length) return {reply:'Žádnou zakázku typu realizace nevidím, nebo k ní nemáte přístup.'};
  let work = 0, travel = 0;
  const sample = jobs.slice(0, 12);
  for(const job of sample){
    const hours = await recordedJobHours(env, m, h, job);
    if(hours.workMs==null) return hours;
    work += hours.workMs;
    travel += hours.travelMs||0;
  }
  return {reply:`Realizace, součet z evidence (${sample.length} zakázek): práce ${attendanceHours(work)}, cesta ${attendanceHours(travel)}.${jobs.length>sample.length?' Další zakázky v tomto součtu nejsou, upřesněte název.':''}`};
}

async function jobHistory(env, ctx, m, h, job){
  const service = await serviceGet(env, ctx, m, h, job.id);
  const report = service.ok?service.data.report:null;
  const history = manager(m)&&service.ok?(service.data.history||[]):[];
  let diary = '';
  if(job.jobType==='installation'){
    const entries = await diaryGet(env, m, h, job.id);
    if(entries.ok&&entries.data.entries?.length) diary = '\nDeník realizace:\n'+entries.data.entries.slice(0,5).map(entry=>`• ${entry.date} ${entry.work}`).join('\n');
  }
  const protocol = report?`Protokol ${report.documentState==='ready'?'je připravený ke schválení':'je rozpracovaný'} (${report.date}). ${report.work||report.notes||''}`:'Servisní protokol zatím není.';
  const older = history.length?`\nStarší verze: ${history.length}.`: '';
  return {reply:`${job.title}\n${jobLine(job)}\n${protocol}${older}${diary}`.trim()};
}

async function materialForJobs(env, ctx, m, h, list, day){
  if(!list.length) return {reply:`Na ${day} není zakázka, ke které bych materiál vypsal.`};
  const chunks = [];
  for(const job of list.slice(0,8)){
    const service = on(h.features,'jobs')?await serviceGet(env, ctx, m, h, job.id):{ok:false};
    const items = service.ok?service.data.report?.materialItems||[]:[];
    const note = [service.ok?service.data.job?.materialNote:'', service.ok?service.data.report?.material:''].filter(Boolean).join(' ');
    const status = service.ok?service.data.job?.materialStatus:'';
    const body = items.length?items.map(item=>`${item.name||'položka'} ${item.quantity??''} ${item.unit||''}`.trim()).join(', '):note||'seznam materiálu není vyplněný';
    chunks.push(`• ${job.title}: ${body}${status?` [${status}]`:''}`);
  }
  return {reply:`Materiál na ${day}:\n`+chunks.join('\n')+(list.length>8?`\n…a dalších ${list.length-8} zakázek.`:'')};
}

async function protocolDraft(env, ctx, m, h, job, options){
  if(!writer(m)) return {reply:'Protokol může připravit pracovník nebo správce. Máte přístup jen ke čtení.'};
  if(options.preview) return {reply:'V náhledu role protokol neukládám.'};
  const summary = `Připravit rozpracovaný servisní protokol pro „${job.title}“? Údaje se doplní ze zakázky a protokol zůstane ke schválení, neodesílá se.`;
  if(options.propose){
    const confirm = await propose(env, m, {intent:'protocol.draft', params:{jobId:job.id, version:job.version, title:job.title, description:job.description||'', dueDate:job.dueDate||''}}, summary);
    return {reply:summary, confirm};
  }
  const current = await serviceGet(env, ctx, m, h, job.id);
  if(!current.ok) return {reply:current.data.error||'Zakázku se nepodařilo otevřít.'};
  const version = current.data.job.version;
  const existing = current.data.report;
  const result = await callJson(()=>handleServiceWork(write('/api/jobs/'+encodeURIComponent(job.id)+'/service','PUT',{
    operationId:crypto.randomUUID(), version, materialStatus:current.data.job.materialStatus||'unchecked',
    report:{date:existing?.date||(job.dueDate&&job.dueDate<=pragueDate(new Date())?job.dueDate:pragueDate(new Date())), work:existing?.work||job.description||job.title, material:existing?.material||'', defects:existing?.defects||'', notes:existing?.notes||'Připraveno asistentem ke kontrole.', recommendations:existing?.recommendations||''}
  }, h._headers), env, ctx, m, h));
  if(!result.ok) return {reply:result.data.error||'Protokol se nepodařilo připravit.'};
  const state = result.data.report?.documentState==='ready'?'připravený ke schválení':'rozpracovaný';
  return {reply:`Servisní protokol pro „${job.title}“ je ${state}. Zkontrolujte ho v zakázce před odesláním.`, mutated:'jobs'};
}

async function createJob(env, m, h, params, today, tomorrow, options){
  if(!manager(m)) return {reply:'Novou zakázku zakládá vlastník nebo správce.'};
  if(options.preview) return {reply:'V náhledu role zakázku nezakládám.'};
  const dueDate = params.dueDate||(params.when==='tomorrow'?tomorrow:today);
  const title = String(params.title||'Nová zakázka').slice(0,120);
  const summary = `Vytvořit zakázku „${title}“ na ${dueDate}? Bude plánovaná a bez přiřazení, dokud ji neupravíte.`;
  if(options.propose){
    const discipline = m._workspace?.selectedDiscipline&&m._workspace.selectedDiscipline!=='all'?m._workspace.selectedDiscipline:m._workspace?.disciplines?.[0];
    const confirm = await propose(env, m, {intent:'jobs.create', params:{title, dueDate, discipline:discipline||null}}, summary);
    return {reply:summary, confirm};
  }
  const id = crypto.randomUUID();
  const result = await callJson(()=>handleJobs(write('/api/jobs/'+id,'PUT',{
    version:0, title, jobType:'service', status:'planned', incompleteReason:'', description:'Vytvořeno z pracovního asistenta.',
    dueDate, customerName:'', assignedTo:'', assignedTos:[], ...(params.discipline?{discipline:params.discipline}:{})
  }, h._headers), env, m, h));
  if(!result.ok) return {reply:result.data.error||'Zakázku se nepodařilo vytvořit.'};
  return {reply:`Zakázka „${result.data.job?.title||title}“ je založená na ${dueDate}.`, mutated:'jobs'};
}

async function attendanceIntent(env, m, h, intent, params, today){
  const month = params.month||today.slice(0,7);
  const people = await attendanceGet(env, m, h, `/api/attendance?month=${month}`+(manager(m)?'&userId=all':''));
  const error = blocked(people, 'Docházku se nepodařilo načíst.');
  if(error) return {reply:error};
  let userId = m.user_id, userName = m.name;
  if(params.person){
    const employees = people.data.employees||[{id:m.user_id, name:m.name}];
    const hits = employees.filter(person=>person.name.toLocaleLowerCase('cs').includes(params.person.toLocaleLowerCase('cs')));
    if(!hits.length) return {reply:manager(m)?`Pracovníka „${params.person}“ v docházce nevidím.`:'Můžete zobrazit jen vlastní docházku.'};
    if(hits.length>1) return {reply:'Vyhovuje víc lidí: '+hits.map(person=>person.name).join(', ')+'.'};
    userId = hits[0].id; userName = hits[0].name;
    if(!manager(m)&&userId!==m.user_id) return {reply:'Můžete zobrazit jen vlastní docházku.'};
  }
  const period = params.period||'month';
  const range = period==='week'?weekRange(today):period==='today'?{start:today,end:today}:null;
  const months = range&&range.start.slice(0,7)!==range.end.slice(0,7)?[range.start.slice(0,7), range.end.slice(0,7)]:[month];
  let shifts = [];
  for(const value of months){
    const page = value===month&&(manager(m)?userId:m.user_id)?people:await attendanceGet(env,m,h,`/api/attendance?month=${value}&userId=${encodeURIComponent(userId)}`);
    if(!page.ok) return {reply:blocked(page)||'Docházku se nepodařilo načíst.'};
    shifts = shifts.concat((page.data.shifts||[]).filter(shift=>!params.person||shift.userId===userId));
  }
  const unique = [...new Map(shifts.map(shift=>[shift.id, shift])).values()];
  let total = 0;
  if(range){
    const start = attendanceInstant(range.start+'T00:00'), end = attendanceInstant(addDays(range.end,1)+'T00:00'), now = Date.now();
    for(const shift of unique){
      const stop = shift.endAt==null?now:shift.endAt;
      total += Math.max(0, Math.min(stop, end)-Math.max(shift.startAt, start));
    }
  }else{
    const row = (people.data.summary||[]).find(item=>item.userId===userId);
    total = row?.durationMs||0;
  }
  const label = period==='week'?'tento týden':period==='today'?'dnes':month;
  const sentence = `${userName}: ${attendanceHours(total)} (${label}).`;
  if(intent==='attendance.report'){
    if(range){
      const startAt = attendanceInstant(range.start+'T00:00'), endAt = attendanceInstant(addDays(range.end,1)+'T00:00'), now = Date.now();
      const byUser = new Map();
      for(const shift of unique){
        const stop = shift.endAt==null?now:shift.endAt;
        const slice = Math.max(0, Math.min(stop, endAt)-Math.max(shift.startAt, startAt));
        const row = byUser.get(shift.userId)||{userName:shift.userName, durationMs:0};
        row.durationMs += slice;
        byUser.set(shift.userId, row);
      }
      const rows = params.person?[{userName, durationMs:total}]:[...byUser.values()];
      const body = rows.map(row=>`• ${row.userName}: ${attendanceHours(row.durationMs||0)}`).join('\n')||sentence;
      return {reply:`Pracovní výkaz ${label}\n${body}\nOtevřená směna se počítá jen do teď.`};
    }
    const rows = manager(m)&&!params.person?(people.data.summary||[]):[{userName, durationMs:total}];
    const body = rows.map(row=>`• ${row.userName}: ${attendanceHours(row.durationMs||0)}`).join('\n')||sentence;
    return {reply:`Pracovní výkaz ${label}\n${body}\nOtevřené směny se do součtu uzavřených hodin nepočítají.`};
  }
  return {reply:sentence};
}

function customerCard(customer, contact){
  const phones = (customer.phones||[]).map(phone=>phone.number).filter(Boolean).join(', ')||'telefon není vyplněný';
  const addresses = (customer.addresses||[]).map(address=>[address.address, address.city].filter(Boolean).join(', ')).filter(Boolean).join('; ');
  const base = `${customer.name}${customer.email?' · '+customer.email:''}`;
  return contact?`${base}\n${phones}${addresses?'\n'+addresses:''}`:base;
}
async function customerIntent(env, m, h, intent, params){
  if(intent==='customers.tariffs'&&!on(h.features,'subscriptions')) return {reply:'Předplatné a tarify jsou v nastavení firmy vypnuté.'};
  const query = params.query||'';
  if((intent==='customers.search'||intent==='customers.contact'||intent==='customers.history')&&!query) return {reply:'Napište jméno zákazníka.'};
  const result = await customersGet(env,m,h,'/api/customers'+(query?`?q=${encodeURIComponent(query.slice(0,100))}`:''));
  const error = blocked(result);
  if(error) return {reply:error};
  const list = result.data.customers||[];
  if(!list.length) return {reply:`Zákazníka „${query}“ nevidím, nebo k němu nemáte přístup.`};
  if(intent==='customers.search') return {reply:'Zákazníci:\n'+lines(list, customer=>`• ${customerCard(customer,false)}`, '')};
  if(list.length>1&&intent!=='customers.tariffs') return {reply:'Vyhovuje víc zákazníků:\n'+lines(list, customer=>`• ${customer.name}`, '')};
  const customer = list[0];
  if(intent==='customers.contact') return {reply:customerCard(customer, true)};
  if(intent==='customers.history'){
    const visits = await jobsGet(env,m,h,`/api/jobs?state=all&q=${encodeURIComponent(customer.name.slice(0,100))}`);
    const subs = on(h.features,'subscriptions')?await subscriptionsGet(env,m,h,`/api/subscriptions?customerId=${encodeURIComponent(customer.id)}`):{ok:false,data:{}};
    const work = visits.ok?lines(visits.data.jobs||[], jobLine, 'Servisní zakázka k němu zatím není.'):'Zakázky se nepodařilo načíst.';
    const plans = subs.ok?(subs.data.subscriptions||[]).slice(0,5).map(item=>`• ${item.status||'předplatné'} ${item.customerName||customer.name}`).join('\n'):'';
    return {reply:`${customer.name}\n${work}${plans?'\nTarif / předplatné:\n'+plans:''}`};
  }
  const subs = await subscriptionsGet(env,m,h,query?`/api/subscriptions?q=${encodeURIComponent(query.slice(0,100))}`:'/api/subscriptions?status=active');
  if(!subs.ok) return {reply:blocked(subs)||'Tarify se nepodařilo načíst.'};
  const rows = (subs.data.subscriptions||[]).slice(0,8);
  let catalog = '';
  if(manager(m)){
    const tariffs = await subscriptionsGet(env,m,h,'/api/tariffs');
    if(tariffs.ok) catalog = '\nKatalog tarifů:\n'+lines(tariffs.data.tariffs||[], tariff=>`• ${tariff.definition?.name||tariff.name||'Tarif'}${tariff.active===false?' (vypnutý)':''}`, 'Katalog je prázdný.');
  }
  return {reply:'Zákaznické tarify:\n'+lines(rows, item=>`• ${item.customerName||'Zákazník'} · ${item.status||'stav'}`, 'Aktivní předplatné jsem nenašel.')+catalog};
}

async function materialSearch(env, m, h, query){
  if(!query) return {reply:'Napište název nebo kód materiálu.'};
  const result = await materialsGet(env, m, h);
  const error = blocked(result);
  if(error) return {reply:error};
  const needle = query.toLocaleLowerCase('cs');
  const items = (result.data.items||[]).filter(item=>`${item.name} ${item.sku}`.toLocaleLowerCase('cs').includes(needle));
  return {reply:'Materiál:\n'+lines(items, item=>`• ${item.name}${item.sku?' · '+item.sku:''} · ${item.unit}${item.active?'':' (skrytý)'}`, 'V načteném katalogu nic takového není.')+(result.data.nextCursor?'\nKatalog pokračuje další stránkou, zkuste přesnější název.':'')};
}
