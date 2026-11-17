import {workspaceTransferStamp} from './workspace-transfer-control.js';
import {workspaceActor, workspaceJobScope, workspaceGardenScope, workspaceDisciplineSql} from './workspace-policy.js';

export function workspaceWriteDiscipline(member, body, previous, fail) {
  const authorization = member._workspace;
  if (!authorization) return previous?.discipline || null;
  const discipline = previous?.discipline || body?.discipline || authorization.selectedDiscipline;
  if (!['irrigation', 'garden'].includes(discipline) || !authorization.disciplines.includes(discipline)) fail(403, 'Vyberte pracovní obor, ke kterému máte přístup.');
  if (previous && body?.discipline && body.discipline !== previous.discipline) fail(400, 'Obor existující práce nelze přepsat; založte navazující zakázku.');
  return discipline;
}

// Direct links and media are authorized before a legacy handler can access their content.
// List predicates remain inside SQL, before pagination/counting. This is an extra boundary.
export async function workspaceResourceAccess(request, env, member, fail) {
  const authorization = await workspaceActor(env.DB, member.user_id);
  if (!authorization) return null;
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const metadataRoute=path==='/api/me'||path==='/api/features'||path.startsWith('/api/workspace');
  const requested = metadataRoute?null:url.searchParams.get('discipline') || request.headers.get('x-work-discipline');
  if (requested && !['all', 'irrigation', 'garden'].includes(requested)) fail(400, 'Vyberte platný pracovní obor.');
  if (requested && requested !== 'all' && !authorization.disciplines.includes(requested)) fail(403, 'K tomuto oboru nemáte přístup.');
  const organization = await env.DB.prepare('SELECT * FROM workspace_organizations WHERE installation_id=?').bind(env.WORKSPACE_ENTRY_ID || env.INSTALLATION_ID || '').first();
  authorization.selectedDiscipline = requested ? requested : authorization.disciplines.length === 1 ? authorization.disciplines[0] : organization?.discipline || null;
  member._workspace = authorization;
  member.role = authorization.role;
  // This version fence protects old cached clients; SQL permissions remain authoritative.
  const legacySafe=metadataRoute||method==='GET'&&['/api/drive/oauth/callback','/api/drive/native-start'].includes(path)||['GET','HEAD'].includes(method)&&/\/(?:photo|plan|content|file|assets\/\d+|photos\/[-\w]+)$/.test(path);
  if(!legacySafe&&request.headers.get('x-workspace-client-version')!=='shared-directory-v1')fail(403,'Aplikace potřebuje novou verzi. Zavřete ji, připojte se k internetu a znovu ji otevřete.',{code:'client_update_required'});
  if (authorization.state === 'read_only' && !['GET', 'HEAD'].includes(method) && !/^\/api\/(?:access-|notifications|system-backups|privacy|workspace\/(?:recovery|manifest))/.test(path)) fail(409, 'Společný pracovní prostor je dočasně pouze ke čtení.');
  const irrigation = /^\/api\/(?:shafts|zones)(?:\/|$)/.test(path) || /^\/api\/gardens\/[^/]+\/(?:blowout|plan)(?:\/|-|$)/.test(path);
  if (irrigation && !authorization.disciplines.includes('irrigation')) fail(404, 'Tato část není dostupná.');
  const garden = path.match(/^\/api\/gardens\/([-\w]+)(?:\/|$)/);
  if (garden && garden[1] !== 'address-from-position') {
    const row = await env.DB.prepare(`SELECT g.id FROM gardens g WHERE g.id=? AND g.deleted=0 AND ${workspaceGardenScope()}`).bind(garden[1], member.user_id).first();
    if (!row) fail(404, 'Zahrada není dostupná.');
  }
  const shaft = path.match(/^\/api\/shafts\/([-\w]+)(?:\/|$)/);
  if (shaft) {
    const item = await env.DB.prepare('SELECT garden_id FROM shafts WHERE id=?').bind(shaft[1]).first();
    if (item?.garden_id && !await env.DB.prepare(`SELECT g.id FROM gardens g WHERE g.id=? AND ${workspaceGardenScope()}`).bind(item.garden_id, member.user_id).first()) fail(404, 'Šachta není dostupná.');
  }
  const job = path.match(/^\/api\/jobs\/([-\w]+)(?:\/|$)/);
  if (job && !['people', 'backlog', 'schedule', 'planning-settings', 'workload'].includes(job[1])) {
    const exists = await env.DB.prepare('SELECT id FROM jobs WHERE id=?').bind(job[1]).first();
    if (exists) {
      const row = await env.DB.prepare(`SELECT j.id FROM jobs j WHERE j.id=? AND ${workspaceJobScope()}`).bind(job[1], member.user_id).first();
      if (!row) fail(404, 'Zakázka není dostupná.');
    }
  }
  const defect = path.match(/^\/api\/defects\/([-\w]+)$/);
  if (defect && defect[1] !== 'people') {
    const exists = await env.DB.prepare('SELECT id FROM garden_defects WHERE id=?').bind(defect[1]).first();
    if (exists) {
      const row = await env.DB.prepare(`SELECT d.id FROM garden_defects d JOIN gardens g ON g.id=d.garden_id WHERE d.id=? AND ${workspaceGardenScope()} AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND ${workspaceDisciplineSql('d.discipline','actor','defects')})`).bind(defect[1], member.user_id, member.user_id).first();
      if (!row) fail(404, 'Závada není dostupná.');
    }
  }
  // Garden had no Drive connection to migrate. Keep the existing irrigation
  // connection confined to its original work until Drive integration is requested.
  if(env.WORKSPACE_ORGANIZATION_DISCIPLINE==='garden'&&/^\/api\/drive(?:\/|$)/.test(path))fail(409,'Google Disk pro Garden zatím není propojený. Fotografie servisního protokolu lze dál uložit do interního úložiště.',{code:'integration_not_migrated'});
  return authorization;
}

