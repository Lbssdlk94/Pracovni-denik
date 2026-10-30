import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {environment,request,people} from './fixtures.mjs';
import {api} from '../worker/api.js';
import {workspaceFencedDatabase,workspaceTransferStamp} from '../worker/workspace-transfer-control.js';
const ctx={waitUntil:p=>p.catch(()=>{})},token='t'.repeat(43),gardenOwner={id:'garden-owner-distinct-id',email:people.owner.email};
async function setup(){
 const source=environment(),garden=environment();
 garden.TEAM_OWNER_EMAIL=people.owner.email;
 const call=async(env,path,person=people.owner,method='GET',body)=>{const r=await api(request(path,person,method,body),env,ctx);assert.equal(r.status,200,await r.clone().text());return r.json();};
 await call(source,'/api/me');await call(garden,'/api/me',gardenOwner);
 for(const env of [source,garden]){env.INSTALLATION_ID=env.sqlite.prepare("SELECT instance_id FROM installation_state").get().instance_id;env.DRIVE_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,8).toString('base64url');}
 await call(source,'/api/customers/customer-source',people.owner,'PUT',{version:0,name:'Stejné jméno',phones:[],addresses:[{id:'source-address',label:'První zahrada',address:'Soukromá 11',city:'Blatná'}]});
 await call(garden,'/api/customers/customer-garden',gardenOwner,'PUT',{version:0,name:'Stejné jméno',phones:[],addresses:[{id:'garden-address',label:'Druhá zahrada',address:'Soukromá 22',city:'Písek'}]});
 await call(source,'/api/jobs/original-work',people.owner,'PUT',{version:0,title:'Původní práce',customerId:'customer-source',assignedTo:people.owner.id,status:'planned',dueDate:'2026-11-02',startTime:'09:00',endTime:'11:00'});
 await call(source,'/api/tariffs');await call(garden,'/api/tariffs',gardenOwner);
 // Match the existing empty Garden catalog using isolated fixtures only.
 garden.sqlite.exec('DELETE FROM material_item_revisions; DELETE FROM material_items; DELETE FROM material_categories');
 const config={tokenHash:createHash('sha256').update(JSON.stringify(token)).digest('hex'),expiresAt:Date.now()+3600000,workspaceId:'isolated-common-workspace',canonicalInstallationId:source.INSTALLATION_ID,linkedInstallationId:garden.INSTALLATION_ID,canonicalUserId:people.owner.id,linkedUserId:gardenOwner.id};
 for(const env of [source,garden])env.WORKSPACE_TRANSFER_CAPABILITY=JSON.stringify(config);
 const technical=async(env,action,value,expected=200)=>{const r=await api(request('/api/workspace-transfer/'+action,null,value===undefined?'GET':'POST',value,{'x-workspace-transfer-token':token}),env,ctx);assert.equal(r.status,expected,await r.clone().text());return r.json();};
 return {source,garden,call,technical,close(){source.sqlite.close();garden.sqlite.close();}};
}
async function freeze(e,env,name){const state=await e.technical(env,'state');return e.technical(env,'freeze',{sessionId:name,expectedGeneration:state.generation});}

