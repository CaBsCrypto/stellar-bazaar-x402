import assert from 'node:assert/strict';
import {runHostedSellerTick,sellerFreeDemoAdmissionUntil} from '../examples/seller-hosted-tick.mjs';
import {createHostedSellerHandler} from '../examples/seller-hosted-handler.mjs';
import {started,config,memoryStore,paidOrder,fixture,seedIntent} from './fixtures/seller-hosted.mjs';

let checks=0;
const until=new Date(started+86400000).toISOString();
const run=(f,extra={})=>f.run({freeDemoAdmissionUntil:until,...extra});
const expired=(options={})=>{const f=fixture(options);f.clock=Date.parse(until);return f;};
const drainState=f=>f.store.values.get('seller.hosted.tick');
for(const value of ['',null,1,'2026-02-31T12:00:00Z','2026-10-11T12:00:00+00:00','2026-10-11','2026-10-11T12:00:00.1Z',' 2026-10-11T12:00:00Z','2026-10-11T12:00:00Zextra']){assert.throws(()=>sellerFreeDemoAdmissionUntil(value),/FREE_DEMO_WINDOW_INVALID/);checks++;}
assert.equal(sellerFreeDemoAdmissionUntil(undefined),undefined);
assert.equal(sellerFreeDemoAdmissionUntil('2026-10-11T12:00:00Z'),'2026-10-11T12:00:00.000Z');checks++;

const open=fixture({orders:[]});open.clock=Date.parse(until)-1;
assert.equal((await run(open)).reportedCapacityReady,true);
const bindingBefore=drainState(open).bindingHash;
open.clock++;assert.equal((await run(open)).reportedCapacityReady,false);
assert.equal(drainState(open).bindingHash,bindingBefore);assert.equal(drainState(open).freeDemoDrain.complete,true);checks++;

const f=expired({orders:[]});assert.equal((await run(f)).reason,'idle');
assert.equal(f.capacityReports.at(-1).ready,false);assert.equal(drainState(f).freeDemoDrain.complete,true);
const checkpoint=structuredClone(drainState(f)),store=f.store;
let reads=0,writes=0,locks=0,journals=0;
const instrumented={...store,read:async name=>{reads++;return store.read(name);},write:async(...args)=>{writes++;return store.write(...args);},acquireLock:async(...args)=>{locks++;return store.acquireLock(...args);},journal:name=>{journals++;return store.journal(name);}};
const restart={...f.options,store:instrumented,freeDemoAdmissionUntil:until,now:()=>Date.parse(until)+86400000};
const restarted=await runHostedSellerTick(restart);
assert.equal(restarted.reason,'drained');assert.equal(restarted.mcpRequests,0);assert.equal(restarted.capacityLeaseRenewed,false);
assert.deepEqual([reads,writes,locks,journals],[1,0,0,0]);assert.deepEqual(drainState(f),checkpoint);checks++;

// A later-confirmed paid order remains reachable through protected recovery.
f.orders.push(paidOrder());f.clock=Date.parse(until)+1000;
const priorHttp=f.httpRequests;assert.equal((await run(f)).reason,'drained');assert.equal(f.httpRequests,priorHttp);
const recovered=await run(f,{recovery:true});assert.equal(recovered.reason,'delivered');assert.equal(recovered.reportedCapacityReady,false);assert.equal(f.providerCalls,1);
assert.equal((await run(f)).reason,'idle');assert.equal((await run(f)).reason,'drained');assert.equal(f.providerCalls,1);checks++;

const paid=expired();assert.equal((await run(paid)).reason,'delivered');assert.equal(paid.orders[0].phase,'delivered');assert.equal(paid.providerCalls,1);
assert.equal(paid.capacityReports.at(-1).ready,false);assert.equal(drainState(paid).freeDemoDrain.complete,false);
assert.equal((await run(paid)).reason,'idle');assert.equal((await run(paid)).reason,'drained');checks++;

const frozen=expired();await seedIntent(frozen,frozen.orders[0],'generated');frozen.healthResponse=()=>Response.json({ready:false,network:'stellar:testnet'});
assert.equal((await run(frozen)).reason,'delivered');assert.equal(frozen.providerCalls,0);assert.equal(frozen.orders[0].delivery.text,'Synthetic already generated');checks++;

for(const phase of ['awaiting-payment','payment-submitting','payment-uncertain','execution-uncertain','executing']){
 const pending=expired();pending.orders[0].phase=phase;
 const result=await run(pending);assert.equal(drainState(pending).freeDemoDrain.complete,false);assert.equal(result.reportedCapacityReady,false);assert.equal(pending.providerCalls,0);
 assert.notEqual((await run(pending)).reason,'drained');if(!['executing','execution-uncertain'].includes(phase))assert.equal(result.needsOwner,true);checks++;
}

