import { TESTNET_ASSETS, selectPaymentOption, type AssetBalances } from "./payment-options.ts";
import { paymentBinding, type PaymentJournalStore, type PaymentJournal } from "./pilot-payment-store.ts";
import { readTestnetBalances } from "./testnet-balances.ts";
import { paymentRequirementMismatches } from "./x402-requirements.ts";
import { preserveDeliverable, type DeliveryCopyInput, type DeliveryCopyResult } from "./deliverable-client.ts";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { decodePaymentResponseHeader } from "@x402/core/http";
import type { SettleResponse } from "@x402/core/types";
import type { ServiceCard, PaymentScheme } from "./types.ts";
import { providerRequestUrl } from "./provider-request-url.ts";
import { appendActivity } from "./activity-client.ts";
import type { ActivityInput } from "./activity.ts";
import { appendOperationHistory, decimalToAtomic, type HistoryClientOptions } from "./operation-history-client.ts";
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
    contract?: string;
    amount: string;
    destination: string;
    scheme?: PaymentScheme;
    split?: SplitPaymentDetail;
  };
}

export interface BazaarClientOptions {
  history?: HistoryClientOptions;
  baseUrl: string;
  payerSecretKey?: string;
  maxPriceAllowedUsdc?: number;
  maxAmountByAsset?: Partial<Record<"USDC"|"XLM",string>>;
  paymentJournal?: PaymentJournalStore;
  readBalances?: () => Promise<AssetBalances>;
  allowedNetworks?: string[];
  allowedAssets?: string[];
  allowedSchemes?: PaymentScheme[];
  treasuryAddress?: string;
  receiptVerifier?: (context: SettlementReceiptContext) => boolean | Promise<boolean>;
}

export interface BazaarAgentExecutionResult<T = unknown> {
  library?: DeliveryCopyResult;
  history?: { status: "recorded" | "failed" | "disabled"; clientOperationId: string };
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
  private history?: HistoryClientOptions;
  private taskStart?: Promise<void>;
  private activityFailed = false;
  private eventSequence = 0;
  private async reportStep(kind: ActivityInput["kind"], title: string, operationId?: string, serviceId?: string) {
    if (!this.history?.taskId) return;
    const event: ActivityInput = { eventId: operationId ? `${operationId}:${kind}` : (kind === "task-started" || kind === "task-completed") ? `${this.history.taskId}:${kind}` : String(Date.now()) + ":" + String(++this.eventSequence).padStart(8,"0") + ":" + crypto.randomUUID(), taskId: this.history.taskId, title, kind,
      mode: this.history.mode ?? "testnet", agentId: this.history.agentId, operationId, serviceId };
    if(await appendActivity(this.baseUrl,this.history,event)==="failed") this.activityFailed=true;
  }
  private async ensureTask() {
    if (!this.history?.taskId) return;
    this.taskStart ??= this.reportStep("task-started",this.history.taskTitle ?? "Actividad de mi agente");
    await this.taskStart;
  }
  /** Call once the whole task ends, including all purchases. Does not execute or pay. */
  async finishTask(failed = false) {
    await this.ensureTask(); await this.reportStep(failed ? "error" : "task-completed", failed ? "Tarea interrumpida" : "Tarea terminada");
    return { status: this.activityFailed ? "failed" : this.history?.taskId ? "recorded" : "disabled" };
  }

  /**
   * Generates a personalized magic-link for the human to view their private history and deliverables.
   * Format: https://bazaar-origin/history#token=bz_read_...
   */
  getHumanHistoryLink(customBaseUrl?: string): string | null {
    if (!this.history?.readToken) return null;
    const base = (customBaseUrl ?? this.baseUrl).replace(/\/$/, "");
    return `${base}/history#token=${encodeURIComponent(this.history.readToken.trim())}`;
  }

  private baseUrl: string;
  private payerSecretKey?: string;
  private maxPriceAllowedUsdc: number;
  private allowedNetworks: string[];
  private allowedAssets: string[];
  private allowedSchemes: PaymentScheme[];
  private treasuryAddress: string;
  private receiptVerifier?: BazaarClientOptions["receiptVerifier"];
  private paidFetch: typeof fetch;
  private budgets:Record<string,string>;
  private paymentJournal?:PaymentJournalStore;
  private readBalances?:()=>Promise<AssetBalances>;

