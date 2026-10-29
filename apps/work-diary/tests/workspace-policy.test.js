import test from 'node:test';
import assert from 'node:assert/strict';
import {environment, people, request} from './fixtures.mjs';
import {api} from '../worker/api.js';
import {workspaceActor, workspaceJobScope, workspaceCustomerScope, workspaceGardenScope, workspaceGardenProjection} from '../worker/workspace-policy.js';
import {changeWorkspaceMembership, readWorkspaceMembership} from '../worker/workspace-memberships.js';
import {normalizeDisciplines, disciplineLabel} from '../web/discipline-model.js';

const context = {waitUntil: task => task.catch(() => {})};
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
async function setup() {
  const e = environment();
  const call = async (path, user = people.owner, method = 'GET', body) => {
    const response = await api(request(path, user, method, body), e, context);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  await call('/api/me');
  for (const role of ['worker', 'reader', 'admin']) {
    await call('/api/invitations', people.owner, 'POST', {email: people[role].email, role});
    await call('/api/me', people[role]);
  }
  for (const id of ['irr', 'green', 'both']) {
    await call('/api/customers/' + id, people.owner, 'PUT', {version: 0, name: 'Jméno ' + id, phones: [], addresses: []});
  }
  for (const [id, customer] of [['i', 'both'], ['g', 'both'], ['hidden', 'both'], ['unknown', 'both']]) {
    await call('/api/jobs/' + id, people.owner, 'PUT', {version: 0, title: id, customerId: customer, assignedTo: id === 'hidden' ? people.reader.id : people.worker.id, status: 'planned'});
  }
  const s = e.sqlite;
  s.exec("INSERT INTO workspaces VALUES('pair','preparing',1,1,1)");
  const installation=s.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").get().instance_id;
  s.prepare("INSERT INTO workspace_organizations VALUES('source-org','pair',?,'irrigation','Source test')").run(installation);
  s.prepare("INSERT INTO workspace_organizations VALUES('garden-org','pair','inst-garden-isolated-test','garden','Garden test')").run();
  for(const role of ['owner','admin','worker','reader']) {
    const person=s.prepare('SELECT * FROM members WHERE user_id=?').get(people[role].id);
    s.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,?, 'original')").run(installation,person.user_id,person.user_id,person.role,person.email,person.name,people.owner.id,1);
    s.prepare('INSERT INTO workspace_member_grants VALUES(?,?,?)').run(person.user_id,'source-org',person.role);
  }

  for (const [id, disciplines] of [['irr', ['irrigation']], ['green', ['garden']], ['both', ['irrigation', 'garden']]]) {
    for (const value of disciplines) s.prepare('INSERT INTO customer_disciplines VALUES(?,?)').run(id, value);
    s.prepare("INSERT INTO workspace_entity_versions(entity,entity_id) VALUES('customer',?)").run(id);
  }
  for (const role of ['owner', 'admin', 'worker', 'reader']) {
    const id = people[role].id;
    s.prepare('INSERT INTO member_disciplines VALUES(?,?)').run(id, role === 'reader' ? 'garden' : 'irrigation');
    s.prepare("INSERT INTO workspace_entity_versions(entity,entity_id) VALUES('member',?)").run(id);
  }
  for (const [id, discipline] of [['i', 'irrigation'], ['g', 'garden'], ['hidden', 'irrigation']]) s.prepare('UPDATE jobs SET discipline=? WHERE id=?').run(discipline, id);
  s.exec("UPDATE workspaces SET state='active'");
  const manager = s.prepare('SELECT * FROM members WHERE user_id=?').get(people.owner.id);
  return {...e, call, manager};
}
function visible(e, entity, user) {
  const [table, alias, scope] = entity === 'job' ? ['jobs', 'j', workspaceJobScope()] : entity === 'customer' ? ['customers', 'c', workspaceCustomerScope()] : ['gardens', 'g', workspaceGardenScope()];
  return e.sqlite.prepare(`SELECT ${alias}.id FROM ${table} ${alias} WHERE ${scope} ORDER BY ${alias}.id`).all(user).map(row => row.id);
}

