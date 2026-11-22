// Rule-based Czech commands. No model, no network. The same function is used
import {planWork, revisePlan} from './job-plan.js';
// by the worker and by tests. Later local or cloud models may only replace
// this parser; they must still call the existing authorized actions.

export const ASSISTANT_MODES = [
  {id:'basic', label:'Základní asistent', available:true, kind:'rules', detail:'Příkazy podle pravidel nad stávajícími daty. Bez AI a bez dalšího předplatného.'},
  {id:'local', label:'V zařízení', available:true, kind:'local', detail:'Ministral 3B se stáhne do prohlížeče, asi 2,2 GB. Do aplikace ani na server se model nevkládá. Firemní údaje dál bere stávající asistent a zápis čeká na potvrzení.'},
  {id:'cloud', label:'Cloud', available:false, kind:'cloud', detail:'Nedostupné. Cloudový poskytovatel není zapojený a placené API se nevolá.'}
];

// Future runtimes. None of these download a model or call a paid API.
export const ASSISTANT_PROVIDERS = [
  {id:'basic', label:'Základní', available:true, kind:'rules'},
  {id:'ministral-3b', label:'Ministral 3B', available:true, kind:'local'},
  {id:'qwen', label:'Qwen', available:false, kind:'local'},
  {id:'apple-foundation', label:'Apple Foundation Models', available:false, kind:'device'},
  {id:'cloud', label:'Cloud', available:false, kind:'cloud'}
];

export const KNOWLEDGE_KINDS = [
  {id:'company', label:'Firemní znalosti', available:false},
  {id:'manual', label:'Servisní manuály', available:false},
  {id:'correction', label:'Schválené opravy odpovědí', available:false}
];

const MONTHS = ['leden','unor','brezen','duben','kveten','cerven','cervenec','srpen','zari','rijen','listopad','prosinec'];
const WEEKDAYS = ['nedele','pondeli','utery','streda','ctvrtek','patek','sobota'];

export function nextWeekday(today, name){
  const target = WEEKDAYS.indexOf(name);
  if(target<0) return '';
  const current = new Date(today+'T12:00:00Z').getUTCDay();
  let delta = (target-current+7)%7;
  if(delta===0) delta = 7;
  const date = new Date(today+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+delta);
  return date.toISOString().slice(0,10);
}

function weekdayIn(text){
  return WEEKDAYS.find(name=>text.includes(name))||'';
}

export function foldCzech(value){
  return String(value||'').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
}

export function assistantSuggestions(){
  return [
    'Co máme dnes za práci?',
    'Ukaž nedokončené zakázky.',
    'Najdi zákazníka Nováka.',
    'Přidej zákazníka Nováka.',
    'Vytvoř zakázku servis u Nováka na zítra.',
    'Kolik hodin odpracoval Marek v listopadu?',
    'Jaký materiál potřebujeme na zítřek?',
    'Vytvoř servisní protokol.',
    'Kolik hodin jsem dnes odpracoval?',
    'Kteří zákazníci čekají na servis?',
    'Vytvoř pracovní výkaz za tento měsíc.'
  ];
}

export function assistantModeInfo(id){
  return ASSISTANT_MODES.find(mode=>mode.id===id)||ASSISTANT_MODES[0];
}

function namedMonth(text, today){
  const index = MONTHS.findIndex(name=>text.includes(name));
  if(index<0) return null;
  const current = Number(today.slice(5,7));
  let year = Number(today.slice(0,4));
  const month = index+1;
  if(month>current+1) year -= 1;
  return `${year}-${String(month).padStart(2,'0')}`;
}

function capture(original, patterns){
  for(const pattern of patterns){
    const match = original.match(pattern);
    if(match?.[1]) return match[1].replace(/[?.!,]+$/g,'').replace(/^(zakázku|zakázka|zákazníka|zákazník)\s+/i,'').trim();
  }
  return '';
}

function softenName(value){
  return value.replace(/\b(\p{L}{3,}?)(?:ovi|em|ou|a|e|u|y)\b/gu,(full, stem)=>stem.length>=3?stem:full);
}

function materialQuery(value){
  const folded = foldCzech(value).replace(/\b(potrebujeme|potrebujem|chceme|mame|jaky|jaka|jake|na|zitra|zitrek|zitrejsek|dnes)\b/g,'').trim();
  if(!folded) return '';
  return softenName(value);
}

