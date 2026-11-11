import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {createMarketGuardianRunner,createMarketGuardianTickHandler,MARKET_GUARDIAN_LIMITS} from '../lib/market-guardian.ts';
import {guardianBudgetObservation,guardianRedisRequest} from '../lib/guardian-budget.ts';
import {PER_ORDER_RETENTION_SCAN_BUDGET,PER_ORDER_RETENTION_ARCHIVE_BUDGET} from '../lib/per-order-retention.ts';

const owner='ow_'+'b'.repeat(32);
const env={
 NODE_ENV:'production',VERCEL_ENV:'production',BAZAAR_MARKET_ORDER_STORAGE:'per-order-v1',
 BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_FREE_DEMO_MODE:'continuous',BAZAAR_FREE_PLAN_TRANSPORT_PROFILE:'compact-registry-v2',
 BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES:'9900000000',
 BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON:'{"public":115000,"authenticated":90000,"recovery":105000,"background":50000}',
 BAZAAR_MARKET_BUYER_ALLOWLIST_JSON:JSON.stringify([owner]),
 BAZAAR_WORKSPACE_PREFIX:'bazaar-workspace:pilot-'+'a'.repeat(32),BAZAAR_MARKET_PREFIX:'bazaar-market:pilot-'+'a'.repeat(32),
 BAZAAR_TEXT_SELLER_MODE:'on-demand',BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID:'31c97193-be74-4b9d-b0a3-f3890b0a41e8',
 BAZAAR_TEXT_SELLER_SERVICE_ID:'guionista-bazaar-production-text-v1',BAZAAR_TEXT_SELLER_CARD_HASH:'d'.repeat(64),BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT:'f'.repeat(64),
};

function fixture({denied,late,oversized,failLegacyOnce=false}={}){
 const calls=[];
 let now=Date.UTC(2026,10,11);
 const time=()=>now;
 const run=createMarketGuardianRunner({
  now:time,
  async reserveBackground(commands,wireBytes){
   const phase=wireBytes===PER_ORDER_RETENTION_SCAN_BUDGET.wireBytes?'scan':wireBytes===PER_ORDER_RETENTION_ARCHIVE_BUDGET.wireBytes?'archive':'legacy';
   calls.push(`reserve:${phase}`);
   if(phase!=='legacy')assert.equal(guardianBudgetObservation(),undefined,'admission is independent of the guarded work');
   if(phase===denied)throw Error('fixture admission denied');
   if(phase===late)now+=MARKET_GUARDIAN_LIMITS.durationMs;
   return {commands,wireBytes};
  },
  async marketIndex(){
   calls.push('legacy');
   if(failLegacyOnce){failLegacyOnce=false;throw Error('fixture legacy read failed');}
   if(late==='index')now+=MARKET_GUARDIAN_LIMITS.durationMs;
   return {initialized:true,index:{version:1,nextExpiryAt:null,reconciliationDue:false,deliveryDue:false}};
  },
  workspaceStore:()=>({
   async maintenanceIndex(){return {observedAt:time(),initialized:true,nextExpiryAt:null};},
   async bootstrapMaintenanceIndex(){assert.fail('legacy bootstrap is not due');},
   async retentionOwnerIds(){calls.push('owners');return [owner];},
   async pruneExpiredContent(){assert.fail('legacy owner cleanup is not due');},
  }),
  marketStore(){assert.fail('legacy market pass must remain idle');},
  async reconcile(){assert.fail('retention does not reconcile payments');},
  async dispatch(){assert.fail('retention does not dispatch delivery');},
  async perOrderRetention({owners,archive,available}){
   calls.push('scan');
   assert.equal(guardianBudgetObservation().wireLimit,PER_ORDER_RETENTION_SCAN_BUDGET.wireBytes);
   assert.equal(guardianBudgetObservation().commandLimit,PER_ORDER_RETENTION_SCAN_BUDGET.commands);
   assert(available());
   if(oversized)await guardianRedisRequest({body:['get',env.BAZAAR_MARKET_PREFIX+':state']},async()=>assert.fail('oversized Redis request dispatched'));
   assert.deepEqual(await owners(),[owner]);
   const applied=await archive(async()=>{
    calls.push('archive');
    assert.equal(guardianBudgetObservation().wireLimit,PER_ORDER_RETENTION_ARCHIVE_BUDGET.wireBytes);
    assert.equal(guardianBudgetObservation().commandLimit,PER_ORDER_RETENTION_ARCHIVE_BUDGET.commands);
    return true;
   });
   assert.equal(guardianBudgetObservation().wireLimit,PER_ORDER_RETENTION_SCAN_BUDGET.wireBytes,'discovery scope is restored');
   return {scanned:1,archived:applied?1:0,more:!applied,privateRecord:owner};
  },
 });
 return {run,calls};
}

