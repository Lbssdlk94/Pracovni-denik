// Minor-unit prices and integer thousandths keep rounding stable across devices.
export function chargeQuantity(value,max){
 if(!['string','number'].includes(typeof value)||String(value).trim()==='')throw Error('Zadejte počet hodin a kilometrů (případně 0).');
 const n=Number(String(value).replace(',','.'));
 if(!Number.isFinite(n)||n<0||n>max||Math.abs(n*1000-Math.round(n*1000))>0.00001)throw Error('Použijte nezáporné číslo nejvýše se třemi desetinnými místy.');
 return Math.round(n*1000)/1000;
}
export function workChargeTotals(input,rate){
 const hours=chargeQuantity(input.hours,10000),kilometers=chargeQuantity(input.kilometers,1000000),hourUnits=Math.ceil(Math.round(hours*1000)/1000),travelUnits=Math.ceil(Math.round(kilometers*1000)/30000);
 if(!rate||!Number.isSafeInteger(rate.hourlyMinor)||!Number.isSafeInteger(rate.travelMinor)||rate.hourlyMinor<0||rate.travelMinor<0||rate.hourlyMinor>100000000||rate.travelMinor>100000000||rate.currency!=='CZK')throw Error('Nejdříve uložte platné sazby v Kč.');
 const labourMinor=hourUnits*rate.hourlyMinor,travelMinor=travelUnits*rate.travelMinor,totalMinor=labourMinor+travelMinor;
 if(!Number.isSafeInteger(totalMinor))throw Error('Celková částka je příliš vysoká.');
 return {rateId:rate.id,hours,kilometers,hourUnits,travelUnits,hourlyMinor:rate.hourlyMinor,travelRateMinor:rate.travelMinor,currency:'CZK',labourMinor,travelMinor,totalMinor};
}
