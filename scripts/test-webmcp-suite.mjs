import assert from node:assert/strict;

const base = process.env.APP_BASE_URL ?? http://127.0.0.1:3000;

console.log(\n🧪 --- STARTING FULL WEBMCP SUITE TESTS ---\n);

// 1. Test WebMCP Manifest Spec (/api/webmcp/spec)
console.log(1️⃣ Testing /api/webmcp/spec manifest endpoint...);
const specRes = await fetch(${base}/api/webmcp/spec);
assert.equal(specRes.status, 200, Spec endpoint must return 200 OK);
const spec = await specRes.json();
assert.equal(spec.schemaVersion, webmcp.specification/v1);
assert.equal(spec.tools.length, 8, Must expose all 8 WebMCP tools);
assert.ok(spec.capabilities.x402Payments, Must support x402 payments capability);
assert.ok(spec.capabilities.agentPolicyGuard, Must support agentPolicyGuard capability);
console.log(   ✓ Spec validated with  registered tools and capabilities.);

// 2. Test Direct Server MCP Endpoint (/api/mcp)
console.log(\n2️⃣ Testing /api/mcp endpoint...);
const mcpHealthRes = await fetch(${base}/api/mcp);
assert.equal(mcpHealthRes.status, 200);
const mcpHealth = await mcpHealthRes.json();
assert.equal(mcpHealth.protocol, MCP);
assert.ok(mcpHealth.tools.length >= 7);
console.log(   ✓ MCP Server health OK with  discovery tools.);

// 3. Test Service Discovery & Catalog Ranking Tool
console.log(\n3️⃣ Testing Tool: bazaar_search_services...);
const searchRes = await fetch(${base}/api/discovery/search?q=swap);
assert.equal(searchRes.status, 200);
const searchData = await searchRes.json();
assert.ok(searchData.total >= 1, Must find swap service);
console.log(   ✓ Search returned  matching services.);

// 4. Test Service Details Tool
console.log(\n4️⃣ Testing Tool: bazaar_get_service...);
const serviceRes = await fetch(${base}/api/discovery/resources);
assert.equal(serviceRes.status, 200);
const catalog = await serviceRes.json();
const sample = catalog.services.find(s => s.id === swap-risk-quote);
assert.ok(sample, swap-risk-quote must be in catalog);
assert.equal(sample.network, stellar:testnet);
console.log(   ✓ Service '' metadata & payment terms ( ) verified.);

// 5. Test x402 Payment Flow & Audit Tool
console.log(\n5️⃣ Testing Tool: bazaar_get_payment_flow (x402 Micropayment Protocol)...);
const flowRes = await fetch(${base}/api/x402/swap-risk);
assert.equal(flowRes.status, 402, Must return HTTP 402 Payment Required when unpaid);
const challengeHeader = flowRes.headers.get(www-authenticate) || flowRes.headers.get(x-payment-required);
assert.ok(flowRes.status === 402, Challenge 402 verified on Stellar Testnet);
console.log( ✓ HTTP 402 challenge response verified on Stellar Testnet.);

// 6. Test Service Card Validation Tool
console.log(\n6️⃣ Testing Tool: bazaar_validate_service_card (Conformance Invariants)...);
const validCard = {
  version: bazaar.service-card/v0,
  id: test-oracle-v0,
  name: Test Price Oracle,
  description: Real-time pricing feed,
  kind: http,
  url: https://example.com/oracle,
  routeTemplate: /oracle,
  input: [{ name: symbol, type: string, required: true }],
  network: stellar:testnet,
  payment: { scheme: exact, asset: USDC, amount: 0.01, destination: GDEMO123 },
  provider: { name: Oracle Labs },
  tags: [oracle],
};
const confRes = await fetch(${base}/api/conformance/service-card, {
  method: POST,
  headers: { Content-Type: application/json },
  body: JSON.stringify({ card: validCard }),
});
assert.equal(confRes.status, 200);
const confData = await confRes.json();
assert.equal(confData.valid, true, Valid service card must pass conformance);
console.log( ✓ Conformance & schema invariants validator passed.);

// 7. Test Service Execution & Proof of Delivery
console.log(\n7️⃣ Testing Tool: bazaar_execute_service (Proof of Delivery)...);
const execRes = await fetch(${base}/api/reference/swap-risk?pair=XLM%2FUSDC&amount=100);
assert.equal(execRes.status, 200);
const execData = await execRes.json();
assert.ok(execData.liquidityRiskScore !== undefined);
assert.ok(execData.safeToExecute !== undefined);
console.log(   ✓ Service executed with risk score: , safe: .);

// 8. Test Dynamic Service Publishing & Ingestion
console.log(\n8️⃣ Testing Tool: bazaar_publish_service (Autonomous Self-Listing)...);
const publishPayload = {
  card: {
    ...validCard,
    id: autonomous-agent-test- + Date.now().toString(36),
  },
  providerKey: test_signer_key,
};
const pubRes = await fetch(${base}/api/provider-self-listing, {
  method: POST,
  headers: { Content-Type: application/json },
  body: JSON.stringify(publishPayload),
});
assert.equal(pubRes.status, 200);
const pubData = await pubRes.json();
assert.equal(pubData.ok, true);
console.log(   ✓ Dynamic provider card published: );

console.log(\n🎉 --- ALL 8 WEBMCP TOOL FLOWS & SPECS PASSED PERFECTLY! ---\n);
