// Visual release regression uses isolated SQLite/R2 only, never a live Site.
import {spawn} from 'node:child_process';
const suites=process.argv.slice(2).length?process.argv.slice(2):['mobile-workspace','desktop-planning','materials','service-protocol','workspace','identity-b-visual'];
for(const suite of suites){
 const server=spawn(process.execPath,['scripts/preview-team.mjs'],{stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.stderr.on('data',data=>{if(/Error|EADDRINUSE/.test(String(data)))reject(Error(String(data)));});server.once('exit',code=>reject(Error('QA server exited '+code)));});
  console.log('CHECK '+suite);
  const code=await new Promise(resolve=>{const child=spawn(process.execPath,['tests/'+suite+'-browser.cjs'],{stdio:'inherit'});child.on('exit',resolve);});
  if(code)process.exitCode=code;
 }finally{server.kill('SIGTERM');if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>server.once('exit',resolve));}
 if(process.exitCode)break;
}
