// One job, several work days. Names here must stay unique: the production
// Worker concatenates files and drops import lines.
function planFold(value){
  return String(value||'').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
}

const PLAN_WEEKDAYS = ['nedele','pondeli','utery','streda','ctvrtek','patek','sobota'];
const PLAN_WEEKDAY_LABELS = ['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'];

function planShiftDate(iso, days){
  const date = new Date(iso+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
export function nearestWeekday(today, name){
  const target = PLAN_WEEKDAYS.indexOf(name);
  if(target<0||!/^\d{4}-\d{2}-\d{2}$/.test(today)) return '';
  const current = new Date(today+'T12:00:00Z').getUTCDay();
  return planShiftDate(today, (target-current+7)%7);
}
function planWeekdayName(iso){return PLAN_WEEKDAYS[new Date(iso+'T12:00:00Z').getUTCDay()];}
function planWeekend(iso){const day = new Date(iso+'T12:00:00Z').getUTCDay(); return day===0||day===6;}
function planBusinessDays(start, count){
  const days = [];
  let date = start;
  while(days.length<count){
    if(!planWeekend(date)) days.push(date);
    date = planShiftDate(date, 1);
    if(days.length>31) break;
  }
  return days;
}
function planNextBusiness(days){
  let date = days[days.length-1];
  do {date = planShiftDate(date, 1);} while(planWeekend(date)||days.includes(date));
  return date;
}
export function nameStem(value){
  const folded = planFold(value).replace(/(ove|ova|ovy|ovi|emu|em|ou|ych|ymi)$/,'');
  return folded.length>4 && folded.endsWith('a') ? folded.slice(0, -1) : folded;
}
function samePerson(query, member){
  const left = nameStem(query), right = nameStem(member);
  if(left===right) return true;
  const short = left.length<=right.length?left:right, long = left.length<=right.length?right:left;
  if(short.length<4||long.length!==short.length+1) return false;
  for(let i=0;i<long.length;i++) if(long.slice(0,i)+long.slice(i+1)===short) return true;
  return false;
}

function captureNames(original){
  const match = String(original||'').match(/bude(?:\s+tam)?\s+([^.?\n]+)/iu);
  if(!match) return [];
  return match[1].split(/\s+a\s+|,\s*/u).map(name=>name.replace(/[?.!,]+$/g,'').trim()).filter(name=>name.length>1&&name.length<40);
}
function customerToken(original){
  const match = String(original||'').match(/\bu\s+(?:(?:pana|paní|pani|panu|pane|zákazníka|zakaznika)\s+)?(\p{L}+)/iu);
  if(!match) return '';
  const folded = planFold(match[1]);
  if(PLAN_WEEKDAY_FORMS.some(([, forms])=>forms.includes(folded))) return '';
  return match[1];
}
const PLAN_WEEKDAY_FORMS = [
  ['nedele', ['nedele','nedeli']],
  ['pondeli', ['pondeli','pondelka','pondelku']],
  ['utery', ['utery','uterku','uterek']],
  ['streda', ['streda','stredu','strede','stredy']],
  ['ctvrtek', ['ctvrtek','ctvrtku','ctvrtka']],
  ['patek', ['patek','patku','patka']],
  ['sobota', ['sobota','sobotu','sobote','soboty']]
];
function planClock(hour, minute){
  const h = Number(hour), m = Number(minute||0);
  if(!Number.isInteger(h)||!Number.isInteger(m)||h<0||h>23||m<0||m>59) return '';
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}
function planClockSpans(folded){
  const re = /od\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:hodin|hodiny|hodinu|hod)?\s+do\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:hodin|hodiny|hodinu|hod)?/g;
  const spans = [];
  let match;
  while((match = re.exec(folded))){
    const start = planClock(match[1], match[2]||0);
    const end = planClock(match[3], match[4]||0);
    if(start&&end&&end>start) spans.push({at:match.index, start, end});
  }
  return spans;
}
function planWeekdayHits(folded){
  const hits = [];
  for(const [name, forms] of PLAN_WEEKDAY_FORMS){
    for(const form of forms){
      const re = new RegExp('(?:^|\\s)'+form+'(?=\\s|$)', 'g');
      let match;
      while((match = re.exec(folded))) hits.push({name, at:match.index});
    }
  }
  hits.sort((a,b)=>a.at-b.at||a.name.localeCompare(b.name));
  const seen = new Set();
  return hits.filter(hit=>seen.has(hit.name)?false:seen.add(hit.name));
}
function planWeekdayWhen(folded){
  if(/minul/.test(folded)) return 'last';
  if(/prist/.test(folded)) return 'next';
  return /tento|teto/.test(folded)?'this':'nearest';
}
function planDateForWeekday(today, name, which){
  if(which==='nearest'||which==='this'){
    const target = PLAN_WEEKDAYS.indexOf(name);
    const current = new Date(today+'T12:00:00Z').getUTCDay();
    let delta = (target-current+7)%7;
    if(which==='nearest'&&delta===0) return today;
    if(which==='this') return planShiftDate(today, delta);
    return nearestWeekday(today, name);
  }
  const target = PLAN_WEEKDAYS.indexOf(name);
  const current = new Date(today+'T12:00:00Z').getUTCDay();
  if(which==='last'){
    let delta = (current-target+7)%7;
    if(delta===0) delta = 7;
    return planShiftDate(today, -delta);
  }
  let delta = (target-current+7)%7;
  if(delta===0) delta = 7;
  return planShiftDate(today, delta);
}
function planRelativeDays(folded, today){
  const days = [];
  if(/\bdnes\b|\bdneska\b/.test(folded)) days.push(today);
  if(/\bpozitri\b/.test(folded)) days.push(planShiftDate(today, 2));
  if(/\bzitra\b|\bzitrek\b|\bzitrejs/.test(folded)) days.push(planShiftDate(today, 1));
  return days;
}
function planNumericDates(original, today){
  const dates = [];
  const re = /(?<!\d)(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4}))?/g;
  let match;
  while((match = re.exec(String(original||'')))){
    const day = Number(match[1]), month = Number(match[2]), year = match[3]?Number(match[3]):Number(String(today).slice(0,4));
    if(month<1||month>12||day<1||day>31||year<2000||year>2100) continue;
    const iso = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const check = new Date(iso+'T12:00:00Z');
    if(check.getUTCMonth()+1===month&&check.getUTCDate()===day) dates.push(iso);
  }
  const isoRe = /(?<!\d)(20\d{2}-\d{2}-\d{2})(?!\d)/g;
  while((match = isoRe.exec(String(original||'')))) dates.push(match[1]);
  return dates;
}
function planWeekDays(today, which){
  const day = new Date(today+'T12:00:00Z').getUTCDay()||7;
  const monday = planShiftDate(today, 1-day+(which==='last'?-7:which==='next'?7:0));
  return [0,1,2,3,4].map(offset=>planShiftDate(monday, offset));
}
function planListedDays(original, folded, today){
  const which = planWeekdayWhen(folded);
  const weekdays = planWeekdayHits(folded).map(hit=>planDateForWeekday(today, hit.name, which));
  return [...new Set([...weekdays, ...planRelativeDays(folded, today), ...planNumericDates(original, today)].filter(Boolean))].sort();
}
function planSpanFor(date, spans){
  if(!spans.length) return {start:'07:00', end:'15:00'};
  if(spans.length===1) return {start:spans[0].start, end:spans[0].end};
  const name = planWeekdayName(date);
  const own = spans.find(span=>span.day===name);
  return own?{start:own.start, end:own.end}:{start:spans[spans.length-1].start, end:spans[spans.length-1].end};
}
function planTagSpans(folded){
  const spans = planClockSpans(folded);
  const days = planWeekdayHits(folded);
  return spans.map(span=>{
    const previous = [...days].reverse().find(day=>day.at<span.at);
    return {...span, day:spans.length>1?previous?.name||'':''};
  });
}
function planMinutes(term){
  const start = String(term?.start||'').split(':').map(Number);
  const end = String(term?.end||'').split(':').map(Number);
  if(start.length<2||end.length<2||start.some(Number.isNaN)||end.some(Number.isNaN)) return 0;
  return Math.max(0, end[0]*60+end[1]-(start[0]*60+start[1]));
}
function planHoursLabel(minutes){
  const hours = Math.floor(minutes/60), mins = minutes%60;
  const word = count=>count===1?'hodina':count<5?'hodiny':'hodin';
  const minuteWord = count=>count===1?'minuta':count<5?'minuty':'minut';
  if(!minutes) return '';
  if(!mins) return `${hours} ${word(hours)}`;
  if(!hours) return `${mins} ${minuteWord(mins)}`;
  return `${hours} ${word(hours)} ${mins} ${minuteWord(mins)}`;
}
function planCloseName(left, right){
  if(!left||!right||Math.abs(left.length-right.length)>1||Math.min(left.length, right.length)<4) return false;
  if(left===right) return true;
  if(left.length===right.length){
    let diff = 0;
    for(let i=0;i<left.length;i++) if(left[i]!==right[i]&&++diff>1) return false;
    return diff===1;
  }
  const short = left.length<right.length?left:right, long = left.length<right.length?right:left;
  for(let i=0;i<long.length;i++) if(long.slice(0,i)+long.slice(i+1)===short) return true;
  return false;
}
export function customerHit(query, name){
  const stem = nameStem(query);
  if(!stem || stem.length<3) return false;
  if(nameStem(name)===stem) return true;
  return planFold(name).split(' ').filter(token=>token.length>2).some(token=>nameStem(token)===stem||planCloseName(stem, nameStem(token)));
}
function planCrew(value){
  const clean = String(value||'').replace(/,.*/,'').replace(/[?.!]+$/g,'').trim();
  if(!clean || /\d|pojed|jinam|termin|hodin|presun|prodluz|\bden\b|\bprace\b/.test(planFold(clean))) return [];
  return clean.split(/\s+a\s+/u).map(name=>{
    return name.replace(/[?.!,]+$/g,'').replace(/^(?:(?:pan|pana|paní|pani|panu|pane|tam|bude|budou|pracovat|pracuje|jen|pouze|tak|taky|oba|dny)\s+)+/iu,'').trim();
  }).filter(name=>{
    if(name.length<2||name.length>40) return false;
    const folded = planFold(name);
    if(/^(oba|dny|den|tam|bude|budou|pracovat|pracuje|jen|pouze|tak|taky|v|ve|na|a)$/.test(folded)) return false;
    return !PLAN_WEEKDAY_FORMS.some(([, forms])=>forms.includes(folded)||forms.some(form=>folded.split(' ').includes(form)));
  });
}

