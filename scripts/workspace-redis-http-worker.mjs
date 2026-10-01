// TEST-ONLY HTTP host. Real handlers/server/SDK; not a Next production server.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { Redis } from '@upstash/redis';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

if (process.env.NODE_ENV !== 'test' || process.env.BAZAAR_ISOLATED_WORKER !== '1') throw Error('TEST_ONLY_WORKER_REQUIRED');
const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const relay = new URL(process.env.BAZAAR_ISOLATED_RELAY_ORIGIN);
if (relay.protocol !== 'http:' || relay.hostname !== '127.0.0.1') throw Error('LOOPBACK_RELAY_REQUIRED');
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin !== relay.origin || url.pathname !== '/' || url.search || url.hash) throw Error('EXTERNAL_NETWORK_DISABLED');
  return nativeFetch(input, { ...init, redirect: 'error' });
};
for (const api of [http, https]) for (const name of ['request', 'get']) api[name] = () => { throw Error('EXTERNAL_NETWORK_DISABLED'); };
syncBuiltinESMExports();
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(specifier, context.parentURL);
    if (!/\.[a-z]+$/i.test(url.pathname) && existsSync(fileURLToPath(new URL(url.href + '.ts')))) return next(url.href + '.ts', context);
  }
  if (specifier === 'next/server') return next('next/server.js', context);
  return next(specifier, context);
} });

const { createRedisWorkspaceStore, setWorkspaceStoreForTests, workspacePrefix } = await import('../lib/workspace-store.ts');
const { createWorkspaceHandlers } = await import('../lib/workspace-http.ts');
const { createWorkspaceChatHandlers } = await import('../lib/workspace-chat-http.ts');
const { createHistoryHandlers } = await import('../lib/operation-history-http.ts');
const { createActivityHandlers } = await import('../lib/activity-http.ts');
const { createDeliverableHandlers } = await import('../lib/deliverable-http.ts');
const { createOnboardingMcpServer } = await import('../lib/mcp-onboarding-server.ts');
const { MCP_TOOLS, MCP_WRITES } = await import('../lib/mcp-tool-contract.ts');
const { validatePlan } = await import('./workspace-redis-budget.mjs');
validatePlan(plan);
const redis = new Redis({ url: relay.origin, token: 'isolated-loopback-only', automaticDeserialization: false, retry: { retries: 0 }, enableAutoPipelining: false });
const store = createRedisWorkspaceStore(redis, workspacePrefix(), () => ({ ownerIds: [], hashes: [] }), creationId => {
  const identity = plan.identities.find(v => v.creationId === creationId);
  if (!identity) throw Error('CREATION_OUTSIDE_FROZEN_PLAN');
  return identity.ownerUuid;
});
setWorkspaceStoreForTests(store);
const workspace = createWorkspaceHandlers(), chat = createWorkspaceChatHandlers(), history = createHistoryHandlers(), activity = createActivityHandlers(), delivery = createDeliverableHandlers();
const envelopes = async pending => { const response = await pending; return { ok: response.ok, status: response.status, body: await response.json() }; };
function inner(incoming, path, value) {
  const headers = new Headers(incoming.headers); const body = value === undefined ? undefined : JSON.stringify(value);
  headers.delete('content-length'); if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(new URL(path, incoming.url), { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body }) });
}
async function route(request) {
  const path = new URL(request.url).pathname, method = request.method;
  if (path === '/api/workspaces' && method === 'POST') return workspace.POST(request);
  let id;
  if ((id = /^\/api\/workspaces\/([^/]+)\/access$/.exec(path)) && method === 'POST') return workspace.access(request, id[1]);
  if (path === '/api/conversations') return chat[method === 'POST' ? 'conversationsPOST' : 'conversationsGET'](request);
  if ((id = /^\/api\/conversations\/([^/]+)\/messages$/.exec(path))) return chat[method === 'POST' ? 'messagesPOST' : 'messagesGET'](request, id[1]);
  if (path === '/api/agent-tasks') return chat[method === 'POST' ? 'tasksPOST' : 'tasksGET'](request);
  if ((id = /^\/api\/agent-tasks\/([^/]+)\/response$/.exec(path)) && method === 'POST') return chat.responsePOST(request, id[1]);
  if (path === '/api/operations' && ['GET', 'POST'].includes(method)) return history[method](request);
  if (path === '/api/activity' && ['GET', 'POST'].includes(method)) return activity[method](request);
  if (path === '/api/deliveries' && method === 'GET') return delivery.GET(request);
  if (path !== '/api/mcp') return Response.json({ error: { code: 'ISOLATED_ROUTE_DISABLED' } }, { status: 404 });
  if (method === 'GET') return Response.json({ tools: MCP_TOOLS, writes: MCP_WRITES });
  if (method !== 'POST') return new Response(null, { status: 405 });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const native = (path, value) => inner(request, path, value);
  const server = createOnboardingMcpServer(() => envelopes(history.GET(native('/api/operations'))), undefined, {
    create: value => envelopes(workspace.POST(native('/api/workspaces', value))),
    listTasks: () => envelopes(chat.tasksGET(native('/api/agent-tasks'))),
    claim: value => envelopes(chat.tasksPOST(native('/api/agent-tasks', value))),
    respond: (taskId, value) => envelopes(chat.responsePOST(native(`/api/agent-tasks/${taskId}/response`, value), taskId)),
    recordOperation: value => envelopes(history.POST(native('/api/operations', value))),
    recordActivity: value => envelopes(activity.POST(native('/api/activity', value))),
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
const server = createServer(async (req, res) => {
  try {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 65536) throw Error('REQUEST_TOO_LARGE'); chunks.push(chunk); }
    const body = Buffer.concat(chunks), origin = `http://127.0.0.1:${server.address().port}`;
    const request = new Request(origin + req.url, { method: req.method, headers: req.headers, ...(body.length ? { body } : {}) });
    const response = await route(request), bytes = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(bytes);
  } catch { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":{"code":"ISOLATED_WORKER_UNAVAILABLE"}}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN = `http://127.0.0.1:${server.address().port}`;
process.send?.({ ready: true, origin: process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
