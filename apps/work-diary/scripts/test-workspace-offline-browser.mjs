// Loopback-only IndexedDB / WebCrypto integration; never contacts a deployed Site.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {workspaceBase64,workspaceRecoveryAES,openWorkspaceRecoveryPart} from '../web/workspace-recovery-crypto.js';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json')('playwright'));}
const key=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
const info={workspaceId:'isolated-browser',key:{id:'isolated-key',publicKey:workspaceBase64(new Uint8Array(await crypto.subtle.exportKey('spki',key.publicKey)))}};
const previous={user:{id:'worker-test',role:'worker'},permissions:{write:true,manage:false},installation:{id:'inst-browser-test'},features:{offline:true,shafts:true,jobs:true,service:true,defects:true},workspace:{workspaceId:info.workspaceId,authorizationVersion:1,role:'worker',disciplines:['irrigation'],entryInstallations:[{id:'inst-browser-test',discipline:'irrigation'}]},verifiedAt:Date.now()};
const current={...previous,recovery:info,features:{...previous.features,shafts:false},workspace:{...previous.workspace,authorizationVersion:2,disciplines:['garden'],selectedDiscipline:'garden'}};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path.startsWith('/api/')){
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=Buffer.concat(chunks).length?JSON.parse(Buffer.concat(chunks)):{};
 res.setHeader('content-type','application/json');if(path==='/api/me'){res.end(JSON.stringify(current));return;}
 if(path==='/api/workspace/manifest'){assert.equal(req.headers['x-workspace-client-version'],'shared-directory-v1');res.end(JSON.stringify({stamp:'w:2:p:1',completeForRequestedIds:true,requestedCounts:Object.fromEntries(['records','gardens','services','serviceWork','defects'].map(kind=>[kind,input[kind].length])),allowed:Object.fromEntries(['records','gardens','services','serviceWork','defects'].map(kind=>[kind,input[kind].filter(id=>id==='shared-garden'||id==='allowed-job')])),workspace:current.workspace,features:current.features,writable:true}));return;}
 res.statusCode=404;res.end('{}');return;
 }
 if(path==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Isolated offline QA</title>');return;}
 if(!/^\/[a-z0-9-]+\.js$/.test(path)){res.statusCode=404;res.end();return;}
 res.setHeader('content-type','text/javascript');res.end(await readFile('web'+path));
 }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async previous=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('zavlahovy-denik-team',4);r.onupgradeneeded=()=>{for(const name of ['records','services','serviceWork','defects'])r.result.createObjectStore(name,{keyPath:'id'});r.result.createObjectStore('settings');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const tx=db.transaction(['settings','records','serviceWork'],'readwrite');tx.objectStore('settings').put(previous,'session');tx.objectStore('settings').put([{id:'shared-garden',notes:'PRIVATE_OLD_NOTES'}],'gardens');tx.objectStore('settings').put({ownerId:'worker-test',role:'worker',value:{fields:[{key:'work',value:'UNSENT_DRAFT'}]}},'form-draft:job:old');
  tx.objectStore('records').put({id:'old-shaft',gardenId:'shared-garden',version:1,_pending:true,image:new Blob(['SHAFT_PRIVATE_IMAGE'])});
  tx.objectStore('serviceWork').put({id:'worker-test|old-job',ownerId:'worker-test',jobId:'old-job',pending:true,payload:{operationId:'keep-original-id',report:{work:'UNSENT_REPORT'}},photos:[{id:'photo',storage:'bytes-v1',name:'original.jpg',type:'image/jpeg',bytes:new TextEncoder().encode('ORIGINAL_PHOTO_BYTES').buffer}]});
  tx.objectStore('serviceWork').put({id:'worker-test|allowed-job',ownerId:'worker-test',jobId:'allowed-job',accessRole:'worker',pending:true,payload:{operationId:'allowed-operation'},photos:[],snapshot:{job:{id:'allowed-job',gardenId:'shared-garden'}}});
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 },previous);
 const result=await page.evaluate(async()=>{window.events=[];window.addEventListener('workspace-access-reset',()=>events.push('reset'));const cloud=await import('/cloud.js');let code;try{await cloud.connect();}catch(error){code=error.code;}const r=indexedDB.open('zavlahovy-denik-team',5);const db=await new Promise(resolve=>r.onsuccess=()=>resolve(r.result));const read=name=>new Promise(resolve=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);});const recovery=await read('recovery');const work=await read('serviceWork');const settings=await read('settings');const records=await read('records');db.close();return {code,events,work:work.map(row=>({jobId:row.jobId,operation:row.payload.operationId,snapshot:row.snapshot})),records:records.length,settingsText:JSON.stringify(settings),archives:await Promise.all(recovery.map(async bundle=>({...bundle,parts:await Promise.all(bundle.parts.map(async part=>({index:part.index,bytes:[...new Uint8Array(await part.blob.arrayBuffer())]})))})))};});
 assert.equal(result.code,'workspace_reload');assert.deepEqual(result.events,['reset']);assert.equal(result.records,0);assert.deepEqual(result.work,[{jobId:'allowed-job',operation:'allowed-operation',snapshot:null}]);assert.ok(!result.settingsText.includes('PRIVATE'));assert.ok(!result.settingsText.includes('UNSENT'));assert.equal(result.archives.length,3);
 const privateKey=workspaceBase64(new Uint8Array(await crypto.subtle.exportKey('pkcs8',key.privateKey)));
 let recoveredPhoto=false;for(const archive of result.archives){assert.ok(!JSON.stringify(archive.manifest).includes('original.jpg'));const aes=await workspaceRecoveryAES(privateKey,archive.manifest);for(const part of archive.parts){const bytes=await openWorkspaceRecoveryPart(aes,archive.manifest,part.index,new Uint8Array(part.bytes));if(new TextDecoder().decode(bytes)==='ORIGINAL_PHOTO_BYTES')recoveredPhoto=true;}}
 assert.equal(recoveredPhoto,true);
 await page.reload();const restored=await page.evaluate(async()=>{const cloud=await import('/cloud.js');await cloud.connect();return {session:cloud.session().workspace.disciplines,work:(await cloud.cachedServiceWork()).map(row=>row.payload.operationId),archives:(await cloud.localWorkspaceRecovery()).length};});
 assert.deepEqual(restored,{session:['garden'],work:['allowed-operation'],archives:3});
 console.log('PASS Chromium 390px: actual IndexedDB v4→v5 upgrade, team revocation, atomic plaintext purge, encrypted report/photo/draft preservation, stable allowed operation IDs and persistence after reload. Loopback fixtures only; not actual iPhone/Safari.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
