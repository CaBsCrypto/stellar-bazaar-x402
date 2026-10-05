import assert from 'node:assert/strict';
import {decodePaymentSignatureHeader,encodePaymentSignatureHeader,decodePaymentResponseHeader} from '@x402/core/http';
import {buyerCanonical} from '../examples/marketplace-x402-buyer.mjs';
import {toolBody} from '../examples/private-mcp-client.mjs';

const same=(a,b)=>buyerCanonical(a)===buyerCanonical(b);
const payloadCases=intent=>[
 ['price','amount',String(BigInt(intent.signedPayload.accepted.amount)+1n)],
 ['recipient','payTo',intent.payer],
 ['asset','asset',intent.payer],
 ['network','network','stellar:pubnet']
].map(([name,field,value])=>{const payload=structuredClone(intent.signedPayload);assert.notEqual(payload.accepted[field],value);payload.accepted[field]=value;return {name,payload};});
const changedInput=create=>({...structuredClone(create),input:{...structuredClone(create.input),topic:create.input.topic+' [alterado]'}});

/** Only exact, already-paid intents can use cheaper replay/rejection profiles. */
export function contractRequestProfile({intent,create,order},input,init={}){
 assert.equal(intent.phase,'paid');assert.equal(order.operationId,intent.operationId);assert.equal(create.operationId,intent.operationId);
 assert.ok(['delivered','delivery-failed'].includes(order.phase));assert.equal(order.transactionHash,intent.receipt.transaction);
 const url=new URL(input instanceof Request?input.url:String(input));
 assert.equal(url.origin,intent.origin);assert.equal(url.search,'');assert.equal(url.hash,'');assert.equal(url.username,'');assert.equal(url.password,'');
 assert.equal(String(init.method??'GET').toUpperCase(),'POST');
 const body=JSON.parse(init.body);
 if(url.pathname==='/api/market/orders'){
  assert.equal(new Headers(init.headers).has('payment-signature'),false);
  if(same(body,create))return 'api:orders:replay';
  assert.ok(same(body,changedInput(create)),'UNPLANNED_ORDER_MUTATION');return 'api:orders:reject-content';
 }
 assert.equal(url.pathname,'/api/market/orders/'+intent.operationId+'/x402');assert.deepEqual(body,{});
 const signature=new Headers(init.headers).get('payment-signature');assert.ok(signature&&Buffer.byteLength(signature)<=32768);
 if(signature===intent.paymentSignature)return 'api:x402:replay';
 const payload=decodePaymentSignatureHeader(signature);
 assert.ok(payloadCases(intent).some(c=>same(c.payload,payload)),'UNPLANNED_PAYMENT_MUTATION');
 return 'api:x402:reject-requirements';
}

function noExecution(response){
 assert.equal(response.headers.get('x-bazaar-acceptance-meter'),'v2');
 for(const kind of ['facilitator','rpc','provider'])assert.equal(response.headers.get('x-bazaar-external-'+kind),'0','REPLAY_OR_REJECTION_EXECUTED:'+kind);
}

/** Controlled duplicate requests, never a new signature or provider invocation. */
export async function verifyHostedBuyerContracts({intent,create,order,fetcher,agentToken,includeMutations}){
 const context={intent,create,order},headers={authorization:'Bearer '+agentToken,'content-type':'application/json'};
 const send=async(path,body,extra={})=>{
  const input=intent.origin+path,init={method:'POST',headers:{...headers,...extra},body:JSON.stringify(body),redirect:'error'};
  contractRequestProfile(context,input,init);const response=await fetcher(input,init);noExecution(response);return response;
 };
 const checked=[];
 if(includeMutations){
  for(const c of payloadCases(intent)){
   const response=await send('/api/market/orders/'+intent.operationId+'/x402',{}, {'payment-signature':encodePaymentSignatureHeader(c.payload)});
   assert.equal(response.status,402);const body=await response.json();assert.equal(body.error?.code,'X402_PAYMENT_REQUIREMENTS_MISMATCH');checked.push(c.name);
  }
  const rejected=await send('/api/market/orders',changedInput(create));assert.equal(rejected.status,409);assert.equal((await rejected.json()).error?.code,'OPERATION_CONFLICT');checked.push('content');
 }
 const replayedCreate=await send('/api/market/orders',create);assert.equal(replayedCreate.status,201);assert.deepEqual((await replayedCreate.json()).order,order);
 const replayedPay=await send('/api/market/orders/'+intent.operationId+'/x402',{}, {'payment-signature':intent.paymentSignature});
 assert.equal(replayedPay.status,order.delivery?200:202);assert.deepEqual((await replayedPay.json()).order,order);
 assert.deepEqual(decodePaymentResponseHeader(replayedPay.headers.get('payment-response')),intent.receipt);
 return {operationId:intent.operationId,mutationsRejected:checked,createReplayExact:true,paymentReplayExact:true,additionalExternalExecutions:0};
}

export async function verifyHostedSellerReplays({worker,order,client,failureReason}){
 const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:12000});assert.ok(!result.isError);assert.deepEqual(toolBody(result).order,order);};
 await call('claim_market_order',{operationId:worker.operationId,attemptId:worker.attemptId});
 if(order.phase==='delivered')await call('deliver_market_order',{operationId:worker.operationId,attemptId:worker.attemptId,text:worker.text});
 else {assert.equal(order.phase,'delivery-failed');await call('fail_market_order',{operationId:worker.operationId,attemptId:worker.attemptId,reason:failureReason});}
 return {operationId:worker.operationId,claimReplayExact:true,terminalReplayExact:true};
}
