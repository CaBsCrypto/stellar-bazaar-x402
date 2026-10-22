import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { operationalRequestEnvelope } from './operational-budget.ts';
import { classifyOperationalRequest, type OperationalRequestClass } from './operational-pressure.ts';
import { WorkspaceError } from './workspace-types.ts';
import {continuousFreeBudgetConfiguration,createContinuousFreeBudgetStore,type ContinuousFreeConfiguration} from './continuous-free-budget.ts';

export const FREE_DEMO_COMMAND_BUDGET_MAX = 350000;
export const FREE_DEMO_COMMAND_BUDGET_DEFAULT = Object.freeze({ public: 155000, authenticated: 90000, recovery: 105000 });
type Profile = keyof typeof FREE_DEMO_COMMAND_BUDGET_DEFAULT;
type Limits = Record<Profile, number>;
type Environment = Readonly<Record<string, string | undefined>>;
export interface FreeDemoBudgetRedis { eval(script: string, keys: string[], args: string[]): Promise<unknown> }
export type FreeDemoBudgetConfiguration = { until: string; windowId: string; limits: Limits;mode?:undefined } | ContinuousFreeConfiguration;
export type FreeDemoRequestClass = OperationalRequestClass & { credentialRead?: true; recoveryTransport?:true;operationLookup?:true;perOrderProfile?:'batch-v1';perOrderHoldRequired?:boolean;operationId?:string;principalHash?:string };
/** Gate EVAL + GET/TIME/SET costs at most four commands. The additional
 * account proof uses READ_WORKSPACE_LUA (EVAL + three GETs), also four.
 */
export function freeDemoCommandReservation(kind: FreeDemoRequestClass) {
  return operationalRequestEnvelope(kind.profile, kind.workload).redisCommands + 4 + (kind.credentialRead || kind.profile !== 'public' && !kind.bootstrapCreation ? 4 : 0);
}

/** These are conservative command reservations, never a provider invoice.
 * A single declared 24-hour window crosses midnight without replenishment.
 * Keep its ledger after expiry so reads/retries cannot reset the reservation.
 */
