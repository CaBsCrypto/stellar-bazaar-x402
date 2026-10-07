import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { allocateOperationalBudget, createOperationalBudgetStore, operationalCheckpointSchema, operationalResources, OPERATIONAL_REQUEST_ENVELOPES } from '../lib/operational-budget.ts';

const now = Date.now(), prefix = 'bazaar-workspace:pilot-' + 'c'.repeat(32), key = prefix + ':operations-budget:state';
const shares = Object.fromEntries(operationalResources.map(name => [name, name.endsWith('Bytes') ? { public: 10, authenticated: 20, recovery: 70 } : { public: 40, authenticated: 20, recovery: 40 }]));
const checkpoint = { version: 1, epoch: randomUUID(), observedAt: new Date(now).toISOString(), expiresAt: new Date(now + 7 * 86400000).toISOString(), evidence: 'synthetic-resource-allocation', remaining: Object.fromEntries(operationalResources.map(name => [name, name === 'requests' ? 100 : 1000000000000])), profilePercent: shares };
const parsed = operationalCheckpointSchema.parse(checkpoint);
for (const invalid of [
  { ...shares, requests: { public: 39, authenticated: 20, recovery: 40 } },
  { ...shares, requests: { public: 41, authenticated: 20, recovery: 40 } },
  { ...shares, requests: { public: -1, authenticated: 20, recovery: 81 } },
  { ...shares, requests: { public: 101, authenticated: 0, recovery: -1 } },
  { ...shares, requests: { public: 40.5, authenticated: 19.5, recovery: 40 } },
  { ...shares, requests: { public: 40, recovery: 60 } },
  { ...shares, requests: { public: 40, authenticated: 20, recovery: 40, extra: 0 } },
  Object.fromEntries(Object.entries(shares).filter(([name]) => name !== 'inboundBytes')),
  { ...shares, storageBytes: { public: 40, authenticated: 20, recovery: 40 } },
]) assert.equal(operationalCheckpointSchema.safeParse({ ...checkpoint, profilePercent: invalid }).success, false);
assert.equal(operationalCheckpointSchema.safeParse({ ...checkpoint, profilePercent: Object.fromEntries(operationalResources.map(name => [name, { public: 0, authenticated: 0, recovery: 100 }])) }).success, true);

for (const remaining of [1, 7, 101, Number.MAX_SAFE_INTEGER]) {
  const source = operationalCheckpointSchema.parse({ ...checkpoint, remaining: Object.fromEntries(operationalResources.map(name => [name, remaining])) });
  const { assigned, reserved } = allocateOperationalBudget(source);
  for (const name of operationalResources) {
    const total = assigned.public[name] + assigned.authenticated[name] + assigned.recovery[name];
    assert.ok(reserved[name] >= Math.ceil(remaining / 2), 'At least half remains unassigned, including odd and maximum integers');
    assert.equal(total + reserved[name], remaining);
    for (const profile of ['public', 'authenticated', 'recovery']) assert.equal(assigned[profile][name], Number(BigInt(remaining) * BigInt(shares[name][profile]) / 200n));
  }
}

const data = new Map(); let writes = 0;
const redis = { async get(name) { return data.get(name) ?? null; }, async eval(_script, [name], [mode, previous, next]) { if (mode === 'missing' ? data.has(name) : data.get(name) !== previous) return 0; data.set(name, next); writes++; return 1; } };
const store = createOperationalBudgetStore(redis, prefix, () => parsed);
for (let count = 0; count < 20; count++) await store.reserve({ profile: 'public', newOperation: false });
const before = writes;
await assert.rejects(store.reserve({ profile: 'public', newOperation: false }), { code: 'OPERATIONAL_REQUEST_BUDGET' });
assert.equal(writes, before, 'Exhaustion does not commit another reservation');
for (let count = 0; count < 7; count++) await store.reserve({ profile: 'authenticated', newOperation: true });
await assert.rejects(store.reserve({ profile: 'authenticated', newOperation: true }), { code: 'NEW_OPERATIONS_PAUSED' });
for (let count = 0; count < 20; count++) await store.reserve({ profile: 'recovery', newOperation: false });
await assert.rejects(store.reserve({ profile: 'recovery', newOperation: false }), { code: 'OPERATIONAL_REQUEST_BUDGET' });
const summary = await store.read();
assert.deepEqual(summary.profilePercent, shares);
assert.equal(summary.profiles.public.used.requests, 20);
assert.equal(summary.profiles.authenticated.used.requests, 7);
assert.equal(summary.profiles.recovery.used.requests, 20);
assert.equal(summary.reserved.requests, 50);

