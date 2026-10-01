import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Redis } from '@upstash/redis';
import { createRedisWorkspaceStore, workspacePrefix } from '../lib/workspace-store.ts';
import { prepare, authorize } from './run-open-workspace-redis-isolated.mjs';
import { RedisBudget, scriptsFromSource, validatePlan, DEFAULT_BUDGET, realRedisTransport } from './workspace-redis-budget.mjs';

assert.match(process.version, /^v22\./);
const previous = { ...process.env };
const parent = mkdtempSync(join(tmpdir(), 'bazaar-redis-budget-'));
const plan = prepare(join(parent, 'private'));
const scripts = scriptsFromSource(pathToFileURL(process.cwd() + '/'));
const read = key => JSON.stringify(['EVAL', scripts.READ, 3, plan.keys[0], key ?? plan.keys[2], plan.keys[1]]);
let sends = 0;
const make = (send = async () => { sends++; return JSON.stringify({ result: ['', '', ''] }); }) => new RedisBudget(plan, scripts, send);
async function rejected(raw, code) { const g = make(), before = sends; await assert.rejects(g.exchange(raw), { message: code }); assert.equal(sends, before, 'Rejected command must never reach transport'); await assert.rejects(g.exchange(read()), { message: code }); assert.equal(sends, before, 'Stopped guard cannot be bypassed with another valid command'); }
await rejected(JSON.stringify(['SCAN', '0']), 'INVALID_REDIS_COMMAND');
await rejected(JSON.stringify(['EVAL', scripts.READ, 3, 'historic:registry', plan.keys[2], plan.keys[1]]), 'KEY_OUTSIDE_ALLOWLIST');
await rejected(JSON.stringify(['EVAL', 'return redis.call("FLUSHALL")', 3, plan.keys[0], plan.keys[3], plan.keys[1]]), 'SCRIPT_OUTSIDE_ALLOWLIST');
await rejected(JSON.stringify(['EVAL', scripts.READ, 2, plan.keys[0], plan.keys[3]]), 'INVALID_REDIS_COMMAND');
await rejected(JSON.stringify(['EVAL', scripts.READ, 3, plan.keys[0], plan.keys[3], plan.keys[1], 'extra']), 'SCRIPT_OUTSIDE_ALLOWLIST');
for (const changed of [v => { v.identities[0].ownerUuid = '-'.repeat(36); }, v => { v.identities[1] = v.identities[0]; }, v => { v.identities[1].hashes.agent = v.identities[0].hashes.agent; }, v => { v.prefix = 'bazaar-workspace:isolated-ABCD'; }, v => { v.payloads.response.operationId = v.payloads.operation.taskId; }, v => { v.payloads.operation.payment.amountAtomic = '1'; }]) { const bad = structuredClone(plan); changed(bad); assert.throws(() => validatePlan(bad)); }
for (const [key, field, value] of [['redisRequests', 'requests', DEFAULT_BUDGET.redisRequests], ['redisCommands', 'commands', DEFAULT_BUDGET.redisCommands - 3], ['requestBytes', 'requestBytes', DEFAULT_BUDGET.requestBytes], ['responseBytes', 'responseBytes', DEFAULT_BUDGET.responseBytes]]) { const g = make(), before = sends; g.counts[field] = value; await assert.rejects(g.exchange(read()), { message: 'REDIS_BUDGET_EXHAUSTED' }); assert.equal(sends, before, key); }
const timed = make(); timed.started -= DEFAULT_BUDGET.elapsedMs + 1; await assert.rejects(timed.exchange(read()), { message: 'REDIS_BUDGET_EXHAUSTED' });
let release; const hold = new Promise(ok => release = ok), concurrent = make(async () => { sends++; await hold; return '{"result":["","",""]}'; });
concurrent.counts.responseBytes = DEFAULT_BUDGET.responseBytes - DEFAULT_BUDGET.perResponseBytes;
const inFlight = concurrent.exchange(read()), beforeConcurrent = sends;
await assert.rejects(concurrent.exchange(read()), { message: 'REDIS_BUDGET_EXHAUSTED' }); assert.equal(sends, beforeConcurrent); release(); await inFlight;

