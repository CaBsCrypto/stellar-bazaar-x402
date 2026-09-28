import assert from "node:assert/strict";
import { createOwnedRegistration } from "../lib/webmcp/owned-registration.ts";
import { initWebMCP } from "../lib/webmcp/polyfill.ts";
const foreign = { name: "foreign" };
const tools = new Map([[foreign.name, foreign]]);
const removed = [];
const registry = {
  getTools: () => [...tools.values()],
  registerTool: tool => { if (tool.name === "failure") throw new Error("injected"); tools.set(tool.name, tool); },
  unregisterTool: name => { removed.push(name); return tools.delete(name); },
};
const partial = createOwnedRegistration(registry);
partial.registry.registerTool({ name: "own-one" });
assert.throws(() => partial.registry.registerTool({ name: "failure" }));
partial.dispose();
assert.deepEqual([...tools.keys()], ["foreign"]);
assert.deepEqual(removed, ["own-one"]);
partial.dispose();
assert.equal(removed.length, 1);
const mounted = createOwnedRegistration(registry);
assert.throws(() => mounted.registry.registerTool(foreign), /already registered/);
mounted.registry.registerTool({ name: "own-two" });
mounted.dispose();
assert.equal(tools.get("foreign"), foreign);
assert.deepEqual(removed, ["own-one", "own-two"]);
console.log("PASS: partial registration, unmount, repeat cleanup and foreign-tool preservation");

for (const target of [registry, initWebMCP()]) {
  const scope = createOwnedRegistration(target);
  const original = { name: "reused", description: "original", execute: () => "original" };
  const replacement = { ...original, execute: () => "replacement" };
  scope.registry.registerTool(original);
  target.registerTool(replacement);
  scope.dispose();
  scope.dispose();
  assert.equal(target.getTools().find(tool => tool.name === "reused"), replacement);
  assert.equal(target.getTools().find(tool => tool.name === "reused").execute(), "replacement");
}
let unverifiedRemovals = 0;
const unknownScope = createOwnedRegistration({ registerTool() {}, unregisterTool() { unverifiedRemovals++; } });
unknownScope.registry.registerTool({ name: "unverifiable", execute() {} });
unknownScope.dispose();
assert.equal(unverifiedRemovals, 0, "Must not remove without current identity");
console.log("PASS: generic and fallback replacements survive disposal; unverifiable identity is preserved");
