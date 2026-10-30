// One physical Site/D1/R2 per company. No user-supplied tenant routing.
export async function installationInfo(env){const row=await env.DB.prepare("SELECT * FROM installation_state WHERE singleton='primary'").first();return {id:row.instance_id,name:env.WORKSPACE_ORGANIZATION_NAME||row.company_name,version:row.version,mode:env.WORKSPACE_ORGANIZATION_ID?'shared-workspace':'isolated',publicUrl:env.PUBLIC_APP_URL||null};}
export async function handleInstallation(request,env,m,h){
 if(!['owner','administrator','admin'].includes(m.role))h.fail(403,'Instalaci spravuje vlastník nebo správce.');
 if(request.method==='GET')return h.json(await installationInfo(env));
 if(request.method!=='PUT')h.fail(405,'Nepodporovaná operace.');if(m.role!=='owner')h.fail(403,'Identitu firmy nastavuje pouze vlastník.');
 const b=await h.body(request,2000),name=h.cleanText(b.name,160,true);if(!Number.isSafeInteger(b.version))h.fail(400,'Obnovte nastavení.');const r=await env.DB.prepare("UPDATE installation_state SET company_name=?,version=version+1 WHERE singleton='primary' AND version=?").bind(name,b.version).run();if(!r.meta.changes)h.fail(409,'Nastavení mezitím změnil jiný uživatel.');return h.json(await installationInfo(env));
}
const checkedInstallationBuckets=new WeakMap();
export async function assertInstallation(env){
 const info=await installationInfo(env);if(env.INSTALLATION_ID&&env.INSTALLATION_ID!==info.id)throw Error('Nesouhlasí vazba firemní databáze.');
 const cached=checkedInstallationBuckets.get(env.BUCKET);if(cached?.id===info.id&&cached.until>Date.now())return;
 const key='__installation.json';let marker=await env.BUCKET.get(key);
 if(!marker){await env.BUCKET.put(key,new TextEncoder().encode(JSON.stringify({instanceId:info.id})),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});marker=await env.BUCKET.get(key);}
 let value;try{value=JSON.parse(await new Response(marker.body).text());}catch{throw Error('Identitu firemního úložiště nelze ověřit.');}if(value.instanceId!==info.id)throw Error('Úložiště patří jiné firemní instalaci.');checkedInstallationBuckets.set(env.BUCKET,{id:info.id,until:Date.now()+300000});
}
