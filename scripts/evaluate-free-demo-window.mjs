// Local arithmetic only. Pure envelopes do not initialize a store.
// No credentials, runtime flags, profiles, network, deployment or cron writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { operationalRequestEnvelope } from '../lib/operational-budget.ts';
import { freeDemoCommandReservation, FREE_DEMO_COMMAND_BUDGET_DEFAULT } from '../lib/free-demo-budget.ts';

const paths = {
  quota: 'docs/evidence/free-demo-upstash-quota-2026-10-11.json',
  idle: 'docs/evidence/seller-idle-offline-consumption-2026-10-11.json',
  cached: 'docs/evidence/seller-free-demo-offline-consumption-2026-10-11.json',
  guardian: 'docs/evidence/free-demo-guardian-offline-consumption-2026-10-11.json',
};
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const raw = await Promise.all(Object.values(paths).map(read));
const quota = JSON.parse(raw[0]), evidence = JSON.parse(raw[1]), newMeasurement = JSON.parse(raw[2]), guardianMeasurement = JSON.parse(raw[3]);
assert.equal(quota.status, 'FREE_CONFIRMED_READ_ONLY');
assert.equal(quota.plan, 'Free Tier');
assert.equal(quota.subscriptionChanged, false);
assert.equal(quota.commandsRemainingConservative, 500000 - quota.commandsUsedConservative);
assert.equal(evidence.status, 'PASS_SYNTHETIC_ONLY');
assert.equal(newMeasurement.status, 'PASS_OFFLINE_ENCRYPTED_REDIS_STORE');
assert.equal(newMeasurement.productionValidated, false);
assert.equal(newMeasurement.externalRequests, 0);
assert.equal(guardianMeasurement.status, 'PASS_LOCAL_NATIVE_GUARDIAN_STORES');
assert.equal(guardianMeasurement.externalRequests, 0);
assert.equal(guardianMeasurement.globalUpperBoundProven, false);

