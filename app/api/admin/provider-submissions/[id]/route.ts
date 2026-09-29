import { randomUUID } from "node:crypto";
import { requireReviewSession, reviewResponse, reviewError, reviewJson, ReviewHttpError } from "../../../../../lib/provider-admin-session.ts";
import { getSubmissionForOperator, recordManualReview, stageApprovedSubmission } from "../../../../../lib/provider-self-listing.ts";
import { verifySubmissionDns, verifySubmissionHttp, activateSubmission, recoverSubmissionActivation } from "../../../../../lib/provider-review-operator.ts";
import { recordReviewAudit } from "../../../../../lib/provider-review-audit.ts";
import { limitReviewAdminRequest } from "../../../../../lib/provider-review-limits.ts";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function idFrom(context: Context) { const {id} = await context.params; if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new ReviewHttpError(400,"INVALID_SUBMISSION_ID"); return id; }
export async function GET(request: Request, context: Context) { try { await requireReviewSession(request); const result = await getSubmissionForOperator(await idFrom(context)); return reviewResponse(result, result.ok ? 200 : result.error.code === "STORE_UNAVAILABLE" ? 503 : 404); } catch(e) { return reviewError(e); } }
export async function POST(request: Request, context: Context) {
  try {
    const session = await requireReviewSession(request,true), id = await idFrom(context), body = await reviewJson(request);
    const limit=await limitReviewAdminRequest(request,session.csrfToken);if(!limit.ok)return Response.json({ok:false,error:{code:limit.code}},{status:limit.status,headers:{'Cache-Control':'no-store','Retry-After':String(limit.retryAfter)}});
    const action = body.action;
    if (typeof action !== "string" || !["verify-dns","verify-http","review","stage","activate","recover"].includes(action)) throw new ReviewHttpError(400,"INVALID_ACTION");
    if ((action === "activate" || action === "recover") && process.env.BAZAAR_ENABLE_PROVIDER_ACTIVATION !== "true") throw new ReviewHttpError(503,"ACTIVATION_DISABLED");
    if (action === "review" && (!["approve","reject"].includes(String(body.decision)) || !Array.isArray(body.reasons) || body.reasons.length < 1 || body.reasons.length > 10 || body.reasons.some(r => typeof r !== "string" || !r.trim() || r.length > 500))) throw new ReviewHttpError(400,"INVALID_REVIEW");
    const event = { requestId: randomUUID(), submissionId:id, action, operatorEmail:session.email };
    await recordReviewAudit({...event,outcome:"started"});
    let value;
    try {
      if (action === "verify-dns") value = await verifySubmissionDns(id);
      else if (action === "verify-http") value = await verifySubmissionHttp(id);
      else if (action === "activate") value = await activateSubmission(id);
      else if (action === "recover") value = await recoverSubmissionActivation(id);
      else { const result = action === "stage" ? await stageApprovedSubmission(id) : await recordManualReview(id,{decision:body.decision as "approve"|"reject", reasons:body.reasons as string[], reviewerId:session.email}); if (!result.ok) throw new ReviewHttpError(result.error.code === "STORE_UNAVAILABLE" ? 503 : 409,result.error.code); value=result.value; }
    } catch(e) { await recordReviewAudit({...event,outcome:"failed"}); throw e; }
    try { await recordReviewAudit({...event,outcome:"succeeded"}); } catch { throw new ReviewHttpError(503,"ACTION_OUTCOME_REQUIRES_INSPECTION"); }
    return reviewResponse({ok:true,value,requestId:event.requestId});
  } catch(e) { return reviewError(e); }
}
