import test from 'node:test';
import assert from 'node:assert/strict';
import {createJobListCache,jobCacheMonths} from '../web/job-list-cache.js';

function fixture(){
 let clock=Date.parse('2026-11-12T12:00:00Z'),state,connected=true;
 const session={user:{id:'worker',role:'worker'},permissions:{write:true,manage:false},features:{jobs:true,offline:true},installation:{id:'installation'},verifiedAt:clock,workspace:{workspaceId:'pair',authorizationVersion:1,disciplines:['irrigation'],selectedDiscipline:'irrigation'}};
 const jobs=['2026-11','2026-10','2026-12'].flatMap((month,m)=>Array.from({length:m===0?125:m===1?105:115},(_,i)=>({id:month+'-'+i,version:1,title:'Práce '+i,customerName:'Zákazník '+i,dueDate:month+'-'+String(i%25+1).padStart(2,'0'),status:i===0?'in_progress':i===1?'incomplete':i===2?'done':'planned',protocolStatus:'ready',jobType:i%2?'survey':'service',assignedTo:'worker',assignedTos:['worker'],discipline:'irrigation',gardenNotes:'PRIVATE_GARDEN_NOTE',customerContact:{id:'customer',name:'Kontakt',phones:['PRIVATE_PHONE'],addresses:['PRIVATE_ADDRESS']}})));
 let calls=0,hook=null;
 const send=async path=>{calls++;if(hook)return hook(path);const p=new URL(path,'https://test').searchParams,month=p.get('month'),offset=Number(p.get('cursor')||0);let rows=jobs.filter(j=>!month||j.dueDate.startsWith(month));if(p.get('day'))rows=rows.filter(j=>j.dueDate===p.get('day'));return {listRevision:1,jobs:structuredClone(rows.slice(offset,offset+100)),nextCursor:rows.length>offset+100?String(offset+100):null,calendar:{days:[],undatedCount:0}};};
 const events=[];
 const make=()=>createJobListCache({read:async()=>structuredClone(state),change:async fn=>{state=fn(structuredClone(state));},send,getSession:()=>session,online:()=>connected,now:()=>clock,notify:event=>events.push(event)});
 return {cache:make(),make,jobs,session,events,get calls(){return calls;},get state(){return state;},set clock(v){clock=v;},set online(v){connected=v;},set hook(v){hook=v;}};
}
const path='/api/jobs?order=schedule&state=all&month=2026-11&day=2026-11-12';
const settled=()=>new Promise(setImmediate);

