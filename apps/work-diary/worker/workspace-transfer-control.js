const wtControlReady=new WeakSet();
export async function workspaceTransferEnsureControl(env){
 if(wtControlReady.has(env.DB))return;
 const row=await env.DB.prepare("SELECT * FROM workspace_transfer_control WHERE singleton='primary'").first();
 const planner=await env.DB.prepare("SELECT 1 FROM settings WHERE key='job-planner-revision'").first();
 const statements=[];
 if(!row)statements.push(env.DB.prepare("INSERT OR IGNORE INTO workspace_transfer_control(singleton,generation,bypass) VALUES('primary',0,0)"));
 if(!planner)statements.push(env.DB.prepare("INSERT OR IGNORE INTO settings(key,value,version) VALUES('job-planner-revision','',0)"));
 if(statements.length)await env.DB.batch(statements);
 wtControlReady.add(env.DB);
}
// This fence is persisted in D1, so old requests and other Worker isolates cannot
// silently write into an installation while its consistent transfer is frozen.
export async function workspaceTransferFrozen(env){
 const row=await env.DB.prepare("SELECT freeze_id FROM workspace_transfer_control WHERE singleton='primary'").first();
 if(row?.freeze_id)return row.freeze_id;
 return null;
}
export async function workspaceTransferStamp(env){
 await workspaceTransferEnsureControl(env);
 const row=await env.DB.prepare("SELECT c.freeze_id,w.id,w.state FROM workspace_transfer_control c LEFT JOIN workspaces w ON 1=1 WHERE c.singleton='primary'").first();
 return JSON.stringify([row?.freeze_id||null,row?.id||null,row?.state||null]);
}

// Check the captured deployment/workspace epoch in the SAME D1 transaction as
// every mutation. A request started before cutover must not create an unclassified
// contact afterwards, even if it finished parsing a large upload much later.
const wtFencedDatabases=new WeakMap();
export function workspaceFencedDatabase(database,stamp){
 let versions=wtFencedDatabases.get(database);if(!versions){versions=new Map();wtFencedDatabases.set(database,versions);}
 if(versions.has(stamp))return versions.get(stamp);
 const [freezeId,workspaceId,state]=JSON.parse(stamp);
 const rawStatements=new WeakMap();
 const transact=async statements=>{
  const id=crypto.randomUUID(),guard=database.prepare(`INSERT INTO workspace_transfer_assertions(id,valid) SELECT ?,CASE WHEN c.freeze_id IS ? AND c.freeze_id IS NULL AND (SELECT id FROM workspaces LIMIT 1) IS ? AND (SELECT state FROM workspaces LIMIT 1) IS ? THEN 1 ELSE 0 END FROM workspace_transfer_control c WHERE c.singleton='primary'`).bind(id,freezeId,workspaceId,state);
  const result=await database.batch([guard,...statements,database.prepare('DELETE FROM workspace_transfer_assertions WHERE id=?').bind(id)]);
  return result.slice(1,-1);
 };
 const wrap=statement=>{
  const object={bind(...args){return wrap(statement.bind(...args));},first(...args){return statement.first(...args);},all(...args){return statement.all(...args);},async run(){return (await transact([statement]))[0];}};
  rawStatements.set(object,statement);return object;
 };
 const result={prepare(sql){return wrap(database.prepare(sql));},batch(statements){return transact(statements.map(s=>rawStatements.get(s)||s));}};
 versions.set(stamp,result);if(versions.size>4)versions.delete(versions.keys().next().value);return result;
}
