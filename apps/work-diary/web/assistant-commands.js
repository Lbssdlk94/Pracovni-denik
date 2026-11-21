// Rule-based Czech commands. No model, no network. The same function is used
// by the worker and by tests. Later local or cloud models may only replace
// this parser; they must still call the existing authorized actions.

export const ASSISTANT_MODES = [
  {id:'basic', label:'Základní asistent', available:true, kind:'rules', detail:'Příkazy podle pravidel nad stávajícími daty. Bez AI a bez dalšího předplatného.'},
  {id:'local', label:'V zařízení', available:false, kind:'local', detail:'Nedostupné. Model se nestahuje. Ministral 3B, Qwen ani Apple Foundation Models se v této verzi nezapínají.'},
  {id:'cloud', label:'Cloud', available:false, kind:'cloud', detail:'Nedostupné. Cloudový poskytovatel není zapojený a placené API se nevolá.'}
];

// Future runtimes. None of these download a model or call a paid API.
export const ASSISTANT_PROVIDERS = [
  {id:'basic', label:'Základní', available:true, kind:'rules'},
  {id:'ministral-3b', label:'Ministral 3B', available:false, kind:'local'},
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

export function foldCzech(value){
  return String(value||'').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
}

export function assistantSuggestions(){
  return [
    'Co máme dnes za práci?',
    'Ukaž nedokončené zakázky.',
    'Najdi zákazníka Nováka.',
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

export function parseAssistantCommand(input, today){
  const original = String(input||'').trim().slice(0,500);
  const text = foldCzech(original);
  const month = namedMonth(text, today);
  const unknown = {intent:'unknown', params:{}, text:original};
  if(!text) return unknown;
  if(/\b(smaz|odstran|vymaz|zrus zakaz|zrus protokol)\b/.test(text)) return {intent:'refused.destructive', params:{}, text:original};
  if(/^(napoveda|pomoc|co umis|co umite|jak fungujes)\b/.test(text)) return {intent:'help', params:{}, text:original};

  if(/\bmaterial/.test(text)){
    const query = materialQuery(capture(original, [/materiál(?:u|y)?\s+(.+)/iu]));
    const day = /\bdnes\b/.test(text)?'today':'tomorrow';
    if(/\b(najdi|hledej|ukaz)\b/.test(text)&&!/\b(zitra|zitre|dnes|zakaz)\b/.test(text)) return {intent:'materials.search', params:{query}, text:original};
    return {intent:'jobs.materials', params:{when:day, query}, text:original};
  }
  if(/protokol/.test(text)){
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
  if(/\b(zakaznik|kontakt|servisni histori)/.test(text)){
    const query = softenName(capture(original, [/(?:zákazníka|zákazník|kontakt na|kontakt)\s+(.+)/iu]));
    const intent = /histori/.test(text)?'customers.history':/kontakt/.test(text)?'customers.contact':'customers.search';
    return {intent, params:{query}, text:original};
  }
  if(/\b(vytvor|zaloz|nova) zakaz/.test(text)){
    const title = capture(original, [/zakázku\s+(.+)/iu])||'Nová zakázka';
    return {intent:'jobs.create', params:{title, when:/\bzitra|zitre/.test(text)?'tomorrow':'today'}, text:original};
  }
  if(/\bzitra\b|\bzitrek\b|\bzitrej/.test(text)) return {intent:'jobs.tomorrow', params:{}, text:original};
  if(/budouc|co nas ceka|nadchaz/.test(text)) return {intent:'jobs.upcoming', params:{}, text:original};
  if(/\bdnes\b|dnesni|co mame za prac/.test(text)) return {intent:'jobs.today', params:{}, text:original};
  if(/zakaz/.test(text)) return {intent:'jobs.search', params:{query:softenName(capture(original, [/zakáz(?:ku|ky|ka|ce)?\s+(.+)/iu]))}, text:original};
  return unknown;
}
