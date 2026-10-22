import {createHash} from 'node:crypto';
import {STAGE_PLAN} from './stage-accounting.mjs';
const KiB=1024,need=(v,c)=>{if(!v)throw Error(c);};
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
// These are application transport ceilings, not measured Upstash/HTTP/TLS fees.
// Exact scripts and key/argument descriptors must be checked before dispatch.
export const ADAPTER_TRANSPORT_LIMITS=freeze({
 coreRedis:{maximumRequestBytes:128*KiB,maximumResponseBytes:6*16*KiB+8*KiB,maximumCommands:32,maximumScriptBytes:64*KiB},
 journalRedis:{maximumRequestBytes:512*KiB,maximumResponseBytes:6*16*KiB+8*KiB,maximumCommands:32,maximumScriptBytes:64*KiB},
 rpc:{maximumRequestBytes:32*KiB,maximumResponseBytes:512*KiB,maximumHeaderBytes:16*KiB,maximumAttempts:1,timeoutMs:5000},
});
const contexts={read:0,challenge:2,settle:3,reconcile:1,'delivery-read':0,'delivery-write':0};
const nativeCalls={read:16,challenge:64,settle:96,reconcile:48,'delivery-read':16,'delivery-write':16};
const journalCalls={read:0,challenge:0,settle:4,reconcile:2,'delivery-read':0,'delivery-write':0};
const stages={};
for(const action of Object.keys(contexts)){
 const purposes={};const n=contexts[action],rpc=ADAPTER_TRANSPORT_LIMITS.rpc;
 for(const method of ['getNetwork','getLatestLedger','getLedgerEntries'])if(n)purposes['contract-context:'+method]={maxCalls:n,requestBytes:rpc.maximumRequestBytes,responseBytes:rpc.maximumResponseBytes};
 if(action==='challenge')for(const method of ['getLedgerEntries','simulateTransaction'])purposes['unsigned-challenge:'+method]={maxCalls:1,requestBytes:rpc.maximumRequestBytes,responseBytes:rpc.maximumResponseBytes};
 if(action==='settle'||action==='reconcile')purposes['transaction:getTransaction']={maxCalls:1,requestBytes:rpc.maximumRequestBytes,responseBytes:rpc.maximumResponseBytes};
 const journalPurposes=action==='settle'?{read:0,claim:1,transition:3}:action==='reconcile'?{read:1,claim:0,transition:1}:{read:0,claim:0,transition:0};
 const totalExternalCalls=Object.values(purposes).reduce((sum,p)=>sum+p.maxCalls,0);
 const totalExternalOutboundBytes=totalExternalCalls*rpc.maximumRequestBytes,totalExternalInboundBytes=totalExternalCalls*rpc.maximumResponseBytes;
 const core=ADAPTER_TRANSPORT_LIMITS.coreRedis,journal=ADAPTER_TRANSPORT_LIMITS.journalRedis;
 const totalCommands=nativeCalls[action]*core.maximumCommands+journalCalls[action]*journal.maximumCommands;
 const maximumRedisWireBytes=nativeCalls[action]*(core.maximumRequestBytes+core.maximumResponseBytes)+journalCalls[action]*(journal.maximumRequestBytes+journal.maximumResponseBytes);
 const totalWireBytes=maximumRedisWireBytes+totalExternalOutboundBytes+totalExternalInboundBytes;
 need(STAGE_PLAN[action]&&totalCommands<=STAGE_PLAN[action].commands&&totalWireBytes<=STAGE_PLAN[action].transferBytes,'NATIVE_ADAPTER_PREPAID_ENVELOPE_INSUFFICIENT');
 stages[action]={maximumCoreRedisCalls:nativeCalls[action],maximumJournalRedisCalls:journalCalls[action],maximumRedisCalls:nativeCalls[action]+journalCalls[action],maximumRedisWireBytes,totalCommands,totalWireBytes,totalExternalCalls,totalExternalOutboundBytes,totalExternalInboundBytes,purposes,journalPurposes,prepaidStageCommands:STAGE_PLAN[action].commands,prepaidStageBytes:STAGE_PLAN[action].transferBytes};
}
const value={version:'bazaar.native-adapter-prepaid/v1',transport:ADAPTER_TRANSPORT_LIMITS,stages};
export const ADAPTER_PREPAID_POLICY=freeze({...value,digest:createHash('sha256').update(JSON.stringify(value)).digest('hex')});
/** Validate the exact encoded Redis body against an independently recognized
 * script/key/argument descriptor. Calling this function grants no authority. */
