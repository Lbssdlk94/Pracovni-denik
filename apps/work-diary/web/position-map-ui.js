import {validCoordinates} from './nearby.js?v=workspace-roles-v1';
import {parseMapPosition} from './map-links.js?v=workspace-roles-v1';
export function openPositionMap({modal,showModal,position,center,isOnline,onConfirm,canEdit,icon}){
 showModal('Umístit šachtu na mapu',`<p class="modal-text">Klepněte na místo šachty. Špendlík můžete posunout tažením, poté potvrďte polohu.</p><div id="position-picker-map" aria-label="Mapa pro výběr polohy šachty"></div><p id="position-picker-status" class="mini-empty" role="status"></p><p id="position-picker-coordinates" class="gps-coordinates"></p><div class="position-picker-tools"><button type="button" class="btn small" id="position-picker-gps">${icon('pin')} Najít mou polohu</button><button type="button" class="btn small" id="position-picker-center">Špendlík do středu mapy</button></div><details class="position-map-import"><summary>Vložit polohu z Apple Map</summary><label class="field">Odkaz nebo souřadnice<input id="position-map-link" type="text" maxlength="2000" placeholder="Odkaz z Apple Map nebo 50.087, 14.421" autocomplete="off"></label><p class="mini-empty">V Apple Mapách otevřete špendlík a zkopírujte jeho odkaz nebo souřadnice.</p><button type="button" class="btn small" id="position-map-import">Načíst špendlík</button></details><p id="position-picker-error" class="form-message" role="alert"></p><div class="modal-actions"><button type="button" class="btn" id="position-picker-cancel">Zrušit</button><button type="button" class="btn primary" id="position-picker-confirm" disabled>Použít polohu</button></div>`);
 modal.classList.add('position-picker');
 const container=modal.querySelector('#position-picker-map'),status=modal.querySelector('#position-picker-status'),error=modal.querySelector('#position-picker-error'),coordinates=modal.querySelector('#position-picker-coordinates'),confirm=modal.querySelector('#position-picker-confirm');
 let selected=null,map=null,marker=null,cancelled=false;
 const alive=()=>!cancelled&&modal.open&&container.isConnected&&canEdit();
 const select=(value,pan=false)=>{
  if(!alive()||!validCoordinates(value))return;
  selected={latitude:value.latitude,longitude:value.longitude,accuracy:value.accuracy??null};
  coordinates.textContent=selected.latitude.toFixed(6)+', '+selected.longitude.toFixed(6);confirm.disabled=false;error.textContent='';
  if(map){const point=[selected.latitude,selected.longitude];if(marker)marker.setLatLng(point);else marker=L.marker(point,{draggable:true,keyboard:true,title:'Špendlík šachty – přesuňte na správné místo',icon:L.divIcon({className:'position-pin',html:icon('pin'),iconSize:[36,44],iconAnchor:[18,42]})}).addTo(map).on('dragend',()=>{const p=marker.getLatLng().wrap();select({latitude:p.lat,longitude:p.lng});});if(pan)map.setView(point,18);}
 };
 if(window.L){
  const initial=validCoordinates(position)?position:validCoordinates(center)?center:null;
  map=L.map(container,{scrollWheelZoom:false}).setView(initial?[initial.latitude,initial.longitude]:[49.8,15.4],initial?18:7);
  if(isOnline())L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).on('tileerror',()=>{if(alive())status.textContent='Podklad mapy se nepodařilo načíst. Polohu můžete vložit z Apple Map nebo zadat souřadnice.';}).addTo(map);
  else status.textContent='Offline · podklad mapy vyžaduje internet. Uložený špendlík a vložení souřadnic fungují i bez něj.';
  map.on('click',event=>{const p=event.latlng.wrap();select({latitude:p.lat,longitude:p.lng});});requestAnimationFrame(()=>{if(!cancelled)map.invalidateSize();});
 }else{status.textContent='Mapa není dostupná. Vložte polohu z Apple Map nebo souřadnice.';container.hidden=true;modal.querySelector('#position-picker-center').disabled=true;}
 if(validCoordinates(position))select(position);
 modal.querySelector('#position-picker-center').onclick=()=>{if(!map)return;const p=map.getCenter().wrap();select({latitude:p.lat,longitude:p.lng});};
 modal.querySelector('#position-map-import').onclick=()=>{try{select(parseMapPosition(modal.querySelector('#position-map-link').value),true);}catch(e){error.textContent=e.message;}};
 modal.querySelector('#position-picker-gps').onclick=async e=>{
  const button=e.currentTarget;if(!alive())return;if(!navigator.geolocation){error.textContent='Zařízení neumí získat polohu. Umístěte špendlík v mapě.';return;}
  button.disabled=true;error.textContent='';status.textContent='Zjišťuji vaši polohu…';
  try{const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,e=>reject(new Error(e.code===1?'Povolte polohu v prohlížeči, nebo umístěte špendlík ručně.':'Polohu se nepodařilo zjistit. Umístěte špendlík ručně.')),{enableHighAccuracy:true,timeout:20000,maximumAge:0}));if(!alive())return;select({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy},true);status.textContent='Přesnost GPS přibližně ± '+Math.round(p.coords.accuracy)+' m. Zkontrolujte polohu špendlíku.';}catch(e){if(alive()){status.textContent='';error.textContent=e.message;}}finally{button.disabled=false;}
 };
 modal.querySelector('#position-picker-cancel').onclick=()=>modal.close();
 confirm.onclick=()=>{if(alive()&&selected)onConfirm({...selected});};
 return ()=>{cancelled=true;map?.remove();map=null;modal.classList.remove('position-picker');};
}
