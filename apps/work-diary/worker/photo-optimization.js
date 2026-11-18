import {subWorkJob} from './service-work.js';
import {workspaceJobScope} from './workspace-policy.js';
const optimizationPrefix='photo-optimization-v1:';
export function photoOptimizationKey(photoId,sourceSha){return optimizationPrefix+photoId+':'+sourceSha;}
export function optimizedImageDimensions(bytes,type){
 if(type==='image/png'&&bytes.length>=24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return {width:view.getUint32(16),height:view.getUint32(20)};}
 if(type!=='image/jpeg'||bytes[0]!==255||bytes[1]!==216)return null;
 for(let i=2;i+8<bytes.length;){if(bytes[i++]!==255)return null;while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===217||marker===218)return null;if(marker===1||marker>=208&&marker<=215)continue;const length=bytes[i]*256+bytes[i+1];if(length<2||i+length>bytes.length)return null;if([192,193,194].includes(marker)&&length>=8)return {width:bytes[i+5]*256+bytes[i+6],height:bytes[i+3]*256+bytes[i+4]};i+=length;}return null;
}
export async function photoOptimizationReplay(env,photo,sourceSha){for(let i=0;i<8;i++){const row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(photoOptimizationKey(photo.id,sourceSha)).first();if(!row)return false;try{const log=JSON.parse(row.value);if(log.photoId!==photo.id||log.jobId!==photo.job_id||log.sourceSha256!==sourceSha||log.sha256===sourceSha)return false;if(log.sha256===photo.sha256)return true;sourceSha=log.sha256;}catch{return false;}}return false;}
export async function handlePhotoOptimization(request,env,ctx,m,h){
 const {fail,json,body,boundedBytes}=h,url=new URL(request.url),method=request.method,match=url.pathname.match(/^\/api\/photo-optimization(?:\/([-\w]{1,100}))?$/);if(!match)fail(404,'Nenalezeno.');
 if(!['owner','administrator'].includes(m.role))fail(403,'Uložené fotografie optimalizuje pouze vlastník nebo administrátor.');
 const authorize=async()=>{const current=await env.DB.prepare('SELECT role FROM members WHERE user_id=?').bind(m.user_id).first();if(!current||!['owner','administrator'].includes(current.role))fail(403,'Oprávnění se změnilo.');};await authorize();
 if(!match[1]&&method==='GET'){
  const after=url.searchParams.get('after')||'';if(after&&!/^[-\w]{1,100}$/.test(after))fail(400,'Neplatná stránka.');const rows=(await env.DB.prepare(`SELECT p.id,p.job_id,p.name,p.size,p.mime_type,p.sha256 FROM service_photos p JOIN jobs j ON j.id=p.job_id WHERE p.status='ready' AND j.deleted=0 AND p.size>=? AND p.id>? AND NOT EXISTS(SELECT 1 FROM settings opt WHERE opt.key LIKE 'photo-optimization-v1:%' AND json_extract(opt.value,'$.photoId')=p.id AND json_extract(opt.value,'$.sha256')=p.sha256) AND ${workspaceJobScope()} ORDER BY p.id LIMIT 21`).bind(350*1024,after,m.user_id).all()).results;
  const more=rows.length>20,photos=rows.slice(0,20).map(p=>({id:p.id,jobId:p.job_id,name:p.name,size:p.size,mimeType:p.mime_type,sha256:p.sha256,url:'/api/jobs/'+encodeURIComponent(p.job_id)+'/service/photos/'+encodeURIComponent(p.id)}));return json({photos,next:more?photos.at(-1).id:null});
 }
 if(!match[1]||method!=='PUT')fail(405,'Nepodporovaná operace.');if(await env.DB.prepare("SELECT id FROM system_backups WHERE state IN ('building','restoring') LIMIT 1").first())fail(409,'Probíhá úplná záloha nebo obnova. Počkejte na její dokončení.');
 const bytes=await boundedBytes(request,5*1024*1024),form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')||''},body:bytes}).formData(),sourceSha=form.get('sourceSha256'),image=form.get('image');
 if(typeof sourceSha!=='string'||!/^[a-f0-9]{64}$/.test(sourceSha)||!image||typeof image.arrayBuffer!=='function')fail(400,'Neplatná optimalizace.');
 const photo=await env.DB.prepare("SELECT * FROM service_photos WHERE id=? AND status='ready'").bind(match[1]).first();if(!photo)fail(404,'Fotografie nebyla nalezena.');await subWorkJob(env,m,photo.job_id,fail,true);
 const data=new Uint8Array(await image.arrayBuffer()),type=image.type,dims=optimizedImageDimensions(data,type);if(!dims||dims.width<1||dims.height<1||Math.max(dims.width,dims.height)>2560||data.length<100)fail(400,'Zmenšený obrázek není platný JPG/PNG do 2560 px.');
 const sha=await subHashForPhoto(data);if(photo.sha256===sha){if(sourceSha===sha||await photoOptimizationReplay(env,photo,sourceSha))return json({ok:true,replayed:true,photo:{id:photo.id,size:photo.size}});fail(409,'Fotografie se mezitím změnila.');}
 if(photo.sha256!==sourceSha)fail(409,'Fotografie se mezitím změnila. Načtěte ji znovu.');if(data.length>=photo.size*.9)fail(400,'Úspora musí být nejméně 10 %.');
 const key='service/'+photo.job_id+'/'+photo.id+'/'+sha,oldKey=photo.object_key,now=Date.now(),name=type==='image/jpeg'?photo.name.replace(/\.(?:jpe?g|png|hei[cf])$/i,'')+'.jpg':photo.name;
 await env.BUCKET.put(key,data,{httpMetadata:{contentType:type}});
 try{
  const saved=await env.BUCKET.get(key);if(!saved||await subHashForPhoto(new Uint8Array(await saved.arrayBuffer()))!==sha)fail(503,'Novou kopii se nepodařilo ověřit. Původní fotografie zůstala.');await authorize();await subWorkJob(env,m,photo.job_id,fail,true);
  const gate=`EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role IN ('owner','administrator')) AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=service_photos.job_id AND j.deleted=0 AND ${workspaceJobScope()})`,args=[m.user_id,m.user_id],log={photoId:photo.id,jobId:photo.job_id,sourceSha256:sourceSha,sha256:sha,oldSize:photo.size,size:data.length,at:now,by:m.user_id};
  const result=await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO settings(key,value,version) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM service_photos WHERE id=? AND sha256=? AND object_key=? AND ${gate})`).bind(photoOptimizationKey(photo.id,sourceSha),JSON.stringify(log),photo.id,sourceSha,oldKey,...args),
   env.DB.prepare(`UPDATE service_photos SET object_key=?,mime_type=?,size=?,name=?,sha256=?,gallery_thumbnail_key=NULL,gallery_version=gallery_version+1 WHERE id=? AND sha256=? AND object_key=? AND status='ready' AND ${gate}`).bind(key,type,data.length,name,sha,photo.id,sourceSha,oldKey,...args)
  ]);if(!result[1].meta.changes)fail(409,'Fotografii nebo oprávnění mezitím změnil jiný uživatel.');
 }catch(error){const current=await env.DB.prepare('SELECT object_key FROM service_photos WHERE id=?').bind(photo.id).first();if(current?.object_key!==key)await env.BUCKET.delete(key).catch(()=>{});throw error;}
 // Only now does the verified replacement become the sole stored copy.
 let cleanupPending=false;try{await env.BUCKET.delete(oldKey);}catch{cleanupPending=true;}
 return json({ok:true,photo:{id:photo.id,size:data.length},savedBytes:photo.size-data.length,cleanupPending});
}
async function subHashForPhoto(data){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');}
