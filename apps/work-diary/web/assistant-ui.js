import {parseAssistantCommand, contextualCommand} from './assistant-commands.js?v=assistant-v3';
import {answerOffline} from './assistant-offline.js?v=assistant-v2';
import {peekCachedJobs} from './cloud.js?v=completion-v1';
import {extractLocalCommand, localMinistral} from './assistant-local.js?v=assistant-v6';

function esc(value){
  return String(value??'').replace(/[&<>"']/g, char=>'&#'+char.codePointAt(0)+';');
}
const spark = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.4 4.2L17.5 8.6 13.4 10 12 14.2 10.6 10 6.5 8.6l4.1-1.4L12 3z"/></svg>';
const STATUS = {planned:'Naplánováno', on_way:'Na cestě', in_progress:'Probíhá', done:'Hotovo', incomplete:'Nedokončeno'};

function scopeOf(session){
  const user = session?.user?.id || 'anonymous';
  const company = session?.installation?.id || session?.workspace?.workspaceId || 'company';
  return `${company}:${user}`;
}
function threadsKey(session){return `pd-assistant-threads-v1:${scopeOf(session)}`;}
function themeKey(){return 'pd-assistant-theme';}
function modeKey(){return 'pd-assistant-runtime';}
function loadThreads(session){
  try{const value = JSON.parse(localStorage.getItem(threadsKey(session))||'[]');return Array.isArray(value)?value:[];}
  catch{return [];}
}
function saveThreads(session, threads){
  try{localStorage.setItem(threadsKey(session), JSON.stringify(threads.slice(0,30)));}catch{/* soukromý režim */ }
}
function greeting(name){
  const hour = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'numeric',hourCycle:'h23'}).format(new Date()));
  const hello = hour<11?'Dobré ráno':hour<18?'Dobrý den':'Dobrý večer';
  const first = String(name||'').trim().split(/\s+/)[0]||'';
  return first?`${hello}, ${first}`:hello;
}
function clock(value){
  try{return new Intl.DateTimeFormat('cs-CZ',{hour:'2-digit',minute:'2-digit'}).format(value?new Date(value):new Date());}
  catch{return '';}
}
function dayLabel(value){
  const date = new Date(value), now = new Date();
  if(date.toDateString()===now.toDateString()) return clock(value);
  const yesterday = new Date(now);yesterday.setDate(now.getDate()-1);
  if(date.toDateString()===yesterday.toDateString()) return 'Včera';
  return new Intl.DateTimeFormat('cs-CZ',{day:'numeric',month:'numeric'}).format(date);
}

const runtime = {scope:'', threadId:'', threads:[], busy:false, listening:false, recognition:null, detail:null, historyOpen:false, query:'', theme:'system', open:false, mode:'basic'};
let repaint = ()=>{};
localMinistral().subscribe(()=>repaint());

export function mountWorkAssistant({db, getSession, onChanged, openCustomer, openJob, openMaterial}={}){
  const session = getSession?.();
  const existingRoot = document.querySelector('#assistant-root');
  if(!session?.user){existingRoot?.remove(); runtime.scope=''; return;}
  const embedded = [...document.querySelectorAll('#assistant-page')].find(node=>!node.closest('#assistant-root'));
  let bubble = existingRoot;
  let host = embedded;
  if(!host){
    if(!bubble){
      bubble = document.createElement('div');
      bubble.id = 'assistant-root';
      bubble.innerHTML = `<button type="button" class="assistant-launch" aria-label="Pracovní asistent" aria-expanded="false">${spark}</button><div id="assistant-page"></div>`;
      document.body.appendChild(bubble);
      bubble.querySelector('.assistant-launch').addEventListener('click', ()=>{runtime.open=!runtime.open; applyBubble(bubble); if(runtime.open) bubble.querySelector('textarea')?.focus();});
    }
    host = bubble.querySelector('#assistant-page');
  }
  const scope = scopeOf(session);
  if(runtime.scope!==scope){
    runtime.scope = scope;
    runtime.threads = loadThreads(session);
    runtime.threadId = runtime.threads[0]?.id || '';
    runtime.detail = null;
    runtime.historyOpen = false;
  }
  if(!runtime.theme) runtime.theme = localStorage.getItem(themeKey()) || 'system';
  runtime.mode = localStorage.getItem(modeKey())==='local'?'local':'basic';
  const thread = current();
  const paint = ()=>render(host, session, paint, {db, getSession, onChanged, openCustomer, openJob, openMaterial});
  if(host.dataset.mounted!==scope){
    paint();
    host.dataset.mounted = scope;
    if(runtime.mode==='local') localMinistral().refresh();
    const field = host.querySelector('textarea');
    if(field && document.activeElement!==field) field.value = thread?.draft||'';
  }
  if(bubble) applyBubble(bubble);
}
function applyBubble(root){
  root.classList.toggle('is-open', !!runtime.open);
  root.querySelector('.assistant-launch')?.setAttribute('aria-expanded', runtime.open?'true':'false');
}

