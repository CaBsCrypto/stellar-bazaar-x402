import { createHash } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";

export const FEE_SPLIT_POLICY_VERSION = "bazaar.fee-split-policy/v1" as const;
export const FEE_SPLIT_RECEIPT_VERSION = "bazaar.fee-split-receipt/v1" as const;
export const BAZAAR_FEE_BPS = 100;
export const FEE_SPLIT_TESTNET_USDC_ASSET = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA" as const;

export type FeeSplitPolicy = {
  version: typeof FEE_SPLIT_POLICY_VERSION;
  status: "design-only";
  network: "stellar:testnet";
  scheme: "exact";
  asset: typeof FEE_SPLIT_TESTNET_USDC_ASSET;
  router: string;
  payer: string;
  provider: string;
  treasury: string;
  grossAtomic: string;
  feeBps: number;
  method: string;
  route: string;
  inputHash: string;
  serviceCardHash: string;
  nonce: string;
  expiresLedger: number;
  requestBinding: string;
};

export type SplitAllocation = { role: "provider" | "bazaar"; destination: string; amountAtomic: string };
export type LedgerTransferEvidence = { from: string; to: string; asset: string; amountAtomic: string };
export type FeeSplitReceipt = {
  version: typeof FEE_SPLIT_RECEIPT_VERSION;
  network: "stellar:testnet";
  asset: string;
  router: string;
  payer: string;
  transactionHash: string;
  ledger: number;
  policyHash: string;
  requestBinding: string;
  serviceCardHash: string;
  transfers: LedgerTransferEvidence[];
  routerBalanceDeltaAtomic: string;
};
export type RuleOutcome = { rule: string; ok: boolean; reason: string };

