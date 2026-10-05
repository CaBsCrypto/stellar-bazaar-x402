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
const prior=process.env.BAZAAR_ENABLE_MARKETPLACE;
process.env.BAZAAR_ENABLE_MARKETPLACE='true';
try {
  for(const path of ['/api/discovery/resources','/api/discovery/search']) assert.equal(pilotRoutePolicy(path,'GET'),'allow');
  assert.equal(pilotRoutePolicy('/api/discovery/search','OPTIONS'),'allow');
  assert.equal(pilotRoutePolicy('/api/discovery/search','POST'),'deny');
  assert.equal(pilotRoutePolicy('/api/discovery/private','GET'),'deny');
  assert.equal(pilotRoutePolicy('/resources/guionista-text','GET'),'allow');
  assert.equal(pilotRoutePolicy('/api/publish','POST'),'deny');
  assert.equal(pilotRoutePolicy(`/api/market/orders/${id}/x402`,'POST'),'allow');
  for(const method of ['GET','PUT','DELETE','OPTIONS'])assert.equal(pilotRoutePolicy(`/api/market/orders/${id}/x402`,method),'deny');
  for(const path of ['/api/market/orders/invalid/x402',`/api/market/orders/${id}/x402/extra`,'/api/x402/demo-pay'])assert.equal(pilotRoutePolicy(path,'POST'),'deny');
}finally{if(prior===undefined)delete process.env.BAZAAR_ENABLE_MARKETPLACE;else process.env.BAZAAR_ENABLE_MARKETPLACE=prior;}
console.log(JSON.stringify({ ok: true, scope: 'route exposure policy only', excludesPaymentProviderAdminUploadPaths: true, allowsPilotWorkflowRoutes: true, externalRequests: 0, limitation: 'Needs native Next proxy integration; does not authorize owners or rate-limit random valid-shaped credentials' }));