const candidate = {
  hours: 24, sellerMinutes: 4, guardianMinutes: 60, identityCacheMinutes: 30,
  partition: { public: 155000, authenticated: 90000, recovery: 105000 },
  independentMarginCommands: 20000,
};
const total = value => Object.values(value).reduce((sum, n) => sum + n, 0);
assert.equal(total(candidate.partition), 350000);
const kinds = {
  metadata: { profile: 'public', workload: 'metadata', newOperation: false, credentialRead: true },
  identity: { profile: 'recovery', workload: 'identity', newOperation: false },
  orders: { profile: 'recovery', workload: 'orders', newOperation: false },
  capacity: { profile: 'authenticated', workload: 'capacity', newOperation: true },
};
const weights = Object.fromEntries(Object.entries(kinds).map(([name, kind]) => [name, {
  profile: kind.profile,
  bazaarCommandsUpperBound: operationalRequestEnvelope(kind.profile, kind.workload).redisCommands,
  gateAndCredentialOverheadUpperBound: freeDemoCommandReservation(kind) - operationalRequestEnvelope(kind.profile, kind.workload).redisCommands,
  reservedCommandsUpperBound: freeDemoCommandReservation(kind),
}]));
// Three protocol requests survive every tick: initialize, notification, GET.
// Authenticated report/list and server ownership checks still run each time.
const ticks = candidate.hours * 60 / candidate.sellerMinutes;
const refreshEveryTicks = Math.ceil(candidate.identityCacheMinutes / candidate.sellerMinutes);
const identityRefreshes = Math.ceil(ticks / refreshEveryTicks);
const workerWarm = evidence.perIdleTick.workerWarm;
const workerColdDelta = evidence.perIdleTick.workerCold.executionsIncludingEval - workerWarm.executionsIncludingEval;
// Provisional conservative reuse of the old worker fixture. Cache refresh adds
// one checkpoint: two lock assertions (2 each) + successful CAS (4).
// A complete new fixture must supersede this assumption before release.
const refreshCheckpointCommandsAssumption = 8;
const warmWorkerCommandsReference = workerWarm.executionsIncludingEval;
function model(name, identityCalls, cacheEnabled) {
  const requestCounts = { metadata: ticks * 3, capacity: ticks, orders: ticks, identity: identityCalls };
  const partitionReservations = { public: 0, authenticated: 0, recovery: 0 };
  for (const [kind, count] of Object.entries(requestCounts)) partitionReservations[weights[kind].profile] += count * weights[kind].reservedCommandsUpperBound;
  const bazaarEnvelopeOnly = Object.entries(requestCounts).reduce((sum, [kind, count]) => sum + count * weights[kind].bazaarCommandsUpperBound, 0);
  const overhead = total(partitionReservations) - bazaarEnvelopeOnly;
  const workerCommandsReference = ticks * warmWorkerCommandsReference + workerColdDelta + (cacheEnabled ? identityCalls * refreshCheckpointCommandsAssumption : 0);
  return {
    name, ticks, requestCounts, mcpHttpRequests: total(requestCounts), providerHealthHttpRequests: ticks,
    providerExecutionsInIdleModel: 0, bazaarEnvelopeOnly, gateAndCredentialOverhead: overhead, partitionReservations,
    totalBazaarReservations: total(partitionReservations),
    partitionRoom: Object.fromEntries(Object.keys(candidate.partition).map(profile => [profile, candidate.partition[profile] - partitionReservations[profile]])),
    partitionFits: Object.keys(candidate.partition).every(profile => partitionReservations[profile] <= candidate.partition[profile]),
    workerCommandsReference, workerIsNewMeasurement: false,
  };
}
const old = model('OLD_IDENTITY_EVERY_TICK_AT_4_MIN', ticks, false);
const cached = model('CANDIDATE_IDENTITY_CACHE_30_MIN_AT_4_MIN', identityRefreshes, true);
assert.equal(newMeasurement.ticks, ticks);
assert.equal(newMeasurement.mcpHttpRequests, cached.mcpHttpRequests);
assert.equal(newMeasurement.identityRefreshes, identityRefreshes);
cached.workerIsNewMeasurement = true;
cached.workerMeasuredCommandsIncludingEval = newMeasurement.worker24h.executionsIncludingEval;
cached.workerMeasuredRestTransports = newMeasurement.worker24h.restRequests;
cached.workerReferenceHeadroomOverMeasurement = cached.workerCommandsReference - cached.workerMeasuredCommandsIncludingEval;
assert.ok(cached.workerReferenceHeadroomOverMeasurement >= 0);
// Guardian is outside demoIngress/Free reservations in the inspected source.
// 40 is explicit fixed/cleanup headroom, not a measured hosted upper bound.
// Twenty workspace reads:20*(EVAL+3GET)=80; pruning adds20*(EVAL+6calls)=140.
// Each of two reconciliations uses a generic recovery envelope as a reference.
const guardianPerTick = {
  idleReference: 40 + 20 * 4,
  loadedReference: 40 + 20 * (4 + 7) + 2 * operationalRequestEnvelope('recovery').redisCommands,
  measured: false, hardUpperBoundProven: false,
};
const guardianScenarios = [60, 15].map(minutes => {
  const runs = candidate.hours * 60 / minutes;
  const guardianCommandsReference = runs * guardianPerTick.loadedReference;
  const fullBudgetPlusOutsideReference = total(candidate.partition) + cached.workerCommandsReference + guardianCommandsReference + candidate.independentMarginCommands;
  return {
    minutes, cron: minutes === 60 ? '0 * * * *' : '*/15 * * * *', runs,
    idleGuardianCommandsReference: runs * guardianPerTick.idleReference,
    loadedGuardianCommandsReference: guardianCommandsReference,
    fullBudgetPlusOutsideReference,
    freeQuotaRoomReference: quota.commandsRemainingConservative - fullBudgetPlusOutsideReference,
    arithmeticFitsOnly: fullBudgetPlusOutsideReference <= quota.commandsRemainingConservative,
    guardianUpperBoundVerified: false,
  };
});
assert.equal(ticks, 360);
assert.equal(identityRefreshes, 45);
assert.equal(cached.mcpHttpRequests, 1845);
assert.equal(cached.partitionFits, true);
assert.equal(guardianScenarios[0].arithmeticFitsOnly, true);
assert.equal(guardianScenarios[1].arithmeticFitsOnly, false);
const sourcePaths = ['lib/operational-budget.ts', 'lib/operational-envelopes.ts', 'lib/free-demo-budget.ts', 'lib/market-guardian.ts', 'lib/workspace-store.ts', 'examples/seller-hosted-tick.mjs'];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await read(path)).digest('hex')])));
for (const path of ['examples/seller-hosted-tick.mjs', 'examples/seller-hosted-handler.mjs']) assert.equal(createHash('sha256').update(await read(path)).digest('hex'), newMeasurement.sources[path], 'CACHE_MEASUREMENT_SOURCE_CHANGED');
console.log(JSON.stringify({
  status: 'LOCAL_FREE_DEMO_ARITHMETIC_REVIEW_ONLY',
  quota: { path: paths.quota, observedAt: quota.observedAt, display: quota.commandsDisplayed, rounded: true, conservativeUsed: quota.commandsUsedConservative, conservativeRemaining: quota.commandsRemainingConservative },
  originalMeasurement: { path: paths.idle, productionValidated: false, operationalMeterAndBudgetExcluded: true },
  cachedWorkerMeasurement: { path: paths.cached, recordedAt: newMeasurement.recordedAt, measuredCommandsIncludingEval: newMeasurement.worker24h.executionsIncludingEval, measuredRestTransports: newMeasurement.worker24h.restRequests, coldCommands: newMeasurement.cold.executionsIncludingEval, warmCommands: newMeasurement.warm.executionsIncludingEval, refreshCommands: newMeasurement.refresh.executionsIncludingEval, postWindowDrainScanCommands: newMeasurement.closedDrainScan.executionsIncludingEval, drainedCheckpointGetCommands: newMeasurement.drained.executionsIncludingEval, productionValidated: false, billableSemanticsVerified: false },
  guardianNativeMeasurements: { path: paths.guardian, checks: guardianMeasurement.checks, scenarios: guardianMeasurement.scenarios, signatureSuccessPathMeasured: false, reference1100Measured: false, globalUpperBoundProven: false, hostedRedis: false },
  candidate, sourceDefaultPartitionAtRead: FREE_DEMO_COMMAND_BUDGET_DEFAULT,
  weights, refreshEveryTicks, actualRefreshMinutesOnPerfectSchedule: refreshEveryTicks * candidate.sellerMinutes,
  nominalLeaseMarginSeconds: 360 - candidate.sellerMinutes * 60 - 45,
  models: [old, cached], guardianPerTick, guardianScenarios,
  metadataRecoveryFallback: { atomicRequired: true, verifiedCredentialRequired: true, anonymousRecoveryEscalationAllowed: false, normalBaselineUsesFallback: false, additionalDeniedGateOverheadMeasured: false, finiteRecoveryRoom: cached.partitionRoom.recovery },
  dailyDeliveryLimit: { ceiling: 50, guaranteedPurchases: 0 },
  oneAdmissionDeadline: true, resetAtUtcMidnightAllowed: false, extendWindowWithoutReviewAllowed: false,
  sourceHashes,
  limitations: ['Reservations include Lua calls but are not a Redis invoice.', 'Worker/guardian stores are measured locally with synthetic REST/Lua; successful cryptographic reconciliations, full expired market records and contention remain unmeasured.', 'All other namespaces, denied-request traffic and post-window recovery share the remaining Free quota.', 'No bound on arbitrary abusive traffic or a guaranteed 50 purchases is established.', 'Vercel consumption is independent and not measured here.', 'No current production runtime configuration is validated by this arithmetic.'],
  approvedSourcesModified: false, networkRequests: 0, profilesRead: 0, cloudWrites: 0, cronActivated: false, payments: 0,
}, null, 2));
