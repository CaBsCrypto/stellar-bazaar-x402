import { configuredWorkspaceStore } from './workspace-store.ts';
import { WorkspaceError, type WorkspacePrincipal } from './workspace-types.ts';

/** A grant stays bound to the server-assigned agent and current access generation. */
export async function marketSubmissionGuard(principal: WorkspacePrincipal) {
  const snapshot = await configuredWorkspaceStore().readMarketPermissionSnapshot(principal);
  if (principal.role === 'agent' && !snapshot.permission.allowServiceSubmission) throw new WorkspaceError('MARKET_SUBMISSION_NOT_ALLOWED', 403);
  // Agent publication requires a store that can atomically compare both keys at commit.
  if (principal.role === 'agent' && !snapshot.guard) throw new WorkspaceError('MARKET_UNAVAILABLE');
  return principal.role === 'human' && snapshot.guard
    ? { keys: snapshot.guard.keys.slice(0, 1), values: snapshot.guard.values.slice(0, 1) }
    : snapshot.guard;
}
