import test from 'node:test';
import assert from 'node:assert/strict';
import {createAttendanceUI} from '../web/attendance-ui.js';

test('Management attendance defaults to the team and shows presence and leave in place of personal timekeeping',async t=>{
 t.mock.method(globalThis,'setInterval',()=>0);
 const previous=globalThis.document;globalThis.document={querySelector(){return null;}};
 try{
  let session={user:{id:'owner-id',role:'owner'},permissions:{manage:true}},paths=[];
  const ui=createAttendanceUI({db:{async request(path){paths.push(path);return {canManage:true,employees:[],shifts:[],summary:[],corrections:[],pendingCorrections:[],presence:[{userId:'worker-id',userName:'Petr Technik',startAt:Date.parse('2026-11-26T06:00:00Z')}],presenceAsOf:Date.parse('2026-11-26T10:00:00Z')};}},esc:String,getSession:()=>session,leaveMarkup:()=>'<section id="attendance-leave">Žádosti o volno</section>'});
  await ui.refresh();assert.match(paths[0],/userId=all/);
  const html=ui.markup();assert.match(html,/Právě v práci/);assert.match(html,/Petr Technik/);assert.match(html,/Žádosti o volno/);assert.match(html,/Aktualizováno/);
  assert.doesNotMatch(html,/id="attendance-arrival"|id="attendance-departure"|Dnes odpracováno|id="attendance-month-total"|data-attendance-leave-request/);
  assert.ok(html.indexOf('attendance-presence')<html.indexOf('attendance-leave'));
  session={user:{id:'reader-id',role:'reader'},permissions:{manage:false}};
  const changed=ui.markup();assert.doesNotMatch(changed,/Petr Technik|Právě v práci/);assert.match(changed,/Dnes odpracováno/);
 }finally{globalThis.document=previous;}
});

test('Staff have a leave shortcut inside the daily and monthly summary, followed by their request history',async t=>{
 t.mock.method(globalThis,'setInterval',()=>0);
 const previous=globalThis.document;globalThis.document={querySelector(){return null;}};
 try{
  let path;const ui=createAttendanceUI({db:{async request(p){path=p;return {canManage:false,shifts:[],summary:[],corrections:[],pendingCorrections:[],overview:{todayMs:7200000,monthMs:36000000}};}},esc:String,getSession:()=>({user:{id:'worker-id',role:'worker'},permissions:{manage:false}}),leaveMarkup:()=>'<section id="attendance-leave">Vlastní žádosti</section>'});
  await ui.refresh();assert.match(path,/userId=worker-id/);
  const html=ui.markup(),counter=html.match(/<section class="attendance-counters"[\s\S]*?<\/section>/)[0];assert.match(counter,/Dnes odpracováno/);assert.match(counter,/Tento měsíc/);assert.match(counter,/data-attendance-leave-request/);assert.match(counter,/2 h 00 min/);assert.match(html,/Moje žádosti o volno/);assert.doesNotMatch(html,/Právě v práci|Schválit opravu/);
 }finally{globalThis.document=previous;}
});
