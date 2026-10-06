import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {open,readFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Account,Address,Asset,BASE_FEE,Contract,Keypair,Networks,Operation,StrKey,Transaction,TransactionBuilder,authorizeEntry,hash,nativeToScVal,scValToNative,xdr} from '@stellar/stellar-sdk';
import {Api,assembleTransaction,parseRawSimulation} from '@stellar/stellar-sdk/rpc';
import {decodePaymentRequiredHeader,decodePaymentResponseHeader,encodePaymentSignatureHeader} from '@x402/core/http';
import {originOnly} from './private-mcp-client.mjs';

export const buyerProtocol='x402-stellar-exact-v2';
export const buyerIdentity={kind:'stellar-classic-credit',network:'stellar:testnet',code:'USDC',issuer:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'};
buyerIdentity.sacContract=new Asset(buyerIdentity.code,buyerIdentity.issuer).contractId(Networks.TESTNET);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest=value=>createHash('sha256').update(value).digest('hex');
export const buyerCanonical=value=>Array.isArray(value)?'['+value.map(buyerCanonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+buyerCanonical(value[key])).join(',')+'}':JSON.stringify(value);
const clone=value=>structuredClone(value);
const nullAccount='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
function sponsoredFeeLimit(options,requirements){
 const maximum=options.maxSponsoredFeeStroops??50000;
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>1000000||maximum>50000&&requirements.extra?.areFeesSponsored!==true)throw Error('INVALID_SPONSORED_FEE_LIMIT');
 return BigInt(maximum);
}
const proofPhases=['paid','executing','execution-uncertain','delivered','delivery-failed'];
const endpoint=intent=>new URL('/api/market/orders/'+intent.operationId+'/x402',intent.origin).href;
function cardValid(card){return card&&card.network==='stellar:testnet'&&card.payment?.scheme==='exact'&&card.payment?.asset==='USDC'&&card.payment?.amount==='0.01'&&StrKey.isValidEd25519PublicKey(card.payment.destination??'')&&buyerCanonical(card.payment.identity)===buyerCanonical(buyerIdentity)&&card.payment.marketplace?.protocol===buyerProtocol&&card.payment.marketplace?.resourceTemplate==='/api/market/orders/{operationId}/x402';}
export function createMarketplaceBuyerIntent({origin,card,input,payer,operationId=randomUUID(),maxAtomic='100000'}){
 const intent={version:1,origin:originOnly(origin),operationId,card:clone(card),cardHash:digest(buyerCanonical(card)),input:clone(input),inputHash:digest(buyerCanonical(input)),payer,maxAtomic,paymentProtocol:buyerProtocol,phase:'prepared',createdAt:new Date().toISOString()};
 validateIntent(intent);return intent;
}
function validateIntent(intent){
 if(intent?.version!==1||!uuid.test(intent.operationId??'')||originOnly(intent.origin)!==intent.origin||intent.paymentProtocol!==buyerProtocol||!cardValid(intent.card)||digest(buyerCanonical(intent.card))!==intent.cardHash||digest(buyerCanonical(intent.input))!==intent.inputHash||!StrKey.isValidEd25519PublicKey(intent.payer??'')||!intent.input||typeof intent.input!=='object'||Array.isArray(intent.input)||intent.maxAtomic!=='100000')throw Error('INVALID_BUYER_INTENT');
 if(intent.challenge)validateChallenge(intent,intent.challenge);
 if(intent.challenge&&digest(buyerCanonical(intent.challenge))!==intent.challengeHash)throw Error('PAYMENT_CHALLENGE_CHANGED');
 if(intent.signedPayload&&(digest(buyerCanonical(intent.signedPayload))!==intent.payloadHash||encodePaymentSignatureHeader(intent.signedPayload)!==intent.paymentSignature))throw Error('SIGNED_PAYLOAD_CHANGED');
}
function boundOrder(intent,order){
 if(!order||order.operationId!==intent.operationId||order.paymentProtocol!==buyerProtocol||order.cardHash!==intent.cardHash||digest(buyerCanonical(order.card))!==intent.cardHash||order.serviceId!==intent.card.id||order.inputHash!==intent.inputHash||buyerCanonical(order.input)!==buyerCanonical(intent.input)||order.payer!==intent.payer||order.destination!==intent.card.payment.destination||order.amount!=='0.01'||buyerCanonical(order.settlement)!==buyerCanonical(buyerIdentity))throw Error('ORDER_BINDING_CHANGED');
 if(proofPhases.includes(order.phase)&&(!/^[a-f0-9]{64}$/.test(order.transactionHash??'')||!Number.isFinite(Date.parse(order.paymentVerifiedAt))))throw Error('UNVERIFIED_PAYMENT');
 if(order.delivery&&(order.delivery.sha256!==digest(order.delivery.text)||order.delivery.reference!=='bazaar-order:'+intent.operationId||order.delivery.text.length>2000))throw Error('DELIVERY_CHANGED');
 return order;
}
function validateChallenge(intent,challenge){
 const route=new URL(endpoint(intent)).pathname,requirements=challenge?.accepts?.[0];
 if(challenge?.x402Version!==2||challenge.accepts?.length!==1||challenge.resource?.url!==endpoint(intent)||challenge.resource?.mimeType!=='application/json'||requirements?.scheme!=='exact'||requirements.network!=='stellar:testnet'||requirements.asset!==buyerIdentity.sacContract||requirements.amount!=='100000'||requirements.payTo!==intent.card.payment.destination||!Number.isInteger(requirements.maxTimeoutSeconds)||requirements.maxTimeoutSeconds<1||requirements.maxTimeoutSeconds>300||requirements.extra?.areFeesSponsored!==true||requirements.extra.resourceUrl!==endpoint(intent)||requirements.extra.route!==route||requirements.extra.method!=='POST'||requirements.extra.operationId!==intent.operationId||requirements.extra.cardHash!==intent.cardHash||requirements.extra.inputHash!==intent.inputHash)throw Error('PAYMENT_CHALLENGE_CHANGED');
 return requirements;
}
async function save(intent,options){validateIntent(intent);if(typeof options.persistIntent!=='function')throw Error('DURABLE_JOURNAL_REQUIRED');await options.persistIntent(clone(intent));}
function authHeaders(options){if(!/^[A-Za-z0-9_-]{43}$/.test(options.agentToken??''))throw Error('AGENT_ACCESS_REQUIRED');return {authorization:'Bearer '+options.agentToken,'content-type':'application/json'};}
async function jsonBody(response,maxBytes=65536){const text=await response.text();if(Buffer.byteLength(text)>maxBytes)throw Error('RESPONSE_OVERSIZE');try{return JSON.parse(text);}catch{throw Error('INVALID_RESPONSE');}}

