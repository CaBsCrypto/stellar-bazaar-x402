import { createExecutionRequest, executeFixtureRequest, pollFixtureStatus } from './buyer-execution.ts';

const headers = { 'Cache-Control': 'no-store', 'X-Bazaar-Demo': 'local-no-settlement' };
const statusByCode: Record<string, number> = { INVALID_INPUT: 400, SERVICE_NOT_ALLOWED: 400, REQUEST_BINDING_MISMATCH: 409, INPUT_TAMPERED: 409, INVALID_IDEMPOTENCY_KEY: 400, INVALID_REQUEST_TIME: 400, REQUEST_IDENTITY_MISMATCH: 409, REQUEST_EXPIRED: 410, AUTHORIZATION_REQUIRED: 401, IDEMPOTENCY_CONFLICT: 409, PROVIDER_UNAVAILABLE: 503, STATUS_NOT_SUPPORTED: 409, JOB_NOT_FOUND: 404 };

/** Explicitly invoked by local conformance tests. App routes never import it. */
export async function localBuyerFixture(request: Request) {
  const url = new URL(request.url);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return Response.json({ error: { code: 'LOCAL_FIXTURE_ONLY' } }, { status: 403, headers });
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: { code: 'INVALID_JSON' } }, { status: 400, headers }); }
  try {
    if (body.action === 'challenge') {
      const executionRequest = createExecutionRequest({ serviceId: body.serviceId as 'script-creator' | 'video-repurpose', input: body.input, idempotencyKey: body.idempotencyKey as string | undefined });
      return Response.json({ ok: false, error: { code: 'PAYMENT_REQUIRED_LOCAL_FIXTURE', retryable: true }, executionRequest, payment: { simulated: true, settlement: 'not-performed' } }, { status: 402, headers });
    }
    if (body.action === 'execute') return Response.json({ ok: true, envelope: executeFixtureRequest({ request: body.executionRequest as never, demoAuthorization: body.demoAuthorization }) }, { headers });
    if (body.action === 'status') return Response.json({ ok: true, envelope: pollFixtureStatus({ request: body.executionRequest as never, jobId: body.jobId }) }, { headers });
    throw new Error('INVALID_INPUT');
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_INPUT';
    return Response.json({ ok: false, error: { code, retryable: code === 'PROVIDER_UNAVAILABLE' } }, { status: statusByCode[code] ?? 400, headers });
  }
}
