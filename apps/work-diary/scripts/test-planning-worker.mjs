import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'planning-qa-db'},r2Buckets:['BUCKET'],bindings:{TEAM_OWNER_EMAIL:'owner@example.com'}});
const call=(path,user='owner',method='GET',value)=>mf.dispatchFetch('https://planning.test'+path,{method,headers:{'oai-authenticated-user-id':user+'-id','oai-authenticated-user-email':user+'@example.com','x-zavlahy-request':'1','content-type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});
const good=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
const day='2027-05-18',job=(extra={})=>({version:0,title:'Testovací servis',description:'Původní práce',address:'Testovací zahrada',assignedTo:'worker-id',assignedTos:['worker-id','mate-id'],dueDate:day,status:'planned',...extra});
try{
 const db=await mf.getD1Database('DB');for(const e of JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries)for(const sql of readFileSync('drizzle/'+e.tag+'.sql','utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await good(await call('/api/me'));for(const user of['worker','mate']){await good(await call('/api/invitations','owner','POST',{email:user+'@example.com',role:'worker'}));await good(await call('/api/me',user));}
 await good(await call('/api/jobs/shared','owner','PUT',job({plannedStart:'09:00',estimatedMinutes:60,arrivalWindowStart:'08:00',arrivalWindowEnd:'12:00'})));
 const data=await good(await call('/api/jobs/shared/handoffs','worker')),record=data.handoffs.find(h=>h.userId==='worker-id'),ack={operationId:'concurrent-ack',jobVersion:data.jobVersion,revision:data.revision,version:record.version,status:'accepted',note:''};
 const same=await Promise.all([call('/api/jobs/shared/handoffs','worker','POST',ack),call('/api/jobs/shared/handoffs','worker','POST',ack)]);for(const r of same)await good(r);assert.equal((await db.prepare("SELECT COUNT(*) n FROM job_handoff_events WHERE id='concurrent-ack'").first()).n,1);
 const mate=data.handoffs.find(h=>h.userId==='mate-id');await good(await call('/api/jobs/shared/handoffs','mate','POST',{...ack,operationId:'mate-clarification',version:mate.version,status:'clarification',note:'Potřebuji upřesnit místo filtru.'}));
 const edits=await Promise.all(['První správce','Druhý správce'].map(description=>call('/api/jobs/shared','owner','PUT',job({version:1,description}))));assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
 const reset=await good(await call('/api/jobs/shared/handoffs'));assert.ok(reset.handoffs.every(h=>h.status==='pending'));assert.ok(reset.history.some(h=>h.status==='accepted'));assert.ok(reset.history.some(h=>h.status==='clarification'));
 assert.equal((await call('/api/jobs/shared/handoffs','worker','POST',{...ack,operationId:'stale-ack'})).status,409);
 const wr=reset.handoffs.find(h=>h.userId==='worker-id'),raceAck={operationId:'ack-edit-race',jobVersion:reset.jobVersion,revision:reset.revision,version:wr.version,status:'accepted',note:''};
 const race=await Promise.all([call('/api/jobs/shared/handoffs','worker','POST',raceAck),call('/api/jobs/shared','owner','PUT',job({version:reset.jobVersion,description:'Nové zásadní zadání'}))]);assert.equal(race[1].status,200);assert.ok([200,409].includes(race[0].status));assert.ok((await good(await call('/api/jobs/shared/handoffs'))).handoffs.every(h=>h.status==='pending'));
 const creates=await Promise.all(['first','second'].map(id=>call('/api/jobs/concurrent-'+id,'owner','PUT',job({plannedStart:'14:00',estimatedMinutes:60}))));assert.deepEqual(creates.map(r=>r.status).sort(),[200,409]);assert.equal((await db.prepare("SELECT COUNT(*) n FROM jobs WHERE id LIKE 'concurrent-%'").first()).n,1);
 const winner=(await good(await call('/api/jobs?state=all'))).jobs.find(j=>j.id.startsWith('concurrent-'));
 await good(await call('/api/jobs/adjacent','owner','PUT',job({plannedStart:'15:00',estimatedMinutes:30,arrivalWindowStart:'08:00',arrivalWindowEnd:'12:00'})));
 assert.equal((await call('/api/jobs/adjacent','owner','PUT',job({version:1,plannedStart:'14:30',estimatedMinutes:30}))).status,409);
 const config=await good(await call('/api/jobs/planning-settings','owner','PUT',{version:0,bufferMinutes:20}));assert.equal(config.bufferMinutes,20);
 const changes=[{id:'adjacent',version:1,plannedStart:'15:05',estimatedMinutes:30}],preview=await good(await call('/api/jobs/schedule','owner','POST',{operationId:'reserve-preview',changes}));assert.ok(preview.overlaps.some(c=>c.kind==='reserve'));assert.equal((await call('/api/jobs/schedule','owner','POST',{operationId:'reserve-preview',changes,commit:true,previewRevision:preview.revision})).status,409);
 await good(await call('/api/jobs/planning-settings','owner','PUT',{version:config.version,bufferMinutes:30}));assert.equal((await call('/api/jobs/schedule','owner','POST',{operationId:'reserve-preview',changes,commit:true,previewRevision:preview.revision,allowOverlaps:true})).status,409);
 assert.equal((await call('/api/jobs/backlog','worker')).status,403);assert.equal((await call('/api/jobs/planning-settings','worker','PUT',{version:2,bufferMinutes:0})).status,403);assert.equal((await call('/api/jobs/shared/handoffs','outsider')).status,403);assert.equal((await call('/api/jobs/shared','worker','PUT',job({version:3,description:'Forbidden'}))).status,403);
 // Role and access are checked again in the write SQL, including revoked membership.
 const current=(await good(await call('/api/jobs/shared'))).job;await good(await call('/api/jobs/shared','owner','PUT',job({version:current.version,assignedTo:'mate-id',assignedTos:['mate-id']})));assert.equal((await call('/api/jobs/shared/handoffs','worker')).status,404);
 assert.ok(winner.plannedStart==='14:00');console.log('PASS: compiled Worker / actual D1 migration, concurrent job writes and individual handoffs, retry idempotence, reset history, work vs arrival, reservation changes, roles and revoked access. Only isolated fixtures used.');
}finally{await mf.dispose();}
