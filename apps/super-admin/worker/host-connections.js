// Hosting-operator receipts for already-created companies, configured through secret runtime settings.
// No browser request can supply these receipts, create a company or acquire tenant-content access.
import {one,id,email,integer} from './http.js';
import {digest} from './crypto.js';
export async function bootstrapHostConnections(env){
 if(!env.PLATFORM_HOST_CONNECTIONS)return;
 const receipts=JSON.parse(env.PLATFORM_HOST_CONNECTIONS);if(!Array.isArray(receipts)||receipts.length>20)throw Error('Invalid host connection receipts');
 for(const r of receipts){
  id(r.companyId);id(r.operationId);id(r.installationId);const expectedEmail=email(r.adminEmail),version=integer(r.version,1,100000000,'verzi');
  const origin=new URL(r.appUrl);if(origin.protocol!=='https:'||origin.origin!==r.appUrl||origin.username||origin.password||!/^inst-[-a-zA-Z0-9]{10,80}$/.test(r.installationId)||!/^[-_A-Za-z0-9]{43}$/.test(r.tokenHash)||!Number.isSafeInteger(r.expiresAt))throw Error('Invalid host connection receipt');
  const hash=await digest(JSON.stringify(r)),old=await one(env.DB,'SELECT * FROM platform_operations WHERE id=?',r.operationId);
  if(old){if(old.actor_id!=='system:hosting'||old.hash!==hash)throw Error('Host connection receipt collision');continue;}
  if(r.expiresAt<Date.now()||r.expiresAt>Date.now()+7*86400000)continue;
  const c=await one(env.DB,'SELECT * FROM platform_companies WHERE id=?',r.companyId);
  // Stale receipts must never reset an operator's edits, licence or connection.
  if(!c||c.version!==version||c.provision_status!=='awaiting_host'||c.installation_id||c.app_url||c.token_hash||JSON.parse(c.profile).adminEmail.toLowerCase()!==expectedEmail)continue;
  const now=Date.now(),gate='EXISTS(SELECT 1 FROM platform_operations WHERE id=?)',result=await env.DB.batch([
   env.DB.prepare("INSERT INTO platform_operations(id,actor_id,hash,response,created_at) SELECT ?,'system:hosting',?,?,? WHERE EXISTS(SELECT 1 FROM platform_companies WHERE id=? AND version=? AND provision_status='awaiting_host' AND installation_id IS NULL AND app_url IS NULL AND token_hash IS NULL AND lower(json_extract(profile,'$.adminEmail'))=?)").bind(r.operationId,hash,JSON.stringify({id:c.id}),now,c.id,version,expectedEmail),
   env.DB.prepare('INSERT INTO platform_company_history(id,company_id,kind,snapshot,actor_id,created_at) SELECT ?,?,?,?,\'system:hosting\',? WHERE '+gate).bind(crypto.randomUUID(),c.id,'hosting_connection',JSON.stringify({installationId:r.installationId,appUrl:r.appUrl,provisionStatus:'connecting',version:version+1}),now,r.operationId),
   env.DB.prepare("UPDATE platform_companies SET installation_id=?,app_url=?,token_hash=?,provision_status='connecting',version=version+1,policy_revision=policy_revision+1,updated_at=? WHERE id=? AND version=? AND "+gate).bind(r.installationId,r.appUrl,r.tokenHash,now,c.id,version,r.operationId),
   env.DB.prepare("UPDATE platform_provisioning_jobs SET state='connecting',step='connection',lease_until=0,error='',updated_at=? WHERE company_id=? AND kind='create' AND "+gate).bind(now,c.id,r.operationId),
   env.DB.prepare("INSERT INTO platform_audit(id,actor_id,action,resource_id,details,created_at) SELECT ?,'system:hosting','connect_hosted_company',?,?,? WHERE "+gate).bind(crypto.randomUUID(),c.id,JSON.stringify({operationId:r.operationId,installationId:r.installationId,appUrl:r.appUrl}),now,r.operationId)
  ]);
  if(!result[0].meta.changes)continue;
 }
}
