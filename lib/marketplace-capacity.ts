import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {WorkspaceError} from './workspace-types.ts';
import {sha,canonical} from './marketplace-identity.ts';
import {validateMarketState,type MarketRedis,type MarketOrder,type MarketState} from './marketplace-store.ts';
import {validateMarketX402State,type MarketX402State,type MarketX402Settlement} from './marketplace-x402-store.ts';

export const MARKET_CAPACITY_BYTES=524288;
export const SETTLEMENT_CAPACITY_BYTES=131072;
export const RESERVATION_CAPACITY_BYTES=65536;
export type MarketCommitGuard={keys:string[];values:(string|null)[]};
type Entry={operationId:string;binding:string;marketMaximumBytes:number;settlementMaximumBytes:number};
const ledgerSchema=z.object({version:z.literal(1),revision:z.string().uuid(),entries:z.array(z.object({operationId:z.string().uuid(),binding:z.string().regex(/^[a-f0-9]{64}$/),marketMaximumBytes:z.number().int().positive(),settlementMaximumBytes:z.number().int().nonnegative()}).strict())}).strict();
type Ledger=z.infer<typeof ledgerSchema>;
const bytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value),'utf8');
const widestText='\u0000'.repeat(2000); // Six JSON bytes per UTF-16 character, including escaping.
const uuid='ffffffff-ffff-4fff-bfff-ffffffffffff',digest='f'.repeat(64),date='9999-12-31T23:59:59.999Z';
function binding(o:MarketOrder){return sha(canonical({operationId:o.operationId,owner:o.buyerOwnerId,protocol:o.paymentProtocol,cardHash:o.cardHash,inputHash:o.inputHash,payer:o.payer,destination:o.destination,amount:o.amount,settlement:o.settlement}));}
/** Immutable card/input/payload bytes plus the widest allowed future fields. */
export function maximumMarketRecordBytes(o:MarketOrder){return bytes({...o,phase:'delivered',updatedAt:date,settlementAttemptId:uuid,transactionHash:digest,paymentVerifiedAt:date,attemptId:uuid,agentId:'agent_'+digest.slice(0,32),executionUncertainty:widestText,failure:widestText,delivery:{text:widestText,sha256:digest,recordedAt:date,reference:'bazaar-order:'+o.operationId}});}
export function maximumSettlementRecordBytes(r:MarketX402Settlement){return bytes({...r,phase:'confirmed',updatedAt:date,attemptId:uuid,payloadHash:digest,authorizationFingerprint:digest,transactionHash:digest,responseHash:digest,outcome:{success:true,network:'stellar:testnet',transaction:digest,payer:'G'+'A'.repeat(55)}});}
function envelope<T>(raw:string|null,empty:T,cap:number):T{
 if(raw===null)return empty;
 if(typeof raw!=='string'||Buffer.byteLength(raw)>cap)throw new WorkspaceError('CAPACITY_STATE_UNAVAILABLE');
 try{const e=JSON.parse(raw);if(e?.version!==1||typeof e.revision!=='string'||Object.keys(e).sort().join(',')!=='revision,state,version'||e.state?.version!==1)throw Error();return e.state as T;}catch{throw new WorkspaceError('CAPACITY_STATE_UNAVAILABLE');}
}
function ledger(raw:string|null):Ledger{
 if(raw===null)return {version:1,revision:randomUUID(),entries:[]};
 if(Buffer.byteLength(raw)>RESERVATION_CAPACITY_BYTES)throw new WorkspaceError('CAPACITY_STATE_UNAVAILABLE');
 try{const value=ledgerSchema.parse(JSON.parse(raw));if(new Set(value.entries.map(e=>e.operationId)).size!==value.entries.length)throw Error();return value;}catch{throw new WorkspaceError('CAPACITY_STATE_UNAVAILABLE');}
}
export function capacityReservationKey(prefix:string){return prefix+':capacity-reservations:v1';}
function snapshot(marketRaw:string|null,settlementRaw:string|null){
 const market=envelope<MarketState>(marketRaw,{version:1,services:[],orders:[]},MARKET_CAPACITY_BYTES);
 const settlements=envelope<MarketX402State>(settlementRaw,{version:1,records:[]},SETTLEMENT_CAPACITY_BYTES);
 if(!Array.isArray(market.orders)||!Array.isArray(market.services)||!Array.isArray(settlements.records))throw new WorkspaceError('CAPACITY_STATE_UNAVAILABLE');
 try{validateMarketState(market);validateMarketX402State(settlements);}catch{throw new WorkspaceError('CAPACITY_STATE_UNAVAILABLE');}
 return {market,settlements};
}
export function projectCapacity(marketRaw:string|null,settlementRaw:string|null,ledgerRaw:string|null){
 const {market,settlements}=snapshot(marketRaw,settlementRaw),next=ledger(ledgerRaw),orders=new Map(market.orders.map(o=>[o.operationId,o])),records=new Map(settlements.records.map(r=>[r.operationId,r]));
 const entries=new Map(next.entries.map(e=>[e.operationId,e]));
 // Older paid orders keep their completion capacity without changing historical records.
 for(const o of market.orders.filter(o=>!o.paymentProtocol&&o.phase!=='awaiting-payment')){
  if(['delivered','delivery-failed'].includes(o.phase)){entries.delete(o.operationId);continue;}
  const old=entries.get(o.operationId),wanted:Entry={operationId:o.operationId,binding:binding(o),marketMaximumBytes:maximumMarketRecordBytes(o),settlementMaximumBytes:0};
  if(old&&(old.binding!==wanted.binding||old.marketMaximumBytes<wanted.marketMaximumBytes||old.settlementMaximumBytes!==0))throw new WorkspaceError('CAPACITY_BINDING_CHANGED',409);
  if(!old)entries.set(o.operationId,wanted);
 }
 for(const r of settlements.records){
  const o=orders.get(r.operationId);
  if(!o)throw new WorkspaceError('CAPACITY_STATE_UNAVAILABLE');
  const terminal=r.phase==='rejected'||(r.phase==='confirmed'&&['delivered','delivery-failed'].includes(o.phase));
  if(terminal){entries.delete(r.operationId);continue;}
  if(r.phase==='challenged')continue;
  if(!r.payload||!r.payloadHash||r.orderBinding!==binding(o))throw new WorkspaceError('CAPACITY_BINDING_CHANGED',409);
  const old=entries.get(r.operationId),wanted:Entry={operationId:r.operationId,binding:binding(o),marketMaximumBytes:maximumMarketRecordBytes(o),settlementMaximumBytes:maximumSettlementRecordBytes(r)};
  if(old&&(old.binding!==wanted.binding||old.marketMaximumBytes<wanted.marketMaximumBytes||old.settlementMaximumBytes<wanted.settlementMaximumBytes))throw new WorkspaceError('CAPACITY_BINDING_CHANGED',409);
  if(!old)entries.set(r.operationId,wanted);
 }
 let marketRemaining=0,settlementRemaining=0;
 for(const e of entries.values()){
  const o=orders.get(e.operationId),r=records.get(e.operationId);
  if(!o||(!r&&e.settlementMaximumBytes!==0)||e.binding!==binding(o))throw new WorkspaceError('CAPACITY_BINDING_CHANGED',409);
  const marketGrowth=e.marketMaximumBytes-bytes(o),settlementGrowth=e.settlementMaximumBytes-(r?bytes(r):0);
  if(marketGrowth<0||settlementGrowth<0)throw new WorkspaceError('CAPACITY_BINDING_CHANGED',409);
  marketRemaining+=marketGrowth;settlementRemaining+=settlementGrowth;
 }
 const marketUsed=marketRaw===null?0:Buffer.byteLength(marketRaw),settlementUsed=settlementRaw===null?0:Buffer.byteLength(settlementRaw);
 if(marketUsed+marketRemaining>MARKET_CAPACITY_BYTES)throw new WorkspaceError('MARKET_CAPACITY',503);
 if(settlementUsed+settlementRemaining>SETTLEMENT_CAPACITY_BYTES)throw new WorkspaceError('X402_SETTLEMENT_CAPACITY',503);
 next.entries=[...entries.values()].sort((a,b)=>a.operationId<b.operationId?-1:1);
 // Revisions are replaced only when the auxiliary document really changes.
 const changed=ledgerRaw===null?next.entries.length>0:canonical(next.entries)!==canonical(ledger(ledgerRaw).entries);
 if(changed)next.revision=randomUUID();
 const serialized=JSON.stringify(next);
 if(Buffer.byteLength(serialized)>RESERVATION_CAPACITY_BYTES)throw new WorkspaceError('MARKET_CAPACITY',503);
 return {ledgerRaw:changed?serialized:ledgerRaw,marketUsed,settlementUsed,marketRemaining,settlementRemaining};
}

