// Opt-in enhancement of the remaining screens. Approved pages retain their DOM,
// stylesheet cascade and handlers. No form, navigation or sync data is recreated.
export const secondaryPages=new Set(['home','editor','zones','team','settings','materials','defects','subscriptions','vehicles']);
export const secondaryForms=new Set(['material-edit-form','material-delete-form','customer-form','garden-form','job-form','service-form','defect-form','subscription-plan-form','subscription-form','invoice-company-form','protocol-template-form','drive-config-form','material-reminder-form','handoff-form','blowout-form','tariff-form','subscription-contract','planning-reserve-form','workspace-membership-form','email-settings-form','garden-delete-form','position-form','valve-label-form','zone-form','invite-form']);
const themeKey='diary-interface-appearance',railKey='diary-secondary-navigation';
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
 const selector=document.querySelector('#interface-appearance');if(selector){selector.value=read(themeKey,'system');selector.onchange=()=>{write(themeKey,selector.value);applyAppearance(selector.value);};}
}
// Observe only dialog replacement, never form values or data mutations. This
// also handles dialogs opened by existing modules after their asynchronous read.
export function installSecondaryDialogs(modal){
 const mark=()=>{
  const form=modal.querySelector('form');
  const approved=!!modal.querySelector('#service-work-form,.job-detail-summary,#job-side-panel,[data-protocol-editor]');
  modal.classList.toggle('pd-secondary-dialog',!approved&&((!!form&&secondaryForms.has(form.id))||!!modal.querySelector('.protocol-template-list')));
 };
 const observer=new MutationObserver(mark);observer.observe(modal,{childList:true,subtree:true});mark();return ()=>observer.disconnect();
}
