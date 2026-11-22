// One job, several work days. Dates use the Europe/Prague civil calendar (UTC noon).
function foldCzech(value){
  return String(value||'').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
}

const WEEKDAYS = ['nedele','pondeli','utery','streda','ctvrtek','patek','sobota'];
const WEEKDAY_LABELS = ['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'];

export function nearestWeekday(today, name){
  const target = WEEKDAYS.indexOf(name);
  if(target<0||!/^\d{4}-\d{2}-\d{2}$/.test(today)) return '';
  const current = new Date(today+'T12:00:00Z').getUTCDay();
  const delta = (target-current+7)%7;
  return addDays(today, delta);
}
export function addDays(iso, days){
  const date = new Date(iso+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
function weekdayName(iso){return WEEKDAYS[new Date(iso+'T12:00:00Z').getUTCDay()];}
function isWeekend(iso){const day = new Date(iso+'T12:00:00Z').getUTCDay(); return day===0||day===6;}
function businessDays(start, count){
  const days = [];
  let date = start;
  while(days.length<count){
    if(!isWeekend(date)) days.push(date);
    date = addDays(date, 1);
    if(days.length>31) break;
  }
  return days;
}
function nextFreeBusiness(days){
  let date = days[days.length-1];
  do {date = addDays(date, 1);} while(isWeekend(date)||days.includes(date));
  return date;
}
export function nameStem(value){
  return foldCzech(value).replace(/(ove|ova|ovy|ovi|emu|em|ou|ych|ymi)$/,'');
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
  const folded = foldCzech(original);
  const countMatch = folded.match(/(?:asi\s+)?na\s+(\d{1,2})\s+dn/);
  if(!countMatch||!/realizac|zakazk|budeme|naplan/.test(folded)) return null;
  const count = Number(countMatch[1]);
  if(count<1||count>14) return null;
  const weekday = WEEKDAYS.find(name=>folded.includes(name))||'pondeli';
  const start = nearestWeekday(today, weekday);
  if(!start) return null;
  const people = captureNames(original);
  const terms = businessDays(start, count).map(date=>({date, start:'07:00', end:'15:00', people:[...people], status:'planned', note:''}));
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
  const folded = foldCzech(original);
  const next = structuredClone(plan);
  let changed = false;
  if(/stred/.test(folded)&&/jinam|vynech/.test(folded)){
    const skipped = next.terms.find(term=>weekdayName(term.date)==='streda');
    if(skipped){
      const kept = next.terms.filter(term=>term.date!==skipped.date);
      kept.push({...skipped, date:nextFreeBusiness(kept.map(term=>term.date)), note:'Přesunuto ze středy'});
      next.terms = kept.sort((a,b)=>a.date.localeCompare(b.date));
      changed = true;
    }
  }
  const late = folded.match(/(\p{L}+)\s+prijede az/u);
  if(late){
    const who = late[1];
    const day = WEEKDAYS.find(name=>folded.includes(name));
    if(day){
      for(const term of next.terms){
        if(WEEKDAYS.indexOf(weekdayName(term.date))<WEEKDAYS.indexOf(day)) term.people = term.people.filter(person=>foldCzech(person)!==who);
      }
      changed = true;
    }
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
  return changed?next:null;
}

export function matchPeople(wanted, members){
  const resolved = [], ambiguous = [];
  for(const name of wanted){
    const stem = nameStem(name);
    const hits = (members||[]).filter(person=>nameStem(person.name)===stem||foldCzech(person.name).includes(stem));
    if(hits.length===1) resolved.push({query:name, id:hits[0].id, name:hits[0].name});
    else ambiguous.push({query:name, options:hits.map(person=>person.name)});
  }
  return {resolved, ambiguous};
}

export function planCollisions(plan, jobs){
  const hits = [];
  for(const term of plan.terms||[]){
    for(const person of term.people){
      const stem = nameStem(person);
      for(const job of jobs||[]){
        const names = job.assignedNames||[];
        const sameDay = job.dueDate===term.date||(job.termDates||[]).includes(term.date);
        if(sameDay&&names.some(item=>nameStem(item)===stem)) hits.push({date:term.date, person, title:job.title});
      }
    }
  }
  return hits;
}

export function planSummary(plan){
  const first = plan.terms[0]?.date||'';
  const last = plan.terms[plan.terms.length-1]?.date||'';
  const days = plan.terms.map(term=>`${term.date.slice(8)}. ${WEEKDAY_LABELS[new Date(term.date+'T12:00:00Z').getUTCDay()]} ${term.people.join(', ')||'bez pracovníků'}`).join('; ');
  const material = plan.materials.length?plan.materials.map(item=>`${item.name} ${item.quantity} ${item.unit} (${item.readiness==='on_hand'?'máme':'k nákupu'})`).join(', '):'materiál se ještě neobjednává';
  return `${plan.title}${plan.customer?` u ${plan.customer}`:''}, ${plan.terms.length} termínů ${first}–${last}. ${days}. ${material}.`;
}
