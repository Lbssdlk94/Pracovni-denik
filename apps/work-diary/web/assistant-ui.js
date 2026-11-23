import {parseAssistantCommand, contextualCommand} from './assistant-commands.js?v=assistant-work-v1';
import {answerOffline} from './assistant-offline.js?v=assistant-work-v1';
import {peekCachedJobs} from './cloud.js?v=completion-v1';
import {extractLocalCommand, localMinistral} from './assistant-local.js?v=assistant-work-v1';
import {durationPickerMarkup, refreshDurationTotals} from './planning-fields.js?v=workspace-roles-v1';

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

const runtime = {scope:'', threadId:'', threads:[], busy:false, listening:false, recognition:null, detail:null, historyOpen:false, query:'', theme:'system', open:false, mode:'basic', split:45, chatHidden:false, menuOpen:false, mobileTab:'chat', resultFresh:false, generation:0};
let repaint = ()=>{};
localMinistral().subscribe(()=>repaint());

export function mountWorkAssistant({db, getSession, onChanged, openCustomer, openJob, openMaterial}={}){
  const session = getSession?.();
  const existingRoot = document.querySelector('#assistant-root');
  if(!session?.user){existingRoot?.remove(); document.body.classList.remove('assistant-open'); runtime.scope=''; return;}
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
  document.body.classList.toggle('assistant-open', !!runtime.open);
}

function bindKeyboard(host){
  const root = host.closest('#assistant-root')||host;
  if(root.dataset.viewport==='1'||!window.visualViewport) return;
  root.dataset.viewport='1';
  const apply = ()=>{
    const view = window.visualViewport;
    const keyboard = window.innerHeight - view.height - view.offsetTop > 80;
    root.style.setProperty('--vv-height', Math.round(view.height)+'px');
    root.style.setProperty('--vv-top', Math.round(view.offsetTop)+'px');
    root.style.setProperty('--kb-pad', keyboard?'0px':'env(safe-area-inset-bottom)');
    const field = host.querySelector('textarea');
    const log = host.querySelector('.assistant-log');
    if(keyboard && field && document.activeElement===field && log) log.scrollTop = log.scrollHeight;
  };
  window.visualViewport.addEventListener('resize', apply);
  window.visualViewport.addEventListener('scroll', apply);
  apply();
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
  const root = document.documentElement;
  const explicit = root.dataset.theme || root.dataset.colorScheme || document.body?.dataset?.theme;
  if(explicit==='light'||explicit==='dark') return explicit;
  if(root.classList.contains('dark')||document.body.classList.contains('dark')) return 'dark';
  return 'light';
}

