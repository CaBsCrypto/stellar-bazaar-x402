import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Account,Address,Keypair,Networks,Operation,TransactionBuilder,authorizeEntry,nativeToScVal,xdr} from '@stellar/stellar-sdk';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import {createMarketStore,setMarketStoreForTests} from '../lib/marketplace-store.ts';
import {createMarketX402Store,setMarketX402StoreForTests,validateMarketX402State,marketX402PaymentFailureSchema} from '../lib/marketplace-x402-store.ts';
import {executeMarketX402Payment,createMarketX402Facilitator,MARKET_X402_PROTOCOL} from '../lib/marketplace-x402.ts';
import {createMarketOrder,submitMarketService,readMarketOrder,listMarketOrders,reportMarketCapacity} from '../lib/marketplace.ts';
import {capacityRedis} from './fixtures/market-capacity-redis.mjs';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {resetSelfListingStateForTests,recordManualReview,stageApprovedSubmission} from '../lib/provider-self-listing.ts';
import {verifySubmissionHttp,activateSubmission} from '../lib/provider-review-operator.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {setWorkspaceStoreForTests} from '../lib/workspace-store.ts';
import {maximumSettlementRecordBytes} from '../lib/marketplace-capacity.ts';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(f,p)=>{await assert.rejects(f,p);checks++;};
const originalFetch=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw Error('OFFLINE_NETWORK_FORBIDDEN');};
Object.assign(process.env,{BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_X402_MARKETPLACE_ENABLED:'true',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_MARKET_REVIEW_SECRET:randomBytes(32).toString('hex'),BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://failure-fixture.example',BAZAAR_WORKSPACE_ADMISSION:'open'});
for(const k of ['BAZAAR_ACCEPTANCE_METER','BAZAAR_FREE_DEMO_MODE','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY'])delete process.env[k];
const prefix='bazaar-market:pilot-'+randomBytes(16).toString('hex'),data=new Map(),generationKey=prefix+':offline-generation';data.set(generationKey,'one');let loseDiagnosticFor,blockDiagnosticFor,diagnosticAcksLost=0,diagnosticWritesBlocked=0;
const diagnosticIn=args=>args[7]?JSON.parse(args[7]).state.records.find(r=>r.lastFailure&&[loseDiagnosticFor,blockDiagnosticFor].includes(r.operationId)):undefined;
const redis=capacityRedis({data,beforeEval({args}){const r=diagnosticIn(args);if(r&&r.operationId===blockDiagnosticFor){blockDiagnosticFor=undefined;diagnosticWritesBlocked++;throw Error('SIMULATED_DIAGNOSTIC_WRITE_UNAVAILABLE');}},afterWrite({args}){const r=diagnosticIn(args);if(r&&r.operationId===loseDiagnosticFor){loseDiagnosticFor=undefined;diagnosticAcksLost++;throw Error('SIMULATED_DIAGNOSTIC_ACK_LOST');}}});
const market=createMarketStore(redis,prefix),store=createMarketX402Store(redis,prefix);setMarketStoreForTests(market);setMarketX402StoreForTests(store);
const buyer={role:'agent',ownerId:'ow_'+'b'.repeat(32),workspaceId:randomUUID(),agentId:'agent_'+randomBytes(16).toString('hex'),generation:1};
setWorkspaceStoreForTests({walletIdentity:async p=>({identity:{...p,wallet:null,network:'stellar:testnet'},guard:{keys:[generationKey],values:['one']}}),isOwnerActive:async()=>true,activeOwnerIds:async ids=>new Set(ids),readMarketPermissionSnapshot:async()=>({permission:{allowServiceSubmission:true}}),consumeRequest:async()=>{}});
const payer=Keypair.random(),recipient=Keypair.random(),providerEntries=new Map();await resetSelfListingStateForTests();let nonce=40;
async function prepared(label){
 const id=randomBytes(16).toString('hex'),seller={role:'human',ownerId:'ow_'+id,workspaceId:randomUUID(),agentId:'agent_'+id,generation:1};
 const card={version:'bazaar.service-card/v0',id:'failure-'+label+'-'+id,name:'Synthetic failure diagnostic',description:'Offline safety regression',kind:'http',url:'https://provider.example',routeTemplate:'/v1/marketplace-text',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',identity:{...USDC_TESTNET_PAYMENT_IDENTITY},amount:'0.01',destination:recipient.publicKey(),marketplace:{protocol:MARKET_X402_PROTOCOL,resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Synthetic seller'},tags:['testnet'],delivery:{...syncDeliveryContract(),result:{...syncDeliveryContract().result,contentType:'text/plain'}}};
 const submissionId=randomUUID(),submission=await submitMarketService(seller,{submissionId,card,controlProof:{method:'http-well-known',domain:'provider.example'}});
 await verifySubmissionHttp(submissionId,{lookup:async()=>[{address:'8.8.8.8',family:4}],transport:async()=>({status:200,body:submission.control.expectedRecord})});
 eq((await recordManualReview(submissionId,{decision:'approve',reviewerId:'offline-fixture',reasons:['Failure safety fixture']})).ok,true);await stageApprovedSubmission(submissionId);
 await activateSubmission(submissionId,{configured:()=>true,create:async c=>{const e={id:c.id,card:c,hash:computeCanonicalServiceCardHash(c)};providerEntries.set(c.id,e);return {ok:true,entry:e};},read:async key=>providerEntries.get(key)});
 const time=new Date().toISOString();await reportMarketCapacity({...seller,role:'agent'},{serviceId:card.id,cardHash:computeCanonicalServiceCardHash(card),reportId:randomUUID(),ready:true,day:time.slice(0,10),usedToday:0,observedAt:time});
 const order=await createMarketOrder(buyer,{operationId:randomUUID(),serviceId:card.id,cardHash:computeCanonicalServiceCardHash(card),payer:payer.publicKey(),input:{topic:'SYNTHETIC_PRIVATE_PROMPT'},paymentProtocol:MARKET_X402_PROTOCOL});
 const invocation=new xdr.InvokeContractArgs({contractAddress:new Address(order.settlement.sacContract).toScAddress(),functionName:'transfer',args:[nativeToScVal(order.payer,{type:'address'}),nativeToScVal(order.destination,{type:'address'}),nativeToScVal('100000',{type:'i128'})]}),rootInvocation=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invocation),subInvocations:[]}),credentials=xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({address:new Address(order.payer).toScAddress(),nonce:xdr.Int64.fromString(String(++nonce)),signatureExpirationLedger:200,signature:xdr.ScVal.scvVoid()}));
 const entry=await authorizeEntry(new xdr.SorobanAuthorizationEntry({credentials,rootInvocation}),payer,200,Networks.TESTNET),tx=new TransactionBuilder(new Account(payer.publicKey(),'0'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeHostFunction({func:xdr.HostFunction.hostFunctionTypeInvokeContract(invocation),auth:[entry]})).setTimeout(60).build();tx.sign(payer);
 return {order,tx:tx.toXDR()};
}
async function exercise(label,mode,{loseAck=false,blockWrite=false}={}){
 const f=await prepared(label),calls=[];
 const facilitator=createMarketX402Facilitator({apiKey:'SYNTHETIC_API_KEY',fetcher:async(url,init)=>{calls.push(url);eq(init.redirect,'error');if(url.endsWith('/verify'))return mode==='verify401'?Response.json({error:'RAW_PROVIDER_SECRET_DO_NOT_STORE'},{status:401}):Response.json({isValid:true,payer:payer.publicKey()});throw Error('RAW_PROVIDER_SECRET_NETWORK_MESSAGE');}});
 const deps={store,facilitator,rpc:{async transaction(){throw Error('NO_RPC_FOR_UNCERTAIN_FAILURE');}}};
 const challenge=await executeMarketX402Payment(buyer,f.order.operationId,'https://failure-fixture.example',undefined,deps);eq(challenge.status,402);const required=await challenge.json(),signature=encodePaymentSignatureHeader({x402Version:2,resource:required.resource,accepted:required.accepts[0],payload:{transaction:f.tx}});
 if(loseAck)loseDiagnosticFor=f.order.operationId;if(blockWrite)blockDiagnosticFor=f.order.operationId;
 await reject(()=>executeMarketX402Payment(buyer,f.order.operationId,'https://failure-fixture.example',signature,deps),e=>e.code===(mode==='verify401'?'X402_TRANSPORT_UNCONFIRMED':'X402_PAYMENT_OUTCOME_UNCERTAIN'));
 const record=await store.transact(s=>s.records.find(r=>r.operationId===f.order.operationId));eq(record.phase,'uncertain');eq((await readMarketOrder(buyer,f.order.operationId)).phase,'payment-uncertain');eq(record.transactionHash,undefined);eq(record.outcome,undefined);
 if(!blockWrite){eq(record.lastFailure.stage,mode==='verify401'?'verify':'settle');eq(record.lastFailure.code,mode==='verify401'?'FACILITATOR_HTTP_REJECTED':'FACILITATOR_NETWORK_UNCONFIRMED');eq(record.lastFailure.dispatchStarted,true);eq(record.lastFailure.httpStatus,mode==='verify401'?401:undefined);eq(Number.isFinite(Date.parse(record.lastFailure.at)),true);eq(marketX402PaymentFailureSchema.safeParse(record.lastFailure).success,true);}
 else eq(record.lastFailure,undefined);
 const before=calls.length;await reject(()=>executeMarketX402Payment(buyer,f.order.operationId,'https://failure-fixture.example',signature,deps),e=>e.code==='X402_PAYMENT_OUTCOME_UNCERTAIN');eq(calls.length,before);eq(calls.length,mode==='verify401'?1:2);
 const publicView=JSON.stringify(await listMarketOrders(buyer));eq(publicView.includes('lastFailure'),false);eq(publicView.includes('RAW_PROVIDER_SECRET'),false);eq(JSON.stringify(record.lastFailure??{}).includes(f.tx),false);eq(JSON.stringify(record.lastFailure??{}).includes('SYNTHETIC_API_KEY'),false);
 return record;
}
const failedRecord=await exercise('unauthorized','verify401');await exercise('lost-settle','settleLost');await exercise('diagnostic-ack-loss','verify401',{loseAck:true});eq(diagnosticAcksLost,1);await exercise('diagnostic-write-down','verify401',{blockWrite:true});eq(diagnosticWritesBlocked,1);
const {lastFailure:_diagnostic,...withoutDiagnostic}=failedRecord;eq(maximumSettlementRecordBytes(failedRecord),maximumSettlementRecordBytes(withoutDiagnostic));eq(Buffer.byteLength(JSON.stringify(failedRecord))<=maximumSettlementRecordBytes(failedRecord),true);
// A confirmed facilitator response remains settled if the independent chain
// read fails. Diagnostic persistence must never downgrade or replay settlement.
const chain=await prepared('chain-read-lost');let verifies=0,settles=0,chainReads=0;
const chainDeps={store,facilitator:{async verify(){verifies++;return {isValid:true,payer:payer.publicKey()};},async settle(){settles++;return {success:true,network:'stellar:testnet',transaction:'c'.repeat(64),payer:payer.publicKey()};}},rpc:{async transaction(){chainReads++;return {status:'NOT_FOUND'};}}};
const chainChallenge=await executeMarketX402Payment(buyer,chain.order.operationId,'https://failure-fixture.example',undefined,chainDeps),chainRequired=await chainChallenge.json(),chainSignature=encodePaymentSignatureHeader({x402Version:2,resource:chainRequired.resource,accepted:chainRequired.accepts[0],payload:{transaction:chain.tx}});
await reject(()=>executeMarketX402Payment(buyer,chain.order.operationId,'https://failure-fixture.example',chainSignature,chainDeps),e=>e.code==='X402_PAYMENT_OUTCOME_UNCERTAIN');
const chainRecord=await store.transact(s=>s.records.find(r=>r.operationId===chain.order.operationId));eq(chainRecord.phase,'settled');eq(chainRecord.lastFailure.stage,'chain-confirm');eq(chainRecord.lastFailure.code,'PAYMENT_RUNTIME_UNCONFIRMED');eq(chainRecord.transactionHash,'c'.repeat(64));eq(chainRecord.outcome.success,true);
await reject(()=>executeMarketX402Payment(buyer,chain.order.operationId,'https://failure-fixture.example',chainSignature,chainDeps),e=>e.code==='X402_PAYMENT_OUTCOME_UNCERTAIN');eq([verifies,settles,chainReads],[1,1,1]);
const valid={stage:'verify',code:'FACILITATOR_HTTP_REJECTED',httpStatus:401,dispatchStarted:true,at:new Date().toISOString()};eq(marketX402PaymentFailureSchema.safeParse(valid).success,true);
for(const bad of [{...valid,headers:{authorization:'SECRET'}},{...valid,message:'RAW_SECRET'},{...valid,code:'SECRET_TOKEN'},{...valid,stage:'anything'},{...valid,httpStatus:99},{...valid,dispatchStarted:'yes'},{...valid,at:'bad'}]){eq(marketX402PaymentFailureSchema.safeParse(bad).success,false);}
const state=await store.transact(s=>s),badState=structuredClone(state);badState.records[0].lastFailure={...valid,token:'SECRET'};assert.throws(()=>validateMarketX402State(badState));checks++;
eq(network,0);globalThis.fetch=originalFetch;
console.log(JSON.stringify({status:'PASS_OFFLINE_MARKET_X402_FAILURE_DIAGNOSTICS',checks,networkRequests:0,realRedisWrites:0,realSignatures:0,realPayments:0,syntheticAuthorizationFixtures:true,automaticRetries:0}));
