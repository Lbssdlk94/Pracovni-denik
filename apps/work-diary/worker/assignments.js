export function jobAssignedIds(row){return [...new Set([row.assigned_to,...JSON.parse(row.assigned_users||'[]')].filter(Boolean))];}
export async function jobAssignment(env,value,previous,fail,{allowUnassigned=false}={}){
 const primary=value.assignedTo??value.assignedTos?.[0]??previous?.assigned_to;
 if(allowUnassigned&&primary===''&&(!value.assignedTos||!value.assignedTos.length))return {assignedTo:'',additional:[],people:[],primary:{user_id:'',name:''}};
 const ids=value.assignedTos??(previous&&primary===previous.assigned_to?jobAssignedIds(previous):[primary]);
 if(!Array.isArray(ids)||!ids.length||ids.length>50||!ids.includes(primary)||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(id)))fail(400,'Vyberte jednoho nebo více současných kolegů.');
 const rows=(await env.DB.prepare('SELECT user_id,name FROM members WHERE user_id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all()).results;
 if(rows.length!==ids.length)fail(400,'Některý vybraný kolega už není členem týmu.');
 return {assignedTo:primary,additional:ids.filter(id=>id!==primary).sort(),people:ids.map(id=>rows.find(row=>row.user_id===id)),primary:rows.find(row=>row.user_id===primary)};
}