const NUMBER_WORDS = {jeden:1,jedna:1,jedno:1,dva:2,dve:2,tri:3,ctyri:4,pet:5,sest:6,sedm:7,osm:8,devet:9,deset:10,jedenact:11,dvanact:12,dvacet:20,tricet:30,ctyricet:40,padesat:50,sto:100};
const UNIT_WORDS = {ks:'ks',kus:'ks',kusu:'ks',kusy:'ks',metr:'m',metru:'m',metry:'m',m:'m',bm:'m'};

function materialWords(value){
  return foldCzech(value).split(/\s+/).map(word=>word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g,'')).filter(Boolean);
}
function materialStem(word){
  return word.replace(/(ovacu|ovace|ovac|ove|ovy|ova|ych|emu|ami|ovi|em|ou|ku|ky|ka|u|y|a|e)$/,'');
}
export function parseMaterialChunk(chunk){
  const words = materialWords(chunk);
  if(!words.length) return null;
  const quantity = NUMBER_WORDS[words[0]] ?? (/^\d+(?:[.,]\d+)?$/.test(words[0])?Number(words[0].replace(',','.')):null);
  if(quantity==null) return null;
  words.shift();
  const unitAt = words.findIndex(word=>UNIT_WORDS[word]);
  const unit = unitAt>=0?UNIT_WORDS[words.splice(unitAt,1)[0]]:'';
  const name = words.join(' ');
  if(!name) return null;
  return {quantity, unit, name};
}
export function parseMaterialAddition(original){
  const text = foldCzech(original);
  const current = /\b(aktualni|teto)\b/.test(text);
  const named = current?'':softenName(capture(original, [/zakáz(?:ce|ku)\s+(.+?)(?=\s+(?:\d|pět|dva|dvě|tři|čtyři|šest|sedm|osm|devět|deset|dvacet)\b|$)/iu]));
  const body = text.replace(/^.*?\bpridej\b/,'').replace(/\bk aktualni zakazce\b/,'').replace(/\bk teto zakazce\b/,'').replace(/\bk zakazce\s+\S+/,'').replace(/\bmaterial(?:u|y)?\b/,'').trim();
  const lines = body.split(/\s+a\s+/).map(parseMaterialChunk).filter(Boolean);
  return {current, query:named, lines};
}
export function matchCatalogItem(name, items){
  const wanted = materialWords(name).map(materialStem).filter(word=>word.length>1);
  const scored = (items||[]).filter(item=>item.active!==false).map(item=>{
    const have = materialWords(`${item.name} ${item.sku||''}`).map(materialStem).filter(word=>word.length>1);
    const hits = have.filter(token=>wanted.includes(token)).length;
    return {item, hits, coverage:have.length?hits/have.length:0};
  }).filter(row=>row.hits>=Math.min(2, wanted.length)&&row.coverage>=0.5).sort((a,b)=>b.hits-a.hits||b.coverage-a.coverage);
  if(!scored.length) return {missing:true};
  const best = scored[0];
  const ties = scored.filter(row=>row.hits===best.hits&&row.coverage===best.coverage);
  if(ties.length>1) return {choices:ties.slice(0,4).map(row=>row.item)};
  return {item:best.item};
}
export function planMaterialLines(lines, items){
  const resolved = [];
  for(const line of lines||[]){
    const found = matchCatalogItem(line.name, items);
    if(found.missing) return {error:`Položku „${line.name}“ v katalogu nevidím. Nic jsem nepřidal.`};
    if(found.choices) return {error:`„${line.name}“ sedí na víc položek: ${found.choices.map(item=>`${item.name} (${item.unit})`).join(', ')}. Upřesněte název. Nic jsem nepřidal.`};
    if(line.unit&&found.item.unit!==line.unit) return {error:`„${found.item.name}“ je v katalogu v jednotce ${found.item.unit}, ne ${line.unit}. Nic jsem nepřidal.`};
    const previous = resolved.find(row=>row.itemId===found.item.id);
    if(previous) previous.quantity = Math.round((previous.quantity+line.quantity)*1000)/1000;
    else resolved.push({itemId:found.item.id, itemVersion:found.item.version, quantity:line.quantity, name:found.item.name, sku:found.item.sku||'', unit:found.item.unit, priceMinor:found.item.priceMinor, currency:found.item.currency||'CZK'});
  }
  if(!resolved.length) return {error:'V příkazu nevidím množství a název položky. Nic jsem nepřidal.'};
  return {lines:resolved};
}

