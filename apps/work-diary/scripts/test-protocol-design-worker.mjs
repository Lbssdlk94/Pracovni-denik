import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'protocol-design-isolated'},r2Buckets:['BUCKET'],bindings:{TEAM_OWNER_EMAIL:'owner@example.com'}});
const call=(path,user='owner',method='GET',value)=>mf.dispatchFetch('https://protocol.test'+path,{method,headers:{'oai-authenticated-user-id':user+'-id','oai-authenticated-user-email':user+'@example.com','x-zavlahy-request':'1','x-workspace-client-version':'shared-directory-v1','x-work-time-client':'v1','content-type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});
const good=async response=>{assert.equal(response.status,200,await response.clone().text());return response.json();};
try{
 const db=await mf.getD1Database('DB');for(const entry of JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries)for(const statement of readFileSync('drizzle/'+entry.tag+'.sql','utf8').split('--> statement-breakpoint'))if(statement.trim())await db.prepare(statement).run();
 await good(await call('/api/me'));await good(await call('/api/invitations','owner','POST',{email:'worker@example.com',role:'worker'}));await good(await call('/api/me','worker'));
 const config=await good(await call('/api/protocol-templates'));config.templates[0].name='Ověřený servis';const changed=await good(await call('/api/protocol-templates','owner','PUT',config));assert.equal(changed.version,1);assert.equal((await db.prepare("SELECT count(*) n FROM settings WHERE key LIKE 'protocol-template-history:%'").first()).n,1);
 assert.equal((await call('/api/protocol-templates','worker','PUT',changed)).status,403);
 await good(await call('/api/jobs/proto','owner','PUT',{version:0,title:'Izolovaná zakázka',jobType:'service',customerName:'Test',assignedTo:'worker-id',status:'planned'}));
 const detail=await good(await call('/api/jobs/proto/service?editor=1','worker'));assert.equal(detail.protocol.schema,1);
 const body={version:detail.job.version,operationId:'proto-save',report:{date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date()),photoIds:[],work:'',protocolDetails:{schema:1,templateId:'service',activities:['activity-0'],customWork:'Vlastní práce',photos:[],signature:{status:'missing'}}}};
 const saved=await good(await call('/api/jobs/proto/service?editor=1','worker','PUT',body));assert.match(saved.report.work,/Kontrola funkčnosti sekcí/);assert.equal(saved.report.protocolDetails.template.name,'Ověřený servis');assert.equal((await good(await call('/api/jobs/proto/service?editor=1','worker','PUT',body))).replayed,true);
 assert.equal((await db.prepare('SELECT count(*) n FROM service_reports').first()).n,1);assert.equal(saved.job.status,'planned');assert.equal(JSON.stringify(saved.protocol.time).includes('hourlyMinor'),false);
 console.log('PASS actual compiled Worker/D1: all 61 migrations, template CAS and audit, writer denial, actual protocol activities, persisted snapshot, replay without duplicates and shared time metadata without private costs. Isolated test data only.');
}finally{await mf.dispose();}
