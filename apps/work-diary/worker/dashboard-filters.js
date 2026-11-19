import {protocolStateSql} from './job-workflow.js';
// Predicates shared by counts and the existing paged job list; all identifiers are fixed.
export function dashboardJobFilter(kind,day){
 const rules={
  approval:{sql:"j.service_approval='pending'",args:[]},
  material:{sql:"j.job_type='installation' AND j.status NOT IN ('done','incomplete') AND j.material_status<>'ready'",args:[]},
  protocol:{sql:"j.status='done' AND ("+protocolStateSql+") IN ('missing','draft')",args:[]},
  overdue:{sql:"j.due_date<>'' AND j.due_date<? AND j.status<>'done'",args:[day]},
  incomplete:{sql:"j.status='incomplete'",args:[]},
  photos:{sql:"j.status IN ('in_progress','done') AND NOT EXISTS(SELECT 1 FROM service_photos sp WHERE sp.job_id=j.id AND sp.status='ready') AND NOT EXISTS(SELECT 1 FROM job_photos jp WHERE jp.job_id=j.id AND jp.status='complete')",args:[]}
 };return rules[kind]||null;
}
