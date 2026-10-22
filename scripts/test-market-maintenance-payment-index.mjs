// Actual native stores/CAS builders with isolated in-memory protocol doubles.
// No network, real wallet, DPAPI, payment verification or financial submission.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSellerCard} from '../examples/seller-service-card.mjs';
import {createMarketStore,recomputeMarketMaintenanceIndex,validateMarketState} from '../lib/marketplace-store.ts';
import {createMarketX402Store,validateMarketX402State} from '../lib/marketplace-x402-store.ts';
import {createMarketX402Challenge,marketX402OrderBinding} from '../lib/marketplace-x402.ts';
import {initializeContinuousStorageLedger} from '../lib/continuous-free-storage.ts';
import {continuousFreeBudgetConfiguration,continuousFreeBudgetKey} from '../lib/continuous-free-budget.ts';
import {marketRecoveryRecord} from '../lib/market-retention-schema.ts';
import {createMarketGuardianRunner} from '../lib/market-guardian.ts';
import {canonical,sha,orderMemo} from '../lib/marketplace-identity.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {continuousCapacityRedis} from './fixtures/continuous-capacity-redis.mjs';
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},check=v=>{assert.ok(v);checks++;};
const environment={...process.env},realNow=Date.now,realFetch=globalThis.fetch;
const now=Date.parse('2026-10-12T20:00:00.000Z'),stamp=new Date(now).toISOString(),tx='d'.repeat(64);
const operationId='00000000-0000-4000-8000-000000000031',buyer='ow_'+'b'.repeat(32),seller='ow_'+'a'.repeat(32);
const payer='GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU',destination='GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C';
const {card,cardHash}=createSellerCard({id:'synthetic-maintenance-text',name:'Synthetic maintenance',description:'Offline index fixture.',providerName:'Synthetic',providerOrigin:'https://provider.example',destination,amount:'0.01'});
const input={prompt:'SYNTHETIC PRIVATE INPUT'};
const original={operationId,buyerOwnerId:buyer,sellerOwnerId:seller,serviceId:card.id,cardHash,card,input,payer,destination,amount:'0.01',settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',inputHash:sha(canonical(input)),memoHash:orderMemo(buyer,operationId,cardHash,input),createdAt:stamp,updatedAt:stamp,phase:'payment-uncertain',settlementAttemptId:'00000000-0000-4000-8000-000000000032',sellerReservation:{day:stamp.slice(0,10),expiresAt:stamp,committed:true}};
const originalRecord={operationId,buyerOwnerId:buyer,orderBinding:marketX402OrderBinding(original),challenge:createMarketX402Challenge(original,'https://bazaar.example'),phase:'uncertain',createdAt:stamp,updatedAt:stamp,attemptId:original.settlementAttemptId,payload:{x402Version:2,payload:{transaction:'OFFLINE_OPAQUE_NOT_SIGNED'}},payloadHash:sha('synthetic-payload'),authorizationFingerprint:sha('synthetic-authorization')};
const market=()=>({version:1,services:[],orders:[structuredClone(original)]}),settlements=()=>({version:1,records:[structuredClone(originalRecord)]});
let external=0;globalThis.fetch=async()=>{external++;throw Error('OFFLINE_ONLY');};Date.now=()=>now;
try {
 for(const k of Object.keys(process.env))if(/^(BAZAAR|VERCEL|UPSTASH|KV_REST)/.test(k))delete process.env[k];
 process.env.BAZAAR_FREE_DEMO_MODE='continuous';
 const without=recomputeMarketMaintenanceIndex(market());equal([without.reconciliationDue,without.operatorAttention],[true,true]);
 const unknown=recomputeMarketMaintenanceIndex(market(),settlements());equal([unknown.reconciliationDue,unknown.operatorAttention],[false,true]);
 for(const location of ['order','record','outcome']) {
  const m=market(),s=settlements();if(location==='order')m.orders[0].transactionHash=tx;
  else if(location==='record')s.records[0].transactionHash=tx;
  else s.records[0].outcome={success:true,network:'stellar:testnet',transaction:tx,payer};
  const index=recomputeMarketMaintenanceIndex(m,s);equal([index.reconciliationDue,index.operatorAttention],[true,false]);
 }
 for(const phase of ['verifying','settling','uncertain','settled','confirmed']) {
  const m=market(),s=settlements();m.orders[0].phase='awaiting-payment';s.records[0].phase=phase;s.records[0].transactionHash=tx;
  equal(recomputeMarketMaintenanceIndex(m,s).reconciliationDue,true);
 }
 const missing={version:1,records:[]};equal(recomputeMarketMaintenanceIndex(market(),missing).reconciliationDue,false);
 const archived=marketRecoveryRecord(original,originalRecord,now);
 for(const hash of [false,true]) {
  const a={version:1,services:[],orders:[],archived:[{...archived,...(hash?{transactionHash:tx}:{})}]};
  const index=recomputeMarketMaintenanceIndex(a,missing);equal([index.reconciliationDue,index.operatorAttention],[hash,!hash]);
 }
 const noAuth={...archived,transactionHash:tx};delete noAuth.authorizationFingerprint;
 equal(recomputeMarketMaintenanceIndex({version:1,services:[],orders:[],archived:[noAuth]},missing).reconciliationDue,false);
 const paid=market();Object.assign(paid.orders[0],{phase:'paid',transactionHash:tx,paymentVerifiedAt:stamp,executionMode:'on-demand',textWake:{version:1,wakeId:randomUUID(),status:'pending',createdAt:stamp,updatedAt:stamp,attempts:0}});
 equal(recomputeMarketMaintenanceIndex(paid,missing).deliveryDue,true);

 async function fixture({legacy=false}={}) {
  const prefix='bazaar-market:pilot-'+randomUUID().replaceAll('-',''),workspace=prefix.replace('bazaar-market','bazaar-workspace');process.env.BAZAAR_WORKSPACE_PREFIX=workspace;
  const m=market(),s=settlements();if(legacy)recomputeMarketMaintenanceIndex(m);validateMarketState(m);validateMarketX402State(s);
  const key=prefix+':state',sk=prefix+':x402-settlements:state',indexKey=prefix+':maintenance-index:v1',data=new Map([[key,JSON.stringify({version:1,revision:randomUUID(),state:m})],[sk,JSON.stringify({version:1,revision:randomUUID(),state:s})]]);
  if(legacy)data.set(indexKey,JSON.stringify(m.maintenance.index));
  const config=continuousFreeBudgetConfiguration(),bk=continuousFreeBudgetKey(workspace);
  data.set(bk,JSON.stringify({version:2,configuration:config.configurationId,last:now,buckets:[],held:[{operationId,principalHash:sha(buyer),recoveryCommands:12000,backgroundCommands:4000,transferBytes:2_000_000_000}]}));
  let lose=false,conflict=false;const calls=[],base=continuousCapacityRedis({data,afterWrite:()=>{if(lose){lose=false;throw Error('SYNTHETIC_INDEX_ACK_LOST');}}});
  const redis={async get(k){calls.push(['GET',k]);return base.get(k);},async eval(script,keys,args){calls.push(['EVAL',keys.length]);if(conflict){conflict=false;return 0;}return base.eval(script,keys,args);}};
  await initializeContinuousStorageLedger(redis,workspace,[...data].map(([key,raw])=>({key,expectedRaw:raw,nextRaw:raw})));
  const store=createMarketStore(redis,prefix),payment=createMarketX402Store(redis,prefix);
  await store.bootstrapMaintenanceIndex();calls.length=0;
  return {data,calls,key,sk,indexKey,bk,prefix,store,payment,lose(){lose=true;},conflict(){conflict=true;}};
 }
 const f=await fixture(),initialHold=f.data.get(f.bk),initialOrder=JSON.parse(f.data.get(f.key)).state.orders[0],initialRecord=JSON.parse(f.data.get(f.sk)).state.records[0];
 equal(JSON.parse(f.data.get(f.indexKey)),JSON.parse(f.data.get(f.key)).state.maintenance.index);
 equal([JSON.parse(f.data.get(f.indexKey)).reconciliationDue,JSON.parse(f.data.get(f.indexKey)).operatorAttention],[false,true]);
 f.lose();await assert.rejects(f.payment.transact(s=>{s.records[0].transactionHash=tx;}),/SYNTHETIC_INDEX_ACK_LOST/);checks++;
 equal(f.calls.filter(c=>c[0]==='GET').length,4);equal(f.calls.filter(c=>c[0]==='EVAL').length,1);
 equal(f.data.get(f.bk),initialHold);
 equal(JSON.parse(f.data.get(f.key)).state.orders[0],initialOrder);
 equal({...JSON.parse(f.data.get(f.sk)).state.records[0],transactionHash:undefined},{...initialRecord,transactionHash:undefined});
 const reopened=createMarketStore({get:async k=>f.data.get(k)??null,eval:async()=>assert.fail('Index read cannot write')},f.prefix);
 const index=await reopened.maintenanceIndex();equal([index.initialized,index.index.reconciliationDue,index.index.operatorAttention],[true,true,false]);
 equal(index.index,JSON.parse(f.data.get(f.key)).state.maintenance.index);
 f.calls.length=0;const before=JSON.stringify([...f.data]);f.conflict();
 await assert.rejects(f.store.transact(s=>{s.orders[0].transactionHash=tx;}),{code:'CAPACITY_WRITE_UNCONFIRMED'});checks++;
 equal(JSON.stringify([...f.data]),before);equal(f.calls.filter(c=>c[0]==='EVAL').length,1);
 f.calls.length=0;f.lose();await assert.rejects(f.store.transact(s=>{s.orders[0].transactionHash=tx;}),/SYNTHETIC_INDEX_ACK_LOST/);checks++;
 equal(JSON.parse(f.data.get(f.key)).state.orders[0].transactionHash,tx);equal(f.data.get(f.bk),initialHold);
 equal(JSON.parse(f.data.get(f.key)).state.orders[0].sellerReservation,original.sellerReservation);
 equal(JSON.parse(f.data.get(f.indexKey)).reconciliationDue,true);

 function guardedRunner(f,{onSnapshot=async()=>{}}={}) {
  let fullScans=0,clock=now,reconciles=0,dispatches=0;
  const overrides={now:()=>clock,marketStore:()=>f.store,marketIndex:()=>f.store.maintenanceIndex(),workspaceStore:()=>({maintenanceIndex:async()=>({initialized:true,nextExpiryAt:null,observedAt:now,needsBootstrap:false}),bootstrapMaintenanceIndex:async()=>assert.fail('No workspace bootstrap')}),reserveBackground:async()=>{},snapshot:async()=>{fullScans++;await onSnapshot();return {incidents:[{operationId,code:'PAYMENT_IDENTIFIER_REQUIRED',canReconcile:false}]};},reconcile:async()=>{reconciles++;assert.fail('Unidentified payment cannot be reconciled');},dispatch:async()=>{dispatches++;assert.fail('Unpaid payment cannot wake seller');},cleanup:async()=>assert.fail('No visible expiry yet')};
  return {run:createMarketGuardianRunner(overrides),get fullScans(){return fullScans;},get actions(){return [reconciles,dispatches];},set clock(value){clock=value;}};
 }
 // Legacy index is refreshed once by the real guardian/native combined CAS.
 const legacy=await fixture({legacy:true}),legacyHold=legacy.data.get(legacy.bk),legacyRunner=guardedRunner(legacy);
 equal(JSON.parse(legacy.data.get(legacy.indexKey)).reconciliationDue,true);
 const firstPass=await legacyRunner.run();equal([firstPass.idle,firstPass.needsOperator],[false,true]);
 equal(legacyRunner.fullScans,1);equal(legacyRunner.actions,[0,0]);
 equal(JSON.parse(legacy.data.get(legacy.key)).state.maintenance.lastRunAt,stamp);
 equal([JSON.parse(legacy.data.get(legacy.indexKey)).reconciliationDue,JSON.parse(legacy.data.get(legacy.indexKey)).operatorAttention],[false,true]);
 equal(legacy.calls.filter(c=>c[0]==='EVAL').length,1);equal(legacy.data.get(legacy.bk),legacyHold);
 equal((await legacyRunner.run()).idle,true);equal(legacyRunner.fullScans,1);

 // A hash saved after the stale snapshot remains actionable in the final CAS.
 const arrival=await fixture({legacy:true}),arrivalHold=arrival.data.get(arrival.bk);
 const racedRunner=guardedRunner(arrival,{onSnapshot:()=>arrival.payment.transact(s=>{s.records[0].transactionHash=tx;})});
 await racedRunner.run();equal(racedRunner.actions,[0,0]);equal(JSON.parse(arrival.data.get(arrival.indexKey)).reconciliationDue,true);
 equal(JSON.parse(arrival.data.get(arrival.sk)).state.records[0].transactionHash,tx);equal(arrival.data.get(arrival.bk),arrivalHold);

 // Deadline exhaustion cannot acknowledge/refresh that operator incident.
 const timed=await fixture({legacy:true}),timedBefore=JSON.stringify([...timed.data]);let timedRunner;
 timedRunner=guardedRunner(timed,{onSnapshot:async()=>{timedRunner.clock=now+45000;}});
 const timeout=await timedRunner.run();equal(timeout.timeBound,true);
 equal(JSON.stringify([...timed.data]),timedBefore);equal(timed.calls.filter(c=>c[0]==='EVAL').length,0);
 equal(JSON.parse(timed.data.get(timed.key)).state.maintenance.lastRunAt,undefined);

 // Unknown no-hash incident produces operator attention, not hourly full scans.
 // 31 complete days * 24 hourly ticks * (12 reserved commands +4 accounting).
 let ticks=0,reserved=0,snapshots=0,wakes=0,clock=now;
 const attentionIndex=recomputeMarketMaintenanceIndex({version:1,services:[],orders:[],archived:[archived]},missing);
 const idle=createMarketGuardianRunner({now:()=>clock,marketIndex:async()=>({initialized:true,index:attentionIndex}),workspaceStore:()=>({maintenanceIndex:async()=>({initialized:true,nextExpiryAt:null,observedAt:clock,needsBootstrap:false}),bootstrapMaintenanceIndex:async()=>assert.fail('Initialized index does not need bootstrap')}),reserveBackground:async(commands)=>{ticks++;reserved+=commands+4;},snapshot:async()=>{snapshots++;assert.fail('Unknown no-hash incident must not trigger full payment scan');},dispatch:async()=>{wakes++;assert.fail('No hash, no paid wake');},cleanup:async()=>assert.fail('No expiry in archived-only index')});
 let allIdle=true;for(let i=0;i<31*24;i++){const result=await idle();allIdle&&=result.idle===true&&result.needsOperator===true;clock+=3600000;}equal(allIdle,true);
 equal([ticks,reserved,snapshots,wakes],[744,11904,0,0]);check(reserved<12000);equal(external,0);
 console.log(JSON.stringify({status:'PASS_LOCAL_COMBINED_PAYMENT_MAINTENANCE_INDEX',checks,nativeStores:true,redis:'isolated protocol double',realRedisLua:false,lostAcknowledgementsNotRetried:true,combinedSnapshotGetCount:4,heldReservationsChanged:false,idle31DayTicks:ticks,idle31DayConservativeCommands:reserved,networkRequests:external,newPayments:0,signatures:0,cloudWrites:0}));
} finally {Date.now=realNow;globalThis.fetch=realFetch;for(const key of Object.keys(process.env))if(!(key in environment))delete process.env[key];Object.assign(process.env,environment);}
