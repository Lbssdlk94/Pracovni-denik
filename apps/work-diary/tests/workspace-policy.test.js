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
  s.exec("UPDATE service_tariffs SET discipline='irrigation'");
  s.exec("UPDATE workspaces SET state='active'");
  await call('/api/me');
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

test('removed identity links cannot add a second hosting alias or broaden team access',async()=>{const e=await setup();try{
 const before=e.sqlite.prepare('SELECT * FROM workspace_identity_aliases').all();
 for(const path of ['/api/workspace/identity-invite','/api/workspace/link-identity']){const response=await api(request(path,people.owner,'POST',{memberId:people.worker.id,confirm:'PROPOJIT'}),e,context);assert.equal(response.status,403);assert.equal((await response.json()).code,'access_link_disabled');}
 assert.deepEqual(e.sqlite.prepare('SELECT * FROM workspace_identity_aliases').all(),before);assert.equal((await api(request('/api/me',{id:'another-host-id',email:people.worker.email}),e,context)).status,403);
 }finally{e.sqlite.close();}});

test('offline manifest authorizes exactly requested IDs and refuses a stale assignment revision',async()=>{
 const e=await setup();
 try{
  const ids={records:[],gardens:[],services:[],serviceWork:['i','g','hidden','unknown'],defects:[]};
  const value=await e.call('/api/workspace/manifest',people.worker,'POST',ids);
  assert.equal(value.completeForRequestedIds,true);assert.equal(value.requestedCounts.serviceWork,4);assert.deepEqual(value.allowed.serviceWork,['i']);
  e.sqlite.exec("UPDATE jobs SET assigned_to='admin-id' WHERE id='i'");
  const stale=await api(request('/api/workspace/manifest',people.worker,'POST',{...ids,expectedStamp:value.stamp}),e,context);
  assert.equal(stale.status,409);assert.equal((await stale.json()).code,'workspace_manifest_changed');
  const refreshed=await e.call('/api/workspace/manifest',people.worker,'POST',ids);assert.deepEqual(refreshed.allowed.serviceWork,[]);
 }finally{e.sqlite.close();}
});

test('a team change during garden list loading discards the mixed-authorization response',async()=>{
 const e=await setup();
 try{
  e.sqlite.exec("UPDATE gardens SET notes='PRIVATE_IRRIGATION_NOTE',plan_key='private-plan' WHERE customer_id='both'");
  const prepare=e.DB.prepare;let changed=false;
  e.DB.prepare=sql=>{
   if(!changed&&sql.startsWith('SELECT gardens.*,garden_geocodes')){
    changed=true;e.sqlite.prepare("UPDATE member_disciplines SET discipline='garden' WHERE user_id=?").run(people.worker.id);
   }
   return prepare(sql);
  };
  const response=await api(request('/api/gardens',people.worker),e,context);
  assert.equal(changed,true);assert.equal(response.status,409);
  const text=await response.text();assert.ok(!text.includes('PRIVATE_IRRIGATION_NOTE'));assert.ok(!text.includes('private-plan'));
  assert.equal(JSON.parse(text).code,'workspace_conflict');
 }finally{e.sqlite.close();}
});

test('reassignment during job list loading never returns a former worker private job',async()=>{
 const e=await setup();
 try{
  const prepare=e.DB.prepare;let changed=false;
  e.DB.prepare=sql=>{
   if(!changed&&sql.startsWith('SELECT j.*')){
    changed=true;e.sqlite.prepare("UPDATE jobs SET assigned_to=?,assigned_users='[]' WHERE id='i'").run(people.admin.id);
   }
   return prepare(sql);
  };
  const response=await api(request('/api/jobs?state=all',people.worker),e,context);
  assert.equal(changed,true);assert.equal(response.status,409);assert.equal((await response.json()).code,'workspace_conflict');
 }finally{e.sqlite.close();}
});

