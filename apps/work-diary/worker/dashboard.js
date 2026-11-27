import {workspaceJobScope,workspaceDisciplineSql,workspaceGardenScope} from './workspace-policy.js';
import {jobProjection} from './job-projection.js';
import {dashboardJobFilter} from './dashboard-filters.js';
import {timeState,timeDetail,timeAttendanceSummary} from './job-time.js';
import {attendanceDayBounds} from '../web/attendance-model.js';
import {handleNotifications} from './notifications.js';

// A read-only projection of the existing ledgers. No new persistence or clock system.
export async function handleDashboard(request,env,m,h){
 const {all,one,json,fail}=h,url=new URL(request.url),now=Date.now(),day=attendanceDayBounds(now);
 const manager=['owner','administrator','admin'].includes(m.role),mode=url.searchParams.get('mode')||(manager?'company':'personal');
 if(!['company','personal'].includes(mode))fail(400,'Vyberte firemní nebo vlastní přehled.');
 if(mode==='company'&&!manager)fail(403,'Firemní přehled je pouze pro správce.');
 const company=mode==='company',features=h.features||{},jobsEnabled=features.jobs!==false,attendanceEnabled=features.attendance!==false;
 const selected=url.searchParams.get('discipline')||m._workspace?.selectedDiscipline||'all';
 if(!['all','irrigation','garden'].includes(selected))fail(400,'Neplatný obor.');
 if(m._workspace&&selected!=='all'&&!m._workspace.disciplines.includes(selected))fail(403,'Obor není dostupný.');
 const discipline=m._workspace&&selected!=='all'?selected:null;
 const clauses=['j.deleted=0',workspaceJobScope()],args=[m.user_id];
 if(discipline){clauses.push('j.discipline=?');args.push(discipline);}
 if(!company){clauses.push('(j.assigned_to=? OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) a WHERE a.value=?))');args.push(m.user_id,m.user_id);}
 const scope=clauses.join(' AND ');
 const myState=attendanceEnabled?await timeState(env,m.user_id,m):null;
 if(!jobsEnabled&&myState?.active)myState.active={jobId:"unavailable",kind:"other"};
 const {select,record}=jobProjection(m,h,myState);
 const selectJobs=async(extra='',values=[],limit=100,order="j.due_date,CASE WHEN j.planned_start<>'' THEN j.planned_start ELSE j.start_time END,j.id")=>
  (await all(env.DB,select+' WHERE '+scope+(extra?' AND '+extra:'')+' ORDER BY '+order+' LIMIT '+limit,...args,...values));
 const attention=[],stats={};let todayJobs=[],activeJobs=[],nextJob=null,currentJob=null,timeSnapshot=null,people=[];
 if(jobsEnabled){
  const counts=await one(env.DB,"SELECT COUNT(*) total,COALESCE(SUM(j.status='in_progress'),0) inProgress,COALESCE(SUM(j.service_approval='pending'),0) pendingApproval,COALESCE(SUM(j.due_date=?),0) todayVisits FROM jobs j WHERE "+scope,day.date,...args);
  Object.assign(stats,counts);
  todayJobs=await selectJobs('j.due_date=?',[day.date],30,"CASE WHEN j.status='done' THEN 1 ELSE 0 END,CASE WHEN j.planned_start<>'' THEN j.planned_start ELSE j.start_time END,j.id");
  activeJobs=company?await selectJobs("j.status='in_progress' AND j.job_type='installation'",[],12,'j.updated_at DESC,j.id'):[];
  if(myState?.active?.jobId&&myState.active.jobId!=='unavailable')currentJob=(await selectJobs('j.id=?',[myState.active.jobId],1))[0]||null;
  const nextToday=todayJobs.find(j=>!['done','incomplete'].includes(j.status));
  nextJob=nextToday||(await selectJobs("j.due_date>? AND j.status NOT IN ('done','incomplete')",[day.date],1))[0]||null;

  if(attendanceEnabled&&(currentJob||(!company&&nextJob))){timeSnapshot=await timeDetail(env,m,currentJob||nextJob,fail,{compact:true});}
  const types=[...(company?['approval']:[]),'material','protocol','overdue','incomplete',...(features.drivePhotos!==false?['photos']:[])];
  for(const type of types){const f=dashboardJobFilter(type,day.date);const c=await one(env.DB,'SELECT COUNT(*) n FROM jobs j LEFT JOIN service_reports pr ON pr.job_id=j.id WHERE '+scope+' AND ('+f.sql+')',...args,...f.args);if(c.n)attention.push({id:type,kind:'jobs',filter:type,count:c.n});}
 }
 if(features.defects!==false){
  const ds=['d.status<>\'resolved\'','g.deleted=0','EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND '+workspaceDisciplineSql('d.discipline','actor','defects')+')',workspaceGardenScope()],da=[m.user_id,m.user_id];
  if(discipline){ds.push('d.discipline=?');da.push(discipline);}
  if(!company){ds.push('EXISTS(SELECT 1 FROM jobs j WHERE j.garden_id=d.garden_id AND '+(m._workspace?'j.discipline=d.discipline AND ':'')+scope+')');da.push(...args);}
  const c=await one(env.DB,'SELECT COUNT(*) n FROM garden_defects d JOIN gardens g ON g.id=d.garden_id WHERE '+ds.join(' AND '),...da);
  if(c.n)attention.push({id:'defects',kind:'defects',count:c.n});
 }
 let attendance=null;
 if(attendanceEnabled){
  const personalShifts=await all(env.DB,'SELECT id,user_id AS userId,user_name AS userName,start_at AS startAt,end_at AS endAt,version FROM attendance_shifts WHERE user_id=? AND deleted_at IS NULL AND start_at<? AND (end_at IS NULL OR end_at>?) ORDER BY start_at',m.user_id,now,day.start);
  const activeShift=await one(env.DB,'SELECT id,user_id AS userId,start_at AS startAt,end_at AS endAt,version FROM attendance_shifts WHERE user_id=? AND deleted_at IS NULL AND end_at IS NULL',m.user_id);
  attendance={activeShift,shifts:personalShifts};
  const allowed=m._workspace?(discipline?[discipline]:m._workspace.disciplines):[];
  const memberGate=company?(m._workspace?"(p.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=p.user_id AND md.discipline IN (SELECT value FROM json_each(?))))":'1'):'p.user_id=?';
  const memberArgs=company?(m._workspace?[JSON.stringify(allowed)]:[]):[m.user_id];
  const members=await all(env.DB,"SELECT p.user_id AS id,p.name,p.role FROM members p WHERE p.role IN ('owner','administrator','admin','worker') AND "+memberGate+' ORDER BY p.name',...memberArgs),ids=members.map(p=>p.id);
  const shifts=ids.length?await all(env.DB,'SELECT id,user_id AS userId,start_at AS startAt,end_at AS endAt FROM attendance_shifts WHERE user_id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL AND start_at<? AND (end_at IS NULL OR end_at>?)',JSON.stringify(ids),now,day.start):[];
  const intervals=jobsEnabled?await all(env.DB,'SELECT i.* FROM job_time_intervals i JOIN jobs j ON j.id=i.job_id WHERE '+scope+(!company?' AND i.user_id=?':'')+' AND i.start_at<? AND (i.end_at IS NULL OR i.end_at>?)',...args,...(company?[]:[m.user_id]),now,day.start):[];
  const active=jobsEnabled?await all(env.DB,'SELECT i.*,j.title AS job_title,j.customer_name FROM job_time_intervals i JOIN jobs j ON j.id=i.job_id WHERE '+scope+(!company?' AND i.user_id=?':'')+' AND i.end_at IS NULL',...args,...(company?[]:[m.user_id])):[];
  const duration=r=>Math.max(0,Math.min(r.end_at??now,now)-Math.max(r.start_at,day.start));
  people=members.map(p=>{const current=active.find(i=>i.user_id===p.id),ownShifts=shifts.filter(s=>s.userId===p.id);return {...p,inWork:ownShifts.some(s=>s.endAt===null),state:current?.kind||(ownShifts.some(s=>s.endAt===null)?'other':'off'),activeSince:current?.start_at||null,job:current?{id:current.job_id,title:current.job_title,customerName:current.customer_name}:null,workMs:intervals.filter(i=>i.user_id===p.id&&i.kind==='work').reduce((n,r)=>n+duration(r),0)};});
  const rank={work:0,travel:1,break:2,other:3,off:4};people.sort((a,b)=>(rank[a.state]??4)-(rank[b.state]??4)||a.name.localeCompare(b.name,'cs'));
  stats.workersInWork=people.filter(p=>p.inWork).length;stats.workersTotal=people.length;stats.todayWorkMs=intervals.filter(i=>i.kind==='work').reduce((n,r)=>n+duration(r),0);
  attendance.breakMs=(await timeAttendanceSummary(env,personalShifts,now))[m.user_id]?.breakMs||0;
  const broken=shifts.filter(s=>s.endAt===null&&s.startAt<day.start);if(broken.length)attention.push({id:'unclosedAttendance',kind:'attendance',count:broken.length});
  if(company&&ids.length){const pending=await one(env.DB,"SELECT COUNT(*) n FROM attendance_corrections WHERE status='pending' AND user_id IN (SELECT value FROM json_each(?))",JSON.stringify(ids));if(pending.n)attention.push({id:'attendanceReview',kind:'attendance',count:pending.n});}
  if(activeJobs.length){const totals=await all(env.DB,"SELECT job_id,SUM(CASE WHEN kind='work' THEN MAX(0,MIN(COALESCE(end_at,?),?)-start_at) ELSE 0 END) workMs,SUM(CASE WHEN kind='work' AND end_at IS NULL THEN 1 ELSE 0 END) activeCount FROM job_time_intervals WHERE job_id IN (SELECT value FROM json_each(?)) GROUP BY job_id",now,now,JSON.stringify(activeJobs.map(j=>j.id)));activeJobs=activeJobs.map(j=>({...j,_dashboardTime:totals.find(t=>t.job_id===j.id)||{workMs:0,activeCount:0}}));}
 }
 let notices={notifications:[],unread:0};
 if(features.notifications!==false){const target=new URL(request.url);target.pathname='/api/notifications';target.search='';notices=await(await handleNotifications(new Request(target,request),env,m,h)).json();}
 const live=await one(env.DB,'SELECT role FROM members WHERE user_id=?',m.user_id);if(!live||live.role!==m.role)fail(403,'Oprávnění se změnila. Obnovte přihlášení.');
 if(m._workspace){const auth=await one(env.DB,"SELECT authorization_revision FROM workspaces WHERE id=? AND state IN ('active','read_only')",m._workspace.workspaceId);if(!auth||auth.authorization_revision!==m._workspace.authorizationVersion)fail(403,'Příslušnost se změnila. Obnovte přístup.');}
 return json({mode,asOf:now,day:day.date,complete:true,stats,people:company?people:[],todayJobs:todayJobs.map(record),todayTruncated:(stats.todayVisits||0)>todayJobs.length,activeJobs:activeJobs.map(j=>({...record(j),time:j._dashboardTime||null})),currentJob:currentJob?record(currentJob):null,nextJob:nextJob?record(nextJob):null,myState,timeSnapshot,attendance,attention,notifications:notices.notifications,unread:notices.unread});
}
