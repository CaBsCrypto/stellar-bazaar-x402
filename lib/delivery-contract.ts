/**
 * Delivery metadata required for providers that want to be consumable by an
 * agent. It is deliberately payment-agnostic: x402 authorizes a request, while
 * this contract tells a buyer how it will receive and verify the result.
 */
export type DeliveryMode = "sync" | "async";

/** Optional for legacy cards; every new order preserves its reviewed descriptor. */
export type DeliveryStorage =
  | { mode: 'text' }
  | { mode: 'external'; maxFiles: number }
  | { mode: 'bazaar'; maxFiles: number; maxTotalBytes: number; maxFileBytes: number };

export function deliveryStorage(contract?: DeliveryContract): DeliveryStorage {
  return contract?.storage ?? { mode: 'text' };
}

export interface DeliveryContract {
  storage?: DeliveryStorage;
  mode: DeliveryMode;
  estimatedDurationMs: number;
  result: {
    schemaVersion: string;
    contentType: string;
    terminalStatuses: string[];
    hash: { algorithm: "sha256"; required: true; scope: "canonical-result" };
  };
  status: { required: boolean; urlTemplate?: string; pollAfterMs?: number };
  callback: { supported: boolean; required: false; authentication: "none" | "provider-signed" };
  retention: { resultTtlHours: number; durable: boolean };
  idempotency: { required: boolean; key: "Idempotency-Key"; replay: "return-original" | "reject-conflict" };
  retry: { retryable: boolean; maxAttempts: number; failureSemantics: "terminal-error" | "retry-later" };
}

export const syncDeliveryContract = (): DeliveryContract => ({
  mode: "sync",
  estimatedDurationMs: 500,
  result: {
    schemaVersion: "1.0",
    contentType: "application/json",
    terminalStatuses: ["completed", "failed"],
    hash: { algorithm: "sha256", required: true, scope: "canonical-result" },
  },
  status: { required: false },
  callback: { supported: false, required: false, authentication: "none" },
  retention: { resultTtlHours: 0, durable: false },
  idempotency: { required: true, key: "Idempotency-Key", replay: "return-original" },
  retry: { retryable: true, maxAttempts: 2, failureSemantics: "retry-later" },
});
