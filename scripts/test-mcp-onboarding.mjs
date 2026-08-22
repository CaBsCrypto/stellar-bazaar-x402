import assert from "node:assert/strict";

const base = process.env.MCP_BASE_URL ?? "http://127.0.0.1:3000";
const url = `${base}/api/mcp`;
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};
const readTools = [
  "get_bazaar_capabilities",
  "list_services",
  "search_services",
  "get_service",
  "list_workflow_bundles",
  "get_workflow_bundle",
  "validate_service_card",
];

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
assert.deepEqual(health.writes, []);
assert.deepEqual(health.tools, readTools);

const initialized = await rpc(1, "initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "qa", version: "1" },
});
assert.equal(initialized.result.serverInfo.name, "stellar-bazaar-discovery");

const listed = await rpc(2, "tools/list", {});
assert.deepEqual(listed.result.tools.map((tool) => tool.name), readTools);
assert.ok(
  listed.result.tools.every((tool) => !/(register|update|delete|pay|sign|execute)/i.test(tool.name)),
  "read-only MCP must not advertise mutation/payment tools",
);

const capabilities = await rpc(3, "tools/call", {
  name: "get_bazaar_capabilities",
  arguments: {},
});
const capabilityText = JSON.parse(capabilities.result.content[0].text);
assert.deepEqual(capabilityText.writes, []);
assert.equal(capabilityText.registry.mutationViaMcp, false);
assert.equal(capabilityText.registry.providerMetadataTrusted, false);

const firstPage = await rpc(4, "tools/call", {
  name: "search_services",
  arguments: { query: "riesgo", limit: 1 },
});
const firstText = JSON.parse(firstPage.result.content[0].text);
assert.equal(firstText.partialResults, true);
assert.ok(firstText.nextCursor);

const secondPage = await rpc(5, "tools/call", {
  name: "search_services",
  arguments: { query: "riesgo", limit: 1, cursor: firstText.nextCursor },
});
const secondText = JSON.parse(secondPage.result.content[0].text);
assert.ok(secondText.results.length >= 1);
assert.ok(!secondText.results.some((result) => result.resource.id === firstText.results[0].resource.id));

const hostile = await rpc(6, "tools/call", {
  name: "validate_service_card",
  arguments: {
    card: {
      version: "bazaar.service-card/v0",
      id: "hostile",
      name: "Hostile",
      description: "Untrusted metadata validation probe.",
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
      provider: { name: "Untrusted fixture" },
      tags: ["fixture"],
    },
  },
});
const hostileText = JSON.parse(hostile.result.content[0].text);
assert.equal(hostileText.valid, false);
assert.ok(hostileText.outcomes.some((outcome) => outcome.rule === "route.template" && outcome.status === "fail"));

const unknownWrite = await rpc(7, "tools/call", {
  name: "register_service",
  arguments: { card: {} },
});
assert.equal(unknownWrite.result.isError, true);

console.log(JSON.stringify({
  ok: true,
  mode: "read-only",
  tools: readTools.length,
  writes: 0,
  mutationToolRejected: true,
  pagination: true,
  hostileMetadataRejected: true,
}, null, 2));
