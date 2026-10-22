import {randomUUID} from 'node:crypto';
import {Redis} from '@upstash/redis';
import {z} from 'zod';
import type {PaymentPayload,PaymentRequired,SettleResponse} from '@x402/core/types';
import {meteredRedis} from './acceptance-meter.ts';
import {marketPrefix,type MarketRedis} from './marketplace-store.ts';
import {WorkspaceError} from './workspace-types.ts';
import {commitCapacityStore,SETTLEMENT_CAPACITY_BYTES,type MarketCommitGuard} from './marketplace-capacity.ts';
import {readMarketTransportValue} from './free-plan-transport-profile.ts';

/** Signed authorizations never enter the public order or the seller's MCP DTO. */
export interface MarketX402Settlement {
  operationId:string;buyerOwnerId:string;orderBinding:string;challenge:PaymentRequired;
  phase:'challenged'|'verifying'|'rejected'|'settling'|'uncertain'|'settled'|'confirmed';
  createdAt:string;updatedAt:string;attemptId?:string;payload?:PaymentPayload;
  payloadHash?:string;authorizationFingerprint?:string;outcome?:SettleResponse;
  transactionHash?:string;responseHash?:string;
  lastFailure?:MarketX402PaymentFailure;
}
export const marketX402PaymentFailureSchema=z.object({
 stage:z.enum(['verify','before-settle','settle','outcome-save','chain-confirm']),
 code:z.enum(['FACILITATOR_HTTP_REJECTED','FACILITATOR_TIMEOUT','FACILITATOR_NETWORK_UNCONFIRMED','FACILITATOR_JSON_INVALID','FACILITATOR_RESPONSE_BOUND','FACILITATOR_REDIRECT_BLOCKED','PAYMENT_STATE_WRITE_UNCONFIRMED','PAYMENT_RUNTIME_UNCONFIRMED']),
 httpStatus:z.number().int().min(100).max(599).optional(),
 // This is bounded-fetch evidence, never proof of an on-chain submission.
 // Absence means no transport evidence was available.
 dispatchStarted:z.boolean().optional(),at:z.string().datetime(),
}).strict().refine(value=>Buffer.byteLength(JSON.stringify(value),'utf8')<=256,'Payment diagnostic exceeds its fixed bound');
export type MarketX402PaymentFailure=z.infer<typeof marketX402PaymentFailureSchema>;
export const MARKET_X402_PAYMENT_FAILURE_MAX_BYTES=256;
export type MarketX402State={version:1;records:MarketX402Settlement[]};
export interface MarketX402Store{transact<T>(op:(state:MarketX402State)=>T,guard?:MarketCommitGuard):Promise<T>}
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const recordSchema=z.object({operationId:z.string().uuid(),buyerOwnerId:z.string().min(1),orderBinding:hash,
 challenge:z.unknown(),phase:z.enum(['challenged','verifying','rejected','settling','uncertain','settled','confirmed']),
 createdAt:z.string().datetime(),updatedAt:z.string().datetime(),attemptId:z.string().uuid().optional(),
 payload:z.unknown().optional(),payloadHash:hash.optional(),authorizationFingerprint:hash.optional(),outcome:z.unknown().optional(),transactionHash:hash.optional(),responseHash:hash.optional(),lastFailure:marketX402PaymentFailureSchema.optional()}).strict();
const stateSchema=z.object({version:z.literal(1),records:z.array(recordSchema)}).strict();
export function validateMarketX402State(raw:unknown):asserts raw is MarketX402State{
 const state=stateSchema.parse(raw);
 if(new Set(state.records.map(r=>r.operationId)).size!==state.records.length)throw Error('INVALID_X402_SETTLEMENT');
 const fingerprints=state.records.filter(r=>r.authorizationFingerprint).map(r=>r.authorizationFingerprint);
 if(new Set(fingerprints).size!==fingerprints.length)throw Error('INVALID_X402_SETTLEMENT');
 for(const record of state.records){
  const challenge=record.challenge as PaymentRequired;
  if(!challenge||challenge.x402Version!==2||!Array.isArray(challenge.accepts)||challenge.accepts.length!==1||!challenge.resource)throw Error('INVALID_X402_CHALLENGE');
  if(record.phase!=='challenged'&&(!record.attemptId||!record.payload||!record.payloadHash||!record.authorizationFingerprint))throw Error('MISSING_X402_ATTEMPT');
  if(['settled','confirmed'].includes(record.phase)){
   const outcome=record.outcome as SettleResponse;
   if(!outcome||outcome.success!==true||outcome.network!=='stellar:testnet'||!/^[a-f0-9]{64}$/.test(outcome.transaction)||typeof outcome.payer!=='string')throw Error('INVALID_X402_OUTCOME');
  }
 }
}
// Permanent records, no expiry, lease, transport retry or CAS retry.
export const MARKET_X402_CAS=`local old=redis.call('GET',KEYS[1])
if ARGV[1]=='missing' then if old then return 0 end else if not old or old~=ARGV[2] then return 0 end end
redis.call('SET',KEYS[1],ARGV[3]); return 1`;
export function marketX402SettlementKey(prefix=marketPrefix()){return prefix+':x402-settlements:state';}
export function createMarketX402Store(redis:MarketRedis,prefix:string):MarketX402Store{
 if(!/^bazaar-market:pilot-[a-f0-9]{32}$/.test(prefix))throw new WorkspaceError('MARKET_UNAVAILABLE');
 const key=marketX402SettlementKey(prefix);
 return {async transact(op,guard){
  const raw=await readMarketTransportValue(redis,key,SETTLEMENT_CAPACITY_BYTES);let state:MarketX402State;
  if(raw===null)state={version:1,records:[]};else{
   if(typeof raw!=='string'||Buffer.byteLength(raw)>SETTLEMENT_CAPACITY_BYTES)throw new WorkspaceError('X402_SETTLEMENT_UNAVAILABLE');
   const envelope=JSON.parse(raw);if(envelope.version!==1||typeof envelope.revision!=='string'||Object.keys(envelope).sort().join(',')!=='revision,state,version')throw new WorkspaceError('X402_SETTLEMENT_UNAVAILABLE');state=envelope.state;
  }
  validateMarketX402State(state);const before=JSON.stringify(state),result=op(state);
  if(result instanceof Promise)throw Error('ASYNC_SETTLEMENT_CALLBACK_FORBIDDEN');
  validateMarketX402State(state);
  if(before!==JSON.stringify(state)){
   const next=JSON.stringify({version:1,revision:randomUUID(),state});
   if(Buffer.byteLength(next)>SETTLEMENT_CAPACITY_BYTES)throw new WorkspaceError('X402_SETTLEMENT_CAPACITY',409);
   await commitCapacityStore(redis,prefix,'settlement',raw as string|null,next,guard);
  }
  return structuredClone(result);
 }};
}
let injected:MarketX402Store|undefined;
export function setMarketX402StoreForTests(store:MarketX402Store|undefined){injected=store;}
export function configuredMarketX402Store():MarketX402Store{
 if(injected)return injected;
 const url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN;
 if(!url||!token||new URL(url).protocol!=='https:')throw new WorkspaceError('MARKET_UNAVAILABLE');
 return createMarketX402Store(meteredRedis(new Redis({url,token,automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false})),marketPrefix());
}
