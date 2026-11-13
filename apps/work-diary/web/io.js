// Bound both the response headers and its body; a stalled download must not hold startup forever.
export async function readFromServer(path,options,read,timeoutMs=15000,recovery={}){
 const method=(options?.method||'GET').toUpperCase(),attempts=['GET','HEAD'].includes(method)?Math.min(1,recovery.retries||0):0;
 for(let attempt=0;;attempt++){
  try{return await serverAttempt(path,options,read,timeoutMs);}
  catch(error){
   if(attempt>=attempts||!transientConnectionError(error)||options?.signal?.aborted)throw error;
   await retryDelay(recovery.delayMs??(500+Math.random()*300),options?.signal);
  }
 }
}
export const transientConnectionError=error=>['connection_timeout','connection_failed'].includes(error?.code)||[429,500,502,503,504].includes(error?.status);
function retryDelay(ms,signal){return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason||new DOMException('Aborted','AbortError'));},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});}
async function serverAttempt(path,options,read,timeoutMs){
 const controller=new AbortController(),outer=options?.signal;
 let expired=false;const abort=()=>controller.abort(outer.reason);
 if(outer?.aborted)abort();else outer?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{expired=true;controller.abort();},timeoutMs);
 try{let response;try{response=await fetch(path,{...options,signal:controller.signal});}catch(error){if(error.name!=='AbortError'&&!outer?.aborted&&!expired)error.code='connection_failed';throw error;}return await read(response);}
 catch(error){if(expired){const failure=new Error('Načítání trvá příliš dlouho. Zkontrolujte připojení a zkuste to znovu.');failure.code='connection_timeout';throw failure;}throw error;}
 finally{clearTimeout(timer);outer?.removeEventListener('abort',abort);}
}
export function openLocalDatabase(name,version,upgrade){
 return new Promise((resolve,reject)=>{
  let settled=false,request;
  const fail=cause=>{if(settled)return;settled=true;clearTimeout(timer);const error=new Error(cause.message);error.code='local_storage';reject(error);};
  const timer=setTimeout(()=>fail(new Error('Úložiště v prohlížeči neodpovídá. Zavřete ostatní záložky aplikace a otevřete odkaz přímo v Safari nebo Chrome.')),12000);
  try{request=indexedDB.open(name,version);}catch(error){fail(error);return;}
  request.onupgradeneeded=()=>{if(settled){request.transaction.abort();return;}try{upgrade(request);}catch(error){request.transaction.abort();fail(error);}};
  request.onsuccess=()=>{if(settled){request.result.close();return;}settled=true;clearTimeout(timer);resolve(request.result);};
  request.onerror=()=>fail(new Error(request.error?.message||'Prohlížeč nepovolil úložiště. Otevřete odkaz přímo v Safari nebo Chrome.'));
  request.onblocked=()=>fail(new Error('Zavřete ostatní záložky aplikace a zkuste to znovu.'));
 });
}
export function finishLocalTransaction(tx,result){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{try{tx.abort();}catch{}const error=new Error('Úložiště v prohlížeči neodpovídá. Zavřete ostatní záložky a zkuste to znovu.');error.code='local_storage';reject(error);},12000);
  tx.oncomplete=()=>{clearTimeout(timer);resolve(result?.result);};
  tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(tx.error||new Error('Ukládání bylo přerušeno.'));};
 });
}