test('paired cutover dry-run, write fence, ID-preserving import, aliases and replay are real persisted operations',async()=>{
 const e=await setup();try{
  const sourceGarden=e.source.sqlite.prepare("SELECT * FROM gardens WHERE customer_id='customer-source'").get(),gardenGarden=e.garden.sqlite.prepare("SELECT * FROM gardens WHERE customer_id='customer-garden'").get();
  e.garden.sqlite.prepare('UPDATE gardens SET notes=? WHERE id=?').run('Jen pracovní poznámka Garden',gardenGarden.id);
  const unchanged=e.source.sqlite.prepare("SELECT * FROM jobs WHERE id='original-work'").get();
  const snapshot=await e.technical(e.garden,'export'),preview=await e.technical(e.source,'preview',{snapshot});
  assert.equal(preview.readyForCutover,false);assert.deepEqual(preview.blockers,[]);assert.equal(preview.renames.length,3);
  assert.equal(e.source.sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,0);
  const staleDatabase=workspaceFencedDatabase(e.source.DB,await workspaceTransferStamp(e.source));
  await freeze(e,e.garden,'garden-snapshot-1');await freeze(e,e.source,'source-snapshot-1');
  assert.throws(()=>e.garden.sqlite.prepare("UPDATE customers SET name='Lost update'").run(),/workspace_transfer_frozen/);
  assert.equal((await api(request('/api/jobs',people.owner),e.source,ctx)).status,503);
  const frozenSnapshot=await e.technical(e.garden,'export'),frozenPlan=await e.technical(e.source,'preview',{snapshot:frozenSnapshot});assert.equal(frozenPlan.readyForCutover,true);
  const result=await e.technical(e.source,'apply',{snapshot:frozenSnapshot,planHash:frozenPlan.planHash});assert.equal(result.applied,true);assert.equal(result.imported.customers,1);
  assert.equal(e.source.sqlite.prepare("SELECT count(*) n FROM customers WHERE name='Stejné jméno'").get().n,2);
  assert.equal(e.source.sqlite.prepare('SELECT customer_id FROM gardens WHERE id=?').get(gardenGarden.id).customer_id,'customer-garden');
  assert.equal(e.source.sqlite.prepare('SELECT id FROM gardens WHERE id=?').get(sourceGarden.id).id,sourceGarden.id);
  assert.equal(e.source.sqlite.prepare('SELECT notes FROM garden_discipline_data WHERE garden_id=?').get(gardenGarden.id).notes,'Jen pracovní poznámka Garden');
  assert.equal(e.source.sqlite.prepare('SELECT notes FROM gardens WHERE id=?').get(gardenGarden.id).notes,'');
  const after=e.source.sqlite.prepare("SELECT * FROM jobs WHERE id='original-work'").get();assert.equal(after.discipline,'irrigation');delete after.discipline;delete unchanged.discipline;assert.deepEqual(after,unchanged);
  assert.equal(e.source.sqlite.prepare('SELECT count(*) n FROM members').get().n,1);assert.equal(e.source.sqlite.prepare('SELECT canonical_user_id FROM workspace_identity_aliases WHERE external_user_id=?').get(gardenOwner.id).canonical_user_id,people.owner.id);
  assert.equal(e.source.sqlite.prepare("SELECT count(*) n FROM service_tariffs WHERE discipline='garden'").get().n,3);assert.equal(e.source.sqlite.prepare("SELECT count(*) n FROM service_tariffs WHERE discipline='irrigation'").get().n,3);
  assert.equal((await e.technical(e.source,'apply',{snapshot:frozenSnapshot,planHash:frozenPlan.planHash})).replayed,true);
  await assert.rejects(staleDatabase.prepare("INSERT INTO settings(key,value) VALUES('late-legacy-write','blocked')").run(),/workspace_transfer_assertion/);
  const profile=await e.call({...e.source,WORKSPACE_ENTRY_ID:e.garden.INSTALLATION_ID},'/api/me',gardenOwner);assert.equal(profile.user.id,people.owner.id);assert.equal(profile.workspace.workspaceId,'isolated-common-workspace');
  const status=await e.technical(e.garden,'retire',{sessionId:'garden-snapshot-1',planHash:frozenPlan.planHash});assert.equal(status.localWritesBlocked,true);
  await e.technical(e.garden,'release',{sessionId:'garden-snapshot-1'},409);
  assert.equal(e.source.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{e.close();}
});

test('unexpected Garden working records block cutover instead of being silently omitted',async()=>{
 const e=await setup();try{
  await e.call(e.garden,'/api/jobs/new-garden-work',gardenOwner,'PUT',{version:0,title:'Zahradní práce',customerId:'customer-garden',assignedTo:gardenOwner.id,status:'planned'});
  const snapshot=await e.technical(e.garden,'export'),report=await e.technical(e.source,'preview',{snapshot});assert.ok(report.blockers.some(b=>b.code==='additional_garden_work_requires_transfer'&&b.table==='jobs'));
  await e.technical(e.source,'apply',{snapshot,planHash:report.planHash},409);assert.equal(e.source.sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,0);
 }finally{e.close();}
});

test('failed import rolls back classification, aliases, configuration, bypass and all imported rows together',async()=>{
 const e=await setup();try{
  await freeze(e,e.garden,'garden-failure-1');await freeze(e,e.source,'source-failure-1');
  const snapshot=await e.technical(e.garden,'export'),report=await e.technical(e.source,'preview',{snapshot});
  e.source.sqlite.exec("CREATE TRIGGER isolated_import_failure BEFORE INSERT ON gardens WHEN NEW.customer_id='customer-garden' BEGIN SELECT RAISE(ABORT,'isolated-test-failure'); END");
  await e.technical(e.source,'apply',{snapshot,planHash:report.planHash},409);
  assert.equal(e.source.sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,0);assert.equal(e.source.sqlite.prepare("SELECT discipline FROM jobs WHERE id='original-work'").get().discipline,null);
  assert.equal(e.source.sqlite.prepare("SELECT count(*) n FROM customers WHERE id='customer-garden'").get().n,0);assert.equal(e.source.sqlite.prepare('SELECT bypass FROM workspace_transfer_control').get().bypass,0);
  assert.equal(e.source.sqlite.prepare('SELECT count(*) n FROM workspace_identity_aliases').get().n,0);
  await e.technical(e.source,'release',{sessionId:'source-failure-1'});await e.technical(e.garden,'release',{sessionId:'garden-failure-1'});
  assert.equal((await api(request('/api/me',people.owner),e.source,ctx)).status,200);
 }finally{e.close();}
});

test('transfer capability is separate, expiring, installation-bound and snapshot tampering is rejected',async()=>{
 const e=await setup();try{
  assert.equal((await api(request('/api/workspace-transfer/export',people.owner),e.source,ctx)).status,404);
  const snapshot=await e.technical(e.garden,'export');snapshot.payload.tables.customers[0].name='Tampered';await e.technical(e.source,'preview',{snapshot},400);
  const config=JSON.parse(e.source.WORKSPACE_TRANSFER_CAPABILITY);config.expiresAt=Date.now()-1;e.source.WORKSPACE_TRANSFER_CAPABILITY=JSON.stringify(config);await e.technical(e.source,'state',undefined,404);
 }finally{e.close();}
});


test('an empty disconnected Drive controller is metadata only; configured integration still blocks and Source configuration is preserved',async()=>{
 const e=await setup();try{
  e.garden.sqlite.exec("INSERT INTO drive_control(id,version) VALUES('team',0)");
  e.source.sqlite.exec("INSERT INTO drive_control(id,version,config) VALUES('team',2,'source-existing-config')");
  let snapshot=await e.technical(e.garden,'export'),report=await e.technical(e.source,'preview',{snapshot});
  assert.deepEqual(report.blockers,[]);assert.ok(report.warnings.some(w=>w.code==='empty_infrastructure_kept_in_original_archive'));
  e.garden.sqlite.exec("UPDATE drive_control SET config='configured',version=1 WHERE id='team'");
  snapshot=await e.technical(e.garden,'export');report=await e.technical(e.source,'preview',{snapshot});assert.ok(report.blockers.some(b=>b.table==='drive_control'));
  e.garden.sqlite.exec("UPDATE drive_control SET config=NULL,version=0 WHERE id='team'");
  await freeze(e,e.garden,'garden-empty-drive');await freeze(e,e.source,'source-empty-drive');snapshot=await e.technical(e.garden,'export');report=await e.technical(e.source,'preview',{snapshot});
  await e.technical(e.source,'apply',{snapshot,planHash:report.planHash});
  assert.equal(e.source.sqlite.prepare("SELECT config FROM drive_control WHERE id='team'").get().config,'source-existing-config');
 }finally{e.close();}
});
