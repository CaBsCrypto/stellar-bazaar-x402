import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { meteredRedis, setOperationalTransportProfile } from './acceptance-meter.ts';
import { WorkspaceError } from './workspace-types.ts';
import { operationalProfiles, OPERATIONAL_PROFILE_PERCENT, operationalPressure, type OperationalProfile, type OperationalRequestClass,type OperationalWorkload } from './operational-pressure.ts';
import { operationalTransportEnvelope } from './operational-envelopes.ts';

export const OPERATIONAL_LEDGER_MAX_BYTES = 65536;
export const OPERATIONAL_CHECKPOINT_MAX_AGE_MS = 31 * 86400000;
export const operationalResources = ['requests', 'redisRequests', 'redisCommands', 'outboundBytes', 'inboundBytes', 'externalRequests'] as const;
export type OperationalResources = Record<typeof operationalResources[number], number>;
const quantities = z.object(Object.fromEntries(operationalResources.map(name => [name, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)])) as Record<typeof operationalResources[number], z.ZodNumber>).strict();
const profileShares = z.object({ public: z.number().int().min(0).max(100), authenticated: z.number().int().min(0).max(100), recovery: z.number().int().min(0).max(100) }).strict()
  .refine(value => operationalProfiles.reduce((total, profile) => total + value[profile], 0) === 100, 'Profile percentages must sum to 100');