test('Rolling month window respects Prague time and December/January boundary',()=>{
 assert.deepEqual(jobCacheMonths(new Date('2026-12-31T23:30:00Z')),['2027-01','2026-12','2027-02']);
 assert.deepEqual(jobCacheMonths(new Date('2026-11-12')),['2026-11','2026-10','2026-12']);
});
test('All three months paginate completely, persist through a new controller and serve day/type/protocol filters without another request',async()=>{
 const f=fixture();await f.cache.warm();assert.equal(f.calls,6);assert.deepEqual(f.state.months.map(m=>m.jobs.length),[125,105,115]);
 const result=await f.cache.request(path);assert.equal(result.jobs.length,5);assert.equal(f.calls,6);assert.ok(result._jobCache);const future=await f.cache.request('/api/jobs?order=schedule&state=all&month=2026-12&day=2026-12-12');assert.equal(future.jobs.length,5);assert.equal(f.calls,6);
 const survey=await f.cache.request(path+'&type=survey');assert.ok(survey.jobs.every(j=>j.jobType==='survey'));assert.equal(survey.calendar.days.reduce((n,d)=>n+d.count,0),62);
 const done=await f.cache.request('/api/jobs?order=schedule&state=done&protocol=ready&month=2026-11');assert.deepEqual(done.jobs.map(j=>j.id),['2026-11-2']);
 const reopened=f.make();await reopened.reconcile(f.session,f.jobs.map(j=>j.id),Object.fromEntries(f.jobs.map(j=>[j.id,j.version])));assert.equal((await reopened.request(path)).jobs.length,5);assert.equal(f.calls,6);
 assert.ok(!JSON.stringify(f.state).includes('PRIVATE_'),'Only lean overview data belongs in the month cache');
});
test('Offline cache requires the same unexpired account, grants and enabled offline module',async()=>{
 const f=fixture();await f.cache.warm();f.online=false;assert.equal((await f.cache.request(path)).jobs.length,5);assert.equal(f.calls,6);
 f.session.user.id='other';assert.equal(await f.cache.peek(path),null);f.session.user.id='worker';f.session.workspace.selectedDiscipline='garden';assert.equal(await f.cache.peek(path),null);
 f.session.workspace.selectedDiscipline='irrigation';f.session.features.offline=false;assert.equal(await f.cache.peek(path),null);f.session.features.offline=true;f.clock=Date.parse('2026-11-14T12:00:00Z');assert.equal(await f.cache.peek(path),null);
});
test('A changed version or removed assignment drops affected snapshots before cached data can be exposed',async()=>{
 const f=fixture();await f.cache.warm();const versions=Object.fromEntries(f.jobs.map(j=>[j.id,1]));versions['2026-11-0']=2;
 await f.cache.reconcile(f.session,f.jobs.map(j=>j.id),versions);assert.equal(await f.cache.peek(path),null);assert.equal((await f.cache.peek('/api/jobs?order=schedule&state=all&month=2026-10&day=2026-10-12')).jobs.length,4);
 await f.cache.reconcile(f.session,[],{});assert.deepEqual(await f.cache.ids(),[]);
});
test('Explicit other-discipline queries cannot derive an incomplete result from the selected discipline',async()=>{
 const f=fixture();await f.cache.warm();assert.equal(await f.cache.peek(path+'&discipline=garden'),null);assert.equal(await f.cache.peek(path+'&discipline=all'),null);
});
test('A local mutation cancels a stale background read and prevents it from repopulating the cache',async()=>{
 const f=fixture();await f.cache.warm();f.clock=Date.parse('2026-11-12T12:02:00Z');let release;
 f.hook=()=>new Promise(resolve=>release=()=>resolve({listRevision:1,jobs:[f.jobs[11]],nextCursor:null}));
 const cached=await f.cache.request(path);assert.ok(cached._jobCache.stale);await settled();await f.cache.invalidate();release();await settled();await settled();assert.deepEqual(await f.cache.ids(),[]);
});
test('A failed or queued write retains available offline months; a confirmed reschedule updates their rows',async()=>{
 const f=fixture();await f.cache.warm();f.cache.beginChange();f.online=false;
 assert.equal((await f.cache.request(path)).jobs.length,5,'A failed request must not erase other offline visits');
 const moved={...f.jobs[11],dueDate:'2026-10-12',status:'done',version:2};await f.cache.changed({job:moved},'/api/jobs/'+moved.id,'PUT');
 assert.ok(!(await f.cache.request(path)).jobs.some(j=>j.id===moved.id));
 const previous=await f.cache.request('/api/jobs?order=schedule&state=done&month=2026-10&day=2026-10-12');assert.equal(previous.jobs.find(j=>j.id===moved.id).version,2);
 await f.cache.changed({deleted:true},'/api/jobs/'+moved.id,'DELETE');assert.ok(!(await f.cache.ids()).includes(moved.id));
});
test('A read begun during a mutation cannot overwrite the acknowledged newer job',async()=>{
 const f=fixture();await f.cache.warm();f.cache.beginChange();let release;
 f.hook=()=>new Promise(resolve=>release=()=>resolve({listRevision:1,jobs:[f.jobs[11]],nextCursor:null}));
 const pending=f.cache.request(path,{jobCacheRefresh:true});await settled();
 await f.cache.changed({job:{...f.jobs[11],status:'done',version:2}},'/api/jobs/'+f.jobs[11].id,'PATCH');release();await pending;
 const copy=await f.cache.peek(path);assert.equal(copy.jobs.find(j=>j.id===f.jobs[11].id).status,'done');
});
test('A changing planner revision never marks a partially fetched month complete',async()=>{
 const f=fixture();let page=0;f.hook=async()=>({listRevision:++page,jobs:[f.jobs[page]],nextCursor:String(page)});await f.cache.warm();assert.deepEqual(await f.cache.ids(),[]);
});
test('Server access denial removes stored snapshots and produces a denial notification',async()=>{
 const f=fixture();await f.cache.warm();f.hook=async()=>{throw Object.assign(Error('Revoked'),{status:403});};await assert.rejects(f.cache.request(path,{jobCacheRefresh:true}),/Revoked/);assert.deepEqual(await f.cache.ids(),[]);assert.ok(f.events.some(e=>e.denied));
});
test('Corrupt/unavailable optional storage cannot fail a successful online request',async()=>{
 const session=fixture().session;const c=createJobListCache({read:async()=>{throw Error('Storage');},change:async()=>{throw Error('Quota');},send:async()=>({listRevision:1,jobs:[],nextCursor:null}),getSession:()=>session,now:()=>session.verifiedAt});assert.equal((await c.request(path)).jobs.length,0);
});
