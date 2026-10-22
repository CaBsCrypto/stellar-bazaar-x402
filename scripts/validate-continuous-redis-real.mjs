import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Redis} from '@upstash/redis';
import {StrKey} from '@stellar/stellar-sdk';
import {createMarketStore,validateMarketState} from '../lib/marketplace-store.ts';
import {createMarketX402Store,validateMarketX402State} from '../lib/marketplace-x402-store.ts';
import {MARKET_CAPACITY_CAS,capacityReservationKey,projectCapacity} from '../lib/marketplace-capacity.ts';
import {reportCapacityInState,reserveSellerCapacity,sellerCapacityDto,SELLER_LEASE_MS} from '../lib/market-seller-capacity.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {sha,canonical,orderMemo} from '../lib/marketplace-identity.ts';

// LOCAL, OPERATOR-REVIEWED TEST ONLY. --execute + stdin {url,token} required.
// No signer, private wallet key, facilitator, provider, real account or real order.
// Exactly three fresh synthetic keys; only GET, unchanged MARKET_CAPACITY_CAS,
// fixture-only EXPIREAT and exact DEL. No scan, shared prefix or automatic retry.
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const TARGET='https://smooth-dory-323957.upstash.io';
const EVIDENCE=join(ROOT,'docs','evidence','continuous-redis-real-2026-10-11.json');
const SOURCE_HASHES=Object.freeze({
 'lib/market-seller-capacity.ts':'820c6d841e62af65c849c166e4b5fa6fdffc33471fc64c1b5e0a5d4db05fe7b2',
 'lib/marketplace-capacity.ts':'2b779e294a74cf3c6944e23e9235289c031e37f2c99aa02b89aa56db0839c9cd',
 'lib/marketplace-store.ts':'eaf0cad697523d72f96eb17a2cd58a6a4973049e2b65fd79f71f3edcaefb29ee',
 'lib/marketplace-x402-store.ts':'12506ad104a435afc02239a69eff01cd542814186d7ed4c2bb07a8fa1c682d84'
});
const MAX_REST=150,NORMAL_LIMIT=140,MAX_BYTES=65536;
const codeSet=new Set(['EXECUTION_FLAG_REQUIRED','LOCAL_RUNTIME_REQUIRED','INPUT_INVALID','INPUT_TIMEOUT','SOURCE_MISMATCH','EVIDENCE_EXISTS','EVIDENCE_PATH_INVALID','FIXTURE_TOO_LARGE','KEY_COLLISION','REST_BOUND','DEADLINE','TARGET_REJECTED','REDIS_REQUEST_FAILED','TTL_UNCONFIRMED','CAS_RESULT_INVALID','RACE_TIMEOUT','ASSERTION_FAILED','SYNTHETIC_ACK_LOST','CAPACITY_WRITE_UNCONFIRMED','CLEANUP_UNCONFIRMED','EVIDENCE_WRITE_FAILED']);
class LocalFailure extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new LocalFailure(code);};
const safeCode=error=>codeSet.has(error?.code)?error.code:error?.name==='AssertionError'?'ASSERTION_FAILED':'REDIS_REQUEST_FAILED';
const bytes=value=>Buffer.byteLength(value??'','utf8');
const envelope=state=>JSON.stringify({version:1,revision:randomUUID(),state});
const capacityFailure=error=>error?.status===503&&['SELLER_UNAVAILABLE','SELLER_CAPACITY_EXHAUSTED','SELLER_RESERVATION_EXPIRED'].includes(error?.code);
async function precheck(){
 if(process.argv.slice(2).join(',')!=='--execute')fail('EXECUTION_FLAG_REQUIRED');
 if(process.env.VERCEL||process.env.VERCEL_ENV||process.env.NODE_ENV==='production'||process.env.BAZAAR_OPERATIONAL_METER==='true'||process.env.BAZAAR_ACCEPTANCE_METER==='true')fail('LOCAL_RUNTIME_REQUIRED');
 for(const[name,digest]of Object.entries(SOURCE_HASHES))if(sha(await readFile(join(ROOT,name)))!==digest)fail('SOURCE_MISMATCH');
 const parent=dirname(EVIDENCE),stat=await lstat(parent);if(!stat.isDirectory()||stat.isSymbolicLink()||resolve(await realpath(parent))!==resolve(parent))fail('EVIDENCE_PATH_INVALID');
 try{await lstat(EVIDENCE);fail('EVIDENCE_EXISTS');}catch(error){if(error?.code!=='ENOENT')throw error;}
}
async function readProfile(){
 const chunks=[];let length=0;const timer=setTimeout(()=>process.stdin.destroy(new LocalFailure('INPUT_TIMEOUT')),10000);
 try{for await(const chunk of process.stdin){length+=chunk.length;if(length>16384)fail('INPUT_INVALID');chunks.push(chunk);}
  let profile;try{profile=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INPUT_INVALID');}
  if(!profile||Array.isArray(profile)||Object.keys(profile).sort().join(',')!=='token,url'||profile.url!==TARGET||typeof profile.token!=='string'||! /^[\x21-\x7e]{20,4096}$/.test(profile.token))fail('INPUT_INVALID');return profile;
 }finally{clearTimeout(timer);}
}
function fixture(started){
 const seller={role:'agent',ownerId:'ow_'+'a'.repeat(32),workspaceId:randomUUID(),agentId:'agent_'+'a'.repeat(32),generation:1};
 const payer=StrKey.encodeEd25519PublicKey(Buffer.alloc(32,1)),destination=StrKey.encodeEd25519PublicKey(Buffer.alloc(32,2));
 const time=new Date(started).toISOString(),day=time.slice(0,10),delivery=syncDeliveryContract();
 const services=['a','b'].map(suffix=>{
  const card={version:'bazaar.service-card/v0',id:'isolated-seller-capacity-'+suffix,name:'Synthetic seller '+suffix,description:'Synthetic local capacity metadata, no payment or service execution.',
   kind:'http',url:'https://provider.invalid',routeTemplate:'/text',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',
   payment:{scheme:'exact',asset:'USDC',identity:USDC_TESTNET_PAYMENT_IDENTITY,amount:'0.01',destination,marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},
   provider:{name:'Synthetic fixture'},tags:['testnet'],delivery:{...delivery,result:{...delivery.result,contentType:'text/plain'}}};
  return{submissionId:randomUUID(),ownerId:seller.ownerId,cardHash:computeCanonicalServiceCardHash(card),card,withdrawn:false,createdAt:time};
 });
 const report=(index,usedToday=0)=>({serviceId:services[index].card.id,cardHash:services[index].cardHash,reportId:randomUUID(),ready:true,day,usedToday,observedAt:time});
 const order=(index=0)=>{const service=services[index],operationId=randomUUID(),input={topic:'Synthetic bounded capacity input'};
  return{operationId,buyerOwnerId:'ow_'+'b'.repeat(32),sellerOwnerId:seller.ownerId,serviceId:service.card.id,cardHash:service.cardHash,card:structuredClone(service.card),input,
   inputHash:sha(canonical(input)),payer,destination,amount:'0.01',settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',
   memoHash:orderMemo('ow_'+'b'.repeat(32),operationId,service.cardHash,input),phase:'awaiting-payment',createdAt:time,updatedAt:time};};
 const challenge=o=>({operationId:o.operationId,buyerOwnerId:o.buyerOwnerId,orderBinding:sha(canonical({operationId:o.operationId,owner:o.buyerOwnerId,protocol:o.paymentProtocol,cardHash:o.cardHash,inputHash:o.inputHash,payer:o.payer,destination:o.destination,amount:o.amount,settlement:o.settlement})),
  phase:'challenged',createdAt:time,updatedAt:time,challenge:{x402Version:2,resource:{url:'https://market.invalid/api/market/orders/'+o.operationId+'/x402'},
   accepts:[{scheme:'exact',network:'stellar:testnet',amount:'100000',asset:USDC_TESTNET_PAYMENT_IDENTITY.sacContract,payTo:destination}]}});
 const verifying=r=>Object.assign(r,{phase:'verifying',attemptId:randomUUID(),payload:{syntheticFixtureOnly:true,noPaymentAuthorization:true},payloadHash:sha('synthetic:'+r.operationId),authorizationFingerprint:sha('synthetic-fingerprint:'+r.operationId)});
 return{seller,services,report,order,challenge,verifying,time};
}
async function run(profile){
 const started=Date.now(),deadline=started+180000,expirySeconds=Math.floor(started/1000)+86400;
 const prefix='bazaar-market:pilot-'+randomBytes(16).toString('hex'),keys=[prefix+':state',prefix+':x402-settlements:state',capacityReservationKey(prefix)];
 const owned=new Set(keys),latest=new Map(),checks={};let restRequests=0,commands=0,evalCalls=0,maximumBytes=0,ownsKeys=false,cleanup=false,deleted=0;
 let cleanupMode=false,barrier=null,loseAck=false,stage='FRESH_NAMESPACE',errorCode=null;
 const originalFetch=globalThis.fetch,f=fixture(started);
 const output={version:1,status:'FAIL',category:'Real Redis isolated seller capacity and joint CAS validation',observedAt:new Date(started).toISOString(),
  moduleSha256:SOURCE_HASHES,scriptSha256:sha(await readFile(fileURLToPath(import.meta.url))),namespaceFamily:'bazaar-market:pilot-<fresh32hex>',isolatedNamespaces:1,exactOwnedKeyCount:3,
  limits:{restRequests:MAX_REST,syntheticStateBytes:MAX_BYTES,fixtureExpiryHours:24},
  realPayments:0,providerExecutions:0,realAccountsCreated:0,realOrdersCreated:0,facilitatorCalls:0,productionSettingsChanged:false,cronActivated:false,publicRelease:false,checks};
 const assertKey=key=>{if(!owned.has(key))fail('TARGET_REJECTED');};
 const checkBytes=values=>{const n=values.reduce((total,v)=>total+bytes(v),0);if(n>MAX_BYTES)fail('FIXTURE_TOO_LARGE');maximumBytes=Math.max(maximumBytes,n);};
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.origin!==TARGET||url.pathname!=='/'||url.search||url.hash||url.username||url.password||init.method!=='POST')fail('TARGET_REJECTED');
  let command;try{command=JSON.parse(init.body);}catch{fail('TARGET_REJECTED');}
  if(!Array.isArray(command)||!['get','eval','expireat','del'].includes(String(command[0]).toLowerCase()))fail('TARGET_REJECTED');
  if(restRequests>=MAX_REST)fail('REST_BOUND');restRequests++;
  return originalFetch(input,{...init,redirect:'error'});
 };
 const redis=new Redis({url:profile.url,token:profile.token,automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false,latencyLogging:false,signal:()=>AbortSignal.timeout(8000)});
 const command=async action=>{if(commands>=(cleanupMode?MAX_REST:NORMAL_LIMIT))fail('REST_BOUND');if(!cleanupMode&&Date.now()>=deadline)fail('DEADLINE');commands++;try{return await action();}catch(error){if(error instanceof LocalFailure)throw error;throw new LocalFailure('REDIS_REQUEST_FAILED');}};
 const get=async key=>{assertKey(key);const raw=await command(()=>redis.get(key));if(raw!==null&&(typeof raw!=='string'||bytes(raw)>MAX_BYTES))fail('FIXTURE_TOO_LARGE');latest.set(key,raw);return raw;};
 const snapshots=()=>Promise.all(keys.map(get));
 const ttl=async()=>{const results=await Promise.allSettled(keys.map(key=>command(()=>redis.expireat(key,expirySeconds))));if(results.some(r=>r.status!=='fulfilled'||![0,1].includes(r.value)))fail('TTL_UNCONFIRMED');};
 const adapter={get,async eval(script,evalKeys,args){
  if(script!==MARKET_CAPACITY_CAS||evalKeys.length<3||evalKeys.length>4||evalKeys.slice(0,3).some((key,i)=>key!==keys[i])||evalKeys.some(key=>!owned.has(key))||args.length!==14||args.some(arg=>typeof arg!=='string')||args[11]!=='unchecked'||(evalKeys.length===3&&args[9]!=='unchecked')||args[13]!==''&&(!/^[1-9]\d{0,15}$/.test(args[13])||!Number.isSafeInteger(Number(args[13]))))fail('TARGET_REJECTED');
  checkBytes([args[6]||latest.get(keys[0]),args[7]||latest.get(keys[1]),args[8]||latest.get(keys[2])]);
  if(barrier)await barrier();evalCalls++;
  let result;try{result=await command(()=>redis.eval(script,evalKeys,args));}catch(error){await ttl();throw error;}
  if(result!==-1&&result!==0&&result!==1)fail('CAS_RESULT_INVALID');if(result===1)await ttl();
  if(result===1&&loseAck){loseAck=false;fail('SYNTHETIC_ACK_LOST');}return result;
 }};
 const market=createMarketStore(adapter,prefix),settlements=createMarketX402Store(adapter,prefix);
 // Atomic reset of owned synthetic fixtures only. This is not an application
 // endpoint or a payment bypass; both documents are validated before the real Lua.
 async function replaceFixture(m,s){validateMarketState(m);validateMarketX402State(s);const before=await snapshots(),mr=envelope(m),sr=envelope(s),projection=projectCapacity(mr,sr,before[2]);
  const expected=raw=>[raw===null?'missing':'present',raw??''];const args=[...expected(before[0]),...expected(before[1]),...expected(before[2]),mr,sr,projection.ledgerRaw!==before[2]?(projection.ledgerRaw??''):'','unchecked','','unchecked','',''];
  assert.equal(await adapter.eval(MARKET_CAPACITY_CAS,keys,args),1);
 }
 try{
  const initial=await snapshots();if(initial.some(v=>v!==null))fail('KEY_COLLISION');ownsKeys=true;checks.freshThreeKeyNamespace=true;
  stage='REPORT';const initialReport=f.report(0);
  await market.transact(s=>{s.services.push(...f.services);reportCapacityInState(s,f.seller,initialReport,started);});
  const initialState=await market.transact(s=>s);assert.equal(sellerCapacityDto(initialState,f.services[0].card.id,f.services[0].cardHash,started).ready,true);checks.ownedServiceReportPersisted=true;
  const beforeReplay=evalCalls,lease=initialState.sellerCapacities[0].leaseExpiresAt;
  const replay=await market.transact(s=>reportCapacityInState(s,f.seller,initialReport,started+1000));assert.equal(replay.leaseExpiresAt,lease);assert.equal(evalCalls,beforeReplay);checks.reportReplayDoesNotExtendExpiryOrWrite=true;
  const beforeForbidden=evalCalls;await assert.rejects(()=>market.transact(s=>reportCapacityInState(s,{...f.seller,ownerId:'ow_'+'c'.repeat(32)},f.report(0),started)),e=>e?.code==='NOT_FOUND');assert.equal(evalCalls,beforeForbidden);checks.otherOwnerReportRejectedBeforeLua=true;
  const beforeMissing=evalCalls;await assert.rejects(()=>market.transact(s=>{const o=f.order(1);reserveSellerCapacity(s,o,started);s.orders.push(o);}),capacityFailure);assert.equal(evalCalls,beforeMissing);checks.missingCapacityCreatesNoOrderOrWrite=true;
  stage='EXPIRY';await market.transact(s=>{const c=s.sellerCapacities[0];c.receivedAt=new Date(started-SELLER_LEASE_MS-1).toISOString();c.leaseExpiresAt=new Date(started-1).toISOString();});
  const beforeExpired=evalCalls;await assert.rejects(()=>market.transact(s=>{const o=f.order();reserveSellerCapacity(s,o,started);s.orders.push(o);}),capacityFailure);assert.equal(evalCalls,beforeExpired);checks.expiredCapacityCreatesNoOrderOrWrite=true;
  await market.transact(s=>{s.sellerCapacities=[];for(const index of [0,1])reportCapacityInState(s,f.seller,f.report(index),started);});
  stage='CONCURRENT_RESERVATION';let arrivals=0,release,reject;const waiting=new Promise((resolve,rejector)=>{release=resolve;reject=rejector;});
  const timer=setTimeout(()=>reject(new LocalFailure('RACE_TIMEOUT')),12000);barrier=async()=>{if(++arrivals===2)release();await waiting;};
  let results;try{results=await Promise.allSettled([0,1].map(index=>createMarketStore(adapter,prefix).transact(s=>{const o=f.order(index);reserveSellerCapacity(s,o,started);s.orders.push(o);return o;})));}finally{clearTimeout(timer);barrier=null;}
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason?.code==='CAPACITY_WRITE_UNCONFIRMED').length,1);
  const winner=results.find(r=>r.status==='fulfilled').value,m=await market.transact(s=>s);assert.equal(m.orders.length,1);assert.equal(m.orders[0].operationId,winner.operationId);assert.equal(m.orders[0].sellerReservation.committed,false);checks.twoStoresTwoServicesOneSellerPendingWinner=true;
  stage='JOINT_TRANSITION';await settlements.transact(s=>s.records.push(f.challenge(winner)));
  const beforeVerifying=await market.transact(s=>s);assert(beforeVerifying.sellerCapacities.every(c=>c.admittedUsed===0));checks.challengeDoesNotConsumeDailyExecution=true;
  const beforeLost=evalCalls;loseAck=true;await assert.rejects(()=>settlements.transact(s=>f.verifying(s.records[0])),e=>e?.code==='SYNTHETIC_ACK_LOST');assert.equal(evalCalls,beforeLost+1);
  const saved=await snapshots(),savedMarket=JSON.parse(saved[0]).state,savedSettlement=JSON.parse(saved[1]).state,savedLedger=JSON.parse(saved[2]);
  const committed=savedMarket.sellerCapacities.find(c=>c.serviceId===winner.serviceId);
  assert.equal(committed.admittedUsed,1);assert.equal(savedMarket.orders[0].sellerReservation.committed,true);assert.equal(savedSettlement.records[0].phase,'verifying');assert.equal(savedLedger.entries.length,1);assert.equal(savedLedger.entries[0].operationId,winner.operationId);
  checks.realLuaAtomicallyCommitsMarketSettlementAndReservation=true;checks.lostAckRecoveredByReadWithoutSecondAttempt=true;
  const attempt=savedSettlement.records[0].attemptId;await settlements.transact(s=>s.records[0].phase='uncertain');
  assert.equal((await settlements.transact(s=>s.records[0])).attemptId,attempt);assert.equal((await market.transact(s=>s.sellerCapacities.find(c=>c.serviceId===winner.serviceId).admittedUsed)),1);checks.uncertainMetadataPreservesAttemptAndCounter=true;
  stage='GUARD_REJECTION';const beforeGuard=await snapshots(),oldLedger=null;
  await assert.rejects(()=>market.transact(s=>s.operatorQuota={minute:1,count:1},{keys:[keys[2]],values:[oldLedger]}),e=>e?.code==='CAPACITY_WRITE_UNCONFIRMED');
  const afterGuard=await snapshots();assert.deepEqual(afterGuard,beforeGuard);checks.realLuaGuardRejectsStaleExpectedOwnDocument=true;
  stage='REDIS_TIME_EXPIRY';const beforeDeadline=await snapshots();
  const deadlineMarket=JSON.parse(beforeDeadline[0]).state;deadlineMarket.operatorQuota={minute:2,count:2};
  const deadlineSettlement=JSON.parse(beforeDeadline[1]).state,deadlineLedger=JSON.parse(beforeDeadline[2]);deadlineLedger.revision=randomUUID();
  const proposedMarket=envelope(deadlineMarket),proposedSettlement=envelope(deadlineSettlement),proposedLedger=JSON.stringify(deadlineLedger);
  assert.notEqual(proposedMarket,beforeDeadline[0]);assert.notEqual(proposedSettlement,beforeDeadline[1]);assert.notEqual(proposedLedger,beforeDeadline[2]);
  // Validate only shape/capacity. Do not call any client-side lease/time gate:
  // valid snapshots and three proposed SETs must be rejected by Redis TIME itself.
  projectCapacity(proposedMarket,proposedSettlement,proposedLedger);
  const expected=raw=>[raw===null?'missing':'present',raw??''];
  const expiredArgs=[...expected(beforeDeadline[0]),...expected(beforeDeadline[1]),...expected(beforeDeadline[2]),proposedMarket,proposedSettlement,proposedLedger,'unchecked','','unchecked','','1'];
  assert.equal(await adapter.eval(MARKET_CAPACITY_CAS,keys,expiredArgs),-1);
  assert.deepEqual(await snapshots(),beforeDeadline);checks.redisTimeRejectsPastDeadlineWithoutClientClockValidation=true;
  stage='OWNER_DAILY_QUOTA';const quotaState={version:1,services:structuredClone(f.services),orders:[]};
  for(const index of [0,1])reportCapacityInState(quotaState,f.seller,f.report(index,49),started);await replaceFixture(quotaState,{version:1,records:[]});
  const last=f.order(0);await market.transact(s=>{reserveSellerCapacity(s,last,started);s.orders.push(last);});await settlements.transact(s=>s.records.push(f.challenge(last)));await settlements.transact(s=>f.verifying(s.records[0]));
  const quotaSnapshots=await snapshots(),quotaMarket=JSON.parse(quotaSnapshots[0]).state;assert.equal(quotaMarket.sellerCapacities.find(c=>c.serviceId===last.serviceId).admittedUsed,50);
  // Drop only synthetic metadata atomically, retaining the admitted seller counter.
  // This isolates the owner daily limit from the separate one-pending-seat limit.
  quotaMarket.orders=[];await replaceFixture(quotaMarket,{version:1,records:[]});
  const beforeDaily=evalCalls;await assert.rejects(()=>market.transact(s=>{const o=f.order(1);reserveSellerCapacity(s,o,started);s.orders.push(o);}),e=>e?.code==='SELLER_CAPACITY_EXHAUSTED'&&e?.status===503);assert.equal(evalCalls,beforeDaily);checks.fiftiethExecutionOnOneServiceBlocksOtherServiceSameOwner=true;
  stage='COMPLETE';
 }catch(error){errorCode=safeCode(error);}
 finally{
  cleanupMode=true;if(ownsKeys){try{deleted=await command(()=>redis.del(...keys));if(!Number.isInteger(deleted)||deleted<0||deleted>3)fail('CLEANUP_UNCONFIRMED');cleanup=(await snapshots()).every(v=>v===null);if(!cleanup)fail('CLEANUP_UNCONFIRMED');}catch{if(!errorCode)errorCode='CLEANUP_UNCONFIRMED';}}
  globalThis.fetch=originalFetch;
 }
 output.status=!errorCode&&cleanup?'PASS':'FAIL';output.stage=output.status==='PASS'?'COMPLETE':stage;if(errorCode)output.code=errorCode;
 Object.assign(output,{restRequests,redisCommandAttempts:commands,atomicCasAttempts:evalCalls,maximumObservedSyntheticStateBytes:maximumBytes,networkUsed:restRequests>0,exactOwnedKeysDeleted:deleted,isolatedSyntheticKeysRemoved:cleanup,
  fixtureExpiryAt:new Date(expirySeconds*1000).toISOString(),elapsedMs:Date.now()-started,realRedisLuaVerified:output.status==='PASS',guardScope:'Stale expected snapshot against one of the three owned synthetic documents; no actual account identity was revoked',admissionClockScope:'Unchanged Lua Redis TIME rejects deadline=1 with valid current snapshots before all three proposed SETs; no client admission-clock check is invoked for that fixture'});
 return output;
}
async function main(){
 let report;try{await precheck();const profile=await readProfile();report=await run(profile);}catch(error){report={version:1,status:'FAIL',stage:'PRECHECK',code:safeCode(error),networkUsed:false,realPayments:0,providerExecutions:0};}
 if(report.networkUsed){try{await writeFile(EVIDENCE,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}catch{report.status='FAIL';report.code='EVIDENCE_WRITE_FAILED';report.evidenceStored=false;}}
 process.stdout.write(JSON.stringify(report)+'\n');process.exitCode=report.status==='PASS'?0:1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
