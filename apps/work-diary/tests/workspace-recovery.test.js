import test from 'node:test';
import assert from 'node:assert/strict';
import {environment, people, request} from './fixtures.mjs';
import {api} from '../worker/api.js';
import {sealWorkspaceRecovery, workspaceRecoveryAES, openWorkspaceRecoveryPart} from '../web/workspace-recovery-crypto.js';
import {driveOpen} from '../worker/drive-core.js';
const context = {waitUntil: value => value.catch(() => {})};
async function fixture() {
  const e = environment(); e.DRIVE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString('base64url');
  const call = async (path, person = people.owner, method = 'GET', value) => {
    const response = await api(request(path, person, method, value), e, context);
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  await call('/api/me');
  for (const role of ['worker','reader','admin']) {await call('/api/invitations',people.owner,'POST',{email:people[role].email,role});await call('/api/me',people[role]);}
  const installation=e.sqlite.prepare("SELECT instance_id FROM installation_state WHERE singleton='primary'").get().instance_id;
  e.sqlite.exec("INSERT INTO workspaces VALUES('recovery-workspace','preparing',1,1,1)");
  e.sqlite.prepare("INSERT INTO workspace_organizations VALUES('primary-org','recovery-workspace',?,'irrigation','Test')").run(installation);
  for(const role of ['owner','worker','reader','admin']) {
    const p=people[role];e.sqlite.prepare("INSERT INTO workspace_identity_aliases VALUES(?,?,?,?,?,?,?,1,'original')").run(installation,p.id,p.id,role,p.email,role,people.owner.id);
    e.sqlite.prepare("INSERT INTO workspace_member_grants VALUES(?,'primary-org',?)").run(p.id,role);
    e.sqlite.prepare("INSERT INTO member_disciplines VALUES(?,'irrigation')").run(p.id);
  }
  e.sqlite.exec("UPDATE workspaces SET state='active'");
  const info=(await call('/api/workspace/recovery/setup',people.owner,'POST',{})).recovery;
  const binary = (path, person, blob) => api(new Request('https://zavlahy.test'+path,{method:'PUT',headers:{'oai-authenticated-user-id':person.id,'oai-authenticated-user-email':person.email,'x-zavlahy-request':'1','content-type':'application/octet-stream'},body:blob}),e,context);
  return {...e,call,binary,info};
}

test('recovery public key is safe, private key stays sealed, ciphertext preserves unsent text and photo bytes',async()=>{
 const e=await fixture();
 try {
  const publicResponse=await api(request('/api/workspace/recovery-key'),e,context);
  assert.equal(publicResponse.status,200);
  const pub=await publicResponse.json();assert.equal(pub.recovery.key.id,e.info.key.id);assert.ok(!JSON.stringify(pub).includes('privateKey'));
  const row=e.sqlite.prepare("SELECT value FROM settings WHERE key='workspace-recovery-keyring'").get();
  assert.ok(!row.value.includes('privateKey'));
  const ring=await driveOpen(e,row.value,'workspace-recovery-keyring');
  const photo=new Uint8Array([255,216,255,1,2,3]);
  const value={work:'PRIVATNI_NEDOKONCENA_PRACE',photo:new File([photo],'soukr-doc.jpg',{type:'image/jpeg'})};
  const bundle=await sealWorkspaceRecovery(e.info,people.worker.id,value);
  assert.ok(!JSON.stringify(bundle.manifest).includes('PRIVATNI'));
  assert.ok(!JSON.stringify(bundle.manifest).includes('soukr-doc'));
  const aes=await workspaceRecoveryAES(ring.keys[e.info.key.id].privateKey,bundle.manifest);
  const text=await openWorkspaceRecoveryPart(aes,bundle.manifest,0,new Uint8Array(await bundle.parts[0].blob.arrayBuffer()));
  assert.equal(JSON.parse(new TextDecoder().decode(text)).work,value.work);
  const segment=bundle.manifest.segments[1][0];
  assert.deepEqual(new Uint8Array(await openWorkspaceRecoveryPart(aes,bundle.manifest,segment,new Uint8Array(await bundle.parts[segment].blob.arrayBuffer()))),photo);
  const tampered={...bundle.manifest,userId:people.owner.id};
  await assert.rejects(openWorkspaceRecoveryPart(aes,tampered,0,new Uint8Array(await bundle.parts[0].blob.arrayBuffer())));
 }finally{e.sqlite.close();}
});

test('revoked-writer recovery uploads are opaque and idempotent; only original workspace owner can preview, never automatically apply',async()=>{
 const e=await fixture();
 try {
  const bundle=await sealWorkspaceRecovery(e.info,people.worker.id,{work:'Neodeslaná oprava',photo:new Blob([new Uint8Array([5,6,7])])});
  const path='/api/workspace/recovery/'+bundle.id;
  await e.call(path,people.worker,'POST',bundle.manifest);
  assert.equal((await api(request(path+'/complete',people.worker,'POST',{}),e,context)).status,409);
  assert.equal((await e.binary(path+'/parts/0',people.reader,bundle.parts[0].blob)).status,404);
  // A role downgrade must not force loss of unsent work, but grants no business write.
  e.sqlite.prepare("UPDATE members SET role='reader' WHERE user_id=?").run(people.worker.id);
  for(const part of bundle.parts){assert.equal((await e.binary(path+'/parts/'+part.index,people.worker,part.blob)).status,200);assert.equal((await e.binary(path+'/parts/'+part.index,people.worker,part.blob)).status,200);}
  assert.equal(e.sqlite.prepare('SELECT count(*) n FROM workspace_recovery_parts').get().n,bundle.parts.length);
  await e.call(path+'/complete',people.worker,'POST',{});
  for(const person of [people.worker,people.reader,people.admin]) assert.equal((await api(request(path+'/preview',person),e,context)).status,403);
  const preview=await e.call(path+'/preview');assert.equal(preview.document.work,'Neodeslaná oprava');assert.equal(preview.automaticApply,false);assert.equal(preview.binarySegments,1);
  assert.equal(preview.assets.length,1);
  const image=await api(request(preview.assets[0].url,people.owner),e,context);assert.equal(image.status,200);assert.deepEqual(new Uint8Array(await image.arrayBuffer()),new Uint8Array([5,6,7]));
  assert.equal((await api(request(preview.assets[0].url,people.worker),e,context)).status,403);
  assert.equal(e.sqlite.prepare('SELECT count(*) n FROM jobs').get().n,0);
  assert.equal(e.sqlite.prepare('SELECT count(*) n FROM service_reports').get().n,0);
  for(const bytes of e.objects.values())assert.ok(!new TextDecoder().decode(bytes).includes('Neodeslaná oprava'));
 }finally{e.sqlite.close();}
});
