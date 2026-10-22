import {createHash, randomUUID} from 'node:crypto';
import {assertPolicy,hashPolicy} from '../policy-router/fee-split-policy-v1.mjs';
import {makeSettledHistoryRecord} from '../conformance-history/history-record.mjs';

export const EXCLUDED_IDS=Object.freeze(['31c97193-be74-4b9d-b0a3-f3890b0a41e8','ed6c4530-e76f-49e0-8f39-5ec8578820e2']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash=v=>createHash('sha256').update(v).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
export function assertNewId(id){need(uuid.test(id)&&!EXCLUDED_IDS.includes(id),'SPLIT_OPERATION_EXCLUDED');return id;}
const phases=['awaiting-payment','payment-submitting','payment-uncertain','paid','delivered','delivery-failed'];
const edges={'awaiting-payment':['payment-submitting'],'payment-submitting':['payment-uncertain','paid'],'payment-uncertain':['paid'],paid:['delivered','delivery-failed']};
function immutable(r){return JSON.stringify([r.policy,r.buyerOwnerId,r.sellerOwnerId,r.treasuryOwnerId,r.createdAt,r.serviceId,r.input]);}
function check(r){
 need(r&&r.version==='bazaar.native-split-order/v1'&&assertNewId(r.operationId)&&uuid.test(r.revision),'SPLIT_RECORD_INVALID');
 assertPolicy(r.policy);need(r.policy.operationId===r.operationId&&r.policyHash===hashPolicy(r.policy),'SPLIT_POLICY_BINDING_CHANGED');
 need([r.buyerOwnerId,r.sellerOwnerId,r.treasuryOwnerId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,96}$/.test(v))&&new Set([r.buyerOwnerId,r.sellerOwnerId,r.treasuryOwnerId]).size===3,'SPLIT_DISTINCT_OWNERS_REQUIRED');
 need(phases.includes(r.phase)&&Number.isSafeInteger(r.createdAt)&&r.createdAt>=0&&typeof r.serviceId==='string'&&r.serviceId.length<=100&&typeof r.input==='string'&&Buffer.byteLength(r.input)<=8192,'SPLIT_RECORD_INVALID');
 need(Buffer.byteLength(JSON.stringify(r))<=65536,'SPLIT_RECORD_BOUND');
 if(['paid','delivered','delivery-failed'].includes(r.phase))makeSettledHistoryRecord({policy:r.policy,verifiedReceipt:r.receipt,owners:r,phase:r.phase,createdAt:r.createdAt,delivery:r.delivery});
 if(r.delivery){need(typeof r.delivery.text==='string'&&Buffer.byteLength(r.delivery.text)<=8192&&hash(r.delivery.text)===r.delivery.sha256,'SPLIT_DELIVERY_INVALID');}
 return r;
}
export const SPLIT_ORDER_CAS=`local clock=redis.call('TIME')
local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
if now>=tonumber(ARGV[1]) then return -2 end
if ARGV[6]=='31c97193-be74-4b9d-b0a3-f3890b0a41e8' or ARGV[6]=='ed6c4530-e76f-49e0-8f39-5ec8578820e2' then return -31 end
for i=1,5 do local t=redis.call('TYPE',KEYS[i]);if type(t)=='table' then t=t.ok end;local want=(i>=2 and i<=4) and 'zset' or 'string';if t~='none' and t~=want then return -8 end end
local guards=cjson.decode(ARGV[2])
local splitGuardEnd=#KEYS
-- SPLIT_GUARDS_END_INDEX
for i=6,splitGuardEnd do local v=redis.call('GET',KEYS[i]);local want=guards[i-5]
 if want==cjson.null then if v then return -2 end else if v~=want then return -2 end end end
if ARGV[7]~='' and redis.call('GET',KEYS[5]) then return -3 end
local old=redis.call('GET',KEYS[1])
if ARGV[3]=='missing' then if old then return 0 end else if old~=ARGV[3] then return 0 end end
-- SPLIT_NATIVE_PRECOMPUTE
redis.call('SET',KEYS[1],ARGV[4])
for i=2,4 do redis.call('ZADD',KEYS[i],0,ARGV[6]) end
if ARGV[7]~='' then redis.call('SET',KEYS[5],ARGV[7]) end
-- SPLIT_NATIVE_WRITE
return 1`;
export const SPLIT_OWNER_PAGE=`local ids=redis.call('ZRANGEBYLEX',KEYS[1],ARGV[1],'+','LIMIT',0,2)
local rows={}
for _,id in ipairs(ids) do if string.len(id)~=36 or not string.match(id,'^[a-f0-9%-]+$') or id=='31c97193-be74-4b9d-b0a3-f3890b0a41e8' or id=='ed6c4530-e76f-49e0-8f39-5ec8578820e2' then return -2 end;local row=redis.call('GET',ARGV[2]..id);if not row or string.len(row)>65536 then return -2 end;table.insert(rows,row) end
return {rows,#ids}`;
/** Standalone split namespace. Never aliases orders:v2, legacy state or budget keys.
 * Native budget/quota/capacity must atomically reserve split-specific holds separately before enabling admission.
 * This store intentionally cannot create, resize, release or refund ANY financial hold.
 */
