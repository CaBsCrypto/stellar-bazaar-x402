import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {createMarketStore} from '../lib/marketplace-store.ts';
import {capacityReservationKey} from '../lib/marketplace-capacity.ts';
import {reportCapacityInState,reserveSellerCapacity} from '../lib/market-seller-capacity.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {sha,canonical,orderMemo} from '../lib/marketplace-identity.ts';
import {continuousFreeBudgetConfiguration,createContinuousFreeBudgetStore,CONTINUOUS_FREE_BUDGET_LUA,CONTINUOUS_FREE_WINDOW_MS,continuousFreeBudgetKey,continuousFreeOperationRequest,continuousFreeOperationCommitScript} from '../lib/continuous-free-budget.ts';
import {freeDemoBudgetConfiguration,createFreeDemoBudgetStore} from '../lib/free-demo-budget.ts';
import {initializeContinuousStorageLedger,prepareContinuousStorageCommit,continuousStorageKey,CONTINUOUS_FREE_STORAGE_MAX} from '../lib/continuous-free-storage.ts';

let checks=0;const equal=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const reject=async(fn,code)=>{await assert.rejects(fn,{code});checks++;};
const prefix='bazaar-workspace:pilot-'+'c'.repeat(32),env={BAZAAR_FREE_DEMO_MODE:'continuous'};
const config=continuousFreeBudgetConfiguration(env),now0=Date.parse('2026-10-11T20:00:00Z');
equal(config.limits,{public:155000,authenticated:90000,recovery:105000,background:50000});equal(config.transferBytes,8000000000);
equal(freeDemoBudgetConfiguration(env),config);equal(freeDemoBudgetConfiguration({}),undefined);
equal(continuousFreeBudgetConfiguration({...env,BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON:JSON.stringify({background:50000,recovery:105000,authenticated:90000,public:155000})}),config,'Equivalent config ordering cannot alter the persistent window');
for(const bad of [{BAZAAR_FREE_DEMO_MODE:'bad'},{...env,BAZAAR_FREE_DEMO_ADMISSION_UNTIL:'2026-10-12T20:00:00.000Z'},{...env,BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON:JSON.stringify({public:155000,authenticated:90000,recovery:105000})},{...env,BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON:JSON.stringify({public:155001,authenticated:90000,recovery:105000,background:50000})}]){assert.throws(()=>continuousFreeBudgetConfiguration(bad),{code:'FREE_DEMO_BUDGET_UNAVAILABLE'});checks++;}

