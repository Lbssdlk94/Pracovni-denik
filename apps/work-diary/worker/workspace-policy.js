// These predicates take server-owned SQL identifiers only. Never pass URL/body values.
const workspaceManagers = "('owner','administrator','admin')";
const workspaceEnabled = "EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))";
function workspaceIdentifier(value) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new TypeError('Invalid SQL identifier');
  return value;
}
export function workspaceDisciplineSql(discipline, actor = 'actor') {
  workspaceIdentifier(actor);
  if (!/^[a-z][a-z0-9_]*\.discipline$/.test(discipline)) throw new TypeError('Invalid discipline column');
  // Unknown/unclassified discipline never grants access, including to a manager.
  return `(${workspaceEnabled}=0 OR (${discipline} IN ('irrigation','garden') AND (${actor}.role IN ${workspaceManagers} OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=${actor}.user_id AND md.discipline=${discipline}))))`;
}
export function workspaceJobScope(alias = 'j') {
  workspaceIdentifier(alias);
  return `EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND ${workspaceDisciplineSql(alias + '.discipline')} AND (actor.role IN ${workspaceManagers} OR ((${alias}.assigned_to=actor.user_id OR EXISTS(SELECT 1 FROM json_each(${alias}.assigned_users) chosen WHERE chosen.value=actor.user_id)) AND ${alias}.service_approval='confirmed')))`;
}
export function workspaceCustomerScope(alias = 'c') {
  workspaceIdentifier(alias);
  const legacy = `EXISTS(SELECT 1 FROM jobs j WHERE j.customer_id=${alias}.id AND j.deleted=0 AND j.service_approval='confirmed' AND (j.assigned_to=actor.user_id OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) chosen WHERE chosen.value=actor.user_id)))`;
  return `EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND (actor.role IN ${workspaceManagers} OR (CASE WHEN ${workspaceEnabled} THEN EXISTS(SELECT 1 FROM customer_disciplines cd JOIN member_disciplines md ON md.discipline=cd.discipline AND md.user_id=actor.user_id WHERE cd.customer_id=${alias}.id) ELSE (COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1 AND ${legacy}) END)))`;
}
export function workspaceGardenScope(alias = 'g') {
  workspaceIdentifier(alias);
  return `EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=? AND (${workspaceEnabled}=0 OR actor.role IN ${workspaceManagers} OR (${alias}.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines cd JOIN member_disciplines md ON md.discipline=cd.discipline AND md.user_id=actor.user_id WHERE cd.customer_id=${alias}.customer_id)) OR (${alias}.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd JOIN member_disciplines md ON md.discipline=gd.discipline AND md.user_id=actor.user_id WHERE gd.garden_id=${alias}.id))))`;
}
export async function workspaceActor(db, actorId) {
  const row = await db.prepare('SELECT id,state,authorization_revision FROM workspaces LIMIT 1').first();
  if (!row || !['active', 'read_only'].includes(row.state)) return null;
  const actor = await db.prepare('SELECT user_id,role FROM members WHERE user_id=?').bind(actorId).first();
  if (!actor) return null;
  const result = await db.prepare('SELECT discipline FROM member_disciplines WHERE user_id=? ORDER BY discipline').bind(actorId).all();
  const manager = ['owner', 'administrator', 'admin'].includes(actor.role);
  const identityBindings=(await db.prepare('SELECT installation_id AS installationId,external_user_id AS userId FROM workspace_identity_aliases WHERE canonical_user_id=? ORDER BY installation_id,external_user_id').bind(actorId).all()).results;
  const entryInstallations=(await db.prepare('SELECT installation_id AS id,discipline FROM workspace_organizations WHERE workspace_id=? ORDER BY discipline').bind(row.id).all()).results;
  return {identityBindings,entryInstallations,workspaceId: row.id, state: row.state, authorizationVersion: row.authorization_revision,
    userId: actor.user_id, role: actor.role,
    disciplines: manager ? ['irrigation', 'garden'] : result.results.map(value => value.discipline)};
}

// Garden DTO must be filtered before serializing or caching it in the browser.
// Old notes/pump/plan/blowout are irrigation work, not shared garden description.
export function workspaceGardenProjection(dto, authorization, disciplineNotes = {}) {
  if (!authorization) return dto;
  const result = {...dto, notes: ''};
  if (!authorization.disciplines.includes('irrigation')) {
    for (const key of ['pumpType', 'plan', 'blowout', 'planMarkers', 'shafts', 'shaftCount', 'blowoutCount']) delete result[key];
  }
  result.workNotes = Object.fromEntries(authorization.disciplines
    .filter(value => Object.hasOwn(disciplineNotes, value)).map(value => [value, disciplineNotes[value]]));
  return result;
}

export function workspaceGardenNotesSql(garden = 'g', job = 'j') {
  workspaceIdentifier(garden); workspaceIdentifier(job);
  return `CASE WHEN ${workspaceEnabled} THEN COALESCE((SELECT notes FROM garden_discipline_data wd WHERE wd.garden_id=${garden}.id AND wd.discipline=${job}.discipline),CASE WHEN ${job}.discipline='irrigation' THEN ${garden}.notes ELSE '' END) ELSE ${garden}.notes END`;
}
