import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { DEFAULT_BUDGET, canonical, sha256, scriptsFromSource, validatePlan, RedisBudget, realRedisTransport } from './workspace-redis-budget.mjs';
import { preparePrivateDirectory, verifyPrivateDirectory } from './history-private-files.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const trackedSources = ['lib/workspace-store.ts', 'scripts/history-private-files.mjs', 'scripts/workspace-redis-budget.mjs', 'scripts/workspace-redis-http-worker.mjs', 'scripts/run-open-workspace-redis-isolated.mjs'];
export function sourceFingerprint() {
  const tracked = execFileSync('git', ['ls-files', '--', 'lib', 'app', 'components', 'styles', 'public', 'scripts', 'examples', 'package.json', 'package-lock.json'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(name => name && !/(^|\/)\.env(?:\.|$)/.test(name));
  return sha256(canonical([...new Set([...tracked, ...trackedSources])].sort().map(name => [name, sha256(readFileSync(join(root, name)))])));
}
function noEnvFiles() { assert.equal(readdirSync(root).filter(name => /^\.env(?:\.|$)/.test(name) && name !== '.env.example').length, 0, 'Run only in a clean checkout without .env files; no .env is opened'); }
export function prepare(directory) {
  noEnvFiles(); assert.match(process.version, /^v22\./, 'Use existing Node 22');
  const out = preparePrivateDirectory(directory);
  const fixture = { identities: Array.from({ length: 2 }, () => ({ creationId: randomUUID(), ownerUuid: randomUUID(), tokens: Object.fromEntries(['bootstrap', 'human', 'agent', 'rotatedHuman', 'rotatedAgent'].map(role => [role, randomBytes(32).toString('base64url')])) })), conversationId: randomUUID(), messageId: randomUUID(), taskId: randomUUID(), attemptId: randomUUID(), responseId: randomUUID(), operationId: randomUUID(), eventId: randomUUID(), providerScope: randomBytes(32).toString('base64url') };
  const responseText = '  Respuesta conservada una sola vez. Resultado sintético inline.  ';
  fixture.payloads = {
    conversation: { conversationId: fixture.conversationId, title: 'Redis isolated synthetic acceptance' },
    humanMessage: { messageId: fixture.messageId, taskId: fixture.taskId, text: '  Solicitud sintética privada; sin proveedor ni pago.  ' },
    claim: { taskId: fixture.taskId, attemptId: fixture.attemptId },
    conflictingAttemptId: randomUUID(),
    response: { taskId: fixture.taskId, attemptId: fixture.attemptId, messageId: fixture.responseId, text: responseText, operationId: fixture.operationId },
    operation: { clientOperationId: fixture.operationId, taskId: fixture.taskId, mode: 'mock', service: { id: 'isolated-unpaid-synthetic', title: 'Synthetic output', provider: 'No external provider', url: 'http://127.0.0.1' }, payment: { status: 'not-requested', network: 'stellar:testnet', asset: 'USDC', amountAtomic: '0', recipient: 'G' + 'A'.repeat(55) }, delivery: { status: 'reported-delivered', result: { text: responseText, synthetic: true } } },
    event: { eventId: fixture.eventId, taskId: fixture.taskId, operationId: fixture.operationId, mode: 'mock', kind: 'delivery-reported', title: 'Synthetic inline receipt' },
  };
  const prefix = 'bazaar-workspace:isolated-' + randomBytes(16).toString('hex'), base = `${prefix}:{${prefix.split(':')[1]}}:`;
  const identities = fixture.identities.map(v => ({ creationId: v.creationId, ownerUuid: v.ownerUuid, ownerId: 'ow_' + v.ownerUuid.replaceAll('-', ''), hashes: Object.fromEntries(Object.entries(v.tokens).map(([k, value]) => [k, sha256(value)])) }));
  const scripts = scriptsFromSource(pathToFileURL(root + '/'));
  const plan = { version: 1, preparedAt: new Date().toISOString(), candidateSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceFingerprint: sourceFingerprint(), scriptHashes: Object.fromEntries(Object.entries(scripts).map(([k, v]) => [k, sha256(v)])), runtime: process.version, instance: null, zeroCost: 'unconfirmed', prefix, identities, payloads: fixture.payloads, keys: [base + 'registry', base + 'initialized', base + 'owner:none', ...identities.map(v => base + 'owner:' + v.ownerId)], budget: DEFAULT_BUDGET, scope: 'two new synthetic owners; no payments/provider activation/files/deletion; real execution requires specific authorization' };
  plan.planHash = sha256(canonical(plan)); validatePlan(plan);
  writeFileSync(join(out, 'fixture.private.json'), JSON.stringify(fixture), { flag: 'wx', mode: 0o600 });
  writeFileSync(join(out, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  return plan;
}
export function authorize(plan, authorization, origin) {
  assert.equal(authorization.planHash, plan.planHash, 'Authorization must name this exact frozen plan');
  assert.equal(authorization.sourceFingerprint, plan.sourceFingerprint, 'Authorization must name this exact executor');
  assert.equal(authorization.redisOrigin, origin, 'Authorization must identify the explicit instance');
  assert.equal(authorization.humanAuthorized, true); assert.equal(authorization.zeroCostConfirmed, true);
  assert.equal(typeof authorization.humanAuthorizationReference, 'string'); assert.ok(authorization.humanAuthorizationReference.trim());
  for (const [key, limit] of Object.entries(plan.budget)) if (['redisRequests', 'redisCommands', 'requestBytes', 'responseBytes'].includes(key)) assert.ok(Number.isSafeInteger(authorization.confirmedFreeMargin?.[key]) && authorization.confirmedFreeMargin[key] >= limit, `Unconfirmed zero-cost margin: ${key}`);
}
export async function execute(planPath, mode, approvalPath, executedHash) {
  noEnvFiles(); assert.match(process.version, /^v22\./); assert.ok(['double', 'real'].includes(mode));
  verifyPrivateDirectory(resolve(planPath, '..'));
  const plan = JSON.parse(readFileSync(planPath, 'utf8')), { planHash, ...withoutHash } = plan;
  assert.equal(sha256(canonical(withoutHash)), planHash); assert.equal(plan.sourceFingerprint, sourceFingerprint(), 'Reprepare after any executor/source change'); validatePlan(plan);
  assert.equal(plan.runtime, process.version); assert.equal(plan.candidateSha, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), 'Reprepare at candidate exact HEAD');
  const fixture = JSON.parse(readFileSync(join(resolve(planPath, '..'), 'fixture.private.json'), 'utf8'));
  for (let i = 0; i < 2; i++) { assert.equal(fixture.identities[i].creationId, plan.identities[i].creationId); for (const [key, token] of Object.entries(fixture.identities[i].tokens)) assert.equal(sha256(token), plan.identities[i].hashes[key]); }
  assert.equal(canonical(fixture.payloads), canonical(plan.payloads), 'Frozen request bodies must match before transport');
  const secrets = fixture.identities.flatMap(v => Object.values(v.tokens)).concat(fixture.providerScope);
  let realOrigin, send;
  const data = new Map(); const scripts = scriptsFromSource(pathToFileURL(root + '/'));
  if (mode === 'real') {
    // This branch is never entered by local tests. No .env/legacy aliases.
    assert.equal(executedHash, planHash, 'Explicit execution acknowledgement required');
    realOrigin = process.env.BAZAAR_ISOLATED_REDIS_REST_URL;
    assert.ok(realOrigin && approvalPath, 'No confirmed instance/authorization');
    authorize(plan, JSON.parse(readFileSync(approvalPath, 'utf8')), realOrigin);
    const token = process.env.BAZAAR_ISOLATED_REDIS_REST_TOKEN; assert.ok(token, 'Explicit dedicated Redis token required'); secrets.push(token);
    send = realRedisTransport(realOrigin, token);
  } else send = async raw => {
    const c = JSON.parse(raw), keys = c.slice(3, 6), args = c.slice(6); let result;
    if (c[1] === scripts.READ) result = keys.map(k => data.get(k) ?? '');
    else if (keys.some((key, i) => (data.get(key) ?? '') !== args[i])) result = 0;
    else { data.set(keys[0], args[3]); if (args[4]) data.set(keys[1], args[4]); data.set(keys[2], 'workspace-v1'); result = 1; }
    return JSON.stringify({ result });
  };
  const guard = new RedisBudget(plan, scripts, send);
  const relay = createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== '/' || req.headers.authorization !== 'Bearer isolated-loopback-only') throw Error('RELAY_REQUEST_REJECTED');
      const chunks = []; let n = 0; for await (const chunk of req) { n += chunk.length; if (n > plan.budget.perRequestBytes) throw Error('RELAY_REQUEST_TOO_LARGE'); chunks.push(chunk); }
      const response = await guard.exchange(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(response);
    } catch { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"ISOLATED_REDIS_STOPPED"}'); }
  });
  await new Promise(resolveListen => relay.listen(0, '127.0.0.1', resolveListen));
  const relayOrigin = 'http://127.0.0.1:' + relay.address().port, children = new Set(), clients = new Set();
  const app = { requests: 0, requestBytes: 0, responseBytes: 0, discardedAcknowledgements: 0 }; let stopped = false, reservedAppResponseBytes = 0;
  const origins = new Set(), observedOrigins = []; const findings = [];
  const timer = setTimeout(() => { stopped = true; guard.stopped ??= 'EXECUTION_DEADLINE'; send.cancelPending?.(); for (const child of children) child.kill(); relay.closeAllConnections(); }, plan.budget.elapsedMs);
  const nativeFetch = globalThis.fetch;
  const appFetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.ok(origins.has(url.origin), 'Application transport only reaches its own loopback workers');
    const body = typeof init.body === 'string' ? init.body : ''; assert.ok(!init.body || typeof init.body === 'string', 'Countable SDK JSON body required');
    const size = Buffer.byteLength(body);
    if (stopped || guard.stopped || app.requests + 1 > plan.budget.applicationRequests || app.requestBytes + size > plan.budget.applicationRequestBytes || app.responseBytes + reservedAppResponseBytes + 65536 > plan.budget.applicationResponseBytes) throw Error('APPLICATION_BUDGET_EXHAUSTED');
    app.requests++; app.requestBytes += size;
    reservedAppResponseBytes += 65536;
    try {
    const response = await nativeFetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) });
    const bytes = Buffer.from(await response.arrayBuffer()); app.responseBytes += bytes.length; if (bytes.length > 65536) throw Error('APPLICATION_RESPONSE_TOO_LARGE');
    return new Response(bytes.length ? bytes : null, { status: response.status, headers: response.headers });
    } finally { reservedAppResponseBytes -= 65536; }
  };
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|PATHEXT|SYSTEMDRIVE|PROGRAMDATA)$/i.test(key)));
  async function start() {
    const child = spawn(process.execPath, ['--experimental-strip-types', join(root, 'scripts/workspace-redis-http-worker.mjs'), resolve(planPath)], { cwd: root, env: { ...clean, NODE_ENV: 'test', BAZAAR_ISOLATED_WORKER: '1', BAZAAR_ISOLATED_RELAY_ORIGIN: relayOrigin, BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PREFIX: plan.prefix, BAZAAR_WORKSPACE_LOCAL_ORIGIN: 'http://127.0.0.1', BAZAAR_ENABLE_SELF_LISTING_INTAKE: 'false', BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW: 'false', BAZAAR_ENABLE_PROVIDER_ACTIVATION: 'false', BAZAAR_ENABLE_REGISTRY_MUTATIONS: 'false', X402_PILOT_PAYMENTS_ENABLED: 'false', X402_LEGACY_PAYMENTS_ENABLED: 'false', X402_ENABLE_LOCAL_PAYER: 'false', NEXT_PUBLIC_X402_XLM_PILOT: 'false', NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.add(child); child.stderr.resume();
    return new Promise((resolveStart, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(Error('ISOLATED_WORKER_START_TIMEOUT')); }, 10000);
      child.once('error', () => { clearTimeout(timeout); reject(Error('ISOLATED_WORKER_START_FAILED')); });
      child.once('exit', code => { clearTimeout(timeout); reject(Error('ISOLATED_WORKER_EXIT_' + code)); });
      child.once('message', message => { clearTimeout(timeout); assert.equal(message.ready, true); origins.add(message.origin); observedOrigins.push(message.origin); resolveStart({ child, origin: message.origin }); });
    });
  }
  async function stop(worker) { if (worker.child.exitCode === null) { const finished = new Promise(ok => worker.child.once('exit', ok)); worker.child.kill(); await finished; } children.delete(worker.child); origins.delete(worker.origin); }
  async function http(worker, path, token, body) { const r = await appFetch(worker.origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), origin: worker.origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, body: await r.json() }; }
  const ok = r => { assert.ok([200, 201].includes(r.status), 'HTTP_FAILED_' + r.status + '_' + (r.body.error?.code ?? 'UNKNOWN')); return r.body; };
  const denied = r => assert.ok([400, 401, 403, 404, 409].includes(r.status), 'DENIAL_FAILED_' + r.status);
  async function mcp(worker, token) { const client = new Client({ name: 'isolated-redis-acceptance', version: '1.0' }); clients.add(client); await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp', worker.origin), { requestInit: { headers: { authorization: 'Bearer ' + token, origin: worker.origin } }, fetch: appFetch, reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 0, maxReconnectionDelay: 0, reconnectionDelayGrowFactor: 1 } })); return client; }
  async function call(client, name, args = {}, expectError = false) { const response = await client.callTool({ name, arguments: args }); const data = response.structuredContent ?? JSON.parse(response.content.find(v => v.type === 'text').text); assert.equal(response.isError === true, expectError, 'MCP_FAILED_' + name + '_' + JSON.stringify(data)); return data; }
  let success = false, failure = null;
  try {
    // Exactly five allowed keys are checked for absence; no SCAN/KEYS/FLUSH/DEL.
    for (const key of [plan.keys[2], plan.keys[3], plan.keys[4]]) { const r = JSON.parse(await guard.exchange(JSON.stringify(['EVAL', scripts.READ, 3, plan.keys[0], key, plan.keys[1]]))); assert.deepEqual(r.result, ['', '', ''], 'FRESH_NAMESPACE_REQUIRED'); }
    const first = await start(), second = await start();
    const a = fixture.identities[0], b = fixture.identities[1], creation = v => ({ creationId: v.creationId, humanAccessHash: sha256(v.tokens.human), agentAccessHash: sha256(v.tokens.agent) });
    const created = await Promise.all([http(first, '/api/workspaces', a.tokens.bootstrap, creation(a)), http(second, '/api/workspaces', a.tokens.bootstrap, creation(a))]);
    assert.deepEqual(created.map(v => v.status).sort(), [200, 201]); const ref = ok(created[0]).record; assert.equal(ref.ownerId, plan.identities[0].ownerId); assert.equal(ok(created[1]).record.workspaceId, ref.workspaceId);
    const refB = ok(await http(second, '/api/workspaces', b.tokens.bootstrap, creation(b))).record; assert.equal(refB.ownerId, plan.identities[1].ownerId); assert.notEqual(ref.ownerId, refB.ownerId);
    const boot = await mcp(first, a.tokens.bootstrap); assert.equal((await boot.listTools()).tools.length, 17);
    const replay = await call(boot, 'create_bazaar_workspace', creation(a)); assert.equal(replay.created, false); assert.equal(replay.record.ownerId, ref.ownerId);
    denied(await http(first, '/api/workspaces', a.tokens.bootstrap, { ...creation(a), humanAccessHash: sha256(a.tokens.rotatedHuman) }));
    denied(await http(first, '/api/operations', a.tokens.bootstrap));
    const conversationPath = `/api/conversations/${fixture.conversationId}/messages`;
    const humanMessage = fixture.payloads.humanMessage;
    ok(await http(first, '/api/conversations', a.tokens.human, fixture.payloads.conversation));
    ok(await http(first, conversationPath, a.tokens.human, humanMessage)); assert.equal(ok(await http(second, conversationPath, a.tokens.human, humanMessage)).created, false);
    const agent = await mcp(second, a.tokens.agent); assert.equal((await call(agent, 'list_bazaar_agent_tasks')).tasks.length, 1);
    await call(agent, 'claim_bazaar_agent_task', fixture.payloads.claim);
    assert.equal(ok(await http(first, '/api/agent-tasks', a.tokens.agent, fixture.payloads.claim)).created, false);
    const response = fixture.payloads.response, operation = fixture.payloads.operation;
    // The synthetic response/payload is already frozen privately. Native chat
    // requires the operation to exist before linking its one final response.
    await call(agent, 'record_bazaar_operation', { operation });
    assert.equal((await call(agent, 'record_bazaar_operation', { operation })).created, false);
    await call(agent, 'respond_bazaar_agent_task', response);
    await call(agent, 'record_bazaar_activity', { event: fixture.payloads.event });
    const history = ok(await http(first, '/api/operations', a.tokens.human)).records, conversation = ok(await http(second, conversationPath, a.tokens.human)).conversation;
    assert.equal(history.length, 1); assert.deepEqual(history[0].delivery.result, operation.delivery.result); assert.equal(conversation.messages.length, 2); assert.equal(conversation.messages[0].text, humanMessage.text); assert.equal(conversation.messages[1].text, response.text); assert.equal(conversation.messages[1].operationId, fixture.operationId); assert.equal(conversation.tasks[0].operationId, fixture.operationId);
    assert.deepEqual(ok(await http(first, `/api/deliveries?operationId=${fixture.operationId}`, a.tokens.human)).versions, []);
    denied(await http(second, conversationPath, b.tokens.human)); assert.deepEqual(ok(await http(second, '/api/operations', b.tokens.human)).records, []);
    denied(await http(second, `/api/deliveries?operationId=${fixture.operationId}`, b.tokens.human));
    const human = await mcp(first, a.tokens.human); await call(human, 'record_bazaar_operation', { operation }, true);
    const provider = await mcp(first, fixture.providerScope); await call(provider, 'list_bazaar_agent_tasks', {}, true); await call(provider, 'get_operation_history', {}, true);
    denied(await http(first, '/api/agent-tasks', a.tokens.human));
    await call(agent, 'record_bazaar_operation', { operation: { ...operation, delivery: { ...operation.delivery, result: { text: 'Changed frozen conditions' } } } }, true);
    let generation = ref.generation;
    for (const [role, token] of [['agent', a.tokens.rotatedAgent], ['human', a.tokens.rotatedHuman]]) { const changed = ok(await http(first, `/api/workspaces/${ref.workspaceId}/access`, a.tokens.bootstrap, { action: 'rotate', role, accessHash: sha256(token), expectedGeneration: generation })); generation = changed.record.generation; }
    denied(await http(second, '/api/operations', a.tokens.agent)); denied(await http(second, '/api/operations', a.tokens.human));
    ok(await http(second, '/api/operations', a.tokens.rotatedAgent)); ok(await http(second, '/api/operations', a.tokens.rotatedHuman));
    ok(await http(first, '/api/workspaces', a.tokens.bootstrap, creation(a))); denied(await http(first, '/api/operations', a.tokens.agent));
    for (const client of clients) await client.close(); clients.clear(); await stop(first); await stop(second);
    const restarted = await start();
    assert.deepEqual(ok(await http(restarted, '/api/operations', a.tokens.rotatedHuman)).records, history);
    assert.deepEqual(ok(await http(restarted, conversationPath, a.tokens.rotatedHuman)).conversation, conversation);
    const receipts = ok(await http(restarted, `/api/activity?view=events&taskId=${fixture.taskId}`, a.tokens.rotatedHuman)).items; assert.equal(receipts.filter(v => v.eventId === fixture.eventId).length, 1);
    denied(await http(restarted, '/api/agent-tasks', a.tokens.rotatedAgent, { taskId: fixture.taskId, attemptId: fixture.payloads.conflictingAttemptId }));
    const revoke = { action: 'revoke', expectedGeneration: generation };
    ok(await http(restarted, `/api/workspaces/${ref.workspaceId}/access`, a.tokens.bootstrap, revoke)); assert.equal(ok(await http(restarted, `/api/workspaces/${ref.workspaceId}/access`, a.tokens.bootstrap, revoke)).created, false);
    denied(await http(restarted, '/api/operations', a.tokens.rotatedHuman)); denied(await http(restarted, '/api/operations', a.tokens.rotatedAgent)); await stop(restarted);
    const revokedRestart = await start(); denied(await http(revokedRestart, '/api/operations', a.tokens.rotatedHuman)); ok(await http(revokedRestart, '/api/operations', b.tokens.human)); await stop(revokedRestart);
    if (mode === 'double') { assert.equal(data.size, 4); assert.deepEqual([...data.keys()].sort(), plan.keys.filter(v => !v.endsWith(':owner:none')).sort()); for (const raw of data.values()) for (const secret of secrets) assert.ok(!raw.includes(secret), 'No plaintext credentials in Redis'); }
    findings.push('two server-owned identities', 'concurrent/idempotent HTTP creation', 'real MCP SDK with 17 tools', 'preserved human message/task/agent response/inline operation/activity receipt', 'other owner and wrong scopes denied', 'rotation and revocation survive process restart', 'same IDs and exact delivery recovered without reexecution'); success = true;
  } catch (error) { failure = String(error.message).slice(0, 500); for (const secret of secrets) failure = failure.split(secret).join('[redacted]'); }
  finally { clearTimeout(timer); send.cancelPending?.(); for (const client of clients) await client.close().catch(() => {}); for (const child of children) if (child.exitCode === null) child.kill(); relay.closeAllConnections(); await new Promise(resolveClose => relay.close(resolveClose)); }
  const report = { ok: success, category: mode === 'real' ? 'Redis real isolated, test-only HTTP host' : 'local with Redis REST double, test-only HTTP host', candidateSha: plan.candidateSha, sourceFingerprint: plan.sourceFingerprint, planHash, runtime: process.version, observedOrigins, processesStarted: observedOrigins.length, redisOrigin: realOrigin ?? null, prefix: plan.prefix, configuration: { backend: 'redis', localOriginsOnly: true, ownerFactory: 'test-only, server-assigned frozen UUIDs', cleanEnvironment: true, sdkRetry: { retries: 0 }, autoPipelining: false, mcpReconnectRetries: 0, selfListing: false, providerActivation: false, payments: false, envFilesLoaded: false }, effective: guard.report(), applicationTransport: app, findings, failure, externalRequests: mode === 'real' ? guard.counts.requests : 0, paidProviderInvocations: 0, payments: 0, limitation: 'Not native Next/configuredWorkspaceStore acceptance, browser Magic Link acceptance, backups or Redis-loss durability. Unknown outcome remains stopped; no deletion/cleanup of Redis keys.' };
  const raw = JSON.stringify(report, null, 2); for (const secret of secrets) assert.ok(!raw.includes(secret), 'Report contains secret');
  writeFileSync(join(resolve(planPath, '..'), `report.${mode}.json`), raw + '\n', { flag: 'wx' });
  return report;
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [mode, path, approval, planHash] = process.argv.slice(2);
  try { if (mode === 'prepare') { const plan = prepare(path); console.log(JSON.stringify({ prepared: true, planHash: plan.planHash, prefix: plan.prefix, keys: plan.keys, budget: plan.budget, real: 'blocked: no confirmed instance/free margin/human authorization' })); } else { const report = await execute(resolve(path), mode, approval, planHash); console.log(JSON.stringify(report)); if (!report.ok) process.exitCode = 1; } }
  catch { console.error('ISOLATED_REDIS_EXECUTOR_REJECTED; no secret values logged'); process.exitCode = 1; }
}
