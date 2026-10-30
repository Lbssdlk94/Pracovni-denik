import {assertInstallation} from './installation.js';
import {WORKSPACE_TRANSFER_TABLES} from './workspace-transfer-tables.js';
import {driveSeal} from './drive-core.js';
import {ensureWorkspaceRecoveryKey} from './workspace-recovery.js';
import {tenantFeaturePolicy} from './tenant-platform.js';
import {normalizeFeatures} from '../web/features.js';
const wtEncoder=new TextEncoder();
const wtExportTables=['members','customers','gardens','garden_geocodes','service_tariffs'];
const wtPreferences=['features','platform-policy','material-reminders','job-planning','invoice-company','work-rates'];
const wtRuntime=['PLATFORM_CONTROL_URL','PLATFORM_COMPANY_ID','PLATFORM_SERVICE_TOKEN','PLATFORM_SIGNING_PUBLIC_KEY','PLATFORM_SIGNING_KEY_ID','PLATFORM_CONTROL_BYPASS_TOKEN'];
const wtAllowedNonempty=new Set([...wtExportTables,'settings','installation_state']);
function wtCanonical(value){if(Array.isArray(value))return value.map(wtCanonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,wtCanonical(value[key])]));return value;}
async function wtHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',wtEncoder.encode(JSON.stringify(wtCanonical(value))))),v=>v.toString(16).padStart(2,'0')).join('');}
async function wtSign(token,value){const key=await crypto.subtle.importKey('raw',wtEncoder.encode(token),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,wtEncoder.encode(JSON.stringify(wtCanonical(value))))),v=>v.toString(16).padStart(2,'0')).join('');}
function wtEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
async function wtControl(env){return env.DB.prepare("SELECT * FROM workspace_transfer_control WHERE singleton='primary'").first();}
function wtAssert(env,id,condition,...args){return env.DB.prepare('INSERT INTO workspace_transfer_assertions(id,valid) SELECT ?,CASE WHEN '+condition+' THEN 1 ELSE 0 END').bind(id,...args);}
async function wtAuthorize(request,env,h){
 let c;try{c=JSON.parse(env.WORKSPACE_TRANSFER_CAPABILITY||'null');}catch{}
 const token=request.headers.get('x-workspace-transfer-token')||'';
 if(!c||!/^[-\w]{43}$/.test(token)||!Number.isSafeInteger(c.expiresAt)||c.expiresAt<Date.now()||c.expiresAt>Date.now()+48*3600000||!wtEqual(await wtHash(token),c.tokenHash))h.fail(404,'Nenalezeno.');
 const installation=await env.DB.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").first();
 if(!installation||env.INSTALLATION_ID&&installation.instance_id!==env.INSTALLATION_ID||![c.canonicalInstallationId,c.linkedInstallationId].includes(installation.instance_id)||c.canonicalInstallationId===c.linkedInstallationId||!/^[-\w]{8,100}$/.test(c.workspaceId||'')||!c.canonicalUserId||!c.linkedUserId)h.fail(409,'Technický převod není svázán s touto dvojicí instalací.');
 await assertInstallation(env);
 return {config:c,token,installationId:installation.instance_id,source:installation.instance_id===c.canonicalInstallationId};
}
async function wtInventory(env){const counts={};for(const name of WORKSPACE_TRANSFER_TABLES)counts[name]=(await env.DB.prepare('SELECT count(*) n FROM "'+name+'"').first()).n;return counts;}
async function wtExport(env,access,h){
 const preferences=await env.DB.prepare("SELECT value FROM settings WHERE key='features'").first(),policy=await tenantFeaturePolicy(env,normalizeFeatures(preferences?JSON.parse(preferences.value):null));
 const before=await wtControl(env),tables={};
 for(const name of wtExportTables){tables[name]=(await env.DB.prepare('SELECT * FROM "'+name+'" ORDER BY '+(name==='members'?'user_id':name==='garden_geocodes'?'garden_id':'id')+' LIMIT 1001').all()).results;if(tables[name].length>1000)h.fail(413,'Tento řízený převod vyžaduje menší datové části.');}
 tables.settings=(await env.DB.prepare('SELECT * FROM settings WHERE key IN ('+wtPreferences.map(()=>'?').join(',')+') ORDER BY key').bind(...wtPreferences).all()).results;
 const counts=await wtInventory(env),runtime=Object.fromEntries(wtRuntime.filter(key=>env[key]).map(key=>[key,env[key]])),after=await wtControl(env);
 if(before.generation!==after.generation||before.freeze_id!==after.freeze_id)h.fail(409,'Data se během snímku změnila. Opakujte načtení.');
 const payload={format:'work-diary-paired-transfer',version:1,installationId:access.installationId,workspaceId:access.config.workspaceId,generation:after.generation,sessionId:after.freeze_id,counts,tables,runtime,policy};
 return {payload,signature:await wtSign(access.token,payload)};
}
async function wtReadPlan(env,access,envelope,h){
 const c=access.config,p=envelope?.payload;
 if(!access.source||!p||p.format!=='work-diary-paired-transfer'||p.version!==1||p.workspaceId!==c.workspaceId||p.installationId!==c.linkedInstallationId||!wtEqual(await wtSign(access.token,p),envelope.signature)||!Number.isSafeInteger(p.generation))h.fail(400,'Snímek druhé instalace nelze ověřit.');
 if(!p.tables||wtExportTables.some(name=>!Array.isArray(p.tables[name]))||!Array.isArray(p.tables.settings)||Object.keys(p.runtime||{}).some(key=>!wtRuntime.includes(key)))h.fail(400,'Neúplný snímek druhé instalace.');
 const sourceFeatures=await env.DB.prepare("SELECT value FROM settings WHERE key='features'").first(),sourcePolicy=await tenantFeaturePolicy(env,normalizeFeatures(sourceFeatures?JSON.parse(sourceFeatures.value):null));
 const source=await wtControl(env),blockers=[],warnings=[],renames=[];
 const counts=await wtInventory(env);
 if(counts.workspaces)blockers.push({code:'workspace_already_configured'});
 for(const name of WORKSPACE_TRANSFER_TABLES){if(!Number.isSafeInteger(p.counts?.[name])||p.counts[name]<0)h.fail(400,'Neúplný seznam tabulek snímku.');if(p.counts[name]>0&&!wtAllowedNonempty.has(name))blockers.push({code:'additional_garden_work_requires_transfer',table:name,count:p.counts[name]});}
 for(const name of wtExportTables){if(p.counts[name]!==p.tables[name].length)h.fail(400,'Počet záznamů snímku nesouhlasí.');}
 const originalOwner=await env.DB.prepare("SELECT user_id,role,email FROM members WHERE user_id=?").bind(c.canonicalUserId).first(),linked=p.tables.members.find(row=>row.user_id===c.linkedUserId);
 if(originalOwner?.role!=='owner'||linked?.role!=='owner'||originalOwner.email.toLowerCase()!==linked.email.toLowerCase())blockers.push({code:'approved_owner_identity_changed'});
 for(const name of ['customers','gardens','garden_geocodes','service_tariffs'])for(const row of p.tables[name]){
  const key=name==='garden_geocodes'?'garden_id':'id',id=row[key];if(typeof id!=='string'||!/^[-\w]{1,100}$/.test(id))h.fail(400,'Neplatný původní identifikátor.');
  const existing=await env.DB.prepare('SELECT '+key+' FROM '+name+' WHERE '+key+'=?').bind(id).first();
  if(existing){if(name==='service_tariffs'){const replacement='garden-'+id;if(replacement.length>100||await env.DB.prepare('SELECT id FROM service_tariffs WHERE id=?').bind(replacement).first())blockers.push({code:'identifier_collision',table:name,id:replacement});else renames.push({table:name,originalId:id,canonicalId:replacement});}else blockers.push({code:'identifier_collision',table:name,id});}
 }
 const memberIds=new Set();for(const row of p.tables.members){if(memberIds.has(row.user_id))h.fail(400,'Duplicitní účet ve snímku.');memberIds.add(row.user_id);if(row.user_id===c.linkedUserId)continue;const existing=await env.DB.prepare('SELECT user_id FROM members WHERE user_id=? OR lower(email)=lower(?)').bind(row.user_id,row.email).first();if(existing||row.role==='owner'||!['administrator','admin','worker','reader'].includes(row.role))blockers.push({code:'member_identity_review',userId:row.user_id});}
 const customerIds=new Set(p.tables.customers.map(row=>row.id));for(const garden of p.tables.gardens){if(garden.customer_id&&!customerIds.has(garden.customer_id))warnings.push({code:'dangling_optional_reference',table:'gardens',id:garden.id,column:'customer_id'});if(garden.plan_key||garden.pump_type||garden.blowout!=='[]'||garden.plan_markers!=='[]')blockers.push({code:'garden_irrigation_content_requires_review',id:garden.id});}
 for(const row of p.tables.garden_geocodes)if(!p.tables.gardens.some(g=>g.id===row.garden_id))blockers.push({code:'geocode_without_garden',id:row.garden_id});
 // A new provider configuration is outside this transfer's authorized scope.
 // Source configuration is intentionally retained, never copied into Garden.
 const snapshotHash=await wtHash(p),content={workspaceId:c.workspaceId,sourceGeneration:source.generation,sourceSessionId:source.freeze_id,gardenGeneration:p.generation,gardenSessionId:p.sessionId,snapshotHash,sourcePolicyHash:await wtHash(sourcePolicy),counts:{source:counts,garden:p.counts},renames,blockers,warnings,identity:{canonicalUserId:c.canonicalUserId,linkedUserId:c.linkedUserId},backupRequirement:'explicitly-waived-by-owner'};
 return {payload:p,sourcePolicy,report:{...content,planHash:await wtHash(content),readyForCutover:!!source.freeze_id&&!!p.sessionId&&!blockers.length},source};
}
async function wtRowStatement(env,table,row,overrides={}){
 const columns=(await env.DB.prepare('PRAGMA table_info("'+table+'")').all()).results.map(c=>c.name),data={...row,...overrides},keys=columns.filter(key=>Object.hasOwn(data,key));
 if(Object.keys(row).some(key=>!columns.includes(key)))throw Error('Source schema contains an unsupported column in '+table);
 return env.DB.prepare('INSERT INTO "'+table+'"('+keys.map(key=>'"'+key+'"').join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(key=>data[key]));
}
async function wtOrigins(env,organization,table,rows,idKey='id',remap=new Map()){
 const statements=[];for(let offset=0;offset<rows.length;offset+=50){const values=await Promise.all(rows.slice(offset,offset+50).map(async row=>({id:row[idKey],canonical:remap.get(row[idKey])||row[idKey],hash:await wtHash(row)})));statements.push(env.DB.prepare("INSERT INTO workspace_origins(organization_id,entity,original_id,canonical_id,source_hash) SELECT ?,?,json_extract(value,'$.id'),json_extract(value,'$.canonical'),json_extract(value,'$.hash') FROM json_each(?)").bind(organization,table,JSON.stringify(values)));}return statements;
}
async function wtApply(env,access,envelope,planHash,h){
 const c=access.config,prior=await env.DB.prepare('SELECT * FROM workspace_transfer_sessions WHERE plan_hash=? AND state=\'applied\'').bind(planHash).first();
 if(prior)return {...JSON.parse(prior.summary),replayed:true};
 const {payload:p,sourcePolicy,report,source}=await wtReadPlan(env,access,envelope,h);
 if(report.planHash!==planHash||!report.readyForCutover)h.fail(409,'Plán není aktuální nebo převod čeká na vyřešení překážek.',{report});
 if(!await env.DB.prepare("SELECT key FROM settings WHERE key='workspace-recovery-keyring'").first())h.fail(409,'Nejsou připravené klíče ochrany neodeslané práce.');
 const now=Date.now(),rootOrg='workspace-irrigation',gardenOrg='workspace-garden',operation='transfer:'+c.workspaceId,statements=[wtAssert(env,operation,"EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id=? AND generation=? AND bypass=0) AND EXISTS(SELECT 1 FROM workspace_transfer_sessions WHERE id=? AND state='frozen')",source.freeze_id,source.generation,source.freeze_id),env.DB.prepare("UPDATE workspace_transfer_control SET bypass=1 WHERE singleton='primary'")];
 statements.push(env.DB.prepare("INSERT INTO workspaces VALUES(?,'preparing',1,?,?)").bind(c.workspaceId,now,now));
 for(const [id,installation,discipline,name] of [[rootOrg,c.canonicalInstallationId,'irrigation','Dr. Závlaha'],[gardenOrg,c.linkedInstallationId,'garden','Dr. Garden']])statements.push(env.DB.prepare('INSERT INTO workspace_organizations VALUES(?,?,?,?,?)').bind(id,c.workspaceId,installation,discipline,name));
 const sourceMembers=(await env.DB.prepare('SELECT * FROM members ORDER BY user_id').all()).results;
 for(const person of sourceMembers){statements.push(env.DB.prepare("INSERT INTO member_disciplines VALUES(?,'irrigation')").bind(person.user_id),env.DB.prepare('INSERT INTO workspace_member_grants VALUES(?,?,?)').bind(person.user_id,rootOrg,person.role),env.DB.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,?, 'original')").bind(c.canonicalInstallationId,person.user_id,person.user_id,person.role,person.email,person.name,c.canonicalUserId,now));}
 const aliasMap=new Map([[c.linkedUserId,c.canonicalUserId]]);
 for(const person of p.tables.members){const userId=aliasMap.get(person.user_id)||person.user_id;if(userId===person.user_id)statements.push(await wtRowStatement(env,'members',person));statements.push(env.DB.prepare("INSERT INTO member_disciplines VALUES(?,'garden')").bind(userId),env.DB.prepare('INSERT INTO workspace_member_grants VALUES(?,?,?)').bind(userId,gardenOrg,person.role),env.DB.prepare('INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,?,?)').bind(c.linkedInstallationId,person.user_id,userId,person.role,person.email,person.name,c.canonicalUserId,now,userId===person.user_id?'original':'confirmed'),env.DB.prepare("INSERT INTO workspace_identity_events VALUES(?,?,?,?,?,?,'migration-approved')").bind('transfer-alias:'+person.user_id,c.canonicalUserId,now,c.linkedInstallationId,person.user_id,userId));}
 for(const [table,idKey] of [['members','user_id'],['customers','id'],['gardens','id'],['jobs','id'],['garden_defects','id'],['service_logs','id'],['subscriptions','id'],['service_tariffs','id']]){const rows=(await env.DB.prepare('SELECT * FROM '+table).all()).results;statements.push(...await wtOrigins(env,rootOrg,table,rows,idKey));}
 for(const [entity,table,key] of [['member','members','user_id'],['customer','customers','id'],['garden','gardens','id']])statements.push(env.DB.prepare('INSERT INTO workspace_entity_versions(entity,entity_id,version) SELECT ?, '+key+',1 FROM '+table).bind(entity));
 for(const [table,parent,key] of [['customer_disciplines','customers','customer_id'],['garden_disciplines','gardens','garden_id']])statements.push(env.DB.prepare('INSERT INTO '+table+'('+key+',discipline) SELECT id,\'irrigation\' FROM '+parent));
 for(const table of ['jobs','garden_defects','service_logs','subscriptions','service_tariffs'])statements.push(env.DB.prepare('UPDATE '+table+" SET discipline='irrigation'"));
 statements.push(env.DB.prepare("UPDATE invitations SET disciplines='[\"irrigation\"]',origin_organization_id=?").bind(rootOrg));
 for(const name of ['customers','gardens','garden_geocodes','service_tariffs']){
  const renames=new Map(report.renames.filter(r=>r.table===name).map(r=>[r.originalId,r.canonicalId]));
  for(const row of p.tables[name]){const overrides={};for(const key of ['created_by','updated_by'])if(aliasMap.has(row[key]))overrides[key]=aliasMap.get(row[key]);if(name==='gardens')overrides.notes='';if(name==='service_tariffs'){overrides.discipline='garden';if(renames.has(row.id))overrides.id=renames.get(row.id);}
   statements.push(await wtRowStatement(env,name,row,overrides));
   if(name==='gardens'){statements.push(env.DB.prepare("INSERT INTO garden_discipline_data VALUES(?,'garden',?,1)").bind(row.id,row.notes),env.DB.prepare("INSERT INTO garden_disciplines VALUES(?,'garden')").bind(row.id),env.DB.prepare("INSERT INTO workspace_entity_versions(entity,entity_id,version) VALUES('garden',?,1)").bind(row.id));}
   if(name==='customers')statements.push(env.DB.prepare("INSERT INTO customer_disciplines VALUES(?,'garden')").bind(row.id),env.DB.prepare("INSERT INTO workspace_entity_versions(entity,entity_id,version) VALUES('customer',?,1)").bind(row.id));
  }
  statements.push(...await wtOrigins(env,gardenOrg,name,p.tables[name],name==='garden_geocodes'?'garden_id':'id',renames));
 }
 statements.push(...await wtOrigins(env,gardenOrg,'members',p.tables.members,'user_id',aliasMap));
 for(const row of p.tables.settings)statements.push(env.DB.prepare('INSERT INTO settings(key,value,version) VALUES(?,?,?)').bind('workspace:'+gardenOrg+':'+row.key,row.value,row.version));
 statements.push(env.DB.prepare('INSERT INTO workspace_organization_config VALUES(?,?)').bind(gardenOrg,await driveSeal(env,p.runtime,'workspace-organization:'+gardenOrg)));
 for(const [id,policy] of [[rootOrg,sourcePolicy],[gardenOrg,p.policy]]){
  if(!policy?.features)h.fail(409,'Chybí ověřená licenční politika druhé instalace.');
  statements.push(env.DB.prepare('INSERT INTO workspace_organization_policies VALUES(?,?,?,?,?,?,?)').bind(id,Number(policy.license?.active??true),policy.license?.expiresAt??now+300000,policy.license?.revision||0,JSON.stringify(policy.features),policy.license?.maxUsers||100,now));
 }
 // Initial classifications are audited once for every contact, garden and member.
 statements.push(env.DB.prepare(`INSERT INTO workspace_audit(operation_id,entity,entity_id,actor_id,at,base_version,old_disciplines,new_disciplines,request_hash) SELECT 'migration:'||v.entity||':'||v.entity_id,v.entity,v.entity_id,?,?,0,'[]',CASE v.entity WHEN 'customer' THEN (SELECT json_group_array(discipline) FROM customer_disciplines d WHERE d.customer_id=v.entity_id) WHEN 'garden' THEN (SELECT json_group_array(discipline) FROM garden_disciplines d WHERE d.garden_id=v.entity_id) ELSE (SELECT json_group_array(discipline) FROM member_disciplines d WHERE d.user_id=v.entity_id) END,? FROM workspace_entity_versions v`).bind(c.canonicalUserId,now,planHash));
 const summary={applied:true,workspaceId:c.workspaceId,planHash,sourceSessionId:source.freeze_id,gardenSessionId:p.sessionId,imported:{customers:p.tables.customers.length,gardens:p.tables.gardens.length,tariffs:p.tables.service_tariffs.length},renames:report.renames};
 statements.push(env.DB.prepare("UPDATE workspaces SET state='active',updated_at=? WHERE id=?").bind(now,c.workspaceId),env.DB.prepare("UPDATE workspace_transfer_sessions SET state='applied',plan_hash=?,summary=? WHERE id=? AND state='frozen'").bind(planHash,JSON.stringify(summary),source.freeze_id),env.DB.prepare("UPDATE workspace_transfer_control SET freeze_id=NULL,bypass=0,generation=generation+1 WHERE singleton='primary'"),env.DB.prepare('DELETE FROM workspace_transfer_assertions WHERE id=?').bind(operation));
 try{await env.DB.batch(statements);}catch(error){if(String(error?.message).includes('workspace_transfer_assertion'))h.fail(409,'Data se změnila od schválení plánu; nebyl uložen žádný dílčí převod.');throw error;}
 return summary;
}

// A bounded, expiring capability for the explicitly approved installation pair.
// No SQL, table names, roles or arbitrary origin are accepted as instructions.
export async function handleWorkspaceTransfer(request,env,h){
 const access=await wtAuthorize(request,env,h),action=new URL(request.url).pathname.split('/').at(-1),method=request.method;
 if(action==='state'&&method==='GET')return h.json({installationId:access.installationId,...await wtControl(env),counts:await wtInventory(env)});
 if(action==='export'&&method==='GET')return h.json(await wtExport(env,access,h));
 const b=await h.body(request,4*1024*1024);
 if(action==='freeze'&&method==='POST'){
  if(!/^[-\w]{8,100}$/.test(b.sessionId||'')||!Number.isSafeInteger(b.expectedGeneration))h.fail(400,'Neplatná identita snímku.');
  const prior=await env.DB.prepare('SELECT * FROM workspace_transfer_sessions WHERE id=?').bind(b.sessionId).first();if(prior){if(prior.state!=='frozen')h.fail(409,'Tento převod už byl ukončen.');return h.json({frozen:true,sessionId:prior.id,replayed:true,...await wtControl(env)});}
  if(await env.DB.prepare('SELECT id FROM workspaces LIMIT 1').first())h.fail(409,'Pracovní prostor už je nakonfigurovaný.');
  // Generate before the settings write fence is raised; the final generation is
  // returned, so callers must use the frozen snapshot's generation thereafter.
  const before=await wtControl(env);if(before.freeze_id||before.generation!==b.expectedGeneration)h.fail(409,'Před zmrazením se data změnila. Načtěte nový stav.');
  const keyMissing=access.source&&!await env.DB.prepare("SELECT 1 FROM settings WHERE key='workspace-recovery-keyring'").first();
  if(access.source)await ensureWorkspaceRecoveryKey(env);
  const current=await wtControl(env);
  if(current.freeze_id||current.generation!==b.expectedGeneration+Number(keyMissing))h.fail(409,'Před zmrazením se data změnila. Načtěte nový stav.');
  await env.DB.batch([wtAssert(env,b.sessionId,"EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NULL AND generation=? AND bypass=0)",current.generation),env.DB.prepare("INSERT INTO workspace_transfer_sessions(id,state,created_at,generation) VALUES(?,'frozen',?,?)").bind(b.sessionId,Date.now(),current.generation),env.DB.prepare("UPDATE workspace_transfer_control SET freeze_id=? WHERE singleton='primary'").bind(b.sessionId),env.DB.prepare('DELETE FROM workspace_transfer_assertions WHERE id=?').bind(b.sessionId)]);
  return h.json({frozen:true,sessionId:b.sessionId,...await wtControl(env)});
 }
 if(action==='release'&&method==='POST'){
  if(await env.DB.prepare('SELECT id FROM workspaces LIMIT 1').first())h.fail(409,'Aktivní prostor nelze vrátit ke staré databázi bez řízené obnovy.');
  const session=await env.DB.prepare("SELECT * FROM workspace_transfer_sessions WHERE id=? AND state='frozen'").bind(b.sessionId).first();if(!session)h.fail(409,'Převod nelze uvolnit.');
  await env.DB.batch([wtAssert(env,'release:'+b.sessionId,"EXISTS(SELECT 1 FROM workspace_transfer_control WHERE freeze_id=? AND bypass=0)",b.sessionId),env.DB.prepare("UPDATE workspace_transfer_sessions SET state='released' WHERE id=?").bind(b.sessionId),env.DB.prepare("UPDATE workspace_transfer_control SET freeze_id=NULL WHERE freeze_id=?").bind(b.sessionId),env.DB.prepare('DELETE FROM workspace_transfer_assertions WHERE id=?').bind('release:'+b.sessionId)]);return h.json({released:true});
 }
 if(action==='retire'&&method==='POST'){
  if(access.source||!/^[-\w]{8,100}$/.test(b.sessionId||'')||!/^[a-f0-9]{64}$/.test(b.planHash||''))h.fail(400,'Neplatné potvrzení odstavení staré databáze.');
  const changed=await env.DB.prepare("UPDATE workspace_transfer_sessions SET state='retired',plan_hash=? WHERE id=? AND state='frozen' AND EXISTS(SELECT 1 FROM workspace_transfer_control WHERE freeze_id=?)").bind(b.planHash,b.sessionId,b.sessionId).run();if(!changed.meta.changes)h.fail(409,'Starou databázi nelze odstavit.');return h.json({retired:true,localWritesBlocked:true});
 }
 if(action==='preview'&&method==='POST')return h.json((await wtReadPlan(env,access,b.snapshot,h)).report);
 if(action==='apply'&&method==='POST')return h.json(await wtApply(env,access,b.snapshot,b.planHash,h));
 h.fail(404,'Nenalezeno.');
}
