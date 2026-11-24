// Rule-based Czech commands. No model, no network. The same function is used
import {planWork, revisePlan} from './job-plan.js';
import {understandUtterance} from './assistant-intent.js';
import {parseWorkQuestion} from './job-selection.js';
// by the worker and by tests. Later local or cloud models may only replace
// this parser; they must still call the existing authorized actions.

export const ASSISTANT_MODES = [
  {id:'basic', label:'Základní asistent', available:true, kind:'rules', detail:'Příkazy podle pravidel nad stávajícími daty. Bez AI a bez dalšího předplatného.'},
  {id:'local', label:'Ministral 3B', available:true, kind:'local', detail:'Na počítači se Ministral 3B stáhne do prohlížeče, asi 2,2 GB. Na mobilu je jen v aplikaci. Na server se model neposílá. Firemní údaje dál bere stávající asistent a zápis čeká na potvrzení.'},
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

const WEEKDAY_FORMS = [
  ['nedele', ['nedele','nedeli']],
  ['pondeli', ['pondeli','pondelka','pondelku']],
  ['utery', ['utery','uterku','uterek']],
  ['streda', ['streda','stredu','strede','stredy']],
  ['ctvrtek', ['ctvrtek','ctvrtku','ctvrtka']],
  ['patek', ['patek','patku','patka']],
  ['sobota', ['sobota','sobotu','sobote','soboty']]
];

function shiftIso(today, days){
  const date = new Date(today+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
export function weekdayMention(text){
  for(const [name, forms] of WEEKDAY_FORMS) if(forms.some(form=>text.includes(form))) return name;
  return '';
}
export function weekSpan(today, which){
  const day = new Date(today+'T12:00:00Z').getUTCDay()||7;
  const start = shiftIso(today, 1-day+(which==='last'?-7:which==='next'?7:0));
  return {start, end:shiftIso(start, 6)};
}
export function weekdayDate(today, name, which){
  const target = WEEKDAYS.indexOf(name);
  if(target<0) return '';
  const current = new Date(today+'T12:00:00Z').getUTCDay();
  if(which==='last'){
    let delta = (current-target+7)%7;
    if(delta===0) delta = 7;
    return shiftIso(today, -delta);
  }
  let delta = (target-current+7)%7;
  if(which==='next'&&delta===0) delta = 7;
  return shiftIso(today, delta);
}
export function jobSearchParams(original, text, today){
  const mine = /\b(me|moje|moji|sve|svuj|svoje)\b/.test(text);
  const dayName = weekdayMention(text);
  const week = /tyd(?:en|n)/.test(text);
  const which = /minul/.test(text)?'last':/prist/.test(text)?'next':'this';
  const person = softenName(capture(original, [/\bpro\s+(\p{L}+)/iu]));
  const span = week?weekSpan(today, which):null;
  const dueDate = !week&&dayName?weekdayDate(today, dayName, which):'';
  let query = '';
  if(!span&&!dueDate&&!person&&!mine){
    query = softenName(capture(original, [/zakáz(?:ku|ky|ka|ce)?\s+(.+)/iu])).replace(/^(na|za|pro|u)\s+/i,'').trim();
  }
  return {query, mine, person, dueDate, from:span?.start||'', to:span?.end||''};
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
    'Vytvoř pracovní výkaz za tento měsíc.',
    'Jedu na další zakázku.',
    'Jedu dál.',
    'Vyjíždím na další práci.',
    'Jedu k dalšímu zákazníkovi.',
    'Zahaj práci.',
    'Ukonči práci.',
    'Naviguj tam.',
    'Zavolej Novákovi.',
    'Co ještě nemá termín?',
    'Dej Nováka na čtvrtek.',
    'Co má dnes Marek?',
    'Máme nové poptávky?',
    'Kdo čeká na cenovou nabídku?',
    'Shrň poslední poptávku.',
    'Převeď tuto poptávku na zakázku.'
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

const MOVE_AT = /\b(jedu|jedes|jede|jedem|jedeme|jedou|vyjizd\w*|vyrazim|vyrazime|vyrazit|vyrazte|odjizd\w*|presouvam\w*|presouvame|presouva|jdu|pokracuj\w*|pokracujeme|pokracuju)\b/;
const MOTION_RE = /\b(jedu|jedes|jede|jedem|jedeme|jedou|vyjizd\w*|vyrazim|vyrazime|vyrazit|vyrazte|odjizd\w*|presouvam\w*|presouvame|presouva)\b/;
const GENERIC_PLACE = /^(zakaz\w*|prac\w*|tam|to|tohle|tuhle|tomu|tomuto|misto|adres\w*|vyjezd\w*|navstev\w*|cestu|cesta|ceste|dals\w*|dal|dale|nej|servis\w*|realiz\w*|domu|doma|dnes|zitra|tady|sem|tom|ni)$/;
const PERSON_STOP = new Set(['dnes','dneska','zitra','zitrejsek','praci','prace','zakazku','zakazka','zakazky','navstevu','navstevy','ona','tym','vsichni','nekdo','tom','tam','servis','realizaci','tady','tuhle','ten','muj','moje','moji','sve','svoji','neco','vyjezd','plan','termin','praci','interval','intervalu']);

function leavingNext(text){
  if(/\bdals\w*\b|\bdale\b/.test(text)) return true;
  const motionAt = text.search(MOVE_AT);
  const further = text.search(/\bdal\b/);
  return motionAt>=0 && further>motionAt;
}
function isMotion(text){
  return MOTION_RE.test(text) || (/\b(jdu|pokracuj\w*|pokracujeme|pokracuju)\b/.test(text) && leavingNext(text));
}
function travelName(original){
  const match = String(original||'').match(/\b(?:k|ke|na|do|za)\s+(?:pana|paní|pani|panu|pane\s+)?(\p{L}+)/iu);
  if(!match) return '';
  const folded = foldCzech(match[1]);
  if(!folded || folded.length<3 || GENERIC_PLACE.test(folded) || weekdayMention(folded)) return '';
  return softenName(match[1]);
}
function originalToken(original, folded){
  const words = String(original||'').match(/\p{L}+/gu)||[];
  return words.find(word=>foldCzech(word)===folded)||'';
}
function departPhrase(original, text){
  const onRoad = /jsem na ceste/.test(text);
  const motion = isMotion(text);
  if(!onRoad && !motion) return null;
  if(/\b(kam|kde|jaka|jake|jaky|kolik|hodin|odprac|vykaz|dochaz)\b/.test(text)) return null;
  const name = travelName(original);
  const next = leavingNext(text) && !name;
  if(!onRoad && !next && !name) return null;
  if(onRoad && !next && !name){
    return {intent:'jobs.depart', params:{query:softenName(capture(original, [/k\s+(.+)/iu])), current:/\bteto\b|\btuhle\b|\baktualni\b|\bzakaznikovi\b/.test(text)}, text:original};
  }
  if(next) return {intent:'jobs.depart', params:{query:'', next:true}, text:original};
  return {intent:'jobs.depart', params:{query:name, current:false}, text:original};
}
function workTarget(original){
  const named = softenName(capture(original, [/\bu\s+(?:pana|paní|pani|panu|pane\s+)?(\p{L}+)/iu, /zakáz(?:ce|ku|ky)\s+(?:u\s+)?(\p{L}+)/iu]));
  const folded = foldCzech(named);
  if(!folded || GENERIC_PLACE.test(folded) || /^(teto|tuhle|aktualni|tom|to)$/.test(folded)) return {query:'', current:true};
  return {query:named, current:false};
}
function workPhrase(original, text){
  if(/\b(dochaz\w*|smen\w*|prichod\w*|odchod\w*|hodin\w*|odprac\w*|vykaz\w*|kolik|protokol)\b/.test(text)) return null;
  if(/prace je hotov|zakazk\w*\s+(mame\s+)?(hotov|dokonc)|mame hotovo|je dokoncena/.test(text)) return null;
  const closesJob = /\b(ukonci\w*|ukoncit)\b/.test(text) && /\bzakazk\w*\b/.test(text) && !/\bprac\w*\b/.test(text);
  if(closesJob) return null;
  const stop = (/\b(ukonci\w*|ukoncit)\b/.test(text) && /\b(prac\w*|interval\w*)\b/.test(text))
    || (/\bkoncim s\b/.test(text) && /\bprac/.test(text))
    || (/\bprestav\w*/.test(text) && /\bprac/.test(text))
    || (/\bzavri\w*/.test(text) && /\binterval/.test(text))
    || /\bkoncim prac/.test(text);
  const start = !stop && (
    (/\bzahaj\w*\b/.test(text) && /\b(prac\w*|mak\w*)\b/.test(text))
    || (/\b(zacni|zacnem|zacinat|zaciname|zacinam)\b/.test(text) && /\b(prac\w*|mak\w*)\b/.test(text))
    || /^(zacinam|zaciname|zahajuji|zahajime)$/.test(text)
    || (/\bpoust\w*\b/.test(text) && /\bse\b/.test(text) && /\bdo\b/.test(text))
    || (/\bjdu\b/.test(text) && /\b(delat|pracovat|makat)\b/.test(text))
    || /\bberu se\b/.test(text)
    || (/\bspoust\w*\b/.test(text) && /\bprac/.test(text))
  );
  if(!stop && !start) return null;
  return {intent:'jobs.work', params:{action:stop?'stop':'start', ...workTarget(original)}, text:original};
}
function navigationPhrase(original, text){
  if(!/\b(navig\w*|otevri mapu|ukaz cest\w*|ukaz adres\w*|otevri cestu|spust navig\w*)\b/.test(text)) return null;
  const name = travelName(original);
  return {intent:'navigation.address', params:{query:name, current:!name}, text:original};
}
function callPhrase(original, text){
  if(!/\b(zavolej\w*|zavolat|vytoc\w*|brnk\w*|volej(?!bal)\w*)\b/.test(text)) return null;
  if(/\bnezavol\w*\b/.test(text)) return null;
  const raw = capture(original, [/(?:zavolej(?:te)?|zavolat|vytoč(?:te)?|volej(?:te)?|brnkni(?:te)?|brnkněte)\s+(?:na\s+|k\s+|číslo\s+|cislo\s+)?(.+)/iu]);
  const folded = foldCzech(raw).replace(/^(pana|pani|panu|pane)\s+/,'');
  const generic = !folded || /^(tam|to|mu|ji|jemu|ho|sem|tady|cislo|cislem|telefon|telefonu|zakaznikovi|zakaznika|zakaznik)$/.test(folded);
  return {intent:'customers.contact', params:{query:generic?'':softenName(raw.replace(/^(pana|paní|pani|panu|pane)\s+/i,''))}, text:original};
}
function unplannedPhrase(original, text, kinds){
  if(!/\b(termin\w*|naplan\w*)\b/.test(text)) return null;
  if(!/\b(nema\w*|nemaj\w*|bez|ceka\w*|neni|nejsou|jeste|ktere|kdo|co|uka\w*|najdi)\b/.test(text) && !/bez termin/.test(text) && !/nenaplan/.test(text)) return null;
  if(/\b(hodin|odprac|vykaz|kolik)\b/.test(text)) return null;
  const work = parseWorkQuestion(original, kinds);
  const legacyService = work?.kind==='service' && /bez termin/.test(text);
  if(work?.kind && !legacyService) return null;
  const type = /\bservis\w*\b/.test(text)?'service':/\brealizac\w*\b/.test(text)?'installation':/\bzamer\w*\b/.test(text)?'survey':'';
  return {intent:'jobs.unplanned', params:{type}, text:original};
}
function personPhrase(original, text){
  if(/\b(hodin|odprac|vykaz|dochaz|kolik|mame|mate|mas)\b/.test(text)) return null;
  const match = text.match(/\b(?:co ma|co dela|kde je|kde bude)\b\s+(.+)/);
  if(!match) return null;
  const words = match[1].split(' ').filter(word=>word.length>=3 && !PERSON_STOP.has(word) && !weekdayMention(word));
  const folded = words[0]||'';
  if(!folded) return null;
  const person = softenName(originalToken(original, folded)||folded);
  if(!person) return null;
  return {intent:'jobs.personDay', params:{person, when:/\bzitra|zitre/.test(text)?'tomorrow':'today'}, text:original};
}
function reschedulePhrase(original, text, today){
  const verb = /\b(presun\w*|preloz\w*|dej|dejte|dejme|hod|hodim|hodime|hodte|posun\w*|naplanuj\w*|naplanovat)\b/.test(text);
  const dayName = weekdayMention(text);
  const relative = /\bzitra|zitre/.test(text)?'tomorrow':(/\bdnes\b/.test(text)?today:'');
  if(!verb || (!dayName && !relative) || planWork(original, today)) return null;
  let query = softenName(capture(original, [
    /zakázku\s+(?:u\s+)?(.+?)\s+na\s+/iu,
    /u\s+(.+?)\s+na\s+/iu,
    /(?:přesuň(?:te)?|přelož(?:te)?|dej(?:te|me)?|hoď(?:te)?|hodím|hodíme|posuň(?:te)?|posunout|naplánuj(?:te|me)?|naplánovat)\s+(?:zakázku\s+)?(?:u\s+)?(.+?)\s+na\s+/iu
  ]));
  const foldedQuery = foldCzech(query);
  if(!query || /^(to|tam|ji|ho|tu|tuhle|tuto|toto|zakazku|zakazka|termin|terminu)$/.test(foldedQuery)) query = '';
  return {intent:'jobs.reschedule', params:{query, dueDate:dayName?nextWeekday(today, dayName):relative, weekday:dayName, current:!query}, text:original};
}
function inquiryPhrase(original, text){
  const reply = /odpoved/.test(text) && /zakaznik/.test(text);
  const missing = /zjistit/.test(text) && /zakaznik/.test(text);
  const inquiry = /poptav/.test(text);
  const quote = /nabid/.test(text) && /cek|rozhodnut|odesl|priprav/.test(text);
  const uncalled = /\bnezavolali\b|\bnezavolano\b|jeste nezavol/.test(text);
  const countNew = /\bkolik je novych\b/.test(text) && !/zakaz|hodin|dochaz|odprac|material|servis|navstev/.test(text);
  if(!inquiry && !quote && !uncalled && !reply && !missing && !countNew) return null;
  if(/dochaz|smen|hodin|odprac|vykaz/.test(text)) return null;
  if(!inquiry && /ceka/.test(text) && /servis/.test(text) && /zakaz/.test(text)) return null;
  const category = /oboji/.test(text)?'both':(/zavlah/.test(text) && /garden|zahrad/.test(text)?'both':(/zavlah/.test(text)?'irrigation':(/garden|zahrad/.test(text)?'garden':'')));
  const number = (original.match(/P-\d{4}-\d{4}/i)||[])[0]||'';
  const rawName = softenName(capture(original, [/poptávk\p{L}*\s+(?:od\s+|na\s+|pro\s+)?(\p{L}[\p{L}'-]{2,})/iu]));
  const named = /^(zavlah\w*|garden\w*|zahrad\w*|oboji|nov\w*|servis\w*|realiz\w*|posledn\w*|tuto|tu)$/.test(foldCzech(rawName))?'':rawName;
  const query = number || (/posledn|tuto|tohoto|tento/.test(text)?'':named);
  if(inquiry && /\b(preved|prevest|prevest)\b|na zakazku/.test(text) && /poptav/.test(text)) return {intent:'inquiries.convert', params:{query}, text:original};
  if(missing) return {intent:'inquiries.detail', params:{mode:'missing', query}, text:original};
  if(reply) return {intent:'inquiries.detail', params:{mode:'reply', query}, text:original};
  if(inquiry && /\b(shrn|shrnut|posledn)\b/.test(text)) return {intent:'inquiries.detail', params:{mode:'summary', query}, text:original};
  if(inquiry && /\b(oznac|nastav|prepni|kontaktovan|prohlidk|zamitn|archivuj|prijmi)\b/.test(text)){
    const status = /archiv/.test(text)?'archived':/zamit/.test(text)?'rejected':/prijat|prijmi/.test(text)?'accepted':/prohlid/.test(text)?'visit_set':/odeslan/.test(text)?'quote_sent':/rozhodnut/.test(text)?'awaiting':/nabid/.test(text)?'quote_prep':'contacted';
    return {intent:'inquiries.status', params:{query, status}, text:original};
  }
  if(countNew || (inquiry && /\b(kolik|mame|mate|nejak)\b/.test(text) && !/\b(ukaz|otevri|kdo|kter)\b/.test(text))) return {intent:'inquiries.count', params:{category}, text:original};
  const statuses = quote?['quote_prep','quote_sent','awaiting']:null;
  const status = uncalled || (inquiry && /\bnov/.test(text))?'new':'';
  return {intent:'inquiries.open', params:{category, status, statuses, query:uncalled?'':query}, text:original};
}

export function parseCustomerDraft(original){
  const phone = clipField((original.match(/(?:telefon|tel\.?)\s*(\+?[0-9][0-9 ()\-./]{2,40})/iu)||[])[1], 50);
  const email = clipField((original.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/u)||[])[0], 254);
  const addressRaw = clipField(capture(original, [/adres[aeu]?\s+(.+?)(?=\s+telefon|\s+tel\.|\s+e-?mail|$)/iu]), 500);
  const parts = addressRaw.split(/\s*,\s*/).filter(Boolean);
  const name = softenName(clipField(capture(original, [/(?:zákazníka|zákazník)\s+(.+?)(?=\s*,|\s+telefon|\s+tel\.|\s+e-?mail|\s+adres|$)/iu]), 160));
  return {name, phone, email, address:parts[0]||'', city:clipField(parts.slice(1).join(', '), 120)};
}

export function parseAssistantCommand(input, today, kinds){
  const original = String(input||'').trim().slice(0,500);
  const text = foldCzech(original);
  const month = namedMonth(text, today);
  const unknown = {intent:'unknown', params:{}, text:original};
  if(!text) return unknown;
  const dictionary = parseDictionaryCommand(original);
  if(dictionary) return {intent:'dictionary.add', params:dictionary, text:original};
  if(parseDictionaryList(original)) return {intent:'dictionary.list', params:{}, text:original};
  if(/\b(smaz|odstran|vymaz|zrus zakaz|zrus protokol)\b/.test(text)) return {intent:'refused.destructive', params:{}, text:original};
  if(/^(napoveda|pomoc|co umis|co umite|jak fungujes)\b/.test(text)) return {intent:'help', params:{}, text:original};
  const inquiry = inquiryPhrase(original, text);
  if(inquiry) return inquiry;
  const depart = departPhrase(original, text);
  if(depart) return depart;
  const work = workPhrase(original, text);
  if(work) return work;
  const navigation = navigationPhrase(original, text);
  if(navigation) return navigation;
  const call = callPhrase(original, text);
  if(call) return call;
  const unplanned = unplannedPhrase(original, text, kinds);
  if(unplanned) return unplanned;
  const person = personPhrase(original, text);
  if(person) return person;
  if(/\b(zacni|zacina|zapis prichod|prichod)\b/.test(text)&&/dochaz|smen|praci/.test(text)) return {intent:'attendance.arrive', params:{}, text:original};
  if(/\b(ukonci|ukoncit|odchod)\b/.test(text)&&/dochaz|smen|praci/.test(text)) return {intent:'attendance.leave', params:{}, text:original};
  if(/aktivni/.test(text)&&/dochaz|smen/.test(text)) return {intent:'attendance.active', params:{}, text:original};
  const moved = reschedulePhrase(original, text, today);
  if(moved) return moved;
  if(/\bprirad\b/.test(text)) return {intent:'jobs.assign', params:{person:softenName(capture(original, [/přiřaď\s+(\p{L}+)/iu])), query:softenName(capture(original, [/zakáz(?:ce|ku|ce)\s+(.+)/iu, /realizaci\s+(.+)/iu, /k\s+(.+)/iu]))}, text:original};
  if(/\b(oznac|nastav stav)\b/.test(text)&&/zakaz/.test(text)){
    const status = /nedokonc/.test(text)?'incomplete':/hotov|dokonc/.test(text)?'done':/probiha|v praci/.test(text)?'in_progress':/plan/.test(text)?'planned':'';
    return {intent:'jobs.status', params:{query:softenName(capture(original, [/zakázku\s+(.+?)\s+jako\s+/iu])), status}, text:original};
  }
  if(/\btyd(?:en|n)/.test(text)&&/\b(prac|plan|zakaz|mame|navstev|najdi|ukaz|hledej)\b/.test(text)&&!/vykaz|hodin|dochaz/.test(text)){
    if(/\b(najdi|hledej|ukaz)\b/.test(text)||/minul|prist/.test(text)) return {intent:'jobs.search', params:jobSearchParams(original, text, today), text:original};
    return {intent:'jobs.week', params:{}, text:original};
  }
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
  if(/protokol/.test(text) && /\b(pripoj|pridej|uloz)\b/.test(text) && /fotk|fotog/.test(text)){
    return {intent:'protocol.photo', params:{when:/pred oprav/.test(text)?'before':/opraven|po oprav/.test(text)?'after':'latest'}, text:original};
  }
  if(/protokol/.test(text)){
    if(/kontrol|chybi|podpis|fotk|fotog/.test(text)) return {intent:'protocol.check', params:{query:capture(original, [/zakáz(?:ce|ku|ky)\s+(.+)/iu]).replace(/[?.!,]+$/g,'').trim(), current:/\b(aktualni|teto)\b/.test(text)}, text:original};
    return {intent:'protocol.draft', params:{query:softenName(capture(original, [/protokol(?:\s+(?:pro|k|na|ke))?\s+(.+)/iu]))}, text:original};
  }
  if(/kdo/.test(text) && /pracoval|delal/.test(text)) return {intent:'jobs.crew', params:{period:/\bdnes\b/.test(text)?'today':'open'}, text:original};
  if(planWork(original, today)) return {intent:'jobs.plan', params:{text:original}, text:original};
  if(/realizac/.test(text) && /\b(strav|celkem|odprac|kolik)\b/.test(text) && !/\bod\s+\d/.test(text)) return {intent:'jobs.realizationHours', params:{}, text:original};
  if(/cekaj/.test(text) && /servis/.test(text) && /zakaz/.test(text)) return {intent:'customers.waitingService', params:{}, text:original};
  const workQuestion = parseWorkQuestion(original, kinds);
  if(workQuestion) return {intent:'jobs.selection', params:workQuestion, text:original};
  if(/\b(hodin|dochaz|smen|vykaz|odprac)/.test(text)){
    if(/zakaz/.test(text)){
      return {intent:'jobs.hours', params:{
        person:softenName(capture(original, [/strávil\s+(\p{L}+)/iu, /odpracoval\s+(\p{L}+)/iu, /hodiny?\s+(\p{L}+)\s+na\s+/iu])),
        query:softenName(capture(original, [/zakáz(?:ce|ku|ka|ky)\s+(.+)/iu])),
        current:/\bteto\b/.test(text) || (/\bna zakazce\b/.test(text) && !capture(original, [/zakáz(?:ce|ku|ka|ky)\s+(\p{L}[\p{L}\s-]{1,80})/iu]))
      }, text:original};
    }
    const person = /\b(jsem|jsme)\b/.test(text) ? '' : softenName(capture(original, [/odpracoval\s+(.+?)(?:\s+v\s+|\s+za\s+|$)/iu, /hodiny?\s+(.+?)(?:\s+v\s+|\s+za\s+|$)/iu]));
    const self = !person && /\b(jsem|me|moje|muj)\b/.test(text);
    const period = month?'month':/\btyd(?:en|n)/.test(text)?'week':/\bdnes\b/.test(text)?'today':'month';
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
  if(/\b(vytvor|zaloz|nova) zakazk/.test(text)){
    const body = capture(original, [/zakázku\s+(.+)/iu]);
    const customer = softenName(clipField(capture(original, [/\bu\s+zákazníka\s+(\p{L}+)/iu, /\bpro\s+zákazníka\s+(\p{L}+)/iu, /\bu\s+(?:pana|paní|pani|panu|pane)\s+(\p{L}+)/iu, /\bpro\s+(?:pana|paní|pani|panu|pane)\s+(\p{L}+)/iu, /\bu\s+(\p{L}+)/iu, /\bpro\s+(\p{L}+)/iu]), 80));
    const title = body
      .replace(/\s+u\s+zákazníka\s+\p{L}+/iu, '')
      .replace(/\s+pro\s+zákazníka\s+\p{L}+/iu, '')
      .replace(/\s+u\s+(?:pana|paní|pani|panu)\s+\p{L}+/iu, '')
      .replace(/\s+pro\s+(?:pana|paní|pani|panu)\s+\p{L}+/iu, '')
      .replace(/\s+u\s+\p{L}+/iu, '')
      .replace(/\s+pro\s+\p{L}+/iu, '')
      .replace(/\s+na\s+(zítra|zítřek|zítřejšek|dnes|pondělí|úterý|středu|čtvrtek|pátek|sobotu|neděli)\b/iu, '')
      .replace(/[?.!,]+$/g, '')
      .trim()
      .slice(0, 120) || 'Nová zakázka';
    const dayName = weekdayMention(text);
    return {intent:'jobs.create', params:{title, customer, when:dayName?'':(/\bzitra|zitre/.test(text)?'tomorrow':'today'), dueDate:dayName?nextWeekday(today, dayName):''}, text:original};
  }
  const done = parseJobDone(original);
  if(done) return {intent:'jobs.complete', params:{}, text:original};
  const photo = parsePhotoCommand(original);
  if(photo) return {intent:'protocol.photo', params:photo, text:original};
  const visit = parseFollowUpVisit(original, today);
  if(visit) return {intent:'jobs.followup', params:{visit}, text:original};
  const defect = parseDefectNote(original);
  if(defect) return {intent:'defects.track', params:{note:defect}, text:original};
  const day = parseRealizationDay(original, today);
  if(day) return {intent:'diary.day', params:{day}, text:original};
  const dictated = parseServiceDictation(original);
  if(dictated) return {intent:'protocol.report', params:{draft:dictated}, text:original};
  if(/\bzitra\b|\bzitrek\b|\bzitrej/.test(text)) return {intent:'jobs.tomorrow', params:{}, text:original};
  if(/budouc|co nas ceka|nadchaz/.test(text)) return {intent:'jobs.upcoming', params:{}, text:original};
  if(/\bdnes\b|dnesni|co mame za prac/.test(text)) return {intent:'jobs.today', params:{}, text:original};
  if(/zakaz/.test(text)) return {intent:'jobs.search', params:jobSearchParams(original, text, today), text:original};
  return unknown;
}

const DICTATION_ONES = {jeden:1,jedna:1,jedno:1,dva:2,dve:2,tri:3,ctyri:4,pet:5,sest:6,sedm:7,osm:8,devet:9};
const DICTATION_TEENS = {deset:10,jedenact:11,dvanact:12,trinact:13,ctrnact:14,patnact:15,sestnact:16,sedmnact:17,osmnact:18,devatenact:19};
const DICTATION_TENS = {dvacet:20,tricet:30,ctyricet:40,padesat:50,sedesat:60,sedmdesat:70,osmdesat:80,devadesat:90};
const DICTATION_UNITS = {ks:'ks',kus:'ks',kusu:'ks',kusy:'ks',metr:'m',metru:'m',metry:'m',m:'m',bm:'m',litr:'l',litru:'l',litry:'l',l:'l',kg:'kg',kilogram:'kg',kilogramu:'kg',bal:'bal',baleni:'bal',pytel:'pytel',pytle:'pytel',pytlu:'pytel',pytly:'pytel'};
const DICTATION_LABELS = {ventil:'Ventily', postrkovac:'Postřikovače', potrubi:'Potrubí', koleno:'Kolena', tkus:'T-kusy', tryska:'Trysky'};
const DICTATION_COUNT = ['','jeden','dva','tři','čtyři','pět','šest','sedm','osm','devět','deset','jedenáct','dvanáct','třináct','čtrnáct','patnáct','šestnáct','sedmnáct','osmnáct','devatenáct','dvacet'];
const CANONICAL_WORK = 'V rámci servisního zásahu byla provedena výměna čtyř ventilů a dvou postřikovačů závlahového systému. Dále bylo opraveno poškozené potrubí a upraveno nastavení třetí závlahové sekce.';

function dictationCountWord(value){
  const number = Number(value);
  if(number===25) return 'dvacet pět';
  if(number===32) return 'třicet dva';
  if(Number.isInteger(number)&&number>0&&number<DICTATION_COUNT.length) return DICTATION_COUNT[number];
  return String(value);
}
function dictationPlural(key, number){
  const forms = {
    ventil:['ventil','ventily','ventilů'],
    postrkovac:['postřikovač','postřikovače','postřikovačů'],
    koleno:['koleno','kolena','kolen'],
    tkus:['T-kus','T-kusy','T-kusů'],
    tryska:['trysku','trysky','trysek']
  };
  const form = forms[key];
  if(!form) return DICTATION_LABELS[key]||key;
  if(number===1) return form[0];
  if(number>=2&&number<=4) return form[1];
  return form[2];
}
function protocolTokens(value){
  const expanded = String(value||'').replace(/(\p{L}+)(?=\d)/gu,'$1 ').replace(/(\d+)(?=\p{L})/gu,'$1 ');
  return [...new Set(materialWords(expanded).flatMap(word=>{
    if(word==='pe'||word==='pb'||word==='pvc') return [word];
    if(/^\d+$/.test(word)) return [word];
    let stem = materialStem(word);
    if(stem==='koleno') stem = 'kolen';
    return stem.length>=3?[stem]:[];
  }))];
}
function normalizeDictationSlang(text){
  return String(text||'')
    .replace(/\btřicet\s*dvojk\p{L}*/giu, 'potrubí PE 32 mm')
    .replace(/\btřicetdvojk\p{L}*/giu, 'potrubí PE 32 mm')
    .replace(/\bdvacet\s*pětk\p{L}*/giu, 'potrubí PE 25 mm')
    .replace(/\bdvacetpětk\p{L}*/giu, 'potrubí PE 25 mm')
    .replace(/\bt[\s-]*kusy\b/giu, 'T-kusy')
    .replace(/\bt[\s-]*kusů\b/giu, 'T-kusů')
    .replace(/\bt[\s-]*kus\b/giu, 'T-kus');
}
function firstDictationNumber(words){
  for(let index=0;index<words.length;index++){
    const number = parseDictationNumber(words.slice(index));
    if(number) return number;
  }
  return null;
}
function parseDictationNumber(words){
  if(!words.length) return null;
  if(/^\d+(?:[.,]\d+)?$/.test(words[0])) return {value:Number(words[0].replace(',','.')), used:1};
  if(DICTATION_TEENS[words[0]]) return {value:DICTATION_TEENS[words[0]], used:1};
  if(DICTATION_TENS[words[0]]){
    if(DICTATION_ONES[words[1]]) return {value:DICTATION_TENS[words[0]]+DICTATION_ONES[words[1]], used:2};
    return {value:DICTATION_TENS[words[0]], used:1};
  }
  if(DICTATION_ONES[words[0]]) return {value:DICTATION_ONES[words[0]], used:1};
  if(words[0]==='sto') return {value:100, used:1};
  return null;
}
function dictationKey(name){
  const folded = foldCzech(name);
  if(/\bventil/.test(folded)) return 'ventil';
  if(/postrik/.test(folded)) return 'postrkovac';
  if(/potrub/.test(folded)) return 'potrubi';
  if(/kolen/.test(folded)) return 'koleno';
  if(/\bt kus/.test(folded)) return 'tkus';
  if(/trysk/.test(folded)) return 'tryska';
  if(/\bryh/.test(folded)) return 'ryha';
  if(/\bsekc/.test(folded)) return 'sekce';
  return '';
}
function dictationQuery(key, foldedName){
  if(key==='tkus') return 'T-kus';
  if(key==='potrubi'&&/\b32\b/.test(foldedName)) return 'potrubí PE 32 mm';
  if(key==='potrubi'&&/\b25\b/.test(foldedName)) return 'potrubí PE 25 mm';
  if(key==='potrubi') return 'potrubí';
  if(key==='ventil') return 'ventil';
  if(key==='koleno') return 'koleno';
  if(key==='postrkovac') return /rain bird/.test(foldedName)?'postřikovač Rain Bird':'postřikovač';
  if(key==='tryska') return 'tryska';
  return foldedName;
}
function dictationSection(folded){
  const names = {prvni:1,prvnim:1,druhou:2,druha:2,druhy:2,treti:3,tretim:3,ctvrtou:4,ctvrta:4,ctvrte:4,patou:5,pata:5,sestou:6};
  const words = folded.split(' ');
  for(const word of words) if(names[word]) return names[word];
  const digit = folded.match(/\b([1-9])\b/);
  return digit&&/\bsekc/.test(folded)?Number(digit[1]):0;
}
function parseDictationPiece(piece){
  const folded = foldCzech(piece);
  if(/\bsekc/.test(folded)&&!/\b(ventil|postrkov|potrub|kolen|trysk)\b/.test(folded)) return {section:dictationSection(folded)||0};
  let words = folded.split(' ').filter(word=>word && !['tam','tady','jeste'].includes(word));
  let number = parseDictationNumber(words);
  let index = 0, quantity = null;
  if(number){quantity = number.value; index = number.used;}
  else {
    const at = words.findIndex((_, cursor)=>parseDictationNumber(words.slice(cursor)));
    if(at>0){
      number = parseDictationNumber(words.slice(at));
      quantity = number.value;
      words = words.slice(0, at).concat(words.slice(at+number.used));
      index = 0;
    }
  }
  let unit = '';
  if(DICTATION_UNITS[words[index]]){unit = DICTATION_UNITS[words[index]]; index += 1;}
  const name = words.slice(index).join(' ').trim();
  if(!name) return null;
  const key = dictationKey(name);
  if(key==='sekce') return {section:dictationSection(folded)||quantity||0};
  if(key==='ryha') return {note:piece.trim()};
  if(!key){
    if(quantity!=null && name && !/^(sekce|ryha|system|systemu|praskle|praskly)$/.test(name)) return {key:'catalog', label:name, query:name, quantity, unit, generic:true};
    return {note:piece.trim()};
  }
  if(!unit) unit = key==='potrubi'?'m':'ks';
  return {key, label:DICTATION_LABELS[key], query:dictationQuery(key, name), quantity, unit, generic:!/\b(rain|\d{2}|pe)\b/.test(name)};
}
function dictationVerbKind(verb){
  const folded = foldCzech(verb);
  if(folded.startsWith('posek')) return 'mow';
  if(folded.startsWith('vertikut')) return 'scarify';
  if(folded.startsWith('hnoj')) return 'fertilize';
  if(folded.startsWith('vysad')) return 'plant';
  if(folded.startsWith('spotreb')) return 'use';
  if(folded.startsWith('dali')||folded==='dal') return 'use';
  if(folded.startsWith('vymen')) return 'replace';
  if(folded.startsWith('oprav')) return 'repair';
  if(folded.startsWith('nastav')) return 'adjust';
  if(folded.startsWith('pouz')) return 'use';
  if(folded.startsWith('poloz')) return 'lay';
  if(folded.startsWith('namont')) return 'install';
  if(folded.startsWith('zapoj')) return 'connect';
  if(folded.startsWith('vykop')) return 'dig';
  if(folded.startsWith('odzkous')) return 'test';
  if(folded.startsWith('zkontrol')) return 'check';
  return '';
}
function splitDictation(original){
  const text = normalizeDictationSlang(original);
  const re = /\b(?:jsme\s+|jsem\s+)?(vyměnili|vyměnil|opravili|opravil|nastavili|nastavil|použili|použil|spotřebovali|spotřeboval|dali|dal|položili|položil|namontovali|namontoval|zapojili|zapojil|vykopali|vykopal|odzkoušeli|odzkoušel|zkontrolovali|zkontroloval|posekali|posekal|vertikutovali|vertikutoval|hnojili|hnojil|vysadili|vysadil)\b/giu;
  const marks = [];
  let match;
  while((match = re.exec(text))) marks.push({start:match.index, end:match.index+match[0].length, kind:dictationVerbKind(match[1])});
  return marks.map((mark, index)=>{
    let body = text.slice(mark.end, marks[index+1]?marks[index+1].start:text.length);
    body = body.replace(/^(?:\s|,)*(?:jsme|jsem)\s+/iu,'').replace(/^[\s,]+/u,'').replace(/(?:[\s,]*\ba)?[\s,?.!]*$/iu,'').trim();
    const pieces = body.split(/\s*,\s*|\s+a\s+/u).map(part=>part.trim()).filter(Boolean).map(parseDictationPiece).filter(Boolean);
    return {kind:mark.kind, pieces, cracked:/prask/.test(foldCzech(body))};
  });
}
function dictationPhrase(item){
  if(item.key==='catalog'){
    const count = item.quantity==null?'':dictationCountWord(item.quantity);
    const unit = item.unit==='m'?' metrů':item.unit==='pytel'?' pytlů':item.unit?` ${item.unit}`:'';
    return `${count}${unit} ${item.label}`.replace(/\s+/g,' ').trim();
  }
  if(item.quantity==null) return item.key==='potrubi'?'potrubí':'';
  const word = dictationCountWord(item.quantity);
  if(item.key==='potrubi'&&/\b32\b/.test(item.query||'')) return `${word} metrů potrubí o průměru 32 mm`;
  if(item.key==='potrubi'&&/\b25\b/.test(item.query||'')) return `${word} metrů potrubí o průměru 25 mm`;
  if(item.key==='potrubi') return `${word} metrů potrubí`;
  if(item.key==='postrkovac'&&/rain bird/i.test(item.query||'')) return `${word} ${dictationPlural(item.key, item.quantity)} Rain Bird`;
  return `${word} ${dictationPlural(item.key, item.quantity)}`;
}
function joinDictation(parts){
  const clean = parts.filter(Boolean);
  if(clean.length<2) return clean[0]||'';
  return `${clean.slice(0,-1).join(', ')} a ${clean.at(-1)}`;
}
const DICTATION_ORDINAL = {1:'první',2:'druhé',3:'třetí',4:'čtvrté',5:'páté',6:'šesté'};
function renderDictation(actions){
  const replace = actions.find(action=>action.kind==='replace');
  const repair = actions.find(action=>action.kind==='repair');
  const adjust = actions.find(action=>action.kind==='adjust');
  const valves = replace?.pieces.find(piece=>piece.key==='ventil');
  const heads = replace?.pieces.find(piece=>piece.key==='postrkovac');
  const pipe = repair?.pieces.find(piece=>piece.key==='potrubi');
  const section = adjust?.pieces.find(piece=>piece.section);
  if(actions.length===3&&replace&&repair&&adjust&&valves?.quantity===4&&heads?.quantity===2&&replace.pieces.filter(piece=>piece.key).length===2&&pipe&&pipe.quantity==null&&section?.section===3) return CANONICAL_WORK;
  const sentences = [];
  for(const action of actions){
    const items = action.pieces.filter(piece=>piece.key);
    const sectionPiece = action.pieces.find(piece=>piece.section);
    const notes = action.pieces.filter(piece=>piece.note).map(piece=>piece.note);
    const list = joinDictation(items.map(dictationPhrase));
    if(action.kind==='replace'&&list) sentences.push(`byla provedena výměna ${list}`);
    else if(action.kind==='use'&&list) sentences.push(`bylo použito ${list}`);
    else if(action.kind==='install'&&list) sentences.push(`byla provedena montáž ${list}`);
    else if(action.kind==='lay'&&list) sentences.push(`bylo položeno ${list}`);
    else if(action.kind==='dig') sentences.push(`bylo vykopáno ${list||notes.join(', ')||'uvedená část'}`);
    else if(action.kind==='repair') sentences.push(`bylo opraveno ${action.cracked&&pipe?'prasklé potrubí':(list||notes.join(', ')||'uvedená část')}`);
    else if(action.kind==='adjust'&&sectionPiece?.section) sentences.push(`bylo upraveno nastavení ${DICTATION_ORDINAL[sectionPiece.section]||sectionPiece.section+'.'} sekce`);
    else if(action.kind==='check') sentences.push(`byla provedena kontrola ${list||notes.join(', ')||'uvedené části'}`);
    else if(action.kind==='test') sentences.push('bylo provedeno odzkoušení, které pracovník výslovně uvedl');
    else if(action.kind==='mow') sentences.push(`bylo posečeno ${list||notes.join(', ')||'uvedená plocha'}`);
    else if(action.kind==='scarify') sentences.push(`byla provedena vertikutace ${list||notes.join(', ')||'uvedené plochy'}`);
    else if(action.kind==='fertilize') sentences.push(`bylo provedeno hnojení ${list||notes.join(', ')||'uvedené plochy'}`);
    else if(action.kind==='plant') sentences.push(`byla provedena výsadba ${list||notes.join(', ')||'uvedených rostlin'}`);
    else if(action.kind==='connect') sentences.push(`bylo zapojeno ${list||notes.join(', ')||'uvedená část'}`);
  }
  if(!sentences.length) return '';
  const [first, ...rest] = sentences;
  return `V rámci servisního zásahu ${first}${rest.length?'. Dále '+rest.join(' a '):''}.`;
}
function rememberDictation(previous, next){
  const past = {...previous};
  delete past.history;
  return {...next, jobId:previous.jobId||next.jobId||'', history:[...(previous.history||[]), past].slice(-6)};
}
function findDictationLine(draft, folded){
  const keys = [['ventil','ventil'],['postrik','postrkovac'],['potrub','potrubi'],['kolen','koleno'],['t kus','tkus'],['trysk','tryska']];
  const hit = keys.find(([needle])=>folded.includes(needle));
  if(hit) return (draft.materials||[]).find(line=>line.key===hit[1])||null;
  const words = folded.split(' ').map(materialStem).filter(word=>word.length>3);
  const catalogs = (draft.materials||[]).filter(line=>line.key==='catalog' && words.some(word=>{
    const query = materialStem(line.query||'');
    return query && (query.includes(word)||word.includes(query));
  }));
  return catalogs.length===1?catalogs[0]:null;
}
function draftMaterial(piece){
  return {key:piece.key, label:piece.label, query:piece.query, quantity:piece.quantity, unit:piece.unit, generic:piece.generic!==false};
}
export function parseServiceDictation(original){
  const source = String(original||'').trim();
  const folded = foldCzech(source);
  if(!folded||/^(kolik|kdo|jaka|jake|jaky|jak|kdy|kde|proc|ukaz|najdi|hledej)\b/.test(folded)) return null;
  if(/\b(kolik hodin|odprac|vykaz|smaz|presun|prirad)\b/.test(folded)) return null;
  if(/\b(vytvor|zaloz|pridej)\b/.test(folded)) return null;
  const actions = splitDictation(source);
  if(!actions.length) return null;
  const materials = [];
  for(const action of actions){
    if(action.kind==='check'||action.kind==='test') continue;
    for(const piece of action.pieces){
      if(!piece.key) continue;
      const previous = materials.find(line=>line.key===piece.key&&line.query===piece.query);
      if(previous&&previous.quantity!=null&&piece.quantity!=null) previous.quantity = Math.round((previous.quantity+piece.quantity)*1000)/1000;
      else if(!previous) materials.push(draftMaterial(piece));
    }
  }
  const work = renderDictation(actions);
  if(!work||!materials.length&&!actions.some(action=>action.pieces.some(piece=>piece.section||piece.note))) return null;
  return {work, materials, asked:[], history:[]};
}
export function serviceDraftQuestions(draft){
  const required = [], optional = [];
  const asked = new Set(draft?.asked||[]);
  for(const line of draft?.materials||[]){
    if(line.quantity==null) required.push(line.unit==='m'?`Kolik metrů ${line.label.toLocaleLowerCase('cs')} bylo spotřebováno?`:`Kolik ${line.label.toLocaleLowerCase('cs')} bylo spotřebováno?`);
    else if(line.status==='choices') required.push(`„${line.label}“ sedí na víc položek katalogu: ${(line.choices||[]).map(item=>item.name).join(', ')}. Vyberte jednu, novou nezakládám.`);
    else if(line.status==='missing') required.push(`Položku „${line.label}“ v katalogu nevidím. Novou položku nezakládám.`);
    else if(line.status==='unit') required.push(`„${line.catalogName||line.label}“ má v katalogu jinou jednotku. Množství jsem nezapsal.`);
    else if(line.generic&&line.status==='matched') optional.push(line.key==='ventil'?'Jaký typ ventilů byl použit?':line.key==='postrkovac'?'Jaký model postřikovačů?':`Upřesněte typ položky ${line.label}.`);
  }
  if(!asked.has('tightness')) optional.push('Byla provedena kontrola těsnosti?');
  if(!asked.has('functional')) optional.push('Je systém plně funkční?');
  if(!asked.has('next')) optional.push('Je nutná další návštěva?');
  if(!asked.has('defects')) optional.push('Byly zjištěny další závady?');
  return {required, optional:optional.filter(item=>!asked.has(item))};
}
export function matchProtocolQuery(query, items){
  const active = (items||[]).filter(item=>item&&item.active!==false);
  const wanted = protocolTokens(query);
  if(!wanted.length) return {missing:true};
  const rows = active.map(item=>{
    const have = protocolTokens(`${item.name} ${item.sku||''}`);
    const hits = wanted.filter(token=>have.includes(token)).length;
    const extra = have.filter(token=>!wanted.includes(token)).length;
    return {item, hits, coverage:have.length?hits/have.length:0, extra};
  }).filter(row=>row.hits===wanted.length&&row.coverage>=0.5);
  if(!rows.length) return {missing:true};
  rows.sort((a,b)=>b.coverage-a.coverage||a.extra-b.extra||String(a.item.name).localeCompare(String(b.item.name),'cs'));
  if(rows.length===1 && rows[0].extra===0) return {item:rows[0].item};
  if(rows.length===1){
    const have = protocolTokens(`${rows[0].item.name} ${rows[0].item.sku||''}`);
    const sameFamily = have.every(token=>wanted.some(need=>token.includes(need)||need.includes(token)));
    if(sameFamily) return {item:rows[0].item};
  }
  const best = rows[0];
  const ties = rows.filter(row=>row.coverage===best.coverage&&row.extra===best.extra);
  if(ties.length===1&&best.extra===0) return {item:best.item};
  return {choices:rows.slice(0,6).map(row=>row.item)};
}
export function annotateProtocolMaterials(draft, items){
  const materials = (draft?.materials||[]).map(line=>{
    if(line.quantity==null) return {...line, status:'unquantified', itemId:'', itemVersion:0, choices:[]};
    const found = matchProtocolQuery(line.query, items);
    if(found.item){
      if(line.unit&&found.item.unit&&line.unit!==found.item.unit) return {...line, status:'unit', itemId:'', itemVersion:0, catalogName:found.item.name, choices:[]};
      return {...line, status:'matched', itemId:found.item.id, itemVersion:found.item.version, catalogName:found.item.name, choices:[]};
    }
    if(found.choices){
      const choices = found.choices.map(item=>({id:item.id, version:item.version, name:item.name, unit:item.unit}));
      const chosen = choices.find(item=>item.id===line.itemId);
      if(chosen&&(!line.unit||chosen.unit===line.unit)) return {...line, status:'matched', itemId:chosen.id, itemVersion:chosen.version, catalogName:chosen.name, choices};
      return {...line, status:'choices', itemId:'', itemVersion:0, choices};
    }
    return {...line, status:'missing', itemId:'', itemVersion:0, choices:[]};
  });
  return {...draft, materials};
}
function cloneDictation(draft){
  return JSON.parse(JSON.stringify(draft||{work:'', materials:[], asked:[], history:[]}));
}
export function reviseServiceDraft(draft, text){
  if(!draft||typeof draft!=='object'||!Array.isArray(draft.materials)) return null;
  const original = String(text||'').trim();
  const folded = foldCzech(original);
  if(!folded) return null;
  const optionalAnswer = folded.match(/^odpoved na (kontrolu tesnosti|funkcnost systemu|dalsi navstevu|dalsi zavady) (ano|ne|preskocit)$/);
  const shortAnswer = /^(ano|jo|ne|preskocit|preskoc)$/.test(folded)?folded:'';
  const pendingKey = {ano:'yes',jo:'yes',ne:'no',preskocit:'skip',preskoc:'skip'}[shortAnswer]&&draft.pendingQuestion?draft.pendingQuestion:'';
  const answeredKey = optionalAnswer?{ 'kontrolu tesnosti':'tightness','funkcnost systemu':'functional','dalsi navstevu':'next','dalsi zavady':'defects' }[optionalAnswer[1]] : pendingKey;
  if(answeredKey){
    const choice = optionalAnswer?{ano:'yes',ne:'no',preskocit:'skip'}[optionalAnswer[2]]:{ano:'yes',jo:'yes',ne:'no',preskocit:'skip',preskoc:'skip'}[shortAnswer];
    const next = cloneDictation(draft);
    next.asked = [...new Set([...(next.asked||[]), answeredKey])];
    next.pendingQuestion = '';
    if(choice==='yes'){
      const sentence = {tightness:'Pracovník potvrdil, že kontrola těsnosti byla provedena.', functional:'Pracovník potvrdil, že systém je plně funkční.', next:'Pracovník uvedl, že je nutná další návštěva.', defects:'Pracovník uvedl, že byly zjištěny další závady.'}[answeredKey];
      if(sentence && !next.work.includes(sentence)) next.work = `${next.work} ${sentence}`.trim();
    }
    return {draft:rememberDictation(draft, next)};
  }
  if(/\bvrat posledni\b|\bzrus posledni zmenu\b|\bvrat to zpet\b/.test(folded)){
    const history = draft.history||[];
    if(!history.length) return {draft, undo:'empty'};
    const previous = history[history.length-1];
    return {draft:{...previous, history:history.slice(0,-1)}, undo:true};
  }
  if(/\bukaz\b/.test(folded)&&/protokol|navrh|zapis/.test(folded)) return {draft, show:true};
  const next = cloneDictation(draft);
  if(/\bpridej jeste\b|\bpridej dalsi\b/.test(folded)){
    const line = findDictationLine(next, folded);
    if(!line) return null;
    const words = folded.split(' ').filter(Boolean);
    const number = firstDictationNumber(words)||{value:1};
    line.quantity = Math.round(((line.quantity||0)+number.value)*1000)/1000;
    line.itemId = '';
    return {draft:rememberDictation(draft, next)};
  }
  if(/nebyly potreba|nebyl potreba|nebylo potreba|nakonec ne|odeber|uber/.test(folded)){
    const line = findDictationLine(next, folded);
    if(!line||line.quantity==null) return null;
    const words = folded.split(' ').filter(Boolean);
    const number = firstDictationNumber(words)||{value:1};
    line.quantity = Math.max(0, Math.round((line.quantity-number.value)*1000)/1000);
    return {draft:rememberDictation(draft, next)};
  }
  if(/oprav mnozstvi|zmen mnozstvi|mnozstvi/.test(folded)&&/\bna\b/.test(folded)){
    const line = findDictationLine(next, folded);
    if(!line) return null;
    const words = folded.split(' ').filter(Boolean);
    const at = words.lastIndexOf('na');
    const number = at>=0?parseDictationNumber(words.slice(at+1)):null;
    if(!number) return null;
    line.quantity = number.value;
    const unitWord = words[at+1+number.used];
    if(DICTATION_UNITS[unitWord]) line.unit = DICTATION_UNITS[unitWord];
    line.itemId = '';
    return {draft:rememberDictation(draft, next)};
  }
  if(/\b(nakonec jen|byly to jen|bylo to jen)\b/.test(folded)){
    const words = folded.split(' ').filter(Boolean);
    const number = firstDictationNumber(words);
    if(!number) return null;
    const next = cloneDictation(draft);
    const named = findDictationLine(next, folded);
    const quantified = next.materials.filter(line=>line.quantity!=null);
    const target = named || (quantified.length===1?quantified[0]:null);
    if(!target) return {draft, clarify:`Množství ${number.value} nemá jasnou položku. Řekněte kterou, nic jsem nezměnil.`};
    target.quantity = number.value;
    target.itemId = '';
    return {draft:rememberDictation(draft, next)};
  }
  if(/\b(byly|byli|byl|bylo|jsou)\b/.test(folded)){
    const line = findDictationLine(next, folded);
    const brand = original.match(/\b(?:byly|byli|byl|bylo|jsou)\s+([^.?]{2,40})/iu);
    if(!line||!brand) return null;
    const name = brand[1].replace(/[?.!,]+$/g,'').trim();
    if(!name||/potreb|potřeba|potreba/.test(foldCzech(name))) return null;
    line.query = `${line.query} ${name}`.replace(/\s+/g,' ').trim();
    line.generic = false;
    line.itemId = '';
    return {draft:rememberDictation(draft, next)};
  }
  if(/\bpripis\b|\bdopln ze\b|\bzapis ze\b/.test(folded)){
    const sentence = /vsechny sekce/.test(folded)
      ? 'Dále byla provedena kontrola všech závlahových sekcí.'
      : `Dále: ${original.replace(/^.*?\b(?:připiš|doplň|zapiš),?\s*(že\s+)?/iu,'').replace(/[?.]+$/g,'').trim()}.`;
    if(!next.work.includes(sentence)) next.work = `${next.work} ${sentence}`.trim();
    if(/tesnost|tesn/.test(folded)) next.asked = [...new Set([...(next.asked||[]), 'tightness'])];
    if(/funkc/.test(folded)) next.asked = [...new Set([...(next.asked||[]), 'functional'])];
    if(/dalsi navstev|priste/.test(folded)) next.asked = [...new Set([...(next.asked||[]), 'next'])];
    if(/zavad/.test(folded)) next.asked = [...new Set([...(next.asked||[]), 'defects'])];
    return {draft:rememberDictation(draft, next)};
  }
  if(/\b(smaz|odstran)\b/.test(folded) && /\bradek|radku\b/.test(folded)){
    const next = cloneDictation(draft);
    const index = /\bdruh/.test(folded)?1:/\btret/.test(folded)?2:/\bprv/.test(folded)?0:-1;
    if(index<0||!next.materials[index]) return {draft, clarify:'Který řádek rozpracovaného konceptu mám odebrat? Uložený záznam nemažu.'};
    next.materials.splice(index, 1);
    return {draft:rememberDictation(draft, next)};
  }
  return null;
}

export function parseDictionaryCommand(original){
  const match = String(original||'').match(/do slovníku přidej(?:te)? výraz\s+[„"]?(.+?)[“"]?\s+jako\s+[„"]?(.+?)[“".]?$/iu);
  if(!match) return null;
  const phrase = match[1].trim().slice(0,40);
  const replacement = match[2].trim().slice(0,80);
  if(phrase.length<2||replacement.length<2) return null;
  return {phrase, replacement};
}
export function parseDictionaryList(original){
  const folded = foldCzech(original);
  if(!/slovnik/.test(folded)) return false;
  return /\b(ukaz|vypis|seznam|jake|co je)\b/.test(folded);
}
export function applyAssistantDictionary(text, entries){
  let out = String(text||'');
  const list = (Array.isArray(entries)?entries:[]).filter(entry=>entry&&entry.phrase&&entry.replacement).sort((a,b)=>String(b.phrase).length-String(a.phrase).length);
  for(const entry of list){
    const phrase = String(entry.phrase).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`,'giu'), entry.replacement);
  }
  return out;
}
export function followUpDate(today, folded){
  const name = weekdayMention(folded);
  if(!name) return /\bzitra|zitre/.test(folded)?shiftIso(today,1):(/\bdnes\b/.test(folded)?today:'');
  let due = nextWeekday(today, name);
  if(/\bpristi\b/.test(folded)){
    const span = weekSpan(today, 'this');
    if(due>=span.start&&due<=span.end) due = shiftIso(due, 7);
  }
  return due;
}
export function mentionedWorkDate(today, folded){
  const name = weekdayMention(folded);
  if(!name) return '';
  const current = new Date(today+'T12:00:00Z').getUTCDay();
  if(current===WEEKDAYS.indexOf(name)) return today;
  return weekdayDate(today, name, 'last');
}
export function parseJobDone(original){
  const folded = foldCzech(original);
  return /zakazk\w*\s+(mame\s+)?(hotov|dokonc)|mame\s+hotovo|je\s+dokoncena|prace\s+je\s+hotova/.test(folded);
}
export function parseFollowUpVisit(original, today){
  const folded = foldCzech(original);
  if(!/vratit|vratime|priste|dalsi navstev/.test(folded)) return null;
  const dueDate = followUpDate(today, folded);
  if(!dueDate) return null;
  const materials = /dva ventil/.test(folded)?[{name:'ventil', quantity:2, unit:'ks'}]:[];
  return {dueDate, title:'Další návštěva', materials};
}
export function parseDefectNote(original){
  const source = String(original||'').trim();
  const folded = foldCzech(source);
  if(!folded||/\b(ukaz|najdi|kolik|smaz)\b/.test(folded)) return null;
  if(/\b(vymenili|vymenil|opravili|opravil|pouzili|pouzil|polozili|polozil|namontovali|namontoval)\b/.test(folded)) return null;
  if(/ctvrt/.test(folded)&&/ventil/.test(folded)&&/netesn/.test(folded)){
    return {
      title:'Netěsnící čtvrtý ventil',
      description:'Čtvrtý ventil závlahového systému netěsní. Doporučená oprava je výměna ventilu při další návštěvě.',
      nextStep:'Vyměnit ventil při další návštěvě.',
      material:'ventil'
    };
  }
  if(!/netesn|proteka|zavad|nefunguje|praskl/.test(folded)) return null;
  const sentence = source.replace(/[?.!]+$/g,'').trim();
  return {title:sentence.slice(0,80), description:sentence, nextStep:'', material:''};
}
export function parseRealizationDay(original, today){
  const folded = foldCzech(original);
  if(!weekdayMention(folded)) return null;
  const draft = parseServiceDictation(original);
  if(!draft) return null;
  const date = mentionedWorkDate(today, folded);
  if(!date) return null;
  return {date, work:draft.work, materials:draft.materials};
}
export function parsePhotoCommand(original){
  const folded = foldCzech(original);
  if(!/fotk|fotog/.test(folded)||!/\b(pripoj|pridej|uloz)\b/.test(folded)) return null;
  return {when:/pred oprav/.test(folded)?'before':/opraven|po oprav/.test(folded)?'after':'latest'};
}

export function contextualCommand(command, context){
  if(context?.diary && command?.intent==='diary.day'){
    return {...command, params:{...command.params, base:context.diary}};
  }
  if(context?.protocol){
    const revised = reviseServiceDraft(context.protocol, command?.text||'');
    if(revised) return {...command, intent:'protocol.report', params:{text:command?.text||'', base:context.protocol}};
    const folded = foldCzech(command?.text||'');
    if(['jobs.search','unknown','protocol.report'].includes(command?.intent) && /\bzakazk/.test(folded) && !/\b(hodin|odprac|strav|kolik)\b/.test(folded) && !parseServiceDictation(command?.text||'')){
      const jobQuery = softenName(capture(command?.text||'', [/zakázk\p{L}*\s+(.+)/iu])).replace(/^(je to|je)\s+/i,'').trim();
      if(jobQuery) return {...command, intent:'protocol.report', params:{text:command?.text||'', base:context.protocol, jobQuery}};
    }
  }
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

export function interpretAssistant(input, today, context, kinds){
  const rules = contextualCommand(parseAssistantCommand(input, today, kinds), context);
  const folded = foldCzech(String(input||''));
  if(rules.intent==='refused.destructive' && context?.protocol && /\bradek|radku\b/.test(folded)){
    return {intent:'protocol.report', params:{text:String(input||''), base:context.protocol}, text:String(input||'')};
  }
  const meaning = understandUtterance(input, today, context);
  const locked = new Set(['jobs.depart','jobs.work','jobs.unplanned','jobs.personDay','navigation.address','customers.contact','jobs.reschedule','jobs.selection','inquiries.open','inquiries.count','inquiries.detail','inquiries.status','inquiries.convert']);
  if(meaning?.intent && (meaning.override || rules.intent==='unknown') && !locked.has(rules.intent)){
    return {intent:meaning.intent, params:meaning.params||{}, text:rules.text||String(input||'')};
  }
  return rules;
}
