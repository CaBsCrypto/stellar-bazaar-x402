import assert from "node:assert/strict";

const base = process.env.MCP_BASE_URL ?? "http://127.0.0.1:3000";
const url = `${base}/api/mcp`;
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };

async function rpc(id, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  assert.equal(response.status, 200, `rpc ${method} must return 200`);
  return response.json();
}

const textOf = (result) => JSON.parse(result.content[0].text);

const initA = await rpc(1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "eval-a", version: "1" } });
const initB = await rpc(2, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "eval-b", version: "1" } });
assert.equal(initA.result.serverInfo.name, initB.result.serverInfo.name);

const toolsA = await rpc(3, "tools/list", {});
const toolsB = await rpc(4, "tools/list", {});
const toolNamesA = toolsA.result.tools.map((tool) => tool.name);
const toolNamesB = toolsB.result.tools.map((tool) => tool.name);
assert.deepEqual(toolNamesA, toolNamesB);
assert.equal(toolNamesA.length, 7);
assert.ok(toolNamesA.every((name) => !/(register|update|delete|pay|sign|execute)/i.test(name)));

const searchA = await rpc(5, "tools/call", { name: "search_services", arguments: { query: "mercado", limit: 50 } });
const searchB = await rpc(6, "tools/call", { name: "search_services", arguments: { query: "mercado", limit: 50 } });
const sa = textOf(searchA.result);
const sb = textOf(searchB.result);
assert.equal(sa.ranking.ai, false);
assert.deepEqual(sa.results.map((result) => [result.resource.id, result.score]), sb.results.map((result) => [result.resource.id, result.score]));

const unknown = await rpc(7, "tools/call", { name: "get_service", arguments: { id: "no-such-id-xyz" } });
assert.equal(unknown.result.isError, true);
const unknownEnv = textOf(unknown.result);
assert.ok(["RESOURCE_NOT_FOUND", "REGISTRY_UNAVAILABLE"].includes(unknownEnv.code));

for (const [index, card] of [null, [1, 2, 3], { version: 123, id: [] }, "string"].entries()) {
  const call = await rpc(8 + index, "tools/call", { name: "validate_service_card", arguments: { card } });
  let handled = call.result.isError === true;
  if (!handled && call.result.content?.[0]?.text) {
    handled = JSON.parse(call.result.content[0].text).valid === false;
  }
  assert.ok(handled, `malformed card #${index} must be rejected`);
}

const adversarialTemplates = [
  "../../etc/passwd", "//evil.example/x", "\\\\evil.example\\x", "/%2e%2e/%2e%2e/x",
  "/a b/x", "/x\r\nLocation: /", "/x\x00y", "/x@y", "/x#frag", "https://evil.example/x",
];
for (const [index, routeTemplate] of adversarialTemplates.entries()) {
  const call = await rpc(20 + index, "tools/call", {
    name: "validate_service_card",
    arguments: {
      card: {
        version: "bazaar.service-card/v0",
        id: "eval-traversal",
        name: "Traversal Probe",
        description: "Adversarial route template for deterministic validation.",
        kind: "http",
        url: "https://probe.provider.example.com",
        routeTemplate,
        input: [{ name: "x", type: "string", required: true }],
        network: "stellar:testnet",
        payment: { scheme: "exact", asset: "USDC", amount: "0.001", destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
        provider: { name: "Untrusted fixture" },
        tags: ["fixture"],
      },
    },
  });
  const payload = textOf(call.result);
  assert.equal(payload.valid, false, `template #${index} must fail`);
  assert.ok(payload.outcomes.some((outcome) => outcome.rule === "route.template" && outcome.status === "fail"));
}

const pilotsHidden = textOf((await rpc(40, "tools/call", { name: "list_services", arguments: {} })).result);
const pilotsShown = textOf((await rpc(41, "tools/call", { name: "list_services", arguments: { includePilots: true } })).result);
assert.equal(pilotsHidden.pilots.length, 0);
assert.equal(pilotsShown.pilots.length, 6);

const capabilities = textOf((await rpc(42, "tools/call", { name: "get_bazaar_capabilities", arguments: {} })).result);
assert.deepEqual(capabilities.writes, []);
assert.equal(capabilities.registry.mutationViaMcp, false);
assert.equal(capabilities.localeDefault, "es");
assert.deepEqual(capabilities.locales, ["es", "en"]);
for (const pilot of pilotsShown.pilots) {
  assert.ok(pilot.title.es && pilot.title.en);
  assert.ok(pilot.description.es && pilot.description.en);
  assert.ok(pilot.category.es && pilot.category.en);
}

const unknownWrite = await rpc(43, "tools/call", { name: "register_service", arguments: { card: {} } });
assert.equal(unknownWrite.result.isError, true);
const allResponses = [initA, initB, toolsA, toolsB, searchA, searchB, unknown, unknownWrite].map(JSON.stringify);
assert.ok(allResponses.every((text) => !/S[A-Z2-7]{55}/.test(text)));

console.log(JSON.stringify({
  ok: true,
  corpus: "MCP_SECURITY_POLICY_EVALS",
  scenarios: {
    readOnlyTools: { count: toolNamesA.length, writes: 0, mutationRejected: true },
    deterministicSearch: true,
    malformedCards: 4,
    routeTemplateTraversal: { probes: adversarialTemplates.length, rejected: adversarialTemplates.length },
    bilingualPilots: 6,
    secretsAbsence: true,
  },
}, null, 2));
