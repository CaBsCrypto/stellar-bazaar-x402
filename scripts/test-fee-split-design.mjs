import assert from "node:assert/strict";
import {
  BAZAAR_FEE_BPS,
  FEE_SPLIT_POLICY_VERSION,
  FEE_SPLIT_RECEIPT_VERSION,
  FEE_SPLIT_TESTNET_USDC_ASSET,
  calculateFeeSplit,
  hashFeeSplitPolicy,
  reconcileFeeSplitReceipt,
  validateFeeSplitPolicy,
} from "../lib/fee-split-design.ts";

const provider = "GC3CK5A4KCNE44LGMU6PYPEAAZVQOFATJCEMBAASGCXK5EKECTB2VDL4";
const treasury = "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ";
const policy = {
  version: FEE_SPLIT_POLICY_VERSION,
  status: "design-only",
  network: "stellar:testnet",
  scheme: "exact",
  asset: FEE_SPLIT_TESTNET_USDC_ASSET,
  grossAtomic: "10000",
  feeBps: BAZAAR_FEE_BPS,
  provider,
  treasury,
  requestBinding: "a".repeat(64),
  serviceCardHash: "b".repeat(64),
};

assert.equal(validateFeeSplitPolicy(policy).every(({ ok }) => ok), true);
assert.deepEqual(calculateFeeSplit(policy), [
  { role: "provider", destination: provider, amountAtomic: "9900" },
  { role: "bazaar", destination: treasury, amountAtomic: "100" },
]);
assert.throws(() => calculateFeeSplit({ ...policy, grossAtomic: "10001" }), /exact-division/);
assert.throws(() => calculateFeeSplit({ ...policy, treasury: provider }), /distinct-destinations/);
assert.throws(() => calculateFeeSplit({ ...policy, feeBps: 200 }), /fixed-one-percent/);
assert.throws(() => calculateFeeSplit({ ...policy, feeBps: 100.5 }), /fixed-one-percent/);
assert.throws(() => calculateFeeSplit({ ...policy, feeBps: Number.NaN }), /fixed-one-percent/);
assert.throws(() => calculateFeeSplit({ ...policy, version: "bazaar.fee-split-policy/altered" }), /policy-version/);
assert.throws(() => calculateFeeSplit({ ...policy, asset: "" }), /pinned-asset/);
assert.throws(() => calculateFeeSplit({ ...policy, provider: "not-an-account" }), /valid-provider/);

const receipt = {
  version: FEE_SPLIT_RECEIPT_VERSION,
  network: "stellar:testnet",
  asset: policy.asset,
  transactionHash: "c".repeat(64),
  ledger: 123,
  policyHash: hashFeeSplitPolicy(policy),
  requestBinding: policy.requestBinding,
  serviceCardHash: policy.serviceCardHash,
  atomic: true,
  routerRetainedFunds: false,
  allocations: calculateFeeSplit(policy),
};
assert.equal(reconcileFeeSplitReceipt(policy, receipt).every(({ ok }) => ok), true);

for (const altered of [
  { ...receipt, asset: "OTHER" },
  { ...receipt, policyHash: "d".repeat(64) },
  { ...receipt, requestBinding: "e".repeat(64) },
  { ...receipt, atomic: false },
  { ...receipt, routerRetainedFunds: true },
  { ...receipt, ledger: 123.5 },
  { ...receipt, allocations: null },
  { ...receipt, allocations: [{ ...receipt.allocations[0], amountAtomic: "9899" }, receipt.allocations[1]] },
]) {
  assert.equal(reconcileFeeSplitReceipt(policy, altered).some(({ ok }) => !ok), true);
}

console.log("fee split design: deterministic policy, exact allocation and receipt rejection cases passed");
