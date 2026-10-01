import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const origin = 'http://127.0.0.1:3347';
const privateA = 'C:/Users/MGC/AppData/Local/Temp/bazaar-sprint-review-a-20261001';
const privateB = 'C:/Users/MGC/AppData/Local/Temp/bazaar-sprint-review-b-20261001';
const helper = 'examples/agent-workspace-mcp.mjs';
const run = promisify(execFile);
const mode = process.argv[2] ?? 'journey';
const planPath = `${privateA}/independent-plan.json`;
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const save = async (path, value) => writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600 });
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => [
  'SystemRoot', 'SystemDrive', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'APPDATA',
  'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'ProgramFiles',
  'ProgramFiles(x86)', 'ProgramData', 'OS', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
].includes(k)));
const checks = [];
let httpCalls = 0;
let toolCalls = 0;
let helperCalls = 0;
let mcpHttpCalls = 0;
const pass = (label) => { checks.push(label); console.log(`PASS ${label}`); };
const cli = async (...args) => {
  helperCalls++;
  try { return { ok: true, ...(await run(process.execPath, [helper, ...args], { env: cleanEnv, timeout: 30000, maxBuffer: 1024 * 1024 })) }; }
  catch (e) { return { ok: false, code: e.code, stdout: e.stdout, stderr: e.stderr }; }
};
const api = async (path, token, method = 'GET', body) => {
  httpCalls++;
  const response = await fetch(`${origin}${path}`, { method, redirect: 'error',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, data: await response.json() };
};
const clients = [];
const mcp = async (token) => {
  const c = new Client({ name: 'independent-sprint-review', version: '1' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), {
    requestInit: { ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) },
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1, maxReconnectionDelay: 1, reconnectionDelayGrowFactor: 1 },
    fetch: async (url, init) => {
      assert.equal(new URL(url instanceof Request ? url.url : String(url)).origin, origin);
      mcpHttpCalls++;
      return fetch(url, { ...init, redirect: 'error' });
    },
  }));
  clients.push(c);
  return c;
};
const tool = async (c, name, args = {}) => { toolCalls++; return c.callTool({ name, arguments: args }); };
const structured = (r) => r.structuredContent ?? JSON.parse(r.content.find((c) => c.type === 'text').text);
try {
  const rootA = await json(`${privateA}/workspace-root.json`);
  const agentA = await json(`${privateA}/agent.json`);
  if (mode === 'journey') {
    assert.equal((await cli('prepare', privateB, origin)).ok, true);
    assert.equal((await cli('create', privateB)).ok, true);
    const rootB = await json(`${privateB}/workspace-root.json`);
    assert.notEqual(rootA.workspace.ownerId, rootB.workspace.ownerId);
    pass('two new owners prepared privately through the documented helper');
    const publicClient = await mcp();
    const list = await publicClient.listTools();
    assert.equal(list.tools.length, 17);
    const capabilities = structured(await tool(publicClient, 'get_bazaar_capabilities'));
    assert.equal(capabilities.workspace.enabled, true);
    assert.equal((await tool(publicClient, 'get_bazaar_skills')).isError, undefined);
    const openapi = await api('/api/openapi');
    assert.equal(openapi.status, 200);
    pass('public MCP discovery, skills and OpenAPI available without a token');
    const creator = await mcp(rootA.bootstrapAccess);
    const creations = await Promise.all([0, 1, 2].map(() => tool(creator, 'create_bazaar_workspace', rootA.creationInput)));
    for (const c of creations) { assert.notEqual(c.isError, true); assert.equal(structured(c).record.workspaceId, rootA.workspace.workspaceId); }
    const conflicting = await tool(creator, 'create_bazaar_workspace', { ...rootA.creationInput, agentAccessHash: 'a'.repeat(64) });
    assert.equal(conflicting.isError, true);
    pass('identical concurrent registration returns one workspace; changed conditions conflict');
    const humanClient = await mcp(rootA.humanAccess);
    const delegated = await mcp(agentA.agentAccess);
    const recoveryClient = await mcp(rootA.bootstrapAccess);
    assert.equal((await tool(publicClient, 'list_bazaar_agent_tasks')).isError, true);
    assert.equal((await tool(humanClient, 'list_bazaar_agent_tasks')).isError, true);
    assert.equal((await tool(recoveryClient, 'list_bazaar_agent_tasks')).isError, true);
    assert.notEqual((await tool(delegated, 'list_bazaar_agent_tasks')).isError, true);
    const plan = { conversationId: randomUUID(), messageId: randomUUID(), taskId: randomUUID(),
      title: 'Independent sprint synthetic conversation', text: 'Prepara un ejemplo gratuito',
      operationId: `independent-inline-${randomUUID()}`, eventId: `independent-delivery-${randomUUID()}` };
    await save(planPath, plan);
    const conversation = await api('/api/conversations', rootA.humanAccess, 'POST', { conversationId: plan.conversationId, title: plan.title });
    assert.equal(conversation.status, 201);
    const message = { messageId: plan.messageId, taskId: plan.taskId, text: plan.text };
    assert.equal((await api(`/api/conversations/${plan.conversationId}/messages`, rootA.humanAccess, 'POST', message)).status, 201);
    assert.equal((await api(`/api/conversations/${plan.conversationId}/messages`, rootA.humanAccess, 'POST', message)).status, 200);
    assert.equal((await api(`/api/conversations/${plan.conversationId}/messages`, rootA.humanAccess, 'POST', { ...message, text: 'Changed conditions' })).status, 409);
    for (const access of [rootB.humanAccess, rootB.agentAccess, rootA.bootstrapAccess]) {
      const result = await api(`/api/conversations/${plan.conversationId}/messages`, access);
      assert.ok([401, 403, 404].includes(result.status), `scope status ${result.status}`);
    }
    assert.ok([401, 403].includes((await api('/api/conversations', rootA.agentAccess, 'POST', { conversationId: randomUUID(), title: 'must reject' })).status));
    pass('human message retries are idempotent; agent, recovery secret and other owner cannot act as human');
    assert.equal((await cli('tasks', privateA)).ok, true);
    assert.equal((await cli('claim', privateA, plan.taskId)).ok, true);
    assert.equal((await cli('claim', privateA, plan.taskId)).ok, true);
    const answer = { text: 'Resultado de ejemplo, gratuito y sin pago.' };
    await save(`${privateA}/respuesta.json`, answer);
    assert.equal((await cli('respond', privateA, plan.taskId, `${privateA}/respuesta.json`)).ok, true);
    assert.equal((await cli('respond', privateA, plan.taskId, `${privateA}/respuesta.json`)).ok, true);
    pass('documented helper conserves claim and response; identical retries succeed');
    const operation = {
      clientOperationId: plan.operationId, taskId: plan.taskId, mode: 'mock',
      service: { id: 'ejemplo-gratuito', title: 'Ejemplo inline sin pago', provider: 'Tu agente externo', url: origin },
      payment: { status: 'not-requested', network: 'stellar:testnet', asset: 'NO_PAYMENT', amountAtomic: '0', recipient: 'GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ' },
      delivery: { status: 'reported-delivered', result: { simulation: true, summary: 'Resultado de ejemplo conservado, sin transferencia.' } },
    };
    const event = { eventId: plan.eventId, taskId: plan.taskId, operationId: plan.operationId, mode: 'mock', kind: 'delivery-reported', title: 'Ejemplo inline disponible', result: { simulation: true } };
    await save(`${privateA}/operacion.json`, operation);
    await save(`${privateA}/actividad.json`, event);
    assert.equal((await cli('record', privateA, `${privateA}/operacion.json`)).ok, true);
    assert.equal((await cli('record', privateA, `${privateA}/operacion.json`)).ok, true);
    assert.equal((await cli('activity', privateA, `${privateA}/actividad.json`)).ok, true);
    assert.equal((await cli('activity', privateA, `${privateA}/actividad.json`)).ok, true);
    const history = structured(await tool(delegated, 'get_operation_history'));
    const messages = await api(`/api/conversations/${plan.conversationId}/messages`, rootA.humanAccess);
    assert.equal(history.records.length, 1);
    assert.equal(history.records[0].clientOperationId, plan.operationId);
    assert.equal(messages.data.conversation.messages.length, 2);
    assert.equal(messages.data.conversation.tasks.length, 1);
    await save(`${privateA}/before-restart.json`, { history, messages });
    assert.equal(messages.status, 200);
    assert.equal((await cli('recover', privateA)).ok, true);
    pass('inline operation and activity stored once with identical retries; history recovered through real MCP');
    await save(`${privateA}/respuesta-vinculada.json`, { text: 'Tu ejemplo está en la biblioteca', operationId: plan.operationId });
    const secondAnswer = await cli('respond', privateA, plan.taskId, `${privateA}/respuesta-vinculada.json`);
    assert.equal(secondAnswer.ok, false);
    await save(`${privateA}/guide-second-response-result.json`, { ok: secondAnswer.ok, code: secondAnswer.code });
    console.log('FINDING guide step 2 response freezes text; step 3 second response with changed text/operation conflicts');
    await save(`${privateA}/journey-evidence.json`, { checks, httpCalls, toolCalls, helperCalls, guideSecondResponseConflict: true });
  } else if (mode === 'restart') {
    const plan = await json(planPath);
    const before = await json(`${privateA}/before-restart.json`);
    const delegated = await mcp(agentA.agentAccess);
    const afterHistory = structured(await tool(delegated, 'get_operation_history'));
    const afterMessages = await api(`/api/conversations/${plan.conversationId}/messages`, rootA.humanAccess);
    assert.deepEqual(afterHistory, before.history);
    assert.deepEqual(afterMessages, before.messages);
    pass('same conversation, messages, task, operation and history recovered after actual Next process restart');
    assert.equal((await cli('create', privateA)).ok, true);
    assert.equal((await cli('recover', privateA)).ok, true);
    const oldHuman = rootA.humanAccess;
    const oldAgent = rootA.agentAccess;
    assert.equal((await cli('rotate', privateA, 'human')).ok, true);
    const rotatedHuman = await json(`${privateA}/workspace-root.json`);
    assert.equal((await api(`/api/conversations/${plan.conversationId}/messages`, oldHuman)).status, 401);
    assert.equal((await api(`/api/conversations/${plan.conversationId}/messages`, rotatedHuman.humanAccess)).status, 200);
    assert.notEqual((await tool(delegated, 'list_bazaar_agent_tasks')).isError, true);
    assert.equal(rotatedHuman.workspace.ownerId, rootA.workspace.ownerId);
    pass('human rotation revokes old human access and conserves agent access and owner');
    assert.equal((await cli('rotate', privateA, 'agent')).ok, true);
    const rotatedAgent = await json(`${privateA}/workspace-root.json`);
    assert.equal((await tool(delegated, 'list_bazaar_agent_tasks')).isError, true);
    const newDelegated = await mcp(rotatedAgent.agentAccess);
    assert.notEqual((await tool(newDelegated, 'list_bazaar_agent_tasks')).isError, true);
    assert.equal((await api(`/api/conversations/${plan.conversationId}/messages`, rotatedHuman.humanAccess)).status, 200);
    assert.equal(rotatedAgent.workspace.ownerId, rootA.workspace.ownerId);
    pass('agent rotation revokes old agent access and conserves human access and owner');
    assert.equal((await cli('revoke', privateA)).ok, true);
    assert.equal((await api(`/api/conversations/${plan.conversationId}/messages`, rotatedHuman.humanAccess)).status, 401);
    assert.equal((await tool(newDelegated, 'list_bazaar_agent_tasks')).isError, true);
    assert.equal((await cli('create', privateA)).ok, false);
    pass('revocation rejects both roles; retrying original creation does not restore access');
    await save(`${privateA}/restart-evidence.json`, { checks, httpCalls, toolCalls, helperCalls });
  } else if (mode === 'revoked-restart') {
    const plan = await json(planPath);
    const revoked = await json(`${privateA}/workspace-root.json`);
    assert.equal((await api(`/api/conversations/${plan.conversationId}/messages`, revoked.humanAccess)).status, 401);
    const delegated = await mcp(revoked.agentAccess);
    assert.equal((await tool(delegated, 'list_bazaar_agent_tasks')).isError, true);
    assert.equal((await cli('create', privateA)).ok, false);
    const rootB = await json(`${privateB}/workspace-root.json`);
    const other = await mcp(rootB.agentAccess);
    const otherHistory = structured(await tool(other, 'get_operation_history'));
    assert.equal(JSON.stringify(otherHistory).includes(plan.operationId), false);
    assert.equal(JSON.stringify(otherHistory).includes(plan.conversationId), false);
    pass('revocation remains effective after second restart; owner B still does not receive A records');
    await save(`${privateA}/revoked-restart-evidence.json`, { checks, httpCalls, toolCalls, helperCalls });
  } else throw new Error('unknown review mode');
} finally {
  await Promise.allSettled(clients.map((c) => c.close()));
  console.log(JSON.stringify({ mode, checks: checks.length, httpCalls, mcpHttpCalls, toolCalls, helperCalls, externalWrites: 0, valuesPrinted: false }));
}
