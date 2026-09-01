import { isRetiredTestnetPayerAddress } from "./testnet-payer-safety.ts";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { canonicalInputHash, canonicalJSONStringify, WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT, WEBSITE_INTELLIGENCE_BINDING_EXTENSION, WEBSITE_INTELLIGENCE_DISPLAY_AMOUNT, WEBSITE_INTELLIGENCE_INPUT_HASH_ALGORITHM, WEBSITE_INTELLIGENCE_LOCAL_BASE_URL, WEBSITE_INTELLIGENCE_READINESS_VERSION, WEBSITE_INTELLIGENCE_ROUTE, type SettlementEvidence, validateWebsiteIntelligenceReadiness, reconcileWebsiteIntelligenceSettlement } from "./website-intelligence-readiness.ts";
import { X402_MAX_TIMEOUT_SECONDS, X402_NETWORK, X402_SCHEME, X402_USDC_CONTRACT } from "./x402-config.ts";
import { createPaidDeliveryEnvelope } from "./paid-delivery-envelope.ts";

export type BalancePreflight = { getBalance(address: string, asset: string): Promise<{ atomic: string; ledger: number }> };
export type ReceiptLookup = { getReceipt(transactionHash: string): Promise<SettlementEvidence | null> };

export type OneShotPreflightInput = {
  card: unknown;
  sourceUrl: string;
  expectedPayTo: string;
  payerAddress: string;
  requestBody: unknown;
  idempotencyKey: string;
  approvedCardHash: string;
  executeRequested: boolean;
  explicitOneShotAcknowledgement: boolean;
  now?: Date;
};

export type ProviderPreflightResponse = {
  status: number;
  inputHash: string;
  idempotencyKey: string;
  paymentRequired: PaymentRequired;
  accepted: PaymentRequirements;
};

export type ProviderPreflightFetch = (input: string, init: RequestInit) => Promise<Response>;

export function requireWebsiteIntelligenceLocalEndpoint(baseUrl: string): string {
  const base = new URL(baseUrl);
  const local = base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
  const verifiedPublic = base.protocol === "https:" && base.hostname === "website-intelligence-provider.vercel.app";
  if ((!local && !verifiedPublic) || base.username || base.password || base.search || base.hash || (base.pathname !== "/" && base.pathname !== "")) throw new Error("LOCAL_ENDPOINT_NOT_ALLOWLISTED");
  return new URL(WEBSITE_INTELLIGENCE_ROUTE, base.origin).toString();
}

function readPaymentRequired(response: Response): PaymentRequired {
  const encoded = response.headers.get("payment-required");
  if (!encoded) throw new Error("MISSING_PAYMENT_REQUIRED_HEADER");
  try { return decodePaymentRequiredHeader(encoded); } catch { throw new Error("MALFORMED_PAYMENT_REQUIRED_HEADER"); }
}

export function validateWebsiteIntelligencePaymentRequired(paymentRequired: PaymentRequired, expected: { payTo: string; inputHash: string; cardHash: string; resourceUrl: string }): PaymentRequirements {
  if (paymentRequired.x402Version !== 2) throw new Error("X402_VERSION_NOT_ALLOWED");
  const resourceUrl = paymentRequired.resource?.url;
  if (resourceUrl !== expected.resourceUrl) throw new Error("SIGNED_PUBLIC_RESOURCE_MISMATCH");
  const extension = (paymentRequired.extensions as Record<string, { info?: Record<string, unknown> }> | undefined)?.[WEBSITE_INTELLIGENCE_BINDING_EXTENSION]?.info;
  const bindingMatches = extension?.algorithm === WEBSITE_INTELLIGENCE_INPUT_HASH_ALGORITHM && extension.method === "POST" && extension.route === WEBSITE_INTELLIGENCE_ROUTE && extension.inputHash === expected.inputHash && extension.cardHash === expected.cardHash;
  const matches = paymentRequired.accepts.filter(requirement => requirement.scheme === X402_SCHEME && requirement.network === X402_NETWORK && requirement.payTo === expected.payTo && requirement.asset === X402_USDC_CONTRACT && requirement.amount === WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT && requirement.maxTimeoutSeconds === X402_MAX_TIMEOUT_SECONDS && (requirement.extra as Record<string, unknown> | undefined)?.areFeesSponsored === true);
  if (!bindingMatches) throw new Error("REQUEST_BINDING_EXTENSION_MISMATCH");
  if (matches.length !== 1) throw new Error("PAYMENT_REQUIREMENTS_NOT_EXACTLY_APPROVED");
  return matches[0];
}

