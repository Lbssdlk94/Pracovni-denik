// Small, document-local cache. No tokens, persistent storage or offline leases.
const clone=value=>structuredClone(value);
function ttlFor(path){const route=path.split('?')[0];if(route==='/api/jobs/people')return 60000;if(/^\/api\/jobs\/[-\w]+$/.test(route)&&!['/api/jobs/backlog','/api/jobs/planning-settings'].includes(route))return 30000;return 0;}
export function createScopedReadCache({send,scope,now=()=>Date.now(),limit=24}){
 const values=new Map(),flights=new Map();let generation=0,active=null;
 function invalidate(){generation++;values.clear();flights.clear();}
 function reconcile(){const next=scope();if(next!==active){invalidate();active=next;}return next;}
 function peek(path){if(!reconcile()||!ttlFor(path))return null;const entry=values.get(path);if(!entry||now()-entry.at>=ttlFor(path)){values.delete(path);return null;}return clone(entry.value);}
 async function request(path,options={}){
  const {forceNetwork=false,...rest}=options,who=reconcile(),method=(rest.method||'GET').toUpperCase();
  if(!who||method!=='GET'||!ttlFor(path)||rest.headers||rest.signal)return send(path,rest);
  if(!forceNetwork){const value=peek(path);if(value!==null)return value;}
  const ticket=generation,key=ticket+'|'+path;if(flights.has(key))return clone(await flights.get(key));
  const task=(async()=>{try{const value=await send(path,rest);if(ticket!==generation||who!==scope())throw Object.assign(Error('Údaje se mezitím změnily. Otevřete je znovu.'),{code:'read_invalidated'});if(JSON.stringify(value).length<=512000){values.delete(path);values.set(path,{at:now(),value:clone(value)});while(values.size>limit)values.delete(values.keys().next().value);}return value;}catch(error){if([401,403,404].includes(error.status))invalidate();throw error;}})();
  flights.set(key,task);try{return clone(await task);}finally{if(flights.get(key)===task)flights.delete(key);}
 }
 return {request,peek,invalidate};
}
