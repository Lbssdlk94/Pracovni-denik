export function financeCsv(records){
 const clean=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s)&&typeof value!=='number')s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const lines=[['Datum','Stav','Druh','Částka Kč','Kategorie','Název','Protistrana','Reference','Zakázka','Obor','ID']];
 for(const r of records)lines.push([r.date,r.status==='paid'?'Zaplaceno':'Očekáváno',r.direction==='income'?'Příjem':'Výdaj',(r.amountMinor/100).toFixed(2).replace('.',','),r.category,r.title,r.counterparty||r.supplier||'',r.reference||'',r.jobTitle,r.discipline,r.id]);
 return '\ufeff'+lines.map(row=>row.map(clean).join(';')).join('\r\n');
}
const financeCrcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const financeCrc=bytes=>{let c=0xffffffff;for(const b of bytes)c=financeCrcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
export function financeZip(files){
 const enc=new TextEncoder(),parts=[],central=[];let offset=0,total=0;const names=new Set();
 if(files.length>200)throw Error('Export obsahuje příliš mnoho dokladů. Zvolte menší rozsah.');
 for(const file of files){const name=String(file.name).replaceAll('\\','/');if(!name||name.startsWith('/')||name.split('/').some(p=>p==='..'||p==='')||names.has(name))throw Error('Neplatný nebo duplicitní název souboru.');names.add(name);const n=enc.encode(name),data=typeof file.data==='string'?enc.encode(file.data):new Uint8Array(file.data);total+=data.length;if(total>40*1024*1024)throw Error('Doklady přesahují 40 MB. Stáhněte CSV a doklady jednotlivě.');
  const crc=financeCrc(data),local=new Uint8Array(30+n.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);local.set(n,30);
  const c=new Uint8Array(46+n.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);parts.push(local,data);central.push(c);offset+=local.length+data.length;
 }
 const size=central.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});
}
