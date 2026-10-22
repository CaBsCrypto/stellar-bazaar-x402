import { meteredRedis, recordOperationalStorageBounds } from './acceptance-meter.ts';
// Server-only persistence. No legacy aliases, fallback, expiry or uncertain-outcome retry.
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { channel } from "node:diagnostics_channel";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { activitySchema, type ActivityInput, type ActivityEvent } from "./activity.ts";
import { canonicalOperationJson, parseOperationHistoryInput, operationHistoryInputSchema, type OperationHistoryInput, type OperationHistoryRecord } from "./operation-history.ts";
import { WORKSPACE_LIMITS, WorkspaceError, createWorkspaceSchema, workspaceAccessSchema, marketPermissionChangeSchema, workspaceHashSchema, workspaceIdentifierSchema, workspaceTextSchema, type WorkspacePrincipal, type WorkspaceRole, type WorkspaceConversation, type WorkspaceTask } from "./workspace-types.ts";
import { legacyHistoryReservations } from "./operation-history-auth.ts";
import { workspaceGlobalRequestLimits } from "./workspace-admission.ts";
import {prepareContinuousStorageCommit} from './continuous-free-storage.ts';

import {demoEnabled,walletBindingSchema,walletChallengeSchema,walletMessage,verifyWalletProof,walletAddressSchema,type WalletChallenge} from "./demo-wallet.ts";

if (typeof window !== "undefined") throw new Error("Workspace storage is server-only");
const fileDiagnostics = channel("bazaar.workspace.file");
const uuid = z.string().uuid(), iso = z.string().datetime();
const accessIntentSchema = z.object({ expectedGeneration: z.number().int().min(1), digest: workspaceHashSchema, generation: z.number().int().min(2), revoked: z.boolean() }).strict();
const metaSchema = z.object({ creationId: uuid, workspaceId: uuid, ownerId: z.string().regex(/^ow_[a-f0-9]{32}$/), agentId: z.string().regex(/^agent_[a-f0-9]{32}$/), bootstrapHash: workspaceHashSchema, initialHumanHash: workspaceHashSchema, initialAgentHash: workspaceHashSchema, humanHash: workspaceHashSchema.nullable(), agentHash: workspaceHashSchema.nullable(), retiredHashes: z.array(workspaceHashSchema).max(4096), accessIntents: z.array(accessIntentSchema).max(4094), generation: z.number().int().min(1), revoked: z.boolean(), createdAt: iso, wallet: walletBindingSchema.optional(), walletChallenge: walletChallengeSchema.optional(), documentRevision: uuid, documentBytes: z.number().int().min(0).max(WORKSPACE_LIMITS.ownerBytes), nextContentExpiryAt:z.number().int().nonnegative().nullable().optional() }).strict();
const registrySchema = z.object({ version: z.literal(1), revision: uuid, workspaces: z.array(metaSchema), creationWindows: z.array(z.object({ key: z.string().max(100), count: z.number().int().min(0), until: z.number().int().min(0) }).strict()), requestWindows: z.array(z.object({ ownerId: z.string(), count: z.number().int().min(0), until: z.number().int().min(0) }).strict()), globalRequestQuota: z.object({ minute: z.number().int().min(0), minuteCount: z.number().int().min(0).max(1000), day: z.number().int().min(0), dayCount: z.number().int().min(0).max(10000) }).strict().refine(q => q.day === Math.floor(q.minute / 1440) && q.dayCount >= q.minuteCount).optional() }).strict();
const messageSchema = z.object({ messageId: workspaceIdentifierSchema, conversationId: workspaceIdentifierSchema, taskId: workspaceIdentifierSchema, actor: z.enum(["human", "agent"]), text: workspaceTextSchema, recordedAt: iso, operationId: workspaceIdentifierSchema.optional() }).strict();
const conversationSchema = z.object({ conversationId: workspaceIdentifierSchema, title: z.string().min(1).max(160), createdAt: iso, messages: z.array(messageSchema).max(500) }).strict();
const taskSchema = z.object({ taskId: workspaceIdentifierSchema, conversationId: workspaceIdentifierSchema, humanMessageId: workspaceIdentifierSchema, text: workspaceTextSchema, status: z.enum(["pending", "claimed", "responded", "uncertain"]), createdAt: iso, attemptId: workspaceIdentifierSchema.optional(), agentId: z.string().optional(), responseMessageId: workspaceIdentifierSchema.optional(), operationId: workspaceIdentifierSchema.optional() }).strict();
// Input schemas are strict; records add server metadata separately below.
const querySchema = z.object({requestId:uuid, tool:z.string().min(1).max(80), agentId:z.string(), wallet:walletAddressSchema.optional(), recordedAt:iso, outcome:z.enum(["ok","error"]), resultCount:z.number().int().nonnegative().optional(), inputHash:workspaceHashSchema, resultHash:workspaceHashSchema, evidence:z.literal("bazaar-observed")}).strict();
const replayMarkerSchema = z.object({ kind:z.enum(["query","conversation","task","message","operation","event"]), id:workspaceIdentifierSchema, digest:workspaceHashSchema, resultHash:workspaceHashSchema.optional() }).strict();
type ReplayMarker = z.infer<typeof replayMarkerSchema>;
const docSchema = z.object({ version: z.literal(1), ownerId: z.string(), revision: uuid, retentionDays:z.literal(7).optional(), replayMarkers:z.array(replayMarkerSchema).max(WORKSPACE_LIMITS.replayMarkers).optional(), queries:z.array(querySchema).max(100).optional(), conversations: z.array(z.object({ digest: workspaceHashSchema, record: conversationSchema }).strict()).max(100), tasks: z.array(z.object({ digest: workspaceHashSchema, claimDigest: workspaceHashSchema.optional(), responseDigest: workspaceHashSchema.optional(), record: taskSchema }).strict()).max(500), operations: z.array(z.object({ digest: workspaceHashSchema, record: z.unknown() }).strict()).max(1000), events: z.array(z.object({ digest: workspaceHashSchema, record: z.unknown() }).strict()).max(1000) }).strict();
type Registry = z.infer<typeof registrySchema>;
type Meta = z.infer<typeof metaSchema>;
const frozenUuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const frozenOwnerSchema = z.object({ creationId: frozenUuid, ownerUuid: frozenUuid, ownerId: z.string().regex(/^ow_[a-f0-9]{32}$/), hashes: z.object({ bootstrap: workspaceHashSchema, human: workspaceHashSchema, agent: workspaceHashSchema, rotatedHuman: workspaceHashSchema, rotatedAgent: workspaceHashSchema }).strict() }).strict();
const marketPermissionSchema = z.object({ version: z.literal(1), ownerId: z.string().regex(/^ow_[a-f0-9]{32}$/), agentId: z.string().regex(/^agent_[a-f0-9]{32}$/), generation: z.number().int().min(1), revision: z.number().int().min(1), allowServiceSubmission: z.boolean(), changeId: uuid, digest: workspaceHashSchema }).strict();
type FrozenOwner = z.infer<typeof frozenOwnerSchema>;
type Document = Omit<z.infer<typeof docSchema>, "operations" | "events"> & { operations: { digest: string; record: OperationHistoryRecord }[]; events: { digest: string; record: ActivityEvent }[] };
export type WorkspaceLegacyRegistry = { ownerIds: string[]; hashes: string[] };
export interface WorkspaceRedis { eval(script: string, keys: string[], args: string[]): Promise<unknown>;get?(key:string):Promise<unknown> }
export const READ_CONTINUOUS_WORKSPACE_STORAGE_LUA=`return redis.call('GET',KEYS[1])`;
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
// The old three-key script remains available to existing clients and fixtures.
// Continuous mode adds only an index to the same compare-and-set transaction.
export const COMMIT_CONTINUOUS_WORKSPACE_LUA = COMMIT_WORKSPACE_LUA.replace("return 1", "redis.call('SET', KEYS[4], ARGV[6])\nreturn 1");
export const READ_WORKSPACE_MAINTENANCE_LUA = `local clock=redis.call('TIME');return {redis.call('GET',KEYS[1]) or '',clock[1],clock[2]}`;
const maintenanceIndexSchema=z.object({version:z.literal(1),registryRevision:uuid,initialized:z.boolean(),nextExpiryAt:z.number().int().nonnegative().nullable()}).strict();
export type WorkspaceMaintenanceIndex={initialized:boolean;nextExpiryAt:number|null;observedAt:number;needsBootstrap:boolean};
const continuousWorkspaceMode=()=>process.env.BAZAAR_FREE_DEMO_MODE==='continuous';
function workspaceMaintenanceRaw(registryRaw:string):string {
 const registry=registrySchema.parse(JSON.parse(registryRaw));
 const initialized=registry.workspaces.every(meta=>meta.nextContentExpiryAt!==undefined);
 const due=registry.workspaces.flatMap(meta=>typeof meta.nextContentExpiryAt==='number'?[meta.nextContentExpiryAt]:[]);
 return JSON.stringify({version:1,registryRevision:registry.revision,initialized,nextExpiryAt:due.length?Math.min(...due):null});
}
const digest = (v: unknown) => createHash("sha256").update(canonicalOperationJson(v)).digest("hex");
const bytes = (v: string) => Buffer.byteLength(v, "utf8");
const emptyRegistry = (): Registry => ({ version: 1, revision: randomUUID(), workspaces: [], creationWindows: [], requestWindows: [] });
const emptyDocument = (ownerId: string): Document => ({ version: 1, ownerId, revision: randomUUID(), ...(demoEnabled()?{retentionDays:7 as const}:{}), conversations: [], tasks: [], operations: [], events: [] });
export const workspaceContentExpiresAt = (recordedAt: string) => Date.parse(recordedAt) + WORKSPACE_LIMITS.contentRetentionMs;
const liveContent = (recordedAt: string, now: number) => workspaceContentExpiresAt(recordedAt) > now;
const retentionActive = (d:Document) => demoEnabled() || d.retentionDays===7;
function replayMarker(d:Document,kind:ReplayMarker["kind"],id:string) { return d.replayMarkers?.find(m=>m.kind===kind&&m.id===id); }
function rememberReplay(d:Document,marker:ReplayMarker) {
  d.replayMarkers??=[]; const old=replayMarker(d,marker.kind,marker.id);
  if(old){if(old.digest!==marker.digest)throw unavailable("replay-marker-conflict");return;}
  if(d.replayMarkers.length>=WORKSPACE_LIMITS.replayMarkers)throw new WorkspaceError("WORKSPACE_CAPACITY",503);
  d.replayMarkers.push(marker);
}
function rejectExpiredReplay(d:Document,kind:ReplayMarker["kind"],id:string,inputHash?:string) {
  const marker=replayMarker(d,kind,id);if(!marker)return;
  const active=kind==="conversation"?d.conversations.some(c=>c.record.conversationId===id):kind==="task"?d.tasks.some(t=>t.record.taskId===id):kind==="message"?d.conversations.some(c=>c.record.messages.some(m=>m.messageId===id)):kind==="operation"?d.operations.some(o=>o.record.clientOperationId===id):kind==="event"?d.events.some(e=>e.record.eventId===id):d.queries?.some(q=>q.requestId===id);
  if(active)return; // Live records still perform their original digest comparison.
  if(inputHash!==undefined&&marker.digest!==inputHash)throw new WorkspaceError("WORKSPACE_CONFLICT",409);
  throw new WorkspaceError("WORKSPACE_CONTENT_EXPIRED",410);
}
/** Drop private content while keeping only bounded identifiers and fingerprints.
 * Marketplace payment records are held by another store and never pass here. */
