// Persist bytes rather than File handles: WebKit may abort IndexedDB writes of Files.
const byteCache=new WeakMap();
export async function packLocalPhotos(photos=[]){return Promise.all(photos.map(async p=>{if(p.storage==='bytes-v1')return p;const file=p.file;if(!file)return p;let bytes=byteCache.get(file);if(!bytes){bytes=file.arrayBuffer();byteCache.set(file,bytes);}return {id:p.id,storage:'bytes-v1',name:file.name||'fotografie.jpg',type:file.type||'',lastModified:file.lastModified||0,bytes:await bytes};}));}
export function unpackLocalPhotos(photos=[]){return photos.map(p=>p.storage==='bytes-v1'?{id:p.id,file:new File([p.bytes],p.name,{type:p.type,lastModified:p.lastModified})}:p);}
