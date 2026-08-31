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
const pilotIds = [
  "website-intelligence-pilot",
  "campaign-creator-pilot",
  "research-scout-pilot",
  "video-repurpose-pilot",
  "design-brief-pilot",
  "brand-identity-studio-pilot",
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
assert.equal(capabilityText.paymentFlow.version, "bazaar.payment-flow/v1");
assert.equal(capabilityText.paymentFlow.mode, "read-only-visualization");
assert.ok(Object.values(capabilityText.paymentFlow.sideEffects).every((value) => value === false));

const pilots = await rpc(4, "tools/call", {
  name: "list_services",
  arguments: { includePilots: true },
});
const pilotText = JSON.parse(pilots.result.content[0].text);
assert.deepEqual(pilotText.pilots.map((card) => card.id), pilotIds);
assert.ok(pilotText.pilots.every((card) => card.indexing.status === "pilot-indexed"));
assert.deepEqual(
  pilotText.pilots.filter((card) => card.payment.status === "active-testnet").map((card) => card.id),
  ["website-intelligence-pilot"],
);
assert.ok(pilotText.pilots.filter((card) => card.id !== "website-intelligence-pilot").every((card) => card.payment.status === "not-active"));
assert.equal(pilotText.partialResults, false);

const firstPage = await rpc(5, "tools/call", {
  name: "search_services",
  arguments: { query: "riesgo", limit: 1 },
});
const firstText = JSON.parse(firstPage.result.content[0].text);
assert.equal(firstText.partialResults, true);
assert.ok(firstText.nextCursor);

const secondPage = await rpc(6, "tools/call", {
  name: "search_services",
  arguments: { query: "riesgo", limit: 1, cursor: firstText.nextCursor },
});
const secondText = JSON.parse(secondPage.result.content[0].text);
assert.ok(secondText.results.length >= 1);
assert.ok(!secondText.results.some((result) => result.resource.id === firstText.results[0].resource.id));

for (const query of ["website intelligence", "auditoría", "inteligencia"]) {
  const pilotSearch = await rpc(61, "tools/call", {
    name: "search_services",
    arguments: { query },
  });
  const pilotSearchText = JSON.parse(pilotSearch.result.content[0].text);
  assert.ok(
    pilotSearchText.results.some((result) => result.resource.id === "website-intelligence-pilot"),
    `Website Intelligence pilot must be discoverable for ${query}`,
  );
}

const hostile = await rpc(7, "tools/call", {
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

const unknownWrite = await rpc(8, "tools/call", {
  name: "register_service",
  arguments: { card: {} },
});
assert.equal(unknownWrite.result.isError, true);

const swapFlow = await rpc(9, "tools/call", {
  name: "get_service",
  arguments: { id: "swap-risk-quote" },
});
const swapFlowText = JSON.parse(swapFlow.result.content[0].text);
assert.equal(swapFlowText.paymentFlow.currentRun, "visualization-only");
assert.equal(swapFlowText.paymentFlow.paymentMode, "historical-testnet-evidence");
assert.deepEqual(swapFlowText.paymentFlow.stages.map((stage) => stage.id), [
  "discover", "quote", "challenge-402", "buyer-policy", "settle", "delivery", "receipt",
]);
assert.equal(swapFlowText.paymentFlow.boundaries.custody, false);
assert.equal(swapFlowText.paymentFlow.boundaries.signsForBuyer, false);
assert.equal(swapFlowText.paymentFlow.receipt.network, "stellar:testnet");
assert.equal(swapFlowText.paymentFlow.receipt.assetSymbol, "USDC");
assert.equal(swapFlowText.paymentFlow.receipt.atomicAmount, "10000");
assert.equal(swapFlowText.paymentFlow.receipt.payToDisplay, "GDVR2KDK5…W6RMCQ");
assert.equal(swapFlowText.paymentFlow.receipt.serviceCardVersion, "bazaar.service-card/v0");
assert.equal(swapFlowText.paymentFlow.receipt.serviceCardHash.status, "not-recorded");
assert.equal(swapFlowText.paymentFlow.receipt.requestHash.status, "not-recorded");
assert.equal(swapFlowText.paymentFlow.receipt.resultHash.status, "not-recorded");
assert.equal(swapFlowText.paymentFlow.receipt.settlement.ledger, 4212660);
assert.equal(swapFlowText.paymentFlow.receipt.reconciliationStatus, "partial-evidence");

const pilotFlow = await rpc(10, "tools/call", {
  name: "get_service",
  arguments: { id: pilotIds[0] },
});
const pilotFlowText = JSON.parse(pilotFlow.result.content[0].text);
assert.equal(pilotFlowText.paymentFlow.paymentMode, "inactive");
assert.equal(pilotFlowText.paymentFlow.stages.find((stage) => stage.id === "settle").status, "inactive");
assert.equal(pilotFlowText.paymentFlow.receipt.settlement.status, "inactive");
assert.equal(pilotFlowText.paymentFlow.receipt.reconciliationStatus, "not-started");

console.log(JSON.stringify({
  ok: true,
  mode: "read-only",
  tools: readTools.length,
  writes: 0,
  mutationToolRejected: true,
  pilots: pilotIds.length,
  pilotPayment: "not-active",
  pagination: true,
  hostileMetadataRejected: true,
  paymentFlowVisualization: true,
}, null, 2));
