import assert from "node:assert/strict";
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { paymentRequirementMismatches } from "../lib/x402-requirements.ts";
import { canonicalInputHash, canonicalJSONStringify, canonicalServiceCardHash, reconcileWebsiteIntelligenceSettlement, validateWebsiteIntelligenceReadiness, WEBSITE_INTELLIGENCE_BINDING_EXTENSION, WEBSITE_INTELLIGENCE_INPUT_HASH_ALGORITHM, WEBSITE_INTELLIGENCE_ROUTE } from "../lib/website-intelligence-readiness.ts";
import { executeWebsiteIntelligenceOneShot, prepareWebsiteIntelligenceOneShot, requestWebsiteIntelligencePaymentChallenge, requireWebsiteIntelligenceLocalEndpoint } from "../lib/website-intelligence-one-shot.ts";
import { X402_MAX_TIMEOUT_SECONDS, X402_NETWORK, X402_QUOTE_AMOUNT, X402_SCHEME, X402_USDC_CONTRACT } from "../lib/x402-config.ts";

const payTo = "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ";
const payer = payTo;
const input = { url: "https://example.com", language: "es" };
const inputHash = canonicalInputHash(input);
assert.notEqual(inputHash, canonicalInputHash({ ...input, language: "en" }), "input hash is request-specific");
assert.equal(canonicalInputHash({ z: { b: 2, a: 1 }, a: 0 }), canonicalInputHash({ a: 0, z: { a: 1, b: 2 } }), "deep canonical hash");
const now = new Date("2026-08-28T12:00:00Z");
const makeCard = () => ({
  schemaVersion: "1.0", version: "1.0.0", id: "website-intelligence",
  interfaces: { http: { method: "POST", path: WEBSITE_INTELLIGENCE_ROUTE } },
  delivery: { model: "sync" },
  payment: { enabled: true, network: X402_NETWORK, scheme: X402_SCHEME, asset: X402_USDC_CONTRACT, atomicAmount: "10000", assetDecimals: 7, payTo, maxTimeoutSeconds: X402_MAX_TIMEOUT_SECONDS, challengeTtlSeconds: 60, binding: { method: "POST", route: WEBSITE_INTELLIGENCE_ROUTE, resourceUrl: `https://provider.example${WEBSITE_INTELLIGENCE_ROUTE}`, inputHashAlgorithm: WEBSITE_INTELLIGENCE_INPUT_HASH_ALGORITHM, cardHash: "" } },
});
const seal = card => { card.payment.binding.cardHash = canonicalServiceCardHash(card); return card; };
const validCard = makeCard();
validCard.payment.binding.cardHash = canonicalServiceCardHash(validCard);
const approvedCardHash = canonicalServiceCardHash(validCard);
const serviceCardUrl = "https://provider.example/v1/service-card";
const readinessContext = { expectedPayTo: payTo, approvedCardHash, sourceUrl: serviceCardUrl, now };
assert.equal(validateWebsiteIntelligenceReadiness(validCard, readinessContext).ready, true);

const mutations = [
  ["network", card => card.payment.network = "stellar:pubnet"], ["asset", card => card.payment.asset = "wrong"],
  ["payTo", card => card.payment.payTo = "GWRONG"], ["amount", card => card.payment.atomicAmount = "9999"],
  ["decimals", card => card.payment.assetDecimals = 6],
  ["method", card => card.payment.binding.method = "GET"], ["route", card => card.payment.binding.route = "/wrong"],
  ["input algorithm", card => card.payment.binding.inputHashAlgorithm = "wrong"],
  ["expiry", card => card.payment.challengeTtlSeconds = 0], ["timeout", card => card.payment.maxTimeoutSeconds = 61],
  ["wrong interface", card => card.interfaces.http.path = "https://attacker.invalid/v1/x402/audits"],
];
for (const [name, mutate] of mutations) { const card = structuredClone(validCard); mutate(card); seal(card); const report = validateWebsiteIntelligenceReadiness(card, { ...readinessContext, approvedCardHash: canonicalServiceCardHash(card) }); assert.equal(report.ready, false, name); assert.ok(report.outcomes.some(outcome => !outcome.ok && outcome.rule !== "expected.cardHash"), `${name} has specific outcome`); }
assert.equal(validateWebsiteIntelligenceReadiness(validCard, { ...readinessContext, sourceUrl: "https://attacker.invalid/card" }).ready, false, "source allowlist");
assert.equal(validateWebsiteIntelligenceReadiness(validCard, { ...readinessContext, approvedCardHash: "" }).ready, false, "approval mandatory");