export const operationalProfilePercentSchema = z.object(Object.fromEntries(operationalResources.map(name => [name, profileShares])) as Record<typeof operationalResources[number], typeof profileShares>).strict();
export type OperationalProfilePercent = z.infer<typeof operationalProfilePercentSchema>;
export const operationalCheckpointSchema = z.object({
  version: z.literal(1), epoch: z.string().uuid(), observedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  evidence: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,180}$/), remaining: quantities, profilePercent: operationalProfilePercentSchema.optional(),
}).strict().superRefine((value, ctx) => {
  const observed = Date.parse(value.observedAt), expires = Date.parse(value.expiresAt);
  if (expires <= observed || expires - observed > OPERATIONAL_CHECKPOINT_MAX_AGE_MS || observed > Date.now() + 60000) ctx.addIssue({ code: 'custom', message: 'Invalid checkpoint interval' });
});
export type OperationalCheckpoint = z.infer<typeof operationalCheckpointSchema>;
type Ledger = { version: 1; revision: string; checkpoint: OperationalCheckpoint; assigned: Record<OperationalProfile, OperationalResources>; reserved: OperationalResources; used: Record<OperationalProfile, OperationalResources> };
const zero = (): OperationalResources => Object.fromEntries(operationalResources.map(name => [name, 0])) as OperationalResources;
export function operationalRequestEnvelope(profile: OperationalProfile, workload?:OperationalWorkload): OperationalResources {
  const limit = operationalTransportEnvelope(profile,workload);
  return { requests: 1, redisRequests: limit.redis, redisCommands: limit.commandsUpperBound, outboundBytes: limit.outboundPayloadBytes + limit.externalOutboundBytes + limit.dtoBytes,
    inboundBytes: limit.inboundPayloadBytes + limit.externalInboundBytes, externalRequests: limit.externalRequests };
}
export const OPERATIONAL_REQUEST_ENVELOPES = Object.fromEntries(operationalProfiles.map(profile => [profile, operationalRequestEnvelope(profile)])) as Record<OperationalProfile, OperationalResources>;
/** Compatibility name for conservative authenticated-request fixtures. */
export const OPERATIONAL_REQUEST_ENVELOPE = OPERATIONAL_REQUEST_ENVELOPES.authenticated;
export function operationalProfilePercent(checkpoint: OperationalCheckpoint): OperationalProfilePercent {
  return checkpoint.profilePercent ?? Object.fromEntries(operationalResources.map(name => [name, { ...OPERATIONAL_PROFILE_PERCENT }])) as OperationalProfilePercent;
}
/** Half stays unassigned. Integer rounding can only increase the unassigned reserve. */
export function allocateOperationalBudget(checkpoint: OperationalCheckpoint) {
  const shares = operationalProfilePercent(checkpoint);
  const assigned = Object.fromEntries(operationalProfiles.map(profile => [profile, Object.fromEntries(operationalResources.map(name => [name, Number(BigInt(checkpoint.remaining[name]) * BigInt(shares[name][profile]) / 200n)]))])) as Ledger['assigned'];
  const reserved = Object.fromEntries(operationalResources.map(name => [name, checkpoint.remaining[name] - operationalProfiles.reduce((total, profile) => total + assigned[profile][name], 0)])) as OperationalResources;
  return { assigned, reserved };
}
export const OPERATIONAL_BUDGET_CAS = `-- operations-budget-cas-v1
local old=redis.call('GET',KEYS[1])
if ARGV[1]=='missing' then if old then return 0 end else if not old or old~=ARGV[2] then return 0 end end
if string.len(ARGV[3])>65536 then return -1 end
redis.call('SET',KEYS[1],ARGV[3]); return 1`;
export interface OperationalBudgetRedis { get(key: string): Promise<unknown>; eval(script: string, keys: string[], args: string[]): Promise<unknown> }
export interface OperationalBudgetStore { reserve(kind: OperationalRequestClass): Promise<ReturnType<typeof budgetSummary>>; read(): Promise<ReturnType<typeof budgetSummary>>; refresh(checkpoint: OperationalCheckpoint): Promise<ReturnType<typeof budgetSummary>> }
function parseLedger(raw: unknown): Ledger {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > OPERATIONAL_LEDGER_MAX_BYTES) throw new WorkspaceError('OPERATIONAL_BUDGET_UNAVAILABLE');
  const schema = z.object({ version: z.literal(1), revision: z.string().uuid(), checkpoint: operationalCheckpointSchema,
    assigned: z.object({ public: quantities, authenticated: quantities, recovery: quantities }).strict(), reserved: quantities,
    used: z.object({ public: quantities, authenticated: quantities, recovery: quantities }).strict() }).strict();
  const value = schema.parse(JSON.parse(raw)) as Ledger, allocation = allocateOperationalBudget(value.checkpoint);
  if (JSON.stringify(value.assigned) !== JSON.stringify(allocation.assigned) || JSON.stringify(value.reserved) !== JSON.stringify(allocation.reserved) ||
      operationalProfiles.some(profile => operationalResources.some(name => value.used[profile][name] > value.assigned[profile][name]))) throw new WorkspaceError('OPERATIONAL_BUDGET_UNAVAILABLE');
  return value;
}
function initial(checkpoint: OperationalCheckpoint): Ledger { return { version: 1, revision: randomUUID(), checkpoint, ...allocateOperationalBudget(checkpoint), used: { public: zero(), authenticated: zero(), recovery: zero() } }; }
export function budgetSummary(ledger: Ledger) {
  return { version: 1, epoch: ledger.checkpoint.epoch, observedAt: ledger.checkpoint.observedAt, expiresAt: ledger.checkpoint.expiresAt, evidence: ledger.checkpoint.evidence,
    stale: Date.now() >= Date.parse(ledger.checkpoint.expiresAt), profilePercent: operationalProfilePercent(ledger.checkpoint), reserved: ledger.reserved,
    profiles: Object.fromEntries(operationalProfiles.map(profile => [profile, { envelope: OPERATIONAL_REQUEST_ENVELOPES[profile], assigned: ledger.assigned[profile], used: ledger.used[profile], pressure: Object.fromEntries(operationalResources.map(name => [name, OPERATIONAL_REQUEST_ENVELOPES[profile][name]===0?{applicable:false,used:ledger.used[profile][name]}:{applicable:true,...operationalPressure(ledger.used[profile][name], ledger.assigned[profile][name], profile === 'authenticated')}])) }])) };
}
export function createOperationalBudgetStore(redis: OperationalBudgetRedis, prefix: string, checkpoint: () => OperationalCheckpoint): OperationalBudgetStore {
  if (!/^bazaar-workspace:pilot-[a-f0-9]{32}$/.test(prefix)) throw new WorkspaceError('OPERATIONAL_BUDGET_UNAVAILABLE');
  const key = prefix + ':operations-budget:state';
  async function read() { const raw = await redis.get(key); return { raw, ledger: raw === null ? initial(operationalCheckpointSchema.parse(checkpoint())) : parseLedger(raw) }; }
  async function commit(raw: unknown, ledger: Ledger) {
    ledger.revision = randomUUID(); const next = JSON.stringify(ledger);
    if (Buffer.byteLength(next) > OPERATIONAL_LEDGER_MAX_BYTES) throw new WorkspaceError('OPERATIONAL_BUDGET_UNAVAILABLE');
    // No replay after conflict or lost acknowledgement; the next incoming request reads again.
    if (await redis.eval(OPERATIONAL_BUDGET_CAS, [key], [raw === null ? 'missing' : 'present', raw === null ? '' : String(raw), next]) !== 1) throw new WorkspaceError('OPERATIONAL_BUDGET_WRITE_UNCONFIRMED', 503);
  }
  return {
    async read() { return budgetSummary((await read()).ledger); },
    async reserve(kind) {
      const { raw, ledger } = await read(), used = ledger.used[kind.profile], assigned = ledger.assigned[kind.profile];
      const envelope = operationalRequestEnvelope(kind.profile,kind.workload);
      if (kind.newOperation && Date.now() >= Date.parse(ledger.checkpoint.expiresAt)) throw new WorkspaceError('OPERATIONAL_CHECKPOINT_STALE', 503);
      for (const name of operationalResources) {
        const projected = used[name] + envelope[name];
        if (envelope[name] === 0) continue;
        if (projected > assigned[name] || (kind.newOperation && projected * 100 > assigned[name] * 75)) throw new WorkspaceError(kind.newOperation ? 'NEW_OPERATIONS_PAUSED' : 'OPERATIONAL_REQUEST_BUDGET', 429, 60);
      }
      for (const name of operationalResources) used[name] += envelope[name];
      await commit(raw, ledger); return budgetSummary(ledger);
    },
    async refresh(value) {
      const next = operationalCheckpointSchema.parse(value), { raw, ledger } = await read();
      if (next.epoch === ledger.checkpoint.epoch || Date.parse(next.observedAt) <= Date.parse(ledger.checkpoint.observedAt) || Date.now() >= Date.parse(next.expiresAt)) throw new WorkspaceError('OPERATIONAL_CHECKPOINT_CONFLICT', 409);
      const replacement = initial(next); await commit(raw, replacement); return budgetSummary(replacement);
    },
  };
}
let injected: OperationalBudgetStore | undefined;
export function setOperationalBudgetStoreForTests(store?: OperationalBudgetStore) { if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw Error('TEST_STORE_DISABLED'); injected = store; }
export function operationalBudgetEnabled() { return process.env.BAZAAR_OPERATIONAL_BUDGET === 'true' && process.env.BAZAAR_ACCEPTANCE_METER !== 'true'; }
export function configuredOperationalBudgetStore(): OperationalBudgetStore {
  if (injected) return injected;
  const url = process.env.BAZAAR_WORKSPACE_REDIS_REST_URL, token = process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN, prefix = process.env.BAZAAR_WORKSPACE_PREFIX;
  if (!url || !token || !prefix || new URL(url).protocol !== 'https:') throw new WorkspaceError('OPERATIONAL_BUDGET_UNAVAILABLE');
  return createOperationalBudgetStore(meteredRedis(new Redis({ url, token, automaticDeserialization: false, retry: { retries: 0 }, enableAutoPipelining: false })), prefix,
    () => operationalCheckpointSchema.parse(JSON.parse(process.env.BAZAAR_OPERATIONAL_CHECKPOINT_JSON ?? '')));
}
export async function operationalRequestGate(kind: OperationalRequestClass) {
  setOperationalTransportProfile(kind.profile,kind.workload);
  if (!operationalBudgetEnabled()) return;
  try { await configuredOperationalBudgetStore().reserve(kind); }
  catch (error) { if (error instanceof WorkspaceError) throw error; throw new WorkspaceError('OPERATIONAL_BUDGET_UNAVAILABLE'); }
}
