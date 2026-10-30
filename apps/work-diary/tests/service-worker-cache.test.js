import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
test('Every statically imported offline module is cached under its exact query-version URL',()=>{
 const source=readFileSync('web/sw.js','utf8'),assets=new Set(JSON.parse(source.match(/const ASSETS=(\[[^\n]+\]);/)[1].replaceAll("'",'"')));
 const missing=[];
 for(const asset of assets){
  const path='web/'+asset.replace(/^\.\//,'').split('?')[0];assert.ok(existsSync(path),'Missing offline asset '+asset);
  if(!path.endsWith('.js')||/\/(?:leaflet|jspdf\.umd\.min)\.js$/.test(path))continue;
  for(const match of readFileSync(path,'utf8').matchAll(/\bfrom\s+['"]([^'"]+)['"]/g))if(match[1].startsWith('./')&&!assets.has(match[1]))missing.push({module:asset,dependency:match[1]});
 }
 assert.deepEqual(missing,[],'Offline imports must match the exact cached URL, including its version.');
 assert.ok(source.includes("pathname.startsWith('/api/')"),'API must not be served from the static offline cache');
});
