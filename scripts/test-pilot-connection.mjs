import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRedisWorkspaceStore, READ_WORKSPACE_LUA, COMMIT_WORKSPACE_LUA, setWorkspaceStoreForTests } from '../lib/workspace-store.ts';
import { POST } from '../app/api/activity/connection/route.ts';

const names = ['BAZAAR_ENABLE_OPEN_WORKSPACES', 'BAZAAR_WORKSPACE_BACKEND', 'BAZAAR_WORKSPACE_PREFIX', 'BAZAAR_WORKSPACE_PUBLIC_ORIGIN', 'BAZAAR_WORKSPACE_ADMISSION', 'BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE', 'BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
const hash = value => createHash('sha256').update(value).digest('hex');
const identities = Array.from({ length: 2 }, () => Object.fromEntries(['bootstrap', 'human', 'agent'].map(role => [role, randomBytes(32).toString('base64url')])));
const data = new Map(); let exchanges = 0;
const redis = { async eval(script, keys, args) {
  exchanges++;
  if (script === READ_WORKSPACE_LUA) return keys.map(key => data.get(key) ?? '');
  assert.equal(script, COMMIT_WORKSPACE_LUA);
  if (keys.some((key, i) => (data.get(key) ?? '') !== args[i])) return 0;
  data.set(keys[0], args[3]); if (args[4]) data.set(keys[1], args[4]); data.set(keys[2], 'workspace-v1'); return 1;
} };
const request = (writer = identities[0].agent, origin = 'https://pilot.example') => new Request(origin + '/api/activity/connection', { method: 'POST', headers: { authorization: 'Bearer ' + identities[0].human, 'x-history-write-access': 'Bearer ' + writer } });
const quota = () => JSON.parse([...data].find(([key]) => key.endsWith(':registry'))[1]).globalRequestQuota.dayCount;
try {
  Object.assign(process.env, { BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:pilot-' + randomBytes(16).toString('hex'), BAZAAR_WORKSPACE_PUBLIC_ORIGIN: 'https://pilot.example', BAZAAR_WORKSPACE_ADMISSION: 'invite-only', BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE: '3', BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY: '3' });
  const store = createRedisWorkspaceStore(redis, process.env.BAZAAR_WORKSPACE_PREFIX, () => ({ ownerIds: [], hashes: [] })); setWorkspaceStoreForTests(store);
  for (const tokens of identities) await store.createWorkspace({ creationId: randomUUID(), humanAccessHash: hash(tokens.human), agentAccessHash: hash(tokens.agent) }, hash(tokens.bootstrap), 'loopback');
  assert.equal(quota(), 2);
  const before = exchanges;
  assert.equal((await POST(request(undefined, 'https://wrong.example'))).status, 400);
  assert.equal(exchanges, before, 'Wrong authority without Origin must fail before storage');
  assert.equal((await POST(request(identities[1].agent))).status, 403);
  assert.equal(quota(), 2, 'Cross-owner pairing cannot consume accepted-request quota');
  const accepted = await POST(request()); assert.equal(accepted.status, 200); assert.equal(quota(), 3);
  assert.equal(accepted.headers.get('referrer-policy'), 'no-referrer');
  const snapshot = JSON.stringify([...data]);
  const denied = await POST(request()); assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get('retry-after')) > 0);
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');
  assert.equal(JSON.stringify([...data]), snapshot, 'Exhausted quota cannot commit');
  console.log(JSON.stringify({ ok: true, originBeforeStorage: true, ownerIsolation: true, pairingCountsExactlyOnce: true, exhaustedQuotaNoWrite: true, externalRequests: 0, redis: 'Protocol double only' }));
} finally {
  setWorkspaceStoreForTests(undefined);
  for (const [name, value] of Object.entries(previous)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
}
