// Deterministic Google simulator for isolated QA. Never imported by the production Worker.
import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';
export function googleFixture(){
 const files=new Map(),sessions=new Map(),tokens=new Map(),codes=new Map(),revoked=new Set();let next=0,refreshes=0;const failures={dropAfterCommit:false,failNextChunk:false,delayFolder:false};
 const account=id=>({permissionId:'permission_'+id,emailAddress:id+'@example.com'}),json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json',...headers}}),ownerPermission=[{type:'user',role:'owner'}];
 const token=id=>{const value='access_'+id+'_'+(++next);tokens.set(value,id);return value;};
 const issueCode=(id='google-owner')=>{const code='code_'+(++next);codes.set(code,id);return code;};
 const createPrivateFolder=(id='existing_folder',name='Soukromé závlahy')=>{files.set(id,{id,name,mimeType:'application/vnd.google-apps.folder',permissions:ownerPermission,ownedByMe:true,capabilities:{canAddChildren:true},trashed:false,parents:[],appProperties:{}});return id;};
 async function fetchMock(input,init={}){
  const u=new URL(typeof input==='string'?input:input.url),headers=new Headers(init.headers),method=init.method||'GET';
  if(u.hostname==='oauth2.googleapis.com'&&u.pathname==='/token'){
   const p=new URLSearchParams(init.body);let id;
   if(p.get('grant_type')==='authorization_code'){id=codes.get(p.get('code'));codes.delete(p.get('code'));}
   else{refreshes++;const value=p.get('refresh_token');if(revoked.has(value))return json({error:'invalid_grant'},400);id=value?.replace(/^refresh_/,'');}
   if(!id)return json({error:'invalid_grant'},400);return json({access_token:token(id),refresh_token:'refresh_'+id,expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file',token_type:'Bearer'});
  }
  if(u.hostname==='oauth2.googleapis.com'&&u.pathname==='/revoke'){revoked.add(new URLSearchParams(init.body).get('token'));return json({});}
  const accountId=tokens.get((headers.get('authorization')||'').replace('Bearer ',''));if(!accountId)return json({error:'unauthorized'},401);
  if(u.hostname==='lh3.googleusercontent.com')return new Response(readFileSync('web/logo-dr-zavlaha.jpg'),{headers:{'content-type':'image/jpeg'}});
  if(u.pathname==='/drive/v3/about')return json({user:account(accountId)});
  if(u.pathname==='/drive/v3/files/generateIds')return json({ids:['google_file_'+(++next)]});
  if(u.pathname==='/upload/drive/v3/files'&&method==='POST'){
   const metadata=JSON.parse(init.body);if(files.has(metadata.id))return json({error:'exists'},409);const id='session_'+(++next),location='https://www.googleapis.com/upload/drive/v3/files?upload_id='+id;sessions.set(id,{metadata,offset:0,chunks:[],size:Number(headers.get('x-upload-content-length')),accountId});return json({},200,{location});
  }
  if(u.pathname==='/upload/drive/v3/files'&&method==='PUT'){
   const s=sessions.get(u.searchParams.get('upload_id'));if(!s)return json({},404);if(s.accountId!==accountId)return json({},403);const range=headers.get('content-range');
   if(range.startsWith('bytes */'))return files.has(s.metadata.id)?json({id:s.metadata.id}):new Response(null,{status:308,headers:s.offset?{range:'bytes=0-'+(s.offset-1)}:{}});
   if(failures.failNextChunk){failures.failNextChunk=false;throw new Error('Simulated network failure');}
   const parts=range.match(/^bytes (\d+)-(\d+)\/(\d+)$/),offset=Number(parts[1]),bytes=new Uint8Array(init.body);if(offset!==s.offset)return new Response(null,{status:308,headers:s.offset?{range:'bytes=0-'+(s.offset-1)}:{}});s.chunks.push(bytes);s.offset+=bytes.length;
   if(s.offset<s.size)return new Response(null,{status:308,headers:{range:'bytes=0-'+(s.offset-1)}});
   const all=new Uint8Array(s.size);let at=0;for(const b of s.chunks){all.set(b,at);at+=b.length;}const file={...s.metadata,size:String(s.size),sha256Checksum:createHash('sha256').update(all).digest('hex'),bytes:all,ownedByMe:true,permissions:ownerPermission,trashed:false,thumbnailLink:'https://lh3.googleusercontent.com/'+s.metadata.id,accountId};files.set(file.id,file);
   if(failures.dropAfterCommit){failures.dropAfterCommit=false;throw new Error('Simulated lost success response');}return json({id:file.id});
  }
  if(u.pathname==='/drive/v3/files'&&method==='POST'){
   const metadata=JSON.parse(init.body);if(files.has(metadata.id))return json({},409);if(failures.delayFolder)await new Promise(r=>setTimeout(r,3));if(files.has(metadata.id))return json({},409);const file={...metadata,ownedByMe:true,permissions:ownerPermission,trashed:false,capabilities:{canAddChildren:true},accountId};files.set(file.id,file);return json({id:file.id});
  }
  const id=decodeURIComponent(u.pathname.split('/').at(-1)),file=files.get(id);if(!file)return json({},404);if(file.accountId&&file.accountId!==accountId)return json({},404);
  if(method==='PATCH'){Object.assign(file,JSON.parse(init.body));return json({id});}
  if(u.searchParams.get('alt')==='media')return new Response(file.bytes,{headers:{'content-type':file.mimeType}});
  const {bytes,...metadata}=file;return json(metadata);
 }
 return {fetch:fetchMock,files,sessions,tokens,failures,issueCode,createPrivateFolder,get refreshes(){return refreshes;},revoked};
}
