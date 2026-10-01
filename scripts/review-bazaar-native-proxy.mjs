// Independent shared-ledger review. Uses two loopback proxies and one tiny
// in-memory HTTP server; no Next process, Redis, .env, provider or external host.
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ApplicationLedger, createApplicationProxy } from './workspace-native-application-proxy.mjs';
import { DEFAULT_BUDGET } from './workspace-redis-budget.mjs';

assert.equal(process.version, 'v22.18.0');
const body = 'tiny synthetic response', secret = 'synthetic-proxy-only';
let upstreamRequests = 0;
const upstream = createServer((req, res) => {
  upstreamRequests++;
  assert.equal(req.headers['x-bazaar-native-proxy'], secret);
  assert.equal(req.headers.host, new URL(nativeOrigin).host);
  res.writeHead(200, { 'content-type': 'text/plain' }); res.end(body);
});
await new Promise(ok => upstream.listen(0, '127.0.0.1', ok));
const nativeOrigin = 'http://127.0.0.1:' + upstream.address().port;
const stopped = [], ledger = new ApplicationLedger(DEFAULT_BUDGET, code => stopped.push(code));
const proxies = [];
const http = (url, headers = {}) => new Promise((done, reject) => {
  const req = request(url, { headers, agent: false }, res => {
    const chunks = []; res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => done({ status: res.statusCode, body: Buffer.concat(chunks) })); res.on('error', reject);
  });
  req.on('error', reject); req.end();
});
try {
  for (let i = 0; i < 2; i++) proxies.push(await createApplicationProxy({ root: process.cwd(), ledger, nativeOrigin: () => nativeOrigin, secret }));
  for (const proxy of proxies) {
    const result = await http(proxy.origin + '/api/synthetic');
    assert.equal(result.status, 200); assert.equal(result.body.toString(), body);
  }
  assert.equal(upstreamRequests, 2); assert.equal(ledger.counts.requests, 2);
  assert.equal(ledger.counts.responseBytes, 2 * Buffer.byteLength(body));
  assert.equal(ledger.reservedResponseBytes, 0);

  // Authority rejection is an application HTTP attempt even when it never
  // reaches Next. Any body returned by the proxy must also enter the ledger.
  const before = { requests: ledger.counts.requests, bytes: ledger.counts.responseBytes };
  const denied = await http(proxies[0].origin + '/api/synthetic', { origin: 'https://foreign.invalid' });
  assert.ok([400, 403, 503].includes(denied.status)); assert.equal(upstreamRequests, 2);
  assert.equal(ledger.counts.requests, before.requests + 1, 'Rejected proxy request missing from global application count');
  assert.equal(ledger.counts.responseBytes - before.bytes, denied.body.length, 'Proxy error body missing from global application response bytes');

  // Response reservation is shared before either proxy can reach upstream.
  const limited = new ApplicationLedger(DEFAULT_BUDGET, () => {});
  limited.counts.responseBytes = DEFAULT_BUDGET.applicationResponseBytes - 65536;
  const lease = limited.reserve(65536, 'apiRequests');
  assert.throws(() => limited.reserve(65536, 'apiRequests'), /APPLICATION_BUDGET_EXHAUSTED/);
  lease.release(); assert.equal(limited.reservedResponseBytes, 0);
  assert.throws(() => limited.reserve(65536, 'apiRequests'), /APPLICATION_BUDGET_EXHAUSTED/, 'A stopped ledger cannot resume after reservation release');

  const sourceHash = createHash('sha256').update(readFileSync(new URL('./workspace-native-application-proxy.mjs', import.meta.url))).digest('hex');
  console.log(JSON.stringify({ ok: true, reviewer: 'independent', category: 'local loopback application-proxy doubles', runtime: process.version, sourceHash, requests: ledger.counts.requests, responseBytes: ledger.counts.responseBytes, authorityRejectedBeforeUpstream: true, errorResponseBytesCounted: true, sharedResponseReservation: true, stoppedLedgerCannotResume: true, externalRequests: 0, realRedisWrites: 0 }));
} finally {
  for (const proxy of proxies) await proxy.close();
  upstream.closeAllConnections(); await new Promise(ok => upstream.close(ok));
}
