import {driveOpen,driveSeal} from './drive-core.js';
import {workspaceBase64,workspaceCipherHash,workspaceRecoveryAES,openWorkspaceRecoveryPart} from '../web/workspace-recovery-crypto.js';
const wrKeyName = 'workspace-recovery-keyring';
async function wrKeyring(env) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(wrKeyName).first();
  return row ? driveOpen(env, row.value, wrKeyName) : null;
}
export async function ensureWorkspaceRecoveryKey(env) {
  const old = await wrKeyring(env);
  if (old) return old;
  const pair = await crypto.subtle.generateKey({name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256'}, true, ['encrypt','decrypt']);
  const publicKey = workspaceBase64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
  const privateKey = workspaceBase64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)));
  const id = (await workspaceCipherHash(new TextEncoder().encode(publicKey))).slice(0, 24);
  const value = {current: id, keys: {[id]: {publicKey, privateKey, createdAt: Date.now()}}};
  await env.DB.prepare('INSERT OR IGNORE INTO settings(key,value,version) VALUES(?,?,1)').bind(wrKeyName, await driveSeal(env, value, wrKeyName)).run();
  return wrKeyring(env);
}
export async function workspaceRecoveryPublicInfo(env) {
  const workspace = await env.DB.prepare('SELECT id FROM workspaces LIMIT 1').first();
  if (!workspace) return null;
  const ring = await wrKeyring(env);
  if (!ring) return null;
  return {workspaceId: workspace.id, key: {id: ring.current, publicKey: ring.keys[ring.current].publicKey}};
}
function wrValidateManifest(value, actor, workspace, fail) {
  if (!value || value.format !== 'work-diary-offline-recovery' || value.version !== 1 || !/^[-\w]{8,100}$/.test(value.id || '') || value.workspaceId !== workspace || value.userId !== actor ||
      !/^[a-f0-9]{24}$/.test(value.keyId || '') || !/^[-\w]{342}$/.test(value.wrappedKey || '') || !Array.isArray(value.parts) || !value.parts.length || value.parts.length > 128 || !Array.isArray(value.segments) || !value.segments.length || value.segments.length > 128) fail(400, 'Neplatný obnovovací balíček.');
  let total = 0;
  value.parts.forEach((part, index) => {if (part.index !== index || !Number.isInteger(part.size) || part.size < 28 || part.size > 4194336 || !/^[a-f0-9]{64}$/.test(part.sha256 || '')) fail(400, 'Neplatná část balíčku.'); total += part.size;});
  const indices = value.segments.flat();
  if (value.segments.some(segment => !Array.isArray(segment) || !segment.length) || indices.length !== value.parts.length || indices.some((index, position) => index !== position) || total > 512*1024*1024) fail(400, 'Neplatné propojení částí balíčku.');
  // Strict whitelist: a manifest cannot smuggle contact text or secret keys into metadata.
  if (Object.keys(value).some(key => !['format','version','id','workspaceId','userId','keyId','wrappedKey','segments','parts'].includes(key)) || value.parts.some(part => Object.keys(part).some(key => !['index','size','sha256'].includes(key)))) fail(400, 'Balíček obsahuje neplatná metadata.');
  return total;
}
async function wrOwner(env, actor) {
  if (actor.role !== 'owner') return false;
  return !!await env.DB.prepare("SELECT 1 FROM workspace_member_grants g JOIN workspace_organizations o ON o.id=g.organization_id JOIN installation_state i ON i.instance_id=o.installation_id JOIN members current ON current.user_id=g.user_id AND current.role='owner' WHERE i.singleton='primary' AND g.user_id=? AND g.original_role='owner'").bind(actor.user_id).first();
}
const wrObjectKey = (id, index) => 'workspace-recovery/' + id + '/' + index;
async function wrDocument(env, bundle, fail) {
  if (bundle.state !== 'sealed') fail(409, 'Balíček ještě není celý nahraný.');
  const manifest=JSON.parse(bundle.manifest),ring=await wrKeyring(env),key=ring?.keys[manifest.keyId];
  if(!key)fail(409,'Soukromý obnovovací klíč není dostupný.');
  if(manifest.segments[0].reduce((sum,index)=>sum+manifest.parts[index].size-28,0)>16*1024*1024)fail(413,'Text balíčku je příliš velký pro náhled.');
  const aes=await workspaceRecoveryAES(key.privateKey,manifest),chunks=[];
  for(const index of manifest.segments[0]){const object=await env.BUCKET.get(wrObjectKey(bundle.id,index));if(!object)fail(409,'Chybí část balíčku.');chunks.push(await openWorkspaceRecoveryPart(aes,manifest,index,new Uint8Array(await object.arrayBuffer())));}
  const document=JSON.parse(await new Blob(chunks).text()),assets=new Map();
  function collect(value,parent=null){if(!value||typeof value!=='object')return;if(Number.isInteger(value.__workspaceBinary)&&value.__workspaceBinary>0&&value.__workspaceBinary<manifest.segments.length)assets.set(value.__workspaceBinary,{segment:value.__workspaceBinary,name:String(value.name||parent?.name||'obnovena-priloha.bin').slice(0,200),type:value.type||parent?.type||'application/octet-stream'});for(const child of Object.values(value))if(child&&typeof child==='object')collect(child,value);}
  collect(document);return {manifest,aes,document,assets:[...assets.values()]};
}
export async function handleWorkspaceRecovery(request, env, actor, helpers) {
  const {fail,json,body,boundedBytes} = helpers, path = new URL(request.url).pathname, method = request.method;
  const workspace = await env.DB.prepare('SELECT id FROM workspaces LIMIT 1').first();
  if (!workspace) fail(404, 'Společný pracovní prostor není připravený.');
  if (path === '/api/workspace/recovery/setup' && method === 'POST') {
    if (!await wrOwner(env,actor)) fail(403,'Obnovovací klíč připravuje vlastník společného prostoru.');
    await ensureWorkspaceRecoveryKey(env);return json({recovery:await workspaceRecoveryPublicInfo(env)});
  }
  if (path === '/api/workspace/recovery' && method === 'GET') {
    if (!await wrOwner(env, actor)) fail(403, 'Obnovu neodeslané práce spravuje vlastník společného prostoru.');
    const rows = (await env.DB.prepare('SELECT id,user_id,created_at,state FROM workspace_recovery_bundles WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100').bind(workspace.id).all()).results;
    return json({bundles: rows});
  }
  const match = path.match(/^\/api\/workspace\/recovery\/([-\w]{8,100})(?:\/(parts|assets)\/(\d{1,3})|\/(complete|preview))?$/);
  if (!match) fail(404, 'Nenalezeno.');
  const id = match[1], index = match[3] === undefined ? null : Number(match[3]), action = match[4];
  const old = await env.DB.prepare('SELECT * FROM workspace_recovery_bundles WHERE id=? AND workspace_id=?').bind(id, workspace.id).first();
  if (method === 'POST' && !match[2] && !action) {
    const manifest = await body(request, 100000), ownerImport=request.headers.get('x-workspace-recovery-import')==='1'&&await wrOwner(env,actor),total = wrValidateManifest(manifest,ownerImport?manifest.userId:actor.user_id,workspace.id,fail);if(typeof manifest.userId!=='string'||!/^[-\w]{1,100}$/.test(manifest.userId))fail(400,'Neplatný původce balíčku.');
    if (manifest.id !== id) fail(400, 'Identifikátor balíčku nesouhlasí.');
    const ring = await wrKeyring(env); if (!ring?.keys[manifest.keyId]) fail(409, 'Obnovovací klíč není dostupný. Balíček zůstává šifrovaný v zařízení.');
    const text = JSON.stringify(manifest), hash = await workspaceCipherHash(new TextEncoder().encode(text));
    if (old) {if (!ownerImport&&old.user_id !== actor.user_id || old.manifest_hash !== hash) fail(409, 'Pod tímto ID je jiný balíček.'); return json({id, state: old.state, replayed: true});}
    const result = await env.DB.prepare("INSERT INTO workspace_recovery_bundles(id,user_id,workspace_id,created_at,state,manifest,manifest_hash) SELECT ?,?,?,?,'uploading',?,? WHERE (SELECT count(*) FROM workspace_recovery_bundles WHERE user_id=? AND state='uploading')<20")
      .bind(id, manifest.userId, workspace.id, Date.now(), text, hash, manifest.userId).run();
    if (!result.meta.changes) fail(429, 'Příliš mnoho nedokončených balíčků. Obnovu musí zkontrolovat vlastník.');
    return json({id, state: 'uploading', bytes: total});
  }
  if (!old) fail(404, 'Balíček nebyl nalezen.');
  if (action === 'preview' && method === 'GET') {
    if (!await wrOwner(env, actor)) fail(403, 'Neodeslanou práci může obnovit pouze vlastník společného prostoru.');
    const opened=await wrDocument(env,old,fail);
    return json({id, userId: old.user_id, createdAt: old.created_at, document:opened.document, assets:opened.assets.map(asset=>({...asset,url:'/api/workspace/recovery/'+id+'/assets/'+asset.segment})),binarySegments:opened.manifest.segments.length-1, automaticApply:false});
  }
  if (match[2]==='assets'&&method==='GET') {
    if(!await wrOwner(env,actor))fail(403,'Přílohy obnovuje vlastník společného prostoru.');
    const opened=await wrDocument(env,old,fail),asset=opened.assets.find(value=>value.segment===index);
    if(!asset)fail(404,'Příloha nebyla nalezena.');
    const indices=opened.manifest.segments[index];let position=0;
    const stream=new ReadableStream({async pull(controller){try{if(position>=indices.length){controller.close();return;}const part=indices[position++],object=await env.BUCKET.get(wrObjectKey(id,part));if(!object)throw Error('Chybí část přílohy');controller.enqueue(new Uint8Array(await openWorkspaceRecoveryPart(opened.aes,opened.manifest,part,new Uint8Array(await object.arrayBuffer()))));}catch(error){controller.error(error);}}});
    return new Response(stream,{headers:{'content-type':'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(asset.name).replaceAll("'",'%27')}});
  }
  const ownerImport=request.headers.get('x-workspace-recovery-import')==='1'&&await wrOwner(env,actor);
  if (old.user_id !== actor.user_id&&!ownerImport) fail(404, 'Balíček nebyl nalezen.');
  const manifest = JSON.parse(old.manifest);
  if (match[2] === 'parts' && method === 'PUT') {
    const part = manifest.parts[index];if (!part) fail(400, 'Neplatná část balíčku.');
    const bytes = await boundedBytes(request, 4194336);if (bytes.length !== part.size || await workspaceCipherHash(bytes) !== part.sha256) fail(400, 'Kontrolní součet části nesouhlasí.');
    if (old.state === 'sealed') return json({ok: true, replayed: true});
    const reserved = await env.DB.prepare('INSERT OR IGNORE INTO workspace_recovery_parts(bundle_id,part,size,sha256,ready) SELECT ?,?,?,?,0 WHERE COALESCE((SELECT sum(p.size) FROM workspace_recovery_parts p JOIN workspace_recovery_bundles b ON b.id=p.bundle_id WHERE b.user_id=?),0)+?<=536870912')
      .bind(id,index,part.size,part.sha256,old.user_id,part.size).run();
    if (!reserved.meta.changes && !await env.DB.prepare('SELECT 1 FROM workspace_recovery_parts WHERE bundle_id=? AND part=? AND sha256=?').bind(id,index,part.sha256).first()) fail(429, 'Limit zabezpečené neodeslané práce je zaplněný. Balíček zůstává v zařízení.');
    await env.BUCKET.put(wrObjectKey(id,index),bytes,{httpMetadata:{contentType:'application/octet-stream'}});
    await env.DB.prepare('UPDATE workspace_recovery_parts SET ready=1 WHERE bundle_id=? AND part=? AND sha256=?').bind(id,index,part.sha256).run();
    return json({ok: true});
  }
  if (action === 'complete' && method === 'POST') {
    const ready = await env.DB.prepare('SELECT count(*) n FROM workspace_recovery_parts WHERE bundle_id=? AND ready=1').bind(id).first();
    if (ready.n !== manifest.parts.length) fail(409, 'Některé části ještě nejsou nahrané.');
    await env.DB.prepare("UPDATE workspace_recovery_bundles SET state='sealed' WHERE id=? AND user_id=?").bind(id,old.user_id).run();
    return json({id,state:'sealed'});
  }
  fail(405, 'Nepodporovaná operace.');
}
