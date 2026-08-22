import assert from "node:assert/strict";
import { BazaarAgentClient } from "../lib/bazaar-agent-client.ts";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

console.log(`\n🛡️  [AGENT SAFETY & AUTONOMOUS SUITE] Running against ${BASE_URL}...\n`);

// 1. Initialize client
const agent = new BazaarAgentClient({
  baseUrl: BASE_URL,
  maxPriceAllowedUsdc: 0.05,
  allowedNetworks: ["stellar:testnet"],
  allowedAssets: ["USDC"],
});

// Test Case 1: Autonomous Discovery via MCP
console.log("▶ [TC-01] Testing Autonomous Discovery via MCP...");
const mcpResults = await agent.searchServicesMCP("riesgo swap");
assert.ok(mcpResults.length > 0, "MCP search should return results");
const target = mcpResults.find((c) => c.id === "swap-risk-quote");
assert.ok(target, "swap-risk-quote card must be discovered");
console.log(`  ✓ Discovered target service: "${target.name}" via MCP`);

// Test Case 2: Safety Policy Validation - Success Case
console.log("▶ [TC-02] Testing Safety Policy on Valid Card...");
const policyValid = agent.validatePaymentPolicy(target);
assert.equal(policyValid.allowed, true);
console.log("  ✓ Valid card passed agent policy checks");

// Test Case 3: Safety Policy - Budget Overrun Trap
console.log("▶ [TC-03] Testing Budget Overrun Rejection...");
const expensiveCard = {
  ...target,
  payment: { ...target.payment, amount: "500.00" }, // 500 USDC exceeds 0.05 max
};
const policyOverrun = agent.validatePaymentPolicy(expensiveCard);
assert.equal(policyOverrun.allowed, false);
assert.match(policyOverrun.reason, /exceeds maximum permitted budget/);
console.log("  ✓ Expensive card rejected before signing");

// Test Case 4: Safety Policy - Network Trap
console.log("▶ [TC-04] Testing Unauthorized Network Rejection...");
const wrongNetworkCard = {
  ...target,
  network: "ethereum:mainnet",
};
const policyNetwork = agent.validatePaymentPolicy(wrongNetworkCard);
assert.equal(policyNetwork.allowed, false);
assert.match(policyNetwork.reason, /stellar:testnet/);
console.log("  ✓ Unsupported network rejected before signing");

const wrongAssetCard = {
  ...target,
  payment: { ...target.payment, asset: "EURC" },
};
const policyAsset = agent.validatePaymentPolicy(wrongAssetCard);
assert.equal(policyAsset.allowed, false);
assert.match(policyAsset.reason, /Asset EURC/);
console.log("  ✓ Unsupported asset rejected before signing");

// Test Case 5: Safety Policy - Malformed Route Traversal Trap
console.log("▶ [TC-05] Testing Malformed Route Traversal Rejection...");
const traversalCard = {
  ...target,
  routeTemplate: "/api/../../../etc/passwd",
};
const policyTraversal = agent.validatePaymentPolicy(traversalCard);
assert.equal(policyTraversal.allowed, false);
console.log("  ✓ Malformed route template rejected by conformance check");

console.log("\n=======================================================");
console.log("🎉 ALL AGENT SAFETY & AUTONOMOUS CHECKS PASSED 100%!");
console.log("=======================================================\n");
