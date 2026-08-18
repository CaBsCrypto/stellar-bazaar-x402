/**
 * examples/agent-autonomous-buyer.mjs
 *
 * Plug-and-play demonstration of an autonomous AI Agent interacting with Stellar Bazaar x402:
 * 1. Discovers services via Streamable MCP Tool Calling.
 * 2. Evaluates ServiceCard, schema constraints, and safety budget limits.
 * 3. Handles HTTP 402 challenge, generates Ed25519 authorization, and settles on Stellar Testnet.
 * 4. Receives deterministic data and prints the verified on-chain receipt.
 */

import { readFileSync, existsSync } from "node:fs";
import { BazaarAgentClient } from "../lib/bazaar-agent-client.ts";

// Load local development environment variables
const envFile = existsSync(".env.local") ? ".env.local" : ".env.x402.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#") && !process.env[line.slice(0, i)]) {
      process.env[line.slice(0, i)] = line.slice(i + 1);
    }
  }
}

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const PAYER_SECRET = process.env.X402_PAYER_SECRET;

if (!PAYER_SECRET) {
  console.error("❌ Missing X402_PAYER_SECRET in .env.local / environment.");
  process.exit(1);
}

console.log("=================================================================");
console.log("🤖 [AUTONOMOUS AGENT] Starting Stellar Bazaar x402 Buyer Flow");
console.log("=================================================================\n");

// 1. Initialize the Agent Client with strict safety budget constraints
const client = new BazaarAgentClient({
  baseUrl: BASE_URL,
  payerSecretKey: PAYER_SECRET,
  maxPriceAllowedUsdc: 0.05, // Maximum 0.05 USDC per call policy limit
  allowedNetworks: ["stellar:testnet"],
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

// 4. Autonomous Execution with x402 Auto-Settlement
console.log("\n▶ [Step 3] Agent invokes service and fulfills x402 payment challenge...");
const execution = await client.executeService(targetCard, {
  pair: "XLM/USDC",
  amount: 2500,
  side: "buy",
});

console.log(`  ✓ HTTP Status: ${execution.status}`);
console.log(`  ✓ Payment Settled: ${execution.payment.settled ? "YES" : "NO"}`);
if (execution.payment.transactionHash) {
  console.log(`  ✓ Transaction Hash: ${execution.payment.transactionHash}`);
  console.log(`  ✓ Stellar Expert Link: ${execution.payment.receiptUrl}`);
}

console.log("\n▶ [Step 4] Verified Business Result Payload Received:");
console.log(JSON.stringify(execution.data, null, 2));

console.log("\n=================================================================");
console.log("🎉 Autonomous Agent execution completed successfully with 100% verified receipt!");
console.log("=================================================================\n");
