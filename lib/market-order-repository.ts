import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {WorkspaceError} from './workspace-types.ts';
import {canonical,sha} from './marketplace-identity.ts';
import {validateMarketState,type MarketOrder,type MarketRedis} from './marketplace-store.ts';
import {validateMarketX402State,type MarketX402Settlement} from './marketplace-x402-store.ts';
import {maximumMarketRecordBytes,maximumSettlementRecordBytes,type MarketCommitGuard} from './marketplace-capacity.ts';
import {marketIntentHash,marketRecoverySchema,marketRecoveryRecord,maximumMarketRecoveryBytes,type MarketRecovery} from './market-retention-schema.ts';
import {MARKET_ORDER_REPOSITORY_CAS,MARKET_ORDER_REPOSITORY_PAGE,MARKET_ORDER_REPOSITORY_HISTORY_PAGE,MARKET_ORDER_REPOSITORY_READ,MARKET_ORDER_REPOSITORY_HISTORY_READ,MARKET_ORDER_REPOSITORY_ADMISSION_READ,MARKET_ORDER_REPOSITORY_BATCH_READ,MARKET_ORDER_REPOSITORY_ADMISSION_PAGE} from './market-order-repository-lua.ts';
import {assertPerOrderStorageProfile} from './per-order-storage-profile.ts';
import {preparePerOrderContinuousCommit} from './market-order-budget-commit.ts';
import {continuousPerOrderResourceProfile} from './continuous-control-budget.ts';
import {sellerReservationSchema} from './market-seller-capacity.ts';

