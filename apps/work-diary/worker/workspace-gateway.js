// A paired entry point signs a verified identity, never a role or a discipline grant.
// All application authorization still happens in the canonical API/database.
const WG_PATH='/api/shared-workspace/rpc',WG_MAX=28*1024*1024,WG_TTL=30000;
const wgEncoder=new TextEncoder();
function wgFail(status,message){return new Response(JSON.stringify({error:message}),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});}
function wgConfig(env){if(!env.SHARED_WORKSPACE_GATEWAY)return null;let c;try{c=JSON.parse(env.SHARED_WORKSPACE_GATEWAY);}catch{throw Error('Invalid workspace gateway configuration');}if(!['entry','entry-staging','canonical'].includes(c.mode)||typeof c.key!=='string'||!/^[-\w]{43}$/.test(c.key)||!/^inst-[-\w]{10,80}$/.test(c.peerId)||!/^inst-[-\w]{10,80}$/.test(c.localId))throw Error('Invalid workspace gateway configuration');const u=new URL(c.canonicalOrigin);if(u.protocol!=='https:'||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw Error('Invalid workspace gateway origin');let entryOrigin; if(c.mode==='canonical'){const entry=new URL(c.entryOrigin);if(entry.protocol!=='https:'||entry.pathname!=='/'||entry.username||entry.password||entry.search||entry.hash||entry.origin===u.origin||c.localId===c.peerId)throw Error('Invalid paired entry origin');entryOrigin=entry.origin;}return {...c,canonicalOrigin:u.origin,...(entryOrigin?{entryOrigin}:{})};}
async function wgBytes(request){const chunks=[];let size=0;const reader=request.body?.getReader();if(!reader)return new Uint8Array();for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>WG_MAX){await reader.cancel();throw Object.assign(Error('Požadavek překračuje limit společného API.'),{status:413});}chunks.push(value);}const bytes=new Uint8Array(size);let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}return bytes;}
async function wgHash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
async function wgSign(key,text){const k=await crypto.subtle.importKey('raw',wgEncoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,wgEncoder.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
async function wgEnvelopeKey(secret){const raw=await crypto.subtle.digest('SHA-256',wgEncoder.encode(secret+'\0workspace-envelope-aes'));return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);}
async function wgSeal(secret,plain){const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:wgEncoder.encode('work-diary-gateway-v1')},await wgEnvelopeKey(secret),wgEncoder.encode(plain))),bytes=new Uint8Array(iv.length+encrypted.length);bytes.set(iv);bytes.set(encrypted,12);return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
async function wgOpen(secret,encoded){const bytes=Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:wgEncoder.encode('work-diary-gateway-v1')},await wgEnvelopeKey(secret),bytes.slice(12)));}
function wgSame(a,b){let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function wgCookie(request){return (request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('__Host-zavlahy-access=')||s.startsWith('__Host-zavlahy-drive-oauth=')).join('; ');}
export async function workspaceGateway(request,env,ctx,canonicalAPI){
 let config;try{config=wgConfig(env);}catch{return wgFail(503,'Společné API není správně nastavené.');}if(!config)return null;
 const u=new URL(request.url);if(!u.pathname.startsWith('/api/'))return null;
 try{
 if(config.mode==='entry'||config.mode==='entry-staging'){
  if(config.mode==='entry-staging'&&u.pathname!=='/api/shared-workspace/test')return null;
  if(u.pathname===WG_PATH)return wgFail(404,'Nenalezeno.');
  // Privileged installation maintenance cannot be invoked through an entry relay.
  if(u.pathname.startsWith('/api/maintenance/')||u.pathname.startsWith('/api/workspace-transfer/'))return wgFail(404,'Nenalezeno.');
  const bytes=await wgBytes(request),identity={id:request.headers.get('oai-authenticated-user-id')||'',email:request.headers.get('oai-authenticated-user-email')||'',name:request.headers.get('oai-authenticated-user-full-name')||'',encoding:request.headers.get('oai-authenticated-user-full-name-encoding')||''};
  const meta={v:1,from:config.localId,to:config.peerId,path:u.pathname+u.search,method:request.method,time:Date.now(),nonce:crypto.randomUUID(),identity,cookie:wgCookie(request),origin:request.headers.get('origin'),site:request.headers.get('sec-fetch-site'),marker:request.headers.get('x-zavlahy-request'),type:request.headers.get('content-type')||'',file:request.headers.get('x-file-name')||'',chunk:request.headers.get('x-chunk-sha256')||'',range:request.headers.get('range')||'',discipline:request.headers.get('x-work-discipline')||'',clientVersion:request.headers.get('x-workspace-client-version')||'',clientIp:request.headers.get('cf-connecting-ip')||'',serviceAuthorization:u.pathname==='/api/platform-initialize'?request.headers.get('authorization')||'':'',hash:await wgHash(bytes)};
  const encoded=await wgSeal(config.key,JSON.stringify(meta)),headers={'x-workspace-envelope':encoded,'x-workspace-signature':await wgSign(config.key,encoded),'content-type':meta.type||'application/octet-stream'};
  const response=await fetch(config.canonicalOrigin+WG_PATH,{method:'POST',headers,body:wgBody(bytes),duplex:'half',redirect:'manual',signal:AbortSignal.timeout(55000)});
  const safeHeaders=new Headers(response.headers);safeHeaders.delete('access-control-allow-origin');return new Response(response.body,{status:response.status,headers:safeHeaders});
 }
 if(u.pathname!==WG_PATH)return null;if(request.method!=='POST')return wgFail(404,'Nenalezeno.');
 const envelope=request.headers.get('x-workspace-envelope')||'',signature=request.headers.get('x-workspace-signature')||'';if(envelope.length>12000||!/^[a-f0-9]{64}$/.test(signature))return wgFail(401,'Neplatné propojení aplikací.');
 if(!wgSame(await wgSign(config.key,envelope),signature))return wgFail(401,'Neplatné propojení aplikací.');
 let raw,meta;try{raw=await wgOpen(config.key,envelope);meta=JSON.parse(raw);}catch{return wgFail(401,'Neplatné propojení aplikací.');}
 if(meta.v!==1||meta.from!==config.peerId||meta.to!==config.localId||!Number.isSafeInteger(meta.time)||Math.abs(Date.now()-meta.time)>WG_TTL||!/^[-\w]{36}$/.test(meta.nonce||'')||!['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(meta.method)||typeof meta.path!=='string'||!meta.path.startsWith('/api/')||meta.path.startsWith('//')||meta.path.includes('#')||meta.path.startsWith(WG_PATH)||meta.path.startsWith('/api/maintenance/')||meta.path.startsWith('/api/workspace-transfer/'))return wgFail(401,'Neplatné propojení aplikací.');
 const parsed=new URL(meta.path,config.canonicalOrigin);if(parsed.origin!==config.canonicalOrigin||parsed.pathname+parsed.search!==meta.path)return wgFail(401,'Neplatná cesta požadavku.');
 const bytes=await wgBytes(request);if(await wgHash(bytes)!==meta.hash)return wgFail(401,'Obsah požadavku neodpovídá podpisu.');
 // The signed diagnostic can prove hosted transport before any business cutover.
 // Persistent nonces make replays fail across isolates/restarts as well.
 const nonce=await env.DB.prepare('INSERT OR IGNORE INTO workspace_gateway_nonces(nonce,expires_at) VALUES(?,?)').bind(meta.from+':'+meta.nonce,Date.now()+WG_TTL*2).run();if(!nonce.meta.changes)return wgFail(409,'Tento požadavek už byl zpracován.');
 ctx.waitUntil(env.DB.prepare('DELETE FROM workspace_gateway_nonces WHERE expires_at<?').bind(Date.now()).run().catch(()=>{}));
 const hasWorkspace=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'").first();
 const workspace=hasWorkspace?await env.DB.prepare('SELECT id,state FROM workspaces LIMIT 1').first():null;
 if(parsed.pathname==='/api/shared-workspace/test'&&meta.method==='GET'){const challenge=parsed.searchParams.get('challenge');if(!/^[-\w]{16,100}$/.test(challenge||''))return wgFail(400,'Neplatná ověřovací výzva.');return Response.json({paired:true,challenge,entryInstallation:config.peerId,canonicalInstallation:config.localId,workspaceState:workspace?.state||'not-configured'},{headers:{'cache-control':'no-store'}});}
 if(!workspace||!['active','read_only'].includes(workspace.state))return wgFail(503,'Propojení se připravuje. Pracovní data se zatím nepředávají.');
 const headers=new Headers();for(const [key,value]of Object.entries({'oai-authenticated-user-id':meta.identity?.id,'oai-authenticated-user-email':meta.identity?.email,'oai-authenticated-user-full-name':meta.identity?.name,'oai-authenticated-user-full-name-encoding':meta.identity?.encoding,cookie:meta.cookie,'content-type':meta.type,'x-file-name':meta.file,'x-chunk-sha256':meta.chunk,range:meta.range,'x-work-discipline':meta.discipline,'x-workspace-client-version':meta.clientVersion,'cf-connecting-ip':meta.clientIp,'x-zavlahy-request':meta.marker,'sec-fetch-site':meta.site}))if(value)headers.set(key,value);
 // Validate browser origin against the paired entry, then normalize for existing CSRF checks.
 if(meta.origin){if(meta.origin!==config.entryOrigin)return wgFail(403,'Požadavek nepochází ze spárované aplikace.');headers.set('origin',config.canonicalOrigin);}
 if(parsed.pathname==='/api/platform-initialize'&&meta.serviceAuthorization)headers.set('authorization',meta.serviceAuthorization);
 const forwarded=new Request(config.canonicalOrigin+meta.path,{method:meta.method,headers,...(['GET','HEAD'].includes(meta.method)?{}:{body:wgBody(bytes),duplex:'half'})});
 return await canonicalAPI(forwarded,{...env,WORKSPACE_ENTRY_ID:config.peerId,WORKSPACE_ENTRY_ORIGIN:config.entryOrigin},{...ctx,workspaceIngress:config.peerId,waitUntil:p=>ctx.waitUntil(p)});
 }catch(error){return wgFail(error.status||503,error.status?error.message:'Společné API je dočasně nedostupné.');}
}

function wgBody(bytes){return new ReadableStream({start(controller){if(bytes.length)controller.enqueue(bytes);controller.close();}});}
