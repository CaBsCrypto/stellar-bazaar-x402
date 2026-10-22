import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Account,Address,Keypair,Networks,Operation,TransactionBuilder,authorizeEntry,nativeToScVal,xdr} from '@stellar/stellar-sdk';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import {createMarketStore,setMarketStoreForTests} from '../lib/marketplace-store.ts';
import {createMarketX402Store,setMarketX402StoreForTests} from '../lib/marketplace-x402-store.ts';
import {createMarketOrder,readMarketOrder,readMarketRecovery,listMarketOrders} from '../lib/marketplace.ts';
import {createMarketX402Challenge,executeMarketX402Payment,marketX402Authorization,marketX402OrderBinding,reconcileArchivedMarketPayment,reconcileMarketX402Payment,reconcileMarketGuardianOrder,setMarketX402DependenciesForTests} from '../lib/marketplace-x402.ts';
import {setWorkspaceStoreForTests} from '../lib/workspace-store.ts';
import {marketHandlers} from '../lib/marketplace-http.ts';
import {pruneExpiredMarketContent} from '../lib/market-maintenance.ts';
import {marketRecoveryRecord} from '../lib/market-retention-schema.ts';
import {marketGuardianSnapshot,marketGuardianHandlers,createMarketGuardianRunner} from '../lib/market-guardian.ts';
import {capacityRedis} from './fixtures/market-capacity-redis.mjs';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {sha,canonical,orderMemo} from '../lib/marketplace-identity.ts';
import {reportCapacityInState,reserveSellerCapacity} from '../lib/market-seller-capacity.ts';

