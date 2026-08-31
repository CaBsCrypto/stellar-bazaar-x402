import assert from "node:assert/strict";

const base = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";

const specRes = await fetch(`${base}/api/webmcp/spec`);
assert.equal(specRes.status, 200);
const spec = await specRes.json();
assert.equal(spec.schemaVersion, "webmcp.specification/v1");
assert.equal(spec.tools.length, 8);

const mcpHealthRes = await fetch(`${base}/api/mcp`);
assert.equal(mcpHealthRes.status, 200);
const mcpHealth = await mcpHealthRes.json();
assert.ok(Array.isArray(mcpHealth.tools));

const searchRes = await fetch(`${base}/api/discovery/search?query=swap`);
assert.equal(searchRes.status, 200);
const searchData = await searchRes.json();
assert.ok(searchData.results.length >= 1);

const catalogRes = await fetch(`${base}/api/discovery/resources`);
assert.equal(catalogRes.status, 200);
const catalog = await catalogRes.json();
assert.ok(catalog.results.some(service => service.id === "swap-risk-quote"));

const flowRes = await fetch(`${base}/api/x402/swap-risk?pair=XLM%2FUSDC&amount=100&side=buy`);
assert.ok([402, 503].includes(flowRes.status));
if (flowRes.status === 402) assert.ok(flowRes.headers.get("payment-required"));
if (flowRes.status === 503) {
  const unavailable = await flowRes.json();
  assert.ok(["PAYMENT_CONFIG_UNAVAILABLE", "X402_SERVER_NOT_CONFIGURED"].includes(unavailable.error.code));
}

const execRes = await fetch(`${base}/api/reference/swap-risk?pair=XLM%2FUSDC&amount=100&side=buy`);
assert.equal(execRes.status, 200);
const execData = await execRes.json();
assert.ok(["low", "medium", "high"].includes(execData.result.routeRisk));

const deliveryRes = await fetch(`${base}/api/buyer-execution/website-intelligence`);
assert.equal(deliveryRes.status, 200);
const delivery = await deliveryRes.json();
assert.equal(delivery.reconciliation.status, "matched");
assert.equal(delivery.boundaries.newPaymentPerformed, false);

console.log("webmcp and buyer-consumption HTTP surfaces: PASS");
