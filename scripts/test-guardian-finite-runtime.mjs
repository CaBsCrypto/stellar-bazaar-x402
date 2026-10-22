import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createMarketGuardianRunner} from '../lib/market-guardian.ts';
import {createMarketStore} from '../lib/marketplace-store.ts';
import {initialGuardianPolicy,parseGuardianPolicy,guardianPolicyDecision,guardianPolicyKey,READ_GUARDIAN_INDEX_POLICY_LUA,CAS_GUARDIAN_POLICY_LUA,claimGuardianBudgetLua,guardianExistingIdleBudgetLua,withGuardianWireScope,meteredFiniteGuardianRedis,guardianWireObservation,withGuardianIdleWireScope} from '../lib/guardian-finite-budget.ts';
import {CONTINUOUS_FREE_BUDGET_LUA,continuousFreeBudgetKey} from '../lib/continuous-free-budget.ts';
import {READ_WORKSPACE_MAINTENANCE_LUA} from '../lib/workspace-store.ts';
const sha=v=>createHash('sha256').update(v).digest('hex'),prior={...process.env},start=Date.parse('2026-10-13T00:00:00Z'),day=86400000,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),prefix='bazaar-market:pilot-'+'a'.repeat(32),workspace=prefix.replace('market','workspace');let checks=0;
process.env.BAZAAR_FREE_DEMO_MODE='continuous';process.env.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE='example-text-wire/v3';process.env.BAZAAR_WORKSPACE_PREFIX=workspace;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
function fixture({policy=initialGuardianPolicy(start),loseAtomicAck=false,loseOutcomeAck=false,failCleanup=true,missingLedger=false,invalidLedger=false}={}){
 let clock=start,policyRaw=policy?JSON.stringify(policy):null,indexRaw=JSON.stringify({version:1,nextExpiryAt:new Date(start).toISOString(),reconciliationDue:false,deliveryDue:false});
 const ledger={version:2,configuration:'UNCHANGED_FIXTURE_CONFIGURATION',last:start,buckets:[{day:Math.floor(start/day),used:{public:10,authenticated:20,recovery:30,background:40},bytes:100000}],held:[{operationId:id(99),principalHash:'f'.repeat(64),recoveryCommands:9984,backgroundCommands:4000,transferBytes:1421972480}]},originalHold=JSON.stringify(ledger.held),events=[],state={version:1,services:[],orders:[]};let cleanupCalls=0,fullDebits=0,outcomeWrites=0;
 const redis={get:async()=>assert.fail('V3 cheap index must use one EVAL'),eval:async(script,keys,args)=>{
  events.push(script===READ_GUARDIAN_INDEX_POLICY_LUA?'read-policy-index':script===claimGuardianBudgetLua()?'atomic-debit':'policy-CAS');
  if(script===READ_GUARDIAN_INDEX_POLICY_LUA){eq(keys,[prefix+':maintenance-index:v1',guardianPolicyKey(prefix)]);return [indexRaw,policyRaw??''];}
  if(script===claimGuardianBudgetLua()){
   eq(keys,[guardianPolicyKey(prefix),continuousFreeBudgetKey(workspace)]);if(policyRaw!==args[0])return [-30,0,'background',60];const next=JSON.parse(args[1]);assert.equal(next.attempts.at(-1).phase,'claimed');if(missingLedger||invalidLedger){policyRaw=JSON.stringify(next);return [-2,0,'background',60];}next.attempts.at(-1).phase='debited';policyRaw=JSON.stringify(next);ledger.buckets[0].used.background+=1104;ledger.buckets[0].bytes+=64004096;fullDebits++;if(loseAtomicAck)throw Error('SYNTHETIC_ATOMIC_ACK_LOST');return [1,ledger.buckets[0].used.background,'background',60];
  }
  if(script===CAS_GUARDIAN_POLICY_LUA){eq(keys,[guardianPolicyKey(prefix)]);if(args[0]==='missing'?policyRaw!==null:policyRaw!==args[1])return 0;policyRaw=args[2];outcomeWrites++;if(loseOutcomeAck)throw Error('SYNTHETIC_OUTCOME_ACK_LOST');return 1;}
  assert.fail('Unexpected native command');
 }};
 const native=createMarketStore(redis,prefix),store={...native,transact:async fn=>structuredClone(fn(state))};
 const overrides={now:()=>clock,marketStore:()=>store,marketIndex:()=>native.finiteGuardianMaintenanceIndex(),reserveBackground:async(commands,bytes)=>{eq([commands,bytes],[12,32768]);events.push('idle-debit');},workspaceStore:()=>({maintenanceIndex:async()=>({initialized:true,nextExpiryAt:null,observedAt:clock,needsBootstrap:false}),bootstrapMaintenanceIndex:async()=>assert.fail('No synthetic bootstrap'),retentionOwnerIds:async()=>[],pruneExpiredContent:async()=>assert.fail('No owners')}),snapshot:async()=>({incidents:[]}),cleanup:async()=>{cleanupCalls++;if(failCleanup)throw Error('SYNTHETIC_CLEANUP_DOWN');return {removed:[],incidents:[],cleanupReleased:0,cleanupPending:0,moreExpired:false,retentionDays:7};},dispatch:async()=>assert.fail('No payment dispatch'),reconcile:async()=>assert.fail('No payment reconcile')};
 return {native,ledger,originalHold,state,events,overrides,run:()=>createMarketGuardianRunner(overrides)(),get policy(){return policyRaw&&JSON.parse(policyRaw);},get fullDebits(){return fullDebits;},get cleanupCalls(){return cleanupCalls;},get outcomeWrites(){return outcomeWrites;},set clock(v){clock=v;},idle(){indexRaw=JSON.stringify({version:1,nextExpiryAt:null,reconciliationDue:false,deliveryDue:false});}};
}
try{
 const f=fixture(),first=await f.run();eq(first.needsOperator,true);eq(first.finiteMaintenance.attempts,1);eq(f.fullDebits,1);eq(f.cleanupCalls,1);eq(f.policy.attempts[0].phase,'failed');eq(JSON.stringify(f.ledger.held),f.originalHold);
 f.clock=start+3600000;await assert.rejects(f.run(),e=>e.code==='GUARDIAN_MAINTENANCE_BACKOFF'&&e.status===503&&e.guardian.cleanupDue===true);checks++;eq(f.fullDebits,1);
 f.clock=start+day;await f.run();eq(f.fullDebits,2);eq(f.cleanupCalls,2);eq(f.policy.attempts.length,2);
 for(let h=25;h<768;h++){f.clock=start+h*3600000;await assert.rejects(f.run(),e=>e.code==='GUARDIAN_MAINTENANCE_CAPACITY'&&e.guardian.physicalDeletionMayRemainPending&&e.guardian.recoveryUsesExistingHolds);}
 eq(f.fullDebits,2);eq(f.cleanupCalls,2);eq(JSON.stringify(f.ledger.held),f.originalHold);eq(f.ledger.buckets[0].used.recovery,30);eq(f.ledger.buckets[0].used.background,2248);
 const missing=fixture({policy:null});await assert.rejects(missing.run(),e=>e.code==='GUARDIAN_POLICY_UNINITIALIZED'&&e.guardian.cleanupDue);checks++;eq(missing.fullDebits,0);eq(missing.cleanupCalls,0);
 const lost=fixture({loseAtomicAck:true});await assert.rejects(lost.run());checks++;eq(lost.fullDebits,1);eq(lost.cleanupCalls,0);lost.clock=start+day;await assert.rejects(lost.run(),e=>e.code==='GUARDIAN_PRIOR_ATTEMPT_UNCERTAIN');checks++;eq(lost.fullDebits,1);
 const concurrent=fixture();const race=await Promise.allSettled([concurrent.run(),concurrent.run()]);eq(race.filter(r=>r.status==='fulfilled').length,1);eq(concurrent.fullDebits,1);eq(concurrent.cleanupCalls,1);
 const idle=fixture();idle.idle();eq((await idle.run()).idle,true);eq(idle.fullDebits,0);eq(idle.events,['idle-debit','read-policy-index']);
 // Actual transport middleware, not the forecast: reject a next response
 // allocation before Redis and include the atomic6-command primitive.
 let middleware,sends=0;meteredFiniteGuardianRedis({use:fn=>{middleware=fn;}});
 await assert.rejects(withGuardianWireScope(()=>middleware({body:['GET','UNKNOWN_MAX'],path:[]},async()=>{sends++;return {result:'x'.repeat(5*1048576)};})));checks++;eq(sends,1);
 sends=0;await assert.rejects(withGuardianWireScope(async()=>{for(let n=0;n<20;n++)await middleware({body:['GET','UNKNOWN_MAX']},async()=>{sends++;return {result:'x'.repeat(4*1048576)};});}));checks++;assert(sends<20);checks++;
 await withGuardianWireScope(async()=>{await middleware({body:['EVAL',claimGuardianBudgetLua(),2,'policy','budget','{}','{}','{}']},async()=>({result:[1,1104,'background',60]}));eq(guardianWireObservation().commandsUpper,6);});
 const nativeIndex=JSON.stringify({version:1,nextExpiryAt:null,reconciliationDue:false,deliveryDue:false}),nativePolicy=JSON.stringify(initialGuardianPolicy(start));
 await withGuardianIdleWireScope(async()=>{
  await middleware({body:['EVAL',guardianExistingIdleBudgetLua(),1,'budget','{}','{}']},async()=>({result:[1,16,'background',60]}));
  await middleware({body:['EVAL',READ_GUARDIAN_INDEX_POLICY_LUA,2,'index','policy']},async()=>({result:[nativeIndex,nativePolicy]}));
  await middleware({body:['EVAL',READ_WORKSPACE_MAINTENANCE_LUA,1,'workspace:maintenance']},async()=>({result:['',String(start/1000),'0']}));
  eq(guardianWireObservation().commandsUpper,10);assert(guardianWireObservation().combinedUpperBytes<=36864);checks++;
 });
 // Ordinary HTTP paths keep the single GET projection, even when V3 is on.
 let gets=0,evals=0;const ordinary=createMarketStore({get:async key=>{gets++;eq(key,prefix+':maintenance-index:v1');return nativeIndex;},eval:async()=>{evals++;assert.fail('No guardian policy EVAL for ordinary callers');}},prefix);eq((await ordinary.maintenanceIndex()).initialized,true);eq(gets,1);eq(evals,0);
 // Strict whitelist rejects malformed command, key and argument types before
 // the transport; inactive scopes retain all legacy transport behavior.
 for(const body of [['GET',READ_GUARDIAN_INDEX_POLICY_LUA,2,'index','policy'],['EVAL',READ_GUARDIAN_INDEX_POLICY_LUA,2,'index',123],['EVAL',CAS_GUARDIAN_POLICY_LUA,1,'policy','present',{},'{}']]){sends=0;await assert.rejects(withGuardianIdleWireScope(()=>middleware({body},async()=>{sends++;return {result:1};})));checks++;eq(sends,0);}
 // Responses in flight consume their allocations before the next send. The
 // seventeenth unknown snapshot is rejected while earlier replies are blocked.
 await withGuardianWireScope(async()=>{let release;const held=new Promise(resolve=>release=resolve),tasks=[];sends=0;for(let n=0;n<17;n++)tasks.push(middleware({body:['GET','UNKNOWN_MAX']},async()=>{sends++;await held;return {result:null};}));await Promise.resolve();assert(sends<17);checks++;release();const results=await Promise.allSettled(tasks);assert(results.some(r=>r.status==='rejected'));checks++;eq(guardianWireObservation().requests,sends);});
 for(const value of [null,42,'invalid',[],true]){assert.throws(()=>parseGuardianPolicy(JSON.stringify({v:1,last:start,attempts:[value]})),error=>error.code==='GUARDIAN_POLICY_UNAVAILABLE'&&error.status===503);checks++;}
 const future={v:1,last:start+1,attempts:[]};assert.throws(()=>guardianPolicyDecision(future,start),error=>error.code==='GUARDIAN_POLICY_CLOCK');checks++;
 const staleUncertain={v:1,last:start,attempts:[{id:id(111),at:start,phase:'debited'}]};assert.throws(()=>guardianPolicyDecision(staleUncertain,start+33*day),error=>error.code==='GUARDIAN_PRIOR_ATTEMPT_UNCERTAIN');checks++;
 for(const problem of ['missingLedger','invalidLedger']){const stopped=fixture({[problem]:true}),before=JSON.stringify(stopped.ledger);await assert.rejects(stopped.run(),error=>error.code==='GUARDIAN_INITIAL_CREDIT_UNCONFIRMED'&&error.guardian.maintenanceCreditStatus==='initial-credit-unconfirmed');checks++;eq(stopped.policy.attempts[0].phase,'claimed');eq(stopped.fullDebits,0);eq(stopped.cleanupCalls,0);eq(JSON.stringify(stopped.ledger),before);for(const d of [1,32,100]){stopped.clock=start+d*day;await assert.rejects(stopped.run(),error=>error.code==='GUARDIAN_PRIOR_ATTEMPT_UNCERTAIN');checks++;}eq(stopped.events.filter(e=>e==='atomic-debit').length,1);eq(stopped.policy.attempts.length,1);eq(JSON.stringify(stopped.ledger.held),stopped.originalHold);}
 // Direct cron callbacks do not inherit HTTP payment credits. They retain the
 // complete sweep guard; a new unknown command is blocked before Redis.
 for(const method of ['reconcile','dispatch']){
  const guarded=fixture();let callbackCount=0,effects=0;const call=async()=>{callbackCount++;assert(guardianWireObservation());checks++;return middleware({body:['EVAL','return 123',0]},async()=>{effects++;return {result:123};});};
  if(method==='reconcile'){guarded.overrides.snapshot=async()=>({incidents:[{operationId:id(112),code:'PAYMENT_RECONCILIATION_REQUIRED',canReconcile:true}]});guarded.overrides.reconcile=call;}
  else{guarded.state.orders.push({operationId:id(113),phase:'paid',textWake:{status:'pending'}});guarded.overrides.dispatch=call;}
  const result=await guarded.run();eq(callbackCount,1);eq(effects,0);eq(result.needsOperator,true);eq(guarded.fullDebits,1);
 }
 const source=await readFile('lib/guardian-finite-budget.ts','utf8');assert(source.includes("if not budgetRaw then redis.call('SET',KEYS[1],ARGV[2]);return"));checks++;assert(source.includes('pcall(budget_prepare,budgetRaw,config,request)'));checks++;
 const evidence={status:'PASS_LOCAL_REAL_GUARDIAN_FINITE_POLICY_AND_WIRE_RUNTIME',checks,sourcePins:Object.fromEntries(await Promise.all(['lib/guardian-finite-budget.ts','lib/market-guardian.ts','lib/marketplace-store.ts','lib/acceptance-meter.ts','lib/example-budget-wire.ts'].map(async path=>[path,sha(await readFile(path))]))),nativePolicyStoredSeparately:true,simulatedHourlyDueTicks:768,maximumGlobalFullDebits:2,maximumGlobalFullCommands:2208,maximumGlobalFullBytes:128008192,oldUsageAndFinancialHoldsPreserved:true,uncertainAcknowledgementsNeverRetried:true,actualFullLoopLuaExecuted:false,nativeProtocolFixturesOnly:true,actualExternalRequests:0,actualPrivateProfileReads:0,productionPublished:false,limitsChanged:false,cronDisabled:false,payments:0,limitation:'No real Redis or hosted acceptance; native source adapters and middleware run with isolated in-memory protocol responses. Expired content denial is unchanged; physical cleanup can remain pending after failures/capacity exhaustion.'};
 const target=process.argv[2];if(target!==undefined){if(!/^docs\/evidence\/guardian-finite-runtime-[a-z0-9-]+\.json$/.test(target)||process.argv.length!==3)throw Error('PUBLIC_EXCLUSIVE_EVIDENCE_PATH_REQUIRED');await writeFile(target,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});}console.log(JSON.stringify({status:evidence.status,checks,maximumGlobalFullDebits:2,actualExternalRequests:0}));
}finally{for(const name of Object.keys(process.env))if(!(name in prior))delete process.env[name];Object.assign(process.env,prior);}
