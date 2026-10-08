import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {extname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createRedisWorkspaceStore, READ_WORKSPACE_LUA, READ_MARKET_PERMISSION_LUA, COMMIT_WORKSPACE_LUA, setWorkspaceStoreForTests} from '../lib/workspace-store.ts';
import {MCP_VERSION, MCP_TOOLS} from '../lib/mcp-tool-contract.ts';
import {workspaceHeaders} from '../lib/workspace-http.ts';

registerHooks({resolve(specifier, context, next) {
  if (specifier === 'next/server') specifier = 'next/server.js';
  if (specifier.startsWith('@/')) specifier = new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href;
  try { return next(specifier, context); }
  catch (error) { if (specifier.startsWith('.') && !extname(specifier)) return next(specifier + '.ts', context); throw error; }
}});

// Exercise actual route handlers and quota storage, with Redis's Lua CAS protocol
// represented in memory. No hosted endpoint, signer or payment is involved.
for (const key of ['VERCEL', 'VERCEL_ENV', 'BAZAAR_ACCEPTANCE_METER', 'BAZAAR_ACCEPTANCE_X402', 'BAZAAR_OPERATIONAL_METER']) delete process.env[key];
const origin = 'https://mcp-transport.example';
Object.assign(process.env, {BAZAAR_PUBLIC_DEMO: 'true', BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PUBLIC_ORIGIN: origin, BAZAAR_ENABLE_MARKETPLACE: 'false'});
const data = new Map();
let redisUnavailable = false;
const privateDiagnostic = 'SYNTHETIC_PRIVATE_REDIS_DIAGNOSTIC';
const redis = {async eval(script, keys, args) {
  if (redisUnavailable) throw Error(privateDiagnostic);
  if (script === READ_WORKSPACE_LUA || script === READ_MARKET_PERMISSION_LUA) return keys.map(key => data.get(key) ?? '');
  assert.equal(script, COMMIT_WORKSPACE_LUA);
  if (keys.some((key, index) => (data.get(key) ?? '') !== args[index])) return 0;
  data.set(keys[0], args[3]);
  if (args[4]) data.set(keys[1], args[4]);
  data.set(keys[2], 'workspace-v1');
  return 1;
}};
const prefix = 'bazaar-workspace:pilot-' + randomBytes(16).toString('hex');
const freshStore = () => createRedisWorkspaceStore(redis, prefix, () => ({ownerIds: [], hashes: []}));
const originalNow = Date.now, originalFetch = globalThis.fetch;
let now = Math.floor(originalNow() / 60000) * 60000 + 1000;
Date.now = () => now;
setWorkspaceStoreForTests(freshStore());
globalThis.fetch = async () => { throw Error('EXTERNAL_NETWORK_FORBIDDEN'); };
const {GET, POST} = await import('../app/api/mcp/route.ts');
const request = accept => new Request(origin + '/api/mcp', {headers: accept === undefined ? {} : {accept}});
const assertPrivateHeaders = response => { for (const [name, value] of Object.entries(workspaceHeaders)) assert.equal(response.headers.get(name), value); };
const registry = () => JSON.parse([...data].find(([key]) => key.endsWith(':registry'))[1]);
const ingressCount = () => registry().creationWindows.find(window => window.key === 'ingress:global:' + Math.floor(now / 60000))?.count ?? 0;
let client;

