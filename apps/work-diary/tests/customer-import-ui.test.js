import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('web/assistant-ui.js','utf8');
const askSource=source.slice(source.indexOf('async function ask('),source.indexOf('\nfunction bindOnline('));
function fixture(){
  let session={user:{id:'admin',role:'admin'},installation:{id:'site-one'}};
  const thread={items:[],context:null},timers=[],calls=[],responses=[];
  const runtime={generation:0,busy:false,mode:'basic'};
  const context=vm.createContext({runtime,navigator:{onLine:true},setTimeout:fn=>timers.push(fn),scopeOf:s=>s.installation.id+':'+s.user.id,
    ensureThread:()=>thread,current:()=>thread,push:(s,role,text,extra={})=>thread.items.push({role,text,...extra}),persist:()=>{},
    clearConcept:t=>{for(const item of t.items)delete item.confirm;},discardConcept:()=>{},adoptConcept:()=>{},
  });vm.runInContext(askSource,context);
  const api={getSession:()=>session,db:{request:async(path,options)=>{calls.push(JSON.parse(options.body));return responses.shift();}},onChanged:()=>{}};
  return {ask:(...args)=>context.ask('',api,()=>{},...args),thread,timers,calls,responses,context,changeScope:()=>{session={...session,installation:{id:'site-two'}};},changeRole:()=>{session={...session,user:{...session.user,role:'worker'}};}};
}
const next={reply:'5 / 10',confirm:{id:'next',title:'Pokračovat v importu'},continueImport:true,importProgress:{processed:5,total:10,done:false},mutated:'customers'};
test('One explicit confirmation drives chunks and retains a recovery button until completion',async()=>{
  const f=fixture();f.responses.push(next,{reply:'10 / 10',importProgress:{processed:10,total:10,done:true},mutated:'customers'});
  await f.ask('initial');assert.equal(f.thread.items.at(-1).confirm.id,'next');assert.equal(f.timers.length,1);
  f.timers.shift()();await new Promise(setImmediate);
  assert.deepEqual(f.calls.map(c=>c.confirmId),['initial','next']);assert.equal(f.thread.items.at(-1).confirm,undefined);assert.equal(f.timers.length,0);
});
test('Automatic continuation stops after role change, scope change or loss of connection',async()=>{
  for(const change of [f=>f.changeRole(),f=>f.changeScope(),f=>{f.context.navigator.onLine=false;},f=>{f.context.runtime.generation++;}]){
    const f=fixture();f.responses.push(next);await f.ask('initial');change(f);f.timers.shift()();await new Promise(setImmediate);assert.equal(f.calls.length,1);assert.equal(f.thread.items.at(-1).confirm.id,'next');
  }
});
test('An unconfirmed attachment never begins automatic writes',async()=>{
  const f=fixture();f.responses.push({reply:'Náhled',confirm:{id:'initial'},continueImport:true,importProgress:{done:false}});await f.ask(null,null,{name:'z.csv',text:'Jméno;Adresa\nNovák;Lesní 1'});assert.equal(f.timers.length,0);assert.equal(f.calls[0].confirmId,undefined);
});
