import {validCoordinates} from './nearby.js?v=workspace-roles-v1';
function coordinates(text){
 const match=String(text||'').trim().match(/^([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)$/);
 const parts=match?match.slice(1):String(text||'').trim().split(/\s+/);
 if(parts.length!==2||parts.some(p=>!/^[-+]?\d+(?:[.,]\d+)?$/.test(p)))return null;
 const position={latitude:Number(parts[0].replace(',','.')),longitude:Number(parts[1].replace(',','.')),accuracy:null};
 return validCoordinates(position)?position:null;
}
export function parseMapPosition(value){
 const text=String(value||'').trim();if(!text||text.length>2000)throw new Error('Vložte odkaz z Apple Map se souřadnicemi nebo souřadnice bodu.');
 const direct=coordinates(text);if(direct)return direct;
 let url;try{url=new URL(text);}catch{throw new Error('Použijte souřadnice ve tvaru 50.087, 14.421 nebo odkaz z Apple Map.');}
 if(url.protocol!=='https:'||!['maps.apple.com','maps.apple'].includes(url.hostname)||url.username||url.password)throw new Error('Vložte odkaz z Apple Map nebo zeměpisné souřadnice.');
 for(const key of ['coordinate','ll','q','daddr']){const point=coordinates(url.searchParams.get(key));if(point)return point;}
 throw new Error('Odkaz neobsahuje souřadnice bodu. V Apple Mapách je zkopírujte z detailu špendlíku, nebo označte místo v mapě níže.');
}
export const appleMapLink=(position,name='Šachta')=>`https://maps.apple.com/?ll=${position.latitude},${position.longitude}&q=${encodeURIComponent(name||'Šachta')}`;

export function preferredMapProvider(device=globalThis.navigator){return /iPhone|iPad|iPod|Macintosh/i.test(device?.userAgent||'')?'apple':'google';}
export function addressNavigationLink(address,city='',provider=preferredMapProvider()){
 const destination=[address,city].map(v=>String(v||'').trim().replace(/\s+/g,' ')).filter(Boolean).join(', ');if(!destination)return null;
 return provider==='apple'?`https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
