// Audited scrypt implementation; OWASP's 32 MiB / r=8 / p=3 profile.
// Serialize KDFs within an isolate so concurrent logins cannot allocate several
// independent 32 MiB working buffers under Workers' shared 128 MiB ceiling.
import {scryptAsync} from '@noble/hashes/scrypt.js';
const passwordEncoder=new TextEncoder();
let passwordTail=Promise.resolve(),passwordQueued=0;
const password64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const passwordBytes=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function passwordKDF(password,salt){
 if(passwordQueued>=4)throw Object.assign(Error('Přihlašování je vytížené. Zkuste to za chvíli.'),{status:503});
 passwordQueued++;const before=passwordTail;let release;passwordTail=new Promise(resolve=>{release=resolve;});await before;
 try{return await scryptAsync(passwordEncoder.encode(password),salt,{N:32768,r:8,p:3,dkLen:32,maxmem:40*1024*1024,asyncTick:8});}
 finally{passwordQueued--;release();}
}
export function localUsername(value){const name=typeof value==='string'?value.trim().toLowerCase():'';if(!/^[a-z0-9][a-z0-9._@+-]{2,63}$/.test(name))throw Error('Přihlašovací jméno musí mít 3–64 znaků bez mezer a diakritiky.');return name;}
export function localPassword(value){if(typeof value!=='string'||[...value].length<12||[...value].length>128||['123456789012','password1234','heslo12345678'].includes(value.toLowerCase()))throw Error('Použijte heslo dlouhé 12–128 znaků, které není běžné nebo snadno odhadnutelné.');return value;}
export function temporaryPassword(){return password64(crypto.getRandomValues(new Uint8Array(18)));}
export async function hashLocalPassword(password){localPassword(password);const salt=crypto.getRandomValues(new Uint8Array(24)),hash=await passwordKDF(password,salt);return 'scrypt-v1$'+password64(salt)+'$'+password64(hash);}
export async function verifyLocalPassword(password,stored){
 if(typeof password!=='string'||[...password].length>128)return false;
 let salt=new Uint8Array(24),expected=new Uint8Array(32),valid=false;
 if(typeof stored==='string'&&/^scrypt-v1\$[A-Za-z0-9_-]{32}\$[A-Za-z0-9_-]{43}$/.test(stored)){const parts=stored.split('$');salt=passwordBytes(parts[1]);expected=passwordBytes(parts[2]);valid=true;}
 const actual=await passwordKDF(password,salt);let delta=0;for(let i=0;i<32;i++)delta|=actual[i]^expected[i];return valid&&delta===0;
}
