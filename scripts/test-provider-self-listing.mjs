import assert from "node:assert/strict";
import {
  getSubmissionStatus,
  listManualReviewQueue,
  listStagedNotPublic,
  recordControlProofResult,
  recordManualReview,
  resetSelfListingStateForTests,
  stageApprovedSubmission,
  submitProviderDraft,
} from "../lib/provider-self-listing.ts";

const card = (id = "self-listing-test") => ({
  version: "bazaar.service-card/v0", id, name: "Provider test", description: "Deterministic provider submission fixture.",
  kind: "http", url: "https://api.provider.example.com", routeTemplate: "/v1/quote/{pair}",
  input: [{ name: "pair", type: "string", required: true }], network: "stellar:testnet",
  payment: { scheme: "exact", asset: "USDC", amount: "0.001", destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
  provider: { name: "Untrusted fixture" }, tags: ["fixture"],
});

resetSelfListingStateForTests();
delete process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE;
assert.equal((await submitProviderDraft(card(), { method: "dns-txt", domain: "api.provider.example.com" })).error.code, "INTAKE_DISABLED");

process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE = "true";
assert.equal((await submitProviderDraft({ nope: true }, { method: "dns-txt", domain: "api.provider.example.com" })).error.code, "INVALID_SUBMISSION");
assert.equal((await submitProviderDraft(card(), { method: "email", domain: "api.provider.example.com" })).error.code, "INVALID_SUBMISSION");
assert.equal((await submitProviderDraft(card(), { method: "dns-txt", domain: "evil.example.com" })).error.code, "DOMAIN_CONTROL_MISMATCH");
assert.equal((await submitProviderDraft({ ...card(), url: "https://127.0.0.1" }, { method: "dns-txt", domain: "127.0.0.1" })).error.code, "DOMAIN_CONTROL_MISMATCH");

const created = await submitProviderDraft(card(), { method: "dns-txt", domain: "api.provider.example.com" });
assert.equal(created.ok, true);
const submission = created.value;
assert.equal(submission.status, "awaiting-control-proof");
assert.equal(submission.publiclyActive, false);
assert.equal((await submitProviderDraft(card(), { method: "dns-txt", domain: "api.provider.example.com" })).error.code, "DUPLICATE_SUBMISSION");
assert.equal(recordManualReview(submission.submissionId, { decision: "approve", reviewerId: "reviewer", reasons: ["ok"] }).error.code, "INVALID_TRANSITION");
assert.equal(recordControlProofResult(submission.submissionId, { challengeId: "wrong", domain: submission.control.domain, verified: true }).error.code, "CONTROL_PROOF_MISMATCH");

const proven = recordControlProofResult(submission.submissionId, { challengeId: submission.control.challengeId, domain: submission.control.domain, verified: true });
assert.equal(proven.value.status, "pending-manual-review");
assert.equal(stageApprovedSubmission(submission.submissionId).error.code, "INVALID_TRANSITION");
assert.equal(recordManualReview(submission.submissionId, { decision: "approve", reviewerId: "", reasons: [] }).error.code, "INVALID_SUBMISSION");
const approved = recordManualReview(submission.submissionId, { decision: "approve", reviewerId: "operator-1", reasons: ["Control and conformance reviewed"] });
assert.equal(approved.value.status, "approved-for-staging");
const staged = stageApprovedSubmission(submission.submissionId);
assert.equal(staged.value.status, "staged-not-public");
assert.equal(staged.value.publiclyActive, false);
assert.equal(listStagedNotPublic().length, 1);
assert.equal(listManualReviewQueue().length, 1);

const publicStatus = getSubmissionStatus(submission.submissionId);
assert.equal(publicStatus.ok, true);
assert.equal("card" in publicStatus.value, false);
assert.equal("conformance" in publicStatus.value, false);

const rejected = await submitProviderDraft(card("rejected-test"), { method: "http-well-known", domain: "api.provider.example.com" });
recordControlProofResult(rejected.value.submissionId, { challengeId: rejected.value.control.challengeId, domain: rejected.value.control.domain, verified: true });
assert.equal(recordManualReview(rejected.value.submissionId, { decision: "reject", reviewerId: "operator-2", reasons: ["Endpoint policy mismatch"] }).value.status, "rejected");

console.log(JSON.stringify({ ok: true, negativeCases: 8, lifecycle: ["draft", "control-proof", "manual-review", "staged-not-public"], automaticActivation: false }, null, 2));
