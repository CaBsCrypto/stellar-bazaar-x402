/**
 * scripts/test-three-actors-e2e.mjs
 *
 * Comprehensive Multi-Actor Integration Test:
 * 1. Actor 1 (Provider): Spins up an x402-enabled service & publishes ServiceCard.
 * 2. Actor 2 (Bazaar Infra): Validates 11-rule conformance, indexes service, routes discovery.
 * 3. Actor 3 (Buyer Agent): Discovers via MCP/REST, receives 402 challenge, authorizes payment signature,
 *    settles via Facilitator, and verifies delivery & receipt reconciliation.
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { validateServiceCard } from "../lib/discovery.ts";
import { deriveProviderDelivery } from "../lib/delivery-boundaries.ts";
import { hasMatchingProviderResultHash } from "../lib/delivery-result.ts";

const network = "stellar:testnet";
const asset = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const payTo = "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ";
const amount = "10000"; // 0.001 USDC
const fixtureKey = "ci-secret-safe-key-not-wallet";

const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const decode = (v) => JSON.parse(Buffer.from(v, "base64url").toString());
const mac = (v) => createHmac("sha256", fixtureKey).update(JSON.stringify(v)).digest("base64url");
const sign = (v) => encode({ value: v, mac: mac(v) });
const verifySignature = (raw) => {
  try {
    const signed = decode(raw);
    const expected = Buffer.from(mac(signed.value));
    const actual = Buffer.from(signed.mac);
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? signed.value : null;
  } catch {
    return null;
  }
};

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));

console.log("=================================================================");
console.log("🧪 [E2E SUITE] Testing Complete 3-Actor Flow in Stellar Bazaar");
console.log("=================================================================\n");

// --- 1. MOCK FACILITATOR ---
const usedNonces = new Set();
const facilitator = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};

  if (req.url === "/verify") {
    const sig = verifySignature(body.paymentSignature ?? "");
    if (!sig) return json(res, 402, { ok: false, error: "INVALID_SIGNATURE" });
    return json(res, 200, { ok: true, payer: "GAPAYER1234567890TESTNET" });
  }

  if (req.url === "/settle") {
    const sig = verifySignature(body.paymentSignature ?? "");
    if (!sig) return json(res, 402, { ok: false, error: "INVALID_SIGNATURE" });
    if (usedNonces.has(sig.nonce)) return json(res, 402, { ok: false, error: "REPLAY_DETECTED" });
    usedNonces.add(sig.nonce);

    const txHash = `tx_${randomUUID().replace(/-/g, "")}`;
    return json(res, 200, {
      success: true,
      transaction: txHash,
      ledger: 445566,
      payer: "GAPAYER1234567890TESTNET",
      network,
      asset,
      amount,
      recipient: payTo,
    });
  }

  return json(res, 404, { error: "not found" });
});

const facilitatorPort = await listen(facilitator);
const facilitatorUrl = `http://127.0.0.1:${facilitatorPort}`;

// --- 2. ACTOR 1: PROVIDER SERVICE ---
const requirements = { network, asset, payTo, amount, scheme: "exact", method: "POST", path: "/v1/oracle/data" };
const provider = createServer(async (req, res) => {
  if (req.url !== "/v1/oracle/data" || req.method !== "POST") return json(res, 404, { error: "not found" });
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const input = JSON.parse(Buffer.concat(chunks));

  const signature = req.headers["payment-signature"];
  if (!signature) {
    const challenge = { x402Version: 2, error: "Payment required", accepts: [requirements] };
    return json(res, 402, challenge, { "payment-required": encode(challenge) });
  }

  const settleRes = await fetch(`${facilitatorUrl}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentSignature: signature, requirements }),
  });

  if (!settleRes.ok) {
    return json(res, 402, { ok: false, error: "SETTLEMENT_FAILED" });
  }

  const settledReceipt = await settleRes.json();
  const deliveryData = {
    symbol: input.symbol,
    rate: 0.125,
    confidenceScore: 99.4,
    timestamp: new Date().toISOString(),
  };

  return json(
    res,
    200,
    {
      ok: true,
      result: deliveryData,
      receipt: settledReceipt,
    },
    { "payment-response": encode(settledReceipt) }
  );
});

const providerPort = await listen(provider);
const providerUrl = `http://127.0.0.1:${providerPort}`;

// Provider declares ServiceCard
const providerCard = {
  version: "bazaar.service-card/v0",
  id: "fast-rate-oracle",
  name: "Fast Rate Oracle",
  description: "Real-time rate oracle with x402 Testnet USDC settlement.",
  kind: "http",
  url: providerUrl,
  routeTemplate: "/v1/oracle/data",
  input: [{ name: "symbol", type: "string", required: true }],
  network: "stellar:testnet",
  payment: {
    scheme: "exact",
    asset: "USDC",
    amount: "0.001",
    destination: payTo,
  },
  provider: { name: "Decentralized Oracle Node" },
  tags: ["oracle", "rates", "defi"],
};

// --- 3. ACTOR 2: BAZAAR INFRASTRUCTURE (Discovery & Conformance) ---
console.log("▶ [Actor 1 & 2] Provider publishes ServiceCard to Bazaar. Validating Conformance...");
const conformanceOutcomes = validateServiceCard(providerCard);
const conformanceFailures = conformanceOutcomes.filter((c) => c.status === "fail");
assert.equal(conformanceFailures.length, 0, "ServiceCard must pass all 11 conformance rules.");
console.log("  ✓ ServiceCard 11-Rule Conformance check PASSED.");

const catalog = new Map([[providerCard.id, providerCard]]);
const discovery = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/api/discovery/search") {
    const q = url.searchParams.get("query")?.toLowerCase() ?? "";
    const matches = Array.from(catalog.values()).filter(
      (c) => c.name.toLowerCase().includes(q) || c.tags?.some((t) => t.includes(q))
    );
    return json(res, 200, { ok: true, results: matches.map((resource) => ({ resource })) });
  }
  return json(res, 404, { error: "not found" });
});

const discoveryPort = await listen(discovery);
const discoveryUrl = `http://127.0.0.1:${discoveryPort}`;
console.log("  ✓ Bazaar Discovery index online.");

// --- 4. ACTOR 3: BUYER AGENT FLOW ---
console.log("\n▶ [Actor 3] Buyer Agent starts discovery & paid execution...");

// 4.1 Search discovery
const searchRes = await fetch(`${discoveryUrl}/api/discovery/search?query=rates`);
const searchBody = await searchRes.json();
assert.equal(searchBody.results.length, 1);
const matchedCard = searchBody.results[0].resource;
console.log(`  ✓ Agent found service: "${matchedCard.name}"`);

// 4.2 Query service without payment -> Expect 402
const unpaidRes = await fetch(`${providerUrl}/v1/oracle/data`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ symbol: "XLM/USDC" }),
});
assert.equal(unpaidRes.status, 402, "Unpaid call must yield 402 Payment Required.");
console.log("  ✓ Agent received standard HTTP 402 challenge.");

// 4.3 Sign payment authorization
const clientAuth = sign({
  network,
  asset,
  payTo,
  amount,
  expiresAt: Date.now() + 60000,
  nonce: randomUUID(),
});

// 4.4 Execute paid call
const paidRes = await fetch(`${providerUrl}/v1/oracle/data`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "payment-signature": clientAuth,
  },
  body: JSON.stringify({ symbol: "XLM/USDC" }),
});

assert.equal(paidRes.status, 200, "Paid request must succeed with 200 OK.");
const paidBody = await paidRes.json();
assert.equal(paidBody.ok, true);
assert.equal(paidBody.result.symbol, "XLM/USDC");
assert.ok(paidBody.receipt.transaction.startsWith("tx_"));
console.log("  ✓ Paid execution succeeded with HTTP 200 OK.");
console.log(`  ✓ On-Chain Receipt: ${paidBody.receipt.transaction} on ledger ${paidBody.receipt.ledger}`);

// 4.5 Delivery Boundaries & Reconciliation
const delivery = deriveProviderDelivery(paidRes.status, paidBody, hasMatchingProviderResultHash(paidBody));
assert.ok(delivery.resultAvailable);
console.log("  ✓ Provider Delivery boundary verified and reconciled.");

// Clean up servers
await close(discovery);
await close(provider);
await close(facilitator);

console.log("\n=================================================================");
console.log("🎉 ALL 3 ACTORS VERIFIED: Listing, Discovery, 402 Payment & Delivery!");
console.log("=================================================================\n");
