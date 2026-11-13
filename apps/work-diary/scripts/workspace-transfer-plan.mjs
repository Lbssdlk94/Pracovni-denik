// Offline inspection only: this module cannot connect to a server or apply a migration.
import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const references = [
  ['gardens', 'customer_id', 'customers', 'id', true],
  ['jobs', 'customer_id', 'customers', 'id', true],
  ['jobs', 'garden_id', 'gardens', 'id', true],
  ['shafts', 'garden_id', 'gardens', 'id', true],
  ['service_logs', 'garden_id', 'gardens', 'id', false],
  ['garden_defects', 'garden_id', 'gardens', 'id', false],
  ['garden_defects', 'source_job_id', 'jobs', 'id', true],
  ['service_reports', 'job_id', 'jobs', 'id', false],
  ['service_photos', 'job_id', 'jobs', 'id', false],
  ['job_photos', 'job_id', 'jobs', 'id', false]
];
const structuralTables = ['customers', 'gardens', 'jobs', 'members'];
export function workspaceTransferPlan(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length !== 2) throw new Error('Exactly two restored installation snapshots are required');
  if (new Set(snapshots.map(value => value.installationId)).size !== 2 ||
      new Set(snapshots.map(value => value.discipline)).size !== 2 ||
      snapshots.some(value => !['irrigation', 'garden'].includes(value.discipline) ||
        !/^inst-[-\w]{10,80}$/.test(value.installationId) || !value.tables ||
        structuralTables.some(name => !Array.isArray(value.tables[name])))) throw new Error('Invalid or incomplete snapshots');
  const sources = [...snapshots].sort((a, b) => a.discipline.localeCompare(b.discipline));
  const blockers = [], warnings = [], inventory = [], identities = [], classification = [];
  const ids = new Map();
  for (const source of sources) {
    if (!source.backup?.restored || !/^[a-f0-9]{64}$/.test(source.backup?.verifiedHash || '')) blockers.push({code: 'backup_restore_not_verified', installationId: source.installationId});
    let optionalEmpty = 0;
    for (const [table, column, parent, parentColumn, optional] of references) {
      const parentIds = new Set((source.tables[parent] || []).map(row => row[parentColumn]));
      for (const row of source.tables[table] || []) {
        const value = row[column];
        if (value === null || value === undefined || value === '') {
          if (optional) optionalEmpty++;
          else blockers.push({code: 'required_reference_missing', installationId: source.installationId, table, id: row.id || row.job_id, column});
        } else if (!parentIds.has(value)) warnings.push({code: 'dangling_reference_review', installationId: source.installationId, table, id: row.id || row.job_id, column, targetId: value});
      }
    }
    const counts = {};
    for (const [table, rows] of Object.entries(source.tables).sort(([a], [b]) => a.localeCompare(b))) {
      if (!Array.isArray(rows)) throw new Error('Invalid table snapshot: ' + table);
      counts[table] = rows.length;
      // Inspect identity-bearing operational tables; singleton/configuration rows are NOT merged.
      for (const row of rows) {
        const identity = table === 'members' ? row.user_id : row.id;
        if (identity === undefined) continue;
        if (typeof identity !== 'string' || !identity) throw new Error('Invalid original identifier');
        const key = table + '\0' + identity;
        if (ids.has(key)) blockers.push({code: 'identifier_collision_review', table, id: identity, installations: [ids.get(key), source.installationId]});
        ids.set(key, source.installationId);
      }
    }
    for (const member of source.tables.members) identities.push({installationId: source.installationId, userId: member.user_id, originalRole: member.role, discipline: source.discipline});
    for (const entity of ['customers', 'gardens', 'jobs', 'service_logs', 'garden_defects', 'subscriptions']) {
      for (const row of source.tables[entity] || []) classification.push({installationId: source.installationId, entity, id: row.id, discipline: source.discipline, rowHash: hash(row)});
    }
    inventory.push({installationId: source.installationId, discipline: source.discipline, counts, optionalEmpty});
  }
  const emailOwners = new Map();
  for (const source of sources) for (const member of source.tables.members) {
    const email = String(member.email || '').trim().toLowerCase();
    if (!email) continue;
    if (emailOwners.has(email)) blockers.push({code:'member_email_collision_review', identities:[emailOwners.get(email), {installationId:source.installationId,userId:member.user_id,originalRole:member.role}]});
    else emailOwners.set(email,{installationId:source.installationId,userId:member.user_id,originalRole:member.role});
  }
  // Never deduplicate by name, phone, e-mail or address. Preserve every source identity.
  // No row values/contact details, tokens, credential settings, file contents or SQL in the report.
  for (const collection of [identities, classification, blockers, warnings]) collection.sort((a, b) => JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))));
  const content = {format: 'work-diary-transfer-dry-run', version: 1, inventory, identities, classification, blockers, warnings};
  return {...content, planHash: hash(content), readyForCutover: false,
    pendingGates: ['full_api_authorization', 'organization_roles_and_licenses', 'offline_revocation', 'file_registry_and_restore', 'live_identity_review']};
}
