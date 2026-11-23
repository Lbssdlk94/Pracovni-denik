// Basic-mode understanding. This is not a language model and it does not store
// example sentences. It folds Czech, corrects a few letter-level typos, then
// scores unordered features: question, negation, next-work, add, consumption,
// plan, price, attendance. A local model may only name an intent from
// ASSISTANT_INTENT_IDS. The server still decides and never writes from the
// score alone.

export const ASSISTANT_INTENT_IDS = [
  'jobs.next','jobs.today','jobs.search','jobs.create','protocol.report','protocol.photo','protocol.check',
  'materials.price','materials.stock','materials.plan','materials.search','attendance.arrive','attendance.leave',
  'customers.search','customers.contact','customers.history','navigation.address',
  'assistant.clarify','assistant.explain','assistant.refuse','assistant.batch','help'
];
const MODEL_READS = new Set(['jobs.next','jobs.today','jobs.search','materials.price','materials.stock','materials.search','customers.search','customers.contact','customers.history','navigation.address','help','assistant.clarify','assistant.explain']);

export function intentFold(value){
  return String(value||'').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim()
    .replace(/\bzakzk\w*\b/g,'zakazka').replace(/\bpootm\b/g,'potom').replace(/\bkamm\b/g,'kam').replace(/\bprzist\w*\b/g,'pristi');
}
function stemName(value){
  return String(value||'').replace(/(ovi|em|ou|a|e|u|y)$/,'').slice(0,80);
}
function namedAfter(text, pattern){
  const match = text.match(pattern);
  return match?stemName(match[1]):'';
}
function feature(text){
  const tokens = text.split(' ').filter(word=>!['prosim','prosme','dekuji','diky'].includes(word));
  return {
    tokens,
    next:/\b(dals\w*|prist\w*|potom|pak|nasled\w*|na rade)\b/.test(text),
    work:/\b(prac\w*|zakazk\w*|vyjezd\w*|navstev\w*)\b/.test(text),
    jobWord:/\bzakazk\w*\b/.test(text),
    place:/\b(kam|kde)\b/.test(text),
    question:/\b(jaka|jake|jaky|kde|kam|co|kdy|kolik|proc)\b/.test(text),
    self:/\b(mam|jed|pojedu|jsem|moje|moji|muj)\b/.test(text),
    add:/\b(pridej\w*|pridat|vytvor\w*|zaloz\w*|novou|nova)\b/.test(text),
    consume:/\b(vymenil\w*|pouzil\w*|spotreb\w*|\bdali\b|\bdal\b)\b/.test(text),
    plan:/\b(budem\w*|bude potreba|potrebuj\w*|nachyst\w*)\b/.test(text),
    price:/\b(stoji|cena)\b/.test(text)||(/\bkolik\b/.test(text)&&/\b(stoji|cena)\b/.test(text)),
    stock:/\bskladem\b|\bna sklade\b/.test(text),
    arrival:/\b(dorazil\w*|jsem na miste|prijel\w*)\b/.test(text),
    follow:/\b(vratit|vratime|musime se)\b/.test(text),
    here:/\b(tehle|teto|tady)\b/.test(text),
    step:/\b(delat|krok)\b/.test(text),
    blocks:/\bne(?!dokonc)(?:pouzil\w*|spotreb\w*|zacin\w*|zahaj\w*|uklad\w*|zapis\w*)/.test(text)
      ||/\b(nechci|nezacin\w*|nezahaj\w*|nepouzil\w*|nespotreb\w*|nemaz\w*)\b/.test(text)
      ||/\bne\s+(pouzil\w*|spotreb\w*|zacin\w*|zahaj\w*|uklad\w*|zapis\w*|dokonc\w*)\b/.test(text)
  };
}
function catalogQuery(text){
  return text.replace(/\b(kolik|stoji|cena|skladem|sklade|na|za|ty|ten|ta|to|jeden|jedna|jedno|dva|dve|tri|ctyri|pet|sest|sedm|osm|devet|deset|kus|kusu|kusy|ks|metr|metru|metry|pytel|pytle|pytlu|material|materialu|je|jsou)\b|\b\d+(?:[.,]\d+)?\b/g,'').replace(/\s+/g,' ').trim();
}
function scoredIntent(intent, text, extra={}){
  return {intent, override:extra.override!==false, params:{reply:text, ...extra.params}};
}

