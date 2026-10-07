import assert from 'node:assert/strict';
import { measuredHandler, measuredRead, meteredRedis, meteredExternal, recordOperationalStorageBounds } from '../lib/acceptance-meter.ts';
const names = ['BAZAAR_OPERATIONAL_METER', 'BAZAAR_OPERATIONAL_BUDGET', 'BAZAAR_ACCEPTANCE_METER', 'BAZAAR_WORKSPACE_PREFIX'];
const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
Object.assign(process.env, { BAZAAR_OPERATIONAL_METER: 'true', BAZAAR_OPERATIONAL_BUDGET: 'false', BAZAAR_ACCEPTANCE_METER: 'false', BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:pilot-' + 'b'.repeat(32) });
const key = process.env.BAZAAR_WORKSPACE_PREFIX + ':state', market = key.replace('bazaar-workspace:', 'bazaar-market:');
const logs = [], info = console.info; console.info = row => logs.push(JSON.parse(row));
let middleware, calls = 0;
meteredRedis({ use(fn) { middleware = fn; } });
const command = body => middleware({ body }, async () => { calls++; return { result: 'private fixture payload' }; });
const run = measuredHandler(async fn => { await fn(); return new Response('ok'); });
try {
  const response = await run(async () => {
    await command(['get', key]);
    // Three store GETs, two guard GETs and three SETs: EVAL + eight possible calls.
    const script = "local a=redis.call('GET',KEYS[1]);local b=redis.call('GET',KEYS[2]);local c=redis.call('GET',KEYS[3]);local d=redis.call('GET',KEYS[4]);local e=redis.call('GET',KEYS[5]);redis.call('SET',KEYS[1],ARGV[1]);redis.call('SET',KEYS[2],ARGV[2]);redis.call('SET',KEYS[3],ARGV[3]);return 1";
    await command(['eval', script, 5, key, market, key + ':review', key + ':grant', key + ':registry', 'private fixture payload', '{}', '{}']);
    await meteredExternal('rpc', async () => ({ private: 'fixture' }), undefined, () => ({ outboundBytes: 12, inboundBytes: 13 }));
    recordOperationalStorageBounds({market:{committedBytes:123,reservedBytes:321}});
  });
  assert.equal(response.headers.get('x-bazaar-operational-meter'), 'v1'); assert.equal(response.headers.get('x-bazaar-acceptance-meter'), null);
  assert.equal(response.headers.get('x-bazaar-redis-requests'), '2'); assert.equal(response.headers.get('x-bazaar-redis-commands-upper-bound'), '10');
  assert.equal(response.headers.get('x-bazaar-external-rpc'), '1'); assert.equal(response.headers.get('x-bazaar-external-outbound-payload-bytes'), '12');
  assert.equal(response.headers.get('x-bazaar-market-stored-bytes-upper-bound'), '444'); assert.equal(response.headers.get('x-bazaar-storage-observation'), 'prospective-upper-bound');
  const before = calls;
  await assert.rejects(run(() => command(['get', 'unrelated:private'])), /OPERATIONAL_KEY_DENIED/); assert.equal(calls, before);
  await assert.rejects(run(() => command(['eval', "for i=1,3 do redis.call('GET',KEYS[1]) end", 1, key])), /OPERATIONAL_SCRIPT_UNBOUNDED/); assert.equal(calls, before);
  await assert.rejects(run(() => command(['eval', "redis.call('SET',KEYS[1],ARGV[3]);return 1", 1, process.env.BAZAAR_WORKSPACE_PREFIX + ':operations-budget:state', 'missing', '', 'x'.repeat(65537)])), /OPERATIONAL_LEDGER_BUDGET/); assert.equal(calls, before);
  await measuredRead(() => command(['get', key])); assert.equal(logs.at(-1).source, 'ssr'); assert.equal(logs.at(-1).redisRequests, 1);
  await assert.rejects(run(async () => { await command(['get', key]); throw Error('private fixture exception'); })); assert.equal(logs.at(-1).source, 'api'); assert.equal(logs.at(-1).redis, 1);
  const anonymous = await measuredHandler(async () => new Response('unauthorized', { status: 401 }))(new Request('https://example.test/api/mcp'));
  assert.equal(anonymous.headers.get('x-bazaar-redis-requests'), '0');
  const continued = await measuredHandler(async () => new Response(null, { headers: { 'x-middleware-next': '1' } }), { source: 'proxy', budget: false })(); assert.equal(logs.at(-1).requests, 0); assert.ok(continued);
  await measuredHandler(async () => new Response('denied', { status: 404 }), { source: 'proxy', budget: false })(); assert.equal(logs.at(-1).requests, 1);
  assert.ok(logs.every(row => !JSON.stringify(row).includes('private fixture')));
  info(JSON.stringify({ status: 'PASS', operationalWithoutAcceptance: true, loopFreeMultiKeyLuaCounted: true, anonymousSsrAndErrorsMeasured: true, namespaceAndLedgerBounds: true, proxyRequestNotDuplicated: true, rawPayloadsNeverLogged: true, remoteRequests: 0 }));
} finally { console.info = info; for (const [name, value] of Object.entries(old)) value === undefined ? delete process.env[name] : process.env[name] = value; }