test('deleting and explicitly re-inviting a member keeps all old password sessions revoked',async()=>{
 const e=await setup();
 try{
  const configured=await api(request('/api/auth/password',people.worker,'PUT',{username:'retired-worker',password:'Isolated-worker-password-123',version:0}),e,context);
  assert.equal(configured.status,200);const cookie=configured.headers.get('set-cookie').split(';')[0];
  assert.equal((await api(request('/api/me',undefined,'GET',undefined,{cookie}),e,context)).status,200);
  await e.call('/api/members/'+people.worker.id,people.owner,'DELETE');
  assert.equal(e.sqlite.prepare('SELECT count(*) n FROM workspace_identity_aliases WHERE canonical_user_id=?').get(people.worker.id).n,0);
  assert.equal((await api(request('/api/me',undefined,'GET',undefined,{cookie}),e,context)).status,401);
  await e.call('/api/invitations',people.owner,'POST',{email:people.worker.email,role:'worker',disciplines:['garden']});
  const current=await e.call('/api/me',people.worker);assert.deepEqual(current.workspace.disciplines,['garden']);
  assert.equal((await api(request('/api/me',undefined,'GET',undefined,{cookie}),e,context)).status,401);
  const audit=e.sqlite.prepare("SELECT * FROM workspace_audit WHERE entity='member' AND entity_id=? ORDER BY base_version").all(people.worker.id);
  assert.equal(audit.length,1);assert.equal(audit[0].base_version,1);
  assert.equal(e.sqlite.prepare("SELECT version FROM workspace_entity_versions WHERE entity='member' AND entity_id=?").get(people.worker.id).version,2);
  await e.call('/api/members/'+people.worker.id,people.owner,'DELETE');
  await e.call('/api/invitations',people.owner,'POST',{email:people.worker.email,role:'reader',disciplines:['garden']});
  await e.call('/api/me',people.worker);
  const audits=e.sqlite.prepare("SELECT operation_id,base_version FROM workspace_audit WHERE entity='member' AND entity_id=? ORDER BY base_version").all(people.worker.id);
  assert.deepEqual(audits.map(row=>row.base_version),[1,2]);assert.notEqual(audits[0].operation_id,audits[1].operation_id);
 }finally{e.sqlite.close();}
});

test('shared garden address uses explicit IDs across disciplines without exposing its private source job',async()=>{
 const e=await setup();
 try{
  e.sqlite.prepare("UPDATE customers SET addresses=? WHERE id='both'").run(JSON.stringify([{id:'mother-address',address:'Lipová 1488',city:'Blatná'},{id:'home-address',address:'Jiná 22',city:'Písek'}]));
  const mother=e.sqlite.prepare("SELECT id FROM gardens WHERE customer_id='both'").get().id;
  e.sqlite.prepare("UPDATE gardens SET name='Zahrada maminky',address='Lipová 1488',notes='PRIVATE_IRRIGATION_WORK' WHERE id=?").run(mother);
  e.sqlite.prepare("UPDATE jobs SET garden_id=?,customer_address_id='mother-address',city='Blatná' WHERE id='i'").run(mother);
  const other=(await e.call('/api/gardens',people.owner,'POST',{id:'another-garden',name:'Domácí zahrada',address:'Jiná 22',notes:'',customerId:'both',discipline:'irrigation'})).garden;
  e.sqlite.prepare("UPDATE jobs SET garden_id=?,customer_address_id='home-address',city='Písek' WHERE id='hidden'").run(other.id);
  e.sqlite.prepare("UPDATE member_disciplines SET discipline='garden' WHERE user_id=?").run(people.worker.id);
  const data=await e.call('/api/gardens',people.worker),first=data.gardens.find(g=>g.id===mother),second=data.gardens.find(g=>g.id===other.id);
  assert.equal(first.addressDetails.city,'Blatná');assert.equal(first.addressDetails.customerAddressId,'mother-address');assert.equal(second.addressDetails.city,'Písek');assert.equal(second.addressDetails.customerAddressId,'home-address');
  assert.ok(!JSON.stringify(data).includes('PRIVATE_IRRIGATION_WORK'));assert.ok(!Object.hasOwn(first.addressDetails,'jobId'));
  assert.equal((await api(request('/api/jobs/i',people.worker),e,context)).status,404);
  // A conflicting/stale explicit address is an ambiguity, never a name/text match.
  e.sqlite.prepare("UPDATE jobs SET garden_id=?,customer_address_id='missing-address' WHERE id='hidden'").run(mother);
  assert.equal((await e.call('/api/gardens',people.worker)).gardens.find(g=>g.id===mother).addressDetails,null);
 }finally{e.sqlite.close();}
});

