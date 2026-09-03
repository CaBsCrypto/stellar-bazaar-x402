import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { decodePaymentResponseHeader } from "@x402/core/http";
import type { SettleResponse } from "@x402/core/types";
import type { ServiceCard, PaymentScheme } from "./types.ts";
import { validateServiceCard } from "./discovery.ts";
import { assertActiveTestnetPayerSecret } from "./testnet-payer-safety.ts";
import { deriveProviderDelivery, type ProviderDelivery } from "./delivery-boundaries.ts";
import { hasMatchingProviderResultHash } from "./delivery-result.ts";
import {
  BAZAAR_FEE_BPS,
  BAZAAR_TREASURY_ADDRESS,
  FEE_SPLIT_TESTNET_USDC_ASSET,
  reconcileFeeSplitReceipt,
  type FeeSplitPolicy,
  type FeeSplitReceipt,
  type RuleOutcome,
} from "./fee-split-design.ts";

export interface SplitPaymentDetail {
  providerAmount: string;
  treasuryAmount: string;
  providerDestination: string;
  treasuryDestination: string;
  feeBps: number;
}

export interface SettlementReceiptContext {
  receipt: SettleResponse;
  card: ServiceCard;
  requestUrl: string;
  expected: {
    network: string;
    asset: string;
    amount: string;
    destination: string;
    scheme?: PaymentScheme;
    split?: SplitPaymentDetail;
  };
}

export interface BazaarClientOptions {
  baseUrl: string;
  payerSecretKey?: string;
  maxPriceAllowedUsdc?: number;
  allowedNetworks?: string[];
  allowedAssets?: string[];
  allowedSchemes?: PaymentScheme[];
  treasuryAddress?: string;
  receiptVerifier?: (context: SettlementReceiptContext) => boolean | Promise<boolean>;
}

export interface BazaarAgentExecutionResult<T = unknown> {
  ok: boolean;
  data: T;
  status: number;
  serviceCard: ServiceCard;
  payment: {
    settled: boolean;
    receiptVerified: boolean;
    transactionHash?: string;
    payer?: string;
    recipient?: string;
    network: string;
    amount?: string;
    declaredAmount: string;
    asset: string;
    scheme?: PaymentScheme;
    receiptUrl?: string;
    split?: SplitPaymentDetail;
  };
  delivery: ProviderDelivery;
}

export interface DeFindexStakingStatus {
  serviceId: string;
  isStaked: boolean;
  status: "Draft" | "Reviewed" | "Published" | "Suspended" | "Revoked" | "unknown";
  token?: string;
  vault?: string;
  principalAmountAtomic?: string;
  principalAmountUsdc?: string;
  shares?: string;
  stakedLedger?: number;
  currentLedger?: number;
  minBondingLedgers: number;
  isBonded: boolean;
  unbondingPenaltyBps: number;
  yieldSplitBps: {
    provider: number;
    treasury: number;
  };
  details?: Record<string, unknown>;
}

export class BazaarAgentClient {
  private baseUrl: string;
  private payerSecretKey?: string;
  private maxPriceAllowedUsdc: number;
  private allowedNetworks: string[];
  private allowedAssets: string[];
  private allowedSchemes: PaymentScheme[];
  private treasuryAddress: string;
  private receiptVerifier?: BazaarClientOptions["receiptVerifier"];
  private paidFetch: typeof fetch;

  constructor(options: BazaarClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.payerSecretKey = options.payerSecretKey?.trim();
    this.maxPriceAllowedUsdc = options.maxPriceAllowedUsdc ?? 1.0;
    this.allowedNetworks = options.allowedNetworks ?? ["stellar:testnet"];
    this.allowedAssets = options.allowedAssets ?? ["USDC"];
    this.allowedSchemes = options.allowedSchemes ?? ["exact", "split-exact"];
    this.treasuryAddress = options.treasuryAddress ?? BAZAAR_TREASURY_ADDRESS;
    this.receiptVerifier = options.receiptVerifier;

    if (this.payerSecretKey) {
      assertActiveTestnetPayerSecret(this.payerSecretKey);
      const signer = createEd25519Signer(this.payerSecretKey, "stellar:testnet");
      const client = new x402Client().register("stellar:testnet", new ExactStellarScheme(signer));
      this.paidFetch = wrapFetchWithPayment(fetch, client);
    } else {
      this.paidFetch = fetch;
    }
  }

