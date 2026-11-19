// Complete, authorized directory snapshots. No mutations, photos or work history.
export const DIRECTORY_CACHE_KEY='directory-cache-v1';
const copy=value=>structuredClone(value),day=86400000,ttl=120000;
const fault=(message,code='directory_unavailable')=>Object.assign(Error(message),{code});
const base=()=>({records:[],gardens:[],services:[],serviceWork:[],defects:[]});
const fold=value=>String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('cs');
export function directoryPath(path){const u=new URL(path,'https://directory.invalid');return path.startsWith('/api/')&&u.origin==='https://directory.invalid'&&/^\/api\/(customers|gardens)(?:\/[-\w]{1,100})?$/.test(u.pathname)&&[...u.searchParams.keys()].every(k=>['q','cursor','discipline'].includes(k))?u:null;}
export function directoryResult(path,snapshot,{now=Date.now(),offline=false}={}){
 const u=directoryPath(path);if(!u)return null;const [, ,kind,id]=u.pathname.split('/'),p=u.searchParams;
 let rows=snapshot[kind]||[],discipline=p.get('discipline');
 if(discipline&&discipline!=='all')rows=rows.filter(r=>(r.disciplines||[]).includes(discipline));
 const meta={at:snapshot.at,offline,persistent:snapshot.persistent!==false,stale:now-snapshot.at>=ttl};
 if(id){const row=rows.find(r=>r.id===id);if(!row)throw Object.assign(fault('Záznam není v dostupném uloženém adresáři.'),{status:404});return kind==='gardens'?{garden:copy(row),_directoryCache:meta}:{customer:{...copy(row),gardens:copy((snapshot.gardens||[]).filter(g=>g.customerId===id))},_directoryCache:meta};}
 const q=fold(p.get('q')).trim();if(q)rows=rows.filter(r=>fold([r.name,r.email,r.address,...(r.phones||[]).map(v=>v.number),...(r.addresses||[]).flatMap(v=>[v.address,v.city])].join(' ')).includes(q));
 rows=[...rows].sort((a,b)=>fold(a.name).localeCompare(fold(b.name),'cs')||a.id.localeCompare(b.id));
 if(kind==='gardens')return {gardens:copy(rows),_directoryCache:meta};
 let offset=0;const cursor=p.get('cursor');if(cursor){const parts=cursor.split(':');if(parts.length!==3||parts[0]!=='directory'||Number(parts[1])!==snapshot.at||!/^\d+$/.test(parts[2]))throw fault('Adresář se změnil. Obnovte první stránku.','directory_cursor_changed');offset=Number(parts[2]);}
 return {customers:copy(rows.slice(offset,offset+100)),nextCursor:rows.length>offset+100?'directory:'+snapshot.at+':'+(offset+100):null,_directoryCache:meta};
}
export function createDirectoryCache({read,write,send,getSession,scope,online,now=()=>Date.now(),notify=()=>{}}){
 let generation=0,flight=null,active=null,ready=false,lastAttempt=-Infinity;
 const allowed=()=>{const s=getSession();return !!scope()&&s?.features?.offline!==false&&!s?.rolePreview?.selectedRole&&(!s?.license||s.license.active&&s.license.expiresAt>now());};
 const lease=s=>allowed()&&now()>=s.verifiedAt&&now()-s.verifiedAt<day;
 function reconcile(){const key=scope();if(key!==active){generation++;flight=null;ready=false;active=key;}return key;}
 function suspend(){generation++;flight=null;ready=false;}
 async function invalidate(){suspend();await write(null);}
 function check(ticket,key){if(ticket!==generation||key!==scope()||!allowed())throw fault('Účet nebo oprávnění se změnily.','directory_invalidated');}
 function verify(manifest,session,stamp){if(!manifest.completeForRequestedIds||!manifest.stamp||stamp&&stamp!==manifest.stamp||JSON.stringify([manifest.workspace?.workspaceId,manifest.workspace?.authorizationVersion,manifest.workspace?.role,manifest.workspace?.disciplines])!==JSON.stringify([session.workspace.workspaceId,session.workspace.authorizationVersion,session.user.role,session.workspace.disciplines]))throw fault('Oprávnění adresáře nebyla potvrzena.','directory_invalidated');if(manifest.features&&Object.entries(session.features||{}).some(([key,value])=>manifest.features[key]!==value))throw fault('Dostupné moduly se změnily.','directory_invalidated');}
 async function warm(force=false){
  const key=reconcile();if(!allowed())return null;
  const old=await read();if(!online())return old?.scope===key&&lease(getSession())&&now()-old.at<day?old:null;
  if(ready&&!force&&old?.scope===key&&(now()-old.at<ttl||now()-lastAttempt<30000))return old;
  if(flight)return flight;
  lastAttempt=now();const ticket=generation,session=copy(getSession());let oldAllowed=true;
  const task=(async()=>{try{
   check(ticket,key);let stamp='';
   if(session.workspace){const manifest=await send('/api/workspace/manifest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(base())});check(ticket,key);verify(manifest,session);stamp=manifest.stamp;if(old?.scope===key&&old.stamp!==stamp){oldAllowed=false;await write(null);check(ticket,key);}}
   const snapshot={scope:key,at:now(),stamp,customers:[],gardens:[]};
   if(session.features?.customers!==false){let cursor='',seen=new Set();for(let page=0;page<200;page++){
    const result=await send('/api/customers'+(cursor?'?cursor='+encodeURIComponent(cursor):''));check(ticket,key);
    if(!Array.isArray(result.customers))throw fault('Neúplný seznam zákazníků.');
    for(const row of result.customers){if(!row.id||seen.has(row.id))throw fault('Seznam zákazníků se během načítání změnil.');seen.add(row.id);snapshot.customers.push(row);}
    const next=result.nextCursor;if(!next)break;if(next===cursor||page===199)throw fault('Adresář nebyl načten celý.');cursor=next;
   }}
   if(session.features?.gardens!==false){const result=await send('/api/gardens');check(ticket,key);if(!Array.isArray(result.gardens)||new Set(result.gardens.map(g=>g.id)).size!==result.gardens.length)throw fault('Neúplný seznam zahrad.');snapshot.gardens=result.gardens;}
   if(session.workspace){const manifest=await send('/api/workspace/manifest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...base(),expectedStamp:stamp})});check(ticket,key);verify(manifest,session,stamp);}
   check(ticket,key);snapshot.at=now();try{await write(snapshot);ready=true;}catch{snapshot.persistent=false;ready=false;}check(ticket,key);notify({});return snapshot;
  }catch(error){check(ticket,key);if([401,403,404,409].includes(error.status)||error.code==='directory_invalidated'){await invalidate();notify({denied:true});throw error;}if(!oldAllowed){ready=false;notify({denied:true});}if(oldAllowed&&old?.scope===key&&lease(session)&&now()-old.at<day){ready=true;return old;}throw error;}})();
  flight=task;try{return await task;}finally{if(flight===task)flight=null;}
 }
 async function request(path,options={}){
  const u=directoryPath(path),method=(options.method||'GET').toUpperCase(),session=getSession();
  if(!u||method!=='GET'||options.headers||options.signal||!allowed())return send(path,options);
  const selected=session.workspace?.selectedDiscipline,requested=u.searchParams.get('discipline');if(requested&&selected&&selected!=='all'&&requested!==selected)return send(path,options);
  const kind=u.pathname.split('/')[2];if(session.features?.[kind]===false)throw Object.assign(fault('Tento modul je vypnutý.'),{status:403});
  // Server cursors from older screens must remain server cursors.
  if(u.searchParams.has('cursor')&&!u.searchParams.get('cursor').startsWith('directory:'))return send(path,options);
  const key=reconcile(),cached=await read();
  if(!options.forceNetwork&&ready&&cached?.scope===key&&lease(session)&&now()-cached.at<day){if(online()&&now()-cached.at>=ttl)warm().catch(()=>{});return directoryResult(path,cached,{now:now(),offline:!online()});}
  const snapshot=await warm(!!options.forceNetwork);if(!snapshot)throw fault('Uložený adresář není dostupný nebo vyžaduje nové ověření. Připojte se k internetu.');
  return directoryResult(path,snapshot,{now:now(),offline:!online()});
 }
 return {request,warm,invalidate,suspend};
}
