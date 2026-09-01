export const DELIVERY_RECOVERY_HANDOFF_VERSION = "bazaar.delivery-recovery-handoff/v1" as const;
export const DELIVERY_RECOVERY_CAPSULE_VERSION = "bazaar.delivery-recovery-capsule/v1" as const;

export const RECOVERY_REQUEST_ID_PATTERN = /^[0-9a-f]{32}$/;
export const RECOVERY_PROOF_PATTERN = /^[0-9a-f]{64}$/;
export const RECOVERY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type DeliveryRecoveryIntent = { requestId: string; proof: string };

export function validateDeliveryRecoveryIntent(value: unknown): DeliveryRecoveryIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_RECOVERY_INTENT");
  const intent = value as Record<string, unknown>;
  if (typeof intent.requestId !== "string" || !RECOVERY_REQUEST_ID_PATTERN.test(intent.requestId)) throw new Error("INVALID_RECOVERY_REQUEST_ID");
  if (typeof intent.proof !== "string" || !RECOVERY_PROOF_PATTERN.test(intent.proof)) throw new Error("INVALID_RECOVERY_PROOF");
  return { requestId: intent.requestId, proof: intent.proof };
}

export function createPublicRecoveryHandoff(input: {
  serviceId: string; providerOrigin: string; paidPath: string; recoveryPath: string;
  requestId: string; recoveryProof: string; inputHash: string; idempotencyKey: string;
}) {
  const intent = validateDeliveryRecoveryIntent({ requestId: input.requestId, proof: input.recoveryProof });
  return {
    version: DELIVERY_RECOVERY_HANDOFF_VERSION,
    serviceId: input.serviceId,
    providerOrigin: input.providerOrigin,
    paidPath: input.paidPath,
    recoveryPath: input.recoveryPath,
    method: "POST",
    requestId: intent.requestId,
    recoveryProof: intent.proof,
    inputHash: input.inputHash,
    idempotencyKey: input.idempotencyKey,
    containsSecret: false,
  };
}

export function createPrivateRecoveryCapsule(input: {
  serviceId: string; providerOrigin: string; recoveryPath: string; requestId: string; recoveryToken: string;
}) {
  if (!RECOVERY_REQUEST_ID_PATTERN.test(input.requestId)) throw new Error("INVALID_RECOVERY_REQUEST_ID");
  if (!RECOVERY_TOKEN_PATTERN.test(input.recoveryToken)) throw new Error("INVALID_RECOVERY_TOKEN");
  return {
    version: DELIVERY_RECOVERY_CAPSULE_VERSION,
    serviceId: input.serviceId,
    providerOrigin: input.providerOrigin,
    recoveryPath: input.recoveryPath,
    requestId: input.requestId,
    recoveryId: null,
    recoveryToken: input.recoveryToken,
    secret: true,
    warning: "Buyer-owned recovery credential. Store like a password; Bazaar cannot restore it.",
    next: "After a successful paid delivery, the buyer client must copy response.recovery.recoveryId into this capsule before using the recovery endpoint.",
  };
}