  constructor(options: BazaarClientOptions) {
    this.history = options.history;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.payerSecretKey = options.payerSecretKey?.trim();
    this.maxPriceAllowedUsdc = options.maxPriceAllowedUsdc ?? 1.0;
    this.budgets = {USDC:String(this.maxPriceAllowedUsdc),...options.maxAmountByAsset};
    this.paymentJournal=options.paymentJournal;
    this.readBalances=options.readBalances;
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
    await this.ensureTask(); await this.reportStep("search", "Búsqueda de servicios");
    const res = await fetch(`${this.baseUrl}/api/discovery/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`Search failed with status ${res.status}`);
    const data = await res.json();
    return data.results?.map((r: { resource: ServiceCard }) => r.resource) ?? [];
  }

  async searchServicesMCP(query: string): Promise<ServiceCard[]> {
    await this.ensureTask(); await this.reportStep("search", "Búsqueda de servicios por MCP");
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

    try {
      const limit=this.budgets[card.payment.asset];
      if(limit === undefined || BigInt(decimalToAtomic(card.payment.amount)) > BigInt(decimalToAtomic(limit))) return {allowed:false,reason:`Declared price exceeds maximum permitted budget for ${card.payment.asset}.`};
      if(card.payment.asset === "XLM" && card.payment.scheme !== "exact") return {allowed:false,reason:"XLM requires exact scheme."};
    } catch {return {allowed:false,reason:"Invalid monetary amount or budget."};}

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

  async executeService<T = unknown>(card:ServiceCard, params:Record<string,string|number|boolean>, options?:{operationId:string;preferredAsset?:"USDC"|"XLM"}):Promise<BazaarAgentExecutionResult<T>> {
    if(!card.paymentOptions && card.payment.asset !== "XLM" && !options) return this.executeServiceRecorded<T>(card,params);
    if(card.id !== "swap-risk-quote") throw Error("MULTI_ASSET_PILOT_SANDBOX_ONLY");
    if(!options?.operationId || !/^[a-zA-Z0-9_-]{8,128}$/.test(options.operationId) || !this.paymentJournal) throw Error("DURABLE_OPERATION_REQUIRED: provide operationId and private paymentJournal.");
    if(!this.payerSecretKey || !this.receiptVerifier) throw Error("PAYER_AND_RECEIPT_VERIFIER_REQUIRED");
    const binding=paymentBinding({card,params,preferredAsset:options.preferredAsset ?? null,base:this.baseUrl,payer:createEd25519Signer(this.payerSecretKey,"stellar:testnet").address,owner:this.history?.writeToken ?? null,task:this.history?.taskId ?? null,agent:this.history?.agentId ?? null});
    return this.paymentJournal.exclusive(options.operationId,async(read,save)=>{
      let state=await read();
      if(state && state.binding !== binding) throw Error("OPERATION_CONFLICT");
      if(!state){
        const balances=await (this.readBalances?.() ?? readTestnetBalances(this.payerSecretKey!));
        const selectable=card.paymentOptions ? card : {...card,paymentOptions:[{...card.payment,scheme:"exact" as const,asset:card.payment.asset as "USDC"|"XLM",contract:TESTNET_ASSETS[card.payment.asset as "USDC"|"XLM"]}]};
        const selected=selectPaymentOption(selectable,{allowedAssets:this.allowedAssets,budgets:this.budgets,balances,preferredAsset:options.preferredAsset});
        const selectedCard={...card,payment:selected};
        const policy=this.validatePaymentPolicy(selectedCard);if(!policy.allowed)throw Error(`AGENT_POLICY_VIOLATION: ${policy.reason}`);
        state={binding,phase:"started",card:selectedCard};
        await save(state); // Must succeed before any signing or payment request.
      } else if(!state.response && !state.outcome) throw Error("PAYMENT_PENDING: reconcile this operation; do not pay again.");
      const persisted=state as PaymentJournal;
      return this.executeServiceRecorded<T>(persisted.card!,params,options.operationId,async()=>{
        if(persisted.outcome)return persisted.outcome as BazaarAgentExecutionResult<T>;
        const outcome=await this.executeServiceCore<T>(persisted.card!,params,{
          operationId:options.operationId, response:persisted.response,
          saveResponse:async response=>{persisted.response=response;persisted.phase="response";await save(persisted);}
        });
        persisted.outcome=outcome;persisted.phase="completed";await save(persisted);
        return outcome;
      });
    });
  }

  private async executeServiceRecorded<T = unknown>(
    card: ServiceCard,
    params: Record<string, string | number | boolean>,
    operationId?:string, run?:()=>Promise<BazaarAgentExecutionResult<T>>,
  ): Promise<BazaarAgentExecutionResult<T>> {
    const clientOperationId = operationId ?? crypto.randomUUID();
    await this.ensureTask();
    await this.reportStep("service-selected", "Servicio seleccionado", clientOperationId, card.id);
    await this.reportStep("request-started", "Preparando solicitud al proveedor", clientOperationId, card.id);
    let outcome: BazaarAgentExecutionResult<T>;
    try {
      outcome = await (run ? run() : this.executeServiceCore<T>(card, params));
    } catch (error) {
      if (this.history && !run) { // Durable attempts record uncertainty as events, not an immutable purchase that would block recovery.
        try {
          await appendOperationHistory(this.baseUrl, this.history, {
            clientOperationId, taskId: this.history.taskId, mode: this.history.mode ?? "testnet", agentId: this.history.agentId,
            service: { id: card.id, title: card.name, provider: card.provider.name, url: card.url },
            payment: { status: "unknown", network: card.network, asset: card.payment.asset,
              amountAtomic: decimalToAtomic(card.payment.amount), recipient: card.payment.destination },
            delivery: { status: "unknown" },
          });
        } catch { /* Recording must not mask the original execution error. */ }
      }
      await this.reportStep("error", "Ejecución interrumpida; consultar pago y entrega", clientOperationId, card.id);
      throw error;
    }
    await this.reportStep("payment-reported", "Pago reportado por el comprador", clientOperationId, card.id);
    await this.reportStep("delivery-reported", outcome.delivery.resultAvailable ? "Resultado recibido" : "Entrega pendiente", clientOperationId, card.id);
    const deliveryBundle = this.history?.preserveFiles && outcome.data && typeof outcome.data === "object" ? (outcome.data as Record<string, unknown>).bazaarDelivery as DeliveryCopyInput | undefined : undefined;
    let historyStatus: "recorded" | "failed" | "disabled" = "disabled";
    if (this.history) {
      try {
        historyStatus = await appendOperationHistory(this.baseUrl, this.history, {
          clientOperationId, taskId: this.history.taskId, mode: this.history.mode ?? "testnet", agentId: this.history.agentId,
          service: { id: card.id, title: card.name, provider: card.provider.name, url: card.url },
          payment: { status: "reported-unverified", network: card.network, asset: card.payment.asset,
            amountAtomic: decimalToAtomic(card.payment.amount), recipient: card.payment.destination,
            transactionHash: outcome.payment.transactionHash },
          delivery: { status: outcome.delivery.resultAvailable ? "reported-delivered" : "pending",
            ...(this.history.includeResult && outcome.delivery.resultAvailable && !deliveryBundle ? { result: outcome.data } : {}) },
        });
      } catch { historyStatus = "failed"; }
    }
    let library: DeliveryCopyResult | undefined;
    if (deliveryBundle && this.history) {
      library = historyStatus === "recorded" ? await preserveDeliverable({baseUrl:this.baseUrl,writeToken:this.history.writeToken,operationId:clientOperationId,providerOrigin:card.url,delivery:deliveryBundle}) : {status:"failed",failedFiles:[]};
    }
    if (this.activityFailed && historyStatus === "recorded") historyStatus = "failed";
    // A journal failure must never turn a completed payment into an automatic retry.
    return { ...outcome, ...(library ? {library} : {}), history: { status: historyStatus, clientOperationId } };
  }

  private async executeServiceCore<T = unknown>(
    card: ServiceCard,
    params: Record<string, string | number | boolean>,
    durable?:{operationId:string;response?:PaymentJournal["response"];saveResponse:(response:NonNullable<PaymentJournal["response"]>)=>Promise<void>},
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

    const targetUrl = providerRequestUrl(card, params,!!durable && card.id === "swap-risk-quote");

    let response:Response;
    if(durable?.response) response=new Response(durable.response.body,{status:durable.response.status,headers:durable.response.headers});
    else if(durable){
      const payment=card.payment as import("./types.ts").PaymentOption;
      const target=new URL(targetUrl);
      const expected={scheme:"exact",network:card.network,asset:payment.contract,payTo:payment.destination,amount:decimalToAtomic(payment.amount),maxTimeoutSeconds:60,resourceUrl:targetUrl,method:"GET",route:target.pathname,inputHash:Buffer.from(`${String(params.pair).toUpperCase()}|${Number(params.amount)}|${params.side}`).toString("base64url")};
      const client=new x402Client((_version,requirements)=>{
        const matches=requirements.filter(r=>paymentRequirementMismatches(r,expected).length === 0);
        if(matches.length !== 1)throw Error("PAYMENT_REQUIREMENTS_MISMATCH: "+requirements.map(r=>paymentRequirementMismatches(r,expected).join(",")).join(";"));return matches[0];
      }).register("stellar:testnet",new ExactStellarScheme(createEd25519Signer(this.payerSecretKey,"stellar:testnet")));
      client.setSpendControls({allowedAssets:[{network:"stellar:testnet",asset:payment.contract,maxAmountPerPayment:expected.amount}]});
      let signed=false;
      client.onBeforePaymentCreation(async()=>{if(signed)throw Error("PAYMENT_ALREADY_ATTEMPTED");signed=true;});
      response=await wrapFetchWithPayment(fetch,client)(targetUrl,{redirect:"error",headers:{"Idempotency-Key":durable.operationId}});
      const body=await response.clone().text();
      if(response.headers.has("payment-response")) await durable.saveResponse({status:response.status,body,headers:{"payment-response":response.headers.get("payment-response")!,"content-type":"application/json"}});
    } else response = await this.paidFetch(targetUrl);
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
        ...(durable ? {contract:(card.payment as import("./types.ts").PaymentOption).contract} : {}),
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

