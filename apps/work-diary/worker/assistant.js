import {interpretAssistant, assistantModeInfo, assistantSuggestions, ASSISTANT_PROVIDERS, KNOWLEDGE_KINDS, planMaterialLines, parseServiceDictation, reviseServiceDraft, annotateProtocolMaterials, serviceDraftQuestions, parseDictionaryCommand, applyAssistantDictionary, matchProtocolQuery} from '../web/assistant-commands.js';
import {modelReadCommand, pickNextWork} from '../web/assistant-intent.js';
import {planWork, revisePlan, matchPeople, planCollisions, planSummary, nameStem, customerHit} from '../web/job-plan.js';
import {featureEnabled} from '../web/features.js';
import {attendanceHours, attendanceInstant} from '../web/attendance-model.js';
import {readImportSheet} from '../web/assistant-import.js';
import {materialMoney, materialSummary, materialTotals} from '../web/material-model.js';
import {installationInfo} from './installation.js';
import {handleJobs} from './jobs.js';
import {handleAttendance} from './attendance.js';
import {handleCustomers} from './customers.js';
import {handleMaterials} from './materials.js';
import {handleServiceWork} from './service-work.js';
import {handleJobDiary} from './job-diary.js';
import {handleGardenHistory} from './garden-history.js';
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
function jobCountLabel(count){
  if(count==null) return '';
  if(count===1) return '1 aktivní zakázka';
  if(count>1 && count<5) return `${count} aktivní zakázky`;
  return `${count} aktivních zakázek`;
}
function jobCards(jobs){
  return (jobs||[]).filter(job=>job?.id).slice(0,8).map(job=>({
    type:'job', id:job.id, title:job.title||'Zakázka',
    subtitle:[job.customerName, job.startTime&&job.endTime?job.startTime+'–'+job.endTime:'', job.city||job.address].filter(Boolean).join(' · '),
    meta:job.dueDate||'', status:job.status||'', statusLabel:STATUS[job.status]||job.status||'',
    openLabel:'Otevřít zakázku',
    href:mapsHref(job)
  }));
}
function mapsHref(job){
  const query = [job?.address, job?.city].filter(Boolean).join(', ');
  return query ? 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query) : '';
}
function optionalPending(question){
  if(/těsnosti/.test(question)) return 'tightness';
  if(/funkční/.test(question)) return 'functional';
  if(/návštěva/.test(question)) return 'next';
  if(/závady/.test(question)) return 'defects';
  return '';
}
function occurrenceLine(row){
  const place = [row.job.customerName, row.job.address, row.job.city].filter(Boolean).join(' · ');
  const when = row.timed ? `${row.date} ${row.time}` : `${row.date}, bez času výjezdu`;
  return `• ${row.job.title}${place?' · '+place:''} · ${when}`;
}
async function assignedWindow(env, m, h, today){
  const jobs = [];
  for(let week=0; week<3; week++){
    const start = addDays(today, week*7);
    const end = addDays(start, 6);
    const result = await jobsGet(env, m, h, `/api/jobs?state=active&order=schedule&from=${start}&to=${end}&assignee=${encodeURIComponent(m.user_id)}`);
    if(!result.ok) return {error:blocked(result)||'Rozvrh se nepodařilo načíst. Pořadí neodhaduji.'};
    if(result.data.nextCursor) return {error:'Zakázek je víc, než můžu bezpečně seřadit. Pořadí neodhaduji.'};
    jobs.push(...(result.data.jobs||[]));
  }
  const unique = [];
  const seen = new Set();
  for(const job of jobs){if(job?.id&&!seen.has(job.id)){seen.add(job.id); unique.push(job);}}
  return {jobs:unique};
}
async function nextWork(env, m, h, params, today, options){
  const loaded = await assignedWindow(env, m, h, today);
  if(loaded.error) return {reply:loaded.error};
  const current = params.currentJobId || options.context?.jobId || '';
  const picked = pickNextWork(loaded.jobs, today, current);
  if(picked.choices){
    return {reply:'Na stejný termín vidím víc zakázek a nehádám pořadí. Vyberte jednu. Cestu jsem nezahájil.\n'+picked.choices.map(occurrenceLine).join('\n'), cards:jobCards(picked.choices.map(row=>row.job))};
  }
  if(!picked.next) return {reply:'Další přiřazenou práci v rozvrhu nevidím. Pořadí jsem si nevymyslel.'};
  const row = picked.next;
  const lead = row.date===today ? 'Další práce dnes' : 'Dnes už nic dalšího nemáte. Nejbližší další práce';
  const time = row.timed ? ` v ${row.time}` : ', bez určeného času výjezdu';
  const place = [row.job.customerName, row.job.address, row.job.city].filter(Boolean).join(' · ');
  return {reply:`${lead}: „${row.job.title}“${place?' · '+place:''}, ${row.date}${time}. Cestu ani stav zakázky jsem nezměnil.`, cards:jobCards([row.job])};
}
async function navigationAddress(env, m, h, params, today, options){
  const currentId = params.currentJobId || options.context?.jobId || '';
  let job = null;
  if(currentId){
    const loaded = await jobsGet(env, m, h, '/api/jobs/'+encodeURIComponent(currentId));
    if(!loaded.ok) return {reply:blocked(loaded)||'Zakázku se nepodařilo načíst. Adresu jsem si nevymyslel.'};
    job = loaded.data.job;
  }else{
    const found = await nextWork(env, m, h, params, today, options);
    if(!found.cards?.length) return {reply:(found.reply||'Adresu nemám.')+' Mapu jsem neotevřel.'};
    return {reply:found.reply+' Tlačítko jen otevře mapu se skutečnou adresou. Cestu jsem nezahájil.', cards:found.cards};
  }
  const href = mapsHref(job);
  if(!href) return {reply:`U „${job.title}“ adresa v evidenci není. Mapu jsem neotevřel a adresu jsem si nevymyslel.`, cards:jobCards([job])};
  return {reply:`Adresa „${job.title}“: ${[job.address, job.city].filter(Boolean).join(', ')}. Tlačítko jen otevře mapu. Cestu jsem nezahájil.`, cards:jobCards([job])};
}
async function catalogStock(env, m, h, query){
  const found = await catalogLookup(env, m, h, query);
  if(found.reply) return found;
  const name = found.choices?query:found.item.name;
  return {reply:`Skladové množství u „${name}“ katalog neeviduje. Číslo si nevymýšlím.${found.choices?' Vyhovuje víc položek: '+found.choices.map(item=>item.name).join(', ')+'.':''}`};
}
async function catalogLookup(env, m, h, query){
  const wanted = String(query||'').trim();
  if(!wanted) return {reply:'O kterou položku jde? Název ani cenu jsem si nevymyslel.'};
  const result = await materialsGet(env, m, h);
  const error = blocked(result);
  if(error) return {reply:error};
  if(result.data.nextCursor) return {reply:'Katalog je delší než jedna stránka. Upřesněte název, ať nesáhnu vedle.'};
  const found = matchProtocolQuery(wanted, result.data.items||[]);
  if(found.missing) return {reply:`Položku „${wanted}“ v katalogu nevidím. Novou nezakládám a cenu nevymýšlím.`};
  if(found.choices) return {choices:found.choices, reply:`„${wanted}“ sedí na víc položek: ${found.choices.map(item=>item.name).join(', ')}. Jednu jsem nevybral.`};
  return {item:found.item};
}
function materialCards(items){
  return (items||[]).filter(item=>item?.id).slice(0,8).map(item=>({
    type:'material', id:item.id, title:item.name, subtitle:[item.categoryName, item.unit].filter(Boolean).join(' · '),
    meta:item.sku||'', openLabel:'Otevřít materiál'
  }));
}
function reply(mode, text, extra={}){
  const info = assistantModeInfo(mode);
  return {mode:info.id, modeLabel:info.label, modeNote:info.detail, available:info.available===true, reply:text, suggestions:extra.suggestions||[], cards:extra.cards||[], concept:extra.concept||null, context:extra.context||null, confirm:extra.confirm||null, mutated:extra.mutated||null, unavailable:extra.unavailable===true||info.available!==true};
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
async function auditCommit(env, row, summary, h){
  const result = await env.DB.prepare("UPDATE assistant_events SET kind='committed', summary=?, committed_at=? WHERE id=? AND actor_id=? AND kind='committing'")
    .bind(summary.slice(0,500), Date.now(), row.id, row.actor_id).run();
  if(!result.meta.changes) h.fail(409,'Tohle potvrzení už není rozpracované. Zadejte příkaz znovu.');
}

export async function handleAssistant(request, env, ctx, m, h){
  const body = await h.body(request, 120000);
  if(!body||typeof body!=='object'||Array.isArray(body)) h.fail(400,'Neplatný příkaz.');
  const mode = assistantModeInfo(typeof body.mode==='string'?body.mode:'basic').id;
  const info = assistantModeInfo(mode);
  if(body.catalog===true) return h.json({mode:info.id, modeLabel:info.label, modeNote:info.detail, available:info.available===true, providers:ASSISTANT_PROVIDERS, knowledge:KNOWLEDGE_KINDS, reply:'Katalog režimů a znalostí. Modely ani manuály se nestahují.'});
  if(info.available!==true) return h.json(reply(mode, info.detail, {unavailable:true}));
  const preview = request.headers.get('x-work-diary-preview-role');
  h._headers = request.headers;
  if(body.cancelId) return h.json(await cancel(env, m, h, body.cancelId, mode));
  if(body.confirmId) return h.json(await confirm(env, ctx, m, h, body.confirmId, mode, preview, body.concept));
  if(body.file){
    const answer = await fileImport(env, m, h, body, preview);
    return h.json(reply(mode, answer.reply, answer));
  }
  const today = pragueDate(new Date());
  const context = body.context&&typeof body.context==='object'&&!Array.isArray(body.context)?body.context:null;
  const rawText = typeof body.text==='string'?body.text:'';
  const entries = await dictionaryEntries(env);
  const text = parseDictionaryCommand(rawText)?rawText:applyAssistantDictionary(rawText, entries);
  const command = interpretAssistant(text, today, context);
  const hinted = command.intent==='unknown'?modelReadCommand(body.understanding):null;
  const answer = await run(env, ctx, m, h, hinted||command, today, {propose:true, preview, context:body.context&&typeof body.context==='object'?body.context:null});
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

async function applyConceptEdit(env, m, h, action, concept){
  if(!concept||typeof concept!=='object'||Array.isArray(concept)||!action?.params) return;
  if(action.intent==='protocol.report') return applyProtocolConceptEdit(action, concept);
  if(action.intent!=='jobs.plan') return;
  if(typeof concept.title==='string'&&concept.title.trim()) action.params.title = concept.title.trim().slice(0,120);
  if(typeof concept.notes==='string') action.params.description = concept.notes.trim().slice(0,2000);
  if(typeof concept.customerName==='string' && concept.customerName.trim() && concept.customerName.trim()!==action.params.customerName){
    const found = await findPlannedCustomer(env, m, h, {customer:concept.customerName.trim(), customerStem:nameStem(concept.customerName)});
    if(found.error) h.fail(400, found.error);
    action.params.customerId = found.customerId;
    action.params.customerName = found.customerName;
    action.params.customerAddressId = found.customerAddressId;
    if(typeof concept.address!=='string' || !concept.address.trim()) action.params.address = found.address;
    if(typeof concept.city!=='string' || !concept.city.trim()) action.params.city = found.city;
  }
  if(typeof concept.address==='string') action.params.address = concept.address.trim().slice(0,500);
  if(typeof concept.city==='string') action.params.city = concept.city.trim().slice(0,120);
  if(Array.isArray(concept.materials)) action.params.materials = concept.materials.slice(0,20).map(item=>({name:String(item?.name||'').slice(0,120), quantity:String(item?.quantity||'').slice(0,20), unit:String(item?.unit||'').slice(0,20), readiness:item?.readiness==='on_hand'?'on_hand':'to_buy'})).filter(item=>item.name);
  if(!Array.isArray(concept.terms)) return;
  const members = await env.DB.prepare("SELECT user_id AS id, name FROM members WHERE EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role IN ('owner','administrator','admin'))").bind(m.user_id).all();
  const terms = [];
  const seen = new Set();
  for(const term of concept.terms.slice(0,14)){
    const date = String(term?.date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||seen.has(date)) h.fail(400,'Každý den konceptu musí mít vlastní platné datum. Nic jsem neuložil.');
    seen.add(date);
    const start = /^\d{2}:\d{2}$/.test(term?.start)?term.start:'07:00';
    const end = /^\d{2}:\d{2}$/.test(term?.end)?term.end:'15:00';
    if(end<=start) h.fail(400,'Konec dne musí být po začátku. Nic jsem neuložil.');
    const names = (Array.isArray(term.people)?term.people:[String(term.people||'')]).flatMap(name=>String(name).split(',')).map(name=>name.trim()).filter(Boolean);
    const matched = matchPeople(names, members.results||[]);
    if(!names.length) h.fail(400,'Doplňte pracovníka ke každému dni. Nic jsem neuložil.');
    if(matched.ambiguous.length||matched.resolved.length!==names.length) h.fail(400,'Pracovníka z konceptu nevidím v týmu. Nic jsem neuložil.');
    terms.push({date, start, end, note:String(term.note||'').slice(0,300), names, people:matched.resolved.map(person=>person.id), status:term.status==='done'?'done':'planned'});
  }
  if(!terms.length) h.fail(400,'Koncept nemá žádný den. Nic jsem neuložil.');
  action.params.terms = terms.sort((a,b)=>a.date.localeCompare(b.date));
}
async function confirm(env, ctx, m, h, id, mode, preview, concept){
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
  let action, done;
  try{
    action = JSON.parse(row.payload);
    if(concept) await applyConceptEdit(env, m, h, action, concept);
    done = await run(env, ctx, m, h, action, pragueDate(new Date()), {propose:false, preview});
  }catch(error){
    await env.DB.prepare("UPDATE assistant_events SET kind='proposal' WHERE id=? AND actor_id=? AND company_id=? AND kind='committing'").bind(id, m.user_id, company).run();
    throw error;
  }
  if(done.confirm){
    await auditCommit(env, row, 'Vyžaduje další potvrzení. '+done.reply, h);
    return reply(mode, done.reply, {confirm:done.confirm});
  }
  await auditCommit(env, row, done.reply, h);
  return reply(mode, done.reply, {mutated:done.mutated||null, context:done.context||null, concept:done.concept||null});
}

async function run(env, ctx, m, h, command, today, options){
  const {intent, params} = command;
  const tomorrow = addDays(today, 1);
  if(!options.propose&&intent==='protocol.draft'&&params.jobId) return protocolDraft(env, ctx, m, h, {id:params.jobId, title:params.title, description:params.description||'', dueDate:params.dueDate||''}, options);
  if(!options.propose&&intent==='jobs.create'&&params.dueDate) return createJob(env, m, h, params, today, tomorrow, options);
  if(!options.propose&&intent==='jobs.plan') return planJob(env, m, h, params, today, options);
  if(!options.propose&&intent==='customers.create'&&params.name) return createCustomer(env, m, h, params, options);
  if(!options.propose&&intent==='jobs.reschedule'&&params.jobId) return applyJobChange(env, m, h, params);
  if(!options.propose&&intent==='jobs.assign'&&params.jobId) return applyJobChange(env, m, h, params);
  if(!options.propose&&intent==='jobs.status'&&params.jobId) return applyStatus(env, m, h, params);
  if(!options.propose&&intent==='jobs.depart'&&params.jobId) return applyDeparture(env, m, h, params);
  if(!options.propose&&intent==='attendance.arrive') return applyPunch(env, m, h, 'arrival', params);
  if(!options.propose&&intent==='attendance.leave') return applyPunch(env, m, h, 'departure', params);
  if(!options.propose&&intent==='materials.add'&&params.jobId) return applyMaterialLines(env, ctx, m, h, params);
  if(!options.propose&&intent==='protocol.note'&&params.jobId) return applyProtocolNote(env, ctx, m, h, params);
  if(!options.propose&&intent==='protocol.report'&&params.jobId&&typeof params.work==='string') return commitProtocolReport(env, ctx, m, h, params);
  if(!options.propose&&intent==='defects.track'&&params.jobId) return commitDefect(env, ctx, m, h, params);
  if(!options.propose&&intent==='jobs.followup'&&params.sourceJobId) return commitFollowUp(env, m, h, params);
  if(!options.propose&&intent==='jobs.complete'&&params.jobId) return commitComplete(env, m, h, params);
  if(!options.propose&&intent==='protocol.photo'&&params.jobId&&params.photoId) return commitPhoto(env, ctx, m, h, params);
  if(!options.propose&&intent==='diary.day'&&params.jobId&&Array.isArray(params.days)) return commitDiary(env, ctx, m, h, params);
  if(!options.propose&&intent==='dictionary.add'&&params.phrase) return commitDictionary(env, m, params);
  if(intent==='dictionary.list') return listDictionary(env);
  if(intent==='assistant.clarify'||intent==='assistant.explain'||intent==='assistant.refuse'||intent==='assistant.batch'||intent==='materials.plan'){
    return {reply:params.reply||'Potřebuji upřesnit. Nic jsem nezměnil.'};
  }
  if(intent==='jobs.next') return nextWork(env, m, h, params, today, options);
  if(intent==='navigation.address') return navigationAddress(env, m, h, params, today, options);
  if(intent==='materials.stock') return catalogStock(env, m, h, params.query||'');
  if(!options.propose&&intent==='import.customers') return applyCustomerImport(env, m, h, params);
  if(!options.propose&&intent==='import.materials') return applyMaterialImport(env, m, h, params);
  if(intent==='unknown') return {reply:'Tomuhle příkazu nerozumím. Můžete zkusit některou z dostupných akcí.', suggestions:assistantSuggestions()};
  if(intent==='help') return {reply:'Umím zakázky, docházku, hodiny na zakázce z evidence, zákazníky, materiál a přípravu servisního protokolu. Zákazníka a zakázku přidám jen tehdy, když to smí vaše role, a zápis nejdřív potvrdíte. Mazání nechávám na stávajících obrazovkách.', suggestions:assistantSuggestions()};
  if(intent==='refused.destructive') return {reply:'Smazání nebo zrušení tady nespouštím, aby se nic omylem neztratilo. Použijte stávající obrazovku záznamu.'};

  if(intent.startsWith('jobs.')||intent.startsWith('protocol.')){
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
    const jobs = result.data.jobs||[];
    return {reply:`${label} (${day}):\n`+lines(jobs, jobLine, 'Žádná návštěva v tento den není.'), cards:jobCards(jobs)};
  }
  if(intent==='jobs.upcoming'||intent==='jobs.plannedServices'||intent==='jobs.week'){
    const type = intent==='jobs.plannedServices'?'&type=service':'';
    const range = weekRange(today);
    const span = intent==='jobs.week'?`&from=${range.start}&to=${range.end}`:`&after=${today}`;
    const result = await jobsGet(env,m,h,`/api/jobs?state=active&order=schedule${intent==='jobs.week'?span:'&after='+today}${type}`);
    const error = blocked(result);
    if(error) return {reply:error};
    const title = intent==='jobs.plannedServices'?'Plánované servisy':intent==='jobs.week'?`Tento týden (${range.start} až ${range.end})`:'Nadcházející zakázky';
    return {reply:`${title}:\n`+lines(result.data.jobs||[], jobLine, 'Nic dalšího v plánu není.'), cards:jobCards(result.data.jobs)};
  }
  if(intent==='jobs.incomplete'){
    const result = await jobsGet(env,m,h,'/api/jobs?state=incomplete&order=schedule');
    const error = blocked(result);
    if(error) return {reply:error};
    return {reply:'Nedokončené zakázky:\n'+lines(result.data.jobs||[], jobLine, 'Nedokončená zakázka tu není.'), cards:jobCards(result.data.jobs)};
  }
  if(intent==='customers.waitingService'){
    if(!on(h.features,'jobs')) return {reply:'Zakázky jsou v nastavení firmy vypnuté.'};
    const result = await jobsGet(env,m,h,'/api/jobs?state=active&type=service&order=schedule');
    const error = blocked(result);
    if(error) return {reply:error};
    return {reply:'Zákazníci, kteří čekají na servis:\n'+lines(result.data.jobs||[], job=>`• ${job.customerName||'Zákazník bez jména'} · ${job.title} (${STATUS[job.status]||job.status})`, 'Žádný otevřený servis v zakázkách nevidím.')};
  }
  if(intent==='jobs.realizationHours') return realizationHours(env, m, h);
  if(intent==='jobs.crew') return crewOnRealization(env, m, h, today);
  if(intent==='defects.track') return proposeDefect(env, ctx, m, h, params, options);
  if(intent==='jobs.followup') return proposeFollowUp(env, m, h, params, today, options);
  if(intent==='jobs.complete') return proposeComplete(env, ctx, m, h, params, options);
  if(intent==='protocol.photo') return proposePhoto(env, ctx, m, h, params, options);
  if(intent==='diary.day') return proposeDiary(env, m, h, params, options);
  if(intent==='dictionary.add') return proposeDictionary(env, m, params, options);
  if(intent==='jobs.reschedule'||intent==='jobs.assign'||intent==='jobs.depart'||intent==='jobs.status') return prepareJobCommand(env, m, h, intent, params, today, tomorrow, options);
  if(intent==='attendance.active'||intent==='attendance.arrive'||intent==='attendance.leave') return attendanceCommand(env, m, h, intent, params, today, options);
  if(intent==='jobs.search'||intent==='jobs.history'||intent==='jobs.hours'||intent==='jobs.materials'||intent==='protocol.draft'){
    return jobIntent(env, ctx, m, h, intent, params, today, tomorrow, options);
  }
  if(intent==='jobs.create') return createJob(env, m, h, params, today, tomorrow, options);
  if(intent==='jobs.plan') return planJob(env, m, h, params, today, options);
  if(intent==='customers.create') return createCustomer(env, m, h, params, options);
  if(intent==='attendance.hours'||intent==='attendance.report') return attendanceIntent(env, m, h, intent, params, today);
  if(intent==='customers.search'||intent==='customers.contact'||intent==='customers.history'||intent==='customers.tariffs') return customerIntent(env, m, h, intent, params);
  if(intent==='materials.search') return materialSearch(env, m, h, params.query||'');
  if(intent==='materials.add'||intent==='materials.price'||intent==='materials.readiness'||intent==='materials.shopping') return materialCommand(env, ctx, m, h, intent, params, today, tomorrow, options);
  if(intent==='protocol.report') return protocolReport(env, ctx, m, h, params, options);
  if(intent==='protocol.check'||intent==='protocol.note') return protocolCommand(env, ctx, m, h, intent, params, options);
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
    const hinted = options.context?.jobId;
    if(typeof hinted==='string'&&/^[-a-zA-Z0-9_]{1,80}$/.test(hinted)){
      const one = await jobsGet(env,m,h,'/api/jobs/'+encodeURIComponent(hinted));
      const error = blocked(one, 'Zakázku se nepodařilo načíst.');
      if(error) return {reply:error};
      return recordedJobHours(env, m, h, one.data.job, params.person);
    }
    const picked = await resolveProtocolJob(env, m, h, params, options, {jobId:''});
    if(picked.choices) return {reply:'Není jednoznačně aktivní zakázka. Hodiny z rozvrhu nepoužívám.\n'+lines(picked.choices, jobLine, '')};
    if(!picked.job) return {reply:'Napište název zakázky. Otevřenou zakázku v tomto příkazu nevidím a čas z rozvrhu neodhaduji.'};
    return recordedJobHours(env, m, h, picked.job, params.person);
  }
  if(intent==='jobs.search'&&(params.dueDate||params.from||params.person||params.mine)) return scopedJobSearch(env, m, h, params, today);
  const found = await findJobs(env, m, h, params.query||'');
  if(found.error) return {reply:found.error};
  if(intent==='jobs.search') return {reply:params.query?`Zakázky pro „${params.query}“:\n`+lines(found.jobs, jobLine, 'Nic jsem nenašel.'):'Napište, jakou zakázku mám hledat.', cards:jobCards(found.jobs), suggestions:[]};
  const picked = oneJob(found.jobs, params.query);
  if(picked.error) return {reply:picked.error};
  if(picked.choices) return {reply:`Našel jsem víc zakázek. Upřesněte název:\n`+lines(picked.choices, jobLine, '')};
  const job = picked.job;
  if(intent==='jobs.history') return jobHistory(env, ctx, m, h, job);
  if(intent==='jobs.hours') return recordedJobHours(env, m, h, job, params.person);
  if(intent==='jobs.materials') return materialForJobs(env, ctx, m, h, [job], job.dueDate||today);
  return protocolDraft(env, ctx, m, h, job, options);
}

function nearName(query, name){
  const left = nameStem(query), right = nameStem(name);
  if(!left||!right) return false;
  if(left===right) return true;
  if(Math.abs(left.length-right.length)>1||Math.min(left.length, right.length)<4) return false;
  if(left.length===right.length){
    let diff = 0;
    for(let i=0;i<left.length;i++) if(left[i]!==right[i]&&++diff>1) return false;
    return diff===1;
  }
  const short = left.length<right.length?left:right, long = left.length<right.length?right:left;
  for(let i=0;i<long.length;i++) if(long.slice(0,i)+long.slice(i+1)===short) return true;
  return false;
}
function czechDate(iso){
  const date = new Date(iso+'T12:00:00Z');
  const day = ['neděli','pondělí','úterý','středu','čtvrtek','pátek','sobotu'][date.getUTCDay()];
  const rest = new Intl.DateTimeFormat('cs-CZ',{day:'numeric', month:'numeric', timeZone:'UTC'}).format(date);
  return `${day} ${rest}`;
}
async function scopedJobSearch(env, m, h, params, today){
  let assignee = params.mine?m.user_id:'';
  let who = params.mine?'vás':'';
  if(params.person){
    const people = await attendanceGet(env, m, h, `/api/attendance?month=${today.slice(0,7)}`+(manager(m)?'&userId=all':''));
    if(!people.ok) return {reply:blocked(people)||'Tým se nepodařilo načíst. Zakázky jsem nevypsal.'};
    const hits = (people.data.employees||[]).filter(person=>nearName(params.person, person.name));
    if(!hits.length) return {reply:`Pracovníka „${params.person}“ v týmu nevidím, ani po skloňování a drobném překlepu. Zakázky jsem nevypsal.`};
    if(hits.length>1) return {reply:'Vyhovuje víc lidí: '+hits.map(person=>person.name).join(', ')+'. Upřesněte jméno.'};
    assignee = hits[0].id;
    who = hits[0].name;
    if(!manager(m)&&assignee!==m.user_id) return {reply:'Můžete zobrazit jen vlastní zakázky.'};
  }
  const period = params.dueDate?`na ${czechDate(params.dueDate)}`:params.from?`od ${czechDate(params.from)} do ${czechDate(params.to)}`:'';
  let path = params.dueDate
    ? `/api/jobs?state=all&order=schedule&month=${params.dueDate.slice(0,7)}&day=${params.dueDate}`
    : params.from
      ? `/api/jobs?state=all&order=schedule&from=${params.from}&to=${params.to}`
      : '/api/jobs?state=all&order=schedule';
  if(assignee) path += `&assignee=${encodeURIComponent(assignee)}`;
  const result = await jobsGet(env, m, h, path);
  const error = blocked(result, 'Zakázky se nepodařilo načíst.');
  if(error) return {reply:error};
  const jobs = result.data.jobs||[];
  const whose = who?` pro ${who}`:'';
  const title = `Zakázky${whose}${period?' '+period:''}`;
  return {reply:jobs.length?`${title}:\n`+lines(jobs, jobLine, ''):`${title}: nic jsem nenašel.`, cards:jobCards(jobs)};
}
function attendanceCaution(shifts, range, total){
  if(!range) return '';
  const now = Date.now();
  const start = attendanceInstant(range.start+'T00:00');
  const end = attendanceInstant(addDays(range.end, 1)+'T00:00');
  const used = (shifts||[]).filter(shift=>{
    const stop = shift.endAt==null?now:shift.endAt;
    return stop>start && shift.startAt<end;
  }).sort((a,b)=>a.startAt-b.startAt);
  const notes = [];
  if(used.some(shift=>shift.endAt==null)) notes.push('některá směna nemá odchod a pořád běží');
  for(let i=1;i<used.length;i++){
    const previous = used[i-1].endAt==null?now:used[i-1].endAt;
    if(used[i].startAt<previous){notes.push('směny se překrývají, součet je proto vyšší než odpracovaný čas'); break;}
  }
  const dayMs = 16*60*60*1000;
  let day = range.start, tooLong = false;
  while(day<=range.end){
    const dayStart = attendanceInstant(day+'T00:00'), dayEnd = attendanceInstant(addDays(day,1)+'T00:00');
    let slice = 0;
    for(const shift of used){
      const stop = shift.endAt==null?now:shift.endAt;
      slice += Math.max(0, Math.min(stop, dayEnd)-Math.max(shift.startAt, dayStart));
    }
    if(slice>dayMs) tooLong = true;
    day = addDays(day, 1);
  }
  if(tooLong||total>dayMs*(1+Math.round((Date.parse(range.end)-Date.parse(range.start))/86400000))) notes.push('součet za den je neobvykle vysoký');
  if(!notes.length) return '';
  return ` Evidence vypadá chybně: ${[...new Set(notes)].join('; ')}. Číslo je ze záznamů, nevymyslel jsem ho, ale před použitím ho zkontrolujte.`;
}
function jobHoursUnavailable(){
  return {reply:'Odpracované hodiny na zakázce v téhle evidenci nemám. Plánovaný čas z rozvrhu nepoužívám, abych nic neodhadoval.'};
}
async function recordedJobHours(env, m, h, job, person){
  let jobTime = null;
  try{({handleJobTime:jobTime} = await import('./job-time.js'));}
  catch{jobTime = typeof handleJobTime==='function' ? handleJobTime : null;}
  if(typeof jobTime!=='function') return jobHoursUnavailable();
  const result = await callJson(()=>jobTime(get('/api/jobs/'+encodeURIComponent(job.id)+'/time', h._headers), env, m, h));
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

function slimProtocol(draft){
  return {
    jobId:draft.jobId||'',
    work:String(draft.work||'').slice(0,4000),
    asked:Array.isArray(draft.asked)?draft.asked.slice(0,16):[],
    history:(draft.history||[]).slice(-6).map(item=>({jobId:item.jobId||'', work:item.work||'', asked:item.asked||[], materials:item.materials||[]})),
    materials:(draft.materials||[]).slice(0,30).map(line=>({key:line.key||'', label:line.label||'', query:line.query||'', quantity:line.quantity??null, unit:line.unit||'', generic:line.generic!==false, status:line.status||'', itemId:line.itemId||'', itemVersion:line.itemVersion||0, catalogName:line.catalogName||'', choices:(line.choices||[]).slice(0,6)})),
    pendingQuestion:String(draft.pendingQuestion||'').slice(0,40)
  };
}
function protocolConcept(draft, job, questions){
  return {
    kind:'protocol',
    jobId:job?.id||draft.jobId||'',
    jobTitle:job?.title||'',
    customerName:job?.customerName||'',
    address:job?.address||'',
    city:job?.city||'',
    work:draft.work||'',
    materials:(draft.materials||[]).map(line=>({key:line.key, label:line.label, query:line.query, quantity:line.quantity==null?'':String(line.quantity), unit:line.unit||'', status:line.status||'', itemId:line.status==='matched'?line.itemId||'':'', choiceId:line.status==='matched'?line.itemId||'':'', name:line.catalogName||line.label, choices:line.choices||[]})),
    questions:questions?.required||[],
    optionalQuestions:questions?.optional||[]
  };
}
function protocolReplyText(job, draft){
  const questions = serviceDraftQuestions(draft);
  const rows = (draft.materials||[]).map(line=>{
    const qty = line.quantity==null?'množství k upřesnění':`${line.quantity} ${line.unit||''}`.trim();
    if(line.status==='matched') return `• ${line.catalogName||line.label}: ${qty}.`;
    if(line.status==='choices') return `• ${line.label}: ${qty}. V katalogu je víc možností, nic jsem nevybral.`;
    if(line.status==='missing') return `• ${line.label}: ${qty}. V katalogu položku nevidím, novou nezakládám.`;
    if(line.status==='unquantified') return `• ${line.label}: množství k upřesnění.`;
    return `• ${line.label}: ${qty}.`;
  });
  const where = job?`Zakázka „${job.title}“${job.customerName?' · '+job.customerName:''}${job.address?' · '+job.address:''}.`:'Zakázku jsem jednoznačně nenašel. Zápis nikam neukládám.';
  const ask = questions.required.length?'\nPotřebuji upřesnit:\n'+questions.required.map(item=>'• '+item).join('\n'):'';
  const optional = questions.optional.length?'\nMůžete doplnit, není to povinné:\n'+questions.optional.map(item=>'• '+item).join('\n'):'';
  return `${where}\n\nProvedené práce:\n${draft.work}\n\nSpotřebovaný materiál:\n${rows.join('\n')||'• Z diktátu nevidím materiál.'}${ask}${optional}${job?' Do protokolu se to zapíše až po potvrzení.':''}`;
}
function storedProtocol(draft){
  return {
    jobId:draft.jobId,
    work:String(draft.work||'').slice(0,4000),
    materials:(draft.materials||[]).slice(0,30).map(line=>({
      key:String(line.key||'').slice(0,40), label:String(line.label||'').slice(0,80), query:String(line.query||'').slice(0,160),
      quantity:line.quantity??null, unit:String(line.unit||'').slice(0,8), generic:line.generic!==false,
      itemId:line.status==='matched'?String(line.itemId||''):'', itemVersion:line.status==='matched'?Number(line.itemVersion||0):0,
      name:String(line.catalogName||line.label||'').slice(0,160),
      choices:(line.choices||[]).slice(0,6).map(item=>({id:item.id, version:item.version, name:item.name, unit:item.unit}))
    }))
  };
}
function applyProtocolConceptEdit(action, concept){
  if(concept.kind!=='protocol') return;
  if(typeof concept.work==='string'&&concept.work.trim()) action.params.work = concept.work.trim().slice(0,4000);
  if(!Array.isArray(concept.materials)) return;
  action.params.materials = (action.params.materials||[]).map((line, index)=>{
    const edited = concept.materials.find(item=>item&&item.key&&item.key===line.key)||concept.materials[index];
    if(!edited||typeof edited!=='object') return line;
    let quantity = line.quantity;
    if(edited.quantity===''||edited.quantity==null) quantity = null;
    else {
      const number = Number(String(edited.quantity).replace(',','.'));
      if(Number.isFinite(number)&&number>=0&&number<=1000000) quantity = Math.round(number*1000)/1000;
    }
    const allowed = [line.itemId, ...(line.choices||[]).map(item=>item.id)].filter(Boolean);
    const choice = String(edited.choiceId||'');
    if(choice && allowed.includes(choice)){
      const picked = (line.choices||[]).find(item=>item.id===choice) || (choice===line.itemId?{id:line.itemId, version:line.itemVersion, name:line.name, unit:line.unit}:null);
      if(picked) return {...line, quantity, itemId:picked.id, itemVersion:picked.version, name:picked.name, unit:picked.unit||line.unit};
    }
    if(!line.itemId) return {...line, quantity, itemId:'', itemVersion:0};
    return {...line, quantity};
  });
}
async function resolveProtocolJob(env, m, h, params, options, draft){
  if(params.jobQuery){
    const found = await findJobs(env, m, h, params.jobQuery);
    if(found.error) return {error:found.error};
    const picked = oneJob((found.jobs||[]).filter(job=>job.status!=='done'), params.jobQuery);
    if(picked.error) return {error:picked.error};
    if(picked.choices) return {choices:picked.choices};
    return {job:picked.job};
  }
  const hinted = params.jobId || draft.jobId || options.context?.jobId || '';
  if(hinted){
    const loaded = await jobsGet(env,m,h,'/api/jobs/'+encodeURIComponent(hinted));
    if(!loaded.ok) return {error:blocked(loaded)||'Otevřenou zakázku se nepodařilo načíst. Nic jsem nepřiřadil.'};
    return {job:loaded.data.job};
  }
  const listed = await jobsGet(env,m,h,'/api/jobs?state=active&assignee='+encodeURIComponent(m.user_id));
  if(!listed.ok) return {error:blocked(listed)||'Zakázky se nepodařilo načíst. Nic jsem nepřiřadil.'};
  if(listed.data.nextCursor) return {error:'Otevřených zakázek je víc, než můžu bezpečně projít. Napište název. Nic jsem nepřiřadil.'};
  const jobs = listed.data.jobs||[];
  const running = jobs.filter(job=>job.status==='in_progress');
  if(running.length===1) return {job:running[0]};
  if(running.length>1) return {choices:running};
  const today = pragueDate(new Date());
  const due = jobs.filter(job=>job.dueDate===today && job.status!=='done');
  if(due.length===1) return {job:due[0]};
  if(due.length>1) return {choices:due};
  if(jobs.length) return {choices:jobs};
  return {error:'Nemáte přiřazenou otevřenou zakázku. Napište její název. Nic jsem nepřiřadil.'};
}
async function protocolReport(env, ctx, m, h, params, options){
  if(!writer(m)) return {reply:'Protokol může připravit pracovník nebo správce. Nic jsem neuložil.'};
  if(options.preview) return {reply:'V náhledu role protokol neukládám. Nic jsem neuložil.'};
  let draft = null;
  if(params.base){
    const revised = reviseServiceDraft(params.base, params.text||'');
    if(revised?.undo==='empty') return {reply:'Žádnou předchozí úpravu protokolu nemám. Nic jsem neměnil.', concept:protocolConcept(params.base, null, serviceDraftQuestions(params.base)), context:{protocol:slimProtocol(params.base), jobId:params.base.jobId||options.context?.jobId||''}};
    if(revised?.clarify) return {reply:revised.clarify, concept:protocolConcept(params.base, null, serviceDraftQuestions(params.base)), context:{protocol:slimProtocol({...params.base, pendingQuestion:''}), jobId:params.base.jobId||options.context?.jobId||''}};
    draft = revised?.draft || params.base;
  }
  if(!draft) draft = params.draft || parseServiceDictation(params.text||'');
  if(!draft?.work) return {reply:'Tomuhle zápisu nerozumím. Protokol jsem neměnil.'};
  const catalog = await materialsGet(env, m, h);
  if(!catalog.ok) return {reply:blocked(catalog)||'Katalog se nepodařilo načíst. Nic jsem neuložil.'};
  if(catalog.data.nextCursor) return {reply:'Katalog je delší než jedna stránka. Položky jsem nespároval, ať nesáhnu vedle. Nic jsem neuložil.'};
  draft = annotateProtocolMaterials(draft, catalog.data.items||[]);
  const picked = await resolveProtocolJob(env, m, h, params, options, draft);
  const questions = serviceDraftQuestions(draft);
  const pending = questions.required.length ? '' : optionalPending(questions.optional[0]||'');
  const shown = {...draft, pendingQuestion:pending};
  if(picked.choices){
    shown.jobId = '';
    return {reply:`Není jednoznačně aktivní zakázka. Zápis nikam neukládám.\n${lines(picked.choices, jobLine, '')}\n\n${protocolReplyText(null, draft)}`, concept:protocolConcept(draft, null, questions), context:{protocol:slimProtocol(shown)}};
  }
  if(picked.error||!picked.job) return {reply:`${picked.error||'Zakázku jsem nenašel. Nic jsem nepřiřadil.'}\n\n${protocolReplyText(null, draft)}`, concept:protocolConcept(draft, null, questions), context:{protocol:slimProtocol(shown)}};
  draft.jobId = picked.job.id;
  shown.jobId = picked.job.id;
  const summary = protocolReplyText(picked.job, draft);
  const confirm = await propose(env, m, {intent:'protocol.report', params:storedProtocol(draft)}, summary);
  return {reply:summary, confirm, concept:protocolConcept(draft, picked.job, questions), context:{protocol:slimProtocol(shown), jobId:picked.job.id, customerName:picked.job.customerName||''}};
}
async function commitProtocolReport(env, ctx, m, h, params){
  if(!writer(m)) return {reply:'Protokol může připravit pracovník nebo správce. Nic jsem neuložil.'};
  const service = await serviceGet(env, ctx, m, h, params.jobId);
  if(!service.ok) return {reply:blocked(service)||'Zakázku se nepodařilo otevřít. Nic jsem neuložil.'};
  const current = service.data;
  const currentWork = String(current.report?.work||'').trim();
  const nextWork = String(params.work||'').slice(0,4000).trim();
  let workToSave = nextWork;
  if(currentWork && nextWork && currentWork !== nextWork){
    const extendsCurrent = nextWork.includes(currentWork);
    if(currentWork.includes(nextWork) && !extendsCurrent) workToSave = currentWork;
    else if(!extendsCurrent){
      const author = await env.DB.prepare('SELECT updated_by FROM service_reports WHERE job_id=?').bind(params.jobId).first();
      if(author?.updated_by && author.updated_by !== m.user_id){
        return {reply:'Protokol mezitím obsahuje jiný text. Nic jsem nepřepsal. Otevřete aktuální zápis a diktujte znovu.', context:{jobId:params.jobId, customerName:current.job.customerName||'', protocol:{jobId:params.jobId, work:currentWork, materials:current.report?.materialItems||[], asked:[], history:[]}}};
      }
    }
  }
  const merged = new Map((current.report?.materialItems||[]).map(line=>[line.itemId, {itemId:line.itemId, itemVersion:line.itemVersion, quantity:line.quantity}]));
  for(const line of params.materials||[]){
    if(!line?.itemId||!Number.isSafeInteger(line.itemVersion)||line.itemVersion<1) continue;
    if(line.quantity==null) continue;
    if(Number(line.quantity)<=0){merged.delete(line.itemId); continue;}
    merged.set(line.itemId, {itemId:line.itemId, itemVersion:line.itemVersion, quantity:line.quantity});
  }
  const result = await callJson(()=>handleServiceWork(write('/api/jobs/'+encodeURIComponent(params.jobId)+'/service','PUT', protocolBody(current, keptReport(current, {work:workToSave, materialItems:[...merged.values()]})), h._headers), env, ctx, m, h));
  if(!result.ok) return {reply:result.data.error||'Protokol se nepodařilo uložit. Nic dalšího jsem nezměnil.'};
  const saved = result.data.report?.materialItems||[];
  return {reply:`Servisní protokol „${current.job.title}“ je uložený ke kontrole. Katalogové položky: ${saved.length}. Stejné množství není zapsané ještě jednou v textu materiálu.`, mutated:'jobs', context:{jobId:params.jobId, customerName:current.job.customerName||'', protocol:{jobId:params.jobId, work:params.work, materials:params.materials, asked:[], history:[]}}};
}

async function dictionaryEntries(env){
  try{
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='assistant-dictionary'").first();
    const parsed = JSON.parse(row?.value||'[]');
    return Array.isArray(parsed)?parsed.filter(entry=>entry&&entry.phrase&&entry.replacement).slice(0,80):[];
  }catch{return [];}
}
function workConcept(kind, title, summary, lines){
  return {kind, title, summary, lines:(lines||[]).filter(Boolean)};
}
async function proposeDictionary(env, m, params, options){
  if(!manager(m)) return {reply:'Slovník rozšiřuje vlastník nebo správce. Nic jsem neuložil.'};
  if(options.preview) return {reply:'V náhledu role slovník neměním.'};
  const phrase = String(params.phrase||'').trim().slice(0,40);
  const replacement = String(params.replacement||'').trim().slice(0,80);
  if(phrase.length<2||replacement.length<2) return {reply:'Výraz i význam musí mít aspoň dva znaky. Nic jsem neuložil.'};
  const summary = `Do oborového slovníku přidat „${phrase}“ ve významu „${replacement}“? Platí pro další příkazy až po potvrzení. Model se tím nepřeučuje.`;
  if(options.propose) return {reply:summary, confirm:await propose(env, m, {intent:'dictionary.add', params:{phrase, replacement}}, summary), concept:workConcept('dictionary','Slovník',summary,[phrase+' → '+replacement])};
  return commitDictionary(env, m, {phrase, replacement});
}
async function commitDictionary(env, m, params){
  if(!manager(m)) return {reply:'Slovník rozšiřuje vlastník nebo správce. Nic jsem neuložil.'};
  const current = await dictionaryEntries(env);
  const next = [...current.filter(entry=>entry.phrase.toLocaleLowerCase('cs')!==params.phrase.toLocaleLowerCase('cs')), {phrase:params.phrase, replacement:params.replacement}].slice(-80);
  await env.DB.prepare("INSERT INTO settings(key,value,version) VALUES('assistant-dictionary',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value, version=settings.version+1").bind(JSON.stringify(next)).run();
  return {reply:`Slovník teď zná „${params.phrase}“ jako „${params.replacement}“. Další příkaz se přeloží až na serveru, do katalogu se nic nezaložilo.`, mutated:'settings'};
}
async function listDictionary(env){
  const entries = await dictionaryEntries(env);
  const rows = entries.map(entry=>`• ${entry.phrase} → ${entry.replacement}`);
  const body = rows.length?rows.join('\n'):'Ve firemním slovníku zatím nic není.';
  return {reply:`Firemní slovník:\n${body}\nVestavěné výrazy třicet dvojka, PE 25 a T-kus platí pořád. Model se nepřeučuje. Novou položku katalogu jsem nezaložil.`};
}
async function crewOnRealization(env, m, h, today){
  const listed = await jobsGet(env,m,h,'/api/jobs?state=in_progress&type=installation&assignee='+encodeURIComponent(m.user_id));
  if(!listed.ok) return {reply:blocked(listed)||'Realizace se nepodařilo načíst. Nikoho jsem nedoplnil.'};
  const jobs = listed.data.jobs||[];
  if(!jobs.length) return {reply:'Nevidím probíhající realizaci, která je vám přiřazená. Nikoho jsem nedoplnil.'};
  const names = new Set();
  try{
    for(const job of jobs.slice(0,12)){
      const rows = await env.DB.prepare("SELECT user_name, start_at FROM job_time_intervals WHERE job_id=? AND kind='work' AND end_at IS NOT NULL").bind(job.id).all();
      for(const row of rows.results||[]) if(pragueDate(new Date(row.start_at))===today && row.user_name) names.add(row.user_name);
    }
  }catch{
    return {reply:'Evidenci odpracované doby se nepodařilo načíst. Nikoho jsem nedoplnil.'};
  }
  if(!names.size) return {reply:'V evidenci nevidím, kdo dnes na realizaci pracoval. Nikoho jsem nedoplnil.'};
  return {reply:'Dnes na realizaci podle evidence:\n'+[...names].map(name=>'• '+name).join('\n')};
}
async function proposeDefect(env, ctx, m, h, params, options){
  if(!writer(m)) return {reply:'Závadu může připravit pracovník nebo správce. Nic jsem neuložil.'};
  if(options.preview) return {reply:'V náhledu role závadu neukládám.'};
  const note = params.note;
  if(!note?.title||!note.description) return {reply:'Tomuhle popisu závady nerozumím. Nic jsem neuložil.'};
  const picked = await resolveProtocolJob(env, m, h, params, options, {jobId:params.jobId||''});
  const concept = workConcept('defect','Závada',note.description,[note.title, note.nextStep]);
  if(picked.choices) return {reply:`Není jednoznačně aktivní zakázka. Závadu nikam neukládám.\n${lines(picked.choices, jobLine, '')}`, concept};
  if(picked.error||!picked.job) return {reply:`${picked.error||'Zakázku jsem nenašel. Závadu jsem neuložil.'}`, concept};
  const job = picked.job;
  const garden = job.gardenId?` Sledovaná závada se založí u zahrady${job.gardenName?' '+job.gardenName:''}.`:' Zahrada u zakázky není, sledovanou závadu nezaložím a zapíšu jen text do protokolu.';
  const summary = `Závada u „${job.title}“${job.customerName?' · '+job.customerName:''}${job.address?' · '+job.address:''}.\n${note.title}\n${note.description}${note.nextStep?'\nDalší krok: '+note.nextStep:''}${garden} Uloží se až po potvrzení. Zákazníkovi nic neodešlu.`;
  const stored = {jobId:job.id, gardenId:job.gardenId||'', title:note.title, description:note.description, nextStep:note.nextStep||''};
  const confirm = await propose(env, m, {intent:'defects.track', params:stored}, summary);
  return {reply:summary, confirm, concept, context:{jobId:job.id, customerName:job.customerName||'', defectDraft:stored}};
}
async function commitDefect(env, ctx, m, h, params){
  if(!writer(m)) return {reply:'Závadu může připravit pracovník nebo správce. Nic jsem neuložil.'};
  const service = await serviceGet(env, ctx, m, h, params.jobId);
  if(!service.ok) return {reply:blocked(service)||'Zakázku se nepodařilo otevřít. Závadu jsem neuložil.'};
  const current = service.data;
  const previous = current.report?.defects||'';
  const defects = previous.includes(params.description)?previous:[previous, params.description].filter(Boolean).join('\n');
  const written = await callJson(()=>handleServiceWork(write('/api/jobs/'+encodeURIComponent(params.jobId)+'/service','PUT', protocolBody(current, keptReport(current, {defects})), h._headers), env, ctx, m, h));
  if(!written.ok) return {reply:written.data.error||'Text závady se nepodařilo uložit. Sledovanou závadu jsem nezaložil.'};
  if(!params.gardenId||!on(h.features,'gardens')) return {reply:`Text závady je v protokolu „${current.job.title}“. Sledovanou závadu nezakládám, protože zakázka nemá zahradu nebo jsou zahrady vypnuté.`, mutated:'jobs', context:{jobId:params.jobId, customerName:current.job.customerName||''}};
  const id = 'defect-'+crypto.randomUUID().replace(/-/g,'').slice(0,20);
  const created = await callJson(()=>handleGardenHistory(write('/api/defects/'+id,'PUT',{
    gardenId:params.gardenId, version:0, mutationId:crypto.randomUUID(), title:params.title, description:params.description, location:'', priority:'normal', status:'new', discoveredOn:pragueDate(new Date()), assignedTo:null, nextStep:params.nextStep||'', resolution:'', photos:[], sourceJobId:params.jobId, fromProtocol:true
  }, h._headers), env, m, h));
  if(!created.ok) return {reply:`Text závady je v protokolu. Sledovanou závadu se nepodařilo založit: ${created.data.error||'zkuste to znovu.'}`, mutated:'jobs', context:{jobId:params.jobId}};
  return {reply:`Sledovaná závada „${params.title}“ je u zahrady zakázky „${current.job.title}“. Stejný popis je v protokolu. Zákazníkovi jsem nic neodeslal.`, mutated:'jobs', context:{jobId:params.jobId, defectId:created.data.defect?.id||id, customerName:current.job.customerName||''}};
}
async function proposeFollowUp(env, m, h, params, today, options){
  if(!manager(m)) return {reply:'Navazující zakázku zakládá vlastník nebo správce. Nic jsem nezaložil.'};
  if(options.preview) return {reply:'V náhledu role zakázku nezakládám.'};
  const visit = params.visit;
  if(!visit?.dueDate) return {reply:'Nenapsali jste den další návštěvy. Zakázku jsem nezaložil.'};
  const picked = await resolveProtocolJob(env, m, h, params, options, {jobId:params.jobId||options.context?.jobId||''});
  if(picked.choices) return {reply:`Není jednoznačně aktivní zakázka. Novou návštěvu nezakládám.\n${lines(picked.choices, jobLine, '')}`};
  if(picked.error||!picked.job) return {reply:picked.error||'Původní zakázku jsem nenašel. Návštěvu jsem nezaložil.'};
  const job = picked.job;
  const defectId = String(params.defectId||options.context?.defectId||'');
  const material = (visit.materials||[]).map(item=>`${item.quantity} ${item.unit} ${item.name}`).join(', ');
  const summary = `Připravit jednu navazující zakázku „${visit.title}“ na ${visit.dueDate}${job.customerName?' u '+job.customerName:''}${job.address?' na adrese '+job.address:''}? ${material?'Potřeba '+material+'. ':''}${defectId?'Propojení s otevřenou závadou. ':'Otevřená závada k propojení není, vazbu nevymýšlím. '}Čas ani člověka nepřiřazuji, kolizi směny proto nepočítám. Uloží se až po potvrzení.`;
  const stored = {sourceJobId:job.id, dueDate:visit.dueDate, title:visit.title, customerId:job.customerId||null, customerName:job.customerName||'', address:job.address||'', city:job.city||'', gardenId:job.gardenId||null, jobType:job.jobType||'service', defectId, materials:visit.materials||[]};
  const confirm = await propose(env, m, {intent:'jobs.followup', params:stored}, summary);
  return {reply:summary, confirm, concept:workConcept('followup','Další návštěva',summary,[visit.dueDate, job.customerName, job.address, material]), context:{jobId:job.id, defectId, customerName:job.customerName||''}};
}
async function commitFollowUp(env, m, h, params){
  if(!manager(m)) return {reply:'Navazující zakázku zakládá vlastník nebo správce. Nic jsem nezaložil.'};
  const id = 'visit-'+crypto.randomUUID().replace(/-/g,'').slice(0,24);
  const material = (params.materials||[]).map(item=>`${item.quantity} ${item.unit} ${item.name}`).join(', ');
  const result = await callJson(()=>handleJobs(write('/api/jobs/'+id,'PUT',{
    version:0, title:params.title||'Další návštěva', jobType:params.jobType||'service', status:'planned', incompleteReason:'',
    description:['Navazuje na původní zakázku.', material?'Potřeba: '+material+'. Katalogovou položku jsem nezaložil.':''].filter(Boolean).join(' '),
    dueDate:params.dueDate, address:params.address||'', city:params.city||'', customerId:params.customerId||null, customerName:params.customerName||'',
    gardenId:params.gardenId||null, assignedTo:'', assignedTos:[], defectIds:params.defectId?[params.defectId]:[],
    startTime:'', endTime:'', plannedStart:'', estimatedMinutes:null, arrivalWindowStart:'', arrivalWindowEnd:'', legacyTimeMeaning:'unknown', allowOverlaps:false, previewRevision:0, terms:[]
  }, h._headers), env, m, h));
  if(!result.ok) return {reply:result.data.error||'Navazující zakázku se nepodařilo založit. Původní záznam jsem nezměnil.'};
  return {reply:`Navazující zakázka „${params.title}“ je jedna, na ${params.dueDate}. Původní zakázka zůstává. Dokument zákazníkovi neodešel.`, mutated:'jobs', context:{jobId:id, customerName:params.customerName||''}};
}
async function proposeDiary(env, m, h, params, options){
  if(!writer(m)) return {reply:'Deník realizace může připravit pracovník nebo správce. Nic jsem neuložil.'};
  if(options.preview) return {reply:'V náhledu role deník neukládám.'};
  const day = params.day;
  if(!day?.date||!day.work) return {reply:'Tomuhle dni realizace nerozumím. Nic jsem neuložil.'};
  const previous = Array.isArray(params.base?.days)?params.base.days:[];
  const days = [...previous.filter(item=>item.date!==day.date), {date:day.date, work:day.work}].sort((a,b)=>a.date.localeCompare(b.date));
  const picked = await resolveProtocolJob(env, m, h, params, options, {jobId:params.jobId||params.base?.jobId||''});
  const lines = days.map(item=>`${item.date}: ${item.work}`);
  const concept = workConcept('diary','Deník realizace',lines.join('\n'),lines);
  if(picked.choices) return {reply:`Není jednoznačně aktivní zakázka. Denní zápis nikam neukládám.\n${lines(picked.choices, jobLine, '')}`, concept};
  if(picked.error||!picked.job) return {reply:picked.error||'Zakázku jsem nenašel. Deník jsem neuložil.', concept};
  const summary = `Ke stejné zakázce „${picked.job.title}“ přidat ${days.length===1?'denní':'vícedenní'} souhrn?\n${lines.join('\n')}\nFotografie k deníku nemám, denní fotodeník se bez snímku nezaloží. Souhrn prací se zapíše do protokolu této jedné zakázky až po potvrzení.`;
  const confirm = await propose(env, m, {intent:'diary.day', params:{jobId:picked.job.id, days}}, summary);
  return {reply:summary, confirm, concept, context:{jobId:picked.job.id, diary:{jobId:picked.job.id, days}, customerName:picked.job.customerName||''}};
}
async function commitDiary(env, ctx, m, h, params){
  if(!writer(m)) return {reply:'Deník realizace může připravit pracovník nebo správce. Nic jsem neuložil.'};
  const service = await serviceGet(env, ctx, m, h, params.jobId);
  if(!service.ok) return {reply:blocked(service)||'Zakázku se nepodařilo otevřít. Souhrn jsem neuložil.'};
  const current = service.data;
  const addition = (params.days||[]).map(day=>day.work).filter(Boolean).join('\n');
  const previous = current.report?.work||'';
  const work = !previous?addition:previous.includes(addition)?previous:`${previous}\n${addition}`;
  const written = await callJson(()=>handleServiceWork(write('/api/jobs/'+encodeURIComponent(params.jobId)+'/service','PUT', protocolBody(current, keptReport(current, {work})), h._headers), env, ctx, m, h));
  if(!written.ok) return {reply:written.data.error||'Souhrn realizace se nepodařilo uložit. Novou zakázku jsem nezaložil.'};
  return {reply:`Souhrn ${params.days.length} ${params.days.length===1?'dne':'dnů'} je v protokolu jedné zakázky „${current.job.title}“. Denní fotodeník jsem nezaložil, fotografie chybí. Materiál bez jednoznačné katalogové položky jsem neúčtoval.`, mutated:'jobs', context:{jobId:params.jobId, diary:{jobId:params.jobId, days:params.days}, customerName:current.job.customerName||''}};
}
async function proposePhoto(env, ctx, m, h, params, options){
  if(!writer(m)) return {reply:'Fotografii k protokolu může připojit pracovník nebo správce. Nic jsem nepřipojil.'};
  if(options.preview) return {reply:'V náhledu role fotografii nepřipojuji.'};
  if(params.when!=='latest'){
    const capture = params.when==='before'||params.when==='after'?params.when:'gallery';
    const refusal = 'Novou fotku z věty nevyfotím a nepopisuji, co je na ní. Vyberte ji z fotoaparátu nebo galerie. Nic jsem nepřipojil.';
    const concept = workConcept('photo','Fotografie', refusal, capture==='before'?['Stav před opravou']:capture==='after'?['Stav po opravě']:['Fotoaparát nebo galerie']);
    concept.capture = capture;
    const picked = await resolveProtocolJob(env, m, h, params, options, {jobId:params.jobId||''});
    if(picked.choices) return {reply:`${refusal}\nNení jednoznačně aktivní zakázka. Fotografii nepřipojuji.\n${lines(picked.choices, jobLine, '')}`, confirm:null, concept};
    if(picked.error||!picked.job) return {reply:refusal, confirm:null, concept};
    concept.jobId = picked.job.id;
    return {reply:refusal, confirm:null, concept, context:{jobId:picked.job.id, customerName:picked.job.customerName||'', photoCapture:capture}};
  }
  const picked = await resolveProtocolJob(env, m, h, params, options, {jobId:params.jobId||''});
  if(picked.choices) return {reply:`Není jednoznačně aktivní zakázka. Fotografii nepřipojuji.\n${lines(picked.choices, jobLine, '')}`};
  if(picked.error||!picked.job) return {reply:picked.error||'Zakázku jsem nenašel. Fotografii jsem nepřipojil.'};
  const photo = await env.DB.prepare("SELECT id, name FROM service_photos WHERE job_id=? AND status='ready' ORDER BY created_at DESC, id DESC LIMIT 1").bind(picked.job.id).first();
  if(!photo) return {reply:'U zakázky není nahraná fotografie. Nic jsem nepřipojil a obsah snímku neodhaduji.'};
  const summary = `Připojit poslední nahranou fotografii „${photo.name||photo.id}“ k protokolu „${picked.job.title}“? Co je na snímku, neposuzuji. Uloží se až po potvrzení.`;
  const confirm = await propose(env, m, {intent:'protocol.photo', params:{jobId:picked.job.id, photoId:photo.id}}, summary);
  return {reply:summary, confirm, concept:workConcept('photo','Fotografie',summary,[photo.name||photo.id]), context:{jobId:picked.job.id}};
}
async function commitPhoto(env, ctx, m, h, params){
  const service = await serviceGet(env, ctx, m, h, params.jobId);
  if(!service.ok) return {reply:blocked(service)||'Zakázku se nepodařilo otevřít. Fotografii jsem nepřipojil.'};
  const current = service.data;
  const photoIds = [...new Set([...(current.report?.photoIds||[]), params.photoId])];
  const written = await callJson(()=>handleServiceWork(write('/api/jobs/'+encodeURIComponent(params.jobId)+'/service','PUT', protocolBody(current, keptReport(current, {photoIds})), h._headers), env, ctx, m, h));
  if(!written.ok) return {reply:written.data.error||'Fotografii se nepodařilo připojit.'};
  return {reply:`Poslední nahraná fotografie je u protokolu „${current.job.title}“. Co je na snímku, neposuzuji.`, mutated:'jobs', context:{jobId:params.jobId}};
}
async function proposeComplete(env, ctx, m, h, params, options){
  if(!writer(m)) return {reply:'Dokončení může připravit pracovník nebo správce. Stav jsem nezměnil.'};
  if(options.preview) return {reply:'V náhledu role zakázku neuzavírám.'};
  const picked = await resolveProtocolJob(env, m, h, params, options, {jobId:params.jobId||''});
  if(picked.choices) return {reply:`Není jednoznačně aktivní zakázka. Dokončení nikam nezapisuji.\n${lines(picked.choices, jobLine, '')}`};
  if(picked.error||!picked.job) return {reply:picked.error||'Zakázku jsem nenašel. Stav jsem nezměnil.'};
  const job = picked.job;
  const service = await serviceGet(env, ctx, m, h, job.id);
  if(!service.ok) return {reply:blocked(service)||'Protokol se nepodařilo načíst. Stav jsem nezměnil.'};
  const report = service.data.report;
  const hours = await recordedJobHours(env, m, h, job, '');
  let photos = 0, openDefects = 0;
  try{photos = (await env.DB.prepare("SELECT count(*) AS n FROM service_photos WHERE job_id=? AND status='ready'").bind(job.id).first())?.n||0;}catch{photos = 0;}
  if(job.gardenId){try{openDefects = (await env.DB.prepare("SELECT count(*) AS n FROM garden_defects WHERE garden_id=? AND status<>'resolved'").bind(job.gardenId).first())?.n||0;}catch{openDefects = 0;}}
  const blockers = [];
  if(!String(report?.work||'').trim()) blockers.push('V protokolu chybí provedené práce.');
  if(openDefects>0) blockers.push('Jsou otevřené sledované závady. Dokončení by je samo nezavřelo.');
  const warnings = [];
  if(hours.workMs==null||hours.workMs===0) warnings.push('Odpracované hodiny v evidenci nejsou.');
  if(!photos) warnings.push('Není nahraná fotografie.');
  if(!(report?.materialItems||[]).length && !String(report?.material||'').trim()) warnings.push('Materiál v protokolu není.');
  const summary = `Kontrola „${job.title}“ před dokončením:\n${blockers.length?blockers.map(item=>'• '+item).join('\n'):'• Povinné údaje protokolu a otevřené závady nebrání.'}\n${warnings.map(item=>'• '+item).join('\n')}\nDokument zákazníkovi neodešlu.`;
  const concept = workConcept('complete','Dokončení',summary,[...blockers, ...warnings]);
  if(blockers.length) return {reply:summary+' Stav jsem nezměnil.', concept, context:{jobId:job.id}};
  const confirm = await propose(env, m, {intent:'jobs.complete', params:{jobId:job.id, status:'done'}}, summary+' Označit zakázku hotovou až po potvrzení?');
  return {reply:summary+' Označit zakázku hotovou až po potvrzení?', confirm, concept, context:{jobId:job.id}};
}
async function commitComplete(env, m, h, params){
  const done = await applyStatus(env, m, h, {jobId:params.jobId, status:'done'});
  return {...done, reply:(done.reply||'Stav je uložený.')+' Dokument zákazníkovi neodešel.'};
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
    report:{date:existing?.date||(job.dueDate&&job.dueDate<=pragueDate(new Date())?job.dueDate:pragueDate(new Date())), work:existing?.work||job.description||job.title, material:existing?.material||'', defects:existing?.defects||'', notes:existing?.notes||'Připraveno asistentem ke kontrole.', recommendations:existing?.recommendations||'', photoIds:existing?.photoIds||[]}
  }, h._headers), env, ctx, m, h));
  if(!result.ok) return {reply:result.data.error||'Protokol se nepodařilo připravit.'};
  const state = result.data.report?.documentState==='ready'?'připravený ke schválení':'rozpracovaný';
  return {reply:`Servisní protokol pro „${job.title}“ je ${state}. Zkontrolujte ho v zakázce před odesláním.`, mutated:'jobs'};
}

