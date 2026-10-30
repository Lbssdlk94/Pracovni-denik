import {makeBackupTar,backupStream,readBackupTar} from './backup-archive.js?v=workspace-roles-v1';
import {workspaceCipherHash} from './workspace-recovery-crypto.js?v=shared-directory-v1';

export async function workspaceRecoveryArchive(bundle){
 async function* entries(){const manifest=new Blob([JSON.stringify(bundle.manifest)],{type:'application/json'});yield {name:'manifest.json',size:manifest.size,body:manifest.stream()};for(const part of bundle.parts)yield {name:'parts/'+part.index+'.bin',size:part.blob.size,body:part.blob.stream()};}
 return new Response(backupStream(makeBackupTar(entries()))).blob();
}
export async function readWorkspaceRecoveryArchive(file){
 if(file.size>540*1024*1024)throw Error('Balíček je příliš velký.');let manifest;const parts=[];
 for await(const entry of readBackupTar(file)){if(entry.name==='manifest.json'){if(entry.size>100000)throw Error('Neplatná hlavička balíčku.');manifest=JSON.parse(await entry.blob.text());}else parts.push({index:Number(entry.name.match(/\d+/)[0]),blob:entry.blob});}
 if(manifest?.format!=='work-diary-offline-recovery'||manifest.version!==1||!Array.isArray(manifest.parts)||parts.length!==manifest.parts.length||parts.length>128||!/^[-\w]{8,100}$/.test(manifest.id||''))throw Error('Neúplný nebo nepodporovaný obnovovací balíček.');
 for(const part of parts){const expected=manifest.parts[part.index];if(!expected||expected.size!==part.blob.size||expected.sha256!==await workspaceCipherHash(new Uint8Array(await part.blob.arrayBuffer())))throw Error('Poškozená část balíčku.');}
 return {id:manifest.id,manifest,parts};
}
export function createWorkspaceRecoveryUI({db,esc,getSession,showModal,modal,download,toast}){
 const markup=()=>'<section class="storage-card" id="workspace-recovery"><h2>Neodeslaná práce po změně přístupu</h2><p>Odebrané pracovní zápisy se uchovají šifrovaně. Obnovit je může původní vlastník společného prostoru; do zakázek se samy nezapisují.</p><button class="btn" type="button" data-workspace-recovery-open>Zobrazit obnovovací balíčky</button></section>';
 async function open(){
  const local=await db.localWorkspaceRecovery();
  const owner=getSession()?.workspace&&getSession()?.user.role==='owner';
  let remote=[],error='';if(owner)try{remote=(await db.request('/api/workspace/recovery')).bundles;}catch(e){error=e.message;}
  showModal('Obnova neodeslané práce',`<section data-workspace-recovery-dialog><p>Balíčky obsahují neodeslané záznamy a přílohy ze změněného přístupu. Automaticky se nezapisují do provozních dat.</p>${error?'<p role="alert">'+esc(error)+'</p>':''}<h3>V tomto zařízení</h3>${local.length?local.map(bundle=>'<article class="storage-card"><p>'+esc(new Date(bundle.createdAt||Date.now()).toLocaleString('cs-CZ'))+' · '+(bundle.uploaded?'Předáno vlastníkovi':'Čeká na předání')+'</p><button class="btn" data-recovery-export="'+esc(bundle.id)+'">Stáhnout šifrovaný balíček</button>'+(getSession()?.workspace?'<button class="btn" data-recovery-upload="'+esc(bundle.id)+'">Předat vlastníkovi</button>':'')+'</article>').join(''):'<p>Žádná neodeslaná práce v šifrovaném archivu.</p>'}${owner?'<h3>Balíčky pro vlastníka</h3>'+remote.map(bundle=>'<article class="storage-card"><p>'+esc(new Date(bundle.created_at).toLocaleString('cs-CZ'))+' · '+esc(bundle.user_id)+' · '+esc(bundle.state==='sealed'?'Připraveno':'Nahrávání')+'</p>'+(bundle.state==='sealed'?'<button class="btn" data-recovery-preview="'+esc(bundle.id)+'">Zobrazit obsah</button>':'')+'</article>').join('')+'<label class="btn">Nahrát šifrovaný balíček z jiného zařízení<input type="file" data-recovery-import accept=".tar,application/x-tar" hidden></label>':''}<p data-recovery-message role="status"></p></section>`);
  const root=modal.querySelector('[data-workspace-recovery-dialog]'),message=root.querySelector('[data-recovery-message]');
  const run=async(button,action)=>{button.disabled=true;try{await action();}catch(e){if(message.isConnected)message.textContent=e.message;else toast(e.message,true);}finally{button.disabled=false;}};
  root.querySelectorAll('[data-recovery-export]').forEach(button=>button.onclick=()=>run(button,async()=>download(await workspaceRecoveryArchive(local.find(bundle=>bundle.id===button.dataset.recoveryExport)),'neodeslana-prace-'+button.dataset.recoveryExport+'.tar')));
  root.querySelectorAll('[data-recovery-upload]').forEach(button=>button.onclick=()=>run(button,async()=>{await db.uploadWorkspaceRecovery(local.find(bundle=>bundle.id===button.dataset.recoveryUpload));message.textContent='Šifrovaný balíček je předaný vlastníkovi.';}));
  root.querySelector('[data-recovery-import]')?.addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{message.textContent='Ověřuji a nahrávám šifrovaný balíček…';await db.uploadWorkspaceRecovery(await readWorkspaceRecoveryArchive(file),{ownerImport:true});await open();}catch(e){message.textContent=e.message;}});
  root.querySelectorAll('[data-recovery-preview]').forEach(button=>button.onclick=()=>run(button,async()=>{const data=await db.request('/api/workspace/recovery/'+button.dataset.recoveryPreview+'/preview');showModal('Obsah neodeslaného zápisu','<p>Zkontrolujte a ručně přeneste potřebné údaje. Žádná zakázka se automaticky nemění.</p><pre class="workspace-recovery-preview">'+esc(JSON.stringify(data.document,null,2).slice(0,40000))+'</pre><div class="actions">'+data.assets.map(asset=>'<a class="btn" download href="'+esc(asset.url)+'">'+esc(asset.name)+'</a>').join('')+'</div>');}));
 }
 function bind(root=document){root.querySelectorAll('[data-workspace-recovery-open]').forEach(button=>button.onclick=()=>open().catch(e=>toast(e.message,true)));}
 return {markup,bind,open};
}
