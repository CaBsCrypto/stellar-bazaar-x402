import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Account,Address,Keypair,Networks,Operation,TransactionBuilder,authorizeEntry,nativeToScVal,xdr} from '@stellar/stellar-sdk';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import {demoConfiguration} from '../lib/demo-configuration.ts';
import {assertMarketPurchaseAdmission,createMarketOrder,readMarketOrder,listMarketOrders,sha,canonical} from '../lib/marketplace.ts';
import {createMarketStore,setMarketStoreForTests} from '../lib/marketplace-store.ts';
import {createMarketX402Store,setMarketX402StoreForTests} from '../lib/marketplace-x402-store.ts';
import {createMarketX402Challenge,executeMarketX402Payment,marketX402OrderBinding,marketX402Authorization,reconcileMarketX402Payment} from '../lib/marketplace-x402.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {capacityRedis} from './fixtures/market-capacity-redis.mjs';
import {orderMemo} from '../lib/marketplace-identity.ts';

const prior={...process.env},id=randomBytes(16).toString('hex'),origin='https://stellar-bazaar-x402-synthetic.vercel.app';
const environment={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:new URL(origin).hostname,
 BAZAAR_PUBLIC_DEMO:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_X402_MARKETPLACE_ENABLED:'true',BAZAAR_WORKSPACE_ADMISSION:'open',
 BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_REDIS_REST_URL:'https://synthetic.upstash.io',BAZAAR_WORKSPACE_REDIS_REST_TOKEN:'synthetic-credential',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'vercel-preview',BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',BAZAAR_DEMO_NAMESPACE_ENV:'preview',
 BAZAAR_WORKSPACE_PREFIX:'bazaar-workspace:pilot-'+id,BAZAAR_MARKET_PREFIX:'bazaar-market:pilot-'+id,BAZAAR_REVIEW_PREFIX:'bazaar-review:pilot-'+id,BAZAAR_MARKET_FILE_PREFIX:'market-deliveries/v1/preview/'+id,STELLAR_X402_FACILITATOR_URL:'https://channels.openzeppelin.com/x402/testnet',STELLAR_X402_FACILITATOR_API_KEY:'synthetic-facilitator-credential',X402_ENABLE_LOCAL_PAYER:'false'};
