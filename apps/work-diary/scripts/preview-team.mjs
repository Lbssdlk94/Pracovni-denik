// Loopback development adapter. Test identity cookies are never included in the hosted Worker.
import http from 'node:http';
import worker from '../dist/server/index.js';
import {environment,people} from '../tests/fixtures.mjs';
const env=environment(),ctx={waitUntil:p=>p.catch(()=>{})};
if(process.env.QA_DEVICE_SETUP==='1'){const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);env.WEB_PUSH_PUBLIC_KEY=Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url');env.WEB_PUSH_PRIVATE_KEY=(await crypto.subtle.exportKey('jwk',keys.privateKey)).d;env.PUBLIC_APP_URL='https://zavlahy.test';}
if(process.env.QA_EMAIL_SETTINGS==='1')env.DRIVE_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,19).toString('base64url');
// A single SQLite test connection cannot expose uncommitted writes to another request.
// Serialize API requests here; real concurrency is verified separately inside workerd/D1.
let apiQueue=Promise.resolve();
// Local-only deterministic map fixtures; never bundled into the hosted Worker.
if(process.env.QA_JOB_MAP==='1'||process.env.QA_DEVICE_SETUP==='1'){const originalFetch=globalThis.fetch;globalThis.fetch=async(url,...args)=>{const u=new URL(typeof url==='string'||url instanceof URL?url:url.url);if(process.env.QA_DEVICE_SETUP==='1'&&u.hostname==='fcm.googleapis.com')return new Response('',{status:201});if(u.hostname==='photon.komoot.io'&&u.pathname==='/api/'){const q=u.searchParams.get('q')||'';if(q.includes('Nedostupná'))return new Response('Offline provider',{status:503});const point=(latitude,longitude)=>({geometry:{type:'Point',coordinates:[longitude,latitude]},properties:{street:q.split(',')[0],housenumber:'12',city:'Praha'}});if(q.includes('Pouze ulice'))return Response.json({features:[{geometry:{type:'Point',coordinates:[14.5,50.12]},properties:{street:'Pouze ulice',city:'Praha',type:'street'}}]});if(q.includes('Pouze obec'))return Response.json({features:[{geometry:{type:'Point',coordinates:[14.6,50.13]},properties:{city:'Testovací obec',type:'city'}}]});return Response.json({features:q.includes('Nejasná')?[point(50.09,14.43),point(49.9,14.1)]:[q.includes('Druhá')?point(50.097,14.441):point(50.087,14.421)]});}return originalFetch(url,...args);};}

const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:5187');
  if(url.pathname==='/__qa/login'){const person=url.searchParams.get('user');if(!people[person]){res.writeHead(400);res.end();return;}res.writeHead(302,{'set-cookie':`qa-person=${person}; Path=/; SameSite=Lax`,location:'/'});res.end();return;}
  const person=people[(req.headers.cookie||'').match(/qa-person=(\w+)/)?.[1]],headers=new Headers(req.headers);
  headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
  if(person){headers.set('oai-authenticated-user-id',person.id);headers.set('oai-authenticated-user-email',person.email);}
  const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  const response=await (url.pathname.startsWith('/api/')?(apiQueue=apiQueue.catch(()=>{}).then(()=>worker.fetch(request,env,ctx))):worker.fetch(request,env,ctx));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('Preview error');}
});
server.listen(5187,'127.0.0.1',()=>console.log('Team preview: http://127.0.0.1:5187'));
