import {MODULE_CATALOG,moduleSelection,validateModuleDependencies} from './modules.js';
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Error('Zkontrolujte '+label+'.');return value.trim();};
const LABEL_KEYS=new Set(['site','sites','service','services','installation','survey']);
export function professionVersion(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Chybí profesní šablona.');
 const id=text(value.id,80,'ID šablony');if(!/^[a-z][a-z0-9-]*$/.test(id))throw Error('Neplatné ID šablony.');if(!Number.isSafeInteger(value.version)||value.version<1)throw Error('Neplatná verze šablony.');
 const allowed=validateModuleDependencies(value.allowed),defaults=validateModuleDependencies(value.defaults);if(defaults.some(key=>!allowed.includes(key)))throw Error('Výchozí modul není profesí povolený.');
 const labels={};if(!value.labels||typeof value.labels!=='object'||Array.isArray(value.labels))throw Error('Chybí názvosloví.');for(const [key,v] of Object.entries(value.labels)){if(!LABEL_KEYS.has(key))throw Error('Neznámý název v šabloně.');labels[key]=text(v,80,'názvosloví');}if(!labels.site||!labels.sites)throw Error('Doplňte názvy místa realizace.');
 return {id,version:value.version,name:text(value.name,120,'název profese'),labels,allowed:moduleSelection(allowed),defaults:moduleSelection(defaults)};
}
const all=MODULE_CATALOG.map(m=>m.key),general=all.filter(k=>!['shafts','map','zoneManagement','pictureExport','search','demo','blowout','pump'].includes(k));
const make=(id,name,site,sites,allowed=general,defaults=allowed)=>professionVersion({id,name,version:1,labels:{site,sites,service:'Servis',services:'Servisní zásahy',installation:'Realizace',survey:'Zaměření'},allowed,defaults});
export const DEFAULT_PROFESSIONS=Object.freeze([
 make('irrigation','Závlahář','Zahrada','Zahrady',all),
 make('electrician','Elektrikář','Objekt','Objekty'),
 make('plumber','Instalatér','Objekt','Objekty'),
 make('carpenter','Truhlář','Místo realizace','Místa realizace'),
 make('gardener','Zahradník','Zahrada','Zahrady',all,general),
 make('universal','Univerzální pracovní deník','Místo realizace','Místa realizace')
]);