try {
  const acceptCases = [
    [undefined, 200], ['*/*', 200], ['application/json', 200],
    ['application/json, text/event-stream', 200],
    ['text/event-stream', 405], ['TEXT/EVENT-STREAM; charset=utf-8', 405],
    ['text/event-stream;q=0', 200], ['text/event-stream;q=0.5', 405],
    ['text/event-stream;q=1, application/json;q=0.1', 200],
    ['text/event-stream;q=1, application/json;q=0', 405],
    ['text/event-stream;q=1, application/*;q=0.1', 200],
    ['text/event-stream;q=1, application/json;q=0, */*;q=1', 405],
    ['text/event-stream;q=1, application/*;q=0, */*;q=1', 405],
    ['text/event-stream;q=1, application/json;q=0.000, application/json;q=0.25', 200],
    ['text/event-stream;q=1.001', 200], ['text/event-stream;q=invalid', 200],
    ['text/event-stream;q=0.5;q=1', 200], ['text/*', 200],
  ];
  for (const [accept, status] of acceptCases) {
    const response = await GET(request(accept));
    assert.equal(response.status, status, accept ?? 'no Accept');
    assertPrivateHeaders(response);
    if (status === 405) { assert.equal(response.headers.get('allow'), 'POST'); assert.equal(await response.text(), ''); }
    else { const body = await response.json(); assert.equal(body.version, MCP_VERSION); assert.deepEqual(body.tools, [...MCP_TOOLS]); assert.equal(body.custody, false); }
  }
  assert.equal(ingressCount(), acceptCases.length, 'both metadata and unsupported SSE consume ingress');

  now += 60000;
  for (let index = 0; index < 120; index++) {
    const response = await GET(request('application/json'));
    assert.equal(response.status, 200);
    await response.body.cancel();
  }
  assert.equal(ingressCount(), 120);
  // A fresh store instance reads the same quota; neither transport bypasses it.
  setWorkspaceStoreForTests(freshStore());
  const beforeDenial = JSON.stringify([...data]);
  for (const accept of ['application/json', 'text/event-stream']) {
    const response = await GET(request(accept));
    assert.equal(response.status, 429); assertPrivateHeaders(response);
    assert.equal(response.headers.get('retry-after'), '59');
    assert.deepEqual(await response.json(), {error: {code: 'DEMO_RATE_LIMIT'}});
  }
  assert.equal(JSON.stringify([...data]), beforeDenial, 'denied metadata and SSE requests do not mutate quota state');

  now += 60000;
  const resumed = await GET(request('text/event-stream'));
  assert.equal(resumed.status, 405); assert.equal(ingressCount(), 1);
  redisUnavailable = true;
  for (const accept of ['application/json', 'text/event-stream']) {
    const response = await GET(request(accept));
    assert.equal(response.status, 503); assertPrivateHeaders(response);
    assert.deepEqual(await response.json(), {error: {code: 'WORKSPACE_UNAVAILABLE'}});
  }
  redisUnavailable = false;

  now += 60000;
  const requests = [], errors = [];
  const localFetch = async (input, init) => {
    const incoming = new Request(input, init);
    assert.equal(incoming.url, origin + '/api/mcp');
    assert.equal(incoming.headers.has('authorization'), false, 'public SDK connection needs no account credential');
    assert.ok(['GET', 'POST'].includes(incoming.method));
    const response = await (incoming.method === 'GET' ? GET : POST)(incoming);
    requests.push({method: incoming.method, accept: incoming.headers.get('accept'), status: response.status});
    return response;
  };
  const transport = new StreamableHTTPClientTransport(new URL(origin + '/api/mcp'), {fetch: localFetch, reconnectionOptions: {maxRetries: 0}});
  client = new Client({name: 'offline-stateless-transport-test', version: '1'});
  client.onerror = error => errors.push(error);
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(client.getServerVersion().version, MCP_VERSION);
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), [...MCP_TOOLS].sort());
  const capabilities = await client.callTool({name: 'get_bazaar_capabilities', arguments: {}});
  assert.equal(capabilities.isError, undefined);
  assert.equal(JSON.parse(capabilities.content[0].text).demo.network, 'stellar:testnet');
  // Initialization's accepted notification makes the installed SDK attempt GET.
  // Explicit resumption uses the same documented transport API and remains safe.
  await transport.resumeStream('synthetic-local-cursor');
  await new Promise(resolve => setImmediate(resolve));
  const streams = requests.filter(item => item.method === 'GET');
  assert.ok(streams.length >= 2, 'automatic initialization stream plus explicit SDK resume');
  assert.ok(streams.every(item => item.accept === 'text/event-stream' && item.status === 405));
  assert.equal(errors.length, 0, 'unsupported standalone SSE is handled without a reconnect/error loop');
  assert.equal(ingressCount(), requests.length, 'each SDK request is admitted once');
  assert.equal(registry().workspaces.length, 0, 'anonymous metadata and tools do not create private history/accounts');
  await client.close(); client = undefined;
  console.log(JSON.stringify({status: 'PASS',acceptNegotiation: acceptCases.length, nativeSdkInitialize: true, nativeSdkTools: tools.tools.length, nativeSdkCapabilities: true, nativeSdkUnsupportedStream: true, metadataIngressLimit: 120, persistedQuota: true, sanitizedStorageFailure: true, externalRequests: 0, realPayments: 0}));
} finally {
  if (client) await client.close();
  globalThis.fetch = originalFetch; Date.now = originalNow;
  setWorkspaceStoreForTests(undefined);
}
