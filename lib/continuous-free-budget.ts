import {createHash} from 'node:crypto';
import {Redis} from '@upstash/redis';
import {WorkspaceError} from './workspace-types.ts';
import {catalogBudgetReservation,catalogBudgetRedis} from './catalog-budget.ts';
import {continuousControlBudgetReservation,continuousControlBudgetRedis} from './continuous-control-budget.ts';
import {operationalRequestEnvelope} from './operational-budget.ts';
import type {FreeDemoRequestClass} from './free-demo-budget.ts';
import type {MarketOrder} from './marketplace-store.ts';
import {isCanonicalUsdcTestnet} from './payment-assets.ts';
import {deliveryStorage} from './delivery-contract.ts';
import {workspaceRegistryTransportMaximum,COMPACT_WORKSPACE_REGISTRY_MAX_BYTES,isCompactWorkspaceTransport} from './quota-registry-patch.ts';
import {externalBuyerPilotConfiguration,externalBuyerPilotOrderMatches} from './external-buyer-pilot.ts';
import {compactTransportV2} from './free-plan-transport-profile.ts';
import {publicBuyerConfiguration,publicBuyerOrderMatches} from './public-buyer-admission.ts';
import {noteStarterBootstrapDebit} from './public-registration-profile.ts';

export const CONTINUOUS_FREE_WINDOW_MS=31*86400000;
export const CONTINUOUS_FREE_COMMAND_MAX=400000;
export const CONTINUOUS_FREE_TRANSFER_MAX=8_000_000_000;
export const CONTINUOUS_FREE_LIMITS=Object.freeze({public:155000,authenticated:90000,recovery:105000,background:50000});
export const CONTINUOUS_FREE_OPERATION_RESERVATION=Object.freeze({recoveryCommands:12000,backgroundCommands:4000,transferBytes:2_000_000_000});
export const CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION=Object.freeze({recoveryCommands:12000,backgroundCommands:4000,transferBytes:900_000_000});
// New canonical text orders only: bounded unsigned12/signed46/reconcile16-MiB
// financial requests (one payment), six bounded order reads, claim/delivery
// writes, one readiness and two delivery callbacks.
// Independently metered controls and one guardian recovery pass must also fit.
export const COMPACT_TEXT_OPERATION_RESERVATION=Object.freeze({recoveryCommands:12000,backgroundCommands:4000,transferBytes:208_941_056,globalAllowanceBytes:133_246_976});
// V2 only: unsigned5/signed18/reconcile6, six3-MiB reads, two4-MiB
// seller actions, readiness(provider1+native1) and two deliveries(3+3).
// Global allowance retains all independent controls, guardian8 and safety8.
export const COMPACT_V2_TEXT_OPERATION_RESERVATION=Object.freeze({recoveryCommands:12000,backgroundCommands:4000,transferBytes:75_247_616,globalAllowanceBytes:48_537_600});
const recoveryIncident='31c97193-be74-4b9d-b0a3-f3890b0a41e8',recoveryService='guionista-bazaar-production-text-v1';
function compactOperationBudget(environment:Environment=process.env){return environment.BAZAAR_FREE_DEMO_MODE==='continuous'&&isCompactWorkspaceTransport(environment);}
export type ContinuousFreeProfile=keyof typeof CONTINUOUS_FREE_LIMITS;
export type ContinuousFreeConfiguration={mode:'continuous';windowId:'rolling-31-days-v1';windowMs:number;limits:Record<ContinuousFreeProfile,number>;transferBytes:number;configurationId:string};
export type ContinuousFreeOperation={operationId:string;principalHash:string;action:'reserve'|'release'};
export interface ContinuousFreeRedis {eval(script:string,keys:string[],args:string[]):Promise<unknown>;get?(key:string):Promise<unknown>}
type Environment=Readonly<Record<string,string|undefined>>;
/** An explicit reviewed exception. This changes no ledger, bucket, old hold or
 * command configuration id. Values other than the exact proposal fail closed. */
