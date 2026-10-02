import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPilotAccess, parsePilotAccess, pilotHash } from '../lib/pilot-access.ts';

const origin = 'https://pilot.example';
const original = createPilotAccess(origin);
const preserved = JSON.stringify(original);
const restored = parsePilotAccess(preserved, origin);
assert.deepEqual(restored, original, 'Recovery must preserve every credential and intent');
assert.equal(await pilotHash(restored.bootstrap), createHash('sha256').update(original.bootstrap).digest('hex'));
for (const invalid of [
  { ...original, origin: 'https://other.example' },
  { ...original, agent: original.human },
  { ...original, bootstrap: '' },
  { ...original, creationId: 'new-intent' },
  { ...original, extra: 'unrecognized' },
  { ...original, version: 'future-version' },
]) assert.throws(() => parsePilotAccess(JSON.stringify(invalid), origin));
assert.throws(() => parsePilotAccess(' '.repeat(2049), origin));
assert.throws(() => parsePilotAccess('null', origin));
assert.throws(() => parsePilotAccess('[]', origin));
console.log(JSON.stringify({ ok: true, scope: 'access packet preservation and admission digest only', exactRecovery: true, rejectsOtherOrigin: true, rejectsCredentialCollision: true, rejectsCorruptPackets: true, externalRequests: 0, limitation: 'Does not verify browser lifecycle, download, rendering or hosted creation' }));
