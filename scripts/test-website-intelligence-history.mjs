import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildWebsiteReportBundle,
  persistWebsiteReport,
} from "../lib/website-intelligence-history.ts";
import * as deliverable from "../lib/deliverable.ts";
import { verifiedWebsiteIntelligenceDelivery as fixture } from "../lib/website-intelligence-consumption.ts";
import { createHistoryStore } from "../lib/operation-history-store.ts";
import { createActivityStore } from "../lib/activity-store.ts";
import { createDeliverableStore } from "../lib/deliverable-store.ts";
import { createHistoryHandlers } from "../lib/operation-history-http.ts";
import { createActivityHandlers } from "../lib/activity-http.ts";
import { createDeliverableHandlers } from "../lib/deliverable-http.ts";
import { authenticateHistory } from "../lib/operation-history-auth.ts";

const input = {
  operationId: "website-report-test",
  taskId: "website-task-test",
  agentId: "test-buyer",
  mode: "testnet",
  providerOrigin: "https://website-intelligence-provider.vercel.app",
  payTo: "G" + "A".repeat(55),
  result: fixture.result,
  transactionHash: "a".repeat(64),
};
const bundle = buildWebsiteReportBundle(input);
assert.deepEqual(
  bundle,
  buildWebsiteReportBundle(structuredClone(input)),
  "Retry must preserve every ID and byte of evidence",
);
assert.equal(bundle.operation.mode, "testnet");
assert.equal(bundle.operation.payment.status, "reported-unverified");
assert.equal(bundle.operation.payment.amountAtomic, "10000");
assert.deepEqual(bundle.operation.delivery.result, fixture.result);
assert.deepEqual(bundle.manifest.originalResult, fixture.result);
assert.equal(bundle.manifest.content.kind, "report");
assert.deepEqual(bundle.manifest.files, []);
assert.match(bundle.manifest.title, /fixture/);
assert.match(bundle.manifest.content.sections[0].body, /sin visitar/);
assert.equal(bundle.manifest.content.sections[1].body, fixture.result.summary);
assert.equal(bundle.manifest.content.sections[2].body, "88/100");
assert.equal(
  bundle.manifest.content.sections.length,
  3 + fixture.result.findings.length,
);
const reversed = buildWebsiteReportBundle({
  ...input,
  result: { ...fixture.result, findings: fixture.result.findings.toReversed() },
});
assert.deepEqual(
  bundle.manifest.content.sections
    .slice(3)
    .map((section) => section.id)
    .toSorted(),
  reversed.manifest.content.sections
    .slice(3)
    .map((section) => section.id)
    .toSorted(),
);
const changedOperation = buildWebsiteReportBundle({
  ...input,
  operationId: "another-report",
});
assert.notEqual(bundle.manifest.versionId, changedOperation.manifest.versionId);
const mock = buildWebsiteReportBundle({
  ...input,
  mode: "mock",
  transactionHash: undefined,
});
assert.equal(mock.operation.payment.status, "not-requested");
assert.equal(mock.operation.payment.amountAtomic, "0");
assert.ok(!mock.events.some((event) => event.kind === "payment-reported"));
assert.throws(() => buildWebsiteReportBundle({ ...input, mode: "mock" }));
assert.throws(() =>
  buildWebsiteReportBundle({
    ...input,
    providerOrigin: "https://provider.example/?token=secret",
  }),
);
assert.throws(() =>
  buildWebsiteReportBundle({
    ...input,
    result: { ...fixture.result, score: NaN },
  }),
);
assert.throws(() =>
  buildWebsiteReportBundle({
    ...input,
    result: {
      ...fixture.result,
      findings: [fixture.result.findings[0], fixture.result.findings[0]],
    },
  }),
);
for (const extra of [
  { token: "credential" },
  { privateKey: "secret" },
  { nested: { url: "https://example.test/?token=abc" } },
  { note: "Bearer secret" },
]) {
  assert.throws(() =>
    buildWebsiteReportBundle({
      ...input,
      result: { ...fixture.result, ...extra },
    }),
  );
  assert.equal(
    deliverable.deliverableSchema.safeParse({
      ...bundle.manifest,
      originalResult: extra,
    }).success,
    false,
  );
}
assert.equal(
  deliverable.deliverableSchema.safeParse({
    ...bundle.manifest,
    originalResult: { notes: Array(10).fill("x".repeat(8192)) },
  }).success,
  false,
);
const larger = {
  ...fixture.result,
  notes: ["x".repeat(5000), "y".repeat(5000)],
};
const largeBundle = buildWebsiteReportBundle({ ...input, result: larger });
assert.equal(largeBundle.operation.delivery.result, undefined);
assert.deepEqual(largeBundle.manifest.originalResult, larger);
const wideResult = { ...fixture.result, notes: "界".repeat(5000) };
const wideBundle = buildWebsiteReportBundle({ ...input, result: wideResult });
assert.equal(
  wideBundle.operation.delivery.result,
  undefined,
  "Operation size budget must count UTF-8 bytes",
);
assert.deepEqual(wideBundle.manifest.originalResult, wideResult);

