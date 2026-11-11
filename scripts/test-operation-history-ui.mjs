import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { createOwnedRegistration } from "../lib/webmcp/owned-registration.ts";
import { serializedPrivateRead } from "../lib/private-read-queue.ts";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/OperationHistory.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const module = { exports: {} };
const imports = new Map([
  ["@/lib/webmcp/owned-registration", { createOwnedRegistration }],
  ["@/lib/private-read-queue", { serializedPrivateRead }],
  ["./ActivityDashboard", { ActivityDashboard: () => null }],
  ["@/components/Navbar", { Navbar: () => null }],
  ["@/components/Breadcrumbs", { Breadcrumbs: ({ backHref }) => React.createElement("a", { href: backHref }, "Volver") }],
  ["@/components/Footer", { Footer: () => null }],
]);
vm.runInNewContext(compiled, { exports: module.exports, module, process: { env: {} }, require: name => imports.get(name) ?? require(name) });
const { HistoryAmount, HistoryResult, OperationHistory } = module.exports;
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
assert.match(render(HistoryAmount, { atomic: "10000", asset: "USDC" }), /0\.001 USDC/);
assert.match(render(HistoryAmount, { atomic: "1", asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA" }), /0\.0000001 USDC/);
assert.match(render(HistoryAmount, { atomic:"100000", asset:"XLM" }), /0\.01 XLM/);
assert.match(render(HistoryAmount, { atomic:"100000", asset:"CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" }), /0\.01 XLM/);
assert.equal(render(HistoryAmount, { atomic: "10000", asset: "OTHER" }), "<span>10000 atomic</span>");
for (const label of ["Ver resultado reportado", "View reported result"]) {
  const result = render(HistoryResult, { label, value: { output: '<img src=x onerror="alert(1)">', url: "javascript:alert(1)" } });
  assert.ok(result.includes(label));
  assert.ok(result.includes("&lt;img"));
  assert.ok(!result.includes("<img"));
  assert.ok(!result.includes("href="));
}
const locked = render(OperationHistory, {});
assert.match(locked, /Historial bloqueado/);
assert.match(locked, /type="password"/);
assert.match(locked, /href="\/catalogo"/);
assert.ok(!locked.includes("localStorage"));
console.log("Operation history UI: safe result rendering, exact amount, locked view PASS");
