import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectoryCache} from '../web/directory-cache.js';
function fixture(count=305){
 let time=1800000000000,online=true,saved=null,stamp='stamp-1',failure=null,quota=false;
 const session={user:{id:'worker',role:'worker'},features:{offline:true,customers:true,gardens:true},verifiedAt:time,workspace:{workspaceId:'w',authorizationVersion:1,disciplines:['irrigation'],selectedDiscipline:'irrigation'}},calls=[];
 const customers=Array.from({length:count},(_,i)=>({id:'c'+i,name:'Zákazník '+i,email:'mail'+i+'@test.invalid',phones:[{number:'123'+i}],addresses:[{address:'Lipová '+i,city:'Blatná'}],version:1}));
 const gardens=customers.map((c,i)=>({id:'g'+i,customerId:c.id,name:'Zahrada '+i,address:'Lipová '+i,disciplines:['irrigation']}));
 const send=async(path,options={})=>{calls.push(path);if(failure){const error=failure(path);if(error)throw error;}if(path==='/api/workspace/manifest'){const input=JSON.parse(options.body);if(input.expectedStamp&&input.expectedStamp!==stamp)throw Object.assign(Error('Changed'),{status:409});return {completeForRequestedIds:true,stamp,workspace:{...session.workspace,role:session.user.role}};}if(path==='/api/gardens')return {gardens};if(path.startsWith('/api/customers')){const p=new URL(path,'https://test.invalid').searchParams,offset=Number(p.get('cursor')||0);return {customers:customers.slice(offset,offset+100),nextCursor:offset+100<customers.length?String(offset+100):null};}throw Error('Unexpected route '+path);};
 const make=()=>createDirectoryCache({read:async()=>structuredClone(saved),write:async value=>{if(quota&&value)throw Error('QuotaExceededError');saved=structuredClone(value);},send,getSession:()=>session,scope:()=>JSON.stringify(session),online:()=>online,now:()=>time});
 return {cache:make(),make,session,calls,customers,gardens,get saved(){return saved;},set time(v){time=v;},get time(){return time;},set online(v){online=v;},set stamp(v){stamp=v;},set failure(v){failure=v;},set quota(v){quota=v;}};
}
test('305 customers and gardens download completely once; pages, search and details use copies',async()=>{
 const f=fixture(),first=await f.cache.request('/api/customers');assert.equal(first.customers.length,100);assert.equal(f.calls.length,7);
 let rows=[...first.customers],cursor=first.nextCursor;while(cursor){const page=await f.cache.request('/api/customers?cursor='+encodeURIComponent(cursor));rows.push(...page.customers);cursor=page.nextCursor;}assert.equal(new Set(rows.map(r=>r.id)).size,305);
 const detail=await f.cache.request('/api/customers/c0');assert.equal(detail.customer.gardens[0].id,'g0');detail.customer.phones=[];
 assert.equal((await f.cache.request('/api/customers/c0')).customer.phones.length,1);
 assert.equal((await f.cache.request('/api/gardens')).gardens.length,305);
 assert.equal((await f.cache.request('/api/customers?q=blatna')).customers.length,100);assert.equal(f.calls.length,7);
});
test('persistent snapshot survives a cache instance restart and supports offline search and multiple gardens',async()=>{
 const f=fixture(2);f.gardens.push({id:'other-garden',customerId:'c0',name:'Druhá zahrada'});await f.cache.warm();f.online=false;const cache=f.make();
 assert.equal((await cache.request('/api/customers/c0')).customer.gardens.length,2);assert.equal((await cache.request('/api/customers?q=1231')).customers[0].id,'c1');assert.equal((await cache.request('/api/gardens/g0')).garden.customerId,'c0');assert.equal(f.calls.length,4);
});
test('offline cache is unavailable after account, role, feature, discipline, authorization or lease changes',async()=>{
 for(const change of [s=>s.user.id='other',s=>s.user.role='reader',s=>s.workspace.selectedDiscipline='garden',s=>s.workspace.authorizationVersion++,s=>s.features.offline=false,s=>s.verifiedAt-=86400001]){
  const f=fixture(1);await f.cache.warm();f.online=false;f.failure=()=>Error('Offline');change(f.session);await assert.rejects(f.cache.request('/api/customers'));
 }
});
test('transient connection failure retains the complete snapshot and never publishes partial pages',async()=>{
 const f=fixture();await f.cache.warm();const old=f.saved;f.time+=120001;f.failure=path=>path.startsWith('/api/customers?cursor=')?Error('Disconnected'):null;
 // Inject only the failed page; the first complete snapshot must remain intact.
 const value=await f.cache.request('/api/customers',{forceNetwork:true});assert.equal(value.customers.length,100);assert.deepEqual(f.saved,old);assert.ok(f.calls.filter(p=>p.startsWith('/api/customers?cursor=')).length>3);
});
test('authoritative denial removes cached contacts instead of falling back',async()=>{
 for(const status of [401,403,404,409]){const f=fixture(1);await f.cache.warm();f.time+=120001;f.failure=()=>Object.assign(Error('Denied'),{status});await assert.rejects(f.cache.request('/api/customers',{forceNetwork:true}));assert.equal(f.saved,null);}
});
test('assignment stamp changes cannot reuse old contacts if the subsequent download fails',async()=>{
 const f=fixture(1);await f.cache.warm();f.time+=120001;f.stamp='stamp-2';f.customers.push(f.customers[0]);await assert.rejects(f.cache.request('/api/customers',{forceNetwork:true}));assert.equal(f.saved,null);
});
test('a delayed old-account response cannot publish into a new account',async()=>{
 const f=fixture(1);await f.cache.warm();f.time+=120001;const original=f.saved;f.session.user.id='other';f.failure=()=>{f.session.user.id='another';return Error('Connection lost');};await assert.rejects(f.cache.request('/api/customers'));assert.deepEqual(f.saved,original);
});
test('explicit invalidation forces a new authorized snapshot, without any mutation or media requests',async()=>{
 const f=fixture(1);await f.cache.warm();await f.cache.invalidate();f.customers[0].name='Změněný kontakt';assert.equal((await f.cache.request('/api/customers/c0')).customer.name,'Změněný kontakt');assert.equal(f.calls.length,8);assert.ok(f.calls.every(p=>['/api/customers','/api/gardens','/api/workspace/manifest'].includes(p)));
});
test('a stale verified directory renders immediately while one shared refresh runs',async()=>{
 const f=fixture(1);await f.cache.warm();f.time+=120001;
 const stale=await f.cache.request('/api/customers');assert.equal(stale._directoryCache.stale,true);
 await f.cache.warm(true);assert.equal(f.saved.at,f.time);assert.equal(f.calls.length,8);
});
test('permission changes between directory pages invalidate the whole candidate snapshot',async()=>{
 const f=fixture(1);await f.cache.warm();f.failure=path=>{if(path==='/api/gardens')f.stamp='changed-during-download';return null;};
 await assert.rejects(f.cache.request('/api/customers',{forceNetwork:true}),{status:409});assert.equal(f.saved,null);
});
test('storage quota failure does not block online data or claim a persisted copy',async()=>{
 const f=fixture(1);f.quota=true;const data=await f.cache.request('/api/customers');assert.equal(data.customers.length,1);assert.equal(data._directoryCache.persistent,false);assert.equal(f.saved,null);
 f.online=false;await assert.rejects(f.cache.request('/api/customers'));
});
