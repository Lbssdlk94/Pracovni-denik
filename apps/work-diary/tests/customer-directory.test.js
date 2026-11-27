import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {readImportSheet} from '../web/assistant-import.js';
import {directoryResult} from '../web/directory-cache.js';
const ctx={waitUntil:task=>task.catch(()=>{})};
const call=async(env,path,person=people.owner,method='GET',value)=>{const r=await api(request(path,person,method,value),env,ctx);return {status:r.status,body:await r.json()};};
const ready=async()=>{const env=environment();assert.equal((await call(env,'/api/me')).status,200);return env;};
const richCSV=count=>'ID zákazníka;Jméno;Kontaktní osoba;Telefon;E-mail;Adresa;Město;Fakturační název;Fakturační adresa;IČO;DIČ;Obor;Typ kontaktu\n'+Array.from({length:count},(_,i)=>`${i};Kontakt ${i};Majitel;777${String(i).padStart(6,'0')};owner${i}@example.cz;Lesní ${i};Příbram;Firma ${i};Fakturační ${i};12345678;CZ12345678;Obojí;${i%2?'Dodavatel':'Zákazník'}\n${i};Kontakt ${i};Správce;776${String(i).padStart(6,'0')};manager${i}@example.cz;Lipová ${i};Tábor;Firma ${i};Fakturační ${i};12345678;CZ12345678;Obojí;${i%2?'Dodavatel':'Zákazník'}`).join('\n');

test('250 profiles preserve two contacts, two addresses, billing and independent disciplines/kinds',()=>{
 const result=readImportSheet(richCSV(250),'Načti zákazníky');assert.equal(result.error,undefined);assert.equal(result.records.length,250);assert.deepEqual(result.skipped,[]);
 const r=result.records[249];assert.equal(r.contacts.length,2);assert.equal(r.phones.length,2);assert.equal(r.addresses.length,2);assert.equal(r.contacts[1].email,'manager249@example.cz');assert.equal(r.billing.address,'Fakturační 249');assert.equal(r.contactKind,'supplier');assert.deepEqual(r.disciplines,['irrigation','garden']);
 assert.match(readImportSheet(richCSV(251),'Načti zákazníky').error,/250/);
});
test('Explicit source IDs keep same-name people separate; conflicting group data is held for review',()=>{
 const distinct=readImportSheet('ID zákazníka;Jméno;Adresa\nA;Petr Salák;Lipová 1\nB;Petr Salák;Lesní 2');assert.equal(distinct.records.length,2);
 const conflict=readImportSheet('ID zákazníka;Jméno;Adresa;Fakturační adresa\nA;Novák;Lipová 1;Fakturační 1\nA;Novák;Lesní 2;Fakturační 2');assert.match(conflict.error,/fakturační/);
 const raw=readImportSheet('ID mWork;Zákazník;Telefon;Další kontakty;Adresa;Další adresy;Kategorie\nid-1;Novák;+420 000000001\u202c;Paní Nováková +420 777111222 (Manželka);Lesní 1;Lipová 2 [Chata];Dodavatel');assert.equal(raw.records[0].phone,'+420 000000001');assert.equal(raw.records[0].contacts[1].note,'Manželka');assert.equal(raw.records[0].addresses[1].label,'Chata');assert.deepEqual(raw.records[0].disciplines,[]);
});
test('Rich import uses current shared customer API and supplier contacts do not create gardens',async()=>{
 const env=await ready();try{
  const p=await call(env,'/api/assistant',people.owner,'POST',{file:{name:'z.csv',text:richCSV(10)}});assert.ok(p.body.confirm,JSON.stringify(p.body));
  let r=await call(env,'/api/assistant',people.owner,'POST',{confirmId:p.body.confirm.id});while(r.body.continueImport)r=await call(env,'/api/assistant',people.owner,'POST',{confirmId:r.body.confirm.id});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.importProgress.saved,10);
  const rows=env.sqlite.prepare('SELECT * FROM customers').all();assert.equal(rows.length,10);assert.equal(JSON.parse(rows[0].contacts).length,2);assert.equal(JSON.parse(rows[0].addresses).length,2);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM gardens').get().n,5);
  assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customer_disciplines').get().n,20);
  assert.equal((await call(env,'/api/customers?contactKind=supplier&discipline=both')).body.customers.length,5);
  const again=await call(env,'/api/assistant',people.owner,'POST',{file:{name:'z.csv',text:richCSV(10)}});assert.equal(again.body.confirm,null);
 }finally{env.sqlite.close();}
});
test('Archiving affects only directory listings; direct/job links remain, and old clients retain extra fields',async()=>{
 const env=await ready();try{
  const created=await call(env,'/api/customers/old',people.owner,'PUT',{version:0,name:'Archivovaný',phones:[],addresses:[],contacts:[{id:'c1',name:'Správce',email:'extra@example.cz'}],contactKind:'supplier'});assert.equal(created.status,200,JSON.stringify(created.body));
  env.sqlite.prepare("UPDATE customers SET directory_archived=1,import_details=? WHERE id='old'").run(JSON.stringify({original:[{hodnoceni:'Špatný','moje poznamka':'Interní důvod'}]}));
  assert.equal((await call(env,'/api/customers')).body.customers.length,0);const direct=await call(env,'/api/customers/old');assert.equal(direct.body.customer.archived,true);assert.equal(direct.body.customer.importDetails,undefined);
  const updated=await call(env,'/api/customers/old',people.owner,'PUT',{version:created.body.customer.version,name:'Archivovaný',phones:[],addresses:[]});assert.equal(updated.status,200);assert.equal(updated.body.customer.contacts.length,1);assert.equal(updated.body.customer.contactKind,'supplier');
  assert.equal((await call(env,'/api/customers?includeArchived=1')).body.customers.length,1);
  const offline={at:Date.now(),customers:[updated.body.customer],gardens:[]};assert.equal(directoryResult('/api/customers',offline,{offline:true}).customers.length,0);assert.equal(directoryResult('/api/customers/old',offline,{offline:true}).customer.id,'old');
 }finally{env.sqlite.close();}
});
