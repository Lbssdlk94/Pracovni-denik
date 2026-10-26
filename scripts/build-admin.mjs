import {createHash} from 'node:crypto';
import {build,transform} from 'esbuild';
import {readFile,writeFile,mkdir,readdir,rm,cp} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),web=path.join(root,'apps/super-admin/web');
await rm(path.join(root,'dist'),{recursive:true,force:true});await mkdir(path.join(root,'dist/server'),{recursive:true});await mkdir(path.join(root,'dist/.openai'),{recursive:true});
const browser=await build({entryPoints:[path.join(web,'admin.js')],bundle:true,write:false,format:'esm',target:'es2022',minify:true,keepNames:true}),assets={};
for(const file of await readdir(web)){if(file==='admin.js')continue;const b=await readFile(path.join(web,file));assets['/'+file]={data:b.toString('base64'),type:({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'};}
// Both environments use the very same visual foundations from the tenant template.
for(const file of ['design-tokens.css','work-diary-ui.css','approved-layout.css'])assets['/'+file]={data:(await readFile(path.join(root,'apps/work-diary/web',file))).toString('base64'),type:'text/css; charset=utf-8'};
assets['/work-diary-mark.svg']={data:(await readFile(path.join(root,'apps/work-diary/web/work-diary-mark.svg'))).toString('base64'),type:'image/svg+xml'};
assets['/admin.js']={data:Buffer.from(browser.outputFiles[0].contents).toString('base64'),type:'text/javascript; charset=utf-8'};
for(const asset of Object.values(assets)){
 if(asset.type.startsWith('text/css')){const result=await transform(Buffer.from(asset.data,'base64').toString('utf8'),{loader:'css',minify:true,target:'es2022'});asset.data=Buffer.from(result.code).toString('base64');}
 asset.etag='"'+createHash('sha256').update(Buffer.from(asset.data,'base64')).digest('hex')+'"';
}
await build({stdin:{contents:`import {staticAssetResponse} from './apps/work-diary/worker/static-assets.js';import {platformAPI} from './apps/super-admin/worker/api.js';const ASSETS=${JSON.stringify(assets)};export default {async fetch(request,env){let response;const url=new URL(request.url);if(url.pathname.startsWith('/api/'))response=await platformAPI(request,env);else if(!['GET','HEAD'].includes(request.method))response=new Response('Method not allowed',{status:405});else {const asset=ASSETS[url.pathname==='/'?'/index.html':url.pathname];response=asset?staticAssetResponse(request,asset):new Response('Not found',{status:404});}const safe=new Response(response.body,response);if(url.pathname.startsWith('/api/')||!safe.headers.has('cache-control'))safe.headers.set('cache-control','no-store');for(const [k,v] of Object.entries({'x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"}))safe.headers.set(k,v);return safe;}};`,resolveDir:root,sourcefile:'platform-entry.js'},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:path.join(root,'dist/server/index.js')});
await cp(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));await cp(path.join(root,'drizzle'),path.join(root,'dist/drizzle'),{recursive:true});console.log('Built isolated Super Admin Worker and metadata migrations.');