  async searchServicesREST(query: string): Promise<ServiceCard[]> {
    const res = await fetch(`${this.baseUrl}/api/discovery/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`Search failed with status ${res.status}`);
    const data = await res.json();
    return data.results?.map((r: { resource: ServiceCard }) => r.resource) ?? [];
  }

  async searchServicesMCP(query: string): Promise<ServiceCard[]> {
    const res = await fetch(`${this.baseUrl}/api/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "search_services",
          arguments: { query },
        },
      }),
    });
    if (!res.ok) throw new Error(`MCP search failed with status ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data.result?.content?.[0]?.text ?? "{}");
    return parsed.results?.map((r: { resource: ServiceCard }) => r.resource) ?? [];
  }

  calculateSplitBreakdown(card: ServiceCard): SplitPaymentDetail {
    const grossAmount = card.payment.amount;
    const grossDecimal = parseFloat(grossAmount);
    if (isNaN(grossDecimal) || grossDecimal <= 0) {
      throw new Error(`INVALID_AMOUNT: cannot calculate split on amount "${grossAmount}"`);
    }

    const atomicGross = BigInt(Math.round(grossDecimal * 10_000_000));
    const feeNumerator = atomicGross * BigInt(BAZAAR_FEE_BPS);
    if (feeNumerator % 10_000n !== 0n) {
      throw new Error("ROUNDING_ERROR: gross amount cannot be split into exact 99/1 without remainder.");
    }

    const feeAtomic = feeNumerator / 10_000n;
    const providerNetAtomic = atomicGross - feeAtomic;

    return {
      providerAmount: (Number(providerNetAtomic) / 10_000_000).toFixed(7).replace(/\.?0+$/, ""),
      treasuryAmount: (Number(feeAtomic) / 10_000_000).toFixed(7).replace(/\.?0+$/, ""),
      providerDestination: card.payment.destination,
      treasuryDestination: this.treasuryAddress,
      feeBps: BAZAAR_FEE_BPS,
    };
  }

  validatePaymentPolicy(card: ServiceCard): { allowed: boolean; reason?: string } {
    const outcomes = validateServiceCard(card);
    const failures = outcomes.filter((o) => o.status === "fail");
    if (failures.length > 0) {
      return { allowed: false, reason: `Conformance failure: ${failures.map((f) => f.reason).join("; ")}` };
    }

    if (!this.allowedNetworks.includes(card.network)) {
      return { allowed: false, reason: `Network ${card.network} is not permitted by agent policy.` };
    }

    if (!this.allowedAssets.includes(card.payment.asset)) {
      return { allowed: false, reason: `Asset ${card.payment.asset} is not permitted by agent policy.` };
    }

    if (!this.allowedSchemes.includes(card.payment.scheme)) {
      return { allowed: false, reason: `Scheme ${card.payment.scheme} is not permitted by agent policy.` };
    }

    const priceUsdc = Number(card.payment.amount);
    if (isNaN(priceUsdc) || priceUsdc > this.maxPriceAllowedUsdc) {
      return {
        allowed: false,
        reason: `Declared price ${card.payment.amount} USDC exceeds maximum permitted budget of ${this.maxPriceAllowedUsdc} USDC.`,
      };
    }

    if (card.payment.scheme === "split-exact") {
      if (card.payment.destination === this.treasuryAddress) {
        return {
          allowed: false,
          reason: "Provider destination cannot be identical to Bazaar treasury in split-exact scheme.",
        };
      }
      try {
        this.calculateSplitBreakdown(card);
      } catch (err: unknown) {
        return {
          allowed: false,
          reason: `FeeSplitRouter division check failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    return { allowed: true };
  }

  verifyFeeSplitReceipt(policy: FeeSplitPolicy, receipt: FeeSplitReceipt): { ok: boolean; outcomes: RuleOutcome[] } {
    const outcomes = reconcileFeeSplitReceipt(policy, receipt);
    const ok = outcomes.every((o) => o.ok);
    return { ok, outcomes };
  }

  async checkDeFindexStakingStatus(
    serviceId: string,
    options?: { currentLedger?: number },
  ): Promise<DeFindexStakingStatus> {
    const minBondingLedgers = 17280; // ~1 día en ledgers
    const unbondingPenaltyBps = 200; // 2% penalización
    const yieldSplitBps = {
      provider: 8500, // 85%
      treasury: 1500, // 15%
    };

    try {
      const res = await fetch(`${this.baseUrl}/api/provider-self-listing/${encodeURIComponent(serviceId)}`);
      if (res.ok) {
        const data = await res.json();
        const record = data.record ?? data;
        const stake = record.stake;

        if (stake && stake.principalAmount) {
          const stakedLedger = Number(stake.stakedLedger ?? 0);
          const currentLedger = options?.currentLedger ?? stakedLedger + minBondingLedgers;
          const isBonded = (currentLedger - stakedLedger) >= minBondingLedgers;
          const principalAtomic = String(stake.principalAmount);
          const principalUsdc = (Number(principalAtomic) / 10_000_000).toString();

          return {
            serviceId,
            isStaked: true,
            status: record.status ?? "Published",
            token: stake.token ?? FEE_SPLIT_TESTNET_USDC_ASSET,
            vault: stake.vault ?? "CDEFINDEXVAULTTESTNET0000000000000000000000000000000000000000",
            principalAmountAtomic: principalAtomic,
            principalAmountUsdc: principalUsdc,
            shares: String(stake.shares ?? principalAtomic),
            stakedLedger,
            currentLedger,
            minBondingLedgers,
            isBonded,
            unbondingPenaltyBps,
            yieldSplitBps,
            details: record,
          };
        }
      }
    } catch {
      // Fallback fail-closed
    }

    return {
      serviceId,
      isStaked: false,
      status: "unknown",
      minBondingLedgers,
      isBonded: false,
      unbondingPenaltyBps,
      yieldSplitBps,
    };
  }

  async executeService<T = unknown>(
    card: ServiceCard,
    params: Record<string, string | number | boolean>,
  ): Promise<BazaarAgentExecutionResult<T>> {
    const policyCheck = this.validatePaymentPolicy(card);
    if (!policyCheck.allowed) {
      throw new Error(`AGENT_POLICY_VIOLATION: ${policyCheck.reason}`);
    }
    if (!this.payerSecretKey) {
      throw new Error("PAYER_SECRET_REQUIRED: paid execution requires a server-only Testnet payer.");
    }
    if (!this.receiptVerifier) {
      throw new Error(
        "RECEIPT_RECONCILIATION_REQUIRED: paid dynamic execution is disabled until a verifier checks network, asset, amount and destination against the ServiceCard.",
      );
    }

    let resolvedRoute = card.routeTemplate;
    for (const [key, value] of Object.entries(params)) {
      resolvedRoute = resolvedRoute.replace(`{${key}}`, encodeURIComponent(String(value)));
    }

    const targetUrl = resolvedRoute.startsWith("http")
      ? resolvedRoute
      : `${this.baseUrl}${resolvedRoute}`;

    const response = await this.paidFetch(targetUrl);
    const status = response.status;
    const body = (await response.json()) as Record<string, unknown>;

    const paymentResponseHeader = response.headers.get("payment-response");
    if (!paymentResponseHeader) {
      throw new Error("PAYMENT_RECEIPT_MISSING: provider response has no PAYMENT-RESPONSE header.");
    }

    let receipt: SettleResponse;
    try {
      receipt = decodePaymentResponseHeader(paymentResponseHeader);
    } catch {
      throw new Error("PAYMENT_RECEIPT_MALFORMED: PAYMENT-RESPONSE could not be decoded.");
    }
    if (!response.ok || !receipt.success || !receipt.transaction) {
      throw new Error("PAYMENT_NOT_SETTLED: provider did not return a successful settlement receipt.");
    }
    if (receipt.network !== card.network) {
      throw new Error("PAYMENT_RECEIPT_MISMATCH: receipt network differs from the ServiceCard.");
    }

    const splitDetail = card.payment.scheme === "split-exact"
      ? this.calculateSplitBreakdown(card)
      : undefined;

    const receiptVerified = await this.receiptVerifier({
      receipt,
      card,
      requestUrl: targetUrl,
      expected: {
        network: card.network,
        asset: card.payment.asset,
        amount: card.payment.amount,
        destination: card.payment.destination,
        scheme: card.payment.scheme,
        split: splitDetail,
      },
    });
    if (!receiptVerified) {
      throw new Error("PAYMENT_RECEIPT_MISMATCH: receipt does not reconcile with the ServiceCard.");
    }

    const delivery = deriveProviderDelivery(status, body, hasMatchingProviderResultHash(body));

    return {
      ok: response.ok,
      data: (delivery.resultAvailable ? body.result ?? body.data ?? body : body) as T,
      status,
      serviceCard: card,
      payment: {
        settled: true,
        receiptVerified: true,
        transactionHash: receipt.transaction,
        payer: receipt.payer,
        recipient: card.payment.destination,
        network: receipt.network,
        amount: receipt.amount,
        declaredAmount: card.payment.amount,
        asset: card.payment.asset,
        scheme: card.payment.scheme,
        receiptUrl: `https://stellar.expert/explorer/testnet/tx/${receipt.transaction}`,
        split: splitDetail,
      },
      delivery,
    };
  }
}

