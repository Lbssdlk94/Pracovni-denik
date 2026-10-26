export function materialQuantity(value){
 if(!['number','string'].includes(typeof value))throw Error('Zadejte číselné množství.');
 const quantity=Number(String(value).replace(',','.'));
 if(!Number.isFinite(quantity)||quantity<=0||quantity>1000000||Math.abs(quantity*1000-Math.round(quantity*1000))>0.00001)throw Error('Množství musí být kladné číslo, nejvýše se třemi desetinnými místy.');
 return Math.round(quantity*1000)/1000;
}
export function materialLineTotal(line){return Math.round(line.priceMinor*Math.round(materialQuantity(line.quantity)*1000)/1000);}
export function materialTotals(lines=[]){
 const totals=new Map();for(const line of lines){const amount=materialLineTotal(line),sum=(totals.get(line.currency)||0)+amount;if(!Number.isSafeInteger(sum))throw Error('Celková cena materiálu je příliš vysoká.');totals.set(line.currency,sum);}
 return [...totals].map(([currency,amount])=>({currency,amount}));
}
export const materialMoney=(amount,currency='CZK')=>new Intl.NumberFormat('cs-CZ',{style:'currency',currency,maximumFractionDigits:2}).format(amount/100);
export function materialSummary(line){return `${line.name}${line.sku?' · '+line.sku:''} — ${new Intl.NumberFormat('cs-CZ').format(line.quantity)} ${line.unit} × ${materialMoney(line.priceMinor,line.currency)} = ${materialMoney(materialLineTotal(line),line.currency)}`;}

// A matching label/price is a review candidate, never proof of a duplicate.
export function materialReviewGroups(items=[]){
 const groups=new Map();for(const item of items){if(!item.active)continue;const key=JSON.stringify([item.name.normalize('NFC').trim().toLocaleLowerCase('cs'),item.priceMinor,item.currency,item.unit]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 return [...groups.values()].filter(rows=>rows.length>1);
}
export const materialChoiceLabel=(item,category='')=>[item.name,item.sku||'varianta / rozměr neuveden',category,'#'+item.id].filter(Boolean).join(' · ');