test('an old cached browser cannot read or upload shared operational JSON; binary reads still enforce actual scope',async()=>{
 const e=await setup();try{
  const old=request('/api/jobs',people.worker);old.headers.delete('x-workspace-client-version');
  const response=await api(old,e,context);assert.equal(response.status,403);assert.equal((await response.json()).code,'client_update_required');
  const upload=request('/api/jobs/i/service/photos/photo',people.worker,'PUT');upload.headers.delete('x-workspace-client-version');assert.equal((await api(upload,e,context)).status,403);
  const photo=request('/api/jobs/g/service/photos/photo',people.worker);photo.headers.delete('x-workspace-client-version');assert.equal((await api(photo,e,context)).status,404);
 }finally{e.sqlite.close();}
});

test('organization preferences and operational licensing remain scoped through both entry URLs',async()=>{
 const e=await setup();try{
  e.sqlite.prepare("INSERT INTO settings(key,value,version) VALUES('workspace:garden-org:features',?,1)").run(JSON.stringify({jobs:false,shafts:false,zoneManagement:false}));
  const gardenUser={id:'isolated-garden-owner',email:people.owner.email};
  e.sqlite.prepare("INSERT INTO workspace_identity_aliases VALUES('inst-garden-isolated-test',?,?,'owner',?,?,?,1,'confirmed')").run(gardenUser.id,people.owner.id,gardenUser.email,'Owner',people.owner.id);
  const gardenEnv={...e,WORKSPACE_ENTRY_ID:'inst-garden-isolated-test'};
  const gardenResponse=await api(request('/api/me',gardenUser),gardenEnv,context);assert.equal(gardenResponse.status,200);assert.equal((await gardenResponse.json()).features.jobs,false);
  const source=await e.call('/api/me');assert.equal(source.features.jobs,true);
  const sourceJobs=await e.call('/api/jobs?state=all');assert.ok(!sourceJobs.jobs.some(row=>row.id==='g'));
  assert.equal((await api(request('/api/jobs/g',people.owner),e,context)).status,404);
  const forbidden=await api(request('/api/jobs/cross-license-create',people.owner,'PUT',{version:0,title:'Must not create',discipline:'garden',customerId:'both',assignedTo:people.owner.id,status:'planned'}),e,context);
  assert.equal(forbidden.status,409);assert.equal(e.sqlite.prepare("SELECT count(*) n FROM jobs WHERE id='cross-license-create'").get().n,0);
  assert.equal((await e.call('/api/me')).features.jobs,true);
  // Basic contact data stays shared even when Garden's job module is disabled.
  assert.equal((await e.call('/api/customers/both')).customer.id,'both');
 }finally{e.sqlite.close();}
});

test('two original tariff catalogs coexist without ID/price overwrite and subscription snapshots keep their own discipline',async()=>{
 const e=await setup();try{
  const source=(await e.call('/api/tariffs')).tariffs.find(row=>row.id==='tariff-low');assert.equal(source.discipline,'irrigation');
  const garden=(await e.call('/api/tariffs/garden-tariff-low',people.owner,'PUT',{version:0,discipline:'garden',definition:{...source.definition,name:'Garden péče',priceMinor:123000},active:true})).tariff;
  assert.equal(garden.discipline,'garden');assert.equal((await e.call('/api/tariffs?discipline=garden')).tariffs.length,1);assert.equal((await e.call('/api/tariffs?discipline=all')).tariffs.length,4);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague'}).format(new Date());
  const activate={version:0,operationId:'activate-garden-plan',periodId:'garden-period',customerId:'both',tariffId:garden.id,startDate:today,planLater:true,discipline:'garden'};
  const invalid=await api(request('/api/subscriptions/invalid/activate',people.owner,'POST',{...activate,tariffId:source.id}),e,context);assert.equal(invalid.status,400);
  const contract=(await e.call('/api/subscriptions/garden-plan/activate',people.owner,'POST',activate)).subscription;assert.equal(contract.discipline,'garden');assert.equal(contract.periods[0].agreedPrice,123000);
  await e.call('/api/tariffs/'+garden.id,people.owner,'PUT',{version:garden.version,discipline:'garden',definition:{...garden.definition,priceMinor:456000},active:true});
  const saved=(await e.call('/api/subscriptions/garden-plan')).subscription;assert.equal(saved.periods[0].agreedPrice,123000);assert.equal(saved.periods[0].snapshot.priceMinor,123000);
  assert.equal((await e.call('/api/tariffs')).tariffs.find(row=>row.id===source.id).definition.priceMinor,source.definition.priceMinor);
  assert.equal((await api(request('/api/subscriptions/garden-plan',people.worker),e,context)).status,404);
 }finally{e.sqlite.close();}
});

