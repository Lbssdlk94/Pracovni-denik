// One fixed, resumable batch. All writes use the same authenticated APIs as ordinary forms.
export const VOLUME_BATCH='volume-20261027';
export const VOLUME_COUNT=305;
const marker='TESTOVACI DATA · '+VOLUME_BATCH;
const sizes=[831304,831849];
export const volumeIds=n=>({customer:`${VOLUME_BATCH}-customer-${n}`,job:`${VOLUME_BATCH}-job-${n}`,photos:Array.from({length:n%2?1:2},(_,i)=>`${VOLUME_BATCH}-photo-${n}-${i+1}`)});
const ensure=(ok,message)=>{if(!ok)throw new Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
async function gardenId(customer){return 'auto_garden_'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('garden|'+customer))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function runVolumeImport({request,user,progress=()=>{},stopped=()=>false,checkSession=()=>{},loadPhoto=async i=>{const r=await fetch(new URL('./volume-test-photo-'+(i+1)+'.jpg',import.meta.url));ensure(r.ok,'Nelze načíst testovací snímek.');return r.blob();}}){
 ensure(user?.role==='owner','Tento import smí spustit jen vlastník.');
 const guard=()=>{checkSession();if(stopped())throw new Error('Import pozastaven. Již uložené záznamy zůstávají; dalším spuštěním bezpečně navážete.');};
 const api=async(path,method='GET',value)=>{guard();return request(path,{method,...(value===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(value)})});};
 const list=async(path,key)=>{const all=[];let cursor=null;do{const v=await api(path+(cursor?(path.includes('?')?'&':'?')+'cursor='+encodeURIComponent(cursor):''));all.push(...v[key]);cursor=v.nextCursor;}while(cursor);return all;};
 progress({done:0,text:'Kontroluji existující záznamy a oprávnění…'});
 const me=await api('/api/me');ensure(me.user?.id===user.id&&me.user?.role==='owner','Přihlaste se stejným účtem vlastníka.');
 for(const f of ['customers','gardens','jobs','photoUploads','protocolPhotos'])ensure(me.features?.[f]!==false,'Import potřebuje povolenou funkci: '+f+'. Nastavení modulů se nezměnilo.');
 const [customers,jobs,gardens]=await Promise.all([list('/api/customers','customers'),list('/api/jobs?state=all&order=schedule','jobs'),api('/api/gardens').then(v=>v.gardens)]);
 const ids=new Set(Array.from({length:VOLUME_COUNT},(_,i)=>[volumeIds(i+1).customer,volumeIds(i+1).job]).flat());
 const gardenIds=new Set(await Promise.all(Array.from({length:VOLUME_COUNT},(_,i)=>gardenId(volumeIds(i+1).customer))));
 for(const [rows,allowed]of[[customers,ids],[jobs,ids],[gardens,gardenIds]])for(const v of rows)if(/^Test(?:[1-9]|[1-9]\d|[12]\d\d|30[0-5])$/.test(v.name||v.title||''))ensure(allowed.has(v.id),'Název '+(v.name||v.title)+' už používá jiný záznam. Import nic nesloučí ani nepřepíše.');
 const cMap=new Map(customers.map(v=>[v.id,v])),jMap=new Map(jobs.map(v=>[v.id,v])),gMap=new Map(gardens.map(v=>[v.id,v]));
 const photos=await Promise.all([loadPhoto(0),loadPhoto(1)]);photos.forEach((b,i)=>ensure(b.size===sizes[i],'Testovací snímek má jinou velikost.'));
 for(let n=1;n<=VOLUME_COUNT;n++){
  guard();const id=volumeIds(n),name='Test'+n,gid=await gardenId(id.customer),address='Testovací adresa '+n,city='Test – syntetická data',addressId='test-address-'+n;
  progress({done:n-1,text:`${name}: zákazník, zahrada, zakázka, výkaz a fotografie…`});
  const existing=cMap.get(id.customer);
  if(existing)ensure(existing.name===name&&existing.email===''&&existing.addresses?.some(a=>a.id===addressId&&a.address===address&&a.city===city),'Testovací zákazník '+name+' byl upraven. Zastavuji bez přepsání.');
  else await api('/api/customers/'+id.customer,'PUT',{version:0,name,gardenName:name,email:'',phones:[],addresses:[{id:addressId,label:'Testovací místo',address,city}]});
  let g=gMap.get(gid);if(!g){const detail=await api('/api/customers/'+id.customer);g=detail.customer.gardens?.find(v=>v.id===gid);}
  ensure(g&&g.name===name&&(!g.customerId||g.customerId===id.customer),'Automaticky vytvořená zahrada není správně propojená. Import zastaven.');
  const day=Math.floor((n-1)/5),slot=(n-1)%5,dueDate=new Date(Date.UTC(2026,10,1+day,12)).toISOString().slice(0,10),plannedStart=String(8+slot*2).padStart(2,'0')+':00';
  let job=jMap.get(id.job);
  if(!job){try{job=(await api('/api/jobs/'+id.job,'PUT',{version:0,title:name,jobType:'service',customerId:id.customer,customerAddressId:addressId,gardenId:gid,customerName:name,address,city,description:marker,assignedTo:user.id,assignedTos:[user.id],dueDate,plannedStart,estimatedMinutes:60,status:'planned'})).job;}catch(e){if(e.status!==409)throw e;job=(await api('/api/jobs/'+id.job)).job;}}
  ensure(job.title===name&&job.customerId===id.customer&&job.gardenId===gid&&job.description===marker&&job.assignedTo===user.id&&job.dueDate===dueDate&&job.plannedStart===plannedStart&&job.estimatedMinutes===60&&job.status==='planned','Zakázka '+name+' už obsahuje jiné údaje nebo termín. Zastavuji bez přepsání.');
  let snapshot=await api('/api/jobs/'+id.job+'/service');
  for(let i=0;i<id.photos.length;i++){
   const p=snapshot.photos.find(v=>v.id===id.photos[i]);
   if(p)ensure(p.size===photos[i].size,'Existující testovací fotografie byla změněna.');
   else {guard();await request('/api/jobs/'+id.job+'/service/photos/'+id.photos[i],{method:'PUT',headers:{'content-type':'image/jpeg','x-file-name':encodeURIComponent(name+'-test-'+(i+1)+'.jpg')},body:photos[i]});}
  }
  const r=snapshot.report,fields={date:r?.date||today(),work:'Testovací interní výkaz pro '+name+'. Kontrola zavlažování – pouze syntetický zátěžový test.',material:'Testovací materiál; bez skutečné spotřeby a účtování.',defects:'',notes:marker,recommendations:'Testovací doporučení pro další návštěvu.',photoIds:id.photos};
  if(r){ensure(Object.entries(fields).every(([k,v])=>same(r[k],v)),'Výkaz '+name+' byl upraven. Import jej nepřepíše.');ensure(r.documentState==='ready','Existující výkaz není potvrzený. Zkontrolujte jej ručně.');}
  else await api('/api/jobs/'+id.job+'/service','PUT',{version:snapshot.job.version,operationId:VOLUME_BATCH+'-report-'+n,finalizeReport:true,report:fields});
  progress({done:n,text:`Uloženo ${n} / ${VOLUME_COUNT}.`});
 }
 return {customers:305,gardens:305,jobs:305,reports:305,photos:457,bytes:379988768};
}
export function createVolumeTestUI({db,getSession,esc,toast,onDone=()=>{}}){
 let running=false,paused=false,done=0,text='Dosud nespuštěno.';
 const owner=()=>getSession()?.user?.role==='owner';
 const paint=()=>{const node=document.querySelector('#volume-test-status');if(node)node.textContent=text;const bar=document.querySelector('#volume-test-progress');if(bar)bar.value=done;const start=document.querySelector('#volume-test-start');if(start)start.disabled=running;const stop=document.querySelector('#volume-test-pause');if(stop)stop.hidden=!running;};
 return {markup:()=>owner()?`<section class="panel" id="volume-test-settings"><details><summary>Testovací data · Test1–Test305</summary><p>Vytvoří 305 zákazníků, zahrad a zakázek Test1 až Test305. Termíny: 1. 11.–31. 12. 2026, pět denně, pouze pro váš účet.</p><p>Ke každé zakázce přidá potvrzený testovací interní výkaz a jednu nebo dvě umělé fotografie (457 souborů, přibližně 380 MB). Zakázky zůstanou naplánované. Žádné e-maily ani SMS se neodesílají.</p><p>Nechte aplikaci otevřenou a telefon nezamykejte. Po přerušení lze bezpečně navázat stejným tlačítkem. Existující provozní záznamy se nepřepisují.</p><progress id="volume-test-progress" max="305" value="${done}" style="width:100%"></progress><p id="volume-test-status" role="status" aria-live="polite">${esc(text)}</p><div class="modal-actions"><button type="button" class="btn primary" id="volume-test-start" ${running?'disabled':''}>Vytvořit testovací data / pokračovat</button><button type="button" class="btn" id="volume-test-pause" ${running?'':'hidden'}>Pozastavit</button></div></details></section>`:'',bind:()=>{
  const start=document.querySelector('#volume-test-start'),stop=document.querySelector('#volume-test-pause');if(!owner()||!start)return;
  stop.onclick=()=>{paused=true;text='Dokončuji právě odesílaný požadavek a pozastavuji…';paint();};
  start.onclick=async()=>{if(running||!owner())return;const user={...getSession().user};running=true;paused=false;paint();
   const run=()=>runVolumeImport({request:db.request,user,checkSession:()=>ensure(owner()&&getSession().user.id===user.id,'Účet se změnil. Import zastaven.'),stopped:()=>paused,progress:p=>{done=p.done;text=p.text;paint();}});
   try{if(navigator.locks)await navigator.locks.request(VOLUME_BATCH,{ifAvailable:true},lock=>{ensure(lock,'Import už běží v jiné kartě prohlížeče.');return run();});else await run();text='Hotovo: 305 zákazníků, 305 zahrad, 305 zakázek, 305 výkazů a 457 fotografií.';await onDone();toast('Testovací data byla vytvořena.');}catch(e){text=e.message;toast(e.message);}finally{running=false;paint();}
  };
 }};
}
