import {rolePreviewTargets} from '../web/role-preview-model.js';

export function denyRolePreviewMutation(request,fail){
 if(!request.headers.get('x-work-diary-preview-role'))return;
 const path=new URL(request.url).pathname;
 const read=(['GET','HEAD'].includes(request.method)&&!['/api/drive/oauth/callback','/api/drive/native-start'].includes(path))||request.method==='POST'&&path==='/api/workspace/manifest';
 if(!read)fail(403,'V náhledu role nelze ukládat změny. Nejdříve se vraťte ke své roli.',{code:'role_preview_readonly'});
}
export function validateRolePreviewRequest(request,member,fail){
 const role=request.headers.get('x-work-diary-preview-role');if(!role)return;
 if(!rolePreviewTargets(member.role).includes(role))fail(403,'Náhled této role může otevřít pouze vlastník nebo administrátor s odpovídajícím oprávněním.',{code:'role_preview_forbidden'});
 denyRolePreviewMutation(request,fail);
 // Appearance preview uses the actor's own authorized data. Never replace the
 // persisted/effective server member or impersonate a colleague here.
}
