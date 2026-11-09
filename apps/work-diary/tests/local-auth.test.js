import test from 'node:test';import assert from 'node:assert/strict';import {scrypt as nodeScrypt} from 'node:crypto';import {promisify} from 'node:util';
import {api} from '../worker/api.js';import {hashLocalPassword,verifyLocalPassword,localUsername,localPassword} from '../worker/password-crypto.js';import {environment,people,request} from './fixtures.mjs';
const administrator={id:'administrator-id',email:'administrator@example.com'};
const ctx={waitUntil:p=>p.catch(()=>{})},pass='Isolated-testing-password-123';
const call=(env,path,actor=people.owner,method='GET',body,cookie)=>api(request(path,actor,method,body,cookie?{cookie}:{}),env,ctx);
const ok=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();},cookie=r=>r.headers.get('set-cookie')?.split(';')[0];
async function setup(){const e=environment();await ok(await call(e,'/api/me'));return e;}
async function create(e,username='worker-test',role='worker'){return ok(await call(e,'/api/local-accounts',people.owner,'POST',{name:'Izolovaný kolega',username,role,password:pass}));}
async function login(e,username,password=pass){const r=await call(e,'/api/auth/login',null,'POST',{username,password});await ok(r);return cookie(r);}
async function own(e){const r=await call(e,'/api/auth/password',people.owner,'PUT',{username:'owner-test',password:pass,version:0});return {data:await ok(r),cookie:cookie(r)};}
test('A password session skips legacy-mode discovery, but still checks current role, expiry, revocation and credential version',async()=>{
 const e=await setup();try{
  const account=await own(e),original=e.DB.prepare;let policyReads=0;
  e.DB.prepare=sql=>{if(sql==="SELECT value FROM settings WHERE key='local-auth-mode'")policyReads++;return original(sql);};
  assert.equal((await ok(await call(e,'/api/me',null,'GET',undefined,account.cookie))).user.role,'owner');assert.equal(policyReads,0);
  e.sqlite.prepare("UPDATE members SET role='reader' WHERE user_id=?").run(people.owner.id);
  const current=await ok(await call(e,'/api/me',null,'GET',undefined,account.cookie));assert.equal(current.user.role,'reader');assert.equal(current.permissions.write,false);
  e.sqlite.prepare('UPDATE local_credentials SET version=version+1 WHERE user_id=?').run(people.owner.id);
  assert.equal((await call(e,'/api/me',null,'GET',undefined,account.cookie)).status,401);
  e.sqlite.prepare('UPDATE access_sessions SET password_version=password_version+1,expires_at=0').run();
  assert.equal((await call(e,'/api/me',null,'GET',undefined,account.cookie)).status,401);
  e.sqlite.prepare('UPDATE access_sessions SET expires_at=?,revoked_at=?').run(Date.now()+60000,Date.now());
  assert.equal((await call(e,'/api/me',null,'GET',undefined,account.cookie)).status,401);
  assert.equal((await call(e,'/api/me',people.owner,'GET',undefined,'__Host-zavlahy-access=invalid')).status,401);assert.equal(policyReads,0);
  e.sqlite.prepare("INSERT INTO settings(key,value,version) VALUES('local-auth-mode','password',1)").run();
  assert.equal((await call(e,'/api/me',people.owner)).status,401);assert.equal(policyReads,1);
 }finally{e.sqlite.close();}
});
test('scrypt uses salted OWASP profile independently verified by Node crypto; validation and dummy verification',async()=>{
 assert.equal(localUsername('  Test.User  '),'test.user');for(const v of ['ab','člověk','a b','<script>'])assert.throws(()=>localUsername(v));assert.throws(()=>localPassword('heslo'));const hash=await hashLocalPassword(pass),second=await hashLocalPassword(pass);assert.notEqual(hash,second);assert.ok(!hash.includes(pass));const [,salt,key]=hash.split('$'),expected=await promisify(nodeScrypt)(pass,Buffer.from(salt,'base64url'),32,{N:32768,r:8,p:3,maxmem:40*1024*1024});assert.equal(Buffer.from(key,'base64url').toString('hex'),expected.toString('hex'));assert.equal(await verifyLocalPassword(pass,hash),true);assert.equal(await verifyLocalPassword(pass+'x',hash),false);assert.equal(await verifyLocalPassword(pass,null),false);
});
test('new accounts use stable member IDs, secure cookies and enforce first password change on the server',async()=>{
 const e=await setup(),a=await create(e);assert.ok(a.id.startsWith('local_'));assert.equal(e.sqlite.prepare('SELECT role FROM members WHERE user_id=?').get(a.id).role,'worker');const preview=await call(e,'/api/auth/login',null,'POST',{username:'WORKER-TEST',password:pass,preview:true});assert.equal((await ok(preview)).userId,a.id);assert.equal(preview.headers.get('set-cookie'),null);
 const r=await call(e,'/api/auth/login',null,'POST',{username:'worker-test',password:pass});await ok(r);assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);const c=cookie(r);
 for(const path of ['/api/me','/api/jobs','/api/customers','/api/notifications']){const denied=await call(e,path,null,'GET',undefined,c);assert.equal(denied.status,403);assert.equal((await denied.json()).code,'password_change_required');}
 const info=await ok(await call(e,'/api/auth/account',null,'GET',undefined,c));assert.equal(info.mustChange,true);
 const changed=await call(e,'/api/auth/password',null,'PUT',{username:'worker-test',currentPassword:pass,password:pass+'-changed',version:1},c);await ok(changed);const me=await ok(await call(e,'/api/me',null,'GET',undefined,cookie(changed)));assert.equal(me.user.id,a.id);assert.equal(me.user.authMethod,'password');assert.equal((await call(e,'/api/me',null,'GET',undefined,c)).status,401);
 assert.equal((await call(e,'/api/local-accounts',null,'POST',{name:'Attack',username:'attacker',role:'owner'},cookie(changed))).status,403);
});
test('credential setup and resets preserve existing assignments, hierarchy and CAS; stale resets have no side effects',async()=>{
 const e=await setup();await ok(await call(e,'/api/invitations',people.owner,'POST',{email:administrator.email,role:'administrator'}));await ok(await call(e,'/api/me',administrator));for(const role of ['admin','worker','reader']){await ok(await call(e,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await ok(await call(e,'/api/me',people[role]));}
 e.sqlite.prepare("INSERT INTO jobs(id,title,description,address,assigned_to,assigned_name,due_date,status,created_at,updated_at,created_by,updated_by) VALUES('existing-job','Existing','','','worker-id','','','planned',1,1,'owner-id','owner-id')").run();
 const reset=await ok(await call(e,'/api/local-accounts/worker-id',administrator,'PUT',{username:'existing-worker',version:0,password:pass}));const c=await login(e,'existing-worker');
 assert.equal(e.sqlite.prepare("SELECT assigned_to FROM jobs WHERE id='existing-job'").get().assigned_to,'worker-id');assert.equal(e.sqlite.prepare("SELECT count(*) n FROM members WHERE user_id='worker-id'").get().n,1);
 const before=e.sqlite.prepare('SELECT count(*) n FROM local_auth_events').get().n;
 assert.equal((await call(e,'/api/local-accounts/worker-id',administrator,'PUT',{username:'existing-worker',version:0,password:pass+'another'})).status,409);
 assert.equal(e.sqlite.prepare('SELECT count(*) n FROM local_auth_events').get().n,before);assert.equal((await call(e,'/api/auth/account',null,'GET',undefined,c)).status,200);
 for(const actor of [people.owner,people.admin,people.worker,people.reader])assert.equal((await call(e,'/api/local-accounts/owner-id',actor,'PUT',{username:'stolen-owner',password:pass,version:0})).status,403);
 assert.equal((await call(e,'/api/local-accounts/admin-id',people.admin,'PUT',{username:'self',version:0,password:pass})).status,403);
 assert.equal((await call(e,'/api/local-accounts',people.admin,'POST',{name:'Escalate',username:'escalate',role:'administrator'})).status,403);
 await ok(await call(e,'/api/local-accounts/worker-id',administrator,'PUT',{username:'existing-worker',version:1,password:pass+'new'}));assert.equal((await call(e,'/api/auth/account',null,'GET',undefined,c)).status,401);
});
test('only Administrátor can reset passwords; no public recovery; password-only policy requires prepared owner',async()=>{
 const e=await setup();assert.equal((await call(e,'/api/auth/policy',people.owner,'PUT',{mode:'password',version:0,currentPassword:pass})).status,403);
 const ownAccount=await own(e);assert.equal(ownAccount.data.recoveryCodes,undefined);assert.equal(e.sqlite.prepare("SELECT count(*) n FROM members WHERE user_id='owner-id'").get().n,1);
 await ok(await call(e,'/api/auth/policy',null,'PUT',{mode:'password',version:0,currentPassword:pass},ownAccount.cookie));assert.equal((await call(e,'/api/me')).status,401);assert.equal((await call(e,'/api/access-link',null,'POST',{token:'a'.repeat(64)})).status,403);
 assert.equal((await call(e,'/api/invitations',null,'POST',{email:'any@test.cz',role:'worker'},ownAccount.cookie)).status,403);
 assert.equal((await ok(await call(e,'/api/auth/options',null))).legacyAllowed,false);
 assert.equal((await call(e,'/api/auth/recover',null,'POST',{username:'owner-test',recoveryCode:'anything',password:pass})).status,403);assert.equal((await ok(await call(e,'/api/me',null,'GET',undefined,ownAccount.cookie))).user.role,'owner');
});
test('login failures are generic, persisted limits apply, invalid cookie never falls back to hosting identity',async()=>{
 const e=await setup();await create(e);const bad=await call(e,'/api/auth/login',null,'POST',{username:'worker-test',password:pass+'bad'}),missing=await call(e,'/api/auth/login',null,'POST',{username:'unknown-test',password:pass+'bad'});assert.equal(bad.status,401);assert.deepEqual(await bad.json(),await missing.json());
 e.sqlite.prepare("UPDATE local_auth_rates SET attempts=1000").run();assert.equal((await call(e,'/api/auth/login',null,'POST',{username:'worker-test',password:pass})).status,429);
 assert.equal((await call(e,'/api/me',people.owner,'GET',undefined,'__Host-zavlahy-access='+ 'a'.repeat(64))).status,401);
 assert.equal((await call(e,'/api/auth/login',null,'POST',{username:'owner-test',password:pass},undefined)).headers.get('set-cookie'),null);
});
test('a concurrent credential version change inside reset CAS cannot revoke the newer session or write a false audit event',async()=>{
 const e=await setup();await ok(await call(e,'/api/invitations',people.owner,'POST',{email:administrator.email,role:'administrator'}));await ok(await call(e,'/api/me',administrator));const a=await create(e);const c=await login(e,'worker-test'),batch=e.DB.batch.bind(e.DB),before=e.sqlite.prepare('SELECT count(*) n FROM local_auth_events').get().n;let inject=true;
 e.DB.batch=async statements=>{if(inject){inject=false;e.sqlite.prepare('UPDATE local_credentials SET version=2 WHERE user_id=?').run(a.id);e.sqlite.prepare('UPDATE access_sessions SET password_version=2 WHERE user_id=?').run(a.id);}return batch(statements);};
 const stale=await call(e,'/api/local-accounts/'+a.id,administrator,'PUT',{username:'worker-test',password:pass+'reset',version:1});assert.equal(stale.status,409);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM local_auth_events').get().n,before);assert.equal((await call(e,'/api/auth/account',null,'GET',undefined,c)).status,200);
});
test('password accounts in the shared workspace retain department and assigned-job restrictions',async()=>{
 const e=await setup(),ownerAccess=await own(e),s=e.sqlite,inst=s.prepare('SELECT instance_id FROM installation_state').get().instance_id;e.INSTALLATION_ID=inst;
 s.exec("INSERT INTO workspaces VALUES('local-pair','preparing',1,1,1)");s.prepare("INSERT INTO workspace_organizations VALUES('local-irr','local-pair',?,'irrigation','Irrigation')").run(inst);s.prepare("INSERT INTO workspace_organizations VALUES('local-garden','local-pair','inst-local-garden-isolated-123456','garden','Garden')").run();s.exec("INSERT INTO workspace_member_grants VALUES('owner-id','local-irr','owner');UPDATE workspaces SET state='active'");
 const a=await ok(await call(e,'/api/local-accounts',null,'POST',{name:'Scoped driver',username:'scoped-worker',role:'worker',password:pass,disciplines:['irrigation']},ownerAccess.cookie));assert.deepEqual(s.prepare('SELECT discipline FROM member_disciplines WHERE user_id=?').all(a.id).map(v=>v.discipline),['irrigation']);assert.equal(s.prepare('SELECT organization_id FROM workspace_member_grants WHERE user_id=?').get(a.id).organization_id,'local-irr');
 let c=await login(e,'scoped-worker');const changed=await call(e,'/api/auth/password',null,'PUT',{username:'scoped-worker',password:pass+'changed',currentPassword:pass,version:1},c);await ok(changed);c=cookie(changed);
 for(const [id,discipline,assignedTo]of [['local-job','irrigation',a.id],['other-team','garden','owner-id'],['unassigned-irr','irrigation','owner-id']])await ok(await call(e,'/api/jobs/'+id,null,'PUT',{version:0,title:id,discipline,assignedTo,status:'planned',dueDate:'2026-11-04'},ownerAccess.cookie));
 assert.equal((await ok(await call(e,'/api/jobs/local-job',null,'GET',undefined,c))).job.id,'local-job');assert.equal((await call(e,'/api/jobs/other-team',null,'GET',undefined,c)).status,404);assert.equal((await call(e,'/api/jobs/unassigned-irr',null,'GET',undefined,c)).status,404);
 const visible=JSON.stringify(await ok(await call(e,'/api/jobs',null,'GET',undefined,c)));assert.ok(visible.includes('local-job'));assert.ok(!visible.includes('other-team'));assert.ok(!visible.includes('unassigned-irr'));
});