async function linkedCustomer(env, m, h, params){
  if(params.customerId) return {customerId:params.customerId, customerName:params.customerName||''};
  if(!params.customer) return {customerId:null, customerName:''};
  if(!on(h.features,'customers')) return {error:'Seznam zákazníků je vypnutý. Zakázku jsem nezaložil.'};
  const result = await customersGet(env, m, h, '/api/customers?q='+encodeURIComponent(String(params.customer).slice(0,100)));
  if(!result.ok) return {error:blocked(result)||'Zákazníky se nepodařilo načíst. Zakázku jsem nezaložil.'};
  const needle = String(params.customer).toLocaleLowerCase('cs');
  const list = (result.data.customers||[]).filter(customer=>customer.name.toLocaleLowerCase('cs').includes(needle));
  if(!list.length) return {error:`Zákazníka „${params.customer}“ jsem nenašel. Nejdřív ho přidejte. Zakázku jsem nezaložil.`};
  if(list.length>1) return {error:'Vyhovuje víc zákazníků: '+list.slice(0,4).map(customer=>customer.name).join(', ')+'. Zakázku jsem nezaložil.'};
  return {customerId:list[0].id, customerName:list[0].name};
}

async function findPlannedCustomer(env, m, h, plan){
  if(plan?.customerId){
    const one = await customersGet(env, m, h, '/api/customers/'+encodeURIComponent(plan.customerId));
    if(!one.ok||!one.data.customer) return {error:'Zákazník z konceptu už není dostupný. Zakázku jsem nezaložil.'};
    const row = one.data.customer, place = (row.addresses||[])[0]||{};
    return {customerId:row.id, customerName:row.name, customerAddressId:plan.customerAddressId||place.id||null, address:plan.address||place.address||'', city:plan.city||place.city||''};
  }
  if(!plan?.customer) return {error:'Napište, u kterého zákazníka zakázka je. Nic jsem nevymyslel ani neuložil.'};
  if(!on(h.features,'customers')) return {error:'Seznam zákazníků je vypnutý. Zakázku jsem nezaložil.'};
  const queries = [...new Set([String(plan.customer).slice(0,40), String(plan.customerStem||nameStem(plan.customer)).slice(0,40)].filter(Boolean))];
  let rows = [];
  for(const query of queries){
    const found = await customersGet(env, m, h, '/api/customers?q='+encodeURIComponent(query));
    if(!found.ok) return {error:blocked(found)||'Zákazníky se nepodařilo načíst. Zakázku jsem nezaložil.'};
    rows.push(...(found.data.customers||[]));
  }
  let unique = [...new Map(rows.map(customer=>[customer.id, customer])).values()].filter(customer=>customerHit(plan.customer, customer.name));
  if(!unique.length){
    const all = await customersGet(env, m, h, '/api/customers');
    if(!all.ok) return {error:blocked(all)||'Zákazníky se nepodařilo načíst. Zakázku jsem nezaložil.'};
    unique = (all.data.customers||[]).filter(customer=>customerHit(plan.customer, customer.name));
  }
  if(!unique.length) return {error:`Zákazníka „${plan.customer}“ jsem v evidenci nenašel. Zakázku jsem nezaložil.`};
  if(unique.length>1) return {error:'Vyhovuje víc zákazníků: '+unique.slice(0,4).map(customer=>customer.name).join(', ')+'. Upřesněte jméno. Zakázku jsem nezaložil.'};
  const row = unique[0], place = (row.addresses||[])[0]||{};
  return {customerId:row.id, customerName:row.name, customerAddressId:place.id||null, address:place.address||'', city:place.city||''};
}
async function planJob(env, m, h, params, today, options){
  if(!manager(m)) return {reply:'Vícedenní zakázku zakládá vlastník nebo správce. Nic jsem neuložil.'};
  if(options.preview) return {reply:'V náhledu role zakázku nezakládám.'};
  if(Array.isArray(params.terms)) return commitPlan(env, m, h, params);
  const plan = params.base ? revisePlan(params.base, params.text) : planWork(params.text, today);
  if(!plan) return {reply:'Tomuhle plánu nerozumím. Zakázku jsem nezaložil.'};
  const customer = await findPlannedCustomer(env, m, h, plan);
  if(customer.error) return {reply:customer.error};
  Object.assign(plan, {customerId:customer.customerId, customerName:customer.customerName, customer:customer.customerName, customerStem:nameStem(customer.customerName), customerAddressId:customer.customerAddressId, address:customer.address, city:customer.city});
  const members = await env.DB.prepare("SELECT user_id AS id, name FROM members WHERE EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role IN ('owner','administrator','admin'))").bind(m.user_id).all();
  const wanted = [...new Set(plan.terms.flatMap(term=>term.people||[]))];
  const matched = wanted.length?matchPeople(wanted, members.results||[]):{resolved:[], ambiguous:[]};
  const byStem = new Map(matched.resolved.map(person=>[nameStem(person.query), person]));
  const unresolved = wanted.filter(name=>!byStem.has(nameStem(name))&&!matched.ambiguous.some(item=>item.query===name));
  const terms = plan.terms.map(term=>({date:term.date, start:term.start, end:term.end, note:term.note||'', names:[...(term.people||[])], people:(term.people||[]).map(person=>byStem.get(nameStem(person))?.id).filter(Boolean), status:'planned'}));
  const firstDate = terms[0].date, lastDate = terms[terms.length-1].date;
  const listed = wanted.length?await jobsGet(env, m, h, `/api/jobs?state=active&order=schedule&from=${firstDate}&to=${lastDate}`):{ok:true, data:{jobs:[]}};
  const collisions = listed.ok?planCollisions(plan, (listed.data.jobs||[]).map(job=>({title:job.title, dueDate:job.dueDate, assignedNames:String(job.assignedName||'').split(',').map(name=>name.trim()).filter(Boolean), termDates:(job.terms||[]).map(term=>term.date)}))):[];
  const questions = [];
  if(!wanted.length) questions.push('Kdo bude na zakázce pracovat? Lze je zadat pro všechny dny, nebo jinak pro každý den.');
  else if(unresolved.length||matched.ambiguous.length) questions.push('Jméno není jednoznačné. '+matched.ambiguous.map(item=>item.options.length?`${item.query}: ${item.options.join(', ')}`:`${item.query} v týmu není`).concat(unresolved.map(name=>`${name} v týmu není`)).join('; ')+'.');
  if(plan.askMaterial) questions.push('Jaký materiál je potřeba koupit a co už máte?');
  if(!customer.address) questions.push('Adresu u zákazníka v evidenci nevidím. Doplňte ji do konceptu.');
  const namesUnclear = unresolved.length>0 || matched.ambiguous.length>0;
  const warning = collisions.length?` Kolize: ${collisions.slice(0,4).map(item=>`${item.person} ${item.date} už má „${item.title}“`).join('; ')}.`:'';
  const summary = `${planSummary(plan)}${warning}${questions.length?' '+questions.join(' '):''}${namesUnclear?' Upřesněte jména, nic jsem neuložil.':' Zakázka se uloží až po potvrzení.'}`;
  const concept = {title:plan.title, customerName:customer.customerName, address:customer.address, city:customer.city, terms:plan.terms, materials:plan.materials, askMaterial:plan.askMaterial, notes:''};
  const planContext = {plan, customerName:customer.customerName};
  if(namesUnclear) return {reply:summary, concept, context:planContext};
  const stored = {operationId:crypto.randomUUID(), title:plan.title, discipline:(m._workspace&&m._workspace.selectedDiscipline&&m._workspace.selectedDiscipline!=='all')?m._workspace.selectedDiscipline:((m._workspace&&m._workspace.disciplines&&m._workspace.disciplines[0])||null), customerId:customer.customerId, customerName:customer.customerName, customerAddressId:customer.customerAddressId, address:customer.address, city:customer.city, terms, materials:plan.materials};
  const confirm = await propose(env, m, {intent:'jobs.plan', params:stored}, summary);
  return {reply:summary, confirm, concept, context:planContext};
}
async function commitPlan(env, m, h, params){
  const id = 'plan-'+String(params.operationId||crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g,'').slice(0, 80);
  const first = params.terms[0];
  if(!first||params.terms.some(term=>!Array.isArray(term.people)||!term.people.length)) h.fail(400,'Doplňte pracovníka ke každému dni. Nic jsem neuložil.');
  const ids = [...new Set(params.terms.flatMap(term=>term.people))];
  const before = await env.DB.prepare('SELECT id FROM jobs WHERE id=? AND deleted=0').bind(id).first();
  if(before) return {reply:`Zakázka „${params.title}“ už je uložená. Podruhé jsem ji nezaložil.`, mutated:'jobs', context:{jobId:id, customerName:params.customerName||''}};
  const materialNote = (params.materials||[]).map(item=>'Materiál: '+item.name+' '+item.quantity+' '+item.unit).join('\n');
  const result = await callJson(()=>handleJobs(write('/api/jobs/'+id,'PUT',{
    version:0, title:params.title, jobType:'installation', status:'planned', incompleteReason:'',
    description:[params.description||params.terms.map(term=>`${term.date} ${term.start}–${term.end} ${(term.names||[]).join(', ')}`).join('\n'), materialNote].filter(Boolean).join('\n'),
    dueDate:first.date, address:params.address||'', city:params.city||'', customerAddressId:params.customerAddressId||null,
    customerId:params.customerId, customerName:params.customerName,
    assignedTo:ids[0]||'', assignedTos:ids, terms:params.terms,
    discipline:params.discipline||null, gardenId:null, startTime:'', endTime:'', defectIds:[], plannedStart:'', estimatedMinutes:null,
    arrivalWindowStart:'', arrivalWindowEnd:'', legacyTimeMeaning:'unknown', allowOverlaps:false, previewRevision:0
  }, h._headers), env, m, h));
  if(!result.ok) h.fail(400, result.data.error||'Zakázku se nepodařilo vytvořit. Nic dalšího jsem neuložil.');
  const savedTerms = await env.DB.prepare('SELECT count(*) AS n FROM job_terms WHERE job_id=?').bind(id).first();
  if((savedTerms?.n||0)!==params.terms.length){
    await env.DB.batch([env.DB.prepare('DELETE FROM job_terms WHERE job_id=?').bind(id), env.DB.prepare('UPDATE jobs SET deleted=1, version=version+1 WHERE id=? AND deleted=0').bind(id)]);
    h.fail(400,'Termíny se neuložily společně se zakázkou. Nic jsem nenechal rozdělené.');
  }
  if(params.materials?.length){
    const note = params.materials.map(item=>`${item.name} ${item.quantity} ${item.unit} (${item.readiness==='on_hand'?'máme':'k nákupu'})`).join('; ').slice(0, 2000);
    const material = await callJson(()=>handleServiceWork(write('/api/jobs/'+id+'/service','PUT',{
      operationId:(id+'material').replace(/[^a-zA-Z0-9]/g,'').slice(0, 80), version:result.data.job.version,
      materialStatus:params.materials.some(item=>item.readiness!=='on_hand')?'missing':'checked', materialNote:note
    }, h._headers), env, {waitUntil(){}}, m, h));
    if(!material.ok){
      await env.DB.batch([env.DB.prepare('DELETE FROM job_terms WHERE job_id=?').bind(id), env.DB.prepare('UPDATE jobs SET deleted=1, version=version+1 WHERE id=? AND deleted=0').bind(id)]);
      h.fail(400, material.data.error||'Materiál se nepodařilo uložit. Zakázku jsem neponechal.');
    }
  }
  return {reply:`Zakázka „${params.title}“ je jedna, s ${params.terms.length} termíny od ${first.date}${params.address?' na adrese '+params.address:''}. Materiál ${params.materials?.length?'je u zakázky uložený a neobjednaný':'se neobjednává'}.`, mutated:'jobs', context:{jobId:id, customerName:params.customerName||''}};
}