export function planWork(text, today){
  const original = String(text||'').trim();
  const folded = planFold(original);
  const verb = /\b(vytvor|zaloz|naplan|budeme|zacneme)\b/.test(folded);
  if(/kolik|stravil|stravili|odprac|vykaz/.test(folded) && !verb) return null;
  const countMatch = folded.match(/(?:asi\s+)?na\s+(\d{1,2})\s+dn/);
  const words = {jeden:1,jednu:1,dva:2,dve:2,tri:3,ctyri:4,pet:5,sest:6,sedm:7,osm:8,devet:9,deset:10};
  const wordCount = folded.match(/na\s+(jeden|jednu|dva|dve|tri|ctyri|pet|sest|sedm|osm|devet|deset)\s+dn/);
  const legacy = (countMatch||wordCount) && /realizac|zakazk|budeme|naplan|zacneme/.test(folded);
  const spans = planTagSpans(folded);
  const listed = planListedDays(original, folded, today);
  const week = /tyd(?:en|n)/.test(folded);
  if(!verb && !legacy) return null;
  if(!legacy && !week && listed.length<2 && !(listed.length===1 && spans.length)) return null;
  let dates = [];
  if(legacy){
    const count = Number(countMatch?countMatch[1]:words[wordCount[1]]);
    if(count<1||count>14) return null;
    const weekday = planWeekdayHits(folded)[0]?.name||'pondeli';
    const start = nearestWeekday(today, weekday);
    if(!start) return null;
    dates = planBusinessDays(start, count);
  }else if(week && listed.length<2){
    dates = planWeekDays(today, planWeekdayWhen(folded));
  }else dates = listed;
  dates = [...new Set(dates)].filter(Boolean).sort();
  if(dates.length<1||dates.length>14) return null;
  const people = captureNames(original);
  const customer = customerToken(original);
  const terms = dates.map(date=>{
    const clock = planSpanFor(date, spans);
    return {date, start:clock.start, end:clock.end, people:[...people], status:'planned', note:''};
  });
  let title = 'Nová zakázka';
  if(/realizac/.test(folded)&&/zavl/.test(folded)) title = 'Realizace závlahy';
  else if(/realizac/.test(folded)) title = 'Realizace';
  else if(/\bservis\b/.test(folded)) title = 'Servis';
  return {title, customer, customerStem:nameStem(customer), terms, materials:[], askMaterial:true};
}

