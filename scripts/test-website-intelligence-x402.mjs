import assert from "node:assert/strict";
import { WEBSITE_INTELLIGENCE_X402, assertAcceptedRequirements, assertExecutionGate, buildWebsiteIntelligenceRequirements, deliverWebsiteIntelligenceAfterSettlement, inputBinding, reconcileWebsiteIntelligenceReceipt, validateWebsiteIntelligenceInput } from "../lib/website-intelligence-x402.ts";

const seller = `G${"A".repeat(55)}`;
const payer = `G${"B".repeat(55)}`;
assert.notEqual(payer, seller, "payer and seller development identities must be separate");
const input = validateWebsiteIntelligenceInput({ url: "https://example.org", language: "es" });
const requirements = buildWebsiteIntelligenceRequirements("http://127.0.0.1:3000", seller, input);
assert.equal(requirements.network, "stellar:testnet");
assert.equal(requirements.scheme, "exact");
assert.equal(requirements.amount, "10000");
assert.equal(requirements.asset, WEBSITE_INTELLIGENCE_X402.asset);
assert.equal(inputBinding(input), inputBinding({ language: "es", url: "https://example.org" }));
assert.throws(() => validateWebsiteIntelligenceInput({ url: "http://example.org", language: "es" }), /INVALID_HTTPS_URL/);

const settlement = { success: true, transaction: "abc123", network: "stellar:testnet", amount: "10000", payer };
const evidence = { transaction: "abc123", network: "stellar:testnet", asset: requirements.asset, amount: "10000", payTo: seller, ledger: 42, timestamp: "2026-08-22T12:00:00Z" };
assert.equal(reconcileWebsiteIntelligenceReceipt(settlement, evidence, requirements).reconciled, true);
for (const [field, value, code] of [
  ["network", "stellar:pubnet", "RECEIPT_NETWORK_MISMATCH"], ["asset", "WRONG", "RECEIPT_ASSET_MISMATCH"], ["amount", "9999", "RECEIPT_AMOUNT_MISMATCH"], ["payTo", payer, "RECEIPT_RECIPIENT_MISMATCH"], ["transaction", "wrong", "RECEIPT_TRANSACTION_MISMATCH"],
]) assert.throws(() => reconcileWebsiteIntelligenceReceipt(settlement, { ...evidence, [field]: value }, requirements), new RegExp(code));

assertAcceptedRequirements(requirements, requirements);
for (const [field, value] of [["network", "stellar:pubnet"], ["asset", "WRONG"], ["amount", "9999"], ["payTo", payer]]) assert.throws(() => assertAcceptedRequirements({ ...requirements, [field]: value }, requirements), /MISMATCH/);
assert.throws(() => assertAcceptedRequirements({ ...requirements, extra: { ...requirements.extra, inputHash: "tampered" } }, requirements), /BINDING_MISMATCH/);
assert.throws(() => assertExecutionGate({}), /EXECUTION_REVIEW_REQUIRED/);
assert.equal(assertExecutionGate({ WI_X402_EXECUTION_REVIEWED: "true", WI_X402_SELLER_ADDRESS: seller }), seller);
let providerCalls = 0;
const delivered = await deliverWebsiteIntelligenceAfterSettlement({ settled: settlement, expected: requirements, readLedgerEvidence: async () => evidence, callProvider: async () => { providerCalls++; return { score: 88 }; } });
assert.equal(delivered.result.score, 88);
assert.equal(providerCalls, 1);
await assert.rejects(() => deliverWebsiteIntelligenceAfterSettlement({ settled: settlement, expected: requirements, readLedgerEvidence: async () => ({ ...evidence, amount: "9999" }), callProvider: async () => { providerCalls++; return {}; } }), /RECEIPT_AMOUNT_MISMATCH/);
assert.equal(providerCalls, 1, "provider result must not be delivered before strict reconciliation");
console.log(JSON.stringify({ ok: true, cases: 20, paymentsAttempted: 0, providerCallsAfterBadReceipt: 0, executionGate: "closed-by-default" }));
