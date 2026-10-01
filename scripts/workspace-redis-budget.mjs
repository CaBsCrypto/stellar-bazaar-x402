// Only the isolated acceptance runner uses this relay. It never reads .env.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';

export const DEFAULT_BUDGET = Object.freeze({ redisRequests: 400, redisCommands: 2400, requestBytes: 16 * 1024 * 1024, responseBytes: 32 * 1024 * 1024, perRequestBytes: 65536, perResponseBytes: 65536, registryBytes: 16384, ownerBytes: 16384, storedBytes: 49164, owners: 2, applicationRequests: 120, applicationRequestBytes: 1024 * 1024, applicationResponseBytes: 2 * 1024 * 1024, elapsedMs: 120000, casAttemptsPerQuota: 8, transportRetries: 0 });
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) { return JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v); }
export function scriptsFromSource(root) {
  const source = readFileSync(new URL('lib/workspace-store.ts', root), 'utf8').replaceAll('\r\n', '\n');
  return Object.fromEntries(['READ', 'COMMIT'].map(name => { const value = source.match(new RegExp(`export const ${name}_WORKSPACE_LUA = \x60([\\s\\S]*?)\x60;`))?.[1]; if (!value) throw Error('CANONICAL_LUA_MISSING'); return [name, value]; }));
}
export function validatePlan(plan) {
  if (plan.version !== 1 || !/^bazaar-workspace:isolated-[a-f0-9]{32}$/.test(plan.prefix) || plan.identities?.length !== 2 || canonical(plan.budget) !== canonical(DEFAULT_BUDGET)) throw Error('INVALID_FROZEN_PLAN');
  const tag = plan.prefix.split(':')[1], base = `${plan.prefix}:{${tag}}:`;
  const ids = new Set(), hashes = new Set(), uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  for (const identity of plan.identities) {
    if (!uuid.test(identity.creationId) || !uuid.test(identity.ownerUuid) || identity.ownerId !== `ow_${identity.ownerUuid.replaceAll('-', '')}` || Object.keys(identity.hashes).sort().join(',') !== 'agent,bootstrap,human,rotatedAgent,rotatedHuman' || !Object.values(identity.hashes).every(v => /^[a-f0-9]{64}$/.test(v))) throw Error('INVALID_FROZEN_IDENTITY');
    for (const id of [identity.creationId, identity.ownerUuid, identity.ownerId]) { if (ids.has(id)) throw Error('DUPLICATE_FROZEN_IDENTITY'); ids.add(id); }
    for (const hash of Object.values(identity.hashes)) { if (hashes.has(hash)) throw Error('DUPLICATE_FROZEN_HASH'); hashes.add(hash); }
  }
  const expected = [base + 'registry', base + 'initialized', base + 'owner:none', ...plan.identities.map(v => base + 'owner:' + v.ownerId)];
  if (new Set(expected).size !== 5 || canonical(expected) !== canonical(plan.keys)) throw Error('INVALID_KEY_ALLOWLIST');
  const p = plan.payloads;
  if (!p || !uuid.test(p.conversation?.conversationId) || !uuid.test(p.humanMessage?.messageId) || !uuid.test(p.humanMessage?.taskId) || !uuid.test(p.claim?.attemptId) || !uuid.test(p.conflictingAttemptId) || p.conflictingAttemptId === p.claim.attemptId || !uuid.test(p.response?.messageId) || !uuid.test(p.operation?.clientOperationId) || !uuid.test(p.event?.eventId) || p.claim.taskId !== p.humanMessage.taskId || p.response.taskId !== p.claim.taskId || p.response.attemptId !== p.claim.attemptId || p.response.operationId !== p.operation.clientOperationId || p.operation.taskId !== p.claim.taskId || p.event.taskId !== p.claim.taskId || p.event.operationId !== p.operation.clientOperationId || p.operation.mode !== 'mock' || p.operation.payment?.amountAtomic !== '0' || p.operation.payment?.status !== 'not-requested' || p.operation.delivery?.artifact || p.operation.delivery?.result?.text !== p.response.text || p.event.mode !== 'mock' || p.event.kind !== 'delivery-reported') throw Error('INVALID_FROZEN_PAYLOADS');
  return Object.freeze(expected);
}
export class RedisBudget {
  constructor(plan, scripts, send) {
    this.plan = structuredClone(plan); this.keys = validatePlan(this.plan); this.scripts = scripts; if (plan.scriptHashes && canonical(plan.scriptHashes) !== canonical(Object.fromEntries(Object.entries(scripts).map(([k, v]) => [k, sha256(v)])))) throw Error('CANONICAL_LUA_CHANGED'); this.send = send; this.started = Date.now(); this.stopped = null;
    this.counts = { requests: 0, commands: 0, evalCommands: 0, luaCommands: 0, requestBytes: 0, responseBytes: 0, casRejections: 0, commits: 0, uncertain: 0, rejected: 0 };
    this.reservedResponseBytes = 0;
  }
  stop(code) { this.stopped ??= code; this.counts.rejected++; throw Error(code); }
  command(raw) {
    let c; try { c = JSON.parse(raw); } catch { return this.stop('INVALID_REDIS_COMMAND'); }
    if (!Array.isArray(c) || String(c[0]).toUpperCase() !== 'EVAL' || Number(c[2]) !== 3 || c.length < 6 || !c.every(v => ['string', 'number'].includes(typeof v))) return this.stop('INVALID_REDIS_COMMAND');
    const keys = c.slice(3, 6), args = c.slice(6), expectedBase = this.keys[0];
    if (keys[0] !== expectedBase || keys[2] !== this.keys[1] || ![this.keys[2], this.keys[3], this.keys[4]].includes(keys[1])) return this.stop('KEY_OUTSIDE_ALLOWLIST');
    if (c[1] === this.scripts.READ && args.length === 0) return { kind: 'read', keys, args, maxCommands: 4 };
    if (c[1] !== this.scripts.COMMIT || args.length !== 5 || !args.every(v => typeof v === 'string') || keys[1] === this.keys[2]) return this.stop('SCRIPT_OUTSIDE_ALLOWLIST');
    let registry; try { registry = JSON.parse(args[3]); } catch { return this.stop('INVALID_COMMIT_REGISTRY'); }
    if (registry.version !== 1 || !Array.isArray(registry.workspaces) || registry.workspaces.length > 2 || Buffer.byteLength(args[3]) > this.plan.budget.registryBytes) return this.stop('COMMIT_OUTSIDE_PLAN');
    const owners = new Set();
    for (const meta of registry.workspaces) {
      const frozen = this.plan.identities.find(v => v.creationId === meta.creationId);
      if (!frozen || meta.ownerId !== frozen.ownerId || meta.bootstrapHash !== frozen.hashes.bootstrap || meta.initialHumanHash !== frozen.hashes.human || meta.initialAgentHash !== frozen.hashes.agent || ![null, frozen.hashes.human, frozen.hashes.rotatedHuman].includes(meta.humanHash) || ![null, frozen.hashes.agent, frozen.hashes.rotatedAgent].includes(meta.agentHash)) return this.stop('IDENTITY_OUTSIDE_PLAN');
      if (owners.has(meta.ownerId) || !Number.isSafeInteger(meta.documentBytes) || meta.documentBytes < 0 || meta.documentBytes > this.plan.budget.ownerBytes) return this.stop('IDENTITY_OUTSIDE_PLAN'); owners.add(meta.ownerId);
    }
    if (registry.workspaces.reduce((n, v) => n + v.documentBytes, Buffer.byteLength(args[3]) + 12) > this.plan.budget.storedBytes) return this.stop('STORED_BYTE_BUDGET_EXHAUSTED');
    if (args[4]) { let doc; try { doc = JSON.parse(args[4]); } catch { return this.stop('INVALID_COMMIT_OWNER'); } if (keys[1] !== this.keys.find(v => v.endsWith(':owner:' + doc.ownerId)) || Buffer.byteLength(args[4]) > this.plan.budget.ownerBytes) return this.stop('OWNER_OUTSIDE_PLAN');
      const meta = registry.workspaces.find(v => v.ownerId === doc.ownerId), p = this.plan.payloads;
      if (!meta || meta.documentBytes !== Buffer.byteLength(args[4]) || !['conversations', 'tasks', 'operations', 'events'].every(name => Array.isArray(doc[name]) && doc[name].length <= 1)) return this.stop('OWNER_OUTSIDE_PLAN');
      if (doc.ownerId !== this.plan.identities[0].ownerId && ['conversations', 'tasks', 'operations', 'events'].some(name => doc[name].length)) return this.stop('PAYLOAD_OUTSIDE_PLAN');
      for (const c of doc.conversations) {
        if (c.record.conversationId !== p.conversation.conversationId || c.record.title !== p.conversation.title || !Array.isArray(c.record.messages) || c.record.messages.length > 2) return this.stop('PAYLOAD_OUTSIDE_PLAN');
        for (const m of c.record.messages) { const frozen = m.actor === 'human' ? p.humanMessage : p.response; if (!['human', 'agent'].includes(m.actor) || m.messageId !== frozen.messageId || m.taskId !== frozen.taskId || m.text !== frozen.text || m.conversationId !== p.conversation.conversationId || m.operationId !== (m.actor === 'human' ? undefined : p.operation.clientOperationId)) return this.stop('PAYLOAD_OUTSIDE_PLAN'); }
      }
      for (const t of doc.tasks) { const r = t.record; if (r.taskId !== p.claim.taskId || r.conversationId !== p.conversation.conversationId || r.humanMessageId !== p.humanMessage.messageId || r.text !== p.humanMessage.text || r.attemptId && r.attemptId !== p.claim.attemptId || r.agentId && r.agentId !== meta.agentId || r.operationId && r.operationId !== p.operation.clientOperationId || r.responseMessageId && r.responseMessageId !== p.response.messageId) return this.stop('PAYLOAD_OUTSIDE_PLAN'); }
      for (const [name, frozen] of [['operations', p.operation], ['events', p.event]]) for (const entry of doc[name]) { const { id, recordedAt, evidence, agentId, ...input } = entry.record; if (agentId !== meta.agentId || canonical(input) !== canonical(frozen)) return this.stop('PAYLOAD_OUTSIDE_PLAN'); }
    }
    return { kind: 'commit', keys, args, maxCommands: args[4] ? 7 : 6 };
  }
  async exchange(raw) {
    if (this.stopped) throw Error(this.stopped);
    const command = this.command(raw), budget = this.plan.budget, n = Buffer.byteLength(raw);
    if (Date.now() - this.started > budget.elapsedMs || n > budget.perRequestBytes || this.counts.requests + 1 > budget.redisRequests || this.counts.commands + command.maxCommands > budget.redisCommands || this.counts.requestBytes + n > budget.requestBytes || this.counts.responseBytes + this.reservedResponseBytes + budget.perResponseBytes > budget.responseBytes) return this.stop('REDIS_BUDGET_EXHAUSTED');
    // Reserve the largest possible effect BEFORE calling the transport. Count
    // EVAL itself as well as every internal GET/SET; CAS0 only executes GETs.
    this.counts.requests++; this.counts.commands += command.maxCommands; this.counts.evalCommands++; this.counts.requestBytes += n; this.reservedResponseBytes += budget.perResponseBytes;
    let response, received = 0;
    try {
      response = await this.send(raw, budget.perResponseBytes, bytes => { received += bytes; this.counts.responseBytes += bytes; });
      const size = Buffer.byteLength(response);
      if (!received) this.counts.responseBytes += size;
      if (size > budget.perResponseBytes) throw Error('REDIS_RESPONSE_TOO_LARGE');
      const parsed = JSON.parse(response);
      if (command.kind === 'read') { if (!Array.isArray(parsed.result) || parsed.result.length !== 3 || !parsed.result.every(v => typeof v === 'string')) throw Error('INVALID_REDIS_RESPONSE'); }
      else {
        if (![0, 1].includes(parsed.result)) throw Error('UNCERTAIN_REDIS_COMMIT');
        if (parsed.result === 0) { this.counts.commands -= command.maxCommands - 4; this.counts.casRejections++; }
        else this.counts.commits++;
      }
      this.counts.luaCommands = this.counts.commands - this.counts.evalCommands;
      return response;
    } catch (error) {
      // No network/SDK transport retry. Unknown acknowledgements retain their
      // full command reservation and require explicit operator recovery.
      this.counts.uncertain++; this.stopped = /^[A-Z_]{1,60}$/.test(error.message) ? error.message : 'REDIS_TRANSPORT_UNCERTAIN'; this.counts.luaCommands = this.counts.commands - this.counts.evalCommands; throw Error(this.stopped);
    } finally { this.reservedResponseBytes -= budget.perResponseBytes; }
  }
  report() { return { ...this.counts, stopped: this.stopped, elapsedMs: Date.now() - this.started, byteAccounting: 'exact UTF-8 HTTP JSON body bytes; TCP/TLS/header overhead excluded', unknownCommandsAreUpperBound: this.counts.uncertain > 0 }; }
}

