// Bound both the response headers and its body; a stalled download must not hold startup forever.
export async function readFromServer(path,options,read,timeoutMs=15000){
 const controller=new AbortController(),outer=options?.signal;
 let expired=false;const abort=()=>controller.abort(outer.reason);
 if(outer?.aborted)abort();else outer?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{expired=true;controller.abort();},timeoutMs);
 try{return await read(await fetch(path,{...options,signal:controller.signal}));}
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
