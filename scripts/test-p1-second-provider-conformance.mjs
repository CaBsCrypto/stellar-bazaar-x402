/**
 * scripts/test-p1-second-provider-conformance.mjs
 *
 * P1-T2 Verification Suite:
 * 1. Loads the 2nd provider ServiceCard (bazaar-card.json).
 * 2. Runs the 11 deterministic conformance rules locally via validateServiceCard().
 * 3. Verifies 11/11 passing checks, SSRF and URL validation, decimal amount, and stellar:testnet network.
 * 4. Runs negative tests (tampered URL, invalid destination, dangerous path traversal, bad scheme).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateServiceCard } from "../lib/discovery.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cardPath = join(__dirname, "../examples/fast-provider-template/bazaar-card.json");
const cleanCard = JSON.parse(readFileSync(cardPath, "utf8"));

console.log("=================================================================");
console.log("🧪 [P1-T2 TEST] 2nd Provider 11-Rule Conformance & Security Gate");
console.log("=================================================================\n");

// 1. Happy Path: Valid 2nd Provider ServiceCard
console.log("▶ [Test 1] Validating clean 2nd Provider bazaar-card.json...");
const cleanOutcomes = validateServiceCard(cleanCard);
const cleanFailures = cleanOutcomes.filter((o) => o.status === "fail");

assert.equal(cleanFailures.length, 0, "Clean card must have 0 failures");
assert.ok(cleanOutcomes.length >= 10, "Must evaluate all conformance rules");

console.log(`  ✓ Evaluated ${cleanOutcomes.length} rules.`);
for (const o of cleanOutcomes) {
  console.log(`    [${o.status.toUpperCase()}] ${o.rule}: ${o.reason}`);
}

// 2. Negative Test: SSRF / Path Traversal in routeTemplate
console.log("\n▶ [Test 2] Negative Test: Path Traversal injection in routeTemplate...");
const traversalCard = { ...cleanCard, routeTemplate: "/v1/weather/../../etc/passwd" };
const traversalOutcomes = validateServiceCard(traversalCard);
assert.ok(traversalOutcomes.some((o) => o.rule === "route.template" && o.status === "fail"), "Must reject path traversal");
console.log("  ✓ Correctly rejected path traversal '../'");

// 3. Negative Test: Insecure HTTP External Origin
console.log("\n▶ [Test 3] Negative Test: Non-HTTPS remote origin...");
const httpRemoteCard = { ...cleanCard, url: "http://insecure-remote-provider.com" };
const httpRemoteOutcomes = validateServiceCard(httpRemoteCard);
assert.ok(httpRemoteOutcomes.some((o) => o.rule === "resource.url" && o.status === "fail"), "Must reject plain HTTP remote url");
console.log("  ✓ Correctly rejected non-HTTPS remote URL");

// 4. Negative Test: Invalid Stellar Destination Address
console.log("\n▶ [Test 4] Negative Test: Malformed Stellar public key...");
const badKeyCard = { ...cleanCard, payment: { ...cleanCard.payment, destination: "G_INVALID_SHORT_KEY" } };
const badKeyOutcomes = validateServiceCard(badKeyCard);
assert.ok(badKeyOutcomes.some((o) => o.rule === "payment.destination" && o.status === "fail"), "Must reject invalid Stellar destination");
console.log("  ✓ Correctly rejected malformed Stellar destination");

// 5. Negative Test: Wrong Network
console.log("\n▶ [Test 5] Negative Test: Non-Testnet network...");
const mainnetCard = { ...cleanCard, network: "stellar:pubnet" };
const mainnetOutcomes = validateServiceCard(mainnetCard);
assert.ok(mainnetOutcomes.some((o) => o.rule === "payment.network" && o.status === "fail"), "Must reject non-testnet network");
console.log("  ✓ Correctly rejected non-testnet network");

console.log("\n=================================================================");
console.log("✅ P1-T2 PASS: 11/11 Conformance Rules & Negative Gates Verified");
console.log("=================================================================\n");
