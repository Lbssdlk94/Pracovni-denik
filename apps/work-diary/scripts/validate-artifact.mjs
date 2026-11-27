import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {environment,people,request} from '../tests/fixtures.mjs';

const source=await readFile('dist/server/index.js','utf8');
const hosting=JSON.parse(await readFile('dist/.openai/hosting.json','utf8'));
assert.ok(hosting.project_id||process.argv.includes('--allow-unbound'));
assert.ok(!hosting.static);
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const fixture=environment(),pending=[],ctx={waitUntil:task=>pending.push(task.catch(()=>{}))};
const expected=JSON.parse(source.match(/const EXPECTED_INSTALLATION_ID=([^;]+);/)[1]);
if(expected)fixture.sqlite.prepare('UPDATE installation_state SET instance_id=?').run(expected);
const fetchWorker=(...args)=>worker.fetch(request(...args),fixture,ctx);
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
 assert.deepEqual(await options.json(),{password:true,linkAllowed:false,legacyAllowed:true});
 const routes=['/api/me','/api/installation','/api/jobs'];
 const spoof={id:'spoofed-user',email:'attacker@example.com',name:'Attacker'};
 ctx.access=undefined;
 for(const route of routes)assert.equal((await fetchWorker(route,spoof)).status,401,route+' must reject caller-supplied identity');
 ctx.access={getIdentity:async()=>({id:'access-test-owner',email:people.owner.email,name:people.owner.name||people.owner.email})};
 assert.equal(fixture.STANDALONE_PASSWORD_AUTH,undefined);
 for(const route of routes){
  const response=await fetchWorker(route,spoof);
  assert.equal(response.status,200,route+': '+await response.clone().text());
  if(route==='/api/me'){const {user}=await response.json();assert.equal(user.role,'owner');assert.equal(user.email,people.owner.email);}
 }
 console.log('PASS Cloudflare Access identity, owner bootstrap, spoofed-header rejection and protected API on isolated SQLite/R2.');
}
