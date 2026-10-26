import {planTimeSummary} from './planning-model.js?v=workspace-roles-v1';
import {materialSummary,materialTotals,materialMoney} from './material-model.js?v=workspace-roles-v1';
// PDF is generated on the device. Private records and photos never leave the app
// for an external document converter. Originals are not modified.
import './jspdf.umd.min.js?v=4.2.1';
let fontPromise;
const labels={planned:'Naplánováno',on_way:'Na cestě',in_progress:'Probíhá',done:'Dokončeno',incomplete:'Nedokončeno'};
const date=value=>value?new Date(value+'T12:00:00Z').toLocaleDateString('cs-CZ',{timeZone:'Europe/Prague'}):'Neuvedeno';
const safeText=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
function billingText(b={}){return [b.name,b.address,b.companyId?'IČ: '+b.companyId:'',b.taxId?'DIČ: '+b.taxId:'',b.email,b.phone,b.bankAccount?'Účet: '+b.bankAccount:''].filter(Boolean).join('\n');}
export function protocolFilename(job,report){
 const name=(job.customerName||job.title||'zakazka').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'zakazka';
 return `Servisni-protokol-${name}-${report.date||'bez-data'}-${job.id.slice(0,8)}.pdf`;
}
async function font(){
 if(!fontPromise)fontPromise=fetch('./protocol-font.ttf?v=workspace-roles-v1').then(async r=>{if(!r.ok)throw Error('Nepodařilo se načíst písmo PDF. Připojte se k internetu a zkuste to znovu.');const bytes=new Uint8Array(await r.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}).catch(e=>{fontPromise=null;throw e;});
 return fontPromise;
}
async function readPhoto(blob,signal){
 signal?.throwIfAborted();const url=URL.createObjectURL(blob),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('unsupported_image'));img.src=url;});signal?.throwIfAborted();
  if(!img.naturalWidth||!img.naturalHeight)throw Error('unsupported_image');
  const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const result={data:canvas.toDataURL('image/jpeg',.88),width:canvas.width,height:canvas.height};canvas.width=canvas.height=1;return result;
 }finally{img.src='';URL.revokeObjectURL(url);}
}
export async function createServiceProtocolPDF(entry,{signal,onProgress=()=>{},loadPhoto}={}){
 const snapshot=entry.snapshot;if(!snapshot)throw Error('Nejdříve ověřte přístup k zakázce s internetem.');
 const j=snapshot.job,r=entry.pending?entry.payload?.report:snapshot.report;
 if(!r)throw Error('Nejdříve uložte servisní protokol.');
 const embeddedFont=await font();signal?.throwIfAborted();
 const doc=new globalThis.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
 doc.addFileToVFS('protocol.ttf',embeddedFont);doc.addFont('protocol.ttf','Protocol','normal');doc.setFont('Protocol');
 doc.setProperties({title:'Servisní protokol – '+safeText(j.customerName||j.title),author:'Dr. Závlaha',subject:'Servis závlahy – '+j.id,creator:'Závlahový deník'});
 const left=17,width=176,bottom=274;let y=20;
 const newPage=()=>{doc.addPage();y=20;};
 function text(value,size=10,color=[40,59,50]){
  doc.setFontSize(size);doc.setTextColor(...color);const lines=doc.splitTextToSize(safeText(value),width),height=size*.3528*1.4;
  for(const line of lines){if(y+height>bottom)newPage();doc.text(line,left,y);y+=height;}
 }
 function section(label,value){if(!value?.trim())return;if(y+20>bottom)newPage();y+=4;text(label,12);y+=1;text(value);}
 text('Dr. Závlaha · Závlahový deník',10);y+=4;text('SERVISNÍ PROTOKOL',21);y+=3;
 text('Zakázka: '+j.title,13);text('ID zakázky: '+j.id,8);y+=3;
 const billing=r.billingDetails||snapshot.billingPreview;if(billing){section('Dodavatel',billingText(billing.company));section('Odběratel',billingText(billing.customer));y+=3;}
 text('Zákazník: '+(j.customerName||'Neuveden'));text('Adresa realizace: '+([j.address,j.city&&!(j.address||'').includes(j.city)?j.city:''].filter(Boolean).join(', ')||'Neuvedena'));
 if(j.gardenName)text('Zahrada: '+j.gardenName);
 text('Datum provedení: '+date(r.date));text('Stav zakázky: '+(labels[j.status]||j.status));
 if(j.status==='on_way'&&j.arrivalTime)text('Předpokládaný příjezd: '+date(j.arrivalDate)+' · '+j.arrivalTime);
 if(j.dueDate)text('Termín návštěvy: '+date(j.dueDate));
 if(j.plannedStart||j.startTime||j.arrivalWindowStart)text(planTimeSummary(j));
 if(j.assignedNames?.length)text('Přiřazení pracovníci: '+j.assignedNames.join(', '));
 if(r.authorName&&!entry.pending)text('Zapsal: '+r.authorName);
 if(entry.unsaved){y+=4;text('NEULOŽENÝ NÁHLED',11,[158,72,33]);text('Náhled obsahuje změny formuláře, které ještě nebyly uloženy.',9);}
 else if(entry.pending){y+=4;text('NESYNCHRONIZOVANÝ PRACOVNÍ ZÁPIS',11,[158,72,33]);text('Tato kopie obsahuje místní změny. Po připojení ověřte jejich uložení a vytvořte aktuální PDF.',9);}
 else if(j.status!=='done'){y+=4;text(j.cancelled?'STORNOVANÁ ZAKÁZKA':'ROZPRACOVANÝ PROTOKOL',11,[158,72,33]);}
 section('Provedené práce',r.work||'Popis provedených prací nebyl vyplněn.');
 for(const [label,key]of [['Použitý materiál','material'],['Zjištěné závady','defects'],['Poznámka','notes'],['Doporučení pro další návštěvu','recommendations']])section(label,r[key]);
 if(r.materialItems?.length){section('Materiál z katalogu',r.materialItems.map(materialSummary).join('\n'));for(const total of materialTotals(r.materialItems))section('Celkem materiál',materialMoney(total.amount,total.currency));}
 if(r.workCharges){const c=r.workCharges;section('Práce',`${new Intl.NumberFormat('cs-CZ').format(c.hours)} h → ${c.hourUnits} započatých hodin × ${materialMoney(c.hourlyMinor)} = ${materialMoney(c.labourMinor)}`);section('Cesta',`${new Intl.NumberFormat('cs-CZ').format(c.kilometers)} km → ${c.travelUnits} započatých bloků po 30 km × ${materialMoney(c.travelRateMinor)} = ${materialMoney(c.travelMinor)}`);section('Celkem práce a cesta',materialMoney(c.totalMinor));const total=materialTotals(r.materialItems||[]);const czk=total.find(t=>t.currency==='CZK');section('Celkem výkaz (Kč)',materialMoney(c.totalMinor+(czk?.amount||0)));for(const t of total.filter(t=>t.currency!=='CZK'))section('Další měna – samostatně',materialMoney(t.amount,t.currency));}
 text('Servisní výkaz není daňový doklad.',8,[99,111,104]);
 if(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.customerSignature||'')){if(y+42>bottom)newPage();y+=4;text('Podpis zákazníka',12);y+=2;doc.addImage(r.customerSignature,'PNG',left,y,68,22);y+=26;text('Zákazník podpisem potvrzuje provedení práce uvedené v tomto protokolu.',8,[99,111,104]);}
 const ids=[...new Set(r.photoIds||[])],warnings=[];
 if(ids.length){newPage();text('FOTODOKUMENTACE',17);y+=4;}
 for(let i=0;i<ids.length;i++){
  signal?.throwIfAborted();onProgress(`Připravuji fotografii ${i+1} z ${ids.length}…`);
  const id=ids[i],local=(entry.photos||[]).find(p=>p.id===id),remote=(snapshot.photos||[]).find(p=>p.id===id),name=local?.file.name||remote?.name||'Fotografie '+(i+1);
  const blob=local?.file||await loadPhoto(id,remote);
  let img;try{img=await readPhoto(blob,signal);}catch(e){if(e.message!=='unsupported_image')throw e;warnings.push(name);section('Fotografie '+(i+1),name+' – tento formát se v prohlížeči nepodařilo zobrazit. Originál zůstává u zakázky.');continue;}
  const maxHeight=105,factor=Math.min(width/img.width,maxHeight/img.height),w=img.width*factor,h=img.height*factor;
  if(y+h+20>bottom)newPage();text('Fotografie '+(i+1)+' · '+name,9);y+=2;doc.addImage(img.data,'JPEG',left+(width-w)/2,y,w,h,undefined,'FAST');y+=h+10;
 }
 const count=doc.getNumberOfPages(),created=new Date().toLocaleString('cs-CZ',{timeZone:'Europe/Prague'});
 for(let p=1;p<=count;p++){doc.setPage(p);doc.setDrawColor(215,222,216);doc.line(left,282,left+width,282);doc.setFontSize(8);doc.setTextColor(99,111,104);doc.text(`Vytvořeno ${created} · ${entry.unsaved?'Neuložený náhled':entry.pending?'Místní návrh':'Verze '+(r.version||1)}`,left,287);doc.text(`${p} / ${count}`,left+width,287,{align:'right'});}
 signal?.throwIfAborted();return {blob:doc.output('blob'),filename:protocolFilename(j,r),warnings};
}
