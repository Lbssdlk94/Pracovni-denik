// Read-only diagnostics. Existing versioned garden/job APIs perform all repairs.
export async function handleRecordLinks(request,env,m,h){
 const {all,json,fail,features}=h;
 if(!['owner','administrator','admin'].includes(m.role))fail(403,'Kontrolu propojení může otevřít pouze správce.');
 if(request.method!=='GET')fail(405,'Použijte formulář příslušného záznamu.');
 if(features.gardens===false||features.customers===false)fail(403,'Pro kontrolu zapněte zahrady i zákazníky.');
 const url=new URL(request.url),kind=url.searchParams.get('kind')||'all',after=url.searchParams.get('after')||'';
 if(!['all','garden','job','invalid'].includes(kind)||after.length>220)fail(400,'Neplatný filtr.');
 const gardenRows=`SELECT 'garden:'||g.id AS cursor,'garden' AS kind,g.id,g.name AS title,g.address,g.customer_id AS customerId,NULL AS gardenId,c.name AS customerName,NULL AS gardenName,NULL AS gardenAddress,CASE WHEN g.customer_id IS NULL THEN 'Bez zákazníka' ELSE 'Neplatný odkaz na zákazníka' END AS reason,CASE WHEN g.customer_id IS NULL THEN 0 ELSE 1 END AS invalid FROM gardens g LEFT JOIN customers c ON c.id=g.customer_id AND c.deleted=0 WHERE g.deleted=0 AND (g.customer_id IS NULL OR c.id IS NULL)`;
 const jobRows=`SELECT 'job:'||j.id AS cursor,'job' AS kind,j.id,j.title,j.address,j.customer_id AS customerId,j.garden_id AS gardenId,c.name AS customerName,g.name AS gardenName,g.address AS gardenAddress,trim(CASE WHEN j.garden_id IS NULL THEN 'Bez zahrady; ' WHEN g.id IS NULL THEN 'Neplatný odkaz na zahradu; ' ELSE '' END||CASE WHEN j.customer_id IS NOT NULL AND c.id IS NULL THEN 'Neplatný odkaz na zákazníka; ' ELSE '' END||CASE WHEN g.customer_id IS NOT NULL AND (j.customer_id IS NULL OR g.customer_id<>j.customer_id) THEN 'Jiný zákazník než u zahrady; ' ELSE '' END,'; ') AS reason,CASE WHEN (j.garden_id IS NOT NULL AND g.id IS NULL) OR (j.customer_id IS NOT NULL AND c.id IS NULL) OR (g.customer_id IS NOT NULL AND (j.customer_id IS NULL OR g.customer_id<>j.customer_id)) THEN 1 ELSE 0 END AS invalid FROM jobs j LEFT JOIN gardens g ON g.id=j.garden_id AND g.deleted=0 LEFT JOIN customers c ON c.id=j.customer_id AND c.deleted=0 WHERE j.deleted=0 AND (j.garden_id IS NULL OR g.id IS NULL OR (j.customer_id IS NOT NULL AND c.id IS NULL) OR (g.customer_id IS NOT NULL AND (j.customer_id IS NULL OR g.customer_id<>j.customer_id)))`;
 const union=gardenRows+(features.jobs===false?'':' UNION ALL '+jobRows),where=kind==='invalid'?' AND invalid=1':kind==='all'?'':' AND kind=?',args=kind==='garden'||kind==='job'?[after,kind]:[after];
 const rows=await all(env.DB,`SELECT * FROM (${union}) WHERE cursor>?${where} ORDER BY cursor LIMIT 101`,...args),more=rows.length>100;
 return json({records:rows.slice(0,100),nextCursor:more?rows[99].cursor:null});
}