export function createSplitOrderStore({redis,namespace,authorizeWrite,nativeAdmission}={}){
 need(redis&&typeof redis.get==='function'&&typeof redis.eval==='function'&&(typeof authorizeWrite==='function'||typeof nativeAdmission?.prepareWrite==='function')&&/^bazaar:split:v1:pilot:[a-f0-9]{32}$/.test(namespace),'SPLIT_STORE_NOT_CONFIGURED');
 const key=id=>namespace+':order:'+assertNewId(id), index=owner=>namespace+':owner:'+hash(owner);
 async function read(id){const raw=await redis.get(key(id));if(raw===null||raw===undefined)return null;need(typeof raw==='string'&&Buffer.byteLength(raw)<=65536,'SPLIT_RECORD_BOUND');const row=check(JSON.parse(raw));need(row.operationId===id,'SPLIT_RECORD_BINDING_CHANGED');return {row,raw};}
 async function commit(previous,next,idempotency,principal){check(next);if(previous){need(immutable(previous.row)===immutable(next),'SPLIT_IMMUTABLE_CHANGED');need(edges[previous.row.phase]?.includes(next.phase),'SPLIT_TRANSITION_INVALID');}
  const g=nativeAdmission?await nativeAdmission.prepareWrite({previous:previous?.row,next,principal}):await authorizeWrite({operationId:next.operationId,buyerOwnerId:next.buyerOwnerId,sellerOwnerId:next.sellerOwnerId,action:previous?'transition':'create'});
  need(g&&Array.isArray(g.keys)&&g.keys.length>0&&g.keys.length<=32&&g.keys.length===g.values?.length&&g.keys.every(k=>typeof k==='string'&&k.length<=256&&!k.startsWith(namespace+':'))&&g.values.every(v=>v===null||typeof v==='string'&&Buffer.byteLength(v)<=(nativeAdmission?1048576:16384))&&Number.isSafeInteger(g.expiresAtMs),'SPLIT_ADMISSION_GUARD_REQUIRED');
  const ik=idempotency?namespace+':idempotency:'+hash(next.buyerOwnerId+':'+idempotency.key):namespace+':idempotency-unused';
  const keys=[key(next.operationId),index(next.buyerOwnerId),index(next.sellerOwnerId),index(next.treasuryOwnerId),ik,...g.keys];
  const args=[String(g.expiresAtMs),JSON.stringify(g.values),previous?.raw??'missing',JSON.stringify(next),String(next.createdAt),next.operationId,idempotency?JSON.stringify({digest:idempotency.digest,operationId:next.operationId}):''];
  const plan=nativeAdmission?await g.commit({keys,args,script:SPLIT_ORDER_CAS}):{keys,args,script:SPLIT_ORDER_CAS};
  let result;try{result=await redis.eval(plan.script,plan.keys,plan.args);}catch{throw Error('SPLIT_WRITE_UNCONFIRMED');}
  if(result===-3&&idempotency)return replay(next.buyerOwnerId,idempotency);need(result===1,result===0?'SPLIT_WRITE_CONFLICT':'SPLIT_WRITE_UNCONFIRMED');return structuredClone(next);
 }
 async function replay(owner,idempotency){const raw=await redis.get(namespace+':idempotency:'+hash(owner+':'+idempotency.key));if(!raw)return null;need(typeof raw==='string'&&Buffer.byteLength(raw)<=512,'SPLIT_IDEMPOTENCY_UNAVAILABLE');const prior=JSON.parse(raw);need(prior.digest===idempotency.digest,'SPLIT_IDEMPOTENCY_CONFLICT');const r=await read(prior.operationId);need(r?.row.buyerOwnerId===owner,'SPLIT_IDEMPOTENCY_UNAVAILABLE');return r.row;}
 return Object.freeze({
  async create(row,idempotency,principal){assertNewId(row.operationId);need(row.phase==='awaiting-payment'&&row.revision===undefined,'SPLIT_INITIAL_STATE_INVALID');need(idempotency&&/^[a-zA-Z0-9_-]{16,96}$/.test(idempotency.key)&&/^[a-f0-9]{64}$/.test(idempotency.digest),'SPLIT_IDEMPOTENCY_REQUIRED');if(nativeAdmission)await nativeAdmission.authorize({principal,action:'create'});const prior=await replay(row.buyerOwnerId,idempotency);if(prior)return prior;return commit(null,{...structuredClone(row),revision:randomUUID()},idempotency,principal);},
  async read(id){return (await read(id))?.row??null;},
  async transition(id,revision,patch,principal){const old=await read(id);need(old&&old.row.revision===revision,'SPLIT_WRITE_CONFLICT');need(patch&&Object.keys(patch).every(k=>['phase','packet','receipt','transactionHash','delivery'].includes(k)),'SPLIT_PATCH_INVALID');return commit(old,{...old.row,...structuredClone(patch),revision:randomUUID()},undefined,principal);},
  async readOwnerPage({ownerId,limit,after}){need(limit===1&&typeof ownerId==='string'&&/^[a-zA-Z0-9_-]{1,96}$/.test(ownerId),'SPLIT_HISTORY_LIMIT_REQUIRED');if(after!==undefined)assertNewId(after);
   const result=await redis.eval(SPLIT_OWNER_PAGE,[index(ownerId)],[after?'('+after:'-',namespace+':order:']);need(Array.isArray(result)&&Number.isInteger(result[1])&&result[1]>=0&&result[1]<=2&&(result[1]===0||Array.isArray(result[0])&&result[0].length===result[1]),'SPLIT_HISTORY_STORAGE_INVALID');
   const rows=(result[1]===0?[]:result[0]).map(raw=>check(JSON.parse(raw)));need(rows.every(r=>[r.buyerOwnerId,r.sellerOwnerId,r.treasuryOwnerId].includes(ownerId)),'STORAGE_OWNER_INDEX_MISMATCH');
   return {records:rows.slice(0,1).map(r=>['paid','delivered','delivery-failed'].includes(r.phase)?makeSettledHistoryRecord({policy:r.policy,verifiedReceipt:r.receipt,owners:r,phase:r.phase,createdAt:r.createdAt,delivery:r.delivery}):{version:'bazaar.split-order/v1',profile:r.policy.profile,operationId:r.operationId,key:'bazaar:split:v1:orders:'+r.operationId,network:r.policy.network,asset:r.policy.asset,treasury:r.policy.treasury,buyerOwnerId:r.buyerOwnerId,sellerOwnerId:r.sellerOwnerId,treasuryOwnerId:r.treasuryOwnerId,phase:r.phase,createdAt:r.createdAt,grossAtomic:r.policy.grossAtomic,sellerNetAtomic:r.policy.sellerNetAtomic,feeAtomic:r.policy.feeAtomic,feeBps:150,policyHash:r.policyHash}),complete:true,nextKey:rows.length>1?rows[0].operationId:null};
  },
 });
}
