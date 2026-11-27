import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamOfficeUI} from '../web/team-office-ui.js';
test('The personal UI has no financial controls and discards a late response from a different account',async()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 globalThis.window={addEventListener(){}};globalThis.document={addEventListener(){},querySelector(){return null;}};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 try{
  let session={user:{id:'owner',role:'owner'},permissions:{manage:true}},resolveRecords;
  const pending=new Promise(resolve=>{resolveRecords=resolve;});
  const ui=createTeamOfficeUI({db:{request:async path=>path.includes('/options')?{jobs:[],members:[],disciplineChoices:['irrigation']}:path.includes('/summary')?{income:123456,categories:{},days:{}}:path.includes('/availability')?{absences:[]}:pending},getSession:()=>session,esc:v=>String(v??'').replaceAll('<','&lt;'),showModal(){},modal:{querySelector(){return null;}},toast(){}});
  assert.match(ui.markup(),/<h1>Finance<\/h1>/);assert.doesNotMatch(ui.markup(),/data-office-tab="leave"/);assert.match(ui.markup(),/data-office-tab="money"/);
  const flight=ui.refresh();
  session={user:{id:'reader',role:'reader'},permissions:{manage:false}};
  resolveRecords({records:[{id:'private',kind:'leave',ownerId:'owner',ownerName:'TAJNÝ PRACOVNÍK',status:'pending',data:{startAt:1800000000000,endAt:1800010000000,type:'personal'},version:1}]});
  await flight;const html=ui.markup();assert.doesNotMatch(html,/data-office-tab="money"|TAJNÝ PRACOVNÍK|Nákupní seznam|Přidat příjem/);assert.equal(html,'');
  const attendance=createTeamOfficeUI({context:'attendance',db:{},getSession:()=>session,esc:String,showModal(){},modal:{querySelector(){return null;}},toast(){}});assert.match(attendance.markup(),/Žádosti o volno/);assert.doesNotMatch(attendance.markup(),/data-office-tab=|Moje zálohy/);
  session={user:{id:'owner',role:'owner'},permissions:{manage:true}};assert.match(attendance.markup(),/Schvalování nepřítomnosti/);assert.doesNotMatch(attendance.markup(),/data-office-new|data-office-tab="money"/);
  session={user:{id:'worker',role:'worker'},permissions:{manage:false}};assert.match(ui.markup(),/Moje zálohy/);assert.doesNotMatch(ui.markup(),/data-office-tab="leave"/);
  session={user:{id:'owner',role:'owner'},permissions:{manage:true},rolePreview:{active:true}};assert.match(ui.markup(),/V náhledu role se tato evidence nezobrazuje/);
 }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;}
});