export const ORIGINAL_LEGACY_OPERATION_ID='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
export const PER_ORDER_MAX_BYTES=196608;
export const PER_ORDER_MAX_ORDER_BYTES=65536;
export const PER_ORDER_MAX_SETTLEMENT_BYTES=65536;
export const PER_ORDER_MAX_RECOVERY_BYTES=4096;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const memberPattern=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export type MarketOrderEnvelope={version:2;budgetProfile?:'batch-v1';revision:string;operationId:string;buyerOwnerId:string;sellerOwnerId:string;createdAt:string;intentHash:string;binding:string;immutableHash:string;challengeHash?:string;readinessAttemptId?:string;reserved:{orderBytes:number;settlementBytes:number;recoveryBytes:number};order?:MarketOrder;settlement?:MarketX402Settlement;recovery?:MarketRecovery};
export type OrderRepositoryPageOptions={limit?:number;cursor?:string};
export type OrderRepositoryPage={orders:MarketOrder[];archived:MarketRecovery[];nextCursor?:string;guard:MarketCommitGuard};
export type OrderRepositoryCommitOptions={guard?:MarketCommitGuard};
export type MarketOrderAdmission={version:1;operationId:string;buyerOwnerId:string;sellerOwnerId:string;createdAt:string;cardHash:string;intentHash:string;binding:string;serviceId?:string;phase?:MarketOrder['phase'];sellerReservation?:MarketOrder['sellerReservation'];paymentPhase?:MarketRecovery['paymentPhase'];sellerReservationPending?:boolean;archivedAt?:string};
export type OrderRepositoryAdmissionPage={records:MarketOrderAdmission[];nextCursor?:string;nextCreatedAt?:string;guard:MarketCommitGuard};
const admissionSchema=z.object({version:z.literal(1),operationId:z.string().regex(uuid),buyerOwnerId:z.string().min(1).max(128),sellerOwnerId:z.string().min(1).max(128),createdAt:z.string().datetime(),cardHash:z.string().regex(digest),intentHash:z.string().regex(digest),binding:z.string().regex(digest),serviceId:z.string().min(1).max(100).optional(),phase:z.enum(['awaiting-payment','payment-submitting','payment-uncertain','paid','executing','execution-uncertain','delivered','delivery-failed']).optional(),sellerReservation:sellerReservationSchema.optional(),paymentPhase:z.enum(['unpaid','rejected','uncertain','confirmed']).optional(),sellerReservationPending:z.boolean().optional(),archivedAt:z.string().datetime().optional()}).strict().refine(value=>Boolean(value.phase)!==Boolean(value.paymentPhase)&&Boolean(value.phase)===Boolean(value.serviceId)&&(!value.phase||value.archivedAt===undefined&&value.paymentPhase===undefined&&value.sellerReservationPending===undefined)&&(!value.paymentPhase||value.sellerReservation===undefined&&value.archivedAt!==undefined));
export interface MarketOrderRepository {
 read(operationId:string):Promise<MarketOrderEnvelope|null>;
 create(order:MarketOrder,options?:OrderRepositoryCommitOptions&{settlement?:MarketX402Settlement}):Promise<{envelope:MarketOrderEnvelope;replayed:boolean}>;
 transact<T>(operationId:string,op:(record:MarketOrderEnvelope)=>T,options?:OrderRepositoryCommitOptions):Promise<T>;
 list(ownerId:string,options?:OrderRepositoryPageOptions&{role?:'buyer'|'seller'}):Promise<OrderRepositoryPage>;
 indexSnapshot(ownerId:string,role:'buyer'|'seller',options?:OrderRepositoryPageOptions):Promise<OrderRepositoryPage>;
 pendingSnapshot(sellerOwnerId:string,options?:OrderRepositoryPageOptions):Promise<OrderRepositoryPage>;
 workPage(options?:OrderRepositoryPageOptions):Promise<OrderRepositoryPage>;
 admissionSnapshot(ownerId:string,role:'buyer'|'seller-pending'|'seller',options?:OrderRepositoryPageOptions):Promise<OrderRepositoryAdmissionPage>;
}
function fail(code:string,status=503):never{throw new WorkspaceError(code,status);}
function operation(id:string){if(id===ORIGINAL_LEGACY_OPERATION_ID)fail('LEGACY_ORDER_REQUIRED',409);if(!uuid.test(id))fail('INVALID_OPERATION_ID',400);}
function owner(value:string){if(typeof value!=='string'||!value||value.length>128)fail('INVALID_OWNER',400);return value;}
function bytes(value:unknown){return Buffer.byteLength(JSON.stringify(value),'utf8');}
export function perOrderBinding(o:MarketOrder){return sha(canonical({operationId:o.operationId,owner:o.buyerOwnerId,protocol:o.paymentProtocol,cardHash:o.cardHash,inputHash:o.inputHash,payer:o.payer,destination:o.destination,amount:o.amount,settlement:o.settlement}));}
function immutable(o:MarketOrder){return sha(canonical({operationId:o.operationId,buyerOwnerId:o.buyerOwnerId,sellerOwnerId:o.sellerOwnerId,serviceId:o.serviceId,cardHash:o.cardHash,card:o.card,input:o.input,payer:o.payer,destination:o.destination,amount:o.amount,memoHash:o.memoHash,settlement:o.settlement,paymentProtocol:o.paymentProtocol,inputHash:o.inputHash,executionMode:o.executionMode,createdAt:o.createdAt,sellerReservation:o.sellerReservation?{day:o.sellerReservation.day,expiresAt:o.sellerReservation.expiresAt}:undefined}));}
function fingerprint(record:MarketOrderEnvelope){return record.settlement?.authorizationFingerprint??record.recovery?.authorizationFingerprint??'';}
function pending(record:MarketOrderEnvelope){return Boolean(record.order&&!['delivered','delivery-failed'].includes(record.order.phase)||record.recovery&&(record.recovery.paymentPhase==='uncertain'||record.recovery.sellerReservationPending));}
function recoveryImmutable(r:MarketRecovery){return sha(canonical({operationId:r.operationId,buyerOwnerId:r.buyerOwnerId,sellerOwnerId:r.sellerOwnerId,intentHash:r.intentHash,cardHash:r.cardHash,inputHash:r.inputHash,orderBinding:r.orderBinding,payer:r.payer,destination:r.destination,amount:r.amount,settlement:r.settlement,paymentProtocol:r.paymentProtocol,archivedAt:r.archivedAt}));}
function validate(record:MarketOrderEnvelope){
 const allowed=['version','budgetProfile','revision','operationId','buyerOwnerId','sellerOwnerId','createdAt','intentHash','binding','immutableHash','challengeHash','readinessAttemptId','reserved','order','settlement','recovery'];
 if(!record||typeof record!=='object'||Object.keys(record).some(key=>!allowed.includes(key)))fail('PER_ORDER_STATE_UNAVAILABLE');
 if(record.version!==2||typeof record.revision!=='string'||!uuid.test(record.revision)||typeof record.operationId!=='string'||!uuid.test(record.operationId)||record.operationId===ORIGINAL_LEGACY_OPERATION_ID||typeof record.intentHash!=='string'||!digest.test(record.intentHash)||typeof record.binding!=='string'||!digest.test(record.binding)||typeof record.immutableHash!=='string'||!digest.test(record.immutableHash)||typeof record.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.createdAt)||!Number.isFinite(Date.parse(record.createdAt))||new Date(record.createdAt).toISOString()!==record.createdAt||bytes(record)>PER_ORDER_MAX_BYTES)fail('PER_ORDER_STATE_UNAVAILABLE');
 owner(record.buyerOwnerId);owner(record.sellerOwnerId);
 if(!record.reserved||Object.keys(record.reserved).sort().join(',')!=='orderBytes,recoveryBytes,settlementBytes'||!Number.isSafeInteger(record.reserved.orderBytes)||record.reserved.orderBytes<1||record.reserved.orderBytes>PER_ORDER_MAX_ORDER_BYTES||!Number.isSafeInteger(record.reserved.settlementBytes)||record.reserved.settlementBytes<0||record.reserved.settlementBytes>PER_ORDER_MAX_SETTLEMENT_BYTES||!Number.isSafeInteger(record.reserved.recoveryBytes)||record.reserved.recoveryBytes<1||record.reserved.recoveryBytes>PER_ORDER_MAX_RECOVERY_BYTES)fail('PER_ORDER_RESERVATION_INVALID');
 if(record.budgetProfile!==undefined&&(record.budgetProfile!=='batch-v1'||record.reserved.orderBytes>49152||record.reserved.settlementBytes>50000))fail('PER_ORDER_RESERVATION_INVALID');
 if(Boolean(record.order)===Boolean(record.recovery)||record.recovery&&record.settlement)fail('PER_ORDER_STATE_UNAVAILABLE');
 if(record.order){
  const o=record.order;validateMarketState({version:1,services:[],orders:[o]});
  if(o.operationId!==record.operationId||o.buyerOwnerId!==record.buyerOwnerId||o.sellerOwnerId!==record.sellerOwnerId||o.createdAt!==record.createdAt||marketIntentHash(o)!==record.intentHash||perOrderBinding(o)!==record.binding||immutable(o)!==record.immutableHash||bytes(o)>record.reserved.orderBytes||maximumMarketRecordBytes(o)>record.reserved.orderBytes||maximumMarketRecoveryBytes(o)>record.reserved.recoveryBytes)fail('PER_ORDER_IMMUTABLE_BINDING_CHANGED',409);
 }
 if(record.settlement){
  const r=record.settlement;validateMarketX402State({version:1,records:[r]});
  if(r.operationId!==record.operationId||r.buyerOwnerId!==record.buyerOwnerId||r.orderBinding!==record.binding||sha(canonical(r.challenge))!==record.challengeHash||bytes(r)>record.reserved.settlementBytes||maximumSettlementRecordBytes(r)>record.reserved.settlementBytes)fail('PER_ORDER_SETTLEMENT_BINDING_CHANGED',409);
 }
 if(record.challengeHash!==undefined&&(typeof record.challengeHash!=='string'||!digest.test(record.challengeHash)))fail('PER_ORDER_SETTLEMENT_BINDING_CHANGED',409);
 if(record.readinessAttemptId!==undefined&&(typeof record.readinessAttemptId!=='string'||!uuid.test(record.readinessAttemptId)))fail('PER_ORDER_STATE_UNAVAILABLE');
 if(record.recovery){
  const r=marketRecoverySchema.parse(record.recovery);
  if(r.operationId!==record.operationId||r.buyerOwnerId!==record.buyerOwnerId||r.sellerOwnerId!==record.sellerOwnerId||r.intentHash!==record.intentHash||r.orderBinding!==record.binding||bytes(r)>record.reserved.recoveryBytes)fail('PER_ORDER_RECOVERY_BINDING_CHANGED',409);
 }
}
function decode(raw:unknown):MarketOrderEnvelope|null{
 if(raw===null||raw===undefined)return null;
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>PER_ORDER_MAX_BYTES)fail('PER_ORDER_STATE_UNAVAILABLE');
 let parsed:MarketOrderEnvelope;try{parsed=JSON.parse(raw);}catch{fail('PER_ORDER_STATE_UNAVAILABLE');}
 validate(parsed!);return parsed!;
}
function assertLocal(){if(!['development','test'].includes(process.env.NODE_ENV??'')||process.env.VERCEL!==undefined||process.env.VERCEL_ENV!==undefined||process.env.BAZAAR_FREE_DEMO_MODE==='continuous')fail('PER_ORDER_STORAGE_LOCAL_ONLY',503);}
function guardChecked(guard:MarketCommitGuard|undefined,continuous=false):MarketCommitGuard{
 if(!guard)return {keys:[] as string[],values:[] as (string|null)[]};
 if(guard.continuousOperation!==undefined&&!continuous)fail('PER_ORDER_FINANCIAL_GUARD_UNSUPPORTED');
 if(guard.continuousOperation){const value=guard.continuousOperation;if(value.operationId===ORIGINAL_LEGACY_OPERATION_ID||!uuid.test(value.operationId)||!digest.test(value.principalHash)||!['reserve','release'].includes(value.action))fail('INVALID_COMMIT_GUARD');}
 if(guard.keys.length!==guard.values.length||guard.keys.length>8||new Set(guard.keys).size!==guard.keys.length||guard.keys.some(k=>typeof k!=='string'||!k||k.length>256)||guard.values.some(v=>v!==null&&(typeof v!=='string'||Buffer.byteLength(v)>1048576))||guard.admissionExpiresAt!==undefined&&(!Number.isSafeInteger(guard.admissionExpiresAt)||guard.admissionExpiresAt<=0))fail('INVALID_COMMIT_GUARD');
 return guard;
}
/** New orders can opt into a pinned continuous profile. Existing legacy keys
 * remain comparison-only; this repository never writes or migrates them. */