test('shared contact membership never grants cross-discipline jobs or overrides assignment', async () => {
  const e = await setup();
  try {
    assert.deepEqual(visible(e, 'customer', people.worker.id), ['both', 'irr']);
    assert.deepEqual(visible(e, 'customer', people.reader.id), ['both', 'green']);
    assert.deepEqual(visible(e, 'job', people.worker.id), ['i']);
    assert.deepEqual(visible(e, 'job', people.reader.id), []);
    assert.deepEqual(visible(e, 'job', people.admin.id), ['g', 'hidden', 'i']);
    e.sqlite.prepare("INSERT INTO member_disciplines VALUES(?,'garden')").run(people.worker.id);
    assert.deepEqual(visible(e, 'job', people.worker.id), ['g', 'i']);
    assert.deepEqual(visible(e, 'customer', 'foreign-company-user'), []);
    assert.deepEqual(visible(e, 'job', 'foreign-company-user'), []);
  } finally { e.sqlite.close(); }
});

test('garden visibility uses identifiers and distinguishes a null optional link from a dangling one', async () => {
  const e = await setup();
  try {
    const linked = visible(e, 'garden', people.reader.id);
    assert.equal(linked.length, 2); // Garden and Obojí, not the irrigation-only customer's garden.
    const row = e.sqlite.prepare("SELECT * FROM gardens WHERE customer_id='irr'").get();
    e.sqlite.prepare('UPDATE gardens SET customer_id=NULL WHERE id=?').run(row.id);
    e.sqlite.prepare("INSERT INTO garden_disciplines VALUES(?,'garden')").run(row.id);
    assert.ok(visible(e, 'garden', people.reader.id).includes(row.id));
    assert.ok(!visible(e, 'garden', people.worker.id).includes(row.id));
    assert.throws(() => workspaceJobScope('j; DROP TABLE jobs'));
  } finally { e.sqlite.close(); }
});

test('membership change is versioned, audited, idempotent and invalidates authorization manifest', async () => {
  const e = await setup();
  try {
    const input = {version: 1, operationId: 'member-operation-1', disciplines: ['garden']};
    const before = await workspaceActor(e.DB, people.worker.id);
    const result = await changeWorkspaceMembership(e.DB, e.manager, 'member', people.worker.id, input, fail);
    assert.equal(result.version, 2);
    assert.deepEqual(result.disciplines, ['garden']);
    assert.equal((await changeWorkspaceMembership(e.DB, e.manager, 'member', people.worker.id, input, fail)).replayed, true);
    assert.equal(e.sqlite.prepare('SELECT count(*) n FROM workspace_audit').get().n, 1);
    const after = await workspaceActor(e.DB, people.worker.id);
    assert.equal(after.authorizationVersion, before.authorizationVersion + 1);
    assert.deepEqual(after.disciplines, ['garden']);
    await assert.rejects(changeWorkspaceMembership(e.DB, e.manager, 'member', people.worker.id, {...input, operationId: 'stale-operation'}, fail), {status: 409});
    await assert.rejects(changeWorkspaceMembership(e.DB, e.manager, 'member', people.worker.id, {...input, disciplines: ['irrigation']}, fail), {status: 409});
    assert.equal(e.sqlite.prepare('SELECT role FROM members WHERE user_id=?').get(people.worker.id).role, 'worker');
  } finally { e.sqlite.close(); }
});

test('customer can gain a second discipline without a duplicate; used discipline removal rolls back the entire transaction', async () => {
  const e = await setup();
  try {
    const count = e.sqlite.prepare('SELECT count(*) n FROM customers').get().n;
    await changeWorkspaceMembership(e.DB, e.manager, 'customer', 'green', {version: 1, operationId: 'customer-add-second', disciplines: ['garden', 'irrigation']}, fail);
    assert.equal(e.sqlite.prepare('SELECT count(*) n FROM customers').get().n, count);
    const before = await readWorkspaceMembership(e.DB, 'customer', 'both');
    await assert.rejects(changeWorkspaceMembership(e.DB, e.manager, 'customer', 'both', {version: 1, operationId: 'customer-remove-used', disciplines: ['garden']}, fail), {status: 409});
    assert.deepEqual(await readWorkspaceMembership(e.DB, 'customer', 'both'), before);
    assert.equal(e.sqlite.prepare("SELECT count(*) n FROM workspace_audit WHERE operation_id='customer-remove-used'").get().n, 0);
    e.sqlite.exec("UPDATE jobs SET deleted=1 WHERE discipline='irrigation'");
    await assert.rejects(changeWorkspaceMembership(e.DB, e.manager, 'customer', 'both', {version: 1, operationId: 'customer-remove-deleted', disciplines: ['garden']}, fail), {status: 409});
  } finally { e.sqlite.close(); }
});

