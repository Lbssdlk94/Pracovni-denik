import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {environment,people,request} from './fixtures.mjs';
import {api} from '../worker/api.js';
const sql=readFileSync('drizzle/0053_retire_volume_fixtures.sql','utf8'),key='cleanup:volume-20261027:20261104',ctx={waitUntil:p=>p.catch(()=>{})};
const call=(env,path,method='GET',value)=>api(request(path,people.owner,method,value),env,ctx);
async function ok(response){assert.equal(response.status,200,await response.clone().text());return response.json();}
async function fixture(env,n){
 const customerId='volume-20261027-customer-'+n,gardenId='auto_garden_'+createHash('sha256').update('garden|'+customerId).digest('hex');
 await ok(await call(env,'/api/customers/'+customerId,'PUT',{version:0,name:'Test'+n,gardenName:'Test'+n,email:'',phones:[],addresses:[{id:'test-address-'+n,label:'Testovací místo',address:'Testovací adresa '+n,city:'Test – syntetická data'}]}));
 await ok(await call(env,'/api/jobs/volume-20261027-job-'+n,'PUT',{version:0,title:'Test'+n,description:'TESTOVACI DATA · volume-20261027',customerId,gardenId,address:'Testovací adresa '+n,city:'Test – syntetická data',assignedTo:people.owner.id,status:'planned'}));
 return {customerId,gardenId,jobId:'volume-20261027-job-'+n};
}
async function setup(){const env=environment();await ok(await call(env,'/api/me'));env.sqlite.prepare('DELETE FROM settings WHERE key=?').run(key);return env;}
test('Exact volume cleanup retires synthetic families, keeps reports, rejects stale writes and is idempotent',async()=>{const env=await setup();try{
 const f=await fixture(env,1);await ok(await call(env,'/api/jobs/'+f.jobId+'/service','PUT',{version:1,operationId:'cleanup-report',report:{work:'Testovací výkaz',notes:'TESTOVACI DATA · volume-20261027'}}));
 const report=env.sqlite.prepare('SELECT * FROM service_reports').all();env.sqlite.exec(sql);
 for(const [table,id] of [['customers',f.customerId],['gardens',f.gardenId],['jobs',f.jobId]])assert.equal(env.sqlite.prepare('SELECT deleted FROM '+table+' WHERE id=?').get(id).deleted,1);
 assert.deepEqual(env.sqlite.prepare('SELECT * FROM service_reports').all(),report);
 assert.equal((await call(env,'/api/jobs/'+f.jobId,'PUT',{version:1,title:'Stará offline kopie'})).status,409);
 assert.equal((await ok(await call(env,'/api/jobs'))).jobs.length,0);assert.equal((await ok(await call(env,'/api/customers'))).customers.length,0);assert.equal((await ok(await call(env,'/api/gardens'))).gardens.length,0);
 const before=env.sqlite.prepare('SELECT * FROM jobs').all();env.sqlite.exec(sql);assert.deepEqual(env.sqlite.prepare('SELECT * FROM jobs').all(),before);
 }finally{env.sqlite.close();}});
test('Cleanup never deletes by name and skips changed contacts, unrelated work and real defects',async()=>{const env=await setup();try{
 const changed=await fixture(env,3),used=await fixture(env,4),defect=await fixture(env,5);
 await ok(await call(env,'/api/customers/normal-test-name','PUT',{version:0,name:'Test1',email:'',phones:[],addresses:[]}));
 env.sqlite.prepare('UPDATE customers SET version=2,contact_notes=? WHERE id=?').run('Skutečný kontakt',changed.customerId);
 await ok(await call(env,'/api/jobs/real-work','PUT',{version:0,title:'Skutečná návštěva',customerId:used.customerId,gardenId:used.gardenId,assignedTo:people.owner.id,status:'planned'}));
 await ok(await call(env,'/api/defects/real-defect','PUT',{version:0,mutationId:'real-defect-create',gardenId:defect.gardenId,title:'Netěsnost',description:'',location:'',priority:'normal',status:'new',discoveredOn:'2026-11-04',assignedTo:null,nextStep:'',photos:[],resolution:''}));
 env.sqlite.exec(sql);for(const id of [changed.customerId,used.customerId,defect.customerId,'normal-test-name'])assert.equal(env.sqlite.prepare('SELECT deleted FROM customers WHERE id=?').get(id).deleted,0,id);
 assert.equal(JSON.parse(env.sqlite.prepare('SELECT value FROM settings WHERE key=?').get(key).value).families.length,0);
 }finally{env.sqlite.close();}});
test('Fixed maintenance capability rejects anonymous, expired, foreign-installation and supplied-data requests; preview and replay are safe',async()=>{const env=await setup();try{
 const f=await fixture(env,8),token='a'.repeat(64),hash=createHash('sha256').update(token).digest('hex'),installation=env.sqlite.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").get().instance_id,path='/api/maintenance/volume-fixtures-20261027';
 env.PUBLIC_APP_URL='https://zavlahy.test';const capability={origin:env.PUBLIC_APP_URL,batch:'volume-20261027',tokenHash:hash,expiresAt:Date.now()+300000,installationId:installation,ownerId:people.owner.id};env.APPROVED_VOLUME_CLEANUP=JSON.stringify(capability);
 const run=(mode,tokenValue=token,value)=>api(request(path+'?mode='+mode,null,'POST',value,{'authorization':'Bearer '+tokenValue}),env,ctx);
 assert.equal((await run('apply','b'.repeat(64))).status,401);env.APPROVED_VOLUME_CLEANUP=JSON.stringify({...capability,expiresAt:Date.now()-1});assert.equal((await run('apply')).status,401);
 env.APPROVED_VOLUME_CLEANUP=JSON.stringify({...capability,origin:'https://another-company.test'});assert.equal((await run('apply')).status,403);
 env.APPROVED_VOLUME_CLEANUP=JSON.stringify(capability);assert.equal((await run('apply',token,{id:'unapproved'})).status,400);
 const preview=await ok(await run('preview'));assert.equal(preview.customers,1);assert.equal(env.sqlite.prepare('SELECT deleted FROM jobs WHERE id=?').get(f.jobId).deleted,0);
 const applied=await ok(await run('apply'));assert.deepEqual({customers:applied.customers,gardens:applied.gardens,jobs:applied.jobs},{customers:1,gardens:1,jobs:1});assert.equal(applied.replayed,false);assert.equal((await run('apply')).status,404);assert.equal((await run('preview')).status,404);
 delete env.APPROVED_VOLUME_CLEANUP;assert.equal((await run('apply')).status,404);
 }finally{env.sqlite.close();}});
