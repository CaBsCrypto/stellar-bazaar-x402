import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {WorkspaceError} from './workspace-types.ts';
import {recordOperationalStorageBounds} from './acceptance-meter.ts';
import {sha,canonical} from './marketplace-identity.ts';
import {validateMarketState,recomputeMarketMaintenanceIndex,type MarketRedis,type MarketOrder,type MarketState} from './marketplace-store.ts';
import {validateMarketX402State,MARKET_X402_PAYMENT_FAILURE_MAX_BYTES,type MarketX402State,type MarketX402Settlement} from './marketplace-x402-store.ts';
import {deliveryStorage} from './delivery-contract.ts';
import {MARKET_FILE_METADATA_BYTES,maximumMarketFileCleanupBytes,MARKET_FILE_CLEANUP_CAPACITY_BYTES} from './market-file-delivery-schema.ts';
import {maximumMarketRecoveryBytes,MARKET_RECOVERY_CAPACITY_BYTES} from './market-retention-schema.ts';
import {assertSellerReservation,commitSellerReservation,type SellerCapacity} from './market-seller-capacity.ts';
import {continuousFreeBudgetConfiguration,continuousFreeBudgetKey,continuousFreeOperationRequest,continuousFreeOperationCommitScript,type ContinuousFreeOperation} from './continuous-free-budget.ts';
import {prepareContinuousStorageCommit} from './continuous-free-storage.ts';
import {compactTransportV2,marketTransportMaximum,COMPACT_TRANSPORT_V2_MARKET_MAX_BYTES,COMPACT_TRANSPORT_V2_ORDER_INPUT_MAX_BYTES,readMarketTransportValue} from './free-plan-transport-profile.ts';

