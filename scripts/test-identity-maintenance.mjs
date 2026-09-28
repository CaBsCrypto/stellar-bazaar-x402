import assert from 'node:assert/strict';
import { authenticateHistory, generateHistoryKeypair } from '../lib/operation-history-auth.ts';
import { createHistoryHandlers } from '../lib/operation-history-http.ts';
import { createDeliverableHandlers } from '../lib/deliverable-http.ts';

// Real handlers and the real environment-default auth path; storage is a read-only double.
// No network, credentials on disk, Redis, payments or environment changes outside this process.
const previous = process.env.BAZAAR_HISTORY_ACCOUNTS_JSON;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network forbidden in maintenance regression'); };
const a = generateHistoryKeypair(), b = generateHistoryKeypair();
const account = ({ ownerId, readTokenHash, writeTokenHash }) => ({ ownerId, readTokenHash, writeTokenHash });
const configuration = JSON.stringify([account(a), account(b)]);
const operation = Object.freeze({ clientOperationId: 'maintenance-synthetic-operation', mode: 'mock' });
const delivery = Object.freeze({ operationId: operation.clientOperationId, manifest: { versionId: 'maintenance-synthetic-v1' } });
let reads = 0, writes = 0, factories = 0;
const historyStore = {
  async list(owner) { reads++; return owner === a.ownerId ? [operation] : []; },
  async all(owner) { reads++; return owner === a.ownerId ? [operation] : []; },
  async append() { writes++; throw new Error('Writes forbidden'); },
};
const deliveryStore = {
  async list(owner) { reads++; return owner === a.ownerId ? [delivery] : []; },
  async usage() { reads++; return 0; },
  async reserve() { writes++; throw new Error('Writes forbidden'); },
};
const history = createHistoryHandlers({ store: () => { factories++; return historyStore; } });
const deliveries = createDeliverableHandlers({
  history: () => { factories++; return historyStore; },
  store: () => { factories++; return deliveryStore; },
  objects: () => { throw new Error('External files forbidden'); },
});
const request = (path, token, method = 'GET') => new Request('http://127.0.0.1' + path, {
  method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  ...(method === 'POST' ? { body: '{}' } : {}),
});
const deliveryPath = '/api/deliveries?operationId=' + operation.clientOperationId;
async function readSameDelivery() {
  const operations = await history.GET(request('/api/operations', a.readToken));
  assert.equal(operations.status, 200);
  assert.deepEqual((await operations.json()).records, [operation]);
  const result = await deliveries.GET(request(deliveryPath, a.readToken));
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).versions, [delivery]);
  assert.equal((await deliveries.GET(request(deliveryPath, b.readToken))).status, 404);
}
try {
  process.env.BAZAAR_HISTORY_ACCOUNTS_JSON = configuration;
  await readSameDelivery();
  const before = { reads, writes, factories };
  delete process.env.BAZAAR_HISTORY_ACCOUNTS_JSON;
  for (const token of [a.readToken, a.writeToken, b.readToken, b.writeToken, 'bz_read_' + 'f'.repeat(48)]) {
    assert.throws(() => authenticateHistory('Bearer ' + token), error => error.code === 'UNAUTHORIZED');
    assert.equal((await history.GET(request('/api/operations', token))).status, 401);
    assert.equal((await history.POST(request('/api/operations', token, 'POST'))).status, 401);
    assert.equal((await deliveries.GET(request(deliveryPath, token))).status, 401);
    assert.equal((await deliveries.POST(request('/api/deliveries', token, 'POST'))).status, 401);
  }
  assert.deepEqual({ reads, writes, factories }, before, 'Maintenance must reject before accessing storage');
  process.env.BAZAAR_HISTORY_ACCOUNTS_JSON = configuration;
  await readSameDelivery();
  assert.equal(writes, 0);
  assert.equal((await history.POST(request('/api/operations', a.readToken, 'POST'))).status, 403);
  console.log('PASS configured -> absent -> restored: same synthetic delivery, owner isolation, no storage access while closed, zero writes and no network. Local behavior only; no Vercel propagation tested.');
} finally {
  if (previous === undefined) delete process.env.BAZAAR_HISTORY_ACCOUNTS_JSON;
  else process.env.BAZAAR_HISTORY_ACCOUNTS_JSON = previous;
  globalThis.fetch = originalFetch;
}