// Canonical definite CAS0 uses 4 effective commands (EVAL+GET3), not SETs.
const a = plan.identities[0];
function commit(documentBytes = 0) {
  const meta = { creationId: a.creationId, ownerId: a.ownerId, bootstrapHash: a.hashes.bootstrap, initialHumanHash: a.hashes.human, initialAgentHash: a.hashes.agent, humanHash: a.hashes.human, agentHash: a.hashes.agent, documentBytes };
  return JSON.stringify(['EVAL', scripts.COMMIT, 3, plan.keys[0], plan.keys[3], plan.keys[1], '', '', '', JSON.stringify({ version: 1, workspaces: [meta] }), '']);
}
await rejected(commit(-100), 'IDENTITY_OUTSIDE_PLAN');
const definite = make(async () => { sends++; return '{"result":0}'; }); await definite.exchange(commit()); assert.equal(definite.counts.commands, 4); assert.equal(definite.counts.casRejections, 1);
assert.equal(definite.report().storedValues.lastConfirmedValueBytes, null, 'CAS0 does not affirm stored state');
const acknowledged = make(async () => { sends++; return '{"result":1}'; }), confirmedBody = commit();
await acknowledged.exchange(confirmedBody); const committedRegistry = JSON.parse(JSON.parse(confirmedBody)[9]);
assert.equal(acknowledged.report().storedValues.lastConfirmedValueBytes, Buffer.byteLength(JSON.parse(confirmedBody)[9]) + committedRegistry.workspaces.reduce((sum, owner) => sum + owner.documentBytes, 0) + 12);
assert.equal(acknowledged.report().storedValues.peakConfirmedValueBytes, acknowledged.report().storedValues.lastConfirmedValueBytes); assert.equal(acknowledged.report().storedValues.lastConfirmedOwners, 1); assert.equal(acknowledged.report().storedValues.currentStateConfirmed, true);
acknowledged.send = async () => { throw Error('SYNTHETIC_LOST_ACK'); }; await assert.rejects(acknowledged.exchange(commit()), { message: 'SYNTHETIC_LOST_ACK' });
assert.equal(acknowledged.report().storedValues.currentStateConfirmed, false); assert.equal(acknowledged.report().storedValues.uncertainAfterConfirmation, true); assert.ok(acknowledged.report().storedValues.lastConfirmedValueBytes > 0, 'Retain prior confirmed state after uncertainty');
const orderedReplies = [], reordered = make(async () => new Promise(done => orderedReplies.push(done)));
const earlierCommit = reordered.exchange(commit(8)), laterCommit = reordered.exchange(commit(16)); assert.equal(reordered.report().storedValues.currentStateConfirmed, false);
orderedReplies[1]('{"result":1}'); await laterCommit; assert.equal(reordered.report().storedValues.currentStateConfirmed, false, 'An exchange is still pending');
orderedReplies[0]('{"result":1}'); await earlierCommit; assert.equal(reordered.report().storedValues.currentStateConfirmed, false, 'Older successful acknowledgement must not assert current state'); assert.equal(reordered.report().storedValues.lastAcknowledgedCommitSequence, 1); assert.equal(reordered.report().storedValues.highestAcknowledgedCommitSequence, 2);
reordered.send = async () => '{"result":1}'; await reordered.exchange(commit(24)); assert.equal(reordered.report().storedValues.currentStateConfirmed, true, 'Sequential final commit after draining the exchanges confirms its values');
const concurrentReplies = [], concurrentAcknowledgements = make(async () => new Promise(done => concurrentReplies.push(done)));
const concurrentFirst = concurrentAcknowledgements.exchange(commit(8)), concurrentSecond = concurrentAcknowledgements.exchange(commit(16));
concurrentReplies[0]('{"result":1}'); await concurrentFirst; concurrentReplies[1]('{"result":1}'); await concurrentSecond;
assert.equal(concurrentAcknowledgements.report().storedValues.currentStateConfirmed, false, 'Request sequence and acknowledgement order cannot replace an exclusive commit window');
const uncertain = make(async (_raw, _max, meter) => { sends++; meter(11); throw Error('SYNTHETIC_LOST_ACK'); });
const beforeUnknown = sends; await assert.rejects(uncertain.exchange(commit()), { message: 'SYNTHETIC_LOST_ACK' }); assert.equal(sends - beforeUnknown, 1); assert.equal(uncertain.counts.commands, 6); assert.equal(uncertain.counts.responseBytes, 11);
await assert.rejects(uncertain.exchange(commit()), { message: 'SYNTHETIC_LOST_ACK' }); assert.equal(sends - beforeUnknown, 1);
const corrupt = make(async () => { sends++; return '{"result":2}'; }); await assert.rejects(corrupt.exchange(commit()), { message: 'UNCERTAIN_REDIS_COMMIT' });
const oversized = make(async () => { sends++; return 'x'.repeat(DEFAULT_BUDGET.perResponseBytes + 1); }); await assert.rejects(oversized.exchange(read()), { message: 'REDIS_RESPONSE_TOO_LARGE' });

