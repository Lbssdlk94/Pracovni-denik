// Offline answers use only the snapshot the caller already has. Missing data stays missing.
import {attendanceHours} from './attendance-model.js';

const STATUS = {planned:'plánovaná', on_way:'na cestě', in_progress:'probíhá', done:'hotová', incomplete:'nedokončená'};
const missing = 'Tento přehled v zařízení nemám. Připojte se. Nic jsem si nevymyslel.';
const noWrite = 'Zápis bez připojení neukládám. Až budete online, příkaz zopakujte. Nic se teď nezměnilo.';

function lines(items, render, empty){
  if(!items.length) return empty;
  return items.slice(0, 8).map(render).join('\n')+(items.length>8?`\n…a dalších ${items.length-8}.`:'');
}
function jobLine(job){
  const when = [job.dueDate, job.startTime].filter(Boolean).join(' ');
  return `• ${when?when+' · ':''}${job.title}${job.customerName?' · '+job.customerName:''} (${STATUS[job.status]||job.status||'stav'})`;
}

export function answerOffline(command, snapshot = {}){
  const intent = command?.intent;
  const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : null;
  if(['jobs.create','protocol.draft','protocol.note','jobs.reschedule','jobs.assign','jobs.depart','jobs.status','attendance.arrive','attendance.leave','materials.add'].includes(intent)) return {reply:noWrite, missing:true};
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
