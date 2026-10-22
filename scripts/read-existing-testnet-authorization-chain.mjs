// Public read-only search for the original authorization. Never signs/submits.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Address,FeeBumpTransaction,Keypair,Networks,StrKey,TransactionBuilder,hash,scValToNative,xdr} from '@stellar/stellar-sdk';
import {buyerCanonical} from '../examples/marketplace-x402-buyer.mjs';
import {PRODUCTION_PURCHASE_POLICY as B} from './on-demand-production-purchase.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),fail=c=>{throw Error(c);};
export const EXISTING_CHAIN_RECOVERY_POLICY=Object.freeze({operationId:'31c97193-be74-4b9d-b0a3-f3890b0a41e8',origin:'https://horizon-testnet.stellar.org',payer:B.payer,destination:B.destination,amountAtomic:B.maximumAtomic,settlement:B.publicCard.payment.identity,authorizationFingerprint:'f3f6b5faabcd76dc9e71d2e49875ce186d69fc6d423ab05da0ae94890e597293',maximumRequests:2,maximumRecordsPerAccount:20,maximumResponseBytes:1048576});
const C=EXISTING_CHAIN_RECOVERY_POLICY,zero={newOrders:0,newSignatures:0,newPaymentSubmissions:0,cloudWrites:0,dpapiReads:0,secretValuesInOutput:0,ownerIdsInOutput:0};
/** Same pure authorization checks as frozen235 marketplace-x402.ts; supports
 * submitted fee bumps. No transaction/authorization bytes leave this function. */
