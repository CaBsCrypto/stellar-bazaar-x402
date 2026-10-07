// Server-only authorization. Bootstrap grants administration only, human never grants history write.
import { createHash } from "node:crypto";
import { authenticateHistory, HistoryAuthError, type HistoryPrincipal } from "./operation-history-auth.ts";
import { configuredWorkspaceStore, assertWorkspaceEnabled, openWorkspacesEnabled } from "./workspace-store.ts";
import { WorkspaceError, type WorkspacePrincipal, type WorkspaceRole } from "./workspace-types.ts";
import { workspaceGlobalRequestLimits } from "./workspace-admission.ts";
import { creditOperationalPrincipal } from './acceptance-meter.ts';
if (typeof window !== "undefined") throw new Error("Workspace authorization is server-only");
export function workspaceBearerHash(authorization: string | null) {
  const match = /^Bearer ([a-zA-Z0-9_-]{32,128})$/.exec(authorization ?? "");
  if (!match) throw new WorkspaceError("UNAUTHORIZED", 401);
  return createHash("sha256").update(match[1]).digest("hex");
}
export async function requireWorkspacePrincipal(authorization: string | null, role?: WorkspaceRole): Promise<WorkspacePrincipal> {
  workspaceGlobalRequestLimits();
  assertWorkspaceEnabled(); const principal = await configuredWorkspaceStore().resolveHash(workspaceBearerHash(authorization));
  if (role ? principal.role !== role : principal.role === "bootstrap") throw new WorkspaceError("FORBIDDEN", 403);
  await creditOperationalPrincipal();
  return principal;
}
export type ResolvedHistoryPrincipal = HistoryPrincipal & { workspace?: WorkspacePrincipal };
export async function resolveHistoryPrincipal(authorization: string | null, write = false): Promise<ResolvedHistoryPrincipal> {
  try { const principal=authenticateHistory(authorization, write); await creditOperationalPrincipal();return principal; }
  catch (e) {
    if (!(e instanceof HistoryAuthError) || e.code !== "UNAUTHORIZED" || !openWorkspacesEnabled()) throw e;
  }
  const workspace = await requireWorkspacePrincipal(authorization, write ? "agent" : undefined);
  return { ownerId: workspace.ownerId, permission: workspace.role === "agent" ? "write" : "read", workspace };
}
