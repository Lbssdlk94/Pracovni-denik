import {readdir} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
for(const dir of ['apps/super-admin/worker','apps/super-admin/web','packages/platform','scripts'])for(const file of await readdir(dir))if(/\.[cm]?js$/.test(file)){const r=spawnSync(process.execPath,['--check',dir+'/'+file],{stdio:'inherit'});if(r.status)process.exit(r.status);}
console.log('Platform source syntax passed.');
