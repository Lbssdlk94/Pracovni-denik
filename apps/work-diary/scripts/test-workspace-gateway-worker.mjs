// Real Worker/D1/R2 smoke test. Uses only new, disposable local databases.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';

const canonicalOrigin = 'https://canonical.test';
const entryOrigin = 'https://entry.test';
const canonicalId = 'inst-canonical-isolated-12345';
const entryId = 'inst-entry-isolated-12345';
const key = Buffer.alloc(32, 9).toString('base64url');
const ownerHeaders = {'oai-authenticated-user-id': 'owner-test', 'oai-authenticated-user-email': 'owner@example.test', 'x-zavlahy-request': '1', 'content-type': 'application/json','x-workspace-client-version':'shared-directory-v1'};
let canonical;
let entry;
const responseJSON = async response => {
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
};
try {
  canonical = new Miniflare({modules: true, scriptPath: 'dist/server/index.js', compatibilityDate: '2026-08-06',
    d1Databases: {DB: 'shared-canonical-isolated'}, r2Buckets: ['BUCKET'],
    bindings: {TEAM_OWNER_EMAIL: 'owner@example.test', INSTALLATION_ID:canonicalId, SHARED_WORKSPACE_GATEWAY: JSON.stringify({mode: 'canonical', localId: canonicalId, peerId: entryId, canonicalOrigin, entryOrigin, key})}});
  const db = await canonical.getD1Database('DB');
  for (const migration of JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries) {
    for (const sql of readFileSync('drizzle/' + migration.tag + '.sql', 'utf8').split('--> statement-breakpoint')) if (sql.trim()) await db.prepare(sql).run();
  }
  await db.prepare("UPDATE installation_state SET instance_id=? WHERE singleton='primary'").bind(canonicalId).run();
  entry = new Miniflare({modules: true, scriptPath: 'dist/server/index.js', compatibilityDate: '2026-08-06',
    // The entry has NO DB or BUCKET binding. Every API record is authoritative in canonical.
    bindings: {SHARED_WORKSPACE_GATEWAY: JSON.stringify({mode: 'entry', localId: entryId, peerId: canonicalId, canonicalOrigin, key})},
    outboundService: async request => {
      assert.equal(new URL(request.url).origin, canonicalOrigin);
      return canonical.dispatchFetch(request);
    }});
  await responseJSON(await canonical.dispatchFetch(canonicalOrigin + '/api/me', {headers: ownerHeaders}));
  assert.equal((await entry.dispatchFetch(entryOrigin+'/api/me',{headers:ownerHeaders})).status,503);
  await db.prepare("INSERT INTO workspaces VALUES('isolated-pair','preparing',1,1,1)").run();
  for(const [id,installation,discipline] of [['source-org',canonicalId,'irrigation'],['garden-org',entryId,'garden']]) {
    await db.prepare('INSERT INTO workspace_organizations VALUES(?,?,?,?,?)').bind(id,'isolated-pair',installation,discipline,id).run();
    await db.prepare("INSERT INTO workspace_identity_aliases VALUES(?,? ,?,'owner',?,?,?,1,'confirmed')").bind(installation,'owner-test','owner-test','owner@example.test','Test owner','owner-test').run();
    await db.prepare("INSERT INTO workspace_member_grants VALUES('owner-test',?,'owner')").bind(id).run();
  }
  await db.prepare("UPDATE workspaces SET state='active'").run();
  await responseJSON(await entry.dispatchFetch(entryOrigin + '/api/me', {headers: ownerHeaders}));
  await responseJSON(await entry.dispatchFetch(entryOrigin + '/api/customers/shared-contact', {method: 'PUT', headers: {...ownerHeaders, origin: entryOrigin},
    body: JSON.stringify({version: 0, discipline:'irrigation', name: 'Pouze izolovaný test', phones: [], addresses: [{id: 'address-1', address: 'Testovací 1', city: 'Testov'}]})}));
  const direct = await responseJSON(await canonical.dispatchFetch(canonicalOrigin + '/api/customers/shared-contact', {headers: ownerHeaders}));
  const throughEntry = await responseJSON(await entry.dispatchFetch(entryOrigin + '/api/customers/shared-contact', {headers: ownerHeaders}));
  assert.deepEqual(throughEntry, direct);
  assert.equal(direct.customer.gardens.length, 1);
  assert.equal((await db.prepare("SELECT count(*) n FROM customers WHERE id='shared-contact'").first()).n, 1);
  const changed = {version: direct.customer.version, name: 'Upraveno z druhé adresy', phones: [], addresses: direct.customer.addresses};
  await responseJSON(await entry.dispatchFetch(entryOrigin + '/api/customers/shared-contact', {method: 'PUT', headers: {...ownerHeaders, origin: entryOrigin}, body: JSON.stringify(changed)}));
  assert.equal((await responseJSON(await canonical.dispatchFetch(canonicalOrigin + '/api/customers/shared-contact', {headers: ownerHeaders}))).customer.name, changed.name);
  assert.equal((await entry.dispatchFetch(entryOrigin + '/api/customers/shared-contact', {method: 'PUT', headers: {...ownerHeaders, origin: entryOrigin}, body: JSON.stringify(changed)})).status, 409);
  assert.equal((await entry.dispatchFetch(entryOrigin + '/api/customers/shared-contact')).status, 401);
  assert.equal((await entry.dispatchFetch(entryOrigin + '/api/customers/shared-contact', {headers: {...ownerHeaders, 'oai-authenticated-user-id': 'outsider', 'oai-authenticated-user-email': 'outsider@example.test'}})).status, 403);
  assert.equal((await canonical.dispatchFetch(canonicalOrigin + '/api/shared-workspace/rpc', {method: 'POST', body: '{}'})).status, 401);
  // D1 serializes the CAS + audit batch across both entry points.
  const membershipPath = '/api/workspace/customers/shared-contact/disciplines';
  const mutations = [{version: 1, operationId: 'concurrent-change-a', disciplines: ['irrigation','garden']}, {version: 1, operationId: 'concurrent-change-b', disciplines: ['irrigation']}];
  const races = await Promise.all(mutations.map((value, index) => (index ? canonical : entry).dispatchFetch((index ? canonicalOrigin : entryOrigin) + membershipPath,
    {method: 'PUT', headers: {...ownerHeaders, origin: index ? canonicalOrigin : entryOrigin}, body: JSON.stringify(value)})));
  assert.deepEqual(races.map(response => response.status).sort(), [200, 409]);
  const winner = mutations[races.findIndex(response => response.status === 200)];
  const retry = await responseJSON(await entry.dispatchFetch(entryOrigin + membershipPath, {method: 'PUT', headers: {...ownerHeaders, origin: entryOrigin}, body: JSON.stringify(winner)}));
  assert.equal(retry.membership.replayed, true);
  assert.equal((await db.prepare("SELECT count(*) n FROM workspace_audit WHERE operation_id LIKE 'concurrent-change-%'").first()).n, 1);
  assert.equal((await responseJSON(await entry.dispatchFetch(entryOrigin + '/api/workspace', {headers: ownerHeaders}))).workspace.authorizationVersion, 2);
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  const gardenId=direct.customer.gardens[0].id;
  await responseJSON(await entry.dispatchFetch(entryOrigin+'/api/jobs/upload-job',{method:'PUT',headers:ownerHeaders,body:JSON.stringify({version:0,discipline:'irrigation',title:'Large upload test',customerId:'shared-contact',gardenId,assignedTo:'owner-test',status:'planned'})}));
  const photo=new Uint8Array(25*1024*1024);photo[0]=255;photo[1]=216;photo[photo.length-2]=255;photo[photo.length-1]=217;
  await responseJSON(await entry.dispatchFetch(entryOrigin+'/api/jobs/upload-job/service/photos/large-photo',{method:'PUT',headers:{...ownerHeaders,'content-type':'image/jpeg','x-file-name':'isolated-large.jpg'},body:photo}));
  const downloaded=await canonical.dispatchFetch(canonicalOrigin+'/api/jobs/upload-job/service/photos/large-photo',{headers:ownerHeaders});
  assert.equal(downloaded.status,200);const bytes=new Uint8Array(await downloaded.arrayBuffer());assert.equal(bytes.length,photo.length);assert.equal(bytes[1],216);assert.equal(bytes.at(-1),217);

  console.log('PASS real workerd/D1/R2: two entry URLs, one database; create/read/update round-trip, stable customer/garden IDs, stale-write conflict, concurrent audited membership CAS/idempotent retry; anonymous/foreign member and unsigned RPC blocked. 25 MiB photo relayed and read from canonical R2; inactive business relay blocked. No production data used.');
} finally {
  await entry?.dispose();
  await canonical?.dispose();
}
