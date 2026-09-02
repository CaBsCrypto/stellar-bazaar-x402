import { createProviderRecoveryRequest } from "./delivery-recovery-handoff.ts";
import { PAID_DELIVERY_ENVELOPE_VERSION, type PaidDeliveryEnvelopeV1 } from "./paid-delivery-envelope.ts";
import { canonicalInputHash } from "./website-intelligence-readiness.ts";

export type RecoveryFetch = (input: string, init: RequestInit) => Promise<Response>;

function recoveryEndpoint(origin: string): string {
  const url = new URL(origin);
  const local = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const publicProvider = url.protocol === "https:" && url.hostname === "website-intelligence-provider.vercel.app";
  if ((!local && !publicProvider) || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) throw new Error("RECOVERY_ORIGIN_NOT_ALLOWLISTED");
  return new URL("/v1/x402/audits/recover", url.origin).toString();
}

export async function recoverWebsiteIntelligenceDelivery(input: {
  providerOrigin: string; capsule: unknown; recoveryId: string; expected: PaidDeliveryEnvelopeV1;
  fetchImpl?: RecoveryFetch; timeoutMs?: number;
}) {
  const endpoint = recoveryEndpoint(input.providerOrigin);
  const request = createProviderRecoveryRequest(input.capsule, input.recoveryId);
  const capsule = input.capsule as Record<string, unknown>;
  const providerOrigin = new URL(input.providerOrigin).origin;
  const recoveryExpiry = typeof input.expected.recovery.expiresAt === "string" ? Date.parse(input.expected.recovery.expiresAt) : NaN;
  const preflightMatches = input.expected.version === PAID_DELIVERY_ENVELOPE_VERSION && input.expected.reconciliation.status === "matched"
    && capsule.serviceId === input.expected.service.id && capsule.providerOrigin === providerOrigin && capsule.recoveryPath === "/v1/x402/audits/recover"
    && input.expected.recovery.available === true && input.expected.recovery.recoveryId === input.recoveryId
    && input.expected.recovery.providerOrigin === providerOrigin && input.expected.request.requestId === request.requestId
    && Number.isFinite(recoveryExpiry) && recoveryExpiry > Date.now();
  if (!preflightMatches) throw new Error("RECOVERED_DELIVERY_RECONCILIATION_FAILED");
  const timeoutMs = input.timeoutMs ?? 8_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new Error("INVALID_RECOVERY_TIMEOUT");
  const response = await (input.fetchImpl ?? fetch)(endpoint, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(request), redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`RECOVERY_REQUEST_FAILED_${response.status}`);
  if (!(response.headers.get("cache-control") ?? "").toLowerCase().includes("no-store")) throw new Error("RECOVERY_RESPONSE_MUST_BE_NO_STORE");
  const body = await response.json() as Record<string, any>;
  const receipt = body.receipt as Record<string, unknown> | undefined;
  const matches = body.version === "website-intelligence.recovered-delivery/v1"
    && body.recovery?.status === "recovered" && body.recovery?.recoveryId === input.recoveryId && body.recovery?.requestId === request.requestId
    && typeof body.resultHash === "string" && canonicalInputHash(body.result) === body.resultHash
    && receipt?.transactionHash === input.expected.payment.transactionHash && receipt?.ledger === input.expected.payment.ledger
    && receipt?.network === input.expected.payment.network && receipt?.asset === input.expected.payment.asset
    && receipt?.amount === input.expected.payment.atomicAmount && receipt?.payTo === input.expected.payment.payTo
    && receipt?.status === input.expected.payment.status && receipt?.scheme === input.expected.payment.scheme
    && receipt?.method === input.expected.request.method && receipt?.route === input.expected.request.route
    && receipt?.inputHash === input.expected.request.inputHash && receipt?.cardHash === input.expected.service.cardHash
    && receipt?.resultHash === body.resultHash && body.resultHash === input.expected.delivery.resultHash.value;
  if (!matches) throw new Error("RECOVERED_DELIVERY_RECONCILIATION_FAILED");
  return { endpoint, requestId: request.requestId, recoveryId: input.recoveryId, result: body.result, resultHash: body.resultHash, receipt, reconciled: true as const, paymentAttempted: false as const };
}
