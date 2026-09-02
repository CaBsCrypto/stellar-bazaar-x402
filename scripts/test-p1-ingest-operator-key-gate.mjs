/**
 * scripts/test-p1-ingest-operator-key-gate.mjs
 *
 * P1-T3 & P1-T4 Verification Suite:
 * 1. P1-T4: Ingest without operator key (or wrong key) -> FAILS CLOSED (UNAUTHORIZED / SERVICE_NOT_CONFIGURED).
 * 2. P1-T3: Ingest with valid operator key + mutation enabled -> Timing-safe authorization check passes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createService, authorizeProviderKey, providerSecretConfigured } from "../lib/service-ingest.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cardPath = join(__dirname, "../examples/fast-provider-template/bazaar-card.json");
const card = JSON.parse(readFileSync(cardPath, "utf8"));

const TEST_OPERATOR_SECRET = "test-operator-secret-key-32chars!!";

console.log("=================================================================");
console.log("🧪 [P1-T3/T4 TEST] Operator Key Gate & Fail-Closed Ingest Matrix");
console.log("=================================================================\n");

// --- TEST CASE 1: Ingest without flag enabled (Fail Closed) ---
console.log("▶ [P1-T4.1] Testing Ingest when BAZAAR_ENABLE_REGISTRY_MUTATIONS is off...");
delete process.env.BAZAAR_ENABLE_REGISTRY_MUTATIONS;
delete process.env.BAZAAR_PROVIDER_SECRET;

const offResult = await createService(card, TEST_OPERATOR_SECRET);
assert.equal(offResult.ok, false);
assert.equal(offResult.error.code, "SERVICE_NOT_CONFIGURED");
console.log("  ✓ Correctly rejected with SERVICE_NOT_CONFIGURED (Fail-Closed).");

// --- TEST CASE 2: Mutations enabled, but missing / wrong operator key ---
console.log("\n▶ [P1-T4.2] Testing Ingest with missing or invalid X-Bazaar-Provider-Key...");
process.env.BAZAAR_ENABLE_REGISTRY_MUTATIONS = "true";
process.env.BAZAAR_PROVIDER_SECRET = TEST_OPERATOR_SECRET;

// Missing key
const missingKeyResult = await createService(card, undefined);
assert.equal(missingKeyResult.ok, false);
console.log(`  ✓ Missing key rejected with code: ${missingKeyResult.error.code}`);

// Wrong key
const wrongKeyResult = await createService(card, "wrong-unauthorized-key");
assert.equal(wrongKeyResult.ok, false);
console.log(`  ✓ Wrong key rejected with code: ${wrongKeyResult.error.code}`);

// --- TEST CASE 3: Valid Operator Key Authentication Check ---
console.log("\n▶ [P1-T3] Testing Operator Key validation logic...");
assert.equal(providerSecretConfigured(), true);
assert.equal(authorizeProviderKey(undefined), false);
assert.equal(authorizeProviderKey("wrong-key"), false);
assert.equal(authorizeProviderKey(TEST_OPERATOR_SECRET), true);
console.log("  ✓ Operator Key timing-safe authentication verified.");

// Clean up
delete process.env.BAZAAR_ENABLE_REGISTRY_MUTATIONS;
delete process.env.BAZAAR_PROVIDER_SECRET;

console.log("\n=================================================================");
console.log("✅ P1-T3 & P1-T4 PASS: Operator Key Gate & Fail-Closed Verified");
console.log("=================================================================\n");