export function revisePlan(plan, text){
  if(!plan?.terms?.length) return null;
  const original = String(text||'').trim();
  const folded = planFold(original);
  const next = structuredClone(plan);
  let changed = false;
  if(/stred/.test(folded)&&/jinam|vynech|nepojed/.test(folded)){
    const skipped = next.terms.find(term=>planWeekdayName(term.date)==='streda');
    if(skipped){
      const kept = next.terms.filter(term=>term.date!==skipped.date);
      if(!/pokrac/.test(folded)) kept.push({...skipped, date:planNextBusiness(kept.map(term=>term.date)), note:'Přesunuto ze středy'});
      next.terms = kept.sort((a,b)=>a.date.localeCompare(b.date));
      changed = true;
    }
  }
  const late = folded.match(/(\p{L}+)\s+prijede az/u);
  if(late){
    const who = late[1];
    const day = PLAN_WEEKDAYS.find(name=>folded.includes(name));
    if(day){
      for(const term of next.terms){
        if(PLAN_WEEKDAYS.indexOf(planWeekdayName(term.date))<PLAN_WEEKDAYS.indexOf(day)) term.people = term.people.filter(person=>planFold(person)!==who);
      }
      changed = true;
    }
  }
  const extra = original.match(/přidej\s+ještě\s+(\p{L}+)/iu);
  if(extra && !PLAN_WEEKDAY_FORMS.some(([, forms])=>forms.includes(planFold(extra[1])))){
    for(const term of next.terms){
      if(!term.people.some(person=>samePerson(person, extra[1]))) term.people.push(extra[1]);
    }
    changed = true;
  }
  if(/rain bird|jednotk/.test(folded) || (/potrub/.test(folded) && /\b32\b/.test(folded))){
    if(/rain bird|jednotk/.test(folded)&&!next.materials.some(item=>/rain bird|jednotk/i.test(item.name))) next.materials.push({name:'Řídicí jednotka Rain Bird', quantity:1, unit:'ks', readiness:'buy'});
    const metres = folded.match(/(\d{1,5})\s*m(?:etru|etr)?\b/);
    if(metres&&/potrub/.test(folded)&&/\b32\b/.test(folded)&&!next.materials.some(item=>/potrub/i.test(item.name))) next.materials.push({name:'Potrubí 32 mm', quantity:Number(metres[1]), unit:'m', readiness:'buy'});
    next.askMaterial = false;
    changed = true;
  }
  if(/uz mame/.test(folded)){
    const item = next.materials.find(entry=>/jednotk|rain bird/i.test(entry.name))||next.materials[0];
    if(item){item.readiness = 'on_hand'; changed = true;}
  }
  const assign = original.match(/přiřaď\s+([^.?\n]+)/iu);
  if(assign){
    const names = assign[1].split(/\s+a\s+|,\s*/u).map(name=>name.replace(/[?.!,]+$/g,'').trim()).filter(Boolean);
    if(names.length){for(const term of next.terms) term.people=[...names];changed=true;}
  }
  const only = original.match(/\bve?\s+(pondělí|úterý|středu|čtvrtek|pátek|sobotu|neděli)\b.*\bpouze\s+(\p{L}+)/iu);
  if(only){
    const day = PLAN_WEEKDAYS.find(name=>planFold(only[1]).startsWith(name.slice(0,4)));
    const term = next.terms.find(item=>planWeekdayName(item.date)===day);
    if(term){term.people=[only[2]];changed=true;}
  }
  if(/pridej jeste jeden pracovni den/.test(folded)){
    next.terms.push({date:planNextBusiness(next.terms.map(term=>term.date)),start:'07:00',end:'15:00',people:[...(next.terms[0]?.people||[])],status:'planned',note:''});
    next.terms.sort((a,b)=>a.date.localeCompare(b.date));
    changed = true;
  }
  const longer = folded.match(/prodluz zakazku o\s+(jeden|jednu|dva|dve|tri|ctyri|\d{1,2})\s+dn/);
  if(longer){
    const amount = Number(longer[1])||{jeden:1,jednu:1,dva:2,dve:2,tri:3,ctyri:4}[longer[1]]||1;
    for(let i=0;i<amount&&next.terms.length<14;i++) next.terms.push({date:planNextBusiness(next.terms.map(term=>term.date)),start:'07:00',end:'15:00',people:[...(next.terms[0]?.people||[])],status:'planned',note:''});
    next.terms.sort((a,b)=>a.date.localeCompare(b.date));
    changed = true;
  }
  const moved = folded.match(/presun\s+(\p{L}+)\s+termin\s+na\s+(\p{L}+)/u);
  if(moved){
    const from = PLAN_WEEKDAYS.find(name=>moved[1].startsWith(name.slice(0,4)));
    const to = PLAN_WEEKDAYS.find(name=>moved[2].startsWith(name.slice(0,4)));
    const term = next.terms.find(item=>planWeekdayName(item.date)===from);
    if(term&&to){
      const start = nearestWeekday(term.date, to);
      if(start&&!next.terms.some(item=>item.date===start)){term.date=start;term.note='Přesunutý termín';next.terms.sort((a,b)=>a.date.localeCompare(b.date));changed=true;}
    }
  }
  const dayWord = 'pondělí|úterý|středu|čtvrtek|pátek|sobotu|neděli';
  const crews = [...original.matchAll(new RegExp('(?:^|[.]\\s*|\\b)(?:ve?|na)\\s+('+dayWord+')\\s+(?:(?:tam|bude|budou|pracuje|pracovat|jen|pouze)\\s+)*([^.?!]+?)(?=[?.!]|\\s+(?:a\\s+)?(?:ve?|na)\\s+(?:'+dayWord+')\\b|$)','giu'))];
  if(crews.length){
    let applied = false;
    for(const crew of crews){
      const day = PLAN_WEEKDAYS.find(name=>planFold(crew[1]).startsWith(name.slice(0,4)));
      const names = planCrew(crew[2]);
      const term = next.terms.find(item=>planWeekdayName(item.date)===day);
      if(term&&names.length){term.people=[...names];applied=true;}
    }
    if(applied) changed = true;
  }
  const crew = original.match(/\b(?:bude(?:\s+tam)?|budou tam|pracovat bude|na oba dny bude|oba dny(?:\s+bude)?)\s+([^.?\n]+)/iu);
  if(crew && !crews.length && !planWeekdayHits(planFold(crew[1])).length){
    const names = planCrew(crew[1]);
    if(names.length){
      const hits = planWeekdayHits(folded);
      const targets = hits.length?next.terms.filter(term=>hits.some(hit=>planWeekdayName(term.date)===hit.name)):next.terms;
      for(const term of (targets.length?targets:next.terms)) term.people=[...names];
      changed = true;
    }
  }
  const spans = planTagSpans(folded);
  if(spans.length){
    const hits = planWeekdayHits(folded);
    if(hits.length===1){
      const term = next.terms.find(item=>planWeekdayName(item.date)===hits[0].name);
      if(term){term.start=spans[0].start;term.end=spans[0].end;changed=true;}
    }else if(!hits.length){
      for(const term of next.terms){term.start=spans[0].start;term.end=spans[0].end;}
      changed = true;
    }
  }
  const addedDay = folded.match(/pridej(?:\s+jeste)?\s+(pondeli|pondelka|pondelku|utery|uterku|uterek|streda|stredu|strede|stredy|ctvrtek|ctvrtku|ctvrtka|patek|patku|patka|sobota|sobotu|sobote|soboty|nedele|nedeli)/);
  if(addedDay){
    const name = PLAN_WEEKDAY_FORMS.find(([, forms])=>forms.includes(addedDay[1]))?.[0];
    const anchor = next.terms[next.terms.length-1]?.date;
    const date = name&&anchor?nearestWeekday(anchor, name):'';
    if(date&&!next.terms.some(term=>term.date===date)&&next.terms.length<14){
      next.terms.push({date, start:next.terms[0]?.start||'07:00', end:next.terms[0]?.end||'15:00', people:[...(next.terms[0]?.people||[])], status:'planned', note:''});
      next.terms.sort((a,b)=>a.date.localeCompare(b.date));
      changed = true;
    }
  }
  const addedDate = planNumericDates(original, next.terms[0]?.date||'2026-01-01').find(date=>!next.terms.some(term=>term.date===date));
  if(/pridej/.test(folded)&&addedDate&&next.terms.length<14){
    next.terms.push({date:addedDate, start:next.terms[0]?.start||'07:00', end:next.terms[0]?.end||'15:00', people:[...(next.terms[0]?.people||[])], status:'planned', note:''});
    next.terms.sort((a,b)=>a.date.localeCompare(b.date));
    changed = true;
  }
  if(/potrebujeme|k nakupu|uz mame/.test(folded) && !/rain bird|jednotk/.test(folded) && !(/\b32\b/.test(folded)&&/potrub/.test(folded))){
    const readiness = /uz mame/.test(folded) && !/k nakupu|potrebujeme/.test(folded) ? 'on_hand' : 'buy';
    const chunk = original.replace(/^.*?(potřebujeme|k nákupu|už máme)\s+/iu,'').replace(/[?.!]+$/g,'').trim();
    const qty = chunk.match(/^(\d+)\s*(m|ks|kg|bm|l)?\s+(.+)/u);
    const materialName = (qty?qty[3]:chunk).replace(/\s+k\s+nákupu$/iu,'').trim();
    const foldedName = planFold(materialName);
    if(materialName && materialName.length<80 && foldedName.length>2 && !next.materials.some(item=>planFold(item.name).includes(foldedName)) && !PLAN_WEEKDAY_FORMS.some(([, forms])=>forms.includes(foldedName))){
      next.materials.push({name:materialName, quantity:qty?Number(qty[1]):1, unit:qty?.[2]||'ks', readiness});
      next.askMaterial = false;
      changed = true;
    }
  }
  return changed?next:null;
}

