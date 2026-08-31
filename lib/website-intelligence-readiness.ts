import { createHash } from "node:crypto";
import { X402_MAX_TIMEOUT_SECONDS, X402_NETWORK, X402_QUOTE_AMOUNT, X402_SCHEME, X402_USDC_CONTRACT } from "./x402-config.ts";

export const WEBSITE_INTELLIGENCE_READINESS_VERSION = "bazaar.website-intelligence-readiness/v1" as const;
export const WEBSITE_INTELLIGENCE_LOCAL_BASE_URL = "http://127.0.0.1:8787";
export const WEBSITE_INTELLIGENCE_SERVICE_CARD_URL = `${WEBSITE_INTELLIGENCE_LOCAL_BASE_URL}/v1/service-card`;
export const WEBSITE_INTELLIGENCE_ROUTE = "/v1/x402/audits";
export const WEBSITE_INTELLIGENCE_BINDING_EXTENSION = "website-intelligence/request-binding" as const;
export const WEBSITE_INTELLIGENCE_INPUT_HASH_ALGORITHM = "sha256-canonical-json-v1" as const;
export const WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT = "10000" as const;
export const WEBSITE_INTELLIGENCE_ASSET_DECIMALS = 7 as const;
export const WEBSITE_INTELLIGENCE_DISPLAY_AMOUNT = "0.001 USDC" as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, nested]) => [key, canonicalize(nested)]));
  return value;
}

export function canonicalJSONStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalServiceCardHash(card: unknown): string {
  // The declared digest cannot hash itself. Exclude only this one field while
  // preserving every other nested value in the canonical deep representation.
  const copy = structuredClone(card);
  if (copy && typeof copy === "object") {
    const payment = (copy as Record<string, unknown>).payment;
    if (payment && typeof payment === "object") {
      const binding = (payment as Record<string, unknown>).binding;
      if (binding && typeof binding === "object") delete (binding as Record<string, unknown>).cardHash;
    }
  }
  return createHash("sha256").update(JSON.stringify(canonicalize(copy))).digest("hex");
}

export function canonicalInputHash(input: unknown): string {
  return createHash("sha256").update(canonicalJSONStringify(input)).digest("hex");
}

export type WebsiteReadinessContext = {
  expectedPayTo: string;
  approvedCardHash: string;
  sourceUrl: string;
  now?: Date;
};

export type ReadinessOutcome = { rule: string; ok: boolean; reason: string };

const get = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);