export function workspaceInitialStatements(env, member, entity, id, discipline, now) {
  if (!member._workspace) return [];
  const types = {customer: ['customer_disciplines', 'customer_id', 'customers'], garden: ['garden_disciplines', 'garden_id', 'gardens']};
  const [table, key, source] = types[entity];
  const gate = `EXISTS(SELECT 1 FROM ${source} WHERE id=? AND created_by=? AND created_at=?)`;
  const args = [id, member.user_id, now];
  return [env.DB.prepare(`INSERT OR IGNORE INTO ${table}(${key},discipline) SELECT ?,? WHERE ${gate}`).bind(id, discipline, ...args),
    env.DB.prepare(`INSERT OR IGNORE INTO workspace_entity_versions(entity,entity_id) SELECT ?,? WHERE ${gate}`).bind(entity, id, ...args),
    env.DB.prepare(`INSERT OR IGNORE INTO workspace_audit(operation_id,entity,entity_id,actor_id,at,base_version,old_disciplines,new_disciplines,request_hash) SELECT ?,?,?,?,?,0,'[]',?,? WHERE ${gate}`)
      .bind('initial:' + entity + ':' + id, entity, id, member.user_id, now, JSON.stringify([discipline]), 'initial:' + id, ...args)];
}

async function workspaceProjectResponse(response, request, env) {
  const authorization = env._workspaceScope;
  if (!authorization || !response.headers.get('content-type')?.includes('application/json') || response.status >= 400) return response;
  const path = new URL(request.url).pathname;
  if (!/^\/api\/(?:gardens|customers|jobs|me|features)(?:\/|$)/.test(path)) return response;
  const value = await response.json();
  const gardens = [...(Array.isArray(value.gardens) ? value.gardens : []), ...(value.garden ? [value.garden] : [])];
  if (gardens.length) {
    const notes = new Map(),memberships=new Map();
    for (let offset = 0; offset < gardens.length; offset += 50) {
      const ids = gardens.slice(offset, offset + 50).map(garden => garden.id);
      const classes=(await env.DB.prepare(`SELECT g.id,CASE WHEN g.customer_id IS NOT NULL THEN (SELECT json_group_array(d.discipline) FROM customer_disciplines d WHERE d.customer_id=g.customer_id) ELSE (SELECT json_group_array(d.discipline) FROM garden_disciplines d WHERE d.garden_id=g.id) END disciplines FROM gardens g WHERE g.id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results;for(const row of classes)memberships.set(row.id,JSON.parse(row.disciplines||'[]'));
      const rows = (await env.DB.prepare(`SELECT garden_id,discipline,notes FROM garden_discipline_data WHERE garden_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results;
      for (const row of rows) {
        if (!authorization.disciplines.includes(row.discipline)) continue;
        if (!notes.has(row.garden_id)) notes.set(row.garden_id, {});
        notes.get(row.garden_id)[row.discipline] = row.notes;
      }
    }
    for (const garden of gardens) {
      const own = notes.get(garden.id) || {};
      garden.disciplines=memberships.get(garden.id)||[];
      if (authorization.disciplines.includes('irrigation') && garden.disciplines.includes('irrigation') && !Object.hasOwn(own, 'irrigation')) own.irrigation = garden.notes || '';
      const selected=garden.disciplines.includes(authorization.selectedDiscipline)&&authorization.disciplines.includes(authorization.selectedDiscipline)?authorization.selectedDiscipline:authorization.disciplines.find(key=>garden.disciplines.includes(key));
      garden.workDiscipline=selected||null;
      garden.notes = own[selected] || '';
      garden.workNotes = own;
      if (!authorization.disciplines.includes('irrigation')) {
        for (const key of ['pumpType', 'plan', 'blowout', 'planMarkers', 'shafts', 'shaftCount', 'blowoutCount']) delete garden[key];
      }
    }
  }
  if (!authorization.disciplines.includes('irrigation')) {
    const strip = object => {
      if (!object || typeof object !== 'object') return;
      delete object.irrigationOrigin;
      for (const child of Object.values(object)) if (child && typeof child === 'object') strip(child);
    };
    strip(value);
    if (value.features) for (const key of ['shafts', 'zoneManagement', 'blowout', 'pump', 'plans', 'pictureExport', 'demo', 'map']) value.features[key] = false;
  }
  return new Response(JSON.stringify(value), {status: response.status, headers: response.headers});
}

export function workspaceGardenNotesStatement(env, member, id, discipline, notes, gate, ...args) {
  return env.DB.prepare(`INSERT INTO garden_discipline_data(garden_id,discipline,notes,version) SELECT ?,?,?,1 WHERE ${gate} ON CONFLICT(garden_id,discipline) DO UPDATE SET notes=excluded.notes,version=garden_discipline_data.version+1`).bind(id, discipline, notes, ...args);
}

// A response must belong to one authorization snapshot. In particular, a list
// queried after reassignment must never be projected with the previous team's
// irrigation privileges. Guard binary responses as well as JSON DTOs.
export async function workspaceFilterResponse(response, request, env) {
  const initial = env._workspaceScope;
  if (response.status >= 400 || env._workspaceTransferResponse) return response;
  if (!initial) {
    if (env._workspaceStartStamp !== undefined && env._workspaceStartStamp !== await workspaceTransferStamp(env)) {
      try { await response.body?.cancel(); } catch {}
      return Response.json({code:'workspace_conflict',error:'Probíhá přepnutí společného adresáře. Obnovte aplikaci.'},{status:409,headers:{'cache-control':'no-store'}});
    }
    return response;
  }
  const path = new URL(request.url).pathname;
  const ownMetadataChange = !['GET','HEAD'].includes(request.method) && (
    /^\/api\/workspace\/(?:members|customers|gardens)\/[-\w]+\/disciplines$/.test(path) ||
    /^\/api\/members\/[-\w]+$/.test(path) || path === '/api/workspace/link-identity'||path==='/api/local-accounts'&&['owner','administrator','admin'].includes(initial.role)||['owner','administrator','admin'].includes(initial.role)&&/^\/api\/(?:gardens|customers)\/[-\w]+(?:\/customer)?$/.test(path));
  const sameAccess = current => current && current.workspaceId === initial.workspaceId &&
    current.state === initial.state && current.role === initial.role &&
    JSON.stringify(current.disciplines) === JSON.stringify(initial.disciplines);
  const compatible = current => sameAccess(current) &&
    (current.authorizationVersion === initial.authorizationVersion || ownMetadataChange) &&
    (!['GET','HEAD'].includes(request.method) || current.plannerVersion === initial.plannerVersion);
  const conflict = async pending => {
    try { await pending.body?.cancel(); } catch {}
    return new Response(JSON.stringify({code:'workspace_conflict',error:'Oprávnění nebo přiřazení se během načítání změnila. Obnovte přehled.'}),
      {status:409,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  };
  const current = await workspaceActor(env.DB,initial.userId);
  if (!compatible(current)) return conflict(response);
  current.selectedDiscipline = initial.selectedDiscipline;
  const projected = await workspaceProjectResponse(response,request,{...env,_workspaceScope:current});
  const after = await workspaceActor(env.DB,initial.userId);
  if (!compatible(after) || after.authorizationVersion !== current.authorizationVersion || after.plannerVersion !== current.plannerVersion)
    return conflict(projected);
  return projected;
}
