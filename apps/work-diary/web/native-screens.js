// Native screen contract: SwiftUI renders controls; the existing domain/client
// logic owns validation, role gates, version checks, drafts and offline outboxes.
// Opaque handles are bound to live DOM nodes, never arbitrary JS or API paths.
export function createNativeScreens({db,getSession,captureDrafts=()=>[]}){
 let serial=0,revision=0,gestureAt=0,pendingFile=null,fileBuilder=null,preparedFiles=[],locked=false,boundIdentity=null;const ids=new WeakMap(),nodes=new Map(),maps=new Map(),assets=new Map(),objectBlobs=new Map();
 const id=node=>{if(!ids.has(node)){const key='n'+(++serial);ids.set(node,key);nodes.set(key,node);}return ids.get(node);};
 const text=node=>String(node?.textContent||'').replace(/\s+/g,' ').trim();
 const visible=node=>!node.hidden&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'&&getComputedStyle(node).opacity!=='0'&&node.getAttribute('aria-hidden')!=='true';
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
 function read(el,path='r',deep=false){
  if(el.nodeType===3){const value=text(el);return value?[{id:path,handle:id(el),kind:'text',text:value}]:[];}
  if(el.nodeType!==1||['SCRIPT','STYLE','NOSCRIPT','SVG','PATH','OPTION'].includes(el.tagName)||!visible(el))return [];
  const tag=el.tagName,handle=id(el),base={id:el.id?'id:'+el.id:path,handle};
  if(el.matches('.sidebar,.topbar,.nav,.mobile-account'))return [];
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'){
   if(['hidden','file','submit','button','reset'].includes(el.type))return [];
   return [{...base,kind:el.type==='checkbox'||el.type==='radio'?'toggle':tag==='SELECT'?'select':'field',text:label(el),value:el.value,checked:!!el.checked,disabled:el.matches(':disabled')||el.readOnly,fieldType:tag==='TEXTAREA'?'textarea':el.type||'text',required:el.required,options:tag==='SELECT'?[...el.options].map(o=>({id:o.value,text:o.text,disabled:o.disabled,selected:o.selected})):[],multiple:!!el.multiple,secure:el.type==='password'||el.id==='access-link'}];
  }
  if(tag==='LABEL'&&el.querySelector('input[type=file]')){const file=el.querySelector('input[type=file]');return [{...base,handle:id(file),kind:'file',text:text(el)||'Vybrat soubor',disabled:file.disabled}];}
  if(tag==='LABEL'&&el.querySelector('input,select,textarea'))return [...el.children].flatMap((c,i)=>read(c,path+'.'+i,deep));
  if(tag==='BUTTON'||tag==='A'||el.getAttribute('role')==='button')return [{...base,kind:'button',text:el.getAttribute('aria-label')||text(el)||el.title||(el.matches('[data-close]')?'Zavřít':'Otevřít'),disabled:!!el.disabled,danger:el.matches('.danger,[class*=delete]'),primary:el.classList.contains('primary')}];
  if(/^H[1-6]$/.test(tag))return [{...base,kind:'heading',text:text(el),level:Number(tag[1])}];
  if(tag==='DETAILS'){
   const summary=el.querySelector(':scope > summary');return [{...base,kind:'disclosure',text:text(summary),expanded:el.open,children:[...el.childNodes].filter(n=>n!==summary).flatMap((n,i)=>read(n,path+'.'+i,true))}];
  }
  const map=maps.get(el);
  if(map){const center=map.getCenter(),pins=[];let i=0;map.eachLayer(layer=>{if(layer instanceof L.Marker){const p=layer.getLatLng();pins.push({id:String(i++),handle:id(layer.getElement()||el),latitude:p.lat,longitude:p.lng,text:layer.options.title||layer.getPopup()?.getContent()?.textContent||'Místo'});}});return [{...base,kind:'map',text:el.getAttribute('aria-label')||'Mapa',latitude:center.lat,longitude:center.lng,zoom:map.getZoom(),pins,children:[...el.querySelectorAll('.leaflet-popup-content')].flatMap((n,i)=>read(n,path+'.p'+i))}];}
  if(tag==='CANVAS')return [{...base,kind:'canvas',text:el.getAttribute('aria-label')||'Podpis',width:el.width,height:el.height,disabled:getComputedStyle(el).pointerEvents==='none'}];
  if(el.matches('.photo-wrap,.plan-photo')){
   const img=el.querySelector('img');if(img){const pins=[...el.querySelectorAll('[data-marker],[data-plan-shaft],.marker-dot,.marker-label')].filter(n=>n.style.left&&n.style.top).map(n=>({id:id(n),handle:id(n),x:parseFloat(n.style.left)/100,y:parseFloat(n.style.top)/100,text:text(n)||'•'}));return [{...base,kind:'picture',text:img.alt||'Fotografie',imageHandle:id(img),width:img.naturalWidth||1000,height:img.naturalHeight||700,pins,disabled:getSession()?.permissions?.write===false}];}
  }
  if(tag==='IMG')return [{...base,kind:'image',text:el.alt||'Fotografie'}];
  if(tag==='IFRAME'||tag==='OBJECT'||tag==='EMBED')return [{...base,kind:'document',text:el.title||'Zobrazit dokument'}];
  if(tag==='PROGRESS')return [{...base,kind:'progress',text:el.getAttribute('aria-label')||'Průběh',value:String(el.value/el.max)}];
  if(tag==='BR'||tag==='HR')return [];
  const children=[...el.childNodes].flatMap((n,i)=>read(n,path+'.'+i,deep));
  if(!children.length)return [];
  const card=el.matches('article,.panel,.storage-card,.note-box,.overview-visit,.garden-folder,.plan-shaft-list');
  return el.matches('.jobs-month-grid')?[{...base,kind:'grid',children}]:card?[{...base,kind:'card',children}]:children;
 }
 async function snapshot(){await permitted();mapProxy();for(const [key,n]of nodes)if(!n.isConnected)nodes.delete(key);for(const [el]of maps)if(!el.isConnected)maps.delete(el);
  const dialogs=[...document.querySelectorAll('dialog[open]')],modal=dialogs.at(-1),root=modal||document.querySelector('#app .main')||document.querySelector('#app');if(!root)return {revision:++revision,title:'Pracovní deník',nodes:[],busy:true};
  const header=modal?[]:[...document.querySelectorAll('[data-workspace-filter],[data-notifications-open],[data-show-sync],[data-signout]')].filter((el,i,all)=>all.findIndex(other=>other.outerHTML===el.outerHTML)===i).flatMap((el,i)=>read(el,'header.'+i));const content=[...header,...read(root)];return {revision:++revision,title:modal?.querySelector('h1,h2,h3')?.textContent?.trim()||document.title||'Pracovní deník',nodes:content,modal:!!modal,online:navigator.onLine,file:pendingFile,toast:text(document.querySelector('#toast')),busy:!!root.querySelector('.loading')};
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