const redis=capacityRedis(),market=createMarketStore(redis,environment.BAZAAR_MARKET_PREFIX),settlements=createMarketX402Store(redis,environment.BAZAAR_MARKET_PREFIX);
const buyer={role:'agent',ownerId:'ow_'+'b'.repeat(32),agentId:'buyer-fixture',workspaceId:randomUUID(),generation:1},seller='ow_'+'a'.repeat(32);
const payer=Keypair.random(),destination=Keypair.random();
const card={version:'bazaar.service-card/v0',id:'admission-fixture',name:'Admission fixture',description:'Offline positive admission contract.',kind:'http',url:'https://synthetic-provider.invalid',routeTemplate:'/text',input:[{name:'prompt',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',identity:USDC_TESTNET_PAYMENT_IDENTITY,amount:'0.01',destination:destination.publicKey(),marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Fixture'},tags:['testnet'],delivery:{...syncDeliveryContract(),result:{...syncDeliveryContract().result,contentType:'text/plain'}}};
function order(){const time=new Date().toISOString(),input={prompt:'Synthetic admission request'},operationId=randomUUID(),cardHash=computeCanonicalServiceCardHash(card);return {operationId,buyerOwnerId:buyer.ownerId,sellerOwnerId:seller,serviceId:card.id,cardHash,card,input,inputHash:sha(canonical(input)),payer:payer.publicKey(),destination:destination.publicKey(),amount:card.payment.amount,settlement:{...USDC_TESTNET_PAYMENT_IDENTITY},paymentProtocol:'x402-stellar-exact-v2',memoHash:orderMemo(buyer.ownerId,operationId,cardHash,input),phase:'awaiting-payment',createdAt:time,updatedAt:time};}
const intent=o=>({operationId:o.operationId,serviceId:o.serviceId,cardHash:o.cardHash,payer:o.payer,input:o.input,paymentProtocol:o.paymentProtocol});
function configure(patch={}){for(const key of Object.keys(process.env))if(/^(BAZAAR_|STELLAR_X402_|VERCEL|X402_)/.test(key))delete process.env[key];Object.assign(process.env,environment);for(const[key,value]of Object.entries(patch)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
let effects=0;
const deps={store:settlements,facilitator:{async verify(){effects++;throw Error('No facilitator calls allowed');},async settle(){effects++;throw Error('No settlement calls allowed');}},rpc:{async transaction(){effects++;throw Error('No ledger calls allowed');}}};
async function transaction(o){
 const invocation=new xdr.InvokeContractArgs({contractAddress:new Address(o.settlement.sacContract).toScAddress(),functionName:'transfer',args:[nativeToScVal(o.payer,{type:'address'}),nativeToScVal(o.destination,{type:'address'}),nativeToScVal('100000',{type:'i128'})]});
 const rootInvocation=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invocation),subInvocations:[]});
 const credentials=xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({address:new Address(o.payer).toScAddress(),nonce:xdr.Int64.fromString('43'),signatureExpirationLedger:200,signature:xdr.ScVal.scvVoid()}));
 const entry=await authorizeEntry(new xdr.SorobanAuthorizationEntry({credentials,rootInvocation}),payer,200,Networks.TESTNET);
 const tx=new TransactionBuilder(new Account(payer.publicKey(),'0'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeHostFunction({func:xdr.HostFunction.hostFunctionTypeInvokeContract(invocation),auth:[entry]})).setTimeout(60).build();tx.sign(payer);return tx;
}
try{
 configure();setMarketStoreForTests(market);setMarketX402StoreForTests(settlements);
 assert.equal(demoConfiguration().features.purchases.enabled,true);assertMarketPurchaseAdmission();
 for(const name of ['BAZAAR_WORKSPACE_PREFIX','BAZAAR_MARKET_PREFIX','BAZAAR_REVIEW_PREFIX','BAZAAR_MARKET_FILE_PREFIX']){configure({[name]:environment[name].replace(id,'e'.repeat(32))});assert.equal(demoConfiguration().checks.namespaceFamilyMatches,false);await assert.rejects(createMarketOrder(buyer,intent(order())),e=>e.code==='X402_CONFIGURATION_INCOMPLETE'&&e.status===503);}configure();
 const pending=order();await market.transact(s=>s.orders.push(pending));
 const challenged=order();await market.transact(s=>s.orders.push(challenged));
 const challenge=createMarketX402Challenge(challenged,origin);
 await settlements.transact(s=>s.records.push({operationId:challenged.operationId,buyerOwnerId:buyer.ownerId,orderBinding:marketX402OrderBinding(challenged),challenge,phase:'challenged',createdAt:challenged.createdAt,updatedAt:challenged.updatedAt}));
 const tx=await transaction(challenged),signature=encodePaymentSignatureHeader({x402Version:2,resource:challenge.resource,accepted:challenge.accepts[0],payload:{transaction:tx.toXDR()}});
 for(const patch of [{STELLAR_X402_FACILITATOR_API_KEY:undefined},{STELLAR_X402_FACILITATOR_URL:undefined},{STELLAR_X402_FACILITATOR_URL:'https://channels.openzeppelin.com/x402/mainnet'},{STELLAR_X402_FACILITATOR_API_KEY:'invalid\ncredential'},{STELLAR_X402_FACILITATOR_API_KEY:'x'.repeat(1025)},{STELLAR_X402_RPC_URL:'https://soroban.stellar.org'},{X402_ENABLE_LOCAL_PAYER:'true'}]){
  configure(patch);assert.equal(demoConfiguration().features.purchases.enabled,false);
  await assert.rejects(createMarketOrder(buyer,intent(order())),e=>e.code==='X402_CONFIGURATION_INCOMPLETE'&&e.status===503);
  await assert.rejects(executeMarketX402Payment(buyer,pending.operationId,origin,undefined,deps),e=>e.code==='X402_CONFIGURATION_INCOMPLETE'&&e.status===503);
  assert.equal(await settlements.transact(s=>s.records.some(r=>r.operationId===pending.operationId)),false,'Missing effective config cannot reserve challenge state');
  await assert.rejects(executeMarketX402Payment(buyer,challenged.operationId,origin,signature,deps),e=>e.code==='X402_CONFIGURATION_INCOMPLETE'&&e.status===503);
  const untouched=await settlements.transact(s=>s.records.find(r=>r.operationId===challenged.operationId));assert.equal(untouched.phase,'challenged');assert.equal(untouched.payloadHash,undefined);assert.equal(untouched.authorizationFingerprint,undefined);
  assert.equal((await createMarketOrder(buyer,intent(pending))).operationId,pending.operationId,'Existing order replay precedes new purchase admission');
  assert.equal((await executeMarketX402Payment(buyer,challenged.operationId,origin,undefined,deps)).status,402,'Existing immutable challenge remains recoverable');
 }
 configure({BAZAAR_ENABLE_MARKET_PURCHASES:'false',BAZAAR_X402_MARKETPLACE_ENABLED:'false',STELLAR_X402_FACILITATOR_API_KEY:undefined});
 assert.equal((await createMarketOrder(buyer,intent(pending))).operationId,pending.operationId);assert.equal((await readMarketOrder(buyer,pending.operationId)).phase,'awaiting-payment');assert.equal((await listMarketOrders(buyer)).length,2);
 const proof=marketX402Authorization(tx.toXDR(),challenged),attemptId=randomUUID();
 await market.transact(s=>{const o=s.orders.find(v=>v.operationId===challenged.operationId);o.phase='payment-uncertain';o.settlementAttemptId=attemptId;o.transactionHash=proof.transactionHash;});
 await settlements.transact(s=>{const r=s.records.find(v=>v.operationId===challenged.operationId),payload={x402Version:2,resource:challenge.resource,accepted:challenge.accepts[0],payload:{transaction:tx.toXDR()}};Object.assign(r,{phase:'confirmed',attemptId,payload,payloadHash:sha(canonical(payload)),authorizationFingerprint:proof.fingerprint,transactionHash:proof.transactionHash,outcome:{success:true,network:'stellar:testnet',payer:challenged.payer,transaction:proof.transactionHash}});});
 assert.equal((await reconcileMarketX402Payment(buyer,challenged.operationId,deps)).phase,'paid','Confirmed payment finalization survives disabled purchases and unavailable facilitator');
 assert.equal((await executeMarketX402Payment(buyer,challenged.operationId,origin,signature,deps)).status,202,'Confirmed proof replay survives admission closure');
 assert.equal(effects,0);
 console.log(JSON.stringify({status:'PASS',externalRequests:0,payments:0,checks:['effective hosted purchase config guards fresh order/challenge/proof','missing or malformed facilitator and non-Testnet RPC rejected','first authorization not consumed on unavailable configuration','existing order and immutable challenge remain recoverable','confirmed proof replay and reconciliation work with closed flags','no facilitator or ledger call']}));
}finally{setMarketStoreForTests(undefined);setMarketX402StoreForTests(undefined);for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);}
