import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url),
  root = path.resolve("."),
  cache = new Map();
const publicEvents = [];
const browser = {
  dispatchEvent: (e) => publicEvents.push(e),
  __WEBMCP_EMULATOR__: {},
  modelContext: {},
};
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const source = fs.readFileSync(file, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const m = { exports: {} };
  cache.set(file, m);
  const req = (name) => {
    if (name.startsWith(".") || name.startsWith("@/")) {
      let target = name.startsWith("@/")
        ? path.resolve(root, name.slice(2))
        : path.resolve(path.dirname(file), name);
      if (!path.extname(target)) {
        target = fs.existsSync(target + ".ts")
          ? target + ".ts"
          : target + ".tsx";
      }
      return load(target);
    }
    return require(name);
  };
  vm.runInNewContext(
    compiled,
    {
      module: m,
      exports: m.exports,
      require: req,
      window: browser,
      console,
      crypto: globalThis.crypto,
      fetch: (...args) => globalThis.fetch(...args),
      URL,
      AbortSignal,
      TextEncoder,
      CustomEvent: globalThis.CustomEvent,
      setTimeout,
      clearTimeout,
      Buffer,
    },
    { filename: file },
  );
  return m.exports;
}
const { connectPrivateHistory } = load("lib/webmcp/private-history.ts");
const registered = new Map(),
  registry = {
    registerTool: (t) => registered.set(t.name, t),
    unregisterTool: (n) => registered.delete(n),
  };
const original = globalThis.fetch,
  writes = [];
globalThis.fetch = async (url, options) => {
  writes.push({ url: String(url), body: JSON.parse(options.body) });
  return new Response("{}", { status: 201 });
};
try {
  const stop = connectPrivateHistory(registry, {
    writeToken: "x".repeat(43),
    agentId: "native-agent",
    taskId: "native-task",
    taskTitle: "Native task",
    baseUrl: "https://bazaar.example",
  });
  assert.ok(registered.has("bazaar_private_search_services"));
  assert.ok(!registered.has("bazaar_search_services"));
  await registered
    .get("bazaar_private_search_services")
    .execute({ query: "finance" });
  assert.equal(
    publicEvents.length,
    0,
    "Private tools must not dispatch to public UI instrumentation",
  );
  assert.ok(writes.some((w) => w.body.kind === "search"));
  const connection = await registered
    .get("bazaar_private_connection")
    .execute({});
  assert.ok(!JSON.stringify(connection).includes("x".repeat(43)));
  await registered.get("bazaar_private_finish_task").execute({});
  const held = registered.get("bazaar_private_search_services");
  assert.equal((await held.execute({ query: "finance" })).isError, true);
  stop();
  assert.equal(registered.size, 0);
  assert.equal((await held.execute({ query: "finance" })).isError, true);
  // Disconnect while the start event is still in flight: held tools must never execute afterwards.
  let release;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      release = () => resolve(new Response("{}", { status: 201 }));
    });
  const stop2 = connectPrivateHistory(registry, {
    writeToken: "x".repeat(43),
    agentId: "native-agent",
    taskId: "second",
    taskTitle: "Second",
    baseUrl: "https://bazaar.example",
  });
  const pending = registered
    .get("bazaar_private_search_services")
    .execute({ query: "finance" });
  stop2();
  release();
  assert.equal((await pending).isError, true);
  assert.equal(publicEvents.length, 0);
} finally {
  globalThis.fetch = original;
}
const { ReadableResult, PurchaseResult } = load(
  "components/ActivityDashboard.tsx",
);
const markup = renderToStaticMarkup(
  React.createElement(ReadableResult, {
    value: { report: "<img src=x onerror=alert(1)>", items: ["A", "B"] },
  }),
);
assert.ok(markup.includes("&lt;img"));
assert.ok(!markup.includes("<img"));
const record = {
  service: { url: "https://provider.example" },
  delivery: {
    status: "reported-delivered",
    artifact: { kind: "external", url: "javascript:alert(1)", label: "Open" },
  },
};
assert.ok(
  !renderToStaticMarkup(
    React.createElement(PurchaseResult, { record, onDownload: () => {} }),
  ).includes("href="),
);
record.delivery.artifact.url = "https://provider.example/result";
assert.ok(
  renderToStaticMarkup(
    React.createElement(PurchaseResult, { record, onDownload: () => {} }),
  ).includes('rel="noopener noreferrer"'),
);
console.log(
  "Private native-registry harness: scoped tools, step reporting, no public UI leak, disconnect races, finished task guard, inert results and provider links PASS. Native browser interoperability is not asserted.",
);