export function understandUtterance(original, today, context){
  const text = intentFold(original);
  if(!text) return {intent:null};
  const saw = feature(text);
  const hypothetical = /\bco se stane\b/.test(text) || (/\bkdyz\b/.test(text) && /\b(dokonc|smaz|uloz|odesl|zavol)\w*/.test(text));
  if(hypothetical) return scoredIntent('assistant.explain', 'To je otázka, co by se stalo. Zakázku jsem nedokončil, dokument jsem neodeslal a docházku jsem nezavřel.');
  const acts = [saw.arrival && 'Příjezd beru jako popis, časový záznam sám nezakládám.', saw.consume && 'Spotřeba materiálu je samostatný návrh.', saw.follow && 'Další návštěva je samostatný návrh.'].filter(Boolean);
  if(acts.length>=2) return scoredIntent('assistant.batch', `Ve větě je víc kroků. Nic jsem neprovedl.\n${acts.map(item=>'• '+item).join('\n')}\nŘekněte jeden krok, ten připravím ke kontrole.`);
  const consumeBlocked = /\bne(?!dokonc)(?:pouzil\w*|spotreb\w*)/.test(text) || /\b(nepouzil\w*|nespotreb\w*)\b/.test(text) || /\bne\s+(pouzil\w*|spotreb\w*)\b/.test(text);
  if(consumeBlocked || (saw.blocks && (saw.next || saw.consume || saw.jobWord || saw.add || /\b(ventil\w*|material\w*|potrub\w*|polozk\w*)\b/.test(text)))) return scoredIntent('assistant.refuse', 'Tohle beru jako zákaz změny. Nic jsem nezačal, neukončil ani neuložil.');
  if(saw.add && saw.next && (saw.work || saw.jobWord)) return scoredIntent('assistant.clarify', 'Mám připravit novou zakázku, nebo jen ukázat další naplánovanou? Nic jsem nezaložil.');
  if(saw.here && saw.step) return scoredIntent('assistant.clarify', 'Mám ukázat, co ještě chybí na této zakázce, nebo až následující výjezd? Nic jsem nezměnil.', {params:{topic:'current-step'}});
  const bareNext = saw.tokens.length<=2 && saw.tokens.some(word=>/^dals/.test(word)) && saw.tokens.some(word=>/^prac/.test(word)) && !saw.jobWord && !saw.place && !saw.question && !saw.self && !context?.jobId;
  if(bareNext) return scoredIntent('assistant.clarify', 'Další práce pro vás, nebo u konkrétního zákazníka? Pořadí bez toho nehádám.');
  if(saw.next && (saw.work || /\bna rade\b/.test(text)) && !saw.add && !saw.here){
    if(/\bnavstev/.test(text)){
      const customer = namedAfter(text, /\bu\s+([a-z]{3,})/);
      if(customer) return {intent:'jobs.search', override:true, params:{query:customer}};
    }
    return {intent:'jobs.next', override:true, params:{currentJobId:context?.jobId||''}};
  }
  if(saw.place && saw.next && !saw.add) return {intent:'jobs.next', override:true, params:{currentJobId:context?.jobId||''}};
  if(saw.price && !saw.consume){
    return {intent:'materials.price', override:false, params:{catalog:true, query:catalogQuery(text)}};
  }
  if(saw.stock){
    return {intent:'materials.stock', override:false, params:{query:catalogQuery(text)}};
  }
  if(saw.plan && !saw.consume && !saw.add) return scoredIntent('materials.plan', 'Beru to jako plán potřeby, ne jako spotřebu. Do protokolu jsem nic nezapsal.', {override:false});
  if(/\b(prichod|zapni|spust)\b/.test(text) && /\b(dochaz\w*|smen\w*|prichod)\b/.test(text) && !saw.consume && !/\b(kolik|hodin|vykaz|odprac)\b/.test(text)) return {intent:'attendance.arrive', override:true, params:{}};
  if(/\b(odchod|zapis odchod)\b/.test(text) && !saw.consume && !/\b(kolik|hodin|vykaz|odprac)\b/.test(text)) return {intent:'attendance.leave', override:true, params:{}};
  if(/^(koncim|tady uz koncim|koncim tady)$/.test(text) || (/\bkoncim\b/.test(text) && !/\b(odchod|dochaz\w*|smen\w*|hotov\w*|zakazk\w*)\b/.test(text))){
    return scoredIntent('assistant.clarify', 'Mám ukončit jen vaši práci na zakázce? Odchod z docházky, kolegy ani celou zakázku tím nezavřu. Upřesněte, nic jsem neukončil.');
  }
  if(/\b(navig\w*|ukaz adres\w*|otevri cestu)\b/.test(text)) return {intent:'navigation.address', override:false, params:{currentJobId:context?.jobId||''}};
  if(/\b(zavolej|cislo|telefon)\b/.test(text)){
    const query = namedAfter(text, /\b(?:zavolej|cislo|telefon)\s+(?:na\s+|k\s+)?([a-z]{3,})/);
    return {intent:'customers.contact', override:false, params:{query:query||context?.customerName||''}};
  }
  if(/\b(vyfot\w*|fotk\w*|fotog\w*)\b/.test(text) && !/\bprotokol\b/.test(text)){
    const when = /\bpred\b/.test(text)?'before':/\bpo\b/.test(text)?'after':'gallery';
    return {intent:'protocol.photo', override:false, params:{when}};
  }
  if(/\bjen zkontrol\w*\b/.test(text) && !/\bprotokol\b/.test(text)) return scoredIntent('assistant.explain', 'Beru to jako kontrolu, ne jako spotřebu. Materiál jsem nezapsal.', {override:true});
  return {intent:null, today};
}

