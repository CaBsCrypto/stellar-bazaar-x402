import assert from 'node:assert/strict';
import {Keypair} from '@stellar/stellar-sdk';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createRecoveryExampleCard} from '../examples/recovery-example-text-service.mjs';
import {CONTINUOUS_FREE_BUDGET_LUA,CONTINUOUS_FREE_OPERATION_RESERVATION,CONTINUOUS_EXAMPLE_TEXT_PROVIDER_IO_BOUND,continuousFreeBudgetConfiguration,continuousFreeOperationRequest,continuousFreeReservation,continuousExampleBudgetMarker,createContinuousExampleBudgetProof,createContinuousExampleControlProof,validateContinuousExampleBudgetProof,continuousExampleBudgetContext,continuousExampleBudgetWireLimits,continuousExampleBudgetBackgroundReservation,continuousExampleOperationReservation,createContinuousFreeBudgetStore} from '../lib/continuous-free-budget.ts';
const hash=value=>createHash('sha256').update(value).digest('hex'),copy=structuredClone;
const provider='https://ai-video-scriptwriter-example12.vercel.app',publication=createRecoveryExampleCard({providerOrigin:provider,destination:Keypair.fromRawEd25519Seed(Buffer.alloc(32,17)).publicKey()});
const buyer='ow_'+'1'.repeat(32),seller='ow_'+'2'.repeat(32);
const order={operationId:randomUUID(),buyerOwnerId:buyer,sellerOwnerId:seller,serviceId:publication.card.id,cardHash:publication.cardHash,card:publication.card,input:{format:'text'},inputHash:hash('{"format":"text"}'),payer:Keypair.fromRawEd25519Seed(Buffer.alloc(32,18)).publicKey(),destination:publication.card.payment.destination,amount:'0.01',settlement:publication.card.payment.identity,paymentProtocol:'x402-stellar-exact-v2',executionMode:'on-demand',phase:'awaiting-payment',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),memoHash:'a'.repeat(64)};
const environment={BAZAAR_FREE_DEMO_MODE:'continuous',VERCEL_ENV:'preview',BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE:'example-text-wire/v1',BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:JSON.stringify({serviceId:order.serviceId,cardHash:order.cardHash,ownerFingerprint:hash(seller),url:provider+'/api/bazaar/example/tick',token:'t'.repeat(43)})};
let checks=0;const test=(value,message)=>{assert.ok(value,message);checks++;};
const marker=continuousExampleBudgetMarker(order,environment),marked={...order,budgetProfile:marker};
test(marker.version==='example-text-wire/v1'&&/^[a-f0-9]{64}$/.test(marker.bindingHash),'versioned private server marker');
test(Object.isFrozen(marker),'immutable marker');
test(continuousExampleBudgetMarker(order,{BAZAAR_FREE_DEMO_MODE:'continuous'})===undefined,'absence of new flag cannot annotate old behavior');
test(createContinuousExampleBudgetProof(order,hash(buyer),environment)===undefined,'unmarked legacy order cannot acquire optimized proof');
const proof=createContinuousExampleBudgetProof(marked,hash(buyer),environment);
test(validateContinuousExampleBudgetProof(proof)===proof&&Object.isFrozen(proof),'proof minted only inside module and immutable');
assert.deepEqual(continuousExampleBudgetContext(proof),{operationId:order.operationId,principalHash:hash(buyer)});checks++;
const kind={profile:'recovery',newOperation:false,workload:'orders',...continuousExampleBudgetContext(proof)};
assert.deepEqual(continuousFreeReservation(kind,proof),continuousFreeReservation(kind),'no numerical reduction until validated wire matrix');checks++;
assert.deepEqual(continuousFreeReservation({...kind,exampleBudgetProof:proof}),continuousFreeReservation(kind));checks++;
const orderWireLimits={maximumRedisRequests:112,maximumRedisCommands:280,maximumOutboundBytes:32*1048576,maximumInboundBytes:32*1048576,maximumCombinedBytes:32*1048576};
assert.throws(()=>continuousExampleBudgetWireLimits(proof),{code:'EXAMPLE_TEXT_WIRE_CONTEXT_REQUIRED'});checks++;
assert.deepEqual(continuousExampleBudgetWireLimits(proof,kind),orderWireLimits);checks++;
assert.deepEqual(continuousExampleBudgetWireLimits(proof,{profile:'background',reason:'wake',...continuousExampleBudgetContext(proof)}),{maximumRedisRequests:32,maximumRedisCommands:256,maximumOutboundBytes:16*1048576,maximumInboundBytes:16*1048576,maximumCombinedBytes:16*1048576});checks++;
for(const bad of [{...kind,operationId:randomUUID()},{profile:'background',reason:'guardian',...continuousExampleBudgetContext(proof)},{profile:'background',reason:'wake',operationId:order.operationId,principalHash:hash(seller)}]){assert.throws(()=>continuousExampleBudgetWireLimits(proof,bad));checks++;}
for(const forged of [{...proof},copy(proof),JSON.parse(JSON.stringify(proof)),{},undefined]){assert.throws(()=>validateContinuousExampleBudgetProof(forged));checks++;}
for(const change of [{operationId:randomUUID()},{principalHash:hash(seller)},{principalHash:'invalid'}]){assert.throws(()=>continuousFreeReservation({...kind,...change},proof));checks++;}
for(const mutate of [value=>value.input={format:'html'},value=>value.cardHash='0'.repeat(64),value=>value.buyerOwnerId='other',value=>value.sellerOwnerId='ow_'+'3'.repeat(32),value=>value.amount='0.02',value=>value.destination=value.payer,value=>value.card.network='stellar:mainnet',value=>value.inputHash='0'.repeat(64),value=>value.card.routeTemplate='/other',value=>value.executionMode=undefined,value=>value.settlement={...value.settlement,asset:'OTHER'}]){const value=copy(order);mutate(value);assert.throws(()=>continuousExampleBudgetMarker(value,environment));checks++;}
for(const field of ['budgetProfile','transactionHash','paymentVerifiedAt','settlementAttemptId','attemptId','delivery','textWake']){const value={...order,[field]:field==='budgetProfile'?marker:'present'};assert.throws(()=>continuousExampleBudgetMarker(value,environment));checks++;}
assert.throws(()=>continuousExampleBudgetMarker({...order,phase:'paid'},environment));checks++;
assert.throws(()=>createContinuousExampleBudgetProof(marked,hash(seller),environment));checks++;
assert.throws(()=>createContinuousExampleBudgetProof({...marked,budgetProfile:{...marker,extra:1}},hash(buyer),environment));checks++;
for(const patch of [{BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE:'unknown'},{VERCEL_ENV:'development'},{BAZAAR_FREE_DEMO_MODE:'other'},{BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:'{}'}]){assert.throws(()=>continuousExampleBudgetMarker(order,{...environment,...patch}));checks++;}
const originalBinding=JSON.parse(environment.BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON);
for(const patch of [{serviceId:'other'},{cardHash:'bad'},{ownerFingerprint:'bad'},{url:provider+'/other'},{url:'https://evil.example/api/bazaar/example/tick'},{token:'bad'},{transferBytes:1}]){assert.throws(()=>continuousExampleBudgetMarker(order,{...environment,BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:JSON.stringify({...originalBinding,...patch})}));checks++;}
const rotated=continuousExampleBudgetMarker(order,{...environment,BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:JSON.stringify({...originalBinding,token:'r'.repeat(43)})});test(rotated.bindingHash===marker.bindingHash,'credential rotation does not alter immutable public binding');
const controlEnvironment={...environment,BAZAAR_MARKET_BUYER_ALLOWLIST_JSON:JSON.stringify([buyer])};
const controlKinds=[{profile:'public',newOperation:false,workload:'metadata'},{profile:'public',newOperation:false,workload:'observed-metadata'},{profile:'recovery',newOperation:false,workload:'identity'},{profile:'recovery',newOperation:false,workload:'orders'},{profile:'authenticated',newOperation:true,workload:'capacity'},{profile:'authenticated',newOperation:false,workload:'capacity'}];
for(const owner of [buyer,seller])for(const controlKind of controlKinds){const control=createContinuousExampleControlProof(owner,controlKind,controlEnvironment);test(control.scope==='control'&&control.operationId===undefined,'control proof is scoped and never names a held order');assert.deepEqual(continuousExampleBudgetContext(control),{});checks++;assert.deepEqual(continuousFreeReservation(controlKind,control),continuousFreeReservation(controlKind));checks++;}
for(const badKind of [{...controlKinds[0],operationLookup:true},{...controlKinds[3],operationId:order.operationId},{...controlKinds[3],principalHash:hash(buyer)},{profile:'recovery',newOperation:false,workload:'financial'},{profile:'authenticated',newOperation:true,workload:'order-create'},{profile:'public',newOperation:false},{profile:'public',newOperation:true,workload:'metadata'}]){test(createContinuousExampleControlProof(buyer,badKind,controlEnvironment)===undefined,'legacy order/financial/unknown request cannot receive a control fallback');}
test(createContinuousExampleControlProof('ow_'+'3'.repeat(32),controlKinds[0],controlEnvironment)===undefined,'foreign account cannot acquire bounded control proof');
for(const allowlist of [undefined,'[]',JSON.stringify([buyer,seller]),'{"owner":1}','invalid']){assert.throws(()=>createContinuousExampleControlProof(buyer,controlKinds[0],{...controlEnvironment,BAZAAR_MARKET_BUYER_ALLOWLIST_JSON:allowlist}));checks++;}
const control=createContinuousExampleControlProof(buyer,controlKinds[0],controlEnvironment);assert.throws(()=>continuousFreeReservation(controlKinds[3],control));checks++;
assert.deepEqual(continuousExampleBudgetWireLimits(control,controlKinds[0]),{maximumRedisRequests:112,maximumRedisCommands:172,maximumOutboundBytes:12*1048576,maximumInboundBytes:12*1048576,maximumCombinedBytes:12*1048576});checks++;
assert.throws(()=>continuousExampleBudgetWireLimits(control,controlKinds[3]));checks++;
assert.throws(()=>continuousExampleBudgetWireLimits(control,{profile:'background',reason:'readiness',...continuousExampleBudgetContext(proof)}));checks++;
assert.throws(()=>continuousFreeReservation({...controlKinds[0],operationLookup:true},control));checks++;
const previewHyphen='https://ai-video-scriptwriter-example-budget.vercel.app',newPublication=createRecoveryExampleCard({providerOrigin:previewHyphen,destination:order.destination});
const newOrder={...order,card:newPublication.card,cardHash:newPublication.cardHash};
const newEnv={...environment,BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:JSON.stringify({...originalBinding,cardHash:newOrder.cardHash,url:previewHyphen+'/api/bazaar/example/tick'})};
test(Boolean(continuousExampleBudgetMarker(newOrder,newEnv)),'new hyphenated owned Preview alias accepted');
test(createContinuousExampleBudgetProof(marked,hash(buyer),newEnv).bindingHash===marker.bindingHash,'existing marker survives publication and worker rotation without acquiring new conditions');
test(createContinuousExampleBudgetProof(marked,hash(buyer),{...newEnv,BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:JSON.stringify({...JSON.parse(newEnv.BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON),ownerFingerprint:hash('ow_'+'3'.repeat(32)),token:'r'.repeat(43)})}).bindingHash===marker.bindingHash,'existing recovery uses the frozen seller and never resizes after credential or owner rotation');
test(createContinuousExampleBudgetProof(marked,hash(buyer),{...environment,BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:undefined}).bindingHash===marker.bindingHash,'existing marked recovery does not require current publication secret');
for(const value of [{...marked,budgetProfile:{...marker,bindingHash:'0'.repeat(64)}},{...marked,card:newOrder.card,cardHash:newOrder.cardHash},{...marked,sellerOwnerId:'ow_'+'3'.repeat(32)}]){assert.throws(()=>createContinuousExampleBudgetProof(value,hash(buyer),newEnv));checks++;}
for(const patch of [{BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE:undefined},{BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE:'unknown'},{VERCEL_ENV:'development'},{BAZAAR_FREE_DEMO_MODE:'other'}]){assert.throws(()=>createContinuousExampleBudgetProof(marked,hash(buyer),{...environment,...patch}));checks++;}
const productionOrigin='https://ai-video-scriptwriter-example.vercel.app',productionCard=createRecoveryExampleCard({providerOrigin:productionOrigin,destination:order.destination});
test(Boolean(continuousExampleBudgetMarker({...order,card:productionCard.card,cardHash:productionCard.cardHash},{...environment,VERCEL_ENV:'production',BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:JSON.stringify({...originalBinding,cardHash:productionCard.cardHash,url:productionOrigin+'/api/bazaar/example/tick'})})),'prepared production profile supports the fixed separate example alias');
const boundaryCard=copy(order.card);boundaryCard.description+='x'.repeat(8192-Buffer.byteLength(JSON.stringify(boundaryCard)));
const {computeCanonicalServiceCardHash}=await import('../lib/canonical-service-card.ts');
const boundaryHash=computeCanonicalServiceCardHash(boundaryCard),boundaryEnv={...environment,BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:JSON.stringify({...originalBinding,cardHash:boundaryHash})};
test(Buffer.byteLength(JSON.stringify(boundaryCard))===8192&&Boolean(continuousExampleBudgetMarker({...order,card:boundaryCard,cardHash:boundaryHash},boundaryEnv)),'bounded-card exact byte boundary admitted');
boundaryCard.description+='x';const tooLargeHash=computeCanonicalServiceCardHash(boundaryCard);
assert.throws(()=>continuousExampleBudgetMarker({...order,card:boundaryCard,cardHash:tooLargeHash},{...environment,BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON:JSON.stringify({...originalBinding,cardHash:tooLargeHash})}));checks++;
const generic=continuousFreeOperationRequest({operationId:order.operationId,principalHash:hash(buyer),action:'reserve'},order,environment);
test(generic.transferBytes===2000000000&&CONTINUOUS_FREE_OPERATION_RESERVATION.transferBytes===2000000000,'generic held credit is not reduced by proof groundwork');
assert.deepEqual(continuousExampleOperationReservation(),{recoveryCommands:8736,backgroundCommands:6300,transferBytes:1508921344});checks++;
test(continuousFreeOperationRequest({operationId:order.operationId,principalHash:hash(buyer),action:'reserve'},marked,newEnv).transferBytes===1508921344,'new marked orders use the finite accepted recovery matrix');
for(const patch of [{operationId:randomUUID()},{principalHash:hash(seller)}]){assert.throws(()=>continuousFreeOperationRequest({operationId:order.operationId,principalHash:hash(buyer),action:'reserve',...patch},marked,environment));checks++;}
assert.throws(()=>continuousFreeOperationRequest({operationId:order.operationId,principalHash:hash(buyer),action:'reserve'},{...marked,budgetProfile:{...marker,bindingHash:'0'.repeat(64)}},environment));checks++;
assert.deepEqual(continuousFreeOperationRequest({operationId:order.operationId,principalHash:hash(buyer),action:'release'},marked,{}),{operationId:order.operationId,principalHash:hash(buyer),action:'release'});checks++;
test(continuousFreeBudgetConfiguration(environment).configurationId===continuousFreeBudgetConfiguration({BAZAAR_FREE_DEMO_MODE:'continuous'}).configurationId,'persistent configuration identifier and partitions unchanged');
// Compare the shipped Lua against the accepted frozen production cut. New
// selectors must not rewrite counters or replace old held credits inside Lua.
const frozen=await import('../.vercel/free-margin-repair-bazaar-source/lib/continuous-free-budget.ts');
test(frozen.CONTINUOUS_FREE_BUDGET_LUA===CONTINUOUS_FREE_BUDGET_LUA,'existing Lua byte-for-byte unchanged');
let request;
const store=createContinuousFreeBudgetStore({eval:async(_script,_keys,args)=>{request=JSON.parse(args[1]);return [1,request.commands,'recovery',60];}},'bazaar-workspace:pilot-'+'a'.repeat(32),continuousFreeBudgetConfiguration(environment));
await store.reserve({...kind,exampleBudgetProof:proof});
test(!Object.hasOwn(request,'exampleBudgetProof')&&!JSON.stringify(request).includes('t'.repeat(43)),'opaque proof and private configuration do not enter Redis request payload');
const fake={...proof};await assert.rejects(store.reserve({...kind,exampleBudgetProof:fake}));checks++;
const backgroundCost=continuousExampleBudgetBackgroundReservation(proof,'readiness');
await store.background({...continuousExampleBudgetContext(proof),...backgroundCost,reason:'readiness',exampleBudgetProof:proof});
test(request.transferBytes===56*1048576+4096&&request.commands===1260&&!Object.hasOwn(request,'exampleBudgetProof'),'complete background credit covers native16MiB/256 plus provider40MiB/1000 and never leaks proof into Lua');
test(CONTINUOUS_EXAMPLE_TEXT_PROVIDER_IO_BOUND.commands===1000&&CONTINUOUS_EXAMPLE_TEXT_PROVIDER_IO_BOUND.transferBytes===40*1048576,'provider-only enforced bound is separated from complete background credit');
for(const patch of [{exampleBudgetProof:control},{exampleBudgetProof:fake},{operationId:randomUUID()},{principalHash:hash(seller)},{commands:999},{transferBytes:40*1048576},{transferBytes:1},{reason:'guardian'}]){await assert.rejects(store.background({...continuousExampleBudgetContext(proof),...backgroundCost,reason:'wake',exampleBudgetProof:proof,...patch}));checks++;}
assert.throws(()=>continuousExampleBudgetBackgroundReservation(control,'readiness'));checks++;
assert.throws(()=>continuousExampleBudgetBackgroundReservation(proof,'guardian'));checks++;
await store.background({...continuousExampleBudgetContext(proof),commands:1000,transferBytes:100000000,reason:'readiness'});test(request.transferBytes===100004096&&request.commands===1004,'unmarked legacy background cost remains unchanged');
const beforeConfig=hash(await readFile('lib/continuous-free-storage.ts'));test(beforeConfig==='9ffe3bae2d7e57e0039c14322c1477c921788e2d3cf5abedce16ad519e5c970d','storage limits remain untouched');
console.log(JSON.stringify({status:'PASS_LOCAL_EXAMPLE_BUDGET_PROOF_FINITE_PROFILE',checks,numericalSavingsActivated:true,newMarkedHeldBytes:1508921344,existingLuaUnchanged:true,genericHeldBytes:2000000000,configurationIdUnchanged:true,networkRequests:0,payments:0,productionChanged:false}));
