import { resolveHistoryPrincipal } from "../../../../lib/workspace-auth.ts";
import { assertWorkspaceRequest, workspaceRequestOrigin, workspaceHeaders, workspaceFailure } from "../../../../lib/workspace-http.ts";
import { configuredWorkspaceStore } from "../../../../lib/workspace-store.ts";
import { WorkspaceError } from "../../../../lib/workspace-types.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = workspaceHeaders;
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin"),
      url = new URL(request.url);
    const expectedOrigin = workspaceRequestOrigin(request);
    if ((origin && origin !== expectedOrigin) || url.search)
      return Response.json({ ok: false }, { status: 400, headers });
    const reader = await resolveHistoryPrincipal(request.headers.get("authorization"));
    if (reader.permission !== "read") throw Error();
    // A separate header keeps both credentials out of URLs, tool arguments and returned data.
    const writer = await resolveHistoryPrincipal(
      request.headers.get("x-history-write-access"),
      true,
    );
    if (reader.workspace || writer.workspace) {
      assertWorkspaceRequest(request);
      if (!reader.workspace || !writer.workspace || reader.workspace.role !== "human" || writer.workspace.role !== "agent" || reader.workspace.workspaceId !== writer.workspace.workspaceId) throw Error();
    }
    if (reader.ownerId !== writer.ownerId) throw Error();
    if (reader.workspace) await configuredWorkspaceStore().consumeRequest(reader.ownerId, reader.workspace.generation);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    if (error instanceof WorkspaceError) return workspaceFailure(error);
    return Response.json({ ok: false }, { status: 403, headers });
  }
}
