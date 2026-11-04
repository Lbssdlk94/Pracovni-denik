// Isolated native UI-test fixture. No production requests or credentials.
document.body.className='shell';document.body.innerHTML='<div id=app><main class=main>Testovací deník</main></div>';
const screens=createNativeScreens({db:{session:()=>fixture.context,offlineSession:async()=>fixture.context},getSession:()=>fixture.context});
window.__workDiaryNative={execute:async(command,payload={})=>{
 if(command==='screen')return screens.snapshot();
 if(command==='control')return screens.action(payload);
 if(command==='asset')return screens.asset(payload);
 if(command==='context'){
  if(document.querySelector('#fixture-form'))throw Object.assign(Error('Nejdříve uložte nebo zavřete otevřený formulář ve webové části.'),{code:'native_form_open'});
  return fixture.context;
 }
 if(command==='overview')return {jobs:fixture.jobs,nextCursor:null};
 if(command==='jobs'){
  const rows=fixture.jobs.filter(j=>(!payload.state||payload.state==='all'||j.status===payload.state)&&(!payload.q||[j.title,j.customerName,j.address].join(' ').toLowerCase().includes(payload.q.toLowerCase())));
  const start=payload.cursor?Number(payload.cursor):0;return {jobs:rows.slice(start,start+2),nextCursor:rows.length>start+2?String(start+2):null};
 }
 if(command==='job')return {job:fixture.jobs.find(j=>j.id===payload.id),defects:fixture.defects};
 if(command==='open'){
  document.querySelector('#app').innerHTML='<main class=main><h1>Webová část – izolovaný test</h1><form id="fixture-form"><label>Poznámka <input aria-label="Poznámka"></label><button type="button" onclick="this.closest(\'form\').remove()">Zavřít formulář</button></form></main>';
  document.querySelector('#app .main').insertAdjacentHTML('beforeend','<p>Engine visibility: '+document.visibilityState+'</p>');
  return {opened:true};
 }
 throw Error('Unsupported isolated fixture operation');
}};
setTimeout(()=>window.webkit.messageHandlers.workDiaryState.postMessage({type:'ready'}),250);

let fixturePaintTimer;new MutationObserver(()=>{clearTimeout(fixturePaintTimer);fixturePaintTimer=setTimeout(()=>window.webkit.messageHandlers.workDiaryState.postMessage({type:'screen'}),80);}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden','disabled','style']});
