import test from 'node:test';import assert from 'node:assert/strict';
import {workspaceGateway} from '../worker/workspace-gateway.js';
const idA='inst-canonical-test-1234567890',idB='inst-entry-test-1234567890',key='a'.repeat(43),origin='https://canonical.test',entry='https://entry.test';
function fixture(){const nonces=new Set(),state={last:null},env={SHARED_WORKSPACE_GATEWAY:JSON.stringify({mode:'canonical',localId:idA,peerId:idB,key,canonicalOrigin:origin,entryOrigin:entry}),DB:{prepare:sql=>({async run(){return {meta:{changes:0}};},async first(){return {id:'workspace',state:'active'};},bind(...args){return {async run(){if(sql.startsWith('INSERT')){const seen=nonces.has(args[0]);nonces.add(args[0]);return {meta:{changes:seen?0:1}};}return {meta:{changes:0}};}};}})}},proxy={SHARED_WORKSPACE_GATEWAY:JSON.stringify({mode:'entry',localId:idB,peerId:idA,key,canonicalOrigin:origin})},ctx={waitUntil:p=>p.catch(()=>{})};return {env,proxy,ctx,state};}
test('relay uses one canonical API with verified actor, unchanged body and opaque identity envelope',async()=>{const f=fixture(),original=globalThis.fetch;let saved;
 globalThis.fetch=async(url,options)=>{saved=new Request(url,options);assert.ok(!saved.headers.get('x-workspace-envelope').includes('worker'));assert.ok(!saved.headers.get('x-workspace-envelope').includes('cookie-secret'));return workspaceGateway(saved,f.env,f.ctx,async req=>{assert.equal(req.headers.get('oai-authenticated-user-id'),'worker-id');assert.equal(req.headers.get('cookie'),'__Host-zavlahy-access=cookie-secret');assert.equal(req.headers.get('origin'),origin);assert.equal(req.headers.get('x-work-discipline'),'garden');assert.equal(req.headers.get('x-workspace-client-version'),'shared-directory-v1');assert.equal(await req.text(),'{"name":"Contact"}');return Response.json({ok:true});});};
 try{const r=await workspaceGateway(new Request(entry+'/api/customers/c',{method:'PUT',headers:{'oai-authenticated-user-id':'worker-id','oai-authenticated-user-email':'worker@example.test',cookie:'unrelated-secret=1; __Host-zavlahy-access=cookie-secret',origin:entry,'x-work-discipline':'garden','x-workspace-client-version':'shared-directory-v1','x-zavlahy-request':'1','content-type':'application/json'},body:'{"name":"Contact"}'}),f.proxy,f.ctx);assert.equal(r.status,200);assert.equal((await workspaceGateway(new Request(saved.url,{method:saved.method,headers:saved.headers,body:'{"name":"Contact"}'}),f.env,f.ctx,()=>{throw Error('replay reached application');})).status,409);}finally{globalThis.fetch=original;}
});
test('unsigned requests and tampering never reach the canonical API',async()=>{const f=fixture();for(const headers of[{}, {'x-workspace-envelope':'anything','x-workspace-signature':'0'.repeat(64)}]){const r=await workspaceGateway(new Request(origin+'/api/shared-workspace/rpc',{method:'POST',headers,body:'x'}),f.env,f.ctx,()=>{throw Error('auth bypass');});assert.equal(r.status,401);}});
test('a relay grants no roles and an unpaired browser origin is rejected',async()=>{const f=fixture(),original=globalThis.fetch;globalThis.fetch=(url,opt)=>workspaceGateway(new Request(url,opt),f.env,f.ctx,()=>{throw Error('wrong origin reached application');});try{const r=await workspaceGateway(new Request(entry+'/api/jobs',{method:'POST',headers:{origin:'https://evil.test','x-zavlahy-request':'1'},body:'{}'}),f.proxy,f.ctx);assert.equal(r.status,403);}finally{globalThis.fetch=original;}});
test('disabled mode and maintenance paths cannot provide a general owner backdoor',async()=>{const f=fixture();assert.equal(await workspaceGateway(new Request(entry+'/api/jobs'),{},f.ctx),null);assert.equal((await workspaceGateway(new Request(entry+'/api/maintenance/anything'),f.proxy,f.ctx)).status,404);});

test('staging entry keeps local API and only relays a signed diagnostic, never unactivated business data',async()=>{
 const f=fixture(),original=globalThis.fetch;
 f.proxy.SHARED_WORKSPACE_GATEWAY=JSON.stringify({...JSON.parse(f.proxy.SHARED_WORKSPACE_GATEWAY),mode:'entry-staging'});
 const prepare=f.env.DB.prepare;f.env.DB.prepare=sql=>sql==='SELECT id,state FROM workspaces LIMIT 1'?{first:async()=>({id:'workspace',state:'preparing'})}:prepare(sql);
 globalThis.fetch=(url,opt)=>workspaceGateway(new Request(url,opt),f.env,f.ctx,()=>{throw Error('unactivated business API reached');});
 try{
  assert.equal(await workspaceGateway(new Request(entry+'/api/jobs'),f.proxy,f.ctx),null);
  const diagnostic=await workspaceGateway(new Request(entry+'/api/shared-workspace/test?challenge=isolated-proof-123456789'),f.proxy,f.ctx);
  assert.equal(diagnostic.status,200);assert.equal((await diagnostic.json()).workspaceState,'preparing');
  f.proxy.SHARED_WORKSPACE_GATEWAY=JSON.stringify({...JSON.parse(f.proxy.SHARED_WORKSPACE_GATEWAY),mode:'entry'});
  const business=await workspaceGateway(new Request(entry+'/api/jobs'),f.proxy,f.ctx);assert.equal(business.status,503);
 }finally{globalThis.fetch=original;}
});


test('Role preview marker survives the signed Garden relay without replacing the actual actor',async()=>{
 const f=fixture(),original=globalThis.fetch;
 globalThis.fetch=(url,options)=>workspaceGateway(new Request(url,options),f.env,f.ctx,req=>{assert.equal(req.headers.get('x-work-diary-preview-role'),'reader');assert.equal(req.headers.get('oai-authenticated-user-id'),'owner-id');return Response.json({ok:true});});
 try{const response=await workspaceGateway(new Request(entry+'/api/jobs',{headers:{'oai-authenticated-user-id':'owner-id','x-work-diary-preview-role':'reader'}}),f.proxy,f.ctx);assert.equal(response.status,200);}finally{globalThis.fetch=original;}
});
test('Month snapshot revision requests survive the signed Garden entry as query parameters',async()=>{
 const f=fixture(),original=globalThis.fetch;
 globalThis.fetch=(url,options)=>workspaceGateway(new Request(url,options),f.env,f.ctx,req=>{const url=new URL(req.url);assert.equal(url.searchParams.get('cacheSnapshot'),'1');assert.equal(url.searchParams.get('month'),'2026-11');assert.equal(req.headers.get('oai-authenticated-user-id'),'owner-id');return Response.json({jobs:[],listRevision:7,nextCursor:null});});
 try{const response=await workspaceGateway(new Request(entry+'/api/jobs?state=all&order=schedule&month=2026-11&cacheSnapshot=1',{headers:{'oai-authenticated-user-id':'owner-id'}}),f.proxy,f.ctx);assert.equal(response.status,200);assert.equal((await response.json()).listRevision,7);}finally{globalThis.fetch=original;}
});
