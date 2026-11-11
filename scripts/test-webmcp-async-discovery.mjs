import assert from "node:assert/strict";
import { initWebMCP, initWebMCPAsync } from "../lib/webmcp/polyfill.ts";
import { createOwnedRegistration } from "../lib/webmcp/owned-registration.ts";
const definition = name => ({ name, description: name, execute: () => ({ ok: true }) });
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
try {
  for (const kind of ["object", "async-array", "async-object"]) {
    const foreign = definition("foreign");
    const tools = new Map([[foreign.name, foreign]]);
    const native = {
      registerTool: tool => { if (tools.has(tool.name)) throw new Error("duplicate"); tools.set(tool.name, tool); },
      unregisterTool: name => tools.delete(name),
      getTools: () => kind === "object" ? { tools: [...tools.values()] } : Promise.resolve(kind === "async-array" ? [...tools.values()] : { tools: [...tools.values()] }),
    };
    globalThis.window = {}; globalThis.document = {};
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { modelContext: native } });
    const registry = await initWebMCPAsync();
    const scope = createOwnedRegistration(registry);
    assert.throws(() => scope.registry.registerTool(definition("foreign")), /already registered/);
    scope.registry.registerTool(definition("own"));
    assert.equal(registry.getTools().find(tool => tool.name === "own").execute instanceof Function, true);
    scope.dispose();
    assert.deepEqual([...tools.keys()], kind === "object" ? ["foreign"] : ["foreign", "own"]);
    assert.equal(window.__WEBMCP_EMULATOR__.tools.size, 0);
  }
  // A cached discovery result must never authorize deletion of a later owner.
  for (const kind of ["async-array", "async-object", "metadata", "missing", "throws"]) {
    const own = definition("own");
    const tools = new Map();
    let cleanup = false;
    let removals = 0;
    const native = {
      registerTool: tool => tools.set(tool.name, tool),
      unregisterTool: name => { removals++; return tools.delete(name); },
      getTools: () => {
        if (cleanup && kind === "throws") throw new Error("discovery unavailable");
        if (cleanup && kind === "missing") return undefined;
        const list = [...tools.values()];
        if (kind === "metadata") return list.map(({ name, description }) => ({ name, description }));
        if (kind === "async-array") return Promise.resolve(list);
        if (kind === "async-object") return Promise.resolve({ tools: list });
        return list;
      },
    };
    globalThis.window = {}; globalThis.document = {};
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { modelContext: native } });
    const registry = await initWebMCPAsync();
    const scope = createOwnedRegistration(registry);
    scope.registry.registerTool(own);
    await initWebMCPAsync(); // The snapshot now contains the old owner's tool.
    const replacement = definition("own");
    tools.set("own", replacement);
    cleanup = true;
    scope.dispose(); scope.dispose();
    assert.equal(tools.get("own"), replacement, `${kind}: preserves replacement`);
    assert.equal(removals, 0, `${kind}: no native deletion without current identity`);
    assert.equal(window.__WEBMCP_EMULATOR__.tools.size, 0, `${kind}: local mirror cleaned`);
  }
  for (const invalid of [{}, { tools: null }, { tools: [null] }]) {
    globalThis.window = {}; globalThis.document = {};
    let calls = 0;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { modelContext: { getTools: async () => invalid, registerTool: () => calls++ } } });
    await assert.rejects(initWebMCPAsync(), /Unsupported native/);
    assert.equal(calls, 0);
  }
  console.log("PASS: object/async native discovery preserves foreign tools; malformed lists fail before registration");
} finally {
  delete globalThis.window; delete globalThis.document;
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
}
