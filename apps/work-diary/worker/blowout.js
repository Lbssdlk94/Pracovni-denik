// Garden-specific documentation. Photo keys never leave the authenticated API.
export async function handleBlowout(request,env,ctx,m,old,photoId,h){
 const {fail,json,checkWrite,boundedBytes,expectedVersion,validId,cleanText,execute,one}=h;
 const previous=JSON.parse(old.blowout||'[]');
 const publicSteps=steps=>steps.map(s=>({...s,photos:s.photos.map(p=>({id:p.id,type:p.type}))}));
 if(request.method==='GET'){
  if(!photoId)return json({version:old.version,steps:publicSteps(previous)});
  const photo=previous.flatMap(s=>s.photos).find(p=>p.id===photoId);if(!photo)fail(404,'Fotografie nebyla nalezena.');
  const obj=await env.BUCKET.get(photo.key);if(!obj)fail(404,'Fotografie nebyla nalezena.');
  return new Response(obj.body,{headers:{'content-type':photo.type,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }
 if(request.method!=='PUT'||photoId)fail(405,'Nepodporovaná operace.');
 checkWrite(m);
 const bytes=await boundedBytes(request,25*1024*1024),form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')||''},body:bytes}).formData();
 const raw=form.get('document');if(typeof raw!=='string'||raw.length>250000)fail(400,'Neplatné pokyny.');let b;try{b=JSON.parse(raw);}catch{fail(400,'Neplatné pokyny.');}
 if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Neplatné pokyny.');
 const version=expectedVersion(b.version);if(old.version!==version)fail(409,'Zahradu mezitím změnil kolega. Pokyny zůstávají ve formuláři. Zavřete jej a načtěte aktuální přehled.');
 if(!Array.isArray(b.steps)||b.steps.length>34||b.steps.filter(s=>!s?.hidden).length>30)fail(400,'Uložte nejvýše 30 položek vyfukování.');
 const oldPhotos=new Map(previous.flatMap(s=>s.photos).map(p=>[p.id,p])),ids=new Set(),photoIds=new Set(),uploads=[];
 const steps=[];
 for(const s of b.steps){
  const id=validId(s?.id);if(ids.has(id))fail(400,'Položky se opakují.');ids.add(id);
  if(!Array.isArray(s.photos)||s.photos.length>6)fail(400,'K položce lze přidat nejvýše 6 fotografií.');
  if(s.hidden!==undefined&&(typeof s.hidden!=='boolean'||(s.hidden&&(!['compressor','pump','water','supply'].includes(id)||s.notes!==''||s.photos.length))))fail(400,'Neplatná smazaná položka.');
  const step={...(s.hidden?{hidden:true}:{}),id,title:cleanText(s.title,100,true),notes:cleanText(s.notes,4000),photos:[]};steps.push(step);
  for(const p of s.photos){
   const pid=validId(p?.id);if(photoIds.has(pid)||photoIds.size>=40)fail(400,'Použijte nejvýše 40 různých fotografií.');photoIds.add(pid);
   const file=form.get('photo:'+pid);
   if(!file){const existing=oldPhotos.get(pid);if(!existing)fail(400,'Fotografie už není dostupná. Načtěte aktuální přehled.');step.photos.push(existing);continue;}
   if(h.photoUploads===false)fail(403,'Přidávání fotografií je vypnuté.',{code:'feature_disabled',feature:'photoUploads'});
   if(oldPhotos.has(pid)||typeof file.arrayBuffer!=='function'||!file.size||file.size>8*1024*1024)fail(400,'Fotografie musí mít nejvýše 8 MB a nový identifikátor.');
   const buffer=await file.arrayBuffer(),head=new Uint8Array(buffer),ascii=new TextDecoder().decode(head.slice(0,12));let type;
   if(head[0]===255&&head[1]===216&&head[2]===255)type='image/jpeg';
   else if([137,80,78,71,13,10,26,10].every((v,i)=>head[i]===v))type='image/png';
   else if(ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP')type='image/webp';
   else fail(400,'Fotografie nahrajte jako JPG, PNG nebo WebP.');
   const key=`gardens/${old.id}/blowout/${crypto.randomUUID()}`;step.photos.push({id:pid,key,type});uploads.push({key,buffer,type});
  }
 }
 const added=[];let committed=false;
 try{
  for(const upload of uploads){added.push(upload.key);await env.BUCKET.put(upload.key,upload.buffer,{httpMetadata:{contentType:upload.type}});}
  const result=await execute(env.DB,'UPDATE gardens SET blowout=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND deleted=0',JSON.stringify(steps),Date.now(),m.user_id,old.id,version);
  if(!result.meta.changes)fail(409,'Zahradu mezitím změnil kolega. Vaše změny se nepřepsaly. Načtěte aktuální přehled.');committed=true;
 }finally{if(!committed)await Promise.all(added.map(key=>env.BUCKET.delete(key)));}
 const kept=new Set(steps.flatMap(s=>s.photos).map(p=>p.key));ctx.waitUntil(Promise.all([...oldPhotos.values()].filter(p=>!kept.has(p.key)).map(p=>env.BUCKET.delete(p.key))));
 return json({version:version+1,steps:publicSteps(steps)});
}
