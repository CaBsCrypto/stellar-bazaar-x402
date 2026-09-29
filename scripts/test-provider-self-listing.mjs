import { createHash, randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import {
  canonicalCardHash,
  getSubmissionForOperator,
  getSubmissionStatus,
  listManualReviewQueue,
  listStagedNotPublic,
  recordControlProofResult as recordProof,
  recordManualReview,
  resetSelfListingStateForTests,
  stageApprovedSubmission,
  submitProviderDraft as submit,
} from "../lib/provider-self-listing.ts";

const card = (id = "self-listing-test") => ({
  version: "bazaar.service-card/v0", id, name: "Provider test", description: "Deterministic provider submission fixture.",
  kind: "http", url: "https://api.provider.example.com", routeTemplate: "/v1/quote/{pair}",
  input: [{ name: "pair", type: "string", required: true }], network: "stellar:testnet",
  payment: { scheme: "exact", asset: "USDC", amount: "0.001", destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
  provider: { name: "Untrusted fixture" }, tags: ["fixture"],
});

await resetSelfListingStateForTests();
const tokens=new Map();
async function recordControlProofResult(id,proof){const s=(await getSubmissionForOperator(id)).value;return recordProof(id,{...proof,observedAt:new Date().toISOString(),source:s.control.method,cardHash:canonicalCardHash(s.card),challengeHash:createHash("sha256").update(s.control.expectedRecord).digest("hex")});}
async function submitProviderDraft(card,control){const options={submissionId:randomUUID(),submissionToken:randomBytes(32).toString("hex")};tokens.set(options.submissionId,options.submissionToken);return submit(card,control,options); }
delete process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE;
assert.equal((await submitProviderDraft(card(), { method: "dns-txt", domain: "api.provider.example.com" })).error.code, "INTAKE_DISABLED");

process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE = "true";
assert.equal((await submitProviderDraft({ nope: true }, { method: "dns-txt", domain: "api.provider.example.com" })).error.code, "INVALID_SUBMISSION");
assert.equal((await submitProviderDraft(card(), { method: "email", domain: "api.provider.example.com" })).error.code, "INVALID_SUBMISSION");
for (const domain of [123, {}, [], null]) {
  assert.equal((await submitProviderDraft(card(), { method: "dns-txt", domain })).error.code, "DOMAIN_CONTROL_MISMATCH");
}
assert.equal((await submitProviderDraft(card(), { method: "dns-txt", domain: "evil.example.com" })).error.code, "DOMAIN_CONTROL_MISMATCH");
assert.equal((await submitProviderDraft({ ...card(), url: "https://127.0.0.1" }, { method: "dns-txt", domain: "127.0.0.1" })).error.code, "DOMAIN_CONTROL_MISMATCH");

const created = await submitProviderDraft(card(), { method: "dns-txt", domain: "api.provider.example.com" });
assert.equal(created.ok, true);
const submission = created.value;
assert.equal(submission.status, "awaiting-control-proof");
assert.equal(submission.publiclyActive, false);
assert.equal((await submitProviderDraft(card(), { method: "dns-txt", domain: "api.provider.example.com" })).error.code, "DUPLICATE_SUBMISSION");
assert.equal((await recordManualReview(submission.submissionId, { decision: "approve", reviewerId: "reviewer", reasons: ["ok"] })).error.code, "INVALID_TRANSITION");
assert.equal((await recordControlProofResult(submission.submissionId, { challengeId: "wrong", domain: submission.control.domain, verified: true })).error.code, "CONTROL_PROOF_MISMATCH");

const proven = (await recordControlProofResult(submission.submissionId, { challengeId: submission.control.challengeId, domain: submission.control.domain, verified: true }));
assert.equal(proven.value.status, "pending-manual-review");
assert.equal((await stageApprovedSubmission(submission.submissionId)).error.code, "INVALID_TRANSITION");
assert.equal((await recordManualReview(submission.submissionId, { decision: "approve", reviewerId: "", reasons: [] })).error.code, "INVALID_SUBMISSION");
const approved = (await recordManualReview(submission.submissionId, { decision: "approve", reviewerId: "operator-1", reasons: ["Control and conformance reviewed"] }));
assert.equal(approved.value.status, "approved-for-staging");
const staged = (await stageApprovedSubmission(submission.submissionId));
assert.equal(staged.value.status, "staged-not-public");
assert.equal(staged.value.publiclyActive, false);
assert.equal((await listStagedNotPublic()).length, 1);
assert.equal((await listManualReviewQueue()).length, 1);

const publicStatus = (await getSubmissionStatus(submission.submissionId, tokens.get(submission.submissionId)));
assert.equal(publicStatus.ok, true);
assert.equal("card" in publicStatus.value, false);
assert.equal("conformance" in publicStatus.value, false);

const rejected = await submitProviderDraft(card("rejected-test"), { method: "http-well-known", domain: "api.provider.example.com" });
(await recordControlProofResult(rejected.value.submissionId, { challengeId: rejected.value.control.challengeId, domain: rejected.value.control.domain, verified: true }));
assert.equal((await recordManualReview(rejected.value.submissionId, { decision: "reject", reviewerId: "operator-2", reasons: ["Endpoint policy mismatch"] })).value.status, "rejected");

const failedControl = await submitProviderDraft(card("failed-control-test"), { method: "dns-txt", domain: "api.provider.example.com" });
const failed = (await recordControlProofResult(failedControl.value.submissionId, { challengeId: failedControl.value.control.challengeId, domain: failedControl.value.control.domain, verified: false }));
assert.equal(failed.value.status, "rejected");
assert.equal(failed.value.control.status, "failed");
assert.equal(failed.value.publiclyActive, false);
assert.equal((await recordManualReview(failed.value.submissionId, { decision: "approve", reviewerId: "operator-3", reasons: ["Cannot bypass failed control"] })).error.code, "INVALID_TRANSITION");
assert.equal((await stageApprovedSubmission(failed.value.submissionId)).error.code, "INVALID_TRANSITION");

// Each transition must check expiry itself, without a preceding status/list call.
for (const phase of ["proof", "review", "stage"]) {
  const pending = await submitProviderDraft(card(`expired-${phase}`), { method: "dns-txt", domain: "api.provider.example.com" });
  const s = pending.value;
  const proof = { challengeId: s.control.challengeId, domain: s.control.domain, verified: true };
  const review = { decision: "approve", reviewerId: "test-operator", reasons: ["Synthetic evidence"] };
  if (phase !== "proof") (await recordControlProofResult(s.submissionId, proof));
  if (phase === "stage") (await recordManualReview(s.submissionId, review));
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse(s.expiresAt) + 1;
    const result = phase === "proof" ? (await recordControlProofResult(s.submissionId, proof))
      : phase === "review" ? (await recordManualReview(s.submissionId, review)) : (await stageApprovedSubmission(s.submissionId));
    assert.equal(result.error.code, "INVALID_TRANSITION");
    assert.equal((await getSubmissionStatus(s.submissionId, tokens.get(s.submissionId))).value.status, "expired");
  } finally { Date.now = originalNow; }
}
console.log(JSON.stringify({ ok: true, malformedDomains: 4, expiredTransitions: 3, lifecycle: ["draft", "control-proof", "manual-review", "staged-not-public"], automaticActivation: false }, null, 2));
