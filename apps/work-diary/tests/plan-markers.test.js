import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request,shaftForm} from './fixtures.mjs';import {validateBackup} from '../web/model.js';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx);
const marker={shaftId:'s1',x:.3,y:.6};
function uploadPlan(version,pdf=false){const f=new FormData();f.set('version',String(version));f.set('plan',new Blob([pdf?'%PDF-1.4\n':new Uint8Array([137,80,78,71,13,10,26,10])],{type:pdf?'application/pdf':'image/png'}),pdf?'plan.pdf':'drone.png');return f;}
async function setup(){const env=environment();await call(env,'/api/me');for(const role of ['worker','reader']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}for(const id of ['g1','g2'])await call(env,'/api/gardens',people.owner,'POST',{id,name:id,address:'',notes:''});for(const [id,gardenId] of [['s1','g1'],['s2','g2'],['s3',null]]){const f=shaftForm(id),r=JSON.parse(f.get('record'));f.set('record',JSON.stringify({...r,gardenId}));await call(env,'/api/shafts/'+id,people.owner,'PUT',f);}const g=(await(await call(env,'/api/gardens/g1/plan',people.owner,'PUT',uploadPlan(1))).json()).garden;return {env,g};}
const save=(env,g,markers=[marker],person=people.worker)=>call(env,'/api/gardens/g1/plan-markers',person,'PUT',{version:g.version,planVersion:g.plan.version,markers});
test('Plan pins are shared, scoped to their image and garden, with conflict and role protection',async()=>{
 const {env,g}=await setup();assert.equal((await save(env,g,[marker],people.reader)).status,403);assert.equal((await save(env,g,[marker],people.outsider)).status,403);
 for(const markers of [[{...marker,shaftId:'s2'}],[{...marker,shaftId:'s3'}],[{...marker,shaftId:'missing'}],[marker,marker],[{...marker,x:-.1}],[{...marker,y:1.1}],[{...marker,x:'0.3'}]])assert.equal((await save(env,g,markers)).status,400);
 assert.equal((await save(env,{...g,plan:{...g.plan,version:'other-image'}})).status,409);
 const stored=await save(env,g);assert.equal(stored.status,200);const next=(await stored.json()).garden;assert.deepEqual(next.plan.markers,[marker]);assert.equal(next.version,g.version+1);
 assert.deepEqual((await(await call(env,'/api/gardens',people.reader)).json()).gardens.find(g=>g.id==='g1').plan.markers,[marker]);assert.equal((await save(env,g,[{...marker,x:.9}])).status,409);assert.equal((await save(env,next,[])).status,200);
});
test('Replacing a plan resets pins; stale or PDF annotations cannot be written',async()=>{
 const {env,g}=await setup();const updated=(await(await save(env,g)).json()).garden;const replacement=(await(await call(env,'/api/gardens/g1/plan',people.owner,'PUT',uploadPlan(updated.version,true))).json()).garden;assert.deepEqual(replacement.plan.markers,[]);assert.notEqual(replacement.plan.version,g.plan.version);assert.equal((await save(env,replacement)).status,400);assert.equal((await call(env,'/api/gardens/g1/plan',people.owner,'PUT',uploadPlan(updated.version))).status,409);assert.deepEqual((await(await call(env,'/api/gardens')).json()).gardens.find(g=>g.id==='g1').plan.markers,[]);
});
test('Moving a shaft during the write cannot leave a marker linked to another garden',async()=>{
 const {env,g}=await setup(),prepare=env.DB.prepare;env.DB.prepare=sql=>{if(sql.startsWith('UPDATE gardens SET plan_markers'))env.sqlite.exec("UPDATE shafts SET garden_id='g2' WHERE id='s1'");return prepare(sql);};assert.equal((await save(env,g)).status,409);assert.equal(env.sqlite.prepare("SELECT plan_markers FROM gardens WHERE id='g1'").get().plan_markers,'[]');
});
test('Backup v5 keeps plan pins and rejects wrong garden links or invalid coordinates',()=>{
 const record={id:'s1',gardenId:'g1',name:'Šachta',location:'',notes:'',markers:[],image:'data:image/jpeg;base64,abcd',createdAt:1,updatedAt:2};
 const garden={id:'g1',name:'Zahrada',address:'',notes:'',services:[],plan:{name:'drone.png',type:'image/png',data:'data:image/png;base64,abcd',markers:[marker]}};
 const backup={format:'zavlahovy-denik',version:5,zones:[],gardens:[garden],records:[record]};assert.equal(validateBackup(backup),backup);
 for(const markers of [[{...marker,shaftId:'missing'}],[{...marker,x:2}],[marker,marker]])assert.throws(()=>validateBackup({...backup,gardens:[{...garden,plan:{...garden.plan,markers}}]}));assert.throws(()=>validateBackup({...backup,records:[{...record,gardenId:null}]}));
});
