import assert from "node:assert/strict";
import { createOwnedRegistration } from "../lib/webmcp/owned-registration.ts";
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
