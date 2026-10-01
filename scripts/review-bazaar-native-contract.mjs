// Independent reviewer gate. All Redis and fetch effects are doubles in memory.
// No .env, credentials, external endpoints, build, application server or provider.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { DEFAULT_BUDGET, RedisBudget, realRedisTransport, scriptsFromSource } from './workspace-redis-budget.mjs';

assert.equal(process.version, 'v22.18.0', 'Independent gate requires the agreed runtime');
const hash = value => createHash('sha256').update(value).digest('hex');
const root = new URL('../', import.meta.url);
const scripts = scriptsFromSource(root);
const identities = Array.from({ length: 2 }, () => {
  const ownerUuid = randomUUID();
  const tokens = Object.fromEntries(['bootstrap', 'human', 'agent', 'rotatedHuman', 'rotatedAgent'].map(role => [role, randomBytes(32).toString('base64url')]));
  return { creationId: randomUUID(), ownerUuid, ownerId: 'ow_' + ownerUuid.replaceAll('-', ''), hashes: Object.fromEntries(Object.entries(tokens).map(([role, value]) => [role, hash(value)])) };
});
const prefix = 'bazaar-workspace:isolated-' + randomBytes(16).toString('hex');
const base = prefix + ':{' + prefix.split(':')[1] + '}:';
const taskId = randomUUID(), attemptId = randomUUID(), operationId = randomUUID();
const payloads = {
  conversation: { conversationId: randomUUID(), title: 'Independent in-memory contract' },
  humanMessage: { messageId: randomUUID(), taskId, text: '  Preserved synthetic request  ' },
  claim: { taskId, attemptId }, conflictingAttemptId: randomUUID(),
  response: { taskId, attemptId, messageId: randomUUID(), text: '  Preserved synthetic response  ', operationId },
  operation: { clientOperationId: operationId, taskId, mode: 'mock', service: { id: 'review-double', title: 'Synthetic', provider: 'Synthetic', url: 'http://127.0.0.1' }, payment: { status: 'not-requested', network: 'stellar:testnet', asset: 'USDC', amountAtomic: '0', recipient: 'G' + 'A'.repeat(55) }, delivery: { status: 'reported-delivered', result: { text: '  Preserved synthetic response  ', synthetic: true } } },
  event: { eventId: randomUUID(), taskId, operationId, mode: 'mock', kind: 'delivery-reported', title: 'Synthetic receipt' },
};
const plan = { version: 1, prefix, identities, keys: [base + 'registry', base + 'initialized', base + 'owner:none', ...identities.map(i => base + 'owner:' + i.ownerId)], payloads, budget: DEFAULT_BUDGET };
const read = owner => JSON.stringify(['EVAL', scripts.READ, 3, plan.keys[0], owner ?? plan.keys[2], plan.keys[1]]);
const observations = [];
let sends = 0;
const double = (send = async () => { sends++; return JSON.stringify({ result: ['', '', ''] }); }) => new RedisBudget(plan, scripts, send);
async function rejectedBeforeEffect(raw, code) {
  const guard = double(), before = sends;
  await assert.rejects(guard.exchange(raw), { message: code });
  assert.equal(sends, before);
  await assert.rejects(guard.exchange(read()), { message: code });
  assert.equal(sends, before, 'A rejected guard must remain stopped');
}
await rejectedBeforeEffect(JSON.stringify(['EVAL', scripts.READ, 3, plan.keys[0], base + 'owner:foreign', plan.keys[1]]), 'KEY_OUTSIDE_ALLOWLIST');
await rejectedBeforeEffect(JSON.stringify(['EVAL', scripts.COMMIT, 3, plan.keys[0], plan.keys[2], plan.keys[1], '', '', '', '{}', '']), 'SCRIPT_OUTSIDE_ALLOWLIST');
await rejectedBeforeEffect(JSON.stringify(['EVAL', scripts.READ + '\n', 3, plan.keys[0], plan.keys[2], plan.keys[1]]), 'SCRIPT_OUTSIDE_ALLOWLIST');
observations.push('foreign owner key, altered Lua and owner:none write rejected before send; rejection remains stopped');

