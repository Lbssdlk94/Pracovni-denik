import {workspaceWriteDiscipline,workspaceInitialStatements,workspaceGardenNotesStatement} from './workspace-resources.js';
// These are ordinary customers and gardens, linked by the existing customer_id.
// Stable companion IDs and one D1 batch prevent half-created pairs and duplicates.
export async function companionId(kind,id){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(kind+'|'+id));return 'auto_'+kind+'_'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
const pairManager="EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ('owner','administrator','admin'))";
const pairWriter="EXISTS(SELECT 1 FROM members WHERE user_id=? AND role IN ('owner','administrator','admin','worker'))";
export async function insertGardenWithCustomer(env,m,b,v,features,h){
 const {fail,validId,cleanText}=h,{id,name,address,notes,pumpType,now}=v,linked=b.customerId?validId(b.customerId):null,automatic=features.customers!==false&&features.gardens!==false;
 const sharedDescription=cleanText(b.sharedDescription||'',2000),discipline=workspaceWriteDiscipline(m,b,null,fail),storedNotes=m._workspace&&discipline==='garden'?'':notes,seeds=workspaceInitialStatements(env,m,'garden',id,discipline,now);
 if(m._workspace){if(discipline==='garden'&&pumpType)fail(403,'Údaje o čerpadle patří závlahám.');seeds.push(workspaceGardenNotesStatement(env,m,id,discipline,notes,'EXISTS(SELECT 1 FROM gardens WHERE id=? AND created_by=? AND created_at=?)',id,m.user_id,now));}
 if(linked&&m._workspace&&!await env.DB.prepare('SELECT 1 FROM customer_disciplines WHERE customer_id=? AND discipline=?').bind(linked,discipline).first())fail(400,'Zákazník nepatří do vybraného oboru. Nejprve mu příslušnost doplňte.');
 if(linked&&!automatic)fail(403,'Pro propojení zapněte zákazníky i zahrady.');if(linked&&!['owner','administrator','admin'].includes(m.role))fail(403,'Existujícího zákazníka vybírá správce.');
 const insert=(customerId,condition='',args=[])=>env.DB.prepare('INSERT OR IGNORE INTO gardens(id,name,address,notes,pump_type,customer_id,shared_description,version,created_at,updated_at,created_by,updated_by) SELECT ?,?,?,?,?,?,?,1,?,?,?,? WHERE '+pairWriter+condition).bind(id,name,address,storedNotes,pumpType,customerId,sharedDescription,now,now,m.user_id,m.user_id,m.user_id,...args);
 if(linked){if(!await env.DB.prepare('SELECT id FROM customers WHERE id=? AND deleted=0').bind(linked).first())fail(400,'Zákazník již není dostupný.');return (await env.DB.batch([insert(linked," AND EXISTS(SELECT 1 FROM customers WHERE id=? AND deleted=0) AND "+pairManager,[linked,m.user_id]),...seeds]))[0];}
 if(!automatic)return (await env.DB.batch([insert(null),...seeds]))[0];
 const customerId=await companionId('customer',id),customerName=cleanText(b.customerName||name,160,true),addresses=JSON.stringify(address?[{id:'garden-address',label:'Zahrada',address,city:''}]:[]);
 const created=env.DB.prepare("INSERT OR IGNORE INTO customers(id,name,addresses,version,created_at,updated_at,created_by,updated_by) SELECT ?,?,?,1,?,?,?,? WHERE "+pairWriter+' AND NOT EXISTS(SELECT 1 FROM gardens WHERE id=?)').bind(customerId,customerName,addresses,now,now,m.user_id,m.user_id,m.user_id,id);
 const result=await env.DB.batch([created,insert(customerId,' AND changes()=1'),...workspaceInitialStatements(env,m,'customer',customerId,discipline,now),...seeds]);return result[1];
}
export async function insertCustomerWithGarden(env,m,b,v,features,h){
 const {id,name,email,billing,irrigationOrigin,phones,addresses,contacts='[]',contactKind='customer',contactNotes='',now}=v,{fail,validId,cleanText}=h,existing=b.gardenId?validId(b.gardenId):null,automatic=features.gardens!==false&&contactKind!=='supplier';
 if(existing&&!automatic)fail(403,'Zahrady jsou vypnuté.');let oldGarden=null;if(existing){oldGarden=await env.DB.prepare('SELECT * FROM gardens WHERE id=? AND deleted=0 AND customer_id IS NULL').bind(existing).first();if(!oldGarden)fail(409,'Vybraná zahrada již má zákazníka nebo není dostupná.');}
 const discipline=workspaceWriteDiscipline(m,b,null,fail);
 const gardenId=existing||await companionId('garden',id),first=JSON.parse(addresses)[0],gardenName=cleanText(b.gardenName||name.slice(0,100),100,true),gardenAddress=cleanText(first?[first.address,first.city].filter(Boolean).join(', '):'',500);
 const guard=!automatic?'':existing?' AND EXISTS(SELECT 1 FROM gardens WHERE id=? AND deleted=0 AND customer_id IS NULL AND version=?)':' AND NOT EXISTS(SELECT 1 FROM gardens WHERE id=?)';
 const primary=env.DB.prepare('INSERT OR IGNORE INTO customers(id,contacts,contact_kind,name,email,billing,irrigation_origin,phones,addresses,contact_notes,version,created_at,updated_at,created_by,updated_by) SELECT ?,?,?,?,?,?,?,?,?,?,1,?,?,?,? WHERE '+pairManager+guard).bind(id,contacts,contactKind,name,email,billing,irrigationOrigin,phones,addresses,contactNotes,now,now,m.user_id,m.user_id,m.user_id,...(!automatic?[]:existing?[existing,oldGarden.version]:[gardenId]));
 const statements=[primary];if(automatic)statements.push(existing?env.DB.prepare('UPDATE gardens SET customer_id=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND customer_id IS NULL AND deleted=0 AND version=? AND changes()=1').bind(id,now,m.user_id,existing,oldGarden.version):env.DB.prepare("INSERT INTO gardens(id,name,address,notes,customer_id,version,created_at,updated_at,created_by,updated_by) SELECT ?,?,?,'',?,1,?,?,?,? WHERE changes()=1").bind(gardenId,gardenName,gardenAddress,id,now,now,m.user_id,m.user_id));
 statements.push(...workspaceInitialStatements(env,m,'customer',id,discipline,now));if(automatic&&!existing)statements.push(...workspaceInitialStatements(env,m,'garden',gardenId,discipline,now));
 if(m._workspace&&automatic&&!existing&&first)statements.push(env.DB.prepare('INSERT OR IGNORE INTO workspace_garden_addresses(garden_id,customer_id,customer_address_id,city) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM gardens WHERE id=? AND customer_id=? AND created_at=? AND created_by=?)').bind(gardenId,id,first.id,first.city||'',gardenId,id,now,m.user_id));
 return (await env.DB.batch(statements))[0];
}
