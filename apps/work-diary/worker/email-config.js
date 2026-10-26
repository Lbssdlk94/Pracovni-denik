import {driveSeal,driveOpen,driveUnbase64} from './drive-core.js';
import {subOne} from './subscriptions.js';
const EMAIL_CONFIG_KEY='resend-config',EMAIL_CONFIG_AAD='zavlahovy-denik:resend-config:v1';
export function emailEncryptionReady(env){try{return driveUnbase64(env.DRIVE_TOKEN_ENCRYPTION_KEY||'').length===32;}catch{return false;}}
// Runtime-only credentials: never return this object from an API or put it in a log.
export async function readEmailConfiguration(env){
 const row=await subOne(env.DB,'SELECT value,version FROM settings WHERE key=?',EMAIL_CONFIG_KEY);
 if(row){
  let stored;try{stored=JSON.parse(row.value);}catch{return {config:null,version:row.version,source:'app',error:'encrypted_config_unavailable'};}
  if(stored.enabled===false)return {config:null,version:row.version,source:'disabled',from:stored.from||''};
  try{const config=await driveOpen(env,stored.cipher,EMAIL_CONFIG_AAD);if(typeof config.apiKey!=='string'||!config.apiKey||typeof config.from!=='string')throw Error();return {config,version:row.version,source:'app',from:config.from};}catch{return {config:null,version:row.version,source:'app',error:'encrypted_config_unavailable'};}
 }
 const config=env.RESEND_API_KEY&&env.SERVICE_EMAIL_FROM?{apiKey:env.RESEND_API_KEY,from:env.SERVICE_EMAIL_FROM}:null;
 return {config,version:0,source:config?'hosting':'none',from:config?.from||''};
}
export async function emailConfigurationHash(config){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([config.apiKey,config.from])))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function emailConfigured(env){return !!(await readEmailConfiguration(env)).config;}
export async function handleEmailConfiguration(request,env,m,h){
 const {json,fail,body}=h;if(!['owner','administrator','admin'].includes(m.role))fail(403,'Nastavení odesílání e-mailů je dostupné pouze správci a vlastníkovi.');
 const managerGate="EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ('owner','administrator','admin'))";
 const status=async()=>{if(!await subOne(env.DB,'SELECT user_id FROM members WHERE user_id=? AND role IN (\'owner\',\'administrator\',\'admin\')',m.user_id))fail(403,'Nemáte přístup k nastavení.');const c=await readEmailConfiguration(env);return {version:c.version,configured:!!c.config,keyStored:!!c.config,from:c.from||'',source:c.source,encryptionReady:emailEncryptionReady(env),error:c.error||null};};
 if(request.method==='GET')return json(await status());if(!['PUT','DELETE'].includes(request.method))fail(405,'Nepodporovaná operace.');
 const b=await body(request,5000);if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['version','apiKey','from'].includes(k))||!Number.isSafeInteger(b.version)||b.version<0)fail(400,'Zkontrolujte nastavení a obnovte jeho verzi.');
 const current=await readEmailConfiguration(env);if(current.version!==b.version)fail(409,'Nastavení mezitím změnil jiný správce. Obnovte ho před uložením.');
 let value;
 if(request.method==='DELETE')value={enabled:false,from:current.from||''};
 else{
  if(!emailEncryptionReady(env))fail(503,'Server nemá připravené bezpečné úložiště klíče. Kontaktujte vlastníka hostingu.');
  if(typeof b.from!=='string'||b.from.length>254||/[\r\n\u0000-\u001f\u007f]/.test(b.from))fail(400,'Zkontrolujte adresu odesílatele.');const from=b.from.trim(),address=from.match(/^(?:[^<>]+<([^<>]+)>|([^<>]+))$/),mail=address?.[1]||address?.[2];if(!mail||!/^([^\s@<>]+)@([^\s@<>]+)\.([^\s@<>]+)$/.test(mail)||address?.[1]&&mail!==mail.trim())fail(400,'Zadejte e-mail nebo Název firmy <e-mail> z ověřené domény Resend.');
  if(b.apiKey!==undefined&&typeof b.apiKey!=='string')fail(400,'Zkontrolujte API klíč.');const apiKey=b.apiKey?.trim()||current.config?.apiKey;if(!apiKey||!/^re_[A-Za-z0-9_-]{10,200}$/.test(apiKey))fail(400,'Vložte platný API klíč Resend začínající re_.');
  const cipher=await driveSeal(env,{apiKey,from},EMAIL_CONFIG_AAD);value={enabled:true,cipher};
 }
 const result=await env.DB.prepare(`INSERT INTO settings(key,value,version) SELECT ?,?,1 WHERE ${managerGate} AND (?=0 OR EXISTS(SELECT 1 FROM settings WHERE key=? AND version=?)) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=settings.version+1 WHERE settings.version=?`).bind(EMAIL_CONFIG_KEY,JSON.stringify(value),m.user_id,b.version,EMAIL_CONFIG_KEY,b.version,b.version).run();if(!result.meta.changes)fail(409,'Nastavení se změnilo nebo už nemáte oprávnění. Obnovte ho.');return json(await status());
}
