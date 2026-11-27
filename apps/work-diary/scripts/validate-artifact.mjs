import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile('dist/server/index.js','utf8'),hosting=JSON.parse(await readFile('dist/.openai/hosting.json','utf8'));
assert.ok(hosting.project_id||process.argv.includes('--allow-unbound'));assert.ok(!hosting.static);const worker=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')).catch(e=>{console.error(e.message);process.exit(1);});assert.equal(typeof worker.default.fetch,'function');
const deniedPage=await worker.default.fetch(new Request('https://example.test/'),{},{});assert.equal(deniedPage.status,403);const accessContext={access:{getIdentity:async()=>({email:'owner@example.com',user_uuid:'owner-id'})}};const result=await worker.default.fetch(new Request('https://example.test/'),{},accessContext);assert.equal(result.status,200);const html=await result.text();assert.ok(html.includes('id="app"'));assert.ok(/<title>[^<]+<\/title>/.test(html));console.log('Worker artifact validated.');

// Exercise the exact compiled authenticated entrypoint against isolated data.
// A public HTML response or an unauthenticated 401 cannot detect missing init functions.
const {environment,people,request}=await import('../tests/fixtures.mjs');
const fixture=environment(),pending=[],ctx={waitUntil:task=>pending.push(task.catch(()=>{})),access:{getIdentity:async()=>({email:'owner@example.com',user_uuid:'owner-id'})}};
try{
 for(const route of ['/api/me','/api/installation','/api/jobs']){
  const response=await worker.default.fetch(request(route,people.owner),fixture,ctx);
  assert.equal(response.status,200,route+': '+await response.clone().text());
  const data=await response.json();if(route==='/api/me')assert.equal(data.user.role,'owner');
 }
 const unauthenticated=await worker.default.fetch(request('/api/me'),fixture,{waitUntil:task=>task.catch(()=>{})});assert.equal(unauthenticated.status,403);
 await Promise.all(pending);console.log('PASS compiled authenticated startup, installation and jobs; anonymous access rejected; isolated SQLite/R2 only.');
}finally{fixture.sqlite.close();}
