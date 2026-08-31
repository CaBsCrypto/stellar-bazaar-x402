import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const VERIFY_HTTPS = process.env.VERIFY_PROVIDER_HTTPS === "1";
const expectedIds = [
  "website-intelligence-pilot",
  "campaign-creator-pilot",
  "research-scout-pilot",
  "video-repurpose-pilot",
  "design-brief-pilot",
  "brand-identity-studio-pilot",
];

const pilotsResponse = await fetch(`${BASE_URL}/api/discovery/pilots`);
assert.equal(pilotsResponse.status, 200);
const pilots = await pilotsResponse.json();
assert.equal(pilots.ok, true);
assert.equal(pilots.count, 6);
assert.equal(pilots.indexStatus, "pilot-indexed-https-qa");
assert.equal(pilots.paymentActive, true);
assert.deepEqual(pilots.activePaymentIds, ["website-intelligence-pilot"]);
assert.deepEqual(pilots.results.map((card) => card.id), expectedIds);

for (const card of pilots.results) {
  assert.equal(card.version, "bazaar.pilot-card/v1");
  assert.equal(card.execution.endpointVerified, true);
  assert.match(card.links.repository, /^https:\/\/github\.com\/CaBsCrypto\//);
  assert.match(card.links.deployment, /^https:\/\/[a-z0-9-]+\.vercel\.app$/);
  assert.equal(card.payment.status, card.id === "website-intelligence-pilot" ? "active-testnet" : "not-active");
  assert.equal(card.indexing.status, "pilot-indexed");
  assert.equal(card.qa.status, "passed");
  assert.ok(card.title.es && card.title.en);
  assert.ok(card.description.es && card.description.en);
  assert.ok(card.tags.es.length && card.tags.en.length);
}

const homepageResponse = await fetch(BASE_URL);
assert.equal(homepageResponse.status, 200);
const homepage = await homepageResponse.text();
for (const card of pilots.results) {
  assert.match(homepage, new RegExp(card.title.es.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(homepage, new RegExp(card.title.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(homepage, /PAYMENT INACTIVE/);
assert.match(homepage, /PAGO INACTIVO/);
assert.match(homepage, /X402 TESTNET ACTIVE/);

async function rpc(id, method, params) {
  const response = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

const listResponse = await rpc(1, "tools/call", {
  name: "list_services",
  arguments: { includePilots: true },
});
const listed = JSON.parse(listResponse.result.content[0].text);
assert.deepEqual(listed.pilots.map((card) => card.id), expectedIds);

const brandResponse = await rpc(2, "tools/call", {
  name: "get_service",
  arguments: { id: "brand-identity-studio-pilot" },
});
const brand = JSON.parse(brandResponse.result.content[0].text).resource;
assert.equal(brand.execution.status, "discovery-only");
assert.equal(brand.payment.status, "not-active");

const httpsResults = [];
if (VERIFY_HTTPS) {
  for (const card of pilots.results) {
    for (const url of [card.links.deployment, card.links.health]) {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
      assert.equal(response.status, 200, `${url} should return 200`);
      assert.match(response.headers.get("content-type") ?? "", /application\/json/);
      assert.equal(response.headers.has("payment-required"), false);
      assert.equal(response.headers.has("payment-response"), false);
      httpsResults.push({ id: card.id, url, status: response.status });
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  providers: expectedIds.length,
  landing: "bilingual-cards",
  discovery: "pilot-indexed-https-qa",
  mcp: "read-only-discovery",
  payment: "website-intelligence-active-testnet",
  liveHttpsChecks: VERIFY_HTTPS ? httpsResults.length : "skipped-by-default",
}, null, 2));
