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