const previous={...process.env};
for(const key of Object.keys(process.env))if(/BAZAAR|UPSTASH|KV_REST|VERCEL/.test(key))delete process.env[key];
const origin='https://recovery.example',prefix='bazaar-market:pilot-'+randomBytes(16).toString('hex'),redis=capacityRedis(),store=createMarketStore(redis,prefix),settlements=createMarketX402Store(redis,prefix);
const buyer={role:'agent',ownerId:'ow_'+'b'.repeat(32),agentId:'agent-b',workspaceId:randomUUID(),generation:1},seller={...buyer,ownerId:'ow_'+'a'.repeat(32)},stranger={...buyer,ownerId:'ow_'+'c'.repeat(32)};
const payer=Keypair.random(),destination=Keypair.random(),sponsor=Keypair.random(),now=Date.now(),createdAt=new Date(now-8*86400000).toISOString();
const card={version:'bazaar.service-card/v0',id:'recovery-text-fixture',name:'Recovery fixture',description:'Synthetic private recovery contract fixture.',kind:'http',url:'https://provider.example',routeTemplate:'/text',input:[{name:'prompt',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.0234567',destination:destination.publicKey(),identity:USDC_TESTNET_PAYMENT_IDENTITY,marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Fixture'},tags:['testnet'],delivery:{...syncDeliveryContract(),result:{...syncDeliveryContract().result,contentType:'text/plain'}}};
const cardHash=computeCanonicalServiceCardHash(card);
function order(){const operationId=randomUUID(),input={prompt:'PRIVATE_PROMPT_MUST_BE_ERASED_'+operationId};return {operationId,buyerOwnerId:buyer.ownerId,sellerOwnerId:seller.ownerId,serviceId:card.id,cardHash,card,input,payer:payer.publicKey(),destination:destination.publicKey(),amount:card.payment.amount,settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',inputHash:sha(canonical(input)),memoHash:orderMemo(buyer.ownerId,operationId,cardHash,input),phase:'payment-uncertain',settlementAttemptId:randomUUID(),createdAt,updatedAt:createdAt};}
// Fresh payment admissions use distinct synthetic sellers. Conserved uncertain
// archives remain untouched and continue occupying their original owner's seat.
async function admitFreshOrder(o){
 const p={...seller,ownerId:'ow_'+randomBytes(16).toString('hex'),workspaceId:randomUUID(),agentId:'agent-'+randomUUID()},freshCard={...structuredClone(o.card),id:'recovery-'+randomUUID()},freshHash=computeCanonicalServiceCardHash(freshCard),time=Date.now();
 Object.assign(o,{sellerOwnerId:p.ownerId,serviceId:freshCard.id,card:freshCard,cardHash:freshHash,memoHash:orderMemo(o.buyerOwnerId,o.operationId,freshHash,o.input)});
 await store.transact(state=>{state.services.push({submissionId:randomUUID(),ownerId:p.ownerId,card:freshCard,cardHash:freshHash,withdrawn:false,createdAt:new Date(time).toISOString()});reportCapacityInState(state,p,{serviceId:freshCard.id,cardHash:freshHash,reportId:randomUUID(),ready:true,day:new Date(time).toISOString().slice(0,10),usedToday:0,observedAt:new Date(time).toISOString()},time);reserveSellerCapacity(state,o,time);state.orders.push(o);});
 return p;
}
const intent=o=>({operationId:o.operationId,serviceId:o.serviceId,cardHash:o.cardHash,payer:o.payer,input:o.input,paymentProtocol:o.paymentProtocol});
async function chain(o,nonce=42n,amount='234567'){
 const invoke=new xdr.InvokeContractArgs({contractAddress:new Address(o.settlement.sacContract).toScAddress(),functionName:'transfer',args:[nativeToScVal(o.payer,{type:'address'}),nativeToScVal(o.destination,{type:'address'}),nativeToScVal(amount,{type:'i128'})]});
 const root=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invoke),subInvocations:[]});
 const creds=xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({address:new Address(o.payer).toScAddress(),nonce:xdr.Int64.fromString(String(nonce)),signatureExpirationLedger:200,signature:xdr.ScVal.scvVoid()}));
 const auth=await authorizeEntry(new xdr.SorobanAuthorizationEntry({credentials:creds,rootInvocation:root}),payer,200,Networks.TESTNET);
 const tx=new TransactionBuilder(new Account(sponsor.publicKey(),'0'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeHostFunction({func:xdr.HostFunction.hostFunctionTypeInvokeContract(invoke),auth:[auth]})).setTimeout(60).build();tx.sign(sponsor);return tx;
}
let rpcCalls=0,externalEffects=0,chainStatus='SUCCESS',chainXdr;
const deps={store:settlements,rpc:{async transaction(){rpcCalls++;return {status:chainStatus,envelopeXdr:chainXdr};}},facilitator:{async verify(){externalEffects++;throw Error('MUST_NOT_VERIFY');},async settle(){externalEffects++;throw Error('MUST_NOT_SETTLE');}}};
try{
 Object.assign(process.env,{BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:origin,BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_MARKET_PURCHASES:'false',BAZAAR_X402_MARKETPLACE_ENABLED:'false',BAZAAR_MARKET_PREFIX:prefix});
 setMarketStoreForTests(store);setMarketX402StoreForTests(settlements);
 const expired=order(),tx=await chain(expired),proof=marketX402Authorization(tx.toXDR(),expired,true);chainXdr=tx.toXDR();expired.transactionHash=proof.transactionHash;
 await store.transact(state=>state.orders.push(expired));
 await settlements.transact(state=>state.records.push({operationId:expired.operationId,buyerOwnerId:buyer.ownerId,orderBinding:marketX402OrderBinding(expired),challenge:createMarketX402Challenge(expired,origin),phase:'uncertain',createdAt,updatedAt:createdAt,attemptId:expired.settlementAttemptId,payload:{x402Version:2,payload:{transaction:tx.toXDR()}},payloadHash:sha(tx.toXDR()),authorizationFingerprint:proof.fingerprint,transactionHash:proof.transactionHash}));
 assert.equal((await listMarketOrders(buyer)).length,0);
 await assert.rejects(readMarketOrder(buyer,expired.operationId),error=>error.code==='ORDER_CONTENT_EXPIRED');
 await assert.rejects(readMarketOrder(stranger,expired.operationId),error=>error.code==='NOT_FOUND');
 const control=marketRecoveryRecord(expired,(await settlements.transact(state=>state.records[0])));
 assert.ok(!JSON.stringify(control).includes(expired.input.prompt));assert.equal('input' in control,false);assert.equal('card' in control,false);assert.equal('payload' in control,false);assert.equal(control.paymentPhase,'uncertain');
 const beforeCleanup=await marketGuardianSnapshot();assert.ok(beforeCleanup.incidents.some(item=>item.operationId===expired.operationId&&item.canReconcile));assert.ok(!JSON.stringify(beforeCleanup).includes(expired.input.prompt));assert.ok(!JSON.stringify(beforeCleanup).includes(tx.toXDR()));
 const waitingControl=await readMarketRecovery(buyer,expired.operationId);assert.equal(waitingControl.paymentPhase,'uncertain');assert.equal('input' in waitingControl,false);
 chainStatus='NOT_FOUND';await assert.rejects(reconcileMarketX402Payment(buyer,expired.operationId,deps),error=>error.code==='X402_PAYMENT_OUTCOME_UNCERTAIN');assert.equal(externalEffects,0,'Expired content before cleanup still permits only ledger recovery');chainStatus='SUCCESS';
 const cleanup=await pruneExpiredMarketContent({redis,prefix,now,limit:10});assert.deepEqual(cleanup.removed,[expired.operationId]);
 const raw=JSON.stringify([...redis.data.values()]);assert.ok(!raw.includes(expired.input.prompt));assert.ok(!raw.includes(tx.toXDR()));assert.equal((await settlements.transact(state=>state.records)).length,0);
 await assert.rejects(readMarketOrder(buyer,expired.operationId),error=>error.code==='ORDER_CONTENT_EXPIRED');await assert.rejects(readMarketRecovery(stranger,expired.operationId),error=>error.code==='NOT_FOUND');
 await assert.rejects(createMarketOrder(buyer,intent(expired)),error=>error.code==='ORDER_CONTENT_EXPIRED');
 await assert.rejects(createMarketOrder(buyer,{...intent(expired),input:{prompt:'changed'}}),error=>error.code==='OPERATION_CONFLICT');
 await assert.rejects(createMarketOrder(stranger,intent(expired)),error=>error.code==='NOT_FOUND');assert.equal((await store.transact(state=>state.orders)).length,0);
 await assert.rejects(reconcileMarketX402Payment(stranger,expired.operationId,deps),error=>error.code==='NOT_FOUND');
 chainStatus='NOT_FOUND';await assert.rejects(reconcileArchivedMarketPayment(expired.operationId,deps),error=>error.code==='X402_PAYMENT_OUTCOME_UNCERTAIN');assert.equal((await readMarketRecovery(buyer,expired.operationId)).paymentPhase,'uncertain');
 chainStatus='SUCCESS';chainXdr=(await chain(expired,43n)).toXDR();await assert.rejects(reconcileArchivedMarketPayment(expired.operationId,deps),error=>error.code==='X402_PAYMENT_NOT_VERIFIED');
 chainXdr=(await chain(expired,42n,'234568')).toXDR();await assert.rejects(reconcileArchivedMarketPayment(expired.operationId,deps),error=>error.code==='X402_AUTHORIZATION_MISMATCH');
 chainXdr=tx.toXDR();const confirmed=await reconcileMarketX402Payment(buyer,expired.operationId,deps);assert.equal(confirmed.paymentPhase,'confirmed');assert.ok(confirmed.paymentVerifiedAt);assert.ok(!JSON.stringify(confirmed).includes(expired.input.prompt));
 const afterFirst=rpcCalls;await reconcileMarketGuardianOrder(expired.operationId,deps);assert.equal(rpcCalls,afterFirst);assert.equal(externalEffects,0,'Recovery never submits to facilitator');
 assert.equal((await store.transact(state=>state.sellerCapacities??[])).length,0,'Legacy confirmed recovery requires no fresh seller admission');
 const buyerToken=randomBytes(32).toString('base64url'),otherToken=randomBytes(32).toString('base64url');
 // Realistic guard shape keeps fresh recovery-race admissions generation-bound
 // without falsely requiring owner-specific service permission keys to match.
 const workspacePrefix=prefix.replace('bazaar-market:','bazaar-workspace:'),workspaceRoot=workspacePrefix+':{'+workspacePrefix.split(':')[1]+'}',registryKey=workspaceRoot+':registry';
 redis.data.set(registryKey,JSON.stringify({version:1,revision:randomUUID(),fixtureGeneration:1}));
 setWorkspaceStoreForTests({resolveHash:async digest=>digest===sha(buyerToken)?buyer:digest===sha(otherToken)?stranger:Promise.reject(Error('UNAUTHORIZED')),consumeRequest:async()=>{},walletIdentity:async p=>{const permissionKey=workspaceRoot+':market-permissions:'+p.ownerId;return {identity:{...p,wallet:null,network:'stellar:testnet'},guard:{keys:[registryKey,permissionKey],values:[redis.data.get(registryKey),redis.data.get(permissionKey)??null]}};}});setMarketX402DependenciesForTests(deps);
 const reconcileRequest=token=>new Request(origin+'/api/market/orders/'+expired.operationId,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action:'reconcile'})});
 const reconciledResponse=await marketHandlers.action(reconcileRequest(buyerToken),expired.operationId);assert.equal(reconciledResponse.status,200);const reconciledBody=await reconciledResponse.text();assert.ok(reconciledBody.includes(proof.transactionHash));assert.ok(!reconciledBody.includes(expired.input.prompt));assert.ok(!reconciledBody.includes(tx.toXDR()));assert.equal((await marketHandlers.action(reconcileRequest(otherToken),expired.operationId)).status,404);
 const unknown=order(),unknownTx=await chain(unknown,99n),unknownProof=marketX402Authorization(unknownTx.toXDR(),unknown,true);
 await store.transact(state=>state.orders.push(unknown));
 await settlements.transact(state=>state.records.push({operationId:unknown.operationId,buyerOwnerId:buyer.ownerId,orderBinding:marketX402OrderBinding(unknown),challenge:createMarketX402Challenge(unknown,origin),phase:'uncertain',createdAt,updatedAt:createdAt,attemptId:unknown.settlementAttemptId,payload:{transaction:unknownTx.toXDR()},payloadHash:sha(unknownTx.toXDR()),authorizationFingerprint:unknownProof.fingerprint}));
 await pruneExpiredMarketContent({redis,prefix,now,limit:10});const unknownControl=await readMarketRecovery(buyer,unknown.operationId);assert.equal(unknownControl.paymentPhase,'uncertain');assert.equal(unknownControl.authorizationFingerprint,unknownProof.fingerprint);assert.equal(unknownControl.transactionHash,undefined);
 const beforeUnknown=rpcCalls;await assert.rejects(reconcileArchivedMarketPayment(unknown.operationId,deps),error=>error.code==='X402_PAYMENT_OUTCOME_UNCERTAIN');assert.equal(rpcCalls,beforeUnknown);assert.equal(externalEffects,0);
 const next=order();next.createdAt=new Date().toISOString();next.updatedAt=next.createdAt;next.phase='awaiting-payment';delete next.settlementAttemptId;
 await admitFreshOrder(next);
 await settlements.transact(state=>state.records.push({operationId:next.operationId,buyerOwnerId:buyer.ownerId,orderBinding:marketX402OrderBinding(next),challenge:createMarketX402Challenge(next,origin),phase:'challenged',createdAt:next.createdAt,updatedAt:next.createdAt}));
 await assert.rejects(settlements.transact(state=>Object.assign(state.records[0],{phase:'verifying',attemptId:randomUUID(),payload:{transaction:tx.toXDR()},payloadHash:sha(tx.toXDR()),authorizationFingerprint:proof.fingerprint})),error=>error.code==='X402_AUTHORIZATION_REUSE');
 const operatorToken=randomBytes(32).toString('base64url');process.env.BAZAAR_MARKET_OPERATOR_HASH=sha(operatorToken);
 const req=token=>new Request(origin+'/api/market/guardian',{headers:{authorization:'Bearer '+token}});
 assert.equal((await marketGuardianHandlers.read(req(randomBytes(32).toString('base64url')))).status,401);
 const response=await marketGuardianHandlers.read(req(operatorToken));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).actions.paymentResubmission,false);
 // A settle response arrives after maintenance crosses the content deadline.
 // Only local dependency doubles settle here; no facilitator/network is used.
 Object.assign(process.env,{BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_X402_MARKETPLACE_ENABLED:'true'});
 const originalNow=Date.now;
 let simulatedSettleCalls=0;
 async function archiveDuringSettle({outcomeChange,archiveChange}={},nonce=1000n){
  const started=originalNow(),race=order();race.createdAt=new Date(started-7*86400000+2000).toISOString();race.updatedAt=race.createdAt;race.phase='awaiting-payment';delete race.settlementAttemptId;
  Date.now=()=>started;
  try{
   await admitFreshOrder(race);
   const raceTx=await chain(race,nonce),raceProof=marketX402Authorization(raceTx.toXDR(),race,true),challenge=createMarketX402Challenge(race,origin);
   const payload={x402Version:2,resource:challenge.resource,accepted:challenge.accepts[0],payload:{transaction:raceTx.toXDR()}};
   let verifies=0,settles=0,reads=0;
   const raceDeps={store:settlements,rpc:{async transaction(){reads++;return {status:'SUCCESS',envelopeXdr:raceTx.toXDR()};}},facilitator:{
    async verify(){verifies++;return {isValid:true,payer:race.payer};},
    async settle(){settles++;simulatedSettleCalls++;Date.now=()=>started+3000;await pruneExpiredMarketContent({redis,prefix,now:started+3000,limit:10});if(archiveChange)await store.transact(state=>archiveChange(state.archived.find(r=>r.operationId===race.operationId)));return {...{success:true,network:'stellar:testnet',payer:race.payer,transaction:raceProof.transactionHash},...outcomeChange};},
   }};
   await assert.rejects(executeMarketX402Payment(buyer,race.operationId,origin,encodePaymentSignatureHeader(payload),raceDeps),error=>error.code===(!outcomeChange&&!archiveChange?'ORDER_CONTENT_EXPIRED':'OPERATION_CONFLICT'));
   const archived=await readMarketRecovery(buyer,race.operationId);
   assert.equal(archived.paymentPhase,'uncertain','A returned receipt alone cannot mark archived payment verified');
   assert.equal((await store.transact(state=>state.orders.filter(o=>o.operationId===race.operationId))).length,0);
   assert.equal((await settlements.transact(state=>state.records.filter(r=>r.operationId===race.operationId))).length,0);
   const retained=JSON.stringify([...redis.data.values()]);assert.ok(!retained.includes(race.input.prompt));assert.ok(!retained.includes(raceTx.toXDR()));
   assert.equal(verifies,1);assert.equal(settles,1);assert.equal(reads,0);
   if(!outcomeChange&&!archiveChange){
    assert.equal(archived.transactionHash,raceProof.transactionHash);
    const recovered=await reconcileMarketX402Payment(buyer,race.operationId,raceDeps);assert.equal(recovered.paymentPhase,'confirmed');assert.ok(recovered.paymentVerifiedAt);assert.equal(reads,1);
    await reconcileMarketX402Payment(buyer,race.operationId,raceDeps);assert.equal(reads,1);
   }else assert.equal(archived.transactionHash,undefined,'Wrong network/payer/identifier or archived binding cannot be retained');
   await assert.rejects(executeMarketX402Payment(buyer,race.operationId,origin,encodePaymentSignatureHeader(payload),raceDeps),error=>error.code==='ORDER_CONTENT_EXPIRED');
   assert.equal(verifies,1);assert.equal(settles,1,'Expired retry cannot resubmit payment');
  }finally{Date.now=originalNow;}
 }
 await archiveDuringSettle();
 await archiveDuringSettle({outcomeChange:{network:'stellar:pubnet'}},1001n);
 await archiveDuringSettle({outcomeChange:{payer:stranger.ownerId}},1002n);
 await archiveDuringSettle({outcomeChange:{transaction:'invalid-transaction'}},1003n);
 await archiveDuringSettle({archiveChange:r=>{r.orderBinding=sha('different-binding');}},1004n);
 await archiveDuringSettle({archiveChange:r=>{r.authorizationFingerprint=sha('different-authorization');}},1005n);
 // Crash between storing a valid hash and changing settling -> settled is
 // recoverable by ledger reads without another verify/settle invocation.
 const settling=order();settling.createdAt=new Date().toISOString();settling.updatedAt=settling.createdAt;
 await admitFreshOrder(settling);
 const settlingTx=await chain(settling,1006n),settlingProof=marketX402Authorization(settlingTx.toXDR(),settling,true);settling.transactionHash=settlingProof.transactionHash;
 await store.transact(state=>Object.assign(state.orders.find(o=>o.operationId===settling.operationId),{transactionHash:settlingProof.transactionHash}));
 await settlements.transact(state=>state.records.push({operationId:settling.operationId,buyerOwnerId:buyer.ownerId,orderBinding:marketX402OrderBinding(settling),challenge:createMarketX402Challenge(settling,origin),phase:'settling',createdAt:settling.createdAt,updatedAt:settling.updatedAt,attemptId:settling.settlementAttemptId,payload:{transaction:settlingTx.toXDR()},payloadHash:sha(settlingTx.toXDR()),authorizationFingerprint:settlingProof.fingerprint,transactionHash:settlingProof.transactionHash}));
 await store.transact(state=>state.sellerCapacities=state.sellerCapacities.filter(c=>c.ownerId!==settling.sellerOwnerId));
 assert.ok((await marketGuardianSnapshot(1000)).incidents.some(i=>i.operationId===settling.operationId&&i.canReconcile),'Guardian exposes known-hash settling as ledger-recoverable');
 let settlingReads=0;
 const settlingDeps={...deps,rpc:{async transaction(){settlingReads++;return {status:'SUCCESS',envelopeXdr:settlingTx.toXDR()};}}};
 const settled=await reconcileMarketGuardianOrder(settling.operationId,settlingDeps);assert.equal(settled.phase,'paid');assert.equal(settlingReads,1);assert.equal(externalEffects,0);
 await reconcileMarketX402Payment(buyer,settling.operationId,settlingDeps);assert.equal(settlingReads,1,'Confirmed recovery avoids repeated ledger reads');
 // A confirmed ledger record must survive failure of the final order CAS.
 // The next scheduled run finalizes that same order, with no second chain read
 // and no facilitator invocation even while fresh purchases remain closed.
 const finalization=order();finalization.createdAt=new Date().toISOString();finalization.updatedAt=finalization.createdAt;
 await admitFreshOrder(finalization);
 const finalizationTx=await chain(finalization,1007n),finalizationProof=marketX402Authorization(finalizationTx.toXDR(),finalization,true);
 await store.transact(state=>{state.orders.find(o=>o.operationId===finalization.operationId).transactionHash=finalizationProof.transactionHash;});
 await settlements.transact(state=>state.records.push({operationId:finalization.operationId,buyerOwnerId:buyer.ownerId,orderBinding:marketX402OrderBinding(finalization),challenge:createMarketX402Challenge(finalization,origin),phase:'settling',createdAt:finalization.createdAt,updatedAt:finalization.updatedAt,attemptId:finalization.settlementAttemptId,payload:{transaction:finalizationTx.toXDR()},payloadHash:sha(finalizationTx.toXDR()),authorizationFingerprint:finalizationProof.fingerprint,transactionHash:finalizationProof.transactionHash}));
 let finalizationReads=0,rejectFinalCas=true;
 const finalizationDeps={...deps,rpc:{async transaction(){finalizationReads++;return {status:'SUCCESS',envelopeXdr:finalizationTx.toXDR()};}}},originalEval=redis.eval;
 redis.eval=async(...args)=>{const next=args[2][6]&&JSON.parse(args[2][6]);if(rejectFinalCas&&next?.state?.orders?.find(o=>o.operationId===finalization.operationId)?.phase==='paid'){rejectFinalCas=false;throw Error('SYNTHETIC_FINAL_ORDER_CAS_FAILURE');}return originalEval(...args);};
 try{await assert.rejects(reconcileMarketGuardianOrder(finalization.operationId,finalizationDeps),/SYNTHETIC_FINAL_ORDER_CAS_FAILURE/);}finally{redis.eval=originalEval;}
 assert.equal((await settlements.transact(state=>state.records.find(r=>r.operationId===finalization.operationId))).phase,'confirmed');
 assert.equal((await store.transact(state=>state.orders.find(o=>o.operationId===finalization.operationId))).phase,'payment-uncertain');
 assert.ok((await marketGuardianSnapshot(1000)).incidents.some(i=>i.operationId===finalization.operationId&&i.code==='PAYMENT_FINALIZATION_REQUIRED'&&i.canReconcile));
 const guardian=createMarketGuardianRunner({marketStore:()=>store,reconcile:id=>reconcileMarketGuardianOrder(id,finalizationDeps),cleanup:()=>pruneExpiredMarketContent({redis,prefix,limit:2}),workspaceStore:()=>({retentionOwnerIds:async()=>[],pruneExpiredContent:async()=>assert.fail('No synthetic workspace has expired')})});
 const recoveredFinalization=await guardian();assert.ok(recoveredFinalization.reconciliation.some(i=>i.operationId===finalization.operationId&&i.confirmed));
 assert.equal((await store.transact(state=>state.orders.find(o=>o.operationId===finalization.operationId))).phase,'paid');assert.equal(finalizationReads,1);assert.equal(externalEffects,0);
 await guardian();assert.equal(finalizationReads,1,'Repeated guardian execution never replays confirmation or payment');
 console.log(JSON.stringify({status:'PASS',externalRequests:0,payments:0,simulatedSettleCalls,redisLua:'protocol-double',checks:['seven-day content denial and content-free atomic archive','private archive identity and immutable intent replay','uncertain payment remains durable','read-ledger-only cryptographic reconciliation','wrong nonce and amount rejected','archived authorization blocks reuse','paused admission preserves recovery','operator-only private guardian snapshot','settle/archive interleaving retains only matching transaction identifier','late wrong network/payer/hash/binding/fingerprint rejected','known-hash settling recovers without resubmission','confirmed ledger plus failed order CAS recovers through guardian without another payment']}));
}finally{setMarketStoreForTests(undefined);setMarketX402StoreForTests(undefined);setWorkspaceStoreForTests(undefined);setMarketX402DependenciesForTests(undefined);for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
