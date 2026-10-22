// Actual native order creation and capacity CAS; storage and readiness are
// synthetic in-memory dependencies. No payment, signer, DPAPI or network.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Keypair} from '@stellar/stellar-sdk';
import {createMarketStore,setMarketStoreForTests} from '../lib/marketplace-store.ts';
import {continuousCapacityRedis} from './fixtures/continuous-capacity-redis.mjs';
import {createMarketOrder,submitMarketService,reportMarketCapacity,readMarketOrder,sha,canonical} from '../lib/marketplace.ts';
import {setWorkspaceStoreForTests} from '../lib/workspace-store.ts';
import {setMarketTextSellerRuntimeForTests} from '../lib/market-text-seller-runtime.ts';
import {initializeContinuousStorageLedger} from '../lib/continuous-free-storage.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {resetSelfListingStateForTests,recordManualReview,stageApprovedSubmission} from '../lib/provider-self-listing.ts';
import {verifySubmissionHttp,activateSubmission} from '../lib/provider-review-operator.ts';
import {WorkspaceError} from '../lib/workspace-types.ts';

const previous={...process.env},originalFetch=globalThis.fetch;
let externalRequests=0,checks=0;
globalThis.fetch=async()=>{externalRequests++;throw Error('NO_EXTERNAL_REQUESTS');};
const check=(actual,expected)=>{assert.equal(actual,expected);checks++;};
const principal=(role,c)=>({role,ownerId:'ow_'+c.repeat(32),workspaceId:randomUUID(),agentId:'agent_'+c.repeat(32),generation:1});
async function fixture({revokeDuringReadiness=false,concurrent=false}={}){
 for(const name of Object.keys(process.env))if(/^(BAZAAR|VERCEL|UPSTASH|KV_REST)/.test(name))delete process.env[name];
 Object.assign(process.env,{NODE_ENV:'test',BAZAAR_PUBLIC_DEMO:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_X402_MARKETPLACE_ENABLED:'true',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_MARKET_REVIEW_SECRET:randomBytes(32).toString('hex'),BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://fixture.example',BAZAAR_WORKSPACE_ADMISSION:'open'});
 await resetSelfListingStateForTests();
 const prefix='bazaar-market:pilot-'+randomBytes(16).toString('hex'),workspacePrefix=prefix.replace('bazaar-market','bazaar-workspace'),registryKey=workspacePrefix+':registry';
 const seller=principal('human','a'),sellerAgent={...seller,role:'agent'},buyer=principal('agent','b'),data=new Map(),redis=continuousCapacityRedis({data}),market=createMarketStore(redis,prefix);
 const initialRegistry={version:1,revision:randomUUID(),generation:1,revoked:false,requestCount:0};data.set(registryKey,JSON.stringify(initialRegistry));
 let readinessCalls=0,walletReads=0,guardBeforeReadiness,release;
 const barrier=new Promise(r=>{release=r;});
 setMarketStoreForTests(market);
 setWorkspaceStoreForTests({
  walletIdentity:async p=>{walletReads++;const raw=data.get(registryKey),registry=JSON.parse(raw);if(p.ownerId===buyer.ownerId&&(registry.revoked||registry.generation!==p.generation))throw new WorkspaceError('WORKSPACE_REVOKED',401);return {identity:{...p,network:'stellar:testnet',wallet:null},guard:{keys:[registryKey],values:[raw]}};},
  isOwnerActive:async()=>true,activeOwnerIds:async ids=>new Set(ids),readMarketPermissionSnapshot:async()=>({permission:{allowServiceSubmission:true}}),
 });
 const card={version:'bazaar.service-card/v0',id:'guionista-bazaar-pilot-text-funded-v1',name:'Synthetic creation guard',description:'Offline shared registry regression.',kind:'http',url:'https://provider.example',routeTemplate:'/v1/marketplace-text',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',identity:USDC_TESTNET_PAYMENT_IDENTITY,amount:'0.01',destination:Keypair.random().publicKey(),marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Synthetic seller'},tags:['testnet'],delivery:{...syncDeliveryContract(),result:{...syncDeliveryContract().result,contentType:'text/plain'}}};
 const submissionId=randomUUID(),submitted=await submitMarketService(seller,{submissionId,card,controlProof:{method:'http-well-known',domain:'provider.example'}});
 await verifySubmissionHttp(submissionId,{lookup:async()=>[{address:'8.8.8.8',family:4}],transport:async()=>({status:200,body:submitted.control.expectedRecord})});
 assert.ok((await recordManualReview(submissionId,{decision:'approve',reviewerId:'offline-guard',reasons:['Synthetic']})).ok);await stageApprovedSubmission(submissionId);
 const entry={id:card.id,card,hash:computeCanonicalServiceCardHash(card)};await activateSubmission(submissionId,{configured:()=>true,create:async()=>({ok:true,entry}),read:async()=>entry});
 const now=new Date().toISOString();await reportMarketCapacity(sellerAgent,{serviceId:card.id,cardHash:entry.hash,reportId:randomUUID(),ready:true,day:now.slice(0,10),usedToday:0,observedAt:now});
 await initializeContinuousStorageLedger(redis,workspacePrefix,[...data].map(([key,raw])=>({key,expectedRaw:raw,nextRaw:raw})));
 Object.assign(process.env,{BAZAAR_FREE_DEMO_MODE:'continuous',BAZAAR_WORKSPACE_PREFIX:workspacePrefix,BAZAAR_MARKET_PREFIX:prefix,VERCEL_ENV:'preview',BAZAAR_TEXT_SELLER_MODE:'on-demand',BAZAAR_TEXT_SELLER_SERVICE_ID:card.id,BAZAAR_TEXT_SELLER_CARD_HASH:entry.hash,BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT:sha(seller.ownerId),BAZAAR_TEXT_SELLER_WAKE_URL:'https://ai-video-scriptwriter-synthetic.vercel.app/api/bazaar/seller/tick',BAZAAR_TEXT_SELLER_WAKE_TOKEN:'x'.repeat(43)});
 walletReads=0;
 setMarketTextSellerRuntimeForTests({async readiness(){readinessCalls++;guardBeforeReadiness??=data.get(registryKey);const registry=JSON.parse(data.get(registryKey));registry.revision=randomUUID();registry.requestCount++;if(revokeDuringReadiness){registry.revoked=true;registry.generation++;}data.set(registryKey,JSON.stringify(registry));if(concurrent){if(readinessCalls===2)release();await barrier;}return true;},async dispatch(){assert.fail('No provider execution');}});
 // Bootstrap the existing maintenance projection before the deliberate final
 // order-CAS race; this test targets order admission, not concurrent bootstrap.
 await market.transact(()=>null);
 const intent={operationId:randomUUID(),serviceId:card.id,cardHash:entry.hash,payer:Keypair.random().publicKey(),input:{topic:'Synthetic guard acceptance'},paymentProtocol:'x402-stellar-exact-v2'};
 return {buyer,intent,card,data,redis,registryKey,prefix,market,get readinessCalls(){return readinessCalls;},get walletReads(){return walletReads;},get guardBeforeReadiness(){return guardBeforeReadiness;},create:input=>createMarketOrder(buyer,input??intent)};
}

// Import the unchanged frozen function, while deliberately sharing its helper
// singletons with this working-tree fixture. Only its ./ imports are redirected.
// The frozen file and its old ordering are never rewritten.
const frozenUrl=pathToFileURL(resolve('.vercel/continuous-on-demand-v2-bazaar-production-source/lib/marketplace.ts')).href;
const workingLib=pathToFileURL(resolve('lib')+'/').href;
const hook=registerHooks({resolve(specifier,context,next){if(context.parentURL===frozenUrl&&specifier.startsWith('./'))return next(new URL(specifier,workingLib).href,context);return next(specifier,context);}});
let frozen;
try{frozen=await import(frozenUrl);}finally{hook.deregister();}
try{
 const old=await fixture();await assert.rejects(()=>frozen.createMarketOrder(old.buyer,old.intent),e=>e.code==='CAPACITY_WRITE_UNCONFIRMED'&&e.status===409);checks++;
 check(old.readinessCalls,1);check(old.walletReads,1);check((await old.market.transact(s=>s.orders)).length,0);
 const accepted=await fixture(),created=await accepted.create();
 check(created.operationId,accepted.intent.operationId);check(created.cardHash,accepted.intent.cardHash);check(created.payer,accepted.intent.payer);check(created.amount,'0.01');check(created.destination,accepted.card.payment.destination);check(created.executionMode,'on-demand');
 check(accepted.readinessCalls,1);check(accepted.walletReads,1);assert.notEqual(accepted.guardBeforeReadiness,accepted.data.get(accepted.registryKey));checks++;
 const committed=accepted.redis.commits.at(-1),guardIndex=committed.keys.indexOf(accepted.registryKey);assert.ok(guardIndex>=0);checks++;
 const guardArgument=guardIndex===3?10:12;check(committed.args[guardArgument],accepted.data.get(accepted.registryKey));
 check((await accepted.market.transact(s=>s.orders)).length,1);
 const readBefore=accepted.walletReads,readyBefore=accepted.readinessCalls,recovered=await accepted.create();assert.deepEqual(recovered,created);checks++;
 check(accepted.walletReads,readBefore);check(accepted.readinessCalls,readyBefore);check((await readMarketOrder(accepted.buyer,created.operationId)).operationId,created.operationId);
 const revoked=await fixture({revokeDuringReadiness:true});await assert.rejects(()=>revoked.create(),e=>e.code==='WORKSPACE_REVOKED'&&e.status===401);checks++;
 check(revoked.readinessCalls,1);check((await revoked.market.transact(s=>s.orders)).length,0);
 const concurrent=await fixture({concurrent:true}),second={...concurrent.intent,operationId:randomUUID()};
 const results=await Promise.allSettled([concurrent.create(),concurrent.create(second)]);
 check(results.filter(r=>r.status==='fulfilled').length,1);check(results.filter(r=>r.status==='rejected').length,1);
 const rejected=results.find(r=>r.status==='rejected').reason;assert.ok(['SELLER_CAPACITY_EXHAUSTED','CAPACITY_WRITE_UNCONFIRMED'].includes(rejected.code));checks++;
 const orders=await concurrent.market.transact(s=>s.orders);check(orders.length,1);check(new Set(orders.map(o=>o.operationId)).size,1);check(orders[0].sellerReservation.committed,false);check(orders[0].amount,'0.01');check(orders[0].cardHash,concurrent.intent.cardHash);check(orders[0].payer,concurrent.intent.payer);
 check(externalRequests,0);
 console.log(JSON.stringify({status:'PASS_LOCAL_ON_DEMAND_CREATION_GUARD',checks,realNativeOrderCreation:true,realNativeCapacityCas:true,frozenRegression:{source:'034f25235cbbcc89f8f7e51633e93b372e7f531c2cf191f9b114920052b40c52',code:'CAPACITY_WRITE_UNCONFIRMED',httpStatus:409},sharedRegistryAfterReadiness:true,revocationDeniedBeforeOrder:true,priorOrderNoWake:true,concurrentOrdersAdmitted:1,externalRequests,newPayments:0,signatures:0,providerExecutions:0,cloudWrites:0,dpapiReads:0}));
}finally{
 globalThis.fetch=originalFetch;setMarketStoreForTests(undefined);setWorkspaceStoreForTests(undefined);setMarketTextSellerRuntimeForTests(undefined);
 for(const name of Object.keys(process.env))if(!(name in previous))delete process.env[name];Object.assign(process.env,previous);
}
