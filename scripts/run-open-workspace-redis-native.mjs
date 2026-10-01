import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { prepare, authorize, sourceFingerprint } from './run-open-workspace-redis-isolated.mjs';
import { canonical, sha256, scriptsFromSource, validatePlan, RedisBudget, realRedisTransport } from './workspace-redis-budget.mjs';
import { verifyPrivateDirectory } from './history-private-files.mjs';
import { ApplicationLedger, createApplicationProxy } from './workspace-native-application-proxy.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const markerPath = join(root, '.next/BAZAAR_NATIVE_BUILD.json');
const currentHead = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const cleanEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|PATHEXT|SYSTEMDRIVE|PROGRAMDATA)$/i.test(key)));
function environmentGate() {
  assert.equal(process.version, 'v22.18.0', 'Exact reviewed Node 22.18.0 required');
  assert.equal(readdirSync(root).filter(name => /^\.env(?:\.|$)/i.test(name) && name.toLowerCase() !== '.env.example').length, 0, 'Run only without .env files; no .env is opened');
}
export function buildFingerprint() {
  const files = [];
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error('BUILD_SYMLINK_REJECTED');
      if (entry.isDirectory()) walk(path); else if (entry.isFile()) files.push(path);
    }
  };
  for (const directory of ['server', 'static']) walk(join(root, '.next', directory));
  for (const entry of readdirSync(join(root, '.next'), { withFileTypes: true })) if (entry.isFile() && (entry.name === 'BUILD_ID' || entry.name === 'package.json' || entry.name.includes('manifest'))) files.push(join(root, '.next', entry.name));
  return sha256(canonical(files.sort().map(path => [relative(root, path).replaceAll('\\', '/'), sha256(readFileSync(path))])));
}
export function verifyNativeBuild() {
  environmentGate(); const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
  assert.equal(marker.candidateSha, currentHead(), 'Rebuild for current candidate HEAD');
  assert.equal(marker.sourceFingerprint, sourceFingerprint(), 'Rebuild after every source/executor change');
  assert.equal(marker.runtime, process.version); assert.equal(marker.buildId, readFileSync(join(root, '.next/BUILD_ID'), 'utf8').trim());
  assert.equal(marker.buildFingerprint, buildFingerprint(), 'Native build changed since recorded build');
  assert.equal(marker.command, 'node node_modules/next/dist/bin/next build --webpack');
  assert.equal(marker.exitCode, 0); return marker;
}
export async function buildNative() {
  environmentGate(); const fingerprint = sourceFingerprint(), candidateSha = currentHead();
  const child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], { cwd: root, env: { ...cleanEnvironment(), NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
  const exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done); });
  assert.equal(exitCode, 0, 'Native Next build failed'); assert.equal(fingerprint, sourceFingerprint(), 'Source changed during build'); assert.equal(candidateSha, currentHead(), 'HEAD changed during build');
  const marker = { candidateSha, sourceFingerprint: fingerprint, runtime: process.version, nodeExecutable: process.execPath, nextVersion: JSON.parse(readFileSync(join(root, 'node_modules/next/package.json'), 'utf8')).version, buildId: readFileSync(join(root, '.next/BUILD_ID'), 'utf8').trim(), buildFingerprint: buildFingerprint(), command: 'node node_modules/next/dist/bin/next build --webpack', environment: 'OS allowlist plus NEXT_TELEMETRY_DISABLED=1; no env files', exitCode, builtAt: new Date().toISOString() };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n'); return marker;
}
export function prepareNative(directory) {
  const nativeBuild = verifyNativeBuild(), plan = prepare(directory);
  delete plan.planHash;
  Object.assign(plan, { executor: 'native-next-configured-workspace-store-v1', nativeBuild, browserAcceptance: 'required for native sprint acceptance; mode double verifies without contacting Redis externally', instance: { name: 'bazaar-validacion-20261001', redisOrigin: 'https://smooth-dory-323957.upstash.io', region: 'us-east-1', plan: 'Free', credentialSource: 'explicit dedicated process variables only; not read during prepare' }, scope: 'two new frozen server-owned identities; native next start and configuredWorkspaceStore Redis only; browser+MCP+two processes+restart share exact budgets; no payments/provider activation/files/deletion; real execution requires specific human authorization' });
  plan.planHash = sha256(canonical(plan)); validatePlan(plan);
  writeFileSync(join(resolve(directory), 'plan.json'), JSON.stringify(plan, null, 2) + '\n', { mode: 0o600 }); return plan;
}
async function reservePort() {
  const socket = createServer(); await new Promise(done => socket.listen(0, '127.0.0.1', done)); const port = socket.address().port;
  await new Promise(done => socket.close(done)); return port;
}
export async function executeNative(planPath, mode, approvalPath, executionHash, { browser = false } = {}) {
  environmentGate(); assert.ok(['double', 'real'].includes(mode));
  if (mode === 'real') assert.equal(browser, true, 'Redis real sprint acceptance requires browser mode before any transport');
  const evidenceDirectory = resolve(planPath, '..'); verifyPrivateDirectory(evidenceDirectory);
  const plan = JSON.parse(readFileSync(planPath, 'utf8')), { planHash, ...withoutHash } = plan;
  assert.equal(plan.executor, 'native-next-configured-workspace-store-v1'); assert.equal(sha256(canonical(withoutHash)), planHash); validatePlan(plan);
  assert.equal(plan.sourceFingerprint, sourceFingerprint()); assert.equal(plan.candidateSha, currentHead()); assert.equal(plan.runtime, process.version);
  assert.equal(canonical(plan.nativeBuild), canonical(verifyNativeBuild()));
  const fixture = JSON.parse(readFileSync(join(evidenceDirectory, 'fixture.private.json'), 'utf8'));
  assert.equal(fixture.identities.length, 2); assert.equal(canonical(fixture.payloads), canonical(plan.payloads));
  for (let index = 0; index < 2; index++) {
    const identity = fixture.identities[index], frozen = plan.identities[index]; assert.equal(identity.creationId, frozen.creationId); assert.equal(identity.ownerUuid, frozen.ownerUuid);
    for (const [role, token] of Object.entries(identity.tokens)) assert.equal(sha256(token), frozen.hashes[role]);
  }
  const secrets = fixture.identities.flatMap(identity => Object.values(identity.tokens)).concat(fixture.providerScope), scripts = scriptsFromSource(pathToFileURL(root + '/'));
  if (browser) { assert.ok(process.env.BAZAAR_NATIVE_PLAYWRIGHT_MODULES && process.env.BAZAAR_NATIVE_CHROMIUM_EXECUTABLE, 'Explicit existing browser runtime paths required before effects'); assert.ok(existsSync(process.env.BAZAAR_NATIVE_CHROMIUM_EXECUTABLE)); const { preflightNativeBrowserAcceptance } = await import('./workspace-native-browser-acceptance.mjs'); await preflightNativeBrowserAcceptance(); }
  const data = new Map(); let realOrigin = null, send;
  if (mode === 'real') {
    assert.equal(executionHash, planHash, 'Specific execution acknowledgment required');
    realOrigin = process.env.BAZAAR_ISOLATED_REDIS_REST_URL; assert.equal(realOrigin, plan.instance.redisOrigin); assert.ok(approvalPath);
    authorize(plan, JSON.parse(readFileSync(approvalPath, 'utf8')), realOrigin);
    const token = process.env.BAZAAR_ISOLATED_REDIS_REST_TOKEN; assert.ok(token, 'Explicit dedicated Redis token required'); secrets.push(token); send = realRedisTransport(realOrigin, token);
  } else send = async raw => {
    const command = JSON.parse(raw), keys = command.slice(3, 6), args = command.slice(6); let result;
    if (command[1] === scripts.READ) result = keys.map(key => data.get(key) ?? '');
    else if (keys.some((key, index) => (data.get(key) ?? '') !== args[index])) result = 0;
    else { data.set(keys[0], args[3]); if (args[4]) data.set(keys[1], args[4]); data.set(keys[2], 'workspace-v1'); result = 1; }
    return JSON.stringify({ result });
  };
  // Persist before the first absence read/effect; a crash cannot silently reset
  // this frozen attempt's budgets. Recovery requires an explicit new decision.
  writeFileSync(join(evidenceDirectory, `attempt.native.${mode}.json`), JSON.stringify({ planHash, candidateSha: plan.candidateSha, sourceFingerprint: plan.sourceFingerprint, buildId: plan.nativeBuild.buildId, mode, browser, startedAt: new Date().toISOString(), budget: plan.budget, recovery: 'No automatic retry; preserve this attempt and authorize explicit recovery after uncertainty.' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const started = Date.now(), guard = new RedisBudget(plan, scripts, send); guard.started = started;
  const children = new Set(), clients = new Set(), workers = new Set(), observedProcesses = [], findings = [], browserAbort = new AbortController(); let stopped = false, timer, browserReport = null, success = false, failure = null;
  const stopExecution = code => { stopped = true; guard.stopped ??= code; browserAbort.abort(Error(code)); send.cancelPending?.(); for (const child of children) child.kill(); };
  const ledger = new ApplicationLedger(plan.budget, stopExecution, started);
  const relay = createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || !['/', '/native-rejection'].includes(req.url) || req.headers.authorization !== 'Bearer isolated-loopback-only') throw Error('RELAY_REQUEST_REJECTED');
      const chunks = []; let n = 0; for await (const chunk of req) { n += chunk.length; if (n > plan.budget.perRequestBytes) throw Error('RELAY_REQUEST_TOO_LARGE'); chunks.push(chunk); }
      if (req.url === '/native-rejection') {
        const attempted = JSON.parse(Buffer.concat(chunks).toString('utf8')); assert.ok(Number.isSafeInteger(attempted.requestBytes) && attempted.requestBytes >= 0 && attempted.requestBytes <= plan.budget.applicationRequestBytes);
        const lease = ledger.reserve(65536, 'pageRequests'); lease.request(attempted.requestBytes); lease.release(); ledger.counts.rejected++; stopExecution('NATIVE_PROXY_BYPASS_REJECTED');
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"recorded":true}'); return;
      }
      const response = await guard.exchange(Buffer.concat(chunks).toString('utf8')); res.writeHead(200, { 'content-type': 'application/json' }); res.end(response);
    } catch { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"ISOLATED_REDIS_STOPPED"}'); }
  });
  await new Promise(done => relay.listen(0, '127.0.0.1', done)); const relayOrigin = 'http://127.0.0.1:' + relay.address().port;
  timer = setTimeout(() => { stopExecution('EXECUTION_DEADLINE'); relay.closeAllConnections(); }, Math.max(1, plan.budget.elapsedMs - (Date.now() - started)));
  async function start(worker) {
    assert.ok(!stopped && !guard.stopped, 'EXECUTION_STOPPED');
    const nativePort = await reservePort();
    if (!worker) {
      worker = { proxy: null, nativeOrigin: null, child: null, proxySecret: randomBytes(32).toString('base64url') }; secrets.push(worker.proxySecret);
      worker.proxy = await createApplicationProxy({ root, ledger, nativeOrigin: () => worker.nativeOrigin, secret: worker.proxySecret }); worker.origin = worker.proxy.origin; workers.add(worker);
    }
    worker.nativeOrigin = 'http://127.0.0.1:' + nativePort;
    const env = { ...cleanEnvironment(), NODE_ENV: 'production', BAZAAR_NATIVE_NEXT_VALIDATION: '1', BAZAAR_NATIVE_PROXY_SECRET: worker.proxySecret, BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PREFIX: plan.prefix, BAZAAR_WORKSPACE_LOCAL_ORIGIN: worker.nativeOrigin, BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: relayOrigin, BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON: JSON.stringify(plan.identities), BAZAAR_WORKSPACE_REDIS_REST_URL: relayOrigin, BAZAAR_WORKSPACE_REDIS_REST_TOKEN: 'isolated-loopback-only', BAZAAR_ENABLE_SELF_LISTING_INTAKE: 'false', BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW: 'false', BAZAAR_ENABLE_PROVIDER_ACTIVATION: 'false', BAZAAR_ENABLE_REGISTRY_MUTATIONS: 'false', X402_PILOT_PAYMENTS_ENABLED: 'false', X402_LEGACY_PAYMENTS_ENABLED: 'false', X402_ENABLE_LOCAL_PAYER: 'false', NEXT_PUBLIC_X402_XLM_PILOT: 'false', NEXT_TELEMETRY_DISABLED: '1' };
    const command = ['--import', pathToFileURL(join(root, 'scripts/workspace-native-next-preload.mjs')).href, join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(nativePort)];
    const child = spawn(process.execPath, command, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); worker.child = child; children.add(child);
    let logs = ''; const capture = chunk => { logs = (logs + chunk.toString()).slice(-5000); }; child.stdout.on('data', capture); child.stderr.on('data', capture);
    await new Promise((done, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(Error('NATIVE_NEXT_START_TIMEOUT')); }, 10000);
      const ready = chunk => { if (/Ready in/i.test(chunk.toString())) { clearTimeout(timeout); child.stdout.off('data', ready); done(); } };
      child.stdout.on('data', ready); child.once('error', () => { clearTimeout(timeout); reject(Error('NATIVE_NEXT_START_FAILED')); });
      child.once('exit', code => { clearTimeout(timeout); reject(Error('NATIVE_NEXT_EXIT_' + code + '_' + logs.slice(-1500))); });
    });
    observedProcesses.push({ pid: child.pid, origin: worker.origin, nativeOrigin: worker.nativeOrigin, command: 'node --import scripts/workspace-native-next-preload.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port <isolated-loopback>', buildId: plan.nativeBuild.buildId });
    // Ready is followed immediately by a required API/browser operation. That
    // operation proves native route readiness without spending an extra GET.
    return worker;
  }
  async function stop(worker) {
    if (worker.child?.exitCode === null && !worker.child.killed) { const finished = new Promise(done => worker.child.once('exit', done)); worker.child.kill(); await finished; }
    children.delete(worker.child);
  }
  const appFetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.ok([...workers].some(worker => worker.origin === url.origin), 'Only counted loopback Next proxies allowed');
    return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) });
  };
  async function http(worker, path, token, body) { const response = await appFetch(worker.origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), origin: worker.origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, body: await response.json() }; }
  const ok = response => { assert.ok([200, 201].includes(response.status), 'HTTP_FAILED_' + response.status + '_' + (response.body.error?.code ?? 'UNKNOWN')); return response.body; };
  const denied = response => assert.ok([400, 401, 403, 404, 409].includes(response.status), 'DENIAL_FAILED_' + response.status);
  async function mcp(worker, token) { const client = new Client({ name: 'native-next-redis-acceptance', version: '1.0' }); clients.add(client); await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp', worker.origin), { requestInit: { headers: { authorization: 'Bearer ' + token, origin: worker.origin } }, fetch: appFetch, reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 0, maxReconnectionDelay: 0, reconnectionDelayGrowFactor: 1 } })); return client; }
  async function call(client, name, args = {}, expectError = false) { const response = await client.callTool({ name, arguments: args }); const result = response.structuredContent ?? JSON.parse(response.content.find(value => value.type === 'text').text); assert.equal(response.isError === true, expectError, 'MCP_FAILED_' + name + '_' + JSON.stringify(result)); return result; }
  try {
    for (const key of [plan.keys[2], plan.keys[3], plan.keys[4]]) { const response = JSON.parse(await guard.exchange(JSON.stringify(['EVAL', scripts.READ, 3, plan.keys[0], key, plan.keys[1]]))); assert.deepEqual(response.result, ['', '', ''], 'FRESH_NAMESPACE_REQUIRED'); }
    const first = await start(), second = await start(), a = fixture.identities[0], b = fixture.identities[1];
    const creation = identity => ({ creationId: identity.creationId, humanAccessHash: sha256(identity.tokens.human), agentAccessHash: sha256(identity.tokens.agent) });
    const created = await Promise.all([http(first, '/api/workspaces', a.tokens.bootstrap, creation(a)), http(second, '/api/workspaces', a.tokens.bootstrap, creation(a))]);
    assert.deepEqual(created.map(value => value.status).sort(), [200, 201]); const ref = ok(created[0]).record;
    assert.equal(ref.ownerId, plan.identities[0].ownerId); assert.equal(ok(created[1]).record.workspaceId, ref.workspaceId);
    const refB = ok(await http(second, '/api/workspaces', b.tokens.bootstrap, creation(b))).record; assert.equal(refB.ownerId, plan.identities[1].ownerId); assert.notEqual(ref.ownerId, refB.ownerId);
    const boot = await mcp(first, a.tokens.bootstrap); assert.equal((await boot.listTools()).tools.length, 17);
    const replay = await call(boot, 'create_bazaar_workspace', creation(a)); assert.equal(replay.created, false); assert.equal(replay.record.ownerId, ref.ownerId);
    denied(await http(first, '/api/workspaces', a.tokens.bootstrap, { ...creation(a), humanAccessHash: sha256(a.tokens.rotatedHuman) })); denied(await http(first, '/api/operations', a.tokens.bootstrap));
    const conversationPath = `/api/conversations/${fixture.conversationId}/messages`, humanMessage = fixture.payloads.humanMessage;
    ok(await http(first, '/api/conversations', a.tokens.human, fixture.payloads.conversation)); ok(await http(first, conversationPath, a.tokens.human, humanMessage));
    assert.equal(ok(await http(second, conversationPath, a.tokens.human, humanMessage)).created, false);
    denied(await http(first, conversationPath, a.tokens.human, { ...humanMessage, text: 'Conflicting reused message ID' }));
    const agent = await mcp(second, a.tokens.agent); assert.equal((await call(agent, 'list_bazaar_agent_tasks')).tasks.length, 1);
    await call(agent, 'claim_bazaar_agent_task', fixture.payloads.claim); assert.equal(ok(await http(first, '/api/agent-tasks', a.tokens.agent, fixture.payloads.claim)).created, false);
    const response = fixture.payloads.response, operation = fixture.payloads.operation;
    await call(agent, 'record_bazaar_operation', { operation }); assert.equal((await call(agent, 'record_bazaar_operation', { operation })).created, false);
    await call(agent, 'respond_bazaar_agent_task', response); assert.equal((await call(agent, 'respond_bazaar_agent_task', response)).created, false);
    await call(agent, 'record_bazaar_activity', { event: fixture.payloads.event }); assert.equal((await call(agent, 'record_bazaar_activity', { event: fixture.payloads.event })).created, false);
    const history = ok(await http(first, '/api/operations', a.tokens.human)).records, conversation = ok(await http(second, conversationPath, a.tokens.human)).conversation;
    const activityPath = `/api/activity?view=events&taskId=${fixture.taskId}`, activity = ok(await http(first, activityPath, a.tokens.human)).items;
    assert.equal(activity.length, 1); assert.equal(activity[0].eventId, fixture.eventId);
    assert.equal(history.length, 1); assert.deepEqual(history[0].delivery.result, operation.delivery.result); assert.equal(conversation.messages.length, 2); assert.equal(conversation.messages[0].text, humanMessage.text); assert.equal(conversation.messages[1].text, response.text); assert.equal(conversation.messages[1].operationId, fixture.operationId); assert.equal(conversation.tasks[0].operationId, fixture.operationId);
    assert.deepEqual(ok(await http(first, `/api/deliveries?operationId=${fixture.operationId}`, a.tokens.human)).versions, []);
    denied(await http(second, conversationPath, b.tokens.human)); assert.deepEqual(ok(await http(second, '/api/operations', b.tokens.human)).records, []); denied(await http(second, `/api/deliveries?operationId=${fixture.operationId}`, b.tokens.human));
    const human = await mcp(first, a.tokens.human); await call(human, 'record_bazaar_operation', { operation }, true);
    const provider = await mcp(first, fixture.providerScope); await call(provider, 'list_bazaar_agent_tasks', {}, true); await call(provider, 'get_operation_history', {}, true);
    denied(await http(first, '/api/agent-tasks', a.tokens.human)); await call(agent, 'record_bazaar_operation', { operation: { ...operation, delivery: { ...operation.delivery, result: { text: 'Changed frozen conditions' } } } }, true);
    if (browser) {
      const { runNativeBrowserAcceptance } = await import('./workspace-native-browser-acceptance.mjs');
      browserReport = await runNativeBrowserAcceptance({ origin: first.origin, fixture, plan, mode, signal: browserAbort.signal, evidenceDirectory, restartNext: async () => { await stop(first); await start(first); return { origin: first.origin, buildId: plan.nativeBuild.buildId }; } });
      assert.equal(browserReport.ok, true, 'Native browser acceptance failed');
      assert.deepEqual(ok(await http(first, '/api/operations', a.tokens.human)).records, history); assert.deepEqual(ok(await http(first, conversationPath, a.tokens.human)).conversation, conversation); assert.deepEqual(ok(await http(first, activityPath, a.tokens.human)).items, activity);
      findings.push('browser Magic Link on counted native Next proxy; exact records recovered after restart');
    }
    let generation = ref.generation;
    for (const [role, token] of [['agent', a.tokens.rotatedAgent], ['human', a.tokens.rotatedHuman]]) { const changed = ok(await http(first, `/api/workspaces/${ref.workspaceId}/access`, a.tokens.bootstrap, { action: 'rotate', role, accessHash: sha256(token), expectedGeneration: generation })); generation = changed.record.generation; }
    denied(await http(second, '/api/operations', a.tokens.agent)); denied(await http(second, '/api/operations', a.tokens.human)); ok(await http(second, '/api/operations', a.tokens.rotatedAgent)); ok(await http(second, '/api/operations', a.tokens.rotatedHuman));
    ok(await http(first, '/api/workspaces', a.tokens.bootstrap, creation(a))); denied(await http(first, '/api/operations', a.tokens.agent));
    for (const client of clients) await client.close(); clients.clear(); await stop(first); await stop(second);
    await start(first); const restarted = first;
    denied(await http(restarted, '/api/operations', a.tokens.human)); denied(await http(restarted, '/api/operations', a.tokens.agent));
    const restartedRef = ok(await http(restarted, '/api/workspaces', a.tokens.bootstrap, creation(a))).record;
    for (const name of ['workspaceId', 'ownerId', 'agentId', 'creationId', 'createdAt']) assert.equal(restartedRef[name], ref[name], 'Owner identity must remain unchanged after restart: ' + name);
    assert.deepEqual(ok(await http(restarted, '/api/operations', a.tokens.rotatedHuman)).records, history); assert.deepEqual(ok(await http(restarted, conversationPath, a.tokens.rotatedHuman)).conversation, conversation);
    const receipts = ok(await http(restarted, activityPath, a.tokens.rotatedHuman)).items; assert.deepEqual(receipts, activity); assert.equal(receipts.filter(value => value.eventId === fixture.eventId).length, 1);
    denied(await http(restarted, '/api/agent-tasks', a.tokens.rotatedAgent, { taskId: fixture.taskId, attemptId: fixture.payloads.conflictingAttemptId }));
    const revoke = { action: 'revoke', expectedGeneration: generation }; ok(await http(restarted, `/api/workspaces/${ref.workspaceId}/access`, a.tokens.bootstrap, revoke)); assert.equal(ok(await http(restarted, `/api/workspaces/${ref.workspaceId}/access`, a.tokens.bootstrap, revoke)).created, false);
    denied(await http(restarted, '/api/operations', a.tokens.rotatedHuman)); denied(await http(restarted, '/api/operations', a.tokens.rotatedAgent)); await stop(restarted);
    await start(first); denied(await http(first, '/api/operations', a.tokens.rotatedHuman)); denied(await http(first, '/api/operations', a.tokens.rotatedAgent));
    const revokedRef = ok(await http(first, '/api/workspaces', a.tokens.bootstrap, creation(a))).record; assert.equal(revokedRef.revoked, true);
    for (const name of ['workspaceId', 'ownerId', 'agentId', 'creationId', 'createdAt']) assert.equal(revokedRef[name], ref[name], 'Revocation must retain owner identity after restart: ' + name);
    ok(await http(first, '/api/operations', b.tokens.human)); const recoveredB = ok(await http(first, '/api/workspaces', b.tokens.bootstrap, creation(b))).record;
    assert.deepEqual(recoveredB, refB, 'Second owner receipt must remain exactly unchanged after all restarts'); await stop(first);
    assert.equal(guard.outstandingExchanges, 0); assert.equal(guard.reservedResponseBytes, 0); assert.equal(ledger.reservedResponseBytes, 0); assert.equal(guard.report().storedValues.currentStateConfirmed, true);
    if (mode === 'double') { assert.equal(data.size, 4); assert.deepEqual([...data.keys()].sort(), plan.keys.filter(value => !value.endsWith(':owner:none')).sort()); for (const raw of data.values()) for (const secret of secrets) assert.ok(!raw.includes(secret), 'No plaintext credentials in Redis'); }
    assert.ok(!stopped && !guard.stopped && !ledger.stopped); assert.equal(plan.sourceFingerprint, sourceFingerprint(), 'Source changed during execution'); assert.equal(canonical(plan.nativeBuild), canonical(verifyNativeBuild()), 'Native build changed during execution'); assert.ok(Date.now() - started < plan.budget.elapsedMs, 'EXECUTION_DEADLINE');
    findings.push('native Next production CLI and configuredWorkspaceStore only', 'five exact Redis keys and two server-owned identities', 'concurrent and idempotent creation; immutable IDs conflict', 'native MCP SDK 17 tools; response and inline operation recovered exactly', 'other owner and other scopes denied', 'rotation and revocation survive native Next restarts'); success = true;
  } catch (error) {
    failure = String(error.message); for (const secret of secrets) failure = failure.split(secret).join('[redacted]'); failure = failure.slice(0, 2000);
    if (browser && existsSync(join(evidenceDirectory, 'browser-report.json'))) browserReport = JSON.parse(readFileSync(join(evidenceDirectory, 'browser-report.json'), 'utf8'));
  }
  finally {
    clearTimeout(timer); send.cancelPending?.(); for (const client of clients) await client.close().catch(() => {});
    for (const worker of workers) await stop(worker).catch(() => {}); for (const worker of workers) await worker.proxy.close();
    relay.closeAllConnections(); await new Promise(done => relay.close(done));
  }
  if (browser && !browserReport) browserReport = { ok: false, status: 'failed before browser helper returned; native execution report identifies the failure', failure };
  const report = { ok: success, category: mode === 'real' ? 'native Next/configuredWorkspaceStore with isolated Redis real' : 'native Next/configuredWorkspaceStore with Redis REST double', candidateSha: plan.candidateSha, sourceFingerprint: plan.sourceFingerprint, planHash, nativeBuild: plan.nativeBuild, runtime: process.version, redisOrigin: realOrigin, prefix: plan.prefix, keys: plan.keys, observedProcesses, processesStarted: observedProcesses.length, configuration: { backend: 'redis', configuredWorkspaceStore: true, nativeNext: true, production: true, ownerFactory: 'server-only frozen isolated owners bound to creation and initial auth hashes', localOriginsOnly: true, cleanEnvironment: true, sdkRetry: { retries: 0 }, autoPipelining: false, mcpReconnectRetries: 0, selfListing: false, providerActivation: false, payments: false, envFilesLoaded: false }, effective: guard.report(), applicationTransport: ledger.report(), browser: browserReport ?? { ok: null, status: 'pending: not requested for this double' }, findings, failure, externalRequests: mode === 'real' ? guard.counts.requests : 0, paidProviderInvocations: 0, payments: 0, limitation: 'Double does not certify Redis real. Browser required for sprint acceptance. No backup/Redis-loss durability claim. Unknown effect stays stopped; keys are never deleted.' };
  report.ok = success && !report.effective.stopped && !report.applicationTransport.stopped && report.effective.uncertain === 0 && report.applicationTransport.uncertain === 0 && guard.outstandingExchanges === 0 && guard.reservedResponseBytes === 0 && ledger.reservedResponseBytes === 0 && report.effective.storedValues.currentStateConfirmed;
  report.nativeSprintAcceptance = report.ok && mode === 'real' && browserReport?.ok === true;
  const raw = JSON.stringify(report, null, 2); for (const secret of secrets) assert.ok(!raw.includes(secret), 'Report contains secret');
  writeFileSync(join(evidenceDirectory, `report.native.${mode}${browser ? '.browser' : ''}.json`), raw + '\n', { flag: 'wx', mode: 0o600 }); return report;
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [action, path, approvalPath, executionHash, browserFlag] = process.argv.slice(2);
  try {
    let result;
    if (action === 'build') result = await buildNative();
    else if (action === 'prepare') { const plan = prepareNative(path); result = { prepared: true, planHash: plan.planHash, prefix: plan.prefix, keys: plan.keys, budget: plan.budget, candidateSha: plan.candidateSha, sourceFingerprint: plan.sourceFingerprint, buildId: plan.nativeBuild.buildId, real: 'blocked pending specific authorization and current free margin' }; }
    else result = await executeNative(resolve(path), action, approvalPath === '-' ? undefined : approvalPath, executionHash === '-' ? undefined : executionHash, { browser: browserFlag === '--browser' || approvalPath === '--browser' });
    console.log(JSON.stringify(result)); if (result.ok === false) process.exitCode = 1;
  } catch { console.error('NATIVE_REDIS_EXECUTOR_REJECTED; no secret values logged'); process.exitCode = 1; }
}
