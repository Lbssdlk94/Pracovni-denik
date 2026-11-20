import {attendanceDayBounds} from './attendance-model.js?v=workspace-roles-v1';
export const TIME_KINDS={work:'Pracuje',travel:'Na cestě',break:'Přestávka',other:'Ostatní činnost',stopped:'Práce ukončena'};
export function timeSummary(intervals,now=Date.now(),financial=false){
 const workers=new Map(),days=new Map();
 for(const row of intervals){
  const end=Math.min(row.endAt??now,now);if(end<=row.startAt)continue;
  const worker=workers.get(row.userId)||{userId:row.userId,name:row.userName,workMs:0,travelMs:0,breakMs:0,otherMs:0,...(financial?{workCostMinor:0,travelCostMinor:0,unpricedMs:0}:{})};
  worker[row.kind+'Ms']+=end-row.startAt;
  if(financial&&['work','travel'].includes(row.kind)){if(row.hourlyMinor==null)worker.unpricedMs+=end-row.startAt;else worker[row.kind+'CostMinor']+=(end-row.startAt)*row.hourlyMinor/3600000;}
  workers.set(row.userId,worker);
  for(let start=row.startAt;start<end;){const bounds=attendanceDayBounds(start),stop=Math.min(end,bounds.end),day=days.get(bounds.date)||{date:bounds.date,workMs:0,travelMs:0,breakMs:0,otherMs:0,workers:{}};day[row.kind+'Ms']+=stop-start;const person=day.workers[row.userId]||{workMs:0,travelMs:0,breakMs:0,otherMs:0};person[row.kind+'Ms']+=stop-start;day.workers[row.userId]=person;days.set(bounds.date,day);start=stop;}
 }
 const people=[...workers.values()];if(financial)for(const worker of people){worker.workCostMinor=Math.round(worker.workCostMinor);worker.travelCostMinor=Math.round(worker.travelCostMinor);}
 const total={workMs:0,travelMs:0,breakMs:0,otherMs:0,...(financial?{workCostMinor:0,travelCostMinor:0,unpricedMs:0}:{})};for(const worker of people)for(const key of Object.keys(total))total[key]+=worker[key];
 return {workers:people,days:[...days.values()].sort((a,b)=>b.date.localeCompare(a.date)),total,asOf:now};
}
export function attendanceAllocation(shifts,intervals,now=Date.now()){
 const total=shifts.reduce((n,s)=>n+Math.max(0,Math.min(s.endAt??now,now)-s.startAt),0),parts={workMs:0,travelMs:0,breakMs:0,otherMs:0};
 for(const row of intervals)for(const s of shifts){const ms=Math.max(0,Math.min(row.endAt??now,s.endAt??now,now)-Math.max(row.startAt,s.startAt));parts[row.kind+'Ms']+=ms;}
 return {attendanceMs:total,...parts,unallocatedMs:Math.max(0,total-Object.values(parts).reduce((a,b)=>a+b,0))};
}
// Read-only day projection of the same attendance and job ledgers. Partitioning
// at every boundary prevents imported overlaps from increasing confirmed hours.
export function attendanceDisplayDays(shifts,intervals,bounds,now=Date.now()){
 const unique=rows=>[...rows.reduce((m,r)=>{const old=m.get(r.id);if(!old||(r.version||0)>=(old.version||0))m.set(r.id,r);return m;},new Map()).values()];
 const rows=unique(shifts),activities=unique(intervals),output=[];
 for(let start=bounds.start;start<Math.min(bounds.end,now);){const day=attendanceDayBounds(start),end=Math.min(day.end,bounds.end,now),members=new Set(rows.filter(s=>s.startAt<end&&(s.endAt??now)>start).map(s=>s.userId));
  for(const userId of members){const own=rows.filter(s=>s.userId===userId&&s.startAt<end&&(s.endAt??now)>start),items=activities.filter(i=>i.userId===userId&&i.startAt<end&&(i.endAt??now)>start),points=[...new Set([start,end,...[...own,...items].flatMap(r=>[Math.max(start,r.startAt),Math.min(end,r.endAt??now)])])].sort((a,b)=>a-b),slices=[],issues=new Set();
   for(let n=0;n<points.length-1;n++){const a=points[n],b=points[n+1];if(b<=a)continue;const cover=own.filter(s=>s.startAt<=a&&(s.endAt??now)>=b);if(!cover.length)continue;const events=items.filter(i=>i.startAt<=a&&(i.endAt??now)>=b);if(cover.length>1)issues.add('Překrývající se směny');if(events.length>1)issues.add('Překrývající se činnosti');const event=events.length===1?events[0]:null,kind=event?.kind||'unallocated',confirmed=cover.length===1&&cover[0].endAt!=null&&!cover[0].pending&&events.length<=1&&!event?.pending;slices.push({startAt:a,endAt:b,kind,job:event?.job||null,confirmed});}
   if(own.some(s=>s.endAt==null&&s.startAt<attendanceDayBounds(now).start))issues.add('Neukončená docházka z předchozího dne; může jít o směnu přes půlnoc');if(own.some(s=>(s.endAt??now)-s.startAt>16*3600000))issues.add('Dlouhá směna vyžaduje kontrolu');
   const sum=filter=>slices.filter(filter).reduce((n,s)=>n+s.endAt-s.startAt,0),grossMs=sum(()=>true),breakMs=sum(s=>s.kind==='break');output.push({key:userId+'|'+day.date,date:day.date,userId,name:own[0]?.userName||'',shifts:own,slices,issues:[...issues],grossMs,breakMs,netMs:Math.max(0,grossMs-breakMs),confirmedMs:sum(s=>s.confirmed&&s.kind!=='break'),workMs:sum(s=>s.confirmed&&s.kind==='work'),open:own.some(s=>s.endAt==null)});
  }start=day.end;
 }return output.sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'cs'));
}
