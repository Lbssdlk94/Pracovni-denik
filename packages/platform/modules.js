// Shared platform rules. No tenant data, credentials or hosting API calls.
import {FEATURE_OPTIONS} from '../../apps/work-diary/web/features.js';
export const MODULE_CATALOG=Object.freeze(FEATURE_OPTIONS.filter(f=>!f.licenseParent&&!f.controlOnly).map(f=>Object.freeze({key:f.key,name:f.label,dependencies:Object.freeze([...(f.requires||[])]),ownerOnly:!!f.ownerOnly})));
const moduleByKey=new Map(MODULE_CATALOG.map(m=>[m.key,m]));
export function moduleSelection(value,label='Moduly'){
 if(!Array.isArray(value)||value.length>MODULE_CATALOG.length)throw Error(label+': očekává se seznam známých modulů.');
 if(value.some(k=>typeof k!=='string'||!moduleByKey.has(k)))throw Error(label+': neznámý nebo neimplementovaný modul.');
 if(new Set(value).size!==value.length)throw Error(label+': modul je uveden vícekrát.');
 return [...value];
}
export function validateModuleDependencies(value){const keys=moduleSelection(value),selected=new Set(keys);for(const key of keys)for(const dependency of moduleByKey.get(key).dependencies)if(!selected.has(dependency))throw Error('Modul '+key+' vyžaduje '+dependency+'.');return keys;}
// Every licensing layer is explicit. Omitting one cannot silently grant access.
export function resolveModulePolicy({profession,plan,company,rollout,preferences={}}){
 const layers={profession:new Set(moduleSelection(profession,'Profese')),plan:new Set(moduleSelection(plan,'Tarif')),company:new Set(moduleSelection(company,'Firma')),rollout:new Set(moduleSelection(rollout,'Řízené nasazení'))},memo=new Map(),reasons={};
 function allowed(key,visiting=new Set()){
  if(memo.has(key))return memo.get(key);if(visiting.has(key))throw Error('Cyklická závislost modulů.');
  let reason=Object.entries(layers).find(([,keys])=>!keys.has(key))?.[0];if(!reason&&preferences[key]===false)reason='company_preference';
  if(!reason){const next=new Set([...visiting,key]);for(const dep of moduleByKey.get(key).dependencies)if(!allowed(dep,next)){reason='dependency:'+dep;break;}}
  if(reason)reasons[key]=reason;memo.set(key,!reason);return !reason;
 }
 const enabled=Object.fromEntries(MODULE_CATALOG.map(m=>[m.key,allowed(m.key)]));return {enabled,reasons};
}
export function roleCanUseModule(key,role,policy){const m=moduleByKey.get(key);return !!m&&policy?.enabled?.[key]===true&&['owner','administrator','admin','worker','reader'].includes(role)&&(!m.ownerOnly||role==='owner');}

// Commercial module and all dependencies, in dependency order.
export function moduleClosure(key){
 if(!moduleByKey.has(key))throw Error('Vyberte známý hlavní modul.');
 const result=new Set();const visit=k=>{if(result.has(k))return;for(const dep of moduleByKey.get(k).dependencies)visit(dep);result.add(k);};visit(key);return [...result];
}