export function realRedisTransport(origin, token, request = httpsRequest) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || !token || /[\r\n]/.test(token)) throw Error('INVALID_EXPLICIT_REDIS_INSTANCE');
  // Native HTTPS emits one request. No redirects, auth refresh, retry or SDK
  // auto-pipelining. The application SDK talks only to the loopback relay.
  const pending = new Set();
  const send = (raw, maxBytes, onResponseBytes) => new Promise((resolve, reject) => {
    let timer, req;
    const finish = (error, value) => { clearTimeout(timer); pending.delete(req); if (error) reject(error); else resolve(value); };
    req = request(url, { method: 'POST', agent: false, maxHeaderSize: 4096, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw), 'accept-encoding': 'identity' } }, res => {
      let size = 0; const chunks = [];
      res.on('data', chunk => { size += chunk.length; onResponseBytes?.(chunk.length); if (size > maxBytes) { res.destroy(); finish(Error('REDIS_RESPONSE_TOO_LARGE')); } else chunks.push(chunk); });
      res.on('end', () => { if (res.statusCode !== 200 || res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') finish(Error('REDIS_HTTP_REJECTED')); else finish(null, Buffer.concat(chunks).toString('utf8')); }); res.on('error', () => finish(Error('REDIS_TRANSPORT_UNCERTAIN')));
    });
    pending.add(req); timer = setTimeout(() => req.destroy(Error('REDIS_TRANSPORT_TIMEOUT')), 5000); req.on('error', () => finish(Error('REDIS_TRANSPORT_UNCERTAIN'))); req.end(raw);
  });
  send.cancelPending = () => { for (const req of pending) req.destroy(Error('REDIS_TRANSPORT_CANCELLED')); };
  return send;
}
