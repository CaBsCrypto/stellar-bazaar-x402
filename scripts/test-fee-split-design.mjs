import assert from "node:assert/strict";
import { StrKey } from "@stellar/stellar-sdk";
import {
  BAZAAR_FEE_BPS, FEE_SPLIT_POLICY_VERSION, FEE_SPLIT_RECEIPT_VERSION,
  FEE_SPLIT_TESTNET_USDC_ASSET, calculateFeeSplit, createFeeSplitRequestBinding,
  hashFeeSplitPolicy, reconcileFeeSplitReceipt, validateFeeSplitPolicy,
} from "../lib/fee-split-design.ts";

const payer = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3));
const provider = "GC3CK5A4KCNE44LGMU6PYPEAAZVQOFATJCEMBAASGCXK5EKECTB2VDL4";
const treasury = "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ";
const router = StrKey.encodeContract(Buffer.alloc(32, 7));
const unsigned = {
  version: FEE_SPLIT_POLICY_VERSION, status: "design-only", network: "stellar:testnet", scheme: "exact",
  asset: FEE_SPLIT_TESTNET_USDC_ASSET, router, payer, provider, treasury, grossAtomic: "10000",
  feeBps: BAZAAR_FEE_BPS, method: "POST", route: "/api/paid/audit", inputHash: "a".repeat(64),
  serviceCardHash: "b".repeat(64), providerTermsHash: "6".repeat(64),
  nonce: "c".repeat(64), expiresLedger: 123456,
};
const policy = { ...unsigned, requestBinding: createFeeSplitRequestBinding(unsigned) };

assert.equal(validateFeeSplitPolicy(policy).every(({ ok }) => ok), true);
assert.deepEqual(calculateFeeSplit(policy), [
  { role: "provider", destination: provider, amountAtomic: "9900" },
  { role: "bazaar", destination: treasury, amountAtomic: "100" },
]);
for (const grossAtomic of ["0", "-1", "1", "99", "100", "101", "9999", "10001"])
  assert.throws(() => calculateFeeSplit({ ...policy, grossAtomic }), /INVALID_FEE_SPLIT_POLICY/);
for (const feeBps of [0, 501, 10_000, 100.5, Number.NaN])
  assert.throws(() => calculateFeeSplit({ ...policy, feeBps }), /INVALID_FEE_SPLIT_POLICY/);

const twoPercentUnsigned = { ...unsigned, feeBps: 200 };
const twoPercentPolicy = { ...twoPercentUnsigned, requestBinding: createFeeSplitRequestBinding(twoPercentUnsigned) };
assert.deepEqual(calculateFeeSplit(twoPercentPolicy), [
  { role: "provider", destination: provider, amountAtomic: "9800" },
  { role: "bazaar", destination: treasury, amountAtomic: "200" },
]);

const boundMutations = {
  network: "stellar:pubnet", asset: StrKey.encodeContract(Buffer.alloc(32, 9)), router: StrKey.encodeContract(Buffer.alloc(32, 8)),
  payer: provider, provider: treasury, treasury: provider, grossAtomic: "20000", feeBps: 200, method: "GET",
  route: "/api/paid/other", inputHash: "d".repeat(64), serviceCardHash: "e".repeat(64),
  providerTermsHash: "5".repeat(64),
  nonce: "f".repeat(64), expiresLedger: 123457,
};
for (const [field, value] of Object.entries(boundMutations)) {
  const altered = { ...policy, [field]: value };
  assert.equal(validateFeeSplitPolicy(altered).find(({ rule }) => rule === "canonical-binding")?.ok, false, `binding must reject ${field}`);
}
assert.throws(() => calculateFeeSplit({ ...policy, treasury: provider }), /distinct-identities/);
assert.throws(() => calculateFeeSplit({ ...policy, route: "/api/../admin" }), /bound-route/);

const allocations = calculateFeeSplit(policy);
const receipt = {
  version: FEE_SPLIT_RECEIPT_VERSION, network: "stellar:testnet", asset: policy.asset, router, payer,
  transactionHash: "9".repeat(64), ledger: 123456, policyHash: hashFeeSplitPolicy(policy),
  requestBinding: policy.requestBinding, serviceCardHash: policy.serviceCardHash,
  transfers: allocations.map(({ destination, amountAtomic }) => ({ from: payer, to: destination, asset: policy.asset, amountAtomic })),
  routerBalanceDeltaAtomic: "0",
};
assert.equal(reconcileFeeSplitReceipt(policy, receipt).every(({ ok }) => ok), true);
for (const altered of [
  { ...receipt, payer: provider }, { ...receipt, router: StrKey.encodeContract(Buffer.alloc(32, 8)) },
  { ...receipt, asset: StrKey.encodeContract(Buffer.alloc(32, 9)) }, { ...receipt, policyHash: "8".repeat(64) },
  { ...receipt, requestBinding: "7".repeat(64) }, { ...receipt, ledger: 123.5 },
  { ...receipt, transfers: receipt.transfers.slice(0, 1) }, { ...receipt, transfers: [...receipt.transfers, receipt.transfers[0]] },
  { ...receipt, transfers: [{ ...receipt.transfers[0], amountAtomic: "9899" }, receipt.transfers[1]] },
  { ...receipt, routerBalanceDeltaAtomic: "1" },
]) assert.equal(reconcileFeeSplitReceipt(policy, altered).some(({ ok }) => !ok), true);

console.log("fee split v1: canonical bindings, exact 99/1 arithmetic and ledger-evidence reconciliation passed");
