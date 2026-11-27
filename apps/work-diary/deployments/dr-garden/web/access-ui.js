import {createPasswordUI} from './local-auth-ui.js?v=session-startup-v1';
import {DEFAULT_APP_NAME} from './app-brand.js?v=app-brand-v2';
export function createAccessUI({app,esc,db,onReady,onBeforeSwitch=async()=>{}}){
 const brand=()=>`<img src="./irrigation-icon-180.png" alt="${esc(DEFAULT_APP_NAME)}"><h1>${esc(DEFAULT_APP_NAME)}</h1>`;
 async function chatGPT(e){e.preventDefault();const link=e.currentTarget;try{await db.checkChatGPTSwitch();await onBeforeSwitch(null);await db.request('/api/access-logout',{method:'POST'});window.open(link.href,'_top');}catch(error){app.querySelector('.access-error').textContent=error.message;}}
 function legacyLogin(error){
  app.innerHTML=`<main class="login-page">${brand()}<h2>Přihlášení přes ChatGPT</h2><p>Použijte účet, který má přístup do firmy.</p><p class="access-error form-message" role="alert">${esc(error?.code==='pending_account'?error.message:'')}</p><a class="btn primary" href="/signin-with-chatgpt?return_to=%2F" target="_top" id="access-chatgpt">Přihlásit se přes ChatGPT</a><button type="button" class="btn" id="access-password">Zpět na jméno a heslo</button></main>`;
  app.querySelector('#access-chatgpt').onclick=chatGPT;
  app.querySelector('#access-password').onclick=()=>login();
 }
 const passwordUI=createPasswordUI({app,esc,db,brand,onReady,onBeforeSwitch,legacyLogin});
 function login(error){return passwordUI.login(error);}
 async function open(){
  history.replaceState(null,'',location.pathname+location.search);
  return login({code:'access_link_disabled',message:'Přihlášení osobním odkazem bylo zrušeno. Použijte přihlašovací jméno a heslo.'});
 }
 return {login,open};
}
