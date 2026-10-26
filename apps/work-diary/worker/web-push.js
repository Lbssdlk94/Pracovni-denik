// Web Push RFC 8291 (aes128gcm) and RFC 8292 (VAPID), using Worker Web Crypto only.
const pushEncoder=new TextEncoder();
export const pushBase64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function pushBytes(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid base64url');return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),v=>v.charCodeAt(0));}
const pushJoin=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
export function pushEndpoint(value){const u=new URL(value);const host=u.hostname;if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||value.length>2048||!(host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='updates-autopush.push.services.mozilla.com'||host.endsWith('.notify.windows.com')))throw new Error('Unsupported push endpoint');return u.href;}
export async function pushPacket(subscription,keys,payload){
 const endpoint=pushEndpoint(subscription.endpoint),ua=pushBytes(subscription.p256dh),auth=pushBytes(subscription.auth),publicKey=pushBytes(keys.publicKey);
 if(ua.length!==65||ua[0]!==4||auth.length!==16||publicKey.length!==65||publicKey[0]!==4)throw new Error('Invalid push keys');
 const client=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]),ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const server=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey)),secret=await crypto.subtle.deriveBits({name:'ECDH',public:client},ephemeral.privateKey,256),salt=crypto.getRandomValues(new Uint8Array(16));
 const derive=async(input,salt,info,length)=>new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},await crypto.subtle.importKey('raw',input,'HKDF',false,['deriveBits']),length*8));
 const ikm=await derive(secret,auth,pushJoin(pushEncoder.encode('WebPush: info\0'),ua,server),32),cek=await derive(ikm,salt,pushEncoder.encode('Content-Encoding: aes128gcm\0'),16),nonce=await derive(ikm,salt,pushEncoder.encode('Content-Encoding: nonce\0'),12);
 const plain=pushJoin(pushEncoder.encode(JSON.stringify(payload)),new Uint8Array([2]));if(plain.length>3000)throw new Error('Push payload too large');
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']),plain));
 const record=new Uint8Array(5);new DataView(record.buffer).setUint32(0,4096);record[4]=65;
 const jwt=pushBase64(pushEncoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+pushBase64(pushEncoder.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:keys.subject})));
 const privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:pushBase64(publicKey.slice(1,33)),y:pushBase64(publicKey.slice(33)),d:keys.privateKey,ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,pushEncoder.encode(jwt));
 // Topic is optional. Omit it for Apple interoperability; the SW notification tag
 // still replaces the visible inbox alert without exposing any private data.
 return {endpoint,body:pushJoin(salt,record,server,encrypted),headers:{authorization:`vapid t=${jwt}.${pushBase64(signature)}, k=${keys.publicKey}`,'content-encoding':'aes128gcm','content-type':'application/octet-stream',ttl:'86400',urgency:'normal'}};
}

// Keep diagnostics bounded and free of endpoints, tokens, payloads and personal data.
export class PushDeliveryError extends Error{constructor(code,details={}){super(code);this.code=code;this.details=details;}}
export async function sendWebPush(subscription,keys,payload){
 let packet;try{packet=await pushPacket(subscription,keys,payload);}catch(error){throw new PushDeliveryError('PUSH_CRYPTO',{phase:'encryption',errorName:error.name});}
 let response;try{response=await fetch(packet.endpoint,{method:'POST',headers:packet.headers,body:packet.body,redirect:'manual',signal:AbortSignal.timeout(10000)});}catch(error){throw new PushDeliveryError('PUSH_NETWORK',{phase:'transport',errorName:error.name,provider:new URL(packet.endpoint).hostname});}
 if(response.ok){try{await response.body?.cancel();}catch{}return {status:response.status};}
 let reason='';try{const reader=response.body?.getReader();if(reader){const chunks=[];let size=0;while(size<4096){const next=await reader.read();if(next.done)break;chunks.push(next.value);size+=next.value.length;}await reader.cancel().catch(()=>{});const data=JSON.parse(new TextDecoder().decode(pushJoin(...chunks).slice(0,4096)));if(typeof data.reason==='string'&&/^[a-zA-Z0-9_ -]{1,80}$/.test(data.reason))reason=data.reason;}}catch{}
 throw new PushDeliveryError('PUSH_PROVIDER',{phase:'provider',status:response.status,reason,provider:new URL(packet.endpoint).hostname});
}
export function pushDiagnostic(error){const details=error instanceof PushDeliveryError?error.details:{phase:'unknown',errorName:error?.name||'Error'};const code=error instanceof PushDeliveryError?error.code:'PUSH_UNKNOWN';console.warn('push_delivery_failed',JSON.stringify({code,...details}));return {code,...details};}
