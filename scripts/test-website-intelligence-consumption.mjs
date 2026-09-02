import assert from "node:assert/strict";
import { validateVerifiedWebsiteIntelligenceDelivery, verifiedWebsiteIntelligenceDelivery } from "../lib/website-intelligence-consumption.ts";

assert.equal(validateVerifiedWebsiteIntelligenceDelivery(), true);
assert.equal(verifiedWebsiteIntelligenceDelivery.payment.status, "settled");
assert.equal(verifiedWebsiteIntelligenceDelivery.payment.atomicAmount, "10000");
assert.equal(verifiedWebsiteIntelligenceDelivery.payment.network, "stellar:testnet");
assert.equal(verifiedWebsiteIntelligenceDelivery.result.score, 88);
assert.equal(verifiedWebsiteIntelligenceDelivery.result.findings.length, 5);
assert.equal(verifiedWebsiteIntelligenceDelivery.reconciliation.durableRecoveryVerified, true);
assert.equal(verifiedWebsiteIntelligenceDelivery.payment.transactionHash, "9ba1a122c08267fcc65d9a906e32ab4075655b2a566e06d6cb17b397fcc0cc8d");
assert.equal(verifiedWebsiteIntelligenceDelivery.payment.ledger, 4458547);
assert.equal(verifiedWebsiteIntelligenceDelivery.recoveryEvidence.status, "recovered");
assert.equal(verifiedWebsiteIntelligenceDelivery.recoveryEvidence.additionalPaymentPerformed, false);
assert.equal(verifiedWebsiteIntelligenceDelivery.boundaries.newPaymentPerformed, false);
assert.equal("secret" in verifiedWebsiteIntelligenceDelivery, false);
assert.equal(verifiedWebsiteIntelligenceDelivery.payment.scheme, "exact");
assert.equal(verifiedWebsiteIntelligenceDelivery.payment.assetSymbol, "USDC");
assert.equal(verifiedWebsiteIntelligenceDelivery.reconciliation.status, "matched");
assert.equal(verifiedWebsiteIntelligenceDelivery.boundaries.buyerSignerStoredByBazaar, false);
for (const mutate of [
  (d) => { d.payment.network = "stellar:pubnet"; },
  (d) => { d.payment.assetSymbol = "FAKE"; },
  (d) => { d.payment.atomicAmount = "9999"; },
  (d) => { d.payment.transactionHash = "0".repeat(63); },
  (d) => { d.payment.ledger = 0; },
  (d) => { d.result.score = 1; },
  (d) => { d.reconciliation.transactionMatchesReceipt = false; },
  (d) => { d.reconciliation.durableRecoveryVerified = false; },
  (d) => { d.recoveryEvidence.additionalPaymentPerformed = true; },
  (d) => { d.boundaries.newPaymentPerformed = true; },
]) {
  const tampered = structuredClone(verifiedWebsiteIntelligenceDelivery);
  mutate(tampered);
  assert.equal(validateVerifiedWebsiteIntelligenceDelivery(tampered), false);
}
assert.equal(validateVerifiedWebsiteIntelligenceDelivery({}), false, "malformed evidence fails closed");
console.log("website intelligence consumption evidence: PASS");
