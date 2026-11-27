import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {environment,people,request} from './fixtures.mjs';

test('Compiled public form accepts anonymous inquiry and photo while keeping the manager list private',async()=>{
 const source=readFileSync('dist/server/index.js','utf8');
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 const env=environment(),pending=[],ctx={waitUntil:promise=>pending.push(Promise.resolve(promise).catch(()=>{}))};
 const call=(path,person,method='GET',value,headers={})=>worker.fetch(request(path,person,method,value,headers),env,ctx);
 try{
  assert.equal((await call('/api/me',people.owner)).status,200);
  const html=await call('/poptavka.html');assert.equal(html.status,200);assert.match(await html.text(),/id="poptavka"/);
  const challengeResponse=await call('/api/inquiries/public/challenge');assert.equal(challengeResponse.status,200);const {challenge}=await challengeResponse.json();
  env.sqlite.prepare('UPDATE inquiry_challenges SET issued_at=? WHERE id=?').run(Date.now()-5000,challenge);
  const value={firstName:'Test',lastName:'Zákazník',phone:'+420 777 111 222',email:'customer@example.test',street:'Zahradní 1',city:'Plzeň',category:'irrigation',serviceType:'service',description:'Nefunkční postřikovač na zahradě.',consent:true,clientToken:crypto.randomUUID(),challenge,website:''};
  const response=await call('/api/inquiries/public',null,'POST',value);assert.equal(response.status,200,await response.clone().text());const saved=await response.json();assert.ok(saved.number);assert.ok(saved.uploadToken);
  const upload=new Request('https://example.test/api/inquiries/public/'+saved.id+'/photos',{method:'PUT',headers:{'content-type':'image/jpeg','x-inquiry-upload':saved.uploadToken,'x-file-name':'garden.jpg','x-zavlahy-request':'1'},body:new Uint8Array([255,216,255,219,0,1,2,3,4,5,6,7,8,9,10,11,12,13])});
  const photo=await worker.fetch(upload,env,ctx);assert.equal(photo.status,200,await photo.clone().text());
  assert.equal((await call('/api/inquiries')).status,401);
  const list=await call('/api/inquiries',people.owner);assert.equal(list.status,200);assert.match(await list.text(),new RegExp(saved.number));
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM inquiries').get().n,1);
  const replay=await call('/api/inquiries/public',null,'POST',value);assert.equal(replay.status,200);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM inquiries').get().n,1);
  await Promise.all(pending);
 }finally{env.sqlite.close();}
});
