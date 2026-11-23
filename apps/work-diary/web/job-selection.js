// Shared work-selection rules for the assistant, job list and offline copy.
// Phase is derived from the stored status and every valid appointment.
// It is not a second status column and it never rewrites finished jobs.

export const BUILTIN_JOB_KINDS = [
  {id:'service', label:'Servis', aliases:['servis','servisu','servisy','servisni','servisnich','servisnim']},
  {id:'installation', label:'Realizace', aliases:['realizace','realizaci','realizovat','realizaci','realizacich','realizacemi','realizace']},
  {id:'survey', label:'Zaměření', aliases:['zamereni','zamerit','zamerenim','zamereni']},
  {id:'blowout', label:'Zazimování', aliases:['zazimovani','zazimovani','zazimovat','vyfouknout','vyfouknuti','vyfukovani','vyfoukneme']},
  {id:'maintenance', label:'Údržba zahrady', aliases:['udrzba','udrzbu','udrzby','udrzbe','udrzbou']}
];

const PHASES = new Set(['open','waiting','scheduled','active','done','open_done','cancelled','archived','open_cancelled','open_archived']);
const OPEN = new Set(['waiting','scheduled','active']);

function plain(value){
  return String(value||'').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
}
function validKind(item){
  if(!item||typeof item!=='object') return null;
  if(!/^[a-z][a-z0-9-]{0,40}$/.test(item.id)) return null;
  const label = String(item.label||item.id).trim().slice(0,80);
  if(!label) return null;
  const aliases = [plain(label), ...(Array.isArray(item.aliases)?item.aliases:[])].map(plain).filter(alias=>alias.length>2);
  return {id:item.id, label, aliases:[...new Set(aliases)]};
}
export function mergeJobKinds(extra){
  const kinds = BUILTIN_JOB_KINDS.map(kind=>({...kind, aliases:[...kind.aliases]}));
  for(const item of Array.isArray(extra)?extra:[]){
    const kind = validKind(item);
    if(!kind||kinds.some(existing=>existing.id===kind.id)) continue;
    kinds.push(kind);
  }
  return kinds;
}
export function kindById(kinds, id){
  return (kinds||BUILTIN_JOB_KINDS).find(kind=>kind.id===id)||null;
}
export function kindLabel(job, kinds = BUILTIN_JOB_KINDS){
  return kindById(kinds, job?.jobType)?.label || job?.jobType || 'Zakázka';
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function scheduleDates(job){
  const found = [];
  if(DATE.test(job?.dueDate||'')) found.push(job.dueDate);
  const extra = [...(job?.schedule?.dates||[]), ...(Array.isArray(job?.terms)?job.terms:[])];
  for(const item of extra){
    const date = typeof item==='string'?item:(item?.date||item?.term_date||'');
    if(DATE.test(date)) found.push(date);
  }
  return [...new Set(found)];
}
function scheduleKnown(job){
  return typeof job?.dueDate==='string' || Array.isArray(job?.terms) || Array.isArray(job?.schedule?.dates);
}
export function workPhase(job){
  if(job?.archived || job?.archivedAt) return 'archived';
  if(job?.deleted || job?.cancelled) return 'cancelled';
  const status = job?.status||'';
  if(status==='done') return 'done';
  if(status==='incomplete') return 'incomplete';
  if(status==='in_progress' || status==='on_way') return 'active';
  if(status==='planned'){
    if(!scheduleKnown(job)) return 'scheduled';
    return scheduleDates(job).length ? 'scheduled' : 'waiting';
  }
  return 'other';
}
export function statusLabel(job){
  const phase = workPhase(job);
  if(phase==='waiting') return 'Čeká na naplánování';
  if(phase==='cancelled') return 'Zrušeno';
  if(phase==='archived') return 'Archivováno';
  if(job?.status==='on_way') return 'Na cestě';
  if(job?.status==='in_progress') return 'Probíhá';
  if(job?.status==='done') return 'Hotovo';
  if(job?.status==='incomplete') return 'Nedokončeno';
  if(phase==='scheduled') return 'Naplánováno';
  return job?.status||'Neznámý stav';
}
export function whenLabel(job){
  if(workPhase(job)==='waiting') return 'Bez termínu – čeká na naplánování';
  const dates = scheduleDates(job);
  if(!dates.length) return 'Bez termínu';
  return dates.length===1?dates[0]:dates.slice(0,4).join(', ')+(dates.length>4?` +${dates.length-4}`:'');
}
export function phaseMatches(job, phase){
  const current = job?.workPhase || workPhase(job);
  if(phase==='open') return OPEN.has(current);
  if(phase==='open_done') return OPEN.has(current) || current==='done';
  if(phase==='open_cancelled') return OPEN.has(current) || current==='cancelled';
  if(phase==='open_archived') return OPEN.has(current) || current==='archived';
  if(phase==='active') return current==='active';
  return current===phase;
}

function hasDateSql(termsReady){
  return termsReady ? "(j.due_date<>'' OR EXISTS(SELECT 1 FROM job_terms term WHERE term.job_id=j.id AND term.term_date<>''))" : "j.due_date<>''";
}
export function phaseClause(phase, termsReady){
  if(!PHASES.has(phase)) return '';
  const dated = hasDateSql(!!termsReady);
  const waiting = `j.status='planned' AND NOT ${dated}`;
  const scheduled = `j.status='planned' AND ${dated}`;
  const active = "j.status IN ('on_way','in_progress')";
  const done = "j.status='done'";
  const open = `(${waiting} OR ${scheduled} OR ${active})`;
  const live = `j.deleted=0 AND ${open}`;
  const sql = {
    waiting:`j.deleted=0 AND ${waiting}`,
    scheduled:`j.deleted=0 AND ${scheduled}`,
    active:`j.deleted=0 AND ${active}`,
    done:`j.deleted=0 AND ${done}`,
    open:live,
    open_done:`j.deleted=0 AND (${open} OR ${done})`,
    cancelled:'j.deleted=1',
    archived:'1=0',
    open_cancelled:`(${live} OR j.deleted=1)`,
    open_archived:live
  };
  return sql[phase]||'';
}

function mentions(text, alias){
  return (` ${text} `).includes(` ${alias} `);
}
function matchedKinds(text, kinds){
  const hits = [];
  for(const kind of kinds){
    const aliases = [...kind.aliases].sort((a,b)=>b.length-a.length);
    if(aliases.some(alias=>mentions(text, alias))) hits.push(kind);
  }
  return hits;
}
function phaseOf(text){
  if(/archiv/.test(text) && /vcetne/.test(text)) return 'open_archived';
  if(/\b(archiv\w*)\b/.test(text) && /zakaz|realiz|servis|udrz|zazim|vyfouk|prace|praci/.test(text)) return 'archived';
  if(/zrusen|storn/.test(text) && /vcetne/.test(text)) return 'open_cancelled';
  if(/zrusen|storn/.test(text) && /zakaz|realiz|servis|udrz|zazim|vyfouk|prace|praci/.test(text)) return 'cancelled';
  if(/vcetne hotov|vcetne dokoncen|aktivni i hotov|aktivni i dokoncen|vcetne hotovych/.test(text)) return 'open_done';
  if(/cek\w* na naplan|nemaj\w* termin|bez terminu|nenaplanovan|neni naplanovan|nejsou naplanovan/.test(text)) return 'waiting';
  if(/naplanovan/.test(text) && !/cek/.test(text)) return 'scheduled';
  if(/probiha|kde ted/.test(text)) return 'active';
  if(/nejsou hotov|neni hotov|neni dokoncen|nejsou dokoncen|jeste nejsou hotov/.test(text)) return 'open';
  if(/\b(hotov\w*|dokoncen\w*)\b/.test(text) && !/nedokonc/.test(text)) return 'done';
  if(/cek\w*|jeste|zbyva|kdo ceka|co mame jeste|co zbyva|musime/.test(text)) return 'open';
  return '';
}
export function parseWorkQuestion(input, kinds = BUILTIN_JOB_KINDS){
  const text = plain(input);
  const phase = phaseOf(text);
  if(!phase || /^(oznac|nastav stav|presun|preloz|prirad|smaz|vytvor|zaloz)\b/.test(text)) return null;
  if(/\b(hodin|odprac|stravili|dochaz|vykaz)\b/.test(text)) return null;
  const hits = matchedKinds(text, kinds);
  const irrigation = /\bzavlah\w*\b/.test(text);
  const list = /^(kdo|kter\w*|jak\w*|kde|co|ukaz|zobraz|vypis)\b/.test(text);
  if(!hits.length && !irrigation && !list) return null;
  if(hits.length>1) return {matched:true, ask:true, reason:'several', phase, choices:hits.map(kind=>kind.label)};
  if(!hits.length) return {matched:true, ask:true, reason:irrigation?'irrigation':'missing', phase, choices:kinds.map(kind=>kind.label)};
  return {matched:true, ask:false, kind:hits[0].id, kindLabel:hits[0].label, phase, choices:[]};
}

export function groupByCustomer(jobs){
  const groups = new Map();
  for(const job of jobs||[]){
    const key = job.customerId ? 'id:'+job.customerId : 'job:'+job.id;
    const name = job.customerName || 'Zákazník bez jména';
    const group = groups.get(key) || {key, name, jobs:[]};
    group.jobs.push(job);
    groups.set(key, group);
  }
  return [...groups.values()];
}
function placeOf(job){
  return job.gardenName || job.address || job.city || '';
}
export function selectionSummary(meta){
  const label = meta.kindLabel || 'zakázky';
  const total = Number(meta.total)||0;
  const customers = Number(meta.customers)||0;
  const counts = meta.counts||{};
  if(!total){
    const empty = {
      waiting:`žádnou zakázku druhu ${label}, která čeká na naplánování`,
      scheduled:`žádnou naplánovanou zakázku druhu ${label}`,
      active:`žádnou probíhající zakázku druhu ${label}`,
      done:`žádnou hotovou zakázku druhu ${label}`,
      cancelled:`žádnou zrušenou zakázku druhu ${label}`,
      archived:`žádnou archivovanou zakázku druhu ${label}`
    };
    return `Nenašel jsem ${empty[meta.phase]||`žádnou neukončenou zakázku druhu ${label}`}. Prázdný výsledek jsem nenahradil hotovými zakázkami.`;
  }
  const who = customers===1?'1 zákazníka':`${customers} zákazníků`;
  if(meta.phase==='open' || meta.phase==='open_done' || meta.phase==='open_cancelled'){
    const bits = [];
    if(counts.waiting) bits.push(`${counts.waiting} ${counts.waiting===1?'čeká':'čekají'} na naplánování`);
    if(counts.scheduled) bits.push(`${counts.scheduled} ${counts.scheduled===1?'je naplánovaná':'jsou naplánované'}`);
    if(counts.active) bits.push(`${counts.active} probíhá`);
    if(counts.done) bits.push(`${counts.done} ${counts.done===1?'je hotová':'je hotových'}`);
    const text = bits.length>1?bits.slice(0,-1).join(', ')+' a '+bits.at(-1):(bits[0]||'');
    return `Našel jsem ${total} ${meta.phase==='open'?'neukončených':'vybraných'} zakázek druhu ${label} u ${who}${text?': '+text:''}.`;
  }
  const titles = {waiting:'čekajících na naplánování', scheduled:'naplánovaných', active:'probíhajících', done:'hotových', cancelled:'zrušených', archived:'archivovaných'};
  return `Našel jsem ${total} ${titles[meta.phase]||'vybraných'} zakázek druhu ${label} u ${who}.`;
}
export function formatSelectionReply(jobs, meta){
  const head = selectionSummary(meta);
  if(!meta.total) return head;
  const kinds = meta.kinds || BUILTIN_JOB_KINDS;
  const body = groupByCustomer(jobs).map(group=>`${group.name}\n`+group.jobs.map(job=>{
    const place = placeOf(job);
    return `• ${job.title} · ${kindLabel(job, kinds)}${place?' · '+place:''} · ${statusLabel(job)} · ${whenLabel(job)}`;
  }).join('\n')).join('\n');
  const more = meta.total>jobs.length ? `\nUkazuji ${jobs.length} z ${meta.total}. Počet je za celý oprávněný výsledek, ne za tuto stránku.` : '';
  return `${head}\n${body}${more}`;
}
export function selectionCards(jobs, kinds = BUILTIN_JOB_KINDS){
  return (jobs||[]).filter(job=>job?.id).map(job=>({
    type:'job', id:job.id, title:job.customerName||job.title||'Zakázka',
    subtitle:[job.title, kindLabel(job, kinds), placeOf(job), statusLabel(job), whenLabel(job)].filter(Boolean).join(' · '),
    meta:whenLabel(job), status:workPhase(job), statusLabel:statusLabel(job), openLabel:'Otevřít zakázku'
  }));
}
export function filterJobs(jobs, params, kinds = BUILTIN_JOB_KINDS){
  const rows = (jobs||[]).filter(job=>phaseMatches(job, params.phase) && (!params.kind || job.jobType===params.kind));
  const counts = {waiting:0, scheduled:0, active:0, done:0};
  for(const job of rows){const phase = workPhase(job); if(counts[phase]!=null) counts[phase]++;}
  return {jobs:rows, total:rows.length, customers:groupByCustomer(rows).length, counts, phase:params.phase, kind:params.kind||'', kindLabel:kindById(kinds, params.kind)?.label||'zakázky'};
}
