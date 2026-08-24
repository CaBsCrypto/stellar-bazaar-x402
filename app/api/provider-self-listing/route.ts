import { NextRequest, NextResponse } from "next/server";
import { submitProviderDraft, type SelfListingError } from "@/lib/provider-self-listing";

const MAX_BODY_BYTES = 32 * 1024;

function errorResponse(error: SelfListingError) {
  const status = error.code === "INTAKE_DISABLED" || error.code === "QUEUE_FULL" ? 503
    : error.code === "DUPLICATE_SUBMISSION" ? 409 : 422;
  return NextResponse.json({ ok: false, error: { ...error, stage: "discover" } }, { status });
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ ok: false, error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json.", retryable: false, stage: "discover" } }, { status: 415 });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Submission exceeds 32 KiB.", retryable: false, stage: "discover" } }, { status: 413 });
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("too-large");
    body = JSON.parse(text);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "too-large";
    return NextResponse.json({ ok: false, error: { code: tooLarge ? "PAYLOAD_TOO_LARGE" : "MALFORMED_JSON", message: tooLarge ? "Submission exceeds 32 KiB." : "Malformed JSON body.", retryable: false, stage: "discover" } }, { status: tooLarge ? 413 : 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse({ code: "INVALID_SUBMISSION", message: "Body must contain card and controlProof.", retryable: false });
  }
  const payload = body as { card?: unknown; controlProof?: unknown };
  const result = await submitProviderDraft(payload.card, payload.controlProof);
  if (!result.ok) return errorResponse(result.error);
  const submission = result.value;
  return NextResponse.json({
    ok: true,
    submission: {
      version: submission.version,
      submissionId: submission.submissionId,
      serviceCardId: submission.card.id,
      status: submission.status,
      publiclyActive: false,
      submittedAt: submission.submittedAt,
      expiresAt: submission.expiresAt,
      control: submission.control,
      conformance: submission.conformance,
    },
    notice: "Draft queued for control proof and manual review; it is not indexed or publicly active.",
  }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return NextResponse.json({ ok: false, error: { code: "QUEUE_NOT_PUBLIC", message: "The manual review queue is not public.", retryable: false, stage: "discover" } }, { status: 405, headers: { Allow: "POST" } });
}
