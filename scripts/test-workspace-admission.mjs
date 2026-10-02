import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRedisWorkspaceStore, READ_WORKSPACE_LUA, COMMIT_WORKSPACE_LUA, setWorkspaceStoreForTests } from '../lib/workspace-store.ts';
import { createWorkspaceHandlers } from '../lib/workspace-http.ts';

const names = ['BAZAAR_ENABLE_OPEN_WORKSPACES', 'BAZAAR_WORKSPACE_BACKEND', 'BAZAAR_WORKSPACE_PREFIX', 'BAZAAR_WORKSPACE_ADMISSION', 'BAZAAR_WORKSPACE_INVITE_HASHES_JSON', 'BAZAAR_WORKSPACE_PUBLIC_ORIGIN', 'BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE', 'BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
const hash = value => createHash('sha256').update(value).digest('hex');
const credentials = () => Object.fromEntries(['bootstrap', 'human', 'agent'].map(role => [role, randomBytes(32).toString('base64url')]));
const data = new Map();
let exchanges = 0;
const redis = { async eval(script, keys, args) {
  exchanges++;
  if (script === READ_WORKSPACE_LUA) return keys.map(key => data.get(key) ?? '');
  assert.equal(script, COMMIT_WORKSPACE_LUA);
  if (keys.some((key, index) => (data.get(key) ?? '') !== args[index])) return 0;
  data.set(keys[0], args[3]);
  if (args[4]) data.set(keys[1], args[4]);
  data.set(keys[2], 'workspace-v1');
  return 1;
} };
const request = (tokens, input) => new Request('https://pilot.example/api/workspaces', {
  method: 'POST', headers: { authorization: 'Bearer ' + tokens.bootstrap, 'content-type': 'application/json', origin: 'https://pilot.example' }, body: JSON.stringify(input)
});
const inputFor = tokens => ({ creationId: randomUUID(), humanAccessHash: hash(tokens.human), agentAccessHash: hash(tokens.agent) });
try {
  process.env.BAZAAR_ENABLE_OPEN_WORKSPACES = 'true';
  process.env.BAZAAR_WORKSPACE_BACKEND = 'redis';
  const prefix = 'bazaar-workspace:pilot-' + randomBytes(16).toString('hex');
  process.env.BAZAAR_WORKSPACE_PREFIX = prefix;
  process.env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN = 'https://pilot.example';
  process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE = '120';
  process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY = '300';
  process.env.BAZAAR_WORKSPACE_ADMISSION = 'invite-only';
  delete process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON;
  setWorkspaceStoreForTests(createRedisWorkspaceStore(redis, prefix, () => ({ ownerIds: [], hashes: [] })));
  const handlers = createWorkspaceHandlers(), a = credentials(), b = credentials();
  const aInput = inputFor(a), bInput = inputFor(b), allow = [hash(a.bootstrap), hash(b.bootstrap)];
  for (const raw of [undefined, '', '[]', '{}', '[', JSON.stringify([a.bootstrap]), JSON.stringify([allow[0], allow[0]]), JSON.stringify(Array.from({ length: 6 }, (_, i) => hash('invite-' + i))), ' '.repeat(513)]) {
    if (raw === undefined) delete process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON;
    else process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON = raw;
    const response = await handlers.POST(request(a, aInput));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(exchanges, 0, 'Invalid configuration must not access Redis');
  }
  process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON = JSON.stringify(allow);
  for (const origin of [undefined, '', 'http://pilot.example', 'https://pilot.example/path', 'https://pilot.example/', 'https://secret@pilot.example', 'malformed']) {
    if (origin === undefined) delete process.env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN;
    else process.env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN = origin;
    assert.equal((await handlers.POST(request(a, aInput))).status, 503);
    assert.equal(exchanges, 0, 'Invalid public origin must not access Redis');
  }
  process.env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN = 'https://pilot.example';
  const wrongOrigin = request(a, aInput);
  wrongOrigin.headers.set('origin', 'https://different.example');
  assert.equal((await handlers.POST(wrongOrigin)).status, 400);
  const wrongHost = new Request('https://different.example/api/workspaces', {
    method: 'POST', headers: { authorization: 'Bearer ' + a.bootstrap, 'content-type': 'application/json' }, body: JSON.stringify(aInput)
  });
  assert.equal((await handlers.POST(wrongHost)).status, 400);
  assert.equal(exchanges, 0, 'Wrong authority must not access Redis');
  const denied = await handlers.POST(request(credentials(), aInput));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'WORKSPACE_INVITE_REQUIRED');
  assert.equal(exchanges, 0, 'Uninvited creation must not access Redis');
  const response = await handlers.POST(request(a, aInput));
  assert.equal(response.status, 201);
  const receipt = (await response.json()).record;
  const replay = await handlers.POST(request(a, aInput));
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).record, receipt);
  const duplicateInvite = await handlers.POST(request(a, inputFor(a)));
  assert.equal(duplicateInvite.status, 409, 'One admitted recovery hash cannot create a second workspace');
  const createdB = await handlers.POST(request(b, bInput));
  assert.equal(createdB.status, 201);
  assert.notEqual((await createdB.json()).record.ownerId, receipt.ownerId);
  process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON = JSON.stringify([allow[1]]);
  const beforeRemoval = exchanges;
  assert.equal((await handlers.POST(request(a, aInput))).status, 403);
  assert.equal(exchanges, beforeRemoval, 'Removed invitation must be rejected before storage');
  for (let i = 0; i < 3; i++) {
    const next = credentials();
    process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON = JSON.stringify([hash(next.bootstrap)]);
    assert.equal((await handlers.POST(request(next, inputFor(next)))).status, 201);
  }
  // A replacement process reads the same registry, rather than an in-memory count.
  const replacementStore = createRedisWorkspaceStore(redis, prefix, () => ({ ownerIds: [], hashes: [] }));
  setWorkspaceStoreForTests(replacementStore);
  await replacementStore.changeAccess(receipt.workspaceId, hash(a.bootstrap), { action: 'revoke', expectedGeneration: 1 });
  const sixth = credentials();
  process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON = JSON.stringify([hash(sixth.bootstrap)]);
  const originalValues = [...data.entries()];
  const full = await handlers.POST(request(sixth, inputFor(sixth)));
  assert.equal(full.status, 409);
  assert.equal((await full.json()).error.code, 'WORKSPACE_CAPACITY');
  assert.deepEqual([...data.entries()], originalValues, 'Capacity rejection must not store an owner or consume accepted quota');
  process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON = JSON.stringify([allow[1]]);
  assert.equal((await handlers.POST(request(b, bInput))).status, 200, 'Existing intent remains recoverable at full capacity');
  const beforeInvalidConfiguration = exchanges;
  process.env.BAZAAR_WORKSPACE_ADMISSION = 'misspelled';
  assert.equal((await handlers.POST(request(b, bInput))).status, 503);
  assert.equal(exchanges, beforeInvalidConfiguration);
  process.env.BAZAAR_WORKSPACE_ADMISSION = 'open';
  assert.equal((await handlers.POST(request(b, bInput))).status, 503, 'Open mode cannot silently ignore invite configuration');
  delete process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON;
  assert.equal((await handlers.POST(request(b, bInput))).status, 200);
  console.log(JSON.stringify({ ok: true, backend: 'Redis protocol double only', inviteAdmission: true, deniedBeforeRedis: true, replayIdentity: true, oneWorkspacePerInvite: true, lifetimeCapacityAcrossStoreInstances: 5, capacityRejectionHasNoWrites: true, exactPublicOrigin: true, dedicatedPilotPrefix: true, noExternalRequests: true }));
} finally {
  setWorkspaceStoreForTests(undefined);
  for (const [name, value] of Object.entries(previous)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
}
