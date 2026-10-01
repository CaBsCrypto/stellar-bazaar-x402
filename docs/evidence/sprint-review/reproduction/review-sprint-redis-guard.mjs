import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const sourceRoot = resolve(process.argv[2]);
const { RedisBudget, DEFAULT_BUDGET, scriptsFromSource, sha256, validatePlan } = await import(pathToFileURL(resolve(sourceRoot, 'scripts/workspace-redis-budget.mjs')));
const scripts = scriptsFromSource(pathToFileURL(sourceRoot + '/'));
const identities = [0, 1].map((index) => {
  const ownerUuid = randomUUID();
  return { creationId: randomUUID(), ownerUuid, ownerId: 'ow_' + ownerUuid.replaceAll('-', ''), hashes: Object.fromEntries(['bootstrap', 'human', 'agent', 'rotatedHuman', 'rotatedAgent'].map((role) => [role, sha256(`${index}:${role}:independent-synthetic-only`)])) };
});
const prefix = 'bazaar-workspace:isolated-' + 'a'.repeat(32);
const base = `${prefix}:{${prefix.split(':')[1]}}:`;
const plan = { version: 1, prefix, identities, budget: DEFAULT_BUDGET,
  keys: [base + 'registry', base + 'initialized', base + 'owner:none', ...identities.map((v) => base + 'owner:' + v.ownerId)] };
const taskId = randomUUID(), attemptId = randomUUID(), operationId = randomUUID();
plan.payloads = {
  conversation: { conversationId: randomUUID(), title: 'Independent synthetic' },
  humanMessage: { messageId: randomUUID(), taskId, text: 'Independent synthetic task' },
  claim: { taskId, attemptId },
  conflictingAttemptId: randomUUID(),
  response: { taskId, attemptId, messageId: randomUUID(), text: 'Independent synthetic answer', operationId },
  operation: { clientOperationId: operationId, taskId, mode: 'mock', payment: { amountAtomic: '0', status: 'not-requested' }, delivery: { result: { text: 'Independent synthetic answer' } } },
  event: { eventId: randomUUID(), taskId, operationId, mode: 'mock', kind: 'delivery-reported' },
};
validatePlan(plan);
const read = (owner = plan.keys[2]) => JSON.stringify(['EVAL', scripts.READ, 3, plan.keys[0], owner, plan.keys[1]]);
const registry = (documentBytes = 0) => ({ version: 1, workspaces: [{ creationId: identities[0].creationId, ownerId: identities[0].ownerId,
  bootstrapHash: identities[0].hashes.bootstrap, initialHumanHash: identities[0].hashes.human, initialAgentHash: identities[0].hashes.agent,
  humanHash: identities[0].hashes.human, agentHash: identities[0].hashes.agent, documentBytes }] });
const commit = (documentBytes = 0) => JSON.stringify(['EVAL', scripts.COMMIT, 3, plan.keys[0], plan.keys[3], plan.keys[1], '', '', '', JSON.stringify(registry(documentBytes)), '']);
let tests = 0;
async function noSend(label, command, initialize) {
  let sends = 0;
  const guard = new RedisBudget(plan, scripts, async () => { sends++; return '{"result":["","",""]}'; });
  initialize?.(guard);
  await assert.rejects(guard.exchange(command));
  assert.equal(sends, 0, label);
  assert.ok(guard.stopped, label);
  tests++;
}
await noSend('foreign key', read(base + 'owner:foreign'));
await noSend('foreign script', JSON.stringify(['EVAL', 'return 1', 3, ...[plan.keys[0], plan.keys[2], plan.keys[1]]]));
await noSend('cannot mutate owner:none', JSON.stringify(['EVAL', scripts.COMMIT, 3, plan.keys[0], plan.keys[2], plan.keys[1], '', '', '', JSON.stringify(registry()), '']));
await noSend('request count exhausted', read(), (g) => { g.counts.requests = DEFAULT_BUDGET.redisRequests; });
await noSend('command cap reserved before send', read(), (g) => { g.counts.commands = DEFAULT_BUDGET.redisCommands - 3; });
await noSend('request body cap', read() + ' '.repeat(DEFAULT_BUDGET.perRequestBytes));
await noSend('response bytes exhausted', read(), (g) => { g.counts.responseBytes = DEFAULT_BUDGET.responseBytes; });
await noSend('negative declared stored bytes', commit(-1));
{
  let sends = 0;
  const guard = new RedisBudget(plan, scripts, async () => { sends++; throw Error('SYNTHETIC_LOST_ACK'); });
  await assert.rejects(guard.exchange(read()));
  await assert.rejects(guard.exchange(read()));
  assert.equal(sends, 1);
  assert.equal(guard.report().uncertain, 1);
  assert.equal(guard.report().commands, 4);
  tests++;
}
{
  const guard = new RedisBudget(plan, scripts, async () => '{"result":0}');
  await guard.exchange(commit());
  assert.equal(guard.report().requests, 1);
  assert.equal(guard.report().commands, 4);
  assert.equal(guard.report().commits, 0);
  assert.equal(guard.report().casRejections, 1);
  tests++;
}
{
  let sends = 0;
  const completions = [];
  const guard = new RedisBudget(plan, scripts, async () => { sends++; return new Promise((ok) => completions.push(ok)); });
  guard.counts.responseBytes = DEFAULT_BUDGET.responseBytes - 2 * DEFAULT_BUDGET.perResponseBytes;
  const first = guard.exchange(read());
  const second = guard.exchange(read());
  await assert.rejects(guard.exchange(read()));
  assert.equal(sends, 2);
  for (const ok of completions) ok('{"result":["","",""]}');
  await Promise.all([first, second]);
  tests++;
}
console.log(JSON.stringify({ ok: true, independentGuardTests: tests, sourceRoot, externalRequests: 0, realRedis: false, transportEffectsUncertainOnlyDouble: true }));
