import assert from "node:assert/strict";
import { workflowBundles } from "../lib/workflow-bundles.ts";
import { validateWorkflowBundle } from "../lib/workflow-bundle.ts";
import { services } from "../lib/catalog.ts";
import { pilotCards } from "../lib/pilot-cards.ts";

const knownIds = [...services.map((s) => s.id), ...pilotCards.map((p) => p.id)];

const fails = (bundle, rule) => {
  const outcomes = validateWorkflowBundle(bundle, knownIds);
  const hit = outcomes.find((o) => o.rule === rule);
  assert.ok(hit, `rule ${rule} should exist`);
  assert.equal(hit.status, "fail", `rule ${rule} should fail: ${hit.reason}`);
  return outcomes;
};

const pass = (bundle, rule) => {
  const outcomes = validateWorkflowBundle(bundle, knownIds);
  const hit = outcomes.find((o) => o.rule === rule);
  assert.ok(hit, `rule ${rule} should exist`);
  assert.equal(hit.status, "pass", `rule ${rule} should pass: ${hit?.reason}`);
};

const clone = (bundle) => JSON.parse(JSON.stringify(bundle));

for (const fixture of workflowBundles) {
  const outcomes = validateWorkflowBundle(fixture, knownIds);
  assert.ok(
    !outcomes.some((o) => o.status === "fail"),
    `fixture ${fixture.id} must be conformant`,
  );
}
console.log(`✓ ${workflowBundles.length} fixtures conformant (zero fails)`);

const base = clone(workflowBundles[0]);

const cycle = clone(base);
cycle.stages[0].next = 1;
cycle.stages[1].next = 0;
fails(cycle, "bundle.stages.acyclic");

const missingStageCapability = clone(base);
missingStageCapability.stages[1].capability = "not-declared-capability";
fails(missingStageCapability, "bundle.stages.capability");

const unknownService = clone(base);
unknownService.services[0].id = "ghost-service";
fails(unknownService, "bundle.services.known");

const duplicateService = clone(base);
duplicateService.services = [
  { id: "research-scout-pilot", version: "bazaar.pilot-card/v1" },
  { id: "research-scout-pilot", version: "bazaar.pilot-card/v1" },
];
fails(duplicateService, "bundle.services.unique");

const nonSequential = clone(base);
nonSequential.stages[2].order = 5;
fails(nonSequential, "bundle.stages.sequential");

const mixedAssets = clone(base);
mixedAssets.aggregatePrice.entries[1].asset = "XLM";
fails(mixedAssets, "bundle.price.assets");

const badScheme = clone(base);
badScheme.aggregatePrice.entries[0].scheme = "weird";
fails(badScheme, "bundle.price.scheme");

const badAmount = clone(base);
badAmount.aggregatePrice.entries[0].amount = "0.00000001";
fails(badAmount, "bundle.price.amounts");

const badMediaType = clone(base);
badMediaType.stages[0].outputArtifact.mediaType = "not-a-media-type";
fails(badMediaType, "bundle.stages.artifacts");

const badNetwork = clone(base);
badNetwork.aggregatePrice.entries[0].network = "stellar:pubnet";
fails(badNetwork, "bundle.price.networks");

const unknownStatus = clone(base);
unknownStatus.status = "executing-now";
fails(unknownStatus, "bundle.status.known");

const bypassGate = clone(base);
bypassGate.stages[0].approvalGate = false;
bypassGate.stages[1].approvalGate = false;
bypassGate.stages[2].approvalGate = true;
fails(bypassGate, "bundle.approvalGate.meaningful");

const wrongVersion = clone(base);
wrongVersion.version = "bazaar.workflow-bundle/v0";
fails(wrongVersion, "bundle.version");

const handoffMissing = clone(base);
delete handoffMissing.handoffArtifact;
const handoffOutcomes = validateWorkflowBundle(handoffMissing, knownIds);
const handoffRule = handoffOutcomes.find((o) => o.rule === "bundle.handoffArtifact.valid");
assert.equal(handoffRule?.status, "warning");

pass(base, "bundle.stages.acyclic");
pass(base, "bundle.approvalGate.meaningful");
pass(base, "bundle.price.assets");

const MCP_BASE = process.env.MCP_BASE_URL ?? "http://127.0.0.1:3000";
const mcp = `${MCP_BASE}/api/mcp`;
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};
async function rpc(id, method, params) {
  const response = await fetch(mcp, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

const listBundles = await rpc(1, "tools/call", {
  name: "list_workflow_bundles",
  arguments: {},
});
const listText = JSON.parse(listBundles.result.content[0].text);
assert.equal(listText.bundles.length, workflowBundles.length);
assert.ok(listText.bundles.every((b) => b.execution === false));
console.log(`✓ MCP list_workflow_bundles exposes ${listText.bundles.length} read-only fixtures`);

const getBundle = await rpc(2, "tools/call", {
  name: "get_workflow_bundle",
  arguments: { id: "brand-identity-bundle" },
});
const getText = JSON.parse(getBundle.result.content[0].text);
assert.equal(getText.bundle.id, "brand-identity-bundle");
assert.equal(getText.schemaVersion, "bazaar.workflow-bundle/v1");
assert.equal(getText.execution, false);
assert.equal(
  getText.conformance.some((o) => o.status === "fail"),
  false,
  "fixture conformance must pass via MCP",
);
console.log("✓ MCP get_workflow_bundle returns conformant fixture");

const getMissing = await rpc(3, "tools/call", {
  name: "get_workflow_bundle",
  arguments: { id: "missing-bundle" },
});
assert.equal(getMissing.result.isError, true);
const missingEnvelope = JSON.parse(getMissing.result.content[0].text);
assert.equal(missingEnvelope.code, "BUNDLE_NOT_FOUND");
assert.equal(missingEnvelope.stage, "discover");
console.log("✓ MCP BUNDLE_NOT_FOUND envelope deterministic");

console.log(
  JSON.stringify(
    {
      ok: true,
      fixtures: workflowBundles.map((b) => b.id),
      conformanceRules: 20,
      negativeCases: 13,
      mcpSurface: ["list_workflow_bundles", "get_workflow_bundle"],
      execution: false,
      payments: false,
      certification: false,
    },
    null,
    2,
  ),
);