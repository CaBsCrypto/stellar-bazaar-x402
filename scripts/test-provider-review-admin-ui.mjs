import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/ProviderReviewAdmin.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const record = { submissionId: "sub-1", card: { name: '<img src=x onerror="alert(1)">', url: "javascript:alert(1)" }, status: "pending-manual-review", publiclyActive: false, control: { method: "dns-txt", domain: "example.com", status: "verified" }, conformance: [], submittedAt: "today", expiresAt: "tomorrow" };
let slots = [], cursor = 0, effects = [], calls = [], delayed;
const hooks = { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; }, useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; }, useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } } };
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, require: name => name === "react" ? hooks : require(name), URLSearchParams, AbortController, window: { location: { hash: "#key=bz_magic_private", pathname: "/admin", search: "" }, history: { replaceState(...args) { calls.push(["replace", ...args]); } } }, fetch: async (url, init) => {
  calls.push([url, init]);
  const value = url.includes("review-session") ? { ok: true, operator: { email: "operator@example.com" }, csrfToken: "csrf", expiresAt: "tomorrow" } : url.includes("sub-1") ? { ok: true, value: record } : { ok: true, value: { submissions: [record], page: 1, totalPages: 1, total: 1 } };
  if (delayed && url.includes("provider-submissions?")) return await delayed;
  return { ok: true, status: 200, json: async () => value };
} });
const { ProviderReviewAdmin, SubmissionDetails } = module.exports;
function render() { cursor = 0; return ProviderReviewAdmin(); }
function nodes(node, predicate, result = []) { if (!node || typeof node !== "object") return result; if (predicate(node)) result.push(node); for (const child of [node.props?.children].flat(Infinity)) nodes(child, predicate, result); return result; }
function button(tree, label) { return nodes(tree, node => node.type === "button" && node.props.children === label)[0]; }
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const html = renderToStaticMarkup(React.createElement(SubmissionDetails, { submission: record }));
assert.match(html, /&lt;img/); assert.ok(!html.includes("<img")); assert.ok(!html.includes("href="));
render(); const cleanup = effects[0](); await settle();
let tree = render();
assert.equal(calls[0][0], "replace", "URL credential removed before network");
assert.equal(JSON.parse(calls.find(([url]) => url === "/api/admin/review-session")[1].body).token, "bz_magic_private");
assert.equal(calls.filter(([url]) => url.includes("magic-link")).length, 0, "No automatic email");
const item = nodes(tree, node => node.type === "button" && Array.isArray(node.props.children) && node.props.children[0] === record.card.name)[0];
item.props.onClick(); await settle(); tree = render();
assert.equal(button(tree, "Aprobar para preparación").props.disabled, true, "Reason required");
nodes(tree, node => node.type === "textarea")[0].props.onChange({ target: { value: "Inspected service" } });
tree = render(); button(tree, "Aprobar para preparación").props.onClick(); await settle();
const mutation = calls.find(([url, init]) => url.includes("sub-1") && init.method === "POST");
assert.equal(mutation[1].headers["x-csrf-token"], "csrf");
assert.deepEqual(JSON.parse(mutation[1].body), { action: "review", decision: "approve", reasons: ["Inspected service"] });
assert.ok(!calls.some(([, init]) => init?.body?.includes('"activate"')), "Approval never activates");
let release; delayed = new Promise(resolve => { release = resolve; });
tree = render(); button(tree, "Actualizar cola").props.onClick(); await settle();
tree = render(); button(tree, "Cerrar sesión").props.onClick(); await settle();
release({ ok: true, status: 200, json: async () => ({ ok: true, value: { submissions: [record], page: 1, totalPages: 1, total: 1 } }) }); await settle();
tree = render(); assert.ok(!nodes(tree, node => node.type === SubmissionDetails).length, "Late response cannot restore private data after logout");
assert.ok(nodes(tree, node => node.type === "input" && node.props.type === "email").length);
cleanup();
assert.ok(!source.includes("localStorage"));
console.log("Provider review UI: credential removal, explicit email, CSRF actions, reason gate, escaping and logout race PASS");
