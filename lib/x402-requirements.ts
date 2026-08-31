import type { PaymentRequirements } from "@x402/core/types";

export type BoundPaymentRequest = {
  scheme: string;
  network: string;
  payTo: string;
  asset: string;
  amount: string;
  maxTimeoutSeconds: number;
  resourceUrl: string;
  method: string;
  route: string;
  inputHash: string;
};

export function paymentRequirementMismatches(
  accepted: PaymentRequirements,
  expected: BoundPaymentRequest,
): string[] {
  const extra = accepted.extra as Record<string, unknown> | undefined;
  const checks: Array<[string, unknown, unknown]> = [
    ["scheme", accepted.scheme, expected.scheme],
    ["network", accepted.network, expected.network],
    ["payTo", accepted.payTo, expected.payTo],
    ["asset", accepted.asset, expected.asset],
    ["amount", accepted.amount, expected.amount],
    ["maxTimeoutSeconds", accepted.maxTimeoutSeconds, expected.maxTimeoutSeconds],
    ["extra.resourceUrl", extra?.resourceUrl, expected.resourceUrl],
    ["extra.method", extra?.method, expected.method],
    ["extra.route", extra?.route, expected.route],
    ["extra.inputHash", extra?.inputHash, expected.inputHash],
  ];
  return checks.filter(([, actual, wanted]) => actual !== wanted).map(([field]) => field);
}