const uncertain=expired();await seedIntent(uncertain,uncertain.orders[0],'provider-started');
assert.equal((await run(uncertain)).reason,'uncertainty');assert.equal(drainState(uncertain).freeDemoDrain.complete,false);assert.equal(uncertain.providerCalls,0);checks++;

const pages=expired({orders:Array.from({length:5},()=>({...paidOrder(),phase:'delivered'})),pageSize:2});
assert.equal((await run(pages)).reason,'idle');assert.equal(drainState(pages).freeDemoDrain.complete,false);
assert.equal((await run(pages)).reason,'idle');assert.equal(drainState(pages).freeDemoDrain.complete,false);
assert.equal((await run(pages)).reason,'idle');assert.equal(drainState(pages).freeDemoDrain.complete,true);
assert.equal((await run(pages)).reason,'drained');assert.equal(pages.events.filter(v=>v==='list_market_orders').length,3);checks++;

const pagePending=expired({orders:[{...paidOrder(),phase:'delivered'},{...paidOrder(),phase:'payment-uncertain'}],pageSize:1});
await run(pagePending);const blockedPage=await run(pagePending);assert.equal(blockedPage.drainBlocked,true);assert.equal(blockedPage.needsOwner,true);assert.equal(drainState(pagePending).freeDemoDrain.complete,false);checks++;

const ack=expired({orders:[]});ack.lostCapacity=true;
assert.equal((await run(ack)).reason,'unconfirmed');assert.equal(drainState(ack).freeDemoDrain.complete,false);
ack.lostCapacity=false;assert.equal((await run(ack)).reason,'idle');assert.equal(drainState(ack).freeDemoDrain.complete,true);checks++;

const corrupt=expired({orders:[]});await run(corrupt);drainState(corrupt).pending.push(paidOrder().operationId);
const corruptCalls=corrupt.httpRequests;assert.equal((await run(corrupt)).reason,'unconfirmed');assert.equal(corrupt.httpRequests,corruptCalls);checks++;

const rewind=expired({orders:[]});await run(rewind);rewind.clock--;
assert.equal((await run(rewind)).reason,'clock');assert.equal(rewind.providerCalls,0);checks++;

const changedWindow=expired({orders:[]});await run(changedWindow);const unchangedBinding=drainState(changedWindow).bindingHash,previousMcp=drainState(changedWindow).mcpRequests;
const extended=await run(changedWindow,{freeDemoAdmissionUntil:new Date(Date.parse(until)+60000).toISOString()});
assert.equal(extended.reportedCapacityReady,true);assert.equal(drainState(changedWindow).freeDemoDrain,null);assert.equal(drainState(changedWindow).bindingHash,unchangedBinding);assert.ok(extended.dayMcpRequests>previousMcp);checks++;

const cache=fixture({orders:[]});await run(cache);cache.clock+=4*60000;
const cachedTick=await run(cache);assert.equal(cachedTick.mcpRequests,5);assert.equal(cachedTick.identityRequests,0);assert.equal(cachedTick.identityCacheHit,true);assert.equal(cache.events.filter(v=>v==='get_bazaar_identity').length,1);
cache.clock=started+30*60000;const refreshedTick=await run(cache);assert.equal(refreshedTick.identityRequests,1);assert.equal(refreshedTick.identityCacheHit,false);assert.equal(cache.events.filter(v=>v==='get_bazaar_identity').length,2);checks++;
const changedConfig={...structuredClone(config),bazaarOrigin:'https://different.example'};
const noReuseCalls=cache.httpRequests;assert.equal((await run(cache,{config:changedConfig})).reason,'unconfirmed');assert.equal(cache.httpRequests,noReuseCalls);checks++;
const revoked=fixture({orders:[]});await run(revoked);revoked.clock+=240000;
revoked.options.fetcher=async()=>Response.json({error:'REVOKED'},{status:401});assert.equal((await run(revoked)).reason,'unconfirmed');assert.equal(revoked.providerCalls,0);checks++;

