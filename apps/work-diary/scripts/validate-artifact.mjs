import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {environment,people,request} from '../tests/fixtures.mjs';
import {hashLocalPassword} from '../worker/password-crypto.js';

const source=await readFile('dist/server/index.js','utf8');
const hosting=JSON.parse(await readFile('dist/.openai/hosting.json','utf8'));
assert.ok(hosting.project_id||process.argv.includes('--allow-unbound'));
assert.ok(!hosting.static);
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const fixture=environment(),pending=[],ctx={waitUntil:task=>pending.push(task.catch(()=>{}))};
const fetchWorker=(...args)=>worker.fetch(request(...args),fixture,ctx);
const login=(password,preview=false)=>fetchWorker('/api/auth/login',null,'POST',{username:people.owner.email,password,preview});
const sessionHeader=response=>({cookie:response.headers.get('set-cookie').split(';')[0]});

try{
 const page=await fetchWorker('/');
 assert.equal(page.status,200);
 assert.match(await page.text(),/id="app"/);
 assert.equal((await fetchWorker('/app.js')).status,200);
 if(process.argv.includes('--cloudflare'))await validateCloudflareLogin();
 else{
  for(const route of ['/api/me','/api/installation','/api/jobs']){
   const response=await fetchWorker(route,people.owner);
   assert.equal(response.status,200,route+': '+await response.clone().text());
   if(route==='/api/me')assert.equal((await response.json()).user.role,'owner');
  }
  assert.equal((await fetchWorker('/api/me')).status,401);
  console.log('PASS Sites startup and protected API on isolated SQLite/R2.');
 }
 await Promise.all(pending);
}finally{fixture.sqlite.close();}

async function validateCloudflareLogin(){
 const options=await fetchWorker('/api/auth/options');
 assert.equal(options.status,200,await options.clone().text());
 assert.deepEqual(await options.json(),{password:true,linkAllowed:false,legacyAllowed:false});

 for(const route of ['/api/me','/api/installation','/api/jobs']){
  for(const actor of [null,people.owner])assert.equal((await fetchWorker(route,actor)).status,401,route);
 }
 const temporary='Cloudflare-test-temporary-123';
 fixture.STANDALONE_OWNER_PASSWORD_HASH=await hashLocalPassword(temporary);
 assert.equal((await login('incorrect-password')).status,401);
 assert.equal(fixture.sqlite.prepare("SELECT count(*) AS total FROM members WHERE role='owner'").get().total,0);
 const preview=await login(temporary,true);
 assert.equal(preview.status,200,await preview.clone().text());
 assert.equal(preview.headers.has('set-cookie'),false);
 const opened=await login(temporary);
 assert.equal(opened.status,200,await opened.clone().text());
 assert.equal((await opened.json()).mustChange,true);
 assert.match(opened.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 const temporarySession=sessionHeader(opened);
 const locked=await fetchWorker('/api/jobs',null,'GET',undefined,temporarySession);
 assert.equal(locked.status,403);
 assert.equal((await locked.json()).code,'password_change_required');
 const changed=await fetchWorker('/api/auth/password',null,'PUT',{
  username:'test-owner',currentPassword:temporary,password:'Cloudflare-test-permanent-456',version:1
 },temporarySession);
 assert.equal(changed.status,200,await changed.clone().text());
 const session=sessionHeader(changed);
 assert.equal((await login(temporary)).status,401);
 for(const route of ['/api/me','/api/installation','/api/jobs']){
  const response=await fetchWorker(route,null,'GET',undefined,session);
  assert.equal(response.status,200,route+': '+await response.clone().text());
  if(route==='/api/me'){
   const {user}=await response.json();
   assert.equal(user.role,'owner');
   assert.equal(user.authMethod,'password');
  }
 }
 assert.equal((await fetchWorker('/api/access-logout',null,'POST',{},session)).status,200);
 assert.equal((await fetchWorker('/api/me',null,'GET',undefined,session)).status,401);
 console.log('PASS Cloudflare login, owner setup, password change, protected API and logout on isolated SQLite/R2.');
}