for (const [field, value] of [['requests', 400], ['commands', 2397], ['requestBytes', 16777216], ['responseBytes', 33554432]]) {
  const guard = double(), before = sends; guard.counts[field] = value;
  await assert.rejects(guard.exchange(read()), { message: 'REDIS_BUDGET_EXHAUSTED' });
  assert.equal(sends, before, field + ' exhaustion must precede send');
}
let release;
const held = new Promise(resolve => { release = resolve; });
const concurrent = double(async () => { sends++; await held; return JSON.stringify({ result: ['', '', ''] }); });
concurrent.counts.responseBytes = DEFAULT_BUDGET.responseBytes - DEFAULT_BUDGET.perResponseBytes;
const pending = concurrent.exchange(read());
await assert.rejects(concurrent.exchange(read()), { message: 'REDIS_BUDGET_EXHAUSTED' });
release(); await pending; assert.equal(concurrent.reservedResponseBytes, 0);
observations.push('request/command/byte exhaustion preflight and concurrent response reservation');

// A malformed response remains an uncertain attempt; no automatic second send.
const malformed = double(async () => { sends++; return '{"result":["",""]}'; });
const beforeMalformed = sends;
await assert.rejects(malformed.exchange(read()), { message: 'INVALID_REDIS_RESPONSE' });
await assert.rejects(malformed.exchange(read()), { message: 'INVALID_REDIS_RESPONSE' });
assert.equal(sends - beforeMalformed, 1); assert.equal(malformed.counts.commands, 4);
const lost = double(async (_raw, _max, meter) => { sends++; meter(7); throw Error('SYNTHETIC_ACK_LOSS'); });
const beforeLost = sends;
await assert.rejects(lost.exchange(read()), { message: 'SYNTHETIC_ACK_LOSS' });
await assert.rejects(lost.exchange(read()), { message: 'SYNTHETIC_ACK_LOSS' });
assert.equal(sends - beforeLost, 1); assert.equal(lost.counts.responseBytes, 7); assert.equal(lost.counts.commands, 4);
observations.push('corruption and lost response retain count and stop without retry');

// Native HTTPS transport double: redirects/errors are terminal and counted once.
let remoteAttempts = 0;
const requestDouble = (_url, options, callback) => {
  remoteAttempts++; assert.equal(options.agent, false); assert.equal(options.method, 'POST');
  const req = new EventEmitter(); req.destroy = error => req.emit('error', error);
  req.end = () => queueMicrotask(() => {
    const res = new EventEmitter(); res.statusCode = 307; res.headers = { location: 'https://foreign.invalid' };
    res.destroy = () => {}; callback(res); res.emit('data', Buffer.from('redirect blocked')); res.emit('end');
  });
  return req;
};
let measured = 0;
await assert.rejects(realRedisTransport('https://synthetic.invalid', 'synthetic', requestDouble)('{}', 65536, n => { measured += n; }), { message: 'REDIS_HTTP_REJECTED' });
assert.equal(remoteAttempts, 1); assert.equal(measured, Buffer.byteLength('redirect blocked'));
observations.push('native HTTPS redirect is one terminal request and includes error body bytes');