const cadence=fixture({orders:[]});cadence.clock=started;
for(let tick=0;tick<360;tick++){const result=await run(cadence);assert.equal(result.reportedCapacityReady,true);cadence.clock+=240000;}
const refreshes=cadence.events.filter(v=>v==='get_bazaar_identity').length;
assert.equal(refreshes,45);assert.equal(cadence.httpRequests,1845);assert.equal(cadence.providerCalls,0);assert.equal(drainState(cadence).ticks,180,'daily counters retain the existing UTC-day boundary');checks++;
const windowEnded=await run(cadence);assert.equal(windowEnded.reportedCapacityReady,false);assert.equal((await run(cadence)).reason,'drained');checks++;

const environment={CRON_SECRET:'c'.repeat(43),BAZAAR_HOSTED_SELLER_ENABLED:'true',BAZAAR_HOSTED_SELLER_CONFIG:JSON.stringify(config),BAZAAR_HOSTED_SELLER_PREFIX:'bazaar-seller:preview-'+'d'.repeat(32),BAZAAR_HOSTED_SELLER_REDIS_REST_URL:'https://synthetic-redis.upstash.io',BAZAAR_HOSTED_SELLER_REDIS_REST_TOKEN:'PRIVATE_SYNTHETIC_REDIS_TOKEN',BAZAAR_HOSTED_SELLER_KEY:Buffer.alloc(32,4).toString('base64url'),BAZAAR_FREE_DEMO_ADMISSION_UNTIL:until};
let handlerCalls=0;
const handler=createHostedSellerHandler(environment,{fetcher:()=>{throw Error('NETWORK_FORBIDDEN');},runTick:async input=>{handlerCalls++;assert.equal(input.freeDemoAdmissionUntil,until);assert.equal(input.recovery,true);assert.equal(input.config.cardHash,config.cardHash);return {reason:'idle',mcpRequests:0,providerRequests:0,executed:0};}});
const request=body=>new Request('https://provider.example/api/bazaar/seller/tick',{method:'POST',headers:{authorization:'Bearer '+environment.CRON_SECRET,'content-type':'application/json'},body});
assert.equal((await handler(request('{"recovery":true}'))).status,200);assert.equal(handlerCalls,1);checks++;
for(const body of ['{}','{"recovery":false}','{"recovery":true,"extra":1}','{"recovery":true}'+ ' '.repeat(33),'not-json']){assert.equal((await handler(request(body))).status,400);assert.equal(handlerCalls,1);checks++;}
const malformed=createHostedSellerHandler({...environment,BAZAAR_FREE_DEMO_ADMISSION_UNTIL:'invalid'},{runTick:()=>{assert.fail('invalid window must not run worker');}});
assert.equal((await malformed(request('{"recovery":true}'))).status,503);checks++;
assert.equal((await handler(new Request('https://provider.example/api/bazaar/seller/tick',{method:'POST',headers:{authorization:'Bearer '+'x'.repeat(43),'content-type':'application/json'},body:'{"recovery":true}'}))).status,401);checks++;
assert.equal((await handler(new Request('https://provider.example/api/bazaar/seller/tick?recovery=true',{method:'POST',headers:{authorization:'Bearer '+environment.CRON_SECRET,'content-type':'application/json'},body:'{"recovery":true}'}))).status,400);checks++;
let slowCancelled=false;
const slow=new Request('https://provider.example/api/bazaar/seller/tick',{method:'POST',headers:{authorization:'Bearer '+environment.CRON_SECRET,'content-type':'application/json'},body:new ReadableStream({start(){},cancel(){slowCancelled=true;}}),duplex:'half'});
const slowStart=Date.now();assert.equal((await handler(slow)).status,400);assert.ok(Date.now()-slowStart<1500);assert.equal(slowCancelled,true);assert.equal(handlerCalls,1);checks++;

for(const summary of [...f.reports,...paid.reports,...pages.reports,...cadence.reports]){
 const raw=JSON.stringify(summary);for(const secret of [config.agentAccess,config.providerAccess,'Synthetic private topic','https://provider.example'])assert.ok(!raw.includes(secret));
}
console.log(JSON.stringify({status:'PASS',checks,externalRequests:0,cloudWrites:0,payments:0,productionPublished:false,scheduled:false,freeDemo:{cadence:'*/4 * * * *',windowHours:24,ticks:360,identityRefreshes:refreshes,mcpHttpRequests:1845,expiredDrainedReads:1,expiredDrainedWrites:0,expiredDrainedMcpRequests:0},coverage:['strict optional UTC deployment deadline','same durable binding and counters','paid and frozen-result recovery after expiry','post-window complete paginated drain','uncertain and unpaid orders prevent sleep','lost ACK never establishes drain','one-read durable restart shortcut','protected bounded POST recovery','30-minute identity cache and revocation failure','binding mismatch and clock regression fail closed']}));
