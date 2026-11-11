import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createMarketOrderRepository} from '../lib/market-order-repository.ts';
import {MARKET_ORDER_REPOSITORY_ADMISSION_PAGE} from '../lib/market-order-repository-lua.ts';
import {perOrderAdmissionSnapshot, setMarketOrderRepositoryForTests} from '../lib/market-order-storage.ts';
import {setMarketStoreForTests} from '../lib/marketplace-store.ts';
import {perOrderNativeRedisDescriptor} from '../lib/per-order-transport-budget.ts';

const digest = value => createHash('sha256').update(value).digest('hex');
const prefix = 'bazaar-market:pilot-' + 'a'.repeat(32);
const namespace = prefix + ':orders:v2:';
const seller = 'ow_' + 'b'.repeat(32), buyer = 'ow_' + 'c'.repeat(32);
const sellerPendingKey = namespace + 'seller-pending:' + digest(seller);
const revisionKey = sellerPendingKey + ':revision';
const cardHash = 'd'.repeat(64);
const serviceId = 'guionista-bazaar-production-text-v1';
const now = Date.parse('2028-02-29T12:30:03.123Z');
const initialRevision = randomUUID();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

const environment = {
  NODE_ENV: 'production', VERCEL_ENV: 'production',
  BAZAAR_MARKET_ORDER_STORAGE: 'per-order-v1', BAZAAR_WORKSPACE_BACKEND: 'redis',
  BAZAAR_FREE_DEMO_MODE: 'continuous', BAZAAR_FREE_PLAN_TRANSPORT_PROFILE: 'compact-registry-v2',
  BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES: '9900000000',
  BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON: '{"public":115000,"authenticated":90000,"recovery":105000,"background":50000}',
  BAZAAR_MARKET_PREFIX: prefix, BAZAAR_WORKSPACE_PREFIX: prefix.replace('market:', 'workspace:'),
  BAZAAR_TEXT_SELLER_MODE: 'on-demand', BAZAAR_TEXT_SELLER_SERVICE_ID: serviceId,
  BAZAAR_TEXT_SELLER_CARD_HASH: cardHash, BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT: digest(seller),
  BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID: '31c97193-be74-4b9d-b0a3-f3890b0a41e8',
};

test('an incomplete seller-pending page stops admission; the next read uses the new revision', async () => {
  const saved = Object.fromEntries([...Object.keys(environment), 'BAZAAR_PUBLIC_BUYER_ADMISSION_JSON', 'BAZAAR_FREE_DEMO_ADMISSION_UNTIL'].map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  delete process.env.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON;
  delete process.env.BAZAAR_FREE_DEMO_ADMISSION_UNTIL;
  try {
    let revision = initialRevision, reads = 0;
    const rows = Array.from({length: 51}, (_, i) => ({
      version: 1, operationId: randomUUID(), buyerOwnerId: i === 50 ? buyer : 'ow_' + digest('buyer-' + i).slice(0, 32), sellerOwnerId: seller,
      createdAt: new Date(now - 310000 - i * 1000).toISOString(), cardHash, serviceId,
      intentHash: 'e'.repeat(64), binding: 'f'.repeat(64), phase: i === 50 ? 'payment-uncertain' : 'awaiting-payment',
      sellerReservation: {day: '2028-02-29', expiresAt: new Date(now - 1).toISOString(), committed: i === 50},
    }));
    const retained = rows[50];
    // Emulate the EVAL response contract: even after compaction the original
    // window and revision are returned. No mutation of order documents occurs.
    const repo = createMarketOrderRepository({async eval(script, keys, args) {
      reads++;
      assert.equal(script, MARKET_ORDER_REPOSITORY_ADMISSION_PAGE);
      assert.deepEqual(keys, [sellerPendingKey, revisionKey]);
      assert.deepEqual(args.slice(0, 5), ['+', '51', namespace, seller, 'seller-pending']);
      assert.match(args[5], uuid);
      const metered = await perOrderNativeRedisDescriptor(['EVAL', script, 2, ...keys, ...args]);
      assert.equal(metered.commands, 58);
      assert.equal(metered.responseBytes, 2 * (4096 * 50 + 51 * 64 + 36) + 8192);
      const response = [revision, rows.map(row => `${row.createdAt}|${row.operationId}`), rows.slice(0, 50).map(row => JSON.stringify(row))];
      if (rows.length === 51) {
        rows.splice(0, 50);
        revision = args[5];
      }
      return response;
    }}, prefix, {continuous: true});
    setMarketOrderRepositoryForTests(repo);
    setMarketStoreForTests({async orderAdmissionSnapshot() { return {state: {version: 1, services: [], orders: []}, guard: {keys: [], values: []}}; }});

    await assert.rejects(perOrderAdmissionSnapshot(buyer, seller), {code: 'PER_ORDER_ADMISSION_WINDOW_CAPACITY'});
    assert.equal(reads, 1, 'no reread or financial continuation in the incomplete request');
    const current = await perOrderAdmissionSnapshot(buyer, seller);
    assert.deepEqual(current.state.orders, [retained], 'the previously unseen pending payment remains counted');
    assert.notEqual(revision, initialRevision);
    assert.deepEqual(current.guard, {keys: [revisionKey], values: [revision]});
    assert.equal(reads, 2);

    const descriptor = (...args) => perOrderNativeRedisDescriptor(['EVAL', MARKET_ORDER_REPOSITORY_ADMISSION_PAGE, 2, sellerPendingKey, revisionKey, ...args]);
    await assert.rejects(descriptor('+', '51', namespace, seller, 'seller-pending'), {code: 'PER_ORDER_TRANSPORT_BUDGET'});
    await assert.rejects(descriptor('+', '51', namespace, seller, 'seller-pending', 'bad-revision'), {code: 'PER_ORDER_TRANSPORT_BUDGET'});
    assert.equal((await descriptor('+', '50', namespace, seller, 'seller-pending', randomUUID())).commands, 54);
    assert.equal((await descriptor(`(${retained.createdAt}|${retained.operationId}`, '51', namespace, seller, 'seller-pending', randomUUID())).commands, 55);
  } finally {
    setMarketOrderRepositoryForTests(undefined);
    setMarketStoreForTests(undefined);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
