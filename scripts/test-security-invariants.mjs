import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { BazaarAgentClient } from "../lib/bazaar-agent-client.ts";
import { computeCardHash, createDynamicServiceCard } from "../lib/dynamic-registry.ts";
import { authorizeProviderKey, registryMutationConfigured } from "../lib/service-ingest.ts";
import { isRetiredTestnetPayerAddress } from "../lib/testnet-payer-safety.ts";

const destination = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const card = {
  version: "bazaar.service-card/v0",
  id: `security-invariant-${Date.now()}`,
  name: "Security Invariant",
  description: "Deterministic card used only for local security invariants.",
  kind: "http",
  url: "https://provider.example.com",
  routeTemplate: "/v1/quote/{pair}",
  input: [{ name: "pair", type: "string", required: true }],
  network: "stellar:testnet",
  payment: { scheme: "exact", asset: "USDC", amount: "0.001", destination },
  provider: { name: "Fixture" },
  tags: ["fixture", "security"],
};

const reordered = {
  tags: [...card.tags],
  provider: { name: card.provider.name },
  payment: {
    destination: card.payment.destination,
    amount: card.payment.amount,
    asset: card.payment.asset,
    scheme: card.payment.scheme,
  },
  network: card.network,
  input: card.input.map((input) => ({ required: input.required, type: input.type, name: input.name })),
  routeTemplate: card.routeTemplate,
  url: card.url,
  kind: card.kind,
  description: card.description,
  name: card.name,
  id: card.id,
  version: card.version,
};
const changedNested = { ...card, payment: { ...card.payment, amount: "0.002" } };
assert.equal(computeCardHash(card), computeCardHash(reordered));
assert.notEqual(computeCardHash(card), computeCardHash(changedNested));

const created = await createDynamicServiceCard(card, "fixture-hash");
assert.ok("entry" in created);
const duplicate = await createDynamicServiceCard(card, "fixture-hash");
assert.deepEqual(duplicate, { exists: true });

delete process.env.BAZAAR_ENABLE_REGISTRY_MUTATIONS;
delete process.env.BAZAAR_PROVIDER_SECRET;
assert.equal(registryMutationConfigured(), false);
assert.equal(authorizeProviderKey(undefined), false);

assert.equal(
  isRetiredTestnetPayerAddress("GC3CK5A4KCNE44LGMU6PYPEAAZVQOFATJCEMBAASGCXK5EKECTB2VDL4"),
  true,
);

const client = new BazaarAgentClient({
  baseUrl: "http://127.0.0.1:9",
  payerSecretKey: Keypair.random().secret(),
  allowedNetworks: ["stellar:testnet"],
  allowedAssets: ["USDC"],
  maxPriceAllowedUsdc: 0.01,
});
await assert.rejects(
  () => client.executeService(card, { pair: "XLM/USDC" }),
  /RECEIPT_RECONCILIATION_REQUIRED/,
);
assert.equal(
  client.validatePaymentPolicy({ ...card, payment: { ...card.payment, asset: "EURC" } }).allowed,
  false,
);

console.log(JSON.stringify({
  ok: true,
  canonicalDeepHash: true,
  duplicateCreateRejected: true,
  registryFailClosed: true,
  retiredPayerBlocked: true,
  paidDynamicExecutionRequiresReceiptReconciliation: true,
  assetAllowlist: true,
}, null, 2));
