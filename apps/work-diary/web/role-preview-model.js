import {TEAM_ROLE_NAMES} from './team-roles.js?v=workspace-roles-v1';

export function rolePreviewTargets(actualRole){return ({owner:['administrator','admin','worker','reader'],administrator:['admin','worker','reader']})[actualRole]||[];}
export function rolePreviewSession(actual,target=null){
 if(!actual?.user)return actual;
 const targets=rolePreviewTargets(actual.user.role);
 const {rolePreview:unused,...clean}=actual;
 if(!targets.length)return clean;
 const selected=targets.includes(target)?target:null,role=selected||actual.user.role;
 const manage=!!actual.permissions?.manage&&['owner','administrator','admin'].includes(role);
 return {...clean,user:{...actual.user,role},permissions:{...actual.permissions,manage,write:!!actual.permissions?.write&&role!=='reader',delete:!!actual.permissions?.delete&&manage},...(actual.workspace?{workspace:{...actual.workspace,role}}:{}),rolePreview:{actualRole:actual.user.role,selectedRole:selected,active:!!selected,targets}};
}
export function rolePreviewMarkup(session,esc){
 const view=session?.rolePreview;if(!view)return '';
 return `<section class="role-preview ${view.active?'is-active':''}" aria-label="Náhled role"><div><strong>${view.active?'Náhled: '+esc(TEAM_ROLE_NAMES[view.selectedRole]):'Zobrazit jako'}</strong>${view.active?'<small>Vaše data · náhled bez ukládání změn</small>':''}</div><label><span class="sr-only">Zobrazit jako</span><select data-role-preview aria-label="Zobrazit jako"><option value="">Moje role · ${esc(TEAM_ROLE_NAMES[view.actualRole])}</option>${view.targets.map(role=>`<option value="${role}" ${role===view.selectedRole?'selected':''}>${esc(TEAM_ROLE_NAMES[role])}</option>`).join('')}</select></label>${view.active?'<button type="button" class="btn small" data-role-preview-exit>Zpět k mojí roli</button>':''}</section>`;
}
