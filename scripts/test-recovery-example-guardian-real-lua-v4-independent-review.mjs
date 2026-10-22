import assert from 'node:assert/strict';
import {reviewGuardianRealLuaV4} from './recovery-example-guardian-real-lua-v4-independent-review.mjs';
let actualNetworkRequests=0;const previous=globalThis.fetch;globalThis.fetch=async()=>{actualNetworkRequests++;throw Error('LIVE_NETWORK_FORBIDDEN');};
try{
 const review=await reviewGuardianRealLuaV4();
 assert.equal(review.status,'PASS_LOCAL_INDEPENDENT_REAL_LUA_EXECUTION_PREPARATION_V4');assert.equal(review.actualRedisLuaExecutions,0);assert.equal(actualNetworkRequests,0);assert.equal(review.disposableKeyFingerprints.length,12);assert.equal(review.guard.maximumAuditedCommands,200);assert.equal(review.guard.maximumApplicationJsonBodyBytes,2000000);
 console.log(JSON.stringify({status:'PASS_LOCAL_INDEPENDENT_GUARDIAN_LUA_V4_REVIEW',checks:review.checks+6,realNetworkRequests:actualNetworkRequests,privateProfileReads:0,actualRedisLuaExecutions:0,productionChanged:false}));
}finally{globalThis.fetch=previous;}
