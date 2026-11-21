import {ASSISTANT_MODES, assistantSuggestions, parseAssistantCommand} from './assistant-commands.js?v=assistant-v2';
import {answerOffline} from './assistant-offline.js?v=assistant-v2';
import {peekCachedJobs} from './cloud.js?v=assistant-v2';

function historyKey(session){
  const user = session?.user?.id || 'anonymous';
  const company = session?.installation?.id || session?.workspace?.workspaceId || 'company';
  return `pd-assistant-history-v2:${company}:${user}`;
}
const esc = value => String(value??'').replace(/[&<>"']/g, char=>({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'}[char]));

function loadHistory(session){
  try{const value = JSON.parse(localStorage.getItem(historyKey(session))||'[]');return Array.isArray(value)?value.slice(-40):[];}
  catch{return [];}
}
function saveHistory(session, items){
  try{localStorage.setItem(historyKey(session), JSON.stringify(items.slice(-40)));}catch{/* soukromý režim */ }
}

export function mountWorkAssistant({db, getSession, onChanged}={}){
  const existing = document.querySelector('#assistant-root');
  if(!getSession?.()?.user){existing?.remove();return;}
  if(existing) return;
  const root = document.createElement('div');
  root.id = 'assistant-root';
  document.body.appendChild(root);
  const state = {open:false, mode:'basic', busy:false, listening:false, items:[], recognition:null, scope:''};
  const remember = ()=>{
    const session = getSession();
    const scope = historyKey(session);
    if(scope!==state.scope){state.scope=scope;state.items=loadHistory(session);state.mode='basic';}
  };
  const Speech = window.SpeechRecognition||window.webkitSpeechRecognition;
  const paint = ()=>{
    remember();
    const session = getSession();
    if(!session?.user){root.replaceChildren();return;}
    const mode = ASSISTANT_MODES.find(item=>item.id===state.mode)||ASSISTANT_MODES[0];
    if(!state.open){
      root.innerHTML = `<button type="button" class="assistant-launch" aria-label="Otevřít pracovního asistenta"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.6 4.8L18 9.5l-4.4 1.6L12 16l-1.6-4.9L6 9.5l4.4-1.7L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z"/></svg></button>`;
      root.querySelector('button').onclick = ()=>{state.open=true;paint();};
      return;
    }
    const quick = assistantSuggestions().map(text=>`<button type="button" data-quick="${esc(text)}">${esc(text)}</button>`).join('');
    const messages = state.items.map(item=>`<div class="assistant-bubble ${item.role}">${esc(item.text)}${item.confirm&&item.role==='assistant'?`<div class="assistant-confirm"><button type="button" class="yes" data-confirm="${esc(item.confirm.id)}">Potvrdit</button><button type="button" data-cancel="${esc(item.confirm.id)}">Zrušit</button></div>`:''}${item.suggestions?.length?item.suggestions.map(text=>`<button type="button" data-quick="${esc(text)}">${esc(text)}</button>`).join(''):''}</div>`).join('');
    root.innerHTML = `<section class="assistant-panel" role="dialog" aria-label="Pracovní asistent">
      <header class="assistant-head"><span class="assistant-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l1.6 4.8L18 9.5l-4.4 1.6L12 16l-1.6-4.9L6 9.5l4.4-1.7L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z"/></svg></span><div><strong>Pracovní asistent</strong><p class="assistant-mode">${esc(mode.label)}. ${esc(mode.detail)}</p></div><button type="button" class="assistant-close" data-close aria-label="Zavřít">×</button></header>
      <div class="assistant-log">${messages||'<div class="assistant-bubble assistant">Napište běžný příkaz, nebo klepněte na rychlou akci. Změny se neuloží, dokud je nepotvrdíte.</div>'}</div>
      <div class="assistant-modes" aria-label="Režim">${ASSISTANT_MODES.map(item=>`<button type="button" data-mode="${item.id}" aria-pressed="${item.id===mode.id}" ${item.available?'':'disabled'}>${esc(item.label)}${item.available?'':' · nedostupné'}</button>`).join('')}</div>
      <div class="assistant-quick">${quick}</div>
      <form class="assistant-form"><textarea rows="1" maxlength="500" aria-label="Příkaz" placeholder="Například: Co máme dnes za práci?"></textarea>${Speech?`<button type="button" class="voice" data-voice aria-pressed="${state.listening}" aria-label="Hlasové zadání">Mluvit</button>`:''}<button type="submit" ${state.busy?'disabled':''}>Odeslat</button></form>
    </section>`;
    const log = root.querySelector('.assistant-log');
    log.scrollTop = log.scrollHeight;
    root.querySelector('[data-close]').onclick = ()=>{stop();state.open=false;paint();};
    root.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{const next=ASSISTANT_MODES.find(item=>item.id===button.dataset.mode);if(!next?.available){push('assistant', next?.detail||'Tento režim je nedostupný.');return;}state.mode=next.id;paint();});
    root.querySelectorAll('[data-quick]').forEach(button=>button.onclick=()=>ask(button.dataset.quick));
    root.querySelector('[data-cancel]')?.addEventListener('click', event=>ask('', '', event.currentTarget.dataset.cancel));
    root.querySelector('[data-confirm]')?.addEventListener('click', event=>ask('', event.currentTarget.dataset.confirm));
    const form = root.querySelector('form'), field = form.querySelector('textarea');
    form.onsubmit = event=>{event.preventDefault();ask(field.value);};
    root.querySelector('[data-voice]')?.addEventListener('click', ()=>toggleVoice(field));
    field.focus();
  };
  function push(role, text, extra={}){
    state.items.push({role, text, ...extra});
    state.items = state.items.slice(-40);
    saveHistory(getSession(), state.items.map(({role,text})=>({role,text})));
    paint();
  }
  function stop(){state.recognition?.stop();state.listening=false;}
  function toggleVoice(field){
    if(!Speech) return;
    if(state.listening){stop();paint();return;}
    const recognition = new Speech();
    recognition.lang = 'cs-CZ';
    recognition.interimResults = false;
    recognition.onresult = event=>{field.value = event.results[0][0].transcript;ask(field.value);};
    recognition.onerror = ()=>push('assistant','Hlasové zadání teď není dostupné. Příkaz napište.');
    recognition.onend = ()=>{state.listening=false;if(state.open)paint();};
    state.recognition = recognition;
    state.listening = true;
    paint();
    try{recognition.start();}catch{state.listening=false;push('assistant','Mikrofon se nepodařilo zapnout.');}
  }
  async function ask(text, confirmId, cancelId){
    const clean = String(text||'').trim();
    if(!confirmId&&!cancelId&&!clean||state.busy) return;
    if(!confirmId&&!cancelId) push('user', clean);
    const selected = ASSISTANT_MODES.find(item=>item.id===state.mode)||ASSISTANT_MODES[0];
    if(!selected.available){push('assistant', selected.detail);return;}
    state.busy = true; paint();
    const session = getSession();
    try{
      if(session?.rolePreview?.active&&(confirmId||cancelId)){push('assistant','V náhledu role změny neukládám.');return;}
      if(!navigator.onLine && !confirmId && !cancelId){
        const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        const command = parseAssistantCommand(clean, today);
        let jobs = null;
        try{const cached = await peekCachedJobs(`/api/jobs?state=all&order=schedule&month=${today.slice(0,7)}`);jobs = cached?.jobs ?? null;}catch{jobs = null;}
        const tomorrowDate = new Date(today+'T12:00:00Z');tomorrowDate.setUTCDate(tomorrowDate.getUTCDate()+1);
        const local = answerOffline(command, {jobs, today, tomorrow:tomorrowDate.toISOString().slice(0,10)});
        push('assistant', local.reply);
        return;
      }
      if(!navigator.onLine){push('assistant','Potvrzení bez připojení neodešlu. Nic se neuložilo.');return;}
      const data = await db.request('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:clean, mode:state.mode, ...(confirmId?{confirmId}:{}), ...(cancelId?{cancelId}:{})})});
      push('assistant', data.reply||'Hotovo.', {confirm:data.confirm, suggestions:data.suggestions});
      if(data.mutated) onChanged?.(data.mutated);
    }catch(error){
      const offline = !navigator.onLine||error?.status===0||/fetch|network|Failed/i.test(error?.message||'');
      push('assistant', offline?'Potřebná data nejsou v zařízení. Připojte se a příkaz zopakujte. Rozpracované změny deníku zůstávají beze změny.':(error?.message||'Asistent teď neodpověděl.'));
    }finally{state.busy=false;paint();}
  }
  paint();
}
