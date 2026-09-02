import { canonicalInputHash } from "./website-intelligence-readiness.ts";

export const PAID_DELIVERY_ENVELOPE_VERSION = "bazaar.paid-delivery-envelope/v1" as const;
const HEX_64 = /^[0-9a-f]{64}$/;

export type PaidDeliveryPolicy = {
  serviceId: string; serviceVersion: string; cardUrl: string; cardHash: string;
  method: "POST"; route: string; inputHash: string; idempotencyKey: string;
  scheme: "exact"; network: "stellar:testnet"; asset: string; atomicAmount: string; payTo: string;
};

export type PaidDeliveryEnvelopeV1 = {
  version: typeof PAID_DELIVERY_ENVELOPE_VERSION;
  service: { id: string; version: string; cardUrl: string; cardHash: string };
  request: { requestId: string; method: "POST"; route: string; inputHashAlgorithm: "sha256-canonical-json-v1"; inputHash: string; idempotencyKey: string };
  payment: { status: "settled"; x402Version: 2; scheme: "exact"; network: "stellar:testnet"; asset: string; atomicAmount: string; payTo: string; transactionHash: string; ledger: number };
  delivery: { mode: "sync"; status: "result-returned"; schemaVersion: string; contentType: "application/json"; result: unknown; resultHash: { algorithm: "sha256"; scope: "canonical-result"; value: string } };
  recovery: { available: boolean; recoveryId: string | null; providerOrigin: string; expiresAt: string | null; status: "not-requested" | "available" | "recovered" | "expired" };
  reconciliation: { status: "matched" | "rejected"; checks: Record<string, boolean> };
  boundaries: { qualityCertifiedByBazaar: false; buyerSignerStoredByBazaar: false; recoveryCredentialStoredByBazaar: false };
};

export function createPaidDeliveryEnvelope(input: { policy: PaidDeliveryPolicy; transactionHash: string; ledger: number; result: unknown; resultHash: string; recovery?: { requestId: string; recoveryId: string; expiresAt: string } }): PaidDeliveryEnvelopeV1 {
  const requestId = input.recovery?.requestId ?? canonicalInputHash({ serviceId: input.policy.serviceId, cardHash: input.policy.cardHash, inputHash: input.policy.inputHash, idempotencyKey: input.policy.idempotencyKey }).slice(0, 32);
  const providerOrigin = new URL(input.policy.cardUrl).origin;
  const envelope: PaidDeliveryEnvelopeV1 = {
    version: PAID_DELIVERY_ENVELOPE_VERSION,
    service: { id: input.policy.serviceId, version: input.policy.serviceVersion, cardUrl: input.policy.cardUrl, cardHash: input.policy.cardHash },
    request: { requestId, method: input.policy.method, route: input.policy.route, inputHashAlgorithm: "sha256-canonical-json-v1", inputHash: input.policy.inputHash, idempotencyKey: input.policy.idempotencyKey },
    payment: { status: "settled", x402Version: 2, scheme: input.policy.scheme, network: input.policy.network, asset: input.policy.asset, atomicAmount: input.policy.atomicAmount, payTo: input.policy.payTo, transactionHash: input.transactionHash, ledger: input.ledger },
    delivery: { mode: "sync", status: "result-returned", schemaVersion: "1.0", contentType: "application/json", result: input.result, resultHash: { algorithm: "sha256", scope: "canonical-result", value: input.resultHash } },
    recovery: input.recovery
      ? { available: true, recoveryId: input.recovery.recoveryId, providerOrigin, expiresAt: input.recovery.expiresAt, status: "available" }
      : { available: false, recoveryId: null, providerOrigin, expiresAt: null, status: "not-requested" },
    reconciliation: { status: "rejected", checks: {} },
    boundaries: { qualityCertifiedByBazaar: false, buyerSignerStoredByBazaar: false, recoveryCredentialStoredByBazaar: false },
  };
  const reconciled = reconcilePaidDeliveryEnvelope(envelope, input.policy);
  if (!reconciled.ok || !reconciled.envelope) throw new Error("PAID_DELIVERY_ENVELOPE_REJECTED");
  return reconciled.envelope;
}

export function reconcilePaidDeliveryEnvelope(value: unknown, policy: PaidDeliveryPolicy): { ok: boolean; envelope: PaidDeliveryEnvelopeV1 | null; failed: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, envelope: null, failed: ["shape"] };
  const envelope = structuredClone(value) as PaidDeliveryEnvelopeV1;
  const checks: Record<string, boolean> = {};
  try {
    checks.version = envelope.version === PAID_DELIVERY_ENVELOPE_VERSION;
    checks.service = envelope.service.id === policy.serviceId && envelope.service.version === policy.serviceVersion && envelope.service.cardUrl === policy.cardUrl && envelope.service.cardHash === policy.cardHash && HEX_64.test(envelope.service.cardHash);
    checks.request = envelope.request.method === policy.method && envelope.request.route === policy.route && envelope.request.inputHash === policy.inputHash && envelope.request.idempotencyKey === policy.idempotencyKey && HEX_64.test(envelope.request.inputHash);
    checks.payment = envelope.payment.status === "settled" && envelope.payment.x402Version === 2 && envelope.payment.scheme === policy.scheme && envelope.payment.network === policy.network && envelope.payment.asset === policy.asset && envelope.payment.atomicAmount === policy.atomicAmount && envelope.payment.payTo === policy.payTo;
    checks.transaction = HEX_64.test(envelope.payment.transactionHash) && Number.isSafeInteger(envelope.payment.ledger) && envelope.payment.ledger > 0;
    checks.delivery = envelope.delivery.mode === "sync" && envelope.delivery.status === "result-returned" && envelope.delivery.contentType === "application/json";
    checks.result = HEX_64.test(envelope.delivery.resultHash.value) && canonicalInputHash(envelope.delivery.result) === envelope.delivery.resultHash.value;
    checks.boundaries = envelope.boundaries.qualityCertifiedByBazaar === false && envelope.boundaries.buyerSignerStoredByBazaar === false && envelope.boundaries.recoveryCredentialStoredByBazaar === false;
    const recoveryNotRequested = envelope.recovery.available === false && envelope.recovery.recoveryId === null && envelope.recovery.expiresAt === null && envelope.recovery.status === "not-requested";
    const recoveryAvailable = envelope.recovery.available === true && HEX_64.test(envelope.recovery.recoveryId ?? "") && envelope.recovery.status === "available" && typeof envelope.recovery.expiresAt === "string" && Number.isFinite(Date.parse(envelope.recovery.expiresAt));
    checks.recovery = envelope.recovery.providerOrigin === new URL(policy.cardUrl).origin && (recoveryNotRequested || recoveryAvailable) && (!recoveryAvailable || /^[0-9a-f]{32}$/.test(envelope.request.requestId));
  } catch {
    checks.shape = false;
  }
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([rule]) => rule);
  if (!Object.keys(checks).length) failed.push("shape");
  try { envelope.reconciliation = { status: failed.length ? "rejected" : "matched", checks }; }
  catch { return { ok: false, envelope: null, failed: ["shape"] }; }
  return { ok: failed.length === 0, envelope, failed };
}
