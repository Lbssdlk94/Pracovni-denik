async function workspaceEntryInstallation(env) {
  return env.WORKSPACE_ENTRY_ID || env.INSTALLATION_ID || (await env.DB.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").first())?.instance_id;
}
export async function workspaceIdentityMember(env, user) {
  const workspace = await env.DB.prepare("SELECT id FROM workspaces WHERE state IN ('active','read_only') LIMIT 1").first();
  if (!workspace) return {active: false};
  const installationId = await workspaceEntryInstallation(env);
  const member = await env.DB.prepare('SELECT m.* FROM workspace_identity_aliases a JOIN workspace_organizations o ON o.installation_id=a.installation_id JOIN members m ON m.user_id=a.canonical_user_id WHERE o.workspace_id=? AND a.installation_id=? AND a.external_user_id=?')
    .bind(workspace.id, installationId, user.id).first();
  return {active: true, installationId, member};
}

// Inviting a new colleague is explicit authorization. Claims take their role/scopes
// from the invitation inside the same transaction, never from the browser or e-mail matching.
export async function workspaceInvitationStatements(env, email, canonicalId, externalUserId = null) {
  if (!await env.DB.prepare("SELECT id FROM workspaces WHERE state='active' LIMIT 1").first()) return [];
  const installationId = await workspaceEntryInstallation(env), now = Date.now();
  const gate = "i.email=? AND i.expires_at>? AND EXISTS(SELECT 1 FROM members m WHERE m.user_id=? AND m.email=i.email)";
  const args = [email, now, canonicalId];
  const statements = [env.DB.prepare(`INSERT OR IGNORE INTO member_disciplines(user_id,discipline) SELECT ?,d.value FROM invitations i,json_each(i.disciplines) d WHERE ${gate} AND d.value IN ('irrigation','garden')`)
    .bind(canonicalId, ...args),
    env.DB.prepare(`INSERT OR IGNORE INTO workspace_member_grants(user_id,organization_id,original_role) SELECT ?,i.origin_organization_id,m.role FROM invitations i JOIN members m ON m.user_id=? JOIN workspace_organizations o ON o.id=i.origin_organization_id WHERE ${gate}`)
      .bind(canonicalId, canonicalId, ...args),
    env.DB.prepare(`INSERT OR IGNORE INTO workspace_entity_versions(entity,entity_id) SELECT 'member',? FROM invitations i WHERE ${gate}`).bind(canonicalId, ...args),
    env.DB.prepare(`INSERT OR IGNORE INTO workspace_audit(operation_id,entity,entity_id,actor_id,at,base_version,old_disciplines,new_disciplines,request_hash) SELECT ?,'member',?,i.created_by,?,0,'[]',i.disciplines,? FROM invitations i WHERE ${gate}`)
      .bind('initial:member:' + canonicalId, canonicalId, now, 'invitation:' + canonicalId, ...args)];
  if (externalUserId) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO workspace_identity_aliases(installation_id,external_user_id,canonical_user_id,original_role,original_email,original_name,approved_by,approved_at,method) SELECT ?,?,m.user_id,m.role,m.email,m.name,i.created_by,?,'invitation' FROM invitations i JOIN members m ON m.user_id=? WHERE ${gate}`)
    .bind(installationId, externalUserId, now, canonicalId, ...args));
  statements.push(env.DB.prepare("UPDATE workspaces SET authorization_revision=authorization_revision+1,updated_at=? WHERE EXISTS(SELECT 1 FROM workspace_audit WHERE operation_id=? AND at=?)").bind(now, 'initial:member:' + canonicalId, now));
  return statements;
}

export async function linkWorkspaceIdentity(request, env, member, helpers) {
  const {fail, body, json} = helpers;
  if (request.method !== 'POST') fail(405, 'Nepodporovaná operace.');
  const input = await body(request, 1000);
  if (Object.keys(input).some(key=>key!=='confirm') || input.confirm !== 'PROPOJIT' || member._authMethod !== 'link' || !member._sessionHash) fail(403, 'Propojení potvrďte po otevření svého platného osobního odkazu.');
  const externalId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!externalId || email !== member.email.toLowerCase()) fail(403, 'Přihlaste se na hostingu stejným účtem, pro který byl osobní přístup vydán.');
  const workspace = await env.DB.prepare("SELECT id FROM workspaces WHERE state='active' LIMIT 1").first();
  if (!workspace) fail(409, 'Společný pracovní prostor není aktivní.');
  const installationId = await workspaceEntryInstallation(env);
  const organization = await env.DB.prepare('SELECT id FROM workspace_organizations WHERE installation_id=? AND workspace_id=?').bind(installationId, workspace.id).first();
  if (!organization) fail(403, 'Tento vstup nepatří ke společnému pracovnímu prostoru.');
  const old = await env.DB.prepare('SELECT canonical_user_id FROM workspace_identity_aliases WHERE installation_id=? AND external_user_id=?').bind(installationId, externalId).first();
  if (old && old.canonical_user_id !== member.user_id) fail(409, 'Tento účet již patří jinému přístupu. Propojení musí posoudit vlastník.');
  if (old) return json({ok: true, replayed: true});
  const now = Date.now(), operation = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO workspace_identity_aliases(installation_id,external_user_id,canonical_user_id,original_role,original_email,original_name,approved_by,approved_at,method) SELECT ?,?,m.user_id,m.role,m.email,m.name,m.user_id,?,'personal-proof' FROM members m JOIN access_sessions s ON s.user_id=m.user_id WHERE m.user_id=? AND s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND lower(m.email)=? AND EXISTS(SELECT 1 FROM workspaces WHERE id=? AND state='active')")
      .bind(installationId, externalId, now, member.user_id, member._sessionHash, now, email, workspace.id),
    env.DB.prepare("INSERT INTO workspace_identity_events(id,actor_id,at,installation_id,external_user_id,canonical_user_id,kind) SELECT ?,?,?,?,?,?,'personal-proof' WHERE changes()=1")
      .bind(operation, member.user_id, now, installationId, externalId, member.user_id),
    env.DB.prepare('UPDATE workspaces SET authorization_revision=authorization_revision+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM workspace_identity_events WHERE id=?)').bind(now, workspace.id, operation)
  ]);
  if (!results[0].meta.changes) fail(409, 'Přístup byl mezitím odvolán nebo propojen jinak. Otevřete nový osobní odkaz.');
  // Identity binding alone grants no organization ownership or extra discipline.
  return json({ok: true});
}

export async function issueWorkspaceIdentityInvite(request, env, actor, helpers) {
  const {fail, body, json} = helpers;
  if (request.method !== 'POST') fail(405, 'Nepodporovaná operace.');
  const input = await body(request, 1000), id = input.memberId || actor.user_id;
  if (Object.keys(input).some(key => key !== 'memberId') || !/^[-\w]{1,100}$/.test(id)) fail(400, 'Vyberte platný účet.');
  const target = await env.DB.prepare('SELECT * FROM members WHERE user_id=?').bind(id).first();
  if (!target) fail(404, 'Člen nebyl nalezen.');
  const permitted = actor.user_id === id || (actor.role === 'owner' && target.role !== 'owner') ||
    (actor.role === 'administrator' && ['admin', 'worker', 'reader'].includes(target.role)) ||
    (actor.role === 'admin' && ['worker', 'reader'].includes(target.role));
  if (!permitted) fail(403, 'Přístup tohoto účtu nemůžete vydat.');
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), byte => byte.toString(16).padStart(2, '0')).join('');
  const now = Date.now(), expires = now + 3600000;
  const result = await env.DB.prepare("INSERT INTO guest_access(user_id,email,token_hash,created_at,expires_at,single_use) SELECT m.user_id,m.email,?,?,?,1 FROM members m JOIN members actor ON actor.user_id=? WHERE m.user_id=? AND m.role=? AND actor.role=? AND (actor.user_id=m.user_id OR (actor.role='owner' AND m.role<>'owner') OR (actor.role='administrator' AND m.role IN ('admin','worker','reader')) OR (actor.role='admin' AND m.role IN ('worker','reader'))) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,single_use=1")
    .bind(digest, now, expires, actor.user_id, id, target.role, actor.role).run();
  if (!result.meta.changes) fail(409, 'Oprávnění se mezitím změnilo. Obnovte tým.');
  const origin = env.WORKSPACE_ENTRY_ORIGIN || new URL(request.url).origin;
  return json({url: origin + '/#access=' + token, expiresAt: expires, oneTime: true, replacesUnusedLink: true});
}
