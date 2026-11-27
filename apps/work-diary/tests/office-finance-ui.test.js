import test from 'node:test';import assert from 'node:assert/strict';import {createOfficeFinanceUI} from '../web/office-finance-ui.js';
test('Finance starts with four summaries and separate workspaces, and never offers management controls to staff',()=>{
 let session={permissions:{manage:true},user:{id:'owner',role:'owner'}};
 const data={items:[],records:[],report:{monthly:{'2026-12':{income:100000,expense:50000}},receivables:30000,payables:40000,forecast:{},byDiscipline:{},jobResults:[]}};
 const ui=createOfficeFinanceUI({db:{},getSession:()=>session,getData:()=>data,getOptions:()=>({}),getMonth:()=>'2026-12',onPaint(){},esc:v=>String(v??'')});
 const html=ui.markup();assert.match(html,/Přijato v měsíci/);assert.match(html,/Zaplaceno v měsíci/);assert.match(html,/Zákazníci mají zaplatit/);assert.match(html,/Firma má zaplatit/);assert.equal((html.match(/data-finance-view=/g)||[]).length,6);
 session={permissions:{manage:false},user:{id:'worker',role:'worker'}};assert.equal(ui.markup(),'');data.items=[{id:'own-advance',kind:'advance',status:'active',data:{title:'Moje záloha',givenMinor:10000,spentMinor:0,returnedMinor:0}}];data.pendingExpenses=[{id:'my-expense',title:'Koupené ventily',actualMinor:5000,paidOn:'2026-12-02'}];const personal=ui.markup({personal:true});assert.match(personal,/data-finance-report="own-advance"/);assert.match(personal,/Koupené ventily/);assert.match(personal,/Čeká na schválení/);assert.doesNotMatch(personal,/data-finance-action=/);assert.match(personal,/Moje nákupní zálohy/);assert.doesNotMatch(personal,/data-finance-new|data-finance-export|Zákazníci mají zaplatit/);
});

test('Job finances list invoices even when their job has no financial card',()=>{
 const data={items:[{id:'bill',kind:'bill',jobId:'job-without-card',jobTitle:'Zahrada Novák',status:'open',data:{invoice:{number:'FV-1'},counterparty:'Novák',amountMinor:10000}}],records:[],report:{jobResults:[]}};
 const ui=createOfficeFinanceUI({db:{},getSession:()=>({permissions:{manage:true},user:{id:'owner',role:'owner'}}),getData:()=>data,getOptions:()=>({}),getMonth:()=>'2026-12',onPaint(){},esc:v=>String(v??'')});
 const tab={dataset:{financeView:'contracts'}};ui.bind({querySelector(){return null;},querySelectorAll(selector){return selector==='[data-finance-view]'?[tab]:[];}});tab.onclick();const html=ui.markup();assert.match(html,/FV-1/);assert.match(html,/Zahrada Novák/);assert.match(html,/data-finance-invoices="job-without-card"/);assert.match(html,/PDF chybí/);
});
