// Isolated native UI-test fixture. No production requests or credentials.
document.body.className='shell';document.body.innerHTML='<div id=app><main class=main>Testovací deník</main></div>';
const screens=createNativeScreens({db:{session:()=>fixture.context,offlineSession:async()=>fixture.context},getSession:()=>fixture.context});
window.__workDiaryNative={execute:async(command,payload={})=>{
 if(command==='nativePush')return {configured:false,enabled:true,missing:['APNS_TEAM_ID','APNS_KEY_ID','APNS_PRIVATE_KEY','APNS_BUNDLE_ID'],userId:fixture.context.user.id,registered:false};
 if(command==='screen')return screens.snapshot();
 if(command==='control')return screens.action(payload);
 if(command==='asset')return screens.asset(payload);
 if(command==='context'){
  if(document.querySelector('#fixture-form,dialog[open]'))throw Object.assign(Error('Nejdříve uložte nebo zavřete otevřený formulář ve webové části.'),{code:'native_form_open'});
  return fixture.context;
 }
 if(command==='overview')return {jobs:fixture.jobs,nextCursor:null};
 if(command==='jobs'){
  const rows=fixture.jobs.filter(j=>(!payload.state||payload.state==='all'||j.status===payload.state)&&(!payload.q||[j.title,j.customerName,j.address].join(' ').toLowerCase().includes(payload.q.toLowerCase())));
  const start=payload.cursor?Number(payload.cursor):0;return {jobs:rows.slice(start,start+2),nextCursor:rows.length>start+2?String(start+2):null};
 }
 if(command==='job')return {job:fixture.jobs.find(j=>j.id===payload.id),defects:fixture.defects};
 if(command==='open'){
  if(['customers','attendance','home','settings'].includes(payload.page)){fixturePage(payload.page);return {opened:true};}
  if(payload.action==='protocol'||payload.action==='depart'){
   const protocol=payload.action==='protocol',title=protocol?'Servisní protokol':'Jsem na cestě';
   const markup=protocol?'<label>Provedené práce<textarea id="fixture-work" aria-label="Provedené práce"></textarea></label><label>Datum<input id="fixture-date" type="date" value="2026-11-05"></label>':'<label>Přesný čas příjezdu<input id="fixture-arrival" type="time" aria-label="Přesný čas příjezdu" value="" required></label>';
   document.querySelector('#app').innerHTML='<main class="main"><h1>Zakázka</h1><p>Podrobnosti návštěvy</p></main><dialog open id="fixture-dialog"><header><h2>'+title+'</h2><button type="button" data-close aria-label="Zavřít">×</button></header><form id="fixture-form">'+markup+'<div class="modal-actions"><button type="submit" class="primary">Uložit</button></div></form></dialog>';
   document.querySelector('[data-close]').onclick=()=>document.querySelector('#fixture-dialog').remove();document.querySelector('#fixture-form').onsubmit=e=>{e.preventDefault();document.querySelector('#fixture-dialog').remove();};
   return {opened:true};
  }
  document.querySelector('#app').innerHTML='<main class=main><h1>Webová část – izolovaný test</h1><form id="fixture-form"><label>Poznámka <input aria-label="Poznámka"></label><button type="button" onclick="this.closest(\'form\').remove()">Zavřít formulář</button></form></main>';
  document.querySelector('#app .main').insertAdjacentHTML('beforeend','<p>Engine visibility: '+document.visibilityState+'</p>');
  return {opened:true};
 }
 throw Error('Unsupported isolated fixture operation');
}};
setTimeout(()=>window.webkit.messageHandlers.workDiaryState.postMessage({type:'ready'}),250);

