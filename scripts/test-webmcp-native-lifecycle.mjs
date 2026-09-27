import assert from "node:assert/strict";
import { initWebMCP } from "../lib/webmcp/polyfill.ts";
import { createOwnedRegistration } from "../lib/webmcp/owned-registration.ts";
const definition = name => ({ name, description: name, execute: () => ({ ok: true }) });
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
try {
  for (const placement of ["navigator", "document"]) {
    const foreign = definition("foreign");
    const tools = new Map([[foreign.name, foreign]]);
    const native = {
      registerTool: tool => { if (tool.name === "failure") throw new Error("native rejected"); tools.set(tool.name, tool); },
      unregisterTool: name => tools.delete(name),
      getTools: () => [...tools.values()],
    };
    globalThis.window = {};
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: placement === "navigator" ? { modelContext: native } : {} });
    globalThis.document = placement === "document" ? { modelContext: native } : {};
    const registry = initWebMCP();
    assert.equal(initWebMCP(), registry, "remount reuses registry and emulator");
    const mount = createOwnedRegistration(registry);
    assert.throws(() => mount.registry.registerTool(definition("foreign")), /already registered/);
    mount.registry.registerTool(definition("own"));
    assert.throws(() => mount.registry.registerTool(definition("failure")), /native rejected/);
    assert.equal(window.__WEBMCP_EMULATOR__.tools.has("failure"), false);
    mount.dispose(); mount.dispose();
    assert.deepEqual([...tools.keys()], ["foreign"]);
    assert.equal(tools.get("foreign"), foreign);
    assert.equal(window.__WEBMCP_EMULATOR__.tools.size, 0);
    const remount = createOwnedRegistration(initWebMCP());
    remount.registry.registerTool(definition("own"));
    remount.dispose();
    assert.deepEqual([...tools.keys()], ["foreign"]);
    registry.registerTool(definition("replaced"));
    const replacement = definition("replaced");
    tools.set("replaced", replacement);
    registry.unregisterTool("replaced");
    assert.equal(tools.get("replaced"), replacement);
  }
  console.log("PASS: native navigator/document failure, collision, remount, replacement and emulator cleanup");
} finally {
  delete globalThis.window; delete globalThis.document;
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
}
