import assert from 'node:assert/strict';
import {createCipheriv, createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {sellerCanonical} from '../examples/seller-service-card.mjs';
import {EXAMPLE_PREVIEW as P} from './recovery-example-preview-lib.mjs';
import {exampleBudgetReadLayout} from '../.vercel/recovery-example-preview-budget-read.mjs';
import {amendExampleCheckpointRead, correctedExampleCheckpoint} from '../.vercel/recovery-example-preview-checkpoint-amend-read.mjs';

const hash = value => createHash('sha256').update(value).digest('hex'), copy = structuredClone, now = Date.now();
const family = 'pilot-' + 'a'.repeat(32), operationId = '10000000-0000-4000-8000-000000000001';
const profile = {purpose: 'bazaar-recovery-example-preview-v1', phase: 'native-ready', family, scopedNativeToken: 'PRIVATE_SYNTHETIC_NATIVE_TOKEN', scopedToken: 'PRIVATE_SYNTHETIC_WORKER_TOKEN', storeKey: Buffer.alloc(32, 8).toString('base64url'), workerPrefix: 'bazaar-seller:preview-' + family.slice(6), runtimePrefix: 'bazaar-seller:preview-' + hash('runtime:' + family.slice(6)).slice(0, 32), workerBinding: 'b'.repeat(64), runtimeBinding: hash(sellerCanonical({role: 'recovery-example-runtime/v1', workerBinding: 'b'.repeat(64)})), cardHash: 'c'.repeat(64), seller: {receipt: {ownerId: 'ow_' + '1'.repeat(32), agentId: 'agent_' + '1'.repeat(32)}}, buyer: {receipt: {ownerId: 'ow_' + '2'.repeat(32)}}, operationId, acceptance: {order: {phase: 'created', operationId}}, deployments: {bazaar: {phase: 'ready', alias: P.bazaarAlias, sourceDigest: '8181954b49bcb0e9bbb5a75d65de60c14c5e50dece60d9cea6e7f3d2df16094e', project: P.bazaarProject}, provider: {phase: 'ready', alias: P.providerAlias, sourceDigest: 'bc3a348d63002a3625ea6ac0fa97312ddc2753439dec40b9e9180eefff78ea9f', project: P.providerProject}}};
const layout = exampleBudgetReadLayout(profile);
const creationProof = {status: 'PASS_PROTECTED_RECOVERY_EXAMPLE_PREVIEW_RUN', operationFingerprint: hash(operationId), cardHash: profile.cardHash, source: {bazaar: profile.deployments.bazaar.sourceDigest, provider: profile.deployments.provider.sourceDigest}, orderCreatedUnpaid: true, automaticReadinessObserved: true, providerExecutions: 0, creationRequestsThisRun: 1, observedAt: new Date(now - 10000).toISOString(), checks: ['ONE_REAL_UNPAID_ORDER_CREATED_WITH_AUTOMATIC_READINESS', ...Array.from({length: 21}, (_, i) => 'OTHER_' + i)]};
const checkpoint = {version: 1, bindingHash: profile.workerBinding, day: new Date(now - 1000).toISOString().slice(0, 10), ticks: 1, providerRequests: 0, executed: 0, mcpRequests: 5, lastObservedAt: now - 1000, cursor: null, pending: [], retryAt: 0, capacityReport: null};
const prior = {status: 'PASS_GET_ONLY_PROTECTED_EXAMPLE_PREVIEW_BUDGET', familyFingerprint: hash(family), operationFingerprint: hash(operationId), redisGets: 10, redisWrites: 0, originalFinancialJournalUnchanged: true};
function seal(value) {const iv = Buffer.alloc(12, 4), cipher = createCipheriv('aes-256-gcm', Buffer.from(profile.storeKey, 'base64url'), iv); cipher.setAAD(Buffer.from(layout.keys.checkpointData)); const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value))), cipher.final()]); return JSON.stringify({v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url')});}
function fixture(raw = seal(checkpoint)) {let reads = 0; return {get reads() {return reads;}, options: {getCommand: async values => {reads++; assert.deepEqual(values, ['GET', layout.keys.checkpointData]); return raw;}, prior, creationProof, now: () => now, checkOriginal: async () => true}};}
let checks = 0;
const check = (value, message) => {assert.ok(value, message); checks++;};
const oldFetch = globalThis.fetch;
globalThis.fetch = () => assert.fail('REMOTE_ACCESS_FORBIDDEN');
try {
  const observation = correctedExampleCheckpoint(checkpoint, profile, creationProof, now);
  check(observation.pendingCapacityReport === null && observation.pendingCapacityReportShape === 'null', 'actual null report represents no pending intention');
  check(observation.checkpointCapacityReportNullAfterAckIsNormal, 'acknowledged capacity intention is normally cleared');
  check(!Object.hasOwn(observation, 'capacityReportedReady') && !Object.hasOwn(observation, 'availabilityLeaseFreshAtRead'), 'no misleading false readiness fields survive');
  check(observation.currentReadinessNotDerivedFromCheckpoint && observation.historicalReadinessDoesNotProveCurrentAdmission, 'checkpoint does not claim current marketplace capacity');
  check(observation.reportedReadinessVerifiedByActualUnpaidCreation && observation.executed === 0, 'historical bound unpaid creation confirms readiness without executing');
  const pending = {...checkpoint, capacityReport: {ready: true, usedToday: 0, observedAt: new Date(now - 1000).toISOString(), reportId: 'private-id'}};
  const pendingView = correctedExampleCheckpoint(pending, profile, creationProof, now);
  check(pendingView.pendingCapacityReportShape === 'object' && pendingView.pendingCapacityReport.ready === true && !Object.hasOwn(pendingView.pendingCapacityReport, 'reportId'), 'unacknowledged intent is sanitized and kept distinct');
  const absent = copy(checkpoint); delete absent.capacityReport;
  check(correctedExampleCheckpoint(absent, profile, creationProof, now).pendingCapacityReportShape === 'absent', 'absent metadata is distinct from an explicit null acknowledgement');
  const f = fixture(); let oldCipherChecks = 0, intent;
  const receipt = await amendExampleCheckpointRead(profile, {...f.options, checkOriginal: async () => {oldCipherChecks++; return true;}, beforeRead: async value => {intent = value;}});
  check(receipt.additionalGetReads === 1 && receipt.priorGetReads === 10 && f.reads === 1, 'one extra GET does not repeat the previous ten');
  check(receipt.cumulativeGetReadsForTheseTwoObservations === 11 && receipt.priorReceiptPreserved, 'previous observation remains append-only and cumulative accounting is honest');
  check(intent.checkpointKeyFingerprint === hash(layout.keys.checkpointData) && oldCipherChecks === 2, 'read intent and old cipher are checked without identifiers or decryption');
  const output = JSON.stringify(receipt);
  for (const forbidden of [profile.scopedToken, profile.scopedNativeToken, profile.storeKey, profile.family, operationId, profile.seller.receipt.ownerId, profile.buyer.receipt.ownerId, layout.keys.checkpointData]) check(!output.includes(forbidden), 'no secret or raw private index in output');
  for (const mutate of [value => value.operationFingerprint = '0'.repeat(64), value => value.cardHash = '0'.repeat(64), value => value.providerExecutions = 1, value => value.orderCreatedUnpaid = false, value => value.checks.pop(), value => value.creationRequestsThisRun = 2, value => value.source.bazaar = '0'.repeat(64), value => value.observedAt = 'invalid']) {const bad = copy(creationProof); mutate(bad); const sample = fixture(); await assert.rejects(amendExampleCheckpointRead(profile, {...sample.options, creationProof: bad}), /READINESS_PROOF/); check(sample.reads === 0, 'invalid local proof rejected before Redis');}
  const wrongPrior = fixture(); await assert.rejects(amendExampleCheckpointRead(profile, {...wrongPrior.options, prior: {...prior, redisGets: 9}}), /TEN_GET/); check(wrongPrior.reads === 0, 'incorrect prior receipt rejected before read');
  const missing = fixture(null); await assert.rejects(amendExampleCheckpointRead(profile, missing.options), /ONLY_ONE_EXACT/); check(missing.reads === 1, 'missing checkpoint cannot issue a second guard GET');
  const corrupt = fixture('{}'); await assert.rejects(amendExampleCheckpointRead(profile, corrupt.options)); check(corrupt.reads === 1, 'invalid cipher does not retry');
  const executed = fixture(seal({...checkpoint, executed: 1, providerRequests: 1})); await assert.rejects(amendExampleCheckpointRead(profile, executed.options), /ZERO_EXECUTION/); check(executed.reads === 1, 'execution mismatch rejected');
  const blocked = fixture(); await assert.rejects(amendExampleCheckpointRead(profile, {...blocked.options, beforeRead: async () => {throw Error('INTENT_BLOCKED');}}), /INTENT_BLOCKED/); check(blocked.reads === 0, 'intent rejection prevents all Redis reads');
  const changed = fixture(); await assert.rejects(amendExampleCheckpointRead(profile, {...changed.options, checkOriginal: async () => false}), /CIPHER/); check(changed.reads === 0, 'original cipher mismatch prevents read');
  for (const flag of ['priorNativeBudgetAndHoldObservedAgain', 'currentMarketplaceCapacityQueried', 'readinessInvoked', 'redisWrites', 'evalCalls', 'scans', 'productionDataQueried', 'productionPublished', 'productionLimitsChanged', 'productionReservationsChanged', 'payments', 'signatures', 'settlements', 'cronActivated']) check(!receipt[flag], 'amendment changes interpretation only');
  const paths = ['.vercel/recovery-example-preview-checkpoint-amend-read.mjs', 'scripts/test-recovery-example-preview-checkpoint-amend-read.mjs', '.vercel/recovery-example-preview-budget-read.mjs'];
  const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(path))])));
  const evidence = {status: 'PASS_LOCAL_ONE_GET_CHECKPOINT_INTERPRETATION_AMENDMENT', observedAt: new Date().toISOString(), checks, sourceHashes, additionalGetMaximum: 1, priorReceiptOrSourceRewritten: false, acknowledgementNullIsNotOutage: true, originalCipherCheckedViaInjectedBooleanOnly: true, dpapiOpened: false, remoteRequests: 0, productionChanged: false, payments: 0};
  if (process.argv[2] === '--write-evidence') await writeFile('docs/evidence/recovery-example-preview-checkpoint-amend-reader-local-2026-10-12.json', JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify(evidence));
} finally {globalThis.fetch = oldFetch;}
