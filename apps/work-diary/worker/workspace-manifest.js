import {workspaceJobScope,workspaceGardenScope,workspaceDisciplineSql} from './workspace-policy.js';

async function wmStamp(db) {
  const row=await db.prepare("SELECT authorization_revision,(SELECT version FROM settings WHERE key='job-planner-revision') planner_revision FROM workspaces LIMIT 1").first();
  return row?'w:'+row.authorization_revision+':p:'+(row.planner_revision||0):null;
}
export async function handleWorkspaceManifest(request,env,member,helpers) {
  const {json,fail,body,features={}}=helpers;
  if(!member._workspace)fail(404,'Společný prostor není aktivní.');
  if(request.method!=='POST')fail(405,'Použijte ověření místních identifikátorů.');
  const input=await body(request,600000),names=['records','gardens','services','serviceWork','defects'];
  if(!input||Array.isArray(input)||Object.keys(input).some(key=>![...names,'expectedStamp'].includes(key)))fail(400,'Neplatný rozsah místních záznamů.');
  for(const name of names)if(!Array.isArray(input[name])||input[name].length>1000||input[name].some(id=>typeof id!=='string'||!/^[-\w]{1,100}$/.test(id))||new Set(input[name]).size!==input[name].length)fail(400,'Ověřujte nejvýše 1000 různých identifikátorů každého druhu.');
  const before=await wmStamp(env.DB);
  if(input.expectedStamp&&input.expectedStamp!==before)fail(409,'Oprávnění nebo přiřazení se během ověřování změnila.',{code:'workspace_manifest_changed'});
  const allowed=Object.fromEntries(names.map(name=>[name,[]])),jobVersions={};
  const scopes={
    records:{feature:'shafts',query:marks=>`SELECT s.id FROM shafts s WHERE s.id IN (${marks}) AND s.deleted=0 AND (s.garden_id IS NULL OR EXISTS(SELECT 1 FROM gardens g WHERE g.id=s.garden_id AND g.deleted=0 AND ${workspaceGardenScope()}))`,irrigation:true},
    gardens:{feature:'gardens',query:marks=>`SELECT g.id FROM gardens g WHERE g.id IN (${marks}) AND g.deleted=0 AND ${workspaceGardenScope()}`},
    services:{feature:'service',query:marks=>`SELECT s.id FROM service_logs s JOIN gardens g ON g.id=s.garden_id AND g.deleted=0 WHERE s.id IN (${marks}) AND s.deleted=0 AND ${workspaceGardenScope()} AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND ${workspaceDisciplineSql('s.discipline','actor','service')})`,actors:2},
    serviceWork:{feature:'jobs',query:marks=>`SELECT j.id,j.version FROM jobs j WHERE j.id IN (${marks}) AND ${['owner','administrator','admin'].includes(member.role)?'1=1':'j.deleted=0'} AND ${workspaceJobScope()}`},
    defects:{feature:'defects',query:marks=>`SELECT d.id FROM garden_defects d JOIN gardens g ON g.id=d.garden_id AND g.deleted=0 WHERE d.id IN (${marks}) AND ${workspaceGardenScope()} AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND ${workspaceDisciplineSql('d.discipline','actor','defects')})`,actors:2}
  };
  for(const name of names){
    const scope=scopes[name];
    if(features[scope.feature]===false||scope.irrigation&&!member._workspace.disciplines.includes('irrigation'))continue;
    for(let offset=0;offset<input[name].length;offset+=50){const ids=input[name].slice(offset,offset+50),marks=ids.map(()=>'?').join(',');
      const rows=(await env.DB.prepare(scope.query(marks)).bind(...ids,...Array(scope.actors||1).fill(member.user_id)).all()).results;
      allowed[name].push(...rows.map(row=>row.id));if(name==='serviceWork')for(const row of rows)jobVersions[row.id]=row.version;
    }
  }
  if(await wmStamp(env.DB)!==before)fail(409,'Oprávnění nebo přiřazení se během ověřování změnila.',{code:'workspace_manifest_changed'});
  return json({features,stamp:before,completeForRequestedIds:true,requestedCounts:Object.fromEntries(names.map(name=>[name,input[name].length])),allowed,jobVersions,workspace:member._workspace,writable:['owner','administrator','admin','worker'].includes(member.role)});
}
