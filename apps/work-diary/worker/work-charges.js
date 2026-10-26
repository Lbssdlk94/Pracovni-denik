import {workChargeTotals} from '../web/work-charge-model.js';
import {subOne} from './subscriptions.js';
export async function readWorkRates(env){const current=await subOne(env.DB,"SELECT value,version FROM settings WHERE key='work-rates'");return {rate:current?JSON.parse(current.value):null,version:current?.version||0};}
export async function resolveWorkCharges(env,input,previous,fail){
 if(input===undefined)return previous||null;if(input===null)return null;
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.rateId!=='string'||input.rateId.length>100)fail(400,'Vyberte uložené sazby práce a cesty.');
 const rate=await subOne(env.DB,'SELECT id,hourly_minor hourlyMinor,travel_minor travelMinor,currency FROM work_rate_revisions WHERE id=?',input.rateId);if(!rate)fail(400,'Sazby nejsou uložené na serveru.');
 try{return workChargeTotals(input,rate);}catch(e){fail(400,e.message);}
}
export async function handleWorkRates(request,env,m,h){
 const {fail,json,body}=h;if(m.role!=='owner')fail(403,'Prototyp účtování je dostupný pouze vlastníkovi.');
 if(request.method==='GET')return json(await readWorkRates(env));if(request.method!=='PUT')fail(405,'Nepodporovaná operace.');
 const b=await body(request,3000);if(!Number.isSafeInteger(b.version)||b.version<0)fail(400,'Obnovte sazby.');
 const rate={id:crypto.randomUUID(),hourlyMinor:b.hourlyMinor,travelMinor:b.travelMinor,currency:'CZK'};try{workChargeTotals({hours:0,kilometers:0},rate);}catch(e){fail(400,e.message);}
 const now=Date.now(),result=await env.DB.batch([
 env.DB.prepare("INSERT INTO settings(key,value,version) SELECT 'work-rates',?,1 WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND role='owner') AND (?=0 OR EXISTS(SELECT 1 FROM settings WHERE key='work-rates' AND version=?)) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=settings.version+1 WHERE settings.version=?").bind(JSON.stringify(rate),m.user_id,b.version,b.version,b.version),
 env.DB.prepare("INSERT INTO work_rate_revisions(id,hourly_minor,travel_minor,currency,created_at,created_by) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key='work-rates' AND json_extract(value,'$.id')=?)").bind(rate.id,rate.hourlyMinor,rate.travelMinor,rate.currency,now,m.user_id,rate.id)
 ]);if(!result[0].meta.changes)fail(409,'Sazby mezitím změnilo jiné zařízení. Obnovte je.');return json(await readWorkRates(env));
}