/** All calls are explicit. A started operation is never automatically retried. */
export async function createBuyerOrderOnce(intent,options){
 validateIntent(intent);if(intent.phase!=='prepared')throw Error('EXISTING_INTENT_REQUIRES_READ_RECOVERY');
 intent.phase='order-started';await save(intent,options);
 try{const response=await options.marketFetch(new URL('/api/market/orders',intent.origin),{method:'POST',headers:authHeaders(options),body:JSON.stringify({operationId:intent.operationId,serviceId:intent.card.id,cardHash:intent.cardHash,payer:intent.payer,input:intent.input,paymentProtocol:buyerProtocol}),redirect:'error'});
  if(response.status!==201)throw Error('ORDER_NOT_CONFIRMED');const body=await jsonBody(response);intent.order=clone(boundOrder(intent,body.order));intent.phase='order-created';await save(intent,options);return clone(intent.order);
 }catch(error){intent.phase='order-uncertain';await save(intent,options);throw error;}
}
export async function requestBuyerChallengeOnce(intent,options){
 validateIntent(intent);if(intent.phase!=='order-created')throw Error('CHALLENGE_REQUIRES_CONFIRMED_ORDER');
 intent.phase='challenge-started';await save(intent,options);
 try{const response=await options.marketFetch(endpoint(intent),{method:'POST',headers:authHeaders(options),body:'{}',redirect:'error'});if(response.status!==402)throw Error('EXPECTED_PAYMENT_REQUIRED');
  const header=response.headers.get('payment-required');if(!header||header.length>32768)throw Error('INVALID_PAYMENT_REQUIRED');const challenge=decodePaymentRequiredHeader(header),body=await jsonBody(response);
  validateChallenge(intent,challenge);if(buyerCanonical(challenge)!==buyerCanonical(body))throw Error('PAYMENT_REQUIRED_HEADER_BODY_CONFLICT');intent.challenge=clone(challenge);intent.challengeHash=digest(buyerCanonical(challenge));intent.phase='challenge-received';await save(intent,options);return clone(challenge);
 }catch(error){intent.phase='challenge-uncertain';await save(intent,options);throw error;}
}

