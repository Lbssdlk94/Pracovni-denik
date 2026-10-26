// Loopback development adapter. Test identity cookies are never included in the hosted Worker.
import http from 'node:http';
import worker from '../dist/server/index.js';
import {environment,people} from '../tests/fixtures.mjs';
import {googleFixture} from '../tests/google-drive-fixture.mjs';
const google=googleFixture();globalThis.fetch=google.fetch;
const env=environment();env.DRIVE_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64url');const ctx={waitUntil:p=>p.catch(()=>{})};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:5187');
  if(url.pathname==='/__qa/google-code'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({code:google.issueCode(url.searchParams.get('account')||'google-owner')}));return;}
  if(url.pathname==='/__qa/google-fail'){google.failures.failNextChunk=true;res.writeHead(200);res.end('ok');return;}
  if(url.pathname==='/__qa/google-folder'){google.createPrivateFolder('existing_folder');res.writeHead(200);res.end('ok');return;}
  if(url.pathname==='/__qa/google-stats'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({files:[...google.files.values()].map(f=>({id:f.id,name:f.name,mimeType:f.mimeType,trashed:f.trashed,size:f.size}))}));return;}
  if(url.pathname==='/__qa/login'){const person=url.searchParams.get('user');if(!people[person]){res.writeHead(400);res.end();return;}res.writeHead(302,{'set-cookie':`qa-person=${person}; Path=/; SameSite=Lax`,location:'/'});res.end();return;}
  const person=people[(req.headers.cookie||'').match(/qa-person=(\w+)/)?.[1]],headers=new Headers(req.headers);
  headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
  if(person){headers.set('oai-authenticated-user-id',person.id);headers.set('oai-authenticated-user-email',person.email);}
  const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  const response=await worker.fetch(request,env,ctx);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('Preview error');}
});
server.listen(5187,'127.0.0.1',()=>console.log('Team preview: http://127.0.0.1:5187'));
