import assert from "node:assert/strict";
import { x402Client } from "@x402/core/client";
import { assertPilotPaymentChallenge } from "./lib/private-pilot-challenge.mjs";
import {
  X402_NETWORK,
  X402_USDC_CONTRACT,
  X402_MAX_TIMEOUT_SECONDS,
} from "../lib/x402-config.ts";
const run = {
  payTo: "G" + "A".repeat(55),
  cardHash: "a".repeat(64),
  expected: { inputHash: "b".repeat(64) },
  requestId: "c".repeat(32),
  proof: "d".repeat(64),
};
const required = {
  x402Version: 2,
  resource: {
    url: "https://website-intelligence-provider.vercel.app/v1/x402/audits",
  },
  accepts: [
    {
      scheme: "exact",
      network: X402_NETWORK,
      asset: X402_USDC_CONTRACT,
      amount: "10000",
      payTo: run.payTo,
      maxTimeoutSeconds: X402_MAX_TIMEOUT_SECONDS,
      extra: { areFeesSponsored: true },
    },
  ],
  extensions: {
    "website-intelligence/request-binding": {
      info: {
        algorithm: "sha256-canonical-json-v1",
        method: "POST",
        route: "/v1/x402/audits",
        inputHash: run.expected.inputHash,
        cardHash: run.cardHash,
        requestId: run.requestId,
        recoveryProof: run.proof,
      },
    },
  },
};
let signatures = 0;
const client = new x402Client()
  .setSpendControls({
    allowedAssets: [
      {
        network: X402_NETWORK,
        asset: X402_USDC_CONTRACT,
        maxAmountPerPayment: "10000",
      },
    ],
  })
  .register(X402_NETWORK, {
    scheme: "exact",
    async createPaymentPayload() {
      signatures++;
      return { x402Version: 2, payload: {} };
    },
  });
client.onBeforePaymentCreation(async (context) =>
  assertPilotPaymentChallenge(context, run),
);
for (const change of [
  (r) => (r.resource.url = "https://evil.example/v1/x402/audits"),
  (r) => (r.accepts[0].amount = "10001"),
  (r) => (r.accepts[0].maxTimeoutSeconds = 120),
  (r) =>
    (r.extensions["website-intelligence/request-binding"].info.inputHash =
      "0".repeat(64)),
  (r) =>
    (r.extensions["website-intelligence/request-binding"].info.cardHash =
      "0".repeat(64)),
  (r) =>
    (r.extensions["website-intelligence/request-binding"].info.recoveryProof =
      "0".repeat(64)),
  (r) =>
    (r.extensions["website-intelligence/request-binding"].info.requestId =
      "0".repeat(32)),
]) {
  const changed = structuredClone(required);
  change(changed);
  await assert.rejects(() => client.createPaymentPayload(changed));
  assert.equal(signatures, 0);
}
await client.createPaymentPayload(required);
assert.equal(signatures, 1);
console.log(
  "Actual x402 pre-sign hook rejects changed price, timeout, resource, input/card hashes and recovery binding before any signature PASS. No real signer/network/payment.",
);

run.providerOrigin = "https://approved-preview.vercel.app";
await assert.rejects(() => client.createPaymentPayload(required));
assert.equal(signatures, 1);
const preview = structuredClone(required);
preview.resource.url = run.providerOrigin + "/v1/x402/audits";
await client.createPaymentPayload(preview);
assert.equal(signatures, 2);
console.log("PASS: approved Preview accepted; old production origin rejected before signature.");
