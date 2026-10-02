import assert from 'node:assert/strict';
import { pilotRoutePolicy } from '../lib/pilot-route-policy.ts';
const id = 'a'.repeat(8) + '-aaaa-4aaa-8aaa-' + 'a'.repeat(12);
for (const path of ['/pilot', '/history', '/agent-chat', '/_next/static/chunks/app.js']) assert.equal(pilotRoutePolicy(path, 'GET'), 'allow');
for (const path of ['/api/mcp', '/api/workspaces', `/api/workspaces/${id}/access`, '/api/operations', '/api/activity', '/api/conversations', `/api/conversations/${id}/messages`, '/api/agent-tasks', `/api/agent-tasks/${id}/response`]) assert.equal(pilotRoutePolicy(path, 'POST'), 'allow');
for (const path of ['/admin', '/publish', '/catalogo', '/api/admin/magic-link', '/api/publish', '/api/provider-self-listing', '/api/publisher/ingest', '/api/x402/demo-pay', '/api/deliveries/uploads', '/api/deliveries/confirm', '/api/deliveries/access', '/api/workspaces/invalid/access', '/pilot/extra', '/_next/image']) {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.equal(pilotRoutePolicy(path, method), 'deny');
}
assert.equal(pilotRoutePolicy('/', 'GET'), 'redirect');
assert.equal(pilotRoutePolicy('/pilot', 'POST'), 'deny');
console.log(JSON.stringify({ ok: true, scope: 'route exposure policy only', excludesPaymentProviderAdminUploadPaths: true, allowsPilotWorkflowRoutes: true, externalRequests: 0, limitation: 'Needs native Next proxy integration; does not authorize owners or rate-limit random valid-shaped credentials' }));
