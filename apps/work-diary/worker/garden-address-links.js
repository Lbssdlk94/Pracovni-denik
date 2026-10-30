import {subWorkScope} from './service-work.js';
// Reuse explicit garden -> job -> customer-address IDs. Never join by address text.
// Only expose address metadata from jobs the current actor may read.
export async function gardenAddressLinks(env,m,gardens,{all,features}){
 if(features.customers===false)return gardens;
 if(m._workspace){
  const rows=await all(env.DB,`SELECT w.*,c.addresses FROM workspace_garden_addresses w JOIN customers c ON c.id=w.customer_id AND c.deleted=0`);
  return gardens.map(g=>{const linked=rows.find(row=>row.garden_id===g.id&&row.customer_id===g.customer_id),address=linked&&JSON.parse(linked.addresses).find(a=>String(a.id)===String(linked.customer_address_id));return {...g,addressDetails:address?{customerId:g.customer_id,customerAddressId:address.id,city:address.city||linked.city||'',source:'shared_address_link'}:null};});
 }
 if(features.jobs===false)return gardens;
 const rows=await all(env.DB,`SELECT j.garden_id,j.customer_id,j.customer_address_id,j.city,c.addresses FROM jobs j JOIN gardens g ON g.id=j.garden_id AND g.deleted=0 AND g.customer_id=j.customer_id JOIN customers c ON c.id=j.customer_id AND c.deleted=0 WHERE j.deleted=0 AND j.customer_address_id IS NOT NULL AND ${subWorkScope}`,m.user_id);
 return gardens.map(g=>{const candidates=rows.filter(j=>j.garden_id===g.id&&j.customer_id===g.customer_id),ids=[...new Set(candidates.map(j=>j.customer_address_id))];if(ids.length!==1)return {...g,addressDetails:null};const linked=candidates.find(j=>j.customer_address_id===ids[0]),address=JSON.parse(linked.addresses).find(a=>a.id===ids[0]);if(!address)return {...g,addressDetails:null};const cities=[...new Set(candidates.map(j=>j.city).filter(Boolean))];return {...g,addressDetails:{customerId:g.customer_id,customerAddressId:address.id,city:address.city||(cities.length===1?cities[0]:''),source:'linked_job'}};});
}