function current(){
  return runtime.threads.find(item=>item.id===runtime.threadId) || null;
}
function persist(session){saveThreads(session, runtime.threads);}
function ensureThread(session){
  let thread = current();
  if(thread) return thread;
  thread = {id:crypto.randomUUID(), title:'Nový chat', updatedAt:Date.now(), items:[], context:null, draft:''};
  runtime.threads.unshift(thread);
  runtime.threadId = thread.id;
  persist(session);
  return thread;
}
function resolvedTheme(){
  if(runtime.theme==='light'||runtime.theme==='dark') return runtime.theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function render(host, session, paint, api){
  const thread = current();
  const items = thread?.items||[];
  const dark = resolvedTheme();
  host.dataset.theme = dark;
  host.innerHTML = page(session, thread, items);
  const log = host.querySelector('.assistant-log');
  if(log) log.scrollTop = log.scrollHeight;
  repaint = ()=>{if(host.isConnected) paint();};
  host.querySelector('[data-new]')?.addEventListener('click', ()=>{runtime.threadId='';runtime.detail=null;runtime.historyOpen=false;ensureThread(session);paint();});
  host.querySelector('[data-history]')?.addEventListener('click', ()=>{runtime.historyOpen=!runtime.historyOpen;paint();});
  host.querySelector('[data-query]')?.addEventListener('input', event=>{runtime.query=event.target.value;paint();host.querySelector('[data-query]')?.focus();});
  host.querySelectorAll('[data-thread]').forEach(button=>button.onclick=()=>{runtime.threadId=button.dataset.thread;runtime.detail=null;runtime.historyOpen=false;paint();});
  host.querySelectorAll('[data-rename]').forEach(button=>button.onclick=event=>{
    event.stopPropagation();
    const row = runtime.threads.find(item=>item.id===button.dataset.rename);
    const title = prompt('Název konverzace', row?.title||'');
    if(!row||title==null) return;
    const clean = title.trim().slice(0,80);
    if(!clean) return;
    row.title = clean;row.updatedAt=Date.now();persist(session);paint();
  });
  host.querySelectorAll('[data-delete]').forEach(button=>button.onclick=event=>{
    event.stopPropagation();
    const row = runtime.threads.find(item=>item.id===button.dataset.delete);
    if(!row||!confirm(`Smazat konverzaci „${row.title}“? Zprávy v tomto zařízení zmizí.`)) return;
    runtime.threads = runtime.threads.filter(item=>item.id!==row.id);
    if(runtime.threadId===row.id){runtime.threadId=runtime.threads[0]?.id||'';runtime.detail=null;}
    persist(session);paint();
  });
  host.querySelectorAll('[data-theme-choice]').forEach(button=>button.onclick=()=>{runtime.theme=button.dataset.themeChoice;localStorage.setItem(themeKey(), runtime.theme);paint();});
  host.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{runtime.mode=button.dataset.mode==='local'?'local':'basic';localStorage.setItem(modeKey(), runtime.mode);if(runtime.mode==='local') localMinistral().refresh();paint();});
  host.querySelector('[data-model-download]')?.addEventListener('click', ()=>localMinistral().start());
  host.querySelector('[data-model-cancel]')?.addEventListener('click', ()=>localMinistral().cancel());
  host.querySelector('[data-model-delete]')?.addEventListener('click', ()=>{if(confirm('Smazat Ministral 3B z prohlížeče?')) localMinistral().remove();});
  host.querySelectorAll('[data-quick]').forEach(button=>button.onclick=()=>ask(button.dataset.quick, api, paint));
  host.querySelectorAll('[data-fill]').forEach(button=>button.onclick=()=>{const field=host.querySelector('textarea');if(!field)return;field.value=button.dataset.fill;field.focus();const live=current();if(live)live.draft=field.value;});
  host.querySelectorAll('[data-open-type]').forEach(button=>button.onclick=()=>{
    const type = button.dataset.openType;
    const id = button.dataset.openId;
    if(!id||!['customer','job','material'].includes(type)) return;
    const known = findCard(type, id);
    activate({type, id, title:known.title||button.querySelector('strong')?.textContent||'', openLabel:known.openLabel}, false, api, paint);
  });
  host.querySelector('[data-close-assistant]')?.addEventListener('click', ()=>{runtime.open=false; const bubble=host.closest('#assistant-root'); if(bubble) applyBubble(bubble);});
  host.querySelector('[data-close-detail]')?.addEventListener('click', ()=>{runtime.detail=null;paint();});
  host.querySelector('[data-full-profile]')?.addEventListener('click', ()=>{const card=runtime.detail?.card;if(card) activate(card, true, api, paint);});
  host.querySelectorAll('[data-confirm]').forEach(button=>button.onclick=()=>ask('', api, paint, button.dataset.confirm));
  host.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>ask('', api, paint, null, button.dataset.cancel));
  const form = host.querySelector('form'), field = form?.querySelector('textarea');
  if(form&&field){
    field.oninput = ()=>{const live=current();if(live){live.draft=field.value;persist(session);}};
    field.value = thread?.draft||'';
    form.onsubmit = event=>{event.preventDefault();ask(field.value, api, paint);};
    host.querySelector('[data-file]')?.addEventListener('change', event=>{
      const file = event.target.files?.[0];event.target.value='';
      if(file) readImportFile(file, field.value, api, paint);
    });
    host.querySelector('[data-voice]')?.addEventListener('click', ()=>toggleVoice(field, api, paint));
  }
}

