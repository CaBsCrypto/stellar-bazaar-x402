import { meteredRedis } from './acceptance-meter.ts';
import {finiteGuardianEnabled,guardianPolicyKey,parseGuardianPolicy,initialGuardianPolicy,READ_GUARDIAN_INDEX_POLICY_LUA,CAS_GUARDIAN_POLICY_LUA,claimGuardianBudgetLua,type GuardianPolicy} from './guardian-finite-budget.ts';
import {continuousFreeBudgetConfiguration,continuousFreeBudgetKey} from './continuous-free-budget.ts';
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { WorkspaceError } from './workspace-types.ts';
import { parseServiceCardShape,stellarCreditIdentitySchema } from './service-card-schema.ts';
import type { ServiceCard } from './types.ts';
import {computeCanonicalServiceCardHash} from './canonical-service-card.ts';
import {sha,canonical,orderMemo} from './marketplace-identity.ts';
import {isCanonicalUsdcTestnet,sameCreditIdentity} from './payment-assets.ts';
import {commitCapacityStore,MARKET_CAPACITY_BYTES,type MarketCommitGuard} from './marketplace-capacity.ts';
import {marketFileDeliverySchema,marketFileReservationSchema,validateMarketFiles,marketFileCleanupSchema,MARKET_FILE_CLEANUP_CAPACITY_BYTES,type MarketFileCleanup} from './market-file-delivery-schema.ts';
import {marketRecoverySchema,type MarketRecovery,MARKET_RECOVERY_CAPACITY_BYTES} from './market-retention-schema.ts';
import {sellerCapacitySchema,sellerReservationSchema,type SellerCapacity} from './market-seller-capacity.ts';
import {marketContentExpiresAt} from './market-file-delivery-schema.ts';
import type {MarketX402State} from './marketplace-x402-store.ts';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const account = z.string().regex(/^G[A-Z2-7]{55}$/);
const text = z.string().min(1).max(2000);
export const marketOrderSchema = z.object({
  operationId: z.string().uuid(), buyerOwnerId: z.string(), sellerOwnerId: z.string(),
  serviceId: z.string(), cardHash: hash, card: z.unknown(), input: z.record(z.string(), z.union([z.string().max(2000),z.number().finite(),z.boolean()])),
  payer: account, destination: account, amount: z.string(), memoHash: hash,
  settlement:stellarCreditIdentitySchema.optional(),
  paymentProtocol:z.literal('x402-stellar-exact-v2').optional(), inputHash:hash.optional(),
  settlementAttemptId:z.string().uuid().optional(),
  sellerReservation:sellerReservationSchema.optional(),
  executionMode:z.literal('on-demand').optional(),
  budgetProfile:z.object({version:z.enum(['example-text-wire/v1','example-text-wire/v2','example-text-wire/v3']),bindingHash:hash}).strict().optional(),
  exampleReadinessAttempts:z.number().int().min(0).max(2).optional(),
  textWake:z.object({version:z.literal(1),wakeId:z.string().uuid(),status:z.enum(['pending','dispatching','unconfirmed','completed','needs-operator']),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),attempts:z.number().int().min(0).max(1000),retryAt:z.string().datetime().optional(),leaseExpiresAt:z.string().datetime().optional(),dispatchAttemptId:z.string().uuid().optional()}).strict().optional(),
  phase: z.enum(['awaiting-payment','payment-submitting','payment-uncertain','paid','executing','execution-uncertain','delivered','delivery-failed']),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  transactionHash: hash.optional(), paymentVerifiedAt: z.string().datetime().optional(),
  attemptId: z.string().uuid().optional(), agentId: z.string().optional(),
  delivery: z.object({text,sha256:hash,recordedAt:z.string().datetime(),reference:z.string()}).strict().optional(),
  fileReservation:marketFileReservationSchema.optional(),
  fileDelivery:marketFileDeliverySchema.optional(),
  failure: text.optional(),
  executionUncertainty: text.optional(),
}).strict();
export type MarketOrder = Omit<z.infer<typeof marketOrderSchema>, 'card'> & {card:ServiceCard};
export type MarketService = {submissionId:string;ownerId:string;cardHash:string;card:ServiceCard;withdrawn:boolean;createdAt:string};
const serviceSchema = z.object({submissionId:z.string().uuid(),ownerId:z.string(),cardHash:hash,card:z.unknown(),withdrawn:z.boolean(),createdAt:z.string().datetime()}).strict();
const maintenanceIndexSchema=z.object({version:z.literal(1),nextExpiryAt:z.string().datetime().nullable(),reconciliationDue:z.boolean(),deliveryDue:z.boolean(),operatorAttention:z.boolean().optional()}).strict();
export type MarketMaintenanceIndex=z.infer<typeof maintenanceIndexSchema>;
const stateSchema = z.object({version:z.literal(1),services:z.array(serviceSchema),orders:z.array(marketOrderSchema),
  sellerCapacities:z.array(sellerCapacitySchema).optional(),
  archived:z.array(marketRecoverySchema).optional(),
  fileCleanup:z.array(marketFileCleanupSchema).optional(),
  maintenance:z.object({workspaceCursor:z.string().max(64).optional(),reconciliationCursor:z.string().uuid().optional(),cleanupCursor:z.string().uuid().optional(),lastRunAt:z.string().datetime().optional(),index:maintenanceIndexSchema.optional()}).strict().optional(),
  paused:z.boolean().optional(),
  operatorQuota:z.object({minute:z.number().int(),count:z.number().int().nonnegative()}).strict().optional()}).strict();
