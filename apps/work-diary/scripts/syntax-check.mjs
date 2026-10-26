import {readdirSync, statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const skip=new Set(['jspdf.umd.min.js','leaflet.js']);
const files=[];
for(const dir of ['web','worker','scripts']){
  for(const name of readdirSync(join(root,dir))){
    const path=join(root,dir,name);
    if(!statSync(path).isFile())continue;
    if(!/\.(mjs|js)$/.test(name)||skip.has(name))continue;
    files.push(path);
  }
}
let failed=0;
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status)failed++;
}
if(failed){
  console.error(`Syntax check failed in ${failed} file(s).`);
  process.exit(1);
}
