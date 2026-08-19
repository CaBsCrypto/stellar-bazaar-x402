import assert from "node:assert/strict";

const base = process.env.MCP_BASE_URL ?? "http://127.0.0.1:3000";
const url = `${base}/api/mcp`;
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

const providerKey = process.env.BAZAAR_PROVIDER_SECRET;

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
assert.equal(health.version, "0.4.0");
assert.deepEqual(health.writes, [
  "register_service",
  "update_service",
  "delete_service",
  "list_my_services",
]);

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
  "register_service",
  "update_service",
  "delete_service",
  "list_my_services",
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

const lifecycleId = `mcp-lifecycle-${Date.now()}`;
const lifecycleCard = {
  version: "bazaar.service-card/v0",
  id: lifecycleId,
  name: "MCP Lifecycle Service",
  description: "Provider-registered service via MCP register_service for lifecycle QA.",
  kind: "http",
  url: "https://mcp-lifecycle.provider.example.com",
  routeTemplate: "/v1/lifecycle/{symbol}",
  input: [{ name: "symbol", type: "string", required: true }],
  network: "stellar:testnet",
  payment: {
    scheme: "exact",
    asset: "USDC",
    amount: "0.01",
    destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },
  provider: { name: "MCP QA Provider" },
  tags: ["mcp", "lifecycle"],
};
const registerArgs = providerKey ? { card: lifecycleCard, providerKey } : { card: lifecycleCard };

const registered = await rpc(9, "tools/call", {
  name: "register_service",
  arguments: registerArgs,
});
assert.equal(registered.result.isError, undefined);
const registeredText = JSON.parse(registered.result.content[0].text);
assert.equal(registeredText.status, "indexed-dynamic");
assert.equal(registeredText.id, lifecycleId);
assert.equal(registeredText.revision, 1);
assert.ok(registeredText.hash);
assert.ok(registeredText.registeredAt);

const duplicate = await rpc(10, "tools/call", {
  name: "register_service",
  arguments: registerArgs,
});
assert.equal(duplicate.result.isError, true);
const duplicateEnvelope = JSON.parse(duplicate.result.content[0].text);
assert.equal(duplicateEnvelope.code, "CARD_EXISTS");
assert.equal(duplicateEnvelope.field, "id");

const visibleInSearch = await rpc(11, "tools/call", {
  name: "search_services",
  arguments: { query: "MCP Lifecycle" },
});
const visibleSearchText = JSON.parse(visibleInSearch.result.content[0].text);
assert.ok(
  visibleSearchText.results.some((r) => r.resource.id === lifecycleId),
  "dynamic card must be discoverable via search_services",
);

const visibleInList = await rpc(12, "tools/call", {
  name: "list_services",
  arguments: {},
});
const visibleListText = JSON.parse(visibleInList.result.content[0].text);
assert.ok(
  visibleListText.services.some((s) => s.id === lifecycleId),
  "dynamic card must be listed via list_services",
);

const visibleInGet = await rpc(13, "tools/call", {
  name: "get_service",
  arguments: { id: lifecycleId },
});
assert.equal(visibleInGet.result.isError, undefined);
const visibleGetText = JSON.parse(visibleInGet.result.content[0].text);
assert.equal(visibleGetText.resource.id, lifecycleId);
assert.equal(visibleGetText.registry.provider, true);

const updatedCard = {
  ...lifecycleCard,
  description: "Updated description after lifecycle edit via MCP update_service.",
  payment: { ...lifecycleCard.payment, amount: "0.02" },
};
const updateArgs = providerKey ? { id: lifecycleId, card: updatedCard, providerKey } : { id: lifecycleId, card: updatedCard };

const updated = await rpc(14, "tools/call", {
  name: "update_service",
  arguments: updateArgs,
});
assert.equal(updated.result.isError, undefined);
const updatedText = JSON.parse(updated.result.content[0].text);
assert.equal(updatedText.status, "updated-dynamic");
assert.equal(updatedText.revision, 2);
assert.equal(updatedText.card.payment.amount, "0.02");

const updateMissing = await rpc(15, "tools/call", {
  name: "update_service",
  arguments: { ...updateArgs, id: "does-not-exist" },
});
assert.equal(updateMissing.result.isError, true);
const updateMissingEnvelope = JSON.parse(updateMissing.result.content[0].text);
assert.equal(updateMissingEnvelope.code, "RESOURCE_NOT_FOUND");

const listMine = await rpc(16, "tools/call", {
  name: "list_my_services",
  arguments: providerKey ? { providerKey } : {},
});
assert.equal(listMine.result.isError, undefined);
const listMineText = JSON.parse(listMine.result.content[0].text);
assert.ok(
  listMineText.services.some((s) => s.id === lifecycleId),
  "list_my_services must include the registered card",
);

const deleteArgs = providerKey ? { id: lifecycleId, providerKey } : { id: lifecycleId };

const deleted = await rpc(17, "tools/call", {
  name: "delete_service",
  arguments: deleteArgs,
});
assert.equal(deleted.result.isError, undefined);
const deletedText = JSON.parse(deleted.result.content[0].text);
assert.equal(deletedText.status, "deleted-dynamic");
assert.equal(deletedText.id, lifecycleId);

const deleteMissing = await rpc(18, "tools/call", {
  name: "delete_service",
  arguments: deleteArgs,
});
assert.equal(deleteMissing.result.isError, true);
const deleteMissingEnvelope = JSON.parse(deleteMissing.result.content[0].text);
assert.equal(deleteMissingEnvelope.code, "RESOURCE_NOT_FOUND");

const gone = await rpc(19, "tools/call", {
  name: "get_service",
  arguments: { id: lifecycleId },
});
assert.equal(gone.result.isError, true);
const goneEnvelope = JSON.parse(gone.result.content[0].text);
assert.equal(goneEnvelope.code, "RESOURCE_NOT_FOUND");

console.log(
  JSON.stringify(
    {
      ok: true,
      transport: "streamable-http",
      version: "0.4.0",
      mode: "read-only",
      tools: listed.result.tools.length,
      writes: health.writes,
      pilots: 5,
      paidCall: false,
      pagination: { partialResults: true, cursorRoundTrip: true, overlap: false },
      errorEnvelope: { code: true, message: true, retryable: true, stage: true },
      hostileCorpus: { rejected: true, rules: hostileRules.size },
      lifecycle: {
        register: "indexed-dynamic",
        duplicate: "CARD_EXISTS",
        update: { revision: 2, amount: "0.02" },
        listMy: true,
        delete: "deleted-dynamic",
        deleteMissing: "RESOURCE_NOT_FOUND",
      },
      dynamicVisibility: { search: true, list: true, get: true },
    },
    null,
    2,
  ),
);