// Explicit protocol double, never presented as validation of Redis's Lua runtime.
function budgetModel(raw,configuration,request,now){
 const names=['public','authenticated','recovery','background'];let state=raw?JSON.parse(raw):{version:2,configuration:configuration.configurationId,last:0,buckets:[],held:[]};
 if(state.version!==2||state.configuration!==configuration.configurationId||state.last>now||!Array.isArray(state.buckets)||!Array.isArray(state.held))return {status:-2};
 const day=Math.floor(now/86400000),oldest=Math.floor((now-configuration.windowMs)/86400000);state.buckets=state.buckets.filter(b=>b.day>=oldest);state.last=now;
 let current=state.buckets.find(b=>b.day===day);if(!current){current={day,used:Object.fromEntries(names.map(n=>[n,0])),bytes:0};state.buckets.push(current);}
 const used=Object.fromEntries(names.map(n=>[n,state.buckets.reduce((s,b)=>s+b.used[n],0)]));let bytes=state.buckets.reduce((s,b)=>s+b.bytes,0);
 for(const held of state.held){used.recovery+=held.recoveryCommands;used.background+=held.backgroundCommands;bytes+=held.transferBytes;}
 const held=state.held.find(h=>h.operationId===request.operationId);
 if(request.action==='reserve'){
  if(held)return held.principalHash===request.principalHash?{state,status:1}:{status:-3};
  if(used.recovery+request.recoveryCommands>configuration.limits.recovery||used.background+request.backgroundCommands>configuration.limits.background||bytes+request.transferBytes>configuration.transferBytes)return {status:0};
  state.held.push({operationId:request.operationId,principalHash:request.principalHash,recoveryCommands:request.recoveryCommands,backgroundCommands:request.backgroundCommands,transferBytes:request.transferBytes});return {state,status:1};
 }
 if(request.action==='release'){if(held?.principalHash!==request.principalHash&&held)return {status:-3};state.held=state.held.filter(h=>h.operationId!==request.operationId);return {state,status:1};}
 let profile=request.profile;
 if(held){if(held.principalHash!==request.principalHash||!['recovery','background'].includes(profile))return {status:-3};const field=profile==='recovery'?'recoveryCommands':'backgroundCommands';if(held[field]>=request.commands&&held.transferBytes>=request.transferBytes){held[field]-=request.commands;held.transferBytes-=request.transferBytes;current.used[profile]+=request.commands;current.bytes+=request.transferBytes;return {state,status:1,profile,used:used[profile]};}}
 if(used[profile]+request.commands>configuration.limits[profile]&&profile==='public'&&request.recoveryTransport)profile='recovery';
 if(used[profile]+request.commands>configuration.limits[profile]||bytes+request.transferBytes>configuration.transferBytes){current.used.public+=request.denialCommands??4;current.bytes+=request.denialTransferBytes??4096;return {state,status:0,profile,used:used[profile]};}
 current.used[profile]+=request.commands;current.bytes+=request.transferBytes;return {state,status:1,profile,used:used[profile]+request.commands};
}
const rows=new Map();let calls=0,now=now0,lose=false,fail=false;
const redis={async eval(script,keys,args){calls++;if(fail)throw Error('isolated unavailable');equal(script,CONTINUOUS_FREE_BUDGET_LUA);const result=budgetModel(rows.get(keys[0]),JSON.parse(args[0]),JSON.parse(args[1]),now);if(result.state)rows.set(keys[0],JSON.stringify(result.state));if(lose){lose=false;throw Error('lost acknowledgement');}return [result.status,result.used??0,result.profile??JSON.parse(args[1]).profile??'background',60];}};
const tiny=continuousFreeBudgetConfiguration({...env,BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON:JSON.stringify({public:200,authenticated:300,recovery:20000,background:6000})});
const store=createFreeDemoBudgetStore(redis,prefix,tiny),kind={profile:'public',workload:'metadata',newOperation:false};
const races=await Promise.allSettled(Array.from({length:12},()=>store.reserve(kind)));equal(races.filter(r=>r.status==='fulfilled').length,1,'Atomic protocol has only one admission');equal(races.filter(r=>r.status==='rejected'&&r.reason.code==='FREE_DEMO_REQUEST_LIMIT').length,11);
const ledger=()=>JSON.parse(rows.get(continuousFreeBudgetKey(prefix)));equal(ledger().buckets[0].used.public,172+44,'Denied gates remain accounted');
now+=86400000;await reject(()=>createContinuousFreeBudgetStore(redis,prefix,tiny).reserve(kind),'FREE_DEMO_REQUEST_LIMIT');
now=now0+CONTINUOUS_FREE_WINDOW_MS;await reject(()=>store.reserve(kind),'FREE_DEMO_REQUEST_LIMIT');
now=now0+CONTINUOUS_FREE_WINDOW_MS+86400000;await store.reserve(kind);equal(ledger().buckets.length,3,'Partial boundary day, recent denied gate and current day remain');equal(ledger().buckets[0].day,Math.floor((now0+86400000)/86400000),'Original admission bucket is wholly outside 31 days');
const key2='bazaar-workspace:pilot-'+'d'.repeat(32),lost=createContinuousFreeBudgetStore(redis,key2,tiny);lose=true;const before=calls;await reject(()=>lost.reserve(kind),'FREE_DEMO_BUDGET_UNAVAILABLE');equal(calls-before,1,'Lost reply is not replayed');await reject(()=>lost.reserve(kind),'FREE_DEMO_REQUEST_LIMIT');
fail=true;await reject(()=>lost.reserve(kind),'FREE_DEMO_BUDGET_UNAVAILABLE');fail=false;
now-=5000;const rawBefore=rows.get(continuousFreeBudgetKey(key2));await reject(()=>lost.reserve(kind),'FREE_DEMO_BUDGET_UNAVAILABLE');equal(rows.get(continuousFreeBudgetKey(key2)),rawBefore,'Clock regression cannot reset');now+=5000;

