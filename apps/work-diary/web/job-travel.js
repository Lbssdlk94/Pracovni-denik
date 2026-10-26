export function travelMessage(job){
 const date=job.arrivalDate?.split('-').reverse().join('. ');
 return `Dobrý den, pracovník Dr. Závlaha je na cestě${job.address?' na adresu '+job.address:''}. Předpokládaný příjezd${date?' '+date:''} v ${job.arrivalTime}. Děkujeme.`;
}
export function travelSmsLink(number,text,device=globalThis.navigator){
 const phone=String(number||'').replace(/[\s()\-]/g,'');
 if(!/^\+?\d{6,15}$/.test(phone))return null;
 const ios=/iPhone|iPad|iPod/.test(device?.userAgent||'')||(device?.platform==='MacIntel'&&device?.maxTouchPoints>1);
 return 'sms:'+phone+(ios?'&':'?')+'body='+encodeURIComponent(text);
}
export function travelArrivalLabel(job){
 return job.status==='on_way'&&job.arrivalTime?'Předpokládaný příjezd '+job.arrivalTime+' · '+(job.arrivalDate||'').split('-').reverse().join('. '):'';
}
