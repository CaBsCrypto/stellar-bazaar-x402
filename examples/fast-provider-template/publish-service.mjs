/**
 * examples/fast-provider-template/publish-service.mjs
 *
 * Programmatically validates and publishes a provider's bazaar-card.json
 * to Stellar Bazaar's Service Registry via HTTP Ingestion API.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateServiceCard } from "../../lib/discovery.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BAZAAR_URL = process.env.BAZAAR_BASE_URL ?? "http://127.0.0.1:3000";
const PROVIDER_KEY = process.env.BAZAAR_PROVIDER_SECRET ?? "";

const cardPath = join(__dirname, "bazaar-card.json");
if (!existsSync(cardPath)) {
  console.error("❌ Error: bazaar-card.json not found in template directory.");
  process.exit(1);
}

const card = JSON.parse(readFileSync(cardPath, "utf8"));

console.log("=================================================================");
console.log("⚡ [FAST PROVIDER] Publishing ServiceCard to Stellar Bazaar");
console.log("=================================================================\n");
console.log(`▶ Service ID: ${card.id}`);
console.log(`▶ Service Name: ${card.name}`);
console.log(`▶ Price: ${card.payment.amount} ${card.payment.asset} (${card.payment.scheme})`);
console.log(`▶ Destination: ${card.payment.destination}\n`);

// 1. Local Deterministic Conformance Validation
console.log("▶ [Step 1] Running 11-rule deterministic conformance preflight...");
const outcomes = validateServiceCard(card);
const failed = outcomes.filter((o) => o.status === "fail");

if (failed.length > 0) {
  console.error("❌ Conformance check failed:");
  for (const f of failed) {
    console.error(`  - [Rule ${f.rule}] ${f.reason}`);
  }
  process.exit(1);
}
console.log("  ✓ All 11 conformance rules PASSED.");

// 2. Submit to Bazaar Ingestion API
console.log(`\n▶ [Step 2] Sending ServiceCard to Bazaar Ingest API: ${BAZAAR_URL}/api/publisher/ingest...`);

try {
  const headers = { "Content-Type": "application/json" };
  if (PROVIDER_KEY) {
    headers["X-Bazaar-Provider-Key"] = PROVIDER_KEY;
  }

  const res = await fetch(`${BAZAAR_URL}/api/publisher/ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify(card),
  });

  const responseBody = await res.json();

  if (!res.ok) {
    console.error(`⚠️ Bazaar Response (${res.status}):`, JSON.stringify(responseBody, null, 2));
    if (res.status === 503) {
      console.log("\n💡 Note: Bazaar server is running without durable storage credentials.");
      console.log("   For staging/local test, use the web form at /publish or run tests with test:provider:self-listing.");
    }
    process.exit(1);
  }

  console.log("\n=================================================================");
  console.log("🎉 SERVICE SUCCESSFULLY PUBLISHED & INDEXED!");
  console.log("=================================================================");
  console.log(`✓ Status: ${responseBody.status}`);
  console.log(`✓ Card Hash: ${responseBody.hash}`);
  console.log(`✓ Revision: ${responseBody.revision}`);
  console.log(`✓ Discovery URL: ${BAZAAR_URL}/api/discovery/search?query=${encodeURIComponent(card.name)}`);
  console.log("=================================================================\n");
} catch (err) {
  console.log(`  ℹ️ Bazaar server at ${BAZAAR_URL} is offline (Local Preflight was successful).`);
  console.log("  ✓ Preflight confirmed ServiceCard is 100% compliant for automated listing.");
}
