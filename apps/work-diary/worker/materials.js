import {materialQuantity,materialTotals} from '../web/material-model.js';
const matOne=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const matAll=(db,sql,...args)=>db.prepare(sql).bind(...args).all().then(r=>r.results);
const matOwner="EXISTS(SELECT 1 FROM members WHERE user_id=? AND role='owner')";
export async function resolveMaterialLines(env,m,input,previous,fail){
 if(input===undefined)return previous;
 if(m.role!=='owner')fail(403,'Prototyp materiálu je dostupný jen vlastníkovi.');
 if(!Array.isArray(input)||input.length>100)fail(400,'Do protokolu vyberte nejvýše 100 položek materiálu.');
 const result=[],keys=new Set();
 for(const value of input){
  if(!value||typeof value.itemId!=='string'||!/^[-\w]{1,100}$/.test(value.itemId)||!Number.isSafeInteger(value.itemVersion)||value.itemVersion<1||keys.has(value.itemId))fail(400,'Vyberte platné a neopakující se položky materiálu.');keys.add(value.itemId);
  let quantity;try{quantity=materialQuantity(value.quantity);}catch(e){fail(400,e.message);}
  const frozen=previous.find(p=>p.itemId===value.itemId&&p.itemVersion===value.itemVersion);
  if(frozen){result.push({...frozen,quantity});continue;}
  const row=await matOne(env.DB,'SELECT r.snapshot,i.active,i.deleted,c.active category_active FROM material_item_revisions r JOIN material_items i ON i.id=r.item_id JOIN material_categories c ON c.id=i.category_id WHERE r.item_id=? AND r.item_version=?',value.itemId,value.itemVersion);
  if(!row||row.deleted||!row.active||!row.category_active)fail(409,'Některý vybraný materiál už není dostupný. Obnovte katalog a výběr upravte.',{code:'material_unavailable'});
  result.push({...JSON.parse(row.snapshot),quantity});
 }
 try{materialTotals(result);}catch(e){fail(400,e.message);}return result;
}
export async function handleMaterials(request,env,m,h){
 const {json,body,fail,cleanText,validId,expectedVersion}=h;
 if(m.role!=='owner')fail(403,'Prototyp materiálu je dostupný jen vlastníkovi.');
 const url=new URL(request.url),path=url.pathname,method=request.method;
 const categoryDTO=r=>({id:r.id,name:r.name,sortOrder:r.sort_order,active:!!r.active,version:r.version});
 const itemDTO=r=>({id:r.id,categoryId:r.category_id,name:r.name,sku:r.sku,unit:r.unit,priceMinor:r.price_minor,currency:r.currency,active:!!r.active,version:r.version});
 if(path==='/api/materials'&&method==='GET'){
  const after=url.searchParams.get('after')||'';if(after)validId(after);
  const rows=await matAll(env.DB,'SELECT * FROM material_items WHERE deleted=0 AND id>? ORDER BY id LIMIT 201',after);
  return json({categories:(await matAll(env.DB,'SELECT * FROM material_categories ORDER BY sort_order,name,id')).map(categoryDTO),items:rows.slice(0,200).map(itemDTO),nextCursor:rows.length>200?rows[199].id:null});
 }
 if(path==='/api/materials/preferred'&&method==='POST'){
  const b=await body(request,15000),primaryId=validId(b.primaryId);if(!Array.isArray(b.items)||b.items.length<2||b.items.length>50)fail(400,'Vyberte 2 až 50 položek ke kontrole.');
  const ids=new Set(),rows=[];for(const entry of b.items){const id=validId(entry.id),version=expectedVersion(entry.version);if(ids.has(id))fail(400,'Položky se nesmí opakovat.');ids.add(id);const row=await matOne(env.DB,'SELECT * FROM material_items WHERE id=? AND deleted=0 AND active=1',id);if(!row||row.version!==version)fail(409,'Katalog se změnil. Obnovte kontrolu položek.');rows.push(row);}
  if(!ids.has(primaryId))fail(400,'Vyberte hlavní položku z kontrolované skupiny.');const key=r=>JSON.stringify([r.name.normalize('NFC').trim().toLocaleLowerCase('cs'),r.price_minor,r.currency,r.unit]);if(rows.some(r=>key(r)!==key(rows[0])))fail(400,'Položky nemají shodný název, cenu, měnu a jednotku.');
  const condition=rows.map(()=>'(id=? AND version=? AND active=1 AND deleted=0)').join(' OR '),args=rows.flatMap(r=>[r.id,r.version]),placeholders=rows.map(()=>'?').join(',');
  // One compare-and-set updates the exact reviewed group, never historical snapshots.
  const r=await env.DB.prepare(`UPDATE material_items SET active=0,version=version+1,updated_at=?,updated_by=? WHERE id IN (${placeholders}) AND id<>? AND ${matOwner} AND (SELECT COUNT(*) FROM material_items WHERE ${condition})=?`).bind(Date.now(),m.user_id,...rows.map(r=>r.id),primaryId,m.user_id,...args,rows.length).run();
  if(r.meta.changes!==rows.length-1)fail(409,'Katalog nebo oprávnění se změnily. Obnovte kontrolu.');return json({ok:true,primaryId,hidden:rows.length-1});
 }
 const match=path.match(/^\/api\/materials\/(categories|items)\/([-\w]{1,100})$/);if(!match)fail(404,'Položka nebyla nalezena.');
 if(!['PUT','DELETE'].includes(method))fail(405,'Nepodporovaná operace.');
 const kind=match[1],id=validId(match[2]),table=kind==='categories'?'material_categories':'material_items',b=await body(request,10000),version=expectedVersion(b.version),old=await matOne(env.DB,'SELECT * FROM '+table+' WHERE id=?',id),now=Date.now();
 if(b.remove!==undefined&&typeof b.remove!=='boolean')fail(400,'Neplatné potvrzení smazání.');if(b.remove===true&&(kind!=='items'||method!=='DELETE'))fail(400,'Tímto způsobem lze smazat pouze materiál.');
 if(old?.deleted){if(method==='DELETE'&&b.remove===true&&version===old.version-1)return json({ok:true,deleted:true});fail(404,'Materiál byl smazán. Obnovte katalog.');}
 if((old?.version||0)!==version)fail(409,'Katalog byl mezitím změněn. Obnovte jej před další úpravou.');
 if(method==='DELETE'){
  if(!old)fail(404,'Položka nebyla nalezena.');const remove=kind==='items'&&b.remove===true;const r=await env.DB.prepare('UPDATE '+table+' SET active=0,'+(remove?'deleted=1,':'')+'version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND '+matOwner).bind(now,m.user_id,id,version,m.user_id).run();
  if(!r.meta.changes)fail(409,'Položka se změnila. Obnovte katalog.');return json({ok:true,...(remove?{deleted:true}:{})});
 }
 const name=cleanText(b.name,160,true);if(typeof b.active!=='boolean')fail(400,'Vyberte platný stav položky.');
 if(kind==='categories'){
  if(!Number.isSafeInteger(b.sortOrder)||Math.abs(b.sortOrder)>10000)fail(400,'Neplatné pořadí kategorie.');
  const r=await env.DB.prepare(`INSERT INTO material_categories(id,name,sort_order,active,version,created_at,updated_at,updated_by) SELECT ?,?,?,?,1,?,?,? WHERE ${matOwner} ON CONFLICT(id) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order,active=excluded.active,version=material_categories.version+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE material_categories.version=? AND ${matOwner}`).bind(id,name,b.sortOrder,Number(b.active),now,now,m.user_id,m.user_id,version,m.user_id).run();
  if(!r.meta.changes)fail(409,'Kategorie se změnila. Obnovte katalog.');return json({category:categoryDTO(await matOne(env.DB,'SELECT * FROM material_categories WHERE id=?',id))});
 }
 const categoryId=validId(b.categoryId),category=await matOne(env.DB,'SELECT * FROM material_categories WHERE id=?',categoryId),unit=cleanText(b.unit,20,true),sku=cleanText(b.sku||'',80),currency=cleanText(b.currency||'CZK',3,true).toUpperCase();
 if(!category?.active)fail(400,'Vyberte aktivní kategorii.');if(!Number.isSafeInteger(b.priceMinor)||b.priceMinor<0||b.priceMinor>100000000)fail(400,'Zadejte platnou jednotkovou cenu.');
 if(!/^[A-Z]{3}$/.test(currency))fail(400,'Zadejte třípísmennou měnu.');try{new Intl.NumberFormat('cs-CZ',{style:'currency',currency}).format(0);}catch{fail(400,'Neplatná měna.');}
 const snapshot={itemId:id,itemVersion:version+1,categoryId,name,sku,unit,priceMinor:b.priceMinor,currency};
 const result=await env.DB.batch([
  env.DB.prepare(`INSERT INTO material_items(id,category_id,name,sku,unit,price_minor,currency,active,version,created_at,updated_at,updated_by) SELECT ?,?,?,?,?,?,?,?,1,?,?,? WHERE ${matOwner} AND EXISTS(SELECT 1 FROM material_categories WHERE id=? AND active=1) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,sku=excluded.sku,unit=excluded.unit,price_minor=excluded.price_minor,currency=excluded.currency,active=excluded.active,version=material_items.version+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE material_items.version=? AND material_items.deleted=0 AND ${matOwner}`).bind(id,categoryId,name,sku,unit,b.priceMinor,currency,Number(b.active),now,now,m.user_id,m.user_id,categoryId,version,m.user_id),
  env.DB.prepare(`INSERT OR IGNORE INTO material_item_revisions(id,item_id,item_version,snapshot,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM material_items WHERE id=? AND version=? AND updated_at=? AND updated_by=?) AND ${matOwner}`).bind(id+':'+(version+1),id,version+1,JSON.stringify(snapshot),now,id,version+1,now,m.user_id,m.user_id)
 ]);
 if(!result[0].meta.changes)fail(409,'Materiál se změnil. Obnovte katalog.');return json({item:itemDTO(await matOne(env.DB,'SELECT * FROM material_items WHERE id=?',id))});
}
