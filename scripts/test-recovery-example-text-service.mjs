import assert from 'node:assert/strict';
import {Keypair} from '@stellar/stellar-sdk';
import * as adapter from '../examples/recovery-example-text-service.mjs';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {marketCard} from '../lib/marketplace.ts';
import {createSellerRuntime} from '../examples/seller-runtime.mjs';
import {createSellerIntent,executeSellerIntent,recoverSellerIntent} from '../examples/seller-marketplace-worker.mjs';
import {sellerHash,sellerCanonical} from '../examples/seller-service-card.mjs';

const origin = 'https://recovery-example.invalid';
const destination = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 17)).publicKey();
const operationId = '10000000-0000-4000-8000-000000000001';
const attemptId = '20000000-0000-4000-8000-000000000001';
const packet = {operationId, attemptId, input: {format: 'text'}};
const publication = adapter.createRecoveryExampleCard({providerOrigin: origin, destination});
const coverage = [];

assert.deepEqual(marketCard(publication.card), publication.card);
assert.equal(publication.cardHash, computeCanonicalServiceCardHash(publication.card));
assert.equal(publication.card.id, adapter.RECOVERY_EXAMPLE_SERVICE_ID);
assert.equal(publication.card.routeTemplate, adapter.RECOVERY_EXAMPLE_ROUTE);
assert.equal(publication.card.payment.amount, '0.01');
assert.equal(publication.card.network, 'stellar:testnet');
assert.deepEqual(publication.card.input, [{name: 'format', type: 'string', required: true}]);
assert.equal(publication.card.delivery.retention.resultTtlHours, 168);
assert.deepEqual(publication.card.delivery.result.hash, {algorithm: 'sha256', required: true, scope: 'canonical-result'});
assert.equal(publication.card.delivery.idempotency.replay, 'return-original');
assert.equal(publication.card.delivery.retry.maxAttempts, 1);
assert.equal(Object.hasOwn(publication.card, 'cardHash'), false);
assert.throws(() => publication.card.payment.amount = '0.02', TypeError);
coverage.push('native card parser, canonical hash, fixed price and seven-day contract');

for (const replacement of [
  {network: 'stellar:mainnet'}, {amount: '0.02'}, {input: []}, {route: '/other'},
  {credential: 'unwanted'}, {id: 'other'},
]) assert.throws(() => adapter.createRecoveryExampleCard({providerOrigin: origin, destination, ...replacement}), /CONFIGURATION_REQUIRED/);
for (const badOrigin of ['http://recovery-example.invalid', origin + '/path', origin + '?key=x', 'https://user:password@recovery-example.invalid']) {
  assert.throws(() => adapter.createRecoveryExampleCard({providerOrigin: badOrigin, destination}));
}
assert.throws(() => adapter.createRecoveryExampleCard({providerOrigin: origin, destination: 'invalid'}));
assert.throws(() => marketCard({...structuredClone(publication.card), network: 'stellar:mainnet'}));
coverage.push('price, network, input, route and credential overrides rejected');

const original = await adapter.execute(packet);
assert.deepEqual(await adapter.execute(structuredClone(packet)), original);
assert.deepEqual(await adapter.execute({...packet, attemptId: '20000000-0000-4000-8000-000000000002'}), original);
assert.ok(original.text.includes(operationId));
assert.ok(original.text.includes(adapter.RECOVERY_EXAMPLE_SERVICE_VERSION));
assert.ok(original.text.length > 0 && original.text.length <= 2000);
assert.ok(Buffer.byteLength(original.text) < 1024);
assert.equal(/pago confirmado|pago verificado|payment confirmed/i.test(original.text), false);
assert.deepEqual(await adapter.availability(), {ready: true});
assert.deepEqual(await adapter.availability(), {ready: true});
for (const input of [null, [], {}, {format: 'html'}, {format: 'TEXT'}, {format: 1}, {format: 'text', prompt: 'private'}, {format: 'text', paymentVerified: true}]) {
  await assert.rejects(adapter.execute({...packet, input}), /INVALID_RECOVERY_EXAMPLE_INPUT/);
}
for (const id of ['', 'not-a-uuid', '00000000-0000-0000-0000-000000000000', operationId + '\n', operationId.toUpperCase().replace('1', 'A')]) {
  await assert.rejects(adapter.execute({...packet, operationId: id}), /INVALID_RECOVERY_EXAMPLE_INPUT/);
  await assert.rejects(adapter.execute({...packet, attemptId: id}), /INVALID_RECOVERY_EXAMPLE_INPUT/);
}
for (const malformed of [undefined, null, [], {...packet, wallet: destination}, {...packet, operationId: 123}, Object.assign(Object.create({}), packet)]) {
  await assert.rejects(adapter.execute(malformed), /INVALID_RECOVERY_EXAMPLE_INPUT/);
}
coverage.push('strict packet and UUID validation; deterministic bounded text without payment claim');