function textRecoveryTransferConfiguration(environment:Environment){
 if(environment.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES===undefined)return undefined;
 const transferBytes=environment.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES;
 if(!['8500000000','9900000000','9950000000'].includes(transferBytes)||environment.VERCEL_ENV!=='production'||environment.BAZAAR_FREE_DEMO_MODE!=='continuous'||environment.BAZAAR_TEXT_SELLER_MODE!=='on-demand'||environment.BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID!==recoveryIncident||environment.BAZAAR_TEXT_SELLER_SERVICE_ID!==recoveryService||!/^[a-f0-9]{64}$/.test(environment.BAZAAR_TEXT_SELLER_CARD_HASH??'')||!/^[a-f0-9]{64}$/.test(environment.BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT??''))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 let owners:unknown;try{const raw=environment.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON;if(raw===undefined||Buffer.byteLength(raw)>4096)throw Error();owners=JSON.parse(raw);}catch{throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');}
 if(!Array.isArray(owners)||owners.length!==1||typeof owners[0]!=='string'||!/^ow_[a-f0-9]{32}$/.test(owners[0]))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 return {transferBytes:Number(transferBytes),buyerOwnerId:owners[0] as string};
}
export function continuousFreeBudgetConfiguration(environment:Environment=process.env):ContinuousFreeConfiguration|undefined{
 const mode=environment.BAZAAR_FREE_DEMO_MODE;
 if(mode===undefined){if(environment.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES!==undefined)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');return undefined;}
 if(mode!=='continuous'||environment.BAZAAR_FREE_DEMO_ADMISSION_UNTIL!==undefined)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 let limits:unknown=CONTINUOUS_FREE_LIMITS;
 if(environment.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON!==undefined){try{const raw=environment.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON;if(Buffer.byteLength(raw)>512)throw Error();limits=JSON.parse(raw);}catch{throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');}}
 const names=Object.keys(CONTINUOUS_FREE_LIMITS) as ContinuousFreeProfile[];
 if(!limits||typeof limits!=='object'||Array.isArray(limits)||Object.keys(limits).sort().join(',')!==names.sort().join(',')||names.some(n=>!Number.isSafeInteger((limits as Record<ContinuousFreeProfile,number>)[n])||(limits as Record<ContinuousFreeProfile,number>)[n]<1)||names.reduce((s,n)=>s+(limits as Record<ContinuousFreeProfile,number>)[n],0)>CONTINUOUS_FREE_COMMAND_MAX)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 const copy=Object.fromEntries((['public','authenticated','recovery','background'] as const).map(name=>[name,(limits as Record<ContinuousFreeProfile,number>)[name]])) as Record<ContinuousFreeProfile,number>;
 const textRecovery=textRecoveryTransferConfiguration(environment);
 return {mode:'continuous',windowId:'rolling-31-days-v1',windowMs:CONTINUOUS_FREE_WINDOW_MS,limits:copy,transferBytes:textRecovery?.transferBytes??CONTINUOUS_FREE_TRANSFER_MAX,configurationId:createHash('sha256').update(JSON.stringify(copy)).digest('hex')};
}
export function continuousFreeBudgetKey(prefix:string){
 if(!/^bazaar-workspace:(?:pilot-[a-f0-9]{32}|isolated-[a-f0-9]{32}|local-test|preview|production)$/.test(prefix))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 const tag=prefix.split(':')[1];return `${prefix}:{${tag}}:continuous-free-budget:v1`;
}
export function continuousFreeReservation(kind:FreeDemoRequestClass){
 const control=continuousControlBudgetReservation(kind);if(control)return control;
 const catalog=catalogBudgetReservation(kind);if(catalog)return catalog;
 const envelope=operationalRequestEnvelope(kind.profile,kind.workload);
 // Native atomic storage guards add two GETs and two Lua commands per write.
 // Storage is changed through bounded patches inside native Lua, not by
 // transporting the global ledger. Include the command-ledger transport.
 const metadata=kind.profile==='public'&&kind.workload==='metadata';
 const light=kind.profile==='public'&&kind.workload==='observed-metadata'||kind.profile==='recovery'&&(kind.workload==='identity'||kind.workload==='orders')||kind.profile==='authenticated'&&kind.workload==='capacity';
 // Stateless initialize/notification/tools-list/GET and anonymous static
 // capabilities have no account quota/history observer. Continuous ingress
 // makes exactly one READ/CAS attempt, with at most one credential proof.
 // Two 1-MiB registry reads can JSON-wrap to 4 MiB inbound; their snapshot/
 // replacement CAS is at most 4 MiB outbound. Eight outbound MiB leave room
 // for bounded SDK envelopes, guards, DTO and protocol headers.
 // Light native controls make one ingress and account CAS, with at most one
 // observer write. Six wrapped registry reads plus three guarded replacements,
 // bounded owner/permission snapshots, review/market reads and DTO fit 32 MiB
 // combined. Continuous financial/error paths make no ingress/quota retry:
 // the native typed-snapshot upper bound is below 96 MiB, including a first
 // signed request, joint guards, uncertainty writes and the HTTP access stage.
 // The default/legacy operational envelopes remain unchanged elsewhere.
 const transferBytes=metadata?12*1048576+128*1024+131072:light?32*1048576+128*1024+131072:kind.profile==='recovery'&&kind.workload==='financial'?96*1048576+262144:kind.profile==='authenticated'&&kind.workload==='order-create'?48*1048576+262144:envelope.inboundBytes+envelope.outboundBytes+131072;
 return {commands:envelope.redisCommands+80+(kind.credentialRead||kind.profile!=='public'&&!kind.bootstrapCreation?4:0),transferBytes};
}

/** Daily buckets are kept until their entire day lies outside 31 days. This is
 * deliberately conservative (at most one extra day), never a midnight reset.
 * Held payment work is independent of buckets and has no TTL. */
export const CONTINUOUS_FREE_BUDGET_FUNCTIONS=`
local function budget_prepare(raw,config,request)
 local names={'public','authenticated','recovery','background'}
 local zero={public=0,authenticated=0,recovery=0,background=0}
 local state={version=2,configuration=config.configurationId,last=0,buckets={},held={}}
 if raw then
  if string.len(raw)>262144 then return nil,-2 end
  local ok,parsed=pcall(cjson.decode,raw)
  if not ok or type(parsed)~='table' or parsed.version~=2 or parsed.configuration~=config.configurationId or type(parsed.last)~='number' or parsed.last<0 or parsed.last%1~=0 or type(parsed.buckets)~='table' or type(parsed.held)~='table' then return nil,-2 end
  state=parsed
 end
 local clock=redis.call('TIME');local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
 if state.last>now then return nil,-2 end
 local day=math.floor(now/86400000);local oldest=math.floor((now-config.windowMs)/86400000)
 local buckets={};local used={public=0,authenticated=0,recovery=0,background=0};local totalBytes=0;local previous=-1;local current=nil
 for _,b in ipairs(state.buckets) do
  if type(b)~='table' or type(b.day)~='number' or b.day%1~=0 or b.day<=previous or b.day>day or type(b.used)~='table' or type(b.bytes)~='number' or b.bytes<0 or b.bytes%1~=0 then return nil,-2 end
  previous=b.day
  for _,n in ipairs(names) do if type(b.used[n])~='number' or b.used[n]<0 or b.used[n]%1~=0 then return nil,-2 end end
  if b.day>=oldest then
   table.insert(buckets,b);totalBytes=totalBytes+b.bytes
   for _,n in ipairs(names) do used[n]=used[n]+b.used[n] end
   if b.day==day then current=b end
  end
 end
 if #buckets>32 or #state.held>128 then return nil,-2 end
 if not current then current={day=day,used={public=0,authenticated=0,recovery=0,background=0},bytes=0};table.insert(buckets,current) end
 state.buckets=buckets;state.last=now
 local held=nil;local ids={};local publicFloor=0
 for _,h in ipairs(state.held) do
  if type(h)~='table' or type(h.operationId)~='string' or type(h.principalHash)~='string' or ids[h.operationId] or type(h.recoveryCommands)~='number' or h.recoveryCommands<0 or h.recoveryCommands%1~=0 or type(h.backgroundCommands)~='number' or h.backgroundCommands<0 or h.backgroundCommands%1~=0 or type(h.transferBytes)~='number' or h.transferBytes<0 or h.transferBytes%1~=0 then return nil,-2 end
  local floor=h.publicTransferFloorBytes
  if floor~=nil then
   if h.operationId=='31c97193-be74-4b9d-b0a3-f3890b0a41e8' or type(floor)~='number' or floor<=0 or floor>2000000000 or floor%1~=0 then return nil,-2 end
   publicFloor=publicFloor+floor
  end
  ids[h.operationId]=true;used.recovery=used.recovery+h.recoveryCommands;used.background=used.background+h.backgroundCommands;totalBytes=totalBytes+h.transferBytes
  if request.operationId and h.operationId==request.operationId then held=h end
 end
 if request.action=='reserve' then
  local allowance=request.globalAllowanceBytes or 0
  if type(allowance)~='number' or allowance<0 or allowance%1~=0 or allowance>2000000000 then return nil,-2 end
  local floor=request.publicTransferFloorBytes
  local finite=request.finitePilot==true
  if request.finitePilot~=nil and (not finite or request.operationId~='ed6c4530-e76f-49e0-8f39-5ec8578820e2' or request.recoveryCommands~=12000 or request.backgroundCommands~=2264 or request.transferBytes~=32251904 or allowance~=9863168 or floor~=46964736 or request.optimizedAdmissionForecast~=true) then return nil,-2 end
  if request.optimizedAdmissionForecast~=nil and (request.optimizedAdmissionForecast~=true or (allowance~=42475520 and not finite) or floor~=46964736) then return nil,-2 end
  if floor~=nil and (request.operationId=='31c97193-be74-4b9d-b0a3-f3890b0a41e8' or type(floor)~='number' or floor<=0 or floor>2000000000 or floor%1~=0 or (floor~=allowance and not (request.optimizedAdmissionForecast==true and (allowance==42475520 or finite) and floor==46964736))) then return nil,-2 end
  if held then if held.principalHash~=request.principalHash then return nil,-3 end;return state,1 end
  if #state.held>=128 or used.recovery+request.recoveryCommands>config.limits.recovery or used.background+request.backgroundCommands>config.limits.background or totalBytes+publicFloor+request.transferBytes+allowance>config.transferBytes then return nil,0 end
  table.insert(state.held,{operationId=request.operationId,principalHash=request.principalHash,recoveryCommands=request.recoveryCommands,backgroundCommands=request.backgroundCommands,transferBytes=request.transferBytes,publicTransferFloorBytes=floor});return state,1
 end
 if request.action=='release' then
  if not held then return state,1 end
  if held.principalHash~=request.principalHash then return nil,-3 end
  local remaining={};for _,h in ipairs(state.held) do if h.operationId~=request.operationId then table.insert(remaining,h) end end;state.held=remaining;return state,1
 end
 local profile=request.profile;local cost=request.commands;local bytes=request.transferBytes
 local denialCommands=request.denialCommands or 4;local denialBytes=request.denialTransferBytes or 4096
 if type(denialCommands)~='number' or denialCommands<4 or denialCommands>9 or denialCommands%1~=0 or type(denialBytes)~='number' or denialBytes<4096 or denialBytes>3149824 or denialBytes%1~=0 then return nil,-2 end
 if not config.limits[profile] or type(cost)~='number' or cost<4 or cost%1~=0 or type(bytes)~='number' or bytes<0 or bytes%1~=0 then return nil,-2 end
 if request.requireOperationHold==true and not held then return nil,-3 end
 if held then
  if request.requiredPublicFloorBytes~=nil and held.publicTransferFloorBytes~=request.requiredPublicFloorBytes then return nil,-3 end
  if held.principalHash~=request.principalHash or (profile~='recovery' and profile~='background') then return nil,-3 end
  local field=profile=='recovery' and 'recoveryCommands' or 'backgroundCommands'
  if held[field]>=cost and held.transferBytes>=bytes then held[field]=held[field]-cost;held.transferBytes=held.transferBytes-bytes;current.used[profile]=current.used[profile]+cost;current.bytes=current.bytes+bytes;return state,1,profile,used[profile] end
  if request.strictHeld==true then current.used.public=current.used.public+denialCommands;current.bytes=current.bytes+denialBytes;return state,0,profile,used[profile],60 end
 end
 -- This is protected headroom, not a second charge or a refund. Public reads
 -- and another new operation cannot spend a new text order's remaining global
 -- allowance. Its legitimate non-public recovery controls still use that room.
 -- Derive it before public-to-recovery transport fallback so that cannot bypass it.
 if request.newAdmission~=nil and type(request.newAdmission)~='boolean' then return nil,-2 end
 local protectedHeadroom=(request.profile=='public' or request.newAdmission==true) and publicFloor or 0
 if used[profile]+cost>config.limits[profile] and profile=='public' and request.recoveryTransport then profile='recovery' end
 if used[profile]+cost>config.limits[profile] or totalBytes+bytes+protectedHeadroom>config.transferBytes then
  -- The denial itself still costs EVAL/GET/TIME/SET. Track that overhead;
  -- it cannot make a provider's physical quota an absolute attack-proof cap.
  current.used.public=current.used.public+denialCommands;current.bytes=current.bytes+denialBytes;return state,0,profile,used[profile],60
 end
 current.used[profile]=current.used[profile]+cost;current.bytes=current.bytes+bytes
 return state,1,profile,used[profile]+cost
end
`;
export const CONTINUOUS_FREE_BUDGET_LUA=`-- continuous-free-command-reservations-v1
${CONTINUOUS_FREE_BUDGET_FUNCTIONS}
local ok,config=pcall(cjson.decode,ARGV[1]);local valid,request=pcall(cjson.decode,ARGV[2]);if not ok or not valid then return {-2,0,'public',60} end
local state,status,profile,used,retry=budget_prepare(redis.call('GET',KEYS[1]),config,request)
if not state then return {status,0,'public',60} end
local raw=cjson.encode(state);if string.len(raw)>262144 then return {-2,0,'public',60} end
redis.call('SET',KEYS[1],raw)
return {status,used or 0,profile or request.profile or 'background',retry or 60}`;
function operationShape(operationId:string,principalHash:string){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(operationId)||!/^[a-f0-9]{64}$/.test(principalHash))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');}
function interpret(result:unknown,configuration:ContinuousFreeConfiguration){
 if(!Array.isArray(result)||result.length!==4||!Number.isSafeInteger(result[1])||Number(result[1])<0||!['public','authenticated','recovery','background'].includes(String(result[2])))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 if(result[0]===0)throw new WorkspaceError('FREE_DEMO_REQUEST_LIMIT',429,60);
 if(result[0]!==1)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 const profile=result[2] as ContinuousFreeProfile;return {profile,reservedCommands:0,used:Number(result[1]),limit:configuration.limits[profile],evidence:'conservative-reservation' as const};
}
export function createContinuousFreeBudgetStore(redis:ContinuousFreeRedis,prefix:string,configuration:ContinuousFreeConfiguration){
 if('use' in redis&&typeof redis.use==='function'){catalogBudgetRedis(redis as Redis);continuousControlBudgetRedis(redis as Redis);}
 const key=continuousFreeBudgetKey(prefix);
 async function debit(request:Record<string,unknown>){try{return interpret(await redis.eval(CONTINUOUS_FREE_BUDGET_LUA,[key],[JSON.stringify(configuration),JSON.stringify(request)]),configuration);}catch(error){if(error instanceof WorkspaceError)throw error;throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');}}
 return {
  async reserve(kind:FreeDemoRequestClass&{operationId?:string;principalHash?:string}){const reservation=continuousFreeReservation(kind);if(kind.operationId!==undefined){operationShape(kind.operationId,kind.principalHash??'');}
   const proof=kind.credentialRead||kind.profile!=='public'&&!kind.bootstrapCreation;
   const result=await debit({action:'debit',profile:kind.profile,newAdmission:kind.newOperation&&kind.workload!=='capacity',...(kind.perOrderProfile==='batch-v1'?{requiredPublicFloorBytes:46964736,requireOperationHold:kind.perOrderHoldRequired===true}:{}),commands:reservation.commands,transferBytes:reservation.transferBytes,denialCommands:4+(proof?4:0)+(kind.operationLookup?1:0),denialTransferBytes:4096+(proof?2097152:0)+(kind.operationLookup?1048576:0),recoveryTransport:kind.recoveryTransport===true&&kind.credentialRead===true&&kind.profile==='public'&&kind.workload==='metadata',...(kind.operationId?{operationId:kind.operationId,principalHash:kind.principalHash,strictHeld:kind.operationId!==recoveryIncident&&compactOperationBudget()}:{} )});noteStarterBootstrapDebit(kind);return {...result,requestedProfile:kind.profile,reservedCommands:reservation.commands,reservedTransferBytes:reservation.transferBytes};},
  async background(input:{operationId?:string;principalHash?:string;commands:number;transferBytes:number;reason:'readiness'|'wake'|'guardian';perOrderProfile?:'batch-v1'}){if(!Number.isSafeInteger(input.commands)||input.commands<1||input.commands>12000||!Number.isSafeInteger(input.transferBytes)||input.transferBytes<0||input.transferBytes>2_000_000_000||!['readiness','wake','guardian'].includes(input.reason))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');if(input.operationId!==undefined)operationShape(input.operationId,input.principalHash??'');const result=await debit({action:'debit',profile:'background',...(input.perOrderProfile==='batch-v1'?{requiredPublicFloorBytes:46964736,requireOperationHold:true}:{}),commands:input.commands+4,transferBytes:input.transferBytes+4096,...(input.operationId?{operationId:input.operationId,principalHash:input.principalHash,strictHeld:input.operationId!==recoveryIncident&&compactOperationBudget()}:{})});return {...result,reservedCommands:input.commands+4};},
 };
}
export async function reserveContinuousFreeBackground(input:Parameters<ReturnType<typeof createContinuousFreeBudgetStore>['background']>[0]){
 const configuration=continuousFreeBudgetConfiguration();if(!configuration)return undefined;
 const url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN,prefix=process.env.BAZAAR_WORKSPACE_PREFIX;
 if(!url||!token||!prefix)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');try{if(new URL(url).protocol!=='https:')throw Error();}catch{throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');}
 return createContinuousFreeBudgetStore(new Redis({url,token,automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false}),prefix,configuration).background(input);
}
export function continuousFreeOperationRequest(operation:ContinuousFreeOperation,immutableOrder?:MarketOrder,environment:Environment=process.env,now=Date.now()){
 operationShape(operation.operationId,operation.principalHash);if(!['reserve','release'].includes(operation.action))throw new WorkspaceError('INVALID_COMMIT_GUARD');
 if(operation.action==='release')return {...operation};
 const config=textRecoveryTransferConfiguration(environment),o=immutableOrder;
 const scoped=Boolean(config&&o&&o.operationId===operation.operationId&&o.operationId!==recoveryIncident&&o.buyerOwnerId===config.buyerOwnerId&&createHash('sha256').update(o.buyerOwnerId).digest('hex')===operation.principalHash&&o.serviceId===recoveryService&&o.card.id===recoveryService&&o.cardHash===environment.BAZAAR_TEXT_SELLER_CARD_HASH&&createHash('sha256').update(o.sellerOwnerId).digest('hex')===environment.BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT&&o.executionMode==='on-demand'&&o.amount==='0.01'&&o.payer==='GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU'&&o.destination==='GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C'&&o.paymentProtocol==='x402-stellar-exact-v2'&&o.card.network==='stellar:testnet'&&isCanonicalUsdcTestnet(o.settlement)&&deliveryStorage(o.card.delivery).mode==='text');
 const external=externalBuyerPilotConfiguration(environment,now),externalScoped=Boolean(config&&o&&o.operationId===operation.operationId&&createHash('sha256').update(o.buyerOwnerId).digest('hex')===operation.principalHash&&external.admissionOpen&&externalBuyerPilotOrderMatches(o,external,now));
 const publicAdmission=publicBuyerConfiguration(environment,now),publicScoped=Boolean(config&&o&&o.operationId===operation.operationId&&createHash('sha256').update(o.buyerOwnerId).digest('hex')===operation.principalHash&&publicAdmission.admissionOpen&&publicBuyerOrderMatches(o,publicAdmission,now));
 const compact=(scoped||externalScoped||publicScoped)&&compactOperationBudget(environment);
 const compactReservation=compactTransportV2(environment)?COMPACT_V2_TEXT_OPERATION_RESERVATION:COMPACT_TEXT_OPERATION_RESERVATION;
 return {...operation,...(scoped||externalScoped||publicScoped?compact?compactReservation:CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION:CONTINUOUS_FREE_OPERATION_RESERVATION),...(compact?{publicTransferFloorBytes:compactReservation.globalAllowanceBytes}:{})};
}

/** Embed inside the native CAS after every native revision guard and before any
 * SET. No side effect is possible until both the budget and native writes fit. */
export function continuousFreeOperationCommitScript(budgetKeyIndex:number,configArgIndex:number,requestArgIndex:number){return `${CONTINUOUS_FREE_BUDGET_FUNCTIONS}
local config=cjson.decode(ARGV[${configArgIndex}]);local request=cjson.decode(ARGV[${requestArgIndex}])
local budget,status=budget_prepare(redis.call('GET',KEYS[${budgetKeyIndex}]),config,request)
if status==0 then return -11 end
if not budget then return status==-3 and -12 or -10 end
if status~=1 then return -11 end
local budgetNext=cjson.encode(budget);if string.len(budgetNext)>262144 then return -10 end
`;}

/** Maintenance may release several definitely unpaid expired orders together.
 * The native caller proves their phases, then compares all of its snapshots.
 * One cached ledger is transformed repeatedly and published only once. */
export function continuousFreeReleaseBatchCommitScript(budgetKeyIndex:number,configArgIndex:number,requestsArgIndex:number){return `${CONTINUOUS_FREE_BUDGET_FUNCTIONS}
local config=cjson.decode(ARGV[${configArgIndex}]);local requests=cjson.decode(ARGV[${requestsArgIndex}])
local budgetRaw=redis.call('GET',KEYS[${budgetKeyIndex}]);if not budgetRaw then return -10 end
if type(requests)~='table' or #requests>20 then return -10 end
local budgetNext=budgetRaw
for _,request in ipairs(requests) do
 if request.action~='release' then return -10 end
 local budget,status=budget_prepare(budgetNext,config,request)
 if not budget or status~=1 then return -10 end
 budgetNext=cjson.encode(budget);if string.len(budgetNext)>262144 then return -10 end
end
`;}
