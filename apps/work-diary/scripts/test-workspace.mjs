import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
await import('../tests/workspace-gateway.test.js');
await import('../tests/workspace-policy.test.js');
await import('../tests/workspace-transfer.test.js');
await import('../tests/workspace-recovery.test.js');