const expectedRequirements = { scheme: X402_SCHEME, network: X402_NETWORK, payTo, asset: X402_USDC_CONTRACT, amount: X402_QUOTE_AMOUNT, maxTimeoutSeconds: 60, resourceUrl: "https://bazaar.test/api/x402/swap-risk?pair=XLM%2FUSDC&amount=1&side=buy", method: "GET", route: "/api/x402/swap-risk", inputHash };
const accepted = { scheme: X402_SCHEME, network: X402_NETWORK, payTo, asset: X402_USDC_CONTRACT, amount: X402_QUOTE_AMOUNT, maxTimeoutSeconds: 60, extra: { resourceUrl: expectedRequirements.resourceUrl, method: "GET", route: expectedRequirements.route, inputHash } };
assert.deepEqual(paymentRequirementMismatches(accepted, expectedRequirements), []);
for (const field of ["scheme", "network", "payTo", "asset", "amount", "maxTimeoutSeconds"]) { const changed = structuredClone(accepted); changed[field] = field === "maxTimeoutSeconds" ? 61 : "wrong"; assert.ok(paymentRequirementMismatches(changed, expectedRequirements).includes(field)); }
for (const field of ["resourceUrl", "method", "route", "inputHash"]) { const changed = structuredClone(accepted); changed.extra[field] = "wrong"; assert.ok(paymentRequirementMismatches(changed, expectedRequirements).includes(`extra.${field}`)); }

class MockBalance { constructor(atomic = "10000") { this.atomic = atomic; } async getBalance() { return { atomic: this.atomic, ledger: 77 }; } }
const oneShotBase = { card: validCard, sourceUrl: serviceCardUrl, expectedPayTo: payTo, payerAddress: payer, requestBody: input, idempotencyKey: "readiness-test-001", approvedCardHash, now };
const preflight = await prepareWebsiteIntelligenceOneShot({ ...oneShotBase, executeRequested: false, explicitOneShotAcknowledgement: false }, new MockBalance());
assert.equal(preflight.mode, "discovery-preflight-only"); assert.equal(preflight.armed, false); assert.equal(preflight.stopBeforeSignature, true);
const armed = await prepareWebsiteIntelligenceOneShot({ ...oneShotBase, executeRequested: true, explicitOneShotAcknowledgement: true }, new MockBalance());
assert.equal(armed.armed, false); assert.equal(armed.signerEnabled, false); assert.equal(armed.settlementEnabled, false); assert.deepEqual(armed.caps, { maximumAtomic: "10000", assetDecimals: 7, friendly: "0.001 USDC", attempts: 0, network: "stellar:testnet" });
const malformedBalance = await prepareWebsiteIntelligenceOneShot({ ...oneShotBase, executeRequested: true, explicitOneShotAcknowledgement: true }, new MockBalance("not-a-number")); assert.equal(malformedBalance.balance.sufficient, false);