export function inspectExistingRecoveryEnvelope(raw,policy=C){
 if(typeof raw!=='string'||!raw||Buffer.byteLength(raw)>131072)fail('BOUNDED_RECOVERY_ENVELOPE_REQUIRED');
 const envelope=TransactionBuilder.fromXDR(raw,Networks.TESTNET),tx=envelope instanceof FeeBumpTransaction?envelope.innerTransaction:envelope,op=tx.operations[0];
 if(tx.operations.length!==1||op.type!=='invokeHostFunction'||op.func.switch().name!=='hostFunctionTypeInvokeContract'||op.auth?.length!==1)fail('EXACT_RECOVERY_TRANSFER_REQUIRED');
 const invocation=op.func.invokeContract(),args=invocation.args();
 if(Address.fromScAddress(invocation.contractAddress()).toString()!==policy.settlement.sacContract||invocation.functionName().toString()!=='transfer'||args.length!==3||scValToNative(args[0])!==policy.payer||scValToNative(args[1])!==policy.destination||BigInt(scValToNative(args[2]))!==BigInt(policy.amountAtomic))fail('EXACT_RECOVERY_TRANSFER_REQUIRED');
 const auth=op.auth[0];
 if(auth.credentials().switch().name!=='sorobanCredentialsAddress'||auth.rootInvocation().subInvocations().length!==0||auth.rootInvocation().function().switch().name!=='sorobanAuthorizedFunctionTypeContractFn'||auth.rootInvocation().function().contractFn().toXDR('base64')!==invocation.toXDR('base64'))fail('EXACT_RECOVERY_AUTHORIZATION_REQUIRED');
 const credentials=auth.credentials().address();
 if(Address.fromScAddress(credentials.address()).toString()!==policy.payer||credentials.signatureExpirationLedger()<=0)fail('EXACT_RECOVERY_AUTHORIZATION_REQUIRED');
 const signatures=scValToNative(credentials.signature());if(!Array.isArray(signatures)||signatures.length<1||signatures.length>20)fail('EXACT_RECOVERY_SIGNATURES_REQUIRED');
 const preimage=xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({networkId:hash(Buffer.from(Networks.TESTNET)),nonce:credentials.nonce(),invocation:auth.rootInvocation(),signatureExpirationLedger:credentials.signatureExpirationLedger()}));
 for(const signature of signatures)if(!signature.public_key||!signature.signature||!Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(Buffer.from(signature.public_key))).verify(hash(preimage.toXDR()),Buffer.from(signature.signature)))fail('EXACT_RECOVERY_SIGNATURES_REQUIRED');
 const fingerprint=sha(buyerCanonical({network:'stellar:testnet',payer:policy.payer,nonce:credentials.nonce().toString()}));
 return {authorizationFingerprint:fingerprint,matchesOriginalAuthorization:fingerprint===policy.authorizationFingerprint,transactionHash:envelope.hash().toString('hex'),innerTransactionHash:tx.hash().toString('hex'),feeBump:envelope instanceof FeeBumpTransaction};
}
export function inspectHorizonRecoveryRecords(body,account,policy=C){
 const rows=body?._embedded?.records;if(!Array.isArray(rows)||rows.length>20)fail('BOUNDED_COMPLETE_HORIZON_RECORDS_REQUIRED');
 const candidates=[];let inspected=0,unmatched=0,unparseable=0;
 for(const row of rows){inspected++;try{if(typeof row.hash!=='string'||!/^[a-f0-9]{64}$/.test(row.hash)||typeof row.successful!=='boolean'||typeof row.created_at!=='string'||!Number.isFinite(Date.parse(row.created_at)))throw Error();const info=inspectExistingRecoveryEnvelope(row.envelope_xdr,policy);if(row.hash!==info.transactionHash&&!(info.feeBump&&row.hash===info.innerTransactionHash&&row.fee_bump_transaction?.hash===info.transactionHash))throw Error();if(!info.matchesOriginalAuthorization){unmatched++;continue;}candidates.push({transactionHash:info.transactionHash,observedRecordHash:row.hash,createdAt:row.created_at,successful:row.successful,authorizationFingerprint:info.authorizationFingerprint,feeBump:info.feeBump,observedOn:account===policy.payer?'buyer':'seller'});}catch{unparseable++;}}
 return {inspected,unmatched,unparseable,candidates};
}
export async function readExistingTestnetAuthorization({fetcher=fetch,now=Date.now,policy=C}={}){
 const started=now(),candidates=new Map(),accounts=[];let requests=0,totalBytes=0;
 for(const account of [policy.payer,policy.destination]){
  const url=policy.origin+'/accounts/'+account+'/transactions?limit=20&order=desc';if(++requests>2||now()-started>45000)fail('BOUNDED_TWO_PUBLIC_READS_REQUIRED');
  const response=await fetcher(url,{method:'GET',headers:{accept:'application/json'},redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
  const mediaType=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if(response.status!==200||response.redirected||response.url&&response.url!==url||response.headers.has('location')||!['application/json','application/hal+json'].includes(mediaType))fail('EXACT_PUBLIC_TESTNET_HORIZON_READ_REQUIRED');
  const parts=[],reader=response.body?.getReader();let bytes=0;try{if(reader)for(;;){const b=await reader.read();if(b.done)break;bytes+=b.value.length;totalBytes+=b.value.length;if(bytes>1048576||totalBytes>2097152){await reader.cancel();fail('BOUNDED_PUBLIC_CHAIN_RESPONSE_REQUIRED');}parts.push(b.value);}}finally{reader?.releaseLock();}
  let parsed;try{parsed=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail('COMPLETE_PUBLIC_CHAIN_RESPONSE_REQUIRED');}
  const result=inspectHorizonRecoveryRecords(parsed,account,policy);accounts.push({role:account===policy.payer?'buyer':'seller',recordsInspected:result.inspected,unmatched:result.unmatched,unparseable:result.unparseable});
  for(const candidate of result.candidates){const prior=candidates.get(candidate.transactionHash);if(prior){if(prior.createdAt!==candidate.createdAt||prior.successful!==candidate.successful)fail('CONFLICTING_PUBLIC_CHAIN_OBSERVATIONS');prior.observedOn=[...new Set([...prior.observedOn,candidate.observedOn])];}else candidates.set(candidate.transactionHash,{...candidate,observedOn:[candidate.observedOn]});}
 }
 return {status:candidates.size?'MATCHING_ORIGINAL_AUTHORIZATION_CANDIDATE_REQUIRES_RPC_CONFIRMATION':'NO_MATCH_IN_BOUNDED_PUBLIC_HORIZON_WINDOW',operationId:policy.operationId,authorizationFingerprint:policy.authorizationFingerprint,candidates:[...candidates.values()],accounts,networkRequests:requests,observedAt:new Date(now()).toISOString(),responseBytes:totalBytes,noMatchProvesNoSubmission:false,transactionResubmissionPermitted:false,...zero};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{const[action='check',flag,pin]=process.argv.slice(2);if(action==='check'){if(process.argv.length!==3)fail('EXACT_LOCAL_CHAIN_CHECK_REQUIRED');console.log(JSON.stringify({status:'PREPARED_TWO_PUBLIC_TESTNET_CHAIN_READS',operationId:C.operationId,maximumRequests:2,networkRequests:0,...zero}));}else{if(action!=='read'||process.argv.length!==5||flag!=='--approved-helper-sha256'||pin!==sha(await readFile(process.argv[1])))fail('EXACT_REVIEWED_PUBLIC_CHAIN_READ_REQUIRED');console.log(JSON.stringify(await readExistingTestnetAuthorization()));}}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED_PUBLIC_CHAIN_RECOVERY',code:/^[A-Z][A-Z0-9_]{2,95}$/.test(e.message??'')?e.message:'PUBLIC_CHAIN_RECOVERY_UNCONFIRMED',transactionResubmissionPermitted:false,noMatchProvesNoSubmission:false,...zero}));process.exitCode=1;}
