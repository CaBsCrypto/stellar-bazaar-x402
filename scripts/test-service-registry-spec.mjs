import assert from "node:assert/strict";
import {
  cardHashBytes,
  canTransition,
  toRegistryAnchor,
} from "../lib/service-registry-spec.ts";
import { computeCanonicalServiceCardHash } from "../lib/canonical-service-card.ts";

const provider = "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ";
const card = {
  version: "bazaar.service-card/v0",
  id: "registry-spec-fixture",
  name: "Registry Spec Fixture",
  description: "A local-only fixture proving canonical ServiceCard hash compatibility.",
  kind: "http",
  url: "https://provider.example.com",
  routeTemplate: "/v1/report/{url}",
  input: [{ name: "url", type: "string", required: true }],
  network: "stellar:testnet",
  payment: { scheme: "exact", asset: "USDC", amount: "0.001", destination: provider },
  provider: { name: "Bazaar Labs" },
  tags: ["fixture", "registry"],
};

const reordered = {
  tags: [...card.tags], provider: { name: card.provider.name },
  payment: { destination: provider, amount: "0.001", asset: "USDC", scheme: "exact" },
  network: card.network, input: [{ required: true, type: "string", name: "url" }],
  routeTemplate: card.routeTemplate, url: card.url, kind: card.kind,
  description: card.description, name: card.name, id: card.id, version: card.version,
};

const anchor = toRegistryAnchor({
  serviceId: card.id,
  provider,
  card,
  revision: 1,
  status: "draft",
  cardUri: "https://provider.example.com/.well-known/bazaar-card.json",
});
assert.equal(anchor.cardHash, computeCanonicalServiceCardHash(reordered));
assert.equal(cardHashBytes(anchor.cardHash).length, 32);
assert.equal(canTransition("curator", "draft", "reviewed"), true);
assert.equal(canTransition("curator", "reviewed", "published"), true);
assert.equal(canTransition("provider", "published", "revoked"), true);
assert.equal(canTransition("provider", "published", "draft"), false);
assert.equal(canTransition("curator", "revoked", "published"), false);
assert.throws(() => cardHashBytes("abc"), /CARD_HASH_INVALID/);
assert.throws(() => toRegistryAnchor({ ...anchor, card, provider, revision: 0 }), /REVISION_INVALID/);

console.log(JSON.stringify({ ok: true, canonicalHashCompatibility: true, sorobanBytes32: true, lifecycleRules: true }, null, 2));