test('seat limits count each discipline independently and a failed second-team grant is atomic',async()=>{
 const e=await setup();try{
  // Source: owner+admin+worker=3, Garden: owner+admin+reader=3.
  // No platform server is configured in this fixture, so its default policy cap is 100.
  // An invitation on a full unrelated source team must not block Garden's own capacity.
  const prepare=e.DB.prepare;
  e.DB.prepare=sql=>{
   if(sql.startsWith('INSERT INTO workspace_organization_policies')){const statement=prepare(sql),bind=statement.bind;statement.bind=(...args)=>{args[5]=args[0]==='source-org'?3:4;return bind(...args);};return statement;}
   return prepare(sql);
  };
  await e.call('/api/me');
  const wrong=await api(request('/api/invitations',people.owner,'POST',{email:'source-full@example.test',role:'worker',disciplines:['irrigation']}),e,context);
  assert.equal(wrong.status,409);assert.equal((await wrong.json()).code,'workspace_member_capacity');
  await e.call('/api/invitations',people.owner,'POST',{email:'garden-seat@example.test',role:'worker',disciplines:['garden']});
  const before=await readWorkspaceMembership(e.DB,'member',people.worker.id);
  const change=await api(request('/api/workspace/members/'+people.worker.id+'/disciplines',people.owner,'PUT',{version:before.version,operationId:'capacity-second-team',disciplines:['irrigation','garden']}),e,context);
  assert.equal(change.status,409);assert.deepEqual(await readWorkspaceMembership(e.DB,'member',people.worker.id),before);
  assert.equal(e.sqlite.prepare("SELECT count(*) n FROM workspace_audit WHERE operation_id='capacity-second-team'").get().n,0);
  assert.equal(e.sqlite.prepare("SELECT count(*) n FROM invitations WHERE email='source-full@example.test'").get().n,0);
 }finally{e.sqlite.close();}
});

test('signed company policies are verified against their original installation and cannot share an in-flight cache',async()=>{
 const e=await setup();const originalFetch=globalThis.fetch;let calls=0;
 try{
  const {driveSeal}=await import('../worker/drive-core.js'),{FEATURE_OPTIONS}=await import('../web/features.js'),{tenantPolicy}=await import('../worker/tenant-platform.js');
  e.DRIVE_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,23).toString('base64url');
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),publicKey=Buffer.from(await crypto.subtle.exportKey('spki',pair.publicKey)).toString('base64url'),sourceId=e.sqlite.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").get().instance_id,now=Date.now();
  const shared={PLATFORM_CONTROL_URL:'https://control.example.test',PLATFORM_SIGNING_PUBLIC_KEY:publicKey,PLATFORM_SIGNING_KEY_ID:'isolated-signing-key'};
  Object.assign(e,shared,{PLATFORM_COMPANY_ID:'company-source',PLATFORM_SERVICE_TOKEN:'isolated-source-service'});
  const gardenRuntime={...shared,PLATFORM_COMPANY_ID:'company-garden',PLATFORM_SERVICE_TOKEN:'isolated-garden-service'};
  e.sqlite.prepare('INSERT INTO workspace_organization_config VALUES(?,?)').run('garden-org',await driveSeal(e,gardenRuntime,'workspace-organization:garden-org'));
  const policy=async(companyId,installationId,revision,jobs)=>{
   const value={format:'work-diary-policy-v1',companyId,installationId,revision,issuedAt:now-1000,expiresAt:now+600000,active:true,maxUsers:100,modules:{...Object.fromEntries(FEATURE_OPTIONS.map(feature=>[feature.key,true])),jobs}};
   const raw=new TextEncoder().encode(JSON.stringify(value));return {keyId:shared.PLATFORM_SIGNING_KEY_ID,payload:Buffer.from(raw).toString('base64url'),signature:Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,raw)).toString('base64url')};
  };
  for(const [key,envelope,revision] of [['platform-policy',await policy('company-source',sourceId,1,true),1],['workspace:garden-org:platform-policy',await policy('company-garden','inst-garden-isolated-test',7,false),7]])e.sqlite.prepare('INSERT INTO settings(key,value,version) VALUES(?,?,1)').run(key,JSON.stringify({envelope,revision,checkedAt:now}));
  globalThis.fetch=async()=>{calls++;throw Error('Unexpected control call in signed-cache fixture');};
  const gardenEnv={...e,...gardenRuntime,WORKSPACE_SETTINGS_PREFIX:'workspace:garden-org:',WORKSPACE_POLICY_INSTALLATION_ID:'inst-garden-isolated-test'};
  const [source,garden]=await Promise.all([tenantPolicy(e),tenantPolicy(gardenEnv)]);
  assert.equal(source.companyId,'company-source');assert.equal(source.revision,1);assert.equal(garden.companyId,'company-garden');assert.equal(garden.revision,7);
  const sourceResult=await api(request('/api/features',people.owner),e,context),gardenResult=await api(request('/api/features?discipline=garden',people.owner),e,context);assert.equal(sourceResult.status,200,await sourceResult.clone().text());assert.equal(gardenResult.status,200,await gardenResult.clone().text());const sourceResponse=await sourceResult.json(),gardenResponse=await gardenResult.json();
  assert.equal(sourceResponse.license.companyId,'company-source');assert.equal(sourceResponse.features.jobs,true);assert.equal(gardenResponse.license.companyId,'company-garden');assert.equal(gardenResponse.features.jobs,false);
  assert.equal(JSON.parse(e.sqlite.prepare("SELECT value FROM settings WHERE key='platform-policy'").get().value).revision,1);
  assert.equal(JSON.parse(e.sqlite.prepare("SELECT value FROM settings WHERE key='workspace:garden-org:platform-policy'").get().value).revision,7);assert.equal(calls,0);
 }finally{globalThis.fetch=originalFetch;e.sqlite.close();}
});

