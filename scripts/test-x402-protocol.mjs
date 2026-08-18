import assert from "node:assert/strict";
import { decodePaymentRequiredHeader } from "@x402/core/http";

const base = process.env.X402_RESOURCE_BASE_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:3000";
const url = `${base}/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy`;
const unpaid = await fetch(url);
assert.equal(unpaid.status, 402);
const header = unpaid.headers.get("payment-required");
assert.ok(header);
const required = decodePaymentRequiredHeader(header);
assert.equal(required.x402Version, 2);
assert.equal(required.accepts[0].network, "stellar:testnet");
assert.equal(required.accepts[0].scheme, "exact");
assert.equal(required.accepts[0].amount, "10000");
const tamper = await fetch(url, {
  headers: { "PAYMENT-SIGNATURE": "tampered-not-base64" },
});
assert.equal(tamper.status, 402);
console.log(
  JSON.stringify(
    {
      unpaid402: true,
      paymentRequired: true,
      tamperRejected: true,
      settlementTests: "not run by protocol smoke; requires explicit one-shot authorization",
      expiryReplay: "facilitator-gated; not exercised by this non-transactional smoke",
    },
    null,
    2,
  ),
);
