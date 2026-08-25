import assert from "node:assert/strict";
import {
  deriveProviderDelivery,
  syncDeliveryReturned,
  asyncDeliveryPending,
  unconfirmedDelivery,
} from "../lib/delivery-boundaries.ts";
import { canonicalResultSha256, hasMatchingProviderResultHash } from "../lib/delivery-result.ts";

console.log("\n[RECEIPT / DELIVERY BOUNDARIES]\n");

const sync = syncDeliveryReturned();
assert.equal(sync.status, "result-returned");
assert.equal(sync.resultAvailable, true);
assert.equal(sync.independentlyVerified, false);
console.log("✓ Sync response is displayed as provider-returned, not independently verified");

const async = asyncDeliveryPending();
assert.equal(async.status, "accepted-pending");
assert.equal(async.resultAvailable, false);
assert.equal(async.independentlyVerified, false);
console.log("✓ Async acceptance is displayed as pending, not completed");

const absent = unconfirmedDelivery();
assert.equal(absent.status, "not-confirmed");
assert.equal(absent.evidence, "none");
console.log("✓ Settlement alone does not become a delivery claim");

assert.equal(deriveProviderDelivery(202, { jobId: "demo" }).status, "accepted-pending");
assert.equal(deriveProviderDelivery(200, { result: {} }).status, "result-returned");
assert.equal(deriveProviderDelivery(500, null).status, "not-confirmed");
console.log("✓ HTTP delivery classification is deterministic\n");

const result = { score: 7, nested: { b: true, a: "canonical" } };
const matching = { result, delivery: { resultHash: { algorithm: "sha256", scope: "canonical-result", value: canonicalResultSha256(result) } } };
assert.equal(hasMatchingProviderResultHash(matching), true);
assert.equal(hasMatchingProviderResultHash({ ...matching, result: { ...result, score: 8 } }), false);
console.log("✓ Provider result hash is reconciled separately from payment and quality\n");
