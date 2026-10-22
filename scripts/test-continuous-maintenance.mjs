// Native compaction and all atomic guards, synthetic Lua protocol adapter only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {createSellerCard} from '../examples/seller-service-card.mjs';
import {validateMarketState} from '../lib/marketplace-store.ts';
import {validateMarketX402State} from '../lib/marketplace-x402-store.ts';
import {createMarketX402Challenge,marketX402OrderBinding} from '../lib/marketplace-x402.ts';
import {sha,canonical,orderMemo} from '../lib/marketplace-identity.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {initializeContinuousStorageLedger,continuousStorageKey} from '../lib/continuous-free-storage.ts';
import {continuousFreeBudgetKey,continuousFreeBudgetConfiguration} from '../lib/continuous-free-budget.ts';
import {pruneExpiredMarketContent} from '../lib/market-maintenance.ts';
const prior=Object.fromEntries(['BAZAAR_FREE_DEMO_MODE','BAZAAR_FREE_DEMO_ADMISSION_UNTIL','BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON','BAZAAR_WORKSPACE_PREFIX'].map(k=>[k,process.env[k]])),realNow=Date.now;
delete process.env.BAZAAR_FREE_DEMO_ADMISSION_UNTIL;delete process.env.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON;process.env.BAZAAR_FREE_DEMO_MODE='continuous';
let clock=Date.parse('2026-10-11T00:00:00.000Z'),checks=0;Date.now=()=>clock;
const prefix='bazaar-market:pilot-'+'6c'.repeat(16),workspacePrefix=prefix.replace('bazaar-market','bazaar-workspace');process.env.BAZAAR_WORKSPACE_PREFIX=workspacePrefix;
const seller=Keypair.fromRawEd25519Seed(Buffer.alloc(32,2)).publicKey(),payer=Keypair.fromRawEd25519Seed(Buffer.alloc(32,3)).publicKey(),{card,cardHash}=createSellerCard({id:'synthetic-expiry-text',name:'Synthetic expiry',description:'Local fixture without network calls.',providerName:'Synthetic',providerOrigin:'https://provider.example',destination:seller,amount:'0.01'}),buyerOwnerId='ow_'+'b'.repeat(32);
function order(phase='awaiting-payment'){
 const operationId=randomUUID(),input={prompt:'PRIVATE SYNTHETIC CONTENT'},createdAt=new Date(clock-8*86400000).toISOString(),o={operationId,buyerOwnerId,sellerOwnerId:'ow_'+'a'.repeat(32),serviceId:card.id,cardHash,card,input,payer,destination:seller,amount:'0.01',settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',inputHash:sha(canonical(input)),memoHash:orderMemo(buyerOwnerId,operationId,cardHash,input),createdAt,updatedAt:createdAt,phase};
 if(phase!=='awaiting-payment')Object.assign(o,{settlementAttemptId:randomUUID(),transactionHash:'d'.repeat(64)});if(phase==='paid')o.paymentVerifiedAt=createdAt;return o;
}
const first=order(),second=order(),uncertain=order('payment-uncertain'),paid=order('paid'),orders=[first,second,uncertain,paid];
function settlement(o,phase){return {operationId:o.operationId,buyerOwnerId,orderBinding:marketX402OrderBinding(o),challenge:createMarketX402Challenge(o,'https://bazaar.example'),phase,createdAt:o.createdAt,updatedAt:o.updatedAt,attemptId:o.settlementAttemptId,payload:{x402Version:2,payload:{transaction:'SYNTHETIC_UNSUBMITTED'}},payloadHash:sha(o.operationId+'payload'),authorizationFingerprint:sha(o.operationId+'authorization'),transactionHash:o.transactionHash,...(phase==='confirmed'?{outcome:{success:true,network:'stellar:testnet',transaction:o.transactionHash,payer}}:{})};}
const market={version:1,services:[],orders},settlements={version:1,records:[settlement(uncertain,'uncertain'),settlement(paid,'confirmed')]};validateMarketState(market);validateMarketX402State(settlements);
const data=new Map([[prefix+':state',JSON.stringify({version:1,revision:randomUUID(),state:market})],[prefix+':x402-settlements:state',JSON.stringify({version:1,revision:randomUUID(),state:settlements})]]);let loseAck=false,conflict=false,writes=0;
const config=continuousFreeBudgetConfiguration(),budgetKey=continuousFreeBudgetKey(workspacePrefix),budget={version:2,configuration:config.configurationId,last:clock,buckets:[],held:orders.map(o=>({operationId:o.operationId,principalHash:sha(buyerOwnerId),recoveryCommands:12000,backgroundCommands:2000,transferBytes:2_000_000_000}))};data.set(budgetKey,JSON.stringify(budget));
const redis={async get(key){return data.get(key)??null;},async eval(script,keys,args){
 if(script.includes('-- continuous-free-storage-initialize-v1')){if(data.has(keys[0]))return 0;for(let i=1;i<keys.length;i++)if(args[i]==='missing'?data.has(keys[i]):data.get(keys[i])!==args[i].slice(8))return 0;data.set(keys[0],args[0]);writes++;return 1;}
 assert.ok(script.startsWith('-- bazaar-market-capacity-cas-v1'));
 if(conflict){conflict=false;return 0;}
 for(let i=0;i<3;i++){const old=data.get(keys[i]);if(args[2*i]==='missing'?old!==undefined:old!==args[2*i+1])return 0;}
 const draft=new Map(data);
 if(keys.length>=5){
  const oldIndex=data.get(keys[3]);if(args[14]==='missing'?oldIndex!==undefined:oldIndex!==args[15])return 0;
  const storage=JSON.parse(data.get(keys[4]));for(const row of JSON.parse(args[18])){const old=storage.entries[row.key];if(old?old.bytes!==row.expected:row.expected!==0)return -20;const reserved=row.reserved??old?.reserved??0;if(!row.bytes&&!reserved)delete storage.entries[row.key];else storage.entries[row.key]={bytes:row.bytes,reserved};}
  if(Object.values(storage.entries).reduce((n,e)=>n+e.bytes+e.reserved,0)+Buffer.byteLength(JSON.stringify(storage))>200000000)return -24;
  draft.set(keys[3],args[16]);draft.set(keys[4],JSON.stringify(storage));
  if(keys.length===6){
   const current=data.get(keys[5]);if(!current)return -10;const ledger=JSON.parse(current),requests=JSON.parse(args[20]);
   for(const request of requests){assert.equal(request.action,'release');const held=ledger.held.find(v=>v.operationId===request.operationId);if(held&&held.principalHash!==request.principalHash)return -10;ledger.held=ledger.held.filter(v=>v.operationId!==request.operationId);}
   draft.set(keys[5],JSON.stringify(ledger));
  }
 }
 for(let i=0;i<3;i++)if(args[6+i])draft.set(keys[i],args[6+i]);
 for(const [key,value]of draft)if(data.get(key)!==value){data.set(key,value);writes++;}
 if(loseAck){loseAck=false;throw Error('SYNTHETIC_MAINTENANCE_ACK_LOST');}return 1;
}};
try{
 await initializeContinuousStorageLedger(redis,workspacePrefix,[...data].map(([key,raw])=>({key,expectedRaw:raw,nextRaw:raw})));
 const before=JSON.stringify([...data]),beforeWrites=writes;conflict=true;await assert.rejects(pruneExpiredMarketContent({redis,prefix,now:clock,limit:2}),{code:'MAINTENANCE_WRITE_UNCONFIRMED'});assert.equal(JSON.stringify([...data]),before);assert.equal(writes,beforeWrites);checks++;
 loseAck=true;await assert.rejects(pruneExpiredMarketContent({redis,prefix,now:clock,limit:2}),/SYNTHETIC_MAINTENANCE_ACK_LOST/);let current=JSON.parse(data.get(prefix+':state')).state;
 assert.equal(current.orders.length,2);assert.deepEqual(JSON.parse(data.get(budgetKey)).held.map(v=>v.operationId).sort(),[uncertain.operationId,paid.operationId].sort(),'Only two definitely unpaid reservations are released in the same CAS');checks++;
 const index=JSON.parse(data.get(prefix+':maintenance-index:v1'));assert.deepEqual(index,current.maintenance.index);assert.equal(index.reconciliationDue,true);checks++;
 const recovered=await pruneExpiredMarketContent({redis,prefix,now:clock,limit:2});assert.equal(recovered.removed.length,2);assert.deepEqual(recovered.releasedOperationIds,[]);assert.equal(JSON.parse(data.get(budgetKey)).held.length,2,'Uncertain payment and unfulfilled paid reservations survive visible-content expiry');checks++;
 current=JSON.parse(data.get(prefix+':state')).state;assert.equal(current.archived.find(v=>v.operationId===uncertain.operationId).paymentPhase,'uncertain');assert.ok(!data.get(prefix+':state').includes('PRIVATE SYNTHETIC CONTENT'));checks++;
 assert.equal(JSON.parse(data.get(prefix+':maintenance-index:v1')).nextExpiryAt,null);assert.equal(JSON.parse(data.get(prefix+':maintenance-index:v1')).reconciliationDue,true);checks++;
 const stableWrites=writes;assert.equal((await pruneExpiredMarketContent({redis,prefix,now:clock,limit:2})).removed.length,0);assert.equal(writes,stableWrites);checks++;
 const storage=JSON.parse(data.get(continuousStorageKey(workspacePrefix)));for(const key of [prefix+':state',prefix+':x402-settlements:state',prefix+':maintenance-index:v1']){assert.equal(storage.entries[sha(key)].bytes,Buffer.byteLength(data.get(key)));checks++;}
 console.log(JSON.stringify({status:'PASS_LOCAL_CONTINUOUS_MAINTENANCE',checks,releaseBatchMaximum:2,unpaidHeldReleasedAtomically:true,uncertainAndPaidHeldRetained:true,nativeIndexCompactionAtomic:true,lostAcknowledgementRetries:0,externalRequests:0,cloudWrites:0,payments:0,cronActivated:false}));
}finally{Date.now=realNow;for(const[key,value]of Object.entries(prior))value===undefined?delete process.env[key]:process.env[key]=value;}
