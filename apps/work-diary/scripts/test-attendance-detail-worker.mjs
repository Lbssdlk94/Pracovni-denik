import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {Miniflare} from 'miniflare';
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'attendance-redesign-isolated'},r2Buckets:['BUCKET'],bindings:{TEAM_OWNER_EMAIL:'owner@example.com'}});
const call=(path,user='owner',method='GET',body)=>mf.dispatchFetch('https://attendance.test'+path,{method,headers:{'oai-authenticated-user-id':user+'-id','oai-authenticated-user-email':user+'@example.com','x-zavlahy-request':'1','x-workspace-client-version':'shared-directory-v1','x-work-time-client':'v1','x-attendance-client':'v1','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const good=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
try{
 const db=await mf.getD1Database('DB');for(const e of JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries)for(const sql of readFileSync('drizzle/'+e.tag+'.sql','utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await good(await call('/api/me'));await good(await call('/api/invitations','owner','POST',{email:'worker@example.com',role:'worker'}));await good(await call('/api/me','worker'));
 const at=Date.now()-600000,shift=await good(await call('/api/attendance/punch','worker','POST',{mutationId:'arrival',kind:'arrival',at,gpsStatus:'disabled'}));
 const b={operationId:'pause',action:'break',at:at+1000,shiftId:shift.shift.id,shiftVersion:shift.shift.version,version:0};
 const pause=await good(await call('/api/attendance/activities','worker','POST',b));assert.equal(pause.state.active.kind,'break');assert.equal(pause.state.active.jobId,null);
 assert.equal((await good(await call('/api/attendance/activities','worker','POST',b))).replayed,true);
 const departed=await good(await call('/api/attendance/punch','worker','POST',{mutationId:'departure',kind:'departure',shiftId:shift.shift.id,version:shift.shift.version,at:at+300000,gpsStatus:'disabled'}));assert.equal(departed.state.active,null);assert.equal(departed.shift.endAt,at+300000);
 const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit'}).format(new Date());
 const data=await good(await call('/api/attendance?month='+month+'&detail=1','worker'));assert.equal(data.detail.activitySchema,1);assert.equal(data.detail.intervals.length,1);assert.equal(data.detail.intervals[0].endAt,at+300000);assert.equal(JSON.stringify(data).includes('hourlyMinor'),false);
 assert.equal((await call('/api/attendance?month='+month+'&detail=1&userId=all','worker')).status,403);
 assert.equal((await db.prepare('SELECT count(*) n FROM jobs').first()).n,0);assert.equal((await db.prepare('SELECT count(*) n FROM job_time_intervals').first()).n,1);
 await good(await call('/api/jobs/real-test-job','owner','PUT',{version:0,title:'Isolated assigned job',assignedTo:'worker-id',status:'planned'}));
 const second=await good(await call('/api/attendance/punch','worker','POST',{mutationId:'arrival2',kind:'arrival',at:at+400000,gpsStatus:'disabled'}));
 await good(await call('/api/attendance/activities','worker','POST',{operationId:'pause2',action:'break',at:at+410000,shiftId:second.shift.id,shiftVersion:second.shift.version,version:departed.state.version}));
 const moved=await good(await call('/api/jobs/real-test-job/time/actions','worker','POST',{operationId:'start-assigned-job',action:'work',at:at+420000,workers:[{userId:'worker-id',version:departed.state.version+1}],allowSwitch:true}));assert.equal(moved.states.find(s=>s.userId==='worker-id').active.jobId,'real-test-job');
 assert.equal((await db.prepare('SELECT count(*) n FROM job_time_intervals WHERE end_at IS NULL').first()).n,1);
 console.log('PASS actual workerd/D1: all migrations, standalone break in original ledger, idempotence, captured offline timestamps, null-job close/audit trigger, scoped detail without financials, worker team denial; no dummy jobs.');
}finally{await mf.dispose();}
