import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceTransferPlan} from '../scripts/workspace-transfer-plan.mjs';
function snapshot(discipline) {
  return {installationId: 'inst-' + discipline + '-isolated-snapshot', discipline, backup: {restored: true, verifiedHash: 'a'.repeat(64)}, tables: {
    members: [{user_id: discipline + '-owner', role: 'owner'}],
    customers: [{id: discipline + '-customer', name: 'Stejné jméno', email: 'private@example.test'}],
    gardens: [{id: discipline + '-garden', customer_id: discipline + '-customer', address: 'Private address'}],
    jobs: [{id: discipline + '-job', customer_id: discipline + '-customer', garden_id: discipline + '-garden', deleted: 0}],
    service_reports: [{job_id: discipline + '-job', material_items: '[{"priceMinor":2500}]'}]
  }};
}
test('repeatable dry-run preserves original identities, disciplines and row hashes without disclosing contacts', () => {
  const input = [snapshot('irrigation'), snapshot('garden')];
  const original = structuredClone(input);
  const a = workspaceTransferPlan(input), b = workspaceTransferPlan([...input].reverse());
  assert.equal(a.planHash, b.planHash);
  assert.deepEqual(input, original);
  assert.equal(a.inventory[0].counts.customers + a.inventory[1].counts.customers, 2);
  assert.equal(a.identities.length, 2);
  assert.deepEqual(a.blockers, []);
  assert.equal(a.readyForCutover, false);
  assert.ok(!JSON.stringify(a).includes('private@example.test'));
  assert.ok(!JSON.stringify(a).includes('Private address'));
  assert.ok(a.classification.every(row => /^[0-9a-f]{64}$/.test(row.rowHash)));
});
test('nullable references are counted separately; nonempty missing IDs require review, never automatic matching', () => {
  const input = [snapshot('irrigation'), snapshot('garden')];
  input[0].tables.jobs[0].garden_id = null;
  input[0].tables.gardens[0].customer_id = 'missing-customer';
  const plan = workspaceTransferPlan(input);
  assert.equal(plan.inventory.find(row => row.discipline === 'irrigation').optionalEmpty, 1);
  assert.equal(plan.warnings[0].code, 'dangling_reference_review');
  assert.equal(input[0].tables.gardens[0].customer_id, 'missing-customer');
});
test('same IDs and unverified restore block import instead of merging people or overwriting data', () => {
  const input = [snapshot('irrigation'), snapshot('garden')];
  input[1].tables.customers[0].id = input[0].tables.customers[0].id;
  input[1].backup.restored = false;
  const plan = workspaceTransferPlan(input);
  assert.ok(plan.blockers.some(row => row.code === 'identifier_collision_review'));
  assert.ok(plan.blockers.some(row => row.code === 'backup_restore_not_verified'));
  assert.throws(() => workspaceTransferPlan([snapshot('garden'), snapshot('garden')]));
});
