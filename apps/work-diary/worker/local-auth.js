import {hashLocalPassword,verifyLocalPassword,localUsername,localPassword,temporaryPassword} from './password-crypto.js';
import {canAssignTeamRole,canEditTeamMember} from '../web/team-roles.js';
import {normalizeDisciplines} from '../web/discipline-model.js';
import {installationInfo} from './installation.js';
import {workspaceActor} from './workspace-policy.js';
const authEncoder=new TextEncoder(),AUTH_COOKIE='__Host-zavlahy-access';
const authHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',authEncoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const authRandom=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const authOne=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const authCookie=(response,token)=>{response.headers.set('set-cookie',AUTH_COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+30*86400);return response;};
export async function passwordOnly(env){return (await authOne(env,"SELECT value FROM settings WHERE key='local-auth-mode'"))?.value==='password';}
const authAudit=(env,actor,subject,kind)=>env.DB.prepare('INSERT INTO local_auth_events(id,actor_id,subject_id,kind,at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),actor,subject,kind,Date.now());
async function authRate(request,env,username,fail){
 const window=Math.floor(Date.now()/900000),ip=await authHash(request.headers.get('cf-connecting-ip')||'unknown'),name=await authHash(username);
 for(const [key,max]of [[ip,200],[ip+':'+name,12],['account:'+name,60]]){
  await env.DB.prepare('INSERT INTO local_auth_rates(key,window,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,attempts=CASE WHEN local_auth_rates.window=excluded.window THEN local_auth_rates.attempts+1 ELSE 1 END').bind(key,window).run();
  if((await authOne(env,'SELECT attempts FROM local_auth_rates WHERE key=?',key)).attempts>max)fail(429,'Příliš mnoho pokusů o přihlášení. Zkuste to později.',{code:'login_rate_limited'});
 }
 await env.DB.prepare('DELETE FROM local_auth_rates WHERE window<?').bind(window-4).run();
}
const badLogin=fail=>fail(401,'Přihlašovací jméno nebo heslo nesouhlasí.',{code:'invalid_credentials'});
async function authIdentity(env,userId){return {userId,installation:await installationInfo(env),workspace:await workspaceActor(env.DB,userId)};}
function credentialValue(input,fail){try{return {username:localUsername(input.username),password:localPassword(input.password)};}catch(error){fail(400,error.message);}}
// An audit marker is inserted only if the preceding CAS succeeded. All side
// effects are gated by that marker inside the SAME atomic D1 batch.
function authWriteMarker(env,id,actor,subject,kind){return env.DB.prepare('INSERT INTO local_auth_events(id,actor_id,subject_id,kind,at) SELECT ?,?,?,?,? WHERE changes()=1').bind(id,actor,subject,kind,Date.now());}
function revokedCredentials(env,id,marker){const gate=' AND EXISTS(SELECT 1 FROM local_auth_events WHERE id=?)';return [env.DB.prepare('UPDATE access_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL'+gate).bind(Date.now(),id,marker),env.DB.prepare('UPDATE guest_access SET token_hash=NULL,expires_at=NULL WHERE user_id=?'+gate).bind(id,marker),env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id=?'+gate).bind(id,marker)];}
async function passwordSession(env,userId,version,request){
 const token=authRandom(),hash=await authHash(token),id=crypto.randomUUID(),now=Date.now();
 const r=await env.DB.prepare("INSERT INTO access_sessions(id,user_id,token_hash,created_at,expires_at,last_seen_at,agent,auth_method,password_version) SELECT ?,c.user_id,?,?,?+CASE WHEN m.role IN ('owner','administrator','admin') THEN 604800000 ELSE 2592000000 END,?,?,'password',c.version FROM local_credentials c JOIN members m ON m.user_id=c.user_id WHERE c.user_id=? AND c.version=?").bind(id,hash,now,now,now,(request.headers.get('user-agent')||'Zařízení').slice(0,240),userId,version).run();
 return r.meta.changes?token:null;
}
export async function handleLocalPublicAuth(request,env,h){
 const {body,json,fail}=h,path=new URL(request.url).pathname;
 if(path==='/api/auth/recover')fail(403,'Zapomenuté heslo může obnovit pouze administrátor firmy.',{code:'administrator_reset_required'});
 if(path==='/api/auth/options'&&request.method==='GET')return json({password:true,legacyAllowed:!await passwordOnly(env)});
 if(request.method!=='POST')fail(405,'Nepodporovaná operace.');
 const b=await body(request,2500);let username;try{username=localUsername(b.username);}catch{badLogin(fail);}
 await authRate(request,env,username,fail);
 const row=await authOne(env,'SELECT c.*,m.role FROM local_credentials c JOIN members m ON m.user_id=c.user_id WHERE c.username=?',username);
 if(path!=='/api/auth/login'||Object.keys(b).some(k=>!['username','password','preview','expectedUserId','expectedVersion'].includes(k))||typeof b.password!=='string'||b.preview!==undefined&&typeof b.preview!=='boolean')badLogin(fail);
 const ok=await verifyLocalPassword(b.password,row?.password_hash);if(!row||!ok)badLogin(fail);
 if(!await authOne(env,'SELECT 1 FROM local_credentials WHERE user_id=? AND version=? AND password_hash=?',row.user_id,row.version,row.password_hash))badLogin(fail);
 const info={...await authIdentity(env,row.user_id),mustChange:!!row.must_change,credentialVersion:row.version};if(b.preview===true)return json(info);
 if((b.expectedUserId!==undefined&&b.expectedUserId!==row.user_id)||(b.expectedVersion!==undefined&&b.expectedVersion!==row.version))fail(409,'Přihlašovací údaje se mezitím změnily. Přihlaste se znovu.');
 const token=await passwordSession(env,row.user_id,row.version,request);if(!token)badLogin(fail);
 await authAudit(env,row.user_id,row.user_id,'password_login').run();return authCookie(json({...info,ok:true}),token);
}
export async function handleLocalSelf(request,env,m,h){
 const {body,json,fail}=h,path=new URL(request.url).pathname,creds=await authOne(env,'SELECT * FROM local_credentials WHERE user_id=?',m.user_id);
 if(path==='/api/auth/account'&&request.method==='GET'){
  const policy=await authOne(env,"SELECT value,version FROM settings WHERE key='local-auth-mode'");return json({username:creds?.username||'',hasPassword:!!creds,version:creds?.version||0,mustChange:!!creds?.must_change,legacyAllowed:policy?.value!=='password',policyVersion:policy?.version||0,canManagePolicy:m.role==='owner'});
 }
 if(path==='/api/auth/password'&&request.method==='PUT'){
  const b=await body(request,3000);if(Object.keys(b).some(k=>!['username','password','currentPassword','version'].includes(k))||b.version!==(creds?.version||0))fail(409,'Účet se mezitím změnil. Obnovte nastavení.');
  const value=credentialValue(b,fail);if(creds&&!await verifyLocalPassword(b.currentPassword,creds.password_hash))fail(401,'Současné heslo nesouhlasí.');
  if(await authOne(env,'SELECT 1 FROM local_credentials WHERE username=? AND user_id<>?',value.username,m.user_id))fail(409,'Toto přihlašovací jméno už je obsazené.');
  const password=await hashLocalPassword(value.password),now=Date.now(),version=(creds?.version||0)+1;
  const write=creds?env.DB.prepare('UPDATE local_credentials SET username=?,password_hash=?,version=version+1,must_change=0,updated_at=?,updated_by=? WHERE user_id=? AND version=?').bind(value.username,password,now,m.user_id,m.user_id,creds.version):env.DB.prepare("INSERT INTO local_credentials(user_id,username,password_hash,version,must_change,updated_at,updated_by) SELECT ?,?,?,1,0,?,? WHERE EXISTS(SELECT 1 FROM members WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM local_credentials WHERE user_id=?)").bind(m.user_id,value.username,password,now,m.user_id,m.user_id,m.user_id);
  const marker=crypto.randomUUID(),results=await env.DB.batch([write,authWriteMarker(env,marker,m.user_id,m.user_id,creds?'password_changed':'credentials_created'),...revokedCredentials(env,m.user_id,marker)]);if(!results[0].meta.changes)fail(409,'Účet se mezitím změnil. Obnovte nastavení.');
  const token=await passwordSession(env,m.user_id,version,request);if(!token)fail(409,'Heslo bylo změněné znovu. Přihlaste se aktuálním heslem.');
  return authCookie(json({ok:true}),token);
 }
 if(path==='/api/auth/policy'&&request.method==='PUT'){
  if(m.role!=='owner'||m._authMethod!=='password'||!creds||creds.must_change)fail(403,'Způsob přihlášení nastavuje vlastník po přihlášení vlastním heslem.');
  const b=await body(request,2000);if(!['password','transition'].includes(b.mode)||!Number.isSafeInteger(b.version)||Object.keys(b).some(k=>!['mode','version','currentPassword'].includes(k)))fail(400,'Zkontrolujte nastavení přihlášení.');
  if(!await verifyLocalPassword(b.currentPassword,creds.password_hash))fail(401,'Současné heslo nesouhlasí.');
  const gate="EXISTS(SELECT 1 FROM members m JOIN local_credentials c ON c.user_id=m.user_id WHERE m.user_id=? AND m.role='owner' AND c.version=? AND c.must_change=0)";
  const write=b.version?env.DB.prepare('UPDATE settings SET value=?,version=version+1 WHERE key=\'local-auth-mode\' AND version=? AND '+gate).bind(b.mode,b.version,m.user_id,creds.version):env.DB.prepare("INSERT OR IGNORE INTO settings(key,value,version) SELECT 'local-auth-mode',?,1 WHERE "+gate).bind(b.mode,m.user_id,creds.version);
  const results=await env.DB.batch([write,authWriteMarker(env,crypto.randomUUID(),m.user_id,m.user_id,'login_policy_changed')]);if(!results[0].meta.changes)fail(409,'Nastavení se mezitím změnilo. Obnovte ho.');return json({ok:true});
 }
 fail(405,'Nepodporovaná operace.');
}
export async function handleLocalAccounts(request,env,m,h){
 const {body,json,fail}=h;if(!['owner','administrator','admin'].includes(m.role))fail(403,'Účty spravuje pouze oprávněný správce.');
 const path=new URL(request.url).pathname,match=path.match(/^\/api\/local-accounts\/([-\w]+)$/),id=match?.[1];
 if(id&&m.role!=='administrator')fail(403,'Zapomenuté heslo kolegy může obnovit pouze administrátor firmy.',{code:'administrator_reset_required'});
 if(request.method==='GET'&&id){const target=await authOne(env,'SELECT * FROM members WHERE user_id=?',id);if(!target||!canEditTeamMember(m,target))fail(403,'Tento účet nemůžete měnit.');const c=await authOne(env,'SELECT username,version,must_change FROM local_credentials WHERE user_id=?',id);return json({id,username:c?.username||'',version:c?.version||0,mustChange:!!c?.must_change});}
 if(request.method!=='POST'&&!(request.method==='PUT'&&id))fail(405,'Nepodporovaná operace.');
 const b=await body(request,4000);if(Object.keys(b).some(k=>!(id?['username','password','version']:['username','password','name','email','role','disciplines']).includes(k)))fail(400,'Nepodporované údaje účtu.');let password;try{password=localPassword(b.password||temporaryPassword());}catch(e){fail(400,e.message);}
 const target=id?await authOne(env,'SELECT * FROM members WHERE user_id=?',id):null,creds=id?await authOne(env,'SELECT * FROM local_credentials WHERE user_id=?',id):null;
 if(id&&(!target||!canEditTeamMember(m,target)))fail(403,'Tento účet nemůžete měnit.');
 if(id&&b.version!==(creds?.version||0))fail(409,'Účet se mezitím změnil. Obnovte údaje.');
 let username;try{username=localUsername(b.username||creds?.username);}catch(e){fail(400,e.message);}
 if(await authOne(env,'SELECT 1 FROM local_credentials WHERE username=? AND user_id<>?',username,id||''))fail(409,'Toto přihlašovací jméno už je obsazené.');
 const userId=id||'local_'+crypto.randomUUID(),now=Date.now(),statements=[],role=target?.role||b.role;
 if(!id){
  if(!canAssignTeamRole(m.role,role))fail(403,'Toto oprávnění nemůžete přidělit.');
  if(typeof b.name!=='string'||!b.name.trim()||b.name.length>160)fail(400,'Vyplňte jméno kolegy.');
  const email=typeof b.email==='string'&&b.email.trim()?b.email.trim().toLowerCase():userId+'@users.invalid';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(400,'Zkontrolujte e-mail.');
  if(await authOne(env,'SELECT 1 FROM members WHERE email=? UNION ALL SELECT 1 FROM invitations WHERE email=?',email,email))fail(409,'Tento e-mail už patří členovi nebo pozvánce. U existujícího člena upravte přihlášení.');
  let disciplines=[];if(m._workspace){try{disciplines=normalizeDisciplines(b.disciplines||[m._workspace.selectedDiscipline]);}catch(e){fail(400,e.message);}}
  statements.push(env.DB.prepare('INSERT INTO members(user_id,email,name,role,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND role=?) AND (SELECT (SELECT count(*) FROM members)+(SELECT count(*) FROM invitations))<?').bind(userId,email,b.name.trim(),role,now,m.user_id,m.role,m._workspace?10000:h.maxUsers||100));
  const gate='EXISTS(SELECT 1 FROM members WHERE user_id=? AND created_at=?)';
  if(m._workspace){for(const discipline of disciplines){statements.push(env.DB.prepare('INSERT INTO member_disciplines(user_id,discipline) SELECT ?,? WHERE '+gate).bind(userId,discipline,userId,now),env.DB.prepare('INSERT INTO workspace_member_grants(user_id,organization_id,original_role) SELECT ?,id,? FROM workspace_organizations WHERE workspace_id=? AND discipline=? AND '+gate).bind(userId,role,m._workspace.workspaceId,discipline,userId,now));}statements.push(env.DB.prepare("INSERT INTO workspace_entity_versions(entity,entity_id,version) SELECT 'member',?,1 WHERE "+gate).bind(userId,userId,now),env.DB.prepare('UPDATE workspaces SET authorization_revision=authorization_revision+1,updated_at=? WHERE id=? AND '+gate).bind(now,m._workspace.workspaceId,userId,now));}
 }
 const hash=await hashLocalPassword(password),version=(creds?.version||0)+1;
 const hierarchy="EXISTS(SELECT 1 FROM members actor JOIN members target ON target.user_id=? WHERE actor.user_id=? AND actor.role=? AND target.role=? AND target.user_id<>actor.user_id)";
 const write=creds?env.DB.prepare('UPDATE local_credentials SET username=?,password_hash=?,version=version+1,must_change=1,updated_at=?,updated_by=? WHERE user_id=? AND version=? AND '+hierarchy).bind(username,hash,now,m.user_id,userId,creds.version,userId,m.user_id,m.role,role):env.DB.prepare("INSERT INTO local_credentials(user_id,username,password_hash,version,must_change,updated_at,updated_by) SELECT ?,?,?,1,1,?,? WHERE "+hierarchy).bind(userId,username,hash,now,m.user_id,userId,m.user_id,m.role,role);
 const marker=crypto.randomUUID();statements.push(write,authWriteMarker(env,marker,m.user_id,userId,id?'password_reset':'account_created'),...revokedCredentials(env,userId,marker));
 const results=await env.DB.batch(statements),writeIndex=statements.indexOf(write);if(!results[writeIndex].meta.changes)fail(409,'Oprávnění nebo účet se mezitím změnil. Obnovte tým.');
 return json({id:userId,username,version,temporaryPassword:password,mustChange:true});
}
