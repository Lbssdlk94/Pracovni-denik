import {createDrive,DRIVE_SCOPE,driveRandom,driveHash,driveSeal,driveOpen,driveBase64} from './drive-core.js';
export async function handleDrive(request,env,ctx,m,h){
 const {one,all,execute,body,json,fail,cleanText}=h,d=createDrive(env,h),url=new URL(request.url),path=url.pathname;
 const readBody=async(input,max)=>{const value=await body(input,max);if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Neplatné údaje požadavku.');return value;};
 await d.manager(m);const control=await d.controllerRow(),redirectUri=(env.PUBLIC_APP_URL||url.origin).replace(/\/$/,'')+'/api/drive/oauth/callback';
 const cookieName='__Host-zavlahy-drive-oauth';
 const cookie=value=>`${cookieName}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${value?600:0}`;
 const callbackResponse=result=>new Response(null,{status:303,headers:{location:m._nativeDrive?'pracovnidenik://drive-callback?result='+result+'&state='+encodeURIComponent(m._nativeDrive.state):'/?drive='+result,'set-cookie':cookie(''),'cache-control':'no-store','referrer-policy':'no-referrer'}});
 if(path==='/api/drive/native-start'&&request.method==='GET'){
  const native=m._nativeDrive;if(!native?.bootstrap||control.version!==native.row.control_version)fail(401,'Předání připojení vypršelo.');
  const binding=driveRandom(),claim=await execute(env.DB,'UPDATE drive_oauth_states SET binding_hash=? WHERE hash=? AND binding_hash=? AND consumed=0 AND expires_at>?',await driveHash(binding),native.row.hash,native.row.binding_hash,Date.now());if(!claim.meta.changes)fail(401,'Předání už bylo použité.');
  const config=await d.config();if(!config)fail(503,'Není nastavený Google OAuth.');const conn=native.row.mode==='pick'?await d.connection(native.row.connection_id):null,auth=await driveAuthorizationURL(config,redirectUri,native.row.mode,native.state,native.payload.verifier,conn?.email);
  return new Response(null,{status:303,headers:{location:auth.href,'set-cookie':cookie(binding),'cache-control':'no-store','referrer-policy':'no-referrer'}});
 }
 if(path==='/api/drive/oauth/callback'){
  try{
   const state=url.searchParams.get('state')||'',hash=await driveHash(state),binding=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'',row=await one(env.DB,'SELECT * FROM drive_oauth_states WHERE hash=?',hash);
   if(!row||row.user_id!==m.user_id||row.binding_hash!==await driveHash(binding)||row.expires_at<Date.now()||row.consumed||control.version!==row.control_version)fail(400,'Přihlášení vypršelo.');
   const consumed=await execute(env.DB,'UPDATE drive_oauth_states SET consumed=1 WHERE hash=? AND consumed=0 AND expires_at>?',hash,Date.now());if(!consumed.meta.changes)fail(400,'Přihlášení už bylo použité.');
   if(url.searchParams.has('error'))return callbackResponse('cancelled');
   const config=await d.config(),code=url.searchParams.get('code');if(!code||!config)fail(400,'Chybí autorizace.');
   const opened=await driveOpen(env,row.verifier,'drive-oauth-state:'+hash),verifier=opened?.native?opened.verifier:opened,tokens=await d.oauth({client_id:config.clientId,client_secret:config.clientSecret,code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:redirectUri});if(tokens.error)fail(400,'Autorizace se nepodařila.');
   const about=await d.http('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)',{headers:{authorization:'Bearer '+tokens.access_token}});if(!about.ok)fail(400,'Google neposkytl přístup k Disku.');const user=(await about.json()).user;if(!user?.permissionId||!user.emailAddress)fail(400,'Nelze určit Google účet.');
   const id=await driveHash(config.clientId+'|'+user.permissionId),old=await one(env.DB,'SELECT * FROM drive_connections WHERE id=?',id);
   if(row.mode==='pick'&&row.connection_id!==id)fail(400,'Byl vybraný jiný účet.');
   const previous=old?.credentials?await driveOpen(env,old.credentials,'drive-connection:'+id):null,refreshToken=tokens.refresh_token||previous?.refreshToken;if(!refreshToken)fail(400,'Chybí oprávnění k obnovování přístupu.');
   const credentials=await driveSeal(env,{clientId:config.clientId,clientSecret:config.clientSecret,accessToken:tokens.access_token,refreshToken},'drive-connection:'+id);
   let rootId=old?.root_id||null,rootName=old?.root_name||null;
   if(row.mode==='pick'){
    const ids=(url.searchParams.get('picked_file_ids')||'').split(',');if(ids.length!==1||!/^[-\w]{1,200}$/.test(ids[0]))fail(400,'Vyberte jednu složku.');
    const r=await d.http('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(ids[0])+'?fields=id,name,mimeType,trashed,ownedByMe,driveId,capabilities(canAddChildren),permissions(type,role)',{headers:{authorization:'Bearer '+tokens.access_token}});if(!r.ok)fail(400,'Vybraná složka není přístupná.');const folder=await r.json();if(folder.mimeType!=='application/vnd.google-apps.folder'||folder.trashed||!folder.ownedByMe||folder.driveId||folder.capabilities?.canAddChildren===false||!Array.isArray(folder.permissions)||folder.permissions.some(p=>p.type!=='user'||p.role!=='owner'))fail(400,'Vyberte soukromou složku Můj disk.');rootId=folder.id;rootName=folder.name;
   }
   const op=driveRandom(),now=Date.now(),gate="EXISTS(SELECT 1 FROM drive_control WHERE id='team' AND last_operation=?)";
   const results=await env.DB.batch([
    env.DB.prepare("UPDATE drive_control SET active_connection_id=?,version=version+1,last_operation=? WHERE id='team' AND version=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ('owner','administrator','admin'))").bind(id,op,row.control_version,m.user_id),
    env.DB.prepare(`INSERT INTO drive_connections(id,account_id,email,credentials,expires_at,root_id,root_name,state,version,updated_at,updated_by) SELECT ?,?,?,?,?,?,?,'connected',1,?,? WHERE ${gate} ON CONFLICT(id) DO UPDATE SET email=excluded.email,credentials=excluded.credentials,expires_at=excluded.expires_at,root_id=excluded.root_id,root_name=excluded.root_name,state='connected',version=drive_connections.version+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(id,user.permissionId,user.emailAddress,credentials,now+tokens.expires_in*1000,rootId,rootName,now,m.user_id,op)
   ]);if(!results[0].meta.changes)fail(409,'Nastavení bylo mezitím změněno.');return callbackResponse(row.mode==='pick'?'folder':'connected');
  }catch{return callbackResponse('error');}
 }
 if(path==='/api/drive/status'&&request.method==='GET'){
  const config=d.configuredKey()?await d.config():null,connections=await all(env.DB,'SELECT id,email,state,root_id,root_name FROM drive_connections ORDER BY updated_at DESC');
  return json({nativeOAuth:true,keyReady:d.configuredKey(),configured:!!config,clientId:config?.clientId||'',redirectUri,version:control.version,activeId:control.active_connection_id,connections:connections.map(c=>({id:c.id,email:c.email,state:c.state,rootId:c.root_id,rootName:c.root_name})),owner:m.role==='owner'});
 }
 if(!d.configuredKey())fail(503,'Server zatím nemá nastavený šifrovací klíč pro Google Disk.');
 if(path==='/api/drive/config'&&request.method==='PUT'){
  await d.manager(m,true);const b=await readBody(request,8000),clientId=cleanText(b.clientId,250,true),clientSecret=cleanText(b.clientSecret,2000,true);if(!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId))fail(400,'Vložte OAuth Client ID webové aplikace od Googlu.');if(!Number.isInteger(b.version)||b.version!==control.version)fail(409,'Nastavení změnil jiný správce. Obnovte stránku.');
  const config=await driveSeal(env,{clientId,clientSecret},'drive-config'),r=await execute(env.DB,"UPDATE drive_control SET config=?,version=version+1,last_operation=NULL WHERE id='team' AND version=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND role='owner')",config,b.version,m.user_id);if(!r.meta.changes)fail(409,'Nastavení změnil jiný správce.');return json({ok:true});
 }
 if(path==='/api/drive/connect'&&request.method==='POST'){
  const b=await readBody(request,2000),mode=b.mode||'connect';if(!['connect','pick'].includes(mode))fail(400,'Neplatná volba připojení.');const config=await d.config();if(!config)fail(503,'Nejdříve nastavte Google OAuth přihlašovací údaje.');
  let conn=null;if(mode==='pick'){if(!control.active_connection_id)fail(400,'Nejdříve připojte Google účet.');conn=await d.connection(control.active_connection_id);}
  if(b.native!==undefined&&typeof b.native!=='boolean')fail(400,'Neplatná volba klienta.');if(b.native&&!m.access_session_id)fail(403,'Nativní připojení vyžaduje firemní přihlášení heslem.');
  const state=driveRandom(),hash=await driveHash(state),binding=driveRandom(),verifier=driveRandom(),sealed=b.native?{native:true,verifier,session:m.access_session_id,origin:env.WORKSPACE_ENTRY_ORIGIN||url.origin,entry:env.WORKSPACE_ENTRY_ID||''}:verifier;
  await execute(env.DB,'INSERT INTO drive_oauth_states(hash,user_id,binding_hash,verifier,mode,connection_id,control_version,expires_at,consumed) VALUES(?,?,?,?,?,?,?,?,0)',hash,m.user_id,await driveHash(binding),await driveSeal(env,sealed,'drive-oauth-state:'+hash),mode,conn?.id||null,control.version,Date.now()+600000);ctx.waitUntil(execute(env.DB,'DELETE FROM drive_oauth_states WHERE expires_at<?',Date.now()-86400000));
  if(b.native){const link=new URL((env.WORKSPACE_ENTRY_ORIGIN||url.origin)+'/api/drive/native-start');link.searchParams.set('state',state);link.searchParams.set('grant',binding);return json({url:link.href});}
  const auth=await driveAuthorizationURL(config,redirectUri,mode,state,verifier,conn?.email),r=json({url:auth.href});r.headers.set('set-cookie',cookie(binding));return r;
 }
 if(path==='/api/drive/root'&&request.method==='POST'){
  const b=await readBody(request,1000);if(b.version!==control.version)fail(409,'Nastavení změnil jiný správce. Obnovte stránku.');const conn=await d.connection(control.active_connection_id),folder=await d.folder(conn,'','root','default',null,'ZÁVLAHY');await d.privateFolder(conn.id,folder.file_id);const op=driveRandom();const results=await env.DB.batch([
   env.DB.prepare("UPDATE drive_control SET version=version+1,last_operation=? WHERE id='team' AND version=? AND active_connection_id=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ('owner','administrator','admin'))").bind(op,control.version,conn.id,m.user_id),
   env.DB.prepare("UPDATE drive_connections SET root_id=?,root_name=?,version=version+1 WHERE id=? AND EXISTS(SELECT 1 FROM drive_control WHERE id='team' AND last_operation=?)").bind(folder.file_id,folder.name,conn.id,op)
  ]);if(!results[0].meta.changes)fail(409,'Nastavení bylo změněno. Složka zůstala na Disku.');return json({ok:true});
 }
 if(path==='/api/drive/check'&&request.method==='POST'){
  const conn=await d.connection(control.active_connection_id);if(conn.root_id)await d.privateFolder(conn.id,conn.root_id);else await d.access(conn.id);return json({ok:true});
 }
 if(path==='/api/drive/disconnect'&&request.method==='POST'){
  const b=await readBody(request,2000);if(b.confirm!=='DISCONNECT_GOOGLE_DRIVE'||b.version!==control.version)fail(409,'Potvrďte odpojení aktuálního připojení.');const rows=await all(env.DB,"SELECT * FROM drive_connections WHERE credentials IS NOT NULL"),op=driveRandom();const result=await env.DB.batch([
   env.DB.prepare("UPDATE drive_control SET active_connection_id=NULL,version=version+1,last_operation=? WHERE id='team' AND version=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ('owner','administrator','admin'))").bind(op,control.version,m.user_id),
   env.DB.prepare("UPDATE drive_connections SET credentials=NULL,state='disconnected',expires_at=0,version=version+1 WHERE EXISTS(SELECT 1 FROM drive_control WHERE id='team' AND last_operation=?)").bind(op)
  ]);if(!result[0].meta.changes)fail(409,'Nastavení bylo změněno. Obnovte stránku.');
  ctx.waitUntil(Promise.all(rows.map(async row=>{try{const c=await driveOpen(env,row.credentials,'drive-connection:'+row.id);await d.http('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:c.refreshToken})});}catch{}})));return json({ok:true});
 }
 fail(404,'Nastavení Google Disku nebylo nalezeno.');
}

// OAuth-only handoff: never creates a browser session for the diary itself.
export async function nativeDriveMember(request,env,{one,fail}){
 const url=new URL(request.url),start=url.pathname==='/api/drive/native-start',callback=url.pathname==='/api/drive/oauth/callback';
 if(request.method!=='GET'||!start&&!callback)return null;
 const state=url.searchParams.get('state')||'';if(!/^[-\w]{43}$/.test(state)){if(start)fail(401,'Neplatné předání připojení.');return null;}
 const row=await one(env.DB,'SELECT * FROM drive_oauth_states WHERE hash=?',await driveHash(state));
 if(!row){if(start)fail(401,'Předání připojení vypršelo.');return null;}
 let payload;try{payload=await driveOpen(env,row.verifier,'drive-oauth-state:'+row.hash);}catch{if(start)fail(401,'Neplatné předání připojení.');return null;}
 if(payload?.native!==true){if(start)fail(401,'Neplatný druh předání.');return null;}
 const effectiveOrigin=env.WORKSPACE_ENTRY_ORIGIN||url.origin;
 if(payload.origin!==effectiveOrigin||payload.entry!==(env.WORKSPACE_ENTRY_ID||'')||row.expires_at<Date.now()||row.consumed)fail(401,'Předání připojení vypršelo.');
 const proof=start?url.searchParams.get('grant')||'':(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-zavlahy-drive-oauth='))?.slice('__Host-zavlahy-drive-oauth='.length)||'';
 if(!/^[-\w]{43}$/.test(proof)||await driveHash(proof)!==row.binding_hash)fail(401,'Předání není svázané s tímto oknem.');
 const member=await one(env.DB,"SELECT m.*,s.id AS access_session_id,c.must_change AS password_must_change FROM access_sessions s JOIN members m ON m.user_id=s.user_id JOIN local_credentials c ON c.user_id=m.user_id WHERE s.id=? AND s.user_id=? AND s.expires_at>? AND s.revoked_at IS NULL AND s.auth_method='password' AND s.password_version=c.version",payload.session,row.user_id,Date.now());
 if(!member||member.password_must_change||!['owner','administrator','admin'].includes(member.role))fail(401,'Přihlášení nebo oprávnění správce se změnily.');
 return {...member,_authMethod:'password',_nativeDrive:{row,payload,state,bootstrap:start}};
}
async function driveAuthorizationURL(config,redirectUri,mode,state,verifier,email){
 const challenge=driveBase64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))),auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [key,value]of Object.entries({client_id:config.clientId,redirect_uri:redirectUri,response_type:'code',scope:DRIVE_SCOPE,access_type:'offline',prompt:mode==='pick'?'consent':'select_account consent',state,code_challenge:challenge,code_challenge_method:'S256',...(mode==='pick'?{trigger_onepick:'true',allow_folder_selection:'true',allow_multiple:'false',mimetypes:'application/vnd.google-apps.folder',login_hint:email}:{})}))auth.searchParams.set(key,value);
 return auth;
}
