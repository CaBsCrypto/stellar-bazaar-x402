import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import * as review from "../lib/provider-self-listing.ts";
import { verifySubmissionDns, verifySubmissionHttp, activateSubmission, recoverSubmissionActivation } from "../lib/provider-review-operator.ts";
import { computeCanonicalServiceCardHash } from "../lib/canonical-service-card.ts";
import { runProviderReviewOperator } from "./provider-review-operator.mjs";

const directory = await mkdtemp(join(tmpdir(), "bazaar-operator-test-"));
const savedEnv = { ...process.env };
process.env.BAZAAR_PROVIDER_REVIEW_DIR = directory;
process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE = "true";
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
delete process.env.BAZAAR_PROVIDER_PREVIEW_HOST;
delete process.env.BAZAAR_PROVIDER_PREVIEW_BYPASS;
const card = (id) => ({
  version: "bazaar.service-card/v0", id, name: "Synthetic operator test", description: "Offline operator fixture.",
  kind: "http", url: "https://api.provider.example.com", routeTemplate: "/v1/quote/{pair}",
  input: [{ name: "pair", type: "string", required: true }], network: "stellar:testnet",
  payment: { scheme: "exact", asset: "USDC", amount: "0.001", destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
  provider: { name: "Synthetic fixture" }, tags: ["fixture"],
});
const entries = new Map();
let creates = 0;
const registry = {
  configured: () => true,
  async create(value) {
    creates++;
    const entry = { id: value.id, hash: computeCanonicalServiceCardHash(value), card: structuredClone(value) };
    entries.set(value.id, entry);
    return { ok: true, entry };
  },
  async read(id) { return entries.get(id); },
};
async function submit(id, method = "dns-txt", domain = "api.provider.example.com") {
  const draft = { ...card(id), url: `https://${domain}` };
  const result = await review.submitProviderDraft(draft, { method, domain }, { submissionId: randomUUID(), submissionToken: randomBytes(32).toString("hex") });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}
async function prove(submission) {
  return verifySubmissionDns(submission.submissionId, { resolveTxt: async (host) => {
    assert.equal(host, "api.provider.example.com");
    const record = submission.control.expectedRecord;
    return [[record.slice(0, 10), record.slice(10)]];
  } });
}
async function stage(submission) {
  await prove(submission);
  assert.equal((await review.recordManualReview(submission.submissionId, { decision: "approve", reviewerId: "fixture-operator", reasons: ["Synthetic control and conformance inspected"] })).ok, true);
  assert.equal((await review.stageApprovedSubmission(submission.submissionId)).ok, true);
}
try {
  const pending = await submit("operator-proof");
  await assert.rejects(verifySubmissionDns(pending.submissionId, { resolveTxt: async () => [[`${pending.control.expectedRecord}wrong`]] }), /CONTROL_PROOF_MISMATCH/);
  await assert.rejects(verifySubmissionDns(pending.submissionId, { timeoutMs: 5, resolveTxt: () => new Promise(() => {}) }), /DNS_PROOF_UNAVAILABLE/);
  await assert.rejects(activateSubmission(pending.submissionId, registry), /INVALID_TRANSITION/);
  assert.equal(creates, 0);
  await assert.rejects(runProviderReviewOperator(["--review-dir", directory, "review", pending.submissionId]), /EXPLICIT_REVIEW_REQUIRED/);
  await stage(pending);
  const results = await Promise.allSettled([activateSubmission(pending.submissionId, registry), activateSubmission(pending.submissionId, registry)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(creates, 1);
  assert.equal((await recoverSubmissionActivation(pending.submissionId, registry)).status, "activated");
  assert.equal(creates, 1);

  const uncertain = await submit("operator-lost-response");
  await stage(uncertain);
  const lostResponse = { ...registry, async create(value) { await registry.create(value); throw new Error("Synthetic lost response"); } };
  await assert.rejects(activateSubmission(uncertain.submissionId, lostResponse), /ACTIVATION_UNCERTAIN/);
  await assert.rejects(activateSubmission(uncertain.submissionId, registry), /ACTIVATION_REQUIRES_RECOVERY/);
  assert.equal(creates, 2);
  const original = entries.get(uncertain.card.id);
  entries.set(uncertain.card.id, { ...original, hash: "wrong" });
  await assert.rejects(recoverSubmissionActivation(uncertain.submissionId, registry), /REGISTRY_EVIDENCE_MISMATCH/);
  entries.set(uncertain.card.id, original);
  assert.equal((await recoverSubmissionActivation(uncertain.submissionId, registry)).status, "activated");
  assert.equal(creates, 2);

  const storageFailure = await submit("operator-storage-failure");
  await stage(storageFailure);
  await writeFile(join(directory, "review.lock"), "synthetic contention", { flag: "wx" });
  await assert.rejects(activateSubmission(storageFailure.submissionId, registry), /STORE_UNAVAILABLE/);
  assert.equal(creates, 2);
  await unlink(join(directory, "review.lock"));
  const failFinalWrite = { ...registry, async create(value) {
    const result = await registry.create(value);
    await writeFile(join(directory, "review.lock"), "synthetic storage failure", { flag: "wx" });
    return result;
  } };
  await assert.rejects(activateSubmission(storageFailure.submissionId, failFinalWrite), /ACTIVATION_UNCERTAIN/);
  assert.equal(creates, 3);
  await unlink(join(directory, "review.lock"));
  await assert.rejects(activateSubmission(storageFailure.submissionId, registry), /ACTIVATION_REQUIRES_RECOVERY/);
  assert.equal((await recoverSubmissionActivation(storageFailure.submissionId, registry)).status, "activated");
  assert.equal(creates, 3);

  const expired = await submit("operator-expired");
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse(expired.expiresAt) + 1;
    await assert.rejects(prove(expired), /INVALID_TRANSITION/);
  } finally { Date.now = originalNow; }
  const http = await submit("operator-http", "http-well-known");
  await assert.rejects(prove(http), /HTTP_PROOF_VERIFIER_NOT_CONFIGURED/);
  let requests = 0;
  const httpOptions = { lookup: async () => [{ address: "8.8.8.8", family: 4 }], transport: async (target) => {
    requests++;
    assert.equal(target.hostname, http.control.domain);
    assert.equal(target.address, "8.8.8.8");
    assert.equal(target.path, "/.well-known/stellar-bazaar-provider.txt");
    return { status: 200, body: http.control.expectedRecord };
  } };
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "198.18.0.1", "::1"]) {
    await assert.rejects(verifySubmissionHttp(http.submissionId, { ...httpOptions, lookup: async () => [{address: "8.8.8.8", family: 4}, {address, family: address === "::1" ? 6 : 4}] }), /UNSAFE_PROOF_ADDRESS/);
  }
  assert.equal(requests, 0);
  await assert.rejects(verifySubmissionHttp(http.submissionId, { ...httpOptions, transport: async () => ({status: 302, body: ""}) }), /HTTP_PROOF_STATUS/);
  await assert.rejects(verifySubmissionHttp(http.submissionId, { ...httpOptions, transport: async () => ({status: 200, body: "x".repeat(4097)}) }), /HTTP_PROOF_TOO_LARGE/);
  await assert.rejects(verifySubmissionHttp(http.submissionId, { ...httpOptions, transport: async () => ({status: 200, body: "wrong"}) }), /CONTROL_PROOF_MISMATCH/);
  await assert.rejects(verifySubmissionHttp(http.submissionId, { ...httpOptions, timeoutMs: 5, transport: () => new Promise(() => {}) }), /HTTP_PROOF_TIMEOUT/);
  assert.equal((await verifySubmissionHttp(http.submissionId, httpOptions)).status, "pending-manual-review");
  await assert.rejects(activateSubmission(http.submissionId, { ...registry, configured: () => false }), /SERVICE_NOT_CONFIGURED/);

  const previewHost = 'provider-preview.vercel.app', previewSecret = 'synthetic-preview-bypass'.padEnd(43, 'x');
  const protectedProof = await submit('operator-protected-preview', 'http-well-known', previewHost);
  let previewDns = 0, previewRequests = 0;
  const protectedOptions = {
    lookup: async host => { previewDns++; assert.equal(host, previewHost); return [{address: '8.8.8.8', family: 4}]; },
    transport: async target => {
      previewRequests++;
      assert.equal(target.hostname, previewHost); assert.equal(target.address, '8.8.8.8');
      assert.equal(target.path, '/.well-known/stellar-bazaar-provider.txt'); assert.equal(target.maxBytes, 4096);
      assert.deepEqual(target.headers, {'x-vercel-protection-bypass': previewSecret});
      return {status: 200, body: protectedProof.control.expectedRecord};
    },
  };
  process.env.BAZAAR_PROVIDER_PREVIEW_HOST = previewHost;
  process.env.BAZAAR_PROVIDER_PREVIEW_BYPASS = previewSecret;
  for (const environment of ['production', 'development', undefined]) {
    if (environment) process.env.VERCEL_ENV = environment; else delete process.env.VERCEL_ENV;
    await assert.rejects(verifySubmissionHttp(protectedProof.submissionId, protectedOptions), /PROVIDER_PREVIEW_AUTH_UNAVAILABLE/);
  }
  process.env.VERCEL_ENV = 'preview';
  for (const [host, secret] of [[previewHost, ''], ['', previewSecret], [previewHost, 'invalid secret'], ['provider-preview.vercel.app.evil.example', previewSecret]]) {
    process.env.BAZAAR_PROVIDER_PREVIEW_HOST = host; process.env.BAZAAR_PROVIDER_PREVIEW_BYPASS = secret;
    await assert.rejects(verifySubmissionHttp(protectedProof.submissionId, protectedOptions), /PROVIDER_PREVIEW_AUTH_UNAVAILABLE/);
  }
  assert.equal(previewDns, 0); assert.equal(previewRequests, 0);
  assert.equal((await review.getSubmissionForOperator(protectedProof.submissionId)).value.status, 'awaiting-control-proof');
  process.env.BAZAAR_PROVIDER_PREVIEW_HOST = previewHost;
  process.env.BAZAAR_PROVIDER_PREVIEW_BYPASS = previewSecret;
  const publicProof = await submit('operator-preview-other-host', 'http-well-known');
  assert.equal((await verifySubmissionHttp(publicProof.submissionId, {
    lookup: async host => { assert.equal(host, publicProof.control.domain); return [{address: '8.8.8.8', family: 4}]; },
    transport: async target => {
      assert.equal(target.hostname, publicProof.control.domain); assert.equal(target.headers, undefined);
      return {status: 200, body: publicProof.control.expectedRecord};
    },
  })).status, 'pending-manual-review');
  await assert.rejects(verifySubmissionHttp(protectedProof.submissionId, {
    ...protectedOptions, lookup: async () => [{address: '127.0.0.1', family: 4}],
  }), /UNSAFE_PROOF_ADDRESS/);
  assert.equal(previewRequests, 0);
  assert.equal((await verifySubmissionHttp(protectedProof.submissionId, {
    ...protectedOptions,
    lookup: async host => {
      const addresses = await protectedOptions.lookup(host);
      // The accepted request configuration is captured before awaiting DNS.
      process.env.BAZAAR_PROVIDER_PREVIEW_BYPASS = 'different-synthetic-secret'.padEnd(43, 'x');
      return addresses;
    },
  })).status, 'pending-manual-review');
  assert.equal(previewDns, 1); assert.equal(previewRequests, 1);
  delete process.env.BAZAAR_PROVIDER_PREVIEW_HOST; delete process.env.BAZAAR_PROVIDER_PREVIEW_BYPASS;
  process.env.VERCEL_ENV = 'production';
  const productionPublic = await submit('operator-production-public', 'http-well-known');
  assert.equal((await verifySubmissionHttp(productionPublic.submissionId, {
    lookup: async () => [{address: '8.8.8.8', family: 4}],
    transport: async target => {
      assert.equal(target.headers, undefined);
      return {status: 200, body: productionPublic.control.expectedRecord};
    },
  })).status, 'pending-manual-review');
  console.log(JSON.stringify({ ok: true, externalCalls: 0, creates, dnsMismatch: true, dnsTimeout: true, explicitReview: true, concurrentActivation: true, lostResponseRecoveredWithoutReingest: true, previewBypassGuard: {productionRejectedBeforeDns: true, partialConfigurationRejected: true, exactHostOnly: true, pinnedAddressAndPath: true, headersCapturedBeforeDns: true, publicProductionUnchanged: true} }));
} finally {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  await rm(directory, { recursive: true, force: true });
}
