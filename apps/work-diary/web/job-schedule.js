import {compareWorkJobs,jobWorkRank} from './job-workflow-model.js?v=workspace-roles-v1';
import {workInterval,planClock} from './planning-model.js?v=workspace-roles-v1';
export function pragueToday(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function moveJobMonth(month,offset){
 const [year,m]=month.split('-').map(Number),d=new Date(Date.UTC(year,m-1+offset,1));
 return d.getUTCFullYear()<1000||d.getUTCFullYear()>9999?month:d.toISOString().slice(0,7);
}
export function jobMonthDays(month){
 const [year,m]=month.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)),lead=(first.getUTCDay()+6)%7,count=new Date(Date.UTC(year,m,0)).getUTCDate();
 const days=Array(lead).fill(null);for(let d=1;d<=count;d++)days.push(`${month}-${String(d).padStart(2,'0')}`);
 while(days.length%7)days.push(null);return days;
}
export const jobMonthLabel=month=>new Intl.DateTimeFormat('cs-CZ',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z'));
export const jobDayLabel=day=>{const label=new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));return label[0].toUpperCase()+label.slice(1);};
export const jobTimeLabel=job=>job.plannedStart?'Práce '+job.plannedStart+(workInterval(job)?'–'+planClock(workInterval(job).end):' · délka neurčena'):job.arrivalWindowStart?'Příjezd '+job.arrivalWindowStart+(job.arrivalWindowEnd?'–'+job.arrivalWindowEnd:''):job.startTime?job.startTime+(job.endTime?'–'+job.endTime:''):'Čas neurčen';
export function scheduledJobTitle(job){
 const prefix=job.startTime&&job.endTime?job.startTime+'–'+job.endTime+' · ':'';
 // Imported titles already include their old time. Keep source text intact in
 // the database and remove that exact duplicate only for presentation.
 return prefix&&job.title.startsWith(prefix)?job.title.slice(prefix.length):job.title;
}
export function groupScheduledJobs(jobs){
 const result=new Map();
 for(const job of [...jobs].sort(compareWorkJobs)){
  const date=job.dueDate||'',completed=job.status==='done',incomplete=job.status==='incomplete',key=jobWorkRank(job.status)+'|'+date;if(!result.has(key))result.set(key,{date,completed,incomplete,jobs:[]});result.get(key).jobs.push(job);
 }
 return [...result.values()];
}
