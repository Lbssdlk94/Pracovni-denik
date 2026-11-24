import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment, people, request} from './fixtures.mjs';
import {interpretAssistant} from '../web/assistant-commands.js';
import {answerOffline} from '../web/assistant-offline.js';

const ctx={waitUntil:task=>Promise.resolve(task).catch(()=>{})};
const call=(env,path,person=people.owner,method='GET',value,extra)=>api(request(path,person,method,value,extra),env,ctx);
async function ok(response){assert.equal(response.status,200,await response.clone().text());return response.json();}
const day='2026-11-24';
const jpeg=new Uint8Array([255,216,255,219,0,1,2,3,4,5,6,7,8,9,10,11,12,13]);
async function setup(){const env=environment();await ok(await call(env,'/api/me'));for(const role of ['worker','admin','reader']){await ok(await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await ok(await call(env,'/api/me',people[role]));}return env;}
async function challenge(env,age=5000){const data=await ok(await call(env,'/api/inquiries/public/challenge',null));env.sqlite.prepare('UPDATE inquiry_challenges SET issued_at=? WHERE id=?').run(Date.now()-age,data.challenge);return data.challenge;}
function payload(token,extra={}){return {firstName:'Jan',lastName:'Novák',phone:'+420 777 111 222',email:'jan.novak@example.com',street:'Zahradní 12',city:'Praha',zip:'110 00',category:'irrigation',serviceType:'service',description:'Závlaha na zahradě netěsní u ventilu.',preferredDate:'2026-12-01',extras:{area:'400 m2',water:'studna'},consent:true,clientToken:token,website:'',...extra};}
async function submit(env,extra={}){const token=extra.clientToken||crypto.randomUUID();const body=payload(token,{challenge:await challenge(env),...extra});delete body.clientToken;body.clientToken=token;const response=await call(env,'/api/inquiries/public',null,'POST',body);return {response,body,token};}

test('Veřejný formulář uloží poptávku, odmítne spam a nepustí čtení',async()=>{
 const env=await setup();
 assert.equal((await call(env,'/api/inquiries',null)).status,401);
 assert.equal((await call(env,'/api/inquiries',people.worker)).status,403);
 assert.equal((await call(env,'/api/inquiries',people.reader)).status,403);
 assert.equal((await call(env,'/api/inquiries',people.outsider)).status,403);
 const fast=await ok(await call(env,'/api/inquiries/public/challenge',null));
 assert.equal((await call(env,'/api/inquiries/public',null,'POST',payload(crypto.randomUUID(),{challenge:fast.challenge}))).status,400);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM inquiries').get().n,0);
 const honey=await submit(env,{website:'https://spam.example'});
 assert.equal(honey.response.status,400);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM inquiries').get().n,0);
 const cross=request('/api/inquiries/public',null,'POST',payload(crypto.randomUUID(),{challenge:await challenge(env)}),{origin:'https://evil.example','sec-fetch-site':'cross-site'});
 assert.equal((await api(cross,env,ctx)).status,403);
 const first=await submit(env);
 const created=await ok(first.response);
 assert.match(created.number,/^P-\d{4}-\d{4}$/);
 assert.equal(created.replayed,false);
 assert.ok(created.uploadToken);
 const replay=await ok(await call(env,'/api/inquiries/public',null,'POST',{clientToken:first.token}));
 assert.equal(replay.replayed,true);
 assert.equal(replay.number,created.number);
 assert.equal(replay.uploadToken,null);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM inquiries').get().n,1);
 assert.equal((await call(env,'/api/inquiries/public/'+created.id,null)).status,404);
 const bad=new Request('https://zavlahy.test/api/inquiries/public/'+created.id+'/photos',{method:'PUT',headers:{'content-type':'image/jpeg','x-inquiry-upload':created.uploadToken,'x-zavlahy-request':'1'},body:new TextEncoder().encode('tohle neni fotografie!!')});
 assert.equal((await api(bad,env,ctx)).status,400);
 const good=new Request('https://zavlahy.test/api/inquiries/public/'+created.id+'/photos',{method:'PUT',headers:{'content-type':'image/jpeg','x-inquiry-upload':created.uploadToken,'x-zavlahy-request':'1','x-file-name':'misto.jpg'},body:jpeg});
 const photo=await ok(await api(good,env,ctx));
 const visible=await call(env,'/api/inquiries/'+created.id+'/photos/'+photo.id);
 assert.equal(visible.status,200);
 assert.equal(visible.headers.get('content-type'),'image/jpeg');
 assert.equal((await call(env,'/api/inquiries/'+created.id+'/photos/'+photo.id,null)).status,401);
 assert.equal((await call(env,'/api/inquiries/'+created.id+'/photos/'+photo.id,people.worker)).status,403);
 const detail=await ok(await call(env,'/api/inquiries/'+created.id));
 assert.equal(detail.inquiry.photos.length,1);
 assert.ok(detail.inquiry.events.some(event=>event.summary.includes('odeslal')));
 assert.equal(JSON.stringify(detail).includes('consent'),false);
 const notes=await ok(await call(env,'/api/notifications'));
 assert.ok(notes.notifications.some(item=>item.kind==='inquiry_new'&&item.resourceId===created.id));
 const workerNotes=await ok(await call(env,'/api/notifications',people.worker));
 assert.equal(workerNotes.notifications.some(item=>item.kind.startsWith('inquiry_')),false);
});

test('Správce filtruje, mění stav a neslučuje duplicitu automaticky',async()=>{
 const env=await setup();
 await ok(await call(env,'/api/customers/existing-novak',people.owner,'PUT',{version:0,name:'Jan Novák',email:'jan.novak@example.com',phones:[{id:'phone',label:'Mobil',number:'+420 777 111 222'}],addresses:[{id:'home',label:'Dům',address:'Jiná 1',city:'Brno'}]}));
 const older=await ok((await submit(env,{clientToken:crypto.randomUUID(),email:'starsí@example.com',phone:'+420 601 000 111',lastName:'Starší'})).response);
 const fresh=await ok((await submit(env)).response);
 const garden=await ok((await submit(env,{category:'garden',serviceType:'maintenance',email:'eva.garden@example.com',phone:'+420 602 000 222',firstName:'Eva',lastName:'Malá'})).response);
 let open=await ok(await call(env,'/api/inquiries'));
 assert.equal(open.inquiries[0].status,'new');
 assert.ok(open.inquiries.findIndex(item=>item.id===fresh.id)<open.inquiries.findIndex(item=>item.status!=='new'&&item.id===older.id)||open.inquiries.every(item=>item.status==='new'));
 const patched=await ok(await call(env,'/api/inquiries/'+older.id,people.owner,'PATCH',{version:1,status:'contacted',internalNote:'Voláno dopoledne.',assigneeId:people.admin.id}));
 assert.equal(patched.inquiry.status,'contacted');
 const again=await ok(await call(env,'/api/inquiries/'+older.id));
 assert.ok(again.inquiry.events.some(event=>event.summary.startsWith('Stav:')));
 assert.equal((await ok(await call(env,'/api/inquiries/summary'))).newCount,2);
 const filtered=await ok(await call(env,'/api/inquiries?category=garden'));
 assert.deepEqual(filtered.inquiries.map(item=>item.id),[garden.id]);
 open=await ok(await call(env,'/api/inquiries'));
 const order=open.inquiries.map(item=>item.id);
 assert.ok(order.indexOf(garden.id)<order.indexOf(older.id));
 assert.ok(order.indexOf(fresh.id)<order.indexOf(older.id));
 assert.equal(open.inquiries.some(item=>item.id===older.id),true);
 await ok(await call(env,'/api/inquiries/'+older.id,people.owner,'PATCH',{version:patched.inquiry.version,status:'archived'}));
 const closed=await ok(await call(env,'/api/inquiries?closed=1'));
 assert.ok(closed.inquiries.some(item=>item.id===older.id));
 assert.equal((await ok(await call(env,'/api/inquiries'))).inquiries.some(item=>item.id===older.id),false);
 const duplicate=await ok(await call(env,'/api/inquiries/'+fresh.id));
 assert.equal(duplicate.inquiry.customerId,null);
 assert.ok(duplicate.duplicates.customers.some(item=>item.id==='existing-novak'));
 const linked=await ok(await call(env,'/api/inquiries/'+fresh.id+'/link',people.owner,'POST',{version:duplicate.inquiry.version,customerId:'existing-novak'}));
 assert.equal(linked.inquiry.customerId,'existing-novak');
 assert.equal(linked.inquiry.jobId,null);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM customers WHERE deleted=0').get().n,1);
});

test('Převod založí zákazníka a zakázku jen jednou',async()=>{
 const env=await setup();
 const created=await ok((await submit(env,{email:'nova.poptavka@example.com',phone:'+420 603 000 333',firstName:'Petr',lastName:'Horák'})).response);
 const photo=await ok(await api(new Request('https://zavlahy.test/api/inquiries/public/'+created.id+'/photos',{method:'PUT',headers:{'content-type':'image/jpeg','x-inquiry-upload':created.uploadToken,'x-zavlahy-request':'1','x-file-name':'misto.jpg'},body:jpeg}),env,ctx));
 assert.equal(photo.replayed,false);
 const preview=await ok(await call(env,'/api/inquiries/'+created.id+'/convert',people.owner,'POST',{preview:true}));
 assert.equal(preview.preview,true);
 assert.equal(preview.suggestion.jobType,'service');
 const done=await ok(await call(env,'/api/inquiries/'+created.id+'/convert',people.owner,'POST',{version:1,mode:'new',acknowledgeDuplicates:false,job:preview.suggestion}));
 assert.equal(done.inquiry.status,'converted');
 assert.ok(done.jobId);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM gardens WHERE customer_id=? AND deleted=0').get(done.customerId).n,1);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM jobs WHERE id=? AND deleted=0').get(done.jobId).n,1);
 assert.equal((await call(env,'/api/inquiries/'+created.id+'/convert',people.owner,'POST',{version:done.inquiry.version,mode:'new',job:preview.suggestion})).status,409);
 assert.equal((await call(env,'/api/inquiries/'+created.id,people.worker)).status,403);
});