let fixturePaintTimer;new MutationObserver(()=>{clearTimeout(fixturePaintTimer);fixturePaintTimer=setTimeout(()=>window.webkit.messageHandlers.workDiaryState.postMessage({type:'screen'}),80);}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden','disabled','style']});

function fixturePage(page){
 const main=markup=>{document.querySelector('#app').innerHTML='<main class="main">'+markup+'</main>';};
 if(page==='customers'){
  main('<section id="customers"><h1>Zákazníci</h1><button id="fixture-new-customer" type="button">Nový zákazník</button><article class="customer-compact"><button data-customer-open="customer-one"><strong>Pavel Svoboda</strong><span aria-hidden="true">›</span></button><a href="tel:+420777123456" aria-label="Zavolat Pavel Svoboda">Zavolat</a></article></section>');
  document.querySelector('[data-customer-open]').onclick=()=>{
   document.querySelector('#app').insertAdjacentHTML('beforeend','<dialog open><header><h2>Zákazník</h2><button data-close type="button">Zavřít</button></header><div data-customer-view="customer-one"><section class="customer-contact"><h3>Pavel Svoboda</h3><p>Ukázková 12, Blatná</p><a href="tel:+420777123456">777 123 456</a></section><section class="customer-gardens"><h3>Zahrady</h3><button id="fixture-gardens">Otevřít zahrady</button></section></div></dialog>');
   document.querySelector('[data-close]').onclick=()=>document.querySelector('dialog').remove();document.querySelector('#fixture-gardens').onclick=()=>fixturePage('home');
  };
  document.querySelector('#fixture-new-customer').onclick=()=>{
   main('<h1>Nový zákazník</h1><form id="fixture-form"><label>Poznámka<input aria-label="Poznámka"></label><button type="button" id="fixture-cancel">Zavřít formulář</button></form><p>Engine visibility: '+document.visibilityState+'</p>');
   document.querySelector('#fixture-cancel').onclick=()=>document.querySelector('#fixture-form').remove();
  };
 }else if(page==='home'){
  main('<h1>Zahrady</h1><div class="garden-sort"><button>Podle názvu</button><button>Nejbližší</button><p>Vzdálenost vzdušnou čarou</p><a href="https://photon.komoot.io">Photon</a></div><div class="garden-grid"><button class="garden-card" data-garden="garden-one"><strong>Pavel Svoboda</strong><small>Ukázková 12, Blatná, Česká republika</small><span class="garden-distance">≈ 12 km</span><div class="garden-meta">2 šachty Bez plánu</div></button><button class="garden-card" data-garden="garden-two"><strong>Rodinná zahrada s dlouhým názvem</strong><small>Jiná 8, Písek</small><div class="garden-meta">0 šachet</div></button></div>');
  for(const button of document.querySelectorAll('[data-garden]'))button.onclick=()=>{
   const name=button.querySelector('strong').textContent;
   main('<button data-action=all-gardens>Všechny zahrady</button><div class="garden-title"><h1>'+name+'</h1><p>Ukázková 12, Blatná</p><button>Upravit zahradu</button></div><section class="garden-customer-link"><button>Kontakt na zákazníka</button></section><details><summary>Technické údaje</summary><p>Typ čerpadla</p></details><nav class="garden-tabs"><button data-garden-tab="history" aria-controls="garden-panel-history"><span>Historie</span></button><button data-garden-tab="shafts" aria-controls="garden-panel-shafts"><span>Šachty</span></button></nav><section data-garden-panel="history" id="garden-panel-history"><p>Poslední návštěva</p></section><section data-garden-panel="shafts" id="garden-panel-shafts" hidden><p>Fotografie šachet</p></section>');
   document.querySelector('[data-action=all-gardens]').onclick=()=>fixturePage('home');
   for(const tab of document.querySelectorAll('[data-garden-tab]'))tab.onclick=()=>{for(const panel of document.querySelectorAll('[data-garden-panel]'))panel.hidden=panel.dataset.gardenPanel!==tab.dataset.gardenTab;};
  };
 }else if(page==='attendance'){
  main('<h1>Docházka</h1><article><h2>Dnešní den</h2><p>08:00–16:00</p></article>');
 }else if(page==='settings'){
  main('<div class="settings-workspace"><div class="page-title"><h1>Nastavení</h1></div><section class="storage-card"><h2>Účet a přihlášení</h2><button>Změnit přihlášení</button></section><section class="storage-card"><h2>Upozornění</h2><label><input type="checkbox">Upozornění na nové zakázky</label></section><section class="storage-card"><h2>Firma a fakturace</h2><label>Název firmy<input value="Dr. Závlaha"></label></section><section class="storage-card"><h2>Integrace</h2><button>Připojené služby</button></section><section class="storage-card"><h2>Zálohy a data</h2><button>Vytvořit zálohu</button></section></div>');
 }
}
