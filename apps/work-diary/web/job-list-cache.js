import {pragueToday,moveJobMonth} from './job-schedule.js?v=workspace-roles-v1';
import {compareWorkJobs} from './job-workflow-model.js?v=workspace-roles-v1';
import {phaseMatches} from './job-selection.js';

export const JOB_CACHE_KEY='job-list-cache-completion-v1';
export const jobCacheMonths=(now=new Date())=>{const month=pragueToday(now).slice(0,7);return [month,moveJobMonth(month,-1),moveJobMonth(month,1)];};
export const jobCacheScope=session=>session?.user?JSON.stringify([session.user.id,session.user.role,session.permissions,session.features,session.installation?.id,session.workspace?.workspaceId,session.workspace?.authorizationVersion,session.workspace?.disciplines,session.workspace?.selectedDiscipline,session.rolePreview?.selectedRole]):null;
const empty=()=>({entries:[],months:[]});
const ascii=s=>String(s||'').replace(/[A-Z]/g,c=>c.toLowerCase());
const sortedPath=url=>{url.searchParams.sort();return url.pathname+'?'+url.searchParams;};
const clone=value=>structuredClone(value);
const summary=job=>{const {gardenNotes,customerContact,...row}=job;return {...row,...customerContact?{customerContact:{id:customerContact.id,name:customerContact.name}}:{}};};
const validDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
function query(path,now){
 const url=new URL(path,'https://cache.invalid');if(url.pathname!=='/api/jobs')return null;
 const p=url.searchParams,months=jobCacheMonths(now);
 if([...p.keys()].some(k=>!['month','day','from','to','state','type','q','assignee','order','protocol','discipline','cursor','phase'].includes(k))||p.get('order')!=='schedule')return null;
 const month=p.get('month'),from=p.get('from'),to=p.get('to');
 if(month&&!months.includes(month)||!month&&!(from&&to&&months.includes(from.slice(0,7))&&months.includes(to.slice(0,7))&&validDay(from)&&validDay(to)&&to>=from&&Date.parse(to)-Date.parse(from)<=6*86400000))return null;
 if(month&&(from||to)||!month&&p.get('day'))return null;
 const state=p.get('state')||'active',type=p.get('type')||'',protocol=p.get('protocol')||'',day=p.get('day')||'',phase=p.get('phase')||'';
 if(!['active','all','planned','on_way','in_progress','done','incomplete'].includes(state)||type&&!/^[a-z][a-z0-9-]{0,40}$/.test(type)||phase&&!['open','waiting','scheduled','active','done','open_done','cancelled','archived','open_cancelled','open_archived'].includes(phase)||protocol&&!['missing','draft','ready','unfinished'].includes(protocol)||day&&day!=='undated'&&(!validDay(day)||!day.startsWith(month+'-'))||p.get('q')?.length>100)return null;
 return {url,key:sortedPath(url),months:month?[month]:[...new Set([from.slice(0,7),to.slice(0,7)])],state,type,protocol,day,from,to,phase};
}
export function deriveCachedJobs(info,snapshots){
 if(info.url.searchParams.has('cursor')||snapshots.length!==info.months.length)return null;
 const selected=snapshots[0]?.discipline,requested=info.url.searchParams.get('discipline');if(requested&&selected&&selected!=='all'&&requested!==selected)return null;
 const p=info.url.searchParams,search=ascii((p.get('q')||'').trim()),assignee=p.get('assignee'),discipline=p.get('discipline');
 let rows=[...new Map(snapshots.flatMap(s=>s.jobs).map(job=>[job.id,job])).values()].filter(job=>
  (info.phase?phaseMatches(job,info.phase):(info.state==='all'||info.state==='active'&&job.status!=='done'||job.status===info.state))&&(!info.type||job.jobType===info.type)&&
  (!info.protocol||job.status==='done'&&(info.protocol==='unfinished'?['missing','draft'].includes(job.protocolStatus||'missing'):(job.protocolStatus||'missing')===info.protocol))&&
  (!assignee||job.assignedTo===assignee||(job.assignedTos||[]).includes(assignee))&&(!discipline||discipline==='all'||!job.discipline||job.discipline===discipline)&&
  (!search||[job.title,job.description,job.address,job.customerName].some(v=>ascii(v).includes(search)))&&(!info.from||job.dueDate>=info.from&&job.dueDate<=info.to));
 let calendar;
 if(!info.from){const counts=new Map();for(const j of rows)counts.set(j.dueDate,(counts.get(j.dueDate)||0)+1);calendar={days:[...counts].filter(([day])=>day).sort().map(([date,count])=>({date,count})),undatedCount:counts.get('')||0};if(info.day)rows=rows.filter(j=>j.dueDate===(info.day==='undated'?'':info.day));}
 if(rows.length>500)return null; // Large result sets retain real server cursors.
 return {jobs:rows.sort(compareWorkJobs),nextCursor:null,...(calendar?{calendar}:{})};
}

