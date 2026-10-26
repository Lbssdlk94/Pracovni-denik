// Derived exclusively from control-plane metadata. Never probes tenant content.
const DAY=86400000;
const dayAt=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export function licenseSummary(c,now=Date.now()){
 const day=dayAt(now),ends=[c.endDate,c.status==='trial'?c.trialEnd:''].filter(Boolean).sort(),end=ends[0]||null,start=[c.startDate,c.status==='trial'?c.trialStart:''].filter(Boolean).sort().at(-1)||null,daysRemaining=end?Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/DAY):null;
 const state=c.status==='suspended'?'suspended':c.subscriptionStatus==='paused'?'paused':end&&day>end?'expired':start&&day<start?'scheduled':c.status==='trial'&&(!c.trialStart||!c.trialEnd)?'invalid':daysRemaining!==null&&daysRemaining<=30?'expiring':'active';
 return {state,end,start,daysRemaining,trial:c.status==='trial'};
}
export function technicalHealth(c,now=Date.now()){
 const m=c.metrics,ageMs=c.metricsAt?Math.max(0,now-c.metricsAt):null,freshness=ageMs===null?'missing':ageMs>DAY?'stale':ageMs>900000?'delayed':'recent',issues=[];
 if(m){if(m.databaseReady!==true)issues.push('database');if(m.storageReady!==true)issues.push('storage');if(m.policyRevision!==c.policyRevision)issues.push('policy');if(m.members>c.plan.maxUsers)issues.push('user_limit');if(m.lastBackupAt===null)issues.push('backup_missing');else if(now-m.lastBackupAt>7*DAY)issues.push('backup_old');}
 const state=c.provisionStatus==='failed'?'error':c.provisionStatus!=='ready'?'provisioning':!m?'unknown':freshness==='stale'?'stale':issues.some(k=>['database','storage','policy'].includes(k))?'attention':freshness==='delayed'||issues.length?'warning':'healthy';
 return {state,freshness,ageMs,issues,observedOnly:true};
}
export function summarize(companies,now=Date.now()){
 const health={},licenses={};for(const c of companies){health[c.health.state]=(health[c.health.state]||0)+1;licenses[c.license.state]=(licenses[c.license.state]||0)+1;}
 return {checkedAt:now,total:companies.length,health,licenses,expiring30:companies.filter(c=>c.license.state==='expiring').length,needsAttention:companies.filter(c=>c.health.state!=='healthy').length};
}
