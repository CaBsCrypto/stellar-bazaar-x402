import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRedisWorkspaceStore, READ_WORKSPACE_LUA, COMMIT_WORKSPACE_LUA, setWorkspaceStoreForTests } from '../lib/workspace-store.ts';
import { createWorkspaceHandlers, workspaceFailure } from '../lib/workspace-http.ts';

const names = ['BAZAAR_ENABLE_OPEN_WORKSPACES', 'BAZAAR_WORKSPACE_BACKEND', 'BAZAAR_WORKSPACE_PREFIX', 'BAZAAR_WORKSPACE_PUBLIC_ORIGIN', 'BAZAAR_WORKSPACE_ADMISSION', 'BAZAAR_WORKSPACE_INVITE_HASHES_JSON', 'BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE', 'BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY', 'BAZAAR_ACCEPTANCE_METER', 'BAZAAR_ACCEPTANCE_X402'];
const old = Object.fromEntries(names.map(name => [name, process.env[name]])), oldNow = Date.now;
const hash = value => createHash('sha256').update(value).digest('hex');
const identities = Array.from({ length: 3 }, () => {
  const tokens = Object.fromEntries(['bootstrap', 'human', 'agent'].map(role => [role, randomBytes(32).toString('base64url')]));
  return { tokens, input: { creationId: randomUUID(), humanAccessHash: hash(tokens.human), agentAccessHash: hash(tokens.agent) } };
});
let now = Date.UTC(2026, 9, 2, 12, 0, 1), exchangeCount = 0, commits = 0, lostAck = false, barrier, quotaConflicts = 0;
const data = new Map();
const redis = { async eval(script, keys, args) {
  exchangeCount++;
  if (script === READ_WORKSPACE_LUA) {
    const snapshot = keys.map(key => data.get(key) ?? '');
    if (barrier) await barrier();
    return snapshot;
  }
  assert.equal(script, COMMIT_WORKSPACE_LUA);
  if (quotaConflicts > 0) { quotaConflicts--; return 0; }
  if (keys.some((key, index) => (data.get(key) ?? '') !== args[index])) return 0;
  data.set(keys[0], args[3]); if (args[4]) data.set(keys[1], args[4]); data.set(keys[2], 'workspace-v1'); commits++;
  if (lostAck) { lostAck = false; throw new Error('Synthetic lost acknowledgement'); }
  return 1;
} };
const prefix = 'bazaar-workspace:pilot-' + randomBytes(16).toString('hex');
const freshStore = () => createRedisWorkspaceStore(redis, prefix, () => ({ ownerIds: [], hashes: [] }));
const registry = () => JSON.parse([...data].find(([key]) => key.endsWith(':registry'))[1]);
const state = () => JSON.stringify([...data]);
const request = identity => new Request('https://pilot.example/api/workspaces', { method: 'POST', headers: { authorization: 'Bearer ' + identity.tokens.bootstrap, 'content-type': 'application/json' }, body: JSON.stringify(identity.input) });
try {
  Date.now = () => now;
  process.env.BAZAAR_ENABLE_OPEN_WORKSPACES = 'true'; process.env.BAZAAR_WORKSPACE_BACKEND = 'redis';
  process.env.BAZAAR_WORKSPACE_PREFIX = prefix; process.env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN = 'https://pilot.example';
  process.env.BAZAAR_WORKSPACE_ADMISSION = 'invite-only';
  process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON = JSON.stringify(identities.map(identity => hash(identity.tokens.bootstrap)));
  process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE = '2'; process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY = '3';
  const http = createWorkspaceHandlers(); setWorkspaceStoreForTests(freshStore());
  const a = await http.POST(request(identities[0])); assert.equal(a.status, 201); const ownerA = (await a.json()).record;
  const b = await http.POST(request(identities[1])); assert.equal(b.status, 201); const ownerB = (await b.json()).record;
  assert.equal(registry().globalRequestQuota.minuteCount, 2, 'Creation must count exactly once');
  const beforeDenial = state(), commitsBeforeDenial = commits;
  const blockedCreation = await http.POST(request(identities[2])); assert.equal(blockedCreation.status, 429);
  assert.equal(blockedCreation.headers.get('retry-after'), '59');
  assert.equal(state(), beforeDenial); assert.equal(commits, commitsBeforeDenial);
  assert.equal(registry().workspaces.length, 2, 'Exhausted quota cannot create a workspace');
  now += 60000;
  await freshStore().consumeRequest(ownerA.ownerId, 1);
  assert.equal(registry().globalRequestQuota.dayCount, 3);
  const beforeDayDenial = state();
  await assert.rejects(() => freshStore().consumeRequest(ownerB.ownerId, 1), error => {
    assert.equal(error.status, 429); assert.equal(error.retryAfter, 43139);
    assert.equal(workspaceFailure(error).headers.get('retry-after'), '43139'); return true;
  });
  assert.equal(state(), beforeDayDenial);
  now += 86400000;
  process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE = '1'; process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY = '1';
  let count = 0, release; const ready = new Promise(resolve => release = resolve);
  barrier = async () => { if (count >= 2) return; if (++count === 2) release(); await ready; };
  const parallel = await Promise.allSettled([freshStore().consumeRequest(ownerA.ownerId, 1), freshStore().consumeRequest(ownerB.ownerId, 1)]);
  barrier = undefined;
  assert.equal(parallel.filter(result => result.status === 'fulfilled').length, 1);
  const failure = parallel.find(result => result.status === 'rejected'); assert.equal(failure.reason.status, 429);
  assert.equal(registry().globalRequestQuota.minuteCount, 1); assert.equal(registry().globalRequestQuota.dayCount, 1);
  const beforeClockRegression = state(); now -= 60000;
  await assert.rejects(() => freshStore().consumeRequest(ownerA.ownerId, 1), { code: 'WORKSPACE_UNAVAILABLE' });
  assert.equal(state(), beforeClockRegression);
  now += 86460000;
  const beforeLostAck = commits; lostAck = true;
  await assert.rejects(() => freshStore().consumeRequest(ownerA.ownerId, 1), { code: 'WORKSPACE_UNAVAILABLE' });
  assert.equal(commits, beforeLostAck + 1, 'Unknown acknowledgement must not trigger a second commit');
  assert.equal(registry().globalRequestQuota.dayCount, 1);
  // Definite CAS0 cannot amplify the hosted x402 acceptance request budget.
  process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE = '120';
  process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY = '1000';
  process.env.BAZAAR_ACCEPTANCE_METER = 'true'; process.env.BAZAAR_ACCEPTANCE_X402 = 'true';
  const beforeAcceptanceConflict = state(), beforeAcceptanceExchanges = exchangeCount, beforeAcceptanceCommits = commits;
  quotaConflicts = 8;
  await assert.rejects(() => freshStore().consumeRequest(ownerA.ownerId, 1), { code: 'WORKSPACE_UNAVAILABLE' });
  assert.equal(exchangeCount - beforeAcceptanceExchanges, 2);
  assert.equal(commits, beforeAcceptanceCommits); assert.equal(state(), beforeAcceptanceConflict);
  assert.equal(quotaConflicts, 7, 'Acceptance must stop after its first definite CAS0');
  // Existing non-acceptance operation still tolerates seven definite conflicts.
  process.env.BAZAAR_ACCEPTANCE_METER = 'false';
  const beforeOrdinaryExchanges = exchangeCount, beforeOrdinaryCommits = commits;
  await freshStore().consumeRequest(ownerA.ownerId, 1);
  assert.equal(exchangeCount - beforeOrdinaryExchanges, 16); assert.equal(commits, beforeOrdinaryCommits + 1);
  process.env.BAZAAR_ACCEPTANCE_METER = 'true'; quotaConflicts = 0; lostAck = true;
  const beforeAcceptanceAckExchanges = exchangeCount, beforeAcceptanceAckCommits = commits;
  await assert.rejects(() => freshStore().consumeRequest(ownerA.ownerId, 1), { code: 'WORKSPACE_UNAVAILABLE' });
  assert.equal(exchangeCount - beforeAcceptanceAckExchanges, 2); assert.equal(commits, beforeAcceptanceAckCommits + 1);
  const readsBeforeBadConfig = exchangeCount;
  for (const [minute, day] of [['', '3'], ['2', ''], ['0', '3'], ['2', '10001'], ['1001', '3'], ['2x', '3']]) {
    process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE = minute; process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY = day;
    assert.equal((await http.POST(request(identities[2]))).status, 503);
    assert.equal(exchangeCount, readsBeforeBadConfig);
  }
  console.log(JSON.stringify({ ok: true, redis: 'Protocol double only', sharedAcrossOwnersAndStoreInstances: true, atomicConcurrentQuota: true, creationBlockedWithoutWrite: true, minuteAndDayRollover: true, retryAfterMatchesReset: true, clockRegressionFailsClosed: true, uncertainAcknowledgementNoRetry: true, acceptanceQuotaCasSingleAttempt: true, ordinaryCounterConflictRetriesPreserved: true, externalRequests: 0 }));
} finally {
  Date.now = oldNow; setWorkspaceStoreForTests(undefined);
  for (const [name, value] of Object.entries(old)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
}