// Real native HTTPS implementation is exercised through transport doubles only.
// No endpoint is contacted. Slow/chunked bodies cannot defeat absolute timeout.
function requestDouble(status = 200, body = '{"result":1}', neverEnd = false) {
  let calls = 0, destroyed = 0;
  const request = (_url, options, callback) => {
    calls++; assert.equal(options.agent, false); assert.equal(options.method, 'POST');
    const req = new EventEmitter(); req.destroy = () => { destroyed++; req.emit('error', Error('synthetic')); };
    req.end = () => queueMicrotask(() => { const res = new EventEmitter(); Object.assign(res, { statusCode: status, headers: {}, destroy() { res.emit('error', Error('synthetic')); } }); callback(res); res.emit('data', Buffer.from(body)); if (!neverEnd) res.emit('end'); });
    return req;
  };
  return { request, calls: () => calls, destroyed: () => destroyed };
}
const badHttp = requestDouble(503, 'synthetic upstream unavailable'), badTransport = realRedisTransport('https://synthetic.invalid', 'synthetic-not-a-real-key', badHttp.request); let measured = 0;
await assert.rejects(badTransport('{}', 65536, n => measured += n), { message: 'REDIS_HTTP_REJECTED' }); assert.equal(measured, 30); assert.equal(badHttp.calls(), 1);
const cancelledHttp = requestDouble(200, '{', true), cancelled = realRedisTransport('https://synthetic.invalid', 'synthetic', cancelledHttp.request);
const pending = cancelled('{}', 65536); cancelled.cancelPending(); await assert.rejects(pending, { message: 'REDIS_TRANSPORT_UNCERTAIN' }); assert.equal(cancelledHttp.calls(), 1); assert.equal(cancelledHttp.destroyed(), 1);
const slowHttp = requestDouble(200, '{', true), slow = realRedisTransport('https://synthetic.invalid', 'synthetic', slowHttp.request), started = Date.now();
await assert.rejects(slow('{}', 65536), { message: 'REDIS_TRANSPORT_UNCERTAIN' }); assert.ok(Date.now() - started >= 4900 && Date.now() - started < 6500); assert.equal(slowHttp.calls(), 1); assert.equal(slowHttp.destroyed(), 1);

// Authorization tests only validate data; never construct a live connection.
assert.throws(() => authorize(plan, {}, 'https://synthetic.invalid'));
const approval = { planHash: plan.planHash, sourceFingerprint: plan.sourceFingerprint, redisOrigin: 'https://synthetic.invalid', humanAuthorized: true, zeroCostConfirmed: true, humanAuthorizationReference: 'synthetic unit-test only', confirmedFreeMargin: Object.fromEntries(['redisRequests', 'redisCommands', 'requestBytes', 'responseBytes'].map(k => [k, plan.budget[k]])) };
authorize(plan, approval, approval.redisOrigin);
for (const change of [v => { v.humanAuthorized = false; }, v => { v.zeroCostConfirmed = false; }, v => { v.confirmedFreeMargin.redisCommands--; }, v => { v.planHash = 'altered'; }, v => { v.redisOrigin = 'https://different.invalid'; }]) { const bad = structuredClone(approval); change(bad); assert.throws(() => authorize(plan, bad, approval.redisOrigin)); }

try {
  for (const key of Object.keys(process.env)) if (/BAZAAR|UPSTASH|KV_REST|VERCEL/.test(key)) delete process.env[key];
  process.env.NODE_ENV = 'test'; process.env.BAZAAR_WORKSPACE_PREFIX = plan.prefix; process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN = 'http://127.0.0.1:3210'; assert.equal(workspacePrefix(), plan.prefix);
  for (const origin of ['https://external.invalid', 'http://127.0.0.1:3210/path']) { process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN = origin; assert.throws(workspacePrefix); }
  process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN = 'http://127.0.0.1:3210'; process.env.VERCEL = '1'; assert.throws(workspacePrefix); delete process.env.VERCEL;
  for (const prefix of [plan.prefix + ':evil', plan.prefix.toUpperCase(), 'bazaar-workspace:isolated-' + '-'.repeat(32)]) { process.env.BAZAAR_WORKSPACE_PREFIX = prefix; assert.throws(workspacePrefix); }
  process.env.NODE_ENV = 'production'; assert.throws(() => createRedisWorkspaceStore({ eval() { throw Error('must never be called'); } }, plan.prefix, undefined, () => a.ownerUuid));
  process.env.NODE_ENV = 'test'; let transportCalls = 0;
  const sdk = new Redis({ url: 'https://synthetic.invalid', token: 'synthetic', retry: { retries: 0 }, enableAutoPipelining: false });
  const native = globalThis.fetch; globalThis.fetch = async () => { transportCalls++; throw Error('synthetic no-network'); };
  try { await assert.rejects(sdk.eval(scripts.READ, plan.keys.slice(0, 3), [])); assert.equal(transportCalls, 1, 'Installed SDK no transport retry'); } finally { globalThis.fetch = native; }
} finally { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); }
const report = { ok: true, category: 'local with doubles only', runtime: process.version, foreignKeysCommandsLuaRejectedBeforeSend: true, budgetsBeforeEffect: true, concurrentResponseReservations: true, frozenIdsPayloadsValidated: true, negativeDocumentBytesRejected: true, cas0EffectiveCommands: 4, uncertainCommitCommandUpperBound: 6, unknownCommitNoRetry: true, errorResponseBytesCounted: true, absoluteHttpsDeadlineMs: 5000, globalPendingRequestCancellation: true, explicitAuthorizationAndFreeMarginRequired: true, isolatedPrefixLocalOnly: true, testOwnerInjectionNotProduction: true, installedSdkTransportRetries: 0, externalRequests: 0, payments: 0, privateEvidenceDirectory: join(parent, 'private') };
writeFileSync(join(parent, 'private', 'report.guard.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
