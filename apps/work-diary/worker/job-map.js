import {normalizeAddress,parseAddressCandidates} from '../web/nearby.js';
import {jobMapAddress} from '../web/job-map-model.js';
export function jobGeocode(row){return row.map_address===normalizeAddress(jobMapAddress(row))&&row.map_candidates?{address:row.map_address,candidates:JSON.parse(row.map_candidates),selectedId:row.map_selected_id,version:row.map_version,checkedAt:row.map_checked_at}:null;}
export async function handleJobGeocode(request,env,m,h,find){
 if(!['owner','administrator','admin'].includes(m.role))h.fail(403,'Mapa zakázek je dostupná pouze správci a vlastníkovi.');
 const {one,execute,body,json,fail,expectedVersion,checkGeocodeRate,boundedBytes}=h;
 if(h.features.jobMap===false||h.features.location===false)fail(403,'Mapa zakázek nebo poloha je v nastavení vypnutá.');
 let job=await find();if(!job)fail(404,'Zakázka nebyla nalezena.');
 if(!['POST','PUT'].includes(request.method))fail(405,'Nepodporovaná operace.');
 const address=jobMapAddress(job),key=normalizeAddress(address);if(!key)fail(400,'Nejprve doplňte adresu zakázky.');
 const b=await body(request,2000);if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Neplatné údaje polohy.');if(b.address!==key)fail(409,'Adresa zakázky se změnila. Obnovte mapu.');
 const cached=await one(env.DB,'SELECT * FROM job_geocodes WHERE job_id=?',job.id);
 if(request.method==='PUT'){
  const version=expectedVersion(b.version);if(!cached||cached.address!==key||!JSON.parse(cached.candidates).some(c=>c.id===b.selectedId))fail(409,'Výběr polohy už není aktuální. Obnovte mapu.');
  const result=await execute(env.DB,`UPDATE job_geocodes SET selected_id=?,version=version+1 WHERE job_id=? AND address=? AND version=? AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=job_geocodes.job_id AND j.deleted=0 AND j.address=? AND j.city=? AND EXISTS(SELECT 1 FROM members a WHERE a.user_id=? AND a.role IN ('owner','administrator','admin')))`,b.selectedId,job.id,key,version,job.address,job.city,m.user_id);
  if(!result.meta.changes)fail(409,'Polohu nebo oprávnění mezitím změnil kolega. Obnovte mapu.');
 }else if(request.method==='POST'){
  const now=Date.now();
  if(!cached||cached.address!==key||!JSON.parse(cached.candidates).length&&now-cached.checked_at>86400000){
   await checkGeocodeRate(env);const url=new URL('https://photon.komoot.io/api/');url.searchParams.set('q',address);url.searchParams.set('limit','5');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let candidates;
   try{const response=await fetch(url,{headers:{accept:'application/json','User-Agent':'ZavlahovyDenik/1.0'},signal:controller.signal});if(!response.ok)throw Error();candidates=parseAddressCandidates(JSON.parse(new TextDecoder().decode(await boundedBytes(response,300000))));}catch{fail(503,'Polohu se nepodařilo dohledat. Zkuste to znovu.');}finally{clearTimeout(timer);}
   // Address edits, deletion and assignment revocation during the network request must not leak its result.
   const latest=await find();if(!latest)fail(404,'Zakázka už vám není dostupná.');if(normalizeAddress(jobMapAddress(latest))!==key)fail(409,'Adresa se během hledání změnila. Obnovte mapu.');
   await execute(env.DB,`INSERT INTO job_geocodes(job_id,address,candidates,selected_id,checked_at,version) SELECT ?,?,?,NULL,?,1 WHERE EXISTS(SELECT 1 FROM jobs j WHERE j.id=? AND j.deleted=0 AND j.address=? AND j.city=? AND EXISTS(SELECT 1 FROM members a WHERE a.user_id=? AND a.role IN ('owner','administrator','admin'))) ON CONFLICT(job_id) DO UPDATE SET address=excluded.address,candidates=excluded.candidates,selected_id=NULL,checked_at=excluded.checked_at,version=job_geocodes.version+1 WHERE job_geocodes.address<>excluded.address OR (job_geocodes.candidates='[]' AND job_geocodes.checked_at<?)`,job.id,key,JSON.stringify(candidates),now,job.id,job.address,job.city,m.user_id,now-86400000);
  }
 }else fail(405,'Nepodporovaná operace.');
 job=await find();if(!job)fail(404,'Zakázka už vám není dostupná.');if(normalizeAddress(jobMapAddress(job))!==key)fail(409,'Adresa se změnila. Obnovte mapu.');return json({geocode:jobGeocode(job)});
}
