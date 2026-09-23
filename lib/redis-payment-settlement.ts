import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { paymentBinding } from "./pilot-payment-store.ts";
export interface SettlementRedis { eval(script:string, keys:string[], args:string[]):Promise<unknown> }
// Permanent marker, no lease and no expiry. Only its creator may call the facilitator.
const CLAIM = `
local old=redis.call('GET',KEYS[1])
if old then return {0,old} end
redis.call('SET',KEYS[1],ARGV[1])
return {1,ARGV[1]}`;
const UPDATE = `
local raw=redis.call('GET',KEYS[1])
if not raw then return 0 end
local old=cjson.decode(raw)
if old.owner~=ARGV[1] or old.binding~=ARGV[2] or old.phase=='completed' then return 0 end
redis.call('SET',KEYS[1],ARGV[3])
return 1`;
export async function settleRedisOnce(redis:SettlementRedis, prefix:string, operationId:string, payload:PaymentPayload, requirements:PaymentRequirements, settle:()=>Promise<SettleResponse>):Promise<SettleResponse> {
 if(!/^[a-zA-Z0-9:_-]{8,160}$/.test(prefix))throw Error('INVALID_SETTLEMENT_NAMESPACE');
 const key=prefix+':'+paymentBinding(operationId), binding=paymentBinding({payload,requirements}), owner=randomUUID();
 const started={version:1,binding,owner,phase:'started',createdAt:new Date().toISOString()};
 const answer=await redis.eval(CLAIM,[key],[JSON.stringify(started)]) as [number,string];
 if(!Array.isArray(answer)||answer.length!==2)throw Error('SETTLEMENT_STORAGE_UNCONFIRMED');
 let previous;
 try{previous=JSON.parse(answer[1]);}catch{throw Error('SETTLEMENT_RECORD_INVALID');}
 if(!previous || previous.version!==1 || typeof previous.binding!=='string' || !/^[a-f0-9]{64}$/.test(previous.binding) || typeof previous.owner!=='string' || !previous.owner || !['started','uncertain','completed'].includes(previous.phase) || typeof previous.createdAt!=='string' || !Number.isFinite(Date.parse(previous.createdAt)))throw Error('SETTLEMENT_RECORD_INVALID');
 if(previous.phase==='completed' && (!previous.outcome || typeof previous.outcome.success!=='boolean' || typeof previous.outcome.network!=='string' || typeof previous.outcome.transaction!=='string'))throw Error('SETTLEMENT_RECORD_INVALID');
 if(previous.binding!==binding)throw Error('OPERATION_CONFLICT');
 if(previous.phase==='completed' && previous.outcome.network!==requirements.network)throw Error('SETTLEMENT_RECORD_INVALID');
 if(answer[0]!==1){if(previous.phase==='completed'&&previous.outcome)return previous.outcome;throw Error('PAYMENT_PENDING');}
 if(previous.owner!==owner||previous.phase!=='started')throw Error('SETTLEMENT_STORAGE_UNCONFIRMED');
 try {
  const outcome=await settle();
  const saved=await redis.eval(UPDATE,[key],[owner,binding,JSON.stringify({...started,phase:'completed',outcome,updatedAt:new Date().toISOString()})]);
  if(saved!==1)throw Error('SETTLEMENT_FINALIZATION_UNCONFIRMED');
  return outcome;
 }catch(error){
  // A lost finalization response may already have saved completed; never downgrade it.
  try{await redis.eval(UPDATE,[key],[owner,binding,JSON.stringify({...started,phase:'uncertain',updatedAt:new Date().toISOString()})]);}catch{}
  throw error;
 }
}
export function configuredSettlementRedis():Redis {
 const url=process.env.UPSTASH_REDIS_REST_URL??process.env.KV_REST_API_URL;
 const token=process.env.UPSTASH_REDIS_REST_TOKEN??process.env.KV_REST_API_TOKEN;
 if(!url||!token)throw Error('SETTLEMENT_REDIS_REQUIRED');
 return new Redis({url,token,automaticDeserialization:false});
}
