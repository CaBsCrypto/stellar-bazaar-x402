import { meteredRedis } from './acceptance-meter.ts';
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
  phase: z.enum(['awaiting-payment','payment-submitting','payment-uncertain','paid','executing','execution-uncertain','delivered','delivery-failed']),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  transactionHash: hash.optional(), paymentVerifiedAt: z.string().datetime().optional(),
  attemptId: z.string().uuid().optional(), agentId: z.string().optional(),
  delivery: z.object({text,sha256:hash,recordedAt:z.string().datetime(),reference:z.string()}).strict().optional(),
  failure: text.optional(),
  executionUncertainty: text.optional(),
}).strict();
export type MarketOrder = Omit<z.infer<typeof marketOrderSchema>, 'card'> & {card:ServiceCard};
export type MarketService = {submissionId:string;ownerId:string;cardHash:string;card:ServiceCard;withdrawn:boolean;createdAt:string};
const serviceSchema = z.object({submissionId:z.string().uuid(),ownerId:z.string(),cardHash:hash,card:z.unknown(),withdrawn:z.boolean(),createdAt:z.string().datetime()}).strict();
const stateSchema = z.object({version:z.literal(1),services:z.array(serviceSchema),orders:z.array(marketOrderSchema),
  paused:z.boolean().optional(),
  operatorQuota:z.object({minute:z.number().int(),count:z.number().int().nonnegative()}).strict().optional()}).strict();
export type MarketState = {version:1;services:MarketService[];orders:MarketOrder[];paused?:boolean;operatorQuota?:{minute:number;count:number}};
export interface MarketStore { transact<T>(op:(state:MarketState)=>T,guard?:MarketCommitGuard):Promise<T> }
export interface MarketRedis {get(key:string):Promise<unknown>;eval(script:string,keys:string[],args:string[]):Promise<unknown>}
export function validateMarketState(raw:unknown):asserts raw is MarketState {
  const s=stateSchema.parse(raw);
  if(new Set(s.services.map(v=>v.submissionId)).size!==s.services.length || new Set(s.services.map(v=>(v.card as ServiceCard).id)).size!==s.services.length || new Set(s.orders.map(v=>v.operationId)).size!==s.orders.length) throw Error('INVALID_MARKET_STATE');
  for(const v of [...s.services,...s.orders]) if(!parseServiceCardShape(v.card).ok||computeCanonicalServiceCardHash(v.card as ServiceCard)!==v.cardHash) throw Error('INVALID_MARKET_CARD');
  for(const o of s.orders) {
    const c=o.card as ServiceCard;
    const paymentBound=o.settlement
      ?isCanonicalUsdcTestnet(o.settlement)&&c.payment.asset===o.settlement.code&&c.network===o.settlement.network&&sameCreditIdentity(c.payment.identity,o.settlement)
      :c.payment.asset==='XLM'&&!c.payment.identity;
    if(o.serviceId!==c.id||o.destination!==c.payment.destination||o.amount!==c.payment.amount||!paymentBound||o.memoHash!==orderMemo(o.buyerOwnerId,o.operationId,o.cardHash,o.input))throw Error('INVALID_ORDER_BINDING');
    if(o.paymentProtocol && (o.inputHash!==sha(canonical(o.input)) || !o.settlement || c.payment.marketplace?.protocol!==o.paymentProtocol))throw Error('INVALID_X402_ORDER_BINDING');
    if(o.paymentProtocol&&o.phase!=='awaiting-payment'&&!o.settlementAttemptId)throw Error('MISSING_X402_ATTEMPT');
    if(!o.paymentProtocol && (o.inputHash!==undefined || o.settlementAttemptId!==undefined))throw Error('INVALID_LEGACY_ORDER_BINDING');
    if(o.delivery&&(o.delivery.sha256!==sha(o.delivery.text)||o.delivery.reference!==`bazaar-order:${o.operationId}`))throw Error('INVALID_DELIVERY_BINDING');
    if(o.phase!=='awaiting-payment'&&!o.transactionHash && !(o.paymentProtocol && ['payment-submitting','payment-uncertain'].includes(o.phase) && o.settlementAttemptId)) throw Error('MISSING_TRANSACTION');
    if(['paid','executing','execution-uncertain','delivered','delivery-failed'].includes(o.phase)&&!o.transactionHash)throw Error('MISSING_TRANSACTION');
    if(['paid','executing','execution-uncertain','delivered','delivery-failed'].includes(o.phase)&&!o.paymentVerifiedAt) throw Error('MISSING_VERIFICATION');
    if(['executing','execution-uncertain','delivered','delivery-failed'].includes(o.phase)&&(!o.attemptId||!o.agentId)) throw Error('MISSING_CLAIM');
    if(o.phase==='execution-uncertain'&&!o.executionUncertainty)throw Error('MISSING_EXECUTION_UNCERTAINTY');
    if((o.phase==='delivered')!==Boolean(o.delivery)) throw Error('INVALID_DELIVERY_PHASE');
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
  return {async transact(op,guard){
    const raw=await redis.get(key);let state:MarketState;
    if(raw===null)state={version:1,services:[],orders:[]};
    else {if(typeof raw!=='string'||Buffer.byteLength(raw)>MARKET_CAPACITY_BYTES)throw new WorkspaceError('MARKET_UNAVAILABLE');const envelope=JSON.parse(raw);if(envelope.version!==1||typeof envelope.revision!=='string'||Object.keys(envelope).sort().join(',')!=='revision,state,version')throw new WorkspaceError('MARKET_UNAVAILABLE');state=envelope.state;}
    validateMarketState(state);const before=JSON.stringify(state),result=op(state);if(result instanceof Promise)throw Error('ASYNC_MARKET_CALLBACK_FORBIDDEN');validateMarketState(state);
    if(before!==JSON.stringify(state)){
      const next=JSON.stringify({version:1,revision:randomUUID(),state});
      if(Buffer.byteLength(next)>MARKET_CAPACITY_BYTES)throw new WorkspaceError('MARKET_CAPACITY',409);
      await commitCapacityStore(redis,prefix,'market',raw as string|null,next,guard);
    }else if(guard)await commitCapacityStore(redis,prefix,'market',raw as string|null,null,guard);
    return structuredClone(result);
  }};
}
let injected:MarketStore|undefined;
export function setMarketStoreForTests(store:MarketStore|undefined){injected=store;}
export function configuredMarketStore():MarketStore {
  if(injected)return injected;
  const url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN;
  if(!url||!token||new URL(url).protocol!=='https:')throw new WorkspaceError('MARKET_UNAVAILABLE');
  return createMarketStore(meteredRedis(new Redis({url,token,automaticDeserialization:false,retry:false,enableAutoPipelining:false})),marketPrefix());
}