let captured;
const localEndpoint = "http://127.0.0.1:8787/v1/x402/audits";
const approvedRequirement = { scheme: X402_SCHEME, network: X402_NETWORK, payTo, asset: X402_USDC_CONTRACT, amount: X402_QUOTE_AMOUNT, maxTimeoutSeconds: 60, extra: { areFeesSponsored: true } };
const approvedBinding = { algorithm: WEBSITE_INTELLIGENCE_INPUT_HASH_ALGORITHM, method: "POST", route: WEBSITE_INTELLIGENCE_ROUTE, inputHash, cardHash: approvedCardHash };
const approvedPaymentRequired = { x402Version: 2, resource: { url: `https://provider.example${WEBSITE_INTELLIGENCE_ROUTE}` }, accepts: [approvedRequirement], extensions: { [WEBSITE_INTELLIGENCE_BINDING_EXTENSION]: { info: approvedBinding, schema: {} } } };
const challenge = await requestWebsiteIntelligencePaymentChallenge({ requestBody: input, idempotencyKey: "request-fixture-001", expectedPayTo: payTo, approvedCardHash, publicResourceUrl: `https://provider.example${WEBSITE_INTELLIGENCE_ROUTE}`, fetchImpl: async (url, init) => { captured = { url, init }; return new Response("{}", { status: 402, headers: { "payment-required": encodePaymentRequiredHeader(approvedPaymentRequired), "cache-control": "private, no-store" } }); } });
assert.equal(challenge.status, 402); assert.equal(challenge.inputHash, inputHash); assert.equal(captured.url, localEndpoint); assert.equal(captured.init.method, "POST"); assert.equal(captured.init.headers["idempotency-key"], "request-fixture-001"); assert.equal(captured.init.headers["x-bazaar-input-hash"], inputHash); assert.equal(captured.init.body, canonicalJSONStringify(input));
assert.equal(requireWebsiteIntelligenceLocalEndpoint("http://localhost:4444"), "http://localhost:4444/v1/x402/audits"); assert.throws(() => requireWebsiteIntelligenceLocalEndpoint("https://example.com"), /NOT_ALLOWLISTED/);
for (const field of ["algorithm", "method", "route", "inputHash", "cardHash"]) {
  const changed = structuredClone(approvedPaymentRequired);
  changed.extensions[WEBSITE_INTELLIGENCE_BINDING_EXTENSION].info[field] = "wrong";
  await assert.rejects(() => requestWebsiteIntelligencePaymentChallenge({ requestBody: input, idempotencyKey: `binding-${field}-fixture`, expectedPayTo: payTo, approvedCardHash, publicResourceUrl: `https://provider.example${WEBSITE_INTELLIGENCE_ROUTE}`, fetchImpl: async () => new Response("{}", { status: 402, headers: { "payment-required": encodePaymentRequiredHeader(changed), "cache-control": "no-store" } }) }), /BINDING_EXTENSION_MISMATCH/, field);
}
await assert.rejects(() => requestWebsiteIntelligencePaymentChallenge({ requestBody: input, idempotencyKey: "short", fetchImpl: async () => new Response() }), /INVALID_IDEMPOTENCY_KEY/);
await assert.rejects(() => requestWebsiteIntelligencePaymentChallenge({ requestBody: input, idempotencyKey: "request-fixture-002", fetchImpl: async () => new Response("{}", { status: 402, headers: { "payment-required": "x" } }) }), /NO_STORE/);
await assert.rejects(() => requestWebsiteIntelligencePaymentChallenge({ requestBody: input, idempotencyKey: "request-fixture-003", fetchImpl: async () => new Response("{}", { status: 200 }) }), /EXPECTED_PAYMENT_REQUIRED/);
await assert.rejects(() => requestWebsiteIntelligencePaymentChallenge({ requestBody: [], idempotencyKey: "request-fixture-004", fetchImpl: async () => new Response() }), /INVALID_JSON_REQUEST_BODY/);
await assert.rejects(() => requestWebsiteIntelligencePaymentChallenge({ requestBody: input, idempotencyKey: "request-fixture-005", fetchImpl: async () => new Response("{}", { status: 402, headers: { "payment-required": "x", "cache-control": "no-store" } }) }), /MALFORMED_PAYMENT_REQUIRED_HEADER/);

const result = { score: 91, findings: ["fixture"] };
const resultHash = canonicalInputHash(result);
const expectedReceipt = { scheme: X402_SCHEME, network: X402_NETWORK, asset: X402_USDC_CONTRACT, payTo, amount: X402_QUOTE_AMOUNT, method: "POST", route: WEBSITE_INTELLIGENCE_ROUTE, inputHash, cardHash: canonicalServiceCardHash(validCard) };
const receipt = { ...expectedReceipt, status: "settled", transactionHash: "a".repeat(64), ledger: 123 };
assert.equal(reconcileWebsiteIntelligenceSettlement(receipt, expectedReceipt, result, resultHash, now).reconciled, true);
for (const field of ["scheme", "network", "asset", "payTo", "amount", "method", "route", "inputHash", "cardHash"]) { const malformed = { ...receipt, [field]: "wrong" }; assert.equal(reconcileWebsiteIntelligenceSettlement(malformed, expectedReceipt, result, resultHash, now).reconciled, false, `receipt ${field}`); }
assert.equal(reconcileWebsiteIntelligenceSettlement(receipt, expectedReceipt, { score: 0 }, resultHash).reconciled, false, "result mismatch");
assert.equal(reconcileWebsiteIntelligenceSettlement({ ...receipt, ledger: 0 }, expectedReceipt, result, resultHash, now).reconciled, false, "malformed receipt");
assert.equal(reconcileWebsiteIntelligenceSettlement({ ...receipt, transactionHash: "ci-mock-transaction" }, expectedReceipt, result, resultHash, now).reconciled, false, "fixture tx rejected");
assert.equal(reconcileWebsiteIntelligenceSettlement({ ...receipt, status: "verified" }, expectedReceipt, result, resultHash, now).reconciled, false, "status mismatch");

