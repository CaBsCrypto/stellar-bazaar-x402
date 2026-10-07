import {randomUUID} from 'node:crypto';
import {Address,FeeBumpTransaction,Keypair,Networks,StrKey,TransactionBuilder,hash,scValToNative,xdr} from '@stellar/stellar-sdk';
import {decodePaymentSignatureHeader,encodePaymentRequiredHeader,encodePaymentResponseHeader} from '@x402/core/http';
import type {PaymentPayload,PaymentRequired,PaymentRequirements,SettleResponse,VerifyResponse} from '@x402/core/types';
import {z} from 'zod';
import {canonical,sha} from './marketplace-identity.ts';
import {configuredMarketStore,type MarketOrder} from './marketplace-store.ts';
import {readMarketOrder,assertMarketEnabled} from './marketplace.ts';
import {isCanonicalUsdcTestnet} from './payment-assets.ts';
import {decimalToAtomic} from './operation-history-client.ts';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {authenticateWorkspaceRequest,parseWorkspaceBody,workspaceFailure,workspaceHeaders,workspaceRequestOrigin} from './workspace-http.ts';
import {configuredMarketX402Store,type MarketX402Settlement,type MarketX402Store} from './marketplace-x402-store.ts';
import {meteredExternal} from './acceptance-meter.ts';

export const MARKET_X402_PROTOCOL='x402-stellar-exact-v2' as const;
export const MARKET_X402_FACILITATOR='https://channels.openzeppelin.com/x402/testnet';
export const MARKET_X402_RPC='https://soroban-testnet.stellar.org';
const maximumHeaderBytes=32768,maximumResponseBytes=131072;
export interface MarketX402Facilitator{
 verify(payload:PaymentPayload,requirements:PaymentRequirements):Promise<VerifyResponse>;
 settle(payload:PaymentPayload,requirements:PaymentRequirements):Promise<SettleResponse>;
}
export interface MarketX402Rpc{transaction(transactionHash:string):Promise<{status:string;envelopeXdr?:string}>}
export interface MarketX402Dependencies{store:MarketX402Store;facilitator:MarketX402Facilitator;rpc:MarketX402Rpc}