/** All three revisions and permission snapshots are checked in one atomic write.
 * No loop, lease, transport retry, or automatic CAS retry occurs in this script. */
export const MARKET_CAPACITY_CAS=`-- bazaar-market-capacity-cas-v1
local market=redis.call('GET',KEYS[1])
local settlement=redis.call('GET',KEYS[2])
local ledger=redis.call('GET',KEYS[3])
if ARGV[1]=='missing' then if market then return 0 end else if not market or market~=ARGV[2] then return 0 end end
if ARGV[3]=='missing' then if settlement then return 0 end else if not settlement or settlement~=ARGV[4] then return 0 end end
if ARGV[5]=='missing' then if ledger then return 0 end else if not ledger or ledger~=ARGV[6] then return 0 end end
if ARGV[10]~='unchecked' then
 local guard=redis.call('GET',KEYS[4])
 if ARGV[10]=='missing' then if guard then return 0 end else if not guard or guard~=ARGV[11] then return 0 end end
end
if ARGV[12]~='unchecked' then
 local guard=redis.call('GET',KEYS[5])
 if ARGV[12]=='missing' then if guard then return 0 end else if not guard or guard~=ARGV[13] then return 0 end end
end
if ARGV[7]~='' then redis.call('SET',KEYS[1],ARGV[7]) end
if ARGV[8]~='' then redis.call('SET',KEYS[2],ARGV[8]) end
if ARGV[9]~='' then redis.call('SET',KEYS[3],ARGV[9]) end
return 1`;

