import {normalizeDisciplines} from '../web/discipline-model.js';
import {canEditTeamMember} from '../web/team-roles.js';

const membershipEntities = Object.freeze({
  member: {table: 'member_disciplines', key: 'user_id', source: 'members', sourceKey: 'user_id'},
  customer: {table: 'customer_disciplines', key: 'customer_id', source: 'customers', sourceKey: 'id'},
  garden: {table: 'garden_disciplines', key: 'garden_id', source: 'gardens', sourceKey: 'id'}
});
async function membershipHash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function readWorkspaceMembership(db, entity, id) {
  const type = membershipEntities[entity];
  if (!type) throw new TypeError('Unknown membership entity');
  const version = await db.prepare('SELECT version FROM workspace_entity_versions WHERE entity=? AND entity_id=?').bind(entity, id).first();
  const rows = await db.prepare(`SELECT discipline FROM ${type.table} WHERE ${type.key}=? ORDER BY discipline`).bind(id).all();
  return {entity, id, version: version?.version || 0, disciplines: rows.results.map(row => row.discipline)};
}

// Call with an authenticated member. Neither actor ID nor role comes from the request body.
// All changes, audit, revision and membership writes commit in one D1 transaction.
export async function changeWorkspaceMembership(db, actor, entity, id, input, fail) {
  const type = membershipEntities[entity];
  if (!type || !/^[-\w]{1,100}$/.test(id)) fail(400, 'Neplatná evidence příslušnosti.');
  if (!input || Object.keys(input).some(key => !['operationId', 'version', 'disciplines'].includes(key)) ||
      !/^[-\w]{8,100}$/.test(input.operationId || '') || !Number.isSafeInteger(input.version) || input.version < 1) {
    fail(400, 'Zkontrolujte verzi a identifikátor změny.');
  }
  let disciplines;
  try { disciplines = normalizeDisciplines(input.disciplines); } catch (error) { fail(400, error.message); }
  const currentActor = await db.prepare('SELECT * FROM members WHERE user_id=?').bind(actor.user_id).first();
  if (!currentActor || !['owner', 'administrator', 'admin'].includes(currentActor.role)) fail(403, 'Příslušnost mění pouze správce.');
  const target = await db.prepare(`SELECT * FROM ${type.source} WHERE ${type.sourceKey}=?`).bind(id).first();
  if (!target) fail(404, 'Záznam nebyl nalezen.');
  if (entity === 'member' && !canEditTeamMember(currentActor, target)) fail(403, 'Příslušnost tohoto člena nemůžete měnit.');
  const state = await db.prepare('SELECT id,state FROM workspaces LIMIT 1').first();
  if (!state || state.state !== 'active') fail(409, 'Společný pracovní prostor zatím není aktivní nebo je pouze ke čtení.');
  const hash = await membershipHash(JSON.stringify([actor.user_id, entity, id, input.version, disciplines]));
  const previous = await db.prepare('SELECT request_hash,actor_id FROM workspace_audit WHERE operation_id=?').bind(input.operationId).first();
  if (previous) {
    if (previous.request_hash !== hash || previous.actor_id !== actor.user_id) fail(409, 'Identifikátor změny už byl použit pro jiná data.');
    return {...await readWorkspaceMembership(db, entity, id), replayed: true};
  }
  const old = await readWorkspaceMembership(db, entity, id);
  if (old.version !== input.version) fail(409, 'Příslušnost mezitím změnil jiný správce. Obnovte údaje.');
  if (entity === 'garden' && target.customer_id) fail(400, 'Příslušnost propojené zahrady se řídí zákazníkem.');
  // Recheck actor hierarchy and state in the committing statement, not just before it.
  const hierarchy = entity === 'member' ? " AND EXISTS(SELECT 1 FROM members target WHERE target.user_id=? AND (target.user_id<>actor.user_id AND ((actor.role='owner' AND target.role IN ('administrator','admin','worker','reader')) OR (actor.role='administrator' AND target.role IN ('admin','worker','reader')) OR (actor.role='admin' AND target.role IN ('worker','reader')))))" : '';
  const gate = `EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND actor.role=? AND actor.role IN ('owner','administrator','admin')${hierarchy}) AND EXISTS(SELECT 1 FROM workspaces WHERE id=? AND state='active')`;
  const changed = "EXISTS(SELECT 1 FROM workspace_entity_versions WHERE entity=? AND entity_id=? AND version=? AND last_operation=?)";
  const args = [entity, id, input.version + 1, input.operationId];
  const statements = [db.prepare(`UPDATE workspace_entity_versions SET version=version+1,last_operation=? WHERE entity=? AND entity_id=? AND version=? AND ${gate}`)
    .bind(input.operationId, entity, id, input.version, actor.user_id, currentActor.role, ...(entity === 'member' ? [id] : []), state.id),
    db.prepare(`INSERT INTO workspace_audit(operation_id,entity,entity_id,actor_id,at,base_version,old_disciplines,new_disciplines,request_hash) SELECT ?,?,?,?,?,?,?,?,? WHERE ${changed}`)
      .bind(input.operationId, entity, id, actor.user_id, Date.now(), input.version, JSON.stringify(old.disciplines), JSON.stringify(disciplines), hash, ...args),
    // Delete only removed disciplines: unchanged membership is not briefly removed.
    db.prepare(`DELETE FROM ${type.table} WHERE ${type.key}=? AND discipline NOT IN (SELECT value FROM json_each(?)) AND ${changed}`)
      .bind(id, JSON.stringify(disciplines), ...args)];
  for (const discipline of disciplines) statements.push(db.prepare(`INSERT OR IGNORE INTO ${type.table}(${type.key},discipline) SELECT ?,? WHERE ${changed}`).bind(id, discipline, ...args));
  statements.push(db.prepare(`UPDATE workspaces SET authorization_revision=authorization_revision+1,updated_at=? WHERE id=? AND ${changed}`).bind(Date.now(), state.id, ...args));
  let results;
  try { results = await db.batch(statements); } catch (error) {
    const committed = await db.prepare('SELECT request_hash FROM workspace_audit WHERE operation_id=?').bind(input.operationId).first();
    if (committed?.request_hash === hash) return {...await readWorkspaceMembership(db, entity, id), replayed: true};
    if (committed) fail(409, 'Identifikátor změny už byl použit pro jiná data.');
    if (String(error.message).includes('workspace_customer_has_work')) fail(409, 'Obor nelze odebrat: zákazník v něm má zakázky nebo pracovní historii.');
    throw error;
  }
  if (!results[0].meta.changes) {
    const replay = await db.prepare('SELECT request_hash FROM workspace_audit WHERE operation_id=?').bind(input.operationId).first();
    if (replay?.request_hash === hash) return {...await readWorkspaceMembership(db, entity, id), replayed: true};
    fail(409, 'Oprávnění nebo příslušnost se mezitím změnily. Obnovte údaje.');
  }
  return readWorkspaceMembership(db, entity, id);
}