async function createJob(env, m, h, params, today, tomorrow, options){
  if(!manager(m)) return {reply:'Novou zakázku zakládá vlastník nebo správce.'};
  if(options.preview) return {reply:'V náhledu role zakázku nezakládám.'};
  const dueDate = params.dueDate||(params.when==='tomorrow'?tomorrow:today);
  const title = String(params.title||'Nová zakázka').slice(0,120);
  const customer = await linkedCustomer(env, m, h, params);
  if(customer.error) return {reply:customer.error};
  const who = customer.customerName?` u zákazníka ${customer.customerName}`:' bez zákazníka';
  const summary = `Vytvořit zakázku „${title}“ na ${dueDate}${who}? Bude plánovaná a bez přiřazení, dokud ji neupravíte.`;
  if(options.propose){
    const discipline = m._workspace?.selectedDiscipline&&m._workspace.selectedDiscipline!=='all'?m._workspace.selectedDiscipline:m._workspace?.disciplines?.[0];
    const confirm = await propose(env, m, {intent:'jobs.create', params:{title, dueDate, discipline:discipline||null, customerId:customer.customerId, customerName:customer.customerName}}, summary);
    return {reply:summary, confirm};
  }
  const id = crypto.randomUUID();
  const result = await callJson(()=>handleJobs(write('/api/jobs/'+id,'PUT',{
    version:0, title, jobType:'service', status:'planned', incompleteReason:'', description:'Vytvořeno z pracovního asistenta.',
    dueDate, customerId:customer.customerId, customerName:customer.customerName, assignedTo:'', assignedTos:[],
    discipline:params.discipline||null, gardenId:null, startTime:'', endTime:'', defectIds:[], plannedStart:'', estimatedMinutes:null,
    arrivalWindowStart:'', arrivalWindowEnd:'', legacyTimeMeaning:'unknown', allowOverlaps:false, previewRevision:0, terms:[]
  }, h._headers), env, m, h));
  if(!result.ok) return {reply:result.data.error||'Zakázku se nepodařilo vytvořit. Nic dalšího jsem neuložil.'};
  return {reply:`Zakázka „${result.data.job?.title||title}“ je založená na ${dueDate}${customer.customerName?' u zákazníka '+customer.customerName:''}.`, mutated:'jobs'};
}

