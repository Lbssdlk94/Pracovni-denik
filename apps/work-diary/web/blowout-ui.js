import {preparePhoto} from './export.js?v=workspace-roles-v1';
const TOPICS=[['compressor','Připojení kompresoru'],['pump','Vypnutí čerpadla'],['water','Uzavření vody'],['supply','Vyfouknutí přívodu']];
export function createBlowoutUI({db,esc,showModal,modal,canEdit,canAddPhotos=()=>true,isOnline,onSaved,toast}){
 const removeStep=(steps,step)=>[...steps.filter(s=>s.id!==step.id),...(TOPICS.some(([id])=>id===step.id)?[{id:step.id,title:TOPICS.find(([id])=>id===step.id)[1],notes:'',photos:[],hidden:true}]:[])];
 let epoch=0;const viewURLs=new Set();
 const viewURL=blob=>{const url=URL.createObjectURL(blob);viewURLs.add(url);return url;};
 function disposeView(){for(const url of viewURLs)URL.revokeObjectURL(url);viewURLs.clear();}
 function clear(){epoch++;disposeView();}
 function markup(){return `<section class="storage-card blowout-section"><div class="section-head"><div><h2>Vyfukování závlahy</h2><p>Fotografie a pokyny pro tuto zahradu, společné pro celý tým.</p></div></div><div id="blowout-content" aria-live="polite"><p class="mini-empty">Načítám pokyny…</p></div></section>`;}
 async function bind(garden){
  const root=document.querySelector('#blowout-content'),ticket=epoch;if(!root)return;
  const valid=()=>root.isConnected&&ticket===epoch;
  let data=await db.cachedBlowout(garden.id);if(!valid())return;
  const draw=(value,notice='')=>{
   if(!valid())return;data=value;disposeView();
   const stored=value?.steps||[],steps=[...TOPICS.map(([id,title])=>stored.find(s=>s.id===id)||{id,title,notes:'',photos:[]}),...stored.filter(s=>!TOPICS.some(([id])=>id===s.id))].filter(s=>!s.hidden);
   const editable=canEdit()&&isOnline()&&!!value;
   root.innerHTML=`${notice?`<p class="note-box" role="status">${esc(notice)}</p>`:''}${!isOnline()?'<p class="mini-empty">Offline · zobrazuje se uložená kopie. Úpravy vyžadují internet.</p>':''}${!steps.length?'<p class="mini-empty">Žádné položky vyfukování. Přidejte si jen ty, které potřebujete.</p>':''}<div class="blowout-grid">${steps.map(s=>`<article class="blowout-card"><div class="section-head"><h3>${esc(s.title)}</h3>${editable?`<div class="blowout-item-actions"><button class="btn small" data-blowout-edit="${esc(s.id)}">${s.notes||s.photos.length?'Upravit':'Doplnit'}</button><button class="btn ghost small" data-blowout-delete="${esc(s.id)}" aria-label="Smazat položku ${esc(s.title)}">Smazat</button></div>`:''}</div>${s.notes?`<p class="blowout-notes">${esc(s.notes)}</p>`:'<p class="mini-empty">Zatím bez pokynů. Doplňte místo a postup pro tuto zahradu.</p>'}<div class="blowout-photos">${s.photos.map((p,i)=>`<button type="button" data-blowout-photo="${esc(p.id)}" aria-label="Zvětšit fotografii ${i+1}: ${esc(s.title)}"><img alt="${esc(s.title)} – fotografie ${i+1}" data-blowout-image="${esc(p.id)}"><span>Načítám fotografii…</span></button>`).join('')}</div></article>`).join('')}</div>${editable?'<button class="btn" id="blowout-add">+ Přidat další položku</button>':''}<p class="mini-empty">Ukládají se vaše vlastní pokyny podle skutečného zapojení zahrady.</p>`;
   root.querySelectorAll('[data-blowout-edit]').forEach(b=>b.onclick=()=>edit(garden,value,steps.find(s=>s.id===b.dataset.blowoutEdit)));
   root.querySelectorAll('[data-blowout-delete]').forEach(button=>button.onclick=async()=>{
    const step=steps.find(s=>s.id===button.dataset.blowoutDelete);
    if(!canEdit()||!isOnline()||!confirm(`Smazat položku „${step.title}“ včetně jejích fotografií pro celý tým?`))return;
    root.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{await db.saveBlowout(garden.id,value.version,removeStep(value.steps,step));await onSaved();toast('Položka byla smazána.');}
    catch(error){toast(error.message,true);if(valid())root.querySelectorAll('button').forEach(b=>b.disabled=false);}
   });
   root.querySelector('#blowout-add')?.addEventListener('click',()=>edit(garden,value,{id:crypto.randomUUID(),title:'',notes:'',photos:[]}));
   for(const s of steps)for(const p of s.photos){const img=root.querySelector('[data-blowout-image="'+p.id+'"]');db.blowoutPhoto(garden.id,p).then(blob=>{if(!valid()||!img.isConnected)return;img.src=viewURL(blob);img.nextElementSibling.remove();img.parentElement.onclick=()=>showModal(esc(s.title),`<img class="blowout-full" src="${img.src}" alt="${esc(s.title)}">`);}).catch(()=>{if(img.isConnected)img.nextElementSibling.textContent='Fotografie není dostupná. Načtěte ji s připojením k internetu.';});}
  };
  if(data)draw(data);
  if(!isOnline()){if(!data)root.innerHTML='<p class="note-box">Pokyny ještě nejsou uložené v tomto zařízení. Otevřete Vyfukování s připojením k internetu.</p>';return;}
  try{const remote=await db.getBlowout(garden.id);if(valid())draw(remote);}catch(error){if(valid())draw(data,error.message);}
 }
 function edit(garden,data,original){
  if(!canEdit()||!isOnline())return;
  if(data.steps.filter(s=>!s.hidden).length>=30&&!data.steps.some(s=>s.id===original.id)){toast('Lze uložit nejvýše 30 položek.',true);return;}
  const step={...original,photos:original.photos.map(p=>({...p}))},localURLs=new Set();let changed=false,saving=false,processing=false,closed=false;
  showModal('Pokyny k vyfukování',`<form id="blowout-form"><label class="field">Název položky<input name="title" maxlength="100" required placeholder="Např. Vypuštění filtru" value="${esc(step.title)}"></label><label class="field">Místo a postup<textarea name="notes" maxlength="4000" rows="5" placeholder="Kde prvek najít a jak postupovat…">${esc(step.notes)}</textarea></label><div id="blowout-edit-photos" class="blowout-photos"></div><div class="capture-options"><button type="button" class="btn small" id="blowout-camera">Vyfotit</button><button type="button" class="btn small" id="blowout-gallery">Vybrat fotky</button></div><input id="blowout-camera-file" type="file" accept="image/*" capture="environment" hidden><input id="blowout-gallery-files" type="file" accept="image/*" multiple hidden><p class="mini-empty">Až 6 fotek k položce. Fotky se uloží spolu s pokyny.</p><p class="form-message" role="alert" id="blowout-error"></p><div class="modal-actions">${data.steps.some(s=>s.id===step.id)?`<button class="btn danger" type="button" id="blowout-delete">Smazat položku</button>`:''}<button class="btn" type="button" id="blowout-cancel">Zrušit</button><button class="btn primary" type="submit">Uložit pokyny</button></div></form>`);
  const form=modal.querySelector('#blowout-form'),error=form.querySelector('#blowout-error'),controller=new AbortController(),signal=controller.signal;
  window.addEventListener('workspace-capture-extra',event=>{if(!closed&&(changed||processing))event.detail.push({key:'blowout:'+garden.id+':'+step.id,record:{gardenId:garden.id,version:data.version,step:{...step,title:form.elements.title.value,notes:form.elements.notes.value},processingFiles:[...form.querySelectorAll('[type=file]')].flatMap(input=>[...input.files])}});},{signal});
  const url=blob=>{const value=URL.createObjectURL(blob);localURLs.add(value);return value;};
  const leave=e=>{if(saving||processing){e.preventDefault();e.stopImmediatePropagation();return;}if(changed&&!confirm('Zahodit neuložené pokyny a fotografie?')){e.preventDefault();e.stopImmediatePropagation();}};
  modal.addEventListener('cancel',leave,{signal});modal.querySelector('[data-close]').addEventListener('click',leave,{capture:true,signal});
  const unload=e=>{if(changed||saving){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload,{signal});
  modal.addEventListener('close',()=>{closed=true;controller.abort();for(const u of localURLs)URL.revokeObjectURL(u);},{once:true});
  form.oninput=()=>{changed=true;};
  const lock=busy=>{for(const b of form.querySelectorAll('button,input,textarea'))b.disabled=busy;modal.querySelector('[data-close]').disabled=busy;};
  function photos(){
   const target=form.querySelector('#blowout-edit-photos');target.innerHTML=step.photos.map((p,i)=>`<div class="blowout-edit-photo"><img data-edit-photo="${esc(p.id)}" alt="Fotografie ${i+1}"><button type="button" class="btn small" data-remove-photo="${esc(p.id)}" aria-label="Odebrat fotografii ${i+1}">Odebrat</button></div>`).join('');
   for(const p of step.photos){const img=target.querySelector('[data-edit-photo="'+p.id+'"]');(p.blob?Promise.resolve(p.blob):db.blowoutPhoto(garden.id,p)).then(blob=>{if(!closed&&img.isConnected)img.src=url(blob);}).catch(()=>{if(img.isConnected)img.alt='Fotografie není dostupná';});}
   target.querySelectorAll('[data-remove-photo]').forEach(b=>b.onclick=()=>{step.photos=step.photos.filter(p=>p.id!==b.dataset.removePhoto);changed=true;photos();});
  }
  photos();
  if(!canAddPhotos())form.querySelector('.capture-options').hidden=true;
  form.querySelector('#blowout-camera').onclick=()=>form.querySelector('#blowout-camera-file').click();form.querySelector('#blowout-gallery').onclick=()=>form.querySelector('#blowout-gallery-files').click();
  for(const input of form.querySelectorAll('[type=file]'))input.onchange=async()=>{
   if(!canAddPhotos())return;const files=[...input.files];if(step.photos.length+files.length>6){error.textContent='K položce lze přidat nejvýše 6 fotografií.';input.value='';return;}
   processing=true;lock(true);error.textContent='Připravuji fotografie…';
   try{const added=[];for(const file of files)added.push({id:crypto.randomUUID(),blob:await preparePhoto(file)});if(!closed){step.photos.push(...added);changed=true;photos();error.textContent='';}}catch(e){error.textContent=e.message;}finally{processing=false;lock(false);input.value='';}
  };
  form.querySelector('#blowout-cancel').onclick=e=>{leave(e);if(!e.defaultPrevented)modal.close();};
  async function save(remove=false){
   if(saving||processing)return;if(!canEdit()||!isOnline()){error.textContent='Pro uložení potřebujete připojení a oprávnění pracovníka.';return;}
   step.title=form.elements.title.value.trim();step.notes=form.elements.notes.value.trim();if(!remove&&!step.title){error.textContent='Vyplňte název položky.';return;}
   if(remove&&!confirm('Smazat tuto položku včetně jejích fotografií pro celý tým?'))return;
   const steps=remove?removeStep(data.steps,step):data.steps.filter(s=>s.id!==step.id);if(!remove){const index=data.steps.findIndex(s=>s.id===step.id);steps.splice(index<0?steps.length:index,0,step);}
   saving=true;lock(true);error.textContent='Ukládám…';
   try{await db.saveBlowout(garden.id,data.version,steps);changed=false;modal.close();await onSaved();toast(remove?'Položka byla smazána.':'Pokyny a fotografie jsou uložené pro celý tým.');}catch(e){error.textContent=e.message;}finally{saving=false;if(!closed)lock(false);}
  }
  form.onsubmit=e=>{e.preventDefault();save();};form.querySelector('#blowout-delete')?.addEventListener('click',()=>save(true));
 }
 return {markup,bind,clear,disposeView};
}
