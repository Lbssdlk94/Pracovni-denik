import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
try{
await import('../tests/workspace-gateway.test.js');
await import('../tests/workspace-policy.test.js');
await import('../tests/workspace-transfer.test.js');
await import('../tests/workspace-cutover.test.js');
await import('../tests/workspace-recovery.test.js');
await import('../tests/workspace-sync.test.js');
await import('../tests/workspace-client.test.js');
}catch(error){console.error(error);process.exit(1);}
