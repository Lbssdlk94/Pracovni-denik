import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {readImportSheet,customerImportConflict} from '../web/assistant-import.js';
const ctx={waitUntil:task=>task.catch(()=>{})};
const call=async(env,person,value,headers={})=>{const response=await api(request('/api/assistant',person,'POST',value,headers),env,ctx);return {status:response.status,body:await response.json()};};
const csv=count=>'Zákazník;Ulice a číslo;Město;PSČ;Telefon;E-mail\n'+Array.from({length:count},(_,i)=>`Import ${i+1};Lesní ${i+1};Příbram;261 01;777${String(i).padStart(6,'0')};import${i}@example.cz`).join('\n');
const prepare=async()=>{const env=environment();assert.equal((await api(request('/api/me',people.owner),env,ctx)).status,200);return env;};

test('100 Czech contacts retain postal codes; oversized, broken and ambiguous rows are explained',()=>{
  const sheet=readImportSheet(csv(100));assert.equal(sheet.records.length,100);assert.equal(sheet.records[99].address,'Lesní 100, 261 01');
  assert.match(readImportSheet(csv(251)).error,/250 zákazníků|250/);
  assert.match(readImportSheet('Jméno;Adresa\n"Novák;Lesní 1').error,/uvozovka/);
  const duplicates=readImportSheet('Jméno;Adresa\nNovák;Lesní 1\nNovák;Jiná 2');assert.equal(duplicates.records.length,1);assert.match(duplicates.skipped[0],/ruční kontrolu/);
  assert.match(customerImportConflict({name:'Jiný',email:'SHARED@example.cz'},[{name:'Původní',email:'shared@example.cz'}]),/e-mail/);
  assert.match(customerImportConflict({name:'Jiný',phone:'777 111 222'},[{name:'Původní',phones:[{number:'777111222'}]}]),/telefon/);
  const material='Název;Jednotka;Cena\n'+Array.from({length:41},(_,i)=>`Materiál ${i};ks;10`).join('\n');assert.match(readImportSheet(material).error,/40/);
});

test('100 customers: full preview, 20 bounded chunks, replayed response resumes the same chain',async()=>{
  const env=await prepare();try{
    const preview=await call(env,people.owner,{text:'Načti zákazníky',file:{name:'zakaznici.csv',text:csv(100)}});
    assert.equal(preview.status,200,JSON.stringify(preview.body));assert.match(preview.body.reply,/Import 100/);assert.match(preview.body.reply,/100 zákazníků/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n,0);
    const id=preview.body.confirm.id;
    let chunk=await call(env,people.owner,{confirmId:id});assert.equal(chunk.status,200,JSON.stringify(chunk.body));assert.equal(chunk.body.importProgress.saved,5);
    const replay=await call(env,people.owner,{confirmId:id});assert.equal(replay.body.confirm.id,chunk.body.confirm.id);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n,5);
    let chunks=1;
    while(chunk.body.continueImport){chunk=await call(env,people.owner,{confirmId:chunk.body.confirm.id});assert.equal(chunk.status,200,JSON.stringify(chunk.body));chunks++;assert.ok(chunks<=20);}
    assert.equal(chunks,20);assert.equal(chunk.body.importProgress.done,true);assert.equal(chunk.body.importProgress.saved,100);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n,100);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM gardens WHERE customer_id IS NOT NULL').get().n,100);
    const second=await call(env,people.owner,{file:{name:'zakaznici.csv',text:csv(100)}});assert.equal(second.body.confirm,null);assert.match(second.body.reply,/Žádného nového/);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n,100);
  }finally{env.sqlite.close();}
});

test('Repeated contacts in the file are held for review; existing contacts are not overwritten',async()=>{
  const env=await prepare();try{
    const text='Jméno;E-mail;Adresa\nPrvní;shared@example.cz;Lesní 1\nDruhý;shared@example.cz;Lesní 2';
    const proposal=await call(env,people.owner,{file:{name:'z.csv',text}});assert.match(proposal.body.reply,/e-mail už/);
    const result=await call(env,people.owner,{confirmId:proposal.body.confirm.id});assert.equal(result.body.importProgress.saved,1);
    const again=await call(env,people.owner,{file:{name:'z.csv',text:'Jméno;Adresa\nPrvní;Přepsaná 99'}});assert.equal(again.body.confirm,null);
    assert.match(env.sqlite.prepare('SELECT addresses FROM customers').get().addresses,/Lesní 1/);
  }finally{env.sqlite.close();}
});

test('Membership, confirmation owner, preview and current module settings are checked server-side',async()=>{
  const env=await prepare();try{
    await api(request('/api/invitations',people.owner,'POST',{email:people.worker.email,role:'worker'}),env,ctx);
    await api(request('/api/me',people.worker),env,ctx);
    const blocked=await call(env,people.worker,{file:{name:'z.csv',text:csv(10)}});assert.equal(blocked.body.confirm,null);
    const p=await call(env,people.owner,{file:{name:'z.csv',text:csv(10)}});
    assert.equal((await call(env,people.worker,{confirmId:p.body.confirm.id})).status,404);
    assert.equal((await call(env,people.owner,{confirmId:p.body.confirm.id},{'x-work-diary-preview-role':'worker'})).status,403);
    const first=await call(env,people.owner,{confirmId:p.body.confirm.id});assert.equal(first.body.importProgress.saved,5);
    env.sqlite.prepare("UPDATE members SET role='worker' WHERE user_id=?").run(people.owner.id);
    const denied=await call(env,people.owner,{confirmId:first.body.confirm.id});assert.equal(denied.body.importProgress,undefined);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n,5);
  }finally{env.sqlite.close();}
});

test('Interrupted writes can retry the same approved IDs without duplicating customer/garden pairs',async()=>{
  const env=await prepare();try{
    const p=await call(env,people.owner,{file:{name:'z.csv',text:csv(10)}});
    const original=env.DB.batch;let failed=false;
    env.DB.batch=async statements=>{const result=await original(statements);if(!failed&&env.sqlite.prepare('SELECT count(*) n FROM customers').get().n===3){failed=true;throw Error('simulated lost database response');}return result;};
    const failure=await call(env,people.owner,{confirmId:p.body.confirm.id});assert.equal(failure.status,500);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n,3);
    env.DB.batch=original;
    const resumed=await call(env,people.owner,{confirmId:p.body.confirm.id});assert.equal(resumed.body.importProgress.saved,5);
    const done=await call(env,people.owner,{confirmId:resumed.body.confirm.id});assert.equal(done.body.importProgress.saved,10);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n,10);
    assert.equal(env.sqlite.prepare('SELECT count(*) n FROM gardens WHERE customer_id IS NOT NULL').get().n,10);
  }finally{env.sqlite.close();}
});
