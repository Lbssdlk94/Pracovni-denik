import {parseInvoiceText} from './invoice-extract-model.js?v=invoice-read-v1';
export function invoicePageLayout(items){
 const tokens=items.filter(i=>typeof i.str==='string'&&i.str.trim()).map(i=>({text:i.str,x:i.transform[4],y:i.transform[5],width:i.width||0}));const rows=[];
 for(const t of [...tokens].sort((a,b)=>b.y-a.y||a.x-b.x)){let row=rows.find(r=>Math.abs(r.y-t.y)<3);if(!row){row={y:t.y,tokens:[]};rows.push(row);}row.tokens.push(t);}
 const text=rows.map(r=>r.tokens.sort((a,b)=>a.x-b.x).map(t=>t.text).join(' ')).join('\n');
 const roles={supplier:/^(?:dodavatel|supplier)\s*:/i,customer:/^(?:odb[eě]ratel|customer)\s*:/i},parties={};
 for(const [role,pattern] of Object.entries(roles)){const header=tokens.find(t=>pattern.test(t.text.trim()));if(!header)continue;const other=tokens.find(t=>roles[role==='supplier'?'customer':'supplier'].test(t.text.trim()));let left=header.x-8,right=Infinity,bottom=header.y-135;if(other&&Math.abs(other.y-header.y)<30){if(other.x>header.x)right=other.x-12;else left=(header.x+other.x+other.width)/2;}else if(other&&other.y<header.y)bottom=Math.max(bottom,other.y+5);
  const selected=tokens.filter(t=>t.x>=left&&t.x<right&&t.y<=header.y+3&&t.y>=bottom);parties[role]=rows.map(row=>row.tokens.filter(t=>selected.includes(t)).sort((a,b)=>a.x-b.x).map(t=>t===header?t.text.replace(pattern,'').trim():t.text).join(' ').trim()).filter(Boolean).join('\n');
 }
 return {text,parties};
}
export async function readInvoicePdf(file,{company={},signal,onProgress=()=>{}}={}){
 if(!file||file.size>4*1024*1024)throw Error('PDF může mít nejvýše 4 MB.');let task,document,ocr,renderTask;const controller=new AbortController();let timedOut=false;
 const stop=()=>{controller.abort();renderTask?.cancel();task?.destroy();ocr?.terminate();};signal?.addEventListener('abort',stop,{once:true});const timer=setTimeout(()=>{timedOut=true;stop();},120000);
 const check=()=>{if(controller.signal.aborted||signal?.aborted)throw Error(timedOut?'Čtení trvalo příliš dlouho. Údaje doplňte ručně.':'Čtení bylo zrušeno.');};
 try{check();onProgress('Otevírám PDF…');const pdf=await import('./invoice-pdf.js');check();pdf.GlobalWorkerOptions.workerSrc=new URL('./invoice-pdf-worker.js',import.meta.url).href;
  task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWasm:false,disableAutoFetch:true,verbosity:0});document=await task.promise;check();const parts=[],parties={},warnings=[];let scanned=0,partial=document.numPages>20;
  for(let p=1;p<=Math.min(document.numPages,20);p++){check();onProgress(`Čtu stránku ${p} z ${document.numPages}…`);const page=await document.getPage(p),content=await page.getTextContent(),layout=invoicePageLayout(content.items);check();
   if(layout.text.replace(/\s/g,'').length>=40){parts.push(layout.text);if(p===1)Object.assign(parties,layout.parties);}
   else{if(scanned>=3){partial=true;warnings.push('U naskenovaných PDF se rozpoznávají nejvýše tři stránky. Zbytek ověřte ručně.');continue;}scanned++;onProgress(`Rozpoznávám naskenovanou stránku ${p}…`);
    if(!ocr){const t=(await import('./invoice-tesseract.js')).default;check();ocr=await t.createWorker('ces',1,{workerPath:new URL('./invoice-tesseract-worker.js',import.meta.url).href,corePath:new URL('./tesseract-core-lstm.js',import.meta.url).href,langPath:new URL('./',import.meta.url).href,workerBlobURL:false,logger:()=>{}});check();}
    const natural=page.getViewport({scale:1}),scale=Math.min(2,1700/natural.width,Math.sqrt(2500000/(natural.width*natural.height))),viewport=page.getViewport({scale}),canvas=globalThis.document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    try{renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await renderTask.promise;check();const result=await ocr.recognize(canvas);check();parts.push(result.data.text);if(result.data.confidence<70)warnings.push('Sken má nízkou čitelnost. Zkontrolujte všechny rozpoznané údaje.');}finally{canvas.width=0;canvas.height=0;renderTask=null;}
   }page.cleanup();
  }
  const text=parts.join('\n');partial ||= text.length>100000;const result=parseInvoiceText(text,{company,parties,partial});return {...result,warnings:[...warnings,...result.warnings],method:scanned?'OCR':'PDF',pages:document.numPages};
 }catch(e){check();if(e.name==='PasswordException')throw Error('PDF je chráněné heslem. Přiložte odemčené PDF nebo doplňte údaje ručně.');throw e;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);await ocr?.terminate().catch(()=>{});await task?.destroy().catch(()=>{});}
}