function pruneDocument(d:Document,now:number):number {
  if(!retentionActive(d))return 0;
  d.retentionDays=7;let removed=0;
  d.queries=(d.queries??[]).filter(q=>{if(liveContent(q.recordedAt,now))return true;rememberReplay(d,{kind:"query",id:q.requestId,digest:digest({tool:q.tool,agentId:q.agentId,inputHash:q.inputHash}),resultHash:q.resultHash});removed++;return false;});
  const expiredConversations=new Set(d.conversations.filter(c=>!liveContent(c.record.createdAt,now)).map(c=>c.record.conversationId));
  const expiredTasks=new Set(d.tasks.filter(t=>expiredConversations.has(t.record.conversationId)||!liveContent(t.record.createdAt,now)).map(t=>t.record.taskId));
  d.tasks=d.tasks.filter(t=>{if(!expiredTasks.has(t.record.taskId))return true;rememberReplay(d,{kind:"task",id:t.record.taskId,digest:t.digest});removed++;return false;});
  d.conversations=d.conversations.filter(c=>{
    c.record.messages=c.record.messages.filter(m=>{if(!expiredTasks.has(m.taskId))return true;rememberReplay(d,{kind:"message",id:m.messageId,digest:digest({messageId:m.messageId,taskId:m.taskId})});removed++;return false;});
    if(!expiredConversations.has(c.record.conversationId))return true;
    rememberReplay(d,{kind:"conversation",id:c.record.conversationId,digest:c.digest});removed++;return false;
  });
  d.operations=d.operations.filter(o=>{if(liveContent(o.record.recordedAt,now))return true;rememberReplay(d,{kind:"operation",id:o.record.clientOperationId,digest:o.digest});removed++;return false;});
  d.events=d.events.filter(e=>{if(liveContent(e.record.recordedAt,now))return true;rememberReplay(d,{kind:"event",id:e.record.eventId,digest:e.digest});removed++;return false;});
  return removed;
}
/** Same timestamps as pruning, without reading content from the guardian. */
function documentNextExpiryAt(d:Document):number|null {
 if(!retentionActive(d))return null;
 const times=[...(d.queries??[]).map(q=>q.recordedAt),...d.conversations.map(c=>c.record.createdAt),...d.tasks.map(t=>t.record.createdAt),...d.operations.map(o=>o.record.recordedAt),...d.events.map(e=>e.record.recordedAt)].map(workspaceContentExpiresAt);
 if(times.some(t=>!Number.isSafeInteger(t)||t<0))throw unavailable('retention-index-timestamp');
 return times.length?Math.min(...times):null;
}
const unavailable = (phase = "store-unavailable") => { fileDiagnostics.publish({ phase, code: "UNAVAILABLE" }); return new WorkspaceError("WORKSPACE_UNAVAILABLE"); };
function consumeGlobalQuota(registry: Registry, now: number, limits: ReturnType<typeof workspaceGlobalRequestLimits>) {
  if (!limits) return;
  const minute = Math.floor(now / 60000), day = Math.floor(now / 86400000);
  const quota = registry.globalRequestQuota ?? { minute, minuteCount: 0, day, dayCount: 0 };
  if (quota.minute > minute || quota.day > day) throw unavailable("quota-clock-regression");
  if (quota.minute < minute) { quota.minute = minute; quota.minuteCount = 0; }
  if (quota.day < day) { quota.day = day; quota.dayCount = 0; }
  if (quota.minuteCount >= limits.minute || quota.dayCount >= limits.day) {
    const resetAt = Math.max(quota.minuteCount >= limits.minute ? (minute + 1) * 60000 : 0, quota.dayCount >= limits.day ? (day + 1) * 86400000 : 0);
    throw new WorkspaceError("WORKSPACE_RATE_LIMIT", 429, Math.max(1, Math.ceil((resetAt - now) / 1000)));
  }
  quota.minuteCount++; quota.dayCount++; registry.globalRequestQuota = quota;
}
function validateRegistry(raw: string, marker: string, legacy: WorkspaceLegacyRegistry): Registry {
  if (!raw) { if (marker) throw unavailable("registry-missing"); return emptyRegistry(); }
  if (marker !== "workspace-v1" || bytes(raw) > WORKSPACE_LIMITS.registryBytes) throw unavailable("registry-envelope");
  const registry = registrySchema.parse(JSON.parse(raw));
  const ids = new Set<string>(), hashes = new Set<string>(), wallets = new Set<string>();
  for (const m of registry.workspaces) {
    if(m.wallet && !m.revoked){if(wallets.has(m.wallet.wallet))throw unavailable("wallet-collision");wallets.add(m.wallet.wallet);}
    if(m.walletChallenge && (m.walletChallenge.ownerId!==m.ownerId || m.walletChallenge.agentId!==m.agentId))throw unavailable("wallet-challenge-binding");
    for (const id of [m.creationId, m.workspaceId, m.ownerId, m.agentId]) { if (ids.has(id) || legacy.ownerIds.includes(id)) throw unavailable("registry-identity"); ids.add(id); }
    const unique = new Set([m.bootstrapHash, m.initialHumanHash, m.initialAgentHash, m.humanHash, m.agentHash, ...m.retiredHashes].filter((h): h is string => h !== null));
    if (m.bootstrapHash === m.initialHumanHash || m.bootstrapHash === m.initialAgentHash || m.initialHumanHash === m.initialAgentHash || (m.humanHash && m.humanHash === m.agentHash) || m.bootstrapHash === m.humanHash || m.bootstrapHash === m.agentHash || (m.revoked ? !!(m.humanHash || m.agentHash) : !(m.humanHash && m.agentHash)) || new Set(m.retiredHashes).size !== m.retiredHashes.length || m.retiredHashes.includes(m.bootstrapHash) || (m.humanHash && m.retiredHashes.includes(m.humanHash)) || (m.agentHash && m.retiredHashes.includes(m.agentHash)) || m.retiredHashes.length !== m.generation - 1 + (m.revoked ? 1 : 0) || ![m.humanHash, ...m.retiredHashes].includes(m.initialHumanHash) || ![m.agentHash, ...m.retiredHashes].includes(m.initialAgentHash)) throw unavailable();
    if (m.accessIntents.length !== m.generation - 1 || m.accessIntents.some((intent, i) => intent.expectedGeneration !== i + 1 || intent.generation !== i + 2 || intent.revoked !== (m.revoked && i === m.accessIntents.length - 1))) throw unavailable("registry-intents");
    for (const hash of unique) { if (hashes.has(hash) || legacy.hashes.includes(hash)) throw unavailable("registry-hashes"); hashes.add(hash); }
  }
  const committedBytes = registry.workspaces.reduce((n, m) => n + m.documentBytes, bytes(raw));
  if (committedBytes > WORKSPACE_LIMITS.globalBytes) throw unavailable();
  // Permission documents are separate keys. Reserve their bounded possible size;
  // this metric is a projection, not a claim that every owner has granted access.
  recordOperationalStorageBounds({ workspace: { committedBytes, reservedBytes: registry.workspaces.length * 4096 } });
  return registry;
}
function validateDocument(raw: string, meta: Meta): Document {
  if (!raw) throw unavailable("owner-missing");
  if (bytes(raw) !== meta.documentBytes) throw unavailable("owner-size");
  const d = docSchema.parse(JSON.parse(raw)) as Document;
  if(d.queries?.some(q=>q.agentId!==meta.agentId)||new Set(d.queries?.map(q=>q.requestId)).size!==(d.queries?.length??0))throw unavailable("query-binding");
  if(new Set(d.replayMarkers?.map(m=>m.kind+":"+m.id)).size!==(d.replayMarkers?.length??0))throw unavailable("replay-marker-binding");
  if (d.ownerId !== meta.ownerId || d.revision !== meta.documentRevision) throw unavailable("owner-identity");
  const conversations = new Set<string>(), messages = new Set<string>(), tasks = new Set<string>(), operations = new Set<string>(), events = new Set<string>();
  const expiredOperations=new Set(d.replayMarkers?.filter(m=>m.kind==="operation").map(m=>m.id));
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
    if (input.operationId && !operations.has(input.operationId) && !expiredOperations.has(input.operationId)) throw unavailable(); events.add(input.eventId);
  }
  for (const t of d.tasks) {
    const r = t.record, c = d.conversations.find(c => c.record.conversationId === r.conversationId)?.record;
    const human = c?.messages.find(m => m.messageId === r.humanMessageId && m.actor === "human" && m.taskId === r.taskId && m.text === r.text);
    if (tasks.has(r.taskId) || !human || t.digest !== digest({ conversationId: r.conversationId, messageId: r.humanMessageId, taskId: r.taskId, text: r.text })) throw unavailable();
    if (r.status === "pending" ? !!(r.attemptId || r.agentId || t.claimDigest || t.responseDigest) : !r.attemptId || r.agentId !== meta.agentId || t.claimDigest !== digest({ taskId: r.taskId, attemptId: r.attemptId, agentId: r.agentId })) throw unavailable();
    if (r.status === "responded") {
      const response = c!.messages.find(m => m.messageId === r.responseMessageId && m.actor === "agent" && m.taskId === r.taskId);
      if (!response || response.operationId !== r.operationId || t.responseDigest !== digest({ taskId: r.taskId, attemptId: r.attemptId, messageId: response.messageId, text: response.text, operationId: response.operationId }) || (r.operationId && !operations.has(r.operationId) && !expiredOperations.has(r.operationId))) throw unavailable();
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
export type MarketCommitGuard = { keys: string[]; values: (string | null)[] };
type PermissionSnapshot = Snapshot & { permissionRaw: string | null; guard?: MarketCommitGuard };
interface Backend { read(ownerId?: string): Promise<Snapshot>; maintenanceIndex():Promise<WorkspaceMaintenanceIndex>; transact<T>(ownerId: string | undefined, callback: (snapshot: Snapshot, commit: (registry: string, document: string) => Promise<void>) => Promise<T>): Promise<T>; readPermission(ownerId: string): Promise<PermissionSnapshot>; transactPermission<T>(ownerId: string, callback: (snapshot: PermissionSnapshot, commit: (permission: string) => Promise<void>) => Promise<T>): Promise<T> }
export const READ_MARKET_PERMISSION_LUA = `return {redis.call('GET', KEYS[1]) or '', redis.call('GET', KEYS[2]) or '', redis.call('GET', KEYS[3]) or '', redis.call('GET', KEYS[4]) or ''}`;
export const COMMIT_MARKET_PERMISSION_LUA = `
if (redis.call('GET',KEYS[1]) or '') ~= ARGV[1] then return 0 end
if (redis.call('GET',KEYS[2]) or '') ~= ARGV[2] then return 0 end
if (redis.call('GET',KEYS[3]) or '') ~= ARGV[3] then return 0 end
if (redis.call('GET',KEYS[4]) or '') ~= ARGV[4] then return 0 end
redis.call('SET',KEYS[4],ARGV[5]); return 1`;
// Only this error proves the Lua comparison rejected a write before any effect.
class RedisCompareConflict extends WorkspaceError { constructor() { super("WORKSPACE_CONFLICT", 409); } }
function validatePrefix(prefix: string) { if (!/^bazaar-workspace:(local-test|preview|production|pilot-[a-f0-9]{32}|isolated-[a-f0-9]{32})$/.test(prefix)) throw unavailable(); return prefix; }
function redisBackend(redis: WorkspaceRedis, prefix: string, allowedOwners?: readonly string[]): Backend {
  validatePrefix(prefix);
  const tag = prefix.split(":")[1];
  const keys = (ownerId?: string) => {
    if (allowedOwners && ownerId !== undefined && !allowedOwners.includes(ownerId)) throw unavailable("owner-outside-isolated-plan");
    return [`${prefix}:{${tag}}:registry`, `${prefix}:{${tag}}:owner:${ownerId ?? "none"}`, `${prefix}:{${tag}}:initialized`];
  };
  const read = async (ownerId?: string): Promise<Snapshot> => {
    const result = await redis.eval(READ_WORKSPACE_LUA, keys(ownerId), []);
    if (!Array.isArray(result) || result.length !== 3 || !result.every(v => typeof v === "string")) throw unavailable();
    return { registryRaw: result[0], documentRaw: result[1], marker: result[2] };
  };
  const permissionKeys = (ownerId: string) => [...keys(ownerId), `${prefix}:{${tag}}:market-permissions:${ownerId}`];
  const maintenanceKey=`${prefix}:{${tag}}:maintenance`;
  const storageRedis={eval:redis.eval.bind(redis),get:(key:string)=>redis.get?redis.get(key):redis.eval(READ_CONTINUOUS_WORKSPACE_STORAGE_LUA,[key],[])};
  const maintenanceIndex=async():Promise<WorkspaceMaintenanceIndex>=>{
    const result=await redis.eval(READ_WORKSPACE_MAINTENANCE_LUA,[maintenanceKey],[]);
    if(!Array.isArray(result)||result.length!==3||result.some(v=>typeof v!=='string'))throw unavailable('maintenance-index-read');
    if(!/^\d+$/.test(result[1])||!/^\d{1,6}$/.test(result[2])||Number(result[2])>=1_000_000||Buffer.byteLength(result[0])>512)throw unavailable('maintenance-index-envelope');
    const observedAt=Number(result[1])*1000+Math.floor(Number(result[2])/1000);
    if(!Number.isSafeInteger(observedAt)||observedAt<0)throw unavailable('maintenance-index-clock');
    if(!result[0])return {initialized:false,nextExpiryAt:null,observedAt,needsBootstrap:true};
    const index=maintenanceIndexSchema.parse(JSON.parse(result[0]));
    return {initialized:index.initialized,nextExpiryAt:index.nextExpiryAt,observedAt,needsBootstrap:!index.initialized};
  };
  const readPermission = async (ownerId: string): Promise<PermissionSnapshot> => {
    const allKeys = permissionKeys(ownerId), result = await redis.eval(READ_MARKET_PERMISSION_LUA, allKeys, []);
    if (!Array.isArray(result) || result.length !== 4 || !result.every(v => typeof v === 'string')) throw unavailable();
    return { registryRaw: result[0], documentRaw: result[1], marker: result[2], permissionRaw: result[3] || null, guard: { keys: [allKeys[0], allKeys[3]], values: [result[0], result[3] || null] } };
  };
  return { read, readPermission, maintenanceIndex, async transactPermission(ownerId, callback) {
    const snapshot = await readPermission(ownerId);
    return callback(snapshot, async permission => {
      const baseKeys=permissionKeys(ownerId),baseArgs=[snapshot.registryRaw, snapshot.documentRaw, snapshot.marker, snapshot.permissionRaw ?? '', permission];
      const storage=await prepareContinuousStorageCommit(storageRedis,prefix,[{key:baseKeys[3],expectedRaw:snapshot.permissionRaw,nextRaw:permission}]);
      let script=COMMIT_MARKET_PERMISSION_LUA;
      if(storage){script=script.replace("redis.call('SET',KEYS[4],ARGV[5]);",storage.appendScript(5,6)+storage.writeScript(5)+"redis.call('SET',KEYS[4],ARGV[5]);");baseKeys.push(...storage.keys);baseArgs.push(...storage.args);}
      const result = await redis.eval(script, baseKeys, baseArgs);
      if (result === 0) throw new WorkspaceError('PERMISSION_CONFLICT', 409);
      if (result === -20) throw new WorkspaceError('FREE_DEMO_STORAGE_CONFLICT',409);
      if (result === -21) throw new WorkspaceError('FREE_DEMO_STORAGE_UNINITIALIZED',503);
      if (result === -22||result===-23) throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE',503);
      if (result === -24) throw new WorkspaceError('FREE_DEMO_STORAGE_CAPACITY',503);
      if (result !== 1) throw unavailable();
    });
  }, async transact(ownerId, callback) {
    const snapshot = await read(ownerId);
    return callback(snapshot, async (registry, document) => {
      const args=[snapshot.registryRaw, snapshot.documentRaw, snapshot.marker, registry, document];
      const continuous=continuousWorkspaceMode();
      const commitKeys=continuous?[...keys(ownerId),maintenanceKey]:keys(ownerId);
      let script=continuous?COMMIT_CONTINUOUS_WORKSPACE_LUA:COMMIT_WORKSPACE_LUA;
      if(continuous){
        const nextIndex=workspaceMaintenanceRaw(registry),oldIndex=await storageRedis.get(maintenanceKey);
        if(oldIndex!==null&&typeof oldIndex!=='string')throw unavailable('maintenance-index-envelope');
        args.push(nextIndex);
        const writes=[{key:commitKeys[0],expectedRaw:snapshot.registryRaw||null,nextRaw:registry},{key:commitKeys[2],expectedRaw:snapshot.marker||null,nextRaw:'workspace-v1'},{key:maintenanceKey,expectedRaw:oldIndex as string|null,nextRaw:nextIndex},...(document?[{key:commitKeys[1],expectedRaw:snapshot.documentRaw||null,nextRaw:document}]:[])];
        const storage=await prepareContinuousStorageCommit(storageRedis,prefix,writes);
        if(storage){script=script.replace("redis.call('SET', KEYS[1], ARGV[4])",storage.appendScript(5,7)+storage.writeScript(5)+"redis.call('SET', KEYS[1], ARGV[4])");commitKeys.push(...storage.keys);args.push(...storage.args);}
      }
      const result = await redis.eval(script, commitKeys, args);
      if (result === 0) throw new RedisCompareConflict();
      if (result === -20) throw new WorkspaceError('FREE_DEMO_STORAGE_CONFLICT',409);
      if (result === -21) throw new WorkspaceError('FREE_DEMO_STORAGE_UNINITIALIZED',503);
      if (result === -22||result===-23) throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE',503);
      if (result === -24) throw new WorkspaceError('FREE_DEMO_STORAGE_CAPACITY',503);
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
  const paths = (ownerId?: string) => ({ registry: join(root, "registry.json"), document: join(root, ownerId ? `owner-${ownerId}.json` : "unused.json"), permission: join(root, `market-permissions-${ownerId}.json`), maintenance:join(root,'maintenance.json'), marker: join(root, "initialized"), pending: join(root, "pending.json"), lock: join(root, "lock") });
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
  const permissionSnapshot = async (p: ReturnType<typeof paths>): Promise<PermissionSnapshot> => ({ ...await snapshot(p), permissionRaw: await optionalRead(p.permission) || null });
  const maintenanceIndex=()=>locked(undefined,async p=>{
    const raw=await optionalRead(p.maintenance),observedAt=Date.now();
    if(!raw)return {initialized:false,nextExpiryAt:null,observedAt,needsBootstrap:true};
    const index=maintenanceIndexSchema.parse(JSON.parse(raw));
    return {initialized:index.initialized,nextExpiryAt:index.nextExpiryAt,observedAt,needsBootstrap:!index.initialized};
  });
  return { read: ownerId => locked(ownerId, snapshot), readPermission: ownerId => locked(ownerId, permissionSnapshot), maintenanceIndex, transactPermission: (ownerId, callback) => locked(ownerId, async p => callback(await permissionSnapshot(p), async permission => { await atomicWrite(p.permission, permission, 'write-market-permission'); })), transact: (ownerId, callback) => locked(ownerId, async p => callback(await snapshot(p), async (registry, document) => {
    await atomicWrite(p.pending, JSON.stringify({ transaction: randomUUID() }), "write-pending");
    if (document) await atomicWrite(p.document, document, "write-owner");
    await atomicWrite(p.registry, registry, "write-registry");
    if(continuousWorkspaceMode())await atomicWrite(p.maintenance,workspaceMaintenanceRaw(registry),'write-maintenance');
    await atomicWrite(p.marker, "workspace-v1", "write-marker"); try { await unlink(p.pending); } catch (e) { fileFailure("clear-pending-after-commit", e); throw e; }
  })) };
}
function buildStore(backend: Backend, reservations: () => WorkspaceLegacyRegistry = legacyHistoryReservations, principal?: WorkspacePrincipal, testOwnerUuid?: (creationId: string) => string, frozenOwners?: readonly FrozenOwner[]) {
  const safe = async <T>(fn: () => Promise<T>): Promise<T> => { try { return await fn(); } catch (e) { if (e instanceof WorkspaceError) throw e; fileDiagnostics.publish({ phase: "store-unexpected", code: e instanceof z.ZodError ? "SCHEMA" : e instanceof SyntaxError ? "JSON" : "UNKNOWN" }); throw unavailable(); } };
  const readRegistry = (raw: string, marker: string, legacy: WorkspaceLegacyRegistry) => {
    const registry = validateRegistry(raw, marker, legacy);
    if (frozenOwners) for (const meta of registry.workspaces) {
      const frozen = frozenOwners.find(owner => owner.creationId === meta.creationId);
      if (!frozen || meta.ownerId !== frozen.ownerId || meta.bootstrapHash !== frozen.hashes.bootstrap || meta.initialHumanHash !== frozen.hashes.human || meta.initialAgentHash !== frozen.hashes.agent ||
          ![null, frozen.hashes.human, frozen.hashes.rotatedHuman].includes(meta.humanHash) || ![null, frozen.hashes.agent, frozen.hashes.rotatedAgent].includes(meta.agentHash) ||
          meta.retiredHashes.some(hash => ![frozen.hashes.human, frozen.hashes.agent, frozen.hashes.rotatedHuman, frozen.hashes.rotatedAgent].includes(hash))) throw unavailable("identity-outside-isolated-plan");
    }
    return registry;
  };
  function authorized(meta: Meta, role?: WorkspaceRole) {
    if (meta.revoked && role !== "bootstrap") throw new WorkspaceError("WORKSPACE_REVOKED", 401);
    if (principal && (meta.ownerId !== principal.ownerId || meta.workspaceId !== principal.workspaceId || meta.generation !== principal.generation || meta.agentId !== principal.agentId)) throw new WorkspaceError("UNAUTHORIZED", 401);
    if (principal && (role ? principal.role !== role : principal.role === "bootstrap")) throw new WorkspaceError("FORBIDDEN", 403);
  }
  const readOwner = (ownerId: string, role?: WorkspaceRole) => safe(async () => {
    if (!/^ow_[a-f0-9]{32}$/.test(ownerId)) throw unavailable();
    const s = await backend.read(ownerId), registry = readRegistry(s.registryRaw, s.marker, reservations());
    const meta = registry.workspaces.find(m => m.ownerId === ownerId); if (!meta) throw new WorkspaceError("NOT_FOUND", 404);
    authorized(meta, role); const document=validateDocument(s.documentRaw, meta);pruneDocument(document,Date.now());return { registry, meta, document };
  });
  const mutateOwner = <T>(ownerId: string, role: WorkspaceRole | undefined, fn: (d: Document, meta: Meta) => T, implicitPrune=true) => safe(() => {
    if (!/^ow_[a-f0-9]{32}$/.test(ownerId)) throw unavailable();
    return backend.transact(ownerId, async (s, commit) => {
    const registry = readRegistry(s.registryRaw, s.marker, reservations()), meta = registry.workspaces.find(m => m.ownerId === ownerId); if (!meta) throw new WorkspaceError("NOT_FOUND", 404);
    authorized(meta, role); const d = validateDocument(s.documentRaw, meta), before = JSON.stringify(d);if(implicitPrune)pruneDocument(d,Date.now());const result = fn(d, meta);
    const documentChanged=JSON.stringify(d)!==before,needsIndex=continuousWorkspaceMode()&&meta.nextContentExpiryAt===undefined;
    if (documentChanged||needsIndex) {
      if(documentChanged)d.revision = randomUUID(); const raw = JSON.stringify(d); if (bytes(raw) > WORKSPACE_LIMITS.ownerBytes) throw new WorkspaceError("WORKSPACE_CAPACITY", retentionActive(d)?503:409);
      meta.documentRevision = d.revision; meta.documentBytes = bytes(raw); registry.revision = randomUUID();
      if(continuousWorkspaceMode())meta.nextContentExpiryAt=documentNextExpiryAt(d);
      const indexedReg=JSON.stringify(registry);
      if (bytes(indexedReg) > WORKSPACE_LIMITS.registryBytes || registry.workspaces.reduce((n, m) => n + m.documentBytes, bytes(indexedReg)) > WORKSPACE_LIMITS.globalBytes) throw new WorkspaceError("WORKSPACE_CAPACITY", retentionActive(d)?503:409);
      validateDocument(raw, meta); readRegistry(indexedReg, "workspace-v1", reservations()); await commit(indexedReg, documentChanged?raw:'');
    }
    return result;
  }); });
  const walletTransaction = <T>(p:WorkspacePrincipal, fn:(registry:Registry,meta:Meta)=>T) => safe(()=>backend.transact(p.ownerId,async(s,commit)=>{
    const registry=readRegistry(s.registryRaw,s.marker,reservations()),meta=registry.workspaces.find(m=>m.ownerId===p.ownerId);
    if(!meta||meta.revoked||meta.workspaceId!==p.workspaceId||meta.agentId!==p.agentId||meta.generation!==p.generation)throw new WorkspaceError("UNAUTHORIZED",401);
    validateDocument(s.documentRaw,meta);const value=fn(registry,meta);registry.revision=randomUUID();const raw=JSON.stringify(registry);
    if(bytes(raw)>WORKSPACE_LIMITS.registryBytes||registry.workspaces.reduce((n,m)=>n+m.documentBytes,bytes(raw))>WORKSPACE_LIMITS.globalBytes)throw new WorkspaceError("WORKSPACE_CAPACITY",503);
    readRegistry(raw,"workspace-v1",reservations());await commit(raw,"");return value;
  }));
  const store = {
    async maintenanceIndex():Promise<WorkspaceMaintenanceIndex>{return safe(async()=>{
      if(principal)throw new WorkspaceError('FORBIDDEN',403);
      return backend.maintenanceIndex();
    });},
    async bootstrapMaintenanceIndex(limit=20,deadline=Date.now()+30000){return safe(async()=>{
      if(principal)throw new WorkspaceError('FORBIDDEN',403);
      if(!continuousWorkspaceMode()||!Number.isInteger(limit)||limit<1||limit>20||!Number.isSafeInteger(deadline)||deadline<0)throw new WorkspaceError('INVALID_REQUEST',400);
      const snapshot=await backend.read(),registry=readRegistry(snapshot.registryRaw,snapshot.marker,reservations());
      const owners=registry.workspaces.filter(m=>m.nextContentExpiryAt===undefined).slice(0,limit).map(m=>m.ownerId);
      let processed=0;
      for(const ownerId of owners){if(Date.now()>=deadline)break;await backend.transact(ownerId,async(s,commit)=>{
        const current=readRegistry(s.registryRaw,s.marker,reservations()),meta=current.workspaces.find(m=>m.ownerId===ownerId);
        if(!meta)throw unavailable('maintenance-bootstrap-owner');
        if(meta.nextContentExpiryAt!==undefined)return;
        meta.nextContentExpiryAt=documentNextExpiryAt(validateDocument(s.documentRaw,meta));
        current.revision=randomUUID();const raw=JSON.stringify(current);readRegistry(raw,'workspace-v1',reservations());
        // No content replacement, no replay after an uncertain acknowledgement.
        await commit(raw,'');processed++;
      });}
      if(!owners.length&&Date.now()<deadline)await backend.transact(undefined,async(s,commit)=>{
        const current=readRegistry(s.registryRaw,s.marker,reservations());current.revision=randomUUID();const raw=JSON.stringify(current);
        readRegistry(raw,'workspace-v1',reservations());await commit(raw,'');
      });
      return {processed,...await backend.maintenanceIndex()};
    });},
    async retentionOwnerIds(now?:number):Promise<string[]> {return safe(async()=>{
      if(now!==undefined&&(!Number.isSafeInteger(now)||now<0))throw new WorkspaceError('INVALID_REQUEST',400);
      const s=await backend.read(),registry=readRegistry(s.registryRaw,s.marker,reservations());
      if(principal){const m=registry.workspaces.find(m=>m.ownerId===principal.ownerId);if(!m)throw new WorkspaceError("UNAUTHORIZED",401);authorized(m,principal.role);return [m.ownerId];}
      return registry.workspaces.filter(m=>!continuousWorkspaceMode()||now===undefined||m.nextContentExpiryAt===undefined||m.nextContentExpiryAt!==null&&m.nextContentExpiryAt<=now).map(m=>m.ownerId);
    });},
    async pruneExpiredContent(ownerId:string,now=Date.now()) {
      if(!Number.isSafeInteger(now)||now<0)throw new WorkspaceError("INVALID_REQUEST",400);
      // A scoped client cannot choose a future clock and erase fresh content.
      if(principal&&now>Date.now())throw new WorkspaceError("FORBIDDEN",403);
      return mutateOwner(ownerId,principal?.role??"bootstrap",d=>{const removed=pruneDocument(d,now);return {ownerId,removed,retentionDays:7};},false);
    },
    async walletIdentity(p:WorkspacePrincipal) {return safe(async()=>{
      const s=await backend.readPermission(p.ownerId),registry=readRegistry(s.registryRaw,s.marker,reservations()),meta=registry.workspaces.find(m=>m.ownerId===p.ownerId);
      if(!meta||meta.revoked||meta.workspaceId!==p.workspaceId||meta.agentId!==p.agentId||meta.generation!==p.generation)throw new WorkspaceError("UNAUTHORIZED",401);
      validateDocument(s.documentRaw,meta);
      return {identity:{ownerId:meta.ownerId,workspaceId:meta.workspaceId,agentId:meta.agentId,generation:meta.generation,wallet:meta.wallet??null,network:"stellar:testnet" as const,emailRequired:false},guard:s.guard};
    });},
    async walletChallenge(p:WorkspacePrincipal,wallet:string,origin:string) {
      walletAddressSchema.parse(wallet);const u=new URL(origin);if(u.origin!==origin||(!["127.0.0.1","localhost"].includes(u.hostname)&&u.protocol!=="https:"))throw new WorkspaceError("INVALID_REQUEST",400);
      return walletTransaction(p,(_registry,meta)=>{
        if(meta.wallet && p.role!=="bootstrap")throw new WorkspaceError("WALLET_RECOVERY_REQUIRED",403);
        const challenge:WalletChallenge={challengeId:randomUUID(),ownerId:meta.ownerId,agentId:meta.agentId,generation:meta.generation,wallet,origin,network:"stellar:testnet",nonce:randomBytes(32).toString("hex"),expiresAt:Date.now()+300000};
        meta.walletChallenge=challenge;return {challengeId:challenge.challengeId,wallet,network:challenge.network,message:walletMessage(challenge),expiresAt:challenge.expiresAt};
      });
    },
    async readWalletChallenge(p:WorkspacePrincipal,id:string,origin:string) {
      const {registry}=await readOwner(p.ownerId,p.role);const challenge=registry.workspaces.find(m=>m.ownerId===p.ownerId)?.walletChallenge;
      if(!challenge||challenge.challengeId!==id||challenge.origin!==origin||challenge.generation!==p.generation)throw new WorkspaceError("WALLET_CHALLENGE_INVALID",409);
      if(challenge.expiresAt<=Date.now())throw new WorkspaceError("WALLET_CHALLENGE_EXPIRED",409);
      return challenge;
    },
    async bindWallet(p:WorkspacePrincipal,id:string,origin:string,signature:string) {
      return walletTransaction(p,(registry,meta)=>{
        const c=meta.walletChallenge;
        if(!c||c.challengeId!==id||c.origin!==origin||c.generation!==p.generation)throw new WorkspaceError("WALLET_CHALLENGE_INVALID",409);
        if(c.expiresAt<=Date.now())throw new WorkspaceError("WALLET_CHALLENGE_EXPIRED",409);
        if(meta.wallet&&p.role!=="bootstrap")throw new WorkspaceError("WALLET_RECOVERY_REQUIRED",403);
        verifyWalletProof(c,signature);
        if(registry.workspaces.some(m=>m.ownerId!==p.ownerId&&!m.revoked&&m.wallet?.wallet===c.wallet))throw new WorkspaceError("WALLET_ALREADY_BOUND",409);
        meta.wallet={wallet:c.wallet,network:"stellar:testnet",verifiedAt:new Date(Date.now()).toISOString(),challengeId:c.challengeId};delete meta.walletChallenge;
        return {wallet:meta.wallet};
      });
    },
    async recordQuery(ownerId:string,input:z.infer<typeof querySchema>) {
      const parsed=querySchema.parse(input);return mutateOwner(ownerId,undefined,(d,m)=>{
        if(parsed.agentId!==m.agentId)throw new WorkspaceError("FORBIDDEN",403);
        const inputFingerprint=digest({tool:parsed.tool,agentId:parsed.agentId,inputHash:parsed.inputHash}),marker=replayMarker(d,"query",parsed.requestId);
        if(marker){if(marker.digest!==inputFingerprint)throw new WorkspaceError("QUERY_CONFLICT",409);return;}
        d.queries??=[];const old=d.queries.find(q=>q.requestId===parsed.requestId);
        if(old){if(old.tool!==parsed.tool||old.agentId!==parsed.agentId||old.inputHash!==parsed.inputHash)throw new WorkspaceError("QUERY_CONFLICT",409);return;}
        // Reserve the marker with content admission: its eventual expiration can
        // never need extra replay slots when the bounded history is already full.
        if(retentionActive(d))rememberReplay(d,{kind:"query",id:parsed.requestId,digest:inputFingerprint,resultHash:parsed.resultHash});
        d.queries.unshift({...parsed,recordedAt:new Date(Date.now()).toISOString()});
        if(retentionActive(d))for(const evicted of d.queries.slice(100))rememberReplay(d,{kind:"query",id:evicted.requestId,digest:digest({tool:evicted.tool,agentId:evicted.agentId,inputHash:evicted.inputHash}),resultHash:evicted.resultHash});
        d.queries=d.queries.slice(0,100);
      });
    },
    async queries(ownerId:string) {return (await readOwner(ownerId)).document.queries??[];},
    async consumeIngress(ip:string) {return safe(async()=>{
      const attempts=continuousWorkspaceMode()||process.env.BAZAAR_ACCEPTANCE_METER==='true'&&process.env.BAZAAR_ACCEPTANCE_X402==='true'?1:8;
      for(let attempt=0;attempt<attempts;attempt++)try{
        await backend.transact(undefined,async(s,commit)=>{
          const registry=readRegistry(s.registryRaw,s.marker,reservations()),now=Date.now(),minute=Math.floor(now/60000);
          registry.creationWindows=registry.creationWindows.filter(w=>w.until>now);
          for(const spec of [{key:"ingress:global:"+minute,max:WORKSPACE_LIMITS.demoIngressPerMinute},{key:"ingress:ip:"+digest(ip)+":"+minute,max:WORKSPACE_LIMITS.demoIngressPerMinute}]){
            let w=registry.creationWindows.find(w=>w.key===spec.key);if(w&&w.count>=spec.max)throw new WorkspaceError("DEMO_RATE_LIMIT",429,Math.max(1,Math.ceil(((minute+1)*60000-now)/1000)));
            if(!w){w={key:spec.key,count:0,until:(minute+1)*60000};registry.creationWindows.push(w);}w.count++;
          }
          registry.revision=randomUUID();const raw=JSON.stringify(registry);readRegistry(raw,"workspace-v1",reservations());await commit(raw,"");
        });return;
      }catch(e){if(!(e instanceof RedisCompareConflict))throw e;}
      throw unavailable("ingress-contention");
    });},
    async activeOwnerIds(ownerIds: readonly string[]): Promise<Set<string>> { return safe(async () => {
      const s = await backend.read(), registry = readRegistry(s.registryRaw, s.marker, reservations()), wanted = new Set(ownerIds);
      return new Set(registry.workspaces.filter(m => wanted.has(m.ownerId) && !m.revoked).map(m => m.ownerId));
    }); },
    async readMarketPermissionSnapshot(p: WorkspacePrincipal) { return safe(async () => {
      if (p.role !== 'human' && p.role !== 'agent') throw new WorkspaceError('FORBIDDEN', 403);
      const s = await backend.readPermission(p.ownerId), registry = readRegistry(s.registryRaw, s.marker, reservations());
      const meta = registry.workspaces.find(m => m.ownerId === p.ownerId);
      if (!meta || meta.revoked || meta.generation !== p.generation || meta.workspaceId !== p.workspaceId || meta.agentId !== p.agentId) throw new WorkspaceError('UNAUTHORIZED', 401);
      validateDocument(s.documentRaw, meta);
      if (s.permissionRaw && bytes(s.permissionRaw) > 4096) throw unavailable('permission-envelope');
      const permission = s.permissionRaw ? marketPermissionSchema.parse(JSON.parse(s.permissionRaw)) : undefined;
      if (permission && (permission.ownerId !== meta.ownerId || permission.agentId !== meta.agentId || permission.generation > meta.generation)) throw unavailable('permission-binding');
      return { permission: { permission: 'market:submit' as const, revision: permission?.revision ?? 0, generation: meta.generation, allowServiceSubmission: permission?.generation === meta.generation && permission.allowServiceSubmission }, guard: s.guard };
    }); },
    async changeMarketPermissions(p: WorkspacePrincipal, input: z.infer<typeof marketPermissionChangeSchema>) { return safe(async () => {
      if (p.role !== 'human') throw new WorkspaceError('FORBIDDEN', 403);
      const parsed = marketPermissionChangeSchema.parse(input);
      return backend.transactPermission(p.ownerId, async (s, commit) => {
        const registry = readRegistry(s.registryRaw, s.marker, reservations()), meta = registry.workspaces.find(m => m.ownerId === p.ownerId);
        if (!meta || meta.revoked || meta.generation !== p.generation || meta.workspaceId !== p.workspaceId || meta.agentId !== p.agentId) throw new WorkspaceError('UNAUTHORIZED', 401);
        validateDocument(s.documentRaw, meta);
        if (s.permissionRaw && bytes(s.permissionRaw) > 4096) throw unavailable('permission-envelope');
        const old = s.permissionRaw ? marketPermissionSchema.parse(JSON.parse(s.permissionRaw)) : undefined;
        if (old && (old.ownerId !== p.ownerId || old.agentId !== p.agentId || old.generation > p.generation)) throw unavailable('permission-binding');
        const intent = digest({ ...parsed, ownerId: meta.ownerId, agentId: meta.agentId, generation: meta.generation });
        if (old?.changeId === parsed.changeId) {
          if (old.digest !== intent) throw new WorkspaceError('PERMISSION_CONFLICT', 409);
          return { permission: { permission: 'market:submit' as const, revision: old.revision, generation: meta.generation, allowServiceSubmission: old.allowServiceSubmission }, created: false };
        }
        if (parsed.expectedRevision !== (old?.revision ?? 0)) throw new WorkspaceError('PERMISSION_CONFLICT', 409);
        const next = { version: 1 as const, ownerId: meta.ownerId, agentId: meta.agentId, generation: meta.generation, revision: parsed.expectedRevision + 1, allowServiceSubmission: parsed.allowServiceSubmission, changeId: parsed.changeId, digest: intent };
        const raw = JSON.stringify(next); if (bytes(raw) > 4096) throw new WorkspaceError('WORKSPACE_CAPACITY', 409);
        marketPermissionSchema.parse(next); await commit(raw);
        return { permission: { permission: 'market:submit' as const, revision: next.revision, generation: meta.generation, allowServiceSubmission: next.allowServiceSubmission }, created: true };
      });
    }); },
    async isOwnerActive(ownerId: string): Promise<boolean> { return safe(async () => {
      const s = await backend.read(), registry = readRegistry(s.registryRaw, s.marker, reservations());
      return registry.workspaces.some(m => m.ownerId === ownerId && !m.revoked);
    }); },
    forPrincipal(p: WorkspacePrincipal) { return buildStore(backend, reservations, p, testOwnerUuid, frozenOwners); },
    async resolveHash(hash: string): Promise<WorkspacePrincipal> { return safe(async () => {
      workspaceHashSchema.parse(hash); const s = await backend.read(); const registry = readRegistry(s.registryRaw, s.marker, reservations());
      for (const m of registry.workspaces) {
        const role: WorkspaceRole | undefined = hash === m.bootstrapHash ? "bootstrap" : hash === m.humanHash ? "human" : hash === m.agentHash ? "agent" : undefined;
        if (role && (!m.revoked || role === "bootstrap")) return { ownerId: m.ownerId, workspaceId: m.workspaceId, agentId: m.agentId, generation: m.generation, role };
      }
      throw new WorkspaceError("UNAUTHORIZED", 401);
    }); },
    async createWorkspace(input: z.infer<typeof createWorkspaceSchema>, bootstrapHash: string, trustedIp = "untrusted", allowNew = true) { return safe(async () => {
      const globalLimits = workspaceGlobalRequestLimits();
      createWorkspaceSchema.parse(input); workspaceHashSchema.parse(bootstrapHash);
      const frozen = frozenOwners?.find(owner => owner.creationId === input.creationId);
      // The server freezes ownership and the whole creation intent before any
      // Redis read. Neither request fields nor an unrecognized creation choose keys.
      if (frozenOwners) {
        if (!frozen || frozen.hashes.bootstrap !== bootstrapHash) throw new WorkspaceError("UNAUTHORIZED", 401);
        if (frozen.hashes.human !== input.humanAccessHash || frozen.hashes.agent !== input.agentAccessHash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409);
      }
      const initial = await backend.read(), initialRegistry = readRegistry(initial.registryRaw, initial.marker, reservations());
      const ownerId = initialRegistry.workspaces.find(m => m.creationId === input.creationId)?.ownerId ?? frozen?.ownerId ?? "ow_" + uuid.parse(testOwnerUuid ? testOwnerUuid(input.creationId) : randomUUID()).replaceAll("-", "");
      const authenticateReplay = (existing: Meta) => {
        if (existing.bootstrapHash !== bootstrapHash) throw new WorkspaceError("UNAUTHORIZED", 401);
        if (existing.initialHumanHash !== input.humanAccessHash || existing.initialAgentHash !== input.agentAccessHash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409);
      };
      type CreationResult = { rebindOwnerId: string } | { record: ReturnType<typeof receipt>; created: boolean };
      let result: CreationResult;
      try { result = await backend.transact<CreationResult>(ownerId, async (s, commit) => {
        const legacy = reservations(), registry = readRegistry(s.registryRaw, s.marker, legacy), existing = registry.workspaces.find(m => m.creationId === input.creationId);
        if (existing) {
          authenticateReplay(existing);
          // Another creator may have committed after our initial registry read.
          // Bind one fresh read to its stable owner before returning a receipt.
          if (existing.ownerId !== ownerId) return { rebindOwnerId: existing.ownerId };
          validateDocument(s.documentRaw, existing);
          return { record: receipt(existing), created: false };
        }
        if (!allowNew) throw new WorkspaceError("ADMISSIONS_PAUSED");
        const hashes = [bootstrapHash, input.humanAccessHash, input.agentAccessHash];
        if (new Set(hashes).size !== 3 || hashes.some(h => legacy.hashes.includes(h) || registry.workspaces.some(m => [m.bootstrapHash, m.initialHumanHash, m.initialAgentHash, m.humanHash, m.agentHash, ...m.retiredHashes].includes(h)))) throw new WorkspaceError("WORKSPACE_COLLISION", 409);
        if (legacy.ownerIds.includes(ownerId) || s.documentRaw) throw new WorkspaceError("WORKSPACE_COLLISION", 409);
        const now = Date.now(); consumeGlobalQuota(registry, now, globalLimits); registry.creationWindows = registry.creationWindows.filter(w => w.until > now);
        if (globalLimits) {
          registry.requestWindows = registry.requestWindows.filter(w => w.until > now);
          registry.requestWindows.push({ ownerId, count: 1, until: now + 60000 });
        }
        const windows = [{ key: "global:" + Math.floor(now / 86400000), until: (Math.floor(now / 86400000) + 1) * 86400000, max: demoEnabled()?WORKSPACE_LIMITS.demoDailyCreations:WORKSPACE_LIMITS.dailyCreations }, { key: "ip:" + digest(trustedIp) + ":" + Math.floor(now / 3600000), until: (Math.floor(now / 3600000) + 1) * 3600000, max: demoEnabled()?WORKSPACE_LIMITS.demoHourlyCreationsPerIp:WORKSPACE_LIMITS.hourlyCreationsPerIp }];
        for (const w of windows) { let old = registry.creationWindows.find(v => v.key === w.key); if (old && old.count >= w.max) throw new WorkspaceError("WORKSPACE_RATE_LIMIT", 429,Math.max(1,Math.ceil((w.until-now)/1000))); if (!old) { old = { key: w.key, count: 0, until: w.until }; registry.creationWindows.push(old); } old.count++; }
        const d = emptyDocument(ownerId), raw = JSON.stringify(d);
        const meta: Meta = { creationId: input.creationId, workspaceId: randomUUID(), ownerId, agentId: "agent_" + randomUUID().replaceAll("-", ""), bootstrapHash, initialHumanHash: input.humanAccessHash, initialAgentHash: input.agentAccessHash, humanHash: input.humanAccessHash, agentHash: input.agentAccessHash, retiredHashes: [], accessIntents: [], generation: 1, revoked: false, createdAt: new Date(Date.now()).toISOString(), documentRevision: d.revision, documentBytes: bytes(raw) };
        if(continuousWorkspaceMode())meta.nextContentExpiryAt=documentNextExpiryAt(d);
        registry.workspaces.push(meta); registry.revision = randomUUID(); const reg = JSON.stringify(registry); readRegistry(reg, "workspace-v1", legacy); await commit(reg, raw); return { record: receipt(meta), created: true };
      }); } catch (e) {
        if (!(e instanceof RedisCompareConflict)) throw e;
        // CAS0 is a definite no-write outcome. Reconcile only a committed match;
        // do not retry creation when another intent changed the global registry.
        const current = await backend.read(), registry = readRegistry(current.registryRaw, current.marker, reservations());
        const existing = registry.workspaces.find(m => m.creationId === input.creationId);
        if (!existing) throw unavailable("creation-contention");
        authenticateReplay(existing); result = { rebindOwnerId: existing.ownerId };
      }
      if (!("rebindOwnerId" in result)) return result;
      return backend.transact(result.rebindOwnerId, async s => {
        const registry = readRegistry(s.registryRaw, s.marker, reservations()), existing = registry.workspaces.find(m => m.creationId === input.creationId);
        if (!existing || existing.ownerId !== result.rebindOwnerId) throw unavailable("creation-owner-rebind");
        authenticateReplay(existing); validateDocument(s.documentRaw, existing);
        return { record: receipt(existing), created: false };
      });
    }); },
    async changeAccess(workspaceId: string, bootstrapHash: string, input: z.infer<typeof workspaceAccessSchema>) { return safe(async () => {
      const first = await backend.read(), firstRegistry = readRegistry(first.registryRaw, first.marker, reservations());
      const owner = firstRegistry.workspaces.find(m => m.workspaceId === workspaceId && m.bootstrapHash === bootstrapHash)?.ownerId;
      if (!owner) throw new WorkspaceError("UNAUTHORIZED", 401);
      return backend.transact(owner, async (s, commit) => {
      workspaceAccessSchema.parse(input); const registry = readRegistry(s.registryRaw, s.marker, reservations()), meta = registry.workspaces.find(m => m.workspaceId === workspaceId);
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
      meta.generation++; meta.accessIntents.push({ expectedGeneration: input.expectedGeneration, digest: intentDigest, generation: meta.generation, revoked: meta.revoked }); registry.revision = randomUUID(); const reg = JSON.stringify(registry); if (bytes(reg) > WORKSPACE_LIMITS.registryBytes) throw new WorkspaceError("WORKSPACE_CAPACITY", 409); readRegistry(reg, "workspace-v1", reservations()); await commit(reg, ""); return { record: receipt(meta), current: { generation: meta.generation, revoked: meta.revoked }, created: true };
    }); }); },
    async consumeRequest(ownerId: string, generation: number, bootstrapHash?: string) { return safe(async () => {
      const globalLimits = workspaceGlobalRequestLimits();
      // Acceptance v2 budgets one quota CAS; contention stops before any action.
      // Outside that measured sprint, only a definite CAS0 permits counter retry.
      // Every attempt reads and validates current identity, document and quota.
      const attempts = continuousWorkspaceMode() || process.env.BAZAAR_ACCEPTANCE_METER === 'true' && process.env.BAZAAR_ACCEPTANCE_X402 === 'true' ? 1 : 8;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try { await backend.transact(ownerId, async (s, commit) => {
          const registry = readRegistry(s.registryRaw, s.marker, reservations()), meta = registry.workspaces.find(m => m.ownerId === ownerId);
          if (!meta) throw new WorkspaceError("UNAUTHORIZED", 401);
          const administration = bootstrapHash !== undefined && bootstrapHash === meta.bootstrapHash;
          if ((bootstrapHash !== undefined && !administration) || (!administration && (meta.generation !== generation || meta.revoked))) throw new WorkspaceError("UNAUTHORIZED", 401);
          validateDocument(s.documentRaw, meta);
          const now = Date.now();
          consumeGlobalQuota(registry, now, globalLimits);
          registry.requestWindows = registry.requestWindows.filter(w => w.until > now); let w = registry.requestWindows.find(w => w.ownerId === ownerId);
          if (!w) { w = { ownerId, count: 0, until: now + 60000 }; registry.requestWindows.push(w); }
          if (w.count >= (demoEnabled()?WORKSPACE_LIMITS.demoRequestsPerMinute:WORKSPACE_LIMITS.requestsPerMinute)) throw new WorkspaceError("WORKSPACE_RATE_LIMIT", 429,Math.max(1,Math.ceil((w.until-now)/1000)));
          w.count++; registry.revision = randomUUID(); const reg = JSON.stringify(registry); readRegistry(reg, "workspace-v1", reservations()); await commit(reg, "");
        }); return; }
        catch (e) { if (!(e instanceof RedisCompareConflict)) throw e; }
      }
      throw unavailable("quota-contention");
    }); },
    async listConversations(ownerId: string): Promise<WorkspaceConversation[]> { const { document: d } = await readOwner(ownerId); return d.conversations.map(v => ({ ...v.record, tasks: d.tasks.filter(t => t.record.conversationId === v.record.conversationId).map(t => t.record) })); },
    async getConversation(ownerId: string, id: string): Promise<WorkspaceConversation | null> { workspaceIdentifierSchema.parse(id); const { document: d } = await readOwner(ownerId); const c = d.conversations.find(v => v.record.conversationId === id)?.record; return c ? { ...c, tasks: d.tasks.filter(t => t.record.conversationId === id).map(t => t.record) } : null; },
    async createConversation(ownerId: string, input: { conversationId: string; title: string }) {
      const parsed = z.object({ conversationId: workspaceIdentifierSchema, title: z.string().min(1).max(160).refine(v => v.trim().length > 0 && !/[\u0000-\u001f]/.test(v)) }).strict().parse(input);
      return mutateOwner(ownerId, "human", d => { const hash = digest(parsed);if(retentionActive(d))rejectExpiredReplay(d,"conversation",parsed.conversationId,hash);const old = d.conversations.find(c => c.record.conversationId === parsed.conversationId); if (old) { if (old.digest !== hash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); return { record: old.record, created: false }; } const record = { ...parsed, createdAt: new Date(Date.now()).toISOString(), messages: [] }; if(retentionActive(d))rememberReplay(d,{kind:"conversation",id:parsed.conversationId,digest:hash});d.conversations.push({ digest: hash, record }); return { record, created: true }; });
    },
    async sendHumanMessage(ownerId: string, input: { conversationId: string; messageId: string; taskId: string; text: string }) {
      const parsed = z.object({ conversationId: workspaceIdentifierSchema, messageId: workspaceIdentifierSchema, taskId: workspaceIdentifierSchema, text: workspaceTextSchema }).strict().parse(input);
      return mutateOwner(ownerId, "human", d => { const hash = digest(parsed);if(retentionActive(d)){rejectExpiredReplay(d,"task",parsed.taskId,hash);rejectExpiredReplay(d,"message",parsed.messageId);}const old = d.tasks.find(t => t.record.taskId === parsed.taskId); if (old) { if (old.digest !== hash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); const record = d.conversations.find(c => c.record.conversationId === parsed.conversationId)!.record.messages.find(m => m.messageId === parsed.messageId)!; return { record, created: false }; } if (d.conversations.some(c => c.record.messages.some(m => m.messageId === parsed.messageId))) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); const c = d.conversations.find(c => c.record.conversationId === parsed.conversationId); if (!c) throw new WorkspaceError("NOT_FOUND", 404); const recordedAt = new Date(Date.now()).toISOString(); const record = { ...parsed, actor: "human" as const, recordedAt }; if(retentionActive(d)){rememberReplay(d,{kind:"task",id:parsed.taskId,digest:hash});rememberReplay(d,{kind:"message",id:parsed.messageId,digest:digest({messageId:parsed.messageId,taskId:parsed.taskId})});}c.record.messages.push(record); d.tasks.push({ digest: hash, record: { taskId: parsed.taskId, conversationId: parsed.conversationId, humanMessageId: parsed.messageId, text: parsed.text, createdAt: recordedAt, status: "pending" } }); return { record, created: true }; });
    },
    async listAgentTasks(ownerId: string): Promise<WorkspaceTask[]> { return (await readOwner(ownerId, "agent")).document.tasks.map(t => t.record); },
    async claimTask(ownerId: string, input: { taskId: string; attemptId: string; agentId: string }) {
      const parsed = z.object({ taskId: workspaceIdentifierSchema, attemptId: workspaceIdentifierSchema, agentId: workspaceIdentifierSchema }).strict().parse(input);
      return mutateOwner(ownerId, "agent", (d, m) => { if (parsed.agentId !== m.agentId) throw new WorkspaceError("FORBIDDEN", 403); if(retentionActive(d))rejectExpiredReplay(d,"task",parsed.taskId);const t = d.tasks.find(t => t.record.taskId === parsed.taskId); if (!t) throw new WorkspaceError("NOT_FOUND", 404); const hash = digest(parsed); if (t.record.status !== "pending") { if (t.claimDigest !== hash) throw new WorkspaceError("TASK_ALREADY_CLAIMED", 409); return { record: t.record, created: false }; } t.claimDigest = hash; Object.assign(t.record, { status: "claimed", attemptId: parsed.attemptId, agentId: m.agentId }); return { record: t.record, created: true }; });
    },
    async respondToTask(ownerId: string, input: { taskId: string; attemptId: string; messageId: string; text: string; operationId?: string }) {
      const parsed = z.object({ taskId: workspaceIdentifierSchema, attemptId: workspaceIdentifierSchema, messageId: workspaceIdentifierSchema, text: workspaceTextSchema, operationId: workspaceIdentifierSchema.optional() }).strict().parse(input);
      return mutateOwner(ownerId, "agent", (d, m) => { if(retentionActive(d)){rejectExpiredReplay(d,"task",parsed.taskId);rejectExpiredReplay(d,"message",parsed.messageId);}const t = d.tasks.find(t => t.record.taskId === parsed.taskId); if (!t) throw new WorkspaceError("NOT_FOUND", 404); if (t.record.attemptId !== parsed.attemptId || t.record.agentId !== m.agentId || !["claimed", "responded"].includes(t.record.status)) throw new WorkspaceError("TASK_NOT_CLAIMED", 409); const hash = digest(parsed); if (t.record.status === "responded") { if (t.responseDigest !== hash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); return { record: t.record, created: false }; } if (d.conversations.some(c => c.record.messages.some(m => m.messageId === parsed.messageId))) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); if (parsed.operationId && !d.operations.some(o => o.record.clientOperationId === parsed.operationId) && !replayMarker(d,"operation",parsed.operationId)) throw new WorkspaceError("OPERATION_NOT_FOUND", 404); const c = d.conversations.find(c => c.record.conversationId === t.record.conversationId)!; if(retentionActive(d))rememberReplay(d,{kind:"message",id:parsed.messageId,digest:digest({messageId:parsed.messageId,taskId:parsed.taskId})});c.record.messages.push({ messageId: parsed.messageId, taskId: parsed.taskId, conversationId: t.record.conversationId, actor: "agent", text: parsed.text, recordedAt: new Date(Date.now()).toISOString(), ...(parsed.operationId ? { operationId: parsed.operationId } : {}) }); t.responseDigest = hash; Object.assign(t.record, { status: "responded", responseMessageId: parsed.messageId, ...(parsed.operationId ? { operationId: parsed.operationId } : {}) }); return { record: t.record, created: true }; });
    },
    operations: {
      async append(ownerId: string, input: OperationHistoryInput) { const parsed = parseOperationHistoryInput(input); enforceUnpaid(parsed); return mutateOwner(ownerId, "agent", (d, m) => { if (parsed.agentId && parsed.agentId !== m.agentId) throw new WorkspaceError("FORBIDDEN", 403); const authoritative = { ...parsed, agentId: m.agentId }; const hash = digest(authoritative);if(retentionActive(d))rejectExpiredReplay(d,"operation",parsed.clientOperationId,hash);const old = d.operations.find(o => o.record.clientOperationId === parsed.clientOperationId); if (old) { if (old.digest !== hash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); return { record: old.record, created: false }; } const record: OperationHistoryRecord = { ...authoritative, id: randomUUID(), recordedAt: new Date(Date.now()).toISOString(), evidence: "agent-reported" }; if(retentionActive(d))rememberReplay(d,{kind:"operation",id:parsed.clientOperationId,digest:hash});d.operations.unshift({ digest: hash, record }); return { record, created: true }; }); },
      async all(ownerId: string) { return (await readOwner(ownerId)).document.operations.map(o => o.record); },
      async list(ownerId: string, limit = 20) { if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new WorkspaceError("INVALID_REQUEST", 400); return (await readOwner(ownerId)).document.operations.slice(0, limit).map(o => o.record); },
    },
    events: {
      async append(ownerId: string, input: ActivityInput) { const parsed = activitySchema.parse(input); if (parsed.mode === "testnet" || parsed.kind === "payment-reported") throw new WorkspaceError("WORKSPACE_UNPAID_ONLY", 403); return mutateOwner(ownerId, "agent", (d, m) => { if (parsed.agentId && parsed.agentId !== m.agentId) throw new WorkspaceError("FORBIDDEN", 403); const authoritative = { ...parsed, agentId: m.agentId }; if (parsed.operationId && !d.operations.some(o => o.record.clientOperationId === parsed.operationId) && !replayMarker(d,"operation",parsed.operationId)) throw new WorkspaceError("OPERATION_NOT_FOUND", 404); const hash = digest(authoritative);if(retentionActive(d))rejectExpiredReplay(d,"event",parsed.eventId,hash);const old = d.events.find(e => e.record.eventId === parsed.eventId); if (old) { if (old.digest !== hash) throw new WorkspaceError("WORKSPACE_CONFLICT", 409); return { record: old.record, created: false }; } const record: ActivityEvent = { ...authoritative, recordedAt: new Date(Date.now()).toISOString(), evidence: "agent-reported" }; if(retentionActive(d))rememberReplay(d,{kind:"event",id:parsed.eventId,digest:hash});d.events.unshift({ digest: hash, record }); return { record, created: true }; }); },
      async all(ownerId: string) { return (await readOwner(ownerId)).document.events.map(e => e.record); },
    },
  };
  return store;
}
function receipt(m: Meta) { return { workspaceId: m.workspaceId, ownerId: m.ownerId, agentId: m.agentId, creationId: m.creationId, generation: m.generation, revoked: m.revoked, createdAt: m.createdAt }; }
export type WorkspaceStore = ReturnType<typeof buildStore>;
// The isolated HTTP acceptance harness can freeze server-owned keys before any
// transport effect. Deployed/configured stores cannot supply this test-only hook.
export function createRedisWorkspaceStore(redis: WorkspaceRedis, prefix = "bazaar-workspace:local-test", reservations?: () => WorkspaceLegacyRegistry, testOwnerUuid?: (creationId: string) => string): WorkspaceStore {
  if (testOwnerUuid && (process.env.NODE_ENV !== "test" || process.env.VERCEL)) throw unavailable();
  return buildStore(redisBackend(redis, prefix), reservations, undefined, testOwnerUuid);
}
export function createFileWorkspaceStore(directory: string, prefix = "bazaar-workspace:local-test", reservations?: () => WorkspaceLegacyRegistry): WorkspaceStore { return buildStore(fileBackend(directory, prefix), reservations); }
let testStore: WorkspaceStore | undefined;
export function setWorkspaceStoreForTests(store: WorkspaceStore | undefined) { if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw unavailable(); testStore = store; }
export function openWorkspacesEnabled() { return process.env.BAZAAR_ENABLE_OPEN_WORKSPACES === "true"; }
export function assertWorkspaceEnabled() { if (!openWorkspacesEnabled()) throw new WorkspaceError("WORKSPACES_DISABLED", 503); }
export function workspacePrefix() {
  const prefix = validatePrefix(process.env.BAZAAR_WORKSPACE_PREFIX ?? `bazaar-workspace:${process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "preview" : "local-test"}`);
  if (prefix.includes(":isolated-")) { if (process.env.VERCEL || process.env.VERCEL_ENV) throw unavailable(); workspaceLoopbackOrigin(); }
  return prefix;
}
export function workspaceLoopbackOrigin() { const value = process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN; if (!value) throw unavailable(); const url = new URL(value); if (url.origin !== value || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol)) throw unavailable(); return value; }
function isolatedWorkspaceOwners(prefix: string, url: string | undefined, token: string | undefined): FrozenOwner[] | undefined {
  const raw = process.env.BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON, relay = process.env.BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN;
  if (!prefix.includes(":isolated-")) {
    if (raw !== undefined || relay !== undefined) throw unavailable("isolated-config-outside-prefix");
    return;
  }
  // Production Next acceptance uses the ordinary configured store, with an
  // explicit loopback relay as its only Redis transport and no file fallback.
  if (!raw || bytes(raw) > 4096 || !relay || process.env.VERCEL || process.env.VERCEL_ENV || process.env.BAZAAR_WORKSPACE_FILE_DIRECTORY !== undefined || url !== relay || token !== "isolated-loopback-only") throw unavailable("isolated-config");
  let parsedRelay: URL, value: unknown;
  try { parsedRelay = new URL(relay); value = JSON.parse(raw); } catch { throw unavailable("isolated-config"); }
  if (parsedRelay.origin !== relay || parsedRelay.protocol !== "http:" || parsedRelay.hostname !== "127.0.0.1" || !parsedRelay.port) throw unavailable("isolated-relay");
  const parsed = z.array(frozenOwnerSchema).length(2).safeParse(value);
  if (!parsed.success) throw unavailable("isolated-owners");
  const ids = new Set<string>(), hashes = new Set<string>();
  for (const owner of parsed.data) {
    if (owner.ownerId !== "ow_" + owner.ownerUuid.replaceAll("-", "")) throw unavailable("isolated-owner-binding");
    for (const id of [owner.creationId, owner.ownerUuid, owner.ownerId]) { if (ids.has(id)) throw unavailable("isolated-owner-collision"); ids.add(id); }
    for (const hash of Object.values(owner.hashes)) { if (hashes.has(hash)) throw unavailable("isolated-hash-collision"); hashes.add(hash); }
  }
  return parsed.data;
}
export function configuredWorkspaceStore(reservations?: () => WorkspaceLegacyRegistry): WorkspaceStore {
  assertWorkspaceEnabled(); if (testStore) return testStore;
  if (process.env.BAZAAR_WORKSPACE_BACKEND !== "redis" && (process.env.BAZAAR_WORKSPACE_ISOLATED_OWNERS_JSON !== undefined || process.env.BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN !== undefined)) throw unavailable("isolated-backend");
  if (process.env.BAZAAR_WORKSPACE_BACKEND === "file") { if (process.env.VERCEL || process.env.VERCEL_ENV || !process.env.BAZAAR_WORKSPACE_FILE_DIRECTORY) throw unavailable(); workspaceLoopbackOrigin(); return createFileWorkspaceStore(process.env.BAZAAR_WORKSPACE_FILE_DIRECTORY, workspacePrefix(), reservations); }
  if (process.env.BAZAAR_WORKSPACE_BACKEND !== "redis") throw unavailable();
  const url = process.env.BAZAAR_WORKSPACE_REDIS_REST_URL, token = process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN;
  const prefix = workspacePrefix(), frozenOwners = isolatedWorkspaceOwners(prefix, url, token);
  if (frozenOwners) return buildStore(redisBackend(meteredRedis(new Redis({ url: url!, token: token!, automaticDeserialization: false, retry: { retries: 0 }, enableAutoPipelining: false })), prefix, frozenOwners.map(owner => owner.ownerId)), reservations, undefined, undefined, frozenOwners);
  if (!url?.startsWith("https://") || !token) throw unavailable();
  const parsed = new URL(url); if (parsed.username || parsed.password || parsed.search || parsed.hash) throw unavailable();
  return createRedisWorkspaceStore(meteredRedis(new Redis({ url, token, automaticDeserialization: false, retry: { retries: 0 }, enableAutoPipelining: false })), prefix, reservations);
}