// Render the actual viewer to verify original JSON and hostile provider text remain text.
const require = createRequire(import.meta.url);
const viewerSource = readFileSync(
  new URL("../components/DeliverableViewer.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(viewerSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, {
  exports: module.exports,
  module,
  require: (name) =>
    name === "./RecoveryStatus" ? {RecoveryStatus:()=>null} : name === "@/lib/deliverable" ? deliverable : require(name),
});
const unsafeText = buildWebsiteReportBundle({
  ...input,
  result: {
    ...fixture.result,
    summary: "<script>alert(1)</script>",
    extra: "original-only-marker",
  },
});
const html = renderToStaticMarkup(
  React.createElement(module.exports.DeliverableViewer, {
    saved: {
      operationId: input.operationId,
      manifest: unsafeText.manifest,
      createdAt: "2026-09-08T00:00:00Z",
      files: {},
    },
    access: async () => ({ url: "" }),
    onDownload() {},
  }),
);
assert.match(html, /&lt;script&gt;/);
assert.ok(!html.includes("<script>"));
assert.match(html, /original-only-marker/);
assert.ok(
  !html.includes("bazaar.deliverable/v1"),
  "Original panel must show provider JSON instead of the wrapper manifest",
);

// In-memory Redis protocol with real auth, HTTP handlers and per-owner stores. No live network.
const records = new Map(),
  indexes = new Map();
