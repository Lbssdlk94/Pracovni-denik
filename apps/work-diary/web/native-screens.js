// Native screen contract: SwiftUI renders controls; the existing domain/client
// logic owns validation, role gates, version checks, drafts and offline outboxes.
// Opaque handles are bound to live DOM nodes, never arbitrary JS or API paths.
export function createNativeScreens({db,getSession,captureDrafts=()=>[]}){
 let serial=0,revision=0,gestureAt=0,pendingFile=null,fileBuilder=null,preparedFiles=[],locked=false,boundIdentity=null;const ids=new WeakMap(),nodes=new Map(),maps=new Map(),assets=new Map(),objectBlobs=new Map();
 const id=node=>{if(!ids.has(node)){const key='n'+(++serial);ids.set(node,key);nodes.set(key,node);}return ids.get(node);};
 const text=node=>String(node?.textContent||'').replace(/\s+/g,' ').trim();
 const visible=node=>{for(let el=node.nodeType===1?node:node.parentElement;el;el=el.parentElement){const style=getComputedStyle(el);if(el.hidden||style.display==='none'||style.visibility==='hidden'||style.opacity==='0'||el.getAttribute('aria-hidden')==='true')return false;if(el.tagName==='DETAILS'&&!el.open&&el!==node&&!el.querySelector(':scope > summary')?.contains(node))return false;}return true;};
 const live=key=>{const n=nodes.get(key);if(!n?.isConnected)throw Error('Obrazovka se změnila. Obnovte ji před další úpravou.');return n;};
 const notify=()=>globalThis.webkit?.messageHandlers?.workDiaryState?.postMessage({type:'screen'});
 const permitted=async()=>{if(locked)throw Error('Přístup se změnil. Neodeslanou práci nejdříve zabezpečte a obnovte aplikaci.');const s=db.session();const identity=s?.user?JSON.stringify([s.user.id,s.user.role,s.workspace?.authorizationVersion,s.features]):null;if(boundIdentity&&identity!==boundIdentity){locked=true;nodes.clear();assets.clear();throw Error('Přístup se změnil. Obnovte aplikaci.');}if(identity)boundIdentity=identity;if(!s?.user){if(document.querySelector('.shell'))throw Error('Obnovte přihlášení.');return;}if(!navigator.onLine&&!await db.offlineSession())throw Error('Platnost offline přístupu vypršela. Připojte se a ověřte účet.');};
 function mapProxy(){if(!globalThis.L||L.map.__nativeScreens)return;const factory=L.map;const wrapped=(...args)=>{const map=factory(...args);maps.set(map.getContainer(),map);return map;};wrapped.__nativeScreens=true;L.map=wrapped;}
 mapProxy();
 for(const event of ['workspace-access-freeze','workspace-access-reset','workspace-recovery-failed'])window.addEventListener(event,()=>{locked=true;nodes.clear();assets.clear();maps.clear();objectBlobs.clear();pendingFile=null;fileBuilder=null;preparedFiles=[];});
 // Keep only original Blob references, never duplicate bytes or relax connect-src.
 // blob: fetch is correctly blocked by the web CSP on some WebKit/Chromium builds.
 const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
 URL.createObjectURL=blob=>{const url=createURL(blob);objectBlobs.set(url,blob);return url;};
 URL.revokeObjectURL=url=>{objectBlobs.delete(String(url).split('#')[0]);return revokeURL(url);};
 const originalFileClick=HTMLInputElement.prototype.click;
 HTMLInputElement.prototype.click=function(){if(this.type==='file'&&Date.now()-gestureAt<30000){fileBuilder=null;preparedFiles=[];pendingFile={id:id(this),label:this.closest('label')?text(this.closest('label')):'Vybrat soubor',accept:this.accept,multiple:this.multiple,camera:!!this.capture};notify();return;}return originalFileClick.call(this);};
 function label(el){if(el.getAttribute('aria-label'))return el.getAttribute('aria-label');if(el.labels?.length)return [...el.labels].map(l=>{const copy=l.cloneNode(true);copy.querySelectorAll('input,textarea,select,svg').forEach(n=>n.remove());return text(copy);}).filter(Boolean).join(' ');return el.title||el.placeholder||el.name||el.id||'Údaj';}
 function read(el,path='r',deep=false,plain=false){
  if(el.nodeType===3){if(!visible(el))return [];const value=text(el);return value?[{id:path,handle:id(el),kind:'text',text:value}]:[];}
  if(el.nodeType!==1||['SCRIPT','STYLE','NOSCRIPT','SVG','PATH','OPTION'].includes(el.tagName)||!visible(el))return [];
  const tag=el.tagName,handle=id(el),base={id:el.id?'id:'+el.id:path,handle};
  if(el.matches('.sidebar,.topbar,.nav,.mobile-account'))return [];
  // Semantic presentation for the native app only. Every destination still
  // invokes the same live element; no records are joined by display text.
  const category=(title,children,symbol='folder',key=base.id)=>({id:key,handle,kind:'category',text:title,symbol,children});
  if(!plain&&el.matches('.garden-card-wrap')){
   const card=el.querySelector('.garden-card[data-garden]');if(card){const row=read(card,path+'.garden')[0];const address=el.querySelector('[data-address-garden]');if(row&&address)row.children.push(...read(address,path+'.location').map(n=>({...n,intent:'locate'})));return row?[row]:[];}
  }
  if(!plain&&el.matches('.garden-card[data-garden]')){
   return [{...base,id:'garden:'+el.dataset.garden,kind:'destination',text:text(el.querySelector(':scope > strong')),subtitle:text(el.querySelector('.garden-distance:not(.unknown)')),symbol:'leaf',children:read(el,path,deep,true)}];
  }
  if(!plain&&el.matches('.customer-compact')){
   const open=el.querySelector('[data-customer-open]');if(open){const name=open.querySelector('strong')?.cloneNode(true);name?.querySelectorAll('span,svg').forEach(n=>n.remove());return [{...base,id:'customer:'+open.dataset.customerOpen,handle:id(open),kind:'contact',text:text(name)||text(open),symbol:'person',children:[...el.querySelectorAll('[data-customer-open],a[href^="tel:"]')].flatMap((n,i)=>read(n,path+'.'+i,deep,true))}];}
  }
  if(!plain&&el.matches('.garden-sort'))return [category('Řazení a poloha',read(el,path,deep,true),'location')];
  if(!plain&&el.matches('.garden-title')){
   const heading=el.querySelector('h1'),contact=el.parentElement.querySelector('.garden-customer-link');
   const info=[...el.querySelectorAll('p,button')].flatMap((n,i)=>read(n,path+'.info'+i));
   return [...(heading?read(heading,path+'.title'):[]),category('Kontakt a adresa',[...info,...(contact?read(contact,path+'.contact',deep,true):[])],'person.crop.rectangle')];
  }
  if(!plain&&el.matches('.garden-customer-link')&&el.parentElement.querySelector('.garden-title'))return [];
  if(!plain&&el.matches('.garden-tabs'))return [...el.querySelectorAll('[data-garden-tab]')].map((button,i)=>{
   const key=button.dataset.gardenTab,panel=document.getElementById(button.getAttribute('aria-controls'));
   const names={shafts:'Šachty a fotodokumentace',history:'Historie',defects:'Závady',service:'Servis',blowout:'Vyfukování',plan:'Plán zahrady',map:'Mapa'};
   const symbols={shafts:'photo',history:'clock.arrow.circlepath',defects:'exclamationmark.triangle',service:'wrench',blowout:'wind',plan:'map',map:'mappin'};
   return category(names[key]||text(button.querySelector('span')), [...read(button,path+'.tab'+i),...(panel?read(panel,path+'.panel'+i,deep,true):[])],symbols[key]||'folder','garden-section:'+key);
  });
  if(!plain&&el.matches('[data-garden-panel]')&&el.parentElement.querySelector('.garden-tabs'))return [];
  if(!plain&&el.matches('.settings-workspace'))return [...el.children].flatMap((child,i)=>{
   if(!visible(child))return [];
   if(child.matches('.page-title'))return [...child.querySelectorAll('h1')].flatMap(n=>read(n,path+'.title'));
   const title=text(child.querySelector('h2,h3,summary'))||'Další nastavení';
   return [category(title,read(child,path+'.setting'+i,deep,true),'gearshape',child.id?'settings:'+child.id:path+'.setting'+i)];
  });
  if(!plain&&el.matches('.customer-contact,.customer-gardens'))return [category(el.matches('.customer-contact')?'Kontakt a adresa':text(el.querySelector('h3'))||'Zahrady',read(el,path,deep,true),el.matches('.customer-contact')?'person.crop.rectangle':'leaf')];
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'){
   if(['hidden','file','submit','button','reset'].includes(el.type))return [];
   return [{...base,kind:el.type==='checkbox'||el.type==='radio'?'toggle':tag==='SELECT'?'select':'field',text:label(el),value:el.value,checked:!!el.checked,disabled:el.matches(':disabled')||el.readOnly,fieldType:tag==='TEXTAREA'?'textarea':el.type||'text',autocomplete:el.autocomplete||'',required:el.required,options:tag==='SELECT'?[...el.options].map(o=>({id:o.value,text:o.text,disabled:o.disabled,selected:o.selected})):[],multiple:!!el.multiple,secure:el.type==='password'||el.id==='access-link'}];
  }
  if(tag==='LABEL'&&el.querySelector('input[type=file]')){const file=el.querySelector('input[type=file]');return [{...base,handle:id(file),kind:'file',text:text(el)||'Vybrat soubor',disabled:file.disabled}];}
  if(tag==='LABEL'&&el.querySelector('input,select,textarea'))return [...el.children].flatMap((c,i)=>read(c,path+'.'+i,deep));
  if(tag==='BUTTON'||tag==='A'||el.getAttribute('role')==='button')return [{...base,kind:'button',text:el.getAttribute('aria-label')||text(el)||el.title||(el.matches('[data-close]')?'Zavřít':'Otevřít'),disabled:!!el.disabled,danger:el.matches('.danger,[class*=delete]'),primary:el.classList.contains('primary'),intent:el.matches('[data-close]')?'dismiss':el.type==='submit'?'submit':el.href?.startsWith('tel:')?'call':el.matches('[data-job-navigate],[data-navigate]')?'navigate':el.matches('[data-customer-new],[data-job-new],[data-garden-new]')?'add':el.matches('[data-job-open],[data-customer-open]')?'open':null}];
  if(/^H[1-6]$/.test(tag))return [{...base,kind:'heading',text:text(el),level:Number(tag[1])}];
  if(tag==='DETAILS'){
   const summary=el.querySelector(':scope > summary');return [{...base,kind:'disclosure',text:text(summary),expanded:el.open,children:[...el.childNodes].filter(n=>n!==summary).flatMap((n,i)=>read(n,path+'.'+i,true))}];
  }
  const map=maps.get(el);
  if(map){const center=map.getCenter(),pins=[],paths=[];let i=0;map.eachLayer(layer=>{if(layer instanceof L.Marker){const p=layer.getLatLng();pins.push({id:String(i++),handle:id(layer.getElement()||el),latitude:p.lat,longitude:p.lng,text:layer.options.title||layer.getPopup()?.getContent()?.textContent||'Místo'});}else if(layer instanceof L.Polyline){const add=line=>{if(line[0]?.lat!==undefined)paths.push({id:'p'+paths.length,points:line.map(p=>({latitude:p.lat,longitude:p.lng}))});else for(const part of line)add(part);};add(layer.getLatLngs());}});return [{...base,kind:'map',text:el.getAttribute('aria-label')||'Mapa',latitude:center.lat,longitude:center.lng,zoom:map.getZoom(),pins,paths,children:[...el.querySelectorAll('.leaflet-popup-content')].flatMap((n,i)=>read(n,path+'.p'+i))}];}
  if(tag==='CANVAS')return [{...base,kind:'canvas',text:el.getAttribute('aria-label')||'Podpis',width:el.width,height:el.height,disabled:getComputedStyle(el).pointerEvents==='none'}];
  if(el.matches('.photo-wrap,.plan-photo')){
   const img=el.querySelector('img');if(img){const lines=[...el.querySelectorAll('svg line')].map((n,i)=>({id:'line'+i,x1:Number(n.getAttribute('x1'))/1000,y1:Number(n.getAttribute('y1'))/1000,x2:Number(n.getAttribute('x2'))/1000,y2:Number(n.getAttribute('y2'))/1000,color:n.getAttribute('stroke')}));const pins=[...el.querySelectorAll('[data-marker],[data-plan-shaft],.marker-dot,.marker-label')].filter(n=>n.style.left&&n.style.top).map(n=>({id:id(n),handle:id(n),x:parseFloat(n.style.left)/100,y:parseFloat(n.style.top)/100,text:text(n)||'•',color:n.style.getPropertyValue('--marker')}));return [{...base,kind:'picture',text:img.alt||'Fotografie',imageHandle:id(img),width:img.naturalWidth||1000,height:img.naturalHeight||700,pins,lines,disabled:getSession()?.permissions?.write===false}];}
  }
  if(tag==='IMG')return [{...base,kind:'image',text:el.alt||'Fotografie'}];
  if(tag==='IFRAME'||tag==='OBJECT'||tag==='EMBED')return [{...base,kind:'document',text:el.title||'Zobrazit dokument'}];
  if(tag==='PROGRESS')return [{...base,kind:'progress',text:el.getAttribute('aria-label')||'Průběh',value:String(el.value/el.max)}];
  if(tag==='BR'||tag==='HR')return [];
  if(['P','SMALL'].includes(tag)&&!el.querySelector('input,button,a,select,textarea,[role=button],img,canvas,progress,iframe,object,embed,details')&&[...el.querySelectorAll('*')].every(visible))return [{...base,kind:'text',text:text(el),tone:tag==='SMALL'||el.matches('.mini-empty')?'secondary':null}];
  const children=[...el.childNodes].flatMap((n,i)=>read(n,path+'.'+i,deep));
  if(!children.length)return [];
  if(tag==='FORM')return [{...base,kind:'form',children}];
  if(el.matches('.modal-actions,.actions,.job-card-actions'))return [{...base,kind:'actions',children}];
  const card=el.matches('article,.panel,.storage-card,.note-box,.overview-visit,.garden-folder,.plan-shaft-list');
  return el.matches('.jobs-month-grid')?[{...base,kind:'grid',children}]:card?[{...base,kind:'card',children}]:children;
 }
 async function snapshot(){await permitted();mapProxy();for(const [key,n]of nodes)if(!n.isConnected)nodes.delete(key);for(const [el]of maps)if(!el.isConnected)maps.delete(el);
  const dialogs=[...document.querySelectorAll('dialog[open]')],modal=dialogs.at(-1),root=modal||document.querySelector('#app .main')||document.querySelector('#app');if(!root)return {revision:++revision,title:'Pracovní deník',nodes:[],busy:true};
  const header=modal?[]:[...document.querySelectorAll('[data-workspace-filter],[data-notifications-open],[data-show-sync]')].filter((el,i,all)=>all.findIndex(other=>other.outerHTML===el.outerHTML)===i).flatMap((el,i)=>read(el,'header.'+i));const content=[...header,...read(root)];
  if(!modal&&root.querySelector('.settings-workspace')){const logout=document.querySelector('[data-signout]');if(logout&&visible(logout))content.push({id:'native-account',handle:id(logout),kind:'category',text:'Účet a odhlášení',symbol:'person.crop.circle',children:read(logout,'account.logout')});}
  return {revision:++revision,title:modal?.querySelector('h1,h2,h3')?.textContent?.trim()||document.title||'Pracovní deník',nodes:content,modal:!!modal,presentation:modal?.querySelector('[data-customer-view]')&&!modal.querySelector('form')?'page':null,online:navigator.onLine,file:pendingFile,toast:text(document.querySelector('#toast')),busy:!!root.querySelector('.loading')};
 }
 function pointer(el,points){const rect=(el.closest('.photo-wrap,.plan-photo')||el).getBoundingClientRect();if(!rect.width||!rect.height)throw Error('Obrázek není připravený.');const old=el.setPointerCapture;el.setPointerCapture=()=>{};try{points.forEach((p,i)=>{if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Neplatná poloha.');const event=new PointerEvent(i===0?'pointerdown':i===points.length-1?'pointerup':'pointermove',{bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',isPrimary:true,buttons:i===points.length-1?0:1,clientX:rect.left+p.x*rect.width,clientY:rect.top+p.y*rect.height});el.dispatchEvent(event);});}finally{el.setPointerCapture=old;}}
 async function action(input){await permitted();gestureAt=Date.now();const el=live(input.handle);
  if(input.action==='fileStart'||input.action==='fileChunk'||input.action==='fileFinish'){
   if(el.type!=='file'||pendingFile?.id!==input.handle)throw Error('Výběr souboru se změnil.');
   if(input.action==='fileStart'){if(!Number.isSafeInteger(input.size)||input.size<0||input.size>2147483648)throw Error('Neplatná velikost souboru.');fileBuilder={name:String(input.name||'Soubor'),type:String(input.type||'application/octet-stream'),size:input.size,received:0,chunks:[],index:0};return {ok:true};}
   if(!fileBuilder)throw Error('Přenos souboru nebyl zahájen.');
   if(input.action==='fileChunk'){if(input.index!==fileBuilder.index||typeof input.data!=='string'||input.data.length>800000)throw Error('Neplatné pořadí části souboru.');const binary=atob(input.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(fileBuilder.received+bytes.length>fileBuilder.size)throw Error('Soubor změnil velikost.');fileBuilder.chunks.push(bytes);fileBuilder.received+=bytes.length;fileBuilder.index++;return {ok:true};}
   if(fileBuilder.received!==fileBuilder.size)throw Error('Soubor není přenesený celý.');preparedFiles.push(new File(fileBuilder.chunks,fileBuilder.name,{type:fileBuilder.type}));fileBuilder=null;
   if(input.last){const transfer=new DataTransfer();for(const file of preparedFiles)transfer.items.add(file);preparedFiles=[];pendingFile=null;el.files=transfer.files;el.dispatchEvent(new Event('change',{bubbles:true}));}return {ok:true};
  }
  if(input.action==='value'){
   if(!el.matches('input,select,textarea')||el.disabled||el.readOnly||el.type==='hidden'||el.type==='file')throw Error('Tento údaj nelze upravit.');
   if(el.type==='checkbox'||el.type==='radio')el.checked=!!input.checked;else if(el.tagName==='SELECT'&&el.multiple){for(const option of el.options)option.selected=(input.values||[]).includes(option.value);}else el.value=el.type==='number'?String(input.value??'').replace(',','.'):String(input.value??'');
   el.dispatchEvent(new Event('input',{bubbles:true}));if(input.commit!==false)el.dispatchEvent(new Event('change',{bubbles:true}));
  }else if(input.action==='toggle'){if(el.tagName!=='DETAILS')throw Error('Neplatná sekce.');el.open=!!input.checked;}
  else if(input.action==='draw'){if(!el.matches('canvas,[data-marker],.marker-dot,.marker-label,[data-plan-shaft]'))throw Error('Tento obrázek nelze upravovat.');pointer(el,input.points||[]);}
  else if(input.action==='point'){if(!el.matches('.photo-wrap,.plan-photo'))throw Error('Neplatný podklad.');const r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+input.x*r.width,clientY:r.top+input.y*r.height}));}
  else if(input.action==='map'){
   const map=maps.get(el);if(!map)throw Error('Mapa se změnila.');if(!Number.isFinite(input.latitude)||!Number.isFinite(input.longitude)||Math.abs(input.latitude)>90||Math.abs(input.longitude)>180)throw Error('Neplatné souřadnice.');
   if(input.pin){const pin=live(input.pin);pin.click();}else if(input.select)map.fire('click',{latlng:L.latLng(input.latitude,input.longitude)});else map.setView([input.latitude,input.longitude],input.zoom||map.getZoom(),{animate:false});
  }else if(input.action==='file'){
   if(el.type!=='file'||pendingFile?.id!==input.handle)throw Error('Výběr souboru už není platný.');const transfer=new DataTransfer();
   for(const f of input.files||[]){const binary=atob(f.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));transfer.items.add(new File([bytes],f.name,{type:f.type||'application/octet-stream'}));}
   el.files=transfer.files;pendingFile=null;el.dispatchEvent(new Event('change',{bubbles:true}));
  }else if(input.action==='cancelFile'){pendingFile=null;fileBuilder=null;preparedFiles=[];}
  else if(input.action==='click'){
   if(el.disabled)throw Error('Akce nyní není dostupná.');
   if(el.tagName==='INPUT'&&el.type==='file')el.click();
   else if(el.tagName==='A'&&el.download){el.click();}
   else if(el.tagName==='A'&&(el.href.startsWith('blob:')||(el.target==='_blank'&&new URL(el.href,location.href).origin===location.origin&&new URL(el.href,location.href).pathname.startsWith('/api/'))||/\.(pdf|jpg|png|jpeg)(?:[?#]|$)/i.test(el.href))){assets.set(input.handle,{url:el.href,name:el.download||el.textContent||'Dokument'});return {...await snapshot(),transfer:{id:input.handle,text:el.download||'Dokument'}};}
   else {const form=el.form;if(el.type==='submit'&&form&&!form.checkValidity()){const bad=form.querySelector(':invalid');throw Error((bad?label(bad)+': ':'')+(bad?.validationMessage||'Vyplňte povinné údaje.'));}el.click();}
  }else throw Error('Nepodporovaná akce.');
  await new Promise(resolve=>setTimeout(resolve,40));return snapshot();
 }
 async function asset(input){await permitted();const el=nodes.get(input.handle),remembered=assets.get(input.handle);if(!remembered&&!el?.isConnected)throw Error('Soubor již není dostupný.');
  if(el?.tagName==='CANVAS')return {data:el.toDataURL('image/png').split(',')[1],type:'image/png',name:'podpis.png'};
  const url=remembered?.url||el?.src||el?.data||el?.href;if(!url)throw Error('Soubor chybí.');const parsed=new URL(url,location.href);if(!['blob:','data:'].includes(parsed.protocol)&&parsed.origin!==location.origin)throw Error('Externí dokument otevřete ve své službě.');
  parsed.hash='';let blob=objectBlobs.get(parsed.href);if(!blob){const response=await fetch(parsed.href,{credentials:'same-origin'});if(!response.ok)throw Error('Soubor nelze načíst.');blob=await response.blob();}if(blob.size>32000000)throw Error('Soubor je příliš velký pro mobilní náhled.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});return {data,type:blob.type,name:remembered?.name||'Dokument'};
 }
 return {snapshot,action,asset,flush:async()=>{await permitted();let written=0;for(const entry of captureDrafts()){if(entry.ownerId===db.session()?.user.id){await db.putFormDraft(entry.key,entry.baseVersion,entry.value);written++;}}return {written};}};
}