test('server hierarchy and current database role prevent forged or revoked manager grants', async () => {
  const e = await setup();
  try {
    const input = {version: 1, operationId: 'forged-role-change', disciplines: ['garden']};
    await assert.rejects(changeWorkspaceMembership(e.DB, {...e.manager, user_id: people.worker.id}, 'member', people.reader.id, input, fail), {status: 403});
    await assert.rejects(changeWorkspaceMembership(e.DB, {...e.manager, user_id: people.admin.id}, 'member', people.owner.id, input, fail), {status: 403});
    e.sqlite.prepare("UPDATE members SET role='worker' WHERE user_id=?").run(e.manager.user_id);
    await assert.rejects(changeWorkspaceMembership(e.DB, e.manager, 'customer', 'green', input, fail), {status: 403});
  } finally { e.sqlite.close(); }
});

test('garden projection removes irrigation content before serialization; manager retains original role', async () => {
  const e = await setup();
  try {
    const original = {id: 'place', name: 'Společná zahrada', address: 'Lipová 1', notes: 'Soukromá pracovní poznámka', pumpType: 'Čerpadlo', plan: {url: '/secret'}, blowout: ['tajné'], shaftCount: 3};
    const projected = workspaceGardenProjection(original, await workspaceActor(e.DB, people.reader.id), {irrigation: 'Ventil', garden: 'Posekat trávu'});
    assert.ok(!JSON.stringify(projected).includes('tajné'));
    assert.ok(!Object.hasOwn(projected, 'pumpType'));
    assert.ok(!Object.hasOwn(projected, 'plan'));
    assert.equal(projected.notes, '');
    assert.deepEqual(projected.workNotes, {garden: 'Posekat trávu'});
    assert.equal((await workspaceActor(e.DB, people.admin.id)).role, 'admin');
    assert.equal(disciplineLabel(['garden', 'irrigation']), 'Obojí');
    for (const value of [['both'], [], ['garden', 'garden']]) assert.throws(() => normalizeDisciplines(value));
  } finally { e.sqlite.close(); }
});

test('authenticated API exposes the same versioned manifest and enforces manager-only membership writes', async () => {
  const e = await setup();
  try {
    const manifest = await e.call('/api/workspace', people.worker);
    assert.equal(manifest.workspace.userId, people.worker.id);
    assert.deepEqual(manifest.workspace.disciplines, ['irrigation']);
    const input = {version: 1, operationId: 'api-membership-change', disciplines: ['garden']};
    const route = '/api/workspace/members/' + people.worker.id + '/disciplines';
    assert.equal((await api(request(route, people.worker, 'PUT', input), e, context)).status, 403);
    assert.equal((await api(request('/api/workspace'), e, context)).status, 401);
    const saved = await e.call(route, people.owner, 'PUT', input);
    assert.deepEqual(saved.membership.disciplines, ['garden']);
    assert.deepEqual((await e.call(route)).membership, saved.membership);
    e.sqlite.exec("UPDATE workspaces SET state='read_only'");
    assert.equal((await api(request(route, people.owner, 'PUT', {...input, version: 2, operationId: 'readonly-change'}), e, context)).status, 409);
  } finally { e.sqlite.close(); }
});


