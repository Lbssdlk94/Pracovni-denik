import {volumeFixtureStatements,volumeFixturePreview} from './volume-fixture-cleanup-statements.js';
import {assertInstallation} from './installation.js';
// Dedicated expiring maintenance capability; never grants a member identity or accepts records/SQL.
export async function handleVolumeFixtureCleanup(request,env,h){
 const {fail,json,accessHash,boundedBytes}=h;
 if(request.method!=='POST'||!env.APPROVED_VOLUME_CLEANUP)fail(404,'Nenalezeno.');
 let cap;try{cap=JSON.parse(env.APPROVED_VOLUME_CLEANUP);}catch{fail(503,'Úklid není připraven.');}
 const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1],hash=token?await accessHash(token):'';let diff=hash.length^String(cap.tokenHash).length;
 for(let i=0;i<64;i++)diff|=(hash.charCodeAt(i)||0)^(String(cap.tokenHash).charCodeAt(i)||0);
 if(!token||diff||cap.batch!=='volume-20261027'||!Number.isSafeInteger(cap.expiresAt)||cap.expiresAt<Date.now()||cap.expiresAt>Date.now()+1800000)fail(401,'Pověření k úklidu vypršelo nebo není platné.');
 if((await boundedBytes(request,1000)).byteLength)fail(400,'Úklid přijímá pouze pevnou schválenou sadu.');
 await assertInstallation(env);if(!env.PUBLIC_APP_URL||cap.origin!==new URL(env.PUBLIC_APP_URL).origin||new URL(request.url).origin!==cap.origin)fail(403,'Pověření patří jiné instalaci.');
 if(!await env.DB.prepare("SELECT 1 FROM members WHERE user_id=? AND role='owner'").bind(cap.ownerId).first())fail(403,'Pověření již nemá platného vlastníka.');
 const mode=new URL(request.url).searchParams.get('mode');if(!['preview','apply'].includes(mode))fail(400,'Vyberte kontrolu nebo provedení.');
 const key='cleanup:volume-20261027:20261104',before=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
 if(mode==='preview'&&!before){const rows=(await env.DB.prepare(volumeFixturePreview).all()).results;return json({batch:cap.batch,mode,customers:rows.length,gardens:rows.length});}
 if(mode==='apply'&&!before){const gate="EXISTS(SELECT 1 FROM members WHERE user_id=? AND role='owner')";await env.DB.batch([...volumeFixtureStatements.map((sql,index)=>env.DB.prepare(index===0?sql.replace('WHERE c.deleted=0','WHERE '+gate+' AND c.deleted=0'):sql.replace(/;$/, '')+' AND '+gate).bind(cap.ownerId)),env.DB.prepare("UPDATE settings SET value=json_set(value,'$.approvedBy',?,'$.authorization','scoped-maintenance','$.origin',?) WHERE key=?").bind(cap.ownerId,cap.origin,key)]);}
 const row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first(),plan=row?JSON.parse(row.value):{families:[]};
 const counts=await env.DB.prepare(`SELECT
  (SELECT COUNT(*) FROM customers WHERE deleted=1 AND id IN (SELECT json_extract(value,'$.customerId') FROM json_each(?,'$.families'))) customers,
  (SELECT COUNT(*) FROM gardens WHERE deleted=1 AND id IN (SELECT json_extract(value,'$.gardenId') FROM json_each(?,'$.families'))) gardens,
  (SELECT COUNT(*) FROM jobs WHERE deleted=1 AND id IN (SELECT json_extract(j.value,'$.id') FROM json_each(?,'$.families') f,json_each(f.value,'$.jobs') j WHERE json_extract(j.value,'$.deleted')=0)) jobs`).bind(JSON.stringify(plan),JSON.stringify(plan),JSON.stringify(plan)).first();
 return json({batch:cap.batch,mode,...counts,replayed:!!before});
}
