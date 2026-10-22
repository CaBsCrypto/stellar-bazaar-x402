// Import-safe independent verification of PUBLIC execution receipts. No
// transport, decrypt, Lua execution, live profile or mutable ledger access.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GUARDIAN_LUA_VALIDATION_V4 as P,GUARDIAN_LUA_HASHES_V4 as H} from './recovery-example-guardian-real-lua-v4.mjs';
import {canonicalGuardianValueV4 as canonical} from './recovery-example-guardian-real-lua-v4-continuation.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
export function verifyCompletedGuardianLuaReceiptsV4(initial,continued){
 const require=(value,code)=>{if(!value)throw Error(code);};
 require(initial?.status==='UNCONFIRMED_ISOLATED_REAL_GUARDIAN_LUA_V4'&&initial.code==='GUARDIAN_EXISTING_SYNTHETIC_HOLD_CHANGED','ORIGINAL_UNCONFIRMED_RECEIPT_MUST_BE_PRESERVED');
 require(continued?.status==='PASS_RETAINED_REAL_GUARDIAN_LUA_V4_CONTINUATION'&&continued.priorReceiptCode===initial.code&&continued.checks===33,'SAME_RETAINED_CONTINUATION_REQUIRED');
 for(const value of [initial,continued]){
  require(value.sourceDigest===P.source&&canonical(value.scriptHashes)===canonical(H),'EXACT_V4_FROZEN_SCRIPTS_REQUIRED');
  for(const key of ['payments','signatures','settlements','providerExecutions','cronActivated','productionPublished','productionLimitsChanged','productionReservationsChanged','secretValuesReturned'])require(value[key]===(['cronActivated','productionPublished','productionLimitsChanged','productionReservationsChanged'].includes(key)?false:0),'ISOLATED_REAL_LUA_SCOPE_CHANGED');
  require(value.transport?.reservedInbound===0&&value.transport?.closed===false,'TRANSPORT_COMPLETION_UNCONFIRMED');
 }
 require(initial.automaticRetries===0,'ORIGINAL_FAILURE_MUST_NOT_RETRY');
 require(initial.transport.commandsUpper===75&&initial.transport.requests===37&&initial.transport.bytes===36228,'ORIGINAL_EXECUTION_BASELINE_CHANGED');
 require(continued.transport.commandsUpper===71&&continued.transport.requests===28&&continued.transport.bytes===58804,'EXACT_CONTINUATION_EXECUTION_REQUIRED');
 require(continued.aggregate?.commandsUpper===initial.transport.commandsUpper+continued.transport.commandsUpper&&continued.aggregate.requests===initial.transport.requests+continued.transport.requests&&continued.aggregate.bytes===initial.transport.bytes+continued.transport.bytes,'AGGREGATE_MUST_INCLUDE_PRIOR_EXECUTION');
 require(continued.aggregate.commandsUpper<=200&&continued.aggregate.bytes<=2000000,'ISOLATED_AGGREGATE_BUDGET_EXCEEDED');
 require(continued.canonicalHoldIntegrity===true,'CANONICAL_SYNTHETIC_HOLD_INTEGRITY_REQUIRED');
 for(const key of ['normalReseeds','normalClaims','normalDebits','keysDeleted','accountsCreated','ordersCreated'])require(continued[key]===0,'CONTINUATION_MUST_NOT_REPEAT_NORMAL_WORK');
 return {status:'PASS_INDEPENDENT_RETAINED_REAL_REDIS_GUARDIAN_LUA_V4_REVIEW',sourceDigest:P.source,scriptHashes:H,aggregate:continued.aggregate,priorFailurePreserved:true,priorFailureExplanation:'The original comparator used JSON.stringify object field order; the continuation checked semantic canonical hold equality and finished the same normal attempt without repeating its claim or debit.',realContinuationAssertions:33,checksNotSummedAcrossRepeatedRuns:true,verifiedProperties:['Existing-only idle rejects missing and invalid synthetic ledgers without initializing or repairing them.','The real missing/invalid/full-credit branches retain claimed policy with PTTL -1; the decision function rejects automatically expiring those returned claims after 33 days.','Competing initializers and competing claims admit one winner; the retained race ledger is debited once.','The normal synthetic hold remains semantically identical after the actual cjson ledger encoding.','The same normal attempt is completed using CAS against the exact read bytes and is not debited again.'],productionAcceptance:false,payments:0,productionChanges:0,limitations:['The 32-day scenario uses the policy decision clock; no physical 32-day wait was performed.','Audited Redis command upper bounds and raw JSON body bytes do not claim upstream billing precision.','These synthetic isolated Lua validations do not establish hosted payment or production acceptance.']};
}
export async function readCompletedGuardianLuaReviewV4(){
 const paths=[P.receipt,'docs/evidence/recovery-example-guardian-real-lua-v4-continuation-2026-10-13.json'],values=await Promise.all(paths.map(path=>readFile(new URL('../'+path,import.meta.url))));
 const review=verifyCompletedGuardianLuaReceiptsV4(...values.map(value=>JSON.parse(value)));
 return {...review,receiptPins:paths.map((path,i)=>({path,sha256:sha(values[i])}))};
}
