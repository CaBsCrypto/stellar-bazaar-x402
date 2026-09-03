import { createHash } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";

export const FEE_SPLIT_POLICY_VERSION = "bazaar.fee-split-policy/v0" as const;
export const FEE_SPLIT_RECEIPT_VERSION = "bazaar.fee-split-receipt/v0" as const;
export const BAZAAR_FEE_BPS = 100;
export const BAZAAR_TREASURY_ADDRESS = "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ" as const;
export const FEE_SPLIT_TESTNET_USDC_ASSET = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA" as const;

export type FeeSplitPolicy = {
  version: typeof FEE_SPLIT_POLICY_VERSION;
  status: "design-only";
  network: "stellar:testnet";
  scheme: "exact" | "split-exact";
  asset: typeof FEE_SPLIT_TESTNET_USDC_ASSET;
  grossAtomic: string;
  feeBps: number;
  provider: string;
  treasury: string;
  requestBinding: string;
  serviceCardHash: string;
};

export type SplitAllocation = {
  role: "provider" | "bazaar";
  destination: string;
  amountAtomic: string;
};

export type FeeSplitReceipt = {
  version: typeof FEE_SPLIT_RECEIPT_VERSION;
  network: "stellar:testnet";
  asset: string;
  transactionHash: string;
  ledger: number;
  policyHash: string;
  requestBinding: string;
  serviceCardHash: string;
  atomic: true;
  routerRetainedFunds: false;
  allocations: SplitAllocation[];
};

export type RuleOutcome = {
  rule: string;
  ok: boolean;
  reason: string;
};

const HEX_64 = /^[a-f0-9]{64}$/i;

function validStellarAccount(value: unknown): value is string {
  return typeof value === "string" && StrKey.isValidEd25519PublicKey(value);
}

function positiveInteger(value: string): bigint | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function hashFeeSplitPolicy(policy: FeeSplitPolicy): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(policy)))
    .digest("hex");
}

export function validateFeeSplitPolicy(policy: FeeSplitPolicy): RuleOutcome[] {
  const gross = positiveInteger(policy.grossAtomic);
  const validFeeBps = Number.isSafeInteger(policy.feeBps) && policy.feeBps === BAZAAR_FEE_BPS;
  const numerator = gross === null || !validFeeBps ? null : gross * BigInt(policy.feeBps);
  return [
    {
      rule: "policy-version",
      ok: policy.version === FEE_SPLIT_POLICY_VERSION,
      reason: "La versión de política debe estar soportada explícitamente.",
    },
    {
      rule: "design-status",
      ok: policy.status === "design-only",
      reason: "La política v0 no puede presentarse como un mecanismo desplegado.",
    },
    {
      rule: "testnet-only",
      ok: policy.network === "stellar:testnet",
      reason: "El diseño inicial está fijado exclusivamente a Stellar Testnet.",
    },
    {
      rule: "exact-scheme",
      ok: policy.scheme === "exact" || policy.scheme === "split-exact",
      reason: "El importe bruto debe estar definido por el esquema exact o split-exact.",
    },
    {
      rule: "positive-gross",
      ok: gross !== null,
      reason: "grossAtomic debe ser un entero positivo expresado como string.",
    },
    {
      rule: "fixed-one-percent",
      ok: validFeeBps,
      reason: "La versión v0 fija la comisión visible de Bazaar en 100 bps (1%).",
    },
    {
      rule: "exact-division",
      ok: numerator !== null && numerator % 10_000n === 0n,
      reason: "El monto debe permitir el reparto exacto sin redondeo oculto.",
    },
    {
      rule: "pinned-asset",
      ok: policy.asset === FEE_SPLIT_TESTNET_USDC_ASSET,
      reason: "La política v0 está fijada al contrato USDC de Stellar Testnet.",
    },
    {
      rule: "valid-provider",
      ok: validStellarAccount(policy.provider),
      reason: "El destino del proveedor debe tener formato de cuenta Stellar pública.",
    },
    {
      rule: "valid-treasury",
      ok: validStellarAccount(policy.treasury),
      reason: "El destino de Bazaar debe tener formato de cuenta Stellar pública.",
    },
    {
      rule: "distinct-destinations",
      ok: policy.provider !== policy.treasury,
      reason: "Proveedor y tesorería deben ser destinos distintos.",
    },
    {
      rule: "bound-request",
      ok: HEX_64.test(policy.requestBinding),
      reason: "La autorización debe quedar ligada a método, ruta e input canónicos.",
    },
    {
      rule: "bound-card",
      ok: HEX_64.test(policy.serviceCardHash),
      reason: "La autorización debe quedar ligada a la Service Card versionada.",
    },
  ];
}

