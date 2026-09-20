import assert from "node:assert/strict";
import { WebMCPClientAdapter } from "../lib/webmcp-client-adapter.ts";

console.log("Starting WebMCP Client Adapter & Tool Conformance verification...");

// 1. Initialize Adapter
const adapter = new WebMCPClientAdapter();
const { registeredCount, tools } = adapter.init();

console.log(`Registered WebMCP tools count: ${registeredCount}`);
assert(registeredCount > 0, "WebMCP tools registry must contain at least 1 tool");
assert.equal(tools.length, registeredCount, "Returned tools length must match registeredCount");

// 2. Inspect Core Tools
const expectedTools = ["bazaar_list_services", "bazaar_search_services"];
for (const expected of expectedTools) {
  const found = tools.find((t) => t.name === expected);
  assert(found, `Expected tool "${expected}" must be registered`);
  assert(found.description && found.description.length > 10, `Tool "${expected}" must have a detailed description`);
  assert(found.inputSchema && found.inputSchema.type === "object", `Tool "${expected}" must define a valid JSON Schema object`);
}

// 3. Test Tool Execution: List Services
console.log("Executing 'bazaar_list_services'...");
const listResult = await adapter.executeTool("bazaar_list_services", {});

assert.equal(listResult.type, "json", "list_services must return type 'json'");
assert(listResult.data && listResult.data.total > 0, "Catalog must return more than 0 services");
assert(Array.isArray(listResult.data.services), "Services must be an array");

// 4. Test Tool Execution: Search Services
console.log("Executing 'bazaar_search_services' for 'swap'...");
const searchResult = await adapter.executeTool("bazaar_search_services", { query: "swap" });

assert.equal(searchResult.type, "json", "search_services must return type 'json'");
assert(Array.isArray(searchResult.data.services), "Search results must be an array");
assert(searchResult.data.services.length > 0, "Search for 'swap' should yield results");

// 5. Test Non-existent Tool Handling
console.log("Verifying fail-safe for non-existent tool...");
let thrown = false;
try {
  await adapter.executeTool("bazaar_invalid_tool_name", {});
} catch (err) {
  thrown = true;
  assert(err.message.includes("TOOL_NOT_FOUND"), "Error must clearly indicate TOOL_NOT_FOUND");
}
assert(thrown, "Executing an unregistered tool must throw an error");

console.log("All WebMCP Client Conformance tests passed successfully! (100% Compliant)");