/** An exact-host transport invocation. No SDK redirect, retry or polling defaults. */
async function boundedJson(kind:'facilitator'|'rpc',url:string,body:unknown,headers:Record<string,string>,fetcher:typeof fetch){
 const raw=JSON.stringify(body);if(Buffer.byteLength(raw)>65536)throw new WorkspaceError('X402_REQUEST_TOO_LARGE',413);
 let incoming=0;const outgoing=Buffer.byteLength(raw)+Object.entries(headers).reduce((n,[k,v])=>n+Buffer.byteLength(k+': '+v+'\r\n'),0);
 return meteredExternal(kind,async()=>{
  const response=await fetcher(url,{method:'POST',headers,body:raw,redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(response.redirected||(response.url&&response.url!==new URL(url).href))throw new WorkspaceError('X402_TRANSPORT_UNCONFIRMED',409);
  const parts:Uint8Array[]=[];for(const[k,v]of response.headers)incoming+=Buffer.byteLength(k+': '+v+'\r\n');
  const reader=response.body?.getReader();if(!reader)throw new WorkspaceError('X402_TRANSPORT_UNCONFIRMED',409);
  try{if(incoming>maximumResponseBytes){await reader.cancel();throw new WorkspaceError('X402_RESPONSE_TOO_LARGE',409);}for(;;){const part=await reader.read();if(part.done)break;incoming+=part.value.byteLength;if(incoming>maximumResponseBytes){await reader.cancel();throw new WorkspaceError('X402_RESPONSE_TOO_LARGE',409);}parts.push(part.value);}}finally{reader.releaseLock();}
  if(!response.ok)throw new WorkspaceError('X402_TRANSPORT_UNCONFIRMED',409);
  try{return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;}catch{throw new WorkspaceError('X402_RESPONSE_INVALID',409);}
 },{origin:new URL(url).origin,path:new URL(url).pathname,method:'POST'},()=>({outboundBytes:outgoing,inboundBytes:incoming}));
}
export function createMarketX402Facilitator({apiKey,url=MARKET_X402_FACILITATOR,fetcher=fetch}:{apiKey:string;url?:string;fetcher?:typeof fetch}):MarketX402Facilitator{
 if(url!==MARKET_X402_FACILITATOR||!apiKey||apiKey.length>1024||/[\r\n]/.test(apiKey))throw new WorkspaceError('X402_FACILITATOR_CONFIGURATION_REQUIRED');
 const send=async(action:'verify'|'settle',payload:PaymentPayload,requirements:PaymentRequirements)=>boundedJson('facilitator',url+'/'+action,{x402Version:2,paymentPayload:payload,paymentRequirements:requirements},{'content-type':'application/json',authorization:'Bearer '+apiKey},fetcher);
 return {verify:async(p,r)=>{const result=await send('verify',p,r) as VerifyResponse;if(!result||typeof result.isValid!=='boolean')throw new WorkspaceError('X402_RESPONSE_INVALID',409);return result;},settle:async(p,r)=>{const result=await send('settle',p,r) as SettleResponse;if(!result||typeof result.success!=='boolean')throw new WorkspaceError('X402_RESPONSE_INVALID',409);return result;}};
}
export function createMarketX402Rpc({url=MARKET_X402_RPC,fetcher=fetch}:{url?:string;fetcher?:typeof fetch}={}):MarketX402Rpc{
 if(url!==MARKET_X402_RPC)throw new WorkspaceError('X402_RPC_CONFIGURATION_REQUIRED');
 return {async transaction(transactionHash){
  if(!/^[a-f0-9]{64}$/.test(transactionHash))throw new WorkspaceError('INVALID_TRANSACTION',400);
  const response=await boundedJson('rpc',url,{jsonrpc:'2.0',id:'market-x402-read',method:'getTransaction',params:{hash:transactionHash}},{'content-type':'application/json'},fetcher) as {jsonrpc?:string;id?:string;error?:unknown;result?:{status?:string;envelopeXdr?:string}};
  if(response.jsonrpc!=='2.0'||response.id!=='market-x402-read'||response.error||typeof response.result?.status!=='string')throw new WorkspaceError('X402_RPC_RESPONSE_INVALID',409);
  return {status:response.result.status,envelopeXdr:response.result.envelopeXdr};
 }};
}
let injected:Partial<MarketX402Dependencies>|undefined;
export function setMarketX402DependenciesForTests(value:Partial<MarketX402Dependencies>|undefined){injected=value;}
function dependencies():MarketX402Dependencies{return {
 store:injected?.store??configuredMarketX402Store(),
 facilitator:injected?.facilitator??{
  verify:(p,r)=>createMarketX402Facilitator({apiKey:process.env.STELLAR_X402_FACILITATOR_API_KEY?.trim()??'',url:process.env.STELLAR_X402_FACILITATOR_URL??MARKET_X402_FACILITATOR}).verify(p,r),
  settle:(p,r)=>createMarketX402Facilitator({apiKey:process.env.STELLAR_X402_FACILITATOR_API_KEY?.trim()??'',url:process.env.STELLAR_X402_FACILITATOR_URL??MARKET_X402_FACILITATOR}).settle(p,r)},
 rpc:injected?.rpc??{transaction:hash=>createMarketX402Rpc({url:process.env.STELLAR_X402_RPC_URL??MARKET_X402_RPC}).transaction(hash)}};}
function buyer(p:WorkspacePrincipal,o:MarketOrder){if(!['human','agent'].includes(p.role)||p.ownerId!==o.buyerOwnerId)throw new WorkspaceError('FORBIDDEN',403);if(o.paymentProtocol!==MARKET_X402_PROTOCOL||!isCanonicalUsdcTestnet(o.settlement)||o.inputHash!==sha(canonical(o.input)))throw new WorkspaceError('PAYMENT_PROTOCOL_MISMATCH',409);}
export function marketX402OrderBinding(o:MarketOrder){return sha(canonical({operationId:o.operationId,owner:o.buyerOwnerId,protocol:o.paymentProtocol,cardHash:o.cardHash,inputHash:o.inputHash,payer:o.payer,destination:o.destination,amount:o.amount,settlement:o.settlement}));}
export function createMarketX402Challenge(o:MarketOrder,origin:string):PaymentRequired{
 const base=new URL(origin);if(base.origin!==origin||base.username||base.password||base.search||base.hash||!(base.protocol==='https:'||base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))throw new WorkspaceError('INVALID_REQUEST',400);
 if(o.paymentProtocol!==MARKET_X402_PROTOCOL||!isCanonicalUsdcTestnet(o.settlement)||!o.inputHash)throw new WorkspaceError('PAYMENT_PROTOCOL_MISMATCH',409);
 const route=`/api/market/orders/${o.operationId}/x402`,resourceUrl=origin+route;
 return {x402Version:2,resource:{url:resourceUrl,description:'Paid marketplace order; text delivery is retrieved from the private order history.',mimeType:'application/json'},accepts:[{scheme:'exact',network:'stellar:testnet',asset:o.settlement.sacContract,amount:decimalToAtomic(o.amount),payTo:o.destination,maxTimeoutSeconds:60,extra:{areFeesSponsored:true,resourceUrl,method:'POST',route,inputHash:o.inputHash,operationId:o.operationId,cardHash:o.cardHash}}]};
}

/** Fingerprint actual credentials/nonce, independent of mutable x402 metadata. */
export function marketX402Authorization(xdrString:string,o:MarketOrder,submitted=false){
 try{
  if(!xdrString||Buffer.byteLength(xdrString)>24000)throw Error();
  const envelope=TransactionBuilder.fromXDR(xdrString,Networks.TESTNET);
  if(envelope instanceof FeeBumpTransaction&&!submitted)throw Error();
  const tx=envelope instanceof FeeBumpTransaction?envelope.innerTransaction:envelope,op=tx.operations[0];
  if(tx.operations.length!==1||op.type!=='invokeHostFunction'||op.func.switch().name!=='hostFunctionTypeInvokeContract'||op.auth?.length!==1||!isCanonicalUsdcTestnet(o.settlement))throw Error();
  const invocation=op.func.invokeContract(),args=invocation.args();
  if(Address.fromScAddress(invocation.contractAddress()).toString()!==o.settlement.sacContract||invocation.functionName().toString()!=='transfer'||args.length!==3||scValToNative(args[0])!==o.payer||scValToNative(args[1])!==o.destination||BigInt(scValToNative(args[2]))!==BigInt(decimalToAtomic(o.amount)))throw Error();
  const auth=op.auth![0];if(auth.credentials().switch().name!=='sorobanCredentialsAddress'||auth.rootInvocation().subInvocations().length!==0||auth.rootInvocation().function().switch().name!=='sorobanAuthorizedFunctionTypeContractFn'||auth.rootInvocation().function().contractFn().toXDR('base64')!==invocation.toXDR('base64'))throw Error();
  const credentials=auth.credentials().address();if(Address.fromScAddress(credentials.address()).toString()!==o.payer||credentials.signatureExpirationLedger()<=0)throw Error();
  const signatures=scValToNative(credentials.signature()) as Array<{public_key:Uint8Array;signature:Uint8Array}>;
  if(!Array.isArray(signatures)||signatures.length<1||signatures.length>20)throw Error();
  const preimage=xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({networkId:hash(Buffer.from(Networks.TESTNET)),nonce:credentials.nonce(),invocation:auth.rootInvocation(),signatureExpirationLedger:credentials.signatureExpirationLedger()}));
  for(const signature of signatures){if(!signature.public_key||!signature.signature||!Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(Buffer.from(signature.public_key))).verify(hash(preimage.toXDR()),Buffer.from(signature.signature)))throw Error();}
  return {fingerprint:sha(canonical({network:'stellar:testnet',payer:o.payer,nonce:credentials.nonce().toString()})),transactionHash:envelope.hash().toString('hex')};
 }catch{throw new WorkspaceError('X402_AUTHORIZATION_MISMATCH',402);}
}
function parseProof(signature:string,record:MarketX402Settlement,o:MarketOrder){
 try{
  if(!signature||Buffer.byteLength(signature)>maximumHeaderBytes)throw Error();
  const payload=decodePaymentSignatureHeader(signature);
  if(payload.x402Version!==2||canonical(payload.accepted)!==canonical(record.challenge.accepts[0])||canonical(payload.resource)!==canonical(record.challenge.resource)||!payload.payload||Object.keys(payload.payload).sort().join(',')!=='transaction'||typeof payload.payload.transaction!=='string')throw Error();
  const authorization=marketX402Authorization(payload.payload.transaction,o);
  return {payload,payloadHash:sha(canonical(payload)),authorizationFingerprint:authorization.fingerprint};
 }catch(e){if(e instanceof WorkspaceError)throw e;throw new WorkspaceError('X402_PAYMENT_REQUIREMENTS_MISMATCH',402);}
}
function assertRecordBinding(record:MarketX402Settlement,o:MarketOrder){
 try{if(record.buyerOwnerId!==o.buyerOwnerId||record.orderBinding!==marketX402OrderBinding(o)||canonical(record.challenge)!==canonical(createMarketX402Challenge(o,new URL(record.challenge.resource.url).origin)))throw Error();}catch{throw new WorkspaceError('X402_SETTLEMENT_BINDING_MISMATCH',409);}
}
async function boundRecord(store:MarketX402Store,o:MarketOrder){const record=await store.transact(s=>s.records.find(r=>r.operationId===o.operationId));if(!record)throw new WorkspaceError('X402_SETTLEMENT_BINDING_MISMATCH',409);assertRecordBinding(record,o);return record;}
async function updateRecord(store:MarketX402Store,o:MarketOrder,attemptId:string,change:(r:MarketX402Settlement)=>void){return store.transact(s=>{const r=s.records.find(v=>v.operationId===o.operationId);if(!r||r.orderBinding!==marketX402OrderBinding(o)||r.attemptId!==attemptId)throw new WorkspaceError('OPERATION_CONFLICT',409);change(r);r.updatedAt=new Date().toISOString();return r;});}
async function markOrder(o:MarketOrder,attemptId:string,uncertain=false,transactionHash?:string){return configuredMarketStore().transact(s=>{const r=s.orders.find(v=>v.operationId===o.operationId);if(!r||marketX402OrderBinding(r)!==marketX402OrderBinding(o)||r.settlementAttemptId&&r.settlementAttemptId!==attemptId||transactionHash&&r.transactionHash&&r.transactionHash!==transactionHash)throw new WorkspaceError('OPERATION_CONFLICT',409);if(!uncertain&&s.paused)throw new WorkspaceError('MARKET_PAUSED',503);if(r.phase==='awaiting-payment'||['payment-submitting','payment-uncertain'].includes(r.phase)){r.settlementAttemptId=attemptId;r.phase=uncertain?'payment-uncertain':'payment-submitting';if(transactionHash)r.transactionHash=transactionHash;r.updatedAt=new Date().toISOString();}return r;});}
async function markUncertain(deps:MarketX402Dependencies,o:MarketOrder,record:MarketX402Settlement){
 if(!record.attemptId)return;
 try{await updateRecord(deps.store,o,record.attemptId,r=>{if(!['confirmed','settled','rejected'].includes(r.phase))r.phase='uncertain';});}catch{}
 try{await markOrder(o,record.attemptId,true,record.transactionHash??(record.outcome?.transaction||undefined));}catch{}
}
async function finalizePaid(deps:MarketX402Dependencies,o:MarketOrder,record:MarketX402Settlement){
 const transactionHash=record.transactionHash??record.outcome?.transaction;
 if(!transactionHash||!/^[a-f0-9]{64}$/.test(transactionHash)||!record.attemptId)throw new WorkspaceError('X402_PAYMENT_OUTCOME_UNCERTAIN',409);
 const receipt:SettleResponse={success:true,network:'stellar:testnet',payer:o.payer,transaction:transactionHash};
 await markOrder(o,record.attemptId,true,receipt.transaction);
 if(record.phase!=='confirmed'){
  const chain=await deps.rpc.transaction(receipt.transaction);
  if(chain.status!=='SUCCESS'||!chain.envelopeXdr)throw new WorkspaceError('X402_PAYMENT_OUTCOME_UNCERTAIN',409);
  const auth=marketX402Authorization(chain.envelopeXdr,o,true);
  if(auth.transactionHash!==receipt.transaction||auth.fingerprint!==record.authorizationFingerprint)throw new WorkspaceError('X402_PAYMENT_NOT_VERIFIED',409);
  await updateRecord(deps.store,o,record.attemptId,r=>{r.phase='confirmed';r.outcome=receipt;});
 }
 return configuredMarketStore().transact(s=>{const r=s.orders.find(v=>v.operationId===o.operationId);if(!r||marketX402OrderBinding(r)!==marketX402OrderBinding(o)||r.settlementAttemptId!==record.attemptId||r.transactionHash!==receipt.transaction)throw new WorkspaceError('OPERATION_CONFLICT',409);if(['payment-submitting','payment-uncertain'].includes(r.phase)){r.phase='paid';r.paymentVerifiedAt=new Date().toISOString();r.updatedAt=r.paymentVerifiedAt;}return r;});
}
function paidResponse(order:MarketOrder,record:MarketX402Settlement,origin:string){
 const response=Response.json({order,statusUrl:origin+`/api/market/orders/${order.operationId}`},{status:order.delivery?200:202,headers:workspaceHeaders});
 if(record.outcome?.success)response.headers.set('PAYMENT-RESPONSE',encodePaymentResponseHeader(record.outcome));return response;
}
export async function reconcileMarketX402Payment(p:WorkspacePrincipal,id:string,deps=dependencies()){
 const o=await readMarketOrder(p,id);buyer(p,o);const record=await boundRecord(deps.store,o);
 if(!(record.transactionHash||record.outcome?.transaction)||!['settled','confirmed','uncertain'].includes(record.phase))throw new WorkspaceError('X402_PAYMENT_OUTCOME_UNCERTAIN',409);
 try{return await finalizePaid(deps,o,record);}catch(e){await markUncertain(deps,o,record);throw e;}
}
export async function executeMarketX402Payment(p:WorkspacePrincipal,id:string,origin:string,signature?:string,deps=dependencies()):Promise<Response>{
 assertMarketEnabled();
 const o=await readMarketOrder(p,id);buyer(p,o);
 let record=await deps.store.transact(s=>s.records.find(r=>r.operationId===id));
 if(!record){
  if(o.phase!=='awaiting-payment')throw new WorkspaceError('X402_SETTLEMENT_UNAVAILABLE',409);
  if(process.env.BAZAAR_X402_MARKETPLACE_ENABLED!=='true'||process.env.BAZAAR_ENABLE_MARKET_PURCHASES!=='true'||await configuredMarketStore().transact(s=>s.paused??false))throw new WorkspaceError('PURCHASES_PAUSED',503);
  const challenge=createMarketX402Challenge(o,origin);record=await deps.store.transact(s=>{if(s.records.some(r=>r.operationId===id))throw new WorkspaceError('OPERATION_CONFLICT',409);const time=new Date().toISOString(),r:MarketX402Settlement={operationId:id,buyerOwnerId:p.ownerId,orderBinding:marketX402OrderBinding(o),challenge,phase:'challenged',createdAt:time,updatedAt:time};s.records.push(r);return r;});
 }
 assertRecordBinding(record,o);
 if(!signature){if(record.phase==='confirmed')return paidResponse(await finalizePaid(deps,o,record),record,origin);if(record.phase!=='challenged')throw new WorkspaceError('X402_PAYMENT_OUTCOME_UNCERTAIN',409);return Response.json(record.challenge,{status:402,headers:{...workspaceHeaders,'PAYMENT-REQUIRED':encodePaymentRequiredHeader(record.challenge)}});}
 const proof=parseProof(signature,record,o);
 if(record.payloadHash){if(record.payloadHash!==proof.payloadHash||record.authorizationFingerprint!==proof.authorizationFingerprint)throw new WorkspaceError('OPERATION_CONFLICT',409);if(record.phase==='confirmed')return paidResponse(await finalizePaid(deps,o,record),record,origin);throw new WorkspaceError(record.phase==='rejected'?'X402_PAYMENT_REJECTED':'X402_PAYMENT_OUTCOME_UNCERTAIN',record.phase==='rejected'?402:409);}
 if(process.env.BAZAAR_X402_MARKETPLACE_ENABLED!=='true'||process.env.BAZAAR_ENABLE_MARKET_PURCHASES!=='true'||await configuredMarketStore().transact(s=>s.paused??false))throw new WorkspaceError('PURCHASES_PAUSED',503);
 const attemptId=randomUUID();record=await deps.store.transact(s=>{const r=s.records.find(v=>v.operationId===id);if(!r||r.orderBinding!==marketX402OrderBinding(o)||r.phase!=='challenged')throw new WorkspaceError('OPERATION_CONFLICT',409);if(s.records.some(v=>v.authorizationFingerprint===proof.authorizationFingerprint))throw new WorkspaceError('X402_AUTHORIZATION_REUSE',409);Object.assign(r,proof,{attemptId,phase:'verifying',updatedAt:new Date().toISOString()});return r;});
 try{
  const verified=await deps.facilitator.verify(proof.payload,record.challenge.accepts[0]);
  if(verified.isValid!==true||verified.payer!==o.payer){await updateRecord(deps.store,o,attemptId,r=>{r.phase='rejected';});throw new WorkspaceError('X402_PAYMENT_REJECTED',402);}
  await markOrder(o,attemptId);
  record=await updateRecord(deps.store,o,attemptId,r=>{if(r.phase!=='verifying')throw new WorkspaceError('OPERATION_CONFLICT',409);r.phase='settling';});
  const outcome=await deps.facilitator.settle(proof.payload,record.challenge.accepts[0]);
  record=await updateRecord(deps.store,o,attemptId,r=>{r.responseHash=sha(canonical(outcome));if(outcome.network==='stellar:testnet'&&outcome.payer===o.payer&&/^[a-f0-9]{64}$/.test(outcome.transaction))r.transactionHash=outcome.transaction;});
  if(outcome.success!==true||outcome.network!=='stellar:testnet'||outcome.payer!==o.payer||!/^[a-f0-9]{64}$/.test(outcome.transaction))throw new WorkspaceError('X402_PAYMENT_OUTCOME_UNCERTAIN',409);
  const receipt:SettleResponse={success:true,network:'stellar:testnet',transaction:outcome.transaction,payer:outcome.payer};
  record=await updateRecord(deps.store,o,attemptId,r=>{r.outcome=receipt;r.phase='settled';});
  const paid=await finalizePaid(deps,o,record);return paidResponse(paid,record,origin);
 }catch(e){if(!(e instanceof WorkspaceError&&e.code==='X402_PAYMENT_REJECTED'))await markUncertain(deps,o,record);throw e instanceof WorkspaceError?e:new WorkspaceError('X402_PAYMENT_OUTCOME_UNCERTAIN',409);}
}
export async function marketX402Handler(request:Request,id:string){
 try{const p=await authenticateWorkspaceRequest(request);await parseWorkspaceBody(request,z.object({}).strict(),1024);return await executeMarketX402Payment(p,id,workspaceRequestOrigin(request),request.headers.get('payment-signature')??undefined);}catch(e){return workspaceFailure(e);}
}
