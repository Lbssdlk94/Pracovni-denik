export const SUB_STATES={active:'Aktivní',paused:'Pozastavené',ended:'Ukončené'};
export const SUB_PAYMENTS={unpaid:'Neuhrazené',partial:'Částečně uhrazené',paid:'Uhrazené',overdue:'Po splatnosti'};
export const SUB_FREQUENCIES={yearly:'V průběhu období',monthly:'Přibližně měsíčně',quarterly:'Přibližně čtvrtletně',custom:'V doporučených měsících'};
export function subDate(value){return typeof value==='string'&&/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function subAddDays(date,days){return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);}
export function subAddMonths(date,months){const [y,m,d]=date.split('-').map(Number),target=new Date(Date.UTC(y,m-1+months,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(d,last));return target.toISOString().slice(0,10);}
export function subPeriodEnd(start,billingPeriod){return subAddDays(subAddMonths(start,billingPeriod==='monthly'?1:12),-1);}
export function subToday(now=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;}
export function subMoney(minor,currency='CZK'){return new Intl.NumberFormat('cs-CZ',{style:'currency',currency,maximumFractionDigits:minor%100?2:0}).format(minor/100);}
export function subSuggestedDates(service,start,end,count=service.count){
 if(!count)return [];const months=service.months?.length?service.months:Array.from({length:12},(_,i)=>i+1),days=[];
 for(let date=start;date<=end;date=subAddDays(date,1))if(months.includes(Number(date.slice(5,7))))days.push(date);
 if(!days.length)return [];
 if(service.frequency==='monthly'||service.frequency==='quarterly'){
  const interval=service.frequency==='monthly'?1:3,targets=Array.from({length:count},(_,i)=>subAddMonths(start,i*interval));
  if(targets.at(-1)<=end)return targets.map(target=>days.find(day=>day>=target)||days.at(-1));
 }
 return Array.from({length:count},(_,i)=>days[Math.min(days.length-1,Math.floor((i+.5)*days.length/count))]);
}
export function subBalances(periods,usage){
 const cache=new Map(),walk=(period,seen=new Set())=>{
  if(cache.has(period.id))return cache.get(period.id);if(seen.has(period.id))throw Error('Neplatné návaznosti období.');seen.add(period.id);
  const parent=period.carryFromId?periods.find(p=>p.id===period.carryFromId):null,carry=parent?walk(parent,new Set(seen)):[];
  const result=period.snapshot.services.map(service=>{const used=usage.filter(u=>u.periodId===period.id&&u.serviceId===service.id&&u.active).reduce((n,u)=>n+u.units,0)+(period.initialUsage?.[service.id]||0)+(carry.find(s=>s.id===service.id)?.used||0);return {...service,used,remaining:service.deduct?Math.max(0,service.count-used):service.count,overdrawn:service.deduct?Math.max(0,used-service.count):0};});cache.set(period.id,result);return result;
 };return Object.fromEntries(periods.map(p=>[p.id,walk(p)]));
}
