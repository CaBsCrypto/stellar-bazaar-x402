import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {measureRecoveryExampleBudget} from './measure-recovery-example-budget.mjs';

const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const guards = ['lib/continuous-free-budget.ts', 'docs/evidence/free-margin-repair-production-budget-promotion-2026-10-12.json'];
const original = await Promise.all(guards.map(hash)), originalMode = process.env.BAZAAR_FREE_DEMO_MODE, originalFetch = globalThis.fetch;
const e = await measureRecoveryExampleBudget();
let checks = 0;
function test(value, message) {assert.ok(value, message); checks++;}
test(e.status === 'PASS_SYNTHETIC_LOCAL_BUDGET_MEASUREMENT_NOT_HOSTED_ACCEPTANCE', 'explicit local-only status');
test(e.samples.length === 8, 'all boundary and recovery samples recorded');
const get = name => {const value = e.samples.find(s => s.name === name); assert.ok(value); return value;};
test(get('readiness-cold').identityRequests === 1, 'cold identity request');
test(get('readiness-warm').identityRequests === 0 && get('readiness-warm').identityCacheHit, 'durable cache survives fresh handler');
test(get('readiness-cache-before-expiry').identityRequests === 0, 'cache remains valid until thirty minutes');
test(get('readiness-cache-at-expiry').identityRequests === 1, 'identity is rechecked exactly at expiry');
for (const s of e.samples.filter(v => v.name.startsWith('readiness'))) {
  test(s.adapterExecutions === 0 && s.hostedReportedProviderRequests === 0, 'readiness never executes paid orders');
  test(s.providerHealthRequests === 1, 'readiness checks actual adapter health');
  test(!Object.keys(s.toolCounts).some(name => ['get_market_order', 'claim_market_order', 'deliver_market_order', 'list_market_orders'].includes(name)), 'readiness does not inspect or claim orders');
}
test(get('deliver-paid-synthetic').adapterExecutions === 1, 'paid synthetic target executes once');
test(get('deliver-replay').adapterExecutions === 0 && get('deliver-replay').toolCounts.claim_market_order === undefined, 'completed replay never claims or executes again');
test(get('deliver-lost-ack').reason === 'unconfirmed' && get('deliver-lost-ack').adapterExecutions === 1, 'lost acknowledgement retains uncertainty without duplicate execution');
test(get('deliver-lost-ack-recovery-after-restart').reason === 'delivered' && get('deliver-lost-ack-recovery-after-restart').adapterExecutions === 0, 'new runtime recovers old delivery');
test(e.duplicateProtection.totalAdapterExecutions === 2 && e.duplicateProtection.sameAttemptAndTextAfterLostAckRestart, 'one execution per each of two isolated orders');
for (const s of e.samples) {
  test(s.workerRedis.commandsIncludingEvalAndLua >= s.workerRedis.restRequests, 'nested Lua operations counted separately from REST requests');
  test(Object.values(s.workerRedis.topLevelCommands).reduce((a, b) => a + b, 0) === s.workerRedis.restRequests, 'REST count matches each top-level Redis command');
  test(s.workerRedis.commandsIncludingEvalAndLua === s.workerRedis.restRequests + Object.values(s.workerRedis.luaCommands).reduce((a, b) => a + b, 0), 'all EVAL and redis.call counts reconcile');
  test(s.workerRedis.commandsIncludingEvalAndLua <= 1000 && s.workerRedis.requestBodyBytes + s.workerRedis.responseBodyBytes <= 100000000, 'current worker conservative envelope covers local measurement');
  test(s.mcpProtocolPayload.restRequests >= Object.values(s.toolCounts).reduce((a, b) => a + b, 0), 'SDK controls included in request count');
  test(s.nativeBazaarConservativeReservation.httpRequests === s.mcpProtocolPayload.restRequests, 'each SDK request classified with real ingress code');
  test(s.entireInvocationConservativeReservation.background === s.nativeBazaarConservativeReservation.background + 1004, 'background accounting guard kept');
  test(s.entireInvocationConservativeReservation.transferBytes === s.nativeBazaarConservativeReservation.transferBytes + 100004096, 'transport reservation kept');
  test(Number.isSafeInteger(s.workerRedis.requestBodyBytes) && Number.isSafeInteger(s.mcpProtocolPayload.responseBodyBytes) && s.providerProtocolPayload.responseBodyBytes > 0, 'body-byte totals are integers');
}
test(e.service.payloadBytes < 1024 && e.service.network === 'stellar:testnet' && e.service.price === '0.01', 'example is bounded Testnet text');
test(e.unchangedAdmission.genericOperationHold.transferBytes === 2000000000, 'generic order hold not reduced');
test(e.localWorkflowModel.paymentRequestsExecuted === false && e.localWorkflowModel.peakIntentionallyDoubleCountsHeldCreditsConsumedByFlow, 'workflow forecast does not claim payment execution and explicitly double counts whole held reserve');
test(e.localWorkflowModel.conservativePeakIncludingWholeHoldBytes === e.localWorkflowModel.reservation.transferBytes + 2000000000, 'safe combined peak arithmetic');
test(e.productionCapacity.lastKnownCapacity.remainingBytes === 1072676608 && e.productionCapacity.lastKnownCapacity.deficitToGenericHoldBytes === 927323392 && !e.productionCapacity.lastKnownCapacity.genericHoldFitsBeforeAnyReadiness, 'last known capacity still rejects the generic two GB hold');
test(!e.productionCapacity.freshReadPerformed && e.productionCapacity.status.startsWith('BLOCKED'), 'previous blocked capacity cannot become a fresh acceptance');
test(e.method.invoiceSemanticsVerified === false, 'provider invoice semantics not claimed');
test(e.method.nativeBazaar.includes('no native Bazaar Redis execution is claimed'), 'native command model clearly separate from actual measurement');
test(e.externalNetworkRequests === 0 && e.realPayments === 0 && e.cloudWrites === 0 && e.productionChanged === false && e.cronActivated === false, 'no remote mutation, payment or deployment');
test(process.env.BAZAAR_FREE_DEMO_MODE === originalMode && globalThis.fetch === originalFetch, 'test restores local environment and fetch');
test(JSON.stringify(await Promise.all(guards.map(hash))) === JSON.stringify(original), 'budget source and prior observation intact');
const raw = JSON.stringify(e);
for (const forbidden of ['PRIVATE_SYNTHETIC_TOKEN', 'a'.repeat(43), 'p'.repeat(43), 'ow_' + '1'.repeat(32), 'ow_' + '2'.repeat(32), 'https://recovery-example.invalid', 'https://synthetic.upstash.io']) test(!raw.includes(forbidden), 'evidence omits tokens, owner IDs and private transport configuration');
console.log(JSON.stringify({status: 'PASS_LOCAL_RECOVERY_EXAMPLE_BUDGET', checks, samples: e.samples.length, externalNetworkRequests: 0, realPayments: 0, productionChanged: false, coverage: ['actual worker and deterministic example adapter', 'AES-GCM durable Redis commands plus Lua internals', 'SDK protocol request and body byte counts', 'cold/warm identity expiry boundary', 'delivery replay and acknowledgement loss after handler restart', 'unaltered quota envelopes and generic operation hold', 'conservative Bazaar reservations clearly distinct from physical billing']}));
