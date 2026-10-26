export const MATERIAL_REMINDER_DEFAULTS=Object.freeze({enabled:true,days:3,dayMode:'workdays',shiftNonWorking:true});
export function validateMaterialReminderSettings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(MATERIAL_REMINDER_DEFAULTS,k))||typeof value.enabled!=='boolean'||!Number.isSafeInteger(value.days)||value.days<0||value.days>60||!['calendar','workdays'].includes(value.dayMode)||typeof value.shiftNonWorking!=='boolean')throw new Error('Vyberte předstih 0 až 60 dní, způsob počítání a platné přepínače.');
 return {enabled:value.enabled,days:value.days,dayMode:value.dayMode,shiftNonWorking:value.shiftNonWorking};
}
const materialHolidayCache=new Map();
function materialAddDay(day,offset){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);}
function materialEasterDay(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
export function materialWorkingDay(day){
 const weekday=new Date(day+'T12:00:00Z').getUTCDay();if(weekday===0||weekday===6)return false;
 const year=Number(day.slice(0,4));let holidays=materialHolidayCache.get(year);if(!holidays){const easter=materialEasterDay(year);holidays=new Set(['01-01','05-01','05-08','07-05','07-06','09-28','10-28','11-17','12-24','12-25','12-26'].map(date=>year+'-'+date));holidays.add(materialAddDay(easter,-2));holidays.add(materialAddDay(easter,1));materialHolidayCache.set(year,holidays);}return !holidays.has(day);
}
export function materialReminderDate(dueDate,settings=MATERIAL_REMINDER_DEFAULTS){
 if(typeof dueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(Date.parse(dueDate+'T12:00:00Z'))||new Date(dueDate+'T12:00:00Z').toISOString().slice(0,10)!==dueDate)return null;
 const config=validateMaterialReminderSettings(settings);let result=dueDate;
 if(config.dayMode==='calendar')result=materialAddDay(result,-config.days);else for(let left=config.days;left;){result=materialAddDay(result,-1);if(materialWorkingDay(result))left--;}
 if(config.shiftNonWorking)while(!materialWorkingDay(result))result=materialAddDay(result,-1);
 return result;
}
