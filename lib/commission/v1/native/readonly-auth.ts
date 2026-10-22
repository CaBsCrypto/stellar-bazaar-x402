import {requireWorkspacePrincipal} from '../../../workspace-auth.ts';
import {assertWorkspaceRequest} from '../../../workspace-http.ts';
import {assertTreasuryControlRequest} from '../../../treasury-control-workspace.ts';
import {WorkspaceError} from '../../../workspace-types.ts';
/** Fresh native registry authentication immediately before a private response.
 * The first authenticateWorkspaceRequest still performs ingress, owner quota
 * and document validation. This final proof is deliberately not a second
 * account request, carries no cache and accepts no client principal JSON. */
export async function revalidateSplitReadIdentity(request:Request){
 if(request.method!=='GET'||!['/api/market/split-v1/context','/api/market/split-v1/terms','/api/market/split-v1/history'].includes(new URL(request.url).pathname))throw new WorkspaceError('SPLIT_READ_IDENTITY_SCOPE',403);
 assertWorkspaceRequest(request,true);
 const principal=await requireWorkspacePrincipal(request.headers.get('authorization'));
 if(!['human','agent'].includes(principal.role))throw new WorkspaceError('UNAUTHORIZED',401);
 assertTreasuryControlRequest(principal,request);
 return principal;
}
