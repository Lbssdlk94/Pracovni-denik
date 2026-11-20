import {protocolDefaultTemplates,protocolSections,protocolMissing,protocolCanonical} from '../web/protocol-model.js';
import {subOne,subAll,subHash} from './subscriptions.js';
import {workspacePreferenceKey} from './workspace-context.js';
import {timeDetail} from './job-time.js';
export async function protocolDesignAvailable(env){return (await subAll(env.DB,"PRAGMA table_info(service_reports)")).some(c=>c.name==='protocol_details');}
const protocolAdmin="EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ('owner','administrator','admin'))";
export async function protocolConfiguration(env){const row=await subOne(env.DB,'SELECT value,version FROM settings WHERE key=?',workspacePreferenceKey(env,'protocol-templates'));return {templates:row?JSON.parse(row.value):protocolDefaultTemplates(),version:row?.version||0};}
export async function handleProtocolTemplates(request,env,m,h){
 const {json,fail,body,cleanText,validId}=h,config=await protocolConfiguration(env);if(request.method==='GET')return json(config);
 if(!['owner','administrator','admin'].includes(m.role))fail(403,'Šablony upravuje správce.');if(request.method!=='PUT')fail(405,'Nepodporovaná operace.');
 const b=await body(request,100000);if(!Number.isSafeInteger(b.version)||b.version!==config.version)fail(409,'Šablony mezitím někdo změnil. Obnovte je.');if(!Array.isArray(b.templates)||b.templates.length<1||b.templates.length>50)fail(400,'Uložte 1 až 50 šablon.');const ids=new Set();
 const templates=b.templates.map(t=>{const id=validId(t.id);if(ids.has(id))fail(400,'ID šablon se nesmí opakovat.');ids.add(id);if(!['irrigation','garden','both'].includes(t.discipline)||!Array.isArray(t.jobTypes)||!t.jobTypes.length||t.jobTypes.some(k=>!['service','installation','survey'].includes(k)))fail(400,'Vyberte kategorii a typ zakázky.');if(!Array.isArray(t.sections)||t.sections.some(k=>!protocolSections.includes(k))||!Array.isArray(t.required)||t.required.some(k=>!['date',...protocolSections].includes(k))||t.required.some(k=>k!=='date'&&!t.sections.includes(k)))fail(400,'Povinné údaje musí mít dostupnou sekci.');if(t.signatureRequired&&!t.sections.includes('signature')||t.photosRequired&&!t.sections.includes('photos'))fail(400,'Povinný podpis/fotografie musí mít dostupnou sekci.');if(!Array.isArray(t.activities)||t.activities.length>100)fail(400,'Nejvýše 100 činností v šabloně.');const acts=new Set();return {id,name:cleanText(t.name,100,true),discipline:t.discipline,jobTypes:[...new Set(t.jobTypes)],version:config.version+1,active:t.active===true,sections:[...new Set(t.sections)],required:[...new Set(['date',...t.required])],signatureRequired:t.signatureRequired===true,photosRequired:t.photosRequired===true,customerNotes:t.customerNotes===true,activities:t.activities.map(a=>{const id=validId(a.id);if(acts.has(id))fail(400,'ID činností se nesmí opakovat.');acts.add(id);return {id,title:cleanText(a.title,200,true),active:a.active===true};})};});
 const key=workspacePreferenceKey(env,'protocol-templates'),next=config.version+1,historyKey=workspacePreferenceKey(env,'protocol-template-history:'+crypto.randomUUID());const results=await env.DB.batch([
 env.DB.prepare(`INSERT INTO settings(key,value,version) SELECT ?,?,1 WHERE ${protocolAdmin} ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=settings.version+1 WHERE settings.version=? AND ${protocolAdmin}`).bind(key,JSON.stringify(templates),m.user_id,b.version,m.user_id),
 env.DB.prepare('INSERT INTO settings(key,value,version) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND version=? AND value=?)').bind(historyKey,JSON.stringify({before:config.templates,after:templates,author:m.user_id,at:Date.now()}),key,next,JSON.stringify(templates))]);if(!results[0].meta.changes)fail(409,'Šablony nebo oprávnění se změnily.');return json(await protocolConfiguration(env));
}
export async function protocolTimeSnapshot(env,m,job,fail){
 const ledger=await timeDetail(env,m,job,fail);return {capturedAt:ledger.serverNow,workers:ledger.states.map(s=>({userId:s.userId,name:s.name})),intervals:ledger.intervals.map(i=>({id:i.id,userId:i.userId,kind:i.kind,startAt:i.startAt,endAt:i.endAt})),provisional:ledger.intervals.some(i=>i.endAt===null)};
}
export async function protocolDesignRead(env,m,job,report,fail){
 const config=await protocolConfiguration(env),details=report?.protocol_details?JSON.parse(report.protocol_details):{},templates=config.templates.filter(t=>(t.discipline==='both'||t.discipline===(job.discipline||'irrigation'))&&t.jobTypes.includes(job.job_type));
 const delivery=m.role==='owner'?await subAll(env.DB,"SELECT id,state,sent_at,recipient,report_version,job_version FROM protocol_emails WHERE job_id=? ORDER BY created_at DESC LIMIT 30",job.id):[];
 return {schema:1,templates,templateVersion:config.version,details,time:await protocolTimeSnapshot(env,m,job,fail),delivery:delivery.map(r=>({...r,stale:r.report_version!==report?.version||r.job_version!==job.version}))};
}
export async function protocolDesignResolve(env,m,job,input,report,previous,finalize,fail){
 const old=previous?.protocol_details?JSON.parse(previous.protocol_details):{},modern=input.protocolDetails?.schema===1||old.schema===1;if(!modern)return {};
 const draft=input.protocolDetails||old,config=await protocolConfiguration(env),selected=config.templates.find(t=>t.id===draft.templateId&&t.active&&t.jobTypes.includes(job.job_type)&&(t.discipline==='both'||t.discipline===(job.discipline||'irrigation'))),template=old.template?.id===draft.templateId?old.template:selected;
 if(!template)fail(400,'Vyberte dostupnou šablonu protokolu.');
 const clean=(v,n=3000)=>{if(typeof v!=='string'||v.length>n)fail(400,'Zkontrolujte text protokolu.');return v.trim();};
 if(!Array.isArray(draft.activities)||draft.activities.length>100)fail(400,'Zkontrolujte servisní činnosti.');const activityIds=[...new Set(draft.activities.map(a=>typeof a==='string'?a:a.id))];const activities=activityIds.map(id=>{const a=template.activities.find(a=>a.id===id&&(a.active||old.activities?.some(v=>v.id===id)));if(!a)fail(400,'Činnost není dostupná v šabloně.');return {id:a.id,title:a.title};});
 const photos=(draft.photos||[]);if(!Array.isArray(photos)||photos.length>40||photos.some(p=>!report.photoIds.includes(p.id)||typeof p.includePDF!=='boolean'))fail(400,'Zkontrolujte fotografie protokolu.');
 const details={schema:1,templateId:template.id,template,activities,customWork:clean(draft.customWork??input.work??'',8000),photos:photos.map(p=>({id:p.id,caption:clean(p.caption||'',500),includePDF:p.includePDF})),customerNotes:template.customerNotes===true&&draft.customerNotes===true,timeSnapshot:old.timeSnapshot&&!draft.refreshTime?old.timeSnapshot:await protocolTimeSnapshot(env,m,job,fail)};
 report.work=[...activities.map(a=>'• '+a.title),details.customWork].filter(Boolean).join('\n');
 const hash=await subHash(protocolCanonical({date:report.date,work:report.work,material:report.material,materialItems:report.materialItems,workCharges:report.workCharges,defects:report.defects,notes:details.customerNotes?report.notes:'',recommendations:report.recommendations,photoIds:report.photoIds,photos:details.photos,template, timeSnapshot:details.timeSnapshot}));
 const requested=draft.signature||{},oldSignature=old.signature||{};let signature={status:'missing'};
 if(requested.status==='signed'&&report.customerSignature){
  if(oldSignature.status==='signed'&&oldSignature.contentHash===hash&&previous.customer_signature===report.customerSignature)signature=oldSignature;
  else if(draft.confirmSignature===true){if(!Number.isSafeInteger(requested.signedAt)||requested.signedAt>Date.now()+120000||requested.signedAt<Date.now()-31*86400000)fail(400,'Zkontrolujte čas podpisu.');signature={status:'signed',name:clean(requested.name||job.customer_name||'',160),signedAt:requested.signedAt,recordedAt:Date.now(),signedVersion:(previous?.version||0)+1,contentHash:hash};}
  else{report.customerSignature='';signature={status:'invalidated',previousSignedAt:oldSignature.signedAt||null};}
 }else if(['absent','refused'].includes(requested.status)){report.customerSignature='';signature={status:requested.status,name:clean(requested.name||'',160),at:Number.isSafeInteger(requested.at)?requested.at:Date.now()};}
 else if(oldSignature.status==='signed'&&oldSignature.contentHash!==hash){report.customerSignature='';signature={status:'invalidated',previousSignedAt:oldSignature.signedAt};}
 details.signature=signature;details.contentHash=hash;report.protocolDetails=details;
 if(finalize){const missing=protocolMissing(report,template);if(missing.length)fail(400,'Protokol není připravený. Doplňte povinné údaje.',{code:'protocol_incomplete',missing});}
 return details;
}
