// One shared hierarchy for invitations, memberships and device access.
export const TEAM_ROLE_NAMES={owner:'Vlastník',administrator:'Administrátor',admin:'Správce',worker:'Pracovník',reader:'Čtenář'};
export function assignableTeamRoles(role){return ({owner:['administrator','admin','worker','reader'],administrator:['admin','worker','reader'],admin:['worker','reader']})[role]||[];}
export function canAssignTeamRole(actorRole,targetRole){return assignableTeamRoles(actorRole).includes(targetRole);}
export function canEditTeamMember(actor,target){return !!actor&&!!target&&(actor.user_id||actor.id)!==(target.user_id||target.id)&&canAssignTeamRole(actor.role,target.role);}
