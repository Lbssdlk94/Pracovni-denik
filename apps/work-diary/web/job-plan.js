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
  const match = String(original||'').match(/\bu\s+(?!pondělí|úterý|středu|čtvrtek|pátek|sobotu|neděli\b)(\p{L}+)/iu);
  return match?match[1]:'';
}

export function planWork(text, today){
  const original = String(text||'').trim();
  const folded = planFold(original);
  const countMatch = folded.match(/(?:asi\s+)?na\s+(\d{1,2})\s+dn/);
  const words = {jeden:1,jednu:1,dva:2,dve:2,tri:3,ctyri:4,pet:5,sest:6,sedm:7,osm:8,devet:9,deset:10};
  const wordCount = folded.match(/na\s+(jeden|jednu|dva|dve|tri|ctyri|pet|sest|sedm|osm|devet|deset)\s+dn/);
  if(!countMatch&&!wordCount||!/realizac|zakazk|budeme|naplan|zacneme/.test(folded)) return null;
  const count = Number(countMatch?countMatch[1]:words[wordCount[1]]);
  if(count<1||count>14) return null;
  const weekday = PLAN_WEEKDAYS.find(name=>folded.includes(name))||'pondeli';
  const start = nearestWeekday(today, weekday);
  if(!start) return null;
  const people = captureNames(original);
  const terms = planBusinessDays(start, count).map(date=>({date, start:'07:00', end:'15:00', people:[...people], status:'planned', note:''}));
  return {
    title:/realizac/.test(folded)?'Realizace závlahy':'Nová zakázka',
    customer:customerToken(original),
    customerStem:nameStem(customerToken(original)),
    terms,
    materials:[],
    askMaterial:true
  };
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
  if(extra){
    for(const term of next.terms){
      if(!term.people.some(person=>samePerson(person, extra[1]))) term.people.push(extra[1]);
    }
    changed = true;
  }
  if(/rain bird|jednotk|potrub/.test(folded)){
    if(/rain bird|jednotk/.test(folded)&&!next.materials.some(item=>/rain bird|jednotk/i.test(item.name))) next.materials.push({name:'Řídicí jednotka Rain Bird', quantity:1, unit:'ks', readiness:'buy'});
    const metres = folded.match(/(\d{1,5})\s*m(?:etru|etr)?\b/);
    if(metres&&/potrub/.test(folded)) next.materials.push({name:'Potrubí 32 mm', quantity:Number(metres[1]), unit:'m', readiness:'buy'});
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
  const days = plan.terms.map(term=>`${term.date.slice(8)}. ${PLAN_WEEKDAY_LABELS[new Date(term.date+'T12:00:00Z').getUTCDay()]} ${term.people.join(', ')||'bez pracovníků'}`).join('; ');
  const material = plan.materials.length?plan.materials.map(item=>`${item.name} ${item.quantity} ${item.unit} (${item.readiness==='on_hand'?'máme':'k nákupu'})`).join(', '):'materiál se ještě neobjednává';
  return `${plan.title}${plan.customer?` u ${plan.customer}`:''}, ${plan.terms.length} termínů ${first}–${last}. ${days}. ${material}.`;
}
