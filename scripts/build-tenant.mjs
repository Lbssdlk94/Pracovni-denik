import {spawnSync} from 'node:child_process';
for(const args of [['scripts/build.mjs'],['scripts/validate-artifact.mjs','--allow-unbound']]){const r=spawnSync(process.execPath,args,{cwd:new URL('../apps/work-diary',import.meta.url),stdio:'inherit'});if(r.status)process.exit(r.status);}
