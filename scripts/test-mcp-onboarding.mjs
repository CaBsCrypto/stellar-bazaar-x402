import assert from "node:assert/strict";

const base = process.env.MCP_BASE_URL ?? "http://127.0.0.1:3000";
const url = `${base}/api/mcp`;
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

async function rpc(id, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

const health = await (await fetch(url)).json();
assert.equal(health.mode, "read-only");
assert.equal(health.paidCall, false);

const initialized = await rpc(1, "initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "qa", version: "1" },
});
assert.equal(initialized.result.serverInfo.name, "stellar-bazaar-discovery");

const listed = await rpc(2, "tools/list", {});
assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
  "get_bazaar_capabilities",
  "list_services",
  "search_services",
  "get_service",
  "list_workflow_bundles",
  "get_workflow_bundle",
  "validate_service_card",
]);

const pilots = await rpc(3, "tools/call", {
  name: "list_services",
  arguments: { includePilots: true },
});
assert.match(pilots.result.content[0].text, /video-repurpose-pilot/);
assert.match(pilots.result.content[0].text, /pilot-not-indexed/);
assert.equal(JSON.parse(pilots.result.content[0].text).partialResults, false);

const missing = await rpc(4, "tools/call", {
  name: "get_service",
  arguments: { id: "missing" },
});
assert.equal(missing.result.isError, true);
const missingEnvelope = JSON.parse(missing.result.content[0].text);
assert.equal(missingEnvelope.code, "RESOURCE_NOT_FOUND");
assert.equal(typeof missingEnvelope.message, "string");
assert.equal(typeof missingEnvelope.retryable, "boolean");
assert.equal(missingEnvelope.stage, "discover");

const firstPage = await rpc(5, "tools/call", {
  name: "search_services",
  arguments: { query: "riesgo", limit: 1 },
});
const firstText = JSON.parse(firstPage.result.content[0].text);
assert.equal(firstText.partialResults, true);
assert.ok(firstText.nextCursor, "cursor pagination should signal more results");
assert.equal(firstText.results.length, 1);

const secondPage = await rpc(6, "tools/call", {
  name: "search_services",
  arguments: { query: "riesgo", limit: 1, cursor: firstText.nextCursor },
});
const secondText = JSON.parse(secondPage.result.content[0].text);
assert.ok(secondText.results.length >= 1, "second page should return results");
const firstIds = new Set(firstText.results.map((r) => r.resource.id));
assert.ok(
  !secondText.results.some((r) => firstIds.has(r.resource.id)),
  "pagination pages must not overlap",
);

const badCursor = await rpc(7, "tools/call", {
  name: "search_services",
  arguments: { query: "swap", cursor: "not-a-valid-cursor" },
});
assert.equal(badCursor.result.isError, true);
const badCursorEnvelope = JSON.parse(badCursor.result.content[0].text);
assert.equal(badCursorEnvelope.code, "INVALID_CURSOR");
assert.equal(badCursorEnvelope.stage, "search");
assert.equal(badCursorEnvelope.retryable, true);

const hostile = await rpc(8, "tools/call", {
  name: "validate_service_card",
  arguments: {
    card: {
      version: "bazaar.service-card/v0",
      id: "hostile",
      name: "Hostile",
      description: "Card with dangerous metadata for conformance testing",
      kind: "http",
      url: "http://internal.example/private",
      routeTemplate: "../../etc/passwd",
      input: [{ name: "x", type: "string", required: true }],
      network: "stellar:pubnet",
      payment: {
        scheme: "exact",
        asset: "USDC",
        amount: "-1",
        destination: "SCREAMING_SECRET_KEY",
      },
    },
  },
});
const hostileText = JSON.parse(hostile.result.content[0].text);
assert.equal(hostileText.valid, false);
const hostileRules = new Set(hostileText.outcomes.map((o) => o.rule));
assert.ok(hostileRules.has("route.template"), "traversal route must fail");
assert.ok(hostileRules.has("resource.url"), "http internal url must fail");
assert.ok(hostileRules.has("payment.network"), "pubnet must fail");
assert.ok(hostileRules.has("payment.amount"), "negative amount must fail");
assert.ok(hostileRules.has("payment.destination"), "secret-prefixed destination must fail");

console.log(
  JSON.stringify(
    {
      ok: true,
      transport: "streamable-http",
      mode: "read-only",
      tools: listed.result.tools.length,
      pilots: 5,
      paidCall: false,
      pagination: { partialResults: true, cursorRoundTrip: true, overlap: false },
      errorEnvelope: { code: true, message: true, retryable: true, stage: true },
      hostileCorpus: { rejected: true, rules: hostileRules.size },
    },
    null,
    2,
  ),
);