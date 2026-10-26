export const ATTENDANCE_ZONE='Europe/Prague';
export function attendanceLocal(ms){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:ATTENDANCE_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
export function attendanceInstant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Vyplňte datum a čas.');
 const [year,month,day,hour,minute]=value.match(/\d+/g).map(Number),utc=Date.UTC(year,month-1,day,hour,minute),candidates=[utc-3600000,utc-7200000].filter(ms=>attendanceLocal(ms)===value);
 if(candidates.length!==1)throw new Error(candidates.length?'Tento čas se při změně na zimní čas opakuje. Zadejte jednoznačný čas mimo opakovanou hodinu.':'Tento datum a čas neexistuje. Zkontrolujte ho.');return candidates[0];
}
export function attendanceMonthBounds(month){if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Vyberte platný měsíc (2000–2099).');const [y,m]=month.split('-').map(Number),next=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;return {start:attendanceInstant(month+'-01T00:00'),end:attendanceInstant(next+'-01T00:00')};}
export function attendanceDuration(shift,month){if(shift.endAt==null)return 0;const b=attendanceMonthBounds(month);return Math.max(0,Math.min(shift.endAt,b.end)-Math.max(shift.startAt,b.start));}
export function attendanceHours(ms){const minutes=Math.floor(ms/60000);return `${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')} min`;}
export function attendanceDayBounds(now){const date=attendanceLocal(now).slice(0,10),[year,month,day]=date.split('-').map(Number),next=new Date(Date.UTC(year,month-1,day+1)).toISOString().slice(0,10);return {date,start:attendanceInstant(date+'T00:00'),end:attendanceInstant(next+'T00:00')};}
export function attendanceOverview(shifts,now){const day=attendanceDayBounds(now),month=day.date.slice(0,7),bounds=attendanceMonthBounds(month),sum=b=>shifts.reduce((total,s)=>total+Math.max(0,Math.min(s.endAt??now,b.end,now)-Math.max(s.startAt,b.start)),0);return {date:day.date,month,todayMs:sum(day),monthMs:sum(bounds),asOf:now};}
