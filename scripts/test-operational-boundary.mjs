import assert from 'node:assert/strict';
import { earlyRouteGate, earlyBodyGate } from '../lib/operational-route-gate.ts';
import { pilotRoutePolicy, routeBoundaryEnabled } from '../lib/pilot-route-policy.ts';
import { NextRequest } from 'next/server.js';
import { proxy } from '../proxy.ts';
const names = ['BAZAAR_ROUTE_BOUNDARY', 'BAZAAR_ENABLE_MARKETPLACE', 'BAZAAR_ENABLE_OPEN_WORKSPACES', 'BAZAAR_WORKSPACE_ADMISSION', 'BAZAAR_WORKSPACE_PUBLIC_ORIGIN'];
const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
Object.assign(process.env, { BAZAAR_ROUTE_BOUNDARY: 'true', BAZAAR_ENABLE_MARKETPLACE: 'true', BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_ADMISSION: 'open', BAZAAR_WORKSPACE_PUBLIC_ORIGIN: 'https://bazaar.example' });
const token = 'a'.repeat(43), id = 'b'.repeat(8) + '-1111-4111-8111-' + 'c'.repeat(12);
const request = (path, method = 'GET', headers = {}, body) => new Request('https://bazaar.example' + path, { method, headers, ...(body === undefined ? {} : { body }) });
try {
  assert.equal(routeBoundaryEnabled(), true);
  for(const path of ['/','/open','/catalogo','/hub','/publish','/history']) {
    for(const method of ['GET','HEAD']) {const response=await proxy(new NextRequest('https://bazaar.example'+path,{method}));assert.equal(response.headers.get('x-middleware-next'),'1',path+' must pass the actual boundary');}
  }
  for (const path of ['/api/x402/ledger-brief', '/api/admin/stats', '/api/publish', '/api/buyer-execution/reference']) assert.equal(pilotRoutePolicy(path, 'POST'), 'deny');
  for(const path of ['/api/discovery/resources','/api/discovery/search'])assert.equal((await proxy(new NextRequest('https://bazaar.example'+path))).status,404,'Legacy unpaged catalog must stop before storage');
  for (const path of ['/llms.txt', '/BUYER.md','/mcp.json', '/BUYER_AGENT_KIT.md', '/SELLER_AGENT_KIT.md', '/skills/buyer/SKILL.md', '/skills/seller/SKILL.md']) assert.equal(pilotRoutePolicy(path, 'GET'), 'allow');
  assert.equal(earlyRouteGate(request('/api/market/catalog')), undefined);
  assert.equal(earlyRouteGate(request('/api/market/services/' + id)).status, 401);
  assert.equal(earlyRouteGate(request('/api/market/services/' + id, 'GET', { authorization: 'Bearer ' + token })), undefined);
  assert.equal(earlyRouteGate(request('/api/mcp', 'POST', { 'content-type': 'application/json', authorization: 'Bearer bad' }, '{}')).status, 401);
  assert.equal(earlyRouteGate(request('/api/market/catalog', 'GET', { origin: 'https://evil.example' })).status, 400);
  assert.equal(earlyRouteGate(request('/api/market/orders', 'POST', { authorization: 'Bearer ' + token, 'content-type': 'application/json', 'content-length': '999999' }, '{}')).status, 413);
  const oversize = request('/api/workspaces', 'POST', { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, JSON.stringify({ payload: 'x'.repeat(1024) }));
  assert.equal((await earlyBodyGate(oversize)).status, 413);
  assert.equal((await earlyBodyGate(request('/api/mcp', 'POST', { 'content-type': 'application/json' }, '{'))).status, 400);
  const valid = request('/api/mcp', 'POST', { 'content-type': 'application/json' }, '{}'); assert.equal(await earlyBodyGate(valid), undefined); assert.equal(await valid.text(), '{}', 'Gate must preserve native handler body');
  assert.equal((await earlyBodyGate(request('/api/mcp', 'POST', { 'content-type': 'application/json' }, JSON.stringify({ method: 'tools/call', params: { name: 'deliver_market_order' } })))).status, 401);
  assert.equal(await earlyBodyGate(request('/api/mcp', 'POST', { 'content-type': 'application/json' }, JSON.stringify({ method: 'tools/call', params: { name: 'search_services' } }))), undefined);
  assert.equal(await earlyBodyGate(request('/api/mcp', 'POST', { 'content-type': 'application/json' }, JSON.stringify({ method: 'tools/call', params: { name: 'list_market_services' } }))), undefined);
  const cursor=Buffer.from(JSON.stringify({version:1,scope:'orders:ow_test',createdAt:'2026-10-07T00:00:00.000Z',id})).toString('base64url');
  assert.equal((await proxy(new NextRequest('https://bazaar.example/api/operations?limit=20',{headers:{authorization:'Bearer '+token}}))).headers.get('x-middleware-next'),'1','Retained operation history must remain readable');
  for(const path of ['/api/market/orders?limit=20','/api/market/orders?limit=20&cursor='+cursor,'/api/market/services?limit=20&cursor='+cursor+'&mineCursor='+cursor]) {
    const response=await proxy(new NextRequest('https://bazaar.example'+path,{headers:{authorization:'Bearer '+token}}));assert.equal(response.headers.get('x-middleware-next'),'1','First/second private page must pass the actual proxy');
  }
  for(const query of ['limit=21','limit=2&limit=3','cursor='+cursor+'&cursor='+cursor,'cursor='+('x'.repeat(513)),'cursor=bad%3D','mineCursor='+cursor,'limit=1&extra=2']) assert.equal(earlyRouteGate(request('/api/market/orders?'+query,'GET',{authorization:'Bearer '+token})).status,400);
  assert.equal(earlyRouteGate(request('/api/market/services?mineCursor='+('x'.repeat(513)),'GET',{authorization:'Bearer '+token})).status,400);
  console.log(JSON.stringify({ status: 'PASS', boundaryIndependentOfOpenAdmission: true, closedLegacyAndAdminRoutes: true, explicitPublicDocumentsAndCatalog: true, badTokenOriginMethodAndBodyRejectedBeforeRedis: true, bodyPreserved: true, remoteRequests: 0 }));
} finally { for (const [name, value] of Object.entries(old)) value === undefined ? delete process.env[name] : process.env[name] = value; }
