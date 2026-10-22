import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sellerCanonical} from '../examples/seller-service-card.mjs';

// Import must not start a CLI action, open DPAPI, or reach a remote endpoint.
const savedFetch = globalThis.fetch, savedMode = process.env.BAZAAR_FREE_DEMO_MODE;
globalThis.fetch = () => assert.fail('EXTERNAL_REQUEST_FORBIDDEN');
process.env.BAZAAR_FREE_DEMO_MODE = 'continuous';
const controller = await import('../.vercel/recovery-example-preview-storage.mjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const profile = {purpose: 'bazaar-recovery-example-preview-v1', phase: 'native-ready', family: 'pilot-' + 'a'.repeat(32), scopedNativeToken: 'PRIVATE_SYNTHETIC_SCOPED_TOKEN', workerPrefix: 'bazaar-seller:preview-' + 'a'.repeat(32), runtimePrefix: 'bazaar-seller:preview-' + hash('runtime:' + 'a'.repeat(32)).slice(0, 32), workerBinding: 'b'.repeat(64), runtimeBinding: hash(sellerCanonical({role: 'recovery-example-runtime/v1', workerBinding: 'b'.repeat(64)})), seller: {receipt: {ownerId: 'ow_' + '1'.repeat(32)}}, buyer: {receipt: {ownerId: 'ow_' + '2'.repeat(32)}}};
const layout = controller.recoveryExampleStorageLayout(profile), unrelated = 'c'.repeat(64);
const initialLedger = () => ({version: 1, scope: profile.family, initialized: true, entries: {[unrelated]: {bytes: 5000, reserved: 7000}}});
let checks = 0;
function check(value, message) {assert.ok(value, message); checks++;}
function localTransport({ledger = initialLedger(), concurrent = false, corruptOther = false, loseAck = false} = {}) {
  let raw = ledger == null ? null : JSON.stringify(ledger), evals = 0, writes = 0;
  const commands = [];
  return {commands, get raw() {return raw;}, get evals() {return evals;}, get writes() {return writes;}, command: async values => {
    commands.push(structuredClone(values));
    assert.equal(values[0] === 'EVAL' ? values[3] : values[1], layout.ledgerKey);
    if (values[0] === 'GET') return raw;
    assert.equal(values[0], 'EVAL'); evals++;
    assert.equal(values[2], 1); const [expected, scope, encodedPatch] = values.slice(4);
    assert.ok(values[1].startsWith('-- recovery-example-preview-provider-storage-reserve-v1'));
    assert.ok(values[1].includes("if prior~=ARGV[1] then return 0 end"));
    assert.equal(scope, profile.family);
    const patch = JSON.parse(encodedPatch);
    assert.deepEqual(patch, [{key: layout.reservationHash, expected: 0, bytes: 0, reserved: 20000000}]);
    if (concurrent) {raw = JSON.stringify({...JSON.parse(raw), entries: {...JSON.parse(raw).entries, ['d'.repeat(64)]: {bytes: 1, reserved: 0}}}); return 0;}
    assert.equal(expected, raw);
    const next = JSON.parse(raw); next.entries[layout.reservationHash] = {bytes: 0, reserved: 20000000};
    if (corruptOther) next.entries[unrelated].reserved--;
    raw = JSON.stringify(next); writes++;
    if (loseAck) throw Error('SYNTHETIC_LOST_ACK');
    return 1;
  }};
}
try {
  check(layout.reservationHash === hash(layout.reservationKey), 'virtual storage row indexed by canonical SHA256');
  check(layout.ledgerKey.startsWith('bazaar-workspace:' + profile.family + ':'), 'new namespace ledger only');
  check(controller.EXAMPLE_PROVIDER_STORAGE_BYTES === 20000000, 'two existing ten MB pools counted');
  const first = localTransport(); let intent;
  const before = first.raw;
  const result = await controller.runRecoveryExampleStorage('reserve', profile, {command: first.command, beforeMutation: async value => {intent = value;}});
  check(result.status === 'PASS_RESERVED_ISOLATED_EXAMPLE_PROVIDER_STORAGE' && result.reservedProviderBytes === 20000000, 'atomic new reservation passes');
  check(first.writes === 1 && first.evals === 1 && first.commands.length === 3, 'one GET, one EVAL, one readback');
  check(result.nativeRedisCommandsIncludingLua === 6, 'two top-level GETs plus EVAL plus nested GET/GET/SET accounted');
  check(intent.expectedLedgerSha256 === hash(before), 'snapshot proof persisted before mutation');
  check(result.storageMaximumBytes === 200000000 && result.nativeTechnicalReserveBytes === 10000000, 'global limit and native allowance unchanged');
  check(result.otherStorageEntriesPreserved && JSON.parse(first.raw).entries[unrelated].reserved === 7000, 'all unrelated existing reservations preserved');
  const replay = await controller.runRecoveryExampleStorage('reserve', profile, {command: first.command, beforeMutation: () => assert.fail('NO_SECOND_INTENT')});
  check(replay.status === 'PASS_EXISTING_ISOLATED_EXAMPLE_PROVIDER_STORAGE' && replay.idempotent && first.writes === 1, 'replay reads without rewriting or re-reserving');
  const reader = localTransport(); const read = await controller.runRecoveryExampleStorage('read', profile, {command: reader.command});
  check(read.reservedProviderBytes === 0 && reader.writes === 0 && reader.commands.length === 1, 'read action cannot reserve');
  for (const invalid of [
    {...profile, phase: 'prepared'}, {...profile, family: 'production'}, {...profile, family: 'pilot-0cd860b8cfc35fc459b4838fa9092007'}, {...profile, scopedNativeToken: ''}, {...profile, workerPrefix: 'bazaar-seller:production-' + 'a'.repeat(32)}, {...profile, runtimePrefix: profile.workerPrefix}, {...profile, runtimeBinding: '0'.repeat(64)}, {...profile, buyer: profile.seller}, {...profile, purpose: 'other'},
  ]) {assert.throws(() => controller.recoveryExampleStorageLayout(invalid)); checks++;}
  for (const raw of [null, '{}', JSON.stringify({...initialLedger(), scope: 'production'}), JSON.stringify({...initialLedger(), initialized: false}), JSON.stringify({...initialLedger(), entries: {[unrelated]: {bytes: -1, reserved: 0}}}), JSON.stringify({...initialLedger(), entries: {[unrelated]: {bytes: 1, reserved: 1, extra: true}}}), JSON.stringify({...initialLedger(), extra: true}), ' '.repeat(2000001)]) {
    assert.throws(() => controller.parseRecoveryExampleStorage(raw, layout)); checks++;
  }
  for (const reserved of [1, 19999999, 20000001]) {
    const ledger = initialLedger(); ledger.entries[layout.reservationHash] = {bytes: 0, reserved};
    assert.throws(() => controller.parseRecoveryExampleStorage(JSON.stringify(ledger), layout), /MISMATCH/); checks++;
  }
  const occupied = initialLedger(); occupied.entries[layout.reservationHash] = {bytes: 1, reserved: 20000000};
  assert.throws(() => controller.parseRecoveryExampleStorage(JSON.stringify(occupied), layout), /MISMATCH/); checks++;
  const filled = initialLedger(); filled.entries[unrelated] = {bytes: 180000000, reserved: 0};
  const unavailable = localTransport({ledger: filled});
  await assert.rejects(controller.runRecoveryExampleStorage('reserve', profile, {command: unavailable.command}), /CAPACITY/); checks++;
  check(unavailable.evals === 0, 'capacity rejected before any intent or mutation');
  const race = localTransport({concurrent: true});
  await assert.rejects(controller.runRecoveryExampleStorage('reserve', profile, {command: race.command}), /CONCURRENT_CHANGE/); checks++;
  check(race.writes === 0 && race.evals === 1, 'no retry or write after concurrent snapshot conflict');
  const changed = localTransport({corruptOther: true});
  await assert.rejects(controller.runRecoveryExampleStorage('reserve', profile, {command: changed.command}), /OTHER_STORAGE_ENTRIES_CHANGED/); checks++;
  const lost = localTransport({loseAck: true});
  await assert.rejects(controller.runRecoveryExampleStorage('reserve', profile, {command: lost.command}), /LOST_ACK/); checks++;
  check(lost.evals === 1 && lost.writes === 1, 'lost acknowledgement does not cause automatic resubmission');
  const recovered = await controller.runRecoveryExampleStorage('read', profile, {command: lost.command});
  check(recovered.reservedProviderBytes === 20000000 && lost.evals === 1, 'read-only recovery proves existing reservation after response loss');
  const noIntent = localTransport();
  await assert.rejects(controller.runRecoveryExampleStorage('reserve', profile, {command: noIntent.command, beforeMutation: () => {throw Error('INTENT_BLOCKED');}}), /INTENT_BLOCKED/); checks++;
  check(noIntent.evals === 0 && noIntent.writes === 0, 'intent rejection blocks EVAL');
  for (const name of ['reset', 'release', 'delete', 'read-production']) {await assert.rejects(controller.runRecoveryExampleStorage(name, profile, {command: reader.command})); checks++;}
  const publicText = JSON.stringify(result);
  for (const secret of [profile.scopedNativeToken, profile.family, profile.seller.receipt.ownerId, profile.buyer.receipt.ownerId, layout.ledgerKey, layout.reservationKey]) check(!publicText.includes(secret), 'public receipt contains no credentials or raw personal indices');
  for (const flag of ['storageLimitChanged', 'byteBudgetRead', 'byteBudgetWritten', 'counterReset', 'pendingHoldChanged', 'oldProductionRead', 'productionPublished', 'productionLimitsChanged', 'productionReservationsChanged', 'payments', 'signatures', 'settlements', 'cronActivated']) check(!result[flag], 'no unintended production or payment action');
  const files = ['.vercel/recovery-example-preview-storage.mjs', 'scripts/test-recovery-example-preview-storage.mjs', 'lib/continuous-free-storage.ts', 'examples/seller-redis-secret-store.mjs', 'scripts/recovery-example-preview-lib.mjs'];
  const sources = Object.fromEntries(await Promise.all(files.map(async path => [path, hash(await readFile(path))])));
  const evidence = {status: 'PASS_LOCAL_ISOLATED_EXAMPLE_STORAGE_CONTROLLER', observedAt: new Date().toISOString(), checks, sources, method: 'injected exact sidecar protocol evaluator; no DPAPI opened and no Redis endpoint contacted', desiredReservationBytes: 20000000, globalStorageLimitBytes: 200000000, unrelatedEntryPreserved: true, idempotent: true, intentBeforeMutation: true, noRetryAfterLostAck: true, isolation: 'native-ready new synthetic family; scoped native credential and exact single ledger key', remoteRedisRequests: 0, redisProductionRead: false, productionChanged: false, payments: 0};
  if (process.argv[2] === '--write-evidence') await writeFile('docs/evidence/recovery-example-preview-storage-controller-local-2026-10-12.json', JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify(evidence));
} finally {
  globalThis.fetch = savedFetch;
  if (savedMode === undefined) delete process.env.BAZAAR_FREE_DEMO_MODE; else process.env.BAZAAR_FREE_DEMO_MODE = savedMode;
}