test('committing transaction rechecks hierarchy if a colleague becomes owner during an edit', async () => {
  const e = await setup();
  try {
    const batch = e.DB.batch;
    e.DB.batch = statements => {
      e.sqlite.prepare("UPDATE members SET role='owner' WHERE user_id=?").run(people.worker.id);
      return batch(statements);
    };
    await assert.rejects(changeWorkspaceMembership(e.DB, e.manager, 'member', people.worker.id,
      {version: 1, operationId: 'hierarchy-race-change', disciplines: ['garden']}, fail), {status: 409});
    assert.equal(e.sqlite.prepare('SELECT count(*) n FROM workspace_audit').get().n, 0);
    assert.deepEqual((await readWorkspaceMembership(e.DB, 'member', people.worker.id)).disciplines, ['irrigation']);
  } finally { e.sqlite.close(); }
});

test('existing HTTP lists, direct jobs, history and irrigation media enforce discipline boundaries', async () => {
  const e = await setup();
  try {
    e.sqlite.prepare("UPDATE member_disciplines SET discipline='garden' WHERE user_id=?").run(people.worker.id);
    e.sqlite.exec("UPDATE gardens SET notes='TAJNE_IRR_NOTES',pump_type='TAJNE_PUMP',plan_key='private-irrigation-plan' WHERE customer_id='both'");
    const gardenId = e.sqlite.prepare("SELECT id FROM gardens WHERE customer_id='both'").get().id;
    e.sqlite.prepare("UPDATE jobs SET garden_id=? WHERE id IN ('i','g')").run(gardenId);
    const rows = await e.call('/api/jobs?state=all', people.worker);
    assert.deepEqual(rows.jobs.map(row => row.id), ['g']);
    assert.ok(!JSON.stringify(rows).includes('TAJNE'));
    const gardens = await e.call('/api/gardens', people.worker);
    assert.equal(gardens.gardens.length, 2);
    assert.ok(!JSON.stringify(gardens).includes('TAJNE'));
    assert.ok(gardens.gardens.every(garden => !Object.hasOwn(garden, 'plan')));
    const history = await e.call('/api/gardens/' + gardenId + '/history', people.worker);
    assert.deepEqual(history.visits.filter(row => row.jobId).map(row => row.jobId), ['g']);
    for (const path of ['/api/jobs/i', '/api/jobs/i/service', '/api/jobs/i/service/photos/secret', '/api/shafts', '/api/zones', '/api/gardens/' + gardenId + '/plan', '/api/gardens/' + gardenId + '/blowout']) {
      assert.equal((await api(request(path, people.worker), e, context)).status, 404, path);
    }
    const created = await e.call('/api/customers/created-garden-contact', people.owner, 'PUT', {version: 0, discipline: 'garden', name: 'Nový Garden kontakt', phones: [], addresses: []});
    assert.deepEqual(created.customer.disciplines, ['garden']);
    assert.equal((await readWorkspaceMembership(e.DB, 'customer', 'created-garden-contact')).version, 1);
    assert.equal(e.sqlite.prepare("SELECT count(*) n FROM workspace_audit WHERE entity_id='created-garden-contact'").get().n, 1);
    await e.call('/api/jobs/new-garden-job', people.owner, 'PUT', {version: 0, discipline: 'garden', title: 'Nová práce', customerId: 'both', gardenId, assignedTo: people.worker.id, status: 'planned'});
    assert.equal((await e.call('/api/jobs/new-garden-job', people.worker)).job.discipline, 'garden');
  } finally { e.sqlite.close(); }
});

test('revoking discipline between opening a job and committing status cannot bypass database authorization', async () => {
  const e = await setup();
  try {
    const prepare = e.DB.prepare;
    e.DB.prepare = sql => {
      if (sql.startsWith('UPDATE jobs SET status=')) e.sqlite.prepare("UPDATE member_disciplines SET discipline='garden' WHERE user_id=?").run(people.worker.id);
      return prepare(sql);
    };
    const response = await api(request('/api/jobs/i/status', people.worker, 'PATCH', {version: 1, status: 'done'}), e, context);
    assert.equal(response.status, 409);
    assert.equal(e.sqlite.prepare("SELECT status FROM jobs WHERE id='i'").get().status, 'planned');
  } finally { e.sqlite.close(); }
});

