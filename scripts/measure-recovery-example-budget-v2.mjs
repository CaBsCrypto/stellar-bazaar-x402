// Local protocol measurement only. Neither remote Redis nor a payment verifier
// is reachable: every transport is injected and all identities are synthetic.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Keypair} from '@stellar/stellar-sdk';
import * as example from '../examples/recovery-example-text-service.mjs';
import {runHostedSellerTick} from '../examples/seller-hosted-tick.mjs';
import {createRecoveryExampleRuntimeHandler, recoveryExampleStorageContract} from '../examples/recovery-example-hosted-provider.mjs';
import {sellerCanonical, sellerHash} from '../examples/seller-service-card.mjs';
import {createWorkerRedisCommands, createSellerRedisSecretStore, initializeSellerStorage} from '../examples/seller-redis-secret-store.mjs';
import {sellerRedisMemory} from './fixtures/seller-redis-memory.mjs';
import {classifyOperationalRequest} from '../lib/operational-pressure.ts';
import {continuousFreeBudgetConfiguration, continuousFreeReservation, CONTINUOUS_FREE_OPERATION_RESERVATION} from '../lib/continuous-free-budget.ts';

const OUTPUT = 'docs/evidence/recovery-example-budget-v2-local-2026-10-12.json';
const SOURCE_FILES = [
  'scripts/measure-recovery-example-budget-v2.mjs', 'scripts/test-recovery-example-budget-v2.mjs',
  'examples/recovery-example-text-service.mjs', 'examples/recovery-example-hosted-provider.mjs', 'examples/seller-hosted-tick.mjs',
  'examples/seller-mcp-transport.mjs', 'examples/seller-marketplace-worker.mjs',
  'examples/seller-http-adapter.mjs', 'examples/seller-runtime.mjs',
  'examples/seller-redis-secret-store.mjs', 'scripts/fixtures/seller-redis-memory.mjs',
  'lib/continuous-free-budget.ts', 'lib/operational-pressure.ts', 'lib/operational-envelopes.ts',
];
const digest = value => createHash('sha256').update(value).digest('hex');
const EXPECTED_RUNTIME_SHA256 = 'a9542bcb5a0c47dc8474b30e0e87a4c771f774460737b8bc56854dbddee8f02a';
const size = value => value == null ? 0 : Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const totals = () => ({restRequests: 0, requestBodyBytes: 0, responseBodyBytes: 0});
const budget = () => ({public: 0, authenticated: 0, recovery: 0, background: 0, transferBytes: 0, httpRequests: 0});
const plus = (target, value) => {for (const key of Object.keys(target)) target[key] += value[key] ?? 0; return target;};
function reservation(kind) {
  const value = continuousFreeReservation(kind);
  return {...budget(), [kind.profile]: value.commands, transferBytes: value.transferBytes, httpRequests: 1};
}
function delta(current, before) {return Object.fromEntries(Object.keys(current).map(key => [key, current[key] - (before[key] ?? 0)]));}