export const MARKET_CAPACITY_BYTES=524288;
export const SETTLEMENT_CAPACITY_BYTES=131072;
export const RESERVATION_CAPACITY_BYTES=65536;
// 32-KiB payment-signature header / 24-KiB transaction plus the immutable
// challenge, attempt hashes and compact verified outcome fit before payment.
export const CONTINUOUS_X402_SETTLEMENT_RESERVATION_BYTES=50000;
export type MarketCommitGuard={keys:string[];values:(string|null)[];admissionExpiresAt?:number;continuousOperation?:ContinuousFreeOperation};
/** A lease cannot admit a new payment beyond its UTC day or unpaid seat. */
export function sellerAdmissionExpiresAt(capacity:SellerCapacity,order:MarketOrder){
 return Math.min(Date.parse(capacity.leaseExpiresAt),Date.parse(capacity.day+'T00:00:00.000Z')+86400000,...(order.sellerReservation&&!order.sellerReservation.committed?[Date.parse(order.sellerReservation.expiresAt)]:[]));
}
type Entry={operationId:string;binding:string;marketMaximumBytes:number;settlementMaximumBytes:number};
const ledgerSchema=z.object({version:z.literal(1),revision:z.string().uuid(),entries:z.array(z.object({operationId:z.string().uuid(),binding:z.string().regex(/^[a-f0-9]{64}$/),marketMaximumBytes:z.number().int().positive(),settlementMaximumBytes:z.number().int().nonnegative()}).strict())}).strict();
type Ledger=z.infer<typeof ledgerSchema>;
const bytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value),'utf8');
const widestText='\u0000'.repeat(2000); // Six JSON bytes per UTF-16 character, including escaping.
const uuid='ffffffff-ffff-4fff-bfff-ffffffffffff',digest='f'.repeat(64),date='9999-12-31T23:59:59.999Z';
function binding(o:MarketOrder){return sha(canonical({operationId:o.operationId,owner:o.buyerOwnerId,protocol:o.paymentProtocol,cardHash:o.cardHash,inputHash:o.inputHash,payer:o.payer,destination:o.destination,amount:o.amount,settlement:o.settlement}));}
/** Immutable card/input/payload bytes plus the widest allowed future fields. */
export function maximumMarketRecordBytes(o:MarketOrder){
 const {fileDelivery:_delivery,...record}=o;
 const base=bytes({...record,...(o.executionMode==='on-demand'?{textWake:{version:1,wakeId:uuid,status:'needs-operator',createdAt:date,updatedAt:date,attempts:1000,retryAt:date,leaseExpiresAt:date,dispatchAttemptId:uuid}}:{}),phase:'delivered',updatedAt:date,settlementAttemptId:uuid,transactionHash:digest,paymentVerifiedAt:date,attemptId:uuid,agentId:'agent_'+digest.slice(0,32),executionUncertainty:widestText,failure:widestText,delivery:{text:widestText,sha256:digest,recordedAt:date,reference:'bazaar-order:'+o.operationId}});
 // File metadata and pending-to-available growth must fit before taking payment.
 return deliveryStorage(o.card.delivery).mode==='text'?base:base+MARKET_FILE_METADATA_BYTES+128;
}
export function maximumSettlementRecordBytes(r:MarketX402Settlement){const {lastFailure:_diagnostic,...record}=r;return bytes({...record,phase:'confirmed',updatedAt:date,attemptId:uuid,payloadHash:digest,authorizationFingerprint:digest,transactionHash:digest,responseHash:digest,outcome:{success:true,network:'stellar:testnet',transaction:digest,payer:'G'+'A'.repeat(55)}})+Buffer.byteLength(',"lastFailure":')+MARKET_X402_PAYMENT_FAILURE_MAX_BYTES;}
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
function projectCapacityAtMaximum(marketRaw:string|null,settlementRaw:string|null,ledgerRaw:string|null,marketMaximumBytes:number){
 const {market,settlements}=snapshot(marketRaw,settlementRaw),next=ledger(ledgerRaw),orders=new Map(market.orders.map(o=>[o.operationId,o])),records=new Map(settlements.records.map(r=>[r.operationId,r]));
 const recoveryUsed=bytes(market.archived??[]),recoveryReserved=market.orders.reduce((n,o)=>n+maximumMarketRecoveryBytes(o),0);
 if(recoveryUsed+recoveryReserved>MARKET_RECOVERY_CAPACITY_BYTES)throw new WorkspaceError('PAYMENT_RECOVERY_CAPACITY',503);
 const cleanupReserved=market.orders.reduce((n,o)=>n+maximumMarketFileCleanupBytes(o),0);
 if(bytes(market.fileCleanup??[])+cleanupReserved>MARKET_FILE_CLEANUP_CAPACITY_BYTES)throw new WorkspaceError('FILE_CLEANUP_CAPACITY',503);
 const archivedAuthorizations=new Set((market.archived??[]).flatMap(o=>o.authorizationFingerprint?[o.authorizationFingerprint]:[]));
 if(settlements.records.some(r=>r.authorizationFingerprint&&archivedAuthorizations.has(r.authorizationFingerprint)))throw new WorkspaceError('X402_AUTHORIZATION_REUSE',409);
 const entries=new Map(next.entries.map(e=>[e.operationId,e]));
 for(const id of entries.keys())if(!orders.has(id))entries.delete(id);
 // Admit file orders only while their complete future metadata still fits.
 for(const o of market.orders.filter(o=>deliveryStorage(o.card.delivery).mode!=='text'||process.env.BAZAAR_FREE_DEMO_MODE==='continuous')){
  const r=records.get(o.operationId),terminal=['delivered','delivery-failed'].includes(o.phase)&&(!r||r.phase==='confirmed'||r.phase==='rejected');
  if(terminal){entries.delete(o.operationId);continue;}
  const old=entries.get(o.operationId);
  if(!old)entries.set(o.operationId,{operationId:o.operationId,binding:binding(o),marketMaximumBytes:maximumMarketRecordBytes(o),settlementMaximumBytes:process.env.BAZAAR_FREE_DEMO_MODE==='continuous'&&o.paymentProtocol?CONTINUOUS_X402_SETTLEMENT_RESERVATION_BYTES:0});
 }
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
  if(r.phase==='challenged'){
   const existing=entries.get(r.operationId);
   if(existing&&existing.settlementMaximumBytes===0)existing.settlementMaximumBytes=bytes(r);
   continue;
  }
  if(!r.payload||!r.payloadHash||r.orderBinding!==binding(o))throw new WorkspaceError('CAPACITY_BINDING_CHANGED',409);
  const old=entries.get(r.operationId),wanted:Entry={operationId:r.operationId,binding:binding(o),marketMaximumBytes:maximumMarketRecordBytes(o),settlementMaximumBytes:maximumSettlementRecordBytes(r)};
  const fileUpgrade=Boolean(old&&(old.settlementMaximumBytes===0||r.phase==='verifying'&&old.settlementMaximumBytes===bytes({...r,phase:'challenged',attemptId:undefined,payload:undefined,payloadHash:undefined,authorizationFingerprint:undefined}))&&(deliveryStorage(o.card.delivery).mode!=='text'||process.env.BAZAAR_FREE_DEMO_MODE==='continuous'));
  if(old&&(old.binding!==wanted.binding||old.marketMaximumBytes<wanted.marketMaximumBytes||(!fileUpgrade&&old.settlementMaximumBytes<wanted.settlementMaximumBytes)))throw new WorkspaceError('CAPACITY_BINDING_CHANGED',409);
  if(!old||fileUpgrade)entries.set(r.operationId,wanted);
 }
 let marketRemaining=cleanupReserved+(market.sellerCapacities?.length??0)*32,settlementRemaining=0;
 for(const e of entries.values()){
  const o=orders.get(e.operationId),r=records.get(e.operationId);
  if(!o||(!r&&e.settlementMaximumBytes!==0&&!(process.env.BAZAAR_FREE_DEMO_MODE==='continuous'&&o.paymentProtocol&&e.settlementMaximumBytes===CONTINUOUS_X402_SETTLEMENT_RESERVATION_BYTES))||e.binding!==binding(o))throw new WorkspaceError('CAPACITY_BINDING_CHANGED',409);
  const marketGrowth=e.marketMaximumBytes-bytes(o),settlementGrowth=e.settlementMaximumBytes-(r?bytes(r):0);
  if(marketGrowth<0||settlementGrowth<0)throw new WorkspaceError('CAPACITY_BINDING_CHANGED',409);
  marketRemaining+=marketGrowth;settlementRemaining+=settlementGrowth;
 }
 const marketUsed=marketRaw===null?0:Buffer.byteLength(marketRaw),settlementUsed=settlementRaw===null?0:Buffer.byteLength(settlementRaw);
 if(marketUsed+marketRemaining>marketMaximumBytes)throw new WorkspaceError('MARKET_CAPACITY',503);
 if(settlementUsed+settlementRemaining>SETTLEMENT_CAPACITY_BYTES)throw new WorkspaceError('X402_SETTLEMENT_CAPACITY',503);
 next.entries=[...entries.values()].sort((a,b)=>a.operationId<b.operationId?-1:1);
 // Revisions are replaced only when the auxiliary document really changes.
 const changed=ledgerRaw===null?next.entries.length>0:canonical(next.entries)!==canonical(ledger(ledgerRaw).entries);
 if(changed)next.revision=randomUUID();
 const serialized=JSON.stringify(next);
 if(Buffer.byteLength(serialized)>RESERVATION_CAPACITY_BYTES)throw new WorkspaceError('MARKET_CAPACITY',503);
 return {ledgerRaw:changed?serialized:ledgerRaw,marketUsed,settlementUsed,marketRemaining,settlementRemaining};
}
export function projectCapacity(marketRaw:string|null,settlementRaw:string|null,ledgerRaw:string|null){return projectCapacityAtMaximum(marketRaw,settlementRaw,ledgerRaw,marketTransportMaximum());}
/** Pure activation proof over the complete original inventory and every
 * outstanding completion promise. It never edits or reduces a reservation. */
