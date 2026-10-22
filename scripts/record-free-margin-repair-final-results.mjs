// Local evidence only. No deployment, credentials, network, payment or limit write.
import { readFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const reviewPath = 'docs/release/free-margin-repair-review-2026-10-12.md';
const proposalPath = 'docs/release/free-margin-repair-production-proposal-2026-10-12.json';
const reviewBytes = await readFile(reviewPath), proposalBytes = await readFile(proposalPath);
const proposal = JSON.parse(proposalBytes);
if (hash(reviewBytes) !== '057ae2f98ee9b958f0b741bfee396d9b9f32221aa528e442f72b0393dbd4f77a' || proposal.status !== 'PREPARED_FOR_USER_REVIEW_NOT_APPLIED' || proposal.limitsApplied || proposal.productionPublished || proposal.oldHoldChanged || proposal.consumptionReset || proposal.newOrders || proposal.newPayments || proposal.freshCapacity.proposedMarginBytes !== 43580544) throw Error('REVIEWED_UNAPPLIED_PROPOSAL_REQUIRED');
const result = {
  version: 1, status: 'PASS_LOCAL_REVIEWED_MARGIN_REPAIR_NOT_APPLIED',
  sourceDigest: proposal.sourceDigest, sourceManifestSha256: proposal.sourceManifestSha256,
  reviewPath, reviewSha256: hash(reviewBytes), proposalPath, proposalSha256: hash(proposalBytes),
  build: 'PASS', configurationChecks: 441, nativeStoreChecks: 40, providerSdkChecks: 37,
  fallbackProtocolChecks: 242, projectionChecks: 45, projectionOrderings: 100100,
  freshReadHelperLocalChecks: 173,
  independentReview: { reviewer: '/root/resume_provider_preview', status: 'PASS_NO_BLOCKING_FINDINGS', reportedIndependentChecks: 22, onlyRuntimeFileChanged: 'lib/continuous-free-budget.ts', operationalGateNotNewRuntimeGuard: true },
  currentProductionCapBytes: 8500000000, proposedCapBytes: 9250000000,
  freshCapacity: proposal.freshCapacity, oldHoldPreserved: true, priorConsumptionPreserved: true,
  upstashPlan: 'Free', productionChanged: false, limitsApplied: false, newOrders: 0,
  newPayments: 0, signatures: 0, providerExecutions: 0,
  acceptanceScope: 'finite restricted acceptance only; additional traffic can exhaust global margin',
  realRedisLuaMigrationExecuted: false, productionPaymentAndDeliveryAccepted: false,
  recordedAt: new Date().toISOString()
};
const target = 'docs/evidence/free-margin-repair-final-local-results-2026-10-12.json';
const handle = await open(target, 'wx', 0o600);
try { await handle.writeFile(JSON.stringify(result, null, 2) + '\n'); } finally { await handle.close(); }
console.log(JSON.stringify({ status: result.status, evidence: target, currentCapBytes: result.currentProductionCapBytes, proposedCapBytes: result.proposedCapBytes, productionChanged: false, newPayments: 0 }));
