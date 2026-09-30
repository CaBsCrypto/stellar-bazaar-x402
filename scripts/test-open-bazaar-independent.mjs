import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Independent black-box acceptance. No dotenv, historical credentials, provider
// execution, external Redis, payments, push, or deployment. This file also loads
// as --import in the isolated Next processes to deny non-loopback fetch.
const script = fileURLToPath(import.meta.url), reviewRoot = resolve(dirname(script), '..');
const root = process.argv[2] === '--checkout' && process.argv[3] ? resolve(process.argv[3]) : reviewRoot;
const tokens = [], originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.protocol, 'http:', 'Only HTTP loopback allowed in independent acceptance');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'External fetch forbidden');
  return originalFetch(input, { ...init, redirect: 'error' });
};
const hash = value => createHash('sha256').update(value).digest('hex');
function access() { const token = randomBytes(32).toString('hex'); tokens.push(token); return token; }
function identity() {
  const bootstrap = access(), human = access(), agent = access();
  return { bootstrap, human, agent, creation: { creationId: randomUUID(), humanAccessHash: hash(human), agentAccessHash: hash(agent) } };
}
function noSecrets(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const token of tokens) assert.ok(!text.includes(token), 'Raw private access must never be returned or stored');
}
function denied(response, label) { assert.ok([400, 401, 403, 404, 409, 422].includes(response.status), `${label}: explicit denial required, got ${response.status}`); }
function success(response, label) {
  assert.ok([200, 201, 202].includes(response.status), `${label}: expected success, got ${response.status} (${response.body?.error?.code ?? 'no error code'})`);
  noSecrets(response.body); return response.body;
}
function reference(body) {
  const workspace = body.workspace ?? body.record ?? body;
  for (const name of ['workspaceId', 'ownerId', 'agentId']) assert.equal(typeof workspace[name], 'string', `Receipt lacks server ${name}`);
  assert.equal(typeof workspace.generation, 'number', 'Receipt lacks access generation');
  return workspace;
}
async function http(base, path, token, body, extraHeaders = {}) {
  const response = await fetch(new URL(path, base), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
  });
  let result; try { result = await response.json(); } catch { result = null; }
  noSecrets(result);
  if (!['/api/mcp', '/api/discovery/resources'].includes(path)) assert.equal(response.headers.get('cache-control'), 'private, no-store', `${path}: private no-store required`);
  return { status: response.status, body: result, headers: response.headers };
}
async function port() {
  const server = createServer();
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const number = server.address().port; await new Promise(ok => server.close(ok)); return number;
}
async function acceptance() {
  assert.ok(process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === '--checkout'), 'Only an optional local checkout path is accepted; no external base URL');
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) assert.equal(existsSync(join(root, name)), false, `Refuse environment-file loading: ${name}`);
  assert.ok(existsSync(join(root, '.next', 'BUILD_ID')), 'Build integrated candidate before independent acceptance');
  const evidenceDirectory = mkdtempSync(join(tmpdir(), 'bazaar-independent-open-'));
  const workspaceDir = join(evidenceDirectory, 'workspaces'), reviewDir = join(evidenceDirectory, 'reviews');
  mkdirSync(workspaceDir); mkdirSync(reviewDir);
  const children = new Set(), clients = new Set();
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PATHEXT|SYSTEMDRIVE)$/i.test(key)));
  const legacyRead = 'bz_read_' + randomBytes(24).toString('hex'), legacyWrite = 'bz_write_' + randomBytes(24).toString('hex');
  tokens.push(legacyRead, legacyWrite);
  const legacy = { ownerId: 'independent_legacy', readTokenHash: hash(legacyRead), writeTokenHash: hash(legacyWrite) }, legacyConfig = JSON.stringify([legacy]);
  async function start(overrides = {}) {
    const { __independentPort, ...environmentOverrides } = overrides;
    const base = `http://127.0.0.1:${__independentPort ?? await port()}`;
    const child = spawn(process.execPath, ['--import', pathToFileURL(script).href, 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '-p', new URL(base).port], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {
        ...clean, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_APP_URL: base, BAZAAR_INDEPENDENT_NETWORK_GUARD: '1',
        BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'file', BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:local-test', BAZAAR_WORKSPACE_FILE_DIRECTORY: workspaceDir, BAZAAR_WORKSPACE_LOCAL_ORIGIN: base,
        BAZAAR_HISTORY_ACCOUNTS_JSON: legacyConfig, BAZAAR_PROVIDER_REVIEW_BACKEND: 'file', BAZAAR_REVIEW_PREFIX: 'bazaar-review:local-test', BAZAAR_PROVIDER_REVIEW_DIR: reviewDir,
        BAZAAR_ENABLE_SELF_LISTING_INTAKE: 'true', BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW: 'false', BAZAAR_ENABLE_PROVIDER_ACTIVATION: 'false', BAZAAR_ENABLE_REGISTRY_MUTATIONS: 'false',
        X402_PILOT_PAYMENTS_ENABLED: 'false', X402_LEGACY_PAYMENTS_ENABLED: 'false', X402_ENABLE_LOCAL_PAYER: 'false', NEXT_PUBLIC_X402_XLM_PILOT: 'false', ...environmentOverrides,
      },
    });
    children.add(child); child.stdout.resume(); child.stderr.resume();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw Error(`Isolated Next startup failed: exit ${child.exitCode}`);
      try { if ((await fetch(base + '/api/mcp', { signal: AbortSignal.timeout(750) })).ok) return { base, child }; } catch {}
      await new Promise(ok => setTimeout(ok, 75));
    }
    throw Error('Isolated Next did not become ready');
  }
  async function stop(server) {
    if (server.child.exitCode === null) { const ended = new Promise(ok => server.child.once('exit', ok)); server.child.kill(); await ended; }
    children.delete(server.child);
  }
  async function mcp(base, token, extraHeaders = {}) {
    const client = new Client({ name: 'bazaar-independent-review', version: '1.0' }); clients.add(client);
    await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp', base), { requestInit: { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders } }, fetch: globalThis.fetch }));
    return client;
  }
  async function helper(file, mode, args) {
    const child = spawn(process.execPath, ['--import', pathToFileURL(script).href, file, mode, ...args], { cwd: root, env: { ...clean, BAZAAR_INDEPENDENT_NETWORK_GUARD: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.resume();
    const timeout = setTimeout(() => child.kill(), 20000);
    const code = await new Promise((ok, fail) => { child.once('exit', ok); child.once('error', fail); }); clearTimeout(timeout);
    noSecrets(output); return { code, output };
  }
  const providerHelper = (mode, args) => helper('examples/agent-provider-mcp.mjs', mode, args);
  const workspaceHelper = (mode, args) => helper('examples/agent-workspace-mcp.mjs', mode, args);
  async function call(client, name, args = {}) {
    const response = await client.callTool({ name, arguments: args });
    const data = response.structuredContent ?? JSON.parse(response.content.find(block => block.type === 'text').text);
    noSecrets(data); return { error: response.isError === true, data };
  }
  const operation = taskId => ({
    clientOperationId: randomUUID(), taskId, mode: 'mock',
    service: { id: 'independent-unpaid-fixture', title: 'Independent synthetic output', provider: 'Independent review', url: 'http://127.0.0.1' },
    payment: { status: 'not-requested', network: 'stellar:testnet', asset: 'USDC', amountAtomic: '0', recipient: 'G' + 'A'.repeat(55) },
    delivery: { status: 'reported-delivered', result: { text: 'Owner A synthetic output. No payment or provider execution.' } },
  });
  async function task(base, owner, text) {
    const conversationId = randomUUID(), taskId = randomUUID(), messageId = randomUUID();
    success(await http(base, '/api/conversations', owner.human, { conversationId, title: 'Independent acceptance' }), 'Human conversation');
    success(await http(base, `/api/conversations/${conversationId}/messages`, owner.human, { messageId, taskId, text }), 'Human message');
    return { conversationId, taskId, messageId };
  }
  try {
    const first = await start(), second = await start();
    const a = identity(), b = identity(), c = identity(), publicClient = await mcp(first.base);
    const tools = (await publicClient.listTools()).tools;
    assert.equal(tools.length, 17, 'Integrated suite must advertise the seventeen canonical tools');
    const health = (await http(first.base, '/api/mcp')).body;
    assert.deepEqual(health.tools, tools.map(tool => tool.name), 'HTTP health and actual SDK discovery must agree');
    assert.equal(health.writes.length, 6, 'Six authorized write tools are declared');
    const capabilities = await call(publicClient, 'get_bazaar_capabilities'); assert.equal(capabilities.error, false);
    assert.deepEqual(capabilities.data.writes, health.writes, 'Capabilities and health declare identical effects');
    for (const name of ['create_bazaar_workspace', 'list_bazaar_agent_tasks', 'claim_bazaar_agent_task', 'respond_bazaar_agent_task', 'record_bazaar_activity', 'record_bazaar_operation']) assert.ok(tools.some(tool => tool.name === name), `Missing integrated tool: ${name}`);
    assert.equal((await call(publicClient, 'get_bazaar_skills')).error, false); assert.equal((await call(publicClient, 'list_services')).error, false);
    assert.equal((await call(publicClient, 'list_bazaar_agent_tasks')).error, true, 'Public cannot list private tasks');
    denied(await http(first.base, '/api/workspaces', undefined, a.creation), 'Missing bootstrap');
    denied(await http(first.base, '/api/workspaces', a.bootstrap, { ...a.creation, ownerId: 'client_owner' }), 'Client owner assignment');
    const parallel = await Promise.all(Array.from({ length: 6 }, (_, index) => http(index % 2 ? first.base : second.base, '/api/workspaces', a.bootstrap, a.creation)));
    const accepted = parallel.filter(result => [200, 201, 202].includes(result.status));
    const parallelDiagnostic = JSON.stringify(parallel.map(result => ({ status: result.status, code: result.body?.error?.code })));
    assert.ok(accepted.length, `At least one concurrent creation must succeed: ${parallelDiagnostic}`);
    for (const result of parallel) if (![200, 201, 202].includes(result.status)) assert.equal(result.status, 409, `Concurrent creation may conflict but must not return a generic outage: ${parallelDiagnostic}`);
    const refA = reference(success(accepted[0], 'Concurrent creation'));
    for (const result of accepted) assert.equal(reference(result.body).ownerId, refA.ownerId, 'One intent must not allocate two owners');
    const bootstrapClient = await mcp(second.base, a.bootstrap);
    const mcpCreationReplay = await call(bootstrapClient, 'create_bazaar_workspace', a.creation);
    assert.equal(mcpCreationReplay.error, false); assert.equal(reference(mcpCreationReplay.data).ownerId, refA.ownerId, 'MCP reuses native creation identity');
    assert.equal((await call(bootstrapClient, 'get_operation_history')).error, true, 'Bootstrap MCP cannot read human history');
    const refB = reference(success(await http(first.base, '/api/workspaces', b.bootstrap, b.creation), 'Owner B creation'));
    for (const field of ['ownerId', 'workspaceId', 'agentId']) assert.notEqual(refA[field], refB[field]);
    denied(await http(first.base, '/api/workspaces', access(), a.creation), 'Unauthenticated creation replay');
    denied(await http(first.base, '/api/workspaces', a.bootstrap, { ...a.creation, humanAccessHash: hash(access()) }), 'Changed creation hashes');
    denied(await http(first.base, '/api/workspaces', c.bootstrap, { ...c.creation, humanAccessHash: a.creation.humanAccessHash }), 'Workspace hash collision');
    denied(await http(first.base, '/api/workspaces', c.bootstrap, { ...c.creation, humanAccessHash: legacy.readTokenHash }), 'Legacy hash collision');
    denied(await http(first.base, '/api/workspaces', c.bootstrap, c.creation, { Origin: 'https://foreign.invalid' }), 'Foreign origin');
    assert.deepEqual(success(await http(first.base, '/api/operations', a.human), 'Human empty history').records, []);
    denied(await http(first.base, '/api/operations', a.bootstrap), 'Bootstrap history read'); denied(await http(first.base, '/api/operations', access()), 'Unknown history read');
    const taskA = await task(first.base, a, 'Owner A private unpaid synthetic request.'), taskB = await task(first.base, b, 'Owner B private request.');
    const ownTasks = success(await http(second.base, '/api/agent-tasks', a.agent), 'Cross-process task recovery').tasks;
    assert.ok(ownTasks.some(value => value.taskId === taskA.taskId)); assert.ok(!JSON.stringify(ownTasks).includes(taskB.taskId));
    denied(await http(first.base, `/api/conversations/${taskA.conversationId}/messages`, b.human), 'Other-owner conversation');
    denied(await http(first.base, '/api/conversations', a.agent, { conversationId: randomUUID(), title: 'Impersonation probe' }), 'Agent human authority');
    denied(await http(first.base, `/api/conversations/${taskA.conversationId}/messages`, a.human, { messageId: randomUUID(), taskId: randomUUID(), text: 'Forged actor', actor: 'agent' }), 'Client actor authority');
    const attemptId = randomUUID();
    for (const credential of [a.human, a.bootstrap, b.agent]) denied(await http(first.base, '/api/agent-tasks', credential, { taskId: taskA.taskId, attemptId }), 'Unauthorized task claim');
    success(await http(first.base, '/api/agent-tasks', a.agent, { taskId: taskA.taskId, attemptId }), 'Own task claim');
    success(await http(second.base, '/api/agent-tasks', a.agent, { taskId: taskA.taskId, attemptId }), 'Claim replay');
    denied(await http(second.base, '/api/agent-tasks', a.agent, { taskId: taskA.taskId, attemptId: randomUUID() }), 'Changed claim attempt');
    const op = operation(taskA.taskId);
    for (const credential of [a.human, a.bootstrap]) denied(await http(first.base, '/api/operations', credential, op), 'Non-agent operation write');
    denied(await http(first.base, '/api/operations', a.agent, { ...op, ownerId: refB.ownerId }), 'Client owner record routing');
    denied(await http(first.base, '/api/operations', a.agent, { ...op, payment: { ...op.payment, status: 'reported-unverified', amountAtomic: '1', transactionHash: 'a'.repeat(64) } }), 'Anonymous paid report');
    denied(await http(first.base, '/api/operations', a.agent, { ...op, delivery: { ...op.delivery, artifact: { kind: 'external', url: 'https://example.invalid/result', label: 'External reference' } } }), 'Anonymous external upload');
    const agentClient = await mcp(first.base, a.agent), humanClient = await mcp(second.base, a.human), otherClient = await mcp(second.base, b.agent);
    function writeArgs(name, value) { const props = tools.find(tool => tool.name === name).inputSchema.properties; return props.operation ? { operation: value } : props.event ? { event: value } : value; }
    assert.equal((await call(agentClient, 'record_bazaar_operation', writeArgs('record_bazaar_operation', op))).error, false, 'Agent native-schema MCP write');
    const ownHistory = success(await http(second.base, '/api/operations', a.human), 'Human sees MCP operation'); assert.equal(ownHistory.records.length, 1);
    const original = ownHistory.records[0]; assert.equal(original.clientOperationId, op.clientOperationId); assert.equal(original.taskId, taskA.taskId); assert.equal(original.agentId, refA.agentId); assert.deepEqual(original.delivery.result, op.delivery.result);
    const foreignHistoryClient = await mcp(first.base, a.human, { Origin: 'https://foreign.invalid' });
    const foreignHistory = await call(foreignHistoryClient, 'get_operation_history');
    assert.equal(foreignHistory.error, true, 'MCP history must preserve and reject foreign Origin');
    const foreignHistoryBody = JSON.stringify(foreignHistory.data);
    for (const privateValue of [refA.ownerId, taskA.taskId, op.clientOperationId, op.delivery.result.text]) assert.ok(!foreignHistoryBody.includes(privateValue), 'Denied foreign-Origin MCP response must not disclose private history');
    assert.equal((await call(humanClient, 'record_bazaar_operation', writeArgs('record_bazaar_operation', op))).error, true);
    assert.equal((await call(agentClient, 'record_bazaar_operation', writeArgs('record_bazaar_operation', op))).error, false);
    assert.deepEqual(success(await http(second.base, '/api/operations', a.human), 'History replay').records, ownHistory.records);
    assert.equal((await call(agentClient, 'record_bazaar_operation', writeArgs('record_bazaar_operation', { ...op, delivery: { ...op.delivery, result: { text: 'Changed result' } } }))).error, true);
    assert.deepEqual(success(await http(second.base, '/api/operations', b.human), 'Owner B isolation').records, []);
    const event = { eventId: randomUUID(), taskId: taskA.taskId, operationId: op.clientOperationId, mode: 'mock', kind: 'delivery-reported', title: 'Independent unpaid delivery' };
    assert.equal((await call(agentClient, 'record_bazaar_activity', writeArgs('record_bazaar_activity', event))).error, false);
    assert.equal((await call(humanClient, 'record_bazaar_activity', writeArgs('record_bazaar_activity', event))).error, true);
    assert.ok(success(await http(second.base, `/api/activity?view=events&taskId=${taskA.taskId}`, a.human), 'MCP activity').items.some(value => value.eventId === event.eventId && value.agentId === refA.agentId));
    const reply = { attemptId, messageId: randomUUID(), text: 'Synthetic result preserved for owner A; no purchase.', operationId: op.clientOperationId };
    success(await http(second.base, `/api/agent-tasks/${taskA.taskId}/response`, a.agent, reply), 'Own linked operation response');
    success(await http(first.base, `/api/agent-tasks/${taskA.taskId}/response`, a.agent, reply), 'Response replay');
    denied(await http(first.base, `/api/agent-tasks/${taskA.taskId}/response`, a.agent, { ...reply, text: 'Changed response' }), 'Changed response');
    const conversation = success(await http(first.base, `/api/conversations/${taskA.conversationId}/messages`, a.human), 'Conversation recovery').conversation;
    assert.equal(conversation.messages.filter(value => value.messageId === reply.messageId).length, 1);
    assert.ok(conversation.messages.some(value => value.messageId === reply.messageId && value.operationId === op.clientOperationId));
    const attemptB = randomUUID(); success(await http(first.base, '/api/agent-tasks', b.agent, { taskId: taskB.taskId, attemptId: attemptB }), 'Owner B claim');
    denied(await http(first.base, `/api/agent-tasks/${taskB.taskId}/response`, b.agent, { ...reply, attemptId: attemptB, messageId: randomUUID() }), 'Cross-owner operation link');
    assert.equal((await call(otherClient, 'respond_bazaar_agent_task', { taskId: taskA.taskId, ...reply })).error, true);
    const providerClient = await mcp(first.base, access());
    assert.equal((await call(providerClient, 'get_operation_history')).error, true); assert.equal((await call(providerClient, 'list_bazaar_agent_tasks')).error, true);
    assert.equal((await call(agentClient, 'get_provider_request_status', { submissionId: randomUUID() })).error, true);
    for (const client of clients) await client.close().catch(() => {}); clients.clear(); await stop(first); await stop(second);
    const reboot = await start();
    assert.deepEqual(success(await http(reboot.base, '/api/operations', a.human), 'History after restart').records, ownHistory.records);
    assert.deepEqual(success(await http(reboot.base, `/api/conversations/${taskA.conversationId}/messages`, a.human), 'Chat after restart').conversation, conversation);
    denied(await http(reboot.base, '/api/agent-tasks', a.agent, { taskId: taskA.taskId, attemptId: randomUUID() }), 'Restart cannot reexecute responded task');
    const newAgent = access();
    const rotated = success(await http(reboot.base, `/api/workspaces/${refA.workspaceId}/access`, a.bootstrap, { action: 'rotate', role: 'agent', accessHash: hash(newAgent), expectedGeneration: refA.generation }), 'Agent rotation');
    denied(await http(reboot.base, '/api/operations', a.agent), 'Old agent access'); success(await http(reboot.base, '/api/operations', newAgent), 'New agent access');
    success(await http(reboot.base, '/api/workspaces', a.bootstrap, a.creation), 'Creation replay after rotation'); denied(await http(reboot.base, '/api/operations', a.agent), 'Replay cannot restore rotated access'); success(await http(reboot.base, '/api/operations', a.human), 'Human survives agent rotation');
    const generation = reference(rotated).generation; assert.equal(generation, refA.generation + 1);
    denied(await http(reboot.base, `/api/workspaces/${refA.workspaceId}/access`, a.human, { action: 'revoke', expectedGeneration: generation }), 'Human admin authority');
    denied(await http(reboot.base, `/api/workspaces/${refA.workspaceId}/access`, a.bootstrap, { action: 'rotate', role: 'agent', accessHash: hash(access()), expectedGeneration: refA.generation }), 'Stale generation');
    success(await http(reboot.base, `/api/workspaces/${refA.workspaceId}/access`, a.bootstrap, { action: 'revoke', expectedGeneration: generation }), 'Workspace revoke');
    const revokeReplay = success(await http(reboot.base, `/api/workspaces/${refA.workspaceId}/access`, a.bootstrap, { action: 'revoke', expectedGeneration: generation }), 'Revoke acknowledgement recovery');
    assert.equal(revokeReplay.created, false, 'Revocation replay must not create another administration action');
    denied(await http(reboot.base, '/api/operations', a.human), 'Revoked human'); denied(await http(reboot.base, '/api/operations', newAgent), 'Revoked agent');
    assert.ok([200, 409, 403].includes((await http(reboot.base, '/api/workspaces', a.bootstrap, a.creation)).status), 'Revoked creation must retain explicit tombstone');
    denied(await http(reboot.base, '/api/operations', a.human), 'Creation replay cannot revive revoked workspace'); success(await http(reboot.base, '/api/operations', b.human), 'Other owner preserved'); await stop(reboot);
    const casServer = await start(), casOther = await start();
    const humanCandidates = [access(), access()];
    const cas = await Promise.all(humanCandidates.map((token, index) => http(index ? casOther.base : casServer.base, `/api/workspaces/${refB.workspaceId}/access`, b.bootstrap, { action: 'rotate', role: 'human', accessHash: hash(token), expectedGeneration: refB.generation })));
    assert.equal(cas.filter(result => result.status === 200).length, 1, 'Simultaneous generation CAS must have exactly one winner');
    assert.equal(cas.filter(result => result.status === 409).length, 1, 'Simultaneous generation CAS loser must conflict');
    const winnerIndex = cas.findIndex(result => result.status === 200), winningHuman = humanCandidates[winnerIndex];
    success(await http(casServer.base, '/api/operations', winningHuman), 'Winning human rotation');
    denied(await http(casServer.base, '/api/operations', humanCandidates[1 - winnerIndex]), 'Losing human access not installed');
    denied(await http(casServer.base, '/api/operations', b.human), 'Original human retired by CAS');
    await stop(casServer); await stop(casOther);
    const stateDirectory = join(workspaceDir, 'local-test');
    const files = readdirSync(stateDirectory).filter(name => name.endsWith('.json')); assert.ok(files.length);
    for (const name of files) noSecrets(readFileSync(join(stateDirectory, name), 'utf8'));
    const unavailable = await start({ BAZAAR_WORKSPACE_BACKEND: 'redis' });
    assert.equal((await http(unavailable.base, '/api/operations', winningHuman)).status, 503, 'Missing explicit Redis must not fall back to files'); await stop(unavailable);
    const registryPath = join(stateDirectory, 'registry.json'), ownerPath = join(stateDirectory, `owner-${refB.ownerId}.json`), pendingPath = join(stateDirectory, 'pending.json');
    assert.ok(existsSync(registryPath) && existsSync(ownerPath));
    const originalRegistry = readFileSync(registryPath, 'utf8'), originalOwner = readFileSync(ownerPath, 'utf8');
    for (const [path, invalid, original] of [[registryPath, '{malformed', originalRegistry], [ownerPath, '{"version":1}', originalOwner]]) {
      writeFileSync(path, invalid);
      const damaged = await start();
      assert.equal((await http(damaged.base, '/api/operations', winningHuman)).status, 503, 'Corrupt/incomplete state must fail closed');
      assert.equal((await http(damaged.base, '/api/workspaces', b.bootstrap, b.creation)).status, 503, 'Creation replay cannot overwrite corrupt state');
      assert.equal(readFileSync(path, 'utf8'), invalid, 'Rejected request must preserve corrupt evidence');
      await stop(damaged); writeFileSync(path, original);
    }
    writeFileSync(pendingPath, JSON.stringify({ transaction: randomUUID() }));
    const incomplete = await start();
    assert.equal((await http(incomplete.base, '/api/operations', winningHuman)).status, 503, 'Incomplete transaction marker must fail closed');
    assert.ok(existsSync(pendingPath), 'Incomplete transaction must not be silently cleared or retried');
    await stop(incomplete); unlinkSync(pendingPath);
    const restored = await start(); success(await http(restored.base, '/api/operations', winningHuman), 'Original owner data survives corruption tests'); await stop(restored);
    // Follow the published workspace guide with the real helper and SDK. The
    // delegated agent directory contains only its permitted agent packet.
    const guideServer = await start(), guideOwnerDir = join(evidenceDirectory, 'private-workspace-owner'), guideAgentDir = join(evidenceDirectory, 'private-workspace-agent');
    assert.equal((await workspaceHelper('prepare', [guideOwnerDir, guideServer.base])).code, 0, 'Workspace guide offline prepare');
    const rootPacketPath = join(guideOwnerDir, 'workspace-root.json');
    let guidePacket = JSON.parse(readFileSync(rootPacketPath, 'utf8'));
    tokens.push(guidePacket.bootstrapAccess, guidePacket.humanAccess, guidePacket.agentAccess);
    assert.equal((await workspaceHelper('create', [guideOwnerDir])).code, 0, 'Workspace guide create');
    guidePacket = JSON.parse(readFileSync(rootPacketPath, 'utf8'));
    const creationReceiptPath = join(guideOwnerDir, 'creation-receipt.json'), guideReceipt = readFileSync(creationReceiptPath, 'utf8');
    assert.equal((await workspaceHelper('create', [guideOwnerDir])).code, 0, 'Workspace helper same creation recovery');
    assert.equal(readFileSync(creationReceiptPath, 'utf8'), guideReceipt, 'Workspace creation receipt is immutable');
    const { preparePrivateDirectory, verifyPrivateDirectory } = await import(pathToFileURL(join(root, 'scripts', 'history-private-files.mjs')).href);
    preparePrivateDirectory(guideAgentDir); verifyPrivateDirectory(guideAgentDir);
    writeFileSync(join(guideAgentDir, 'agent.json'), readFileSync(join(guideOwnerDir, 'agent.json')), { mode: 0o600, flag: 'wx' });
    assert.deepEqual(readdirSync(guideAgentDir), ['agent.json']);
    const guideTask = await task(guideServer.base, { human: guidePacket.humanAccess }, 'Task from the published workspace guide acceptance.');
    assert.equal((await workspaceHelper('tasks', [guideAgentDir])).code, 0, 'Delegated agent lists tasks without root packet');
    assert.equal((await workspaceHelper('claim', [guideAgentDir, guideTask.taskId])).code, 0, 'Delegated agent claims fixed task');
    const guideAttemptPath = join(guideAgentDir, 'attempts', `${guideTask.taskId}.json`), claimAttempt = readFileSync(guideAttemptPath, 'utf8');
    assert.equal((await workspaceHelper('claim', [guideAgentDir, guideTask.taskId])).code, 0, 'Delegated agent recovers same claim');
    assert.equal(readFileSync(guideAttemptPath, 'utf8'), claimAttempt);
    const guideOp = operation(guideTask.taskId), guideOpPath = join(evidenceDirectory, 'guide-operation.json'); writeFileSync(guideOpPath, JSON.stringify(guideOp));
    assert.equal((await workspaceHelper('record', [guideAgentDir, guideOpPath])).code, 0, 'Guide native operation schema');
    const guideEvent = { eventId: randomUUID(), taskId: guideTask.taskId, operationId: guideOp.clientOperationId, mode: 'mock', kind: 'delivery-reported', title: 'Guide synthetic delivery' }, guideEventPath = join(evidenceDirectory, 'guide-activity.json'); writeFileSync(guideEventPath, JSON.stringify(guideEvent));
    assert.equal((await workspaceHelper('activity', [guideAgentDir, guideEventPath])).code, 0, 'Guide native activity schema');
    const guideResponsePath = join(evidenceDirectory, 'guide-response.json'); writeFileSync(guideResponsePath, JSON.stringify({ text: 'Guide synthetic response', operationId: guideOp.clientOperationId }));
    assert.equal((await workspaceHelper('respond', [guideAgentDir, guideTask.taskId, guideResponsePath])).code, 0, 'Guide response links same-owner operation');
    const frozenResponseAttempt = readFileSync(guideAttemptPath, 'utf8');
    assert.equal((await workspaceHelper('respond', [guideAgentDir, guideTask.taskId, guideResponsePath])).code, 0, 'Guide fixed response recovery');
    assert.equal(readFileSync(guideAttemptPath, 'utf8'), frozenResponseAttempt, 'Helper preserves frozen response identity');
    writeFileSync(guideResponsePath, JSON.stringify({ text: 'Changed guide response', operationId: guideOp.clientOperationId }));
    assert.notEqual((await workspaceHelper('respond', [guideAgentDir, guideTask.taskId, guideResponsePath])).code, 0, 'Guide helper rejects changed frozen response');
    assert.equal(readFileSync(guideAttemptPath, 'utf8'), frozenResponseAttempt);
    assert.equal((await workspaceHelper('recover', [guideAgentDir])).code, 0, 'Guide delegated agent history recovery');
    const guideHistory = success(await http(guideServer.base, '/api/operations', guidePacket.humanAccess), 'Guide human history');
    assert.equal(guideHistory.records.length, 1); assert.equal(guideHistory.records[0].clientOperationId, guideOp.clientOperationId); assert.equal(guideHistory.records[0].agentId, guidePacket.workspace.agentId);
    const oldGuideAgent = guidePacket.agentAccess, oldGuideHuman = guidePacket.humanAccess;
    assert.equal((await workspaceHelper('rotate', [guideOwnerDir, 'agent'])).code, 0, 'Guide owner rotates delegated access');
    guidePacket = JSON.parse(readFileSync(rootPacketPath, 'utf8')); tokens.push(guidePacket.agentAccess);
    denied(await http(guideServer.base, '/api/operations', oldGuideAgent), 'Guide old agent retired');
    assert.notEqual((await workspaceHelper('recover', [guideAgentDir])).code, 0, 'Old delegated packet is rejected after rotation');
    assert.equal((await workspaceHelper('recover', [guideOwnerDir])).code, 0, 'Owner helper updated agent packet remains usable');
    assert.equal((await workspaceHelper('rotate', [guideOwnerDir, 'human'])).code, 0, 'Guide owner rotates human access');
    guidePacket = JSON.parse(readFileSync(rootPacketPath, 'utf8')); tokens.push(guidePacket.humanAccess);
    denied(await http(guideServer.base, '/api/operations', oldGuideHuman), 'Guide old human retired');
    const humanLinks = readFileSync(join(guideOwnerDir, 'human-links.txt'), 'utf8'); assert.ok(humanLinks.includes(guidePacket.humanAccess)); assert.ok(!humanLinks.includes(oldGuideHuman));
    assert.deepEqual(success(await http(guideServer.base, '/api/operations', guidePacket.humanAccess), 'Guide rotated human history').records, guideHistory.records);
    assert.equal((await workspaceHelper('revoke', [guideOwnerDir])).code, 0, 'Guide owner revokes workspace');
    denied(await http(guideServer.base, '/api/operations', guidePacket.humanAccess), 'Guide revoked human'); denied(await http(guideServer.base, '/api/operations', guidePacket.agentAccess), 'Guide revoked agent');
    const guideRevokedReplay = await workspaceHelper('create', [guideOwnerDir]); assert.notEqual(guideRevokedReplay.code, 0); assert.ok(guideRevokedReplay.output.includes('WORKSPACE_REVOKED'));
    assert.equal(readFileSync(creationReceiptPath, 'utf8'), guideReceipt, 'Rotations, revoke, and creation replay preserve the original receipt');
    assert.equal(existsSync(join(guideOwnerDir, 'pending-access-change.json')), false); assert.equal(readdirSync(guideOwnerDir).filter(name => name.startsWith('accepted-access-change-')).length, 3);
    await stop(guideServer);
    const providerDirectory = join(evidenceDirectory, 'private-provider'), cardPath = join(evidenceDirectory, 'synthetic-card.json');
    const providerCard = { version: 'bazaar.service-card/v0', id: 'independent-provider-request', name: 'Independent synthetic provider', description: 'Synthetic request only; no deployed provider or payments', kind: 'http', url: 'https://api.example.com', routeTemplate: '/v1/report', input: [{ name: 'topic', type: 'string', required: true }], network: 'stellar:testnet', payment: { scheme: 'exact', asset: 'USDC', amount: '0.001', destination: 'GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ' }, provider: { name: 'Independent synthetic review' }, tags: ['synthetic'] };
    writeFileSync(cardPath, JSON.stringify(providerCard));
    const closedProvider = await start({ BAZAAR_ENABLE_SELF_LISTING_INTAKE: 'false' });
    assert.equal((await providerHelper('prepare', [providerDirectory, closedProvider.base, cardPath, 'dns-txt', 'api.example.com'])).code, 0, 'Offline provider prepare');
    const providerPacket = JSON.parse(readFileSync(join(providerDirectory, 'request.json'), 'utf8')); tokens.push(providerPacket.submissionToken);
    const rejectedSubmit = await providerHelper('submit', [providerDirectory]); assert.notEqual(rejectedSubmit.code, 0);
    assert.ok(rejectedSubmit.output.includes('INTAKE_DISABLED'), 'Confirmed-not-accepted request must report its gate');
    const acceptedPath = join(providerDirectory, 'accepted-receipt.json'); assert.equal(existsSync(acceptedPath), false, 'Denied submission must not create an accepted receipt');
    await stop(closedProvider);
    // Restart on the same port to preserve the frozen environment and intent.
    const providerPort = new URL(providerPacket.origin).port;
    const liveProvider = await start({ BAZAAR_ENABLE_SELF_LISTING_INTAKE: 'true', __independentPort: providerPort });
    assert.equal((await providerHelper('retry', [providerDirectory])).code, 0, 'Explicit same-intent retry after opening reception');
    const acceptedReceipt = readFileSync(acceptedPath, 'utf8'); noSecrets(acceptedReceipt);
    assert.equal(JSON.parse(readFileSync(join(providerDirectory, 'request.json'), 'utf8')).submissionId, providerPacket.submissionId);
    const authenticatedProvider = await mcp(liveProvider.base, providerPacket.submissionToken), workspaceAgent = await mcp(liveProvider.base, b.agent);
    assert.equal((await call(authenticatedProvider, 'get_provider_request_status', { submissionId: providerPacket.submissionId })).error, false);
    assert.equal((await call(authenticatedProvider, 'get_operation_history')).error, true, 'Authenticated submission access cannot read workspace history');
    assert.equal((await call(workspaceAgent, 'get_provider_request_status', { submissionId: providerPacket.submissionId })).error, true, 'Workspace agent cannot read an existing private provider request');
    assert.equal((await providerHelper('status', [providerDirectory])).code, 0);
    assert.equal(readFileSync(acceptedPath, 'utf8'), acceptedReceipt, 'Successful status must preserve accepted receipt byte-for-byte');
    await authenticatedProvider.close(); clients.delete(authenticatedProvider); await workspaceAgent.close(); clients.delete(workspaceAgent); await stop(liveProvider);
    const failedStatusProvider = await start({ BAZAAR_PROVIDER_REVIEW_BACKEND: 'redis', __independentPort: providerPort });
    assert.notEqual((await providerHelper('status', [providerDirectory])).code, 0, 'Unavailable provider storage must produce an explicit recovery failure');
    assert.equal(readFileSync(acceptedPath, 'utf8'), acceptedReceipt, 'Failed status must preserve accepted receipt byte-for-byte');
    assert.ok(readdirSync(join(providerDirectory, 'responses')).length >= 4, 'Each response/failed status must keep its own snapshot'); await stop(failedStatusProvider);
    const { authenticateHistory } = await import(pathToFileURL(join(root, 'lib', 'operation-history-auth.ts')).href);
    assert.deepEqual(authenticateHistory(`Bearer ${legacyRead}`, false, legacyConfig), { ownerId: legacy.ownerId, permission: 'read' });
    assert.deepEqual(authenticateHistory(`Bearer ${legacyWrite}`, true, legacyConfig), { ownerId: legacy.ownerId, permission: 'write' });
    assert.throws(() => authenticateHistory(`Bearer ${legacyRead}`, true, legacyConfig), { code: 'FORBIDDEN' });
    // Reproduce the separately authored SDK/REST protocol double under the same
    // network and environment guards; keep this supporting evidence distinct.
    const supporting = spawn(process.execPath, ['--import', pathToFileURL(script).href, 'scripts/test-open-workspace-core.mjs'], { cwd: root, env: { ...clean, BAZAAR_INDEPENDENT_NETWORK_GUARD: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    supporting.stdout.resume(); supporting.stderr.resume();
    const supportingTimeout = setTimeout(() => supporting.kill(), 45000);
    const supportingExit = await new Promise((ok, fail) => { supporting.once('exit', ok); supporting.once('error', fail); }); clearTimeout(supportingTimeout);
    assert.equal(supportingExit, 0, 'Supporting core protocol-double acceptance failed; no author output or credentials emitted');
    console.log(JSON.stringify({ ok: true, reviewer: 'independent-of-feature-authors', transport: 'built Next HTTP + real MCP SDK', storage: 'isolated files, two server processes and restart', publicDiscovery: true, roleIsolation: true, serverOwners: true, concurrentCreation: true, crossOwnerIsolation: true, foreignOriginHistoryDenied: true, chatTaskOperationHistory: true, recovery: true, rotation: true, concurrentGenerationCas: true, revokeTombstone: true, corruptStateFailsClosed: true, incompleteTransactionFailsClosed: true, workspaceGuideHelper: true, authenticatedProviderSeparation: true, providerSameIntentRetry: true, immutableProviderReceipt: true, legacyPreserved: true, redisFailsClosed: true, supportingCoreProtocolDouble: true, externalRequests: 0, realPayments: 0, productionWrites: 0, evidenceDirectory }));
  } finally {
    for (const client of clients) await client.close().catch(() => {});
    for (const child of children) if (child.exitCode === null) { const ended = new Promise(ok => child.once('exit', ok)); child.kill(); await ended; }
  }
}
if (process.env.BAZAAR_INDEPENDENT_NETWORK_GUARD !== '1') {
  await acceptance().catch(error => {
    let message = String(error?.stack ?? error);
    for (const token of tokens) message = message.split(token).join('[synthetic access redacted]');
    console.error(message); process.exitCode = 1;
  });
}