class MockFacilitator { constructor() { this.used = new Set(); } verify(auth) { if (auth.expiresAt <= Date.now()) throw new Error("EXPIRED"); if (this.used.has(auth.nonce)) throw new Error("REPLAY"); return true; } settle(auth) { this.verify(auth); this.used.add(auth.nonce); return receipt; } }
class MockProvider { constructor({ available = true, timeout = false } = {}) { this.available = available; this.timeout = timeout; } unpaid() { if (!this.available) throw new Error("PROVIDER_UNAVAILABLE"); if (this.timeout) throw new Error("PROVIDER_TIMEOUT"); return { status: 402, paymentRequired: accepted }; } deliver() { return { status: 200, result, receipt }; } }
const provider = new MockProvider(); assert.equal(provider.unpaid().status, 402); const facilitator = new MockFacilitator(); const auth = { nonce: "one", expiresAt: Date.now() + 30_000 }; facilitator.settle(auth); assert.throws(() => facilitator.verify(auth), /REPLAY/); assert.throws(() => new MockFacilitator().verify({ nonce: "expired", expiresAt: 0 }), /EXPIRED/); assert.throws(() => new MockProvider({ available: false }).unpaid(), /PROVIDER_UNAVAILABLE/); assert.throws(() => new MockProvider({ timeout: true }).unpaid(), /PROVIDER_TIMEOUT/); assert.equal(provider.deliver().status, 200);

const executableReceipt = { ...expectedReceipt, status: "settled", transactionHash: "b".repeat(64), ledger: 456 };
const paidHeaders = { "content-type": "application/json", "payment-response": encodePaymentResponseHeader({ success: true, transaction: executableReceipt.transactionHash, network: X402_NETWORK }) };
const executed = await executeWebsiteIntelligenceOneShot({ endpoint: localEndpoint, requestBody: input, idempotencyKey: "execute-fixture-001", expected: expectedReceipt, acknowledgementOne: true, acknowledgementTwo: true, balanceAtomic: "10000", createPaidFetch: before => async () => { before(); return new Response(JSON.stringify({ result, resultHash, receipt: executableReceipt }), { status: 200, headers: paidHeaders }); } });
assert.equal(executed.attempts, 1); assert.equal(executed.reconciled, true);
await assert.rejects(() => executeWebsiteIntelligenceOneShot({ endpoint: localEndpoint, requestBody: input, idempotencyKey: "execute-fixture-002", expected: expectedReceipt, acknowledgementOne: true, acknowledgementTwo: false, balanceAtomic: "10000", createPaidFetch: () => async () => new Response() }), /TWO_EXPLICIT/);
await assert.rejects(() => executeWebsiteIntelligenceOneShot({ endpoint: localEndpoint, requestBody: input, idempotencyKey: "execute-fixture-003", expected: expectedReceipt, acknowledgementOne: true, acknowledgementTwo: true, balanceAtomic: "9999", createPaidFetch: () => async () => new Response() }), /INSUFFICIENT/);
await assert.rejects(() => executeWebsiteIntelligenceOneShot({ endpoint: localEndpoint, requestBody: input, idempotencyKey: "execute-fixture-004", expected: expectedReceipt, acknowledgementOne: true, acknowledgementTwo: true, balanceAtomic: "10000", createPaidFetch: before => async () => { before(); before(); return new Response(); } }), /ONE_PAYMENT_ATTEMPT/);

console.log(JSON.stringify({ ok: true, profile: "ci-mocks-no-secrets", noPayment402: true, happyMockedResult: true, negativeCases: [...mutations.map(([name]) => name), "replay", "provider unavailable", "provider timeout", "malformed receipt", "result mismatch"], realPayment: false }, null, 2));
