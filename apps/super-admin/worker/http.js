export class PlatformError extends Error{constructor(status,message,code='request_error'){super(message);this.status=status;this.code=code;}}
export const fail=(status,message,code)=>{throw new PlatformError(status,message,code);};
export const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function body(request,max=32000){const reader=request.body?.getReader();if(!reader)return {};const chunks=[];let total=0;for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();fail(413,'Požadavek je příliš velký.');}chunks.push(value);}const data=new Uint8Array(total);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}try{const value=JSON.parse(new TextDecoder().decode(data));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{fail(400,'Neplatná data požadavku.');}}
export function csrf(request){if(['GET','HEAD'].includes(request.method))return;if(request.headers.get('x-platform-request')!=='1'||request.headers.has('origin')&&request.headers.get('origin')!==new URL(request.url).origin)fail(403,'Požadavek nebyl odeslán z administrace.');}
export const one=(db,sql,...values)=>db.prepare(sql).bind(...values).first();
export const all=(db,sql,...values)=>db.prepare(sql).bind(...values).all().then(r=>r.results);
export const run=(db,sql,...values)=>db.prepare(sql).bind(...values).run();
export const text=(value,max,label,required=true)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())fail(400,'Zkontrolujte '+label+'.');return value.trim();};
export const id=value=>{if(typeof value!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(value))fail(400,'Neplatný identifikátor.');return value;};
export const email=value=>{const v=text(value,254,'e-mail').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail(400,'Zadejte platný e-mail.');return v;};
export const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail(400,'Zkontrolujte '+label+'.');return value;};
export const date=(value,label)=>{if(value==='')return '';if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)fail(400,'Zkontrolujte '+label+'.');return value;};
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function known(value,keys){if(Object.keys(value).some(k=>!keys.includes(k)))fail(400,'Požadavek obsahuje nepodporované údaje.');}