function render(host, session, paint, api){
  const thread = ensureDraft(current());
  const items = thread?.items||[];
  host.dataset.theme = resolvedTheme();
  bindKeyboard(host);
  const scroll = runtime.keepScroll;
  host.innerHTML = page(session, thread, items);
  const log = host.querySelector('.assistant-log');
  if(log) log.scrollTop = scroll??log.scrollHeight;
  runtime.keepScroll = null;
  repaint = ()=>{if(host.isConnected) paint();};
  const remember = ()=>{const live=host.querySelector('.assistant-log'); if(live) runtime.keepScroll=live.scrollTop;};
  host.querySelector('[data-new]')?.addEventListener('click', ()=>{remember(); runtime.threadId='';runtime.detail=null;runtime.historyOpen=false;runtime.menuOpen=false;runtime.mobileTab='chat';runtime.resultFresh=false;ensureThread(session);paint();});
  host.querySelector('[data-history]')?.addEventListener('click', ()=>{runtime.historyOpen=!runtime.historyOpen;runtime.menuOpen=false;paint();});
  host.querySelector('[data-query]')?.addEventListener('input', event=>{runtime.query=event.target.value;paint();host.querySelector('[data-query]')?.focus();});
  host.querySelectorAll('[data-thread]').forEach(button=>button.onclick=()=>{runtime.threadId=button.dataset.thread;runtime.detail=null;runtime.historyOpen=false;runtime.mobileTab='chat';paint();});
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
  host.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{runtime.mode=button.dataset.mode==='local'?'local':'basic';localStorage.setItem(modeKey(), runtime.mode);runtime.menuOpen=false;if(runtime.mode==='local') localMinistral().refresh();paint();});
  host.querySelector('[data-menu]')?.addEventListener('click', ()=>{runtime.menuOpen=!runtime.menuOpen;runtime.historyOpen=false;paint();});
  host.querySelector('[data-hide-chat]')?.addEventListener('click', ()=>{runtime.chatHidden=!runtime.chatHidden;runtime.menuOpen=false;paint();});
  host.querySelector('.assistant-tabs')?.addEventListener('click', event=>{const tab=event.target.closest('[data-tab]');if(!tab)return;runtime.mobileTab=tab.dataset.tab;if(runtime.mobileTab==='result')runtime.resultFresh=false;paint();});
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
  const collapse = minimized=>()=>{remember(); runtime.open=false; runtime.minimized=minimized; const bubble=host.closest('#assistant-root'); if(bubble) applyBubble(bubble);};
  host.querySelector('[data-close-assistant]')?.addEventListener('click', collapse(false));
  host.querySelector('[data-minimize]')?.addEventListener('click', collapse(true));
  host.querySelector('[data-back-result]')?.addEventListener('click', ()=>{runtime.detail=null;paint();});
  host.querySelector('[data-close-detail]')?.addEventListener('click', ()=>{runtime.detail=null;paint();});
  host.querySelector('[data-full-profile]')?.addEventListener('click', ()=>{const card=runtime.detail?.card;if(card) activate(card, true, api, paint);});
  host.querySelectorAll('[data-confirm]').forEach(button=>button.onclick=()=>ask('', api, paint, button.dataset.confirm, null, null, conceptPayload(current())));
  host.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>ask('', api, paint, null, button.dataset.cancel));
  host.querySelector('[data-stop]')?.addEventListener('click', ()=>{runtime.generation+=1;runtime.busy=false;localMinistral().cancel();paint();});
  bindConcept(host, session, paint);
  const split = host.querySelector('[data-split]');
  if(split){
    split.addEventListener('pointerdown', event=>{
      const body = host.querySelector('.assistant-body');
      split.setPointerCapture(event.pointerId);
      const move = ev=>{
        const rect = body.getBoundingClientRect();
        runtime.split = Math.min(72, Math.max(28, ((ev.clientX-rect.left)/rect.width)*100));
        host.querySelector('.assistant-workspace')?.style.setProperty('--split', runtime.split+'%');
      };
      split.addEventListener('pointermove', move);
      split.addEventListener('pointerup', ()=>split.removeEventListener('pointermove', move), {once:true});
    });
  }
  const form = host.querySelector('form'), field = form?.querySelector('textarea');
  if(form&&field){
    field.oninput = ()=>{const live=current();if(live){live.draft=field.value;persist(session);}};
    field.value = thread?.draft||'';
    field.addEventListener('keydown', event=>{
      if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();if(!runtime.busy) form.requestSubmit();}
    });
    form.onsubmit = event=>{event.preventDefault();ask(field.value, api, paint);};
    host.querySelector('[data-file]')?.addEventListener('change', event=>{
      const file = event.target.files?.[0];event.target.value='';
      if(file) readImportFile(file, field.value, api, paint);
    });
    host.querySelector('[data-voice]')?.addEventListener('click', ()=>toggleVoice(field, api, paint));
  }
  host.addEventListener('keydown', event=>{
    if(event.key!=='Escape') return;
    if(runtime.historyOpen||runtime.menuOpen){runtime.historyOpen=false;runtime.menuOpen=false;paint();return;}
    collapse(false)();
  });
}