export function freeDemoBudgetConfiguration(environment: Environment = process.env): FreeDemoBudgetConfiguration | undefined {
  const continuous=continuousFreeBudgetConfiguration(environment);if(continuous)return continuous;
  const until = environment.BAZAAR_FREE_DEMO_ADMISSION_UNTIL;
  if (until === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(until) || !Number.isSafeInteger(Date.parse(until)) || new Date(until).toISOString() !== until) throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
  let limits: unknown = FREE_DEMO_COMMAND_BUDGET_DEFAULT;
  if (environment.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON !== undefined) {
    try {
      const raw = environment.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON;
      if (Buffer.byteLength(raw) > 512) throw Error();
      limits = JSON.parse(raw);
    } catch { throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE'); }
  }
  const profiles = ['public', 'authenticated', 'recovery'] as const;
  if (!limits || typeof limits !== 'object' || Array.isArray(limits) || Object.keys(limits).sort().join(',') !== [...profiles].sort().join(',') ||
    profiles.some(profile => !Number.isSafeInteger((limits as Limits)[profile]) || (limits as Limits)[profile] < 1) ||
    profiles.reduce((sum, profile) => sum + (limits as Limits)[profile], 0) > FREE_DEMO_COMMAND_BUDGET_MAX) throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
  return { until, windowId: createHash('sha256').update(until).digest('hex').slice(0, 24), limits: { ...(limits as Limits) } };
}

export const FREE_DEMO_BUDGET_LUA = `-- free-demo-command-reservations-v1
local current=redis.call('GET',KEYS[1])
local state={version=1,window=ARGV[1],last=0,used={public=0,authenticated=0,recovery=0}}
if current then
  if string.len(current)>512 then return {-2,0} end
  local ok,parsed=pcall(cjson.decode,current)
  if not ok or type(parsed)~='table' or parsed.version~=1 or parsed.window~=ARGV[1] or type(parsed.last)~='number' or parsed.last<0 or parsed.last%1~=0 or type(parsed.used)~='table' then return {-2,0} end
  state=parsed
end
local limits={public=tonumber(ARGV[4]),authenticated=tonumber(ARGV[5]),recovery=tonumber(ARGV[6])}
for _,name in ipairs({'public','authenticated','recovery'}) do
  local n=state.used[name]
  if type(n)~='number' or n<0 or n%1~=0 or n>limits[name] then return {-2,0} end
end
local clock=redis.call('TIME')
local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
if state.last>now then return {-2,0} end
local name=ARGV[2]
local next=state.used[name]+tonumber(ARGV[3])
if next>limits[name] and name=='public' and ARGV[7]=='1' then name='recovery';next=state.used[name]+tonumber(ARGV[3]) end
if next>limits[name] then return {0,state.used[name],name} end
state.used[name]=next;state.last=now
redis.call('SET',KEYS[1],cjson.encode(state))
return {1,next,name}`;

/** One atomic debit; a denied or uncertain response is never replayed here. */
export function createFreeDemoBudgetStore(redis: FreeDemoBudgetRedis, prefix: string, configuration: FreeDemoBudgetConfiguration) {
  if(configuration.mode==='continuous')return createContinuousFreeBudgetStore(redis,prefix,configuration);
  if (!/^bazaar-workspace:(?:pilot-[a-f0-9]{32}|isolated-[a-f0-9]{32}|local-test|preview|production)$/.test(prefix)) throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
  const tag = prefix.split(':')[1], key = `${prefix}:{${tag}}:free-demo-budget:${configuration.windowId}`;
  return { async reserve(kind: FreeDemoRequestClass) {
    const weight = freeDemoCommandReservation(kind);
    try {
      const fallback = kind.recoveryTransport===true && kind.credentialRead===true && kind.profile==='public' && kind.workload==='metadata';
      const result = await redis.eval(FREE_DEMO_BUDGET_LUA, [key], [configuration.windowId, kind.profile, String(weight), String(configuration.limits.public), String(configuration.limits.authenticated), String(configuration.limits.recovery), fallback?'1':'0']);
      if (!Array.isArray(result) || result.length !== 3 || !Number.isSafeInteger(result[1]) || Number(result[1]) < 0 || !['public','authenticated','recovery'].includes(String(result[2]))) throw Error();
      const effectiveProfile = result[2] as Profile;
      if (effectiveProfile!==kind.profile && !(fallback&&effectiveProfile==='recovery') || Number(result[1]) > configuration.limits[effectiveProfile]) throw Error();
      if (result[0] === 0) throw new WorkspaceError('FREE_DEMO_REQUEST_LIMIT', 429, 60);
      if (result[0] !== 1) throw Error();
      return { profile: effectiveProfile, requestedProfile:kind.profile, reservedCommands: weight, used: Number(result[1]), limit: configuration.limits[effectiveProfile], evidence: 'conservative-reservation' as const };
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
    }
  } };
}

/** Only verified account credentials may consume the recovery partition.
 * A valid account is still checked again by the native handler for ownership.
 * Raw credentials, arguments and account IDs never enter the shared ledger.
 */
export async function classifyFreeDemoRequest(request: Request, verify: () => Promise<unknown>): Promise<FreeDemoRequestClass> {
  const kind = await classifyOperationalRequest(request);
  if (kind.profile === 'public') {
    if (kind.workload!=='metadata'||new URL(request.url).pathname!=='/api/mcp'||!request.headers.has('authorization')) return kind;
    let transport=['GET','HEAD'].includes(request.method);
    if(request.method==='POST'){
      // classifyOperationalRequest has already bounded this JSON body to 64 KiB.
      const rpc=await request.clone().json().catch(()=>null);
      transport=['initialize','notifications/initialized','tools/list'].includes(rpc?.method);
    }
    if(!transport)return kind;
    try { await verify(); return {...kind,credentialRead:true,recoveryTransport:true}; }
    catch (error) {
      if(error instanceof WorkspaceError && [401,403].includes(error.status))return {...kind,credentialRead:true};
      throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
    }
  }
  if (kind.bootstrapCreation) return kind;
  try { await verify(); return kind; }
  catch (error) {
    if(error instanceof WorkspaceError && [401,403].includes(error.status))return { profile: 'public', newOperation: false, credentialRead:true };
    throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
  }
}

let injected: ReturnType<typeof createFreeDemoBudgetStore> | undefined;
export function setFreeDemoBudgetStoreForTests(store?: ReturnType<typeof createFreeDemoBudgetStore>) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw Error('TEST_STORE_DISABLED');
  injected = store;
}
export function configuredFreeDemoBudgetStore(configuration: FreeDemoBudgetConfiguration) {
  if (injected) return injected;
  const url = process.env.BAZAAR_WORKSPACE_REDIS_REST_URL, token = process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN, prefix = process.env.BAZAAR_WORKSPACE_PREFIX;
  if (!url || !token || !prefix) throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
  try { if (new URL(url).protocol !== 'https:') throw Error(); }
  catch { throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE'); }
  return createFreeDemoBudgetStore(new Redis({ url, token, automaticDeserialization: false, retry: { retries: 0 }, enableAutoPipelining: false }), prefix, configuration);
}
