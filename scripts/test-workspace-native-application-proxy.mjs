import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { ApplicationLedger, createApplicationProxy, responseReservation } from './workspace-native-application-proxy.mjs';
import { DEFAULT_BUDGET } from './workspace-redis-budget.mjs';

assert.equal(process.version, 'v22.18.0');
let nativeSends = 0;
const upstream = createServer(async (request, response) => {
  nativeSends++;
  assert.equal(request.headers['x-bazaar-native-proxy'], 'synthetic-proxy-secret');
  assert.equal(request.headers.host, new URL(nativeOrigin).host);
  assert.equal(request.headers.origin, nativeOrigin);
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  if (request.url === '/oversized') { response.end('x'.repeat(65537)); return; }
  if (request.url === '/compressed') { const bytes = gzipSync('x'.repeat(131072)); response.writeHead(200, { 'content-encoding': 'gzip', 'content-length': bytes.length }); response.end(bytes); return; }
  response.writeHead(401, { 'content-type': 'application/json' }); response.end(JSON.stringify({ receivedBytes: Buffer.concat(chunks).length }));
});
await new Promise(done => upstream.listen(0, '127.0.0.1', done)); const nativeOrigin = 'http://127.0.0.1:' + upstream.address().port;
const stops = [], ledger = new ApplicationLedger(DEFAULT_BUDGET, code => stops.push(code));
const proxy = await createApplicationProxy({ root: process.cwd(), ledger, nativeOrigin: () => nativeOrigin, secret: 'synthetic-proxy-secret' });
try {
  const valid = await fetch(proxy.origin + '/api/example', { method: 'POST', headers: { origin: proxy.origin }, body: 'abc' });
  assert.equal(valid.status, 401); assert.deepEqual(await valid.json(), { receivedBytes: 3 }); assert.equal(ledger.counts.requestBytes, 3); assert.equal(ledger.counts.responseBytes, Buffer.byteLength('{"receivedBytes":3}'));
  const beforeRejected = nativeSends, beforeBytes = ledger.counts.responseBytes;
  const rejected = await fetch(proxy.origin + '/api/example', { method: 'POST', headers: { origin: 'http://foreign.invalid' }, body: 'attempt' });
  assert.equal(rejected.status, 503); await rejected.arrayBuffer(); assert.equal(nativeSends, beforeRejected); assert.equal(ledger.counts.requests, 2); assert.equal(ledger.counts.observedRequests, 2); assert.equal(ledger.counts.requestBytes, 10); assert.equal(ledger.counts.responseBytes - beforeBytes, Buffer.byteLength('{"error":"APPLICATION_STOPPED"}'));
  const beforeCompressed = ledger.counts.responseBytes;
  const compressed = await fetch(proxy.origin + '/compressed', { headers: { origin: proxy.origin } }); assert.equal((await compressed.text()).length, 131072);
  assert.equal(ledger.counts.responseBytes - beforeCompressed, gzipSync('x'.repeat(131072)).length, 'Count encoded network body, not decompressed text');
  const sendsBeforeBudget = nativeSends; ledger.counts.requests = DEFAULT_BUDGET.applicationRequests;
  await assert.rejects(fetch(proxy.origin + '/api/example', { headers: { origin: proxy.origin } })); assert.equal(nativeSends, sendsBeforeBudget, 'Global request budget denies before native send'); assert.equal(ledger.stopped, 'APPLICATION_BUDGET_EXHAUSTED');
} finally { await proxy.close(); }
const oversizedLedger = new ApplicationLedger(DEFAULT_BUDGET, code => stops.push(code)), oversizedProxy = await createApplicationProxy({ root: process.cwd(), ledger: oversizedLedger, nativeOrigin: () => nativeOrigin, secret: 'synthetic-proxy-secret' });
try {
  await assert.rejects(fetch(oversizedProxy.origin + '/oversized', { headers: { origin: oversizedProxy.origin } }));
  assert.equal(oversizedLedger.stopped, 'APPLICATION_RESPONSE_BYTES_EXHAUSTED'); assert.equal(oversizedLedger.counts.responseBytes, 65537); assert.equal(oversizedLedger.reservedResponseBytes, 0);
} finally { await oversizedProxy.close(); upstream.closeAllConnections(); await new Promise(done => upstream.close(done)); }
const concurrent = new ApplicationLedger(DEFAULT_BUDGET, () => {}); concurrent.counts.responseBytes = DEFAULT_BUDGET.applicationResponseBytes - 65536;
const reserved = concurrent.reserve(65536, 'apiRequests'); assert.throws(() => concurrent.reserve(65536, 'apiRequests'), { message: 'APPLICATION_BUDGET_EXHAUSTED' }); reserved.release(); assert.equal(concurrent.reservedResponseBytes, 0);
const deadline = new ApplicationLedger(DEFAULT_BUDGET, () => {}, Date.now() - DEFAULT_BUDGET.elapsedMs); assert.throws(() => deadline.reserve(65536, 'pageRequests'), { message: 'APPLICATION_BUDGET_EXHAUSTED' });
const individualLimit = new ApplicationLedger(DEFAULT_BUDGET, () => {}); assert.throws(() => individualLimit.reserve(65537, 'staticRequests'), { message: 'APPLICATION_BUDGET_EXHAUSTED' }); assert.equal(individualLimit.counts.requests, 0);
const invalidCount = new ApplicationLedger(DEFAULT_BUDGET, () => {}), invalidLease = invalidCount.reserve(65536, 'apiRequests'); assert.throws(() => invalidLease.request(-1), { message: 'APPLICATION_INVALID_BYTE_COUNT' }); invalidLease.release();
assert.equal(responseReservation(process.cwd(), '/_next/static/large.js'), 65536, 'Static assets retain prior individual response limit');
console.log(JSON.stringify({ ok: true, category: 'local application proxy doubles only', runtime: process.version, sharedRequestAndByteLedger: true, rejectedAuthorityAndErrorBodyCounted: true, noBudgetRejectedNativeSend: true, encodedBodyBytesCounted: true, allResponsesLimitedTo65536: true, oversizedObservedChunkCountedAndStopped: true, concurrentReservation: true, globalDeadline: true, externalRequests: 0 }));