test('guardian admits bounded per-order retention only when the valid profile is active',async t=>{
 const original={...process.env},fetchBefore=globalThis.fetch;
 try{
  Object.assign(process.env,env);delete process.env.BAZAAR_FREE_DEMO_ADMISSION_UNTIL;
  globalThis.fetch=async()=>assert.fail('external traffic forbidden');
  await t.test('disabled profile preserves the legacy response and debit',async()=>{
   process.env.BAZAAR_MARKET_ORDER_STORAGE='legacy';
   const {run,calls}=fixture(),result=await run();
   assert.equal(result.idle,true);
   assert(!('perOrderRetention' in result));
   assert.deepEqual(calls,['reserve:legacy','legacy']);
   process.env.BAZAAR_MARKET_ORDER_STORAGE=env.BAZAAR_MARKET_ORDER_STORAGE;
  });
  await t.test('idle legacy work still permits independent scan and archive debits',async()=>{
   const {run,calls}=fixture(),result=await run();
   assert.equal(result.idle,false);
   assert.deepEqual(result.perOrderRetention,{scanned:1,archived:1,more:false});
   assert(!JSON.stringify(result).includes(owner));
   assert.deepEqual(calls,['reserve:legacy','legacy','reserve:scan','scan','owners','reserve:archive','archive']);
  });
  await t.test('depleted discovery or archive allowance stops before its Redis work',async()=>{
   for(const denied of ['scan','archive']){
    const {run,calls}=fixture({denied}),result=await run();
    assert.deepEqual(result.perOrderRetention,{code:'PER_ORDER_RETENTION_BUDGET'});
    assert.equal(result.needsOperator,true);
    assert(!calls.includes(denied));
   }
  });
  await t.test('expired deadline blocks discovery and an archive after its debit',async()=>{
   const before=fixture({late:'index'}),beforeResult=await before.run();
   assert.deepEqual(beforeResult.perOrderRetention,{code:'PER_ORDER_RETENTION_TIME_BOUND'});
   assert.equal(beforeResult.timeBound,true);
   assert.deepEqual(before.calls,['reserve:legacy','legacy']);
   const during=fixture({late:'archive'}),duringResult=await during.run();
   assert.deepEqual(duringResult.perOrderRetention,{scanned:1,archived:0,more:true});
   assert.equal(duringResult.timeBound,true);
   assert(!during.calls.includes('archive'));
  });
  await t.test('oversized discovery request is rejected before Redis dispatch',async()=>{
   const {run,calls}=fixture({oversized:true}),result=await run();
   assert.deepEqual(result.perOrderRetention,{code:'PER_ORDER_RETENTION_UNCONFIRMED'});
   assert.equal(result.needsOperator,true);
   assert.deepEqual(calls,['reserve:legacy','legacy','reserve:scan','scan']);
  });
  await t.test('one legacy failure does not suppress the next scheduled pass',async()=>{
   const {run,calls}=fixture({failLegacyOnce:true});
   await assert.rejects(run(),/fixture legacy read failed/);
   assert.deepEqual(calls,['reserve:legacy','legacy']);
   const next=await run();
   assert.deepEqual(next.perOrderRetention,{scanned:1,archived:1,more:false});
   assert.deepEqual(calls.slice(2),['reserve:legacy','legacy','reserve:scan','scan','owners','reserve:archive','archive']);
  });
  await t.test('the real cron guard authorizes maintenance before any debit or Redis work',async()=>{
   const secret='c'.repeat(43);
   process.env.CRON_SECRET=secret;
   process.env.BAZAAR_MARKET_OPERATOR_HASH=createHash('sha256').update(secret).digest('hex');
   const {run,calls}=fixture(),tick=createMarketGuardianTickHandler(run),url='https://bazaar.invalid/api/market/guardian/tick';
   assert.equal((await tick(new Request(url))).status,401);
   assert.deepEqual(calls,[]);
   const response=await tick(new Request(url,{headers:{authorization:'Bearer '+secret}}));
   assert.equal(response.status,200);
   assert.deepEqual((await response.json()).perOrderRetention,{scanned:1,archived:1,more:false});
   assert.deepEqual(calls,['reserve:legacy','legacy','reserve:scan','scan','owners','reserve:archive','archive']);
  });
 }finally{
  globalThis.fetch=fetchBefore;
  for(const name of Object.keys(process.env))if(!(name in original))delete process.env[name];
  Object.assign(process.env,original);
 }
});
