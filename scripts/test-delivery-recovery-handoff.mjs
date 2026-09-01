import assert from "node:assert/strict";
import { createPrivateRecoveryCapsule, createPublicRecoveryHandoff, validateDeliveryRecoveryIntent } from "../lib/delivery-recovery-handoff.ts";

const requestId = "a".repeat(32);
const proof = "b".repeat(64);
const token = "C".repeat(43);
assert.deepEqual(validateDeliveryRecoveryIntent({ requestId, proof }), { requestId, proof });
for (const value of [null, {}, { requestId: "bad", proof }, { requestId, proof: "bad" }]) assert.throws(() => validateDeliveryRecoveryIntent(value), /INVALID_RECOVERY/);

const publicPackage = createPublicRecoveryHandoff({ serviceId: "website-intelligence", providerOrigin: "https://provider.example", paidPath: "/v1/x402/audits", recoveryPath: "/v1/x402/audits/recover", requestId, recoveryProof: proof, inputHash: "d".repeat(64), idempotencyKey: "buyer-handoff-001" });
const capsule = createPrivateRecoveryCapsule({ serviceId: "website-intelligence", providerOrigin: "https://provider.example", recoveryPath: "/v1/x402/audits/recover", requestId, recoveryToken: token });
assert.equal(publicPackage.containsSecret, false);
assert.equal(JSON.stringify(publicPackage).includes(token), false);
assert.equal("recoveryToken" in publicPackage, false);
assert.equal(capsule.recoveryToken, token);
assert.equal(capsule.recoveryId, null);
assert.equal(capsule.secret, true);
assert.throws(() => createPrivateRecoveryCapsule({ serviceId: "website-intelligence", providerOrigin: "https://provider.example", recoveryPath: "/recover", requestId, recoveryToken: "short" }), /INVALID_RECOVERY_TOKEN/);
console.log(JSON.stringify({ ok: true, publicPackageContainsSecret: false, buyerOwnsRecoveryToken: true, persistence: "none" }, null, 2));
