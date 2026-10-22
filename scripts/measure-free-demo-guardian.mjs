// Native guardian + native durable stores, isolated REST/Lua protocol fixture.
// No network, signer, payment submission, cloud data or hosted test endpoint.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Keypair } from '@stellar/stellar-sdk';
import { createMarketGuardianRunner } from '../lib/market-guardian.ts';
import { createRedisWorkspaceStore, setWorkspaceStoreForTests, READ_WORKSPACE_LUA, COMMIT_WORKSPACE_LUA } from '../lib/workspace-store.ts';
import { createMarketStore, setMarketStoreForTests } from '../lib/marketplace-store.ts';
import { createMarketX402Store, setMarketX402StoreForTests } from '../lib/marketplace-x402-store.ts';
import { MARKET_CAPACITY_CAS } from '../lib/marketplace-capacity.ts';
import { pruneExpiredMarketContent } from '../lib/market-maintenance.ts';
import { createMarketX402Challenge, marketX402OrderBinding, setMarketX402DependenciesForTests } from '../lib/marketplace-x402.ts';
import { USDC_TESTNET_PAYMENT_IDENTITY } from '../lib/payment-assets.ts';
import { canonical, sha, orderMemo } from '../lib/marketplace-identity.ts';
import { createSellerCard } from '../examples/seller-service-card.mjs';
import { createWorkerRedisCommands } from '../examples/seller-redis-secret-store.mjs';

