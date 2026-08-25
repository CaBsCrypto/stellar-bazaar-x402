/**
 * Bazaar can independently reconcile a payment receipt, but it cannot certify
 * the quality or completion of a provider's work. Keep those two claims apart.
 */
export type DeliveryModel = "sync" | "async";
export type ProviderDeliveryStatus =
  | "result-returned"
  | "accepted-pending"
  | "not-confirmed";

export interface ProviderDelivery {
  model: DeliveryModel;
  status: ProviderDeliveryStatus;
  /** The provider's HTTP response is evidence of transport, not quality assurance. */
  evidence: "provider-response" | "provider-acceptance" | "none";
  resultAvailable: boolean;
  /** Provider-declared hash match is transport integrity, never quality assurance. */
  resultHashMatches?: boolean;
  independentlyVerified: false;
  message: string;
}

export const syncDeliveryReturned = (resultHashMatches = false): ProviderDelivery => ({
  model: "sync",
  status: "result-returned",
  evidence: "provider-response",
  resultAvailable: true,
  resultHashMatches,
  independentlyVerified: false,
  message: "Provider returned a synchronous response after settlement; Bazaar does not independently verify result quality.",
});

export const asyncDeliveryPending = (): ProviderDelivery => ({
  model: "async",
  status: "accepted-pending",
  evidence: "provider-acceptance",
  resultAvailable: false,
  independentlyVerified: false,
  message: "Provider accepted an asynchronous job after settlement; result delivery remains pending with the provider.",
});

export const unconfirmedDelivery = (): ProviderDelivery => ({
  model: "sync",
  status: "not-confirmed",
  evidence: "none",
  resultAvailable: false,
  independentlyVerified: false,
  message: "Settlement evidence does not prove provider delivery.",
});

export function deriveProviderDelivery(status: number, responseBody: unknown, resultHashMatches = false): ProviderDelivery {
  if (status === 202) return asyncDeliveryPending();
  if (status >= 200 && status < 300 && responseBody !== null && responseBody !== undefined) {
    return syncDeliveryReturned(resultHashMatches);
  }
  return unconfirmedDelivery();
}
