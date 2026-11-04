import {createPasswordUI} from './local-auth-ui.js?v=local-auth-v1';
import {DEFAULT_APP_NAME} from './app-brand.js?v=app-brand-v2';
const roles={owner:'Vlastník',administrator:'Administrátor',admin:'Správce',worker:'Pracovník',reader:'Čtenář'};
export function accessTokenFrom(value){
 const text=String(value||'').trim();if(/^[a-f0-9]{64}$/.test(text))return text;
 let url;try{url=new URL(text,location.origin);}catch{throw new Error('Vložte svůj osobní přístupový odkaz od správce.');}
 const token=new URLSearchParams(url.hash.slice(1)).get('access');if(url.origin!==location.origin||url.username||url.password||!token||!/^[a-f0-9]{64}$/.test(token))throw new Error('Použijte osobní odkaz do této aplikace, který vám poslal správce.');return token;
}
export function createAccessUI({app,esc,db,onReady,onBeforeSwitch=async()=>{}}){
 const brand=()=>`<img src="./logo-dr-zavlaha.jpg" alt="${esc(DEFAULT_APP_NAME)}"><h1>${esc(DEFAULT_APP_NAME)}</h1>`;
 async function chatGPT(e){e.preventDefault();const link=e.currentTarget;try{await db.checkChatGPTSwitch();await onBeforeSwitch(null);await db.request('/api/access-logout',{method:'POST'});window.open(link.href,'_top');}catch(error){app.querySelector('.access-error').textContent=error.message;}}
 function legacyLogin(error){
  app.innerHTML=`<main class="login-page">${brand()}<p>${esc(['pending_account','workspace_recovery_failed','client_update_required'].includes(error?.code)?error.message:error?.code==='link_invalid'?error.message:error?.status===403?'Tento účet zatím nemá přístup do týmu. Požádejte správce o pozvánku.':'Otevřete svůj osobní odkaz od správce, nebo se přihlaste přes ChatGPT.')}</p><form id="access-form"><label class="field">Osobní přístupový odkaz<input id="access-link" type="text" maxlength="2000" required autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Vložte odkaz od správce"></label><button type="submit" class="btn primary">Otevřít osobní přístup</button></form><p class="mini-empty">Kolegové s osobním odkazem nepotřebují ChatGPT ani heslo.</p><p class="access-error form-message" role="alert"></p><div class="access-divider">nebo</div><a class="btn" href="/signin-with-chatgpt?return_to=%2F" target="_top" id="access-chatgpt">Přihlásit se přes ChatGPT</a></main>`;
  app.querySelector('#access-chatgpt').onclick=chatGPT;
  app.querySelector('#access-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await open(accessTokenFrom(app.querySelector('#access-link').value));}catch(error){app.querySelector('.access-error').textContent=error.message;}finally{button.disabled=false;}};
 }
 async function open(token){
  app.innerHTML=`<main class="login-page">${brand()}<p>Ověřuji osobní přístup…</p></main>`;
  history.replaceState(null,'',location.pathname+location.search);
  let info;try{info=await db.request('/api/access-info',{method:'POST',timeoutMs:15000,headers:{'content-type':'application/json'},body:JSON.stringify({token})});}catch(error){if(error.status===401){login(error);return;}app.innerHTML=`<main class="login-page">${brand()}<h2>Pozvánku se nepodařilo načíst</h2><p class="access-error" role="alert">${esc(error.message)}</p><button class="btn primary" id="access-retry">Zkusit znovu</button><p>Odkaz otevřete přímo v Safari nebo Chrome.</p></main>`;app.querySelector('#access-retry').onclick=()=>open(token);return;}
  app.innerHTML=`<main class="login-page">${brand()}<h2>Osobní přístup bez ChatGPT</h2><p>Otevíráte přístup pro <strong>${esc(info.email)}</strong>.</p><p>Oprávnění: <strong>${esc(roles[info.role]||info.role)}</strong></p><button type="button" class="btn primary" id="access-open">Otevřít aplikaci</button><p class="mini-empty">${info.oneTime?'Pozvánka je jednorázová. Po otevření zůstanete přihlášeni na tomto zařízení; pro další zařízení požádejte správce o novou.':'Starší přístupový odkaz má omezenou platnost. Nesdílejte ho s ostatními.'}</p><p class="access-error form-message" role="alert"></p><button type="button" class="text-link" id="access-cancel">Zpět na přihlášení</button></main>`;
  app.querySelector('#access-cancel').onclick=()=>login();
  app.querySelector('#access-open').onclick=async e=>{
   const button=e.currentTarget;button.disabled=true;
   try{await db.checkAccountSwitch(info.userId,info);if(window.top!==window.self){window.open(location.origin+'/#access='+token,'_top');return;}await onBeforeSwitch(info.userId);await db.request('/api/access-link',{method:'POST',timeoutMs:15000,headers:{'content-type':'application/json'},body:JSON.stringify({token})});const current=await db.request('/api/me').catch(error=>{if(error.status===401){throw new Error('Prohlížeč neuložil osobní přístup. Otevřete původní odkaz přímo v Safari nebo Chrome a povolte cookies pro tuto aplikaci.');}throw error;});if(current.user.id!==info.userId||current.user.authMethod!=='link')throw new Error('Osobní přístup se nepodařilo ověřit. Otevřete původní odkaz přímo v Safari nebo Chrome.');history.replaceState(null,'',location.pathname);await onReady();}
   catch(error){if(app.querySelector('.access-error'))app.querySelector('.access-error').textContent=error.message;button.disabled=false;}
  };
 }
 const passwordUI=createPasswordUI({app,esc,db,brand,onReady,onBeforeSwitch,legacyLogin});
 function login(error){return passwordUI.login(error);}
 return {login,open};
}
