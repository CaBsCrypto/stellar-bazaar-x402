import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { prepareProviderReview } from "./prepare-provider-review.mjs";

const root = await mkdtemp(join(tmpdir(), "bazaar-review-test-"));
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("NETWORK_FORBIDDEN"); };
const card = {
  version: "bazaar.service-card/v0", id: "review-fixture", name: "Review fixture", description: "Offline validation fixture.",
  kind: "http", url: "https://provider.example.com", routeTemplate: "/quote", input: [], network: "stellar:testnet",
  payment: { scheme: "exact", asset: "USDC", amount: "0.001", destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
  provider: { name: "Fixture" }, tags: ["fixture"],
};
try {
  const input = join(root, "input.json");
  await writeFile(input, JSON.stringify(card));
  const first = await prepareProviderReview(input, join(root, "first"));
  const second = await prepareProviderReview(input, join(root, "second"));
  assert.equal(first.cardHash, second.cardHash);
  for (const file of ["service-card.json", "review-packet.json", "REVIEW.md"]) {
    assert.equal(await readFile(join(root, "first", file), "utf8"), await readFile(join(root, "second", file), "utf8"));
  }
  const canonical = (await readFile(join(root, "first", "service-card.json"), "utf8")).trimEnd();
  assert.equal(first.cardHash, createHash("sha256").update(canonical).digest("hex"));
  const packet = JSON.parse(await readFile(join(root, "first", "review-packet.json"), "utf8"));
  assert.equal(packet.submitted, false);
  assert.equal(packet.publiclyActive, false);
  assert.equal(packet.controlProof.status, "pending");
  assert.equal(packet.manualReview.decision, null);
  assert.equal(packet.indexing.status, "not-indexed");
  await assert.rejects(prepareProviderReview(input, join(root, "first")), /OUTPUT_EXISTS/);
  for (const [name, invalid, expected] of [
    ["shape", { nope: true }, /INVALID_CARD/],
    ["rules", { ...card, routeTemplate: "/quote/{undeclared}" }, /CONFORMANCE_FAILED/],
    ["secret", { ...card, provider: { name: "Fixture", apiKey: "test-credential" } }, /SECRET_FIELD_REJECTED/],
    ["url", { ...card, url: "https://user:pass@provider.example.com" }, /UNSAFE_SERVICE_URL|CONFORMANCE_FAILED/],
    ["query", { ...card, url: "https://provider.example.com?token=test" }, /UNSAFE_SERVICE_URL|CONFORMANCE_FAILED/],
  ]) {
    await writeFile(input, JSON.stringify(invalid));
    await assert.rejects(prepareProviderReview(input, join(root, name)), expected);
    assert.equal((await readdir(root)).includes(name), false);
  }
  assert.equal((await readdir(root)).some((entry) => entry.includes("-pending-")), false);
  console.log(JSON.stringify({ ok: true, network: "forbidden", deterministic: true, publication: false }));
} finally {
  globalThis.fetch = originalFetch;
  await rm(root, { recursive: true, force: true });
}
