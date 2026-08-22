import assert from "node:assert/strict";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const id = `security-probe-${Date.now()}`;
const card = {
  version: "bazaar.service-card/v0",
  id,
  name: "Security Probe",
  description: "Valid card used to verify that registry mutations fail closed by default.",
  kind: "http",
  url: "https://provider.example.com",
  routeTemplate: "/v1/quote/{pair}",
  input: [{ name: "pair", type: "string", required: true }],
  network: "stellar:testnet",
  payment: {
    scheme: "exact",
    asset: "USDC",
    amount: "0.001",
    destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },
  provider: { name: "Untrusted fixture" },
  tags: ["fixture"],
};

async function request(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

const post = await request("POST", "/api/publisher/ingest", card);
assert.equal(post.status, 503);
assert.equal(post.body.error.code, "SERVICE_NOT_CONFIGURED");

const list = await request("GET", "/api/publisher/ingest");
assert.equal(list.status, 405);
assert.equal(list.body.error.code, "PROVIDER_OWNERSHIP_NOT_IMPLEMENTED");

for (const method of ["PUT", "DELETE"]) {
  const result = await request(method, `/api/publisher/ingest/${id}`, method === "PUT" ? card : undefined);
  assert.equal(result.status, 405);
  assert.equal(result.body.error.code, "PROVIDER_OWNERSHIP_NOT_IMPLEMENTED");
}

const conformance = await request("POST", "/api/conformance/service-card", card);
assert.equal(conformance.status, 200);
assert.equal(conformance.body.valid, true);

const resources = await fetch(`${base}/api/discovery/resources`);
assert.equal(resources.status, 200);
const resourceBody = await resources.json();
assert.ok(Array.isArray(resourceBody.results));
assert.ok(!resourceBody.results.some((entry) => entry.id === id), "disabled mutation must not index the probe");

console.log(JSON.stringify({
  ok: true,
  registry: "append-only-disabled-by-default",
  post: "SERVICE_NOT_CONFIGURED",
  ownershipOperations: "disabled",
  conformanceStillAvailable: true,
  unintendedIndexing: false,
}, null, 2));