export type MarketState = {version:1;services:MarketService[];orders:MarketOrder[];sellerCapacities?:SellerCapacity[];archived?:MarketRecovery[];fileCleanup?:MarketFileCleanup[];maintenance?:{workspaceCursor?:string;reconciliationCursor?:string;cleanupCursor?:string;lastRunAt?:string;index?:MarketMaintenanceIndex};paused?:boolean;operatorQuota?:{minute:number;count:number}};
export interface MarketStore { transact<T>(op:(state:MarketState)=>T,guard?:MarketCommitGuard):Promise<T>;maintenanceIndex?():Promise<{initialized:boolean;index?:MarketMaintenanceIndex}>;finiteGuardianMaintenanceIndex?():Promise<{initialized:boolean;index?:MarketMaintenanceIndex;guardianPolicy?:GuardianPolicy}>;bootstrapMaintenanceIndex?():Promise<{initialized:boolean;index?:MarketMaintenanceIndex}>;compareGuardianPolicy?(expected:GuardianPolicy|undefined,next:GuardianPolicy):Promise<boolean>;initializeGuardianPolicy?(now:number):Promise<boolean>;claimAndPrechargeGuardian?(expected:GuardianPolicy,next:GuardianPolicy):Promise<void> }
/** Projection is persisted with the market CAS. Missing legacy data requires
 * one bounded bootstrap; a missing projection never means there is no work. */
