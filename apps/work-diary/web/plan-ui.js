import {normalizedPoint} from './model.js?v=workspace-roles-v1';
export function createPlanUI({showModal,closeModal,esc,icon,getRows,writable,isOnline,save,onSaved,onReload,onOpen}){
 const drafts=new Map();
 const clear=id=>id?drafts.delete(id):drafts.clear();
 function render(garden,url,container){
  if(!container.isConnected)return;
  const rows=getRows(garden.id),byId=new Map(rows.map(r=>[r.id,r])),image=garden.plan.type.startsWith('image/');
  let state=drafts.get(garden.id),stale=!!state&&state.planVersion!==garden.plan.version;
  const editing=!!state&&!stale&&writable(),markers=(editing?state.markers:garden.plan.markers||[]).filter(p=>byId.has(p.shaftId));
  const editable=()=>container.isConnected&&writable()&&image&&!stale&&!state?.busy;
  container.innerHTML=`${image?`<div class="plan-photo" id="plan-photo" ${editing?'tabindex="0" role="button" aria-label="Klepnutím označte šachtu. Klávesou Enter přidejte značku doprostřed snímku."':''}><img class="plan-image" src="${url}" alt="Plán zahrady ${esc(garden.name)}"><div class="plan-pins"></div></div><p class="mini-empty">${editing?'Klepněte do snímku a vyberte šachtu. Značky posunete tažením.':'Klepnutím na označenou šachtu otevřete její fotografii a popisky.'}</p>`:`<div class="pdf-plan">${icon('archive')}<span>PDF · ${esc(garden.plan.name)}</span></div><p class="mini-empty">Pro označení šachet nahrajte fotku z dronu nebo obrázkový plán (JPG, PNG, WebP).</p>`}<div class="actions plan-tools">${image&&writable()?editing?'<button type="button" class="btn primary" id="plan-save">Uložit značky</button><button type="button" class="btn" id="plan-cancel">Zrušit úpravy</button>':'<button type="button" class="btn primary" id="plan-edit">Označit šachty</button>':''}<a class="btn" href="${url}" target="_blank" rel="noopener">${icon('image')} Otevřít plán</a><a class="btn" href="${url}" download="${esc(garden.plan.name)}">${icon('download')} Stáhnout plán</a></div><p class="mini-empty plan-save-state" role="status"></p><div class="plan-error form-message" role="alert"></div><div class="plan-shaft-list"></div>`;
  const status=container.querySelector('.plan-save-state'),error=container.querySelector('.plan-error');
  const draw=()=>{
   const pins=container.querySelector('.plan-pins');if(!pins)return;
   const visible=(editing?state.markers:garden.plan.markers||[]).filter(p=>byId.has(p.shaftId));
   pins.innerHTML=visible.map((p,i)=>`<button type="button" class="plan-pin" data-plan-shaft="${esc(p.shaftId)}" style="left:${p.x*100}%;top:${p.y*100}%" aria-label="${esc(byId.get(p.shaftId).name)}${editing?' – upravit značku':' – otevřít šachtu'}">${icon('pin')}<span class="plan-pin-number">${i+1}</span><span class="plan-pin-name" style="${p.x<.2?'left:0;transform:none':p.x>.8?'left:auto;right:0;transform:none':''}">${esc(byId.get(p.shaftId).name)}</span></button>`).join('');
   container.querySelector('.plan-shaft-list').innerHTML=visible.map((p,i)=>`<button type="button" class="text-link" data-plan-row="${esc(p.shaftId)}">${i+1}. ${esc(byId.get(p.shaftId).name)}</button>`).join('');
   if(editing){status.textContent=state.busy?'Ukládám značky…':state.dirty?'Neuložené značky'+(!isOnline()?' · pro uložení se připojte k internetu.':''):isOnline()?'Značky jsou uložené.':'Uložení značek vyžaduje internet.';const b=container.querySelector('#plan-save');b.disabled=!state.dirty||state.busy||!isOnline();}
  };
  const dirty=()=>{state.dirty=true;draw();};
  const pinMenu=id=>{
   if(!editing){onOpen(id);return;}if(!editable())return;
   const r=byId.get(id);if(!r)return;
   showModal('Šachta v plánu',`<p class="modal-text"><strong>${esc(r.name)}</strong><br>Značku posunete tažením přímo ve snímku. Odebrání značky ponechá fotografii šachty uloženou.</p><div class="modal-actions"><button type="button" class="btn" id="plan-open-shaft">Otevřít šachtu</button><button type="button" class="btn danger" id="plan-remove-pin">Odebrat značku</button></div>`);
   document.querySelector('#plan-open-shaft').onclick=()=>{closeModal();onOpen(id);};
   document.querySelector('#plan-remove-pin').onclick=()=>{if(!editable())return;state.markers=state.markers.filter(p=>p.shaftId!==id);dirty();closeModal();};
  };
  const add=point=>{
   if(!editing||!editable())return;
   const available=rows.filter(r=>!r._pending);
   showModal('Vyberte šachtu',`<p class="modal-text">Vyberte šachtu z této zahrady. Její značka se vloží na zvolené místo.</p>${available.length?available.map(r=>`<button type="button" class="zone-option" data-plan-pick="${esc(r.id)}">${esc(r.name)}${state.markers.some(p=>p.shaftId===r.id)?'<small> · přesunout značku</small>':''}</button>`).join(''):'<p class="note-box">Nejdříve do této zahrady přidejte šachty a sdílejte je s týmem.</p>'}`);
   document.querySelectorAll('[data-plan-pick]').forEach(b=>b.onclick=()=>{if(!editable())return;const id=b.dataset.planPick,p=state.markers.find(p=>p.shaftId===id);if(p)Object.assign(p,point);else state.markers.push({shaftId:id,...point});dirty();closeModal();});
  };
  container.querySelector('#plan-edit')?.addEventListener('click',()=>{if(!editable())return;drafts.set(garden.id,{planVersion:garden.plan.version,version:garden.version,markers:markers.map(p=>({...p})),dirty:false,busy:false,error:''});render(garden,url,container);});
  container.querySelector('#plan-cancel')?.addEventListener('click',()=>{if(state.busy||state.dirty&&!confirm('Zahodit neuložené značky v plánu?'))return;clear(garden.id);render(garden,url,container);});
  container.querySelector('#plan-save')?.addEventListener('click',async()=>{
   if(!editing||!editable()||!state.dirty||!isOnline())return;state.busy=true;state.error='';error.textContent='';draw();
   try{await save({...garden,version:state.version,plan:{...garden.plan,version:state.planVersion}},state.markers.filter(p=>byId.has(p.shaftId)));clear(garden.id);await onSaved();}
   catch(e){state.error=e.message;state.conflict=e.status===409;state.busy=false;if(container.isConnected)render(garden,url,container);}
  });
  if(state?.error)error.textContent=state.error;
  if(stale)error.textContent='Kolega mezitím nahradil snímek plánu. Rozepsané značky patří k původnímu snímku; na nový je nelze automaticky přenést.';
  if(stale||state?.conflict){const reload=document.createElement('button');reload.type='button';reload.className='btn small';reload.textContent='Načíst společnou verzi';reload.onclick=async()=>{if(state?.dirty&&!confirm('Zahodit rozepsané značky a načíst společný plán?'))return;reload.disabled=true;try{await onReload(garden.id);clear(garden.id);await onSaved();}catch(e){error.textContent=e.message;reload.disabled=false;}};error.append(document.createElement('br'),reload);}
  const photo=container.querySelector('.plan-photo');let dragged=false;
  photo?.addEventListener('click',e=>{if(dragged)return;const pin=e.target.closest('[data-plan-shaft]');if(pin){pinMenu(pin.dataset.planShaft);return;}if(editing)add(normalizedPoint(e.clientX,e.clientY,photo.getBoundingClientRect()));});
  photo?.addEventListener('keydown',e=>{if(editing&&e.target===photo&&['Enter',' '].includes(e.key)){e.preventDefault();add({x:.5,y:.5});}});
  photo?.addEventListener('pointerdown',e=>{
   if(!editing||!editable())return;const pin=e.target.closest('[data-plan-shaft]');if(!pin)return;
   const p=state.markers.find(p=>p.shaftId===pin.dataset.planShaft),start={x:e.clientX,y:e.clientY},rect=photo.getBoundingClientRect();let moved=false;pin.setPointerCapture(e.pointerId);
   const move=ev=>{if(!editable())return;if(Math.hypot(ev.clientX-start.x,ev.clientY-start.y)>5)moved=true;if(!moved)return;Object.assign(p,normalizedPoint(ev.clientX,ev.clientY,rect));pin.style.left=p.x*100+'%';pin.style.top=p.y*100+'%';};
   const up=()=>{pin.removeEventListener('pointermove',move);pin.removeEventListener('pointerup',up);pin.removeEventListener('pointercancel',up);if(moved){dragged=true;dirty();setTimeout(()=>dragged=false,350);}};
   pin.addEventListener('pointermove',move);pin.addEventListener('pointerup',up);pin.addEventListener('pointercancel',up);
  });
  container.querySelector('.plan-shaft-list').onclick=e=>{const row=e.target.closest('[data-plan-row]');if(row)pinMenu(row.dataset.planRow);};
  draw();
 }
 return {render,clear,hasChanges:id=>!!drafts.get(id)?.dirty,hasAnyChanges:()=>[...drafts.values()].some(s=>s.dirty)};
}
