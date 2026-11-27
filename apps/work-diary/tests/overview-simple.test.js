import test from 'node:test';
import assert from 'node:assert/strict';
import {overviewVisitMarkup, createOverviewUI} from '../web/overview-ui.js';

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const job={id:'visit',customerName:'Pan <Petřík>',title:'Realizace závlahy',dueDate:'2026-11-24',plannedStart:'13:00',address:'Dřevníky 39'};

test('Appointment progress uses only a valid stored percentage, including zero',()=>{
 for(const percent of [0,65,100]){
  const html=overviewVisitMarkup({...job,completionPercent:percent},esc,'2026-11-24',{mobile:true});
  assert.ok(html.includes('aria-valuenow="'+percent+'"'));
  assert.ok(html.includes(percent+' %'));
  assert.ok(html.includes('Pan &lt;Petřík>'));
 }
 for(const value of [null,undefined,'65',-1,101,NaN]){
  const html=overviewVisitMarkup({...job,completionPercent:value},esc,'2026-11-24',{mobile:true});
  assert.ok(html.includes('Nezadán'));
  assert.ok(!html.includes('role="progressbar"'));
 }
 assert.ok(!overviewVisitMarkup({...job,completionPercent:65},esc,'2026-11-24').includes('overview-visit-progress'));
});

test('Mobile home has four quick links before the visit and no work card or protocol shortcut',()=>{
 const keys=['window','document','navigator','matchMedia'];
 const previous=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
 try{
  for(const [key,value] of Object.entries({window:{addEventListener(){}},document:{addEventListener(){},querySelector(){return null;}},navigator:{onLine:true},matchMedia:()=>({matches:true})}))Object.defineProperty(globalThis,key,{value,configurable:true});
  const ui=createOverviewUI({db:{},esc,getSession:()=>({user:{id:'me',role:'worker'},attendance:{active:true},permissions:{write:true}}),enabled:()=>true,getGardenCount:()=>12});
  const html=ui.markup();
  const admin=createOverviewUI({db:{},esc,getSession:()=>({user:{id:'admin',role:'admin'},attendance:{active:false},permissions:{manage:true}}),enabled:()=>true,getGardenCount:()=>0});assert.doesNotMatch(admin.markup(),/Zaznamenat příchod/);assert.match(admin.markup(),/Přítomnost týmu a žádosti o volno/);
  for(const title of ['Dnešní návštěvy','Zakázky','Docházka','Zákazníci','Nejbližší návštěva'])assert.ok(html.includes(title));
  assert.ok(html.indexOf('overview-links')<html.indexOf('overview-next-heading'));
  assert.ok(!html.includes('field-today'));
  assert.ok(!html.includes('Servisní protokoly'));
  assert.ok(!html.includes('data-overview-protocols'));
 }finally{keys.forEach((key,index)=>previous[index]?Object.defineProperty(globalThis,key,previous[index]):delete globalThis[key]);}
});
