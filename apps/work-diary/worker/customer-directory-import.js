// A short-lived capability for one exact, externally reviewed replacement plan.
// Requests cannot choose new data: each chunk and the final archive step must
// match hashes provisioned in the runtime secret. No hard deletes are performed.
export async function handleCustomerDirectoryImport(request,env,h){
 const {fail,json,body,accessHash}=h;
 if(request.method!=='POST'||!env.APPROVED_CUSTOMER_DIRECTORY_IMPORT)fail(404,'Nenalezeno.');
 let plan;try{plan=JSON.parse(env.APPROVED_CUSTOMER_DIRECTORY_IMPORT);}catch{fail(503,'Import není připraven.');}
 const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1],hash=token?await accessHash(token):'';
 let different=hash.length^String(plan.tokenHash).length;for(let i=0;i<64;i++)different|=(hash.charCodeAt(i)||0)^(String(plan.tokenHash).charCodeAt(i)||0);
 if(!token||different||!Number.isSafeInteger(plan.expiresAt)||Date.now()>plan.expiresAt)fail(401,'Import není autorizovaný nebo vypršel.');
 if(!/^[-\w]{1,100}$/.test(plan.id)||!Array.isArray(plan.chunks)||plan.chunks.length>50||!plan.chunks.length)fail(503,'Neplatný schválený plán.');
 const actor=await env.DB.prepare("SELECT user_id FROM members WHERE email=? AND role='owner'").bind(String(env.TEAM_OWNER_EMAIL).toLowerCase()).first();
 if(!actor)fail(403,'Vlastník týmu není dostupný.');
 const b=await body(request,512000),final=b.finalize===true,index=final?plan.chunks.length:b.index;
 if(!Number.isSafeInteger(index)||index<0||index>plan.chunks.length||!final&&index===plan.chunks.length)fail(400,'Neplatná část importu.');
 const payload=final?b.finalizePlan:b.records,digest=await accessHash(JSON.stringify(payload));
 if(digest!==(final?plan.finalizeHash:plan.chunks[index]))fail(403,'Obsah neodpovídá schválené části importu.');
 const receipt=await env.DB.prepare('SELECT result,digest FROM customer_directory_import_chunks WHERE import_id=? AND chunk_index=?').bind(plan.id,index).first();
 if(receipt){if(receipt.digest!==digest)fail(409,'Část byla uložena s jiným obsahem.');return json({...JSON.parse(receipt.result),replayed:true});}
 const now=Date.now();
 await env.DB.prepare("INSERT OR IGNORE INTO customer_directory_imports(id,source_digest,actor_id,created_at,status) VALUES(?,?,?,?,'running')").bind(plan.id,plan.sourceDigest,actor.user_id,now).run();
 const run=await env.DB.prepare('SELECT * FROM customer_directory_imports WHERE id=?').bind(plan.id).first();
 if(run.source_digest!==plan.sourceDigest||run.actor_id!==actor.user_id||run.status!=='running')fail(409,'Plán už není rozpracovaný.');
 const statements=[],guardPrefix=plan.id+':'+index+':';
 const assertion=(id,condition,args=[])=>env.DB.prepare('INSERT INTO customer_directory_import_assertions(id,valid) SELECT ?,CASE WHEN '+condition+' THEN 1 ELSE 0 END').bind(guardPrefix+id,...args);
 statements.push(assertion('owner',"EXISTS(SELECT 1 FROM members WHERE user_id=? AND email=? AND role='owner')",[actor.user_id,String(env.TEAM_OWNER_EMAIL).toLowerCase()]));
 let result;
 if(final){
  if(!payload||!Array.isArray(payload.archive)||payload.archive.length>250||!Array.isArray(payload.activeIds)||payload.activeIds.length>250)fail(400,'Neplatné dokončení importu.');
  const completed=await env.DB.prepare('SELECT count(*) n FROM customer_directory_import_chunks WHERE import_id=? AND chunk_index<?').bind(plan.id,plan.chunks.length).first();
  if(completed.n!==plan.chunks.length)fail(409,'Nejdříve dokončete všechny části importu.');
  const allIds=JSON.stringify([...payload.activeIds,...payload.archive.map(v=>v.id)]);
  statements.push(assertion('directory',"NOT EXISTS(SELECT 1 FROM customers WHERE deleted=0 AND directory_archived=0 AND id NOT IN (SELECT value FROM json_each(?))) AND (SELECT count(*) FROM customers WHERE deleted=0 AND directory_archived=0 AND id IN (SELECT value FROM json_each(?)))=?",[allIds,JSON.stringify(payload.activeIds),payload.activeIds.length]));
  for(const item of payload.archive){
   statements.push(assertion(item.id,'EXISTS(SELECT 1 FROM customers WHERE id=? AND version=? AND deleted=0)',[item.id,item.version]));
   statements.push(env.DB.prepare("INSERT INTO customer_directory_import_events(id,import_id,customer_id,action,before_data,after_data,actor_id,at) SELECT ?,?,id,'archived',json_object('name',name,'email',email,'phones',phones,'addresses',addresses,'billing',billing,'contactNotes',contact_notes,'version',version,'archived',directory_archived),json_object('archived',1),?,? FROM customers WHERE id=?").bind(guardPrefix+item.id,plan.id,actor.user_id,now,item.id));
   statements.push(env.DB.prepare('UPDATE customers SET directory_archived=1,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?').bind(actor.user_id,now,item.id,item.version));
  }
  statements.push(env.DB.prepare("UPDATE customer_directory_imports SET status='done' WHERE id=?").bind(plan.id));
  result={ok:true,done:true,activeContacts:payload.activeIds.length,archived:payload.archive.length};
 }else{
  if(!Array.isArray(payload)||!payload.length||payload.length>5)fail(400,'Jedna část obsahuje nejvýše pět kontaktů.');
  for(const record of payload){
   h.validId(record.id);if(!Number.isSafeInteger(record.expectedVersion)||record.expectedVersion<0)fail(400,'Neplatná verze kontaktu.');if(typeof record.name!=='string'||!record.name.trim()||record.name.length>160||!Array.isArray(record.addresses)||record.addresses.length>20||!Array.isArray(record.phones)||record.phones.length>20||!Array.isArray(record.contacts)||record.contacts.length>20||!Array.isArray(record.disciplines)||record.disciplines.some(v=>!['irrigation','garden'].includes(v))||!['customer','supplier','both'].includes(record.contactKind)||!/^mwork:[-\w]{1,100}$/.test(record.sourceRef))fail(400,'Neplatný profil v plánu.');
   const existing=record.expectedVersion!==0;
   statements.push(assertion(record.id,existing?'EXISTS(SELECT 1 FROM customers WHERE id=? AND version=? AND deleted=0)':'NOT EXISTS(SELECT 1 FROM customers WHERE id=?)',existing?[record.id,record.expectedVersion]:[record.id]));
   if(existing)statements.push(env.DB.prepare("INSERT INTO customer_directory_import_events(id,import_id,customer_id,action,before_data,after_data,actor_id,at) SELECT ?,?,id,'updated',json_object('name',name,'email',email,'phones',phones,'addresses',addresses,'billing',billing,'contactNotes',contact_notes,'version',version,'contactKind',contact_kind,'contacts',contacts,'sourceRef',source_ref,'archived',directory_archived),?,?,? FROM customers WHERE id=?").bind(guardPrefix+record.id,plan.id,JSON.stringify(record),actor.user_id,now,record.id));
   else statements.push(env.DB.prepare("INSERT INTO customer_directory_import_events(id,import_id,customer_id,action,after_data,actor_id,at) VALUES(?,?,?,'created',?,?,?)").bind(guardPrefix+record.id,plan.id,record.id,JSON.stringify(record),actor.user_id,now));
   const values=[record.name,record.email||'',JSON.stringify(record.phones),JSON.stringify(record.addresses),JSON.stringify(record.billing||{}),record.contactKind,JSON.stringify(record.contacts),record.sourceRef,record.archived?1:0,JSON.stringify(record.importDetails||{})];
   if(existing)statements.push(env.DB.prepare('UPDATE customers SET name=?,email=?,phones=?,addresses=?,billing=?,contact_kind=?,contacts=?,source_ref=?,directory_archived=?,import_details=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(...values,now,actor.user_id,record.id,record.expectedVersion));
   else statements.push(env.DB.prepare('INSERT INTO customers(id,name,email,phones,addresses,billing,contact_kind,contacts,source_ref,directory_archived,import_details,version,created_at,updated_at,created_by,updated_by,deleted,irrigation_origin) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,0,\'unknown\')').bind(record.id,...values,now,now,actor.user_id,actor.user_id));
   // Never remove a discipline needed by existing jobs or their documents.
   statements.push(env.DB.prepare('DELETE FROM customer_disciplines WHERE customer_id=? AND discipline NOT IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.customer_id=? AND j.deleted=0 AND j.discipline=customer_disciplines.discipline)').bind(record.id,JSON.stringify(record.disciplines),record.id));
   for(const discipline of record.disciplines)statements.push(env.DB.prepare('INSERT OR IGNORE INTO customer_disciplines(customer_id,discipline) VALUES(?,?)').bind(record.id,discipline));
   statements.push(env.DB.prepare("INSERT INTO workspace_entity_versions(entity,entity_id,version) VALUES('customer',?,1) ON CONFLICT(entity,entity_id) DO UPDATE SET version=version+1").bind(record.id));
  }
  result={ok:true,done:false,index,processed:payload.length};
 }
 statements.push(env.DB.prepare('UPDATE workspaces SET authorization_revision=authorization_revision+1'));
 statements.push(env.DB.prepare('INSERT INTO customer_directory_import_chunks(import_id,chunk_index,digest,result,created_at) VALUES(?,?,?,?,?)').bind(plan.id,index,digest,JSON.stringify(result),now));
 statements.push(env.DB.prepare('DELETE FROM customer_directory_import_assertions WHERE substr(id,1,?)=?').bind(guardPrefix.length,guardPrefix));
 try{await env.DB.batch(statements);}catch(error){
  const replay=await env.DB.prepare('SELECT result FROM customer_directory_import_chunks WHERE import_id=? AND chunk_index=? AND digest=?').bind(plan.id,index,digest).first();if(replay)return json({...JSON.parse(replay.result),replayed:true});
  fail(409,'Adresář se mezitím změnil. Tato část se neuložila; obnovte plán.');
 }
 return json(result);
}