export function matchPeople(wanted, members){
  const resolved = [], ambiguous = [];
  for(const name of wanted){
    const hits = (members||[]).filter(person=>samePerson(name, person.name));
    if(hits.length===1) resolved.push({query:name, id:hits[0].id, name:hits[0].name});
    else ambiguous.push({query:name, options:hits.map(person=>person.name)});
  }
  return {resolved, ambiguous};
}

export function planCollisions(plan, jobs){
  const hits = [];
  for(const term of plan.terms||[]){
    for(const person of term.people){
      for(const job of jobs||[]){
        const names = job.assignedNames||[];
        const sameDay = job.dueDate===term.date||(job.termDates||[]).includes(term.date);
        if(sameDay&&names.some(item=>samePerson(person, item))) hits.push({date:term.date, person, title:job.title});
      }
    }
  }
  return hits;
}

export function planSummary(plan){
  const first = plan.terms[0]?.date||'';
  const last = plan.terms[plan.terms.length-1]?.date||'';
  const days = plan.terms.map(term=>`${term.date.slice(8)}. ${PLAN_WEEKDAY_LABELS[new Date(term.date+'T12:00:00Z').getUTCDay()]} ${term.start}–${term.end} ${term.people.join(', ')||'bez pracovníků'}`).join('; ');
  const minutes = plan.terms.reduce((sum, term)=>sum+planMinutes(term), 0);
  const material = plan.materials.length?plan.materials.map(item=>`${item.name} ${item.quantity} ${item.unit} (${item.readiness==='on_hand'?'máme':'k nákupu'})`).join(', '):'materiál se ještě neobjednává';
  return `${plan.title}${plan.customer?` u ${plan.customer}`:''}, ${plan.terms.length} ${plan.terms.length===1?'termín':'termíny'} ${first}${last&&last!==first?'–'+last:''}, celkem ${planHoursLabel(minutes)||'bez dopočtené délky'}. ${days}. ${material}.`;
}