test('material reminders use each discipline settings and never notify a colleague from the other team',async()=>{
 const e=await setup();try{
  const {subToday,subAddDays}=await import('../web/subscription-model.js'),due=subAddDays(subToday(),3);
  e.sqlite.prepare("UPDATE jobs SET job_type='installation',due_date=? WHERE id IN ('i','g')").run(due);
  e.sqlite.prepare("UPDATE jobs SET assigned_to=?,assigned_users='[]' WHERE id='g'").run(people.reader.id);
  const settings={enabled:true,days:3,dayMode:'calendar',shiftNonWorking:false};
  await e.call('/api/service-reminders/settings',people.owner,'PUT',{version:0,settings});
  await e.call('/api/service-reminders/settings?discipline=garden',people.owner,'PUT',{version:0,settings:{...settings,days:1}});
  const source=await e.call('/api/service-reminders/check',people.owner,'POST',{});assert.equal(source.created,1);
  const garden=await e.call('/api/service-reminders/check?discipline=garden',people.owner,'POST',{});assert.equal(garden.created,0);
  assert.equal(e.sqlite.prepare("SELECT count(*) n FROM notifications WHERE kind='job_reminder' AND resource_id='g'").get().n,0);
  await e.call('/api/service-reminders/settings?discipline=garden',people.owner,'PUT',{version:1,settings:{...settings,days:4}});
  assert.equal((await e.call('/api/service-reminders/check?discipline=garden',people.owner,'POST',{})).created,1);
  assert.equal((await e.call('/api/service-reminders/check?discipline=garden',people.owner,'POST',{})).created,0);
  const irrInbox=await e.call('/api/notifications',people.worker),gardenInbox=await e.call('/api/notifications',people.reader);
  assert.ok(JSON.stringify(irrInbox).includes('"resourceId":"i"'));assert.ok(!JSON.stringify(irrInbox).includes('"resourceId":"g"'));
  assert.ok(JSON.stringify(gardenInbox).includes('"resourceId":"g"'));assert.ok(!JSON.stringify(gardenInbox).includes('"resourceId":"i"'));
  assert.equal(JSON.parse(e.sqlite.prepare("SELECT value FROM settings WHERE key='material-reminders'").get().value).days,3);
  assert.equal(JSON.parse(e.sqlite.prepare("SELECT value FROM settings WHERE key='workspace:garden-org:material-reminders'").get().value).days,4);
 }finally{e.sqlite.close();}
});

