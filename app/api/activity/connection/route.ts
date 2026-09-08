import { authenticateHistory } from "../../../../lib/operation-history-auth.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin"),
      url = new URL(request.url);
    if ((origin && origin !== url.origin) || url.search)
      return Response.json({ ok: false }, { status: 400, headers });
    const reader = authenticateHistory(request.headers.get("authorization"));
    if (reader.permission !== "read") throw Error();
    // A separate header keeps both credentials out of URLs, tool arguments and returned data.
    const writer = authenticateHistory(
      request.headers.get("x-history-write-access"),
      true,
    );
    if (reader.ownerId !== writer.ownerId) throw Error();
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ ok: false }, { status: 403, headers });
  }
}