export function createMarketOrderRepository(redis:MarketRedis,prefix:string,options:{developmentUnmetered?:boolean;legacyPrefix?:string;continuous?:boolean}={}):MarketOrderRepository{
 const continuous=options.continuous===true;
 function assertContext(){if(continuous){if(assertPerOrderStorageProfile()!=='continuous')fail('PER_ORDER_STORAGE_CONFIGURATION_INCOMPLETE');}else assertLocal();}
 function assertWritable(){assertContext();if(!continuous&&!options.developmentUnmetered)fail('PER_ORDER_STORAGE_LOCAL_OPT_IN_REQUIRED');}
 assertContext();
 if(!/^bazaar-market:(pilot|isolated)-[a-f0-9]{32}$/.test(prefix))fail('MARKET_UNAVAILABLE');
 const legacyPrefix=options.legacyPrefix??prefix;if(!/^bazaar-market:(pilot|isolated)-[a-f0-9]{32}$/.test(legacyPrefix))fail('MARKET_UNAVAILABLE');
 const namespace=prefix+':orders:v2:',recordKey=(id:string)=>namespace+'operation:'+id;
 const allocationKey=(id:string)=>namespace+'allocation:'+id,admissionKey=(id:string)=>namespace+'admission:'+id;
 const indexKey=(id:string,role:string)=>namespace+role+':'+sha(owner(id));
 const revisionKey=(key:string)=>key+':revision';
 const workspacePrefix=prefix.replace('bazaar-market:','bazaar-workspace:');
 if(continuous&&(prefix!==legacyPrefix||workspacePrefix!==process.env.BAZAAR_WORKSPACE_PREFIX))fail('PER_ORDER_STORAGE_CONFIGURATION_INCOMPLETE');
 function admission(record:MarketOrderEnvelope):MarketOrderAdmission{
  const common={version:1 as const,operationId:record.operationId,buyerOwnerId:record.buyerOwnerId,sellerOwnerId:record.sellerOwnerId,createdAt:record.createdAt,cardHash:(record.order??record.recovery!).cardHash,intentHash:record.intentHash,binding:record.binding};
  const value=record.order?{...common,serviceId:record.order.serviceId,phase:record.order.phase,...(record.order.sellerReservation?{sellerReservation:record.order.sellerReservation}:{})}:{...common,paymentPhase:record.recovery!.paymentPhase,sellerReservationPending:record.recovery!.sellerReservationPending,...(record.recovery!.archivedAt?{archivedAt:record.recovery!.archivedAt}:{})};
  if(bytes(value)>4096)fail('PER_ORDER_STATE_UNAVAILABLE');return value;
 }
 function allocation(record:MarketOrderEnvelope){
  const {order:_order,settlement:_settlement,recovery:_recovery,challengeHash:_challengeHash,readinessAttemptId:_readinessAttemptId,...metadata}=record;
  // Maxima include every future mutable order/settlement/recovery field. The
  // Existing metadata padding covers a later challenge digest, the one bounded
  // readiness UUID and JSON field framing; the allocation never grows on use.
  const metadataMaximum=bytes(metadata)+1024,document=metadataMaximum+record.reserved.orderBytes+record.reserved.settlementBytes+record.reserved.recoveryBytes,history=metadataMaximum+record.reserved.orderBytes+record.reserved.recoveryBytes;
  const allocatedBytes=document+history+4096+8192;
  if(!Number.isSafeInteger(allocatedBytes)||allocatedBytes<bytes(record)+bytes((({settlement:_s,...projection})=>projection)(record))+bytes(admission(record)))fail('PER_ORDER_RESERVATION_INVALID');
  return {version:1,binding:record.binding,allocatedBytes};
 }
 async function readRaw(id:string,historyProjection=false){operation(id);assertContext();const raw=await redis.eval(historyProjection?MARKET_ORDER_REPOSITORY_HISTORY_READ:continuousPerOrderResourceProfile(id)==='batch-v1'?MARKET_ORDER_REPOSITORY_BATCH_READ:MARKET_ORDER_REPOSITORY_READ,[historyProjection?namespace+'history:'+id:recordKey(id)],[]),record=decode(raw);if(record&&(record.operationId!==id||historyProjection&&record.settlement))fail('PER_ORDER_STATE_UNAVAILABLE');return {raw:raw===null||raw===undefined?null:raw as string,record};}
 async function commit(oldRaw:string|null,next:MarketOrderEnvelope,guard?:MarketCommitGuard){
  assertWritable();const checked=guardChecked(guard,continuous);validate(next);
  const previous=oldRaw===null?null:decode(oldRaw),budgetOperation=checked.continuousOperation;
  if(continuous){
   if(previous===null&&(!budgetOperation||budgetOperation.action!=='reserve'))fail('FREE_DEMO_OPERATION_RESERVATION_REQUIRED');
   if(budgetOperation&&(budgetOperation.operationId!==next.operationId||budgetOperation.principalHash!==sha(next.buyerOwnerId)||!['reserve','release'].includes(budgetOperation.action)||budgetOperation.action==='reserve'&&previous!==null||budgetOperation.action==='release'&&(!previous||!next.order||!['delivered','delivery-failed'].includes(next.order.phase))))fail('INVALID_COMMIT_GUARD');
  }
  const buyer=indexKey(next.buyerOwnerId,'buyer'),seller=indexKey(next.sellerOwnerId,'seller'),work=namespace+'work',sellerPending=indexKey(next.sellerOwnerId,'seller-pending'),fp=fingerprint(next);
  const buyerParticipant=indexKey(next.buyerOwnerId,'participant'),sellerParticipant=indexKey(next.sellerOwnerId,'participant');
  const keys=[recordKey(next.operationId),buyer,seller,work,revisionKey(buyer),revisionKey(seller),legacyPrefix+':state',legacyPrefix+':x402-settlements:state',namespace+'authorization:'+(fp||'none:'+next.operationId),sellerPending,revisionKey(sellerPending),buyerParticipant,sellerParticipant,revisionKey(buyerParticipant),revisionKey(sellerParticipant),revisionKey(work),namespace+'history:'+next.operationId];
  const {settlement:_privateSettlement,...projection}=next;
  const args=[oldRaw===null?'missing':'present',oldRaw??'',JSON.stringify(next),next.createdAt+'|'+next.operationId,next.revision,next.operationId,next.intentHash,next.binding,fp,pending(next)?'1':'0',JSON.stringify(checked.values),checked.admissionExpiresAt===undefined?'':String(checked.admissionExpiresAt),JSON.stringify(projection)];
  let script=MARKET_ORDER_REPOSITORY_CAS;
  if(continuous){
   const allocated=allocation(next),previousAllocation=previous?allocation(previous):null;
   if(previousAllocation&&canonical(allocated)!==canonical(previousAllocation))fail('PER_ORDER_RESERVATION_INVALID');
   const composed=await preparePerOrderContinuousCommit(redis,workspacePrefix,{key:allocationKey(next.operationId),expectedRaw:previousAllocation?JSON.stringify(previousAllocation):null,nextRaw:JSON.stringify(allocated),reservedBytes:allocated.allocatedBytes},checked.keys.length,budgetOperation,next.order??previous?.order,next.budgetProfile);
   keys.push(...composed.keys,admissionKey(next.operationId));args.push(...composed.args,JSON.stringify(admission(next)),previous?JSON.stringify(admission(previous)):'');script=composed.script;
  }
  keys.push(...checked.keys);
  const result=await redis.eval(script,keys,args);
  if(result===-11)fail('FREE_DEMO_REQUEST_LIMIT',429);
  if(result===-10||result===-12)fail('FREE_DEMO_BUDGET_UNAVAILABLE');
  if(result===-20)fail('FREE_DEMO_STORAGE_WRITE_UNCONFIRMED',409);
  if(result===-21)fail('FREE_DEMO_STORAGE_UNINITIALIZED');
  if(result===-22||result===-23)fail('FREE_DEMO_STORAGE_UNAVAILABLE');
  if(result===-24)fail('FREE_DEMO_STORAGE_CAPACITY');
  if(result!==1){if(result===0)fail('ORDER_WRITE_CONFLICT',409);if(result===-7)fail('LEGACY_ORDER_EXISTS',409);if(result===-9)fail('X402_AUTHORIZATION_REUSE',409);if(result===-1)fail('SELLER_CAPACITY_EXPIRED',503);if(result===-31)fail('LEGACY_ORDER_REQUIRED',409);fail('PER_ORDER_STATE_UNAVAILABLE');}
 }
 async function page(key:string,scope:string,opts:OrderRepositoryPageOptions={},expected?:{ownerId:string;role:'buyer'|'seller'|'participant'}){
  assertContext();const limit=opts.limit??20;if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('INVALID_REQUEST',400);
  let after='+';if(opts.cursor!==undefined){try{if(!/^[A-Za-z0-9_-]{1,512}$/.test(opts.cursor))throw Error();const decoded=Buffer.from(opts.cursor,'base64url');if(decoded.toString('base64url')!==opts.cursor)throw Error();const parsed=JSON.parse(decoded.toString('utf8'));if(Object.keys(parsed).sort().join(',')!=='member,scope,version'||parsed.version!==2||parsed.scope!==scope||typeof parsed.member!=='string'||!memberPattern.test(parsed.member))throw Error();after='('+parsed.member;}catch{fail('INVALID_CURSOR',400);}}
  const raw=await redis.eval(continuous?MARKET_ORDER_REPOSITORY_HISTORY_PAGE:MARKET_ORDER_REPOSITORY_PAGE,[key,revisionKey(key)],[after,String(limit+1),...(continuous?[namespace,expected?.ownerId??'',expected?.role??'work']:[])]);
  if(raw===-31)fail('LEGACY_ORDER_REQUIRED',409);
  if(raw===-24)fail('PER_ORDER_STATE_UNAVAILABLE');
  if(!Array.isArray(raw)||raw.length!==(continuous?3:2)||typeof raw[0]!=='string'||!Array.isArray(raw[1])||raw[0]&&!uuid.test(raw[0])||raw[1].length>limit+1||continuous&&(!Array.isArray(raw[2])||raw[2].length>limit||raw[2].length>raw[1].length||raw[1].length>0&&raw[2].length===0))fail('PER_ORDER_INDEX_UNAVAILABLE');
  const members=raw[1] as unknown[];if(members.some(x=>typeof x!=='string'||!memberPattern.test(x)))fail('PER_ORDER_INDEX_UNAVAILABLE');
  if(members.length&&!raw[0])fail('PER_ORDER_INDEX_UNAVAILABLE');
  const orders:MarketOrder[]=[],archived:MarketRecovery[]=[];let size=0,last:string|undefined;
  for(const [index,member] of (members as string[]).slice(0,continuous?(raw[2] as unknown[]).length:limit).entries()){
   const id=member.slice(member.lastIndexOf('|')+1);operation(id);
   const record=continuous?decode((raw[2] as unknown[])[index]):(await readRaw(id,true)).record;
   if(!record||record.createdAt+'|'+record.operationId!==member||expected&&(expected.role==='participant'?![record.buyerOwnerId,record.sellerOwnerId].includes(expected.ownerId):(expected.role==='buyer'?record.buyerOwnerId:record.sellerOwnerId)!==expected.ownerId))fail('PER_ORDER_INDEX_UNAVAILABLE');
   const value=record.order??record.recovery!;const wanted=bytes(value)+1;
   if(size+wanted>126976){if(!last)fail('RESPONSE_TOO_LARGE');break;}
   size+=wanted;last=member;if(record.order)orders.push(structuredClone(record.order));else archived.push(structuredClone(record.recovery!));
  }
  const consumed=orders.length+archived.length,more=consumed<members.length;
  return {orders,archived,...(more&&last?{nextCursor:Buffer.from(JSON.stringify({version:2,scope,member:last})).toString('base64url')} :{}),guard:{keys:[revisionKey(key)],values:[raw[0]||null]}};
 }
 async function admissionPage(ownerId:string,role:'buyer'|'seller-pending'|'seller',opts:OrderRepositoryPageOptions={}):Promise<OrderRepositoryAdmissionPage>{
  assertContext();if(!continuous)fail('PER_ORDER_ADMISSION_PROJECTION_REQUIRED');
  owner(ownerId);if(!['buyer','seller-pending','seller'].includes(role))fail('INVALID_REQUEST',400);
  const key=indexKey(ownerId,role),scope='admission:'+role+':'+sha(ownerId),limit=opts.limit??20;
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('INVALID_REQUEST',400);
  let after='+';if(opts.cursor!==undefined){try{if(!/^[A-Za-z0-9_-]{1,512}$/.test(opts.cursor))throw Error();const decoded=Buffer.from(opts.cursor,'base64url');if(decoded.toString('base64url')!==opts.cursor)throw Error();const parsed=JSON.parse(decoded.toString('utf8'));if(Object.keys(parsed).sort().join(',')!=='member,scope,version'||parsed.version!==2||parsed.scope!==scope||typeof parsed.member!=='string'||!memberPattern.test(parsed.member))throw Error();after='('+parsed.member;}catch{fail('INVALID_CURSOR',400);}}
  const raw=await redis.eval(MARKET_ORDER_REPOSITORY_ADMISSION_PAGE,[key,revisionKey(key)],[after,String(limit+1),namespace,ownerId,role]);
  if(!Array.isArray(raw)||raw.length!==3||!Array.isArray(raw[2])||raw[2].length!==Math.min(limit,Array.isArray(raw[1])?raw[1].length:0)||typeof raw[0]!=='string'||!Array.isArray(raw[1])||raw[0]&&!uuid.test(raw[0])||raw[1].length>limit+1)fail('PER_ORDER_INDEX_UNAVAILABLE');
  const members=raw[1] as unknown[];if(members.some(x=>typeof x!=='string'||!memberPattern.test(x))||members.length&&!raw[0])fail('PER_ORDER_INDEX_UNAVAILABLE');
  const records:MarketOrderAdmission[]=[];let last:string|undefined;
  for(const [position,member] of (members as string[]).slice(0,limit).entries()){
   const id=member.slice(member.lastIndexOf('|')+1);operation(id);
   const encoded=(raw[2] as unknown[])[position];
   if(typeof encoded!=='string'||Buffer.byteLength(encoded)>4096)fail('PER_ORDER_ADMISSION_UNAVAILABLE');
   let record:MarketOrderAdmission;try{record=admissionSchema.parse(JSON.parse(encoded));}catch{fail('PER_ORDER_ADMISSION_UNAVAILABLE');}
   if(record.operationId!==id||record.createdAt+'|'+record.operationId!==member||(role==='buyer'?record.buyerOwnerId:record.sellerOwnerId)!==ownerId)fail('PER_ORDER_ADMISSION_UNAVAILABLE');
   last=member;records.push(record);
  }
  const more=members.length>records.length&&last,nextCreatedAt=more?(members[records.length] as string).slice(0,24):undefined;
  if(nextCreatedAt!==undefined&&(!Number.isFinite(Date.parse(nextCreatedAt))||new Date(nextCreatedAt).toISOString()!==nextCreatedAt))fail('PER_ORDER_INDEX_UNAVAILABLE');
  return {records,...(more?{nextCursor:Buffer.from(JSON.stringify({version:2,scope,member:last})).toString('base64url'),nextCreatedAt}:{}),guard:{keys:[revisionKey(key)],values:[raw[0]||null]}};
 }
 const repository:MarketOrderRepository={
  async read(id){return (await readRaw(id)).record;},
  async create(order,opts={}){
   operation(order.operationId);assertWritable();const guard=guardChecked(opts.guard,continuous);if(guard.continuousOperation&&(guard.continuousOperation.operationId!==order.operationId||guard.continuousOperation.principalHash!==sha(order.buyerOwnerId)))fail('INVALID_COMMIT_GUARD');
   const {raw,record}=await readRaw(order.operationId),intentHash=marketIntentHash(order);
   if(record){if(record.buyerOwnerId!==order.buyerOwnerId)fail('NOT_FOUND',404);if(record.intentHash!==intentHash||record.binding!==perOrderBinding(order)||record.sellerOwnerId!==order.sellerOwnerId)fail('OPERATION_ID_REUSED',409);return {envelope:record,replayed:true};}
   const futureOrderBytes=maximumMarketRecordBytes(order),batch=continuous&&order.executionMode==='on-demand'&&order.paymentProtocol==='x402-stellar-exact-v2'&&futureOrderBytes<=49152&&(!opts.settlement||maximumSettlementRecordBytes(opts.settlement)<=50000);
   const next:MarketOrderEnvelope={version:2,...(batch?{budgetProfile:'batch-v1' as const}:{}),revision:randomUUID(),operationId:order.operationId,buyerOwnerId:order.buyerOwnerId,sellerOwnerId:order.sellerOwnerId,createdAt:order.createdAt,intentHash,binding:perOrderBinding(order),immutableHash:immutable(order),reserved:{orderBytes:futureOrderBytes,settlementBytes:order.paymentProtocol?batch?50000:PER_ORDER_MAX_SETTLEMENT_BYTES:0,recoveryBytes:maximumMarketRecoveryBytes(order)},order:structuredClone(order),...(opts.settlement?{settlement:structuredClone(opts.settlement),challengeHash:sha(canonical(opts.settlement.challenge))}:{})};
   validate(next);await commit(raw,next,opts.guard);return {envelope:structuredClone(next),replayed:false};
  },
  async transact(id,op,opts={}){
   operation(id);assertWritable();const guard=guardChecked(opts.guard,continuous);if(guard.continuousOperation&&guard.continuousOperation.operationId!==id)fail('INVALID_COMMIT_GUARD');
   const {raw,record}=await readRaw(id);if(!record)fail('NOT_FOUND',404);
   const next=structuredClone(record),result=op(next);if(result instanceof Promise||result&&typeof result==='object'&&'then' in result)fail('ASYNC_ORDER_CALLBACK_FORBIDDEN');const clonedResult=structuredClone(result);
   if(next.budgetProfile!==record.budgetProfile||next.operationId!==record.operationId||next.buyerOwnerId!==record.buyerOwnerId||next.sellerOwnerId!==record.sellerOwnerId||next.createdAt!==record.createdAt||next.intentHash!==record.intentHash||next.binding!==record.binding||next.immutableHash!==record.immutableHash||canonical(next.reserved)!==canonical(record.reserved)||record.challengeHash&&next.challengeHash!==record.challengeHash||record.readinessAttemptId&&next.readinessAttemptId!==record.readinessAttemptId||record.recovery&&!next.recovery||fingerprint(record)&&fingerprint(next)!==fingerprint(record))fail('PER_ORDER_IMMUTABLE_BINDING_CHANGED',409);
   if(next.settlement&&!next.challengeHash)next.challengeHash=sha(canonical(next.settlement.challenge));
   if(next.recovery&&!record.recovery&&record.order&&canonical(next.recovery)!==canonical(marketRecoveryRecord(record.order,record.settlement,Date.parse(next.recovery.archivedAt))))fail('PER_ORDER_RECOVERY_BINDING_CHANGED',409);
   if(record.recovery&&next.recovery&&recoveryImmutable(next.recovery)!==recoveryImmutable(record.recovery))fail('PER_ORDER_RECOVERY_BINDING_CHANGED',409);
   validate(next);if(canonical(next)!==canonical(record)||opts.guard){next.revision=randomUUID();await commit(raw,next,opts.guard);}return clonedResult;
  },
  async list(id,opts={}){if(opts.role)return repository.indexSnapshot(id,opts.role,opts);owner(id);return page(indexKey(id,'participant'),'participant:'+sha(id),opts,{ownerId:id,role:'participant'});},
  async indexSnapshot(id,role,opts={}){owner(id);if(!['buyer','seller'].includes(role))fail('INVALID_REQUEST',400);return page(indexKey(id,role),role+':'+sha(id),opts,{ownerId:id,role});},
  async pendingSnapshot(id,opts={}){owner(id);return page(indexKey(id,'seller-pending'),'seller-pending:'+sha(id),opts,{ownerId:id,role:'seller'});},
  async workPage(opts={}){return page(namespace+'work','work',opts);},
  async admissionSnapshot(id,role,opts={}){return admissionPage(id,role,opts);},
 };return repository;
}
