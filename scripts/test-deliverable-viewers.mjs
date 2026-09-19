import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { S3Client } from "@aws-sdk/client-s3";
import { createPrivateS3 } from "../lib/deliverable-s3.ts";
import * as delivery from "../lib/deliverable.ts";
import { BazaarAgentClient } from "../lib/bazaar-agent-client.ts";
const require = createRequire(import.meta.url);
function moduleAt(relative, deps) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
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
    require: (name) => deps[name] ?? require(name),
  });
  return module.exports;
}
const { reviewDeliveries } = moduleAt("../lib/review-deliveries.ts", {});
const { DeliverableViewer } = moduleAt("../components/DeliverableViewer.tsx", {
  "@/lib/deliverable": delivery,
  "./RecoveryStatus": {RecoveryStatus:()=>null},
});
const render = (saved) =>
  renderToStaticMarkup(
    React.createElement(DeliverableViewer, {
      saved,
      access: async () => ({ url: "" }),
      onDownload: () => {},
    }),
  );
for (const saved of reviewDeliveries) {
  delivery.deliverableSchema.parse(saved.manifest);
  const html = render(saved);
  assert.ok(!html.includes("Solicitar cambios"));
  assert.ok(!html.includes("Comentar"));
  assert.match(html, /Consultar contenido original/);
}
assert.match(render(reviewDeliveries[0]), /Copiar guion completo/);
const malicious = structuredClone(reviewDeliveries[0]);
malicious.manifest.content.scenes[0].narration = "<script>alert(1)</script>";
assert.match(render(malicious), /&lt;script&gt;/);
assert.ok(!render(malicious).includes("<script>"));
const absent = structuredClone(reviewDeliveries[0]);
delete absent.manifest.content.scenes[0].screenText;
delete absent.manifest.content.scenes[0].visual;
assert.ok(!render(absent).includes("Texto en pantalla"));
const pending = structuredClone(reviewDeliveries[2]);
pending.files = Object.fromEntries(
  pending.manifest.files.map((f) => [f.id, "pending"]),
);
assert.match(render(pending), /Archivo pendiente de guardar/);
assert.ok(!render(pending).includes("<img"));
const unsupported = {
  ...reviewDeliveries[0],
  manifest: {
    ...reviewDeliveries[0].manifest,
    content: { kind: "other" },
    files: [],
  },
};
assert.match(render(unsupported), /No hay una vista previa compatible/);
const client = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: "TESTONLY",
    secretAccessKey: "test-only-not-a-real-secret",
  },
});
const s3 = createPrivateS3(client, "test-only-bucket");
const file = reviewDeliveries[2].manifest.files[0];
const signed = await s3.upload("alice", "v1", file),
  url = new URL(signed.url);
assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
for (const header of [
  "content-length",
  "if-none-match",
  "x-amz-checksum-sha256",
])
  assert.ok(url.searchParams.get("X-Amz-SignedHeaders").includes(header));
assert.equal(signed.headers["if-none-match"], "*");
assert.ok(!url.pathname.includes("alice"));
const other = await s3.upload("bob", "v1", file);
assert.notEqual(new URL(other.url).pathname, url.pathname);
const next = await s3.upload("alice", "v2", file);
assert.notEqual(new URL(next.url).pathname, url.pathname);
const access = await s3.access(
  "alice",
  "v1",
  { ...file, mediaType: "text/html" },
  false,
);
const get = new URL(access.url);
assert.equal(get.searchParams.get("X-Amz-Expires"), "300");
assert.match(
  get.searchParams.get("response-content-disposition"),
  /^attachment/,
);
client.send = async () => ({
  ContentLength: file.size,
  ContentType: file.mediaType,
  ChecksumSHA256: Buffer.from(file.sha256, "hex").toString("base64"),
});
await s3.verify("alice", "v1", file);
await assert.rejects(
  () => s3.verify("alice", "v1", { ...file, size: file.size + 1 }),
  { code: "FILE_INTEGRITY_MISMATCH" },
);
await assert.rejects(
  () => s3.verify("alice", "v1", { ...file, sha256: "0".repeat(64) }),
  { code: "FILE_INTEGRITY_MISMATCH" },
);
// Integration boundary: purchase succeeds once even when private storage cannot be reached.
const originalFetch = globalThis.fetch;
let executions = 0;
globalThis.fetch = async (url) =>
  String(url).endsWith("/api/deliveries")
    ? new Response("{}", { status: 503 })
    : Response.json({});
try {
  const buyer = new BazaarAgentClient({
    baseUrl: "https://bazaar.example",
    history: {
      writeToken: "w".repeat(43),
      taskId: "delivery-test",
      preserveFiles: true,
    },
  });
  buyer.executeServiceCore = async () => {
    executions++;
    return {
      ok: true,
      data: {
        bazaarDelivery: { manifest: reviewDeliveries[0].manifest, sources: [] },
      },
      payment: { transactionHash: "a".repeat(64) },
      delivery: { resultAvailable: true },
    };
  };
  const outcome = await buyer.executeService(
    {
      id: "test",
      name: "Test",
      url: "https://provider.example",
      provider: { name: "Example" },
      network: "stellar:testnet",
      payment: {
        amount: "0.001",
        asset: "USDC",
        destination: "G" + "A".repeat(55),
      },
    },
    {},
  );
  assert.equal(executions, 1);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.library.status, "failed");
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  "Deliverable viewer safety, missing content, pending media, S3 signatures/expiry/immutable keys, HEAD size/checksum and storage failure after one purchase PASS. Network S3 not claimed.",
);
