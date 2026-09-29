import { requireReviewSession, reviewResponse, reviewError, ReviewHttpError } from "../../../../lib/provider-admin-session.ts";
import { listProviderSubmissionsForOperator } from "../../../../lib/provider-self-listing.ts";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { await requireReviewSession(request); const params = new URL(request.url).searchParams; const page = Number(params.get("page") ?? 1), pageSize = Number(params.get("pageSize") ?? 20); if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new ReviewHttpError(400,"INVALID_PAGINATION"); const result = await listProviderSubmissionsForOperator(page,pageSize); return reviewResponse(result, result.ok ? 200 : 503); } catch(e) { return reviewError(e); }
}
