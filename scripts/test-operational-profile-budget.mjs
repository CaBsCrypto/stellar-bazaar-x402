import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createOperationalBudgetStore, operationalCheckpointSchema } from '../lib/operational-budget.ts';
const now=Date.now(),oldNow=Date.now,prefix='bazaar-workspace:pilot-'+'e'.repeat(32),data=new Map();
// Synthetic allocation verifies profile isolation, not a real provider plan.
// Full registry/quota worst-case reservations intentionally exceed tiny usage.
const checkpoint={version:1,epoch:randomUUID(),observedAt:new Date(now).toISOString(),expiresAt:new Date(now+14*86400000).toISOString(),evidence:'synthetic-profile-isolation-not-billing',remaining:{requests:100000,redisRequests:495800,redisCommands:495800,outboundBytes:1000000000000,inboundBytes:1000000000000,externalRequests:0}};
const redis={async get(key){return data.get(key)??null;},async eval(_script,[key],[mode,old,next]){if(mode==='missing'?data.has(key):data.get(key)!==old)return 0;data.set(key,next);return 1;}};
const store=createOperationalBudgetStore(redis,prefix,()=>checkpoint);
try{
  for(let i=0;i<100;i++)await store.reserve({profile:'public',newOperation:false});
  for(let i=0;i<100;i++)await store.reserve({profile:'public',newOperation:false,workload:'metadata'});
  const catalog=await store.read();assert.equal(catalog.profiles.public.used.requests,200);assert.equal(catalog.profiles.public.used.externalRequests,0);assert.equal(catalog.profiles.public.pressure.externalRequests.applicable,false);
  assert.ok(catalog.profiles.public.used.inboundBytes<catalog.profiles.public.assigned.inboundBytes);
  assert.equal(catalog.profiles.recovery.used.requests,0,'Catalog does not consume paid-finalization allocation');
  await assert.rejects(store.reserve({profile:'authenticated',newOperation:true}),{code:'NEW_OPERATIONS_PAUSED'},'A public allowance cannot fabricate payment/provider allowance');
  Date.now=()=>now+25*3600000;
  await store.reserve({profile:'public',newOperation:false});assert.equal((await store.read()).stale,false,'Monthly epoch survives day one without automatic closure');
  const funded={...checkpoint,epoch:randomUUID(),observedAt:new Date(now+25*3600000).toISOString(),remaining:{...checkpoint.remaining,externalRequests:1000}};
  await store.refresh(funded);await store.reserve({profile:'authenticated',newOperation:true});
  const mixed=await store.read();assert.equal(mixed.profiles.authenticated.used.externalRequests,3);assert.equal(mixed.profiles.public.used.externalRequests,0);
  Date.now=()=>now+15*86400000;
  await assert.rejects(store.reserve({profile:'authenticated',newOperation:true}),{code:'OPERATIONAL_CHECKPOINT_STALE'});await store.reserve({profile:'public',newOperation:false});await store.reserve({profile:'recovery',newOperation:false});
  assert.equal(operationalCheckpointSchema.safeParse({...checkpoint,expiresAt:new Date(now+32*86400000).toISOString()}).success,false);
  console.log(JSON.stringify({status:'PASS',oneHundredPublicCatalogRequestsWithNoExternalAllowance:true,separatePaidCompletionReserve:true,monthlyEpochSurvives24Hours:true,billingExpiryOnlyPausesNewWork:true,externalAllowanceNeverFabricated:true,remoteRequests:0}));
}finally{Date.now=oldNow;}