test('different hosting IDs require an explicit alias; the same owner e-mail alone grants no access', async () => {
  const e = await setup();
  try {
    const native = {id: 'garden-native-owner', email: people.owner.email};
    const gardenEntry = {...e, WORKSPACE_ENTRY_ID: 'inst-garden-isolated-test'};
    assert.equal((await api(request('/api/me', native), gardenEntry, context)).status, 403);
    e.sqlite.prepare("INSERT INTO workspace_identity_aliases VALUES('inst-garden-isolated-test',?,?,'owner',?,?,?,1,'confirmed')")
      .run(native.id, people.owner.id, native.email, 'Test owner', people.owner.id);
    const response = await api(request('/api/me', native), gardenEntry, context);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).user.id, people.owner.id);
    assert.equal(e.sqlite.prepare('SELECT count(*) n FROM members WHERE email=?').get(native.email).n, 1);
    assert.equal((await api(request('/api/me', {id: 'unapproved-other-native-id', email: native.email}), gardenEntry, context)).status, 403);
  } finally { e.sqlite.close(); }
});

test('new invited colleague receives explicit discipline and source identity atomically', async () => {
  const e = await setup();
  try {
    const person = {id: 'new-native-garden-worker', email: 'new-garden-worker@example.test'};
    await e.call('/api/invitations', people.owner, 'POST', {email: person.email, role: 'worker', disciplines: ['garden']});
    const me = await e.call('/api/me', person);
    assert.equal(me.user.role, 'worker');
    assert.deepEqual(me.workspace.disciplines, ['garden']);
    assert.equal(e.sqlite.prepare('SELECT original_role FROM workspace_member_grants WHERE user_id=? AND organization_id=?').get(person.id, 'garden-org').original_role, 'worker');
    assert.equal(e.sqlite.prepare('SELECT count(*) n FROM workspace_identity_aliases WHERE canonical_user_id=?').get(person.id).n, 1);
    assert.equal(e.sqlite.prepare('SELECT count(*) n FROM invitations WHERE email=?').get(person.email).n, 0);
    assert.equal((await api(request('/api/jobs/i', person), e, context)).status, 404);
  } finally { e.sqlite.close(); }
});

test('linking another hosting identity requires an explicit confirmation plus a valid personal session of the same account', async () => {
  const e = await setup();
  try {
    const link = await e.call('/api/workspace/identity-invite', people.owner, 'POST', {memberId:people.worker.id});
    const token = new URL(link.url).hash.slice('#access='.length);
    const redeemed = await api(request('/api/access-link', undefined, 'POST', {token}), e, context);
    assert.equal(redeemed.status, 200, await redeemed.clone().text());
    const cookie = redeemed.headers.get('set-cookie').split(';')[0];
    const hosted = {id: 'second-browser-worker-id', email: people.worker.email};
    assert.equal((await api(request('/api/me', hosted), e, context)).status, 403);
    assert.equal((await api(request('/api/workspace/link-identity', hosted, 'POST', {confirm: 'PROPOJIT'}), e, context)).status, 403);
    const response = await api(request('/api/workspace/link-identity', hosted, 'POST', {confirm: 'PROPOJIT'}, {cookie}), e, context);
    assert.equal(response.status, 200, await response.clone().text());
    const current = await e.call('/api/me', hosted);
    assert.equal(current.user.id, people.worker.id);
    assert.equal(current.user.role, 'worker');
    assert.deepEqual(current.workspace.disciplines, ['irrigation']);
    assert.equal(e.sqlite.prepare('SELECT count(*) n FROM workspace_identity_events').get().n, 1);
    assert.equal(e.sqlite.prepare("SELECT count(*) n FROM workspace_member_grants WHERE user_id=? AND original_role='owner'").get(people.worker.id).n, 0);
    const wrong = {id: 'wrong-account-id', email: people.owner.email};
    assert.equal((await api(request('/api/workspace/link-identity', wrong, 'POST', {confirm: 'PROPOJIT'}, {cookie}), e, context)).status, 403);
  } finally { e.sqlite.close(); }
});
