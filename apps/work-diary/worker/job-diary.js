import {subWorkJob,subWorkScope} from './service-work.js';
import {subOne,subAll,subHash,subReplay,subOperation} from './subscriptions.js';
import {subDate,subToday} from '../web/subscription-model.js';

// Progress entries share job authorization, photos and the existing idempotency ledger.
export async function handleJobDiary(request,env,m,h){
 const {json,fail,body,validId,cleanText}=h,url=new URL(request.url),match=url.pathname.match(/^\/api\/jobs\/([-\w]{1,100})\/diary(?:\/([-\w]{1,100}))?$/),method=request.method;
 if(!match)fail(404,'Deník realizace není dostupný.');
 const jobId=match[1],entryId=match[2],manager=['owner','administrator','admin'].includes(m.role),job=await subWorkJob(env,m,jobId,fail,method!=='GET');
 if(job.job_type!=='installation')fail(404,'Deník je dostupný u zakázek typu Realizace.');
 const jobDTO={id:job.id,title:job.title,jobType:job.job_type,gardenId:job.garden_id,discipline:job.discipline,status:job.deleted?'cancelled':job.status,version:job.version,cancelled:!!job.deleted};
 const photoIndex=new Map();
 async function hydratePhotos(rows){
  const ids=[...new Set(rows.flatMap(row=>JSON.parse(row.photo_ids)))];if(!ids.length)return;
  const drive=h.features.googleDrive!==false&&h.features.drivePhotos!==false;
  const photos=await subAll(env.DB,"SELECT id,name,mime_type,size,'service' AS source FROM service_photos WHERE job_id=? AND status='ready' AND id IN (SELECT value FROM json_each(?))"+(drive?" UNION ALL SELECT id,original_name AS name,mime_type,size,'drive' AS source FROM job_photos WHERE job_id=? AND status='complete' AND id IN (SELECT value FROM json_each(?))":""),jobId,JSON.stringify(ids),...(drive?[jobId,JSON.stringify(ids)]:[]));
  for(const photo of photos)if(!photoIndex.has(photo.id))photoIndex.set(photo.id,{id:photo.id,name:photo.name,mimeType:photo.mime_type,size:photo.size,url:'/api/jobs/'+jobId+(photo.source==='service'?'/service/photos/'+photo.id:'/photos/'+photo.id+'/content')});
 }
 async function dto(row){
  const ids=JSON.parse(row.photo_ids),photos=ids.map(id=>photoIndex.get(id)).filter(Boolean);
  return {id:row.id,jobId,date:row.date,work:row.work,material:row.material,notes:row.notes,nextStep:row.next_step,photoIds:ids,photos,version:row.version,createdBy:row.created_by,authorName:row.author_name,updatedBy:row.updated_by,updatedByName:row.updated_by_name,createdAt:row.created_at,updatedAt:row.updated_at,canEdit:!job.deleted&&(manager||m.role==='worker'&&row.created_by===m.user_id)};
 }
 async function detail(row){await hydratePhotos([row]);return dto(row);}

 const read=()=>subOne(env.DB,'SELECT * FROM job_diary_entries WHERE id=? AND job_id=?',entryId,jobId);
 if(method==='GET'){
  if(entryId){const row=await read();if(!row)fail(404,'Zápis neexistuje.');return json({job:jobDTO,entry:await detail(row)});}
  let cursor=null;if(url.searchParams.has('cursor')){try{cursor=JSON.parse(atob(url.searchParams.get('cursor')));}catch{fail(400,'Neplatná stránka deníku.');}if(!Array.isArray(cursor)||cursor.length!==2||!subDate(cursor[0])||!/^[-\w]{1,100}$/.test(cursor[1]))fail(400,'Neplatná stránka deníku.');}
  const rows=await subAll(env.DB,'SELECT * FROM job_diary_entries WHERE job_id=?'+(cursor?' AND (date<? OR (date=? AND id<?))':'')+' ORDER BY date DESC,id DESC LIMIT 51',jobId,...(cursor?[cursor[0],cursor[0],cursor[1]]:[])),more=rows.length>50,selected=rows.slice(0,50),last=selected.at(-1);
  await hydratePhotos(selected);return json({job:jobDTO,entries:await Promise.all(selected.map(dto)),nextCursor:more?btoa(JSON.stringify([last.date,last.id])):null});
 }
 if(method!=='PUT'||!entryId)fail(405,'Deník ukládá jednotlivé denní zápisy.');
 validId(entryId);const input=await body(request,100000);if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Neplatný zápis.');
 const operationId=validId(input.operationId),hash=await subHash(JSON.stringify({kind:'jobDiary',jobId,entryId,input}));
 if(await subReplay(env,operationId,m.user_id,jobId,hash,fail)){const row=await read();if(!row)fail(409,'Původní zápis není dostupný.');return json({job:jobDTO,entry:await detail(row),replayed:true});}
 const old=await subOne(env.DB,'SELECT * FROM job_diary_entries WHERE id=?',entryId);
 if(old&&old.job_id!==jobId)fail(404,'Zápis není dostupný.');
 if(old&&!manager&&old.created_by!==m.user_id)fail(403,'Pracovník může upravit pouze svůj vlastní zápis.');
 if(!Number.isSafeInteger(input.version)||input.version!==(old?.version||0))fail(409,'Zápis mezitím změnil kolega. Porovnejte obě verze.',{code:'diary_conflict'});
 if(!subDate(input.date)||input.date>subToday())fail(400,'Vyberte skutečný den práce, nejpozději dnešní.');
 const work=cleanText(input.work,8000,true),material=cleanText(input.material||'',4000),notes=cleanText(input.notes||'',3000),nextStep=cleanText(input.nextStep||'',3000);
 if(!Array.isArray(input.photoIds)||input.photoIds.length>40||new Set(input.photoIds).size!==input.photoIds.length)fail(400,'Vyberte nejvýše 40 různých fotografií.');
 const photoIds=input.photoIds.map(validId);
 if(photoIds.length){const valid=await subAll(env.DB,"SELECT id FROM service_photos WHERE job_id=? AND status='ready' AND id IN (SELECT value FROM json_each(?)) UNION SELECT id FROM job_photos WHERE job_id=? AND status='complete' AND id IN (SELECT value FROM json_each(?))",jobId,JSON.stringify(photoIds),jobId,JSON.stringify(photoIds));if(valid.length!==photoIds.length)fail(400,'Fotografie nepatří k zakázce nebo ještě není nahraná.');}
 const now=Date.now(),access=`EXISTS(SELECT 1 FROM jobs j WHERE j.id=? AND j.job_type='installation' AND j.deleted=0 AND ${subWorkScope}) AND EXISTS(SELECT 1 FROM members w WHERE w.user_id=? AND w.role IN ('owner','administrator','admin','worker'))`,accessArgs=[jobId,m.user_id,m.user_id],operationGate='EXISTS(SELECT 1 FROM job_diary_entries WHERE id=? AND job_id=? AND version=? AND last_mutation_id=?)',gateArgs=[entryId,jobId,input.version+1,operationId];
 const statement=old?env.DB.prepare(`UPDATE job_diary_entries SET date=?,work=?,material=?,notes=?,next_step=?,photo_ids=?,version=version+1,last_mutation_id=?,updated_at=?,updated_by=?,updated_by_name=? WHERE id=? AND job_id=? AND version=? AND (created_by=? OR EXISTS(SELECT 1 FROM members a WHERE a.user_id=? AND a.role IN ('owner','administrator','admin'))) AND ${access}`).bind(input.date,work,material,notes,nextStep,JSON.stringify(photoIds),operationId,now,m.user_id,m.name||m.user_id,entryId,jobId,input.version,m.user_id,m.user_id,...accessArgs):env.DB.prepare(`INSERT OR IGNORE INTO job_diary_entries(id,job_id,date,work,material,notes,next_step,photo_ids,version,last_mutation_id,created_at,updated_at,created_by,author_name,updated_by,updated_by_name) SELECT ?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,? WHERE ${access}`).bind(entryId,jobId,input.date,work,material,notes,nextStep,JSON.stringify(photoIds),operationId,now,now,m.user_id,m.name||m.user_id,m.user_id,m.name||m.user_id,...accessArgs);
 const result=await env.DB.batch([statement,subOperation(env,operationId,m.user_id,jobId,hash,operationGate,gateArgs)]);
 if(!result[0].meta.changes&&!await subReplay(env,operationId,m.user_id,jobId,hash,fail))fail(409,'Zápis nebo oprávnění se změnily. Obnovte deník.',{code:'diary_conflict'});
 await subWorkJob(env,m,jobId,fail);return json({job:jobDTO,entry:await detail(await read())});
}