function sameInvocation(invocation,requirements,payer){
 if(invocation.subInvocations().length||invocation.function().switch().name!=='sorobanAuthorizedFunctionTypeContractFn')throw Error('UNEXPECTED_AUTHORIZATION');
 const call=invocation.function().contractFn();
 if(Address.fromScAddress(call.contractAddress()).toString()!==requirements.asset||call.functionName().toString()!=='transfer'||call.args().length!==3||scValToNative(call.args()[0])!==payer||scValToNative(call.args()[1])!==requirements.payTo||scValToNative(call.args()[2])!==BigInt(requirements.amount))throw Error('UNBOUND_AUTHORIZATION');
}
function unsignedEntryValid(entry,requirements,payer){
 if(entry.credentials().switch().name!=='sorobanCredentialsAddress'||Address.fromScAddress(entry.credentials().address().address()).toString()!==payer||entry.credentials().address().signature().switch().name!=='scvVoid')throw Error('UNEXPECTED_SIGNER');
 sameInvocation(entry.rootInvocation(),requirements,payer);
}
/** Validate the real signed transfer, rather than treating wrapper metadata as signed. */
export function assertBuyerTransfer(transactionXdr,requirements,payer,options={}){
 const maximumFee=sponsoredFeeLimit(options,requirements);
 const tx=new Transaction(transactionXdr,Networks.TESTNET);
 if(tx.operations.length!==1||tx.signatures.length||tx.source!==nullAccount||BigInt(tx.fee)>maximumFee)throw Error('UNSAFE_PAYMENT_TRANSACTION');
 const op=tx.operations[0];if(op.type!=='invokeHostFunction'||op.source||op.func.switch().name!=='hostFunctionTypeInvokeContract'||op.auth?.length!==1)throw Error('UNSAFE_PAYMENT_OPERATION');
 const call=op.func.invokeContract();if(Address.fromScAddress(call.contractAddress()).toString()!==requirements.asset||call.functionName().toString()!=='transfer'||call.args().length!==3||scValToNative(call.args()[0])!==payer||scValToNative(call.args()[1])!==requirements.payTo||scValToNative(call.args()[2])!==BigInt(requirements.amount))throw Error('UNBOUND_PAYMENT_TRANSFER');
 const entry=op.auth[0];sameInvocation(entry.rootInvocation(),requirements,payer);
 if(entry.credentials().switch().name!=='sorobanCredentialsAddress'||Address.fromScAddress(entry.credentials().address().address()).toString()!==payer)throw Error('UNEXPECTED_SIGNER');
 const credentials=entry.credentials().address(),signatures=scValToNative(credentials.signature());
 if(!credentials.signatureExpirationLedger()||!Array.isArray(signatures)||signatures.length!==1||Buffer.from(signatures[0].public_key??[]).toString('hex')!==StrKey.decodeEd25519PublicKey(payer).toString('hex'))throw Error('INVALID_PAYMENT_SIGNATURE');
 const preimage=xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({networkId:hash(Buffer.from(Networks.TESTNET)),nonce:credentials.nonce(),invocation:entry.rootInvocation(),signatureExpirationLedger:credentials.signatureExpirationLedger()}));
 if(!Keypair.fromPublicKey(payer).verify(hash(preimage.toXDR()),Buffer.from(signatures[0].signature??[])))throw Error('INVALID_PAYMENT_SIGNATURE');
 return {authorizationFingerprint:digest(entry.toXDR()),expirationLedger:credentials.signatureExpirationLedger()};
}
async function rpcCall(options,method,params={}){
 const rpcUrl=new URL(options.rpcUrl??'https://soroban-testnet.stellar.org');if(rpcUrl.protocol!=='https:'||rpcUrl.username||rpcUrl.password||rpcUrl.search||rpcUrl.hash)throw Error('INVALID_RPC_ORIGIN');
 if(typeof options.rpcFetch!=='function')throw Error('MEASURED_RPC_TRANSPORT_REQUIRED');
 const response=await options.rpcFetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),redirect:'error'});
 if(!response.ok)throw Error('RPC_UNCONFIRMED');const body=await jsonBody(response,262144);if(body.jsonrpc!=='2.0'||body.id!==1||body.error||!body.result)throw Error('RPC_UNCONFIRMED');return body.result;
}
function simulationValid(raw,maximumFee){const simulation=parseRawSimulation(raw);if(!Api.isSimulationSuccess(simulation)||Api.isSimulationRestore(simulation)||!simulation.result||BigInt(simulation.minResourceFee)+BigInt(BASE_FEE)>maximumFee)throw Error('SIMULATION_REJECTED');return simulation;}
/** SDK pure builders reproduce the official exact scheme without hidden RPC/Horizon clients. */
export async function buildBuyerPaymentPayload(intent,options){
 const requirements=validateChallenge(intent,intent.challenge);
 const maximumFee=sponsoredFeeLimit(options,requirements);
 if(options.signer?.address!==intent.payer||typeof options.signer.signAuthEntry!=='function')throw Error('CONFIGURED_SIGNER_REQUIRED');
 const latest=await rpcCall(options,'getLatestLedger');if(!Number.isInteger(latest.sequence)||latest.sequence<1)throw Error('INVALID_LEDGER');
 const expirationLedger=latest.sequence+Math.ceil(requirements.maxTimeoutSeconds/5);
 const raw=new TransactionBuilder(new Account(nullAccount,'0'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET}).setTimeout(requirements.maxTimeoutSeconds).addOperation(new Contract(requirements.asset).call('transfer',nativeToScVal(intent.payer,{type:'address'}),nativeToScVal(requirements.payTo,{type:'address'}),nativeToScVal(requirements.amount,{type:'i128'}))).build();
 const simulation=simulationValid(await rpcCall(options,'simulateTransaction',{transaction:raw.toXDR()}),maximumFee);
 const assembled=assembleTransaction(raw,simulation).build(),operation=assembled.operations[0];
 if(operation.auth?.length!==1)throw Error('UNEXPECTED_AUTHORIZATION_COUNT');const entry=operation.auth[0];unsignedEntryValid(entry,requirements,intent.payer);
 intent.unsignedTransaction=assembled.toXDR();intent.expirationLedger=expirationLedger;intent.phase='signer-started';await save(intent,options);
 const signed=await authorizeEntry(entry,async preimage=>{
  const result=await options.signer.signAuthEntry(preimage.toXDR('base64'),{address:intent.payer});
  if(result?.error||typeof result?.signedAuthEntry!=='string'||result.signerAddress&&result.signerAddress!==intent.payer)throw Error('SIGNER_REJECTED');return Buffer.from(result.signedAuthEntry,'base64');
 },expirationLedger,Networks.TESTNET);
 const signedTransaction=TransactionBuilder.cloneFrom(assembled).clearOperations().addOperation(Operation.invokeHostFunction({func:operation.func,auth:[signed]})).build();
 assertBuyerTransfer(signedTransaction.toXDR(),requirements,intent.payer,options);intent.signedAuthorizationTransaction=signedTransaction.toXDR();intent.phase='authorization-signed';await save(intent,options);
 // A failed second simulation retains this exact signed authorization in the sealed journal.
 const verifiedSimulation=simulationValid(await rpcCall(options,'simulateTransaction',{transaction:signedTransaction.toXDR()}),maximumFee);
 const final=assembleTransaction(raw,verifiedSimulation).clearOperations().addOperation(Operation.invokeHostFunction({func:operation.func,auth:[signed]})).build();
 const evidence=assertBuyerTransfer(final.toXDR(),requirements,intent.payer,options);if(evidence.expirationLedger!==expirationLedger)throw Error('AUTHORIZATION_CHANGED');
 return {x402Version:2,resource:clone(intent.challenge.resource),accepted:clone(requirements),payload:{transaction:final.toXDR()}};
}
export async function authorizeBuyerOnce(intent,options){
 validateIntent(intent);if(intent.phase!=='challenge-received')throw Error('EXISTING_SIGNATURE_MUST_NOT_BE_REGENERATED');if(typeof options.reserveSpend!=='function')throw Error('DURABLE_SPEND_LIMIT_REQUIRED');
 sponsoredFeeLimit(options,validateChallenge(intent,intent.challenge));
 intent.phase='authorization-started';await save(intent,options);
 try{await options.reserveSpend({operationId:intent.operationId,payer:intent.payer,asset:buyerIdentity.sacContract,amount:'100000'});const payload=await buildBuyerPaymentPayload(intent,options);
  intent.signedPayload=clone(payload);intent.payloadHash=digest(buyerCanonical(payload));intent.paymentSignature=encodePaymentSignatureHeader(payload);intent.phase='payment-ready';await save(intent,options);return clone(payload);
 }catch(error){intent.phase='authorization-uncertain';await save(intent,options);throw error;}
}
export async function payBuyerOnce(intent,options){
 validateIntent(intent);if(intent.phase!=='payment-ready'||!intent.signedPayload)throw Error('PAYMENT_MUST_NOT_BE_RETRIED');assertBuyerTransfer(intent.signedPayload.payload.transaction,validateChallenge(intent,intent.challenge),intent.payer,options);
 if(buyerCanonical(intent.signedPayload.accepted)!==buyerCanonical(intent.challenge.accepts[0])||buyerCanonical(intent.signedPayload.resource)!==buyerCanonical(intent.challenge.resource))throw Error('SIGNED_PAYLOAD_CHANGED');
 intent.phase='payment-started';await save(intent,options);
 try{const response=await options.marketFetch(endpoint(intent),{method:'POST',headers:{...authHeaders(options),'payment-signature':intent.paymentSignature},body:'{}',redirect:'error'});
  if(![200,202].includes(response.status))throw Error('PAYMENT_NOT_CONFIRMED');const body=await jsonBody(response),order=boundOrder(intent,body.order),header=response.headers.get('payment-response');
  if(!proofPhases.includes(order.phase)||!header||header.length>32768)throw Error('PAYMENT_NOT_CONFIRMED');const receipt=decodePaymentResponseHeader(header);
  if(receipt.success!==true||receipt.network!=='stellar:testnet'||receipt.payer!==intent.payer||receipt.transaction!==order.transactionHash||new URL(body.statusUrl,intent.origin).href!==new URL('/api/market/orders/'+intent.operationId,intent.origin).href)throw Error('PAYMENT_RECEIPT_CHANGED');
  intent.order=clone(order);intent.receipt=clone(receipt);intent.phase='paid';await save(intent,options);return {order:clone(order),receipt:clone(receipt)};
 }catch(error){intent.phase='payment-uncertain';await save(intent,options);throw error;}
}
export async function inspectBuyerOrder(intent,options){
 validateIntent(intent);let readOrigin=intent.origin,fetcher=options.marketFetch;
 if(options.recoveryOrigin!==undefined){const configured=originOnly(options.recoveryOrigin);if(!configured.startsWith('https://')||configured!==options.recoveryOrigin||!Array.isArray(options.allowedRecoveryOrigins)||!options.allowedRecoveryOrigins.includes(configured))throw Error('UNTRUSTED_RECOVERY_ORIGIN');readOrigin=configured;fetcher=options.recoveryFetch??fetcher;}
 const response=await fetcher(new URL('/api/market/orders/'+intent.operationId,readOrigin),{method:'GET',headers:authHeaders(options),redirect:'error'});if(!response.ok)throw Error('READ_UNCONFIRMED');return clone(boundOrder(intent,(await jsonBody(response)).order));
}
/** Explicit read-only recovery. No POST or signature regeneration occurs. */
export async function recoverBuyerIntent(intent,options){
 const order=await inspectBuyerOrder(intent,options);intent.order=clone(order);intent.lastReadAt=new Date().toISOString();
 if(proofPhases.includes(order.phase))intent.phase='paid'; // The durable payment proof remains untouched.
 await save(intent,options);return order;
}
const activeBuyers=new Set();
export async function runMarketplaceBuyerIntent(intent,options){
 validateIntent(intent);if(intent.phase!=='prepared')throw Error('EXISTING_INTENT_REQUIRES_READ_RECOVERY');const key=intent.origin+':'+intent.operationId;if(activeBuyers.has(key))throw Error('CONCURRENT_BUYER_DENIED');activeBuyers.add(key);
 try{await createBuyerOrderOnce(intent,options);await requestBuyerChallengeOnce(intent,options);await authorizeBuyerOnce(intent,options);return await payBuyerOnce(intent,options);}finally{activeBuyers.delete(key);}
}
export async function discoverBuyerService(origin,serviceId,options){
 const response=await options.marketFetch(new URL('/api/market/services',originOnly(origin)),{method:'GET',headers:authHeaders(options),redirect:'error'});if(!response.ok)throw Error('CATALOG_UNCONFIRMED');const body=await jsonBody(response),service=body.services?.find(item=>item.card?.id===serviceId&&item.status==='activated');
 if(!service||!cardValid(service.card)||digest(buyerCanonical(service.card))!==service.cardHash)throw Error('SERVICE_NOT_ACTIVE');return clone(service);
}

