import { authenticateHistory, HistoryAuthError } from "./operation-history-auth.ts";
import { parseOperationHistoryInput } from "./operation-history.ts";
import { configuredHistoryStore, HistoryStoreError } from "./operation-history-store.ts";
import { resolveHistoryPrincipal, type ResolvedHistoryPrincipal } from "./workspace-auth.ts";
import { configuredWorkspaceStore } from "./workspace-store.ts";
import { assertWorkspaceRequest, workspaceFailure, workspaceRequestOrigin } from "./workspace-http.ts";
import { WorkspaceError } from "./workspace-types.ts";

const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization", "X-Content-Type-Options": "nosniff" };
function fail(code: string, status: number) {
  return Response.json({ error: { code, message: "Operation history request could not be completed." } }, { status, headers });
}
function failure(error: unknown) {
  if (error instanceof WorkspaceError) return workspaceFailure(error);
  if (error instanceof HistoryAuthError) return fail(error.code, error.code === "HISTORY_UNAVAILABLE" ? 503 : error.code === "FORBIDDEN" ? 403 : 401);
  if (error instanceof HistoryStoreError) return fail(error.code, error.code === "OPERATION_CONFLICT" ? 409 : error.code === "HISTORY_CAPACITY" ? 409 : 503);
  return fail("HISTORY_UNAVAILABLE", 503);
}
function allowedRequest(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  return (!origin || origin === workspaceRequestOrigin(request)) && [...url.searchParams.keys()].every((key) => key === "limit");
}

/** Dependency injection is explicit; deployed routes always use durable configured storage. */
export function createHistoryHandlers(dependencies: {
  authenticate?: typeof authenticateHistory | typeof resolveHistoryPrincipal;
  store?: typeof configuredHistoryStore;
} = {}) {
  const authenticate = dependencies.authenticate ?? resolveHistoryPrincipal;
  const store = dependencies.store ?? configuredHistoryStore;
  return {
    async GET(request: Request) {
      try {
        if (!allowedRequest(request)) return fail("INVALID_REQUEST", 400);
        const principal: ResolvedHistoryPrincipal = await authenticate(request.headers.get("authorization"));
        if (principal.workspace) { assertWorkspaceRequest(request, true); await configuredWorkspaceStore().consumeRequest(principal.ownerId, principal.workspace.generation); }
        const rawLimit = new URL(request.url).searchParams.get("limit") ?? "20";
        if (!/^[1-9][0-9]{0,2}$/.test(rawLimit) || Number(rawLimit) > 100) return fail("INVALID_REQUEST", 400);
        const records = await (principal.workspace ? configuredWorkspaceStore().forPrincipal(principal.workspace).operations : store()).list(principal.ownerId, Number(rawLimit));
        return Response.json({ version: "1", records }, { headers });
      } catch (error) { return failure(error); }
    },
    async POST(request: Request) {
      try {
        if (!allowedRequest(request)) return fail("INVALID_REQUEST", 400);
        const principal: ResolvedHistoryPrincipal = await authenticate(request.headers.get("authorization"), true);
        if (principal.workspace) { assertWorkspaceRequest(request, true); await configuredWorkspaceStore().consumeRequest(principal.ownerId, principal.workspace.generation); }
        if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return fail("INVALID_OPERATION", 415);
        const reader = request.body?.getReader();
        if (!reader) return fail("INVALID_OPERATION", 400);
        let size = 0;
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > (principal.workspace ? 16384 : 110000)) { await reader.cancel(); return fail("INVALID_OPERATION", 413); }
          chunks.push(value);
        }
        let input;
        try { const raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (size > 16384 && raw?.delivery?.artifact?.kind !== "file") return fail("INVALID_OPERATION",413); input = parseOperationHistoryInput(raw); }
        catch { return fail("INVALID_OPERATION", 400); }
        const result = await (principal.workspace ? configuredWorkspaceStore().forPrincipal(principal.workspace).operations : store()).append(principal.ownerId, input);
        return Response.json({ version: "1", ...result }, { status: result.created ? 201 : 200, headers });
      } catch (error) { return failure(error); }
    },
  };
}
