// Public incident observation only. No app requests, signer, submission or retries.
import {readFile,lstat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Address,FeeBumpTransaction,Networks,TransactionBuilder,nativeToScVal,scValToNative,xdr} from '@stellar/stellar-sdk';
import {buyerIdentity as buyerIdentityUSDC} from '../examples/marketplace-x402-buyer.mjs';
import {inspectExistingRecoveryEnvelope} from './read-existing-testnet-authorization-chain.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),fail=code=>{const e=Error(code);e.safeRpcRecoveryCode=code;throw e;},hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),ledger=v=>Number.isSafeInteger(v)&&v>0&&v<=0xffffffff;
export const ORIGINAL_RPC_RECOVERY_POLICY=Object.freeze({operationId:'31c97193-be74-4b9d-b0a3-f3890b0a41e8',origin:'https://soroban-testnet.stellar.org',network:'stellar:testnet',payer:'GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU',destination:'GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C',amountAtomic:'100000',settlement:Object.freeze({...buyerIdentityUSDC}),authorizationFingerprint:'f3f6b5faabcd76dc9e71d2e49875ce186d69fc6d423ab05da0ae94890e597293',expirationLedger:5151548,startLedger:5151000,endLedger:5151549,maximumCalls:4,maximumEvents:20,maximumTransactionReads:2,maximumResponseBytes:1048576,maximumTotalBytes:4194304,maximumDurationMs:45000,evidence:'docs/evidence/original-testnet-rpc-transfer-observations-2026-10-12.json',intent:'.vercel/original-testnet-rpc-transfer-read-intent.json'});
const C=ORIGINAL_RPC_RECOVERY_POLICY,zero=Object.freeze({applicationRequests:0,newOrders:0,newSignatures:0,newPaymentSubmissions:0,settlements:0,simulations:0,cloudWrites:0,dpapiReads:0,secretValuesInOutput:0,ownerIdsInOutput:0});
const safeCodes=new Set(['PUBLIC_RPC_HEALTH_UNCONFIRMED','BOUNDED_PUBLIC_RPC_EVENTS_REQUIRED','ORIGINAL_AUTHORIZATION_EXPIRY_MISMATCH','EXACT_PUBLIC_RPC_TRANSACTION_REQUIRED','PUBLIC_RPC_ENVELOPE_HASH_MISMATCH','FOUR_READ_ONLY_PUBLIC_RPC_CALLS_REQUIRED','EXACT_READ_ONLY_TESTNET_RPC_RESPONSE_REQUIRED','PUBLIC_RPC_RECOVERY_RESPONSE_BOUND','PUBLIC_RPC_RECOVERY_JSON_REQUIRED','PUBLIC_RPC_RECOVERY_RESULT_UNCONFIRMED','EXISTING_PUBLIC_RPC_READ_RECOVER_EVIDENCE_ONLY','EXACT_REVIEWED_PUBLIC_RPC_RECOVERY_ACTION_REQUIRED']);
const safeCode=e=>safeCodes.has(e?.safeRpcRecoveryCode)?e.safeRpcRecoveryCode:'PUBLIC_RPC_RECOVERY_UNCONFIRMED';
export function originalTransferEventParameters(){return {startLedger:C.startLedger,endLedger:C.endLedger,filters:[{type:'contract',contractIds:[C.settlement.sacContract],topics:[[nativeToScVal('transfer',{type:'symbol'}).toXDR('base64'),new Address(C.payer).toScVal().toXDR('base64'),new Address(C.destination).toScVal().toXDR('base64'),'**']]}],pagination:{limit:C.maximumEvents},xdrFormat:'base64'};}
export function inspectOriginalRpcHealth(result){if(result?.status!=='healthy'||!ledger(result.oldestLedger)||!ledger(result.latestLedger)||result.oldestLedger>result.latestLedger)fail('PUBLIC_RPC_HEALTH_UNCONFIRMED');return {oldestLedger:result.oldestLedger,latestLedger:result.latestLedger,requestedRangeRetained:result.oldestLedger<=C.startLedger&&result.latestLedger>=C.endLedger-1};}
export function inspectOriginalRpcEvents(result){
 if(!result||!Array.isArray(result.events)||result.events.length>C.maximumEvents||!ledger(result.latestLedger))fail('BOUNDED_PUBLIC_RPC_EVENTS_REQUIRED');
 const found=new Map();let rejected=0,matchingEvents=0;
 for(const e of result.events){try{
  if(e?.type!=='contract'||e.contractId!==C.settlement.sacContract||!ledger(e.ledger)||e.ledger<C.startLedger||e.ledger>=C.endLedger||!hex(e.txHash)||!Array.isArray(e.topic)||e.topic.length<3||e.topic.length>4||e.topic.some(v=>typeof v!=='string'||v.length>256)||typeof e.value!=='string'||e.value.length>256||e.inSuccessfulContractCall===false)throw Error();
  const topic=e.topic.map(v=>scValToNative(xdr.ScVal.fromXDR(v,'base64'))),amount=scValToNative(xdr.ScVal.fromXDR(e.value,'base64'));
  if(topic[0]!=='transfer'||topic[1]!==C.payer||topic[2]!==C.destination||typeof amount!=='bigint'||amount!==BigInt(C.amountAtomic))throw Error();
  matchingEvents++;if(!found.has(e.txHash))found.set(e.txHash,{transactionHash:e.txHash,ledger:e.ledger});
 }catch{rejected++;}}
 const candidates=[...found.values()];return {eventsInspected:result.events.length,rejectedEvents:rejected,matchingTransferEvents:matchingEvents,distinctTransactionCandidates:candidates.length,transactionCandidatesTruncated:candidates.length>C.maximumTransactionReads,eventWindowComplete:false,candidates:candidates.slice(0,C.maximumTransactionReads)};
}
export function inspectOriginalRpcEnvelope(raw){
 const info=inspectExistingRecoveryEnvelope(raw,C),envelope=TransactionBuilder.fromXDR(raw,Networks.TESTNET),tx=envelope instanceof FeeBumpTransaction?envelope.innerTransaction:envelope;
 if(tx.operations[0].auth[0].credentials().address().signatureExpirationLedger()!==C.expirationLedger)fail('ORIGINAL_AUTHORIZATION_EXPIRY_MISMATCH');
 return {...info,expirationLedger:C.expirationLedger};
}
/** Inspector seam is local to offline tests; the executable has no override option. */
export function inspectOriginalRpcTransaction(result,candidate,{inspectEnvelope=inspectOriginalRpcEnvelope}={}){
 if(!candidate||!hex(candidate.transactionHash)||!ledger(candidate.ledger)||result?.txHash!==candidate.transactionHash||!['SUCCESS','FAILED','NOT_FOUND'].includes(result.status))fail('EXACT_PUBLIC_RPC_TRANSACTION_REQUIRED');
 const base={transactionHash:candidate.transactionHash,rpcStatus:result.status,originalAuthorizationMatched:false,conditionsVerified:false,paymentConfirmed:false};
 if(result.status==='NOT_FOUND')return base;
 if(!ledger(result.ledger)||result.ledger!==candidate.ledger||result.ledger<C.startLedger||result.ledger>=C.endLedger||typeof result.envelopeXdr!=='string'||result.envelopeXdr.length>131072)fail('EXACT_PUBLIC_RPC_TRANSACTION_REQUIRED');
 const info=inspectEnvelope(result.envelopeXdr);
 if(!info||!hex(info.transactionHash)||!hex(info.innerTransactionHash)||typeof info.feeBump!=='boolean'||info.expirationLedger!==C.expirationLedger||candidate.transactionHash!==info.transactionHash&&!(info.feeBump&&candidate.transactionHash===info.innerTransactionHash)||result.feeBump!==undefined&&result.feeBump!==info.feeBump)fail('PUBLIC_RPC_ENVELOPE_HASH_MISMATCH');
 if(info.matchesOriginalAuthorization!==true||info.authorizationFingerprint!==C.authorizationFingerprint)return {...base,ledger:result.ledger,feeBump:info.feeBump};
 return {...base,ledger:result.ledger,feeBump:info.feeBump,originalAuthorizationMatched:true,conditionsVerified:true,paymentConfirmed:result.status==='SUCCESS'};
}
export async function readOriginalTestnetRpcTransfer({fetcher=fetch,now=Date.now,inspectEnvelope=inspectOriginalRpcEnvelope}={}){
 const started=now(),result={version:1,status:'UNCONFIRMED_PUBLIC_ORIGINAL_RPC_RECOVERY',operationId:C.operationId,authorizationFingerprint:C.authorizationFingerprint,network:C.network,startLedger:C.startLedger,endLedgerExclusive:C.endLedger,networkRequests:0,responseBytes:0,rpcMethods:[],transactions:[],paymentConfirmed:false,noMatchProvesNoSubmission:false,transactionResubmissionPermitted:false,...zero};
 const rpc=async(method,params)=>{
  if(!['getHealth','getEvents','getTransaction'].includes(method)||result.networkRequests>=C.maximumCalls||now()-started>C.maximumDurationMs)fail('FOUR_READ_ONLY_PUBLIC_RPC_CALLS_REQUIRED');
  const id=++result.networkRequests;result.rpcMethods.push(method);const request={jsonrpc:'2.0',id,method,...(params===undefined?{}:{params})};
  const response=await fetcher(C.origin,{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify(request),redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(response.status!==200||response.redirected||response.url&&response.url!==C.origin&&response.url!==C.origin+'/'||response.headers.has('location')||response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json'){await response.body?.cancel();fail('EXACT_READ_ONLY_TESTNET_RPC_RESPONSE_REQUIRED');}
  const parts=[],reader=response.body?.getReader();let bytes=0;try{if(reader)for(;;){const b=await reader.read();if(b.done)break;bytes+=b.value.byteLength;result.responseBytes+=b.value.byteLength;if(bytes>C.maximumResponseBytes||result.responseBytes>C.maximumTotalBytes){await reader.cancel();fail('PUBLIC_RPC_RECOVERY_RESPONSE_BOUND');}parts.push(b.value);}}finally{reader?.releaseLock();}
  const raw=Buffer.concat(parts);let body;try{try{body=JSON.parse(raw.toString('utf8'));}catch{fail('PUBLIC_RPC_RECOVERY_JSON_REQUIRED');}}finally{raw.fill(0);parts.forEach(b=>b.fill(0));}
  if(body?.jsonrpc!=='2.0'||body.id!==id||body.error!==undefined||!body.result||typeof body.result!=='object'||Array.isArray(body.result))fail('PUBLIC_RPC_RECOVERY_RESULT_UNCONFIRMED');return body.result;
 };
 try{
  result.health=inspectOriginalRpcHealth(await rpc('getHealth'));
  if(!result.health.requestedRangeRetained){result.status='PUBLIC_RPC_ORIGINAL_LEDGER_WINDOW_UNAVAILABLE';return {...result,observedAt:new Date(now()).toISOString()};}
  const events=inspectOriginalRpcEvents(await rpc('getEvents',originalTransferEventParameters())),{candidates,...counts}=events;result.eventSummary=counts;
  for(const candidate of candidates){const transaction=await rpc('getTransaction',{hash:candidate.transactionHash,xdrFormat:'base64'});try{result.transactions.push(inspectOriginalRpcTransaction(transaction,candidate,{inspectEnvelope}));}catch{result.transactions.push({transactionHash:candidate.transactionHash,paymentConfirmed:false,originalAuthorizationMatched:false,conditionsVerified:false,code:'ORIGINAL_RPC_TRANSACTION_NOT_VERIFIED'});}}
  result.paymentConfirmed=result.transactions.some(v=>v.paymentConfirmed===true);result.status=result.paymentConfirmed?'MATCHING_ORIGINAL_TESTNET_TRANSFER_CONFIRMED':'NO_CONFIRMED_MATCH_IN_BOUNDED_PUBLIC_RPC_WINDOW';
 }catch(error){result.code=safeCode(error);}
 return {...result,observedAt:new Date(now()).toISOString()};
}
async function absent(path){try{await lstat(resolve(path));fail('EXISTING_PUBLIC_RPC_READ_RECOVER_EVIDENCE_ONLY');}catch(e){if(e.code!=='ENOENT')throw e;}}
async function exclusive(path,v){const h=await open(resolve(path),'wx',0o600);try{await h.writeFile(JSON.stringify(v,null,2)+'\n');await h.sync();}finally{await h.close();}}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{const[action='check',flag,pin]=process.argv.slice(2);if(action==='check'&&process.argv.length===3){console.log(JSON.stringify({status:'PREPARED_FOUR_PUBLIC_READ_ONLY_TESTNET_RPC_CALLS',operationId:C.operationId,maximumRequests:4,allowedMethods:['getHealth','getEvents','getTransaction'],networkRequests:0,noMatchProvesNoSubmission:false,transactionResubmissionPermitted:false,...zero}));}else if(action==='read'&&process.argv.length===5&&flag==='--approved-helper-sha256'&&hex(pin)&&pin===sha(await readFile(process.argv[1]))){await absent(C.intent);await absent(C.evidence);await exclusive(C.intent,{operationId:C.operationId,authorizationFingerprint:C.authorizationFingerprint,maximumRequests:4,allowedMethods:['getHealth','getEvents','getTransaction'],at:new Date().toISOString(),...zero});const result=await readOriginalTestnetRpcTransfer();await exclusive(C.evidence,result);console.log(JSON.stringify(result));if(result.status==='UNCONFIRMED_PUBLIC_ORIGINAL_RPC_RECOVERY')process.exitCode=1;}else fail('EXACT_REVIEWED_PUBLIC_RPC_RECOVERY_ACTION_REQUIRED');}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED_PUBLIC_ORIGINAL_RPC_RECOVERY',code:safeCode(e),noMatchProvesNoSubmission:false,transactionResubmissionPermitted:false,...zero}));process.exitCode=1;}