/** Reservations are never released after a lost signer/transport response. */
export function createBuyerSpendBudget({maximumAtomic='200000',reservations=[],persistReservations}){
 if(!/^[1-9][0-9]*$/.test(maximumAtomic)||BigInt(maximumAtomic)>200000n||typeof persistReservations!=='function'||!Array.isArray(reservations))throw Error('INVALID_SPEND_BUDGET');
 let conserved=clone(reservations),tail=Promise.resolve(),uncertain=false;
 const valid=value=>uuid.test(value?.operationId??'')&&StrKey.isValidEd25519PublicKey(value.payer??'')&&value.asset===buyerIdentity.sacContract&&value.amount==='100000';
 if(conserved.some(value=>!valid(value))||new Set(conserved.map(value=>value.operationId)).size!==conserved.length||conserved.reduce((sum,value)=>sum+BigInt(value.amount),0n)>BigInt(maximumAtomic))throw Error('INVALID_SPEND_BUDGET');
 return {
  reserve(value){const action=async()=>{if(uncertain)throw Error('SPEND_JOURNAL_UNCERTAIN');if(!valid(value)||conserved.some(old=>old.operationId===value.operationId))throw Error('SPEND_RESERVATION_ALREADY_EXISTS');const next=[...conserved,clone(value)];if(next.reduce((sum,item)=>sum+BigInt(item.amount),0n)>BigInt(maximumAtomic))throw Error('SPEND_LIMIT_EXHAUSTED');try{await persistReservations(clone(next));}catch{uncertain=true;throw Error('SPEND_JOURNAL_UNCERTAIN');}conserved=next;};const pending=tail.then(action);tail=pending.then(()=>undefined,()=>undefined);return pending;},
  snapshot(){return clone(conserved);}
 };
}

