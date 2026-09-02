import {
  calculateFeeSplit,
  hashFeeSplitPolicy,
  validateFeeSplitPolicy,
  type FeeSplitPolicy,
  type RuleOutcome,
} from "./fee-split-design.ts";

export const FEE_SPLIT_MECHANISM = "bazaar-stellar-split/v0" as const;
export const PINNED_X402_STELLAR_VERSION = "2.24.0" as const;

export type ExperimentalSplitRequirements = {
  mechanism: typeof FEE_SPLIT_MECHANISM;
  status: "design-only";
  standardExactCompatible: false;
  network: "stellar:testnet";
  asset: string;
  router: string;
  grossAtomic: string;
  feeBps: number;
  policyHash: string;
  requestBinding: string;
  allocations: Array<{ role: "provider" | "bazaar"; destination: string; amountAtomic: string }>;
};

export type StandardExactAssessment = {
  compatible: false;
  sdkVersion: typeof PINNED_X402_STELLAR_VERSION;
  reasons: string[];
};

export function assessStandardExactCompatibility(): StandardExactAssessment {
  return {
    compatible: false,
    sdkVersion: PINNED_X402_STELLAR_VERSION,
    reasons: [
      "PaymentRequirements declares one payTo and one exact amount.",
      "The Stellar client builds one SEP-41 transfer(payer, payTo, amount).",
      "The facilitator rejects multiple transfers and arbitrary router invocation.",
      "Using the router as payTo funds it but does not invoke an atomic split.",
    ],
  };
}

export function createExperimentalSplitRequirements(policy: FeeSplitPolicy): ExperimentalSplitRequirements {
  const failures = validateFeeSplitPolicy(policy).filter(({ ok }) => !ok);
  if (failures.length) {
    throw new Error(`INVALID_FEE_SPLIT_POLICY:${failures.map(({ rule }) => rule).join(",")}`);
  }
  return {
    mechanism: FEE_SPLIT_MECHANISM,
    status: "design-only",
    standardExactCompatible: false,
    network: policy.network,
    asset: policy.asset,
    router: policy.router,
    grossAtomic: policy.grossAtomic,
    feeBps: policy.feeBps,
    policyHash: hashFeeSplitPolicy(policy),
    requestBinding: policy.requestBinding,
    allocations: calculateFeeSplit(policy),
  };
}

export function validateExperimentalSplitRequirements(
  policy: FeeSplitPolicy,
  requirements: ExperimentalSplitRequirements,
): RuleOutcome[] {
  const expected = createExperimentalSplitRequirements(policy);
  return [
    { rule: "experimental-mechanism", ok: requirements.mechanism === FEE_SPLIT_MECHANISM, reason: "Mecanismo experimental incorrecto." },
    { rule: "design-only", ok: requirements.status === "design-only" && requirements.standardExactCompatible === false, reason: "No se puede anunciar compatibilidad exact estándar." },
    { rule: "network", ok: requirements.network === expected.network, reason: "Red incorrecta." },
    { rule: "asset", ok: requirements.asset === expected.asset, reason: "Activo incorrecto." },
    { rule: "router", ok: requirements.router === expected.router, reason: "Router incorrecto." },
    { rule: "gross", ok: requirements.grossAtomic === expected.grossAtomic, reason: "Bruto incorrecto." },
    { rule: "fee", ok: requirements.feeBps === expected.feeBps, reason: "Comisión incorrecta." },
    { rule: "policy", ok: requirements.policyHash === expected.policyHash, reason: "Política incorrecta." },
    { rule: "request", ok: requirements.requestBinding === expected.requestBinding, reason: "Binding incorrecto." },
    { rule: "allocations", ok: JSON.stringify(requirements.allocations) === JSON.stringify(expected.allocations), reason: "Asignaciones incorrectas." },
  ];
}