export function createJobListCache({read,change,send,getSession,online=()=>true,notify=()=>{},now=()=>Date.now(),freshMs=60000}){
 let epoch=0,warming=null;const flights=new Map();
 const scope=()=>jobCacheScope(getSession());
 const safeRead=async()=>{try{return await read();}catch{return empty();}};
 const permitted=()=>{const s=getSession();return !!s?.user&&s.features?.jobs!==false&&s.features?.offline!==false&&(online()||s.verifiedAt&&now()-s.verifiedAt<=86400000)&&(!s.license||s.license.active&&s.license.expiresAt>now());};
 const prune=value=>{const months=jobCacheMonths(new Date(now())),state=value||empty();return {entries:(Array.isArray(state.entries)?state.entries:[]).filter(e=>e&&Array.isArray(e.months)&&e.months.every(m=>months.includes(m))&&typeof e.scope==='string'&&typeof e.key==='string'&&Array.isArray(e.value?.jobs)&&Number.isFinite(e.at)).sort((a,b)=>b.at-a.at).slice(0,40),months:(Array.isArray(state.months)?state.months:[]).filter(e=>e&&months.includes(e.month)&&typeof e.scope==='string'&&Array.isArray(e.jobs)&&Number.isFinite(e.at)).slice(-12)};};
 async function update(fn){try{await change(value=>fn(prune(value)));}catch{/* A full/unavailable cache must never fail a server operation. */}}
 async function invalidate(){epoch++;warming=null;await update(()=>empty());}
 function beginChange(){epoch++;warming=null;}
 async function changed(result,path,method){
  beginChange(); // Fence reads started while the mutation was in flight as well.
  const who=scope(),rows=[result?.job,...(result?.jobs||[])].filter(j=>j&&typeof j.title==='string'&&typeof j.dueDate==='string'),removed=method==='DELETE'?path.match(/^\/api\/jobs\/([-\w]+)$/)?.[1]:null;
  await update(state=>({entries:[],months:state.months.map(entry=>{
   if(entry.scope!==who)return entry;
   const replacements=new Set(rows.map(j=>j.id));let jobs=entry.jobs.filter(j=>j.id!==removed&&!replacements.has(j.id));
   jobs.push(...rows.filter(j=>(!j.dueDate||j.dueDate.startsWith(entry.month+'-'))&&(!entry.discipline||entry.discipline==='all'||!j.discipline||j.discipline===entry.discipline)).map(summary));
   return {...entry,jobs,dirty:true};
  })}));
 }
 const infoFor=path=>query(path,new Date(now()));
 async function peek(path){
  if(!permitted())return null;const info=infoFor(path);if(!info)return null;const who=scope(),ticket=epoch,state=prune(await safeRead());if(ticket!==epoch||who!==scope()||!permitted())return null;
  const exact=state.entries.find(e=>e.scope===who&&e.key===info.key),snapshots=info.months.map(month=>state.months.find(e=>e.scope===who&&e.month===month)).filter(Boolean);
  const value=exact?.value||deriveCachedJobs(info,snapshots);if(!value)return null;
  const at=exact?.at||Math.min(...snapshots.map(e=>e.at));return {...clone(value),_jobCache:{at,offline:!online(),stale:now()-at>=freshMs||!exact&&snapshots.some(e=>e.dirty)}};
 }
 async function fetchList(path,options={}){
  const who=scope(),ticket=epoch,key=who+'|'+ticket+'|'+path;if(flights.has(key))return flights.get(key);
  const task=(async()=>{try{const result=await send(path,options),info=infoFor(path);if(info&&result.listRevision!==null&&ticket===epoch&&who===scope()&&permitted())await update(state=>({...state,entries:[...state.entries.filter(e=>!(e.scope===who&&e.key===info.key)),{scope:who,key:info.key,months:info.months,value:{...clone(result),jobs:result.jobs.map(summary)},at:now()}].sort((a,b)=>b.at-a.at).slice(0,40)}));return result;}
   catch(error){if([401,403].includes(error.status)){await invalidate();notify({denied:true,error});}throw error;}
  })();flights.set(key,task);try{return await task;}finally{if(flights.get(key)===task)flights.delete(key);}
 }
 async function request(path,options={}){
  const info=infoFor(path);if(!info||!permitted()||options.headers)return send(path,options);
  const cached=await peek(path);if(cached&&(!options.jobCacheRefresh||!online())){
   if(cached._jobCache.stale&&online())fetchList(path,options).then(result=>{if(result.listRevision!==null)notify({path});warm().catch(()=>{});}).catch(()=>{});
   return cached;
  }
  if(!online())throw Object.assign(Error('Tento výběr ještě není uložený. Připojte se a otevřete předchozí, aktuální nebo následující měsíc.'),{code:'jobs_not_cached'});
  const result=await fetchList(path,options);warm().catch(()=>{});return result;
 }
 async function warm(){
  if(warming||!online()||!permitted())return warming;
  const who=scope(),ticket=epoch,task=(async()=>{
   for(const month of jobCacheMonths(new Date(now()))){
    if(ticket!==epoch||who!==scope()||!online()||!permitted())return;
    const state=prune(await safeRead()),old=state.months.find(e=>e.scope===who&&e.month===month);if(old&&!old.dirty&&now()-old.at<freshMs)continue;
    const jobs=[],seen=new Set();let cursor=null,complete=false,revision;
    for(let page=0;page<50;page++){
     const params=new URLSearchParams({state:'all',order:'schedule',month,cacheSnapshot:'1'});if(cursor)params.set('cursor',cursor);
     const result=await send('/api/jobs?'+params);if(ticket!==epoch||who!==scope()||!permitted())return;
     if(!Number.isSafeInteger(result.listRevision)||revision!==undefined&&revision!==result.listRevision)break;revision=result.listRevision;
     for(const job of result.jobs){if(!seen.has(job.id)){seen.add(job.id);jobs.push(summary(job));}}
     if(!result.nextCursor){complete=true;break;}if(result.nextCursor===cursor)throw Error('Opakovaná stránka zakázek.');cursor=result.nextCursor;
    }
    if(complete&&ticket===epoch&&who===scope()){await update(state=>({...state,months:[...state.months.filter(e=>!(e.scope===who&&e.month===month)),{scope:who,month,jobs,discipline:getSession()?.workspace?.selectedDiscipline||'',at:now()}]}));notify({month});}
   }
  })();warming=task;try{return await task;}catch(error){if([401,403].includes(error.status)){await invalidate();notify({denied:true,error});}throw error;}finally{if(warming===task)warming=null;}
 }
 async function ids(){const state=prune(await safeRead());return [...new Set([...state.entries.flatMap(e=>e.value.jobs||[]),...state.months.flatMap(e=>e.jobs)].map(j=>j.id))];}
 async function reconcile(current,allowed,versions={}){const target=jobCacheScope(current),ids=new Set(allowed),valid=job=>ids.has(job.id)&&versions[job.id]===job.version;epoch++;warming=null;await update(state=>({entries:state.entries.filter(e=>e.scope===target&&!e.value.calendar&&(e.value.jobs||[]).every(valid)),months:state.months.filter(e=>e.scope===target&&e.jobs.every(valid))}));}
 return {request,peek,warm,invalidate,beginChange,changed,ids,reconcile};
}