function page(session, thread, items){
  const name = session?.user?.name||'';
  const history = runtime.threads.filter(item=>!runtime.query||item.title.toLocaleLowerCase('cs').includes(runtime.query.toLocaleLowerCase('cs')));
  const shown = history.slice(0,8);
  const messages = items.map(item=>bubble(item)).join('');
  const welcome = !items.length;
  const tiles = welcomeTiles(session);
  return `<div class="assistant-workspace ${runtime.historyOpen?'history-open':''} ${runtime.detail?'detail-open':''}">
    <aside class="assistant-history" aria-label="Historie konverzací">
      <button type="button" class="assistant-new" data-new>${plus()} Nový chat</button>
      <label class="assistant-search">Hledat v historii<input data-query value="${esc(runtime.query)}" placeholder="Hledat"></label>
      <p>Historie konverzací</p>
      <div class="assistant-thread-list">${shown.map(item=>`<div class="assistant-thread ${item.id===thread?.id?'is-current':''}"><button type="button" data-thread="${esc(item.id)}"><span>${esc(item.title)}</span><small>${esc(dayLabel(item.updatedAt))}</small></button><button type="button" data-rename="${esc(item.id)}" aria-label="Přejmenovat">✎</button><button type="button" data-delete="${esc(item.id)}" aria-label="Smazat konverzaci">×</button></div>`).join('')||'<p class="assistant-empty">Zatím tu žádný chat není.</p>'}${history.length>shown.length?'<p class="assistant-more">Dalších ${history.length-shown.length} je v zařízení.</p>':''}</div>
    </aside>
    <section class="assistant-chat" aria-label="Pracovní asistent">
      <header class="assistant-top">
        <button type="button" class="assistant-icon-button" data-history aria-label="Historie konverzací">☰</button>
        <div><strong>Pracovní asistent</strong><p>Váš chytrý pomocník pro zákazníky, zakázky, docházku a práci v terénu.</p></div>
        <div class="assistant-themes" role="group" aria-label="Vzhled">${['light','Světlý','dark','Tmavý','system','Systém'].reduce((html,item,index,list)=>index%2?html+`<button type="button" data-theme-choice="${list[index-1]}" aria-pressed="${runtime.theme===list[index-1]}">${item}</button>`:html,'')}</div>
        <button type="button" class="assistant-icon-button" data-close-assistant aria-label="Zavřít asistenta">×</button>
      </header>
      <div class="assistant-modes" role="group" aria-label="Režim asistenta"><button type="button" data-mode="basic" aria-pressed="${runtime.mode!=='local'}">Základní</button><button type="button" data-mode="local" aria-pressed="${runtime.mode==='local'}">V zařízení</button></div>
      ${runtime.mode==='local'?localCard():''}
      <div class="assistant-log">${welcome?welcomeBlock(name, tiles):messages}</div>
      <form class="assistant-composer">
        <label class="assistant-clip" aria-label="Přidat přílohu">${clip()}<input data-file type="file" accept=".csv,.txt,.tsv,text/csv,text/plain"></label>
        <textarea rows="1" maxlength="500" aria-label="Příkaz" placeholder="Napište příkaz..."></textarea>
        <button type="button" data-voice aria-label="Hlasové zadání" aria-pressed="${runtime.listening}">${mic()}</button>
        <button type="submit" aria-label="Odeslat" ${runtime.busy?'disabled':''}>${send()}</button>
      </form>
    </section>
    ${detailPanel()}
  </div>`;
}
function welcomeTiles(session){
  const role = session?.user?.role;
  const manager = ['owner','administrator','admin'].includes(role);
  const tiles = [
    ['Co mě dnes čeká?','Co máme dnes za práci?'],
    ['Najít zákazníka',''],
    ['Moje zakázky','Ukaž nedokončené zakázky.'],
    ['Docházka','Kolik hodin jsem dnes odpracoval?']
  ];
  if(manager) tiles.push(['Vytvořit zakázku','Vytvoř zakázku ']);
  tiles.push(['Zkontrolovat materiál','Jaký materiál potřebujeme na zítřek?']);
  return tiles;
}
function welcomeBlock(name, tiles){
  return `<div class="assistant-welcome"><span class="assistant-spark">${spark}</span><div><strong>${esc(greeting(name))}</strong><p>S čím vám dnes mohu pomoct?</p></div></div>
    <div class="assistant-tiles">${tiles.map(([label, command])=>command&&!command.endsWith(' ')?`<button type="button" data-quick="${esc(command)}"><span>${esc(label)}</span><small>›</small></button>`:`<button type="button" data-fill="${esc(command||'Najdi zákazníka ')}"><span>${esc(label)}</span><small>›</small></button>`).join('')}</div>`;
}
function bubble(item){
  if(item.role==='user') return `<div class="assistant-row mine"><div class="assistant-user">${esc(item.text)}<time>${esc(clock(item.at))}</time></div></div>`;
  const cards = (item.cards||[]).map(card=>cardView(card)).join('');
  const suggestions = (item.suggestions||[]).map(text=>`<button type="button" data-quick="${esc(text)}">${esc(suggestionLabel(text))}</button>`).join('');
  const confirm = item.confirm?`<div class="assistant-confirm"><p>${esc(item.confirm.detail||item.text)}</p><div><button type="button" class="yes" data-confirm="${esc(item.confirm.id)}">Potvrdit</button><button type="button" data-cancel="${esc(item.confirm.id)}">Zrušit</button></div></div>`:'';
  return `<div class="assistant-row"><span class="assistant-spark">${spark}</span><div class="assistant-answer"><p>${esc(item.text)}</p><time>${esc(clock(item.at))}</time>${cards}${confirm}${suggestions?`<p class="assistant-next-label">Co chcete udělat dál?</p><div class="assistant-next">${suggestions}</div>`:''}</div></div>`;
}
function suggestionLabel(text){
  if(text==='Zobraz jeho zakázky') return 'Zobrazit zakázky';
  return text;
}
function localCard(){
  const model = localMinistral().snapshot();
  const action = model.downloading
    ? `<progress max="1" value="${model.progress}"></progress><button type="button" data-model-cancel>Zrušit stahování</button>`
    : model.installed
      ? `<button type="button" data-model-delete>Smazat model z prohlížeče</button>`
      : `<button type="button" data-model-download>Stáhnout Ministral 3B</button>`;
  return `<div class="assistant-local"><p>${esc(model.message)}</p>${action}</div>`;
}
function findCard(type, id){
  for(const item of current()?.items||[]){
    const card = (item.cards||[]).find(entry=>entry&&entry.type===type&&entry.id===id);
    if(card) return card;
  }
  return runtime.detail?.card?.type===type&&runtime.detail.card.id===id?runtime.detail.card:{};
}
function openAttrs(type, id){
  return `data-open-type="${esc(type)}" data-open-id="${esc(id)}"`;
}
function cardView(card){
  const count = card.countLabel?`<small>${esc(card.countLabel)}</small>`:'';
  const status = card.statusLabel?`<em class="is-${esc(card.status)}">${esc(card.statusLabel)}</em>`:'';
  const action = card.id&&['customer','job','material'].includes(card.type)?`<button type="button" ${openAttrs(card.type, card.id)}>${esc(card.openLabel||'Otevřít')}</button>`:'';
  return `<article class="assistant-card"><span class="assistant-card-mark">${spark}</span><div><strong>${esc(card.title)}</strong>${card.subtitle?`<p>${esc(card.subtitle)}</p>`:''}${count}</div>${status}${action}</article>`;
}
function detailPanel(){
  const detail = runtime.detail;
  if(!detail) return '<aside class="assistant-detail" hidden></aside>';
  const kind = detail.card.type==='job'?'Zakázka':detail.card.type==='material'?'Materiál':'Zákazník';
  const body = detail.loading?'<p>Načítám údaje z evidence…</p>':detail.error?`<p>${esc(detail.error)}</p>`:detailBody(detail);
  return `<aside class="assistant-detail" aria-label="Detail záznamu">
    <header><span class="assistant-card-mark">${spark}</span><div><strong>${esc(detail.card.title||kind)}</strong><p>${kind}</p></div><button type="button" data-close-detail aria-label="Zavřít panel">×</button></header>
    ${body}
    <button type="button" class="assistant-profile" data-full-profile>Otevřít celý profil</button>
  </aside>`;
}
function detailBody(detail){
  if(detail.card.type==='job'){
    const job = detail.record||{};
    const rows = [job.customerName, [job.dueDate, job.startTime].filter(Boolean).join(' '), job.assignedName, [job.address, job.city].filter(Boolean).join(', '), job.status?STATUS[job.status]||job.status:''].filter(Boolean);
    return `<h3>Zakázka</h3><ul>${rows.map(row=>`<li>${esc(row)}</li>`).join('')||'<li>Další údaje v evidenci nejsou.</li>'}</ul>`;
  }
  if(detail.card.type==='material'){
    const item = detail.record||{};
    const rows = [item.categoryName, item.sku, item.unit, item.priceLabel].filter(Boolean);
    return `<h3>Materiál</h3><ul>${rows.map(row=>`<li>${esc(row)}</li>`).join('')||'<li>Další údaje v katalogu nejsou.</li>'}</ul>`;
  }
  const record = detail.record;
  const phones = (record?.phones||[]).map(item=>item.number).filter(Boolean);
  const address = (record?.addresses||[]).map(item=>[item.address, item.city].filter(Boolean).join(', ')).filter(Boolean);
  const jobs = (detail.jobs||[]).slice(0,6);
  return `<h3>Kontaktní údaje</h3><ul>${phones.map(phone=>`<li>${esc(phone)}</li>`).join('')||'<li>Telefon v evidenci není.</li>'}${record?.email?`<li>${esc(record.email)}</li>`:''}${address.map(line=>`<li>${esc(line)}</li>`).join('')||'<li>Adresa v evidenci není.</li>'}</ul>
    <h3>Aktivní zakázky <span>${jobs.length}</span></h3>${jobs.map(job=>`<button type="button" class="assistant-side-job" ${openAttrs('job', job.id)}><strong>${esc(job.title)}</strong><small>${esc([job.dueDate, job.city].filter(Boolean).join(' · '))}</small><em class="is-${esc(job.status)}">${esc(STATUS[job.status]||job.status||'')}</em></button>`).join('')||'<p>Aktivní zakázku k tomuto zákazníkovi nevidím.</p>'}`;
}
function activate(card, full, api, paint){
  const narrow = window.matchMedia?.('(max-width: 1099px)').matches;
  if(!card?.id||!['customer','job','material'].includes(card.type)) return;
  if(full||narrow){
    if(card.type==='customer') api.openCustomer?.(card.id);
    if(card.type==='job') api.openJob?.(card.id);
    if(card.type==='material') api.openMaterial?.(card.id);
    if(narrow||full) return;
  }
  runtime.detail = {card, loading:true, record:null, jobs:[], error:''};
  paint();
  loadDetail(card, api, paint);
}
async function loadDetail(card, api, paint){
  try{
    if(card.type==='job'){
      const data = await api.db.request('/api/jobs/'+encodeURIComponent(card.id));
      if(runtime.detail?.card?.id!==card.id) return;
      if(!data?.job) throw Error('Zakázku se nepodařilo načíst.');
      runtime.detail = {card:{...card, title:data.job.title||card.title}, loading:false, record:data.job, jobs:[], error:''};
    }else if(card.type==='material'){
      const data = await api.db.request('/api/materials');
      if(runtime.detail?.card?.id!==card.id) return;
      const item = (data.items||[]).find(entry=>entry.id===card.id);
      if(!item) throw Error('Materiál v načteném katalogu nevidím.');
      const category = (data.categories||[]).find(entry=>entry.id===item.categoryId);
      let priceLabel = '';
      if(Number.isSafeInteger(item.priceMinor)&&/^[A-Z]{3}$/.test(item.currency||'')){
        try{priceLabel = new Intl.NumberFormat('cs-CZ',{style:'currency',currency:item.currency}).format(item.priceMinor/100);}catch{priceLabel='';}
      }
      runtime.detail = {card:{...card, title:item.name||card.title}, loading:false, record:{...item, categoryName:category?.name||'', priceLabel}, jobs:[], error:''};
    }else{
      const customer = await api.db.request('/api/customers/'+encodeURIComponent(card.id));
      const jobs = await api.db.request('/api/jobs?state=active&q='+encodeURIComponent(String(card.title||'').slice(0,80)));
      if(runtime.detail?.card?.id!==card.id) return;
      const list = (jobs.jobs||[]).filter(job=>job.customerId===card.id||(!job.customerId&&job.customerName===card.title));
      runtime.detail = {card:{...card, title:customer.customer?.name||card.title}, loading:false, record:customer.customer, jobs:list, error:''};
    }
  }catch(error){
    if(runtime.detail?.card?.id!==card.id) return;
    runtime.detail = {card, loading:false, record:null, jobs:[], error:error?.message||'Detail se nepodařilo načíst. Nic jsem nedoplnil.'};
  }
  paint();
}
function push(session, role, text, extra={}){
  const thread = ensureThread(session);
  thread.items.push({role, text, at:Date.now(), ...extra});
  thread.items = thread.items.slice(-40);
  if(role==='user'&&thread.title==='Nový chat') thread.title = text.replace(/^Soubor\s+/,'').slice(0,42);
  if(extra.context) thread.context = extra.context;
  thread.updatedAt = Date.now();
  thread.draft = '';
  runtime.threads = [thread, ...runtime.threads.filter(item=>item.id!==thread.id)];
  persist(session);
}
async function ask(text, api, paint, confirmId, cancelId, file){
  const session = api.getSession();
  const clean = String(text||'').trim();
  if((!confirmId&&!cancelId&&!clean&&!file)||runtime.busy) return;
  const thread = ensureThread(session);
  if(!confirmId&&!cancelId) push(session, 'user', file?`Soubor ${file.name}${clean?': '+clean:''}`:clean);
  runtime.busy = true; paint();
  let commandText = clean;
  try{
    if(session?.rolePreview?.active&&(confirmId||cancelId)){push(session,'assistant','V náhledu role změny neukládám.');return;}
    if(!confirmId&&!cancelId&&!file&&runtime.mode==='local'){
      const model = localMinistral();
      if(!model.snapshot().installed){push(session,'assistant','Nejdřív stáhněte Ministral 3B. Nic jsem se neptal serveru.');return;}
      let answer = '';
      try{answer = await model.answer(clean);}catch(error){push(session,'assistant', error?.message||'Ministral teď neodpověděl. Základní asistent zůstává k dispozici.');return;}
      const command = extractLocalCommand(answer);
      if(!command){push(session,'assistant', `${answer}\n\nTohle není údaj z deníku. Jména, hodiny a ceny beru jen z evidence.`);return;}
      push(session,'assistant', `Rozumím tomu jako: ${command}`);
      commandText = command;
    }
    if(!navigator.onLine && !confirmId && !cancelId){
      if(file){push(session,'assistant','Soubor bez připojení neukládám. Až budete online, vložte ho znovu. Nic se teď nezměnilo.');return;}
      const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const command = contextualCommand(parseAssistantCommand(commandText, today), thread.context);
      let jobs = null;
      try{const cached = await peekCachedJobs(`/api/jobs?state=all&order=schedule&month=${today.slice(0,7)}`);jobs = cached?.jobs ?? null;}catch{jobs = null;}
      const tomorrowDate = new Date(today+'T12:00:00Z');tomorrowDate.setUTCDate(tomorrowDate.getUTCDate()+1);
      const local = answerOffline(command, {jobs, today, tomorrow:tomorrowDate.toISOString().slice(0,10)});
      push(session,'assistant', local.missing?local.reply+' Údaje jsou z poslední uložené kopie.':local.reply);
      return;
    }
    if(!navigator.onLine){push(session,'assistant','Potvrzení bez připojení neodešlu. Nic se neuložilo.');return;}
    const data = await api.db.request('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:commandText, mode:'basic', ...(thread.context?{context:thread.context}:{}), ...(file?{file}:{}), ...(confirmId?{confirmId}:{}), ...(cancelId?{cancelId}:{})})});
    push(session,'assistant', data.reply||'Hotovo.', {confirm:data.confirm||null, suggestions:data.suggestions||[], cards:data.cards||[], context:data.context||thread.context});
    if(data.mutated) api.onChanged?.(data.mutated);
  }catch(error){
    const offline = !navigator.onLine||error?.status===0||/fetch|network|Failed/i.test(error?.message||'');
    push(session,'assistant', offline?'Potřebná data nejsou v zařízení. Připojte se a příkaz zopakujte. Rozpracované změny deníku zůstávají beze změny.':(error?.message||'Asistent teď neodpověděl.'));
  }finally{runtime.busy=false;paint();}
}
function stop(){runtime.recognition?.stop();runtime.listening=false;}
function toggleVoice(field, api, paint){
  const Speech = window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech) {push(api.getSession(),'assistant','Hlasové zadání v tomto prohlížeči není. Příkaz napište.');paint();return;}
  if(runtime.listening){stop();paint();return;}
  const recognition = new Speech();
  recognition.lang = 'cs-CZ';
  recognition.interimResults = false;
  recognition.onresult = event=>{field.value = event.results[0][0].transcript;ask(field.value, api, paint);};
  recognition.onerror = ()=>{push(api.getSession(),'assistant','Hlasové zadání teď není dostupné. Příkaz napište.');paint();};
  recognition.onend = ()=>{runtime.listening=false;paint();};
  runtime.recognition = recognition;
  runtime.listening = true;
  paint();
  try{recognition.start();}catch{runtime.listening=false;push(api.getSession(),'assistant','Mikrofon se nepodařilo zapnout.');paint();}
}
async function readImportFile(file, hint, api, paint){
  const name = file.name||'soubor';
  if(/\.(pdf|xlsx|xls|doc|docx|png|jpe?g)$/i.test(name)){push(api.getSession(),'assistant','PDF, Excel a fotky zatím nečtu. Uložte tabulku jako CSV. Nic jsem neuložil.');paint();return;}
  if(file.size>100000){push(api.getSession(),'assistant','Soubor je větší než 100 kB. Rozdělte tabulku. Nic jsem neuložil.');paint();return;}
  let text = '';
  try{text = await file.text();}catch{push(api.getSession(),'assistant','Soubor se nepodařilo přečíst.');paint();return;}
  ask(hint||'Načti tento soubor.', api, paint, null, null, {name, text});
}
function plus(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';}
function clip(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 8-6.5 6.5a2 2 0 0 1-3-3L13 5a3.5 3.5 0 0 1 5 5l-7 7a5 5 0 0 1-7-7L12 2"/></svg>';}
function mic(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/></svg>';}
function send(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 14-7-4 14-3-5-7-2z"/></svg>';}
