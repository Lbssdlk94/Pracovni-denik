// Optional, one-time installation invitation. Later role changes are never overridden.
export async function ensureInitialAdministrator(env){
 const email=env.TEAM_INITIAL_ADMINISTRATOR_EMAIL?.trim().toLowerCase();
 if(!email||email===env.TEAM_OWNER_EMAIL?.trim().toLowerCase())return;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Neplatný e-mail počátečního administrátora.');
 const key='initial-administrator-v1';
 if(await env.DB.prepare('SELECT 1 FROM settings WHERE key=?').bind(key).first())return;
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO invitations(email,role,created_by,created_at) SELECT ?,'administrator','installation',? WHERE NOT EXISTS(SELECT 1 FROM settings WHERE key=?) AND NOT EXISTS(SELECT 1 FROM members WHERE email=?)").bind(email,Date.now(),key,email),
  env.DB.prepare("INSERT OR IGNORE INTO settings(key,value,version) VALUES(?,'initialized',1)").bind(key)
 ]);
}
