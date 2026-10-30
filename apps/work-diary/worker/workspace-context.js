import {driveOpen} from './drive-core.js';
import {normalizeFeatures} from '../web/features.js';
import {tenantFeaturePolicy} from './tenant-platform.js';
const woRuntimeKeys=['PLATFORM_CONTROL_URL','PLATFORM_COMPANY_ID','PLATFORM_SERVICE_TOKEN','PLATFORM_SIGNING_PUBLIC_KEY','PLATFORM_SIGNING_KEY_ID','PLATFORM_CONTROL_BYPASS_TOKEN'];
export function workspacePreferenceKey(env,key){return env.WORKSPACE_SETTINGS_PREFIX?env.WORKSPACE_SETTINGS_PREFIX+key:key;}

// The ingress installation is set by the verified gateway, never by request body.
// Only licensing settings change by organization. DB/R2/auth/encryption stay canonical.
export async function workspaceRequestContext(env,request,member,all=false){
 const workspace=await env.DB.prepare("SELECT id FROM workspaces WHERE state IN ('active','read_only') LIMIT 1").first();if(!workspace)return env;
 const physical=(await env.DB.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").first()).instance_id;
 const organizations=(await env.DB.prepare('SELECT * FROM workspace_organizations WHERE workspace_id=? ORDER BY discipline').bind(workspace.id).all()).results;
 const ingress=env.WORKSPACE_ENTRY_ID||physical;let selected=organizations.find(org=>org.installation_id===ingress);
 if(request){const url=new URL(request.url),job=url.pathname.match(/^\/api\/jobs\/([-\w]+)(?:\/|$)/),fault=url.pathname.match(/^\/api\/defects\/([-\w]+)$/),subscription=url.pathname.match(/^\/api\/subscriptions\/([-\w]+)(?:\/|$)/);let discipline=url.searchParams.get('discipline')||request.headers.get('x-work-discipline');
 if(member&&!['owner','administrator','admin'].includes(member.role)){const memberships=(await env.DB.prepare('SELECT discipline FROM member_disciplines WHERE user_id=?').bind(member.user_id).all()).results;if(!memberships.some(row=>row.discipline===discipline))discipline=memberships.length===1?memberships[0].discipline:null;}
 if(job){const row=await env.DB.prepare('SELECT discipline FROM jobs WHERE id=?').bind(job[1]).first();if(row)discipline=row.discipline;}
 if(fault){const row=await env.DB.prepare('SELECT discipline FROM garden_defects WHERE id=?').bind(fault[1]).first();if(row)discipline=row.discipline;}
 if(subscription){const row=await env.DB.prepare('SELECT discipline FROM subscriptions WHERE id=?').bind(subscription[1]).first();if(row)discipline=row.discipline;}
 if(['irrigation','garden'].includes(discipline))selected=organizations.find(org=>org.discipline===discipline);
 }
 if(!selected)throw Error('Vstup nepatří do společného pracovního prostoru.');
 const contexts=[];
 for(const organization of organizations){
  const source=organization.installation_id===physical,prefix=source?'':'workspace:'+organization.id+':';
  let runtime={};
  if(!source){const row=await env.DB.prepare('SELECT sealed_runtime FROM workspace_organization_config WHERE organization_id=?').bind(organization.id).first();
   if(row)runtime=await driveOpen(env,row.sealed_runtime,'workspace-organization:'+organization.id);
   else if(env.PLATFORM_CONTROL_URL)throw Error('Chybí ověřené licenční propojení druhého oboru.');
   if(!runtime||Array.isArray(runtime)||typeof runtime!=='object'||Object.keys(runtime).some(key=>!woRuntimeKeys.includes(key)))throw Error('Neplatné nastavení druhého oboru.');
  }
  const scoped={...env,WORKSPACE_ORGANIZATION_ID:organization.id,WORKSPACE_ORGANIZATION_DISCIPLINE:organization.discipline,WORKSPACE_ORGANIZATION_NAME:organization.name,WORKSPACE_SETTINGS_PREFIX:prefix,WORKSPACE_POLICY_INSTALLATION_ID:organization.installation_id};
  if(!source){delete scoped.RESEND_API_KEY;delete scoped.SERVICE_EMAIL_FROM;}
  if(!source&&env.SHARED_WORKSPACE_GATEWAY){const gateway=JSON.parse(env.SHARED_WORKSPACE_GATEWAY);if(gateway.mode==='canonical'&&gateway.peerId===organization.installation_id){const origin=new URL(gateway.entryOrigin);if(origin.protocol!=='https:'||origin.origin!==gateway.entryOrigin)throw Error('Neplatná adresa vstupu druhého oboru.');scoped.PUBLIC_APP_URL=origin.origin;}}
  if(!source)for(const key of woRuntimeKeys){delete scoped[key];if(runtime[key])scoped[key]=runtime[key];}
  const preferences=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(prefix+'features').first();
  const result=await tenantFeaturePolicy(scoped,normalizeFeatures(preferences?JSON.parse(preferences.value):null));
  const active=result.license?.active??true,expires=result.license?.expiresAt??Date.now()+300000,revision=result.license?.revision||0,maxUsers=result.license?.maxUsers||100;
  await env.DB.prepare(`INSERT INTO workspace_organization_policies(organization_id,active,expires_at,revision,features,max_users,checked_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id) DO UPDATE SET active=excluded.active,expires_at=excluded.expires_at,revision=excluded.revision,features=excluded.features,max_users=excluded.max_users,checked_at=excluded.checked_at WHERE workspace_organization_policies.revision<=excluded.revision`)
   .bind(organization.id,Number(active),expires,revision,JSON.stringify(result.features),maxUsers,Date.now()).run();
  scoped._workspaceLicenseActive=active;contexts.push(scoped);
 }
 return all?contexts:contexts.find(context=>context.WORKSPACE_ORGANIZATION_ID===selected.id);
}

export async function workspaceScheduledContexts(env){const result=await workspaceRequestContext(env,null,null,true);return Array.isArray(result)?result:[result];}
