import { createHash } from "node:crypto";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import { X402_NETWORK, X402_SCHEME, X402_USDC_CONTRACT } from "./x402-config.ts";

export const WEBSITE_INTELLIGENCE_X402 = {
  version: "bazaar.external-payment/v1",
  providerId: "website-intelligence-pilot",
  method: "POST",
  route: "/api/x402/providers/website-intelligence",
  upstream: "https://website-intelligence-provider.vercel.app/v1/audits",
  network: X402_NETWORK,
  scheme: X402_SCHEME,
  asset: X402_USDC_CONTRACT,
  amount: "10000",
  displayAmount: "0.001 USDC",
  maxTimeoutSeconds: 60,
  status: "testnet-validation-disabled",
} as const;

export type WebsiteIntelligenceInput = { url: string; language: "es" | "en" };
export type LedgerReceiptEvidence = {
  transaction: string;
  network: typeof X402_NETWORK;
  asset: string;
  amount: string;
  payTo: string;
  ledger: number;
  timestamp: string;
};

export function validateWebsiteIntelligenceInput(value: unknown): WebsiteIntelligenceInput {
  if (!value || typeof value !== "object") throw new Error("INVALID_INPUT");
  const input = value as Record<string, unknown>;
  if (typeof input.url !== "string" || !/^https:\/\/[a-z0-9.-]+(?:\/.*)?$/i.test(input.url)) throw new Error("INVALID_HTTPS_URL");
  if (input.language !== "es" && input.language !== "en") throw new Error("INVALID_LANGUAGE");
  return { url: input.url, language: input.language };
}

export function inputBinding(input: WebsiteIntelligenceInput) {
  const canonical = JSON.stringify({ language: input.language, url: input.url });
  return createHash("sha256").update(`${WEBSITE_INTELLIGENCE_X402.method}\n${WEBSITE_INTELLIGENCE_X402.route}\n${WEBSITE_INTELLIGENCE_X402.upstream}\n${canonical}`).digest("hex");
}

export function buildWebsiteIntelligenceRequirements(origin: string, seller: string, input: WebsiteIntelligenceInput): PaymentRequirements {
  if (!/^G[A-Z2-7]{55}$/.test(seller)) throw new Error("INVALID_SELLER_ADDRESS");
  return {
    scheme: WEBSITE_INTELLIGENCE_X402.scheme,
    network: WEBSITE_INTELLIGENCE_X402.network,
    payTo: seller,
    asset: WEBSITE_INTELLIGENCE_X402.asset,
    amount: WEBSITE_INTELLIGENCE_X402.amount,
    maxTimeoutSeconds: WEBSITE_INTELLIGENCE_X402.maxTimeoutSeconds,
    extra: { resourceUrl: `${origin}${WEBSITE_INTELLIGENCE_X402.route}`, method: "POST", inputHash: inputBinding(input), providerId: WEBSITE_INTELLIGENCE_X402.providerId },
  };
}

export function assertAcceptedRequirements(actual: PaymentRequirements, expected: PaymentRequirements) {
  for (const key of ["scheme", "network", "payTo", "asset", "amount"] as const) if (actual[key] !== expected[key]) throw new Error(`PAYMENT_${key.toUpperCase()}_MISMATCH`);
  if (actual.extra?.resourceUrl !== expected.extra?.resourceUrl || actual.extra?.method !== "POST" || actual.extra?.inputHash !== expected.extra?.inputHash) throw new Error("PAYMENT_REQUEST_BINDING_MISMATCH");
}

export function reconcileWebsiteIntelligenceReceipt(settled: SettleResponse, evidence: LedgerReceiptEvidence, expected: PaymentRequirements) {
  if (!settled.success) throw new Error("SETTLEMENT_NOT_SUCCESSFUL");
  if (!settled.transaction || settled.transaction !== evidence.transaction) throw new Error("RECEIPT_TRANSACTION_MISMATCH");
  if (settled.network !== expected.network || evidence.network !== expected.network) throw new Error("RECEIPT_NETWORK_MISMATCH");
  if (evidence.asset !== expected.asset) throw new Error("RECEIPT_ASSET_MISMATCH");
  if (evidence.amount !== expected.amount || (settled.amount && settled.amount !== expected.amount)) throw new Error("RECEIPT_AMOUNT_MISMATCH");
  if (evidence.payTo !== expected.payTo) throw new Error("RECEIPT_RECIPIENT_MISMATCH");
  if (!Number.isSafeInteger(evidence.ledger) || evidence.ledger <= 0 || Number.isNaN(Date.parse(evidence.timestamp))) throw new Error("RECEIPT_EVIDENCE_INVALID");
  return { ...evidence, reconciled: true as const, providerId: WEBSITE_INTELLIGENCE_X402.providerId };
}

export function assertExecutionGate(env: NodeJS.ProcessEnv = process.env) {
  if (env.WI_X402_EXECUTION_REVIEWED !== "true") throw new Error("EXECUTION_REVIEW_REQUIRED");
  if (!env.WI_X402_SELLER_ADDRESS) throw new Error("SELLER_ADDRESS_REQUIRED");
  return env.WI_X402_SELLER_ADDRESS;
}

export async function deliverWebsiteIntelligenceAfterSettlement<T>(options: {
  settled: SettleResponse;
  expected: PaymentRequirements;
  readLedgerEvidence: (transaction: string) => Promise<LedgerReceiptEvidence>;
  callProvider: () => Promise<T>;
}) {
  const evidence = await options.readLedgerEvidence(options.settled.transaction);
  const receipt = reconcileWebsiteIntelligenceReceipt(options.settled, evidence, options.expected);
  const result = await options.callProvider();
  return { result, receipt };
}
