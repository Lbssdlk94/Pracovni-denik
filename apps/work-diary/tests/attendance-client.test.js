import test from 'node:test';import assert from 'node:assert/strict';
import {createAttendanceClient,projectAttendance,attendanceBinding} from '../web/attendance-client.js';
import {projectJobTime} from '../web/job-time-client.js';
import {environment,people,request as authenticatedRequest} from './fixtures.mjs';
import {api} from '../worker/api.js';
import {planWorkspaceReconciliation,workspaceInventory} from '../web/workspace-sync-model.js';
const clone=value=>structuredClone(value);
async function fixture(){const env=environment(),ctx={waitUntil:p=>p.catch(()=>{})},records=new Map();let cache=null,online=true,locked=false;
 const call=async(path,person=people.worker,method='GET',body)=>{const response=await api(authenticatedRequest(path,person,method,body),env,ctx),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status,code:value.code});return value;};
 await call('/api/me',people.owner);await call('/api/invitations',people.owner,'POST',{email:people.worker.email,role:'worker'});let session=await call('/api/me');session.verifiedAt=Date.now();const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit'}).format(new Date()),path='/api/attendance?month='+month+'&userId='+people.worker.id+'&detail=1';let client;
 const send=async id=>{const record=records.get(id);if(!record)return;try{const result=await call(record.path,people.worker,'POST',record.payload);await client.acknowledge(record,result);}catch(error){records.set(id,{...record,blocked:error.status>=400&&error.status<500,conflict:error.status===409,error:error.message});throw error;}};
 client=createAttendanceClient({readCache:async()=>clone(cache),changeCache:async update=>{cache=update(clone(cache));},all:async()=>clone([...records.values()]),change:async(id,update)=>{const value=update(clone(records.get(id)));if(value===null)records.delete(id);else if(value!==undefined)records.set(id,value);return clone(value);},send,request:(url,options={})=>call(url,people.worker,options.method||'GET',options.body?JSON.parse(options.body):undefined),getSession:()=>session,isLocked:async()=>locked,checkWrite:()=>{},online:()=>online,notify:()=>{}});
 return {env,records,client,path,call,send,get session(){return session;},set session(value){session=value;},set online(value){online=value;},set locked(value){locked=value;},sync:async()=>{for(const r of [...records.values()].sort((a,b)=>a.payload.at-b.payload.at))await send(r.id);}};
}
test('Offline arrival, standalone pause/resume and departure use one original ledger and replay without duplicates',async()=>{
 const f=await fixture();let base=await f.client.read(f.path),at=Date.now()-600000;f.online=false;
 const bodies=[['/api/attendance/punch',{mutationId:'offline-arrival',kind:'arrival',at,gpsStatus:'unavailable'}],['/api/attendance/activities',{operationId:'offline-break',action:'break',at:at+60000,shiftId:'offline-arrival',shiftVersion:1,version:0}],['/api/attendance/activities',{operationId:'offline-resume',action:'resume',at:at+120000,shiftId:'offline-arrival',shiftVersion:1,version:1,resumeKind:'',resumeJobId:null}],['/api/attendance/punch',{mutationId:'offline-departure',kind:'departure',at:at+180000,shiftId:'offline-arrival',version:1,gpsStatus:'unavailable'}]];
 for(const [path,body] of bodies){await f.client.write(path,body,base);base=await f.client.read(f.path);}
 assert.equal(base.activeShift,null);assert.equal(base._attendancePending.length,4);assert.equal(base.detail.ownToday.state.version,2);assert.equal(base.detail.ownToday.intervals[0].endAt,at+120000);assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,0);
 f.online=true;await f.sync();const saved=await f.client.read(f.path);assert.equal(saved._attendancePending.length,0);assert.equal(saved.shifts[0].startAt,at);assert.equal(saved.shifts[0].endAt,at+180000);assert.equal(saved.detail.intervals.length,1);assert.equal(saved.detail.intervals[0].kind,'break');
 for(const [path,body]of bodies)assert.equal((await f.call(path,people.worker,'POST',body)).replayed,true);
 assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM attendance_shifts').get().n,1);assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM job_time_intervals').get().n,1);assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM jobs').get().n,0);
});
test('A concurrent activity conflict preserves original timestamp and denies later local writes',async()=>{
 const f=await fixture(),at=Date.now()-600000;await f.call('/api/attendance/punch',people.worker,'POST',{mutationId:'shift',kind:'arrival',at,gpsStatus:'unavailable'});const base=await f.client.read(f.path);f.online=false;
 const body={operationId:'local-break',action:'break',at:at+200000,shiftId:'shift',shiftVersion:1,version:0};await f.client.write('/api/attendance/activities',body,base);
 await f.call('/api/attendance/activities',people.worker,'POST',{...body,operationId:'other-device',at:at+100000});f.online=true;await assert.rejects(f.sync(),e=>e.status===409);const pending=[...f.records.values()][0];assert.equal(pending.payload.at,body.at);assert.equal(pending.conflict,true);
 await assert.rejects(f.client.write('/api/attendance/activities',{...body,operationId:'later'},base),/předchozí/);assert.equal(f.records.size,1);
 f.locked=true;await assert.rejects(f.client.read(f.path),/přihlášení/);
});
test('Pending attendance participates in the job projection without creating another job or multiplying intervals',async()=>{
 const f=await fixture(),at=Date.now()-600000;await f.call('/api/jobs/actual-job',people.owner,'PUT',{version:0,title:'Skutečná zakázka',jobType:'installation',assignedTo:people.worker.id,status:'planned'});await f.call('/api/jobs/actual-job/time/actions',people.worker,'POST',{operationId:'work',action:'work',at,workers:[{userId:people.worker.id,version:0}]});const job=await f.call('/api/jobs/actual-job/time'),base=await f.client.read(f.path);f.online=false;
 const body={operationId:'own-pause',action:'break',at:at+60000,shiftId:base.activeShift.id,shiftVersion:base.activeShift.version,version:1};await f.client.write('/api/attendance/activities',body,base);const projected=projectJobTime(job,[...f.records.values()],'actual-job');assert.equal(projected.states.find(s=>s.userId===people.worker.id).active.kind,'break');assert.equal(projected.states.find(s=>s.userId===people.worker.id).version,2);assert.equal(projected.intervals.filter(i=>i.endAt==null).length,1);assert.equal(projected.intervals.find(i=>i.kind==='work').endAt,body.at);
 f.online=true;await f.sync();assert.equal((await f.call('/api/jobs/actual-job/time')).job.status,'in_progress');assert.equal(f.env.sqlite.prepare('SELECT count(*) n FROM jobs').get().n,1);
});
test('Workspace reconciliation keeps unchanged own requests with original IDs and quarantines authorization changes',()=>{
 const session={user:{id:'worker',role:'worker'},installation:{id:'source'},permissions:{write:true},features:{attendance:true},workspace:{workspaceId:'w',authorizationVersion:1,disciplines:['irrigation'],entryInstallations:[]}},record={id:'worker|attendance|op',kind:'jobTimeAttendanceAction',ownerId:'worker',accessRole:'worker',binding:attendanceBinding(session),pending:true,payload:{at:100}},caches={serviceWork:[record]},inventory=workspaceInventory(caches),manifest={completeForRequestedIds:true,writable:true,features:session.features,allowed:{records:[],gardens:[],services:[],serviceWork:[],defects:[]},requestedCounts:{records:0,gardens:0,services:0,serviceWork:0,defects:0},stamp:'s'};
 const same=planWorkspaceReconciliation(session,session,caches,inventory,manifest);assert.equal(same.keep.serviceWork[0].id,record.id);assert.equal(same.revoked.length,0);
 const jobRecords=['one','two'].map(id=>({id:'worker|job|jobTime|'+id,kind:'jobTimeAction',jobId:'job',ownerId:'worker',accessRole:'worker',pending:true,payload:{operationId:id,at:100}})),jobCaches={serviceWork:jobRecords},jobInventory=workspaceInventory(jobCaches),jobManifest={...manifest,allowed:{...manifest.allowed,serviceWork:['job']},requestedCounts:{...manifest.requestedCounts,serviceWork:1}};const jobs=planWorkspaceReconciliation(session,session,jobCaches,jobInventory,jobManifest);assert.deepEqual(jobs.keep.serviceWork.map(r=>r.id),jobRecords.map(r=>r.id),'Consecutive job intervals retain distinct outbox identities on reconnect');
 const changed=planWorkspaceReconciliation(session,{...session,workspace:{...session.workspace,authorizationVersion:2}},caches,inventory,manifest);assert.equal(changed.keep.serviceWork.length,0);assert.equal(changed.revoked[0].record.payload.at,100);
});
test('Cache-only dashboard projection survives acknowledgement, refuses a different account and keeps pending hours provisional',async()=>{
 const f=await fixture(),at=Date.now()-600000;await f.client.read(f.path);f.online=false;
 let base=await f.client.peekOwn();await f.client.write('/api/attendance/punch',{mutationId:'dashboard-arrival',kind:'arrival',at,gpsStatus:'unavailable'},base);
 base=await f.client.peekOwn();assert.equal(base.activeShift.startAt,at);assert.equal(base._attendancePending.length,1);
 await f.client.write('/api/attendance/punch',{mutationId:'dashboard-departure',kind:'departure',at:at+60000,shiftId:base.activeShift.id,version:1,gpsStatus:'unavailable'},base);
 const pending=await f.client.peekOwn();assert.equal(pending.detail.ownToday.shifts[0].pending,true);
 f.online=true;await f.sync();const acknowledged=await f.client.peekOwn();assert.equal(acknowledged.activeShift,null);assert.equal(acknowledged._attendancePending.length,0);assert.equal(acknowledged.detail.ownToday.shifts[0].pending,undefined);
 f.session={...f.session,user:{...f.session.user,id:'another-account'}};assert.equal(await f.client.peekOwn(),null);
});

test('Disabled offline mode and role preview cannot read or mutate a cached ledger',async()=>{
 const f=await fixture();await f.client.read(f.path);f.online=false;f.session={...f.session,features:{...f.session.features,offline:false}};await assert.rejects(f.client.peekOwn(),/Offline přístup/);
 f.online=true;f.session={...f.session,rolePreview:{active:true}};await assert.rejects(f.client.write('/api/attendance/punch',{at:Date.now()},{}),/vlastním účtu/);
});