test('shared contact and garden, discipline-private work, explicit defect repair and protocol history persist without duplicates',async()=>{
 const e=await setup();try{
  const {subToday}=await import('../web/subscription-model.js'),today=subToday(),mother=e.sqlite.prepare("SELECT id FROM gardens WHERE customer_id='both'").get().id;
  const common={version:1,name:'Jeden kontakt, dvě zahrady',contactNotes:'Volat po 17. hodině',phones:[],addresses:[{id:'mother-address',address:'Lipová 1488',city:'Blatná'},{id:'home-address',address:'Jiná 22',city:'Písek'}]};
  await e.call('/api/customers/both',people.owner,'PUT',common);
  let garden=(await e.call('/api/gardens')).gardens.find(row=>row.id===mother);
  garden=(await e.call('/api/gardens/'+mother,people.owner,'PATCH',{version:garden.version,discipline:'irrigation',name:'Zahrada maminky',address:'Lipová 1488',sharedDescription:'Společná informace o vstupu',notes:'IRR_PRIVATE_WORK'})).garden;
  await e.call('/api/gardens/'+mother,people.owner,'PATCH',{version:garden.version,discipline:'garden',name:garden.name,address:garden.address,sharedDescription:garden.sharedDescription,notes:'GARDEN_PRIVATE_WORK'});
  const second=(await e.call('/api/gardens',people.owner,'POST',{id:'second-place',discipline:'garden',customerId:'both',name:'Domácí zahrada',address:'Jiná 22',notes:'Jiná práce'})).garden;
  await e.call('/api/workspace/members/'+people.worker.id+'/disciplines',people.owner,'PUT',{version:1,operationId:'worker-to-garden-flow',disciplines:['garden']});
  const jobValue={version:0,discipline:'garden',title:'Garden servis u maminky',customerId:'both',customerAddressId:'mother-address',gardenId:mother,assignedTo:people.worker.id,dueDate:today,status:'planned'};
  await e.call('/api/jobs/garden-visit',people.owner,'PUT',jobValue);
  const report={date:today,work:'Kontrola systému',material:'',defects:'Ventil v šachtě vyžaduje výměnu',notes:'',recommendations:'Objednat ventil',photoIds:[]};
  let protocol=await e.call('/api/jobs/garden-visit/service',people.worker,'PUT',{version:1,operationId:'garden-protocol-initial',report});
  assert.equal((await e.call('/api/defects?gardenId='+mother,people.worker)).defects.length,0,'plain report text must not automatically create a tracked defect');
  const defectValue={version:0,mutationId:'tracked-garden-defect',discipline:'garden',gardenId:mother,sourceJobId:'garden-visit',fromProtocol:true,title:'Ventil',description:report.defects,location:'Šachta u terasy',priority:'normal',status:'awaiting_part',discoveredOn:today,assignedTo:null,nextStep:'Objednat ventil',resolution:'',photos:[]};
  let defect=(await e.call('/api/defects/tracked-garden-defect',people.worker,'PUT',defectValue)).defect;
  const complete={version:protocol.job.version,operationId:'garden-service-complete',complete:true};
  await e.call('/api/jobs/garden-visit/service',people.worker,'PUT',complete);await e.call('/api/jobs/garden-visit/service',people.worker,'PUT',complete);
  assert.equal((await e.call('/api/defects/'+defect.id,people.worker)).defect.status,'awaiting_part');
  await e.call('/api/defects/tracked-garden-defect',people.worker,'PUT',{...defectValue,mutationId:'repeat-conversion'});
  assert.equal(e.sqlite.prepare("SELECT count(*) n FROM garden_defects WHERE source_key='protocol:garden-visit'").get().n,1);
  await e.call('/api/jobs/garden-repair',people.owner,'PUT',{...jobValue,title:'Oprava ventilu',defectIds:[defect.id]});
  const reopened=(await e.call('/api/jobs/garden-repair',people.worker)).job;assert.equal(reopened.customerId,'both');assert.equal(reopened.gardenId,mother);assert.equal(reopened.customerAddressId,'mother-address');assert.equal(reopened.city,'Blatná');
  assert.deepEqual((await e.call('/api/defects?jobId=garden-repair',people.worker)).linkedIds,[defect.id]);
  await e.call('/api/jobs/garden-repair/service',people.worker,'PUT',{version:reopened.version,operationId:'repair-completion',complete:true,report:{...report,work:'Výměna ventilu',defects:''}});
  defect=(await e.call('/api/defects/'+defect.id,people.worker)).defect;assert.equal(defect.status,'awaiting_part','completing the repair must not implicitly resolve the defect');
  await e.call('/api/defects/'+defect.id,people.worker,'PUT',{...defectValue,version:defect.version,mutationId:'explicit-resolution',status:'resolved',resolution:'Ventil vyměněn a přezkoušen'});
  const history=await e.call('/api/gardens/'+mother+'/history',people.worker);assert.deepEqual(history.visits.map(row=>row.jobId).sort(),['garden-repair','garden-visit']);assert.equal(history.visits.filter(row=>row.jobId==='garden-visit').length,1);assert.ok(history.visits.every(row=>row.discipline==='garden'));
  assert.equal((await e.call('/api/gardens/'+second.id+'/history',people.worker)).visits.length,0);
  assert.equal((await e.call('/api/defects?gardenId='+mother,people.worker)).defects.filter(row=>row.status!=='resolved').length,0);
  const actorGarden=(await e.call('/api/gardens',people.worker)).gardens.find(row=>row.id===mother);assert.equal(actorGarden.notes,'GARDEN_PRIVATE_WORK');assert.equal(actorGarden.workDiscipline,'garden');assert.ok(!JSON.stringify(actorGarden).includes('IRR_PRIVATE_WORK'));assert.equal(actorGarden.sharedDescription,'Společná informace o vstupu');
  assert.equal((await e.call('/api/customers/both',people.worker)).customer.contactNotes,'Volat po 17. hodině');
  const native={id:'new-irrigation-worker',email:'new-irrigation-worker@example.test'};await e.call('/api/invitations',people.owner,'POST',{email:native.email,role:'worker',disciplines:['irrigation']});await e.call('/api/me',native);
  const actorIrr=(await e.call('/api/gardens',native)).gardens.find(row=>row.id===mother);assert.equal(actorIrr.notes,'IRR_PRIVATE_WORK');assert.ok(!JSON.stringify(actorIrr).includes('GARDEN_PRIVATE_WORK'));
  assert.equal((await api(request('/api/defects/'+defect.id,native),e,context)).status,404);assert.equal((await api(request('/api/jobs/garden-repair/service',native),e,context)).status,404);
 }finally{e.sqlite.close();}
});


