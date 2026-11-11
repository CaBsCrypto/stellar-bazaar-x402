export const dynamic = "force-dynamic";
// The former simulator lives only under scripts/fixtures. No environment flag,
// request body or authorization can enable simulated payments on this route.
function unavailable() {
  return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
export const GET = unavailable;
export const POST = unavailable;
export const PUT = unavailable;
export const PATCH = unavailable;
export const DELETE = unavailable;
export const HEAD = unavailable;
export const OPTIONS = unavailable;
