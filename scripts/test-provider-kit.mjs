import assert from "node:assert/strict";
import { generateCanonicalServiceCard, computeServiceCardHash, createDeliverableBundle } from "../lib/provider-kit/index.ts";
import { validateServiceCard } from "../lib/discovery.ts";
import { BazaarAgentClient } from "../lib/bazaar-agent-client.ts";

console.log("Starting Bazaar Provider Kit SDK verification...");

// 1. Generate Canonical Service Card
const sampleProviderConfig = {
  id: "sample-ai-auditor",
  name: "Soroban Contract Security Auditor",
  description: "Automated vulnerability scanner for Soroban smart contracts on Stellar Testnet.",
  category: "security",
  tags: ["security", "soroban", "contracts", "audit"],
  pricing: {
    amountUsdc: "0.05",
    scheme: "split-exact",
    destinationAddress: "GC3CK5A4KCNE44LGMU6PYPEAAZVQOFATJCEMBAASGCXK5EKECTB2VDL4",
    feeBps: 100,
  },
  endpointUrl: "https://auditor.example.com/api/x402/audit",
  routeTemplate: "/api/x402/audit",
  input: [
    {
      name: "contractAddress",
      type: "string",
      required: true,
    },
  ],
  provider: {
    name: "Stellar Guard Labs",
    website: "https://stellarguard.example.com",
  },
};

const card = generateCanonicalServiceCard(sampleProviderConfig);
assert.equal(card.id, "sample-ai-auditor");
assert.equal(card.payment.amount, "0.05");
assert.equal(card.payment.asset, "USDC");
assert.equal(card.network, "stellar:testnet");

// 2. Validate with Bazaar Conformance Rules
const validationOutcomes = validateServiceCard(card);
const failures = validationOutcomes.filter((o) => o.status === "fail");
assert.equal(failures.length, 0, `Generated ServiceCard must pass conformance: ${failures.map((f) => f.reason).join("; ")}`);

// 3. Compute deterministic hash
const hash = computeServiceCardHash(card);
assert(/^[a-f0-9]{64}$/.test(hash), "Card hash must be valid 64-char hex SHA-256");

// 4. Test Deliverable Bundle Creation
const mockAuditResult = {
  contract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  vulnerabilitiesFound: 0,
  securityScore: 98,
  status: "SECURE",
};

const mockFiles = [
  {
    id: "report-html",
    path: "audit-report.html",
    contentType: "text/html",
    content: "<html><body><h1>Audit Report: PASS</h1></body></html>",
    role: "primary-view",
  },
  {
    id: "metrics-json",
    path: "metrics.json",
    contentType: "application/json",
    content: JSON.stringify({ score: 98, staticChecks: 42 }),
    role: "data",
  },
];

const envelope = createDeliverableBundle(card.id, mockAuditResult, mockFiles);
assert.equal(envelope.result.securityScore, 98);
assert(/^[a-f0-9]{64}$/.test(envelope.resultHash));
assert(envelope.bazaarDelivery, "bazaarDelivery bundle must be present");
assert.equal(envelope.bazaarDelivery.files.length, 2);
assert.equal(envelope.bazaarDelivery.files[0].path, "audit-report.html");
assert.equal(envelope.bazaarDelivery.files[0].role, "primary-view");

// 5. Test Split Calculation with Buyer Client
const client = new BazaarAgentClient({
  baseUrl: "http://localhost:3000",
  maxPriceAllowedUsdc: 1.0,
});

const split = client.calculateSplitBreakdown(card);
assert(Number(split.providerAmount) > 0, "Provider net must be > 0");
assert(Number(split.treasuryAmount) > 0, "Treasury fee must be > 0");
assert.equal(split.feeBps, 100);

console.log("All Bazaar Provider Kit SDK tests passed successfully! (100% Validated)");
