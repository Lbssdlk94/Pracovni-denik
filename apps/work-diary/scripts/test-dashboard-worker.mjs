import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';

// Exercise the deployable, manually assembled Worker, not only source modules.
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'dashboard-isolated'},r2Buckets:['BUCKET'],bindings:{TEAM_OWNER_EMAIL:'owner@example.com'}});
const call=(path,user='owner',method='GET',body)=>mf.dispatchFetch('https://dashboard.test'+path,{method,headers:{'oai-authenticated-user-id':user+'-id','oai-authenticated-user-email':user+'@example.com','x-zavlahy-request':'1','x-workspace-client-version':'shared-directory-v1','x-work-time-client':'v1','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const good=async response=>{assert.equal(response.status,200,await response.clone().text());return response.json();};
try{
 const db=await mf.getD1Database('DB');
 for(const entry of JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries)for(const sql of readFileSync('drizzle/'+entry.tag+'.sql','utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await good(await call('/api/me'));
 for(const role of ['worker','admin','reader']){await good(await call('/api/invitations','owner','POST',{email:role+'@example.com',role}));await good(await call('/api/me',role));}
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague'}).format(new Date());
 await good(await call('/api/jobs/shared','owner','PUT',{version:0,title:'Společná realizace',jobType:'installation',assignedTo:'worker-id',assignedTos:['worker-id','admin-id'],dueDate:day,status:'planned'}));
 await good(await call('/api/jobs/private','owner','PUT',{version:0,title:'Soukromá zakázka',jobType:'installation',assignedTo:'owner-id',dueDate:day,status:'planned'}));
 const at=Date.now()-60000;
 await good(await call('/api/jobs/shared/time/actions','owner','POST',{operationId:'dashboard-start-two',action:'work',at,workers:[{userId:'worker-id',version:0},{userId:'admin-id',version:0}]}));
 const company=await good(await call('/api/overview?mode=company'));
 assert.equal(company.stats.workersInWork,2);assert.equal(company.stats.inProgress,1);
 assert.ok(company.stats.todayWorkMs>=120000);
 const personal=await good(await call('/api/overview?mode=personal','worker'));
 assert.equal(personal.currentJob.id,'shared');assert.deepEqual(personal.people,[]);
 assert.ok(personal.stats.todayWorkMs<company.stats.todayWorkMs);
 assert.equal(personal.timeSnapshot.projection,'dashboard');
 assert.equal(JSON.stringify(personal).includes('Soukromá zakázka'),false);
 assert.equal(JSON.stringify(personal).includes('hourlyMinor'),false);
 for(const role of ['worker','reader'])assert.equal((await call('/api/overview?mode=company',role)).status,403);
 for(const attention of personal.attention.filter(item=>item.kind==='jobs'))assert.equal((await good(await call('/api/jobs?state=all&attention='+attention.filter,'worker'))).jobs.length,attention.count);
 await good(await call('/api/jobs/shared/time/actions','worker','POST',{operationId:'dashboard-stop-self',action:'stop',at:at+1000,workers:[{userId:'worker-id',version:1}]}));
 const after=await good(await call('/api/overview?mode=personal','worker'));
 assert.equal(after.currentJob,null);
 assert.equal((await good(await call('/api/jobs/shared','worker'))).job.status,'in_progress');
 const remaining=await good(await call('/api/overview?mode=company'));
 // Ending a job interval must not clock the worker out of their workday.
 assert.equal(remaining.stats.workersInWork,2);
 assert.equal(remaining.people.filter(person=>person.state==='work').length,1);
 assert.equal((await mf.dispatchFetch('https://dashboard.test/api/overview')).status,401);
 console.log('PASS compiled Worker/workerd/D1: role dashboards, live personal/company hours, compact snapshots, hidden unassigned jobs and costs, matching attention filters, individual stop without global completion, anonymous/role rejection. Isolated test data only.');
}finally{await mf.dispose();}
