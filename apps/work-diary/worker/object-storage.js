import {tenantPolicy} from './tenant-platform.js';
import {createR2Client,r2Configuration} from './r2-s3.js';
const internalKey=key=>key==='__installation.json'||/^(?:system-backups|workspace-recovery|workspace-transfer)\//.test(key);
const safePart=value=>{if(typeof value!=='string'||!/^[-a-zA-Z0-9_]{1,150}$/.test(value))throw Error('Neplatná identita úložiště.');return value;};
export async function storageLocation(env,key){
 if(typeof key!=='string'||key.startsWith('/')||key.includes('\\')||key.split('/').some(p=>p==='.'||p==='..')||/[\x00-\x1f]/.test(key))throw Error('Neplatný klíč přílohy.');
 const parts=key.split('/'),jobPrefixes=['service','service-thumbnails','job-files','file-thumbnails','job-signatures'],jobId=jobPrefixes.includes(parts[0])?parts[1]:null;let company=env.PLATFORM_COMPANY_ID||env.INSTALLATION_ID;
 if(jobId){safePart(jobId);const org=await env.DB.prepare('SELECT o.id FROM jobs j JOIN workspace_organizations o ON o.discipline=j.discipline WHERE j.id=?').bind(jobId).first();if(org)company=org.id;}
 if(!company){const row=await env.DB.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").first();company=row?.instance_id;}
 const category=({'service':'service-photos','service-thumbnails':'photo-thumbnails','job-files':parts[2]||'other','file-thumbnails':'photo-thumbnails','job-signatures':'customer-signatures','plans':'documentation','shafts':'irrigation-photos','blowout':'irrigation-photos','protocol-emails':'work-reports','vehicles':'vehicle-files'})[parts[0]]||'other';
 return {companyId:safePart(company),jobId,category:safePart(category),physicalKey:'companies/'+safePart(company)+'/jobs/'+(jobId?safePart(jobId):'unassigned')+'/'+safePart(category)+'/'+parts.map(encodeURIComponent).join('/')};
}
export async function storageEvent(env,location,key,operation,code){try{await env.DB.prepare('INSERT INTO object_storage_events(id,company_id,logical_key,actor_id,operation,code,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),location.companyId,key,env._storageActor||'system',operation,code,Date.now()).run();}catch{/* Failed telemetry never grants access or masks the original storage error. */}}
export function createObjectStorage(env,legacy=env.BUCKET){
 if(env._objectStorageWrapped)return legacy;let configured=false,configurationError=null;try{configured=!!r2Configuration(env);}catch(e){configurationError=e;}
 if(!configured&&!configurationError)return legacy;
 const count=async(method,ok,company)=>{try{const a=['PUT','POST','LIST'].includes(method)?1:0,b=['GET','HEAD'].includes(method)?1:0;await env.DB.prepare('INSERT INTO object_storage_operations(company_id,day,class_a,class_b,failures) VALUES(?,?,?,?,?) ON CONFLICT(company_id,day) DO UPDATE SET class_a=class_a+excluded.class_a,class_b=class_b+excluded.class_b,failures=failures+excluded.failures').bind(company,new Date().toISOString().slice(0,10),a,b,ok?0:1).run();}catch{}};
 const remote=company=>createR2Client(env,{count:(method,ok)=>count(method,ok,company)});
 async function indexed(key){return env.DB.prepare('SELECT * FROM object_storage_index WHERE logical_key=?').bind(key).first();}
 return {
  _r2:true,
  async get(key){if(internalKey(key))return legacy.get(key);const row=await indexed(key);if(!row)return legacy.get(key);if(row.state==='deleted')return null;if(row.state!=='ready')return null;if(configurationError)throw configurationError;if(!configured)return legacy.get(key);return remote(row.company_id).get(row.physical_key);},
  async head(key){if(internalKey(key))return legacy.head?legacy.head(key):legacy.get(key);const row=await indexed(key);if(!row)return legacy.head?legacy.head(key):legacy.get(key);if(row.state!=='ready')return null;return remote(row.company_id).head(row.physical_key);},
  async put(key,input,options={}){
   if(internalKey(key))return legacy.put(key,input,options);if(configurationError)throw configurationError;if(!configured||env.R2_STORAGE_ENABLED==='false')return legacy.put(key,input,options);
   const bytes=input instanceof Uint8Array?input:input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(await new Response(input).arrayBuffer()),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join(''),location=await storageLocation(env,key),old=await indexed(key);
   if(old&&old.sha256!==sha)throw Object.assign(Error('Pod tímto klíčem už je rezervovaný jiný obsah.'),{status:409,code:'storage_conflict'});
   if(old?.state==='ready'){if(old.sha256!==sha)throw Object.assign(Error('Pod tímto klíčem již existuje jiný soubor.'),{status:409,code:'storage_conflict'});return {size:old.size};}
   let limit=null;const policy=await env.DB.prepare('SELECT storage_limit_bytes FROM workspace_organization_policies WHERE organization_id=? AND active=1 AND expires_at>?').bind(location.companyId,Date.now()).first();if(policy)limit=policy.storage_limit_bytes;else{limit=(await tenantPolicy(env))?.storageLimitBytes??null;}if(env.R2_COMPANY_LIMIT_BYTES){const configuredLimit=Number(env.R2_COMPANY_LIMIT_BYTES);limit=limit===null?configuredLimit:Math.min(limit,configuredLimit);}
   if(limit!==null&&(!Number.isSafeInteger(limit)||limit<0))throw Object.assign(Error('Neplatný kapacitní limit.'),{status:503,code:'storage_configuration'});
   const gate='(? IS NULL OR (SELECT COALESCE(SUM(size),0) FROM object_storage_index WHERE company_id=? AND state IN (\'pending\',\'ready\'))+? - COALESCE((SELECT size FROM object_storage_index WHERE logical_key=? AND company_id=? AND state IN (\'pending\',\'ready\')),0)<=?)';
   const reservation=await env.DB.prepare(`INSERT INTO object_storage_index(logical_key,company_id,physical_key,category,job_id,size,sha256,mime_type,state,version,updated_at) SELECT ?,?,?,?,?,?,?,?,'pending',1,? WHERE ${gate} ON CONFLICT(logical_key) DO UPDATE SET size=excluded.size,sha256=excluded.sha256,mime_type=excluded.mime_type,state='pending',version=object_storage_index.version+1,updated_at=excluded.updated_at WHERE object_storage_index.company_id=excluded.company_id AND object_storage_index.state<>'ready'`).bind(key,location.companyId,location.physicalKey,location.category,location.jobId,bytes.length,sha,options.httpMetadata?.contentType||'application/octet-stream',Date.now(),limit,location.companyId,bytes.length,key,location.companyId,limit).run();
   if(!reservation.meta.changes)throw Object.assign(Error('Kapacita firmy je vyčerpaná. Soubor zůstává ve frontě.'),{status:413,code:'storage_quota_exceeded'});
   try{const result=await remote(location.companyId).put(location.physicalKey,bytes,options);await env.DB.prepare("UPDATE object_storage_index SET state='ready',updated_at=? WHERE logical_key=? AND sha256=?").bind(Date.now(),key,sha).run();await storageEvent(env,location,key,'upload','ready');return result;}catch(error){await env.DB.prepare("UPDATE object_storage_index SET state='failed',updated_at=? WHERE logical_key=? AND sha256=? AND state='pending'").bind(Date.now(),key,sha).run();await storageEvent(env,location,key,'upload','failed');throw error;}
  },
  async delete(keys){if(Array.isArray(keys)){for(const key of keys)await this.delete(key);return;}const key=keys;if(internalKey(key))return legacy.delete(key);const row=await indexed(key);if(row&&row.state!=='deleted'){if(configurationError)throw configurationError;await remote(row.company_id).delete(row.physical_key);await env.DB.prepare("UPDATE object_storage_index SET state='deleted',updated_at=? WHERE logical_key=?").bind(Date.now(),key).run();await storageEvent(env,{companyId:row.company_id},key,'delete','deleted');}await legacy.delete(key);},
  async list(options){return legacy.list(options);},
  async signedURL(key,options){const row=await indexed(key);if(!row||row.state!=='ready'||!configured)return null;return remote(row.company_id).presign(row.physical_key,options);},
  async status(){return {provider:configured?'r2-s3':'hosting',configured,error:configurationError?'configuration_incomplete':null};}
 };
}
