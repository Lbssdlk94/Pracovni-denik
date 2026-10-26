import {spawnSync} from 'node:child_process';
const steps=[['npm',['run','check']],['npm',['test']],['npm',['run','build']],['npm',['run','test:operations-worker']],['npm',['run','test:planning-worker']],['npm',['run','test:administrator-worker']]];
for(const [cmd,args]of steps){const result=spawnSync(cmd,args,{stdio:'inherit',shell:false});if(result.status!==0)process.exit(result.status||1);}