/** No credentials reach hooks. Response chunks, including a partial body, are charged once. */
export function createBoundedBuyerFetch({origin,fetchImpl=fetch,timeoutMs=12000,maxResponseBytes=262144,beforeRequest,onResponse,onUncertain}){
 const exactOrigin=originOnly(origin);if(!exactOrigin.startsWith('https://')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>12000||!Number.isInteger(maxResponseBytes)||maxResponseBytes<1||maxResponseBytes>1048576)throw Error('INVALID_TRANSPORT_CONFIGURATION');
 return async(input,init={})=>{
  const url=new URL(String(input)),method=(init.method??'GET').toUpperCase(),headers=new Headers(init.headers),body=init.body??'';
  if(url.origin!==exactOrigin||url.username||url.password||url.search||url.hash||!['GET','POST'].includes(method)||typeof body!=='string'||Buffer.byteLength(body)>65536||method==='GET'&&body)throw Error('UNBOUND_TRANSPORT_TARGET');
  let requestHeaderBytes=0;for(const[key,value]of headers)requestHeaderBytes+=Buffer.byteLength(key+': '+value+'\r\n');
  const metadata={origin:url.origin,path:url.pathname,method,payloadHash:digest(body),requestBytes:Buffer.byteLength(body)+requestHeaderBytes,requestBodyBytes:Buffer.byteLength(body),requestHeaderBytes};await beforeRequest?.(metadata);
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,timeoutMs);init.signal?.addEventListener('abort',abort,{once:true});let responseBodyBytes=0,responseHeaderBytes=0,reader,status;
  try{if(init.signal?.aborted)throw Error('TRANSPORT_ABORTED');const response=await fetchImpl(url.href,{...init,method,headers,body:body||undefined,redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});status=response.status;
   if(response.redirected||response.status>=300&&response.status<400||response.url&&new URL(response.url).origin!==exactOrigin)throw Error('REDIRECT_DENIED');
   for(const[key,value]of response.headers)responseHeaderBytes+=Buffer.byteLength(key+': '+value+'\r\n');if(responseHeaderBytes>maxResponseBytes)throw Error('RESPONSE_OVERSIZE');
   const parts=[];reader=response.body?.getReader();if(reader)while(true){const{done,value}=await reader.read();if(done)break;responseBodyBytes+=value.byteLength;if(responseBodyBytes+responseHeaderBytes>maxResponseBytes)throw Error('RESPONSE_OVERSIZE');parts.push(Buffer.from(value));}
   if(controller.signal.aborted)throw Error('TRANSPORT_UNCONFIRMED');const result=new Response([204,205,304].includes(status)?null:Buffer.concat(parts),{status,headers:response.headers});await onResponse?.({...metadata,status,responseBytes:responseBodyBytes+responseHeaderBytes,responseBodyBytes,responseHeaderBytes});return result;
  }catch(error){await reader?.cancel().catch(()=>{});await onUncertain?.({...metadata,...(status?{status}:{}),responseBytes:responseBodyBytes+responseHeaderBytes,responseBodyBytes,responseHeaderBytes});throw Error(['REDIRECT_DENIED','RESPONSE_OVERSIZE','TRANSPORT_ABORTED'].includes(error.message)?error.message:'TRANSPORT_UNCONFIRMED');}
  finally{clearTimeout(timer);reader?.releaseLock();init.signal?.removeEventListener('abort',abort);}
 };
}
/** A caller-supplied DPAPI/secure-store adapter seals every snapshot before fsync. */
export function createSealedBuyerJournal({path,seal,unseal}){
 if(typeof seal!=='function'||typeof unseal!=='function')throw Error('SEALED_JOURNAL_REQUIRED');
 let journalOperationId;
 async function writeSnapshot(intent,flag){validateIntent(intent);const sealed=await seal(Buffer.from(JSON.stringify(intent)));if(!(sealed instanceof Uint8Array)||!sealed.length)throw Error('JOURNAL_SEAL_FAILED');const file=await open(path,flag,0o600);try{await file.writeFile(Buffer.from(sealed).toString('base64')+'\n');await file.sync();}finally{await file.close();}}
 const journal={
  async initialize(intent){if(intent.phase!=='prepared'||intent.signedPayload)throw Error('INITIAL_INTENT_REQUIRED');await writeSnapshot(intent,'wx');journalOperationId=intent.operationId;},
  async append(intent){if(!journalOperationId)await journal.read();if(intent.operationId!==journalOperationId)throw Error('JOURNAL_OPERATION_CONFLICT');await writeSnapshot(intent,'a');},
  async read(){const raw=await readFile(path,'utf8');if(Buffer.byteLength(raw)>2097152)throw Error('JOURNAL_TOO_LARGE');const line=raw.trim().split('\n').at(-1);if(!line||!/^[A-Za-z0-9+/]+=*$/.test(line))throw Error('JOURNAL_UNCONFIRMED');const intent=JSON.parse(Buffer.from(await unseal(Buffer.from(line,'base64'))).toString('utf8'));validateIntent(intent);journalOperationId=intent.operationId;return intent;}
 };return journal;
}

