import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { decodePaymentResponseHeader } from "@x402/core/http";
import type { ServiceCard } from "./types.ts";
import { validateServiceCard } from "./discovery.ts";

export interface BazaarClientOptions {
  baseUrl: string;
  payerSecretKey?: string;
  maxPriceAllowedUsdc?: number;
  allowedNetworks?: string[];
}

export interface BazaarAgentExecutionResult<T = unknown> {
  ok: boolean;
  data: T;
  status: number;
  serviceCard: ServiceCard;
  payment: {
    settled: boolean;
    transactionHash?: string;
    payer?: string;
    recipient?: string;
    network: string;
    amount?: string;
    receiptUrl?: string;
  };
}

export class BazaarAgentClient {
  private baseUrl: string;
  private payerSecretKey?: string;
  private maxPriceAllowedUsdc: number;
  private allowedNetworks: string[];
  private paidFetch: typeof fetch;

  constructor(options: BazaarClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.payerSecretKey = options.payerSecretKey?.trim();
    this.maxPriceAllowedUsdc = options.maxPriceAllowedUsdc ?? 1.0;
    this.allowedNetworks = options.allowedNetworks ?? ["stellar:testnet"];

    if (this.payerSecretKey) {
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

  validatePaymentPolicy(card: ServiceCard): { allowed: boolean; reason?: string } {
    const outcomes = validateServiceCard(card);
    const failures = outcomes.filter((o) => o.status === "fail");
    if (failures.length > 0) {
      return { allowed: false, reason: `Conformance failure: ${failures.map((f) => f.reason).join("; ")}` };
    }

    if (!this.allowedNetworks.includes(card.network)) {
      return { allowed: false, reason: `Network ${card.network} is not permitted by agent policy.` };
    }

    const priceUsdc = Number(card.payment.amount);
    if (isNaN(priceUsdc) || priceUsdc > this.maxPriceAllowedUsdc) {
      return {
        allowed: false,
        reason: `Declared price ${card.payment.amount} USDC exceeds maximum permitted budget of ${this.maxPriceAllowedUsdc} USDC.`,
      };
    }

    return { allowed: true };
  }

  async executeService<T = unknown>(
    card: ServiceCard,
    params: Record<string, string | number | boolean>,
  ): Promise<BazaarAgentExecutionResult<T>> {
    const policyCheck = this.validatePaymentPolicy(card);
    if (!policyCheck.allowed) {
      throw new Error(`AGENT_POLICY_VIOLATION: ${policyCheck.reason}`);
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

    let txHash: string | undefined;
    let payer: string | undefined;
    let recipient: string | undefined;
    let amount: string | undefined;

    const paymentResponseHeader = response.headers.get("payment-response");
    if (paymentResponseHeader) {
      try {
        const decoded = decodePaymentResponseHeader(paymentResponseHeader);
        txHash = decoded.transaction;
        payer = decoded.payer;
      } catch {
        // Fallback to body payment object if present
      }
    }

    if (body.payment && typeof body.payment === "object") {
      const p = body.payment as Record<string, string>;
      txHash = txHash ?? p.transaction;
      payer = payer ?? p.payer;
      recipient = p.recipient;
      amount = p.amount;
    }

    return {
      ok: response.ok,
      data: (body.result ?? body.data ?? body) as T,
      status,
      serviceCard: card,
      payment: {
        settled: !!txHash,
        transactionHash: txHash,
        payer,
        recipient: recipient ?? card.payment.destination,
        network: card.network,
        amount: amount ?? card.payment.amount,
        receiptUrl: txHash ? `https://stellar.expert/explorer/testnet/tx/${txHash}` : undefined,
      },
    };
  }
}
