// Independent review of the actual guardian SDK middleware. All transports are
// in-memory response doubles; no Lua, credential or financial handler runs.
import assert from 'node:assert/strict';
import {withGuardianIdleWireScope,withGuardianWireScope,meteredFiniteGuardianRedis,guardianWireObservation,READ_GUARDIAN_INDEX_POLICY_LUA,CAS_GUARDIAN_POLICY_LUA,claimGuardianBudgetLua,parseGuardianPolicy,guardianExistingIdleBudgetLua} from '../lib/guardian-finite-budget.ts';
import {CONTINUOUS_FREE_BUDGET_LUA,continuousFreeBudgetConfiguration,continuousFreeBudgetKey,createContinuousFreeBudgetStore} from '../lib/continuous-free-budget.ts';
import {READ_WORKSPACE_MAINTENANCE_LUA} from '../lib/workspace-store.ts';
const prior=Object.fromEntries(['BAZAAR_FREE_DEMO_MODE','BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE'].map(name=>[name,process.env[name]]));
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
function client(send){let middleware,nextCalls=0;const object={use(fn){middleware=fn;},async command(body){return middleware({body},async request=>{nextCalls++;return send(request.body);});},async eval(script,keys,args){return (await object.command(['EVAL',script,keys.length,...keys,...args])).result;}};meteredFiniteGuardianRedis(object);return {redis:object,get nextCalls(){return nextCalls;}};}
try{
 process.env.BAZAAR_FREE_DEMO_MODE='continuous';process.env.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE='example-text-wire/v3';
 const p='bazaar-market:pilot-'+'a'.repeat(32),w=p.replace('bazaar-market','bazaar-workspace'),config={...continuousFreeBudgetConfiguration({BAZAAR_FREE_DEMO_MODE:'continuous',BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON:JSON.stringify({public:115000,authenticated:90000,recovery:105000,background:50000})}),transferBytes:9900000000};
 const index=JSON.stringify({version:1,nextExpiryAt:null,reconciliationDue:false,deliveryDue:false}),policy=JSON.stringify({v:1,last:1,attempts:[]}),padded=raw=>raw+'\n'.repeat(512-Buffer.byteLength(raw));
 const idle=client(body=>({result:body[1]===guardianExistingIdleBudgetLua()?[1,16,'background',60]:body[1]===READ_GUARDIAN_INDEX_POLICY_LUA?[padded(index),padded(policy)]:[padded(JSON.stringify({version:1,registryRevision:'22222222-2222-4222-8222-222222222222',initialized:true,nextExpiryAt:null})),'9999999999999999','999999']}));
 await withGuardianIdleWireScope(async()=>{
  const adapter={eval:async(script,keys,args)=>{equal(script,CONTINUOUS_FREE_BUDGET_LUA);return idle.redis.eval(guardianExistingIdleBudgetLua(),keys,args);}};
  await createContinuousFreeBudgetStore(adapter,w,config).background({commands:12,transferBytes:32768,reason:'guardian'});
  await Promise.all([idle.redis.eval(READ_GUARDIAN_INDEX_POLICY_LUA,[p+':maintenance-index:v1',p+':guardian-policy:v1'],[]),idle.redis.eval(READ_WORKSPACE_MAINTENANCE_LUA,[w+`:{${w.split(':')[1]}}:maintenance`],[])]);
  const observation=guardianWireObservation();equal(observation.requests,3);equal(observation.commandsUpper,10);assert.ok(observation.combinedUpperBytes<=36864);checks++;equal(observation.closed,false);
 });equal(idle.nextCalls,3);
 const malformed=client(()=>({result:1}));await withGuardianIdleWireScope(async()=>{
  await assert.rejects(malformed.redis.command(['GET',CONTINUOUS_FREE_BUDGET_LUA,1,continuousFreeBudgetKey(w),'{}','{}']),error=>error.code==='GUARDIAN_UNAUDITED_COMMAND');checks++;
 });equal(malformed.nextCalls,0);
 for(const body of [['EVAL',READ_GUARDIAN_INDEX_POLICY_LUA,2,{},'valid'],['EVAL',CAS_GUARDIAN_POLICY_LUA,1,'valid','present',{},'next']]){
  const bad=client(()=>({result:1}));await withGuardianWireScope(async()=>{await assert.rejects(bad.redis.command(body),error=>error.code==='GUARDIAN_UNAUDITED_COMMAND');checks++;});equal(bad.nextCalls,0);
 }
 for(const entry of [null,0,'primitive',[]]){assert.throws(()=>parseGuardianPolicy(JSON.stringify({v:1,last:1,attempts:[entry]})),error=>error.code==='GUARDIAN_POLICY_UNAVAILABLE'&&error.status===503);checks++;}
 const full=client(()=>({result:[1,1104,'background',60]}));await withGuardianWireScope(async()=>{
  await full.redis.eval(claimGuardianBudgetLua(),[p+':guardian-policy:v1',continuousFreeBudgetKey(w)],['{}','{}',JSON.stringify(config)]);
  equal(guardianWireObservation().commandsUpper,6);equal(guardianWireObservation().requests,1);
 });equal(full.nextCalls,1);
 const large='"'.repeat(1999999),key=w+':continuous-free-storage:v1';let release,nextPending=0;
 const concurrency=client(async()=>{if(!release)return {result:large};nextPending++;if(nextPending>1)throw Error('UNSAFE_SECOND_TRANSPORT_STARTED');return new Promise(resolve=>{release=()=>resolve({result:large});});});
 await withGuardianWireScope(async()=>{
  for(let i=0;i<14;i++)await concurrency.redis.command(['GET',key]);
  // Switch only the injected response double to an unresolved response.
  release=()=>{};
  const first=concurrency.redis.command(['GET',key]),second=concurrency.redis.command(['GET',key]).catch(error=>error);
  const rejected=await second;equal(rejected.code,'GUARDIAN_WIRE_CAPACITY');equal(nextPending,1);release();await first;
  assert.ok(guardianWireObservation().combinedUpperBytes<=64000000);checks++;
 });equal(concurrency.nextCalls,15);
 process.env.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE='example-text-wire/v2';
 const legacy=client(()=>({result:1}));await withGuardianIdleWireScope(()=>legacy.redis.command(['UNREVIEWED-LEGACY-DOUBLE']));equal(legacy.nextCalls,1);
 console.log(JSON.stringify({status:'PASS_LOCAL_INDEPENDENT_ACTUAL_GUARDIAN_WIRE_REVIEW',checks,idleRequests:3,idleCommandsUpper:10,atomicClaimCommandsUpper:6,concurrentOversizedSecondTransportPrevented:true,networkRequests:0,realRedisLua:false,ledgerWrites:0,financialSubmissions:0,productionChanges:0}));
}finally{for(const[name,value]of Object.entries(prior))value===undefined?delete process.env[name]:process.env[name]=value;}
