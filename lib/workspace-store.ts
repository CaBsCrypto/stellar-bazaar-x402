// Server-only persistence. No legacy Redis aliases, fallback, expiry or automatic mutation retry.
import { createHash, randomUUID } from "node:crypto";
import { channel } from "node:diagnostics_channel";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { activitySchema, type ActivityInput, type ActivityEvent } from "./activity.ts";
import { canonicalOperationJson, parseOperationHistoryInput, operationHistoryInputSchema, type OperationHistoryInput, type OperationHistoryRecord } from "./operation-history.ts";
import { WORKSPACE_LIMITS, WorkspaceError, createWorkspaceSchema, workspaceAccessSchema, workspaceHashSchema, workspaceIdentifierSchema, workspaceTextSchema, type WorkspacePrincipal, type WorkspaceRole, type WorkspaceConversation, type WorkspaceTask } from "./workspace-types.ts";
import { legacyHistoryReservations } from "./operation-history-auth.ts";

if (typeof window !== "undefined") throw new Error("Workspace storage is server-only");
const fileDiagnostics = channel("bazaar.workspace.file");
const uuid = z.string().uuid(), iso = z.string().datetime();
const accessIntentSchema = z.object({ expectedGeneration: z.number().int().min(1), digest: workspaceHashSchema, generation: z.number().int().min(2), revoked: z.boolean() }).strict();
const metaSchema = z.object({ creationId: uuid, workspaceId: uuid, ownerId: z.string().regex(/^ow_[a-f0-9]{32}$/), agentId: z.string().regex(/^agent_[a-f0-9]{32}$/), bootstrapHash: workspaceHashSchema, initialHumanHash: workspaceHashSchema, initialAgentHash: workspaceHashSchema, humanHash: workspaceHashSchema.nullable(), agentHash: workspaceHashSchema.nullable(), retiredHashes: z.array(workspaceHashSchema).max(4096), accessIntents: z.array(accessIntentSchema).max(4094), generation: z.number().int().min(1), revoked: z.boolean(), createdAt: iso, documentRevision: uuid, documentBytes: z.number().int().min(0).max(WORKSPACE_LIMITS.ownerBytes) }).strict();
const registrySchema = z.object({ version: z.literal(1), revision: uuid, workspaces: z.array(metaSchema).max(WORKSPACE_LIMITS.owners), creationWindows: z.array(z.object({ key: z.string().max(100), count: z.number().int().min(0), until: z.number().int().min(0) }).strict()).max(102), requestWindows: z.array(z.object({ ownerId: z.string(), count: z.number().int().min(0), until: z.number().int().min(0) }).strict()).max(100) }).strict();
const messageSchema = z.object({ messageId: workspaceIdentifierSchema, conversationId: workspaceIdentifierSchema, taskId: workspaceIdentifierSchema, actor: z.enum(["human", "agent"]), text: workspaceTextSchema, recordedAt: iso, operationId: workspaceIdentifierSchema.optional() }).strict();
const conversationSchema = z.object({ conversationId: workspaceIdentifierSchema, title: z.string().min(1).max(160), createdAt: iso, messages: z.array(messageSchema).max(500) }).strict();
const taskSchema = z.object({ taskId: workspaceIdentifierSchema, conversationId: workspaceIdentifierSchema, humanMessageId: workspaceIdentifierSchema, text: workspaceTextSchema, status: z.enum(["pending", "claimed", "responded", "uncertain"]), createdAt: iso, attemptId: workspaceIdentifierSchema.optional(), agentId: z.string().optional(), responseMessageId: workspaceIdentifierSchema.optional(), operationId: workspaceIdentifierSchema.optional() }).strict();
// Input schemas are strict; records add server metadata separately below.
const docSchema = z.object({ version: z.literal(1), ownerId: z.string(), revision: uuid, conversations: z.array(z.object({ digest: workspaceHashSchema, record: conversationSchema }).strict()).max(100), tasks: z.array(z.object({ digest: workspaceHashSchema, claimDigest: workspaceHashSchema.optional(), responseDigest: workspaceHashSchema.optional(), record: taskSchema }).strict()).max(500), operations: z.array(z.object({ digest: workspaceHashSchema, record: z.unknown() }).strict()).max(1000), events: z.array(z.object({ digest: workspaceHashSchema, record: z.unknown() }).strict()).max(1000) }).strict();
type Registry = z.infer<typeof registrySchema>;
type Meta = z.infer<typeof metaSchema>;
type Document = Omit<z.infer<typeof docSchema>, "operations" | "events"> & { operations: { digest: string; record: OperationHistoryRecord }[]; events: { digest: string; record: ActivityEvent }[] };
export type WorkspaceLegacyRegistry = { ownerIds: string[]; hashes: string[] };
export interface WorkspaceRedis { eval(script: string, keys: string[], args: string[]): Promise<unknown> }
export const READ_WORKSPACE_LUA = `return {redis.call('GET', KEYS[1]) or '', redis.call('GET', KEYS[2]) or '', redis.call('GET', KEYS[3]) or ''}`;
export const COMMIT_WORKSPACE_LUA = `
local registry = redis.call('GET', KEYS[1]) or ''
local document = redis.call('GET', KEYS[2]) or ''
local marker = redis.call('GET', KEYS[3]) or ''
if registry ~= ARGV[1] or document ~= ARGV[2] or marker ~= ARGV[3] then return 0 end
redis.call('SET', KEYS[1], ARGV[4])
if ARGV[5] ~= '' then redis.call('SET', KEYS[2], ARGV[5]) end
redis.call('SET', KEYS[3], 'workspace-v1')
return 1`;
const digest = (v: unknown) => createHash("sha256").update(canonicalOperationJson(v)).digest("hex");
const bytes = (v: string) => Buffer.byteLength(v, "utf8");
const emptyRegistry = (): Registry => ({ version: 1, revision: randomUUID(), workspaces: [], creationWindows: [], requestWindows: [] });
const emptyDocument = (ownerId: string): Document => ({ version: 1, ownerId, revision: randomUUID(), conversations: [], tasks: [], operations: [], events: [] });
const unavailable = (phase = "store-unavailable") => { fileDiagnostics.publish({ phase, code: "UNAVAILABLE" }); return new WorkspaceError("WORKSPACE_UNAVAILABLE"); };
function validateRegistry(raw: string, marker: string, legacy: WorkspaceLegacyRegistry): Registry {
  if (!raw) { if (marker) throw unavailable("registry-missing"); return emptyRegistry(); }
  if (marker !== "workspace-v1" || bytes(raw) > WORKSPACE_LIMITS.registryBytes) throw unavailable("registry-envelope");
  const registry = registrySchema.parse(JSON.parse(raw));
  const ids = new Set<string>(), hashes = new Set<string>();
  for (const m of registry.workspaces) {
    for (const id of [m.creationId, m.workspaceId, m.ownerId, m.agentId]) { if (ids.has(id) || legacy.ownerIds.includes(id)) throw unavailable("registry-identity"); ids.add(id); }
    const unique = new Set([m.bootstrapHash, m.initialHumanHash, m.initialAgentHash, m.humanHash, m.agentHash, ...m.retiredHashes].filter((h): h is string => h !== null));
    if (m.bootstrapHash === m.initialHumanHash || m.bootstrapHash === m.initialAgentHash || m.initialHumanHash === m.initialAgentHash || (m.humanHash && m.humanHash === m.agentHash) || m.bootstrapHash === m.humanHash || m.bootstrapHash === m.agentHash || (m.revoked ? !!(m.humanHash || m.agentHash) : !(m.humanHash && m.agentHash)) || new Set(m.retiredHashes).size !== m.retiredHashes.length || m.retiredHashes.includes(m.bootstrapHash) || (m.humanHash && m.retiredHashes.includes(m.humanHash)) || (m.agentHash && m.retiredHashes.includes(m.agentHash)) || m.retiredHashes.length !== m.generation - 1 + (m.revoked ? 1 : 0) || ![m.humanHash, ...m.retiredHashes].includes(m.initialHumanHash) || ![m.agentHash, ...m.retiredHashes].includes(m.initialAgentHash)) throw unavailable();
    if (m.accessIntents.length !== m.generation - 1 || m.accessIntents.some((intent, i) => intent.expectedGeneration !== i + 1 || intent.generation !== i + 2 || intent.revoked !== (m.revoked && i === m.accessIntents.length - 1))) throw unavailable("registry-intents");
    for (const hash of unique) { if (hashes.has(hash) || legacy.hashes.includes(hash)) throw unavailable("registry-hashes"); hashes.add(hash); }
  }
  if (registry.workspaces.reduce((n, m) => n + m.documentBytes, bytes(raw)) > WORKSPACE_LIMITS.globalBytes) throw unavailable();
  return registry;
}
function validateDocument(raw: string, meta: Meta): Document {
  if (!raw) throw unavailable("owner-missing");
  if (bytes(raw) !== meta.documentBytes) throw unavailable("owner-size");
  const d = docSchema.parse(JSON.parse(raw)) as Document;
  if (d.ownerId !== meta.ownerId || d.revision !== meta.documentRevision) throw unavailable("owner-identity");
  const conversations = new Set<string>(), messages = new Set<string>(), tasks = new Set<string>(), operations = new Set<string>(), events = new Set<string>();
  for (const c of d.conversations) {
    if (conversations.has(c.record.conversationId) || c.digest !== digest({ conversationId: c.record.conversationId, title: c.record.title })) throw unavailable();
    conversations.add(c.record.conversationId);
    for (const message of c.record.messages) { if (messages.has(message.messageId) || message.conversationId !== c.record.conversationId) throw unavailable(); messages.add(message.messageId); }
  }
  for (const entry of d.operations) {
    const { id, recordedAt, evidence, ...input } = entry.record;
    parseOperationHistoryInput(input); uuid.parse(id); iso.parse(recordedAt);
    if (evidence !== "agent-reported" || entry.digest !== digest(input) || operations.has(input.clientOperationId) || input.agentId !== meta.agentId) throw unavailable();
    enforceUnpaid(input); operations.add(input.clientOperationId);
  }
  for (const entry of d.events) {
    const { recordedAt, evidence, ...input } = entry.record;
    activitySchema.parse(input); iso.parse(recordedAt);
    if (evidence !== "agent-reported" || entry.digest !== digest(input) || events.has(input.eventId) || input.agentId !== meta.agentId || input.mode === "testnet" || input.kind === "payment-reported") throw unavailable();
    if (input.operationId && !operations.has(input.operationId)) throw unavailable(); events.add(input.eventId);
  }
  for (const t of d.tasks) {
    const r = t.record, c = d.conversations.find(c => c.record.conversationId === r.conversationId)?.record;
    const human = c?.messages.find(m => m.messageId === r.humanMessageId && m.actor === "human" && m.taskId === r.taskId && m.text === r.text);
    if (tasks.has(r.taskId) || !human || t.digest !== digest({ conversationId: r.conversationId, messageId: r.humanMessageId, taskId: r.taskId, text: r.text })) throw unavailable();
    if (r.status === "pending" ? !!(r.attemptId || r.agentId || t.claimDigest || t.responseDigest) : !r.attemptId || r.agentId !== meta.agentId || t.claimDigest !== digest({ taskId: r.taskId, attemptId: r.attemptId, agentId: r.agentId })) throw unavailable();
    if (r.status === "responded") {
      const response = c!.messages.find(m => m.messageId === r.responseMessageId && m.actor === "agent" && m.taskId === r.taskId);
      if (!response || response.operationId !== r.operationId || t.responseDigest !== digest({ taskId: r.taskId, attemptId: r.attemptId, messageId: response.messageId, text: response.text, operationId: response.operationId }) || (r.operationId && !operations.has(r.operationId))) throw unavailable();
    } else if (r.responseMessageId || r.operationId || t.responseDigest) throw unavailable();
    tasks.add(r.taskId);
  }
  if (d.conversations.some(c => c.record.messages.some(m => !tasks.has(m.taskId)))) throw unavailable();
  return d;
}
function enforceUnpaid(input: OperationHistoryInput) {
  if (input.mode === "testnet" || input.payment.status !== "not-requested" || input.payment.amountAtomic !== "0" || input.payment.transactionHash || input.delivery.artifact) throw new WorkspaceError("WORKSPACE_UNPAID_ONLY", 403);
}
type Snapshot = { registryRaw: string; documentRaw: string; marker: string };
interface Backend { read(ownerId?: string): Promise<Snapshot>; transact<T>(ownerId: string | undefined, callback: (snapshot: Snapshot, commit: (registry: string, document: string) => Promise<void>) => Promise<T>): Promise<T> }
function validatePrefix(prefix: string) { if (!/^bazaar-workspace:(local-test|preview|production)$/.test(prefix)) throw unavailable(); return prefix; }
function redisBackend(redis: WorkspaceRedis, prefix: string): Backend {
  validatePrefix(prefix);
  const tag = prefix.split(":")[1];
  const keys = (ownerId?: string) => [`${prefix}:{${tag}}:registry`, `${prefix}:{${tag}}:owner:${ownerId ?? "none"}`, `${prefix}:{${tag}}:initialized`];
  const read = async (ownerId?: string): Promise<Snapshot> => {
    const result = await redis.eval(READ_WORKSPACE_LUA, keys(ownerId), []);
    if (!Array.isArray(result) || result.length !== 3 || !result.every(v => typeof v === "string")) throw unavailable();
    return { registryRaw: result[0], documentRaw: result[1], marker: result[2] };
  };
  return { read, async transact(ownerId, callback) {
    const snapshot = await read(ownerId);
    return callback(snapshot, async (registry, document) => {
      const result = await redis.eval(COMMIT_WORKSPACE_LUA, keys(ownerId), [snapshot.registryRaw, snapshot.documentRaw, snapshot.marker, registry, document]);
      if (result === 0) throw new WorkspaceError("WORKSPACE_CONFLICT", 409);
      if (result !== 1) throw unavailable();
    });
  } };
}
async function optionalRead(path: string) { try { return await readFile(path, "utf8"); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return ""; throw e; } }
function fileFailure(phase: string, error: unknown) {
  const errno = (error as NodeJS.ErrnoException | undefined)?.code;
  const code = errno && ["EACCES", "EPERM", "EEXIST", "ENOENT", "EBUSY", "EIO", "EINVAL", "EISDIR", "ENOTDIR", "EMFILE", "ENFILE", "ENOSPC"].includes(errno) ? errno : "UNKNOWN";
  fileDiagnostics.publish({ phase, code });
}
function fileBackend(directory: string, prefix: string): Backend {
  validatePrefix(prefix); const root = join(resolve(directory), prefix.split(":")[1]);
  const paths = (ownerId?: string) => ({ registry: join(root, "registry.json"), document: join(root, ownerId ? `owner-${ownerId}.json` : "unused.json"), marker: join(root, "initialized"), pending: join(root, "pending.json"), lock: join(root, "lock") });
  async function locked<T>(ownerId: string | undefined, callback: (p: ReturnType<typeof paths>) => Promise<T>) {
    await mkdir(root, { recursive: true }); const p = paths(ownerId);
    let handle, reportedPermissionContention = false; const until = Date.now() + 2500;
    for (;;) {
      try { handle = await open(p.lock, "wx"); break; }
      catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        // Windows can report EPERM during concurrent lock acquisition.
        // Only acquisition is retried: the callback has not read or changed state.
        if (!["EEXIST", "EPERM"].includes(code ?? "") || Date.now() >= until) { fileFailure(Date.now() >= until ? "lock-timeout" : "lock-acquire", e); throw unavailable(); }
        if (code === "EPERM" && !reportedPermissionContention) { fileFailure("lock-contention", e); reportedPermissionContention = true; }
        await new Promise(r => setTimeout(r, 10));
      }
    }
    try { if (await optionalRead(p.pending)) { fileDiagnostics.publish({ phase: "pending-present", code: "PENDING" }); throw unavailable(); } return await callback(p); }
    finally { try { await handle.close(); } catch (e) { fileFailure("lock-close", e); throw e; } try { await unlink(p.lock); } catch (e) { fileFailure("lock-release", e); throw e; } }
  }
  const snapshot = async (p: ReturnType<typeof paths>) => { try { const values = await Promise.all([optionalRead(p.registry), optionalRead(p.document), optionalRead(p.marker)]); return { registryRaw: values[0], documentRaw: values[1], marker: values[2] }; } catch (e) { fileFailure("snapshot-read", e); throw e; } };
  const atomicWrite = async (path: string, raw: string, phase: string) => { try { const temp = path + "." + randomUUID() + ".tmp"; const h = await open(temp, "wx"); try { await h.writeFile(raw); await h.sync(); } finally { await h.close(); } await rename(temp, path); } catch (e) { fileFailure(phase, e); throw e; } };
  return { read: ownerId => locked(ownerId, snapshot), transact: (ownerId, callback) => locked(ownerId, async p => callback(await snapshot(p), async (registry, document) => {
    await atomicWrite(p.pending, JSON.stringify({ transaction: randomUUID() }), "write-pending");
    if (document) await atomicWrite(p.document, document, "write-owner");
    await atomicWrite(p.registry, registry, "write-registry"); await atomicWrite(p.marker, "workspace-v1", "write-marker"); try { await unlink(p.pending); } catch (e) { fileFailure("clear-pending-after-commit", e); throw e; }
  })) };
}
function buildStore(backend: Backend, reservations: () => WorkspaceLegacyRegistry = legacyHistoryReservations, principal?: WorkspacePrincipal) {
  const safe = async <T>(fn: () => Promise<T>): Promise<T> => { try { return await fn(); } catch (e) { if (e instanceof WorkspaceError) throw e; fileDiagnostics.publish({ phase: "store-unexpected", code: e instanceof z.ZodError ? "SCHEMA" : e instanceof SyntaxError ? "JSON" : "UNKNOWN" }); throw unavailable(); } };
  function authorized(meta: Meta, role?: WorkspaceRole) {
    if (meta.revoked && role !== "bootstrap") throw new WorkspaceError("WORKSPACE_REVOKED", 401);
    if (principal && (meta.ownerId !== principal.ownerId || meta.workspaceId !== principal.workspaceId || meta.generation !== principal.generation || meta.agentId !== principal.agentId)) throw new WorkspaceError("UNAUTHORIZED", 401);
    if (principal && (role ? principal.role !== role : principal.role === "bootstrap")) throw new WorkspaceError("FORBIDDEN", 403);
  }
  const readOwner = (ownerId: string, role?: WorkspaceRole) => safe(async () => {
    if (!/^ow_[a-f0-9]{32}$/.test(ownerId)) throw unavailable();
    const s = await backend.read(ownerId), registry = validateRegistry(s.registryRaw, s.marker, reservations());
    const meta = registry.workspaces.find(m => m.ownerId === ownerId); if (!meta) throw new WorkspaceError("NOT_FOUND", 404);
    authorized(meta, role); return { registry, meta, document: validateDocument(s.documentRaw, meta) };
  });
  const mutateOwner = <T>(ownerId: string, role: WorkspaceRole | undefined, fn: (d: Document, meta: Meta) => T) => safe(() => {
    if (!/^ow_[a-f0-9]{32}$/.test(ownerId)) throw unavailable();
    return backend.transact(ownerId, async (s, commit) => {
    const registry = validateRegistry(s.registryRaw, s.marker, reservations()), meta = registry.workspaces.find(m => m.ownerId === ownerId); if (!meta) throw new WorkspaceError("NOT_FOUND", 404);
    authorized(meta, role); const d = validateDocument(s.documentRaw, meta), before = JSON.stringify(d), result = fn(d, meta);
    if (JSON.stringify(d) !== before) {
      d.revision = randomUUID(); const raw = JSON.stringify(d); if (bytes(raw) > WORKSPACE_LIMITS.ownerBytes) throw new WorkspaceError("WORKSPACE_CAPACITY", 409);
      meta.documentRevision = d.revision; meta.documentBytes = bytes(raw); registry.revision = randomUUID(); const reg = JSON.stringify(registry);
      if (bytes(reg) > WORKSPACE_LIMITS.registryBytes || registry.workspaces.reduce((n, m) => n + m.documentBytes, bytes(reg)) > WORKSPACE_LIMITS.globalBytes) throw new WorkspaceError("WORKSPACE_CAPACITY", 409);
      validateDocument(raw, meta); await commit(reg, raw);
    }
    return result;
  }); });
  const store = {
    forPrincipal(p: WorkspacePrincipal) { return buildStore(backend, reservations, p); },
    async resolveHash(hash: string): Promise<WorkspacePrincipal> { return safe(async () => {
      workspaceHashSchema.parse(hash); const s = await backend.read(); const registry = validateRegistry(s.registryRaw, s.marker, reservations());
      for (const m of registry.workspaces) {
        const role: WorkspaceRole | undefined = hash === m.bootstrapHash ? "bootstrap" : hash === m.humanHash ? "human" : hash === m.agentHash ? "agent" : undefined;
        if (role && (!m.revoked || role === "bootstrap")) return { ownerId: m.ownerId, workspaceId: m.workspaceId, agentId: m.agentId, generation: m.generation, role };
      }
      throw new WorkspaceError("UNAUTHORIZED", 401);
    }); },
    async createWorkspace(input: z.infer<typeof createWorkspaceSchema>, bootstrapHash: string, trustedIp = "untrusted") { return safe(async () => {
      createWorkspaceSchema.parse(input); workspaceHashSchema.parse(bootstrapHash);
      const initial = await backend.read(), initialRegistry = validateRegistry(initial.registryRaw, initial.marker, reservations());
      const ownerId = initialRegistry.workspaces.find(m => m.creationId === input.creationId)?.ownerId ?? "ow_" + randomUUID().replaceAll("-", "");
      const authenticateReplay = (existing: Meta) => {
        if (existing.bootstrapHash !== bootstrapHash) throw new WorkspaceError("UNAUTHORIZED", 401);
        if (existing.initialHumanHash !== input.humanAccessHash || existing.initialAgentHash !== input.agentAccessHash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409);
      };
      const result = await backend.transact<{ rebindOwnerId: string } | { record: ReturnType<typeof receipt>; created: boolean }>(ownerId, async (s, commit) => {
        const legacy = reservations(), registry = validateRegistry(s.registryRaw, s.marker, legacy), existing = registry.workspaces.find(m => m.creationId === input.creationId);
        if (existing) {
          authenticateReplay(existing);
          // Another creator may have committed after our initial registry read.
          // Bind one fresh read to its stable owner before returning a receipt.
          if (existing.ownerId !== ownerId) return { rebindOwnerId: existing.ownerId };
          validateDocument(s.documentRaw, existing);
          return { record: receipt(existing), created: false };
        }
        const hashes = [bootstrapHash, input.humanAccessHash, input.agentAccessHash];
        if (new Set(hashes).size !== 3 || hashes.some(h => legacy.hashes.includes(h) || registry.workspaces.some(m => [m.bootstrapHash, m.initialHumanHash, m.initialAgentHash, m.humanHash, m.agentHash, ...m.retiredHashes].includes(h)))) throw new WorkspaceError("WORKSPACE_COLLISION", 409);
        if (legacy.ownerIds.includes(ownerId) || s.documentRaw) throw new WorkspaceError("WORKSPACE_COLLISION", 409);
        if (registry.workspaces.length >= WORKSPACE_LIMITS.owners) throw new WorkspaceError("WORKSPACE_CAPACITY", 409);
        const now = Date.now(); registry.creationWindows = registry.creationWindows.filter(w => w.until > now);
        const windows = [{ key: "global:" + Math.floor(now / 86400000), until: (Math.floor(now / 86400000) + 1) * 86400000, max: WORKSPACE_LIMITS.dailyCreations }, { key: "ip:" + digest(trustedIp) + ":" + Math.floor(now / 3600000), until: (Math.floor(now / 3600000) + 1) * 3600000, max: WORKSPACE_LIMITS.hourlyCreationsPerIp }];
        for (const w of windows) { let old = registry.creationWindows.find(v => v.key === w.key); if (old && old.count >= w.max) throw new WorkspaceError("WORKSPACE_RATE_LIMIT", 429); if (!old) { old = { key: w.key, count: 0, until: w.until }; registry.creationWindows.push(old); } old.count++; }
        const d = emptyDocument(ownerId), raw = JSON.stringify(d);
        const meta: Meta = { creationId: input.creationId, workspaceId: randomUUID(), ownerId, agentId: "agent_" + randomUUID().replaceAll("-", ""), bootstrapHash, initialHumanHash: input.humanAccessHash, initialAgentHash: input.agentAccessHash, humanHash: input.humanAccessHash, agentHash: input.agentAccessHash, retiredHashes: [], accessIntents: [], generation: 1, revoked: false, createdAt: new Date().toISOString(), documentRevision: d.revision, documentBytes: bytes(raw) };
        registry.workspaces.push(meta); registry.revision = randomUUID(); const reg = JSON.stringify(registry); validateRegistry(reg, "workspace-v1", legacy); await commit(reg, raw); return { record: receipt(meta), created: true };
      });
      if (!("rebindOwnerId" in result)) return result;
      return backend.transact(result.rebindOwnerId, async s => {
        const registry = validateRegistry(s.registryRaw, s.marker, reservations()), existing = registry.workspaces.find(m => m.creationId === input.creationId);
        if (!existing || existing.ownerId !== result.rebindOwnerId) throw unavailable("creation-owner-rebind");
        authenticateReplay(existing); validateDocument(s.documentRaw, existing);
        return { record: receipt(existing), created: false };
      });
    }); },
    async changeAccess(workspaceId: string, bootstrapHash: string, input: z.infer<typeof workspaceAccessSchema>) { return safe(async () => {
      const first = await backend.read(), firstRegistry = validateRegistry(first.registryRaw, first.marker, reservations());
      const owner = firstRegistry.workspaces.find(m => m.workspaceId === workspaceId && m.bootstrapHash === bootstrapHash)?.ownerId;
      if (!owner) throw new WorkspaceError("UNAUTHORIZED", 401);
      return backend.transact(owner, async (s, commit) => {
      workspaceAccessSchema.parse(input); const registry = validateRegistry(s.registryRaw, s.marker, reservations()), meta = registry.workspaces.find(m => m.workspaceId === workspaceId);
      if (!meta || meta.bootstrapHash !== bootstrapHash) throw new WorkspaceError("UNAUTHORIZED", 401);
      validateDocument(s.documentRaw, meta);
      const intentDigest = digest(input), previous = meta.accessIntents.find(intent => intent.expectedGeneration === input.expectedGeneration);
      if (previous) {
        if (previous.digest !== intentDigest) throw new WorkspaceError("WORKSPACE_CONFLICT", 409);
        return { record: { ...receipt(meta), generation: previous.generation, revoked: previous.revoked }, current: { generation: meta.generation, revoked: meta.revoked }, created: false };
      }
      if (meta.generation !== input.expectedGeneration) throw new WorkspaceError("WORKSPACE_CONFLICT", 409);
      if (meta.revoked) throw new WorkspaceError("WORKSPACE_REVOKED", 409);
      if (meta.retiredHashes.length >= 4094) throw new WorkspaceError("WORKSPACE_CAPACITY", 409);
      if (input.action === "rotate") {
        if (reservations().hashes.includes(input.accessHash) || registry.workspaces.some(m => [m.bootstrapHash, m.initialHumanHash, m.initialAgentHash, m.humanHash, m.agentHash, ...m.retiredHashes].includes(input.accessHash))) throw new WorkspaceError("WORKSPACE_COLLISION", 409);
        const field = input.role === "human" ? "humanHash" : "agentHash"; meta.retiredHashes.push(meta[field]!); meta[field] = input.accessHash;
      } else { meta.retiredHashes.push(meta.humanHash!, meta.agentHash!); meta.humanHash = null; meta.agentHash = null; meta.revoked = true; }
      meta.generation++; meta.accessIntents.push({ expectedGeneration: input.expectedGeneration, digest: intentDigest, generation: meta.generation, revoked: meta.revoked }); registry.revision = randomUUID(); const reg = JSON.stringify(registry); if (bytes(reg) > WORKSPACE_LIMITS.registryBytes) throw new WorkspaceError("WORKSPACE_CAPACITY", 409); validateRegistry(reg, "workspace-v1", reservations()); await commit(reg, ""); return { record: receipt(meta), current: { generation: meta.generation, revoked: meta.revoked }, created: true };
    }); }); },
    async consumeRequest(ownerId: string, generation: number, bootstrapHash?: string) { return safe(() => backend.transact(ownerId, async (s, commit) => {
      const registry = validateRegistry(s.registryRaw, s.marker, reservations()), meta = registry.workspaces.find(m => m.ownerId === ownerId);
      if (!meta) throw new WorkspaceError("UNAUTHORIZED", 401);
      const administration = bootstrapHash !== undefined && bootstrapHash === meta.bootstrapHash;
      if ((bootstrapHash !== undefined && !administration) || (!administration && (meta.generation !== generation || meta.revoked))) throw new WorkspaceError("UNAUTHORIZED", 401);
      validateDocument(s.documentRaw, meta);
      const now = Date.now(); registry.requestWindows = registry.requestWindows.filter(w => w.until > now); let w = registry.requestWindows.find(w => w.ownerId === ownerId);
      if (!w) { w = { ownerId, count: 0, until: now + 60000 }; registry.requestWindows.push(w); }
      if (w.count >= WORKSPACE_LIMITS.requestsPerMinute) throw new WorkspaceError("WORKSPACE_RATE_LIMIT", 429);
      w.count++; registry.revision = randomUUID(); await commit(JSON.stringify(registry), "");
    })); },
    async listConversations(ownerId: string): Promise<WorkspaceConversation[]> { const { document: d } = await readOwner(ownerId); return d.conversations.map(v => ({ ...v.record, tasks: d.tasks.filter(t => t.record.conversationId === v.record.conversationId).map(t => t.record) })); },
    async getConversation(ownerId: string, id: string): Promise<WorkspaceConversation | null> { workspaceIdentifierSchema.parse(id); const { document: d } = await readOwner(ownerId); const c = d.conversations.find(v => v.record.conversationId === id)?.record; return c ? { ...c, tasks: d.tasks.filter(t => t.record.conversationId === id).map(t => t.record) } : null; },
    async createConversation(ownerId: string, input: { conversationId: string; title: string }) {
      const parsed = z.object({ conversationId: workspaceIdentifierSchema, title: z.string().min(1).max(160).refine(v => v.trim().length > 0 && !/[\u0000-\u001f]/.test(v)) }).strict().parse(input);
      return mutateOwner(ownerId, "human", d => { const hash = digest(parsed), old = d.conversations.find(c => c.record.conversationId === parsed.conversationId); if (old) { if (old.digest !== hash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); return { record: old.record, created: false }; } const record = { ...parsed, createdAt: new Date().toISOString(), messages: [] }; d.conversations.push({ digest: hash, record }); return { record, created: true }; });
    },
    async sendHumanMessage(ownerId: string, input: { conversationId: string; messageId: string; taskId: string; text: string }) {
      const parsed = z.object({ conversationId: workspaceIdentifierSchema, messageId: workspaceIdentifierSchema, taskId: workspaceIdentifierSchema, text: workspaceTextSchema }).strict().parse(input);
      return mutateOwner(ownerId, "human", d => { const hash = digest(parsed), old = d.tasks.find(t => t.record.taskId === parsed.taskId); if (old) { if (old.digest !== hash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); const record = d.conversations.find(c => c.record.conversationId === parsed.conversationId)!.record.messages.find(m => m.messageId === parsed.messageId)!; return { record, created: false }; } if (d.conversations.some(c => c.record.messages.some(m => m.messageId === parsed.messageId))) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); const c = d.conversations.find(c => c.record.conversationId === parsed.conversationId); if (!c) throw new WorkspaceError("NOT_FOUND", 404); const recordedAt = new Date().toISOString(); const record = { ...parsed, actor: "human" as const, recordedAt }; c.record.messages.push(record); d.tasks.push({ digest: hash, record: { taskId: parsed.taskId, conversationId: parsed.conversationId, humanMessageId: parsed.messageId, text: parsed.text, createdAt: recordedAt, status: "pending" } }); return { record, created: true }; });
    },
    async listAgentTasks(ownerId: string): Promise<WorkspaceTask[]> { return (await readOwner(ownerId, "agent")).document.tasks.map(t => t.record); },
    async claimTask(ownerId: string, input: { taskId: string; attemptId: string; agentId: string }) {
      const parsed = z.object({ taskId: workspaceIdentifierSchema, attemptId: workspaceIdentifierSchema, agentId: workspaceIdentifierSchema }).strict().parse(input);
      return mutateOwner(ownerId, "agent", (d, m) => { if (parsed.agentId !== m.agentId) throw new WorkspaceError("FORBIDDEN", 403); const t = d.tasks.find(t => t.record.taskId === parsed.taskId); if (!t) throw new WorkspaceError("NOT_FOUND", 404); const hash = digest(parsed); if (t.record.status !== "pending") { if (t.claimDigest !== hash) throw new WorkspaceError("TASK_ALREADY_CLAIMED", 409); return { record: t.record, created: false }; } t.claimDigest = hash; Object.assign(t.record, { status: "claimed", attemptId: parsed.attemptId, agentId: m.agentId }); return { record: t.record, created: true }; });
    },
    async respondToTask(ownerId: string, input: { taskId: string; attemptId: string; messageId: string; text: string; operationId?: string }) {
      const parsed = z.object({ taskId: workspaceIdentifierSchema, attemptId: workspaceIdentifierSchema, messageId: workspaceIdentifierSchema, text: workspaceTextSchema, operationId: workspaceIdentifierSchema.optional() }).strict().parse(input);
      return mutateOwner(ownerId, "agent", (d, m) => { const t = d.tasks.find(t => t.record.taskId === parsed.taskId); if (!t) throw new WorkspaceError("NOT_FOUND", 404); if (t.record.attemptId !== parsed.attemptId || t.record.agentId !== m.agentId || !["claimed", "responded"].includes(t.record.status)) throw new WorkspaceError("TASK_NOT_CLAIMED", 409); const hash = digest(parsed); if (t.record.status === "responded") { if (t.responseDigest !== hash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); return { record: t.record, created: false }; } if (d.conversations.some(c => c.record.messages.some(m => m.messageId === parsed.messageId))) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); if (parsed.operationId && !d.operations.some(o => o.record.clientOperationId === parsed.operationId)) throw new WorkspaceError("OPERATION_NOT_FOUND", 404); const c = d.conversations.find(c => c.record.conversationId === t.record.conversationId)!; c.record.messages.push({ messageId: parsed.messageId, taskId: parsed.taskId, conversationId: t.record.conversationId, actor: "agent", text: parsed.text, recordedAt: new Date().toISOString(), ...(parsed.operationId ? { operationId: parsed.operationId } : {}) }); t.responseDigest = hash; Object.assign(t.record, { status: "responded", responseMessageId: parsed.messageId, ...(parsed.operationId ? { operationId: parsed.operationId } : {}) }); return { record: t.record, created: true }; });
    },
    operations: {
      async append(ownerId: string, input: OperationHistoryInput) { const parsed = parseOperationHistoryInput(input); enforceUnpaid(parsed); return mutateOwner(ownerId, "agent", (d, m) => { if (parsed.agentId && parsed.agentId !== m.agentId) throw new WorkspaceError("FORBIDDEN", 403); const authoritative = { ...parsed, agentId: m.agentId }; const hash = digest(authoritative), old = d.operations.find(o => o.record.clientOperationId === parsed.clientOperationId); if (old) { if (old.digest !== hash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); return { record: old.record, created: false }; } const record: OperationHistoryRecord = { ...authoritative, id: randomUUID(), recordedAt: new Date().toISOString(), evidence: "agent-reported" }; d.operations.unshift({ digest: hash, record }); return { record, created: true }; }); },
      async all(ownerId: string) { return (await readOwner(ownerId)).document.operations.map(o => o.record); },
      async list(ownerId: string, limit = 20) { if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new WorkspaceError("INVALID_REQUEST", 400); return (await readOwner(ownerId)).document.operations.slice(0, limit).map(o => o.record); },
    },
    events: {
      async append(ownerId: string, input: ActivityInput) { const parsed = activitySchema.parse(input); if (parsed.mode === "testnet" || parsed.kind === "payment-reported") throw new WorkspaceError("WORKSPACE_UNPAID_ONLY", 403); return mutateOwner(ownerId, "agent", (d, m) => { if (parsed.agentId && parsed.agentId !== m.agentId) throw new WorkspaceError("FORBIDDEN", 403); const authoritative = { ...parsed, agentId: m.agentId }; if (parsed.operationId && !d.operations.some(o => o.record.clientOperationId === parsed.operationId)) throw new WorkspaceError("OPERATION_NOT_FOUND", 404); const hash = digest(authoritative), old = d.events.find(e => e.record.eventId === parsed.eventId); if (old) { if (old.digest !== hash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); return { record: old.record, created: false }; } const record: ActivityEvent = { ...authoritative, recordedAt: new Date().toISOString(), evidence: "agent-reported" }; d.events.unshift({ digest: hash, record }); return { record, created: true }; }); },
      async all(ownerId: string) { return (await readOwner(ownerId)).document.events.map(e => e.record); },
    },
  };
  return store;
}
function receipt(m: Meta) { return { workspaceId: m.workspaceId, ownerId: m.ownerId, agentId: m.agentId, creationId: m.creationId, generation: m.generation, revoked: m.revoked, createdAt: m.createdAt }; }
export type WorkspaceStore = ReturnType<typeof buildStore>;
export function createRedisWorkspaceStore(redis: WorkspaceRedis, prefix = "bazaar-workspace:local-test", reservations?: () => WorkspaceLegacyRegistry): WorkspaceStore { return buildStore(redisBackend(redis, prefix), reservations); }
export function createFileWorkspaceStore(directory: string, prefix = "bazaar-workspace:local-test", reservations?: () => WorkspaceLegacyRegistry): WorkspaceStore { return buildStore(fileBackend(directory, prefix), reservations); }
let testStore: WorkspaceStore | undefined;
export function setWorkspaceStoreForTests(store: WorkspaceStore | undefined) { if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw unavailable(); testStore = store; }
export function openWorkspacesEnabled() { return process.env.BAZAAR_ENABLE_OPEN_WORKSPACES === "true"; }
export function assertWorkspaceEnabled() { if (!openWorkspacesEnabled()) throw new WorkspaceError("WORKSPACES_DISABLED", 503); }
export function workspacePrefix() { return validatePrefix(process.env.BAZAAR_WORKSPACE_PREFIX ?? `bazaar-workspace:${process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "preview" : "local-test"}`); }
export function workspaceLoopbackOrigin() { const value = process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN; if (!value) throw unavailable(); const url = new URL(value); if (url.origin !== value || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol)) throw unavailable(); return value; }
export function configuredWorkspaceStore(reservations?: () => WorkspaceLegacyRegistry): WorkspaceStore {
  assertWorkspaceEnabled(); if (testStore) return testStore;
  if (process.env.BAZAAR_WORKSPACE_BACKEND === "file") { if (process.env.VERCEL || process.env.VERCEL_ENV || !process.env.BAZAAR_WORKSPACE_FILE_DIRECTORY) throw unavailable(); workspaceLoopbackOrigin(); return createFileWorkspaceStore(process.env.BAZAAR_WORKSPACE_FILE_DIRECTORY, workspacePrefix(), reservations); }
  if (process.env.BAZAAR_WORKSPACE_BACKEND !== "redis") throw unavailable();
  const url = process.env.BAZAAR_WORKSPACE_REDIS_REST_URL, token = process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN;
  if (!url?.startsWith("https://") || !token) throw unavailable();
  const parsed = new URL(url); if (parsed.username || parsed.password || parsed.search || parsed.hash) throw unavailable();
  return createRedisWorkspaceStore(new Redis({ url, token, automaticDeserialization: false, retry: { retries: 0 }, enableAutoPipelining: false }), workspacePrefix(), reservations);
}