export function compactTransportActivationProof(marketRaw:string|null,settlementRaw:string|null,ledgerRaw:string|null){
 const projected=projectCapacityAtMaximum(marketRaw,settlementRaw,ledgerRaw,COMPACT_TRANSPORT_V2_MARKET_MAX_BYTES);
 return {profile:'compact-registry-v2' as const,marketMaximumBytes:COMPACT_TRANSPORT_V2_MARKET_MAX_BYTES,marketProjectedBytes:projected.marketUsed+projected.marketRemaining,settlementMaximumBytes:SETTLEMENT_CAPACITY_BYTES,settlementProjectedBytes:projected.settlementUsed+projected.settlementRemaining,reservationsUnchanged:projected.ledgerRaw===ledgerRaw};
}
/** Pure prospective capacity proof, never a new order or an authorization.
 * Both future records remain retained; only one new unpaid seat is used at a
 * time. Existing records and their complete promises are not removed. */
export function compactTransportTwoBuyerProjection(marketRaw:string|null,settlementRaw:string|null,ledgerRaw:string|null,{serviceId,origin}:{serviceId:string;origin:string}){
 const prior=compactTransportActivationProof(marketRaw,settlementRaw,ledgerRaw);if(!prior.reservationsUnchanged)throw new WorkspaceError('FREE_PLAN_INVENTORY_RESERVATION_REQUIRED',503);
 const {market}=snapshot(marketRaw,settlementRaw),service=market.services.find(row=>row.card.id===serviceId&&!row.withdrawn),url=new URL(origin);
 if(!service||url.origin!==origin||url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))||service.card.payment.marketplace?.protocol!=='x402-stellar-exact-v2'||!service.card.payment.identity||deliveryStorage(service.card.delivery).mode!=='text')throw new WorkspaceError('FREE_PLAN_PROJECTION_SERVICE_REQUIRED',503);
 const at='9999-12-31T23:59:59.999Z',operationId='ffffffff-ffff-4fff-8fff-ffffffffffff',ownerId='ow_'+'f'.repeat(32),digest='f'.repeat(64),payer='G'+'A'.repeat(55),input={};
 const example:MarketOrder={operationId,buyerOwnerId:ownerId,sellerOwnerId:service.ownerId,serviceId,cardHash:service.cardHash,card:service.card,input,payer,destination:service.card.payment.destination,amount:service.card.payment.amount,settlement:service.card.payment.identity,paymentProtocol:'x402-stellar-exact-v2',inputHash:digest,memoHash:digest,phase:'awaiting-payment',executionMode:'on-demand',createdAt:at,updatedAt:at,sellerReservation:{day:'9999-12-31',expiresAt:at,committed:false}};
 // Only new v2 orders have the authoritative serialized-input ceiling. Old
 // immutable orders and their recorded completion promises remain unchanged.
 // Every future mutable field retains the native maximum definition.
 const inputShapeMaximum=2+service.card.input.reduce((sum,field,index)=>sum+(index?1:0)+Buffer.byteLength(JSON.stringify(field.name))+1+(field.type==='string'?Buffer.byteLength(JSON.stringify('\u0000'.repeat(2000))):field.type==='number'?24:5),0),maximumInputBytes=Math.min(COMPACT_TRANSPORT_V2_ORDER_INPUT_MAX_BYTES,inputShapeMaximum),perOrderMarketMaximumBytes=maximumMarketRecordBytes(example)+maximumInputBytes-2;
 // A successful native delivery can retain execution uncertainty, but cannot
 // retain failure: fail is terminal and deliver rejects delivery-failed. Keep
 // every other field widened exactly as the native promise definition does.
 const firstRetainedMarketMaximumBytes=perOrderMarketMaximumBytes-Buffer.byteLength(',"failure":'+JSON.stringify(widestText));
 const route='/api/market/orders/'+operationId+'/x402',resource={url:origin+route,description:'Paid marketplace order; text delivery is retrieved from the private order history.',mimeType:'application/json'},accepted={scheme:'exact',network:'stellar:testnet' as const,asset:service.card.payment.identity.sacContract,amount:'9'.repeat(19),payTo:example.destination,maxTimeoutSeconds:60,extra:{areFeesSponsored:true,resourceUrl:resource.url,method:'POST',route,inputHash:digest,operationId,cardHash:digest}};
 const sample:MarketX402Settlement={operationId,buyerOwnerId:ownerId,orderBinding:digest,challenge:{x402Version:2,resource,accepts:[accepted]},phase:'settling',createdAt:at,updatedAt:at,attemptId:operationId,payloadHash:digest,authorizationFingerprint:digest,payload:{x402Version:2,resource,accepted,payload:{transaction:'A'.repeat(24000)}}};
 const modeledSettlementBytes=maximumSettlementRecordBytes(sample);if(modeledSettlementBytes>CONTINUOUS_X402_SETTLEMENT_RESERVATION_BYTES)throw new WorkspaceError('X402_SETTLEMENT_CAPACITY',503);
 // The existing50KiB native promise is also checked before authorization; a
 // larger signed record is rejected rather than expanding an admitted hold.
 const perOrderSettlementMaximumBytes=CONTINUOUS_X402_SETTLEMENT_RESERVATION_BYTES,capacityReportGrowthBytes=market.sellerCapacities?.some(row=>row.serviceId===serviceId&&row.ownerId===service.ownerId&&row.cardHash===service.cardHash)?0:2048,marketProjectedBytes=prior.marketProjectedBytes+firstRetainedMarketMaximumBytes+perOrderMarketMaximumBytes+2+capacityReportGrowthBytes,settlementProjectedBytes=prior.settlementProjectedBytes+modeledSettlementBytes+perOrderSettlementMaximumBytes+2,recoveryProjectedBytes=bytes(market.archived??[])+market.orders.reduce((sum,order)=>sum+maximumMarketRecoveryBytes(order),0)+2*maximumMarketRecoveryBytes(example);
 if(marketProjectedBytes>COMPACT_TRANSPORT_V2_MARKET_MAX_BYTES)throw new WorkspaceError('MARKET_CAPACITY',503);
 if(settlementProjectedBytes>SETTLEMENT_CAPACITY_BYTES)throw new WorkspaceError('X402_SETTLEMENT_CAPACITY',503);
 if(recoveryProjectedBytes>MARKET_RECOVERY_CAPACITY_BYTES)throw new WorkspaceError('PAYMENT_RECOVERY_CAPACITY',503);
 if((ledgerRaw===null?0:Buffer.byteLength(ledgerRaw))+2048>RESERVATION_CAPACITY_BYTES)throw new WorkspaceError('MARKET_CAPACITY',503);
 return {profile:'compact-registry-v2' as const,projection:'two-sequential-maximum-retained-orders' as const,newOrders:2,maximumSimultaneousNewOrders:1,marketMaximumBytes:COMPACT_TRANSPORT_V2_MARKET_MAX_BYTES,marketProjectedBytes,settlementMaximumBytes:SETTLEMENT_CAPACITY_BYTES,settlementProjectedBytes,recoveryProjectedBytes,perOrderMarketMaximumBytes,firstRetainedMarketMaximumBytes,perOrderSettlementMaximumBytes,firstRetainedSettlementMaximumBytes:modeledSettlementBytes,capacityReportGrowthBytes,maximumInputBytes,maximumCreateBodyBytes:16384,maximumXdrStringBytes:24000,existingReservationsUnchanged:true,ordersCreated:0,paymentSubmissions:0,signaturesGenerated:0};
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
if ARGV[14] and ARGV[14]~='' then
 local deadline=tonumber(ARGV[14]); if not deadline or deadline<=0 then return -2 end
 local clock=redis.call('TIME')
 if tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)>=deadline then return -1 end
