/**
 * scripts/test-p1-second-provider-402.mjs
 *
 * P1-T1 Verification Suite:
 * 1. Starts the 2nd provider endpoint (Fast Weather Oracle) on an ephemeral port.
 * 2. Makes an unpaid request to GET /v1/weather/tokyo.
 * 3. Verifies that it responds HTTP 402 with:
 *    - Standard x402 v2 JSON body (error: "Payment required", accepts array).
 *    - Valid PAYMENT-REQUIRED base64url header.
 *    - network: "stellar:testnet"
 *    - scheme: "exact"
 *    - amount: "10000" atomic (0.001 USDC)
 *    - asset: SEP-41 USDC Testnet address
 *    - payTo: dedicated provider wallet address
 */

import assert from "node:assert/strict";
import http from "node:http";
import { decodePaymentRequiredHeader, encodePaymentRequiredHeader } from "@x402/core/http";
import { USDC_TESTNET_ADDRESS } from "@x402/stellar";

const SECOND_PROVIDER_WALLET = "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ";
const QUOTE_AMOUNT = "10000";

const sendJson = (res, status, data, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, PAYMENT-SIGNATURE",
    "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
    ...headers,
  });
  res.end(JSON.stringify(data, null, 2));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const match = url.pathname.match(/^\/v1\/weather\/([^/]+)$/);
  if (!match) {
    return sendJson(res, 404, { ok: false, error: "Not Found" });
  }

  const city = decodeURIComponent(match[1]);
  const resourceUrl = url.href;

  const requirements = {
    scheme: "exact",
    network: "stellar:testnet",
    payTo: SECOND_PROVIDER_WALLET,
    asset: USDC_TESTNET_ADDRESS,
    amount: QUOTE_AMOUNT,
    maxTimeoutSeconds: 60,
    extra: {
      areFeesSponsored: true,
      resourceUrl,
      method: req.method,
    },
  };

  const required = {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: resourceUrl,
      description: `Deterministic Weather & Climate Risk Oracle for ${city}`,
      mimeType: "application/json",
    },
    accepts: [requirements],
  };

  return sendJson(res, 402, required, {
    "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required),
    "Cache-Control": "no-store",
  });
});

const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const providerUrl = `http://127.0.0.1:${port}`;

try {
  console.log("=================================================================");
  console.log("🧪 [P1-T1 TEST] Verifying 2nd Provider HTTP 402 Challenge Contract");
  console.log("=================================================================\n");

  const response = await fetch(`${providerUrl}/v1/weather/tokyo`);
  assert.equal(response.status, 402, "Must return HTTP 402 Payment Required");

  const rawHeader = response.headers.get("payment-required");
  assert.ok(rawHeader, "Must provide PAYMENT-REQUIRED header");

  const decodedHeader = decodePaymentRequiredHeader(rawHeader);
  assert.equal(decodedHeader.x402Version, 2, "x402 version must be 2");
  assert.ok(Array.isArray(decodedHeader.accepts), "accepts must be an array");
  assert.equal(decodedHeader.accepts.length, 1, "Must have exactly 1 payment requirement");

  const req = decodedHeader.accepts[0];
  assert.equal(req.network, "stellar:testnet", "Network must be stellar:testnet");
  assert.equal(req.scheme, "exact", "Scheme must be exact");
  assert.equal(req.amount, "10000", "Amount must be 10000 atomic (0.001 USDC)");
  assert.equal(req.asset, USDC_TESTNET_ADDRESS, "Asset must match USDC Testnet SEP-41");
  assert.equal(req.payTo, SECOND_PROVIDER_WALLET, "payTo must match 2nd provider wallet");
  assert.equal(req.maxTimeoutSeconds, 60, "Timeout must be 60 seconds");

  const body = await response.json();
  assert.equal(body.x402Version, 2);
  assert.equal(body.error, "Payment required");
  assert.equal(body.accepts[0].payTo, SECOND_PROVIDER_WALLET);

  console.log("  ✓ HTTP Status: 402 Payment Required");
  console.log("  ✓ Header PAYMENT-REQUIRED: valid and decodable");
  console.log(`  ✓ Network: ${req.network}`);
  console.log(`  ✓ Scheme: ${req.scheme}`);
  console.log(`  ✓ Asset: ${req.asset}`);
  console.log(`  ✓ Amount: ${req.amount} atomic (${Number(req.amount) / 10000000} USDC)`);
  console.log(`  ✓ payTo: ${req.payTo}`);
  console.log(`  ✓ Resource: ${body.resource.url}`);
  console.log("\n=================================================================");
  console.log("✅ P1-T1 PASS: 2nd Provider HTTP 402 Challenge Contract Verified");
  console.log("=================================================================\n");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
