// Apple provider-token auth. Keys are runtime secrets, never returned to clients.
const apnsEncoder=new TextEncoder();
let apnsCached=null;
const apns64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function apnsConfiguration(env){
 const required=['APNS_TEAM_ID','APNS_KEY_ID','APNS_PRIVATE_KEY','APNS_BUNDLE_ID'];
 const missing=required.filter(k=>!env[k]);
 const valid=!missing.length&&/^[A-Z0-9]{10}$/.test(env.APNS_TEAM_ID)&&/^[A-Z0-9]{10}$/.test(env.APNS_KEY_ID)&&/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(env.APNS_BUNDLE_ID)&&/^-----BEGIN PRIVATE KEY-----/.test(env.APNS_PRIVATE_KEY);
 return {configured:valid,missing,code:missing.length?'apns_not_configured':valid?'ready':'apns_configuration_invalid',topic:valid?env.APNS_BUNDLE_ID:null};
}
export async function apnsProviderToken(env,now=Date.now()){
 if(!apnsConfiguration(env).configured)throw Error('APNS_CONFIGURATION');
 const identity=[env.APNS_TEAM_ID,env.APNS_KEY_ID,env.APNS_PRIVATE_KEY].join('|');
 if(apnsCached?.identity===identity&&now-apnsCached.at<40*60000&&now>=apnsCached.at)return apnsCached.token;
 const raw=env.APNS_PRIVATE_KEY.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
 const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(raw),c=>c.charCodeAt(0)),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const input=apns64(apnsEncoder.encode(JSON.stringify({alg:'ES256',kid:env.APNS_KEY_ID})))+'.'+apns64(apnsEncoder.encode(JSON.stringify({iss:env.APNS_TEAM_ID,iat:Math.floor(now/1000)})));
 const token=input+'.'+apns64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,apnsEncoder.encode(input)));
 apnsCached={identity,at:now,token};return token;
}
export function apnsDeviceToken(token){if(typeof token!=='string'||!/^([a-fA-F0-9]{2}){16,256}$/.test(token))throw Error('APNS_DEVICE_TOKEN');return token.toLowerCase();}
export function apnsPayload(test=false){return {aps:{alert:{title:'Pracovní deník',body:test?'Zkušební oznámení funguje.':'Máte nové upozornění. Otevřete aplikaci.'},sound:'default','thread-id':'work-diary-inbox'},workDiaryInbox:1};}
export async function sendAPNs(device,env,{test=false}={}){
 if(device.native_topic!==env.APNS_BUNDLE_ID||!['development','production'].includes(device.native_environment))throw Error('APNS_DEVICE_CONFIGURATION');
 const token=apnsDeviceToken(device.native_token),host=device.native_environment==='development'?'api.sandbox.push.apple.com':'api.push.apple.com';
 const response=await fetch('https://'+host+'/3/device/'+token,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{authorization:'bearer '+await apnsProviderToken(env),'apns-topic':env.APNS_BUNDLE_ID,'apns-push-type':'alert','apns-priority':'10','apns-expiration':String(Math.floor(Date.now()/1000)+86400),'apns-collapse-id':'work-diary-inbox','content-type':'application/json'},body:JSON.stringify(apnsPayload(test))});
 let reason='';if(!response.ok){try{const reader=response.body?.getReader(),part=await reader?.read();await reader?.cancel();const value=JSON.parse(new TextDecoder().decode(part?.value?.slice(0,4096)));if(/^[A-Za-z]{1,80}$/.test(value.reason||''))reason=value.reason;}catch{}}
 else await response.body?.cancel();
 if(reason==='ExpiredProviderToken')apnsCached=null;
 return {status:response.status,reason,expired:response.status===410||response.status===400&&['BadDeviceToken','DeviceTokenNotForTopic'].includes(reason)};
}