export async function measureRecoveryExampleBudget() {
  if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === 'production') throw Error('LOCAL_ONLY');
  const previousMode = process.env.BAZAAR_FREE_DEMO_MODE, previousFetch = globalThis.fetch;
  assert.equal(digest(await readFile('examples/recovery-example-hosted-provider.mjs')), EXPECTED_RUNTIME_SHA256, 'measure the reviewed recovery-only runtime source');
  process.env.BAZAAR_FREE_DEMO_MODE = 'continuous';
  globalThis.fetch = () => assert.fail('REMOTE_TRANSPORT_FORBIDDEN');
  try {
    const started = Date.parse('2026-10-12T12:00:00.000Z');
    let clock = started, adapterExecutions = 0, healthRequests = 0, lostDeliveryAck = false;
    const publication = example.createRecoveryExampleCard({providerOrigin: 'https://recovery-example.invalid', destination: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 19)).publicKey()});
    const config = {...publication, ownerId: 'ow_' + '1'.repeat(32), agentId: 'agent_synthetic_recovery_example', bazaarOrigin: 'https://bazaar.invalid', allowedOrigins: [publication.card.url], controlProof: {method: 'http-well-known', domain: 'recovery-example.invalid'}, agentAccess: 'a'.repeat(43), providerAccess: 'p'.repeat(43)};
    const bindingHash = sellerHash(sellerCanonical({bazaarOrigin: config.bazaarOrigin, ownerId: config.ownerId, agentId: config.agentId, cardHash: config.cardHash, allowedOrigins: config.allowedOrigins, agentAccessHash: sellerHash(config.agentAccess), providerAccessHash: sellerHash(config.providerAccess)}));
    const prefix = 'bazaar-seller:preview-' + 'e'.repeat(32), key = Buffer.alloc(32, 9).toString('base64url');
    const memory = sellerRedisMemory(() => clock), redisBytes = totals(), mcpBytes = totals(), providerBytes = totals(), plain = new Map(), requests = [];
    const redisFetcher = async (url, init) => {
      assert.equal(String(url), 'https://synthetic.upstash.io');
      const result = {result: memory.execute(JSON.parse(init.body))};
      redisBytes.restRequests++; redisBytes.requestBodyBytes += size(init.body); redisBytes.responseBodyBytes += size(result);
      return Response.json(result);
    };
    const command = createWorkerRedisCommands({url: 'https://synthetic.upstash.io', token: 'PRIVATE_SYNTHETIC_TOKEN', fetcher: redisFetcher});
    const environment = {VERCEL_ENV: 'preview', BAZAAR_SELLER_EXECUTION_MODE: 'on-demand', BAZAAR_HOSTED_SELLER_BINDING_HASH: bindingHash, BAZAAR_HOSTED_SELLER_ENABLED: 'true', BAZAAR_HOSTED_SELLER_CONFIG: JSON.stringify(config), BAZAAR_HOSTED_SELLER_PREFIX: prefix, BAZAAR_EXAMPLE_RUNTIME_PREFIX: 'bazaar-seller:preview-' + 'f'.repeat(32), BAZAAR_HOSTED_SELLER_REDIS_REST_URL: 'https://synthetic.upstash.io', BAZAAR_HOSTED_SELLER_REDIS_REST_TOKEN: 'PRIVATE_SYNTHETIC_TOKEN', BAZAAR_HOSTED_SELLER_KEY: key};
    const layout = recoveryExampleStorageContract(environment);
    await initializeSellerStorage(command, prefix, bindingHash, []);
    await initializeSellerStorage(command, layout.runtimePrefix, layout.runtimeBinding, []);
    function createStore() {
      const actual = createSellerRedisSecretStore({command, prefix, key, bindingHash, now: () => clock, storageBudget: true});
      return {...actual, values: plain, write: async (name, value) => {await actual.write(name, value); plain.set(name, structuredClone(value));}, journal(name) {
        const journal = actual.journal(name);
        return {...journal, initialize: async value => {await journal.initialize(value); plain.set(name, structuredClone(value));}, append: async value => {await journal.append(value); plain.set(name, structuredClone(value));}};
      }};
    }
    const initialization = {...redisBytes, commandsIncludingEvalAndLua: memory.snapshot().executionsIncludingEval};
    const orders = new Map();
    function paidOrder() {
      const input = {format: 'text'};
      const value = {operationId: randomUUID(), serviceId: config.card.id, cardHash: config.cardHash, card: structuredClone(config.card), sellerOwnerId: config.ownerId, buyerOwnerId: 'ow_' + '2'.repeat(32), perspective: 'sale', phase: 'paid', input, inputHash: sellerHash(sellerCanonical(input)), paymentProtocol: 'x402-stellar-exact-v2', amount: '0.01', destination: config.card.payment.destination, settlement: structuredClone(config.card.payment.identity), transactionHash: 'b'.repeat(64), paymentVerifiedAt: new Date(started - 1000).toISOString(), createdAt: new Date(started).toISOString(), expiresAt: new Date(started + 168 * 3600000).toISOString(), executionMode: 'on-demand', textWake: {version: 1, wakeId: randomUUID(), status: 'dispatching', createdAt: new Date(started).toISOString(), updatedAt: new Date(started).toISOString(), attempts: 1}};
      orders.set(value.operationId, value); return value;
    }
    const firstOrder = paidOrder(), ackOrder = paidOrder();
    async function mcpFetcher(url, init) {
      assert.equal(String(url), config.bazaarOrigin + '/api/mcp'); assert.equal(init.redirect, 'error');
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + config.agentAccess);
      const request = new Request(url, init), kind = await classifyOperationalRequest(request);
      requests.push({kind: {...kind, credentialRead: true, ...(kind.profile === 'public' && kind.workload === 'metadata' ? {recoveryTransport: true} : {})}, method: init.method});
      mcpBytes.restRequests++; mcpBytes.requestBodyBytes += size(init.body);
      if (init.method === 'GET') return new Response(null, {status: 405, headers: {allow: 'POST'}});
      const packet = JSON.parse(init.body);
      if (packet.method === 'notifications/initialized') return new Response(null, {status: 202});
      let response;
      if (packet.method === 'initialize') response = {jsonrpc: '2.0', id: packet.id, result: {protocolVersion: packet.params.protocolVersion, capabilities: {tools: {}}, serverInfo: {name: 'synthetic-recovery-example', version: '1'}}};
      else {
        assert.equal(packet.method, 'tools/call');
        const {name, arguments: args} = packet.params; requests.at(-1).tool = name; let body;
        if (name === 'get_bazaar_identity') body = {ownerId: config.ownerId, agentId: config.agentId, generation: 1, network: 'stellar:testnet'};
        else if (name === 'report_market_capacity') {
          assert.deepEqual(plain.get('seller.hosted.tick').capacityReport, args);
          assert.equal(args.serviceId, config.card.id); assert.equal(args.cardHash, config.cardHash);
          body = {ready: args.ready, leaseExpiresAt: new Date(Date.parse(args.observedAt) + 360000).toISOString()};
        } else {
          assert.ok(['get_market_order', 'claim_market_order', 'deliver_market_order'].includes(name));
          const order = orders.get(args.operationId); assert.ok(order);
          if (name === 'claim_market_order') {assert.equal(order.phase, 'paid'); order.phase = 'executing'; order.attemptId = args.attemptId; order.agentId = config.agentId;}
          if (name === 'deliver_market_order') {
            assert.ok(['executing', 'delivered'].includes(order.phase));
            assert.equal(args.attemptId, order.attemptId);
            if (order.phase === 'delivered') {assert.equal(order.delivery.text, args.text); assert.equal(order.delivery.sha256, sellerHash(args.text));}
            else {order.phase = 'delivered'; order.delivery = {text: args.text, sha256: sellerHash(args.text), reference: 'bazaar-order:' + order.operationId};}
          }
          const value = structuredClone(order); delete value.expiresAt; body = {order: value};
        }
        response = {jsonrpc: '2.0', id: packet.id, result: {isError: false, content: [{type: 'text', text: JSON.stringify(body)}]}};
        if (name === 'deliver_market_order' && lostDeliveryAck) {lostDeliveryAck = false; throw Error('SYNTHETIC_LOST_DELIVERY_ACK');}
      }
      mcpBytes.responseBodyBytes += size(response); return Response.json(response);
    }
    const samples = [];
    async function sample(name, input) {
      const store = createStore(), commandBefore = memory.snapshot(), bytesBefore = {...redisBytes}, mcpBefore = {...mcpBytes}, providerBefore = {...providerBytes}, requestsBefore = requests.length, executionsBefore = adapterExecutions, healthBefore = healthRequests;
      const runtime = createRecoveryExampleRuntimeHandler(environment, {fetcher: redisFetcher, adapter: {...example, execute: async packet => {adapterExecutions++; return example.execute(packet);}}, now: () => clock});
      try {
        const result = await runHostedSellerTick({enabled: true, config, store, now: () => clock, executionMode: 'on-demand', fetcher: mcpFetcher, providerFetcher: async (url, init) => {
          assert.ok([config.card.url + example.RECOVERY_EXAMPLE_ROUTE, config.card.url + example.RECOVERY_EXAMPLE_ROUTE + '/availability'].includes(String(url)));
          providerBytes.restRequests++; providerBytes.requestBodyBytes += size(init.body);
          if (init.method === 'GET') healthRequests++;
          const response = await runtime(new Request(url, init));
          providerBytes.responseBodyBytes += Buffer.byteLength(await response.clone().text()); return response;
        }, ...input});
        const commandAfter = memory.snapshot(), native = budget();
        const observedRequests = requests.slice(requestsBefore);
        for (const item of observedRequests) plus(native, reservation(item.kind));
        const workerCommands = commandAfter.executionsIncludingEval - commandBefore.executionsIncludingEval;
        assert.ok(workerCommands <= 1000); assert.ok(adapterExecutions - executionsBefore <= 1);
        const workerTransport = delta(redisBytes, bytesBefore), measuredWorkerPayload = workerTransport.requestBodyBytes + workerTransport.responseBodyBytes;
        assert.ok(measuredWorkerPayload <= 100_000_000);
        const entire = {...native, background: native.background + 1004, transferBytes: native.transferBytes + 100_004_096};
        const tools = observedRequests.flatMap(r => r.tool ? [r.tool] : []);
        const value = {name, reason: result.reason, identityRequests: result.identityRequests, identityCacheHit: result.identityCacheHit, adapterExecutions: adapterExecutions - executionsBefore, providerHealthRequests: healthRequests - healthBefore, hostedReportedProviderRequests: result.providerRequests, workerRedis: {...workerTransport, commandsIncludingEvalAndLua: workerCommands, topLevelCommands: delta(commandAfter.topLevel, commandBefore.topLevel), luaCommands: delta(commandAfter.lua, commandBefore.lua)}, mcpProtocolPayload: delta(mcpBytes, mcpBefore), providerProtocolPayload: delta(providerBytes, providerBefore), toolCounts: Object.fromEntries([...new Set(tools)].map(tool => [tool, tools.filter(n => n === tool).length])), nativeBazaarConservativeReservation: native, entireInvocationConservativeReservation: entire};
        samples.push(value); return result;
      } finally {store.dispose();}
    }
    assert.equal((await sample('readiness-cold', {requestMode: 'readiness'})).reason, 'ready');
    assert.equal(adapterExecutions, 0);
    assert.equal((await sample('readiness-warm', {requestMode: 'readiness'})).reason, 'ready');
    clock = started + 1800000 - 1;
    assert.equal((await sample('readiness-cache-before-expiry', {requestMode: 'readiness'})).reason, 'ready');
    clock += 1;
    assert.equal((await sample('readiness-cache-at-expiry', {requestMode: 'readiness'})).reason, 'ready');
    const target = order => ({requestMode: 'deliver', operationId: order.operationId, wakeId: order.textWake.wakeId});
    assert.equal((await sample('deliver-paid-synthetic', target(firstOrder))).reason, 'delivered');
    const originalAttempt = firstOrder.attemptId, originalText = firstOrder.delivery.text;
    firstOrder.textWake.status = 'completed';
    assert.equal((await sample('deliver-replay', target(firstOrder))).reason, 'delivered');
    assert.equal(firstOrder.attemptId, originalAttempt); assert.equal(firstOrder.delivery.text, originalText); assert.equal(adapterExecutions, 1);
    lostDeliveryAck = true;
    assert.equal((await sample('deliver-lost-ack', target(ackOrder))).reason, 'unconfirmed');
    assert.equal(ackOrder.phase, 'delivered'); assert.equal(adapterExecutions, 2);
    const lostAttempt = ackOrder.attemptId, lostText = ackOrder.delivery.text;
    clock += 60001; // Respect the worker's durable backoff before recovering.
    const recoveredAck = await sample('deliver-lost-ack-recovery-after-restart', target(ackOrder));
    assert.equal(recoveredAck.reason, 'delivered', JSON.stringify({result: recoveredAck, journalPhase: plain.get('seller.' + ackOrder.operationId)?.phase, samples: samples.slice(-2).map(s => ({name: s.name, toolCounts: s.toolCounts, reason: s.reason}))}));
    assert.equal(ackOrder.attemptId, lostAttempt); assert.equal(ackOrder.delivery.text, lostText); assert.equal(adapterExecutions, 2);
    assert.equal(samples.find(s => s.name === 'readiness-cache-before-expiry').identityRequests, 0);
    assert.equal(samples.find(s => s.name === 'readiness-cache-at-expiry').identityRequests, 1);
    // These direct authenticated runtime probes exercise the new recovery-only
    // guard. A different empty namespace is initialized without deleting or
    // modifying any original runtime journal, even in this synthetic fixture.
    const runtimeRecoverySamples = [];
    async function runtimeSample(name, runtimeEnvironment, attemptId = originalAttempt) {
      const before = memory.snapshot(), bodyBefore = {...redisBytes}, executionsBefore = adapterExecutions;
      const handler = createRecoveryExampleRuntimeHandler(runtimeEnvironment, {fetcher: redisFetcher, now: () => clock, adapter: {...example, execute: async packet => {adapterExecutions++; return example.execute(packet);}}});
      const body = JSON.stringify({operationId: firstOrder.operationId, attemptId, input: {format: 'text'}});
      const result = await handler(new Request(config.card.url + example.RECOVERY_EXAMPLE_ROUTE, {method: 'POST', headers: {authorization: 'Bearer ' + config.providerAccess, 'content-type': 'application/json'}, body}));
      const raw = await result.text(), value = JSON.parse(raw), after = memory.snapshot(), bytes = delta(redisBytes, bodyBefore);
      assert.equal(adapterExecutions, executionsBefore);
      assert.ok(bytes.restRequests <= 40, 'runtime command transport bound');
      const observation = {name, httpStatus: result.status, adapterExecutions: adapterExecutions - executionsBefore, requestBodyBytes: size(body), responseBodyBytes: size(raw), redis: {...bytes, commandsIncludingEvalAndLua: after.executionsIncludingEval - before.executionsIncludingEval}, scope: 'direct runtime protocol probe; not a new Bazaar wake or payment', recoveredTextMatches: result.status === 200 ? value.text === originalText && value.textHash === sellerHash(originalText) : false, ...(typeof value.error === 'string' ? {errorCode: value.error} : {})};
      runtimeRecoverySamples.push(observation); return observation;
    }
    assert.equal((await runtimeSample('runtime-replay-after-worker-delivered', environment)).httpStatus, 200);
    const alternateEnvironment = {...environment, BAZAAR_EXAMPLE_RUNTIME_PREFIX: 'bazaar-seller:preview-' + '3'.repeat(32)}, alternateLayout = recoveryExampleStorageContract(alternateEnvironment);
    const alternateBefore = memory.snapshot(), alternateBytesBefore = {...redisBytes};
    await initializeSellerStorage(command, alternateLayout.runtimePrefix, alternateLayout.runtimeBinding, []);
    const alternateRuntimeInitialization = {...delta(redisBytes, alternateBytesBefore), commandsIncludingEvalAndLua: memory.snapshot().executionsIncludingEval - alternateBefore.executionsIncludingEval, originalNamespaceIntact: true};
    assert.equal((await runtimeSample('runtime-delivered-order-empty-new-namespace', alternateEnvironment)).httpStatus, 409);
    assert.equal((await runtimeSample('runtime-delivered-order-foreign-attempt', environment, randomUUID())).httpStatus, 409);
    assert.equal(adapterExecutions, 2);
    const releaseEvidence = JSON.parse(await readFile('docs/evidence/free-margin-repair-production-budget-promotion-2026-10-12.json', 'utf8'));
    const sources = Object.fromEntries(await Promise.all(SOURCE_FILES.map(async path => [path, digest(await readFile(path))])));
    assert.equal(sources['examples/recovery-example-hosted-provider.mjs'], EXPECTED_RUNTIME_SHA256);
    const free = continuousFreeBudgetConfiguration({BAZAAR_FREE_DEMO_MODE: 'continuous'});
    // This full workflow is a conservative calculation, never a simulated
    // payment call. Observed worker samples are combined with current native
    // admission/financial/history envelopes; the hold is a safe peak bound.
    const connectedBuyer = budget();
    for (const name of ['readiness-cold', 'readiness-warm', 'deliver-paid-synthetic']) plus(connectedBuyer, samples.find(s => s.name === name).entireInvocationConservativeReservation);
    plus(connectedBuyer, reservation({profile: 'authenticated', newOperation: true, workload: 'order-create', credentialRead: true}));
    for (let i = 0; i < 2; i++) plus(connectedBuyer, reservation({profile: 'recovery', newOperation: false, workload: 'financial', credentialRead: true}));
    for (let i = 0; i < 2; i++) plus(connectedBuyer, reservation({profile: 'recovery', newOperation: false, workload: 'orders', credentialRead: true}));
    const additionalLostAckRecovery = samples.find(s => s.name === 'deliver-lost-ack-recovery-after-restart').entireInvocationConservativeReservation;
    const localWorkflowModel = {calls: 'connected buyer: one new order, cold readiness, HTTP 402 and one signed request, fresh warm readiness, one targeted delivery, get order and private order list', paymentRequestsExecuted: false, reservation: connectedBuyer, extraLostDeliveryAckRecoveryReservation: additionalLostAckRecovery, genericHeldTransferBytes: CONTINUOUS_FREE_OPERATION_RESERVATION.transferBytes, conservativePeakIncludingWholeHoldBytes: connectedBuyer.transferBytes + CONTINUOUS_FREE_OPERATION_RESERVATION.transferBytes, peakIntentionallyDoubleCountsHeldCreditsConsumedByFlow: true, visitorThroughputGuaranteed: false};
    const lastKnownCapacity = {capBytes: releaseEvidence.budget.transferLimitBytes, commandLimit: releaseEvidence.budget.commandLimit, committedBytes: releaseEvidence.budget.committedTransferBytes, reservedBytes: releaseEvidence.budget.reservedTransferBytes, remainingBytes: releaseEvidence.budget.remainingTransferBytes, genericHoldFitsBeforeAnyReadiness: releaseEvidence.budget.remainingTransferBytes >= CONTINUOUS_FREE_OPERATION_RESERVATION.transferBytes, deficitToGenericHoldBytes: Math.max(0, CONTINUOUS_FREE_OPERATION_RESERVATION.transferBytes - releaseEvidence.budget.remainingTransferBytes), acceptedOrFresh: false};
    return {schema: 'bazaar.recovery-example-budget-local/v2', status: 'PASS_SYNTHETIC_LOCAL_BUDGET_MEASUREMENT_NOT_HOSTED_ACCEPTANCE', observedAt: new Date().toISOString(), evidenceNonce: randomUUID(), service: {id: example.RECOVERY_EXAMPLE_SERVICE_ID, version: example.RECOVERY_EXAMPLE_SERVICE_VERSION, cardHash: publication.cardHash, input: {format: 'text'}, payloadBytes: size(originalText), price: '0.01', network: 'stellar:testnet'}, method: {worker: 'actual hosted seller, MCP SDK, HTTP adapter, exact new protected example runtime, example adapter and two AES-GCM Redis stores through injected in-memory transports', redis: 'exact current seller Lua protocol evaluator; EVAL plus each executed redis.call counted; worker and runtime ledgers both included', nativeBazaar: 'real ingress classifier and current conservative envelopes applied to each observed SDK request; no native Bazaar Redis execution is claimed', byteMeasurement: 'UTF-8 request/response body bytes; excludes URL, HTTP headers, TLS framing, compression and unknown provider invoice semantics', freshStoreAndRuntimePerInvocation: true, identityCacheMs: 1800000, invoiceSemanticsVerified: false}, initialization, samples, runtimeRecoverySamples, alternateRuntimeInitialization, localWorkflowModel, duplicateProtection: {twoDistinctSyntheticOrders: true, totalAdapterExecutions: adapterExecutions, sameAttemptAndTextAfterReplay: true, sameAttemptAndTextAfterLostAckRestart: true, missingRuntimeNamespaceNeverReexecutesDeliveredWorker: true, realPayments: 0}, unchangedAdmission: {localDefaultConfiguration: free, genericOperationHold: {...CONTINUOUS_FREE_OPERATION_RESERVATION}, workerWakeGate: {commands: 1004, transferBytes: 100004096}, changedProductionLimits: false, resizedAnyHold: false, resetAnyCounter: false}, productionCapacity: {freshReadPerformed: false, observationPath: 'docs/evidence/free-margin-repair-production-budget-promotion-2026-10-12.json', observationSha256: digest(await readFile('docs/evidence/free-margin-repair-production-budget-promotion-2026-10-12.json')), observationAt: releaseEvidence.observedAt ?? releaseEvidence.readAt ?? null, status: releaseEvidence.status, lastKnownCapacity, warning: 'Antecedente solamente: no confirma margen actual ni admisión del ejemplo. El servicio nuevo conserva la reserva genérica de 2 GB hasta una revisión explícita.'}, priorEvidencePreserved: {path: 'docs/evidence/recovery-example-budget-local-2026-10-12.json', sha256: digest(await readFile('docs/evidence/recovery-example-budget-local-2026-10-12.json')), expectedPriorSha256: 'f6d5c86e3468bfa82cb207446bea9bf87dbd5151124c79b5dfb0f15428fa842e'}, sources, limitations: ['No hosted worker, private buyer history or payment verified by these synthetic dependencies.', 'Payload totals are measurements of this tiny fixture; conservative guards cover larger shared state and retries and are not reduced.', 'Native Bazaar Redis commands and transfer were not measured as actual provider consumption.', 'No throughput benchmark or guaranteed purchases/day follows from one local fixture.', 'Real isolated Redis validation and protected Preview must be reported separately.'], externalNetworkRequests: 0, realRedisRequests: 0, cloudWrites: 0, realPayments: 0, productionChanged: false, cronActivated: false};
  } finally {
    globalThis.fetch = previousFetch;
    if (previousMode === undefined) delete process.env.BAZAAR_FREE_DEMO_MODE; else process.env.BAZAAR_FREE_DEMO_MODE = previousMode;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(value => value !== '--write-evidence')) throw Error('UNKNOWN_ARGUMENT');
  const evidence = await measureRecoveryExampleBudget();
  if (process.argv.includes('--write-evidence')) await writeFile(OUTPUT, JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({status: evidence.status, sampleCount: evidence.samples.length, runtimeRecoverySamples: evidence.runtimeRecoverySamples, servicePayloadBytes: evidence.service.payloadBytes, samples: evidence.samples.map(sample => ({name: sample.name, reason: sample.reason, workerRedisCommandsIncludingEvalAndLua: sample.workerRedis.commandsIncludingEvalAndLua, workerRedisPayloadBytes: sample.workerRedis.requestBodyBytes + sample.workerRedis.responseBodyBytes, mcpRequests: sample.mcpProtocolPayload.restRequests, identityRequests: sample.identityRequests, adapterExecutions: sample.adapterExecutions, conservativeReservedTransferBytes: sample.entireInvocationConservativeReservation.transferBytes})), genericHoldUnchanged: evidence.unchangedAdmission.genericOperationHold.transferBytes, externalNetworkRequests: 0, realPayments: 0, ...(process.argv.includes('--write-evidence') ? {evidence: OUTPUT} : {})}));
}
