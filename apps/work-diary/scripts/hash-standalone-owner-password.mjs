import {hashLocalPassword} from '../worker/password-crypto.js';

if(process.stdin.isTTY)throw Error('Předejte dočasné heslo přes standardní vstup.');
let password='';
process.stdin.setEncoding('utf8');
for await(const chunk of process.stdin)password+=chunk;
console.log(await hashLocalPassword(password.replace(/\r?\n$/,'')));
