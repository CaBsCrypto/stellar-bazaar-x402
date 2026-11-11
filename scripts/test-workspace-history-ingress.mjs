import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { POST as recordOperation } from '../app/api/operations/route.ts';
import { POST as recordActivity } from '../app/api/activity/route.ts';
import { POST as checkConnection } from '../app/api/activity/connection/route.ts';
import { GET as listDeliveries } from '../app/api/deliveries/route.ts';
import { demoIngress } from '../lib/demo-http.ts';
import { setFreeDemoBudgetStoreForTests } from '../lib/free-demo-budget.ts';
import { workspaceMcpContext } from '../lib/mcp-workspace-context.ts';
import { setWorkspaceStoreForTests } from '../lib/workspace-store.ts';
import { WorkspaceError } from '../lib/workspace-types.ts';

Object.assign(process.env, {
  NODE_ENV: 'test',
  BAZAAR_ENABLE_OPEN_WORKSPACES: 'true',
  BAZAAR_PUBLIC_DEMO: 'true',
  BAZAAR_FREE_DEMO_ADMISSION_UNTIL: '2040-01-01T00:00:00.000Z',
});
const principal = { role: 'agent', generation: 1, ownerId: 'ow_fixture', workspaceId: 'fixture', agentId: 'agent-fixture' };
const humanAccess = 'h'.repeat(43), agentAccess = 'a'.repeat(43);
const humanHash = createHash('sha256').update(humanAccess).digest('hex');
const counts = { reservations: 0, ingress: 0, ownerQuota: 0, reads: 0, writes: 0 };
let budgetAvailable = false;
const append = async () => { counts.writes++; return { created: true }; };
setWorkspaceStoreForTests({
  resolveHash: async hash => hash === humanHash ? { ...principal, role: 'human' } : principal,
  consumeIngress: async () => { counts.ingress++; },
  consumeRequest: async () => { counts.ownerQuota++; },
  forPrincipal: () => ({ operations: { append, all: async () => { counts.reads++; return []; } }, events: { append } }),
});
setFreeDemoBudgetStoreForTests({
  reserve: async () => {
    counts.reservations++;
    if (!budgetAvailable) throw new WorkspaceError('FREE_DEMO_REQUEST_LIMIT', 429, 60);
  },
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Unexpected external fetch'); };
const operation = {
  clientOperationId: 'fixture-operation-1', mode: 'fixture', agentId: principal.agentId,
  service: { id: 'demo-quote', title: 'Demo quote', provider: 'Fixture provider', url: 'https://example.invalid/quote' },
  payment: { status: 'unknown', network: 'stellar:testnet', asset: 'USDC', amountAtomic: '10000', recipient: 'G' + 'A'.repeat(55) },
  delivery: { status: 'reported-delivered', result: { text: 'Synthetic result' } },
};
const event = {
  eventId: 'fixture-event-1', taskId: 'fixture-task-1', agentId: principal.agentId,
  mode: 'fixture', kind: 'task-started', title: 'Synthetic task',
};
const post = (path, body, headers = {}) => new Request('https://example.invalid' + path, {
  method: 'POST',
  headers: { authorization: 'Bearer ' + agentAccess, 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

try {
  const humanAuth = { authorization: 'Bearer ' + humanAccess };
  for (const [handler, request] of [
    [recordOperation, post('/api/operations', operation)],
    [recordActivity, post('/api/activity', event)],
    [checkConnection, post('/api/activity/connection', {}, { ...humanAuth, 'x-history-write-access': 'Bearer ' + agentAccess })],
    [listDeliveries, new Request('https://example.invalid/api/deliveries?operationId=fixture-operation-1', { headers: humanAuth })],
  ]) {
    const response = await handler(request);
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, 'FREE_DEMO_REQUEST_LIMIT');
  }
  assert.deepEqual(counts, { reservations: 4, ingress: 0, ownerQuota: 0, reads: 0, writes: 0 });

  for (const [method, name, argument, input] of [
    ['recordOperation', 'record_bazaar_operation', 'operation', operation],
    ['recordActivity', 'record_bazaar_activity', 'event', event],
  ]) {
    const incoming = post('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { [argument]: input } } });
    budgetAvailable = true;
    await demoIngress(incoming);
    budgetAvailable = false;
    const result = await workspaceMcpContext(incoming)[method](input);
    assert.equal(result.status, 201, JSON.stringify(result.body));
  }
  assert.deepEqual(counts, { reservations: 6, ingress: 2, ownerQuota: 2, reads: 0, writes: 2 });
  console.log('PASS workspace writes, connection check and deliveries respect shared admission; nested MCP charges ingress once.');
} finally {
  globalThis.fetch = originalFetch;
  setFreeDemoBudgetStoreForTests(undefined);
  setWorkspaceStoreForTests(undefined);
}
