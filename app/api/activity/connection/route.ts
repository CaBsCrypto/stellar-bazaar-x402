import { resolveHistoryPrincipal } from "../../../../lib/workspace-auth.ts";
import { assertWorkspaceRequest } from "../../../../lib/workspace-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin"),
      url = new URL(request.url);
    if ((origin && origin !== url.origin) || url.search)
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
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ ok: false }, { status: 403, headers });
  }
}