// This test store models a durable journal across handler recreation; it is never used by hosted code.
function memoryStore() {
  const journals = new Map(), held = new Set();
  return {
    read: async name => {assert.equal(name, 'seller-config'); return {};},
    acquireLock: async name => {
      if (held.has(name)) throw Error('STORE_LOCKED');
      held.add(name);
      return async () => held.delete(name);
    },
    journal: name => ({
      read: async () => {
        if (!journals.has(name)) throw Object.assign(Error('missing'), {code: 'ENOENT'});
        return structuredClone(journals.get(name));
      },
      initialize: async value => {
        if (journals.has(name)) throw Error('JOURNAL_EXISTS');
        journals.set(name, structuredClone(value));
      },
      append: async value => {
        if (!journals.has(name)) throw Error('JOURNAL_MISSING');
        journals.set(name, structuredClone(value));
      },
    }),
  };
}
const store = memoryStore(), providerAccess = 't'.repeat(43);
let runtimeExecutions = 0;
const countedAdapter = {...adapter, execute: async value => {runtimeExecutions++; return adapter.execute(value);}};
const runtime = () => createSellerRuntime({adapter: countedAdapter, store, providerAccess, route: adapter.RECOVERY_EXAMPLE_ROUTE});
const request = (value = packet, access = providerAccess) => new Request(origin + adapter.RECOVERY_EXAMPLE_ROUTE, {
  method: 'POST', headers: {authorization: 'Bearer ' + access, 'content-type': 'application/json'}, body: JSON.stringify(value),
});
assert.equal((await runtime()(request(packet, 'x'.repeat(43)))).status, 401);
assert.equal(runtimeExecutions, 0);
const lostResponse = await runtime()(request());
assert.equal(lostResponse.status, 200); // Discard the response; the journal already holds the original result.
assert.equal(runtimeExecutions, 1);
const recoveredResponse = await runtime()(request());
assert.equal(recoveredResponse.status, 200);
const recoveredText = await recoveredResponse.json();
assert.equal(recoveredText.text, original.text);
assert.equal(recoveredText.textHash, sellerHash(original.text));
assert.equal(runtimeExecutions, 1);
assert.equal((await runtime()(request({...packet, input: {format: 'html'}}))).status, 409);
assert.equal((await runtime()(request({...packet, attemptId: '20000000-0000-4000-8000-000000000002'}))).status, 409);
assert.equal(runtimeExecutions, 1);
const availabilityResponse = await runtime()(new Request(origin + adapter.RECOVERY_EXAMPLE_ROUTE + '/availability', {headers: {authorization: 'Bearer ' + providerAccess}}));
assert.equal(availabilityResponse.status, 200);
assert.deepEqual(await availabilityResponse.json(), {ready: true, network: 'stellar:testnet'});
assert.equal(runtimeExecutions, 1);
coverage.push('authenticated runtime response loss and handler restart recover one frozen execution');