export function validateAdapterRedisPayload(body,descriptor){
 need(Array.isArray(body)&&body[0]==='EVAL'&&typeof body[1]==='string'&&descriptor&&['coreRedis','journalRedis'].includes(descriptor.kind)&&typeof descriptor.script==='string'&&body[1]===descriptor.script,'NATIVE_ADAPTER_REDIS_DESCRIPTOR_REQUIRED');
 const limit=ADAPTER_TRANSPORT_LIMITS[descriptor.kind];
 need(Buffer.byteLength(body[1])<=limit.maximumScriptBytes&&Number.isSafeInteger(descriptor.commands)&&descriptor.commands>0&&descriptor.commands<=limit.maximumCommands&&Number.isSafeInteger(descriptor.responseBytes)&&descriptor.responseBytes>=0&&descriptor.responseBytes<=limit.maximumResponseBytes,'NATIVE_ADAPTER_REDIS_DESCRIPTOR_BOUND');
 need(Buffer.byteLength(JSON.stringify(body))<=limit.maximumRequestBytes,'NATIVE_ADAPTER_REDIS_REQUEST_BOUND');
 return {commands:descriptor.commands,outboundBytes:Buffer.byteLength(JSON.stringify(body)),maximumInboundBytes:descriptor.responseBytes};
}
/** One irreversible local ceiling per native capability. It grants no owner,
 * budget, journal or RPC authority and never reads/debits a continuous hold. */
export function createAdapterCostTrace(action){
 const plan=ADAPTER_PREPAID_POLICY.stages[action];need(plan,'NATIVE_ADAPTER_COST_ACTION');
 const counts={coreRedisCalls:0,journalRedisCalls:0,commands:0,redisOutboundBytes:0,redisReservedInboundBytes:0,externalCalls:0,externalOutboundBytes:0,externalReservedInboundBytes:0,purposes:{},uncertain:false};let failed=false;
 const whole=n=>Number.isSafeInteger(n)&&n>=0;
 const active=()=>need(!failed,'NATIVE_ADAPTER_COST_SCOPE_CLOSED');
 function check(){need(counts.commands<=plan.totalCommands&&counts.redisOutboundBytes+counts.redisReservedInboundBytes<=plan.maximumRedisWireBytes&&counts.externalOutboundBytes<=plan.totalExternalOutboundBytes&&counts.externalReservedInboundBytes<=plan.totalExternalInboundBytes,'NATIVE_ADAPTER_PREPAID_ALLOWANCE_EXCEEDED');}
 return Object.freeze({
  recordRedis({body,descriptor}={}){active();try{const amount=validateAdapterRedisPayload(body,descriptor),kind=descriptor.kind==='coreRedis'?'coreRedisCalls':'journalRedisCalls',max=descriptor.kind==='coreRedis'?plan.maximumCoreRedisCalls:plan.maximumJournalRedisCalls;need(counts[kind]<max,'NATIVE_ADAPTER_REDIS_CALL_LIMIT');counts[kind]++;counts.commands+=amount.commands;counts.redisOutboundBytes+=amount.outboundBytes;counts.redisReservedInboundBytes+=amount.maximumInboundBytes;check();return Object.freeze({...amount});}catch(e){failed=true;throw e;}},
  recordRedisResponse(response,reservedBytes){active();try{need(whole(reservedBytes)&&Buffer.byteLength(JSON.stringify(response)??'')<=reservedBytes,'NATIVE_ADAPTER_REDIS_RESPONSE_BOUND');}catch(e){failed=true;throw e;}},
  recordExternal({purpose,requestBytes,maximumResponseBytes}={}){active();try{const row=Object.hasOwn(plan.purposes,purpose)?plan.purposes[purpose]:undefined;need(row&&whole(requestBytes)&&requestBytes>0&&whole(maximumResponseBytes)&&maximumResponseBytes>0&&requestBytes<=row.requestBytes&&maximumResponseBytes<=row.responseBytes,'NATIVE_ADAPTER_RPC_DESCRIPTOR_BOUND');need((counts.purposes[purpose]??0)<row.maxCalls,'NATIVE_ADAPTER_RPC_CALL_LIMIT');counts.purposes[purpose]=(counts.purposes[purpose]??0)+1;counts.externalCalls++;counts.externalOutboundBytes+=requestBytes;counts.externalReservedInboundBytes+=maximumResponseBytes;check();}catch(e){failed=true;throw e;}},
  markUncertain(){counts.uncertain=true;},
  snapshot(){return freeze({version:ADAPTER_PREPAID_POLICY.version,costDigest:ADAPTER_PREPAID_POLICY.digest,action,...structuredClone(counts),closed:failed,additionalHoldDebitBytes:0,financialAuthority:false,physicalProviderUsageMeasured:false});},
 });
}
