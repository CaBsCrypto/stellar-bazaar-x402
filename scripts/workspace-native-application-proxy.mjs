import { createServer, request } from 'node:http';

// One shared ledger is passed to every proxy. Browser assets, API, MCP,
// readiness requests, failed responses and process restarts share its limits.
export class ApplicationLedger {
  constructor(budget, stop, started = Date.now()) {
    this.budget = budget; this.stopExecution = stop; this.started = started;
    this.stopped = null; this.reservedResponseBytes = 0;
    this.counts = { requests: 0, observedRequests: 0, requestBytes: 0, responseBytes: 0, rejected: 0, uncertain: 0, staticRequests: 0, apiRequests: 0, pageRequests: 0 };
  }
  stop(code, uncertain = false) {
    this.stopped ??= code; this.counts.rejected++; if (uncertain) this.counts.uncertain++;
    this.stopExecution(this.stopped); throw Error(this.stopped);
  }
  reserve(responseLimit, category) {
    this.counts.observedRequests++;
    if (this.stopped || Date.now() - this.started >= this.budget.elapsedMs || !Number.isSafeInteger(responseLimit) || responseLimit < 1 || responseLimit > 65536 || this.counts.requests + 1 > this.budget.applicationRequests || this.counts.responseBytes + this.reservedResponseBytes + responseLimit > this.budget.applicationResponseBytes) return this.stop('APPLICATION_BUDGET_EXHAUSTED');
    this.counts.requests++; this.counts[category]++; this.reservedResponseBytes += responseLimit;
    let read = 0, released = false;
    return {
      request: n => { if (!Number.isSafeInteger(n) || n < 0) this.stop('APPLICATION_INVALID_BYTE_COUNT'); this.counts.requestBytes += n; if (this.counts.requestBytes > this.budget.applicationRequestBytes) this.stop('APPLICATION_REQUEST_BYTES_EXHAUSTED'); },
      response: n => { if (!Number.isSafeInteger(n) || n < 0) this.stop('APPLICATION_INVALID_BYTE_COUNT'); read += n; this.counts.responseBytes += n; if (read > responseLimit || this.counts.responseBytes > this.budget.applicationResponseBytes) this.stop('APPLICATION_RESPONSE_BYTES_EXHAUSTED', true); },
      release: () => { if (!released) { released = true; this.reservedResponseBytes -= responseLimit; } },
    };
  }
  report() { return { ...this.counts, stopped: this.stopped, elapsedMs: Date.now() - this.started, reservedResponseBytes: this.reservedResponseBytes, byteAccounting: 'HTTP body bytes at shared proxy, including encoded browser assets; headers/TCP excluded', allBrowserMcpAndNextRequestsCounted: true }; }
}

export function responseReservation(root, path) {
  // Retain the executor's existing individual application response limit.
  // Browser compression does not permit a larger reservation or body.
  return 65536;
}

export async function createApplicationProxy({ root, ledger, nativeOrigin, secret }) {
  const pending = new Set(); let origin;
  const server = createServer(async (req, res) => {
    let lease, upstream;
    try {
      const path = req.url ?? '/';
      const category = path.startsWith('/_next/') ? 'staticRequests' : path.startsWith('/api/') ? 'apiRequests' : 'pageRequests';
      lease = ledger.reserve(responseReservation(root, path), category);
      const chunks = []; let requestSize = 0;
      for await (const chunk of req) { requestSize += chunk.length; lease.request(chunk.length); if (requestSize > 65536) ledger.stop('APPLICATION_REQUEST_TOO_LARGE'); chunks.push(chunk); }
      const parsed = new URL(path, origin);
      if (parsed.origin !== origin || req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || ['forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-bazaar-native-proxy'].some(name => name in req.headers)) throw Error('APPLICATION_PROXY_AUTHORITY_REJECTED');
      const target = new URL(nativeOrigin()), nativePort = target.port;
      const headers = { ...req.headers, host: target.host, 'x-forwarded-host': target.host, 'x-forwarded-proto': 'http', 'x-forwarded-port': nativePort, 'x-bazaar-native-proxy': secret, 'accept-encoding': req.headers['accept-encoding'] ?? 'identity' };
      if (headers.origin) headers.origin = target.origin;
      delete headers['proxy-connection']; delete headers['transfer-encoding']; headers['content-length'] = requestSize;
      upstream = request(new URL(path, target), { method: req.method, headers, agent: false, maxHeaderSize: 16384 }, response => {
        const collected = [];
        response.on('data', chunk => {
          try { lease.response(chunk.length); collected.push(chunk); }
          catch { failed(); response.destroy(); upstream.destroy(); }
        });
        response.on('end', () => {
          if (ledger.stopped) { finish(); res.destroy(); return; }
          const outgoing = { ...response.headers }; delete outgoing['transfer-encoding']; outgoing['content-length'] = Buffer.concat(collected).length;
          res.writeHead(response.statusCode ?? 502, outgoing); res.end(Buffer.concat(collected));
          finish();
        });
        response.on('error', failed);
      });
      const timeout = setTimeout(() => upstream.destroy(Error('APPLICATION_UPSTREAM_TIMEOUT')), 5000);
      let finished = false;
      const finish = () => { if (finished) return; finished = true; clearTimeout(timeout); pending.delete(upstream); lease.release(); };
      const failed = () => { if (finished) return; try { ledger.stop('APPLICATION_TRANSPORT_UNCERTAIN', true); } catch { /* Already recorded. */ } finish(); res.destroy(); };
      pending.add(upstream); upstream.once('error', failed); upstream.end(Buffer.concat(chunks));
    } catch {
      if (!ledger.stopped && lease && !res.headersSent) {
        ledger.counts.rejected++;
        const error = '{"error":"APPLICATION_STOPPED"}'; lease.response(Buffer.byteLength(error));
        res.writeHead(503, { 'content-type': 'application/json' }); res.end(error);
      } else res.destroy();
      lease?.release();
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done)); origin = 'http://127.0.0.1:' + server.address().port;
  return { origin, close: async () => { for (const req of pending) req.destroy(); server.closeAllConnections(); await new Promise(done => server.close(done)); } };
}
