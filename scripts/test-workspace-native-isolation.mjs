import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { configuredWorkspaceStore, createRedisWorkspaceStore, READ_WORKSPACE_LUA, COMMIT_WORKSPACE_LUA } from '../lib/workspace-store.ts';
import { createWorkspaceHandlers } from '../lib/workspace-http.ts';

const previous = { ...process.env }, nativeFetch = globalThis.fetch;
const hash = value => createHash('sha256').update(value).digest('hex');
const identities = Array.from({ length: 2 }, () => {
  const tokens = Object.fromEntries(['bootstrap', 'human', 'agent', 'rotatedHuman', 'rotatedAgent'].map(role => [role, randomBytes(32).toString('base64url')]));
  const ownerUuid = randomUUID();
  return { creationId: randomUUID(), ownerUuid, ownerId: 'ow_' + ownerUuid.replaceAll('-', ''), hashes: Object.fromEntries(Object.entries(tokens).map(([role, token]) => [role, hash(token)])), tokens };
});
const frozen = identities.map(({ tokens, ...owner }) => owner);
const prefix = 'bazaar-workspace:isolated-' + randomBytes(16).toString('hex'), base = `${prefix}:{${prefix.split(':')[1]}}:`;
const keys = [base + 'registry', base + 'initialized', base + 'owner:none', ...identities.map(owner => base + 'owner:' + owner.ownerId)];
const data = new Map(), commands = [];
let mode = 'normal', relayErrors = 0, commits = 0;
function gate(size) { let count = 0, release; const all = new Promise(resolve => release = resolve); return async () => { if (count >= size) return; if (++count === size) release(); await all; }; }
let creationGates;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, 'POST'); assert.equal(request.url, '/'); assert.equal(request.headers.authorization, 'Bearer isolated-loopback-only');
    let raw = ''; for await (const chunk of request) raw += chunk;
    const command = JSON.parse(raw), commandKeys = command.slice(3, 6), args = command.slice(6);
    assert.equal(command[0].toUpperCase(), 'EVAL'); assert.equal(Number(command[2]), 3);
    assert.equal(commandKeys[0], keys[0]); assert.equal(commandKeys[2], keys[1]); assert.ok(keys.slice(2).includes(commandKeys[1]));
    const script = command[1]; commands.push({ script, keys: commandKeys }); let result;
    if (script === READ_WORKSPACE_LUA) {
      assert.equal(args.length, 0); result = commandKeys.map(key => data.get(key) ?? '');
      if (creationGates) await (commandKeys[1] === keys[2] ? creationGates.initial : creationGates.owner)();
    } else {
      assert.equal(script, COMMIT_WORKSPACE_LUA); assert.equal(args.length, 5); assert.notEqual(commandKeys[1], keys[2]);
      if (commandKeys.some((key, i) => (data.get(key) ?? '') !== args[i])) result = 0;
      else {
        data.set(commandKeys[0], args[3]); if (args[4]) data.set(commandKeys[1], args[4]); data.set(commandKeys[2], 'workspace-v1'); result = 1; commits++;
        if (mode === 'lost-ack') { mode = 'normal'; response.destroy(); return; }
      }
    }
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ result }));
  } catch { relayErrors++; response.statusCode = 500; response.end('{}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const relay = 'http://127.0.0.1:' + server.address().port, origin = 'http://127.0.0.1:43210';
const environment = {
  NODE_ENV: 'production', BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PREFIX: prefix,
  BAZAAR_WORKSPACE_LOCAL_ORIGIN: origin, BAZAAR_WORKSPACE_REDIS_REST_URL: relay, BAZAAR_WORKSPACE_REDIS_REST_TOKEN: 'isolated-loopback-only',
  BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: relay, BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON: JSON.stringify(frozen),
};
function configure(overrides = {}) {
  for (const key of Object.keys(process.env)) if (/BAZAAR|UPSTASH|KV_REST|VERCEL/.test(key)) delete process.env[key];
  for (const [key, value] of Object.entries({ ...environment, ...overrides })) if (value === undefined) delete process.env[key]; else process.env[key] = value;
}
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.equal(url.origin, relay, 'Only the synthetic loopback Redis double is permitted');
  return nativeFetch(input, init);
};
const store = () => configuredWorkspaceStore(() => ({ ownerIds: [], hashes: [] }));
const input = owner => ({ creationId: owner.creationId, humanAccessHash: owner.hashes.human, agentAccessHash: owner.hashes.agent });
const request = (owner, value = input(owner), token = owner.tokens.bootstrap) => new Request(origin + '/api/workspaces', { method: 'POST', headers: { host: new URL(origin).host, origin, authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(value) });
const noEffect = async (action, code) => { const before = commands.length; await assert.rejects(action, { code }); assert.equal(commands.length, before); };
try {
  configure(); const handlers = createWorkspaceHandlers();
  const invalid = [
    { BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON: undefined }, { BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: undefined },
    { BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:production' }, { BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:preview' },
    { BAZAAR_WORKSPACE_BACKEND: 'file', BAZAAR_WORKSPACE_FILE_DIRECTORY: 'never-created' }, { BAZAAR_WORKSPACE_BACKEND: undefined },
    { BAZAAR_WORKSPACE_FILE_DIRECTORY: 'never-created' }, { VERCEL: '1' }, { VERCEL_ENV: 'preview' },
    { BAZAAR_WORKSPACE_LOCAL_ORIGIN: 'https://public.example' }, { BAZAAR_WORKSPACE_LOCAL_ORIGIN: undefined },
    { BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: 'http://localhost:43211', BAZAAR_WORKSPACE_REDIS_REST_URL: 'http://localhost:43211' },
    { BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: 'https://127.0.0.1:43211', BAZAAR_WORKSPACE_REDIS_REST_URL: 'https://127.0.0.1:43211' },
    { BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: 'http://127.0.0.1', BAZAAR_WORKSPACE_REDIS_REST_URL: 'http://127.0.0.1' },
    { BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: relay + '/', BAZAAR_WORKSPACE_REDIS_REST_URL: relay + '/' },
    { BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: relay + '?x=1', BAZAAR_WORKSPACE_REDIS_REST_URL: relay + '?x=1' },
    { BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: relay.replace('127.0.0.1', 'user@127.0.0.1'), BAZAAR_WORKSPACE_REDIS_REST_URL: relay.replace('127.0.0.1', 'user@127.0.0.1') },
    { BAZAAR_WORKSPACE_REDIS_REST_URL: 'https://outside.example' }, { BAZAAR_WORKSPACE_REDIS_REST_TOKEN: undefined },
    { BAZAAR_WORKSPACE_REDIS_REST_TOKEN: 'different' }, { BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON: '' },
    { BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON: '{' }, { BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON: ' '.repeat(4097) },
    ...[
      frozen.slice(0, 1), [...frozen, frozen[0]], [frozen[0], frozen[0]],
      [{ ...frozen[0], ownerId: frozen[1].ownerId }, frozen[1]],
      [{ ...frozen[0], arbitrary: true }, frozen[1]],
      [{ ...frozen[0], hashes: { ...frozen[0].hashes, human: frozen[1].hashes.human } }, frozen[1]],
      [{ ...frozen[0], ownerUuid: frozen[0].creationId, ownerId: 'ow_' + frozen[0].creationId.replaceAll('-', '') }, frozen[1]],
    ].map(owners => ({ BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON: JSON.stringify(owners) })),
  ];
  for (const configuration of invalid) {
    configure(configuration); const before = commands.length;
    assert.throws(store, { code: 'WORKSPACE_UNAVAILABLE' }); assert.equal(commands.length, before);
  }
  configure();
  assert.throws(() => createRedisWorkspaceStore({ eval: () => assert.fail('Test hook must reject before transport') }, prefix, undefined, () => identities[0].ownerUuid), { code: 'WORKSPACE_UNAVAILABLE' });
  await noEffect(() => store().createWorkspace({ ...input(identities[0]), creationId: randomUUID() }, identities[0].hashes.bootstrap), 'UNAUTHORIZED');
  await noEffect(() => store().createWorkspace(input(identities[0]), identities[1].hashes.bootstrap), 'UNAUTHORIZED');
  await noEffect(() => store().createWorkspace({ ...input(identities[0]), humanAccessHash: identities[1].hashes.human }, identities[0].hashes.bootstrap), 'WORKSPACE_CONFLICT');
  await noEffect(() => store().listConversations('ow_' + randomUUID().replaceAll('-', '')), 'WORKSPACE_UNAVAILABLE');
  const beforeSpoof = commands.length;
  assert.equal((await handlers.POST(request(identities[0], { ...input(identities[0]), ownerId: identities[1].ownerId }))).status, 400);
  assert.equal(commands.length, beforeSpoof);

  creationGates = { initial: gate(2), owner: gate(2) };
  const raced = await Promise.all([handlers.POST(request(identities[0])), handlers.POST(request(identities[0]))]);
  creationGates = undefined;
  assert.deepEqual(raced.map(response => response.status).sort(), [200, 201]);
  const receipts = await Promise.all(raced.map(async response => (await response.json()).record));
  assert.deepEqual(receipts[0], receipts[1]); assert.equal(receipts[0].ownerId, identities[0].ownerId);
  const a = receipts[0], createdB = await handlers.POST(request(identities[1])); assert.equal(createdB.status, 201);
  const b = (await createdB.json()).record; assert.equal(b.ownerId, identities[1].ownerId); assert.notEqual(a.agentId, b.agentId);
  const human = await store().resolveHash(identities[0].hashes.human), other = await store().resolveHash(identities[1].hashes.human);
  const conversation = { conversationId: randomUUID(), title: 'Native configured Redis synthetic' };
  await store().forPrincipal(human).createConversation(a.ownerId, conversation);
  await assert.rejects(() => store().forPrincipal(other).getConversation(a.ownerId, conversation.conversationId), { code: 'UNAUTHORIZED' });
  assert.deepEqual(await store().forPrincipal(other).listConversations(b.ownerId), []);
  assert.equal((await store().createWorkspace(input(identities[0]), identities[0].hashes.bootstrap)).record.ownerId, a.ownerId);
  const preserved = await store().getConversation(a.ownerId, conversation.conversationId);
  assert.deepEqual(await store().getConversation(a.ownerId, conversation.conversationId), preserved);

  const rotateHuman = { action: 'rotate', role: 'human', accessHash: identities[0].hashes.rotatedHuman, expectedGeneration: 1 };
  await store().changeAccess(a.workspaceId, identities[0].hashes.bootstrap, rotateHuman);
  assert.equal((await store().changeAccess(a.workspaceId, identities[0].hashes.bootstrap, rotateHuman)).created, false);
  await assert.rejects(() => store().resolveHash(identities[0].hashes.human), { code: 'UNAUTHORIZED' });
  assert.equal((await store().resolveHash(identities[0].hashes.rotatedHuman)).ownerId, a.ownerId);
  assert.deepEqual(await store().getConversation(a.ownerId, conversation.conversationId), preserved);
  await assert.rejects(() => store().forPrincipal(human).getConversation(a.ownerId, conversation.conversationId), { code: 'UNAUTHORIZED' });

  const rotateAgent = { action: 'rotate', role: 'agent', accessHash: identities[0].hashes.rotatedAgent, expectedGeneration: 2 };
  const beforeLost = commands.length, beforeLostCommit = commits; mode = 'lost-ack';
  await assert.rejects(() => store().changeAccess(a.workspaceId, identities[0].hashes.bootstrap, rotateAgent), { code: 'WORKSPACE_UNAVAILABLE' });
  assert.deepEqual(commands.slice(beforeLost).map(command => command.script), [READ_WORKSPACE_LUA, READ_WORKSPACE_LUA, COMMIT_WORKSPACE_LUA]);
  assert.equal(commits, beforeLostCommit + 1);
  assert.equal((await store().changeAccess(a.workspaceId, identities[0].hashes.bootstrap, rotateAgent)).created, false);
  assert.equal(commits, beforeLostCommit + 1);
  assert.equal((await store().resolveHash(identities[0].hashes.rotatedAgent)).ownerId, a.ownerId);
  await assert.rejects(() => store().resolveHash(identities[0].hashes.agent), { code: 'UNAUTHORIZED' });

  const savedRegistry = data.get(keys[0]);
  const corrupt = JSON.parse(savedRegistry); corrupt.workspaces[0].ownerId = 'ow_' + randomUUID().replaceAll('-', ''); data.set(keys[0], JSON.stringify(corrupt));
  const beforeCorruption = commands.length;
  await assert.rejects(() => store().resolveHash(identities[0].hashes.rotatedHuman), { code: 'WORKSPACE_UNAVAILABLE' });
  assert.equal(commands.length, beforeCorruption + 1); assert.equal(commands.at(-1).keys[1], keys[2]); data.set(keys[0], savedRegistry);
  const savedOwner = data.get(keys[3]); data.set(keys[3], savedOwner.slice(0, -1));
  await assert.rejects(() => store().getConversation(a.ownerId, conversation.conversationId), { code: 'WORKSPACE_UNAVAILABLE' }); data.set(keys[3], savedOwner);

  await store().changeAccess(a.workspaceId, identities[0].hashes.bootstrap, { action: 'revoke', expectedGeneration: 3 });
  await assert.rejects(() => store().resolveHash(identities[0].hashes.rotatedHuman), { code: 'UNAUTHORIZED' });
  await assert.rejects(() => store().resolveHash(identities[0].hashes.rotatedAgent), { code: 'UNAUTHORIZED' });
  assert.equal((await store().resolveHash(identities[0].hashes.bootstrap)).ownerId, a.ownerId);
  assert.deepEqual((await store().createWorkspace(input(identities[0]), identities[0].hashes.bootstrap)).record, { ...a, generation: 4, revoked: true });
  assert.deepEqual(JSON.parse(data.get(keys[0])).workspaces.map(meta => meta.ownerId).sort(), identities.map(owner => owner.ownerId).sort());
  assert.equal(data.size, 4); assert.ok([...data.keys()].every(key => keys.includes(key))); assert.equal(relayErrors, 0);
  console.log(JSON.stringify({ ok: true, node: process.version, configuredWorkspaceStore: true, productionEnvironment: true, redisSdkWithLoopbackDouble: true, invalidConfigurationCases: invalid.length, frozenOwnerCount: 2, allowedKeyCount: 5, actualStoredKeyCount: data.size, serverAssignedOwners: true, rejectsIntentBeforeTransport: true, concurrentIdenticalCreation: true, ownerIsolation: true, preservesOwnershipAndConversation: true, rotationAndRevocation: true, lostAcknowledgementNoRetry: true, explicitReplayRecovery: true, corruptionFailsClosed: true, externalRequests: 0, nativeNextAcceptance: false }));
} finally {
  globalThis.fetch = nativeFetch; await new Promise(resolve => server.close(resolve));
  for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous);
}
