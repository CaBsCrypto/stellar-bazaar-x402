import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequirements } from "@x402/core/types";
import { WEBSITE_INTELLIGENCE_X402, inputBinding, type WebsiteIntelligenceInput } from "./website-intelligence-x402.ts";

export type WebsiteIntelligencePaymentCard = {
  version: "bazaar.payment-service-card/v1";
  id: typeof WEBSITE_INTELLIGENCE_X402.providerId;
  endpoint: { method: "POST"; url: string };
  payment: {
    status: "testnet-pending-execution-review";
    x402Version: 2;
    network: typeof WEBSITE_INTELLIGENCE_X402.network;
    scheme: typeof WEBSITE_INTELLIGENCE_X402.scheme;
    asset: string;
    atomicAmount: string;
    payTo: string;
    maxTimeoutSeconds: number;
  };
};

export function expectedWebsiteIntelligenceCard(payTo: string): WebsiteIntelligencePaymentCard {
  if (!/^G[A-Z2-7]{55}$/.test(payTo)) throw new Error("INVALID_CARD_PAY_TO");
  return {
    version: "bazaar.payment-service-card/v1",
    id: WEBSITE_INTELLIGENCE_X402.providerId,
    endpoint: { method: "POST", url: WEBSITE_INTELLIGENCE_X402.upstream },
    payment: {
      status: "testnet-pending-execution-review",
      x402Version: 2,
      network: WEBSITE_INTELLIGENCE_X402.network,
      scheme: WEBSITE_INTELLIGENCE_X402.scheme,
      asset: WEBSITE_INTELLIGENCE_X402.asset,
      atomicAmount: WEBSITE_INTELLIGENCE_X402.amount,
      payTo,
      maxTimeoutSeconds: WEBSITE_INTELLIGENCE_X402.maxTimeoutSeconds,
    },
  };
}

export function inspectWebsiteIntelligence402(header: string | null, card: WebsiteIntelligencePaymentCard, input: WebsiteIntelligenceInput) {
  if (!header) throw new Error("PAYMENT_REQUIRED_HEADER_MISSING");
  let decoded;
  try { decoded = decodePaymentRequiredHeader(header); } catch { throw new Error("PAYMENT_REQUIRED_HEADER_MALFORMED"); }
  if (decoded.x402Version !== 2) throw new Error("X402_VERSION_MISMATCH");
  const candidates = decoded.accepts.filter((item) =>
    item.scheme === card.payment.scheme && item.network === card.payment.network && item.asset === card.payment.asset &&
    item.amount === card.payment.atomicAmount && item.payTo === card.payment.payTo,
  );
  if (candidates.length !== 1) throw new Error("PAYMENT_REQUIREMENTS_NOT_EXACTLY_ONE_MATCH");
  const requirement = candidates[0] as PaymentRequirements;
  if (requirement.maxTimeoutSeconds > card.payment.maxTimeoutSeconds) throw new Error("PAYMENT_TIMEOUT_EXCEEDS_CARD");
  if (requirement.extra?.method !== card.endpoint.method || requirement.extra?.providerId !== card.id || requirement.extra?.inputHash !== inputBinding(input)) throw new Error("PAYMENT_REQUEST_BINDING_MISMATCH");
  if (requirement.extra?.providerUrl !== card.endpoint.url) throw new Error("PAYMENT_PROVIDER_URL_MISMATCH");
  return requirement;
}

export async function inspectWebsiteIntelligenceChallenge(url: string, input: WebsiteIntelligenceInput, card: WebsiteIntelligencePaymentCard, fetcher: typeof fetch = fetch) {
  if (url !== card.endpoint.url) throw new Error("UNTRUSTED_PROVIDER_URL");
  const response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), redirect: "error" });
  if (response.status !== 402) throw new Error(`EXPECTED_402_GOT_${response.status}`);
  return inspectWebsiteIntelligence402(response.headers.get("payment-required"), card, input);
}
