import assert from "node:assert/strict";
import { validateVerifiedWebsiteIntelligenceDelivery, verifiedWebsiteIntelligenceDelivery } from "../lib/website-intelligence-consumption.ts";

assert.equal(validateVerifiedWebsiteIntelligenceDelivery(), true);
assert.equal(verifiedWebsiteIntelligenceDelivery.payment.status, "settled");
assert.equal(verifiedWebsiteIntelligenceDelivery.payment.atomicAmount, "10000");
assert.equal(verifiedWebsiteIntelligenceDelivery.payment.network, "stellar:testnet");
assert.equal(verifiedWebsiteIntelligenceDelivery.result.score, 88);
assert.equal(verifiedWebsiteIntelligenceDelivery.result.findings.length, 5);
assert.equal(verifiedWebsiteIntelligenceDelivery.reconciliation.durableRecoveryVerified, true);
assert.equal(verifiedWebsiteIntelligenceDelivery.boundaries.newPaymentPerformed, false);
assert.equal("secret" in verifiedWebsiteIntelligenceDelivery, false);
console.log("website intelligence consumption evidence: PASS");
