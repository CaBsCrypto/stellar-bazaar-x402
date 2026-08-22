/**
 * examples/agent-autonomous-buyer.mjs
 *
 * Plug-and-play demonstration of an autonomous AI Agent interacting with Stellar Bazaar x402:
 * 1. Discovers services via Streamable MCP Tool Calling.
 * 2. Evaluates ServiceCard, schema constraints, and safety budget limits.
 * 3. Stops before payment unless the host supplies independent receipt reconciliation.
 */

import { BazaarAgentClient } from "../lib/bazaar-agent-client.ts";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
console.log("=================================================================");
console.log("🤖 [AUTONOMOUS AGENT] Starting Stellar Bazaar x402 Buyer Flow");
console.log("=================================================================\n");

// 1. Initialize the Agent Client with strict safety budget constraints
const client = new BazaarAgentClient({
  baseUrl: BASE_URL,
  maxPriceAllowedUsdc: 0.05, // Maximum 0.05 USDC per call policy limit
  allowedNetworks: ["stellar:testnet"],
  allowedAssets: ["USDC"],
});

// 2. Discover Service via MCP Tool
console.log("▶ [Step 1] Agent queries MCP server: 'search_services' for 'riesgo swap'...");
const matchedCards = await client.searchServicesMCP("riesgo swap");
console.log(`  ✓ Found ${matchedCards.length} service card(s).`);

const targetCard = matchedCards.find((c) => c.id === "swap-risk-quote") ?? matchedCards[0];
if (!targetCard) {
  console.error("❌ No matching service card found.");
  process.exit(1);
}

console.log(`  ✓ Selected Service: "${targetCard.name}" (ID: ${targetCard.id})`);
console.log(`  ✓ Declared Price: ${targetCard.payment.amount} ${targetCard.payment.asset} via scheme "${targetCard.payment.scheme}"`);

// 3. Pre-flight Safety and Policy Evaluation
console.log("\n▶ [Step 2] Agent evaluates ServiceCard against internal safety policy...");
const policyResult = client.validatePaymentPolicy(targetCard);
if (!policyResult.allowed) {
  console.error(`❌ Policy Check Failed: ${policyResult.reason}`);
  process.exit(1);
}
console.log("  ✓ Policy check PASSED: Network, asset, route template, and budget verified.");

// 4. Stop before payment. A production host must inject receiptVerifier into
// BazaarAgentClient and independently reconcile network, asset, amount and
// destination; a transaction hash alone is insufficient.
console.log("\n▶ [Step 3] Paid execution intentionally stopped before authorization.");
console.log("  ✓ No payment sent. Configure a server-side receiptVerifier before executeService().");

console.log("\n=================================================================");
console.log("✅ Autonomous discovery and policy preflight completed without payment.");
console.log("=================================================================\n");