export async function requestWebsiteIntelligencePaymentChallenge(input: {
  requestBody: unknown;
  idempotencyKey: string;
  timeoutMs?: number;
  fetchImpl?: ProviderPreflightFetch;
  localBaseUrl?: string;
  expectedPayTo?: string;
  approvedCardHash?: string;
  publicResourceUrl?: string;
}): Promise<ProviderPreflightResponse> {
  if (!input.requestBody || typeof input.requestBody !== "object" || Array.isArray(input.requestBody)) throw new Error("INVALID_JSON_REQUEST_BODY");
  if (!input.idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const timeoutMs = input.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new Error("INVALID_TIMEOUT");
  const endpoint = requireWebsiteIntelligenceLocalEndpoint(input.localBaseUrl ?? WEBSITE_INTELLIGENCE_LOCAL_BASE_URL);
  const body = canonicalJSONStringify(input.requestBody);
  const inputHash = canonicalInputHash(input.requestBody);
  const response = await (input.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
      "x-bazaar-input-hash": inputHash,
      "x-bazaar-input-hash-algorithm": WEBSITE_INTELLIGENCE_INPUT_HASH_ALGORITHM,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 402) throw new Error(`EXPECTED_PAYMENT_REQUIRED_${response.status}`);
  if (!(response.headers.get("cache-control") ?? "").toLowerCase().includes("no-store")) throw new Error("PAYMENT_REQUIRED_MUST_BE_NO_STORE");
  const paymentRequired = readPaymentRequired(response);
  const accepted = validateWebsiteIntelligencePaymentRequired(paymentRequired, { payTo: input.expectedPayTo ?? "", inputHash, cardHash: input.approvedCardHash ?? "", resourceUrl: input.publicResourceUrl ?? "" });
  return { status: response.status, inputHash, idempotencyKey: input.idempotencyKey, paymentRequired, accepted };
}

export async function executeWebsiteIntelligenceOneShot(input: {
  endpoint: string;
  requestBody: unknown;
  idempotencyKey: string;
  expected: Omit<SettlementEvidence, "status" | "transactionHash" | "ledger" | "issuedAt" | "expiresAt" | "settledAt">;
  acknowledgementOne: boolean;
  acknowledgementTwo: boolean;
  balanceAtomic: string;
  createPaidFetch: (beforePayment: () => void) => ProviderPreflightFetch;
}) {
  const endpointUrl = new URL(input.endpoint);
  if (requireWebsiteIntelligenceLocalEndpoint(endpointUrl.origin) !== input.endpoint) throw new Error("LOCAL_ENDPOINT_NOT_ALLOWLISTED");
  if (!input.acknowledgementOne || !input.acknowledgementTwo) throw new Error("TWO_EXPLICIT_ACKNOWLEDGEMENTS_REQUIRED");
  if (!/^\d+$/.test(input.balanceAtomic) || BigInt(input.balanceAtomic) < BigInt(WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT)) throw new Error("INSUFFICIENT_PREFLIGHT_BALANCE");
  let attempts = 0;
  const beforePayment = () => { attempts += 1; if (attempts > 1) throw new Error("ONE_PAYMENT_ATTEMPT_LIMIT_EXCEEDED"); };
  const response = await input.createPaidFetch(beforePayment)(input.endpoint, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", "idempotency-key": input.idempotencyKey, "x-bazaar-input-hash": input.expected.inputHash, "x-bazaar-input-hash-algorithm": WEBSITE_INTELLIGENCE_INPUT_HASH_ALGORITHM }, body: canonicalJSONStringify(input.requestBody), redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (attempts !== 1) throw new Error("EXPECTED_EXACTLY_ONE_PAYMENT_ATTEMPT");
  if (!response.ok) throw new Error(`PAID_REQUEST_FAILED_${response.status}`);
  const encodedReceipt = response.headers.get("payment-response");
  if (!encodedReceipt) throw new Error("MISSING_PAYMENT_RESPONSE_HEADER");
  let settlement; try { settlement = decodePaymentResponseHeader(encodedReceipt); } catch { throw new Error("MALFORMED_PAYMENT_RESPONSE_HEADER"); }
  if (!settlement.success || settlement.network !== X402_NETWORK || !/^[0-9a-f]{64}$/i.test(settlement.transaction)) throw new Error("INVALID_SETTLEMENT_RESPONSE");
  const body = await response.json() as Record<string, unknown>;
  const receipt = body.receipt as SettlementEvidence | undefined;
  if (!receipt || !("result" in body) || typeof body.resultHash !== "string" || canonicalInputHash(body.result) !== body.resultHash) throw new Error("INVALID_RESULT_ENVELOPE");
  if (receipt.transactionHash !== settlement.transaction) throw new Error("RECEIPT_TRANSACTION_MISMATCH");
  const reconciliation = reconcileWebsiteIntelligenceSettlement(receipt, input.expected, body.result, body.resultHash);
  if (!reconciliation.reconciled) throw new Error("RECEIPT_OR_RESULT_RECONCILIATION_FAILED");
  const envelope = createPaidDeliveryEnvelope({
    policy: { serviceId: "website-intelligence", serviceVersion: "1.0.0", cardUrl: new URL("/v1/service-card", endpointUrl.origin).toString(), cardHash: input.expected.cardHash, method: "POST", route: input.expected.route, inputHash: input.expected.inputHash, idempotencyKey: input.idempotencyKey, scheme: "exact", network: "stellar:testnet", asset: input.expected.asset, atomicAmount: input.expected.amount, payTo: input.expected.payTo },
    transactionHash: settlement.transaction, ledger: receipt.ledger, result: body.result, resultHash: reconciliation.resultHash,
  });
  return { status: response.status, attempts, transactionHash: settlement.transaction, ledger: receipt.ledger, resultHash: reconciliation.resultHash, result: body.result, receipt, envelope, reconciled: true };
}

export async function prepareWebsiteIntelligenceOneShot(input: OneShotPreflightInput, balance?: BalancePreflight) {
  const inputHash = canonicalInputHash(input.requestBody);
  const readiness = validateWebsiteIntelligenceReadiness(input.card, { expectedPayTo: input.expectedPayTo, approvedCardHash: input.approvedCardHash, sourceUrl: input.sourceUrl, now: input.now });
  const payerValid = /^G[A-Z2-7]{55}$/.test(input.payerAddress) && !isRetiredTestnetPayerAddress(input.payerAddress);
  const balanceSnapshot = readiness.ready && balance ? await balance.getBalance(input.payerAddress, String((input.card as Record<string, any>).payment?.asset)) : null;
  let sufficientBalance = false;
  if (balanceSnapshot && /^\d+$/.test(balanceSnapshot.atomic)) {
    try { sufficientBalance = BigInt(balanceSnapshot.atomic) >= BigInt(WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT); } catch { sufficientBalance = false; }
  }
  // This branch intentionally cannot arm signing or settlement. It only proves
  // that discovery, request binding and the balance policy fail closed.
  const armed = false;
  return {
    version: WEBSITE_INTELLIGENCE_READINESS_VERSION,
    mode: input.executeRequested ? "manual-one-shot-requested" : "discovery-preflight-only",
    readiness,
    payer: { valid: payerValid, retired: isRetiredTestnetPayerAddress(input.payerAddress), displayed: payerValid ? `${input.payerAddress.slice(0, 6)}…${input.payerAddress.slice(-6)}` : "invalid" },
    balance: balanceSnapshot ? { checked: true, sufficient: sufficientBalance, ledger: balanceSnapshot.ledger } : { checked: false, sufficient: false, ledger: null },
    request: { inputHash, inputHashAlgorithm: WEBSITE_INTELLIGENCE_INPUT_HASH_ALGORITHM, idempotencyKey: input.idempotencyKey },
    caps: { maximumAtomic: WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT, assetDecimals: 7, friendly: WEBSITE_INTELLIGENCE_DISPLAY_AMOUNT, attempts: 0, network: "stellar:testnet" },
    armed,
    signerEnabled: false,
    settlementEnabled: false,
    stopBeforeSignature: true,
    stopReason: "PAYMENT_INACTIVE_SIGNER_AND_SETTLEMENT_DISABLED",
  };
}

export async function reconcileOneShotEvidence(receiptLookup: ReceiptLookup, transactionHash: string, expected: Parameters<typeof reconcileWebsiteIntelligenceSettlement>[1], result: unknown, expectedResultHash: string) {
  const receipt = await receiptLookup.getReceipt(transactionHash);
  if (!receipt) return { reconciled: false, outcomes: [{ rule: "receipt.lookup", ok: false, reason: "Receipt no disponible en ledger." }] };
  return reconcileWebsiteIntelligenceSettlement(receipt, expected, result, expectedResultHash);
}
