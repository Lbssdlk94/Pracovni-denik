import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {rolePreviewTargets,rolePreviewSession,rolePreviewMarkup} from '../web/role-preview-model.js';
const ctx={waitUntil:p=>p.catch(()=>{})};
const call=(env,path,person=people.owner,method='GET',value,role)=>api(request(path,person,method,value,role?{'x-work-diary-preview-role':role}:{}),env,ctx);
const good=async response=>{assert.equal(response.status,200,await response.clone().text());return response.json();};

test('Only owner and administrator can preview their permitted lower roles, without changing the original identity',()=>{
 const actual={user:{id:'owner',role:'owner',name:'Vlastník'},permissions:{write:true,manage:true,delete:true},workspace:{role:'owner',disciplines:['irrigation']}};
 const view=rolePreviewSession(actual,'reader');assert.equal(view.user.role,'reader');assert.equal(view.permissions.manage,false);assert.equal(view.permissions.write,false);assert.equal(view.rolePreview.actualRole,'owner');assert.equal(actual.user.role,'owner');assert.equal(actual.workspace.role,'owner');
 assert.equal(rolePreviewSession(actual).user.role,'owner');assert.deepEqual(rolePreviewTargets('administrator'),['admin','worker','reader']);
 for(const role of ['admin','worker','reader']){assert.deepEqual(rolePreviewTargets(role),[]);const value=rolePreviewSession({...actual,user:{...actual.user,role}},'owner');assert.equal(value.user.role,role);assert.equal(value.rolePreview,undefined);}
 const limited=rolePreviewSession({...actual,permissions:{write:false,manage:false,delete:false}},'admin');assert.equal(limited.permissions.write,false);assert.equal(limited.permissions.manage,false);
 const html=rolePreviewMarkup(view,v=>v);assert.ok(html.includes('Náhled: Čtenář'));assert.ok(html.includes('data-role-preview-exit'));assert.ok(html.includes('Vaše data'));
});

test('Preview GET keeps the actual server role, while staff cannot forge the preview header',async()=>{
 const env=environment();try{
  await good(await call(env,'/api/me'));
  for(const role of ['worker','reader','admin']){await good(await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await good(await call(env,'/api/me',people[role]));}
  const administrator={id:'administrator-id',email:'administrator@example.com'};
  await good(await call(env,'/api/invitations',people.owner,'POST',{email:administrator.email,role:'administrator'}));await good(await call(env,'/api/me',administrator));
  for(const role of rolePreviewTargets('owner')){const data=await good(await call(env,'/api/me',people.owner,'GET',undefined,role));assert.equal(data.user.role,'owner');assert.equal(data.user.id,people.owner.id);}
  assert.equal((await good(await call(env,'/api/me',administrator,'GET',undefined,'reader'))).user.role,'administrator');
  assert.equal((await call(env,'/api/me',administrator,'GET',undefined,'administrator')).status,403);
  for(const person of [people.admin,people.worker,people.reader])assert.equal((await call(env,'/api/me',person,'GET',undefined,'reader')).status,403);
  assert.equal((await call(env,'/api/me',people.owner,'GET',undefined,'owner')).status,403);
  assert.equal(env.sqlite.prepare('SELECT role FROM members WHERE user_id=?').get(people.owner.id).role,'owner');
 }finally{env.sqlite.close();}
});

test('Marked preview requests cannot change jobs, accounts, drafts, recovery, OAuth or maintenance state',async()=>{
 const env=environment();try{
  await good(await call(env,'/api/me'));
  const before=env.sqlite.prepare('SELECT count(*) n FROM customers').get().n;
  for(const [path,method]of [['/api/customers/preview-test','PUT'],['/api/jobs/preview-job/status','PATCH'],['/api/auth/login','POST'],['/api/access-logout','POST'],['/api/workspace/recovery/setup','POST'],['/api/workspace-transfer/prepare','POST'],['/api/drive/oauth/callback','GET']]){
   const response=await call(env,path,people.owner,method,method==='GET'?undefined:{version:0,name:'Must not save'},'reader');assert.equal(response.status,403,path);assert.equal((await response.json()).code,'role_preview_readonly');
  }
  assert.equal(env.sqlite.prepare('SELECT count(*) n FROM customers').get().n,before);
  await good(await call(env,'/api/customers/ordinary',people.owner,'PUT',{version:0,name:'Actual owner',phones:[],addresses:[]}));
  assert.equal(env.sqlite.prepare('SELECT role FROM members WHERE user_id=?').get(people.owner.id).role,'owner');
 }finally{env.sqlite.close();}
});