export async function commitCapacityStore(redis:MarketRedis,prefix:string,kind:'market'|'settlement',expectedRaw:string|null,nextRaw:string|null,guard?:MarketCommitGuard){
 const marketKey=prefix+':state',settlementKey=prefix+':x402-settlements:state',ledgerKey=capacityReservationKey(prefix);
 if(guard&&(guard.keys.length!==guard.values.length||guard.keys.length>2||guard.keys.some(k=>typeof k!=='string'||!k||k.length>256)||guard.values.some(v=>v!==null&&(typeof v!=='string'||Buffer.byteLength(v)>1048576))))throw new WorkspaceError('INVALID_COMMIT_GUARD');
 const other=await redis.get(kind==='market'?settlementKey:marketKey),storedLedger=await redis.get(ledgerKey);
 if((other!==null&&typeof other!=='string')||(storedLedger!==null&&typeof storedLedger!=='string'))throw new WorkspaceError('CAPACITY_STATE_UNAVAILABLE');
 const oldMarket=kind==='market'?expectedRaw:other as string|null,oldSettlement=kind==='settlement'?expectedRaw:other as string|null;
 const newMarket=kind==='market'?(nextRaw??oldMarket):oldMarket,newSettlement=kind==='settlement'?(nextRaw??oldSettlement):oldSettlement;
 const projected=projectCapacity(newMarket,newSettlement,storedLedger as string|null);
 const before=snapshot(oldMarket,oldSettlement),after=snapshot(newMarket,newSettlement);
 if(kind==='settlement'&&before.market.paused&&after.settlements.records.some(r=>['verifying','settling'].includes(r.phase)&&before.settlements.records.find(old=>old.operationId===r.operationId)?.phase!==r.phase))throw new WorkspaceError('PURCHASES_PAUSED',503);
 const expected=(raw:string|null)=>[raw===null?'missing':'present',raw??''];
 const keys=[marketKey,settlementKey,ledgerKey,...(guard?.keys??[])];
 const args=[...expected(oldMarket),...expected(oldSettlement),...expected(storedLedger as string|null),kind==='market'?(nextRaw??''):'',kind==='settlement'?(nextRaw??''):'',projected.ledgerRaw!==storedLedger?(projected.ledgerRaw??''):''];
 for(let i=0;i<2;i++)args.push(...(guard&&i<guard.keys.length?expected(guard.values[i]):['unchecked','']));
 if(await redis.eval(MARKET_CAPACITY_CAS,keys,args)!==1)throw new WorkspaceError('CAPACITY_WRITE_UNCONFIRMED',409);
 return projected;
}
