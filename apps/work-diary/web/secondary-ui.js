// Responsive web enhancement; only native iOS screens are protected by the user. Existing pages retain their DOM,
// stylesheet cascade and handlers. No form, navigation or sync data is recreated.
export const secondaryPages=new Set(['overview','jobs','customers','attendance','home','editor','zones','team','settings','materials','defects','subscriptions','vehicles']);
export const secondaryForms=new Set(['material-edit-form','material-delete-form','customer-form','garden-form','job-form','service-form','defect-form','subscription-plan-form','subscription-form','invoice-company-form','protocol-template-form','drive-config-form','material-reminder-form','handoff-form','blowout-form','tariff-form','subscription-contract','planning-reserve-form','workspace-membership-form','email-settings-form','garden-delete-form','position-form','valve-label-form','zone-form','invite-form']);
const themeKey='diary-interface-appearance',railKey='diary-secondary-navigation';
let settingsObserver=null;const expandedSettings=new Map();
export function openSettingsSection(selector){const card=document.querySelector(selector);if(!card)return;card.dataset.secondaryKeepOpen='1';const group=card.querySelector(':scope>.secondary-settings-group');if(group)group.open=true;card.scrollIntoView({behavior:'smooth',block:'start'});}
function groupSettings(root){
 for(const card of root.querySelectorAll(':scope>.storage-card')){
  if(card.tagName==='DETAILS'||card.matches('.appearance-settings')||card.querySelector(':scope>.secondary-settings-group')||card.contains(document.activeElement))continue;
  const heading=card.querySelector(':scope>h2,:scope>.section-head h2');if(!heading||card.querySelectorAll('input,select,textarea').length<2&&card.textContent.length<600)continue;
  const key=card.id||heading.textContent,group=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
  group.className='secondary-settings-group';body.className='secondary-settings-body';summary.append(heading);
  for(const child of [...card.childNodes])body.append(child);
  group.append(summary,body);group.open=expandedSettings.get(key)===true||card.dataset.secondaryKeepOpen==='1'||card.id==='google-drive-settings'&&new URLSearchParams(location.search).has('drive');
  group.ontoggle=()=>{if(group.isConnected)expandedSettings.set(key,group.open);};card.append(group);
 }
}
function read(key,fallback){try{return localStorage.getItem(key)||fallback;}catch{return fallback;}}
function write(key,value){try{localStorage.setItem(key,value);}catch{}}
const media=matchMedia('(prefers-color-scheme: dark)');
export function applyAppearance(preference=read(themeKey,'system')){
 if(!['system','light','dark'].includes(preference))preference='system';
 document.documentElement.dataset.appearance=preference;
 document.documentElement.dataset.theme=preference==='system'?(media.matches?'dark':'light'):preference;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',document.documentElement.dataset.theme==='dark'?'#171c1a':'#F7F8F6');
}
media.addEventListener('change',()=>applyAppearance());
applyAppearance();
export function appearanceMarkup(){return `<section class="storage-card appearance-settings"><h2>Vzhled</h2><label class="field">Barevný režim<select id="interface-appearance"><option value="system">Podle systému</option><option value="light">Světlý</option><option value="dark">Tmavý</option></select></label><p class="mini-empty">Volba platí pro tento prohlížeč. Údaje a rozpracované formuláře zůstávají zachované.</p></section>`;}
export function enhanceSecondaryPage(page){
 settingsObserver?.disconnect();settingsObserver=null;
 const shell=document.querySelector('.shell');if(!shell)return;
 const enabled=secondaryPages.has(page);shell.classList.toggle('pd-secondary',enabled);
 if(enabled){
  shell.dataset.secondaryPage=page;
  shell.classList.toggle('pd-rail-collapsed',read(railKey,'open')==='closed');
  const top=shell.querySelector('.topbar');
  if(top&&!top.querySelector('[data-secondary-rail]')){
   const button=document.createElement('button');button.type='button';button.className='btn secondary-rail-toggle';button.dataset.secondaryRail='';button.textContent='☰';button.setAttribute('aria-label','Sbalit nebo rozbalit navigaci');
   const update=()=>button.setAttribute('aria-expanded',String(!shell.classList.contains('pd-rail-collapsed')));update();button.onclick=()=>{shell.classList.toggle('pd-rail-collapsed');write(railKey,shell.classList.contains('pd-rail-collapsed')?'closed':'open');update();};top.prepend(button);
  }
  for(const item of shell.querySelectorAll('.sidebar button,.sidebar a')){if(!item.title)item.title=item.textContent.trim();}
 }
 const preview=shell.querySelector('.role-preview'),header=shell.querySelector('.topbar');
 if(preview&&header&&!header.querySelector('[data-preview-toggle]')){
  preview.hidden=!preview.classList.contains('is-active');preview.id='web-role-preview';
  const eye=document.createElement('button');eye.type='button';eye.className='btn round-button';eye.dataset.previewToggle='';eye.setAttribute('aria-label','Zobrazit jako');eye.setAttribute('aria-controls',preview.id);eye.setAttribute('aria-expanded',String(!preview.hidden));eye.innerHTML='<svg class="interface-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  eye.onclick=()=>{preview.hidden=preview.classList.contains('is-active')?false:!preview.hidden;eye.setAttribute('aria-expanded',String(!preview.hidden));if(!preview.hidden)preview.querySelector('select')?.focus();};header.querySelector('.notification-bell')?.before(eye);if(!eye.isConnected)header.append(eye);
 }
 const selector=document.querySelector('#interface-appearance');if(selector){selector.value=read(themeKey,'system');selector.onchange=()=>{write(themeKey,selector.value);applyAppearance(selector.value);};}
 if(page==='settings'){const root=shell.querySelector('.settings-workspace');if(root){groupSettings(root);settingsObserver=new MutationObserver(()=>groupSettings(root));settingsObserver.observe(root,{childList:true,subtree:true});}shell.querySelector('[data-open-drive]')?.addEventListener('click',()=>openSettingsSection('#google-drive-settings'),{capture:true});}
}
// Observe only dialog replacement, never form values or data mutations. This
// also handles dialogs opened by existing modules after their asynchronous read.
export function installSecondaryDialogs(modal){
 const mark=()=>{
  const special=!!modal.querySelector('#service-work-form,[data-jobs-dialog]');
  modal.classList.toggle('pd-secondary-dialog',!special);
 };
 const observer=new MutationObserver(mark);observer.observe(modal,{childList:true,subtree:true});mark();return ()=>observer.disconnect();
}
