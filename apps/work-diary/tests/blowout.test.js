import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';import {validateBackup} from '../web/model.js';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx),path='/api/gardens/g1/blowout';
const jpeg=new Uint8Array([255,216,255,219,0,1,2,3]);
function form(version,steps=[{id:'compressor',title:'Připojení kompresoru',notes:'Spojka u filtru',photos:[{id:'p1'}]}],files=['p1']){const f=new FormData();f.set('document',JSON.stringify({version,steps}));for(const id of files)f.set('photo:'+id,new Blob([jpeg],{type:'image/jpeg'}),'photo.jpg');return f;}
async function setup(){const env=environment();await call(env,'/api/me');for(const role of ['worker','reader']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}for(const id of ['g1','g2'])await call(env,'/api/gardens',people.owner,'POST',{id,name:id,address:'',notes:''});return env;}
test('Blowout documents and photos are durable, team-shared, role-checked and garden-scoped',async()=>{
 const env=await setup();assert.deepEqual(await(await call(env,path)).json(),{version:1,steps:[]});
 assert.equal((await call(env,path,people.reader,'PUT',form(1))).status,403);assert.equal((await call(env,path,people.outsider)).status,403);assert.equal((await call(env,path,null)).status,401);
 const r=await call(env,path,people.worker,'PUT',form(1));assert.equal(r.status,200);const doc=await r.json();assert.equal(doc.version,2);assert.equal(doc.steps[0].photos[0].key,undefined);assert.equal(env.objects.size,1);
 assert.deepEqual(await(await call(env,path,people.reader)).json(),doc);assert.deepEqual(new Uint8Array(await(await call(env,path+'/photos/p1',people.reader)).arrayBuffer()),jpeg);
 assert.equal((await call(env,'/api/gardens/g2/blowout/photos/p1')).status,404);assert.equal((await call(env,path+'/photos/p1',people.outsider)).status,403);
 const edited={...doc.steps[0],notes:'Nový popis'};assert.equal((await call(env,path,people.worker,'PUT',form(2,[edited],[]))).status,200);assert.equal(env.objects.size,1);
 assert.equal((await call(env,path,people.worker,'PUT',form(2,[{...edited,notes:'Stará změna'}],[]))).status,409);
 assert.equal((await call(env,path,people.worker,'PUT',form(3,[],[]))).status,200);assert.equal(env.objects.size,0);assert.equal((await call(env,path+'/photos/p1')).status,404);
});
test('Invalid photos, forged references, duplicate IDs and malformed payloads do not write files',async()=>{
 const env=await setup(),step={id:'a',title:'Voda',notes:'',photos:[]};
 for(const steps of [[{...step,photos:[{id:'stolen',key:'secret'}]}],[step,step],[{...step,photos:Array.from({length:7},(_,i)=>({id:'p'+i}))}],Array.from({length:31},(_,i)=>({...step,id:'s'+i}))])assert.equal((await call(env,path,people.worker,'PUT',form(1,steps,[]))).status,400);
 const bad=form(1);bad.set('photo:p1',new Blob(['<svg/>'],{type:'image/svg+xml'}),'bad.svg');assert.equal((await call(env,path,people.worker,'PUT',bad)).status,400);
 const nullDoc=form(1);nullDoc.set('document','null');assert.equal((await call(env,path,people.worker,'PUT',nullDoc)).status,400);assert.equal(env.objects.size,0);
});
test('Concurrent change or garden deletion during upload cannot overwrite data or orphan new images',async()=>{
 for(const remove of [false,true]){const env=await setup(),prepare=env.DB.prepare;env.DB.prepare=sql=>{if(sql.startsWith('UPDATE gardens SET blowout='))env.sqlite.exec(`UPDATE gardens SET version=version+1${remove?',deleted=1':''} WHERE id='g1'`);return prepare(sql);};assert.equal((await call(env,path,people.worker,'PUT',form(1))).status,409);assert.equal(env.objects.size,0);assert.equal(env.sqlite.prepare("SELECT blowout FROM gardens WHERE id='g1'").get().blowout,'[]');}
});
test('Garden deletion checks changed documentation and removes all blowout photos',async()=>{
 const env=await setup(),preview=await(await call(env,'/api/gardens/g1/delete-preview')).json();await call(env,path,people.worker,'PUT',form(1));
 const deletion=p=>call(env,'/api/gardens/g1',people.owner,'DELETE',{version:p.garden.version,shafts:p.shafts,services:p.services,mode:'keep-shafts'});
 assert.equal((await deletion(preview)).status,409);assert.equal(env.objects.size,1);
 const fresh=await(await call(env,'/api/gardens/g1/delete-preview')).json();assert.equal((await deletion(fresh)).status,200);assert.equal(env.objects.size,0);assert.equal((await call(env,path)).status,404);assert.equal((await call(env,path,people.worker,'PUT',form(2))).status,404);
});
test('Backup v6 validates blowout steps, photos and unique identifiers while preserving earlier formats',()=>{
 const garden={id:'g1',name:'Zahrada',address:'',notes:'',services:[],plan:null,blowout:[{id:'compressor',title:'Kompresor',notes:'U filtru',photos:[{id:'p1',type:'image/jpeg',data:'data:image/jpeg;base64,/9j/2wABAgM='}]}]},backup={format:'zavlahovy-denik',version:6,zones:[],records:[],gardens:[garden]};assert.equal(validateBackup(backup),backup);
 for(const blowout of [undefined,[garden.blowout[0],garden.blowout[0]],[{...garden.blowout[0],photos:[{id:'x',type:'image/svg+xml',data:'data:image/svg+xml;base64,abcd'}]}]])assert.throws(()=>validateBackup({...backup,gardens:[{...garden,blowout}]}));
 const {blowout,...old}=garden;assert.equal(validateBackup({...backup,version:5,gardens:[old]}).version,5);
});
test('Removing built-in items persists for the garden, removes photos and survives backup validation',async()=>{
 const env=await setup();await call(env,path,people.worker,'PUT',form(1));
 const hidden=['compressor','pump','water','supply'].map(id=>({id,title:id,notes:'',photos:[],hidden:true}));
 const result=await call(env,path,people.worker,'PUT',form(2,hidden,[]));assert.equal(result.status,200);assert.equal(env.objects.size,0);assert.equal((await call(env,path+'/photos/p1')).status,404);
 assert.deepEqual((await(await call(env,path,people.reader)).json()).steps,hidden);assert.deepEqual((await(await call(env,'/api/gardens/g2/blowout')).json()).steps,[]);
 const backup={format:'zavlahovy-denik',version:6,zones:[],records:[],gardens:[{id:'g1',name:'Zahrada',address:'',notes:'',services:[],plan:null,blowout:hidden}]};assert.equal(validateBackup(backup),backup);
 for(const bad of [{...hidden[0],notes:'hidden content'},{...hidden[0],id:'custom'},{...hidden[0],hidden:'true'}]){assert.equal((await call(env,path,people.worker,'PUT',form(3,[bad],[]))).status,400);assert.throws(()=>validateBackup({...backup,gardens:[{...backup.gardens[0],blowout:[bad]}]}));}
 const active=Array.from({length:30},(_,i)=>({id:'custom'+i,title:'Další položka',notes:'',photos:[]}));assert.equal((await call(env,path,people.worker,'PUT',form(3,[...hidden,...active],[]))).status,200);
});
