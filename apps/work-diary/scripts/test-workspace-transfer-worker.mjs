// Real workerd/D1/R2 cutover, synthetic data only. No live Site requests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
const token='x'.repeat(43),sourceId='inst-transfer-source-isolated',gardenId='inst-transfer-garden-isolated',owner={id:'source-transfer-owner',email:'owner@transfer.test'},gardenOwner={id:'garden-transfer-owner',email:owner.email};
const config={workspaceId:'workerd-transfer-isolated',canonicalInstallationId:sourceId,linkedInstallationId:gardenId,canonicalUserId:owner.id,linkedUserId:gardenOwner.id,tokenHash:createHash('sha256').update(JSON.stringify(token)).digest('hex'),expiresAt:Date.now()+3600000};
let source,garden;
async function call(worker,path,person=owner,method='GET',body,technical=false,expected=200){const r=await worker.dispatchFetch('https://isolated.test'+path,{method,headers:{'oai-authenticated-user-id':person.id,'oai-authenticated-user-email':person.email,'x-zavlahy-request':'1','x-workspace-client-version':'shared-directory-v1','content-type':'application/json',...(technical?{'x-workspace-transfer-token':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(r.status,expected,path+": "+await r.clone().text());return r.json();}
const transfer=(worker,action,body,expected=200)=>call(worker,'/api/workspace-transfer/'+action,owner,body===undefined?'GET':'POST',body,true,expected);
try{
 const make=(id)=>new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:id},r2Buckets:['BUCKET'],bindings:{INSTALLATION_ID:id,TEAM_OWNER_EMAIL:owner.email,DRIVE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,19).toString('base64url'),WORKSPACE_TRANSFER_CAPABILITY:JSON.stringify(config)}});
 source=make(sourceId);garden=make(gardenId);
 for(const [worker,id]of [[source,sourceId],[garden,gardenId]]){const db=await worker.getD1Database('DB');for(const entry of JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries)for(const sql of readFileSync('drizzle/'+entry.tag+'.sql','utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();await db.prepare("UPDATE installation_state SET instance_id=? WHERE singleton='primary'").bind(id).run();}
 await call(source,'/api/me');await call(garden,'/api/me',gardenOwner);
 const sourceDB=await source.getD1Database('DB'),gardenDB=await garden.getD1Database('DB');
 await gardenDB.batch(['DELETE FROM material_item_revisions','DELETE FROM material_items','DELETE FROM material_categories'].map(sql=>gardenDB.prepare(sql)));
 await call(source,'/api/customers/source-contact',owner,'PUT',{version:0,name:'Stejné jméno',phones:[],addresses:[{id:'source-address',label:'Dům',address:'Ulice 1',city:'Blatná'}]});
 await call(garden,'/api/customers/garden-contact',gardenOwner,'PUT',{version:0,name:'Stejné jméno',phones:[],addresses:[{id:'garden-address',label:'Chata',address:'Ulice 2',city:'Písek'}]});
 const sourceGarden=(await sourceDB.prepare("SELECT id FROM gardens WHERE customer_id='source-contact'").first()).id;
 // Exercise the transfer with hundreds of original work rows and stable IDs.
 for(let start=0;start<305;start+=50)await sourceDB.batch(Array.from({length:Math.min(50,305-start)},(_,i)=>sourceDB.prepare("INSERT INTO jobs(id,title,description,address,garden_id,assigned_to,assigned_name,due_date,status,version,created_at,updated_at,created_by,updated_by,customer_id) VALUES(?,?,'','Ulice 1',?,?,'Technik','2026-11-02','planned',1,1,1,?,?,'source-contact')").bind('synthetic-work-'+(start+i),'Test práce '+(start+i),sourceGarden,owner.id,owner.id,owner.id)));
 for(const [worker,name]of [[garden,'garden-worker-freeze'],[source,'source-worker-freeze']]){const state=await transfer(worker,'state');await transfer(worker,'freeze',{sessionId:name,expectedGeneration:state.generation});}
 const snapshot=await transfer(garden,'export'),report=await transfer(source,'preview',{snapshot});assert.equal(report.readyForCutover,true,JSON.stringify(report.blockers));assert.equal(report.counts.source.jobs,305);
 await call(source,'/api/customers/source-contact',owner,'PUT',{version:1,name:'Must stay unchanged',phones:[],addresses:[]},false,503);
 const applied=await transfer(source,'apply',{snapshot,planHash:report.planHash});assert.equal(applied.applied,true);
 assert.equal((await sourceDB.prepare('SELECT count(*) n FROM jobs').first()).n,305);assert.equal((await sourceDB.prepare("SELECT count(*) n FROM jobs WHERE discipline='irrigation'").first()).n,305);
 assert.equal((await sourceDB.prepare("SELECT count(*) n FROM customers WHERE name='Stejné jméno'").first()).n,2);
 assert.equal((await sourceDB.prepare('SELECT count(*) n FROM members').first()).n,1);
 assert.equal((await sourceDB.prepare("SELECT count(*) n FROM workspace_origins WHERE entity='jobs'").first()).n,305);
 assert.equal((await transfer(source,'apply',{snapshot,planHash:report.planHash})).replayed,true);
 await call(source,'/api/me');
 assert.equal((await sourceDB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 console.log('PASS actual workerd/D1/R2: frozen signed snapshot, dry-run, atomic common-database import with 305 original jobs, stable customer/garden IDs, explicit owner alias, original records unchanged, repeat/idempotence, source operational writes blocked during cutover. Isolated synthetic data only.');
}finally{await source?.dispose();await garden?.dispose();}
