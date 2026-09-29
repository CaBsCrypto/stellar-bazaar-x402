import { NextRequest, NextResponse } from "next/server";
import { submitProviderDraft, type SelfListingError } from "@/lib/provider-self-listing";
import { localProviderReviewRequest, readBoundedSubmission, submissionAccess } from "@/lib/provider-submission-http";

const MAX_BODY_BYTES = 32 * 1024;

function errorResponse(error: SelfListingError) {
  const status = /DISABLED|QUEUE_FULL|STORAGE|STORE|BUSY/.test(error.code) ? 503
    : /CONFLICT|DUPLICATE/.test(error.code) ? 409 : /UNAUTHORIZED|ACCESS_DENIED/.test(error.code) ? 401 : 422;
  return NextResponse.json({ ok: false, error: { ...error, stage: "discover" } }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  if (!localProviderReviewRequest(request)) return errorResponse({code:"INTAKE_DISABLED",message:"Persistent seller review is currently a loopback-only pilot.",retryable:false});
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ ok: false, error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json.", retryable: false, stage: "discover" } }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await readBoundedSubmission(request, MAX_BODY_BYTES);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "PAYLOAD_TOO_LARGE";
    return NextResponse.json({ ok: false, error: { code: tooLarge ? "PAYLOAD_TOO_LARGE" : "MALFORMED_JSON", message: tooLarge ? "Submission exceeds 32 KiB." : "Malformed JSON body.", retryable: false, stage: "discover" } }, { status: tooLarge ? 413 : 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse({ code: "INVALID_SUBMISSION", message: "Body must contain card and controlProof.", retryable: false });
  }
  const payload = body as { card?: unknown; controlProof?: unknown; submissionId?: unknown };
  if (typeof payload.submissionId !== "string") return errorResponse({code:"INVALID_SUBMISSION",message:"Create and save submissionId and a private submission token before sending.",retryable:false});
  const result = await submitProviderDraft(payload.card, payload.controlProof, {submissionId:payload.submissionId,submissionToken:submissionAccess(request)});
  if (!result.ok) return errorResponse(result.error);
  const submission = result.value;
  return NextResponse.json({
    ok: true,
    submission: {
      version: submission.version,
      submissionId: submission.submissionId,
      serviceCardId: submission.card.id,
      status: submission.status,
      publiclyActive: submission.publiclyActive,
      submittedAt: submission.submittedAt,
      expiresAt: submission.expiresAt,
      control: submission.control,
      conformance: submission.conformance,
    },
    notice: "Request preserved for operator review. Check status; submitting is not approval or publication.",
  }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}

export function GET() {
  return NextResponse.json({ ok: false, error: { code: "QUEUE_NOT_PUBLIC", message: "The manual review queue is not public.", retryable: false, stage: "discover" } }, { status: 405, headers: { Allow: "POST" } });
}