test('organization links use the paired entry URL without changing physical storage or identity',async()=>{
 const e=await setup();try{
  const {workspaceRequestContext}=await import('../worker/workspace-context.js');
  e.PUBLIC_APP_URL='https://source.test';
  e.SHARED_WORKSPACE_GATEWAY=JSON.stringify({mode:'canonical',peerId:'inst-garden-isolated-test',entryOrigin:'https://garden.test'});
  const selected=await workspaceRequestContext(e,request('/api/me?discipline=garden',people.owner),e.manager);
  assert.equal(selected.PUBLIC_APP_URL,'https://garden.test');assert.equal(selected.DB,e.DB);assert.equal(selected.BUCKET,e.BUCKET);
  const original=await workspaceRequestContext(e,request('/api/me?discipline=irrigation',people.owner),e.manager);
  assert.equal(original.PUBLIC_APP_URL,'https://source.test');
 }finally{e.sqlite.close();}
});


test('technical heartbeat totals follow department seats, activity and backups covering the shared database',async()=>{
 const e=await setup();try{
  const {workspaceHeartbeatCounts}=await import('../worker/tenant-platform.js'),now=100000000;
  e.sqlite.prepare("INSERT INTO invitations(email,role,created_by,created_at,disciplines) VALUES('next@example.test','worker',?,1,'[\"irrigation\"]')").run(people.owner.id);
  for(const key of ['platform-activity:'+people.worker.id,'workspace:garden-org:platform-activity:'+people.worker.id,'workspace:garden-org:platform-activity:'+people.reader.id])e.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(key,String(now));
  e.sqlite.prepare("INSERT INTO system_backups(id,state,created_at,created_by,manifest,cursor,source) VALUES('before','ready',0,?,'{}','{}','manual')").run(people.owner.id);
  const irrigation=await workspaceHeartbeatCounts({...e,WORKSPACE_ORGANIZATION_DISCIPLINE:'irrigation'},now),garden=await workspaceHeartbeatCounts({...e,WORKSPACE_ORGANIZATION_DISCIPLINE:'garden',WORKSPACE_SETTINGS_PREFIX:'workspace:garden-org:'},now);
  assert.equal(irrigation.members,3);assert.equal(garden.members,3);assert.equal(irrigation.pendingInvites,1);assert.equal(garden.pendingInvites,0);assert.equal(irrigation.activeUsers30d,1);assert.equal(garden.activeUsers30d,1);assert.equal(garden.lastBackupAt,null);
  e.sqlite.prepare("INSERT INTO system_backups(id,state,created_at,created_by,manifest,cursor,source) VALUES('after','ready',2,?,'{}','{}','manual')").run(people.owner.id);
  assert.equal((await workspaceHeartbeatCounts({...e,WORKSPACE_ORGANIZATION_DISCIPLINE:'garden',WORKSPACE_SETTINGS_PREFIX:'workspace:garden-org:'},now)).lastBackupAt,2);
 }finally{e.sqlite.close();}
});