const redis = {
  async eval(_script, keys, args) {
    const [key] = keys,
      [id, digest] = args;
    const isManifest = keys.length === 3;
    const index = keys[isManifest ? 2 : 1],
      raw = args[isManifest ? 4 : 2];
    const map = records.get(key) ?? new Map();
    if (map.has(id))
      return [
        JSON.parse(map.get(id)).digest === digest ? "existing" : "conflict",
        map.get(id),
      ];
    records.set(key, map);
    map.set(id, raw);
    indexes.set(index, [id, ...(indexes.get(index) ?? [])]);
    return ["created", raw];
  },
  async hmget(key, ...ids) {
    return Object.fromEntries(ids.map((id) => [id, records.get(key)?.get(id)]));
  },
  async lrange(key, start, end) {
    return (indexes.get(key) ?? []).slice(start, end + 1);
  },
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const read = "r".repeat(43),
  write = "w".repeat(43),
  other = "o".repeat(43);
const config = JSON.stringify([
  { ownerId: "alice", readTokenHash: hash(read), writeTokenHash: hash(write) },
  {
    ownerId: "bob",
    readTokenHash: hash(other),
    writeTokenHash: hash("b".repeat(43)),
  },
]);
const auth = (header, writes) => authenticateHistory(header, writes, config);
const operations = createHistoryStore(redis),
  activity = createActivityStore(redis),
  deliveries = createDeliverableStore(redis);
const historyHandlers = createHistoryHandlers({
  authenticate: auth,
  store: () => operations,
});
const activityHandlers = createActivityHandlers({
  authenticate: auth,
  operations: () => operations,
  events: () => activity,
});
const deliveryHandlers = createDeliverableHandlers({
  auth,
  history: () => operations,
  store: () => deliveries,
  objects: () => {
    throw Error("Text reports must not use file storage");
  },
});
const nativeFetch = globalThis.fetch;
let fail = "",
  calls = [];
globalThis.fetch = async (url, options) => {
  const target = new URL(url);
  assert.equal(
    target.origin,
    "https://bazaar.example",
    "Journal retry must never contact the provider or a payment service",
  );
  assert.equal(options.method, "POST");
  const body = JSON.parse(options.body);
  calls.push({ path: target.pathname, body });
  if (fail === target.pathname || fail === body.kind)
    return Response.json(
      { error: { code: "STORAGE_UNAVAILABLE" } },
      { status: 503 },
    );
  const request = new Request(url, options);
  if (target.pathname === "/api/operations")
    return historyHandlers.POST(request);
  if (target.pathname === "/api/deliveries")
    return deliveryHandlers.POST(request);
  if (target.pathname === "/api/activity")
    return activityHandlers.POST(request);
  throw Error("Unexpected network operation");
};
try {
  let saved = await persistWebsiteReport(
    "https://bazaar.example",
    write,
    bundle,
  );
  assert.equal(saved.status, "stored");
  assert.deepEqual(saved.failures, []);
  assert.deepEqual(
    calls.map((call) => call.path),
    [
      "/api/operations",
      "/api/deliveries",
      ...bundle.events.map(() => "/api/activity"),
    ],
  );
  assert.equal(
    (await persistWebsiteReport("https://bazaar.example", write, bundle))
      .status,
    "stored",
  );
  assert.equal((await operations.all("alice")).length, 1);
  assert.equal((await deliveries.list("alice", input.operationId)).length, 1);
  assert.equal((await activity.all("alice")).length, bundle.events.length);
  assert.equal((await operations.all("bob")).length, 0);
  const otherRead = new Request(
    "https://bazaar.example/api/deliveries?operationId=" + input.operationId,
    { headers: { Authorization: "Bearer " + other } },
  );
  assert.equal((await deliveryHandlers.GET(otherRead)).status, 404);
  assert.equal(await deliveries.get("bob", bundle.manifest.versionId), null);
  assert.equal(
    (await persistWebsiteReport("https://bazaar.example", read, bundle)).status,
    "failed",
  );
  for (const stage of [
    "/api/operations",
    "/api/deliveries",
    "delivery-reported",
    "task-completed",
  ]) {
    fail = stage;
    calls = [];
    const recovery = buildWebsiteReportBundle({
      ...input,
      operationId: "failure-" + stage.replaceAll("/", "-"),
    });
    saved = await persistWebsiteReport(
      "https://bazaar.example",
      write,
      recovery,
    );
    assert.notEqual(saved.status, "stored");
    assert.ok(saved.failures.length);
    if (stage !== "task-completed")
      assert.ok(!calls.some((call) => call.body.kind === "task-completed"));
    if (stage === "/api/operations")
      assert.ok(!calls.some((call) => call.path === "/api/deliveries"));
    fail = "";
    assert.equal(
      (await persistWebsiteReport("https://bazaar.example", write, recovery))
        .status,
      "stored",
    );
    assert.equal(
      (await operations.all("alice")).filter(
        (record) =>
          record.clientOperationId === recovery.operation.clientOperationId,
      ).length,
      1,
    );
    assert.equal(
      (await deliveries.list("alice", recovery.operation.clientOperationId))
        .length,
      1,
    );
  }
  calls = [];
  const mixed = structuredClone(bundle);
  mixed.events[0].taskId = "another-owner-task";
  await assert.rejects(
    () => persistWebsiteReport("https://bazaar.example", write, mixed),
    /INVALID_REPORT_BUNDLE/,
  );
  assert.equal(calls.length, 0);
} finally {
  globalThis.fetch = nativeFetch;
}
console.log(
  "Website Intelligence report contract, original rendering, owner isolation and storage-only retries passed.",
);
