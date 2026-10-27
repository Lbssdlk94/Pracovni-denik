import test from 'node:test';
import assert from 'node:assert/strict';
import {volumeIds,selectVolumeIds,createVolumeJob} from '../web/volume-test-ui.js';
const failure=(status,code)=>Object.assign(new Error(code),{status,code});
test('deleted fixture gets a separate job, photo and operation identity; customer is reused',async()=>{
 const seen=[],value={version:0,title:'Test2'},saved={id:'replacement'};
 const result=await createVolumeJob({n:2,ids:volumeIds(2),value,api:async(path,method,body)=>{seen.push({path,method,body});if(path.endsWith('job-2'))throw failure(409,'job_deleted');return {job:saved};}});
 assert.equal(result.id.job,'volume-20261027-job-2-r1');assert.equal(result.id.customer,volumeIds(2).customer);assert.deepEqual(result.id.photos,['volume-20261027-photo-2-r1-1','volume-20261027-photo-2-r1-2']);assert.equal(result.job,saved);assert.equal(seen.length,2);assert.ok(seen.every(v=>v.method==='PUT'&&v.body===value));
});
test('resuming selects the existing replacement by ID without creating another job',()=>{
 const id=volumeIds(2,1);assert.deepEqual(selectVolumeIds(2,new Map([[id.job,{title:'Test2'}]])),id);
 assert.throws(()=>selectVolumeIds(2,new Map([[volumeIds(2).job,{}],[id.job,{}]])),/více aktivních/);
});
test('scheduling conflict followed by 404 keeps the original error and never changes ID',async()=>{
 const original=failure(409,'job_schedule_warning'),seen=[];
 await assert.rejects(createVolumeJob({n:2,ids:volumeIds(2),value:{},api:async(path,method)=>{seen.push({path,method});throw method==='PUT'?original:failure(404,'missing');}}),e=>e===original);
 assert.equal(seen.length,2);assert.ok(seen.every(v=>v.path.endsWith('job-2')));
});
test('concurrent identical creation can return the existing job',async()=>{
 const job={id:volumeIds(2).job};const result=await createVolumeJob({n:2,ids:volumeIds(2),value:{},api:async(path,method)=>{if(method==='PUT')throw failure(409,'conflict');return {job};}});assert.equal(result.job,job);assert.equal(result.id.attempt,0);
});
test('permissions and missing access cannot trigger replacement creation',async()=>{
 const original=failure(403,'forbidden');let requests=0;await assert.rejects(createVolumeJob({n:2,ids:volumeIds(2),value:{},api:async()=>{requests++;throw original;}}),e=>e===original);assert.equal(requests,1);
});
test('deleted retries are bounded and ordinary version conflicts are not retried as deleted',async()=>{
 let requests=0;await assert.rejects(createVolumeJob({n:2,ids:volumeIds(2),value:{},api:async()=>{requests++;throw failure(409,'job_deleted');}}),/příliš mnoho/);assert.equal(requests,11);
});