test('Asistent poptávky čte bez zápisu a převod čeká na potvrzení',async()=>{
 assert.equal(interpretAssistant('Kteří zákazníci čekají na servis?',day).intent,'customers.waitingService');
 assert.equal(interpretAssistant('Co máme dnes?',day).intent,'jobs.today');
 assert.equal(interpretAssistant('Jaká je další zakázka?',day).intent,'jobs.next');
 assert.equal(interpretAssistant('Ukonči práci.',day).intent,'jobs.work');
 assert.equal(interpretAssistant('Jedu na další zakázku.',day).intent,'jobs.depart');
 assert.equal(interpretAssistant('Máme nějaké nové poptávky?',day).intent,'inquiries.count');
 assert.equal(interpretAssistant('Kolik je nových?',day).intent,'inquiries.count');
 assert.equal(interpretAssistant('Kdo čeká na cenovou nabídku?',day).intent,'inquiries.open');
 assert.deepEqual(interpretAssistant('Kdo čeká na cenovou nabídku?',day).params.statuses,['quote_prep','quote_sent','awaiting']);
 assert.equal(interpretAssistant('Kterým zákazníkům jsme ještě nezavolali?',day).intent,'inquiries.open');
 assert.equal(interpretAssistant('Kterým zákazníkům jsme ještě nezavolali?',day).params.status,'new');
 assert.equal(interpretAssistant('Ukaž mi nové poptávky na závlahy.',day).params.category,'irrigation');
 assert.equal(interpretAssistant('Shrň poslední poptávku.',day).intent,'inquiries.detail');
 assert.equal(interpretAssistant('Co potřebujeme zjistit od tohoto zákazníka?',day).params.mode,'missing');
 assert.equal(interpretAssistant('Připrav odpověď zákazníkovi.',day).params.mode,'reply');
 assert.equal(interpretAssistant('Převeď tuto poptávku na zakázku.',day).intent,'inquiries.convert');
 assert.match(answerOffline({intent:'inquiries.count'}).reply,/Poptávky v zařízení nemám/);
 assert.match(answerOffline({intent:'inquiries.convert',text:'Převeď tuto poptávku na zakázku.'}).reply,/neukládám|nezměnilo/);
 const env=await setup();
 await ok((await submit(env,{email:'asistent.poptavka@example.com',phone:'+420 604 000 444',firstName:'Lucie',lastName:'Veselá',description:'Potřebujeme novou závlahu k terase a zdroji vody.'})).response);
 const worker=await ok(await call(env,'/api/assistant',people.worker,'POST',{text:'Máme nějaké nové poptávky?'}));
 assert.match(worker.reply,/správce/);
 const counted=await ok(await call(env,'/api/assistant',people.owner,'POST',{text:'Máme nějaké nové poptávky?'}));
 assert.match(counted.reply,/1/);
 assert.equal(counted.confirm,null);
 const draft=await ok(await call(env,'/api/assistant',people.owner,'POST',{text:'Připrav odpověď zákazníkovi.'}));
 assert.match(draft.reply,/neodeslal|Návrh/);
 assert.equal(draft.confirm,null);
 const proposed=await ok(await call(env,'/api/assistant',people.owner,'POST',{text:'Převeď tuto poptávku na zakázku.'}));
 assert.ok(proposed.confirm?.id);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM jobs WHERE deleted=0').get().n,0);
 const committed=await ok(await call(env,'/api/assistant',people.owner,'POST',{confirmId:proposed.confirm.id}));
 assert.match(committed.reply,/zakázk/i);
 assert.equal(env.sqlite.prepare("SELECT status FROM inquiries").get().status,'converted');
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM jobs WHERE deleted=0').get().n,1);
});

test('Veřejné odeslání má limit osmi poptávek za hodinu',async()=>{
 const env=await setup();
 for(let i=0;i<8;i++)assert.equal((await submit(env,{email:`limit${i}@example.com`,phone:`+420 777 000 00${i}`})).response.status,200);
 assert.equal((await submit(env,{email:'limit9@example.com',phone:'+420 777 000 099'})).response.status,429);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM inquiries').get().n,8);
});