test('deferred Garden Drive cannot inherit the irrigation connection or upload Google job photos',async()=>{
 const e=await setup();try{
  const requestGarden=path=>request(path,people.owner,'GET',undefined,{'x-work-discipline':'garden'});
  const drive=await api(requestGarden('/api/drive/status'),e,context);assert.equal(drive.status,409,await drive.clone().text());assert.equal((await drive.json()).code,'integration_not_migrated');
  const gallery=await api(requestGarden('/api/jobs/g/photos'),e,context);assert.equal(gallery.status,200,await gallery.clone().text());const state=await gallery.json();assert.equal(state.uploadStorage,'app');assert.deepEqual(state.folders,[]);assert.equal(state.connected,false);
  const googleUpload=await api(request('/api/jobs/g/photos',people.owner,'POST',{}, {'x-work-discipline':'garden'}),e,context);assert.equal(googleUpload.status,403,await googleUpload.clone().text());
  const denied=await api(request('/api/jobs/g/photos',people.worker),e,context);assert.equal(denied.status,404,await denied.clone().text());
  const response=await api(request('/api/jobs/i/service',people.owner),e,context);assert.equal(response.status,200,await response.clone().text());
 }finally{e.sqlite.close();}
});


test('a garden-only writer can update shared basics without copying or clearing private irrigation pump data',async()=>{
 const e=await setup();try{
  const row=e.sqlite.prepare("SELECT * FROM gardens WHERE customer_id='both' LIMIT 1").get();
  e.sqlite.prepare("UPDATE gardens SET pump_type='Private irrigation pump' WHERE id=?").run(row.id);
  e.sqlite.prepare("DELETE FROM member_disciplines WHERE user_id=?").run(people.worker.id);e.sqlite.prepare("INSERT INTO member_disciplines VALUES(?,'garden')").run(people.worker.id);
  const response=await api(request('/api/gardens/'+row.id,people.worker,'PATCH',{version:row.version,name:row.name,address:row.address,notes:'Garden work note',sharedDescription:'Common place description'}),e,context);assert.equal(response.status,200,await response.clone().text());
  const saved=e.sqlite.prepare('SELECT * FROM gardens WHERE id=?').get(row.id);assert.equal(saved.pump_type,'Private irrigation pump');assert.equal(saved.shared_description,'Common place description');assert.equal(saved.notes,row.notes);
  const detail=(await e.call('/api/gardens',people.worker)).gardens.find(g=>g.id===row.id);assert.equal(detail.notes,'Garden work note');assert.equal(detail.pumpType,undefined);
 }finally{e.sqlite.close();}
});

test('irrigation OAuth top navigation keeps its own session and state checks without a JS-only version header',async()=>{
 const e=await setup();try{
  const response=await api(request('/api/drive/oauth/callback?error=cancelled&state=invalid',people.owner,'GET',undefined,{'x-workspace-client-version':''}),e,context);
  assert.equal(response.status,303,await response.clone().text());assert.ok(response.headers.get('location').startsWith('/?drive='));
 }finally{e.sqlite.close();}
});
