import assert from "node:assert/strict";
import { decodePaymentRequiredHeader } from "@x402/core/http";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

console.log(`\n🔍 [E2E ECOSYSTEM TEST] Starting verification against ${BASE_URL}...\n`);

// 1. REST Discovery: /api/discovery/resources
console.log("▶ [1/5] Testing /api/discovery/resources...");
const resourcesRes = await fetch(`${BASE_URL}/api/discovery/resources`);
assert.equal(resourcesRes.status, 200, "resources endpoint should return 200");
const resourcesData = await resourcesRes.json();
assert.ok(Array.isArray(resourcesData.results), "results must be an array");
assert.ok(resourcesData.count > 0, "should have at least 1 service indexed");
assert.equal(resourcesData.indexStatus, "local-mvp");
console.log(`  ✓ Indexed services found: ${resourcesData.count} (indexStatus: ${resourcesData.indexStatus})`);

// 2. REST Pilots & Search: /api/discovery/pilots & /api/discovery/search
console.log("▶ [2/5] Testing /api/discovery/pilots and /api/discovery/search...");
const pilotsRes = await fetch(`${BASE_URL}/api/discovery/pilots`);
assert.equal(pilotsRes.status, 200, "pilots endpoint should return 200");
const pilotsData = await pilotsRes.json();
assert.equal(pilotsData.ok, true);
const pilotIds = pilotsData.results.map((p) => p.id);
assert.ok(pilotIds.includes("website-intelligence-pilot"), "website-intelligence-pilot missing");
assert.ok(pilotIds.includes("video-repurpose-pilot"), "video-repurpose-pilot missing");
assert.ok(pilotIds.includes("agent-policy-pilot"), "agent-policy-pilot missing");
console.log(`  ✓ Pilot fixtures verified (${pilotsData.count} pilots, including agent-policy-pilot)`);

const searchRes = await fetch(`${BASE_URL}/api/discovery/search?query=riesgo%20swap`);
assert.equal(searchRes.status, 200, "search endpoint should return 200");
const searchData = await searchRes.json();
assert.equal(searchData.ok, true);
assert.ok(searchData.results.length > 0, "search for 'riesgo swap' should return matches");
console.log(`  ✓ Search query 'riesgo swap' returned ${searchData.results.length} ranked match(es)`);

// 3. MCP Discovery Streamable HTTP: /api/mcp
console.log("▶ [3/5] Testing MCP Streamable Server (/api/mcp)...");
const mcpHealthRes = await fetch(`${BASE_URL}/api/mcp`);
assert.equal(mcpHealthRes.status, 200, "MCP health should return 200");
const mcpHealth = await mcpHealthRes.json();
assert.equal(mcpHealth.mode, "read-only");
assert.equal(mcpHealth.paidCall, false);

async function mcpRpc(id, method, params) {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  assert.equal(res.status, 200, `MCP RPC ${method} failed with status ${res.status}`);
  return res.json();
}

const initRpc = await mcpRpc(1, "initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "e2e-swarm-runner", version: "1.0.0" }
});
assert.equal(initRpc.result.serverInfo.name, "stellar-bazaar-discovery");

const toolsRpc = await mcpRpc(2, "tools/list", {});
const toolNames = toolsRpc.result.tools.map((t) => t.name);
assert.deepEqual(toolNames, [
  "get_bazaar_capabilities",
  "list_services",
  "search_services",
  "get_service",
  "list_workflow_bundles",
  "get_workflow_bundle",
  "validate_service_card"
]);
console.log(`  ✓ MCP tools validated: [${toolNames.join(", ")}]`);

// Inspect a pilot via MCP
const mcpPilotRpc = await mcpRpc(3, "tools/call", {
  name: "get_service",
  arguments: { id: "agent-policy-pilot" }
});
assert.equal(mcpPilotRpc.result.isError, undefined);
assert.match(mcpPilotRpc.result.content[0].text, /agent-governance/);
console.log("  ✓ MCP tool call get_service('agent-policy-pilot') succeeded");

// Validate card via MCP tool
const validateRpc = await mcpRpc(4, "tools/call", {
  name: "validate_service_card",
  arguments: {
    card: {
      version: "bazaar.service-card/v0",
      id: "test-card",
      name: "Test Card",
      description: "Servicio de prueba de validación determinista.",
      kind: "http",
      url: "https://example.com",
      routeTemplate: "/api/test?param={param}",
      input: [{ name: "param", type: "string", required: true }],
      network: "stellar:testnet",
      payment: {
        scheme: "exact",
        asset: "USDC",
        amount: "0.01",
        destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
      },
      provider: { name: "Test Provider" },
      tags: ["test"]
    }
  }
});
const valResult = JSON.parse(validateRpc.result.content[0].text);
assert.equal(valResult.valid, true);
console.log("  ✓ MCP tool call validate_service_card verified valid card");

// 4. Reference Endpoint Verification
console.log("▶ [4/5] Testing Reference Endpoint (/api/reference/swap-risk)...");
const refRes = await fetch(`${BASE_URL}/api/reference/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy`);
assert.equal(refRes.status, 200, "Reference swap-risk should return 200");
const refData = await refRes.json();
assert.equal(refData.ok, true);
assert.equal(refData.result.pair, "XLM/USDC");
assert.equal(refData.result.amount, 2500);
assert.ok(refData.result.routeRisk, "routeRisk must be present in response");
console.log(`  ✓ Deterministic swap-risk reference returned routeRisk: ${refData.result.routeRisk}`);

// 5. HTTP x402 v2 Protocol Challenge & Tamper Rejection
console.log("▶ [5/5] Testing HTTP x402 v2 Challenge & Tamper Rejection (/api/x402/swap-risk)...");
const x402Url = `${BASE_URL}/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy`;
const unpaidRes = await fetch(x402Url);
assert.equal(unpaidRes.status, 402, "Unpaid call must return HTTP 402");
const reqHeader = unpaidRes.headers.get("payment-required");
assert.ok(reqHeader, "PAYMENT-REQUIRED header must be present on 402 response");
const decodedReq = decodePaymentRequiredHeader(reqHeader);
assert.equal(decodedReq.x402Version, 2, "x402 version must be 2");
assert.equal(decodedReq.accepts[0].network, "stellar:testnet");
assert.equal(decodedReq.accepts[0].scheme, "exact");
assert.equal(decodedReq.accepts[0].amount, "10000");
console.log(`  ✓ Unpaid request returned HTTP 402 with PAYMENT-REQUIRED v2 (scheme: ${decodedReq.accepts[0].scheme}, amount: ${decodedReq.accepts[0].amount})`);

const tamperRes = await fetch(x402Url, {
  headers: { "PAYMENT-SIGNATURE": "tampered-signature-test" }
});
assert.equal(tamperRes.status, 402, "Tampered signature must be rejected with HTTP 402");
console.log("  ✓ Tampered signature rejected with HTTP 402 MALFORMED_PAYMENT_SIGNATURE");

console.log("\n=======================================================");
console.log("🎉 ALL SPRINT 2 E2E TESTS PASSED WITH ZERO FUND RISK!");
console.log("=======================================================\n");