// Pending holds remain after the request buckets expire and survive reconstruction.
const operation={operationId:randomUUID(),principalHash:'a'.repeat(64),action:'reserve'},operationKey=continuousFreeBudgetKey('bazaar-workspace:pilot-'+'e'.repeat(32));
function operationCommit(value){const result=budgetModel(rows.get(operationKey),config,continuousFreeOperationRequest(value),now);if(result.state)rows.set(operationKey,JSON.stringify(result.state));return result.status;}
equal(operationCommit(operation),1);equal(operationCommit(operation),1,'Admission replay does not duplicate the hold');equal(JSON.parse(rows.get(operationKey)).held.length,1);
now+=40*86400000;equal(operationCommit(operation),1);equal(JSON.parse(rows.get(operationKey)).held[0].recoveryCommands,12000,'No TTL on uncertain payment capacity');
const heldStore=createContinuousFreeBudgetStore(redis,'bazaar-workspace:pilot-'+'e'.repeat(32),config);
await reject(()=>heldStore.background({operationId:operation.operationId,principalHash:'b'.repeat(64),commands:1000,transferBytes:1000,reason:'wake'}),'FREE_DEMO_BUDGET_UNAVAILABLE');
await heldStore.background({operationId:operation.operationId,principalHash:operation.principalHash,commands:1000,transferBytes:1000,reason:'wake'});equal(JSON.parse(rows.get(operationKey)).held[0].backgroundCommands,2996);
equal(operationCommit({...operation,action:'release'}),1);equal(JSON.parse(rows.get(operationKey)).held.length,0);equal(JSON.parse(rows.get(operationKey)).buckets.at(-1).used.background,1004,'Spent work remains counted after unused reservation released');
const bytePrefix='bazaar-workspace:pilot-'+'b'.repeat(32),byteStore=createContinuousFreeBudgetStore(redis,bytePrefix,config);
for(let i=0;i<3;i++)await byteStore.background({commands:1000,transferBytes:2_000_000_000,reason:'readiness'});
await reject(()=>byteStore.background({commands:1000,transferBytes:2_000_000_000,reason:'readiness'}),'FREE_DEMO_REQUEST_LIMIT');equal(JSON.parse(rows.get(continuousFreeBudgetKey(bytePrefix))).buckets[0].used.background,3012,'Byte exhaustion rejects before more worker admission');
const admissionState={version:2,configuration:config.configurationId,last:now,buckets:[{day:Math.floor(now/86400000),used:{public:0,authenticated:0,recovery:100000,background:0},bytes:0}],held:[]};
equal(budgetModel(JSON.stringify(admissionState),config,continuousFreeOperationRequest({...operation,operationId:randomUUID()}),now).status,0,'A new purchase cannot consume existing recovery margin');
assert.ok(continuousFreeOperationCommitScript(6,15,16).includes("budget_prepare(redis.call('GET',KEYS[6])"));checks++;

// Storage's protocol fixture checks initialization snapshots and byte projection;
// production Lua compilation / real Redis acceptance remains a release gate.
const storageRows=new Map();let storageCalls=0,storageGets=0;
const storageRedis={async get(key){storageGets++;return storageRows.get(key)??null;},async eval(script,keys,args){storageCalls++;assert.ok(script.includes('continuous-free-storage-initialize-v1'));if(storageRows.has(keys[0]))return 0;for(let i=1;i<keys.length;i++){if(args[i]==='missing'?storageRows.has(keys[i]):storageRows.get(keys[i])!==args[i].slice(8))return 0;}storageRows.set(keys[0],args[0]);return 1;}};
const docKey=prefix+':owner:one',reviewKey=prefix.replace('workspace','review')+':state';storageRows.set(docKey,'old');
await reject(()=>initializeContinuousStorageLedger(storageRedis,prefix,[{key:docKey,expectedRaw:'wrong',nextRaw:'wrong'}]),'FREE_DEMO_STORAGE_INITIALIZATION_UNCONFIRMED');
await initializeContinuousStorageLedger(storageRedis,prefix,[{key:docKey,expectedRaw:'old',nextRaw:'old'},{key:reviewKey,expectedRaw:null,nextRaw:null}]);
await reject(()=>initializeContinuousStorageLedger(storageRedis,prefix,[]),'FREE_DEMO_STORAGE_INITIALIZATION_UNCONFIRMED');
const savedMode=process.env.BAZAAR_FREE_DEMO_MODE;process.env.BAZAAR_FREE_DEMO_MODE='continuous';
try{
 const patch=await prepareContinuousStorageCommit(storageRedis,prefix,[{key:docKey,expectedRaw:'old',nextRaw:'longer',reservedBytes:20},{key:reviewKey,expectedRaw:null,nextRaw:'review'}]);equal(storageGets,0,'No global ledger transported per mutation');equal(patch.keys,[continuousStorageKey(prefix)]);equal(patch.args[0],prefix.split(':')[1]);
 const edits=JSON.parse(patch.args[1]),current=JSON.parse(storageRows.get(patch.keys[0]));for(const edit of edits){const old=current.entries[edit.key];equal(old?.bytes??0,edit.expected);current.entries[edit.key]={bytes:edit.bytes,reserved:edit.reserved??old?.reserved??0};}equal(Object.values(current.entries).reduce((n,e)=>n+e.bytes+e.reserved,0),32);
 assert.ok(patch.appendScript(4,6).includes('total+string.len(storageNext)+10000000>200000000'));checks++;assert.ok(patch.writeScript(4).includes('storageNext'));checks++;
 await reject(()=>prepareContinuousStorageCommit(storageRedis,prefix,[{key:'other:scope',expectedRaw:null,nextRaw:'bad'}]),'FREE_DEMO_STORAGE_UNAVAILABLE');
 await reject(()=>prepareContinuousStorageCommit(storageRedis,prefix,[{key:docKey,expectedRaw:null,nextRaw:'bad',reservedBytes:-1}]),'FREE_DEMO_STORAGE_UNAVAILABLE');
 await reject(()=>initializeContinuousStorageLedger(storageRedis,'bazaar-workspace:pilot-'+'f'.repeat(32),[{key:'bazaar-workspace:pilot-'+'f'.repeat(32)+':reserve',expectedRaw:null,nextRaw:null,reservedBytes:CONTINUOUS_FREE_STORAGE_MAX}]),'FREE_DEMO_STORAGE_CAPACITY');
}finally{if(savedMode===undefined)delete process.env.BAZAAR_FREE_DEMO_MODE;else process.env.BAZAAR_FREE_DEMO_MODE=savedMode;}

