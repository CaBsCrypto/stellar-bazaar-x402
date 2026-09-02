import assert from "node:assert/strict";
import { StrKey } from "@stellar/stellar-sdk";
import {
  BAZAAR_FEE_BPS, FEE_SPLIT_POLICY_VERSION, FEE_SPLIT_TESTNET_USDC_ASSET,
  createFeeSplitRequestBinding,
} from "../lib/fee-split-design.ts";
import {
  FEE_SPLIT_MECHANISM, assessStandardExactCompatibility,
  createExperimentalSplitRequirements, validateExperimentalSplitRequirements,
} from "../lib/fee-split-x402-conformance.ts";

const unsigned = {
  version: FEE_SPLIT_POLICY_VERSION, status: "design-only", network: "stellar:testnet", scheme: "exact",
  asset: FEE_SPLIT_TESTNET_USDC_ASSET, router: StrKey.encodeContract(Buffer.alloc(32, 7)),
  payer: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3)),
  provider: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 4)),
  treasury: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 5)),
  grossAtomic: "10000", feeBps: BAZAAR_FEE_BPS, method: "POST", route: "/api/paid/audit",
  inputHash: "a".repeat(64), serviceCardHash: "b".repeat(64), providerTermsHash: "c".repeat(64),
  nonce: "d".repeat(64), expiresLedger: 123456,
};
const policy = { ...unsigned, requestBinding: createFeeSplitRequestBinding(unsigned) };

const standard = assessStandardExactCompatibility();
assert.equal(standard.compatible, false);
assert.equal(standard.reasons.length, 4);
assert.match(standard.reasons.join(" "), /one payTo/i);
assert.match(standard.reasons.join(" "), /rejects multiple transfers/i);

const requirements = createExperimentalSplitRequirements(policy);
assert.equal(requirements.mechanism, FEE_SPLIT_MECHANISM);
assert.equal(requirements.standardExactCompatible, false);
assert.deepEqual(requirements.allocations.map(({ amountAtomic }) => amountAtomic), ["9900", "100"]);
assert.equal(validateExperimentalSplitRequirements(policy, requirements).every(({ ok }) => ok), true);

for (const altered of [
  { ...requirements, standardExactCompatible: true },
  { ...requirements, asset: StrKey.encodeContract(Buffer.alloc(32, 9)) },
  { ...requirements, router: StrKey.encodeContract(Buffer.alloc(32, 8)) },
  { ...requirements, grossAtomic: "10001" }, { ...requirements, feeBps: 200 },
  { ...requirements, policyHash: "e".repeat(64) }, { ...requirements, requestBinding: "f".repeat(64) },
  { ...requirements, allocations: requirements.allocations.slice(0, 1) },
]) assert.equal(validateExperimentalSplitRequirements(policy, altered).some(({ ok }) => !ok), true);

console.log("fee split x402 conformance gate: standard exact rejected; experimental requirements fail closed");
