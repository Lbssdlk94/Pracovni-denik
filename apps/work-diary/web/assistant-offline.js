// Offline answers use only the snapshot the caller already has. Missing data stays missing.
import {attendanceHours} from './attendance-model.js?v=workspace-roles-v1';
import {pickNextWork} from './assistant-intent.js';

const STATUS = {planned:'plánovaná', on_way:'na cestě', in_progress:'probíhá', done:'hotová', incomplete:'nedokončená'};
const missing = 'Tento přehled v zařízení nemám. Připojte se. Nic jsem si nevymyslel.';
const noWrite = 'Zápis bez připojení neukládám. Až budete online, příkaz zopakujte. Nic se teď nezměnilo.';
const writeIntents = ['jobs.create','jobs.plan','jobs.followup','jobs.complete','diary.day','defects.track','dictionary.add','protocol.draft','protocol.report','protocol.note','protocol.photo','jobs.reschedule','jobs.assign','jobs.depart','jobs.work','jobs.status','attendance.arrive','attendance.leave','materials.add'];

function lines(items, render, empty){
  if(!items.length) return empty;
  return items.slice(0, 8).map(render).join('\n')+(items.length>8?`\n…a dalších ${items.length-8}.`:'');
}
function jobLine(job){
  const when = [job.dueDate, job.startTime].filter(Boolean).join(' ');
  return `• ${when?when+' · ':''}${job.title}${job.customerName?' · '+job.customerName:''} (${STATUS[job.status]||job.status||'stav'})`;
}