export function validateWebsiteIntelligenceReadiness(card: unknown, context: WebsiteReadinessContext) {
  const cardHash = canonicalServiceCardHash(card);
  const endpoint = String(get(card, "payment.binding.resourceUrl") ?? "");
  let canonicalEndpoint = false;
  let expectedServiceCardUrl = "";
  try {
    const parsed = new URL(endpoint);
    canonicalEndpoint = parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname === WEBSITE_INTELLIGENCE_ROUTE;
    expectedServiceCardUrl = new URL("/v1/service-card", parsed.origin).toString();
  } catch {}
  const rules: Array<[string, unknown, unknown, string]> = [
    ["card.schemaVersion", get(card, "schemaVersion"), "1.0", "Service Card schema 1.0 requerida."],
    ["card.id", get(card, "id"), "website-intelligence", "Identidad pública del servicio no coincide."],
    ["interface.method", get(card, "interfaces.http.method"), "POST", "El método debe ser POST."],
    ["interface.path", get(card, "interfaces.http.path"), WEBSITE_INTELLIGENCE_ROUTE, "La ruta exacta debe ser /v1/x402/audits."],
    ["delivery.model", get(card, "delivery.model"), "sync", "La primera compra requiere entrega síncrona."],
    ["payment.enabled", get(card, "payment.enabled"), true, "El proveedor aún no declara pagos activos."],
    ["payment.network", get(card, "payment.network"), X402_NETWORK, "Solo Stellar Testnet."],
    ["payment.scheme", get(card, "payment.scheme"), X402_SCHEME, "Solo esquema exact."],
    ["payment.asset", get(card, "payment.asset"), X402_USDC_CONTRACT, "Debe fijar USDC Testnet SEP-41."],
    ["payment.atomicAmount", get(card, "payment.atomicAmount"), WEBSITE_INTELLIGENCE_ATOMIC_AMOUNT, "El monto atómico debe ser exactamente 10000."],
    ["payment.assetDecimals", get(card, "payment.assetDecimals"), WEBSITE_INTELLIGENCE_ASSET_DECIMALS, "USDC Testnet debe declarar 7 decimales."],
    ["payment.payTo", get(card, "payment.payTo"), context.expectedPayTo, "El destinatario debe coincidir con el aprobado."],
    ["payment.maxTimeoutSeconds", get(card, "payment.maxTimeoutSeconds"), X402_MAX_TIMEOUT_SECONDS, "Timeout máximo fijado en 60 segundos."],
    ["binding.method", get(card, "payment.binding.method"), "POST", "La autorización debe fijar el método."],
    ["binding.route", get(card, "payment.binding.route"), WEBSITE_INTELLIGENCE_ROUTE, "La autorización debe fijar la ruta."],
    ["binding.resourceUrl", canonicalEndpoint, true, "La autorización debe fijar un origen HTTPS canónico y la ruta pagada exacta."],
    ["binding.inputHashAlgorithm", get(card, "payment.binding.inputHashAlgorithm"), WEBSITE_INTELLIGENCE_INPUT_HASH_ALGORITHM, "La tarjeta debe declarar el algoritmo canónico; el hash concreto pertenece a cada solicitud."],
    ["binding.cardHash", get(card, "payment.binding.cardHash"), cardHash, "La autorización debe fijar la Service Card completa."],
  ];
  rules.push(["expected.cardHash", cardHash, context.approvedCardHash, "La Service Card cambió desde la aprobación o no fue aprobada explícitamente."]);
  rules.push(["source.url", context.sourceUrl, expectedServiceCardUrl, "La Service Card debe provenir del mismo origen HTTPS canónico declarado por el endpoint pagado."]);
  const outcomes: ReadinessOutcome[] = rules.map(([rule, actual, expected, reason]) => ({ rule, ok: actual === expected, reason: actual === expected ? "matched" : reason }));
  const challengeTtl = get(card, "payment.challengeTtlSeconds");
  outcomes.push({ rule: "payment.challengeTtlSeconds", ok: challengeTtl === X402_MAX_TIMEOUT_SECONDS, reason: challengeTtl === X402_MAX_TIMEOUT_SECONDS ? "matched" : "La expiración de cada challenge debe ser exactamente 60 segundos y validarse otra vez al autorizar." });
  const ready = outcomes.every(outcome => outcome.ok);
  return { version: WEBSITE_INTELLIGENCE_READINESS_VERSION, ready, paymentActive: ready, cardHash, endpoint, outcomes };
}

export type SettlementEvidence = { status: "settled"; scheme: string; network: string; asset: string; payTo: string; amount: string; method: string; route: string; inputHash: string; cardHash: string; transactionHash: string; ledger: number };

export function reconcileWebsiteIntelligenceSettlement(evidence: SettlementEvidence, expected: Omit<SettlementEvidence, "status" | "transactionHash" | "ledger">, result: unknown, expectedResultHash: string) {
  const fields = ["scheme", "network", "asset", "payTo", "amount", "method", "route", "inputHash", "cardHash"] as const;
  const outcomes = fields.map(field => ({ rule: `receipt.${field}`, ok: evidence[field] === expected[field], reason: evidence[field] === expected[field] ? "matched" : "Receipt no coincide con el contrato fijado." }));
  const resultHash = canonicalInputHash(result);
  outcomes.push({ rule: "result.hash", ok: resultHash === expectedResultHash, reason: resultHash === expectedResultHash ? "matched" : "Resultado no coincide con el digest esperado." });
  outcomes.push({ rule: "receipt.status", ok: evidence.status === "settled", reason: evidence.status === "settled" ? "matched" : "El recibo no declara settlement completado." });
  const transactionOk = /^[0-9a-f]{64}$/.test(evidence.transactionHash) && Number.isSafeInteger(evidence.ledger) && evidence.ledger > 0;
  outcomes.push({ rule: "receipt.transaction", ok: transactionOk, reason: transactionOk ? "matched" : "Se exige hash hexadecimal real y ledger positivo; los IDs fixture no se aceptan en reconciliación productiva." });
  return { reconciled: outcomes.every(outcome => outcome.ok), outcomes, resultHash };
}
