// Test-only provider simulator. No test identities, VAPID keys or fake provider in the deployed artifact.
import http from 'node:http';import worker from '../dist/server/index.js';import {environment,people} from '../tests/fixtures.mjs';import {pushBase64} from '../worker/web-push.js';
const env=environment(),key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',key.privateKey);
env.WEB_PUSH_PUBLIC_KEY=pushBase64(await crypto.subtle.exportKey('raw',key.publicKey));env.WEB_PUSH_PRIVATE_KEY=jwk.d;env.PUBLIC_APP_URL='https://preview.test';
let pushes=0;const providerFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(new URL(url).hostname==='web.push.apple.com'){if(options?.body?.byteLength<100)throw Error('Missing encrypted payload');pushes++;return new Response('',{status:201});}return providerFetch(url,options);};
const ctx={waitUntil:p=>p.catch(e=>console.error('Background error',e.message))};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:5188');if(url.pathname==='/__qa/pushes'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({pushes}));return;}
 if(url.pathname==='/__qa/login'){const person=url.searchParams.get('user');if(!people[person]){res.writeHead(400);res.end();return;}res.writeHead(302,{'set-cookie':`qa-person=${person}; Path=/; SameSite=Lax`,location:'/'});res.end();return;}
 const person=people[(req.headers.cookie||'').match(/qa-person=(\w+)/)?.[1]],headers=new Headers(req.headers);headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');if(person){headers.set('oai-authenticated-user-id',person.id);headers.set('oai-authenticated-user-email',person.email);}
 const chunks=[];for await(const c of req)chunks.push(c);const response=await worker.fetch(new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),env,ctx);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('Preview error');}});
server.listen(5188,'127.0.0.1',()=>console.log('Notification preview: http://127.0.0.1:5188'));
