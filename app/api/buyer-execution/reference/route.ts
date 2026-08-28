import { NextResponse } from "next/server";
import { createExecutionRequest, executeFixtureRequest, pollFixtureStatus } from "@/lib/buyer-execution";
export const dynamic = "force-dynamic";
const statusByCode: Record<string, number> = { INVALID_INPUT: 400, SERVICE_NOT_ALLOWED: 400, REQUEST_BINDING_MISMATCH: 409, INPUT_TAMPERED: 409, INVALID_IDEMPOTENCY_KEY: 400, INVALID_REQUEST_TIME: 400, REQUEST_IDENTITY_MISMATCH: 409, REQUEST_EXPIRED: 410, AUTHORIZATION_REQUIRED: 401, IDEMPOTENCY_CONFLICT: 409, PROVIDER_UNAVAILABLE: 503, STATUS_NOT_SUPPORTED: 409, JOB_NOT_FOUND: 404 };
export async function POST(request: Request) {
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: { code: "INVALID_JSON", retryable: false } }, { status: 400 }); }
  try {
    if (body.action === "challenge") { const executionRequest = createExecutionRequest({ serviceId: body.serviceId as "script-creator" | "video-repurpose", input: body.input, idempotencyKey: body.idempotencyKey as string | undefined }); return NextResponse.json({ ok: false, error: { code: "PAYMENT_REQUIRED_LOCAL_FIXTURE", retryable: true }, executionRequest, payment: { simulated: true, settlement: "not-performed" } }, { status: 402, headers: { "Cache-Control": "no-store", "X-Bazaar-Demo": "local-no-settlement" } }); }
    if (body.action === "execute") return NextResponse.json({ ok: true, envelope: executeFixtureRequest({ request: body.executionRequest as never, demoAuthorization: body.demoAuthorization }) }, { headers: { "Cache-Control": "no-store", "X-Bazaar-Demo": "local-no-settlement" } });
    if (body.action === "status") return NextResponse.json({ ok: true, envelope: pollFixtureStatus({ request: body.executionRequest as never, jobId: body.jobId }) }, { headers: { "Cache-Control": "no-store", "X-Bazaar-Demo": "local-no-settlement" } });
    throw new Error("INVALID_INPUT");
  } catch (error) { const code = error instanceof Error ? error.message : "INVALID_INPUT"; return NextResponse.json({ ok: false, error: { code, retryable: code === "PROVIDER_UNAVAILABLE", message: { es: "La ejecución local fue rechazada de forma segura.", en: "The local execution was safely rejected." } } }, { status: statusByCode[code] ?? 400, headers: { "Cache-Control": "no-store", "X-Bazaar-Demo": "local-no-settlement" } }); }
}