async function createCustomer(env, m, h, params, options){
  if(!manager(m)) return {reply:'Zákazníka přidává vlastník nebo správce. Nic jsem neuložil.'};
  if(options.preview) return {reply:'V náhledu role zákazníka nezakládám.'};
  if(!on(h.features,'customers')) return {reply:'Zákazníci jsou v nastavení firmy vypnutí. Nic jsem neuložil.'};
  const name = String(params.name||'').trim().slice(0,160);
  const phone = String(params.phone||'').trim().slice(0,50);
  const email = String(params.email||'').trim().slice(0,254);
  const address = String(params.address||'').trim().slice(0,500);
  const city = String(params.city||'').trim().slice(0,120);
  if(name.length<2) return {reply:'Napište jméno zákazníka. Nic jsem neuložil.'};
  if(phone&&!/^\+?[0-9 ()\-./#*;,]{3,50}$/.test(phone)) return {reply:'Telefon nevypadá správně. Zákazníka jsem nezaložil.'};
  if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return {reply:'E-mail nevypadá správně. Zákazníka jsem nezaložil.'};
  if(address&&!city) return {reply:'U adresy napište i město, třeba „adresa Zahradní 1, Brno“. Zákazníka jsem nezaložil.'};
  const existing = await customersGet(env, m, h, '/api/customers?q='+encodeURIComponent(name.slice(0,100)));
  if(!existing.ok) return {reply:blocked(existing)||'Stávající zákazníky se nepodařilo porovnat. Nic jsem neuložil.'};
  if((existing.data.customers||[]).some(customer=>customer.name.toLocaleLowerCase('cs')===name.toLocaleLowerCase('cs'))) return {reply:`Zákazník „${name}“ už v evidenci je. Nového jsem nezaložil.`};
  const detail = [phone&&'telefon '+phone, email, address&&'adresa '+address+(city?', '+city:'')].filter(Boolean).join(', ');
  const summary = `Přidat zákazníka ${name}${detail?' ('+detail+')':''}? Uloží se až po potvrzení.`;
  const stored = {name, phone, email, address, city};
  if(options.propose) return {reply:summary, confirm:await propose(env, m, {intent:'customers.create', params:stored}, summary)};
  const result = await callJson(()=>handleCustomers(write('/api/customers/'+crypto.randomUUID(),'PUT',{
    version:0, name, email, irrigationOrigin:'unknown',
    phones:phone?[{id:crypto.randomUUID(), label:'', number:phone}]:[],
    addresses:address?[{id:crypto.randomUUID(), label:'', address, city}]:[]
  }, h._headers), env, m, h));
  if(!result.ok) return {reply:result.data.error||'Zákazníka se nepodařilo přidat. Nic jsem neuložil.'};
  return {reply:`Zákazník „${result.data.customer?.name||name}“ je přidaný.`, mutated:'customers'};
}

async function attendanceIntent(env, m, h, intent, params, today){
  const month = params.month||today.slice(0,7);
  const people = await attendanceGet(env, m, h, `/api/attendance?month=${month}`+(manager(m)?'&userId=all':''));
  const error = blocked(people, 'Docházku se nepodařilo načíst.');
  if(error) return {reply:error};
  let userId = m.user_id, userName = m.name;
  if(params.person){
    const employees = people.data.employees||[{id:m.user_id, name:m.name}];
    const hits = employees.filter(person=>nearName(params.person, person.name));
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
    shifts = shifts.concat((page.data.shifts||[]).filter(shift=>shift.userId===userId||(intent==='attendance.report'&&!params.person&&manager(m))));
  }
  const unique = [...new Map(shifts.map(shift=>[shift.id, shift])).values()];
  const own = unique.filter(shift=>shift.userId===userId);
  let total = 0;
  if(range){
    const start = attendanceInstant(range.start+'T00:00'), end = attendanceInstant(addDays(range.end,1)+'T00:00'), now = Date.now();
    for(const shift of own){
      const stop = shift.endAt==null?now:shift.endAt;
      total += Math.max(0, Math.min(stop, end)-Math.max(shift.startAt, start));
    }
  }else{
    const row = (people.data.summary||[]).find(item=>item.userId===userId);
    total = row?.durationMs||0;
  }
  const label = period==='week'?'tento týden':period==='today'?'dnes':month;
  const caution = attendanceCaution(own, range, total);
  const sentence = `${userName}: ${attendanceHours(total)} (${label}).${caution}`;
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
      return {reply:`Pracovní výkaz ${label}\n${body}\nOtevřená směna se počítá jen do teď.${params.person||!manager(m)?caution:''}`};
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
async function customerResultCards(env, m, h, list){
  const cards = [];
  for(const customer of list.slice(0,4)){
    const address = (customer.addresses||[])[0]||{};
    const place = [address.city, address.address].filter(Boolean).join(' · ');
    let active = null;
    if(on(h.features,'jobs')){
      const visits = await jobsGet(env, m, h, '/api/jobs?state=active&q='+encodeURIComponent(String(customer.name||'').slice(0,80)));
      if(visits.ok) active = (visits.data.jobs||[]).filter(job=>job.customerId===customer.id||(!job.customerId && job.customerName===customer.name)).length;
    }
    cards.push({type:'customer', id:customer.id, title:customer.name, subtitle:place, meta:(customer.disciplines||[]).filter(Boolean).join(', '), count:active, countLabel:jobCountLabel(active), openLabel:'Otevřít zákazníka'});
  }
  return cards;
}
async function customerIntent(env, m, h, intent, params){
  if(intent==='customers.tariffs'&&!on(h.features,'subscriptions')) return {reply:'Předplatné a tarify jsou v nastavení firmy vypnuté.'};
  const query = params.query||'';
  if((intent==='customers.search'||intent==='customers.contact'||intent==='customers.history')&&!query) return {reply:'Napište jméno zákazníka.'};
  const result = await customersGet(env,m,h,'/api/customers'+(query?`?q=${encodeURIComponent(query.slice(0,100))}`:''));
  const error = blocked(result);
  if(error) return {reply:error};
  const list = result.data.customers||[];
  if(!list.length) return {reply:`Zákazníka „${query}“ nevidím, nebo k němu nemáte přístup.`, cards:[]};
  if(intent==='customers.search'){
    const cards = await customerResultCards(env, m, h, list);
    const one = list.length===1?list[0]:null;
    return {reply:one?`Našel jsem 1 zákazníka.`:`Našel jsem ${list.length} zákazníků.`, cards, context:one?{customerId:one.id, customerName:one.name}:null, suggestions:one?['Zobraz jeho zakázky','Historie návštěv']:[]};
  }
  if(list.length>1&&intent!=='customers.tariffs') return {reply:'Vyhovuje víc zákazníků:\n'+lines(list, customer=>`• ${customer.name}`, '')};
  const customer = list[0];
  if(intent==='customers.contact'){
    const phones = (customer.phones||[]).map(phone=>String(phone.number||'').replace(/[^\d+]/g,'')).filter(number=>/^\+?\d{6,15}$/.test(number));
    if(phones.length>1) return {reply:`U „${customer.name}“ je víc čísel. Vyberte jedno, sám jsem nezavolal.\n`+phones.map(number=>'• '+number).join('\n'), cards:[{type:'customer', id:customer.id, title:customer.name, subtitle:phones.join(', '), openLabel:'Otevřít zákazníka'}]};
    if(!phones.length) return {reply:`${customerCard(customer, true)}\nČíslo v evidenci není. Volání jsem neotevřel.`};
    return {reply:`${customerCard(customer, true)}\nTlačítko jen otevře vytáčení. Hovor jsem sám neuskutečnil.`, cards:[{type:'customer', id:customer.id, title:customer.name, subtitle:phones[0], href:'tel:'+phones[0], openLabel:'Otevřít zákazníka'}]};
  }
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
  return {reply:'Materiál:\n'+lines(items, item=>`• ${item.name}${item.sku?' · '+item.sku:''} · ${item.unit}${item.active?'':' (skrytý)'}`, 'V načteném katalogu nic takového není.')+(result.data.nextCursor?'\nKatalog pokračuje další stránkou, zkuste přesnější název.':''), cards:materialCards(items)};
}

const MATERIAL_STATE = {unchecked:'nezkontrolovaný', checked:'zkontrolovaný', ready:'připravený', missing:'chybí'};
async function namedJob(env, m, h, params, options){
  if((params.current||!params.query)&&options.context?.jobId){
    const loaded = await jobsGet(env,m,h,'/api/jobs/'+encodeURIComponent(options.context.jobId));
    if(!loaded.ok) return {error:blocked(loaded)||'Otevřenou zakázku se nepodařilo načíst.'};
    return {job:loaded.data.job};
  }
  const found = await findJobs(env, m, h, params.query||'');
  if(found.error) return {error:found.error};
  const picked = oneJob(found.jobs, params.query);
  if(picked.error) return {error:picked.error};
  if(picked.choices) return {error:'Našel jsem víc zakázek. Upřesněte název:\n'+lines(picked.choices, jobLine, '')};
  return {job:picked.job};
}
function protocolBody(current, report){
  return {operationId:crypto.randomUUID(), version:current.job.version, materialStatus:current.job.materialStatus||'unchecked', materialNote:current.job.materialNote||'', report};
}
function keptReport(current, patch){
  const report = current.report||{};
  return {date:report.date||pragueDate(new Date()), work:report.work||'', material:report.material||'', defects:report.defects||'', notes:report.notes||'', recommendations:report.recommendations||'', photoIds:report.photoIds||[], ...patch};
}
async function materialCommand(env, ctx, m, h, intent, params, today, tomorrow, options){
  if(intent==='materials.price' && params.catalog){
    const found = await catalogLookup(env, m, h, params.query||'');
    if(found.reply && !found.item) return {reply:found.reply};
    const item = found.item;
    if(!Number.isSafeInteger(item.priceMinor)) return {reply:`U „${item.name}“ v katalogu cenu nevidím. Částku jsem si nevymyslel.`};
    return {reply:`Katalogová cena „${item.name}“ je ${materialMoney(item.priceMinor, item.currency||'CZK')} za ${item.unit}. Do protokolu jsem nic nezapsal.`, cards:materialCards([item])};
  }
  if(intent==='materials.shopping'){
    const day = params.when==='today'?today:tomorrow;
    const result = await jobsGet(env,m,h,`/api/jobs?state=active&order=schedule&month=${day.slice(0,7)}&day=${day}`);
    if(!result.ok) return {reply:blocked(result)||'Zakázky se nepodařilo načíst.'};
    const rows = (result.data.jobs||[]).filter(job=>['missing','unchecked'].includes(job.materialStatus||'unchecked'));
    return {reply:`Nákup a příprava na ${day}:\n`+lines(rows, job=>`• ${job.title}: ${MATERIAL_STATE[job.materialStatus]||'nezkontrolovaný'}${job.materialNote?' · '+job.materialNote:''}`, 'Zakázku s chybějícím nebo nezkontrolovaným materiálem tu nevidím.')};
  }
  const picked = await namedJob(env, m, h, params, options);
  if(picked.error) return {reply:picked.error};
  const service = await serviceGet(env, ctx, m, h, picked.job.id);
  if(!service.ok) return {reply:blocked(service)||'Zakázku se nepodařilo otevřít.'};
  const current = service.data;
  if(intent==='materials.readiness'){
    const state = MATERIAL_STATE[current.job.materialStatus]||current.job.materialStatus||'neznámý';
    const items = current.report?.materialItems||[];
    return {reply:`Materiál u „${current.job.title}“ je ${state}.${current.job.materialNote?' '+current.job.materialNote:''}${items.length?'\nV protokolu: '+items.map(item=>`${item.name} ${item.quantity} ${item.unit}`).join(', '):'\nV protokolu zatím žádná katalogová položka není.'}`};
  }
  if(intent==='materials.price'){
    const items = current.report?.materialItems||[];
    if(!items.length) return {reply:`U „${current.job.title}“ není v protokolu materiál z katalogu, cenu tedy nepočítám.`};
    const totals = materialTotals(items).map(row=>materialMoney(row.amount, row.currency)).join(', ');
    return {reply:`Cena materiálu u „${current.job.title}“: ${totals}.\n`+items.map(materialSummary).join('\n')};
  }
  if(!writer(m)) return {reply:'Materiál do protokolu může zapsat pracovník nebo správce.'};
  if(options.preview) return {reply:'V náhledu role materiál nezapisuji.'};
  const catalog = await materialsGet(env, m, h);
  if(!catalog.ok) return {reply:blocked(catalog)||'Katalog se nepodařilo načíst.'};
  if(catalog.data.nextCursor) return {reply:'Katalog je delší než jedna stránka. Upřesněte položku v katalogu, ať nesáhnu vedle. Nic jsem nepřidal.'};
  const plan = planMaterialLines(params.lines, catalog.data.items||[]);
  if(plan.error) return {reply:plan.error};
  const existing = current.report?.materialItems||[];
  const preview = plan.lines.map(line=>{
    const previous = existing.find(item=>item.itemId===line.itemId);
    const quantity = previous?Math.round((previous.quantity+line.quantity)*1000)/1000:line.quantity;
    return {...line, quantity, previous:previous?.quantity||0};
  });
  const totals = materialTotals(preview).map(row=>materialMoney(row.amount, row.currency)).join(', ');
  const summary = `Přidat do protokolu „${current.job.title}“:\n`+preview.map(line=>`• ${line.name}: ${line.previous?`k ${line.previous} ${line.unit} přidat a bude `:''}${line.quantity} ${line.unit}`).join('\n')+`\nCena po přidání ${totals}. Uloží se až po potvrzení.`;
  if(options.propose) return {reply:summary, confirm:await propose(env, m, {intent, params:{jobId:current.job.id, lines:plan.lines}}, summary)};
  return applyMaterialLines(env, ctx, m, h, {jobId:current.job.id, lines:plan.lines});
}
async function applyMaterialLines(env, ctx, m, h, params){
  if(!writer(m)) return {reply:'Materiál do protokolu může zapsat pracovník nebo správce.'};
  const service = await serviceGet(env, ctx, m, h, params.jobId);
  if(!service.ok) return {reply:blocked(service)||'Zakázku se nepodařilo otevřít.'};
  const current = service.data;
  const existing = (current.report?.materialItems||[]).map(line=>({itemId:line.itemId, itemVersion:line.itemVersion, quantity:line.quantity}));
  const merged = new Map(existing.map(line=>[line.itemId, {...line}]));
  for(const line of params.lines||[]){
    const previous = merged.get(line.itemId);
    if(previous) previous.quantity = Math.round((previous.quantity+line.quantity)*1000)/1000;
    else merged.set(line.itemId, {itemId:line.itemId, itemVersion:line.itemVersion, quantity:line.quantity});
  }
  const result = await callJson(()=>handleServiceWork(write('/api/jobs/'+encodeURIComponent(params.jobId)+'/service','PUT', protocolBody(current, keptReport(current, {materialItems:[...merged.values()]})), h._headers), env, ctx, m, h));
  if(!result.ok) return {reply:result.data.error||'Materiál se nepodařilo uložit. Nic dalšího jsem nezměnil.'};
  const saved = result.data.report?.materialItems||[];
  const totals = saved.length?materialTotals(saved).map(row=>materialMoney(row.amount, row.currency)).join(', '):'';
  return {reply:`Materiál je v protokolu „${current.job.title}“.${totals?' Cena katalogových položek: '+totals+'.':''}`, mutated:'jobs'};
}
async function protocolCommand(env, ctx, m, h, intent, params, options){
  const picked = await namedJob(env, m, h, params, options);
  if(picked.error) return {reply:picked.error};
  const service = await serviceGet(env, ctx, m, h, picked.job.id);
  if(!service.ok) return {reply:blocked(service)||'Zakázku se nepodařilo otevřít.'};
  const current = service.data;
  if(intent==='protocol.check'){
    const report = current.report;
    if(!report) return {reply:`U „${current.job.title}“ servisní protokol zatím není. Podpis ani fotografie tu nejsou.`};
    const gaps = [];
    if(!report.customerSignature) gaps.push('chybí podpis zákazníka');
    if(!(report.photoIds||[]).length) gaps.push('chybí fotografie');
    if(!report.work&&!report.notes) gaps.push('chybí popis práce');
    const state = report.documentState==='ready'?'připravený ke schválení':'rozpracovaný';
    return {reply:gaps.length?`Protokol „${current.job.title}“ je ${state}.\n`+gaps.map(gap=>'• '+gap).join('\n'):`Protokol „${current.job.title}“ má podpis, fotografie i popis. Stav: ${state}.`};
  }
  const note = String(params.note||'').trim().slice(0,1000);
  if(!note) return {reply:'Napište text závady nebo poznámky. Nic jsem nezapsal.'};
  if(!writer(m)) return {reply:'Do protokolu může psát pracovník nebo správce.'};
  if(options.preview) return {reply:'V náhledu role do protokolu nezapisuji.'};
  const field = params.field==='notes'?'notes':'defects';
  const label = field==='notes'?'poznámku':'závadu';
  const summary = `Do protokolu „${current.job.title}“ doplnit ${label}: „${note}“? Ostatní údaje protokolu zůstanou.`;
  if(options.propose) return {reply:summary, confirm:await propose(env, m, {intent, params:{jobId:current.job.id, field, note}}, summary)};
  return applyProtocolNote(env, ctx, m, h, {jobId:current.job.id, field, note});
}
async function applyProtocolNote(env, ctx, m, h, params){
  if(!writer(m)) return {reply:'Do protokolu může psát pracovník nebo správce.'};
  const service = await serviceGet(env, ctx, m, h, params.jobId);
  if(!service.ok) return {reply:blocked(service)||'Zakázku se nepodařilo otevřít.'};
  const current = service.data;
  const field = params.field==='notes'?'notes':'defects';
  const previous = current.report?.[field]||'';
  if(previous.includes(params.note)) return {reply:'Stejný text v protokolu už je. Podruhé ho nezapisuji.'};
  const result = await callJson(()=>handleServiceWork(write('/api/jobs/'+encodeURIComponent(params.jobId)+'/service','PUT', protocolBody(current, keptReport(current, {[field]:[previous, params.note].filter(Boolean).join('\n')})), h._headers), env, ctx, m, h));
  if(!result.ok) return {reply:result.data.error||'Do protokolu se nepodařilo zapsat. Ostatní údaje jsem neměnil.'};
  return {reply:`Text je v protokolu „${current.job.title}“. Protokol zůstává ke kontrole.`, mutated:'jobs'};
}

async function fileImport(env, m, h, body, preview){
  const file = body.file;
  if(!file||typeof file!=='object'||Array.isArray(file)||typeof file.text!=='string'||file.text.length>100000) return {reply:'Soubor se nepodařilo přečíst. Pošlete textovou tabulku do 100 kB. Nic jsem neuložil.'};
  const name = String(file.name||'soubor.txt').slice(0,120);
  if(/\.(pdf|xlsx|xls|doc|docx|png|jpe?g)$/i.test(name)) return {reply:'PDF, Excel a fotky zatím nečtu. Uložte tabulku jako CSV. Nic jsem neuložil.'};
  const sheet = readImportSheet(file.text, typeof body.text==='string'?body.text:'');
  if(sheet.error) return {reply:sheet.error};
  if(!manager(m)) return {reply:'Zákazníky a katalog materiálu zakládá vlastník nebo správce. Nic jsem neuložil.'};
  if(preview) return {reply:'V náhledu role soubor neukládám.'};
  if(sheet.kind==='customers'&&!on(h.features,'customers')) return {reply:'Zákazníci jsou v nastavení firmy vypnutí. Nic jsem neuložil.'};
  if(sheet.kind==='materials'&&!on(h.features,'materials')) return {reply:'Materiál je v nastavení firmy vypnutý. Nic jsem neuložil.'};
  const skipped = [...sheet.skipped];
  const records = [];
  if(sheet.kind==='customers'){
    for(const record of sheet.records){
      const existing = await customersGet(env,m,h,'/api/customers?q='+encodeURIComponent(record.name.slice(0,100)));
      if(!existing.ok) return {reply:blocked(existing)||'Stávající zákazníky se nepodařilo porovnat. Nic jsem neuložil.'};
      if((existing.data.customers||[]).some(customer=>customer.name.toLocaleLowerCase('cs')===record.name.toLocaleLowerCase('cs'))) skipped.push(`${record.name}: už v evidenci je`);
      else records.push(record);
    }
    if(!records.length) return {reply:'Žádného nového zákazníka jsem nenašel.\n'+skipped.slice(0,8).join('\n')};
    const lines = records.slice(0,8).map(record=>`• ${record.name}${record.phone?' · '+record.phone:''}${record.address?' · '+[record.address, record.city].filter(Boolean).join(', '):''}`).join('\n');
    const garden = on(h.features,'gardens')?' Ke každému se podle stávající evidence založí i zahrada se stejným názvem.':'';
    const summary = `Ze souboru ${name} připravím ${records.length} zákazníků.${garden}\n${lines}${records.length>8?'\n…':''}${skipped.length?'\nPřeskočeno: '+skipped.slice(0,5).join('; '):''}\nChybějící údaje nedoplňuji. Uloží se až po potvrzení.`;
    return {reply:summary, confirm:await propose(env, m, {intent:'import.customers', params:{records}}, summary)};
  }
  const catalog = await materialsGet(env, m, h);
  if(!catalog.ok) return {reply:blocked(catalog)||'Katalog se nepodařilo načíst. Nic jsem neuložil.'};
  const categories = (catalog.data.categories||[]).filter(category=>category.active);
  const hint = foldHint(body.text);
  const category = categories.length===1?categories[0]:categories.find(item=>hint.includes(foldHint(item.name)));
  if(!category) return {reply:categories.length?`Katalog má víc kategorií: ${categories.map(item=>item.name).join(', ')}. Napište, do které položky patří. Nic jsem neuložil.`:'V katalogu není aktivní kategorie. Nejdřív ji založte ve stávající evidenci. Nic jsem neuložil.'};
  for(const record of sheet.records){
    const hit = (catalog.data.items||[]).find(item=>item.active&&item.name.toLocaleLowerCase('cs')===record.name.toLocaleLowerCase('cs')&&item.unit===record.unit);
    if(hit) skipped.push(`${record.name}: stejná položka už v katalogu je`);
    else records.push(record);
  }
  if(!records.length) return {reply:'Žádnou novou položku jsem nenašel.\n'+skipped.slice(0,8).join('\n')};
  const lines = records.slice(0,8).map(record=>`• ${record.name} · ${record.unit} · ${materialMoney(record.priceMinor, 'CZK')}`).join('\n');
  const summary = `Ze souboru ${name} přidám ${records.length} položek do kategorie ${category.name}. Ceny jsou v Kč.\n${lines}${skipped.length?'\nPřeskočeno: '+skipped.slice(0,5).join('; '):''}\nUloží se až po potvrzení.`;
  return {reply:summary, confirm:await propose(env, m, {intent:'import.materials', params:{categoryId:category.id, records}}, summary)};
}
function foldHint(value){return String(value||'').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9 ]+/g,' ').trim();}
async function applyCustomerImport(env, m, h, params){
  if(!manager(m)) return {reply:'Zákazníky zakládá vlastník nebo správce. Nic jsem neuložil.'};
  let saved = 0; const problems = [];
  for(const record of params.records||[]){
    const existing = await customersGet(env,m,h,'/api/customers?q='+encodeURIComponent(record.name.slice(0,100)));
    if(existing.ok&&(existing.data.customers||[]).some(customer=>customer.name.toLocaleLowerCase('cs')===record.name.toLocaleLowerCase('cs'))){problems.push(`${record.name}: už v evidenci je`); continue;}
    const result = await callJson(()=>handleCustomers(write('/api/customers/'+crypto.randomUUID(),'PUT',{
      version:0, name:record.name, email:record.email||'', irrigationOrigin:'unknown',
      phones:record.phone?[{id:crypto.randomUUID(), label:'', number:record.phone}]:[],
      addresses:record.address?[{id:crypto.randomUUID(), label:'', address:record.address, city:record.city||''}]:[]
    }, h._headers), env, m, h));
    if(!result.ok) problems.push(`${record.name}: ${result.data.error||'nepodařilo se uložit'}`);
    else saved++;
  }
  return {reply:`Uloženo ${saved} z ${(params.records||[]).length} zákazníků.${problems.length?'\n'+problems.slice(0,8).join('\n'):''}`, mutated:saved?'customers':null};
}
async function applyMaterialImport(env, m, h, params){
  if(!manager(m)) return {reply:'Katalog upravuje vlastník nebo správce. Nic jsem neuložil.'};
  let saved = 0; const problems = [];
  for(const record of params.records||[]){
    const result = await callJson(()=>handleMaterials(write('/api/materials/items/'+crypto.randomUUID(),'PUT',{
      version:0, name:record.name, categoryId:params.categoryId, sku:record.sku||'', unit:record.unit, priceMinor:record.priceMinor, currency:'CZK', active:true
    }, h._headers), env, m, h));
    if(!result.ok) problems.push(`${record.name}: ${result.data.error||'nepodařilo se uložit'}`);
    else saved++;
  }
  return {reply:`Uloženo ${saved} z ${(params.records||[]).length} položek materiálu.${problems.length?'\n'+problems.slice(0,8).join('\n'):''}`, mutated:saved?'materials':null};
}
