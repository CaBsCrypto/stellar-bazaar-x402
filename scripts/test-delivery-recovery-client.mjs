import assert from "node:assert/strict";
import { createPrivateRecoveryCapsule } from "../lib/delivery-recovery-handoff.ts";
import { createPaidDeliveryEnvelope } from "../lib/paid-delivery-envelope.ts";
import { canonicalInputHash } from "../lib/website-intelligence-readiness.ts";
import { recoverWebsiteIntelligenceDelivery } from "../lib/website-intelligence-recovery-client.ts";

const requestId = "a".repeat(32), recoveryId = "b".repeat(64), token = "C".repeat(43), transactionHash = "d".repeat(64), cardHash = "e".repeat(64), inputHash = "f".repeat(64);
const result = { summary: "durably recovered", score: 90 };
const resultHash = canonicalInputHash(result);
const policy = { serviceId: "website-intelligence", serviceVersion: "1.0.0", cardUrl: "https://website-intelligence-provider.vercel.app/v1/service-card", cardHash, method: "POST", route: "/v1/x402/audits", inputHash, idempotencyKey: "recover-client-001", scheme: "exact", network: "stellar:testnet", asset: "C".repeat(56), atomicAmount: "10000", payTo: `G${"A".repeat(55)}` };
const envelope = createPaidDeliveryEnvelope({ policy, transactionHash, ledger: 123, result, resultHash, recovery: { requestId, recoveryId, expiresAt: "2099-01-01T00:00:00.000Z" } });
const capsule = createPrivateRecoveryCapsule({ serviceId: "website-intelligence", providerOrigin: "https://website-intelligence-provider.vercel.app", recoveryPath: "/v1/x402/audits/recover", requestId, recoveryToken: token });
const receipt = { status: "settled", scheme: "exact", method: "POST", route: "/v1/x402/audits", transactionHash, ledger: 123, network: "stellar:testnet", asset: policy.asset, amount: "10000", payTo: policy.payTo, inputHash, cardHash, resultHash };
let captured;
const fetchImpl = async (url, init) => { captured = { url, init }; return new Response(JSON.stringify({ version: "website-intelligence.recovered-delivery/v1", recovery: { recoveryId, requestId, status: "recovered" }, result, resultHash, receipt }), { status: 200, headers: { "content-type": "application/json", "cache-control": "private, no-store" } }); };
const recovered = await recoverWebsiteIntelligenceDelivery({ providerOrigin: "https://website-intelligence-provider.vercel.app", capsule, recoveryId, expected: envelope, fetchImpl });
assert.equal(recovered.reconciled, true); assert.equal(recovered.paymentAttempted, false); assert.equal(captured.url, "https://website-intelligence-provider.vercel.app/v1/x402/audits/recover"); assert.equal(captured.init.method, "POST"); assert.equal("payment-signature" in captured.init.headers, false);
for (const mutate of [body => body.result.score = 0, body => body.receipt.transactionHash = "0".repeat(64), body => body.recovery.requestId = "1".repeat(32), body => body.receipt.status = "verified", body => body.receipt.scheme = "upto", body => body.receipt.method = "GET", body => body.receipt.route = "/wrong"]) {
  await assert.rejects(() => recoverWebsiteIntelligenceDelivery({ providerOrigin: "https://website-intelligence-provider.vercel.app", capsule, recoveryId, expected: envelope, fetchImpl: async () => { const body = { version: "website-intelligence.recovered-delivery/v1", recovery: { recoveryId, requestId, status: "recovered" }, result: structuredClone(result), resultHash, receipt: structuredClone(receipt) }; mutate(body); return new Response(JSON.stringify(body), { status: 200, headers: { "cache-control": "no-store" } }); } }), /RECONCILIATION_FAILED/);
}
for (const mutate of [value => value.serviceId = "other-service", value => value.providerOrigin = "https://attacker.invalid", value => value.recoveryPath = "/wrong"]) {
  const changed = structuredClone(capsule); mutate(changed);
  await assert.rejects(() => recoverWebsiteIntelligenceDelivery({ providerOrigin: "https://website-intelligence-provider.vercel.app", capsule: changed, recoveryId, expected: envelope, fetchImpl }), /RECONCILIATION_FAILED/);
}
for (const mutate of [value => value.version = "wrong", value => value.reconciliation.status = "rejected", value => value.recovery.available = false, value => value.recovery.recoveryId = "0".repeat(64), value => value.request.requestId = "1".repeat(32), value => value.recovery.providerOrigin = "https://attacker.invalid", value => value.recovery.expiresAt = "2000-01-01T00:00:00.000Z"]) {
  const changed = structuredClone(envelope); mutate(changed);
  await assert.rejects(() => recoverWebsiteIntelligenceDelivery({ providerOrigin: "https://website-intelligence-provider.vercel.app", capsule, recoveryId, expected: changed, fetchImpl }), /RECONCILIATION_FAILED/);
}
await assert.rejects(() => recoverWebsiteIntelligenceDelivery({ providerOrigin: "https://attacker.invalid", capsule, recoveryId, expected: envelope, fetchImpl }), /NOT_ALLOWLISTED/);
await assert.rejects(() => recoverWebsiteIntelligenceDelivery({ providerOrigin: "https://website-intelligence-provider.vercel.app", capsule, recoveryId, expected: envelope, fetchImpl: async () => new Response("{}", { status: 404 }) }), /FAILED_404/);
console.log(JSON.stringify({ ok: true, durableRecovery: true, receiptReconciled: true, paymentAttempted: false, redirects: "error", origin: "pinned" }, null, 2));
