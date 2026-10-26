import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {environment,people,request} from './fixtures.mjs';
import {FEATURE_OPTIONS,DEFAULT_FEATURES,FEATURE_GROUPS,PROFESSION_SECTIONS,professionFeatureKeys,featureGroup,featureEnabled,licensedFeature} from '../web/features.js';
import {settingsPage} from '../web/settings-ui.js';
const ctx={waitUntil:p=>p.catch(()=>{})},call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx),good=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
async function fixture(){const env=environment();await good(await call(env,'/api/me'));for(const role of ['admin','worker','reader']){await good(await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role}));await good(await call(env,'/api/me',people[role]));}await good(await call(env,'/api/jobs/test',people.owner,'PUT',{version:0,title:'Testovací servis',assignedTo:people.worker.id,status:'planned',dueDate:'2026-10-20'}));return env;}
test('Switch sections, honest profession filters, inherited commercial licence and owner-only prototypes',()=>{
 assert.equal(FEATURE_OPTIONS.length,53);for(const f of FEATURE_OPTIONS){assert.ok(FEATURE_GROUPS.some(g=>g.key===featureGroup(f.key)));for(const dep of f.requires||[])assert.ok(FEATURE_OPTIONS.some(x=>x.key===dep));}
 for(const p of PROFESSION_SECTIONS)assert.ok(professionFeatureKeys(p.key).every(key=>Object.hasOwn(DEFAULT_FEATURES,key)));
 assert.ok(professionFeatureKeys('irrigation').includes('shafts'));assert.ok(!professionFeatureKeys('electrician').includes('shafts'));assert.ok(professionFeatureKeys('electrician').includes('jobTimeline'));
 assert.equal(licensedFeature('jobTimeline',{jobs:true}),true);assert.equal(licensedFeature('jobTimeline',{jobs:false}),false);assert.equal(featureEnabled('jobBacklog',{jobs:true,jobTimeline:false}),false);
 const session={user:{role:'owner'},permissions:{manage:true},features:DEFAULT_FEATURES},html=settingsPage(session);for(const p of PROFESSION_SECTIONS)assert.ok(html.includes('value="'+p.key+'"'));assert.ok(html.includes('data-feature-group="irrigation"'));assert.ok(!settingsPage({...session,user:{role:'admin'}}).includes('id="feature-workCharges"'));
});
test('Server denies disabled actions, old clients preserve new switches, re-enable restores access and roles remain enforced',async()=>{const env=await fixture();try{
 const flags={...DEFAULT_FEATURES,jobHandoffs:false,jobTravel:false,jobBacklog:false,protocolPhotos:false,workCharges:false};await good(await call(env,'/api/features',people.owner,'PUT',{features:flags,version:0}));
 for(const [path,method,value] of [['/api/jobs/test/handoffs','GET'],['/api/jobs/test/handoffs','POST',{}],['/api/jobs/test/departure','POST',{}],['/api/jobs/backlog','GET'],['/api/work-rates','PUT',{}],['/api/jobs/test/service/photos/pic','PUT',{}]]){const r=await call(env,path,people.owner,method,value);assert.equal(r.status,403,path);assert.equal((await r.json()).code,'feature_disabled');}
 assert.equal((await call(env,'/api/jobs')).status,200);assert.equal((await call(env,'/api/jobs/test/service')).status,200);
 const legacy=Object.fromEntries(FEATURE_OPTIONS.filter(f=>!f.licenseParent).map(f=>[f.key,true]));await good(await call(env,'/api/features',people.owner,'PUT',{features:legacy,version:1}));assert.equal((await good(await call(env,'/api/me'))).features.jobTravel,false);
 for(const role of ['worker','reader'])assert.equal((await call(env,'/api/features',people[role],'PUT',{features:DEFAULT_FEATURES,version:2})).status,403);
 assert.equal((await call(env,'/api/features',people.admin,'PUT',{features:{...flags,workCharges:true},version:2})).status,403);
 await good(await call(env,'/api/features',people.owner,'PUT',{features:DEFAULT_FEATURES,version:2}));assert.equal((await call(env,'/api/jobs/test/handoffs')).status,200);assert.equal((await call(env,'/api/jobs/backlog')).status,200);assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM jobs WHERE deleted=0').get().n,1);
 }finally{env.sqlite.close();}});
test('Disabled charge editing preserves historical totals while ordinary protocol edits still save',async()=>{const env=await fixture();try{
 const rates=await good(await call(env,'/api/work-rates',people.owner,'PUT',{version:0,hourlyMinor:10000,travelMinor:30000}));let d=await good(await call(env,'/api/jobs/test/service'));
 d=await good(await call(env,'/api/jobs/test/service',people.owner,'PUT',{version:d.job.version,operationId:crypto.randomUUID(),report:{work:'Servis',workCharges:{rateId:rates.rate.id,hours:1.5,kilometers:31}}}));const charges=d.report.workCharges;assert.equal(charges.totalMinor,80000);
 await good(await call(env,'/api/features',people.owner,'PUT',{features:{...DEFAULT_FEATURES,workCharges:false},version:0}));
 assert.equal((await call(env,'/api/jobs/test/service',people.owner,'PUT',{version:d.job.version,operationId:crypto.randomUUID(),report:{workCharges:null}})).status,403);
 d=await good(await call(env,'/api/jobs/test/service',people.owner,'PUT',{version:d.job.version,operationId:crypto.randomUUID(),report:{work:'Doplněná poznámka'}}));assert.deepEqual(d.report.workCharges,charges);
 }finally{env.sqlite.close();}});
