import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {api} from '../worker/api.js';
import {environment,people,request} from './fixtures.mjs';
import {pragueToday,moveJobMonth,jobMonthDays,groupScheduledJobs,jobTimeLabel,scheduledJobTitle} from '../web/job-schedule.js';
const ctx={waitUntil:p=>p.catch(()=>{})};
const call=(env,path,person=people.owner,method='GET',value)=>api(request(path,person,method,value),env,ctx);
const value=(extra={})=>({version:0,title:'Návštěva',description:'',address:'',gardenId:null,assignedTo:people.worker.id,dueDate:'2026-10-16',status:'planned',incompleteReason:'',...extra});
async function setup(){const env=environment();await call(env,'/api/me');for(const role of ['worker','reader']){await call(env,'/api/invitations',people.owner,'POST',{email:people[role].email,role});await call(env,'/api/me',people[role]);}return env;}
async function put(env,id,v){const r=await call(env,'/api/jobs/'+id,people.owner,'PUT',v);assert.equal(r.status,200,await r.clone().text());return (await r.json()).job;}
test('Calendar sorts by date/time, includes undated last, and counts only authorized jobs across every filter',async()=>{
 const env=await setup();
 for(const [id,extra]of [['late',{startTime:'13:00',endTime:'16:00'}],['early',{startTime:'08:15',endTime:'10:00'}],['no-time',{}],['before',{dueDate:'2026-10-15',startTime:'23:00'}],['next-month',{dueDate:'2026-11-01'}],['undated',{dueDate:''}],['private',{assignedTo:people.reader.id,startTime:'09:00'}]])await put(env,id,value(extra));
 const get=async(query='',person=people.worker)=>{const r=await call(env,'/api/jobs?order=schedule&state=all'+query,person);assert.equal(r.status,200);return r.json();};
 const all=await get();assert.deepEqual(all.jobs.map(j=>j.id),['before','early','late','no-time','next-month','undated']);
 const month=await get('&month=2026-10');assert.deepEqual(month.jobs.map(j=>j.id),['before','early','late','no-time','undated']);assert.deepEqual(month.calendar,{days:[{date:'2026-10-15',count:1},{date:'2026-10-16',count:3}],undatedCount:1});
 const day=await get('&month=2026-10&day=2026-10-16');assert.deepEqual(day.jobs.map(j=>j.id),['early','late','no-time']);assert.deepEqual(day.calendar,month.calendar);
 assert.deepEqual((await get('&month=2026-10&day=undated')).jobs.map(j=>j.id),['undated']);
 assert.equal((await get('&month=2026-10',people.owner)).calendar.days[1].count,4);
 assert.equal((await get('&month=2026-10&assignee='+people.worker.id,people.owner)).calendar.days[1].count,3);
 const empty=await get('&month=2026-10&q=missing');assert.deepEqual(empty.calendar,{days:[],undatedCount:0});
 for(const query of ['&month=2026-13','&month=0000-01','&day=2026-10-16','&month=2026-10&day=2026-11-01','&month=2026-02&day=2026-02-30','&month=2026-10&day=bad'])assert.equal((await call(env,'/api/jobs?order=schedule'+query)).status,400);
 assert.equal((await call(env,'/api/jobs?order=schedule&month=2026-10&assignee='+people.reader.id,people.worker)).status,403);env.sqlite.close();
});
test('Calendar seek pagination stays chronological across ties/undated, totals cover all pages, and day selection loads later dates directly',async()=>{
 const env=await setup();
 for(let i=0;i<207;i++)await put(env,'page-'+String(i).padStart(3,'0'),value({dueDate:i<105?'2026-10-16':i<205?'2026-10-17':'',startTime:i<205?'09:00':'',title:'Návštěva '+i}));
 const prefix='/api/jobs?state=all&order=schedule&month=2026-10&q=N%C3%A1v%C5%A1t%C4%9Bva';let cursor='',jobs=[],first;
 do{const r=await call(env,prefix+(cursor?'&cursor='+encodeURIComponent(cursor):''),people.worker),page=await r.json();assert.equal(r.status,200);first||=page;assert.deepEqual(page.calendar,{days:[{date:'2026-10-16',count:105},{date:'2026-10-17',count:100}],undatedCount:2});jobs.push(...page.jobs);cursor=page.nextCursor;}while(cursor);
 assert.equal(jobs.length,207);assert.equal(new Set(jobs.map(j=>j.id)).size,207);assert.deepEqual(jobs.map(j=>j.id),Array.from({length:207},(_,i)=>'page-'+String(i).padStart(3,'0')));
 const later=await(await call(env,prefix+'&day=2026-10-17',people.worker)).json();assert.equal(later.jobs.length,100);assert.equal(later.jobs[0].id,'page-105');
 assert.equal((await call(env,prefix+'&day=2026-10-17&cursor='+encodeURIComponent(first.nextCursor),people.worker)).status,400);env.sqlite.close();
});
test('Only managers change valid wall-clock times; older clients preserve them and one reschedule sends one notification',async()=>{
 const env=await setup();let job=await put(env,'time',value({startTime:'08:15',endTime:'10:00'}));assert.equal(job.startTime,'08:15');assert.equal(job.endTime,'10:00');
 for(const extra of [{startTime:'24:00'},{startTime:'8:15'},{endTime:'08:15'},{endTime:'07:00'},{startTime:'',endTime:'10:00'},{dueDate:'',startTime:'08:15'},{startTime:17}])assert.equal((await call(env,'/api/jobs/time',people.owner,'PUT',value({version:job.version,...extra}))).status,400);
 assert.equal((await call(env,'/api/jobs/time',people.worker,'PUT',value({version:job.version,startTime:'09:00'}))).status,403);
 job=await put(env,'time',value({version:job.version,title:'Starší klient bez časových polí'}));assert.equal(job.startTime,'08:15');assert.equal(job.endTime,'10:00');
 let count=env.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id=?").get(people.worker.id).n;
 job=await put(env,'time',value({version:job.version,title:job.title,startTime:'09:00',endTime:'10:30',dueDate:'2026-10-17'}));assert.equal(env.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id=?").get(people.worker.id).n,count+1);
 count++;job=await put(env,'time',value({version:job.version,title:job.title,startTime:'09:30',endTime:'11:00',dueDate:job.dueDate}));assert.equal(env.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id=?").get(people.worker.id).n,count+1);
 job=await put(env,'time',value({version:job.version,startTime:'',endTime:'',dueDate:''}));assert.equal(job.startTime,'');assert.equal(job.endTime,'');env.sqlite.close();
});
test('Legacy migration backfills only a valid dated range and retains the original source title',()=>{
 const sqlite=new DatabaseSync(':memory:'),entries=JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries;
 for(const e of entries.filter(e=>e.idx<17))sqlite.exec(readFileSync('drizzle/'+e.tag+'.sql','utf8'));
 const insert=sqlite.prepare("INSERT INTO jobs(id,title,description,address,assigned_to,assigned_name,due_date,status,created_at,updated_at,created_by,updated_by) VALUES(?,?,'','','worker-id','Worker',?,'planned',1,1,'owner-id','owner-id')");
 for(const [id,title,date]of [['valid','08:15–10:00 · Zazimování #1','2026-10-16'],['reversed','13:00–10:00 · Chyba','2026-10-16'],['invalid','24:00–25:00 · Chyba','2026-10-16'],['undated','08:15–10:00 · Bez data','']])insert.run(id,title,date);
 sqlite.exec(readFileSync('drizzle/'+entries.find(e=>e.idx===17).tag+'.sql','utf8'));
 assert.deepEqual({...sqlite.prepare("SELECT start_time,end_time,title FROM jobs WHERE id='valid'").get()},{start_time:'08:15',end_time:'10:00',title:'08:15–10:00 · Zazimování #1'});
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM jobs WHERE start_time<>''").get().n,1);sqlite.close();
});
test('Calendar uses Czech local day, Monday weeks, leap years, and deterministic ordering',()=>{
 assert.equal(pragueToday(new Date('2026-10-15T22:30:00Z')),'2026-10-16');assert.equal(pragueToday(new Date('2026-12-31T23:30:00Z')),'2027-01-01');
 assert.equal(moveJobMonth('2026-12',1),'2027-01');assert.equal(moveJobMonth('2026-01',-1),'2025-12');assert.equal(moveJobMonth('1000-01',-1),'1000-01');assert.equal(moveJobMonth('9999-12',1),'9999-12');
 assert.equal(jobMonthDays('2026-10').indexOf('2026-10-01'),3);assert.equal(jobMonthDays('2028-02').filter(Boolean).length,29);
 const job={id:'a',dueDate:'2026-10-16',startTime:'08:15',endTime:'10:00',title:'08:15–10:00 · Zazimování'};assert.equal(jobTimeLabel(job),'08:15–10:00');assert.equal(scheduledJobTitle(job),'Zazimování');
 assert.deepEqual(groupScheduledJobs([{...job,id:'b',startTime:''},job,{...job,id:'c',dueDate:''}]).map(g=>[g.date,g.jobs.map(j=>j.id)]),[['2026-10-16',['a','b']],['',['c']]]);
});

test('Completed jobs follow all unfinished jobs across pagination and retain planned date/time order',async()=>{
 const env=await setup();try{
  // Interleave creation and dates so sorting by creation or completion cannot pass.
  for(let i=0;i<210;i++)await put(env,'rank-'+String(i).padStart(3,'0'),value({status:i%2?'done':'planned',dueDate:i%2?'2026-10-14':'2026-10-16',startTime:i<110?'08:00':'14:00'}));
  await put(env,'active-undated',value({dueDate:''}));await put(env,'done-undated',value({dueDate:'',status:'done'}));await put(env,'private-done',value({status:'done',assignedTo:people.reader.id}));
  const prefix='/api/jobs?order=schedule&state=all&month=2026-10';let cursor='',rows=[],first;
  do{const response=await call(env,prefix+(cursor?'&cursor='+encodeURIComponent(cursor):''),people.worker),page=await response.json();assert.equal(response.status,200);first||=page;rows.push(...page.jobs);cursor=page.nextCursor;}while(cursor);
  const active=Array.from({length:210},(_,i)=>i).filter(i=>i%2===0).map(i=>'rank-'+String(i).padStart(3,'0')),done=Array.from({length:210},(_,i)=>i).filter(i=>i%2===1).map(i=>'rank-'+String(i).padStart(3,'0'));
  assert.deepEqual(rows.map(j=>j.id),[...active,'active-undated',...done,'done-undated']);assert.equal(new Set(rows.map(j=>j.id)).size,212);
  const finished=await(await call(env,'/api/jobs?order=schedule&state=done',people.worker)).json();assert.deepEqual(finished.jobs.map(j=>j.id),done.slice(0,100));
  // A stale browser must restart after the ordering/cursor format changed.
  const old=JSON.parse(atob(first.nextCursor));delete old.completed;assert.equal((await call(env,prefix+'&cursor='+encodeURIComponent(btoa(JSON.stringify(old))),people.worker)).status,400);
  const shift=await call(env,'/api/jobs/rank-001/status',people.worker,'PATCH',{version:1,status:'in_progress'});assert.equal(shift.status,200);const reopened=await(await call(env,prefix,people.worker)).json();assert.equal(reopened.jobs[0].id,'rank-001');
 }finally{env.sqlite.close();}
});

test('Calendar groups unfinished days before completed days and sorts each section chronologically',()=>{
 const rows=[{id:'done-late',status:'done',dueDate:'2026-10-15',startTime:'14:00'},{id:'active-undated',status:'planned',dueDate:'',startTime:''},{id:'done-early',status:'done',dueDate:'2026-10-15',startTime:'08:00'},{id:'active',status:'incomplete',dueDate:'2026-10-16',startTime:'10:00'},{id:'done-next',status:'done',dueDate:'2026-10-16',startTime:'07:00'}];
 assert.deepEqual(groupScheduledJobs(rows).map(g=>[g.completed,g.date,g.jobs.map(j=>j.id)]),[[false,'',['active-undated']],[false,'2026-10-16',['active']],[true,'2026-10-15',['done-early','done-late']],[true,'2026-10-16',['done-next']]]);
});

test('Upcoming daily fallback is date-scoped, authorized and searchable by customer without exposing other assignments',async()=>{
 const env=await setup();try{
  await put(env,'past-visit',value({dueDate:'2026-10-17'}));await put(env,'next-visit',value({dueDate:'2026-10-19',customerName:'Alena Zahradníková'}));await put(env,'later-visit',value({dueDate:'2026-11-02'}));await put(env,'no-date',value({dueDate:''}));await put(env,'other-private',value({dueDate:'2026-10-19',assignedTo:people.reader.id,customerName:'Soukromý kontakt'}));
  const path='/api/jobs?state=active&order=schedule&after=2026-10-18';const r=await call(env,path,people.worker);assert.equal(r.status,200);assert.deepEqual((await r.json()).jobs.map(j=>j.id),['next-visit','later-visit']);
  const search=await call(env,path+'&q='+encodeURIComponent('Zahradníková'),people.worker);assert.equal(search.status,200);assert.deepEqual((await search.json()).jobs.map(j=>j.id),['next-visit']);
  for(const suffix of ['&month=2026-10','&from=2026-10-18&to=2026-10-19'])assert.equal((await call(env,path+suffix,people.worker)).status,400);assert.equal((await call(env,'/api/jobs?order=schedule&after=2026-02-30',people.worker)).status,400);assert.equal((await call(env,path+'&assignee='+people.reader.id,people.worker)).status,403);
 }finally{env.sqlite.close();}
});
