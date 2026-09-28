// Read source only. No private files, real credentials, network or persistent state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./validate-identity-redis.mjs', import.meta.url), 'utf8');
const start = source.indexOf(' async function command(');
const end = source.indexOf('\n const redis=', start);
assert(start >= 0 && end > start, 'Runner command boundaries changed; update the extraction deliberately');
const body = source.slice(start, end);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

for (const scenario of ['created', 'existing', 'wrong-digest', 'wrong-id', 'malformed', 'lost', 'budget', 'write-budget', 'already-uncertain', 'save-failed']) {
  const state = {
    operationId: 'synthetic-operation', versionId: 'synthetic-version',
    requests: scenario === 'budget' ? 200 : 0,
    writeBytes: scenario === 'write-budget' ? 100000 : 0,
    preflight: true, uncertain: scenario === 'already-uncertain',
  };
  let sends = 0;
  const persisted = [];
  const command = await new AsyncFunction(
    'assert', 'state', 'allowed', 'save', 'fetch', 'endpoint', 'token', 'Buffer', 'AbortSignal', 'APPEND_OPERATION_LUA',
    body + '; return command;',
  )(
    assert, state, new Set(['synthetic-records', 'synthetic-index']),
    value => {
      if (scenario === 'save-failed') throw Error('Synthetic persistence failure');
      persisted.push(structuredClone(value));
    },
    async (_endpoint, options) => {
      sends++;
      assert.equal(persisted.at(-1).uncertain, true, 'Marker must be saved before any send');
      assert.equal(persisted.at(-1).requests, 1, 'Request budget must be saved before any send');
      assert(persisted.at(-1).writeBytes > 0);
      assert.equal(options.redirect, 'error');
      if (scenario === 'lost') throw Error('Synthetic response loss');
      return { ok: true, json: async () => ({ result: scenario === 'malformed' ? null : [
        scenario === 'existing' ? 'existing' : 'created',
        JSON.stringify({ digest: scenario === 'wrong-digest' ? 'wrong' : 'synthetic-digest', record: {
          clientOperationId: scenario === 'wrong-id' ? 'wrong' : state.operationId,
        } }),
      ] }) };
    },
    'https://synthetic.invalid', 'not-a-credential', Buffer, AbortSignal, 'SYNTHETIC_LUA',
  );
  let failure;
  try {
    await command(['EVAL', 'SYNTHETIC_LUA', 2, 'synthetic-records', 'synthetic-index', state.operationId, 'synthetic-digest', '{}'], ['synthetic-records', 'synthetic-index'], true);
  } catch (error) { failure = error; }
  const accepted = ['created', 'existing'].includes(scenario);
  assert.equal(Boolean(failure), !accepted, scenario);
  assert.equal(sends, ['budget', 'write-budget', 'already-uncertain', 'save-failed'].includes(scenario) ? 0 : 1, scenario);
  if (accepted) assert.equal(state.uncertain, false, scenario);
  if (['lost', 'malformed', 'wrong-id', 'wrong-digest', 'already-uncertain'].includes(scenario)) assert.equal(state.uncertain, true, scenario);
}
console.log('PASS 10 actual Redis runner command scenarios with in-memory doubles: accepted replies, malformed/altered replies, lost response, budgets, uncertainty and pre-send persistence failure. No network or private files.');