function workerFixture() {
  const ownerId = 'synthetic-example-seller', agentId = '30000000-0000-4000-8000-000000000001';
  const intent = createSellerIntent({operationId, attemptId, cardHash: publication.cardHash, serviceId: publication.card.id, providerOrigin: origin, providerRoute: adapter.RECOVERY_EXAMPLE_ROUTE, ownerId, agentId});
  let executions = 0, loseDelivery = false;
  let order = {
    operationId, cardHash: publication.cardHash, serviceId: publication.card.id, card: structuredClone(publication.card),
    sellerOwnerId: ownerId, buyerOwnerId: 'synthetic-example-buyer', perspective: 'sale', phase: 'paid',
    input: {format: 'text'}, inputHash: sellerHash(sellerCanonical({format: 'text'})),
    paymentProtocol: 'x402-stellar-exact-v2', amount: '0.01', destination,
    settlement: structuredClone(publication.card.payment.identity),
    // Synthetic dependencies only: these values never bypass or contact the hosted payment verifier.
    transactionHash: 'b'.repeat(64), paymentVerifiedAt: '2026-10-12T12:00:00.000Z',
  };
  const snapshots = [];
  const reply = value => ({isError: false, content: [], structuredContent: value});
  const options = {
    persistIntent: async value => snapshots.push(structuredClone(value)),
    adapter: {execute: async value => {
      assert.equal(snapshots.at(-1).phase, 'provider-started');
      executions++; return adapter.execute(value);
    }},
    callTool: async (name, args) => {
      if (name === 'get_market_order') return reply({order: structuredClone(order)});
      if (name === 'claim_market_order') order = {...order, phase: 'executing', attemptId: args.attemptId, agentId};
      else if (name === 'deliver_market_order') {
        order = {...order, phase: 'delivered', delivery: {text: args.text, sha256: sellerHash(args.text), reference: 'bazaar-order:' + operationId}};
        if (loseDelivery) {loseDelivery = false; throw Error('LOST_DELIVERY_RESPONSE');}
      } else throw Error('UNEXPECTED_LOCAL_TOOL');
      return reply({order: structuredClone(order)});
    },
  };
  return {intent, options, snapshots, get order() {return order;}, set order(value) {order = value;}, get executions() {return executions;}, set loseDelivery(value) {loseDelivery = value;}};
}
for (const change of [
  value => {value.phase = 'awaiting-payment'; delete value.paymentVerifiedAt; delete value.transactionHash;},
  value => value.sellerOwnerId = 'another-seller',
  value => value.destination = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 18)).publicKey(),
  value => value.amount = '0.02',
]) {
  const f = workerFixture(); const changed = structuredClone(f.order); change(changed); f.order = changed;
  await assert.rejects(executeSellerIntent(f.intent, f.options));
  assert.equal(f.executions, 0);
}
const delivered = workerFixture();
await executeSellerIntent(delivered.intent, delivered.options);
assert.equal(delivered.order.phase, 'delivered');
assert.equal(delivered.order.delivery.text, original.text);
assert.equal(delivered.order.delivery.sha256, sellerHash(original.text));
assert.equal(delivered.executions, 1);
await assert.rejects(executeSellerIntent(delivered.intent, delivered.options), /EXISTING_INTENT_REQUIRES_RECOVERY/);
assert.equal(delivered.executions, 1);
const lostDelivery = workerFixture(); lostDelivery.loseDelivery = true;
await assert.rejects(executeSellerIntent(lostDelivery.intent, lostDelivery.options), /LOST_DELIVERY_RESPONSE/);
assert.equal(lostDelivery.intent.phase, 'delivery-uncertain');
const restoredIntent = structuredClone(lostDelivery.snapshots.at(-1));
await recoverSellerIntent(restoredIntent, lostDelivery.options);
assert.equal(restoredIntent.operationId, operationId);
assert.equal(restoredIntent.phase, 'delivered');
assert.equal(restoredIntent.text, original.text);
assert.equal(restoredIntent.textHash, sellerHash(original.text));
assert.equal(lostDelivery.executions, 1);
coverage.push('existing worker rejects unpaid, foreign or changed orders; lost delivery acknowledgement recovers one execution');

console.log(JSON.stringify({status: 'PASS_LOCAL_RECOVERY_EXAMPLE', coverage, runtimeExecutions, externalRequests: 0, realPayments: 0, hostedChanges: 0, paymentValidation: 'synthetic dependencies only', historyValidation: 'same-order local recovery; not hosted private history'}));
