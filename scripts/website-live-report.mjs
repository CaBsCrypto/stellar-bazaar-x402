// Local unpaid report only. No signing SDK, payment endpoint or payment state is imported.
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readPrivateJSON, writePrivateJSON, acquirePilotLock, releaseDeadPilotLock } from './lib/private-pilot-state.mjs';
import { buildWebsiteReportBundle, persistWebsiteReport } from '../lib/website-intelligence-history.ts';
import { appendActivity } from '../lib/activity-client.ts';
const base = 'http://127.0.0.1:3214', provider = 'http://127.0.0.1:8788';
const command = process.argv[2], url = new URL(process.argv[3] ?? 'https://example.com/').href;
if (!['analyze', 'store', 'verify'].includes(command)) throw Error('USE_ANALYZE_STORE_OR_VERIFY_WITH_URL');
const directory = resolve('work/private-live-reports', createHash('sha256').update(url).digest('hex'));
const statePath = join(directory, 'run.json');
const credentials = readPrivateJSON('work/private-website-report-pilot/access.json');
async function journal(run) {
  const bundle = buildWebsiteReportBundle({ operationId: run.operationId, taskId: run.taskId, agentId: run.agentId, mode: 'mock', providerOrigin: provider,
    // Existing configured public recipient is metadata only. This flow cannot pay.
    payTo: readPrivateJSON('work/private-website-report-pilot/run.json').payTo, result: run.result });
  bundle.events = [...initials(run), ...bundle.events];
  return persistWebsiteReport(base, credentials.writeToken, bundle);
}
function initials(run) {
  return [ ['task-started', 'Analizar una página real · sin pago'], ['service-selected', 'Website Intelligence local seleccionado'], ['request-started', 'Consultar HTML público · sin JavaScript'] ].map(([kind, title], i) => ({ kind, title, eventId: run.operationId + ':initial-' + i, operationId: run.operationId, taskId: run.taskId, agentId: run.agentId, mode: 'mock' }));
}
async function verify(run) {
  const path = '/api/deliveries?operationId=' + encodeURIComponent(run.operationId);
  const get = (path, token = credentials.readToken) => fetch(base + path, { headers: { authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const response = await get(path), body = await response.json();
  if (response.status !== 200 || body.versions.length !== 1 || JSON.stringify(body.versions[0].manifest.originalResult) !== JSON.stringify(run.result)) throw Error('SAVED_RESULT_MISMATCH');
  if ((await get(path, credentials.otherReadToken)).status !== 404) throw Error('OWNER_ISOLATION_FAILED');
  const operations = await (await get('/api/operations')).json();
  const records = operations.records.filter(r => r.clientOperationId === run.operationId);
  if (records.length !== 1 || records[0].payment.status !== 'not-requested' || records[0].payment.amountAtomic !== '0' || records[0].payment.transactionHash) throw Error('UNPAID_OPERATION_MISMATCH');
  const events = await (await get('/api/activity?view=events&taskId=' + encodeURIComponent(run.taskId))).json();
  if (events.items.length !== 5 || new Set(events.items.map(e => e.eventId)).size !== 5) throw Error('EVENTS_MISMATCH');
  return { ok: true, operationId: run.operationId, originalRecovered: true, otherOwnerDenied: true, events: 5, paymentAttempted: false };
}
async function main() {
  if (command === 'verify') return verify(readPrivateJSON(statePath));
  releaseDeadPilotLock(directory);
  const release = acquirePilotLock(directory);
  try {
    let run = existsSync(statePath) ? readPrivateJSON(statePath) : undefined;
    if (command === 'store' && !run?.result) throw Error('NO_SAVED_RESPONSE');
    if (!run) {
      const id = 'website-live-' + randomUUID();
      run = { operationId: id, taskId: id + ':task', agentId: 'website-live-local', requestedUrl: url, status: 'started' };
      writePrivateJSON(statePath, run);
    }
    if (!run.result) {
      for (const event of initials(run)) if (await appendActivity(base, { writeToken: credentials.writeToken }, event) !== 'recorded') throw Error('INITIAL_HISTORY_UNAVAILABLE');
      let result;
      try {
        const response = await fetch(provider + '/v1/audits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, language: 'es', mode: 'live' }), redirect: 'error', signal: AbortSignal.timeout(15000) });
        result = await response.json();
        if (!response.ok) throw Error(result.error?.code ?? 'PROVIDER_ERROR');
      } catch (error) {
        run.status = 'failed'; run.error = /^[A-Z_]+$/.test(error.message) ? error.message : 'PROVIDER_UNAVAILABLE'; writePrivateJSON(statePath, run);
        await appendActivity(base, { writeToken: credentials.writeToken }, { ...initials(run)[0], kind: 'error', eventId: run.operationId + ':failed', title: 'No se pudo consultar la página · sin pago', result: { code: run.error } });
        throw Error(run.error);
      }
      // Durable original before any operation/delivery writes. store never contacts the provider.
      run.result = result; run.status = 'received'; writePrivateJSON(statePath, run);
    }
    const stored = await journal(run);
    run.status = stored.status; writePrivateJSON(statePath, run);
    if (stored.status !== 'stored') throw Error('SAVE_FAILED_USE_STORE');
    return { ok: true, operationId: run.operationId, storage: stored.status, paymentAttempted: false };
  } finally { release(); }
}
main().then(value => console.log(JSON.stringify(value))).catch(error => { console.error(JSON.stringify({ ok: false, code: /^[A-Z_]+$/.test(error.message) ? error.message : 'LIVE_REPORT_FAILED', paymentAttempted: false })); process.exitCode = 1; });
