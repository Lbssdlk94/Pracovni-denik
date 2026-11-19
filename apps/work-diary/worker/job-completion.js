import {workspaceJobScope} from './workspace-policy.js';
import {subHash} from './subscriptions.js';
// Independent estimate versions; status, attendance and protocols are untouched.
export async function handleJobCompletion(request,env,m,id,h){
 const {body,fail,validId,expectedVersion,cleanText}=h,target=new URL(request.url).pathname.endsWith('/completion-target'),kind=target?'target':'estimate',table=target?'job_completion_targets':'job_completion',field=target?'points':'percent';
 const one=(sql,...args)=>env.DB.prepare(sql).bind(...args).first(),scope=workspaceJobScope();
 if(!await one(`SELECT 1 FROM jobs j WHERE j.id=? AND j.deleted=0 AND ${scope}`,id,m.user_id))fail(404,'Zakázka není dostupná.');
 if(request.method!=='PATCH')fail(405,'Odhad uložte pomocí PATCH.');
 const roles=target?['owner','administrator','admin']:['owner','administrator','admin','worker'];if(!roles.includes(m.role))fail(403,target?'Hranici posunu nastavuje správce.':'Odhad upravuje pracovník nebo správce.');
 const b=await body(request,5000),keys=target?['operationId','version','points']:['operationId','version','percent','note'];if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!keys.includes(k)))fail(400,'Neplatné údaje odhadu.');
 validId(b.operationId);const version=expectedVersion(b.version),value=b[field];if(!Number.isInteger(value)||value<(target?1:0)||value>100)fail(400,target?'Hranice musí být celé číslo od 1 do 100 bodů.':'Zadejte celé procento od 0 do 100.');
 if(!target&&b.note!==undefined)cleanText(b.note,1000);
 const hash=await subHash(JSON.stringify({kind,version,value,note:b.note??null})),existing=()=>one('SELECT * FROM job_completion_events WHERE id=?',b.operationId),same=event=>event&&event.job_id===id&&event.actor_id===m.user_id&&event.request_hash===hash;
 const replay=await existing();if(replay){if(!same(replay))fail(409,'Identifikátor už patří jiné změně.',{code:'completion_conflict'});return {replayed:true};}
 const old=await one(`SELECT * FROM ${table} WHERE job_id=?`,id);if((old?.version||0)!==version)fail(409,'Údaj mezitím změnil kolega. Obnovte aktuální odhad a před přepsáním jej porovnejte.',{code:'completion_conflict'});
 const now=Date.now(),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date(now)).slice(0,10),note=target?'':cleanText(b.note??(old?.day===day?old.note:''),1000),baselinePercent=old?.day===day?old.baseline_percent:old?.percent??null,baselineDay=old?.day===day?old.baseline_day:old?.day??null;
 const liveRoles=target?"('owner','administrator','admin')":"('owner','administrator','admin','worker')",gate=`EXISTS(SELECT 1 FROM jobs j JOIN members writer ON writer.user_id=? WHERE j.id=? AND j.deleted=0 AND writer.role IN ${liveRoles} AND ${scope}) AND NOT EXISTS(SELECT 1 FROM workspaces WHERE state<>'active') AND COALESCE((SELECT version FROM ${table} WHERE job_id=?),0)=?`;
 const statements=[env.DB.prepare(`INSERT INTO job_completion_events(id,job_id,actor_id,actor_name,at,day,kind,base_version,before_value,value,note,request_hash,valid) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ${gate} THEN 1 ELSE 0 END)`).bind(b.operationId,id,m.user_id,m.name,now,day,kind,version,old?.[field]??null,value,note,hash,m.user_id,id,m.user_id,id,version)];
 if(target)statements.push(env.DB.prepare('INSERT INTO job_completion_targets(job_id,points,version,updated_by,updated_name,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET points=excluded.points,version=excluded.version,updated_by=excluded.updated_by,updated_name=excluded.updated_name,updated_at=excluded.updated_at').bind(id,value,version+1,m.user_id,m.name,now));
 else statements.push(env.DB.prepare('INSERT INTO job_completion(job_id,percent,version,updated_by,updated_name,updated_at,day,baseline_percent,baseline_day,note) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET percent=excluded.percent,version=excluded.version,updated_by=excluded.updated_by,updated_name=excluded.updated_name,updated_at=excluded.updated_at,day=excluded.day,baseline_percent=excluded.baseline_percent,baseline_day=excluded.baseline_day,note=excluded.note').bind(id,value,version+1,m.user_id,m.name,now,day,baselinePercent,baselineDay,note));
 // Invalidate existing monthly snapshots through the original job revision mechanism.
 statements.push(env.DB.prepare('UPDATE jobs SET version=version+1 WHERE id=?').bind(id));
 try{await env.DB.batch(statements);}catch(e){if(same(await existing()))return {replayed:true};if(/job_completion|CHECK constraint failed|UNIQUE constraint failed/.test(String(e.message)))fail(409,'Odhad nebo oprávnění se změnily. Původní údaje zůstaly zachované.',{code:'completion_conflict'});throw e;}
 return {};
}