export function calculateFeeSplit(policy: FeeSplitPolicy): SplitAllocation[] {
  const failures = validateFeeSplitPolicy(policy).filter((outcome) => !outcome.ok);
  if (failures.length > 0) {
    throw new Error(`INVALID_FEE_SPLIT_POLICY:${failures.map((item) => item.rule).join(",")}`);
  }
  const gross = BigInt(policy.grossAtomic);
  const fee = (gross * BigInt(policy.feeBps)) / 10_000n;
  const providerNet = gross - fee;
  if (fee <= 0n || providerNet <= 0n) throw new Error("INVALID_FEE_SPLIT_ALLOCATION");
  return [
    { role: "provider", destination: policy.provider, amountAtomic: providerNet.toString() },
    { role: "bazaar", destination: policy.treasury, amountAtomic: fee.toString() },
  ];
}

export function reconcileFeeSplitReceipt(
  policy: FeeSplitPolicy,
  receipt: FeeSplitReceipt,
): RuleOutcome[] {
  const policyOutcomes = validateFeeSplitPolicy(policy);
  const policyValid = policyOutcomes.every(({ ok }) => ok);
  const expected = policyValid ? calculateFeeSplit(policy) : [];
  const allocationKey = (allocation: SplitAllocation) =>
    `${allocation.role}:${allocation.destination}:${allocation.amountAtomic}`;
  const allocationShapeValid = Array.isArray(receipt.allocations) && receipt.allocations.every((allocation) =>
    allocation !== null &&
    typeof allocation === "object" &&
    (allocation.role === "provider" || allocation.role === "bazaar") &&
    validStellarAccount(allocation.destination) &&
    positiveInteger(allocation.amountAtomic) !== null,
  );
  const actualKeys = allocationShapeValid ? [...receipt.allocations].map(allocationKey).sort() : [];
  const expectedKeys = [...expected].map(allocationKey).sort();
  return [
    { rule: "policy-valid", ok: policyValid, reason: "La política reconciliada debe pasar todas las reglas v0." },
    { rule: "receipt-version", ok: receipt.version === FEE_SPLIT_RECEIPT_VERSION, reason: "Versión de recibo esperada." },
    { rule: "network", ok: receipt.network === policy.network, reason: "La red debe coincidir con la política." },
    { rule: "asset", ok: receipt.asset === policy.asset, reason: "El activo liquidado debe coincidir exactamente." },
    { rule: "transaction", ok: HEX_64.test(receipt.transactionHash) && Number.isSafeInteger(receipt.ledger) && receipt.ledger > 0, reason: "Se requiere transacción y ledger verificables." },
    { rule: "policy", ok: receipt.policyHash === hashFeeSplitPolicy(policy), reason: "El recibo debe reconciliar la política canónica." },
    { rule: "request-binding", ok: receipt.requestBinding === policy.requestBinding, reason: "El recibo debe corresponder a la misma solicitud." },
    { rule: "service-card", ok: receipt.serviceCardHash === policy.serviceCardHash, reason: "El recibo debe corresponder a la misma Service Card." },
    { rule: "single-atomic-operation", ok: receipt.atomic === true, reason: "Ambas asignaciones deben ocurrir en una sola operación atómica." },
    { rule: "no-router-custody", ok: receipt.routerRetainedFunds === false, reason: "El router no puede conservar fondos." },
    { rule: "allocation-shape", ok: allocationShapeValid, reason: "Cada asignación debe declarar rol, cuenta Stellar y monto entero positivo." },
    { rule: "exact-allocations", ok: policyValid && actualKeys.length === 2 && JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), reason: "Proveedor y Bazaar deben recibir exactamente el neto y la comisión esperados." },
  ];
}
