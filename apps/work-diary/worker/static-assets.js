// Only build-time public application files use HTTP validators. API responses,
// private photos, PDFs and offline user data never pass through this handler.
export function staticAssetResponse(request,asset){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
 const headers=new Headers({'content-type':asset.type,'cache-control':new URL(request.url).pathname==='/sw.js'?'no-cache':'public, max-age=0, must-revalidate','x-content-type-options':'nosniff'});
 if(asset.etag){
  headers.set('etag',asset.etag);
  const matches=(request.headers.get('if-none-match')||'').split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\//,'')===asset.etag);
  if(matches)return new Response(null,{status:304,headers});
 }
 // HEAD and unchanged resources do not decode the embedded file at all.
 return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0)),{headers});
}
