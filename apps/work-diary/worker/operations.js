import {applyPrivacyRetention} from './privacy.js';
import {startSystemBackup,stepSystemBackup} from './system-backups.js';
export async function systemMaintenance(env){
 const start=Date.now(),last=await env.DB.prepare("SELECT * FROM system_backups WHERE source='automatic' AND state='building' ORDER BY created_at LIMIT 1").first();let id=last?.id;
 if(!id&&env.DRIVE_TOKEN_ENCRYPTION_KEY){const day=new Date().toISOString().slice(0,10);id='daily-'+day;const old=await env.DB.prepare('SELECT id FROM system_backups WHERE id=?').bind(id).first();if(!old)await startSystemBackup(env,'system','automatic',id);}
 let result=null;if(id)for(let i=0;i<12&&Date.now()-start<30000;i++){result=await stepSystemBackup(env,id);if(result.state!=='building')break;}
 // Remove one expired automatic backup per run. Manual backups are retained until explicit deletion.
 let expired=await env.DB.prepare("SELECT * FROM system_backups WHERE source='automatic' AND state='retiring' ORDER BY created_at LIMIT 1").first();
 if(!expired){expired=(await env.DB.prepare("SELECT * FROM system_backups WHERE source='automatic' AND state='ready' ORDER BY created_at DESC LIMIT 1 OFFSET 7").all()).results[0];if(expired)await env.DB.prepare("UPDATE system_backups SET state='retiring',cursor=? WHERE id=? AND state='ready'").bind(JSON.stringify({deletePart:0}),expired.id).run();}
 if(expired){const m=JSON.parse(expired.manifest),cursor=expired.state==='retiring'?JSON.parse(expired.cursor):{deletePart:0};for(const p of m.parts.slice(cursor.deletePart,cursor.deletePart+10))await env.BUCKET.delete('system-backups/'+expired.id+'/'+p.path);cursor.deletePart+=10;if(cursor.deletePart<m.parts.length)await env.DB.prepare('UPDATE system_backups SET cursor=? WHERE id=?').bind(JSON.stringify(cursor),expired.id).run();else{await env.BUCKET.delete('system-backups/'+expired.id+'/manifest.json');await env.DB.prepare('DELETE FROM system_backups WHERE id=?').bind(expired.id).run();}}
 return {backup:result,privacy:await applyPrivacyRetention(env)};
}
export async function operationsHealth(env){
 const read=async key=>{const r=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();try{return r?JSON.parse(r.value):null;}catch{return null;}},scheduled=await read('system-last-scheduled-run'),lastBackup=await env.DB.prepare("SELECT created_at FROM system_backups WHERE state='ready' ORDER BY created_at DESC LIMIT 1").first(),failed=await env.DB.prepare("SELECT count(*) n FROM system_backups WHERE state='failed'").first();
 return {scheduled,scheduledHealthy:!!scheduled?.ok&&Date.now()-scheduled.at<3*3600000,lastBackupAt:lastBackup?.created_at||null,backupHealthy:!!lastBackup&&Date.now()-lastBackup.created_at<48*3600000,failedBackups:failed?.n||0,storageReady:!!env.BUCKET,databaseReady:!!env.DB};
}
