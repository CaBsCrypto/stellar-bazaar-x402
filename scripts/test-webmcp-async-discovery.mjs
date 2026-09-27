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
    assert.deepEqual([...tools.keys()], ["foreign"]);
    assert.equal(window.__WEBMCP_EMULATOR__.tools.size, 0);
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
