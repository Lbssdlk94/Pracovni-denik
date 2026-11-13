// Only the server holds the private key. Local recovery bundles contain ciphertext.
const wrEncoder = new TextEncoder();
const wrChunkSize = 4 * 1024 * 1024;
export function workspaceBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function workspaceUnbase64(value) {
  if (typeof value !== 'string' || !/^[-\w]+$/.test(value)) throw Error('Neplatný šifrovaný balíček.');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), value => value.charCodeAt(0));
}
export async function workspaceCipherHash(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
}
async function wrPack(value, binaries, depth = 0) {
  if (depth > 40) throw Error('Příliš složitý místní záznam.');
  if (value instanceof Blob) {
    const segment = binaries.push(value);
    return {__workspaceBinary: segment, type: value.type || '', name: value.name || '', lastModified: value.lastModified || 0, format: 'blob'};
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = value instanceof ArrayBuffer ? value : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    const segment = binaries.push(new Blob([bytes]));
    return {__workspaceBinary: segment, format: 'arraybuffer'};
  }
  if (Array.isArray(value)) return Promise.all(value.map(item => wrPack(item, binaries, depth + 1)));
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, child] of Object.entries(value)) result[key] = await wrPack(child, binaries, depth + 1);
    return result;
  }
  return value;
}
export async function sealWorkspaceRecovery(info, userId, value, id = crypto.randomUUID()) {
  if (!info?.workspaceId || !info.key?.id || !info.key?.publicKey || typeof userId !== 'string') throw Error('Chybí veřejný klíč pro zabezpečení neodeslané práce.');
  const rsa = await crypto.subtle.importKey('spki', workspaceUnbase64(info.key.publicKey), {name: 'RSA-OAEP', hash: 'SHA-256'}, false, ['encrypt']);
  const aes = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, true, ['encrypt']);
  const wrappedKey = workspaceBase64(new Uint8Array(await crypto.subtle.encrypt('RSA-OAEP', rsa, await crypto.subtle.exportKey('raw', aes))));
  const binaries = [], document = await wrPack(value, binaries);
  const segments = [new Blob([JSON.stringify(document)], {type: 'application/json'}), ...binaries];
  const manifest = {format: 'work-diary-offline-recovery', version: 1, id, workspaceId: info.workspaceId, userId, keyId: info.key.id, wrappedKey, segments: [], parts: []};
  const parts = [];
  for (const segment of segments) {
    const indices = [];
    // Empty binary objects still get an authenticated encrypted part.
    for (let offset = 0; offset < Math.max(1, segment.size); offset += wrChunkSize) {
      const index = parts.length;
      if (index >= 128) throw Error('Balíček je příliš velký. Rozdělte neodeslanou práci na menší části.');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const aad = wrEncoder.encode([manifest.workspaceId, userId, id, index].join('\0'));
      const cipher = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad}, aes, await segment.slice(offset, offset + wrChunkSize).arrayBuffer()));
      const bytes = new Uint8Array(12 + cipher.length); bytes.set(iv); bytes.set(cipher, 12);
      manifest.parts.push({index, size: bytes.length, sha256: await workspaceCipherHash(bytes)});
      parts.push({index, blob: new Blob([bytes], {type: 'application/octet-stream'})});
      indices.push(index);
    }
    manifest.segments.push(indices);
  }
  return {id, manifest, parts};
}
export async function workspaceRecoveryAES(privateKey, manifest) {
  const rsa = await crypto.subtle.importKey('pkcs8', workspaceUnbase64(privateKey), {name: 'RSA-OAEP', hash: 'SHA-256'}, false, ['decrypt']);
  const raw = await crypto.subtle.decrypt('RSA-OAEP', rsa, workspaceUnbase64(manifest.wrappedKey));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
}
export async function openWorkspaceRecoveryPart(aes, manifest, index, bytes) {
  const meta = manifest.parts[index];
  if (!meta || bytes.length !== meta.size || await workspaceCipherHash(bytes) !== meta.sha256) throw Error('Poškozená část obnovovacího balíčku.');
  const aad = wrEncoder.encode([manifest.workspaceId, manifest.userId, manifest.id, index].join('\0'));
  return crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: aad}, aes, bytes.slice(12));
}
