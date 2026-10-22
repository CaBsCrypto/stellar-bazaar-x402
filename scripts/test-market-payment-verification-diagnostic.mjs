import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Account,Address,Keypair,Networks,Operation,TransactionBuilder,authorizeEntry,nativeToScVal,xdr} from '@stellar/stellar-sdk';
import {inspectMarketPaymentVerification,createMarketX402Challenge,marketX402OrderBinding,marketX402Authorization,createMarketX402Facilitator,MARKET_X402_PROTOCOL} from '../lib/marketplace-x402.ts';
import {canonical,sha} from '../lib/marketplace-identity.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const originalFetch=globalThis.fetch;let networkRequests=0;globalThis.fetch=async()=>{networkRequests++;throw Error('OFFLINE_NETWORK_DENIED');};
const payer=Keypair.random(),recipient=Keypair.random(),origin='https://verification-fixture.example',id=randomUUID(),owner='ow_'+'b'.repeat(32),at=new Date().toISOString();
const order={operationId:id,buyerOwnerId:owner,sellerOwnerId:'ow_'+'a'.repeat(32),serviceId:'synthetic-service',cardHash:'c'.repeat(64),input:{topic:'PRIVATE_PROMPT_DO_NOT_EMIT'},inputHash:sha(canonical({topic:'PRIVATE_PROMPT_DO_NOT_EMIT'})),payer:payer.publicKey(),destination:recipient.publicKey(),amount:'0.01',settlement:{...USDC_TESTNET_PAYMENT_IDENTITY},paymentProtocol:MARKET_X402_PROTOCOL,phase:'payment-uncertain',createdAt:at,updatedAt:at};
const invocation=new xdr.InvokeContractArgs({contractAddress:new Address(order.settlement.sacContract).toScAddress(),functionName:'transfer',args:[nativeToScVal(order.payer,{type:'address'}),nativeToScVal(order.destination,{type:'address'}),nativeToScVal('100000',{type:'i128'})]}),rootInvocation=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invocation),subInvocations:[]}),credentials=xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({address:new Address(order.payer).toScAddress(),nonce:xdr.Int64.fromString('100'),signatureExpirationLedger:200,signature:xdr.ScVal.scvVoid()}));
const entry=await authorizeEntry(new xdr.SorobanAuthorizationEntry({credentials,rootInvocation}),payer,200,Networks.TESTNET),tx=new TransactionBuilder(new Account(payer.publicKey(),'0'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeHostFunction({func:xdr.HostFunction.hostFunctionTypeInvokeContract(invocation),auth:[entry]})).setTimeout(60).build();tx.sign(payer);
const challenge=createMarketX402Challenge(order,origin),payload={x402Version:2,resource:challenge.resource,accepted:challenge.accepts[0],payload:{transaction:tx.toXDR()}},authorization=marketX402Authorization(tx.toXDR(),order);
const record={operationId:id,buyerOwnerId:owner,orderBinding:marketX402OrderBinding(order),challenge,phase:'uncertain',createdAt:at,updatedAt:at,attemptId:randomUUID(),payload,payloadHash:sha(canonical(payload)),authorizationFingerprint:authorization.fingerprint};order.settlementAttemptId=record.attemptId;
function fixture(reply={isValid:true,payer:payer.publicKey()}){
 const market={version:1,orders:[structuredClone(order)]},ledger={version:1,records:[structuredClone(record)]},original={market:structuredClone(market),ledger:structuredClone(ledger)};let marketReads=0,ledgerReads=0,verifyCalls=0,settleCalls=0,rpcCalls=0;
 const read=(state,count)=>({async transact(callback){count();const before=structuredClone(state),result=callback(state);eq(state,before);return structuredClone(result);}});
 const deps={marketStore:read(market,()=>marketReads++),store:read(ledger,()=>ledgerReads++),now:()=>Date.parse(at),facilitator:{async verify(p,r){verifyCalls++;eq(p,payload);eq(r,challenge.accepts[0]);p.resource.description='MUTATED_CLONE';r.amount='999999';return reply;},async settle(){settleCalls++;throw Error('SETTLEMENT_FORBIDDEN');}},rpc:{async transaction(){rpcCalls++;throw Error('RPC_FORBIDDEN');}}};
 return {market,ledger,original,deps,invoke:operation=>inspectMarketPaymentVerification(operation??id,deps),counts:()=>({marketReads,ledgerReads,verifyCalls,settleCalls,rpcCalls}),checkUnchanged:()=>{eq({market,ledger},original);eq(settleCalls,0);eq(rpcCalls,0);}};
}
const good=fixture(),result=await good.invoke();eq(result.stage,'verify');eq(result.code,'FACILITATOR_VERIFY_VALID');eq(result.isValid,true);eq(result.payerMatches,true);eq(result.verificationOnly,true);eq(result.paymentOutcomeConfirmed,false);eq(result.newPayments,0);eq(result.stateWrites,0);eq(result.settlementCalls,0);eq(result.signatures,0);eq(good.counts().verifyCalls,1);good.checkUnchanged();
for(const value of [tx.toXDR(),owner,'PRIVATE_PROMPT_DO_NOT_EMIT'])eq(JSON.stringify(result).includes(value),false);
const rejected=fixture({isValid:false,payer:payer.publicKey(),invalidReason:'PRIVATE_REMOTE_DETAIL',invalidMessage:'PRIVATE_UPSTREAM_SECRET'}),rejection=await rejected.invoke();eq(rejection.code,'FACILITATOR_VERIFY_REJECTED');eq(rejection.isValid,false);eq(rejection.paymentOutcomeConfirmed,false);eq(JSON.stringify(rejection).includes('PRIVATE_'),false);rejected.checkUnchanged();
const wrongPayer=fixture({isValid:true,payer:recipient.publicKey()}),wrong=await wrongPayer.invoke();eq(wrong.payerMatches,false);eq(wrong.paymentOutcomeConfirmed,false);wrongPayer.checkUnchanged();
const unauthorized=fixture();let upstream=0;unauthorized.deps.facilitator=createMarketX402Facilitator({apiKey:'SYNTHETIC_PRIVATE_API_KEY',fetcher:async()=>{upstream++;return Response.json({error:'PRIVATE_UPSTREAM_SECRET'},{status:401});}});const denied=await unauthorized.invoke();eq(denied.code,'FACILITATOR_HTTP_REJECTED');eq(denied.httpStatus,401);eq(denied.verificationOnly,true);eq(denied.paymentOutcomeConfirmed,false);eq(upstream,1);eq(JSON.stringify(denied).includes('PRIVATE'),false);unauthorized.checkUnchanged();
for(const mutation of [
 x=>x.market.orders=[],x=>x.ledger.records=[],
 x=>x.market.orders[0].operationId=randomUUID(),x=>x.ledger.records[0].operationId=randomUUID(),
 x=>x.ledger.records[0].buyerOwnerId='ow_'+'f'.repeat(32),
 x=>x.ledger.records[0].orderBinding='f'.repeat(64),
 x=>x.ledger.records[0].payloadHash='f'.repeat(64),
 x=>x.ledger.records[0].authorizationFingerprint='f'.repeat(64),
 x=>x.ledger.records[0].payload.accepted.amount='200000',
 x=>x.ledger.records[0].payload.resource.url=origin+'/foreign',
 x=>x.ledger.records[0].payload.payload.transaction='INVALID_XDR',
 x=>x.ledger.records[0].phase='confirmed',x=>x.ledger.records[0].phase='rejected',
 x=>x.market.orders[0].transactionHash='f'.repeat(64),
 x=>x.market.orders[0].paymentVerifiedAt=at
]){const x=fixture();mutation(x);let outcome;try{outcome=await x.invoke();}catch{}eq(x.counts().verifyCalls,0);eq(x.counts().settleCalls,0);if(outcome)eq(['FACILITATOR_VERIFY_VALID','FACILITATOR_VERIFY_REJECTED'].includes(outcome.code),false);}
for(const operation of ['not-uuid','31c97193-be74-1b9d-b0a3-f3890b0a41e8']){const x=fixture();try{await x.invoke(operation);}catch{}eq(x.counts().verifyCalls,0);eq(x.counts().marketReads,0);eq(x.counts().ledgerReads,0);}
for(const phase of ['verifying','settling']){const x=fixture();x.ledger.records[0].phase=phase;x.original.ledger.records[0].phase=phase;eq((await x.invoke()).code,'FACILITATOR_VERIFY_VALID');eq(x.counts().verifyCalls,1);x.checkUnchanged();}
eq(networkRequests,0);globalThis.fetch=originalFetch;
console.log(JSON.stringify({status:'PASS_OFFLINE_EXISTING_MARKET_PAYMENT_VERIFICATION_DIAGNOSTIC',checks,networkRequests:0,realRedisWrites:0,realSignatures:0,realPayments:0,syntheticSignedAuthorization:true,stateWrites:0,settlementCalls:0,rpcCalls:0}));
