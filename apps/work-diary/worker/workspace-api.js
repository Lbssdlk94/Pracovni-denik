import {handleWorkspaceManifest} from './workspace-manifest.js';
import {handleWorkspaceRecovery} from './workspace-recovery.js';
import {linkWorkspaceIdentity,issueWorkspaceIdentityInvite} from './workspace-identities.js';
import {workspaceActor} from './workspace-policy.js';
import {changeWorkspaceMembership, readWorkspaceMembership} from './workspace-memberships.js';
export async function handleWorkspace(request, env, member, helpers) {
  const {fail, json, body} = helpers;
  const url = new URL(request.url);
  if(url.pathname.startsWith('/api/workspace/recovery'))return handleWorkspaceRecovery(request,env,member,helpers);
  if(url.pathname==='/api/workspace/manifest')return handleWorkspaceManifest(request,env,member,helpers);
  const authorization = await workspaceActor(env.DB, member.user_id);
  if (url.pathname === '/api/workspace' && request.method === 'GET') {
    return json({workspace: authorization});
  }
  if (url.pathname === '/api/workspace/link-identity') return linkWorkspaceIdentity(request, env, member, helpers);
  if (!authorization) fail(404, 'Společný pracovní prostor není aktivní.');
  if (url.pathname === '/api/workspace/identity-invite') return issueWorkspaceIdentityInvite(request, env, member, helpers);
  if (!['owner', 'administrator', 'admin'].includes(authorization.role)) fail(403, 'Příslušnost spravuje správce.');
  const match = url.pathname.match(/^\/api\/workspace\/(members|customers|gardens)\/([-\w]{1,100})\/disciplines$/);
  if (!match) fail(404, 'Nenalezeno.');
  const entity = {members: 'member', customers: 'customer', gardens: 'garden'}[match[1]];
  if (request.method === 'GET') return json({membership: await readWorkspaceMembership(env.DB, entity, match[2])});
  if (request.method !== 'PUT') fail(405, 'Nepodporovaná operace.');
  const input = await body(request, 4000);
  return json({membership: await changeWorkspaceMembership(env.DB, member, entity, match[2], input, fail)});
}
