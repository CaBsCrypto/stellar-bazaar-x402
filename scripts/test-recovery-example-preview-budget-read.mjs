import assert from 'node:assert/strict';
import {createCipheriv, createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {sellerCanonical} from '../examples/seller-service-card.mjs';
import {EXAMPLE_PREVIEW as P} from './recovery-example-preview-lib.mjs';
import * as reader from '../.vercel/recovery-example-preview-budget-read.mjs';

const hash = value => createHash('sha256').update(value).digest('hex'), now = Date.now(), copy = structuredClone;
const oldFetch = globalThis.fetch;
globalThis.fetch = () => assert.fail('REMOTE_ACCESS_FORBIDDEN');
const operationId = '10000000-0000-4000-8000-000000000001';
const profile = {purpose: 'bazaar-recovery-example-preview-v1', phase: 'native-ready', family: 'pilot-' + 'a'.repeat(32), scopedNativeToken: 'PRIVATE_SYNTHETIC_NATIVE_TOKEN', scopedToken: 'PRIVATE_SYNTHETIC_WORKER_TOKEN', storeKey: Buffer.alloc(32, 8).toString('base64url'), workerPrefix: 'bazaar-seller:preview-' + 'a'.repeat(32), runtimePrefix: 'bazaar-seller:preview-' + hash('runtime:' + 'a'.repeat(32)).slice(0, 32), workerBinding: 'b'.repeat(64), runtimeBinding: hash(sellerCanonical({role: 'recovery-example-runtime/v1', workerBinding: 'b'.repeat(64)})), seller: {receipt: {ownerId: 'ow_' + '1'.repeat(32), agentId: 'agent_' + '1'.repeat(32)}}, buyer: {receipt: {ownerId: 'ow_' + '2'.repeat(32)}}, operationId, acceptance: {order: {phase: 'created', operationId}}, deployments: {bazaar: {phase: 'ready', alias: P.bazaarAlias, sourceDigest: '8181954b49bcb0e9bbb5a75d65de60c14c5e50dece60d9cea6e7f3d2df16094e', project: P.bazaarProject}, provider: {phase: 'ready', alias: P.providerAlias, sourceDigest: 'bc3a348d63002a3625ea6ac0fa97312ddc2753439dec40b9e9180eefff78ea9f', project: P.providerProject}}};
const layout = reader.exampleBudgetReadLayout(profile);
function checkpoint() {return {version: 1, bindingHash: profile.workerBinding, day: new Date(now - 1000).toISOString().slice(0, 10), ticks: 1, providerRequests: 0, executed: 0, mcpRequests: 5, lastObservedAt: now - 1000, cursor: null, pending: [], retryAt: 0, identityCache: {ownerId: profile.seller.receipt.ownerId, agentId: profile.seller.receipt.agentId, generation: 1, network: 'stellar:testnet', observedAt: now - 1000, expiresAt: now - 1000 + 1800000}, capacityReport: {reportId: '20000000-0000-4000-8000-000000000001', ready: true, usedToday: 0, observedAt: new Date(now - 1000).toISOString()}};}
function seal(value) {
  const iv = Buffer.alloc(12, 3), cipher = createCipheriv('aes-256-gcm', Buffer.from(profile.storeKey, 'base64url'), iv);
  cipher.setAAD(Buffer.from(layout.keys.checkpointData)); const content = Buffer.from(JSON.stringify(value));
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  return JSON.stringify({v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: encrypted.toString('base64url')});
}
function ledger() {return {version: 2, configuration: layout.configuration.configurationId, last: now - 1000, buckets: [{day: Math.floor((now - 1000) / 86400000), used: {public: 100, authenticated: 200, recovery: 300, background: 1004}, bytes: 2500000000}], held: [{operationId, principalHash: hash(profile.buyer.receipt.ownerId), recoveryCommands: 12000, backgroundCommands: 4000, transferBytes: 2000000000}]};}
function fixture() {
  const rawCheckpoint = seal(checkpoint()), values = new Map([
    [layout.keys.budget, JSON.stringify(ledger())], [layout.keys.nativeStorage, JSON.stringify({version: 1, scope: profile.family, initialized: true, entries: {[layout.reservationHash]: {bytes: 0, reserved: 20000000}, ['c'.repeat(64)]: {bytes: 5000, reserved: 0}}})],
    [layout.keys.workerStorage, JSON.stringify({version: 1, binding: profile.workerBinding, initialized: true, entries: {[hash(layout.keys.checkpointData)]: {bytes: Buffer.byteLength(rawCheckpoint) + Buffer.byteLength(layout.keys.checkpointData), expiresAt: 0}}})], [layout.keys.runtimeStorage, JSON.stringify({version: 1, binding: profile.runtimeBinding, initialized: true, entries: {}})], [layout.keys.checkpointData, rawCheckpoint],
  ]), commands = [];
  const command = role => async valuesCommand => {assert.equal(valuesCommand[0], 'GET'); assert.equal(valuesCommand.length, 2); commands.push({role, key: valuesCommand[1]}); return values.get(valuesCommand[1]) ?? null;};
  return {values, commands, deps: {nativeCommand: command('native'), workerCommand: command('worker'), now: () => now, checkOriginal: async () => true}};
}
let checks = 0;
function check(value, message) {assert.ok(value, message); checks++;}
try {
  const f = fixture(), before = JSON.stringify([...f.values]); let originalChecks = 0, intention;
  const result = await reader.runExampleBudgetRead(profile, {...f.deps, checkOriginal: async () => {originalChecks++; return true;}, beforeRead: async value => {intention = value;}});
  check(result.status === 'PASS_GET_ONLY_PROTECTED_EXAMPLE_PREVIEW_BUDGET', 'successful bounded observation');
  check(result.redisGets === 10 && f.commands.length === 10, 'exact ten GETs and no EVAL, write or scan');
  check(f.commands.filter(command => command.role === 'native').length === 3 && f.commands.filter(command => command.role === 'worker').length === 7, 'separate scoped native and worker credentials');
  check(JSON.stringify([...f.values]) === before, 'all original bytes and reservations unchanged');
  check(originalChecks === 2 && result.originalCipherCheckedForHashOnly, 'old financial cipher hash checked before and after without decryption');
  check(intention.configurationId === layout.configuration.configurationId && intention.operationFingerprint === hash(operationId), 'read intent binds configuration and saved operation without raw IDs');
  check(result.native.budget.initialGenericHoldBytes === 2000000000 && result.native.budget.reservedTransferBytes === 2000000000 && result.native.budget.heldOperationCount === 1, 'only same generic two GB hold');
  check(result.native.budget.totalCommittedCommands === 1604 && result.native.budget.totalReservedCommands === 16000 && result.native.budget.remainingTransferBytes === 3500000000, 'all arithmetic retains committed and held values');
  check(result.native.storage.providerPoolsReservedBytes === 20000000 && result.native.storage.maximumBytes === 200000000, 'two provider storage pools counted within unchanged native cap');
  check(result.worker.checkpoint.executed === 0 && result.worker.checkpoint.providerRequests === 0 && result.worker.checkpoint.mcpHttpRequests === 5, 'actual AES-GCM checkpoint is decrypted only for counters');
  check(result.worker.checkpoint.readinessReportIsNotNewOrderCapacityProof, 'readiness counter is not a fresh admission capacity proof');
  check(result.worker.executionJournalAbsent && result.runtime.executionJournalAbsent, 'four exact execution data and guard probes are absent');
  check(result.optionalOperationalBudget.present === false && result.optionalOperationalBudget.absenceIsNotAZeroUsageProof, 'missing optional plaintext ledger cannot synthesize fresh zero');
  const consumed = ledger(); consumed.held[0].transferBytes -= 33816576; consumed.held[0].recoveryCommands -= 280;
  const summary = reader.summarizeExampleContinuousBudget(JSON.stringify(consumed), profile, layout, now);
  check(summary.creditUsedFromOriginalHoldBytes === 33816576 && summary.reservedTransferBytes === 1966183424, 'legitimate used held credit is observed without resizing it');
  const aged = ledger(); aged.buckets.unshift({day: Math.floor((now - 1000) / 86400000) - 40, used: {public: 1, authenticated: 1, recovery: 1, background: 1}, bytes: 1});
  check(reader.summarizeExampleContinuousBudget(JSON.stringify(aged), profile, layout, now).olderBucketsNotMutated === 1, 'durable thirty-one-day clock leaves old bucket bytes untouched');
  for (const mutate of [value => value.configuration = '0'.repeat(64), value => value.last = now + 1, value => value.held = [], value => value.held.push(copy(value.held[0])), value => value.held[0].operationId = '20000000-0000-4000-8000-000000000001', value => value.held[0].principalHash = '0'.repeat(64), value => value.held[0].transferBytes = 2000000001, value => value.held[0].recoveryCommands = 12001, value => value.held[0].backgroundCommands = -1, value => value.buckets[0].used.public = -1, value => value.buckets[0].used.extra = 1, value => value.buckets[0].bytes = 9000000000, value => value.buckets.push(copy(value.buckets[0])), value => value.held[0].extra = true]) {
    const value = ledger(); mutate(value); assert.throws(() => reader.summarizeExampleContinuousBudget(JSON.stringify(value), profile, layout, now)); checks++;
  }
  for (const mutate of [value => value.acceptance.order.phase = 'started', value => value.operationId = 'bad', value => value.storeKey = 'bad', value => value.deployments.provider.alias = 'foreign.vercel.app', value => value.deployments.bazaar.sourceDigest = '0'.repeat(64), value => value.family = 'pilot-0cd860b8cfc35fc459b4838fa9092007', value => value.phase = 'prepared']) {
    const value = copy(profile); mutate(value); assert.throws(() => reader.exampleBudgetReadLayout(value)); checks++;
  }
  for (const mutate of [value => value.executed = 1, value => value.providerRequests = 1, value => value.mcpRequests = 5001, value => value.bindingHash = '0'.repeat(64), value => value.pending = [operationId], value => value.identityCache.ownerId = 'ow_' + '3'.repeat(32), value => value.identityCache.expiresAt++, value => value.lastObservedAt = now + 1, value => value.capacityReport.usedToday = 1, value => value.capacityReport.ready = 'true', value => value.capacityReport.observedAt = 'invalid']) {
    const value = checkpoint(); mutate(value); assert.throws(() => reader.summarizeExampleWorkerCheckpoint(value, profile, now)); checks++;
  }
  for (const key of ['workerOrderData', 'workerOrderGuard', 'runtimeOrderData', 'runtimeOrderGuard']) {const value = fixture(); value.values.set(layout.keys[key], 'unexpected encrypted artifact'); await assert.rejects(reader.runExampleBudgetRead(profile, value.deps), /EXECUTION_ARTIFACT/); checks++;}
  const corruption = fixture(); corruption.values.set(layout.keys.checkpointData, corruption.values.get(layout.keys.checkpointData).replace(/"tag":"./, '"tag":"X'));
  await assert.rejects(reader.runExampleBudgetRead(profile, corruption.deps)); checks++;
  const missing = fixture(); missing.values.delete(layout.keys.checkpointData);
  await assert.rejects(reader.runExampleBudgetRead(profile, missing.deps), /CHECKPOINT/); checks++;
  const badOriginal = fixture(); await assert.rejects(reader.runExampleBudgetRead(profile, {...badOriginal.deps, checkOriginal: async () => false}), /ORIGINAL_CIPHER/); checks++;
  check(badOriginal.commands.length === 0, 'cipher mismatch stops before Redis');
  const deniedIntent = fixture(); await assert.rejects(reader.runExampleBudgetRead(profile, {...deniedIntent.deps, beforeRead: async () => {throw Error('INTENT_DENIED');}}), /INTENT_DENIED/); checks++;
  check(deniedIntent.commands.length === 0, 'intent rejection stops every read');
  const unavailable = fixture(); await assert.rejects(reader.runExampleBudgetRead(profile, {...unavailable.deps, nativeCommand: async () => {throw Error('REDIS_UNAVAILABLE');}}), /UNAVAILABLE/); checks++;
  check(unavailable.commands.length === 0, 'unavailable Redis does not initialize or retry');
  const measured = await reader.exampleReadMeasurementAntecedents();
  check(measured.directSetupRedis.restRequests === 28 && measured.directSetupRedis.conservativeCommands === 3853 && measured.directSetupRedis.bodyBytes === 53447, 'direct setup observations remain separate and exact');
  check(measured.protectedPreviewClientHttp.runRequests === 30 && measured.classesAreNotAddedTogetherAsRedisBilling, 'real Preview client body bytes do not masquerade as Redis bills');
  const output = JSON.stringify(result);
  for (const forbidden of [profile.family, profile.scopedToken, profile.scopedNativeToken, profile.storeKey, operationId, profile.seller.receipt.ownerId, profile.buyer.receipt.ownerId, layout.keys.budget, layout.keys.workerStorage]) check(!output.includes(forbidden), 'no secret or raw private identifier in result');
  for (const flag of ['redisWrites', 'evalCalls', 'scans', 'ttlChanges', 'productionDataQueried', 'counterReset', 'heldOperationsReleased', 'storageOrCommandLimitsChanged', 'readMutationPerformed', 'productionPublished', 'productionLimitsChanged', 'productionReservationsChanged', 'payments', 'signatures', 'settlements', 'cronActivated']) check(!result[flag], 'read-only boundaries explicit');
  const paths = ['.vercel/recovery-example-preview-budget-read.mjs', 'scripts/test-recovery-example-preview-budget-read.mjs', 'lib/continuous-free-budget.ts', 'lib/continuous-free-storage.ts', 'examples/seller-redis-secret-store.mjs'];
  const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(path))])));
  const evidence = {status: 'PASS_LOCAL_GET_ONLY_EXAMPLE_PREVIEW_BUDGET_READER', observedAt: new Date().toISOString(), checks, maximumRedisGetRequests: 10, sources: sourceHashes, exactReadScopes: 'new native ledger plus two worker stores; no scans or old production Redis', fixtureAESCheckpointValidated: true, oldCipherCheckedOnlyViaInjectedBoolean: true, dpapiOpened: false, remoteRequests: 0, productionChanged: false, payments: 0};
  if (process.argv[2] === '--write-evidence') await writeFile('docs/evidence/recovery-example-preview-budget-reader-local-2026-10-12.json', JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify(evidence));
} finally {globalThis.fetch = oldFetch;}