end
if ARGV[7]~='' then redis.call('SET',KEYS[1],ARGV[7]) end
if ARGV[8]~='' then redis.call('SET',KEYS[2],ARGV[8]) end
if ARGV[9]~='' then redis.call('SET',KEYS[3],ARGV[9]) end
return 1`;
export const MARKET_CAPACITY_CAS_V2=MARKET_CAPACITY_CAS.replace("if ARGV[7]~='' then",`if (market and #market>131072) or (settlement and #settlement>131072) or #ARGV[7]>131072 or #ARGV[8]>131072 then return -24 end
if ARGV[7]~='' then`);
export function marketCapacityCommitScript(){return compactTransportV2()?MARKET_CAPACITY_CAS_V2:MARKET_CAPACITY_CAS;}

export async function commitCapacityStore(redis:MarketRedis,prefix:string,kind:'market'|'settlement',expectedRaw:string|null,nextRaw:string|null,guard?:MarketCommitGuard){
 const marketKey=prefix+':state',settlementKey=prefix+':x402-settlements:state',ledgerKey=capacityReservationKey(prefix);
 if(guard&&(guard.keys.length!==guard.values.length||guard.keys.length>2||guard.keys.some(k=>typeof k!=='string'||!k||k.length>256)||guard.values.some(v=>v!==null&&(typeof v!=='string'||Buffer.byteLength(v)>1048576))||guard.admissionExpiresAt!==undefined&&(!Number.isSafeInteger(guard.admissionExpiresAt)||guard.admissionExpiresAt<=0)))throw new WorkspaceError('INVALID_COMMIT_GUARD');
 const other=await readMarketTransportValue(redis,kind==='market'?settlementKey:marketKey,kind==='market'?SETTLEMENT_CAPACITY_BYTES:marketTransportMaximum()),storedLedger=await readMarketTransportValue(redis,ledgerKey,RESERVATION_CAPACITY_BYTES);
 if((other!==null&&typeof other!=='string')||(storedLedger!==null&&typeof storedLedger!=='string'))throw new WorkspaceError('CAPACITY_STATE_UNAVAILABLE');
 const oldMarket=kind==='market'?expectedRaw:other as string|null,oldSettlement=kind==='settlement'?expectedRaw:other as string|null;
 let newMarket=kind==='market'?(nextRaw??oldMarket):oldMarket;const newSettlement=kind==='settlement'?(nextRaw??oldSettlement):oldSettlement;
 const before=snapshot(oldMarket,oldSettlement),after=snapshot(newMarket,newSettlement);let admissionExpiresAt=guard?.admissionExpiresAt;
 const configuration=continuousFreeBudgetConfiguration();
 if(kind==='settlement'){
  let changed=false;
  for(const record of after.settlements.records){
   const old=before.settlements.records.find(r=>r.operationId===record.operationId);
   if(old?.phase===record.phase||!['challenged','verifying','settling'].includes(record.phase))continue;
   if(before.market.paused)throw new WorkspaceError('PURCHASES_PAUSED',503);
   const order=after.market.orders.find(o=>o.operationId===record.operationId);if(!order)throw new WorkspaceError('SELLER_UNAVAILABLE',503);
   const capacity=assertSellerReservation(after.market,order),expiresAt=sellerAdmissionExpiresAt(capacity,order);admissionExpiresAt=Math.min(admissionExpiresAt??expiresAt,expiresAt);
   if(record.phase==='verifying'){commitSellerReservation(after.market,order);changed=true;}
  }
  if(changed){validateMarketState(after.market);newMarket=JSON.stringify({version:1,revision:randomUUID(),state:after.market});}
 }
 if(configuration){
  const priorIndex=JSON.stringify(after.market.maintenance?.index);
  const index=recomputeMarketMaintenanceIndex(after.market,after.settlements);
  if(JSON.stringify(index)!==priorIndex){validateMarketState(after.market);newMarket=JSON.stringify({version:1,revision:randomUUID(),state:after.market});}
 }
 const projected=projectCapacity(newMarket,newSettlement,storedLedger as string|null);
 recordOperationalStorageBounds({market:{committedBytes:projected.marketUsed,reservedBytes:projected.marketRemaining},settlement:{committedBytes:projected.settlementUsed,reservedBytes:projected.settlementRemaining}});
 const expected=(raw:string|null)=>[raw===null?'missing':'present',raw??''];
 const keys=[marketKey,settlementKey,ledgerKey,...(guard?.keys??[])];
 const args=[...expected(oldMarket),...expected(oldSettlement),...expected(storedLedger as string|null),newMarket!==oldMarket?(newMarket??''):'',kind==='settlement'?(nextRaw??''):'',projected.ledgerRaw!==storedLedger?(projected.ledgerRaw??''):''];
 for(let i=0;i<2;i++)args.push(...(guard&&i<guard.keys.length?expected(guard.values[i]):['unchecked','']));
 args.push(admissionExpiresAt===undefined?'':String(admissionExpiresAt));
 let script=marketCapacityCommitScript();
 if(configuration){
  const workspacePrefix=process.env.BAZAAR_WORKSPACE_PREFIX??prefix.replace('bazaar-market:','bazaar-workspace:');
  if(workspacePrefix.split(':')[1]!==prefix.split(':')[1])throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');
  const addedOrders=after.market.orders.filter(o=>!before.market.orders.some(old=>old.operationId===o.operationId));
  const operation=guard?.continuousOperation;
  if(addedOrders.length>0&&(addedOrders.length!==1||!operation||operation.action!=='reserve'||operation.operationId!==addedOrders[0].operationId||operation.principalHash!==sha(addedOrders[0].buyerOwnerId)))throw new WorkspaceError('FREE_DEMO_OPERATION_RESERVATION_REQUIRED',503);
  if(operation?.action==='release'){
   const old=before.market.orders.find(o=>o.operationId===operation.operationId),next=after.market.orders.find(o=>o.operationId===operation.operationId);
   if(!old||operation.principalHash!==sha(old.buyerOwnerId)||!next||!['delivered','delivery-failed'].includes(next.phase))throw new WorkspaceError('INVALID_COMMIT_GUARD');
  }
  const indexKey=prefix+':maintenance-index:v1',storedIndex=await readMarketTransportValue(redis,indexKey,512);
  if(storedIndex!==null&&(typeof storedIndex!=='string'||Buffer.byteLength(storedIndex)>512))throw new WorkspaceError('MAINTENANCE_UNAVAILABLE');
  const index=after.market.maintenance?.index;
  if(!index)throw new WorkspaceError('MAINTENANCE_UNAVAILABLE');
  const indexRaw=JSON.stringify(index);if(Buffer.byteLength(indexRaw)>512)throw new WorkspaceError('MAINTENANCE_UNAVAILABLE');
  const storage=await prepareContinuousStorageCommit(redis,workspacePrefix,[
   {key:marketKey,expectedRaw:oldMarket,nextRaw:newMarket,reservedBytes:projected.marketRemaining},
   {key:settlementKey,expectedRaw:oldSettlement,nextRaw:newSettlement,reservedBytes:projected.settlementRemaining},
   {key:ledgerKey,expectedRaw:storedLedger as string|null,nextRaw:projected.ledgerRaw},
   {key:indexKey,expectedRaw:storedIndex as string|null,nextRaw:indexRaw},
  ]);
  let beforeWrites='',afterWrites='';
  const indexKeyPosition=keys.length+1,indexArg=args.length+1;keys.push(indexKey);args.push(storedIndex===null?'missing':'present',storedIndex as string??'',indexRaw);
  beforeWrites+=`local indexOld=redis.call('GET',KEYS[${indexKeyPosition}])\nif ARGV[${indexArg}]=='missing' then if indexOld then return 0 end else if not indexOld or indexOld~=ARGV[${indexArg+1}] then return 0 end end\n`;
  afterWrites+=`redis.call('SET',KEYS[${indexKeyPosition}],ARGV[${indexArg+2}])\n`;
  if(storage){const keyIndex=keys.length+1,argIndex=args.length+1;keys.push(...storage.keys);args.push(...storage.args);beforeWrites+=storage.appendScript(keyIndex,argIndex);afterWrites+=storage.writeScript(keyIndex);}
  if(operation){
   const keyIndex=keys.length+1,configArg=args.length+1;keys.push(continuousFreeBudgetKey(workspacePrefix));args.push(JSON.stringify(configuration),JSON.stringify(continuousFreeOperationRequest(operation,addedOrders[0])));
   beforeWrites+=continuousFreeOperationCommitScript(keyIndex,configArg,configArg+1);afterWrites+=`redis.call('SET',KEYS[${keyIndex}],budgetNext)\n`;
  }
  script=script.replace("if ARGV[7]~='' then",beforeWrites+"\nif ARGV[7]~='' then").replace('return 1',afterWrites+'return 1');
 }
 const result=await redis.eval(script,keys,args);
 if(result===-11)throw new WorkspaceError('FREE_DEMO_REQUEST_LIMIT',429,60);
 if(result===-10||result===-12)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 if(result===-20)throw new WorkspaceError('FREE_DEMO_STORAGE_WRITE_UNCONFIRMED',409);
 if(result===-21)throw new WorkspaceError('FREE_DEMO_STORAGE_UNINITIALIZED');
 if(result===-22||result===-23)throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');
 if(result===-24)throw new WorkspaceError('FREE_DEMO_STORAGE_CAPACITY');
 if(result===-1)throw new WorkspaceError('SELLER_UNAVAILABLE',503,60);
 if(result!==1)throw new WorkspaceError('CAPACITY_WRITE_UNCONFIRMED',409);
 return projected;
}
