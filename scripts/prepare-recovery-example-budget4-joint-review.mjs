import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// This preparation reads only public local review artifacts. It does not read
// credentials, call a network service, initialize a ledger, or authorize effects.
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(code); };
const root = resolve(import.meta.dirname, '..');
const pins = {
  preview: 'eef893ca18a8cd38697336fcc8d134f371817f344fa00feb226274ad0bee7258',
  productionPrepared: 'b6266def82f2962eae943c04a01f28f63f11c66279edb83da71c2709d91b875d',
  provider: 'f87082dbb24b0f420cfecfc855b9a77c5995332623c5c9692d711eff30bdeee2',
};
async function artifact(path) {
  if (typeof path !== 'string' || !/^docs\/(?:release|evidence)\/[A-Za-z0-9_.-]+\.json$/.test(path)) fail('LOCAL_PUBLIC_REVIEW_PATH_REQUIRED');
  const bytes = await readFile(resolve(root, path));
  if (bytes.length > 1048576) fail('LOCAL_PUBLIC_REVIEW_BOUND');
  return { path, sha256: hash(bytes), value: JSON.parse(bytes.toString('utf8')) };
}
const [privateReviewPath, privateAuditPath, perimeterPath] = process.argv.slice(2);
if (!privateReviewPath || !privateAuditPath || !perimeterPath || process.argv.length !== 5) fail('THREE_FINAL_LOCAL_REVIEW_REFERENCES_REQUIRED');
const [privateReview, privateAudit, perimeter, preview, bazaarWaf, providerWaf, capacity, scopes, guardian, perimeterAudit, perimeterAmendment] = await Promise.all([
  artifact(privateReviewPath), artifact(privateAuditPath), artifact(perimeterPath),
  artifact('docs/evidence/recovery-example-budget4-preview-acceptance-2026-10-13.json'),
  artifact('docs/evidence/recovery-example-budget4-bazaar-preview-waf-restore-2026-10-13.json'),
  artifact('docs/evidence/recovery-example-budget4-provider-preview-waf-restore-2026-10-13.json'),
  artifact('docs/evidence/recovery-example-budget4-final-capacity-independent-review-local-2026-10-13.json'),
  artifact('docs/release/recovery-example-budget4-production-scopes-2026-10-13.json'),
  artifact('docs/evidence/recovery-example-guardian-real-lua-v4-completed-independent-review-local-2026-10-13.json'),
  artifact('docs/evidence/recovery-example-budget4-production-perimeter-recipe-local-2026-10-13.json'),
  artifact('docs/release/recovery-example-budget4-production-perimeter-budget-scope-amendment-2026-10-13.json'),
]);
const r = privateReview.value;
if (r.finalPreviewSource !== pins.preview || r.finalProductionSource !== pins.productionPrepared || r.providerSource !== pins.provider || r.management.commands !== 128 || r.management.transferBytes !== 17039360 || r.management.plannedLogicalAdministrativeExchanges !== 20 || r.productionAcceptance !== false || r.proposedCapApplied !== false || r.payments !== 0 || r.providerExecutions !== 0) fail('FINAL_PRIVATE_REVIEW_REQUIRED');
if (privateAudit.value.status !== 'PASS_LOCAL_FINAL_NOPERM_DELTA_AND_WORKER_ONLY_CREDENTIAL_RECIPIENT' || !privateAudit.value.receiptPins.some(v => v.path === privateReview.path && v.sha256 === privateReview.sha256) || privateAudit.value.management.commands !== 128 || privateAudit.value.management.transferBytes !== 17039360 || privateAudit.value.isolation.http401RejectedBeforeInterpretation !== true) fail('EXACT_FINAL_INDEPENDENT_PRIVATE_REVIEW_REQUIRED');
if (r.preparedScopeNames.path !== scopes.path || r.preparedScopeNames.sha256 !== scopes.sha256 || r.isolationResponseContract.requiredPrefix !== 'NOPERM followed by a word boundary (case-insensitive)') fail('EXACT_FINAL_SCOPE_AND_NOPERM_CONTRACT_REQUIRED');
for (const [path, expected] of Object.entries(r.codeSha256)) {
  if (!/^(?:scripts|lib)\/[A-Za-z0-9_.-]+\.(?:mjs|ts)$/.test(path) || hash(await readFile(resolve(root, path))) !== expected) fail('FINAL_PRIVATE_HELPER_CHANGED');
}
if (hash(await readFile(resolve(root, '.vercel/recovery-example-production-provider-staging-v4.mjs'))) !== r.stagingAdapterSha256 || hash(await readFile(resolve(root, '.vercel/recovery-example-production-private-bootstrap-v4.ps1'))) !== r.wrapperSha256) fail('FINAL_PRIVATE_ADAPTER_CHANGED');
if (preview.value.status !== 'PASS_PROTECTED_V4_EXISTING_ORDER_ACCEPTANCE' || preview.value.sourceDigest !== pins.preview || preview.value.checks !== 23 || preview.value.httpRequests !== 20) fail('ACCEPTED_PREVIEW_REQUIRED');
if ([bazaarWaf, providerWaf].some(v => v.value.status !== 'PASS_ORIGINAL_FIREWALL_RESTORED' || v.value.productionPerimeterChanged !== false || v.value.payments !== 0)) fail('RESTORED_PREVIEW_PERIMETER_REQUIRED');
if (capacity.value.status !== 'PASS_V3_FINITE_GUARDIAN_FRESH_ARITHMETIC_ONLY' || capacity.value.calculation.requiredTotalWithOldUsageAndHolds !== 9883977216 || capacity.value.calculation.proposedInternalCapBytes !== 9900000000) fail('RETAINED_FULL_CAPACITY_FORECAST_REQUIRED');
if (guardian.value.review.status !== 'PASS_INDEPENDENT_RETAINED_REAL_REDIS_GUARDIAN_LUA_V4_REVIEW' || guardian.value.review.aggregate.commandsUpper !== 146 || guardian.value.review.aggregate.bytes !== 95032) fail('RETAINED_REAL_LUA_REQUIRED');
if (perimeter.value.status !== 'LOCAL_CONDITIONAL_REBASE_RECIPE_NOT_APPLIED' || perimeter.value.sourceBindings.bazaarProduction !== pins.productionPrepared || perimeter.value.sourceBindings.exampleProvider !== pins.provider || perimeter.value.pureRecipe !== 'scripts/recovery-example-budget4-production-perimeter-recipe.mjs' || perimeterAudit.value.status !== 'PASS_LOCAL_CONDITIONAL_V4_PERIMETER_RECIPE' || perimeterAudit.value.checks !== 26 || perimeterAudit.value.matrixCases !== 864 || hash(await readFile(resolve(root, perimeter.value.pureRecipe))) !== perimeterAudit.value.sourceSha256) fail('TESTED_LOCAL_PERIMETER_RECIPE_REQUIRED');
// Independent audit and conditional perimeter recipe remain explicit references;
// they are not mistaken for authorization or live Production acceptance.
const record = {
  schema: 'bazaar.example-budget4-joint-review/v1',
  status: 'PREPARED_CONDITIONAL_RESTRICTED_PRODUCTION_REVIEW_NOT_AUTHORIZATION',
  preparedAt: new Date().toISOString(), sourceDigests: pins,
  currentProduction: {
    bazaar: { deploymentId: 'dpl_2kx2wwhZHpXSXeDQc96qCc83H3tY', sourceDigest: '3c3fe5ad3dc886e770c5aec1e1cee2762686558036c3bf55ec310899a35173ed' },
    guion: { deploymentId: 'dpl_59zNf8MCvktnzTgci3eppUriS2Un', sourceDigest: '9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232' },
    proof: 'Retained metadata and restore receipts; require fresh reads before effects.',
  },
  references: [privateReview, privateAudit, perimeter, preview, bazaarWaf, providerWaf, capacity, scopes, guardian, perimeterAudit, perimeterAmendment].map(({ path, sha256 }) => ({ path, sha256 })),
  configuration: {
    upstash: 'Free', network: 'stellar:testnet', mcpPath: '/api/mcp', retentionDays: 7,
    admission: 'existing acceptance buyer only', fileDeliveryEnabled: false,
    providerMode: 'on-demand', providerCrons: [],
    bazaarGuardian: { path: '/api/market/guardian/tick', schedule: '0 * * * *', maximumFullAttemptsPer32Days: 2 },
    proposedExampleTransferCapBytes: 9900000000, proposedCapApplied: false,
    currentGenericTransferCapLineageBytes: 8500000000, currentGenericFlagPreserved: true,
    oldConsumptionAndHolds: 'preserved without reset, release or resizing',
    uncertainOriginalOperation: '31c97193-be74-4b9d-b0a3-f3890b0a41e8',
  },
  futureJointPackage: {
    newNativeSellerAccounts: 1, newWorkerAclUsers: 1, remoteWorkerPrefixCount: 2,
    newSensitiveVariableNames: r.newSensitiveKeys,
    providerStagedVersionsMaximum: 1, providerPromotionsMaximum: 0,
    providerAdditionalOrigin: 'https://ai-video-scriptwriter-example.vercel.app',
    bazaarStagedVersionsMaximum: 1, bazaarPromotionsMaximum: 1,
    freshQuotaAndMetadataBeforeEffects: true, conditionalExactPerimeterRebase: true,
    managementCreditScope: 'The 20 exchanges / 128 commands / 17039360 bytes cover private bootstrap only. The pure perimeter recipe grants no additional credit.',
    originalGuionDeploymentAndAliasPreserved: true,
    generalPurchasesEnabled: false, newOrders: 0, signatures: 0, payments: 0, providerExecutions: 0,
    subscriptionsChanged: false, vercelBudgetsChanged: false,
  },
  gatesNotYetAccepted: [
    'Human approval of this exact conditional joint package.',
    'Fresh shared Free quota and native ledgers still fit the complete forecast and safety margin.',
    'Existing private provenance, immutable sources, complete project env metadata and collision-free new keys.',
    'Exact remote worker ACL and explicit NOPERM; no native/main token forwarded to worker.',
    'Actual DNS/control/public liveness and capacity of the newly staged provider without Preview bypass.',
    'Fresh WAF baseline, effective Production configuration and conditional Bazaar handover.',
    'Separate approval and acceptance of one new example Testnet purchase before general opening.',
  ],
  preparationEffects: { networkRequests: 0, credentialsRead: 0, cloudWrites: 0, limitsChanged: false, productionPublished: false, payments: 0 },
};
const output = 'docs/release/recovery-example-budget4-restricted-production-review-2026-10-13.json';
const bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
await writeFile(resolve(root, output), bytes, { flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS_LOCAL_JOINT_REVIEW_REFERENCES_SEALED', output, sha256: hash(bytes), remoteEffects: 0, productionAcceptance: false }));