function clipField(value, max){
  return String(value||'').replace(/[?.!,]+$/g,'').trim().slice(0, max);
}

export function parseCustomerDraft(original){
  const phone = clipField((original.match(/(?:telefon|tel\.?)\s*(\+?[0-9][0-9 ()\-./]{2,40})/iu)||[])[1], 50);
  const email = clipField((original.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/u)||[])[0], 254);
  const addressRaw = clipField(capture(original, [/adres[aeu]?\s+(.+?)(?=\s+telefon|\s+tel\.|\s+e-?mail|$)/iu]), 500);
  const parts = addressRaw.split(/\s*,\s*/).filter(Boolean);
  const name = softenName(clipField(capture(original, [/(?:zákazníka|zákazník)\s+(.+?)(?=\s*,|\s+telefon|\s+tel\.|\s+e-?mail|\s+adres|$)/iu]), 160));
  return {name, phone, email, address:parts[0]||'', city:clipField(parts.slice(1).join(', '), 120)};
}

export function parseAssistantCommand(input, today){
  const original = String(input||'').trim().slice(0,500);
  const text = foldCzech(original);
  const month = namedMonth(text, today);
  const unknown = {intent:'unknown', params:{}, text:original};
  if(!text) return unknown;
  if(/\b(smaz|odstran|vymaz|zrus zakaz|zrus protokol)\b/.test(text)) return {intent:'refused.destructive', params:{}, text:original};
  if(/^(napoveda|pomoc|co umis|co umite|jak fungujes)\b/.test(text)) return {intent:'help', params:{}, text:original};
  if(/jsem na ceste/.test(text)) return {intent:'jobs.depart', params:{query:softenName(capture(original, [/k\s+(.+)/iu])), current:/\bteto\b|\bzakaznikovi\b/.test(text)}, text:original};
  if(/\b(zacni|zacina|zapis prichod|prichod)\b/.test(text)&&/dochaz|smen|praci/.test(text)) return {intent:'attendance.arrive', params:{}, text:original};
  if(/\b(ukonci|ukoncit|odchod)\b/.test(text)&&/dochaz|smen|praci/.test(text)) return {intent:'attendance.leave', params:{}, text:original};
  if(/aktivni/.test(text)&&/dochaz|smen/.test(text)) return {intent:'attendance.active', params:{}, text:original};
  if(/\b(presun|preloz)\b/.test(text)){
    const dayName = weekdayIn(text);
    return {intent:'jobs.reschedule', params:{query:softenName(capture(original, [/zakázku\s+(?:u\s+)?(.+?)\s+na\s+/iu, /u\s+(.+?)\s+na\s+/iu])), dueDate:dayName?nextWeekday(today, dayName):(/\bzitra|zitre/.test(text)?'tomorrow':''), weekday:dayName}, text:original};
  }
  if(/\bprirad\b/.test(text)) return {intent:'jobs.assign', params:{person:softenName(capture(original, [/přiřaď\s+(\p{L}+)/iu])), query:softenName(capture(original, [/zakáz(?:ce|ku|ce)\s+(.+)/iu, /realizaci\s+(.+)/iu, /k\s+(.+)/iu]))}, text:original};
  if(/\b(oznac|nastav stav)\b/.test(text)&&/zakaz/.test(text)){
    const status = /nedokonc/.test(text)?'incomplete':/hotov|dokonc/.test(text)?'done':/probiha|v praci/.test(text)?'in_progress':/plan/.test(text)?'planned':'';
    return {intent:'jobs.status', params:{query:softenName(capture(original, [/zakázku\s+(.+?)\s+jako\s+/iu])), status}, text:original};
  }
  if(/\btyden/.test(text)&&/\b(prac|plan|zakaz|mame|navstev)\b/.test(text)&&!/vykaz|hodin|dochaz/.test(text)) return {intent:'jobs.week', params:{}, text:original};
  if(/\b(zapis|dopln)\b/.test(text)&&/zavad|poznam/.test(text)){
    const note = capture(original, [/závadu\s+(.+)/iu, /poznámku\s+(.+)/iu]);
    return {intent:'protocol.note', params:{field:/zavad/.test(text)?'defects':'notes', note, current:/\b(aktualni|teto)\b/.test(text), query:capture(original, [/zakáz(?:ce|ku|ky)\s+(.+?)(?:\s+závadu|\s+poznámku|$)/iu]).replace(/[?.!,]+$/g,'').trim()}, text:original};
  }
  if(/\bpridej\b/.test(text)&&/\b(zakaz|aktualni)\b/.test(text)&&!/protokol/.test(text)){
    const addition = parseMaterialAddition(original);
    return {intent:'materials.add', params:addition, text:original};
  }

  if(/\bmaterial/.test(text)){
    const query = materialQuery(capture(original, [/materiál(?:u|y)?\s+(.+)/iu]));
    const day = /\bdnes\b/.test(text)?'today':'tomorrow';
    if(/nakup|dokoup/.test(text)) return {intent:'materials.shopping', params:{when:day}, text:original};
    if(/pripraven|stav material|kontrola material/.test(text)) return {intent:'materials.readiness', params:{query, current:/\b(aktualni|teto)\b/.test(text)}, text:original};
    if(/\b(cena|stoji|kolik)\b/.test(text)) return {intent:'materials.price', params:{query, current:/\b(aktualni|teto)\b/.test(text)}, text:original};
    if(/\b(najdi|hledej|ukaz)\b/.test(text)&&!/\b(zitra|zitre|dnes|zakaz)\b/.test(text)) return {intent:'materials.search', params:{query}, text:original};
    return {intent:'jobs.materials', params:{when:day, query}, text:original};
  }
  if(/protokol/.test(text)){
    if(/kontrol|chybi|podpis|fotk|fotog/.test(text)) return {intent:'protocol.check', params:{query:capture(original, [/zakáz(?:ce|ku|ky)\s+(.+)/iu]).replace(/[?.!,]+$/g,'').trim(), current:/\b(aktualni|teto)\b/.test(text)}, text:original};
    return {intent:'protocol.draft', params:{query:softenName(capture(original, [/protokol(?:\s+(?:pro|k|na|ke))?\s+(.+)/iu]))}, text:original};
  }
  if(/realizac/.test(text) && /\b(hodin|strav|celkem)/.test(text)) return {intent:'jobs.realizationHours', params:{}, text:original};
  if(/cekaj/.test(text) && /servis/.test(text) && /zakaz/.test(text)) return {intent:'customers.waitingService', params:{}, text:original};
  if(/\b(hodin|dochaz|smen|vykaz|odprac)/.test(text)){
    if(/zakaz/.test(text)){
      return {intent:'jobs.hours', params:{
        person:softenName(capture(original, [/strávil\s+(\p{L}+)/iu, /odpracoval\s+(\p{L}+)/iu, /hodiny?\s+(\p{L}+)\s+na\s+/iu])),
        query:softenName(capture(original, [/zakáz(?:ce|ku|ka|ky)\s+(.+)/iu])),
        current:/\bteto\b/.test(text)
      }, text:original};
    }
    const person = /\b(jsem|jsme)\b/.test(text) ? '' : softenName(capture(original, [/odpracoval\s+(.+?)(?:\s+v\s+|\s+za\s+|$)/iu, /hodiny?\s+(.+?)(?:\s+v\s+|\s+za\s+|$)/iu]));
    const self = !person && /\b(jsem|me|moje|muj)\b/.test(text);
    const period = month?'month':/\btydn/.test(text)?'week':/\bdnes\b/.test(text)?'today':'month';
    return {intent:/vykaz/.test(text)?'attendance.report':'attendance.hours', params:{person, self, period, month}, text:original};
  }
  if(/nedokonc/.test(text)) return {intent:'jobs.incomplete', params:{}, text:original};
  if(/histori/.test(text)&&/zakazk/.test(text)) return {intent:'jobs.history', params:{query:softenName(capture(original, [/zakáz(?:ky|ku|ka|ce)\s+(.+)/iu]))}, text:original};
  if(/\b(tarif|predplat)/.test(text)) return {intent:'customers.tariffs', params:{query:softenName(capture(original, [/(?:zákazníka|zákazník)\s+(.+)/iu]))}, text:original};
  if(/planovan/.test(text)&&/servis/.test(text)) return {intent:'jobs.plannedServices', params:{}, text:original};
  if(/\b(pridej|zaloz|vytvor|novy)\b/.test(text) && /\bzakaznik/.test(text) && !/\bzakazk/.test(text)){
    return {intent:'customers.create', params:parseCustomerDraft(original), text:original};
  }
  if(/\b(zakaznik|kontakt|servisni histori)/.test(text)){
    const query = softenName(capture(original, [/(?:zákazníka|zákazník|kontakt na|kontakt)\s+(.+)/iu]));
    const intent = /histori/.test(text)?'customers.history':/kontakt/.test(text)?'customers.contact':'customers.search';
    return {intent, params:{query}, text:original};
  }
  if(planWork(original, today)) return {intent:'jobs.plan', params:{text:original}, text:original};
  if(/\b(vytvor|zaloz|nova) zakazk/.test(text)){
    const body = capture(original, [/zakázku\s+(.+)/iu]);
    const customer = softenName(clipField(capture(original, [/\bu\s+zákazníka\s+(\p{L}+)/iu, /\bpro\s+zákazníka\s+(\p{L}+)/iu, /\bu\s+(\p{L}+)/iu, /\bpro\s+(\p{L}+)/iu]), 80));
    const title = body
      .replace(/\s+u\s+zákazníka\s+\p{L}+/iu, '')
      .replace(/\s+pro\s+zákazníka\s+\p{L}+/iu, '')
      .replace(/\s+u\s+\p{L}+/iu, '')
      .replace(/\s+pro\s+\p{L}+/iu, '')
      .replace(/\s+na\s+(zítra|zítřek|zítřejšek|dnes|pondělí|úterý|středu|čtvrtek|pátek|sobotu|neděli)\b/iu, '')
      .replace(/[?.!,]+$/g, '')
      .trim()
      .slice(0, 120) || 'Nová zakázka';
    const dayName = weekdayIn(text);
    return {intent:'jobs.create', params:{title, customer, when:dayName?'':(/\bzitra|zitre/.test(text)?'tomorrow':'today'), dueDate:dayName?nextWeekday(today, dayName):''}, text:original};
  }
  if(/\bzitra\b|\bzitrek\b|\bzitrej/.test(text)) return {intent:'jobs.tomorrow', params:{}, text:original};
  if(/budouc|co nas ceka|nadchaz/.test(text)) return {intent:'jobs.upcoming', params:{}, text:original};
  if(/\bdnes\b|dnesni|co mame za prac/.test(text)) return {intent:'jobs.today', params:{}, text:original};
  if(/zakaz/.test(text)) return {intent:'jobs.search', params:{query:softenName(capture(original, [/zakáz(?:ku|ky|ka|ce)?\s+(.+)/iu]))}, text:original};
  return unknown;
}

export function contextualCommand(command, context){
  if(context?.plan){
    const revised = revisePlan(context.plan, command?.text||'');
    if(revised) return {...command, intent:'jobs.plan', params:{text:command?.text||'', base:context.plan}};
  }
  const name = String(context?.customerName||'').trim().slice(0,160);
  if(!command||!name) return command;
  const text = foldCzech(command.text||'');
  const about = /\b(jeho|jeji|jejich|tam|mu|ji|teho|tohoto)\b/.test(text);
  if(/historie navstev|naposledy|naposled/.test(text)) return {...command, intent:'customers.history', params:{query:name}};
  if(command.intent==='jobs.search' && (about || !command.params?.query)) return {...command, params:{...command.params, query:name}};
  if(about && /hodin|odprac|strav/.test(text)) return {...command, intent:'jobs.hours', params:{query:name, person:'', current:false}};
  if(about && /\b(vytvor|zaloz)\b/.test(text) && /zakazk/.test(text)){
    const title = command.params?.title && foldCzech(command.params.title)!=='nova zakazka' ? command.params.title : 'Servis';
    return {...command, intent:'jobs.create', params:{title, customer:name, when:command.params?.when||'today', dueDate:command.params?.dueDate||''}};
  }
  return command;
}
