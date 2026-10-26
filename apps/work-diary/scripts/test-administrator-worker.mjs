import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {Miniflare} from 'miniflare';
const pinned=existsSync('.openai/installation.json')?JSON.parse(readFileSync('.openai/installation.json')).instanceId:null;
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'isolated-administrator-test'},r2Buckets:['BUCKET'],bindings:{TEAM_OWNER_EMAIL:'owner@example.com',TEAM_INITIAL_ADMINISTRATOR_EMAIL:'administrator@example.com',...(pinned?{INSTALLATION_ID:pinned,COMPANY_NAME:'Izolovaná testovací firma'}:{})}});
const call=(path,user='owner',method='GET',value)=>mf.dispatchFetch('https://roles.test'+path,{method,headers:{...(user?{'oai-authenticated-user-id':user+'-id','oai-authenticated-user-email':user+'@example.com'}:{}),'x-zavlahy-request':'1','content-type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});
const good=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
const invite=(actor,name,role,mode='chatgpt')=>call('/api/invitations',actor,'POST',{email:name+'@example.com',role,mode});
try{
 const db=await mf.getD1Database('DB');
 for(const e of JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries)for(const sql of readFileSync('drizzle/'+e.tag+'.sql','utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 assert.equal((await call('/api/me',null)).status,401);
 assert.equal((await good(await call('/api/me','administrator'))).user.role,'administrator');
 const owner=await good(await call('/api/me'));assert.equal(owner.user.role,'owner');
 for(const [u,r] of [['admin','admin'],['worker','worker'],['reader','reader']]){await good(await invite('owner',u,r));await good(await call('/api/me',u));}
 const adminMe=await good(await call('/api/me','administrator'));assert.deepEqual(adminMe.permissions,{write:true,manage:true,delete:true});assert.equal(adminMe.roleNames.administrator,'Administrátor');
 // Arbitrary users can receive the new role; initial email is not a role policy.
 await good(await invite('owner','second-administrator','administrator'));assert.equal((await good(await call('/api/me','second-administrator'))).user.role,'administrator');
 await good(await call('/api/members/worker-id','owner','PATCH',{role:'administrator'}));assert.equal((await good(await call('/api/me','worker'))).user.role,'administrator');await good(await call('/api/members/worker-id','owner','PATCH',{role:'worker'}));
 await good(await call('/api/members/worker-id','administrator','PATCH',{role:'admin'}));await good(await call('/api/members/worker-id','administrator','PATCH',{role:'reader'}));await good(await call('/api/members/worker-id','administrator','PATCH',{role:'worker'}));
 for(const [actor,target,role] of [['administrator','admin','administrator'],['administrator','owner','reader'],['administrator','administrator','worker'],['administrator','second-administrator','reader'],['admin','worker','admin'],['admin','administrator','worker'],['worker','reader','worker'],['reader','worker','reader']])assert.equal((await call('/api/members/'+target+'-id',actor,'PATCH',{role})).status,403,actor+' cannot alter '+target+' to '+role);
 assert.equal((await invite('administrator','bad','owner')).status,400);assert.equal((await invite('administrator','bad','administrator')).status,403);assert.equal((await invite('admin','bad','admin')).status,403);
 await good(await invite('administrator','new-manager','admin'));await good(await call('/api/me','new-manager'));assert.equal((await good(await call('/api/me','new-manager'))).user.role,'admin');await good(await call('/api/members/new-manager-id','administrator','DELETE'));assert.equal((await call('/api/me','new-manager')).status,403);
 await good(await invite('owner','protected-invite','administrator'));assert.equal((await call('/api/invitations','administrator','DELETE',{email:'protected-invite@example.com'})).status,403);assert.equal((await invite('admin','protected-invite','reader')).status,403);
 // Same installation invitations/login are required for each firm. Unknown users have no access.
 for(const path of ['/api/me','/api/team','/api/jobs','/api/customers'])assert.equal((await call(path,'outsider')).status,403);
 for(const path of ['/api/team','/api/jobs?state=all','/api/customers','/api/gardens','/api/record-links','/api/subscriptions','/api/installation','/api/jobs/backlog','/api/jobs/planning-settings'])await good(await call(path,'administrator'));
 assert.equal((await call('/api/team','worker')).status,403);assert.equal((await call('/api/team','reader')).status,403);
 // Existing manager functionality, SQL writer scopes and independent administrator notifications.
 await good(await call('/api/customers/role-customer','administrator','PUT',{version:0,name:'Test role',phones:[],addresses:[]}));const customer=(await good(await call('/api/customers/role-customer','administrator'))).customer;
 await good(await call('/api/jobs/role-job','administrator','PUT',{version:0,title:'Test administrátora',customerId:'role-customer',gardenId:customer.gardens[0].id,assignedTo:'worker-id',status:'planned'}));
 const job=(await good(await call('/api/jobs/role-job','administrator'))).job;await good(await call('/api/jobs/role-job/status','worker','PATCH',{version:job.version,status:'in_progress'}));
 assert.ok((await db.prepare("SELECT count(*) n FROM notifications WHERE user_id='administrator-id' AND kind='job_status'").first()).n>0,'SQL job trigger includes administrator');
 // Owner-only features remain restricted.
 for(const path of ['/api/materials','/api/system-backups','/api/privacy/export']){const r=await call(path,'administrator');assert.ok([403,404].includes(r.status),path+': '+r.status);}
 assert.equal((await call('/api/installation','administrator','PUT',{version:1,name:'Změna vlastníka'})).status,403);
 // Personal administrator links have admin TTL and cannot be reset by lower roles.
 const link=await good(await invite('owner','linked-administrator','administrator','link')),token=new URL(link.url).hash.slice(8);assert.match(token,/^[a-f0-9]{64}$/);
 const invitation=await db.prepare("SELECT expires_at,created_at FROM invitations WHERE email='linked-administrator@example.com'").first();assert.ok(Math.abs(invitation.expires_at-invitation.created_at-86400000)<1000);
 const redeemed=await mf.dispatchFetch('https://roles.test/api/access-link',{method:'POST',headers:{'content-type':'application/json','x-zavlahy-request':'1'},body:JSON.stringify({token})});await good(redeemed);
 const lm=await db.prepare("SELECT user_id FROM members WHERE email='linked-administrator@example.com'").first();assert.ok(lm);const session=await db.prepare('SELECT created_at,expires_at FROM access_sessions WHERE user_id=?').bind(lm.user_id).first();assert.equal(session.expires_at-session.created_at,7*86400000);
 assert.equal((await call('/api/members/'+lm.user_id+'/access-link','admin','POST')).status,403);assert.equal((await call('/api/members/'+lm.user_id+'/access-link','administrator','POST')).status,403);await good(await call('/api/members/'+lm.user_id+'/access-link','owner','POST'));
 // Bootstrap never restores/dictates the role after explicit owner changes.
 await good(await call('/api/members/administrator-id','owner','PATCH',{role:'reader'}));assert.equal((await good(await call('/api/me','administrator'))).user.role,'reader');assert.equal((await call('/api/team','administrator')).status,403);await good(await call('/api/members/administrator-id','owner','DELETE'));assert.equal((await call('/api/me','administrator')).status,403);assert.equal(await db.prepare("SELECT 1 FROM invitations WHERE email='administrator@example.com'").first(),null);
 console.log('PASS: compiled Worker and real D1: assignable administrator, full manager scopes, owner protection, lower-role escalation blocked, invitation/device limits, manager notifications and one-time bootstrap. Isolated test data only.');
}finally{await mf.dispose();}
