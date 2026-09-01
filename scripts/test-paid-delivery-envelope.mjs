import assert from "node:assert/strict";
import { createPaidDeliveryEnvelope, reconcilePaidDeliveryEnvelope } from "../lib/paid-delivery-envelope.ts";
import { canonicalInputHash } from "../lib/website-intelligence-readiness.ts";

const result = { summary: "delivered", findings: [{ id: "a", ok: true }] };
const policy = { serviceId: "website-intelligence", serviceVersion: "1.0.0", cardUrl: "https://website-intelligence-provider.vercel.app/v1/service-card", cardHash: "a".repeat(64), method: "POST", route: "/v1/x402/audits", inputHash: "b".repeat(64), idempotencyKey: "buyer-envelope-001", scheme: "exact", network: "stellar:testnet", asset: "C".repeat(56), atomicAmount: "10000", payTo: `G${"A".repeat(55)}` };
const envelope = createPaidDeliveryEnvelope({ policy, transactionHash: "c".repeat(64), ledger: 123, result, resultHash: canonicalInputHash(result) });
assert.equal(envelope.reconciliation.status, "matched");
assert.equal(reconcilePaidDeliveryEnvelope(envelope, policy).ok, true);
assert.equal("credential" in envelope.recovery, false);
for (const mutate of [
  (x) => { x.service.cardHash = "d".repeat(64); }, (x) => { x.request.inputHash = "e".repeat(64); },
  (x) => { x.payment.network = "stellar:pubnet"; }, (x) => { x.payment.asset = "wrong"; },
  (x) => { x.payment.atomicAmount = "9999"; }, (x) => { x.payment.payTo = "wrong"; },
  (x) => { x.payment.transactionHash = "short"; }, (x) => { x.payment.ledger = 0; },
  (x) => { x.delivery.result = { changed: true }; }, (x) => { x.boundaries.buyerSignerStoredByBazaar = true; },
]) { const changed = structuredClone(envelope); mutate(changed); assert.equal(reconcilePaidDeliveryEnvelope(changed, policy).ok, false); }
assert.equal(reconcilePaidDeliveryEnvelope({}, policy).ok, false);
assert.equal(reconcilePaidDeliveryEnvelope(null, policy).ok, false);
assert.equal(reconcilePaidDeliveryEnvelope([], policy).ok, false);
console.log("paid delivery envelope v1: PASS");