export function queueOfflineWrite(queue, command, options = {}){
  const list = (Array.isArray(queue)?queue:[]).map(item=>({text:String(item?.text||'').trim(), intent:item?.intent||''})).filter(item=>item.text);
  const text = String(command?.text||'').trim().slice(0,500);
  if(!text || !writeIntents.includes(command?.intent)) return {queued:false, duplicate:false, queue:list};
  if(list.some(item=>item.text===text)) return {queued:false, duplicate:true, queue:list, reply:'Ten příkaz už ve frontě je. Zápis bez připojení neukládám. Až budete online, navrhnu ho znovu. Nic se teď nezměnilo.'};
  const item = {text, intent:command.intent};
  const next = options.front ? [item, ...list].slice(0,20) : [...list, item].slice(-20);
  return {queued:true, duplicate:false, queue:next, reply:'Příkaz jsem si schoval do fronty. Zápis bez připojení neukládám. Až budete online, navrhnu ho znovu a počkám na potvrzení. Nic se teď nezměnilo.'};
}
export function answerOffline(command, snapshot = {}){
  const intent = command?.intent;
  const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : null;
  if(intent==='assistant.clarify'||intent==='assistant.explain'||intent==='assistant.refuse'||intent==='assistant.batch'||intent==='materials.plan'){
    return {reply:(command.params?.reply||'Bez připojení nic neměním. Až budete online, vyhodnotím požadavek znovu.')+' Údaj jsem si nevymyslel.', missing:intent!=='assistant.refuse'};
  }
  if(intent==='jobs.next'){
    if(!jobs) return {reply:'Další práci v zařízení nemám. Připojte se. Pořadí neodhaduji. Nic jsem nezměnil.', missing:true};
    const picked = pickNextWork(jobs, snapshot.today||'', command.params?.currentJobId||'');
    const stale = ' Údaje jsou z poslední uložené kopie a nemusí být aktuální. Cestu jsem nezahájil.';
    if(picked.choices) return {reply:'V uložené kopii je víc zakázek bez jasného pořadí. Po připojení je ukážu znovu.'+stale, missing:true};
    if(picked.next) return {reply:`Z uložené kopie je další „${picked.next.job.title}“ ${picked.next.date}${picked.next.timed?' '+picked.next.time:', bez času výjezdu'}.${stale}`, missing:true};
    return {reply:'V uložené kopii další práci nevidím.'+stale, missing:true};
  }
  if(intent==='navigation.address'||intent==='materials.stock'||intent==='materials.price'||intent==='customers.contact'){
    return {reply:'Tohle chci ověřit v aktuální evidenci. Připojte se. Nic jsem nezměnil ani si nevymyslel.', missing:true};
  }
  if(intent==='dictionary.list') return {reply:'Firemní slovník v zařízení nemám. Připojte se. Vestavěné výrazy třicet dvojka, PE 25 a T-kus platí pořád. Nic jsem si nevymyslel.', missing:true};
  if(writeIntents.includes(intent)) return {reply:noWrite, missing:true};
  if(intent==='refused.destructive') return {reply:'Smazání nebo zrušení tady nespouštím, aby se nic omylem neztratilo. Použijte stávající obrazovku záznamu.'};
  if(intent==='unknown'||intent==='help') return {reply:'Offline umím jen to, co je v telefonu uložené: dnešní a zítřejší zakázky, nedokončené a čekající servis. Hodiny zakázky a docházku bez uloženého přehledu nepočítám.'};
  if(intent==='jobs.hours'||intent==='jobs.realizationHours'||intent==='attendance.hours'||intent==='attendance.report'||intent==='materials.search'){
    if(intent==='jobs.hours' && snapshot.jobTime?.summary?.total){
      const total = snapshot.jobTime.summary.total;
      return {reply:`Uložená evidence na zakázce: práce ${attendanceHours(total.workMs||0)}, cesta ${attendanceHours(total.travelMs||0)}. Novější intervaly, které v zařízení nejsou, tu nejsou.`};
    }
    return {reply:missing, missing:true};
  }
  if(!jobs) return {reply:missing, missing:true};
  const today = snapshot.today || '';
  const tomorrow = snapshot.tomorrow || '';
  if(intent==='jobs.today'||intent==='jobs.tomorrow'){
    const day = intent==='jobs.today'?today:tomorrow;
    const rows = jobs.filter(job=>job.dueDate===day);
    return {reply:`${intent==='jobs.today'?'Dnes':'Zítra'} z uloženého přehledu${day?' ('+day+')':''}:\n`+lines(rows, jobLine, 'V uloženém přehledu žádná návštěva není.')};
  }
  if(intent==='jobs.incomplete'){
    return {reply:'Nedokončené z uloženého přehledu:\n'+lines(jobs.filter(job=>job.status==='incomplete'), jobLine, 'V uloženém přehledu žádná nedokončená zakázka není.')};
  }
  if(intent==='jobs.unplanned'){
    const rows = jobs.filter(job=>job.status==='planned' && !job.dueDate && !(job.schedule?.dates||[]).some(date=>/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))));
    return {reply:'Bez termínu z uloženého přehledu:\n'+lines(rows, jobLine, 'V uloženém přehledu žádná zakázka bez termínu není.')+' Údaje nemusí být aktuální. Nic jsem nenaplánoval.'};
  }
  if(intent==='jobs.personDay'){
    const person = String(command.params?.person||'').toLocaleLowerCase('cs');
    const day = command.params?.when==='tomorrow'?tomorrow:today;
    if(!person) return {reply:missing, missing:true};
    const rows = jobs.filter(job=>String(job.assignedName||'').toLocaleLowerCase('cs').includes(person) && (job.dueDate===day || (job.schedule?.dates||[]).includes(day)));
    return {reply:`${command.params.person} z uložené kopie${day?' ('+day+')':''}:\n`+lines(rows, jobLine, 'V uložené kopii pro něj žádnou zakázku nevidím.')+' Údaje nemusí být aktuální.'};
  }
  if(intent==='customers.waitingService'||intent==='jobs.plannedServices'){
    const rows = jobs.filter(job=>(job.jobType==='service'||intent==='jobs.plannedServices') && job.status!=='done');
    const waiting = intent==='customers.waitingService' ? rows.filter(job=>job.jobType==='service'&&job.status!=='done') : rows;
    return {reply:'Z uloženého přehledu:\n'+lines(waiting, job=>`• ${job.customerName||'Zákazník bez jména'} · ${job.title}`, 'V uloženém přehledu nikdo na servis nečeká.')};
  }
  if(intent==='jobs.materials'){
    return {reply:missing, missing:true};
  }
  if(intent==='customers.search'||intent==='jobs.search'){
    const query = String(command.params?.query||'').toLocaleLowerCase('cs');
    if(!query) return {reply:'Napište jméno. V zařízení nemám celý adresář, jen uložené zakázky.'};
    const rows = jobs.filter(job=>`${job.title} ${job.customerName||''}`.toLocaleLowerCase('cs').includes(query));
    return {reply:'Z uložených zakázek:\n'+lines(rows, jobLine, 'V uloženém přehledu nic takového není.')};
  }
  return {reply:missing, missing:true};
}
