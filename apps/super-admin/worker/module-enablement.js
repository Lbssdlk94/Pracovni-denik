import {moduleClosure} from '../../../packages/platform/modules.js';
import {companyRecord,parse} from './catalog.js';
import {one,known,integer,fail,id} from './http.js';

// Explicit operator amendment: add only the requested module/dependencies.
// Never refresh a firm's price, dates, user limit or other agreed conditions.
export async function enableCompanyModule(env,actor,c,b,mutate){
 known(b,['operationId','version','module','confirm']);id(b.operationId);
 const version=integer(b.version,1,100000000,'verzi');if(b.confirm!==true)fail(400,'Potvrďte rozšíření modulů při zachování sjednané ceny.');
 let keys;try{keys=moduleClosure(b.module);}catch(e){fail(400,e.message);}
 const profession=await one(env.DB,'SELECT * FROM platform_professions WHERE id=?',c.profession_id),plan=await one(env.DB,'SELECT * FROM platform_plans WHERE id=?',c.plan_id);
 if(!profession?.active||!plan?.active)fail(409,'Použitá profese nebo tarif jsou deaktivované. Nejdříve vyberte aktivní profesi a tarif.');
 const add=original=>[...new Set([...original,...keys])],pd=parse(profession.definition),qd=parse(plan.definition),ps=parse(c.profession_snapshot),qs=parse(c.plan_snapshot),nextProfession={...pd,allowed:add(pd.allowed)},nextPlan={...qd,modules:add(qd.modules)};
 const professionChanged=nextProfession.allowed.length!==pd.allowed.length,planChanged=nextPlan.modules.length!==qd.modules.length,now=Date.now();
 if(professionChanged)nextProfession.version=profession.version+1;
 const nextPS={...ps,allowed:add(ps.allowed)},nextQS={...qs,modules:add(qs.modules)},allowed=add(parse(c.allowed_modules)),rollout=add(parse(c.rollout_modules)),overrides={...parse(c.feature_overrides||'{}'),...Object.fromEntries(keys.map(k=>[k,true]))};
 const result=await mutate(env,actor,b,'enable_company_module',c.id,
  'EXISTS(SELECT 1 FROM platform_companies WHERE id=? AND version=?) AND EXISTS(SELECT 1 FROM platform_professions WHERE id=? AND version=? AND active=1) AND EXISTS(SELECT 1 FROM platform_plans WHERE id=? AND version=? AND active=1)',
  [c.id,version,profession.id,profession.version,plan.id,plan.version],(gate,op)=>[
   env.DB.prepare('INSERT INTO platform_company_history(id,company_id,kind,snapshot,actor_id,created_at) SELECT ?,?,?,?,?,? WHERE '+gate).bind(crypto.randomUUID(),c.id,'module_extension',JSON.stringify({previous:companyRecord(c),module:b.module,addedModules:keys,professionBefore:pd,planBefore:qd}),actor.user_id,now,op),
   ...(professionChanged?[env.DB.prepare('UPDATE platform_professions SET definition=?,version=version+1,updated_at=? WHERE id=? AND version=? AND '+gate).bind(JSON.stringify(nextProfession),now,profession.id,profession.version,op)]:[]),
   ...(planChanged?[env.DB.prepare('UPDATE platform_plans SET definition=?,version=version+1,updated_at=? WHERE id=? AND version=? AND '+gate).bind(JSON.stringify(nextPlan),now,plan.id,plan.version,op)]:[]),
   env.DB.prepare('UPDATE platform_companies SET profession_snapshot=?,plan_snapshot=?,allowed_modules=?,rollout_modules=?,feature_overrides=?,version=version+1,policy_revision=policy_revision+1,updated_at=? WHERE id=? AND version=? AND '+gate).bind(JSON.stringify(nextPS),JSON.stringify(nextQS),JSON.stringify(allowed),JSON.stringify(rollout),JSON.stringify(overrides),now,c.id,version,op)
  ],{module:b.module,addedModules:keys});
 return result;
}
