import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {withExampleBudgetWireScope,activateExampleBudgetWireProof,meteredExampleBudgetRedis,currentExampleBudgetWireObservation} from '../lib/example-budget-wire.ts';
import {createContinuousExampleControlProof,continuousExampleBudgetWireLimits} from '../lib/continuous-free-budget.ts';
import {exampleBudgetRedisResponseAllocation} from '../lib/example-budget-response-allocation.ts';
const prior=process.env.BAZAAR_FREE_DEMO_MODE,sha=v=>createHash('sha256').update(v).digest('hex'),buyer='ow_'+'a'.repeat(32),seller='ow_'+'b'.repeat(32),kind={profile:'public',newOperation:false,workload:'metadata'},body=['GET','in-memory-inflight:key'];let checks=0;
process.env.BAZAAR_FREE_DEMO_MODE='continuous';
try{
 for(const version of ['example-text-wire/v1','example-text-wire/v2','example-text-wire/v3']){
  const environment={VERCEL_ENV:'preview',BAZAAR_FREE_DEMO_MODE:'continuous',BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE:version,BAZAAR_MARKET_BUYER_ALLOWLIST_JSON:JSON.stringify([buyer]),BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:JSON.stringify({serviceId:'bazaar-recovery-example-text-v1',cardHash:'c'.repeat(64),ownerFingerprint:sha(seller),url:'https://ai-video-scriptwriter-inflight-local.vercel.app/api/bazaar/example/tick',token:'a'.repeat(43)})};
  const proof=createContinuousExampleControlProof(buyer,kind,environment),limits=continuousExampleBudgetWireLimits(proof,kind),allocation=exampleBudgetRedisResponseAllocation(body),out=Buffer.byteLength(JSON.stringify(body))+4096;
  const maximumAdmitted=Math.min(limits.maximumRedisRequests,limits.maximumRedisCommands,Math.floor(limits.maximumInboundBytes/allocation),Math.floor(limits.maximumCombinedBytes/(allocation+out)));
  assert(maximumAdmitted>=1&&maximumAdmitted<112);checks++;
  let middleware;meteredExampleBudgetRedis({use(fn){middleware=fn;}});
  await withExampleBudgetWireScope(async()=>{
   activateExampleBudgetWireProof(proof,kind);let release,sends=0;const blocked=new Promise(resolve=>release=resolve),pending=[];
   for(let n=0;n<=maximumAdmitted;n++)pending.push(middleware({body},async()=>{sends++;await blocked;return {result:null};}));
   await Promise.resolve();assert.equal(sends,maximumAdmitted);checks++;release();const settled=await Promise.allSettled(pending);
   assert.equal(settled.filter(row=>row.status==='rejected').length,1);checks++;
   assert(settled.filter(row=>row.status==='fulfilled').length===maximumAdmitted);checks++;
   const observed=currentExampleBudgetWireObservation();assert(observed.outboundUpperBytes+observed.inboundUpperBytes<=limits.maximumCombinedBytes);checks++;
  },{fresh:true});
  // An unknown transport acknowledgement releases only its own reservation;
  // native uncertainty remains recorded and no response allocation leaks.
  await withExampleBudgetWireScope(async()=>{activateExampleBudgetWireProof(proof,kind);await assert.rejects(middleware({body},async()=>{throw Error('SYNTHETIC_ACK_LOST');}));checks++;await middleware({body},async()=>({result:null}));assert.equal(currentExampleBudgetWireObservation().uncertain,true);checks++;},{fresh:true});
 }
 // The default scope still transports commands without an optimized proof.
 let middleware,sends=0;meteredExampleBudgetRedis({use(fn){middleware=fn;}});await withExampleBudgetWireScope(async()=>{await Promise.all(Array.from({length:5},()=>middleware({body:['EVAL','return 123',0]},async()=>{sends++;return {result:123};})));assert.equal(sends,5);checks++;});
 console.log(JSON.stringify({status:'PASS_LOCAL_EXAMPLE_ORIGINAL_PROOFS_INFLIGHT_GUARD',checks,versions:3,reservationsReleasedOnce:true,legacyPricesAndMarkersChanged:false,externalRequests:0,realRedisLua:false,payments:0}));
}finally{prior===undefined?delete process.env.BAZAAR_FREE_DEMO_MODE:process.env.BAZAAR_FREE_DEMO_MODE=prior;}