export function recomputeMarketMaintenanceIndex(state:MarketState,settlements?:MarketX402State){
 const expiries=[...state.orders.map(o=>marketContentExpiresAt(o)),...(state.fileCleanup??[]).map(o=>o.firstDeletedAt?new Date(Math.max(Date.parse(o.notBefore),Date.parse(o.firstDeletedAt)+900000)).toISOString():new Date(0).toISOString())].sort();
 const records=new Map((settlements?.records??[]).map(r=>[r.operationId,r]));
 const knownHash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const pendingRecord=(record:MarketX402State['records'][number]|undefined,verified:boolean)=>Boolean(record&&(['verifying','settling','uncertain','settled'].includes(record.phase)||record.phase==='confirmed'&&!verified));
 const pendingOrder=(order:MarketOrder)=>['payment-submitting','payment-uncertain'].includes(order.phase);
 const transactionKnown=(order:MarketOrder)=>{const r=records.get(order.operationId);return knownHash(order.transactionHash)||knownHash(r?.transactionHash)||knownHash(r?.outcome?.transaction);};
 const actionable=(state.archived??[]).some(o=>o.paymentPhase==='uncertain'&&knownHash(o.transactionHash)&&knownHash(o.authorizationFingerprint));
 // A market-only builder cannot disprove a hash in the settlement snapshot.
 // The joint native CAS replaces this conservative result using BOTH revisions,
 // including a hash persisted before the order acknowledgement was lost.
 const reconciliationDue=state.orders.some(o=>(pendingOrder(o)||pendingRecord(records.get(o.operationId),Boolean(o.paymentVerifiedAt)))&&(settlements===undefined||transactionKnown(o)))
  ||(settlements===undefined?(state.archived??[]).some(o=>o.paymentPhase==='uncertain'):actionable);
 const operatorAttention=state.orders.some(o=>['execution-uncertain','delivery-failed'].includes(o.phase)||(pendingOrder(o)||pendingRecord(records.get(o.operationId),Boolean(o.paymentVerifiedAt)))&&!transactionKnown(o))
  ||(state.archived??[]).some(o=>o.paymentPhase==='confirmed'&&o.sellerReservationPending||o.paymentPhase==='uncertain'&&!(knownHash(o.transactionHash)&&knownHash(o.authorizationFingerprint)));
 state.maintenance={...state.maintenance,index:{version:1,nextExpiryAt:expiries[0]??null,reconciliationDue,deliveryDue:state.orders.some(o=>['paid','executing'].includes(o.phase)&&Boolean(o.textWake&&['pending','dispatching','unconfirmed'].includes(o.textWake.status))),operatorAttention}};
 return state.maintenance.index!;
}
export interface MarketRedis {get(key:string):Promise<unknown>;eval(script:string,keys:string[],args:string[]):Promise<unknown>}
export function validateMarketState(raw:unknown):asserts raw is MarketState {
  const s=stateSchema.parse(raw);
  if(new Set((s.sellerCapacities??[]).map(c=>c.serviceId)).size!==(s.sellerCapacities??[]).length||(s.sellerCapacities??[]).some(c=>!s.services.some(v=>v.cardHash===c.cardHash&&v.ownerId===c.ownerId&&(v.card as ServiceCard).id===c.serviceId)||Date.parse(c.leaseExpiresAt)!==Date.parse(c.receivedAt)+360000))throw Error('INVALID_SELLER_CAPACITY');
  const ids=[...s.orders.map(o=>o.operationId),...(s.archived??[]).map(o=>o.operationId)];
  if(new Set(ids).size!==ids.length||Buffer.byteLength(JSON.stringify(s.archived??[]))>MARKET_RECOVERY_CAPACITY_BYTES)throw Error('INVALID_RECOVERY_STATE');
  if(new Set((s.fileCleanup??[]).map(c=>c.operationId)).size!==(s.fileCleanup??[]).length||Buffer.byteLength(JSON.stringify(s.fileCleanup??[]))>MARKET_FILE_CLEANUP_CAPACITY_BYTES||(s.fileCleanup??[]).some(c=>!s.archived?.some(a=>a.operationId===c.operationId&&a.buyerOwnerId===c.buyerOwnerId)))throw Error('INVALID_FILE_CLEANUP_STATE');
  const fingerprints=(s.archived??[]).flatMap(o=>o.authorizationFingerprint?[o.authorizationFingerprint]:[]);
  if(new Set(fingerprints).size!==fingerprints.length)throw Error('INVALID_RECOVERY_STATE');
  if(new Set(s.services.map(v=>v.submissionId)).size!==s.services.length || new Set(s.services.map(v=>(v.card as ServiceCard).id)).size!==s.services.length || new Set(s.orders.map(v=>v.operationId)).size!==s.orders.length) throw Error('INVALID_MARKET_STATE');
  for(const v of [...s.services,...s.orders]) if(!parseServiceCardShape(v.card).ok||computeCanonicalServiceCardHash(v.card as ServiceCard)!==v.cardHash) throw Error('INVALID_MARKET_CARD');
  for(const o of s.orders) {
    const c=o.card as ServiceCard;
    const paymentBound=o.settlement
      ?isCanonicalUsdcTestnet(o.settlement)&&c.payment.asset===o.settlement.code&&c.network===o.settlement.network&&sameCreditIdentity(c.payment.identity,o.settlement)
      :c.payment.asset==='XLM'&&!c.payment.identity;
    if(o.serviceId!==c.id||o.destination!==c.payment.destination||o.amount!==c.payment.amount||!paymentBound||o.memoHash!==orderMemo(o.buyerOwnerId,o.operationId,o.cardHash,o.input))throw Error('INVALID_ORDER_BINDING');
    if(o.paymentProtocol && (o.inputHash!==sha(canonical(o.input)) || !o.settlement || c.payment.marketplace?.protocol!==o.paymentProtocol))throw Error('INVALID_X402_ORDER_BINDING');
    if(o.exampleReadinessAttempts!==undefined&&!o.budgetProfile)throw Error('INVALID_EXAMPLE_READINESS_BUDGET');
    if(o.budgetProfile&&o.textWake&&o.textWake.attempts>3)throw Error('INVALID_EXAMPLE_WAKE_BUDGET');
    if(o.paymentProtocol&&o.phase!=='awaiting-payment'&&!o.settlementAttemptId)throw Error('MISSING_X402_ATTEMPT');
    if(!o.paymentProtocol && (o.inputHash!==undefined || o.settlementAttemptId!==undefined))throw Error('INVALID_LEGACY_ORDER_BINDING');
    if(o.delivery&&(o.delivery.sha256!==sha(o.delivery.text)||o.delivery.reference!==`bazaar-order:${o.operationId}`))throw Error('INVALID_DELIVERY_BINDING');
    if(o.phase!=='awaiting-payment'&&!o.transactionHash && !(o.paymentProtocol && ['payment-submitting','payment-uncertain'].includes(o.phase) && o.settlementAttemptId)) throw Error('MISSING_TRANSACTION');
    if(['paid','executing','execution-uncertain','delivered','delivery-failed'].includes(o.phase)&&!o.transactionHash)throw Error('MISSING_TRANSACTION');
    if(['paid','executing','execution-uncertain','delivered','delivery-failed'].includes(o.phase)&&!o.paymentVerifiedAt) throw Error('MISSING_VERIFICATION');
    if(['executing','execution-uncertain','delivered','delivery-failed'].includes(o.phase)&&(!o.attemptId||!o.agentId)) throw Error('MISSING_CLAIM');
    if(o.phase==='execution-uncertain'&&!o.executionUncertainty)throw Error('MISSING_EXECUTION_UNCERTAINTY');
    if(o.textWake&&(o.executionMode!=='on-demand'||!o.paymentVerifiedAt||!o.transactionHash||o.textWake.createdAt>o.textWake.updatedAt||o.textWake.status==='completed'&&!['delivered','delivery-failed'].includes(o.phase)||o.textWake.status==='needs-operator'&&o.phase!=='execution-uncertain'))throw Error('INVALID_TEXT_WAKE');
    if((o.phase==='delivered')!==Boolean(o.delivery)) throw Error('INVALID_DELIVERY_PHASE');
    validateMarketFiles(o as MarketOrder);
  }
}
export function marketPrefix(){const p=process.env.BAZAAR_MARKET_PREFIX;if(!/^bazaar-market:pilot-[a-f0-9]{32}$/.test(p??''))throw new WorkspaceError('MARKET_UNAVAILABLE');return p!;}
const CAS=`local old=redis.call('GET',KEYS[1])
if ARGV[1]=='missing' then if old then return 0 end else if not old or old~=ARGV[2] then return 0 end end
redis.call('SET',KEYS[1],ARGV[3]); return 1`;
/** Pure callbacks only. A lost acknowledgement is never retried. */
export function createMarketStore(redis:MarketRedis,prefix:string):MarketStore {
  if(!/^bazaar-market:pilot-[a-f0-9]{32}$/.test(prefix))throw new WorkspaceError('MARKET_UNAVAILABLE');
  const key=prefix+':state';
  const store:MarketStore={async transact(op,guard){
    const raw=await redis.get(key);let state:MarketState;
    if(raw===null)state={version:1,services:[],orders:[]};
    else {if(typeof raw!=='string'||Buffer.byteLength(raw)>MARKET_CAPACITY_BYTES)throw new WorkspaceError('MARKET_UNAVAILABLE');const envelope=JSON.parse(raw);if(envelope.version!==1||typeof envelope.revision!=='string'||Object.keys(envelope).sort().join(',')!=='revision,state,version')throw new WorkspaceError('MARKET_UNAVAILABLE');state=envelope.state;}
    validateMarketState(state);const before=JSON.stringify(state),result=op(state);if(result instanceof Promise)throw Error('ASYNC_MARKET_CALLBACK_FORBIDDEN');
    if(process.env.BAZAAR_FREE_DEMO_MODE==='continuous'&&(before!==JSON.stringify(state)||!state.maintenance?.index))recomputeMarketMaintenanceIndex(state);
    validateMarketState(state);
    if(before!==JSON.stringify(state)){
      const next=JSON.stringify({version:1,revision:randomUUID(),state});
      if(Buffer.byteLength(next)>MARKET_CAPACITY_BYTES)throw new WorkspaceError('MARKET_CAPACITY',503);
      await commitCapacityStore(redis,prefix,'market',raw as string|null,next,guard);
    }else if(guard)await commitCapacityStore(redis,prefix,'market',raw as string|null,null,guard);
    return structuredClone(result);
  },async maintenanceIndex(){
    const raw=await redis.get(prefix+':maintenance-index:v1');
    if(raw===null)return {initialized:false};
    if(typeof raw!=='string'||Buffer.byteLength(raw)>512)throw new WorkspaceError('MAINTENANCE_UNAVAILABLE',503);
    return {initialized:true,index:maintenanceIndexSchema.parse(JSON.parse(raw))};
  },async finiteGuardianMaintenanceIndex(){
    if(!finiteGuardianEnabled())throw new WorkspaceError('GUARDIAN_POLICY_DISABLED',503);
    const packet=await redis.eval(READ_GUARDIAN_INDEX_POLICY_LUA,[prefix+':maintenance-index:v1',guardianPolicyKey(prefix)],[]);
    if(!Array.isArray(packet)||packet.length!==2||packet.some(v=>typeof v!=='string'))throw new WorkspaceError('GUARDIAN_POLICY_UNAVAILABLE',503);
    const raw=packet[0]||null,policy=parseGuardianPolicy(packet[1]||null);
    if(raw===null)return {initialized:false,...(policy?{guardianPolicy:policy}:{})};
    if(typeof raw!=='string'||Buffer.byteLength(raw)>512)throw new WorkspaceError('MAINTENANCE_UNAVAILABLE',503);
    return {initialized:true,index:maintenanceIndexSchema.parse(JSON.parse(raw)),...(policy?{guardianPolicy:policy}:{})};
  },async compareGuardianPolicy(expected,next){
    if(!finiteGuardianEnabled())throw new WorkspaceError('GUARDIAN_POLICY_DISABLED',503);
    const nextRaw=JSON.stringify(next);parseGuardianPolicy(nextRaw);if(expected)parseGuardianPolicy(JSON.stringify(expected));
    const result=await redis.eval(CAS_GUARDIAN_POLICY_LUA,[guardianPolicyKey(prefix)],[expected===undefined?'missing':'present',expected===undefined?'':JSON.stringify(expected),nextRaw]);
    if(result!==0&&result!==1)throw new WorkspaceError('GUARDIAN_POLICY_WRITE_UNCONFIRMED',503);return result===1;
  },async initializeGuardianPolicy(now){return store.compareGuardianPolicy!(undefined,initialGuardianPolicy(now));},
  async claimAndPrechargeGuardian(expected,next){
    if(!finiteGuardianEnabled())throw new WorkspaceError('GUARDIAN_POLICY_DISABLED',503);
    const expectedRaw=JSON.stringify(expected),nextRaw=JSON.stringify(next);parseGuardianPolicy(expectedRaw);parseGuardianPolicy(nextRaw);
    const configuration=continuousFreeBudgetConfiguration(),workspace=process.env.BAZAAR_WORKSPACE_PREFIX;
    if(!configuration||workspace!==prefix.replace('bazaar-market:','bazaar-workspace:'))throw new WorkspaceError('GUARDIAN_POLICY_CONFIGURATION',503);
    const result=await redis.eval(claimGuardianBudgetLua(),[guardianPolicyKey(prefix),continuousFreeBudgetKey(workspace!)],[expectedRaw,nextRaw,JSON.stringify(configuration)]);
    if(!Array.isArray(result)||result.length!==4||result[0]!==1||!Number.isSafeInteger(result[1])||result[2]!=='background')throw new WorkspaceError(Array.isArray(result)&&result[0]===0?'GUARDIAN_MAINTENANCE_CAPACITY':Array.isArray(result)&&result[0]===-2?'GUARDIAN_INITIAL_CREDIT_UNCONFIRMED':'GUARDIAN_PRECHARGE_ACK_UNCONFIRMED',503,60);
  },
  async bootstrapMaintenanceIndex(){await store.transact(s=>{recomputeMarketMaintenanceIndex(s);});return store.maintenanceIndex!();}};return store;
}
let injected:MarketStore|undefined;
export function setMarketStoreForTests(store:MarketStore|undefined){injected=store;}
export function configuredMarketStore():MarketStore {
  if(injected)return injected;
  const url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN;
  if(!url||!token||new URL(url).protocol!=='https:')throw new WorkspaceError('MARKET_UNAVAILABLE');
  return createMarketStore(meteredRedis(new Redis({url,token,automaticDeserialization:false,retry:false,enableAutoPipelining:false})),marketPrefix());
}