// Existing v1 records omit profilePercent. Reading one neither rewrites its bytes nor resets its usage.
const legacyCheckpoint = { ...checkpoint, epoch: randomUUID(), remaining: Object.fromEntries(operationalResources.map(name => [name, OPERATIONAL_REQUEST_ENVELOPES.authenticated[name] * 400])) };
delete legacyCheckpoint.profilePercent;
const legacyAssigned = Object.fromEntries(['public', 'authenticated', 'recovery'].map(profile => [profile, Object.fromEntries(operationalResources.map(name => [name, Math.floor(legacyCheckpoint.remaining[name] * { public: 20, authenticated: 50, recovery: 30 }[profile] / 200)]))]));
const legacyReserved = Object.fromEntries(operationalResources.map(name => [name, legacyCheckpoint.remaining[name] - legacyAssigned.public[name] - legacyAssigned.authenticated[name] - legacyAssigned.recovery[name]]));
const legacyUsed = Object.fromEntries(['public', 'authenticated', 'recovery'].map(profile => [profile, Object.fromEntries(operationalResources.map(name => [name, profile === 'authenticated' ? OPERATIONAL_REQUEST_ENVELOPES.authenticated[name] * 2 : 0]))]));
const legacyRecord = JSON.stringify({ version: 1, revision: randomUUID(), checkpoint: legacyCheckpoint, assigned: legacyAssigned, reserved: legacyReserved, used: legacyUsed });
data.set(key, legacyRecord);
const legacy = await store.read();
assert.equal(data.get(key), legacyRecord);
assert.deepEqual(legacy.profiles.authenticated.assigned, legacyAssigned.authenticated);
assert.deepEqual(legacy.profiles.authenticated.used, legacyUsed.authenticated);
assert.deepEqual(legacy.profilePercent.requests, { public: 20, authenticated: 50, recovery: 30 });
assert.deepEqual(allocateOperationalBudget(operationalCheckpointSchema.parse(legacyCheckpoint)), { assigned: legacyAssigned, reserved: legacyReserved });

const freshRecord = { version: 1, revision: randomUUID(), checkpoint: parsed, ...allocateOperationalBudget(parsed), used: Object.fromEntries(['public', 'authenticated', 'recovery'].map(profile => [profile, Object.fromEntries(operationalResources.map(name => [name, 0]))])) };
const inflated = structuredClone(freshRecord); inflated.assigned.recovery.inboundBytes++; inflated.reserved.inboundBytes--;
data.set(key, JSON.stringify(inflated));
await assert.rejects(store.read(), { code: 'OPERATIONAL_BUDGET_UNAVAILABLE' });
const changedShares = structuredClone(freshRecord); changedShares.checkpoint.profilePercent.requests = { public: 20, authenticated: 50, recovery: 30 };
data.set(key, JSON.stringify(changedShares));
await assert.rejects(store.read(), { code: 'OPERATIONAL_BUDGET_UNAVAILABLE' }, 'Persisted allocation must match its validated checkpoint');

const manifest = JSON.parse(await readFile(new URL('../docs/validation/open-operations-safe-config.json', import.meta.url), 'utf8'));
assert.deepEqual(manifest.allocation.recommendedCheckpointProfilePercent, shares);
assert.equal(manifest.allocation.redisBandwidthRemainingDirectionsMustShareOneQuota, true);
console.log(JSON.stringify({ status: 'PASS', completeValidatedPerResourceShares: true, exactHalfReserve: true, independentProfileExhaustion: true, legacyLedgerReadWithoutMutation: true, inflatedLedgerRejected: true, remoteRequests: 0 }));