const marketPrefix = 'bazaar-market:pilot-' + '5a'.repeat(16), workspacePrefix = 'bazaar-workspace:pilot-' + '5a'.repeat(16);
const changedEnv = { BAZAAR_PUBLIC_DEMO: 'true', BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_ADMISSION: 'open', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_ENABLE_MARKETPLACE: 'true', BAZAAR_ENABLE_MARKET_PURCHASES: 'false', BAZAAR_X402_MARKETPLACE_ENABLED: 'false', BAZAAR_MARKET_PREFIX: marketPrefix, BAZAAR_OPERATIONAL_METER: 'false', BAZAAR_OPERATIONAL_BUDGET: 'false' };
const prior = Object.fromEntries(Object.keys(changedEnv).map(key => [key, process.env[key]]));
const realNow = Date.now, realFetch = globalThis.fetch;
let clock = realNow(), externalRequests = 0, checks = 0;
Object.assign(process.env, changedEnv); Date.now = () => clock;
globalThis.fetch = async () => { externalRequests++; throw Error('OFFLINE_GUARDIAN_ONLY'); };
function memory() {
  const data = new Map(); let topLevel = {}, lua = {}, restRequests = 0, loseWorkspaceAck = false, advanceMs = 0;
  const count = (map, name) => { map[name] = (map[name] ?? 0) + 1; };
  const call = (name, ...args) => {
    count(lua, name);
    if (name === 'GET') return data.get(args[0]) ?? null;
    if (name === 'SET') { data.set(args[0], String(args[1])); return 'OK'; }
    if (name === 'TIME') return [String(Math.floor(clock / 1000)), String(clock % 1000 * 1000)];
    throw Error('UNREVIEWED_GUARDIAN_LUA_PRIMITIVE');
  };
  const execute = command => {
    const [name, ...values] = command; restRequests++; count(topLevel, name); clock += advanceMs;
    if (name === 'GET') return data.get(values[0]) ?? null;
    assert.equal(name, 'EVAL');
    const [script, n, ...parts] = values, keys = parts.slice(0, +n), args = parts.slice(+n);
    if (script === READ_WORKSPACE_LUA) return keys.map(key => call('GET', key) ?? '');
    if (script === COMMIT_WORKSPACE_LUA) {
      for (let i = 0; i < 3; i++) if ((call('GET', keys[i]) ?? '') !== args[i]) return 0;
      call('SET', keys[0], args[3]); if (args[4] !== '') call('SET', keys[1], args[4]); call('SET', keys[2], 'workspace-v1');
      if (loseWorkspaceAck) { loseWorkspaceAck = false; throw Error('ISOLATED_WORKSPACE_ACK_LOST'); }
      return 1;
    }
    if (script === MARKET_CAPACITY_CAS) {
      for (const [ki, ai] of [[0, 0], [1, 2], [2, 4], [3, 9], [4, 11]]) {
        if (args[ai] === 'unchecked') continue;
        const old = call('GET', keys[ki]);
        if (args[ai] === 'missing' ? old !== null : old !== args[ai + 1]) return 0;
      }
      if (args[13] !== undefined && args[13] !== '') { call('TIME'); if (clock >= +args[13]) return -1; }
      for (let i = 0; i < 3; i++) if (args[6 + i] !== '') call('SET', keys[i], args[6 + i]);
      return 1;
    }
    throw Error('UNREVIEWED_GUARDIAN_LUA_SCRIPT');
  };
  const command = createWorkerRedisCommands({ url: 'https://synthetic.upstash.io', token: 'ISOLATED_SYNTHETIC_TOKEN', fetcher: async (_url, input) => Response.json({ result: execute(JSON.parse(input.body)) }) });
  const redis = { get: key => command(['GET', key]), eval: (script, keys, args) => command(['EVAL', script, keys.length, ...keys, ...args]) };
  const snapshot = () => ({ restRequests, topLevel: { ...topLevel }, luaExecuted: { ...lua }, commandsIncludingEval: Object.values(topLevel).reduce((a, b) => a + b, 0) + Object.values(lua).reduce((a, b) => a + b, 0) });
  return { data, redis, snapshot, reset() { topLevel = {}; lua = {}; restRequests = 0; }, loseAck() { loseWorkspaceAck = true; }, advance(value) { advanceMs = value; } };
}
async function fixture({ expired = false, uncertain = false } = {}) {
  const start = realNow(); clock = start - (expired ? 8 * 86400000 : 0);
  const m = memory(), workspace = createRedisWorkspaceStore(m.redis, workspacePrefix, () => ({ ownerIds: [], hashes: [] })), market = createMarketStore(m.redis, marketPrefix), settlements = createMarketX402Store(m.redis, marketPrefix);
  setWorkspaceStoreForTests(workspace); setMarketStoreForTests(market); setMarketX402StoreForTests(settlements);
  for (let i = 0; i < 20; i++) {
    const agentHash = sha('synthetic agent ' + i), input = { creationId: randomUUID(), humanAccessHash: sha('synthetic human ' + i), agentAccessHash: agentHash };
    await workspace.createWorkspace(input, sha('synthetic recovery ' + i), 'synthetic-ip-' + i);
    const principal = await workspace.resolveHash(agentHash);
    await workspace.forPrincipal(principal).recordQuery(principal.ownerId, { requestId: randomUUID(), tool: 'list_market_services', agentId: principal.agentId, recordedAt: new Date(clock).toISOString(), outcome: 'ok', inputHash: sha('synthetic input'), resultHash: sha('synthetic result'), evidence: 'bazaar-observed' });
  }
  clock = start;
  let rpcReads = 0, paymentSubmissions = 0;
  setMarketX402DependenciesForTests({ store: settlements, rpc: { async transaction() { rpcReads++; return { status: 'NOT_FOUND' }; } }, facilitator: { async verify() { paymentSubmissions++; throw Error('FORBIDDEN_PAYMENT_VERIFY'); }, async settle() { paymentSubmissions++; throw Error('FORBIDDEN_PAYMENT_SETTLE'); } } });
  if (uncertain) {
    const wallet = n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey(), buyer = 'ow_' + 'b'.repeat(32), seller = 'ow_' + 'a'.repeat(32);
    const { card, cardHash } = createSellerCard({ id: 'guardian-synthetic-text', name: 'Guardian fixture', description: 'Synthetic private text service for local measurement.', providerName: 'Local fixture', providerOrigin: 'https://provider.example', destination: wallet(2), amount: '0.01' });
    for (let i = 0; i < 2; i++) {
      const operationId = randomUUID(), input = { prompt: 'isolated synthetic input' }, time = new Date(clock).toISOString();
      const order = { operationId, buyerOwnerId: buyer, sellerOwnerId: seller, serviceId: card.id, cardHash, card, input, payer: wallet(1), destination: wallet(2), amount: '0.01', settlement: USDC_TESTNET_PAYMENT_IDENTITY, paymentProtocol: 'x402-stellar-exact-v2', inputHash: sha(canonical(input)), memoHash: orderMemo(buyer, operationId, cardHash, input), phase: 'payment-uncertain', settlementAttemptId: randomUUID(), transactionHash: sha('synthetic transaction ' + i), createdAt: time, updatedAt: time };
      await market.transact(state => state.orders.push(order));
      await settlements.transact(state => state.records.push({ operationId, buyerOwnerId: buyer, orderBinding: marketX402OrderBinding(order), challenge: createMarketX402Challenge(order, 'https://bazaar.example'), phase: 'uncertain', createdAt: time, updatedAt: time, attemptId: order.settlementAttemptId, payload: { x402Version: 2, payload: { transaction: 'SYNTHETIC_UNSUBMITTED' } }, payloadHash: sha('synthetic payload ' + i), authorizationFingerprint: sha('synthetic authorization ' + i), transactionHash: order.transactionHash }));
    }
  }
  m.reset();
  const run = createMarketGuardianRunner({ now: () => clock, cleanup: () => pruneExpiredMarketContent({ redis: m.redis, prefix: marketPrefix, now: clock, limit: 2 }) });
  return { m, run, rpcReads: () => rpcReads, paymentSubmissions: () => paymentSubmissions };
}
try {
  const scenarios = [];
  for (const [name, options] of [['idle-20-live-workspaces', {}], ['cleanup-20-expired-workspaces', { expired: true }], ['two-uncertain-reconciliations', { uncertain: true }], ['cleanup-and-two-uncertain', { expired: true, uncertain: true }], ['lost-workspace-ack', { expired: true }], ['duration-bound', { uncertain: true }]]) {
    const f = await fixture(options);
    if (name === 'lost-workspace-ack') f.m.loseAck();
    if (name === 'duration-bound') f.m.advance(15000);
    const result = await f.run(), counts = f.m.snapshot();
    assert.equal(f.paymentSubmissions(), 0); checks++;
    assert.equal(result.paymentResubmission, false); checks++;
    if (name === 'cleanup-20-expired-workspaces') { assert.equal(result.processedWorkspaceCount, 20); assert.equal(result.workspaces.reduce((sum, w) => sum + w.removed, 0), 20); checks += 2; }
    if (name === 'two-uncertain-reconciliations') { assert.equal(f.rpcReads(), 2); assert.equal(result.reconciliation.length, 2); assert.ok(result.reconciliation.every(row => !row.confirmed)); checks += 3; }
    if (name === 'cleanup-and-two-uncertain') { assert.equal(f.rpcReads(), 2); assert.equal(result.processedWorkspaceCount, 20); assert.equal(result.workspaces.reduce((sum, w) => sum + w.removed, 0), 20); checks += 3; }
    if (name === 'lost-workspace-ack') { assert.equal(result.needsOperator, true); assert.ok(result.workspaces.some(row => row.code === 'WORKSPACE_CLEANUP_UNCONFIRMED')); checks += 2; }
    if (name === 'duration-bound') { assert.equal(result.timeBound, true); checks++; }
    scenarios.push({ name, ...counts, rpcReads: f.rpcReads(), processedWorkspaceCount: result.processedWorkspaceCount, reconciliationAttempts: result.reconciliation.length, needsOperator: result.needsOperator, timeBound: result.timeBound, paymentSubmissions: f.paymentSubmissions() });
  }
  assert.equal(externalRequests, 0); checks++;
  const sourcePaths = ['lib/market-guardian.ts','lib/market-maintenance.ts','lib/workspace-store.ts','lib/marketplace-store.ts','lib/marketplace-x402-store.ts','lib/marketplace-capacity.ts','lib/marketplace-x402.ts'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
  console.log(JSON.stringify({ status: 'PASS_LOCAL_NATIVE_GUARDIAN_STORES', checks, method: 'Default native guardian snapshot/reconcile/store factories injected with actual Redis-backed stores; actual fixed REST adapter and exact-script isolated Lua interpreter; cleanup uses native prune with isolated Redis adapter.', scenarios, sourceHashes, externalRequests, hostedRedis: false, guardianRouteAuthAndFreeGateIncluded: false, signatureSuccessPathMeasured: false, globalUpperBoundProven: false, remainingReferences: ['Two successful cryptographic reconciliations and full expired market orders require their own measurements.', 'CAS conflicts, hostile/shared traffic, bytes, remote latency and provider billing are not covered.'], payments: 0, cloudWrites: 0, cronActivated: false, productionValidated: false }));
} finally {
  Date.now = realNow; globalThis.fetch = realFetch; setWorkspaceStoreForTests(undefined); setMarketStoreForTests(undefined); setMarketX402StoreForTests(undefined); setMarketX402DependenciesForTests(undefined);
  for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
}