export function modelReadCommand(understanding){
  if(!understanding || typeof understanding!=='object' || Array.isArray(understanding)) return null;
  const intent = String(understanding.intent||'');
  if(!MODEL_READS.has(intent)) return null;
  const entities = understanding.entities && typeof understanding.entities==='object' && !Array.isArray(understanding.entities)?understanding.entities:{};
  const params = understanding.params && typeof understanding.params==='object' && !Array.isArray(understanding.params)?understanding.params:{};
  const query = String(entities.customerQuery||entities.query||entities.materialQuery||params.query||'').slice(0,80);
  return {intent, params:{query, catalog:intent==='materials.price', currentJobId:String(entities.currentJob||params.currentJobId||'').slice(0,100)}, text:''};
}

export function pickNextWork(jobs, today, currentJobId=''){
  const rows = [];
  const seen = new Set();
  for(const job of jobs||[]){
    if(!job?.id || job.status==='done' || job.deleted || seen.has(job.id+':'+job.dueDate)) continue;
    const dates = new Set();
    if(/^\d{4}-\d{2}-\d{2}$/.test(job.dueDate||'')) dates.add(job.dueDate);
    for(const date of job.schedule?.dates||[]) if(/^\d{4}-\d{2}-\d{2}$/.test(date||'')) dates.add(date);
    for(const term of job.terms||[]) if(term?.status!=='done' && /^\d{4}-\d{2}-\d{2}$/.test(term.date||'')) dates.add(term.date);
    for(const date of dates){
      if(date<today) continue;
      const term = (job.terms||[]).find(item=>item?.date===date);
      const raw = date===job.dueDate ? (job.plannedStart||job.startTime||term?.start||'') : (term?.start||'');
      const time = /^\d{2}:\d{2}$/.test(raw)?raw:'';
      rows.push({job, date, time, timed:!!time});
    }
    seen.add(job.id+':'+(job.dueDate||''));
  }
  const mine = currentJobId ? rows.filter(row=>!(row.job.id===currentJobId && row.date===today)) : rows;
  mine.sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99')||String(a.job.title||'').localeCompare(String(b.job.title||''),'cs'));
  if(!mine.length) return {empty:true};
  const day = mine.filter(row=>row.date===mine[0].date);
  if(day.length>1 && (day.some(row=>!row.timed) || new Set(day.map(row=>row.time)).size===1)) return {choices:day, untimed:day.some(row=>!row.timed)};
  return {next:mine[0], todayEmpty:mine[0].date!==today};
}