// Exercise the installed SDK through configuredWorkspaceStore with no network.
const priorEnvironment = { ...process.env }, nativeFetch = globalThis.fetch;
for (const key of Object.keys(process.env)) if (/^(BAZAAR|UPSTASH|KV_REST|VERCEL|OPERATION_HISTORY|HISTORY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'production', BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:local-test', BAZAAR_WORKSPACE_REDIS_REST_URL: 'https://synthetic.invalid', BAZAAR_WORKSPACE_REDIS_REST_TOKEN: 'synthetic' });
let configuredAttempts = 0;
globalThis.fetch = async () => { configuredAttempts++; throw Error('SYNTHETIC_NETWORK_DENIED'); };
try {
  const { configuredWorkspaceStore } = await import('../lib/workspace-store.ts');
  const store = configuredWorkspaceStore(() => ({ ownerIds: [], hashes: [] }));
  await assert.rejects(store.resolveHash(hash('synthetic-unknown-credential')));
  assert.equal(configuredAttempts, 1, 'Configured store SDK must attempt exactly once');
  for (const change of [
    () => { process.env.BAZAAR_WORKSPACE_BACKEND = 'unknown'; },
    () => { process.env.BAZAAR_WORKSPACE_BACKEND = 'redis'; delete process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN; },
  ]) { change(); assert.throws(() => configuredWorkspaceStore(() => ({ ownerIds: [], hashes: [] }))); assert.equal(configuredAttempts, 1); }
  observations.push('installed SDK from configured store loses response once; invalid backend/missing token fail without send');

  const data = new Map(), commands = [];
  let quotaCasRejected = false;
  Object.assign(process.env, {
    BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PREFIX: plan.prefix,
    BAZAAR_WORKSPACE_LOCAL_ORIGIN: 'http://127.0.0.1:39981',
    BAZAAR_WORKSPACE_REDIS_REST_URL: 'http://127.0.0.1:39982',
    BAZAAR_WORKSPACE_REDIS_REST_TOKEN: 'isolated-loopback-only',
    BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: 'http://127.0.0.1:39982',
    BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON: JSON.stringify(identities),
  });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, 'http://127.0.0.1:39982');
    const raw = init.body ?? (input instanceof Request ? await input.clone().text() : '');
    const command = JSON.parse(raw); commands.push(command);
    assert.equal(command[0].toUpperCase(), 'EVAL'); assert.equal(command[2], 3);
    const keys = command.slice(3, 6), args = command.slice(6);
    assert.equal(keys[0], plan.keys[0]); assert.equal(keys[2], plan.keys[1]);
    assert.ok([plan.keys[2], plan.keys[3], plan.keys[4]].includes(keys[1]), 'configured store issued an unfrozen owner key');
    let result;
    if (command[1] === scripts.READ) result = keys.map(key => data.get(key) ?? '');
    else {
      assert.equal(command[1], scripts.COMMIT); assert.equal(args.length, 5);
      assert.notEqual(keys[1], plan.keys[2], 'owner:none must never be committed');
      result = quotaCasRejected || keys.some((key, i) => (data.get(key) ?? '') !== args[i]) ? 0 : 1;
      if (result === 1) { if (args[4]) data.set(keys[1], args[4]); data.set(keys[0], args[3]); data.set(keys[2], 'workspace-v1'); }
    }
    return new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const makeStore = () => configuredWorkspaceStore(() => ({ ownerIds: [], hashes: [] }));
  const a = identities[0], creation = { creationId: a.creationId, humanAccessHash: a.hashes.human, agentAccessHash: a.hashes.agent };
  for (const [input, bootstrap, code] of [
    [{ ...creation, creationId: randomUUID() }, a.hashes.bootstrap, 'UNAUTHORIZED'],
    [creation, hash('foreign bootstrap'), 'UNAUTHORIZED'],
    [{ ...creation, humanAccessHash: a.hashes.rotatedHuman }, a.hashes.bootstrap, 'WORKSPACE_CONFLICT'],
    [{ ...creation, ownerId: a.ownerId }, a.hashes.bootstrap, 'WORKSPACE_UNAVAILABLE'],
  ]) {
    const before = commands.length;
    await assert.rejects(makeStore().createWorkspace(input, bootstrap), { code });
    assert.equal(commands.length, before, 'unfrozen or client-owned creation must fail before any Redis read');
  }
  const created = await Promise.all([makeStore().createWorkspace(creation, a.hashes.bootstrap), makeStore().createWorkspace(creation, a.hashes.bootstrap)]);
  assert.deepEqual(created.map(result => result.created).sort(), [false, true]);
  const receipt = created.find(result => result.created).record;
  assert.equal(receipt.ownerId, a.ownerId); assert.deepEqual(created[0].record, created[1].record);
  assert.equal(data.size, 3); assert.ok(!data.has(plan.keys[2]));
  const beforeQuota = commands.length;
  quotaCasRejected = true;
  await assert.rejects(makeStore().consumeRequest(a.ownerId, receipt.generation), { code: 'WORKSPACE_UNAVAILABLE' });
  quotaCasRejected = false;
  assert.equal(commands.length - beforeQuota, 16, 'quota CAS must stop at exactly eight confirmed read/commit pairs');
  let generation = receipt.generation;
  for (const [role, accessHash] of [['agent', a.hashes.rotatedAgent], ['human', a.hashes.rotatedHuman]]) {
    const result = await makeStore().changeAccess(receipt.workspaceId, a.hashes.bootstrap, { action: 'rotate', role, accessHash, expectedGeneration: generation });
    generation = result.record.generation; assert.equal(result.record.ownerId, a.ownerId);
  }
  for (const oldHash of [a.hashes.agent, a.hashes.human]) await assert.rejects(makeStore().resolveHash(oldHash), { code: 'UNAUTHORIZED' });
  for (const currentHash of [a.hashes.rotatedAgent, a.hashes.rotatedHuman]) assert.equal((await makeStore().resolveHash(currentHash)).ownerId, a.ownerId);
  const replay = await makeStore().createWorkspace(creation, a.hashes.bootstrap);
  assert.equal(replay.created, false);
  for (const field of ['workspaceId', 'ownerId', 'agentId', 'creationId', 'createdAt']) assert.equal(replay.record[field], receipt[field]);
  const revoked = await makeStore().changeAccess(receipt.workspaceId, a.hashes.bootstrap, { action: 'revoke', expectedGeneration: generation });
  assert.equal(revoked.record.ownerId, a.ownerId); assert.equal(revoked.record.revoked, true);
  for (const retiredHash of [a.hashes.agent, a.hashes.human, a.hashes.rotatedAgent, a.hashes.rotatedHuman]) await assert.rejects(makeStore().resolveHash(retiredHash), { code: 'UNAUTHORIZED' });
  assert.equal((await makeStore().resolveHash(a.hashes.bootstrap)).ownerId, a.ownerId);
  const revokeReplay = await makeStore().changeAccess(receipt.workspaceId, a.hashes.bootstrap, { action: 'revoke', expectedGeneration: generation });
  assert.equal(revokeReplay.created, false); assert.deepEqual(revokeReplay.record, revoked.record);
  observations.push('configured production isolated allocation rejects unknown/client owner before read, unique concurrent creation, five-key bound, quota CAS eight, new factories preserve identity and rotated/revoked access');

  const nativeConfig = { ...process.env };
  for (const change of [
    () => { process.env.BAZAAR_WORKSPACE_PREFIX = 'bazaar-workspace:production'; },
    () => { process.env.BAZAAR_WORKSPACE_BACKEND = 'file'; },
    () => { process.env.VERCEL = '1'; },
    () => { process.env.BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN = 'http://localhost:39982'; },
    () => { process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN = 'different-synthetic'; },
    () => { delete process.env.BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON; },
    () => { process.env.BAZAAR_WORKSPACE_FILE_DIRECTORY = 'synthetic-must-not-be-opened'; },
  ]) {
    const before = commands.length; change(); assert.throws(makeStore); assert.equal(commands.length, before);
    for (const key of Object.keys(process.env)) if (!(key in nativeConfig)) delete process.env[key]; Object.assign(process.env, nativeConfig);
  }
  observations.push('isolated allocation fails closed for production prefix, file, Vercel, nonexact relay, token mismatch, partial options and file-directory fallback');
} finally {
  globalThis.fetch = nativeFetch;
  for (const key of Object.keys(process.env)) if (!(key in priorEnvironment)) delete process.env[key];
  Object.assign(process.env, priorEnvironment);
}

const inspected = ['lib/workspace-store.ts', 'scripts/workspace-redis-budget.mjs'];
const sourceHashes = Object.fromEntries(inspected.map(path => [path, hash(readFileSync(new URL(path, root)))]));
console.log(JSON.stringify({ ok: true, reviewer: 'independent', category: 'local protocol/configuration doubles', runtime: process.version, sourceHashes, observations, externalRequests: 0, realRedisWrites: 0, nativeNextAcceptance: false, browserMagicLinkAcceptance: false, scope: 'Pre-effect protocol and configured SDK contract only; final native Next/Redis/browser requires separate frozen-candidate evidence.' }, null, 2));