function page(session, thread, items){
  const name = session?.user?.name||'';
  const history = runtime.threads.filter(item=>!runtime.query||item.title.toLocaleLowerCase('cs').includes(runtime.query.toLocaleLowerCase('cs')));
  const shown = history.slice(0,12);
  const messages = messageLog(items);
  const welcome = !items.length;
  const tiles = welcomeTiles(session);
  const fresh = runtime.resultFresh?' is-fresh':'';
  return `<div class="assistant-workspace ${runtime.chatHidden?'chat-hidden':''} ${runtime.mobileTab==='result'?'show-result':''} ${runtime.detail?'detail-open':''}" style="--split:${runtime.split}%">
    <header class="assistant-bar">
      <button type="button" class="assistant-icon-button" data-close-assistant aria-label="Zavřít asistenta">×</button>
      <span class="assistant-brand-mark" aria-hidden="true">${spark}</span>
      <div class="assistant-brand"><strong>Pracovní asistent</strong><small><i class="assistant-live"></i>${esc(statusLabel())}</small></div>
      <button type="button" class="assistant-icon-button" data-history aria-pressed="${runtime.historyOpen}" aria-label="Historie konverzací">${clockIcon()}</button>
      <button type="button" class="assistant-icon-button" data-new aria-label="Nový chat">${chatIcon()}</button>
      <button type="button" class="assistant-icon-button" data-hide-chat aria-pressed="${runtime.chatHidden}" aria-label="${runtime.chatHidden?'Zobrazit konverzaci':'Skrýt konverzaci'}">${eyeIcon()}</button>
      <button type="button" class="assistant-icon-button" data-minimize aria-label="Minimalizovat">${minus()}</button>
      <button type="button" class="assistant-icon-button" data-menu aria-pressed="${runtime.menuOpen}" aria-label="Další možnosti">${moreIcon()}</button>
    </header>
    <div class="assistant-tabs" role="tablist" aria-label="Asistent a výsledek">
      <button type="button" data-tab="chat" aria-selected="${runtime.mobileTab!=='result'}">Asistent</button>
      <button type="button" data-tab="result" aria-selected="${runtime.mobileTab==='result'}">Výsledek${fresh?' <span class="assistant-dot"></span>':''}</button>
    </div>
    ${runtime.historyOpen?historyPopover(shown, history.length, thread):''}
    ${runtime.menuOpen?menuPopover():''}
    <div class="assistant-body">
      <section class="assistant-chat" aria-label="Pracovní asistent">
        <div class="assistant-log">${welcome?welcomeBlock(name, tiles):messages}</div>
        <form class="assistant-composer">
          <label class="assistant-clip" aria-label="Přidat přílohu">${clip()}<input data-file type="file" accept=".csv,.txt,.tsv,text/csv,text/plain"></label>
          <textarea rows="1" maxlength="500" aria-label="Příkaz" placeholder="Napište příkaz..."></textarea>
          <button type="button" data-voice aria-label="Hlasové zadání" aria-pressed="${runtime.listening}">${mic()}</button>
          ${runtime.busy?`<button type="button" data-stop aria-label="Zastavit">■</button>`:`<button type="submit" aria-label="Odeslat">${send()}</button>`}
        </form>
      </section>
      <div class="assistant-split" data-split role="separator" aria-orientation="vertical" aria-label="Šířka panelů" tabindex="0"></div>
      <section class="assistant-stage" aria-label="Výsledek">${stage(thread)}</section>
    </div>
  </div>`;
}
function messageLog(items){
  let previous = '';
  return items.map(item=>{
    const heading = dayHeading(item.at);
    const mark = heading===previous?'':`<p class="assistant-day">${esc(heading)}</p>`;
    previous = heading;
    return mark+bubble(item);
  }).join('');
}
function dayHeading(value){
  const date = new Date(value), now = new Date();
  if(date.toDateString()===now.toDateString()) return 'Dnes';
  const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
  if(date.toDateString()===yesterday.toDateString()) return 'Včera';
  return new Intl.DateTimeFormat('cs-CZ',{day:'numeric', month:'numeric'}).format(date);
}
function ensureDraft(thread){
  if(!thread||thread.draftConcept) return thread;
  const last = [...(thread.items||[])].reverse().find(item=>item.concept);
  if(last?.concept) thread.draftConcept = JSON.parse(JSON.stringify(last.concept));
  thread.conceptTouched = thread.conceptTouched||{};
  return thread;
}
function conceptPayload(thread){
  if(!thread?.draftConcept) return null;
  const concept = thread.draftConcept;
  if(concept.kind==='protocol') return {kind:'protocol', jobId:concept.jobId||'', work:concept.work||'', materials:(concept.materials||[]).map(item=>({key:item.key||'', label:item.label||'', quantity:item.quantity??'', unit:item.unit||'', itemId:item.itemId||'', choiceId:item.choiceId||''}))};
  if(['defect','diary','followup','complete','photo','dictionary'].includes(concept.kind)) return {kind:concept.kind};
  return {title:concept.title||'', notes:concept.notes||'', customerName:concept.customerName||'', address:concept.address||'', city:concept.city||'', terms:concept.terms||[], materials:concept.materials||[]};
}
function stage(thread){
  if(runtime.detail) return detailPanel();
  if(thread?.draftConcept?.kind==='protocol') return protocolStage(thread);
  if(['defect','diary','followup','complete','photo','dictionary'].includes(thread?.draftConcept?.kind)) return noteStage(thread);
  if(thread?.draftConcept) return conceptStage(thread);
  return '<aside class="assistant-detail" hidden></aside><div class="assistant-empty-stage"><strong>Výsledek</strong><p>Po příkazu se tady otevře zákazník, zakázka, kalendář nebo koncept. Nic se neuloží bez potvrzení.</p></div>';
}
function noteStage(thread){
  const concept = thread.draftConcept;
  const confirm = [...(thread.items||[])].reverse().find(item=>item.confirm)?.confirm;
  const lines = (concept.lines||[]).map(item=>`<li>${esc(item)}</li>`).join('');
  return `<div class="assistant-concept-sheet">
    <header class="assistant-sheet-title"><h2>${esc(concept.title||'Návrh')}</h2><span class="assistant-pill is-concept">Koncept</span></header>
    <p>${esc(concept.summary||'')}</p>
    ${lines?`<ul>${lines}</ul>`:''}
    <div class="assistant-concept-actions"><button type="button" data-cancel="${esc(confirm?.id||'')}" ${confirm?'':'disabled'}>Zrušit</button><button type="button" class="yes" data-confirm="${esc(confirm?.id||'')}" ${confirm?'':'disabled'}>Uložit návrh</button></div>
  </div>`;
}
function protocolStage(thread){
  const concept = thread.draftConcept;
  const confirm = [...(thread.items||[])].reverse().find(item=>item.confirm)?.confirm;
  const place = [concept.customerName, concept.address, concept.city].filter(Boolean).join(' · ');
  const materials = (concept.materials||[]).map((item,index)=>{
    const choices = item.choices||[];
    const select = choices.length?`<label><span>Katalog</span><select data-concept-field="material:${index}:choiceId" aria-label="Položka katalogu">${`<option value="">Nevybráno</option>`}${choices.map(choice=>`<option value="${esc(choice.id)}" ${choice.id===(item.choiceId||item.itemId)?'selected':''}>${esc(choice.name)} (${esc(choice.unit||'')})</option>`).join('')}</select></label>`:`<p>${esc(item.status==='matched'?item.name||item.label:item.status==='missing'?'V katalogu není, novou položku nezakládám.':item.status==='unquantified'?'Množství chybí, do katalogu se nezapíše.':item.name||'')}</p>`;
    return `<div class="assistant-material"><label><span>${esc(item.label||'Položka')}</span><span class="assistant-control">${layers()}<input data-concept-field="material:${index}:quantity" inputmode="decimal" value="${esc(item.quantity??'')}" aria-label="Množství ${esc(item.label||'')}"></span></label><span>${esc(item.unit||'')}</span>${select}</div>`;
  }).join('');
  const required = (concept.questions||[]).map(item=>`<li>${esc(item)}</li>`).join('');
  const optional = (concept.optionalQuestions||[]).map(item=>`<li>${esc(item)}</li>`).join('');
  return `<div class="assistant-concept-sheet">
    <header class="assistant-sheet-title"><h2>Servisní protokol</h2><span class="assistant-pill is-concept">Koncept</span></header>
    <p>${esc(concept.jobTitle||'Zakázka není vybraná')}${place?' · '+esc(place):''}</p>
    <label class="assistant-notes">Provedené práce<textarea data-concept-field="work" aria-label="Provedené práce">${esc(concept.work||'')}</textarea></label>
    <section><h3>${layers()} Spotřebovaný materiál</h3>${materials||'<p>Z diktátu nevidím materiál.</p>'}</section>
    ${required?`<section><h3>Potřebuji upřesnit</h3><ul>${required}</ul></section>`:''}
    ${optional?`<section><h3>Není povinné</h3><ul>${optional}</ul></section>`:''}
    ${thread.resultNotice?`<p class="assistant-warning">${esc(thread.resultNotice)}</p>`:''}
    <div class="assistant-concept-actions"><button type="button" data-cancel="${esc(confirm?.id||'')}" ${confirm?'':'disabled'}>Zrušit</button><button type="button" class="yes" data-confirm="${esc(confirm?.id||'')}" ${confirm?'':'disabled'}>Uložit do protokolu</button></div>
  </div>`;
}
function conceptStage(thread){
  const concept = thread.draftConcept;
  const confirm = [...(thread.items||[])].reverse().find(item=>item.confirm)?.confirm;
  const terms = (concept.terms||[]).map((term,index)=>`<article class="assistant-term">
      <label class="assistant-date"><input data-concept-field="term:${index}:date" type="date" value="${esc(term.date||'')}" aria-label="Den"><span>${esc(termDateLabel(term.date))}${chevron()}</span></label>
      <label class="assistant-time">${clockIcon()}<input data-concept-field="term:${index}:start" data-duration-start-input inputmode="numeric" maxlength="5" value="${esc(shortTime(term.start||'07:00'))}" aria-label="Od"></label>
      <div class="assistant-people">${(term.people||[]).map((person,personIndex)=>`<span class="assistant-chip">${esc(personName(person))}<button type="button" data-drop-person="${index}:${personIndex}" aria-label="Odebrat ${esc(personName(person))}">×</button></span>`).join('')}<input data-add-person="${index}" aria-label="Přidat pracovníka" placeholder="+"></div>
      <button type="button" class="assistant-trash" data-drop-term="${index}" aria-label="Odebrat den">${trash()}</button>
      ${durationPickerMarkup({prefix:'concept-'+index, start:term.start||'07:00', end:term.end||'15:00', esc, term:true, endField:'term:'+index+':end'})}
      <input class="assistant-day-note" data-concept-field="term:${index}:note" value="${esc(term.note||'')}" placeholder="Poznámka k dni" aria-label="Poznámka k dni">
    </article>`).join('');
  const materials = (concept.materials||[]).map((item,index)=>`<div class="assistant-material">
      <label><span>Položka *</span><span class="assistant-control">${layers()}${materialField(index,'name',item.name,'Materiál')}</span></label>
      <label><span>Množství *</span><span class="assistant-qty"><input data-concept-field="material:${index}:quantity" inputmode="decimal" value="${esc(item.quantity??'')}" aria-label="Množství">${unitSelect(index,item.unit)}</span></label>
      <label><span>Stav</span><select data-concept-field="material:${index}:readiness" aria-label="Stav"><option value="to_buy" ${item.readiness==='on_hand'?'':'selected'}>K nákupu</option><option value="on_hand" ${item.readiness==='on_hand'?'selected':''}>Máme</option></select></label>
      <button type="button" class="assistant-trash" data-drop-material="${index}" aria-label="Odebrat materiál">${trash()}</button>
    </div>`).join('');
  const warning = thread.resultNotice||'';
  return `<div class="assistant-concept-sheet">
    <header class="assistant-sheet-title"><h2>Nová zakázka</h2><span class="assistant-pill is-concept">Koncept</span></header>
    <div class="assistant-concept-grid">
      <label>Zákazník *<span class="assistant-control">${personIcon()}<input data-concept-field="customerName" value="${esc(concept.customerName||'')}" aria-label="Zákazník"></span></label>
      <label>Adresa<span class="assistant-control"><input data-concept-field="address" value="${esc(concept.address||'')}" aria-label="Adresa"></span></label>
      <label>Město<span class="assistant-control"><input data-concept-field="city" value="${esc(concept.city||'')}" aria-label="Město"></span></label>
      <label>Typ zakázky *<span class="assistant-control">${sprinkler()}<input data-concept-field="title" value="${esc(concept.title||'')}" aria-label="Typ zakázky"></span></label>
    </div>
    <section><h3>${calendar()} Harmonogram realizace</h3>${terms}<p class="assistant-duration-total" data-duration-total></p><button type="button" class="assistant-add" data-add-term>${plus()} Přidat den</button></section>
    <section><h3>${layers()} Materiál</h3>${materials}<button type="button" class="assistant-add" data-add-material>${plus()} Přidat materiál</button></section>
    <label class="assistant-notes">Poznámky<textarea data-concept-field="notes" placeholder="Doplňující poznámka">${esc(concept.notes||'')}</textarea></label>
    ${warning?`<p class="assistant-warning">${esc(warning)}</p>`:''}
    <div class="assistant-concept-actions"><button type="button" data-cancel="${esc(confirm?.id||'')}" ${confirm?'':'disabled'}>Zrušit</button><button type="button" class="yes" data-confirm="${esc(confirm?.id||'')}" ${confirm?'':'disabled'}>Uložit zakázku</button></div>
  </div>`;
}
function personName(value){return typeof value==='string'?value:value?.name||'';}
function clockValue(value){
  const match = String(value||'').trim().match(/^(\d{1,2}):(\d{2})$/);
  if(!match) return value;
  const hour = Number(match[1]);
  return hour>=0&&hour<24?String(hour).padStart(2,'0')+':'+match[2]:value;
}
function shortTime(value){
  const normal = clockValue(value);
  return normal.replace(/^0(\d:)/,'$1');
}
function termDateLabel(iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||'')) return 'Vyberte den';
  const text = new Intl.DateTimeFormat('cs-CZ',{weekday:'short',day:'numeric',month:'numeric',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
  return text.charAt(0).toLocaleUpperCase('cs')+text.slice(1);
}
function materialField(index, field, value, label){
  return `<input data-concept-field="material:${index}:${field}" value="${esc(value||'')}" aria-label="${esc(label)}">`;
}
function unitSelect(index, unit){
  const current = String(unit||'ks');
  const units = ['m','ks','bm','kg','bal','l'];
  if(!units.includes(current)) units.push(current);
  return `<select data-concept-field="material:${index}:unit" aria-label="Jednotka">${units.map(item=>`<option value="${esc(item)}" ${item===current?'selected':''}>${esc(item)}</option>`).join('')}</select>`;
}
function bindConcept(host, session, paint){
  const thread = current();
  if(!thread?.draftConcept) return;
  host.querySelectorAll('[data-concept-field]').forEach(input=>input.addEventListener('input', ()=>{
    const key = input.dataset.conceptField;
    thread.conceptTouched = thread.conceptTouched||{};
    thread.conceptTouched[key] = true;
    applyConceptField(thread, key, input.value);
    persist(session);
  }));
  host.querySelector('[data-add-term]')?.addEventListener('click', ()=>{
    const last = thread.draftConcept.terms?.at(-1)?.date||'';
    thread.draftConcept.terms = [...(thread.draftConcept.terms||[]), {date:last, start:'07:00', end:'15:00', people:[], note:''}];
    thread.conceptTouched['term:'+(thread.draftConcept.terms.length-1)+':date'] = true;
    syncPlan(thread);persist(session);paint();
  });
  host.querySelectorAll('[data-drop-term]').forEach(button=>button.onclick=()=>{
    thread.draftConcept.terms = thread.draftConcept.terms.filter((_,index)=>index!==Number(button.dataset.dropTerm));
    syncPlan(thread);persist(session);paint();
  });
  host.querySelectorAll('[data-drop-person]').forEach(button=>button.onclick=()=>{
    const [index, personIndex] = button.dataset.dropPerson.split(':').map(Number);
    const term = thread.draftConcept.terms?.[index];
    if(!term) return;
    term.people = (term.people||[]).filter((_,at)=>at!==personIndex);
    thread.conceptTouched['term:'+index+':people'] = true;
    syncPlan(thread);persist(session);paint();
  });
  host.querySelectorAll('[data-add-person]').forEach(input=>{
    const add = ()=>{
      const name = input.value.trim();
      const index = Number(input.dataset.addPerson);
      const term = thread.draftConcept.terms?.[index];
      if(!name||!term) return;
      term.people = [...(term.people||[]), name];
      thread.conceptTouched['term:'+index+':people'] = true;
      syncPlan(thread);persist(session);paint();
    };
    input.addEventListener('keydown', event=>{if(event.key==='Enter'){event.preventDefault();add();}});
    input.addEventListener('change', add);
  });
  host.querySelectorAll('[data-drop-material]').forEach(button=>button.onclick=()=>{
    thread.draftConcept.materials = (thread.draftConcept.materials||[]).filter((_,index)=>index!==Number(button.dataset.dropMaterial));
    syncPlan(thread);persist(session);paint();
  });
  host.querySelector('[data-add-material]')?.addEventListener('click', ()=>{
    thread.draftConcept.materials = [...(thread.draftConcept.materials||[]), {name:'', quantity:'1', unit:'ks', readiness:'to_buy'}];
    syncPlan(thread);persist(session);paint();
  });
  refreshDurationTotals(host);
}
function applyConceptField(thread, key, value){
  const concept = thread.draftConcept;
  if(concept?.kind==='protocol'){
    if(key==='work') concept.work = value;
    else {
      const [group, index, field] = key.split(':');
      if(group==='material'&&concept.materials?.[index]&&(field==='quantity'||field==='choiceId')) concept.materials[index][field] = value;
    }
    syncProtocol(thread);
    return;
  }
  const [group, index, field] = key.split(':');
  if(group==='title') concept.title = value;
  else if(group==='notes') concept.notes = value;
  else if(group==='customerName') concept.customerName = value;
  else if(group==='address') concept.address = value;
  else if(group==='city') concept.city = value;
  else if(group==='term'&&concept.terms?.[index]){
    if(field==='people') concept.terms[index].people = value.split(',').map(item=>item.trim()).filter(Boolean);
    else if(field==='start'||field==='end') concept.terms[index][field] = clockValue(value);
    else concept.terms[index][field] = value;
  }else if(group==='material'&&concept.materials?.[index]) concept.materials[index][field] = value;
  syncPlan(thread);
}
function syncPlan(thread){
  const concept = thread.draftConcept;
  if(!concept) return;
  if(concept.kind==='protocol') return syncProtocol(thread);
  thread.context = {...(thread.context||{}), plan:{...(thread.context?.plan||{}), title:concept.title, customer:concept.customerName||thread.context?.plan?.customer||'', customerName:concept.customerName||thread.context?.plan?.customerName||'', address:concept.address||'', city:concept.city||'', terms:concept.terms, materials:concept.materials||[]}};
}
function syncProtocol(thread){
  const concept = thread.draftConcept;
  if(!concept) return;
  const previous = thread.context?.protocol||{};
  thread.context = {...(thread.context||{}), jobId:concept.jobId||thread.context?.jobId||'', protocol:{
    jobId:concept.jobId||'',
    work:concept.work||'',
    asked:previous.asked||[],
    history:previous.history||[],
    materials:(concept.materials||[]).map(item=>({key:item.key, label:item.label, query:item.query, quantity:item.quantity===''||item.quantity==null?null:Number(String(item.quantity).replace(',','.')), unit:item.unit||'', generic:item.generic!==false, status:item.status||'', itemId:item.choiceId||item.itemId||'', choices:item.choices||[]}))
  }};
}
function adoptConcept(thread, concept){
  if(!concept) return;
  const touched = thread.conceptTouched||{};
  const sameKind = (thread.draftConcept?.kind||'')===(concept.kind||'');
  if(thread.draftConcept&&sameKind&&Object.keys(touched).length){
    thread.draftConcept = concept.kind==='protocol'?mergeProtocol(thread.draftConcept, concept, touched):mergeConcept(thread.draftConcept, concept, touched);
    thread.resultNotice = 'Ruční úpravy jsem nechal. Zkontrolujte je před uložením.';
  }else{
    thread.draftConcept = JSON.parse(JSON.stringify(concept));
    thread.conceptTouched = {};
    thread.resultNotice = '';
  }
  runtime.mobileTab = 'result';
  runtime.resultFresh = true;
  runtime.detail = null;
  if(concept.kind==='protocol') syncProtocol(thread);
  else syncPlan(thread);
}
function mergeProtocol(local, incoming, touched){
  const next = JSON.parse(JSON.stringify(incoming));
  if(touched.work) next.work = local.work;
  next.materials = (incoming.materials||[]).map((item,index)=>{
    const kept = local.materials?.[index];
    if(!kept) return item;
    const copy = {...item};
    if(touched[`material:${index}:quantity`]) copy.quantity = kept.quantity;
    if(touched[`material:${index}:choiceId`]) copy.choiceId = kept.choiceId;
    return copy;
  });
  return next;
}
function mergeConcept(local, incoming, touched){
  const next = JSON.parse(JSON.stringify(incoming));
  if(touched.title) next.title = local.title;
  if(touched.notes) next.notes = local.notes;
  if(touched.customerName) next.customerName = local.customerName;
  if(touched.address) next.address = local.address;
  if(touched.city) next.city = local.city;
  next.terms = (incoming.terms||[]).map((term,index)=>{
    const kept = local.terms?.[index];
    if(!kept) return term;
    const copy = {...term};
    for(const field of ['date','start','end','people','note']) if(touched[`term:${index}:${field}`]) copy[field] = kept[field];
    return copy;
  });
  if((local.terms||[]).length>(incoming.terms||[]).length) next.terms.push(...local.terms.slice(incoming.terms.length));
  return next;
}
function statusLabel(){return runtime.busy?'Pracuji':'Připraven k práci';}
function historyPopover(shown, total, thread){
  return `<div class="assistant-popover assistant-history" aria-label="Historie konverzací"><label class="assistant-search">Hledat<input data-query value="${esc(runtime.query)}" placeholder="Hledat konverzaci"></label><div class="assistant-thread-list">${shown.map(item=>`<div class="assistant-thread ${item.id===thread?.id?'is-current':''}"><button type="button" data-thread="${esc(item.id)}"><span>${esc(item.title)}</span><small>${esc(dayLabel(item.updatedAt))}</small></button><button type="button" data-rename="${esc(item.id)}" aria-label="Přejmenovat">✎</button><button type="button" data-delete="${esc(item.id)}" aria-label="Smazat konverzaci">×</button></div>`).join('')||'<p class="assistant-empty">Zatím tu žádný chat není.</p>'}${total>shown.length?`<p class="assistant-more">Dalších ${total-shown.length} je v zařízení.</p>`:''}</div></div>`;
}
function menuPopover(){
  return `<div class="assistant-popover assistant-menu" aria-label="Možnosti asistenta"><p>Režim</p><div class="assistant-modes"><button type="button" data-mode="basic" aria-pressed="${runtime.mode!=='local'}">Základní</button><button type="button" data-mode="local" aria-pressed="${runtime.mode==='local'}">V zařízení</button></div>${runtime.mode==='local'?localCard():'<p class="assistant-empty">Základní režim nepotřebuje stažený model.</p>'}</div>`;
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
  if(item.role==='user') return `<div class="assistant-row mine"><div class="assistant-user">${esc(item.text)}<time>${esc(clock(item.at))}</time></div><span class="assistant-avatar" aria-hidden="true">${personIcon()}</span></div>`;
  const cards = (item.cards||[]).map(card=>cardView(card)).join('');
  const suggestions = (item.suggestions||[]).map(text=>`<button type="button" data-quick="${esc(text)}">${esc(suggestionLabel(text))}</button>`).join('');
  const concept = item.concept?conceptCard(item.concept):'';
  const confirmLabel = item.concept?.kind==='protocol'?'Uložit do protokolu':'Potvrdit a vytvořit';
  const confirm = item.confirm?`<div class="assistant-confirm"><p>${esc(item.confirm.detail||item.text)}</p><div><button type="button" class="yes" data-confirm="${esc(item.confirm.id)}">${confirmLabel}</button><button type="button" data-cancel="${esc(item.confirm.id)}">Zrušit</button></div></div>`:'';
  return `<div class="assistant-row"><span class="assistant-spark">${spark}</span><div class="assistant-answer"><div class="assistant-said"><p>${esc(item.text)}</p><time>${esc(clock(item.at))}</time></div>${cards}${concept}${confirm}${suggestions?`<p class="assistant-next-label">Co chcete udělat dál?</p><div class="assistant-next">${suggestions}</div>`:''}</div></div>`;
}
function suggestionLabel(text){
  if(text==='Zobraz jeho zakázky') return 'Zobrazit zakázky';
  return text;
}
function conceptCard(){
  return '<article class="assistant-concept"><p>Koncept je otevřený v panelu Výsledek. Upravte ho tam a uložte až tlačítkem.</p></article>';
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
    <header><span class="assistant-card-mark">${spark}</span><div><strong>${esc(detail.card.title||kind)}</strong><p>${kind}</p></div>${current()?.draftConcept?'<button type="button" data-back-result>Zpět ke konceptu</button>':''}<button type="button" data-close-detail aria-label="Zavřít panel">×</button></header>
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
  if(!card?.id||!['customer','job','material'].includes(card.type)) return;
  if(full){
    if(card.type==='customer') api.openCustomer?.(card.id);
    if(card.type==='job') api.openJob?.(card.id);
    if(card.type==='material') api.openMaterial?.(card.id);
    return;
  }
  runtime.detail = {card, loading:true, record:null, jobs:[], error:''};
  runtime.mobileTab = 'result';
  runtime.resultFresh = true;
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
async function ask(text, api, paint, confirmId, cancelId, file, concept){
  const session = api.getSession();
  const clean = String(text||'').trim();
  if((!confirmId&&!cancelId&&!clean&&!file)||runtime.busy) return;
  const thread = ensureThread(session);
  if(!confirmId&&!cancelId) push(session, 'user', file?`Soubor ${file.name}${clean?': '+clean:''}`:clean);
  const generation = ++runtime.generation;
  runtime.busy = true; paint();
  let commandText = clean;
  const alive = ()=>generation===runtime.generation;
  try{
    if(session?.rolePreview?.active&&(confirmId||cancelId)){if(alive()) push(session,'assistant','V náhledu role změny neukládám.');return;}
    if(!confirmId&&!cancelId&&!file&&runtime.mode==='local'){
      const model = localMinistral();
      if(!model.snapshot().installed){if(alive()) push(session,'assistant','Ministral 3B v prohlížeči není. Používám základní režim, který bere jen data z evidence.');}
      else{
        let answer = '';
        try{answer = await model.answer(clean);}catch(error){if(alive()) push(session,'assistant', (error?.message||'Ministral teď neodpověděl.')+' Pokračuji základním režimem.');answer='';}
        if(!alive()) return;
        const command = answer?extractLocalCommand(answer):'';
        if(answer&&!command){push(session,'assistant', `${answer}\n\nTohle není údaj z deníku. Jména, hodiny a ceny beru jen z evidence.`);return;}
        if(command){push(session,'assistant', `Rozumím tomu jako: ${command}`);commandText = command;}
      }
    }
    if(!alive()) return;
    if(!navigator.onLine && !confirmId && !cancelId){
      if(file){push(session,'assistant','Soubor bez připojení neukládám. Až budete online, vložte ho znovu. Nic se teď nezměnilo.');return;}
      const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const command = contextualCommand(parseAssistantCommand(commandText, today), thread.context);
      let jobs = null;
      try{const cached = await peekCachedJobs(`/api/jobs?state=all&order=schedule&month=${today.slice(0,7)}`);jobs = cached?.jobs ?? null;}catch{jobs = null;}
      const tomorrowDate = new Date(today+'T12:00:00Z');tomorrowDate.setUTCDate(tomorrowDate.getUTCDate()+1);
      const local = answerOffline(command, {jobs, today, tomorrow:tomorrowDate.toISOString().slice(0,10)});
      if(alive()) push(session,'assistant', local.missing?local.reply+' Údaje jsou z poslední uložené kopie.':local.reply);
      return;
    }
    if(!navigator.onLine){if(alive()) push(session,'assistant','Potvrzení bez připojení neodešlu. Nic se neuložilo.');return;}
    const data = await api.db.request('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:commandText, mode:'basic', ...(thread.context?{context:thread.context}:{}), ...(file?{file}:{}), ...(confirmId?{confirmId}:{}), ...(cancelId?{cancelId}:{}), ...(concept?{concept}:{})})});
    if(!alive()) return;
    push(session,'assistant', data.reply||'Hotovo.', {confirm:data.confirm||null, suggestions:data.suggestions||[], cards:data.cards||[], concept:data.concept||null, context:data.context||thread.context});
    if(data.concept) adoptConcept(current(), data.concept);
    if(data.cards?.length&&!data.concept){runtime.mobileTab='result';runtime.resultFresh=true;}
    if(data.mutated){const live=current(); if(live){live.draftConcept=null;live.conceptTouched={};} runtime.detail=null; api.onChanged?.(data.mutated);}
  }catch(error){
    if(!alive()) return;
    const offline = !navigator.onLine||error?.status===0||/fetch|network|Failed/i.test(error?.message||'');
    const kept = current()?.draftConcept?' Rozpracovaný koncept zůstává v zařízení. Až se připojení vrátí, můžete ho upravit nebo uložit znovu.':'';
    push(session,'assistant', (offline?'Potřebná data nejsou v zařízení. Připojte se a příkaz zopakujte. Rozpracované změny deníku zůstávají beze změny.':(error?.message||'Asistent teď neodpověděl.'))+kept);
  }finally{if(alive()){runtime.busy=false;paint();}}
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
function chatIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H10l-4 3v-3H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/></svg>';}
function eyeIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.4"/></svg>';}
function personIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5.5 19c1.2-2.6 3.4-4 6.5-4s5.3 1.4 6.5 4"/></svg>';}
function chevron(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';}
function trash(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12"/></svg>';}
function calendar(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>';}
function layers(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4"/></svg>';}
function sprinkler(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v9M8 20h8M7 8c1.5 1 2.5 1 4 0s2.5-1 4 0M5 5c2 1.2 3.2 1.2 5 0"/></svg>';}
function minus(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>';}
function clockIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>';}
function panelIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 5v14"/></svg>';}
function moreIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/></svg>';}
function clip(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 8-6.5 6.5a2 2 0 0 1-3-3L13 5a3.5 3.5 0 0 1 5 5l-7 7a5 5 0 0 1-7-7L12 2"/></svg>';}
function mic(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/></svg>';}
function send(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 14-7-4 14-3-5-7-2z"/></svg>';}
