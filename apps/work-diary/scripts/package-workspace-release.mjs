// A Worker bundle alone is not enough: Sites reads pending D1 migrations from
// the archive ROOT. Keep the tested build and its migration inputs together.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const destination=process.argv[2];
if(!destination||!isAbsolute(destination))throw Error('Supply an absolute output archive path.');
const hosting=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
if(!hosting.project_id||!hosting.d1)throw Error('A bound Site/D1 manifest is required.');
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
if(JSON.stringify(journal)!==JSON.stringify(JSON.parse(readFileSync('dist/drizzle/meta/_journal.json','utf8'))))throw Error('Rebuild after changing migrations.');
for(const entry of journal.entries)for(const path of ['drizzle/'+entry.tag+'.sql','dist/drizzle/'+entry.tag+'.sql'])if(!existsSync(path))throw Error('Missing migration: '+path);
if(!existsSync('dist/server/index.js')||!existsSync('db/schema.js'))throw Error('Missing Worker build or schema.');
const result=spawnSync('tar',['-czf',destination,'.openai/hosting.json','dist','drizzle','db'],{stdio:'inherit'});if(result.status)process.exit(result.status||1);
const listed=spawnSync('tar',['-tzf',destination],{encoding:'utf8'});if(listed.status)throw Error('Cannot inspect packaged release.');
const names=new Set(listed.stdout.split('\n'));
for(const path of ['.openai/hosting.json','dist/server/index.js','drizzle/meta/_journal.json','db/schema.js'])if(!names.has(path))throw Error('Required ROOT archive path is missing: '+path);
console.log(JSON.stringify({archive:resolve(destination),projectId:hosting.project_id,migrations:journal.entries.length,sha256:createHash('sha256').update(readFileSync(destination)).digest('hex')}));