// Exercise the actual MarketStore/guard API. This fixture emulates the atomic
// native Lua protocol; real Lua execution is intentionally a separate check.
const mprefix=prefix.replace('workspace','market'),marketRows=new Map();let marketLost=false;
const marketRedis={async get(key){return marketRows.get(key)??null;},async eval(script,keys,args){
 if(script.includes('continuous-free-storage-initialize-v1')){if(marketRows.has(keys[0]))return 0;for(let i=1;i<keys.length;i++){if(args[i]==='missing'?marketRows.has(keys[i]):marketRows.get(keys[i])!==args[i].slice(8))return 0;}marketRows.set(keys[0],args[0]);return 1;}
 assert.ok(script.includes('bazaar-market-capacity-cas-v1'));for(const [ki,ai] of [[0,0],[1,2],[2,4],[3,9],[4,11]]){if(args[ai]==='unchecked')continue;if(args[ai]==='missing'?marketRows.has(keys[ki]):marketRows.get(keys[ki])!==args[ai+1])return 0;}
 const indexMatch=script.match(/local indexOld=redis.call\('GET',KEYS\[(\d+)\]\)\nif ARGV\[(\d+)\]/);assert.ok(indexMatch);const ik=+indexMatch[1]-1,ia=+indexMatch[2]-1;if(args[ia]==='missing'?marketRows.has(keys[ik]):marketRows.get(keys[ik])!==args[ia+1])return 0;
 const storageMatch=script.match(/local storageOld=redis.call\('GET',KEYS\[(\d+)\]\)/),sk=+storageMatch[1]-1,sa=ia+3;if(!marketRows.has(keys[sk]))return -21;const storage=JSON.parse(marketRows.get(keys[sk]));for(const edit of JSON.parse(args[sa+1])){const old=storage.entries[edit.key];if(old?old.bytes!==edit.expected:edit.expected!==0)return -23;const reserved=edit.reserved??old?.reserved??0;if(edit.bytes===0&&reserved===0)delete storage.entries[edit.key];else storage.entries[edit.key]={bytes:edit.bytes,reserved};}
 const total=Object.values(storage.entries).reduce((n,e)=>n+e.bytes+e.reserved,0);if(total+Buffer.byteLength(JSON.stringify(storage))+10000000>200000000)return -24;
 let budgetResult,bk;if(script.includes('local config=cjson.decode(ARGV[')){const match=script.match(/local config=cjson.decode\(ARGV\[(\d+)\]\)/),ci=+match[1]-1,budgetKey=script.match(/budget_prepare\(redis.call\('GET',KEYS\[(\d+)\]\),config,request\)/);bk=+budgetKey[1]-1;budgetResult=budgetModel(marketRows.get(keys[bk]),JSON.parse(args[ci]),JSON.parse(args[ci+1]),now);if(!budgetResult.state)return budgetResult.status===0?-11:-10;}
 // Only after every projected write fits does the protocol publish any key.
 for(let i=0;i<3;i++)if(args[6+i])marketRows.set(keys[i],args[6+i]);marketRows.set(keys[ik],args[ia+2]);marketRows.set(keys[sk],JSON.stringify(storage));if(budgetResult)marketRows.set(keys[bk],JSON.stringify(budgetResult.state));if(marketLost){marketLost=false;throw Error('lost atomic order acknowledgement');}return 1;
}};
const oldEnvironment=Object.fromEntries(['BAZAAR_FREE_DEMO_MODE','BAZAAR_WORKSPACE_PREFIX','BAZAAR_FREE_DEMO_ADMISSION_UNTIL','BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON'].map(k=>[k,process.env[k]]));
try{
 process.env.BAZAAR_FREE_DEMO_MODE='continuous';process.env.BAZAAR_WORKSPACE_PREFIX=prefix;delete process.env.BAZAAR_FREE_DEMO_ADMISSION_UNTIL;delete process.env.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON;
 await initializeContinuousStorageLedger(marketRedis,prefix,[]);
 const buyerOwnerId='ow_'+'a'.repeat(32),sellerOwnerId='ow_'+'b'.repeat(32),payer=Keypair.random().publicKey(),destination=Keypair.random().publicKey(),createdAt=new Date().toISOString();
 const card={version:'bazaar.service-card/v0',id:'continuous-budget-fixture',name:'Offline',description:'Offline budget and atomic order fixture',kind:'http',url:'https://provider.example',routeTemplate:'/text',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',identity:USDC_TESTNET_PAYMENT_IDENTITY,amount:'0.01',destination,marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Fixture'},tags:['testnet'],delivery:{...syncDeliveryContract(),result:{...syncDeliveryContract().result,contentType:'text/plain'}}};
 const operationId=randomUUID(),cardHash=computeCanonicalServiceCardHash(card),input={topic:'offline'},order={operationId,buyerOwnerId,sellerOwnerId,serviceId:card.id,cardHash,card,input,payer,destination,amount:'0.01',settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',inputHash:sha(canonical(input)),memoHash:orderMemo(buyerOwnerId,operationId,cardHash,input),phase:'awaiting-payment',createdAt,updatedAt:createdAt};
 const market=createMarketStore(marketRedis,mprefix);await market.transact(s=>{s.services.push({submissionId:randomUUID(),ownerId:sellerOwnerId,cardHash,card,withdrawn:false,createdAt});reportCapacityInState(s,{ownerId:sellerOwnerId,agentId:'agent_'+'b'.repeat(32),workspaceId:randomUUID(),role:'agent',generation:1},{serviceId:card.id,cardHash,reportId:randomUUID(),ready:true,day:createdAt.slice(0,10),usedToday:0,observedAt:createdAt});});
 await reject(()=>market.transact(s=>{reserveSellerCapacity(s,order);s.orders.push(order);}), 'FREE_DEMO_OPERATION_RESERVATION_REQUIRED');
 equal((await market.transact(s=>s.orders.length)),0,'Missing credit reservation cannot publish an order');
 const heldGuard={keys:[],values:[],continuousOperation:{operationId,principalHash:sha(buyerOwnerId),action:'reserve'}};marketLost=true;
 await assert.rejects(()=>market.transact(s=>{reserveSellerCapacity(s,order);s.orders.push(order);},heldGuard));checks++;
 equal(await createMarketStore(marketRedis,mprefix).transact(s=>s.orders.length),1,'Lost order acknowledgement retains the original order');
 equal(JSON.parse(marketRows.get(continuousFreeBudgetKey(prefix))).held[0].operationId,operationId,'Order and payment/worker credits commit together');
 equal(JSON.parse(marketRows.get(capacityReservationKey(mprefix))).entries.length,1,'Text future growth is reserved before payment');
 equal(JSON.parse(marketRows.get(mprefix+':maintenance-index:v1')).version,1,'Tiny maintenance index commits with native mutation');
 const original=marketRows.get(mprefix+':state'),storageKey=continuousStorageKey(prefix),storage=JSON.parse(marketRows.get(storageKey));storage.entries['f'.repeat(64)]={bytes:190000000,reserved:0};marketRows.set(storageKey,JSON.stringify(storage));
 await reject(()=>market.transact(s=>s.paused=true),'FREE_DEMO_STORAGE_CAPACITY');equal(marketRows.get(mprefix+':state'),original,'Global storage exhaustion cannot partially modify market');
}finally{for(const [k,v] of Object.entries(oldEnvironment))if(v===undefined)delete process.env[k];else process.env[k]=v;}
console.log(JSON.stringify({status:'PASS_OFFLINE_PROTOCOL_ONLY',checks,redisLuaRuntimeVerified:false,network:0,realPayments:0,window:'conservative 31 days plus partial boundary day',pendingReservationsNoTtl:true,denialOverheadCounted:true,storageAtomicPatch:true,limitations:['physical provider invoice is not guaranteed under unlimited denied traffic','complete existing-key inventory must initialize storage before rollout']}));