const HEX_64 = /^[a-f0-9]{64}$/i;
const ROUTE = /^\/(?!.*(?:\.\.|[?#]))[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/;

const validAccount = (value: unknown): value is string =>
  typeof value === "string" && StrKey.isValidEd25519PublicKey(value);
const validContract = (value: unknown): value is string =>
  typeof value === "string" && StrKey.isValidContract(value);

function positiveInteger(value: string): bigint | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function createFeeSplitRequestBinding(policy: Omit<FeeSplitPolicy, "requestBinding">): string {
  return sha256({
    version: policy.version, network: policy.network, scheme: policy.scheme,
    asset: policy.asset, router: policy.router, payer: policy.payer,
    provider: policy.provider, treasury: policy.treasury,
    grossAtomic: policy.grossAtomic, feeBps: policy.feeBps,
    method: policy.method, route: policy.route, inputHash: policy.inputHash,
    serviceCardHash: policy.serviceCardHash, nonce: policy.nonce,
    expiresLedger: policy.expiresLedger,
  });
}

export function hashFeeSplitPolicy(policy: FeeSplitPolicy): string { return sha256(policy); }

export function validateFeeSplitPolicy(policy: FeeSplitPolicy): RuleOutcome[] {
  const gross = positiveInteger(policy.grossAtomic);
  const feeOk = Number.isSafeInteger(policy.feeBps) && policy.feeBps === BAZAAR_FEE_BPS;
  const numerator = gross === null || !feeOk ? null : gross * BigInt(policy.feeBps);
  return [
    { rule: "policy-version", ok: policy.version === FEE_SPLIT_POLICY_VERSION, reason: "Versión de política no soportada." },
    { rule: "design-status", ok: policy.status === "design-only", reason: "El split sigue bloqueado hasta demostrar compatibilidad x402." },
    { rule: "testnet-only", ok: policy.network === "stellar:testnet", reason: "Solo Stellar Testnet está permitido." },
    { rule: "exact-scheme", ok: policy.scheme === "exact", reason: "El precio bruto debe usar exact." },
    { rule: "positive-gross", ok: gross !== null, reason: "grossAtomic debe ser entero positivo." },
    { rule: "fixed-one-percent", ok: feeOk, reason: "v1 fija 100 bps (1%)." },
    { rule: "exact-division", ok: numerator !== null && numerator % 10_000n === 0n, reason: "No se permite redondeo." },
    { rule: "pinned-asset", ok: policy.asset === FEE_SPLIT_TESTNET_USDC_ASSET, reason: "Activo USDC Testnet incorrecto." },
    { rule: "valid-router", ok: validContract(policy.router) && policy.router !== policy.asset, reason: "Se requiere un router C… distinto del SAC." },
    { rule: "valid-payer", ok: validAccount(policy.payer), reason: "Pagador Stellar inválido." },
    { rule: "valid-provider", ok: validAccount(policy.provider), reason: "Proveedor Stellar inválido." },
    { rule: "valid-treasury", ok: validAccount(policy.treasury), reason: "Tesorería Stellar inválida." },
    { rule: "distinct-identities", ok: new Set([policy.payer, policy.provider, policy.treasury]).size === 3, reason: "Pagador, proveedor y tesorería deben ser distintos." },
    { rule: "bound-method", ok: /^(GET|POST)$/.test(policy.method), reason: "Método no permitido." },
    { rule: "bound-route", ok: ROUTE.test(policy.route), reason: "Ruta no canónica o no confiable." },
    { rule: "bound-input", ok: HEX_64.test(policy.inputHash), reason: "Falta hash canónico del input." },
    { rule: "bound-card", ok: HEX_64.test(policy.serviceCardHash), reason: "Falta hash de Service Card." },
    { rule: "bound-nonce", ok: HEX_64.test(policy.nonce), reason: "Falta nonce de 32 bytes." },
    { rule: "bounded-expiry", ok: Number.isSafeInteger(policy.expiresLedger) && policy.expiresLedger > 0, reason: "Expiry de ledger inválido." },
    { rule: "canonical-binding", ok: policy.requestBinding === createFeeSplitRequestBinding(policy), reason: "El binding no cubre exactamente todos los términos." },
  ];
}

export function calculateFeeSplit(policy: FeeSplitPolicy): SplitAllocation[] {
  const failures = validateFeeSplitPolicy(policy).filter(({ ok }) => !ok);
  if (failures.length) throw new Error(`INVALID_FEE_SPLIT_POLICY:${failures.map(({ rule }) => rule).join(",")}`);
  const gross = BigInt(policy.grossAtomic);
  const fee = gross / 100n;
  const providerNet = gross - fee;
  if (fee <= 0n || providerNet <= 0n || fee + providerNet !== gross) throw new Error("INVALID_FEE_SPLIT_ALLOCATION");
  return [
    { role: "provider", destination: policy.provider, amountAtomic: providerNet.toString() },
    { role: "bazaar", destination: policy.treasury, amountAtomic: fee.toString() },
  ];
}

export function reconcileFeeSplitReceipt(policy: FeeSplitPolicy, receipt: FeeSplitReceipt): RuleOutcome[] {
  const policyValid = validateFeeSplitPolicy(policy).every(({ ok }) => ok);
  const expected = policyValid ? calculateFeeSplit(policy) : [];
  const expectedTransfers = expected.map(({ destination, amountAtomic }) => ({ from: policy.payer, to: destination, asset: policy.asset, amountAtomic }));
  const key = (item: LedgerTransferEvidence) => `${item.from}:${item.to}:${item.asset}:${item.amountAtomic}`;
  const transferShape = Array.isArray(receipt.transfers) && receipt.transfers.every((item) =>
    item && validAccount(item.from) && validAccount(item.to) && validContract(item.asset) && positiveInteger(item.amountAtomic) !== null);
  const actualKeys = transferShape ? receipt.transfers.map(key).sort() : [];
  const expectedKeys = expectedTransfers.map(key).sort();
  return [
    { rule: "policy-valid", ok: policyValid, reason: "La política debe ser válida." },
    { rule: "receipt-version", ok: receipt.version === FEE_SPLIT_RECEIPT_VERSION, reason: "Versión de recibo incorrecta." },
    { rule: "network", ok: receipt.network === policy.network, reason: "Red incorrecta." },
    { rule: "asset", ok: receipt.asset === policy.asset, reason: "Activo incorrecto." },
    { rule: "router", ok: receipt.router === policy.router, reason: "Router incorrecto." },
    { rule: "payer", ok: receipt.payer === policy.payer, reason: "Pagador incorrecto." },
    { rule: "transaction", ok: HEX_64.test(receipt.transactionHash) && Number.isSafeInteger(receipt.ledger) && receipt.ledger > 0, reason: "Falta evidencia de transacción/ledger." },
    { rule: "policy", ok: receipt.policyHash === hashFeeSplitPolicy(policy), reason: "Hash de política incorrecto." },
    { rule: "request-binding", ok: receipt.requestBinding === policy.requestBinding, reason: "Solicitud incorrecta." },
    { rule: "service-card", ok: receipt.serviceCardHash === policy.serviceCardHash, reason: "Service Card incorrecta." },
    { rule: "transfer-shape", ok: transferShape, reason: "Evidencia de transferencias inválida." },
    { rule: "exact-two-transfers", ok: actualKeys.length === 2 && JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), reason: "Se requieren exactamente los dos efectos 99/1." },
    { rule: "router-zero-delta", ok: receipt.routerBalanceDeltaAtomic === "0", reason: "El router no debe retener saldo." },
  ];
}
