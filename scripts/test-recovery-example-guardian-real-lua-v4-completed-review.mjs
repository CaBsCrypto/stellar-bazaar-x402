import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readCompletedGuardianLuaReviewV4,verifyCompletedGuardianLuaReceiptsV4} from './recovery-example-guardian-real-lua-v4-completed-review.mjs';
const initial=JSON.parse(await readFile(new URL('../docs/evidence/recovery-example-guardian-real-lua-v4-2026-10-13.json',import.meta.url))),continued=JSON.parse(await readFile(new URL('../docs/evidence/recovery-example-guardian-real-lua-v4-continuation-2026-10-13.json',import.meta.url)));
let checks=0,network=0;const previous=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error('LIVE_NETWORK_FORBIDDEN');};
try{
 const review=await readCompletedGuardianLuaReviewV4();assert.deepEqual(review.aggregate,{commandsUpper:146,requests:65,bytes:95032});checks++;assert.equal(review.realContinuationAssertions,33);checks++;
 for(const changed of [{...continued,normalDebits:1},{...continued,canonicalHoldIntegrity:false},{...continued,aggregate:{...continued.aggregate,commandsUpper:71}},{...continued,productionPublished:true},{...continued,transport:{...continued.transport,bytes:1}},{...continued,sourceDigest:'0'.repeat(64)}]){assert.throws(()=>verifyCompletedGuardianLuaReceiptsV4(initial,changed));checks++;}
 assert.equal(network,0);checks++;console.log(JSON.stringify({status:'PASS_INDEPENDENT_COMPLETED_GUARDIAN_LUA_RECEIPT_VERIFICATION',publicReceiptChecks:checks,reportedRealContinuationAssertions:33,notAddedToCombinedTestTotal:true,actualNetworkRequests:0,privateProfileReads:0,productionChanged:false}));
}finally{globalThis.fetch=previous;}