const dpapiCommand="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $job=([Console]::In.ReadToEnd() | ConvertFrom-Json); $bytes=[Convert]::FromBase64String($job.bytes); $entropy=[Text.Encoding]::UTF8.GetBytes('bazaar.marketplace.x402-buyer.v1'); if($job.operation -eq 'seal'){$result=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}elseif($job.operation -eq 'unseal'){$result=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}else{throw 'Invalid operation'}; [Console]::Out.Write([Convert]::ToBase64String($result)); [Array]::Clear($bytes,0,$bytes.Length); [Array]::Clear($result,0,$result.Length)";
/** Windows CurrentUser DPAPI. Plaintext travels only over private process pipes. */
export function createDpapiBuyerJournal(path,{spawnProcess=spawn,timeoutMs=10000}={}){
 if(process.platform!=='win32'||typeof path!=='string'||!path||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('WINDOWS_DPAPI_REQUIRED');
 async function transform(operation,bytes){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>524288)throw Error('DPAPI_INPUT_DENIED');
  const root=process.env.SystemRoot??process.env.WINDIR;if(!root)throw Error('WINDOWS_DPAPI_REQUIRED');
  const result=await new Promise((fulfill,reject)=>{
   const child=spawnProcess(resolve(root,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',dpapiCommand],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:root,WINDIR:root,...Object.fromEntries(['TEMP','TMP','USERPROFILE'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]))}});
   let done=false,length=0;const parts=[];const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(Error('DPAPI_UNCONFIRMED')):fulfill(value);};const timer=setTimeout(()=>{child.kill();finish(true);},timeoutMs);
   child.stdout.on('data',part=>{length+=part.length;if(length>1048576){child.kill();finish(true);}else parts.push(part);});child.stderr.on('data',()=>{});child.on('error',()=>finish(true));child.on('close',code=>finish(code!==0,Buffer.concat(parts)));child.stdin.on('error',()=>finish(true));child.stdin.end(JSON.stringify({operation,bytes:Buffer.from(bytes).toString('base64')}));
  });
  const raw=result.toString('utf8').trim();if(!raw||!/^[A-Za-z0-9+/]+=*$/.test(raw))throw Error('DPAPI_UNCONFIRMED');return Buffer.from(raw,'base64');
 }
 return createSealedBuyerJournal({path,seal:bytes=>transform('seal',bytes),unseal:bytes=>transform('unseal',bytes)});
}
/** Runtime module provides measured transports, sealed journal, spend reservation and an in-memory signer. */
async function main(){
 const [command,runtimePath,journalPath,intentPath]=process.argv.slice(2);if(!['prepare','buy','inspect','recover'].includes(command)||!runtimePath||!journalPath)throw Error('INVALID_COMMAND');
 // No seed env var or plaintext seed file is supported by this example.
 const runtimeModule=await import(pathToFileURL(resolve(runtimePath)).href);if(typeof runtimeModule.createRuntime!=='function')throw Error('CONFIGURED_RUNTIME_REQUIRED');const options=await runtimeModule.createRuntime({journalPath});
 if(!options.journal?.append||!options.journal?.read)throw Error('SEALED_JOURNAL_REQUIRED');options.persistIntent=intent=>options.journal.append(intent);
 const lock=command==='inspect'?undefined:await open(journalPath+'.lock','wx',0o600);
 try{let result;if(command==='prepare'){if(!intentPath||typeof options.journal.initialize!=='function')throw Error('PUBLIC_INTENT_REQUIRED');const raw=await readFile(intentPath,'utf8');if(Buffer.byteLength(raw)>65536)throw Error('INTENT_TOO_LARGE');const intent=createMarketplaceBuyerIntent(JSON.parse(raw));await options.journal.initialize(intent);result={operationId:intent.operationId,phase:intent.phase};}
  else{const intent=await options.journal.read();if(command==='buy')result=(await runMarketplaceBuyerIntent(intent,options)).order;else result=command==='inspect'?await inspectBuyerOrder(intent,options):await recoverBuyerIntent(intent,options);}
  console.log(JSON.stringify({operationId:result.operationId,phase:result.phase,paid:Boolean(result.paymentVerifiedAt),delivered:Boolean(result.delivery),...(result.transactionHash?{transactionHash:result.transactionHash}:{}),...(result.delivery?{delivery:{text:result.delivery.text,sha256:result.delivery.sha256,reference:result.delivery.reference}}:{}),...(result.failure?{failure:result.failure}:{})}));
 }finally{if(lock){await lock.close();await unlink(journalPath+'.lock');}await options.dispose?.();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Outcome unconfirmed. Preserve the sealed journal and inspect the existing order; do not regenerate authorization or pay again.');process.exitCode=1;});
