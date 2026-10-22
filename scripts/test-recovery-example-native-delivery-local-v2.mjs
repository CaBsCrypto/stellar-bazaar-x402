import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateNativeLocalMeasurementProfile} from './recovery-example-native-delivery-local-measurement-v2.mjs';
const source=await readFile(new URL('./recovery-example-native-delivery-local-measurement-v2.mjs',import.meta.url),'utf8');let checks=0;
assert.throws(()=>validateNativeLocalMeasurementProfile({purpose:'bazaar-recovery-example-native-local-measurement/v1'}));checks++;
for(const forbidden of ['authorizeEntry(','.settle(','.verify(','.transaction(','setMarketX402DependenciesForTests(','.initializeSellerStorage(','.initializeContinuousStorageLedger(','async function createOrder(','Keypair.fromRaw','run-new-v2','nativeMarket.x402','nativeMarket.workspaces']){assert.equal(source.includes(forbidden),false,forbidden);checks++;}
for(const required of ["claim.claimCommitted!==true","assert.equal(order.phase,'executing')","assert.equal(source.phase,'claim-started')","assert.equal(source.attemptId,order.attemptId)","assert.equal(await redis.get(rt+':data:'+name),null)","assert.equal(await redis.get(rt+':guard:'+name),null)","assert.equal(checkpoint.providerRequests,0)","if(++providerExecutions!==1)","'run-delivery-only-v2'","nativeResponseFailureDiagnostic(result,{tool})","recovery-example-native-wire-replay-v2.mjs","combinedMeasurementTotals","sameExistingPaidOperation:true","maximumRedisRestRequests:2000"]){assert.ok(source.includes(required),required);checks++;}
assert.equal(source.includes("'/x402'"),false);checks++;
assert.equal(source.includes('synthetic-redis-paid-ack-lost-after-commit'),false);checks++;
console.log(JSON.stringify({status:'PASS_EXISTING_LOCAL_V2_DELIVERY_PREPARATION',checks,sourceSha256:createHash('sha256').update(source).digest('hex'),networkRequests:0,redisWrites:0,payments:0,signatures:0,providerExecutions:0}));
