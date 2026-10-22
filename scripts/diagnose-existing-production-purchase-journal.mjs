// Root-only LOCAL read of one existing encrypted journal. No append or transport.
import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDpapiBuyerJournal,buyerCanonical} from '../examples/marketplace-x402-buyer.mjs';
import {PRODUCTION_PURCHASE_POLICY as C,validateProductionPurchaseApproval} from './on-demand-production-purchase.mjs';
import {validateResumePurchaseControl,ORIGINAL_RESUME_OPERATION as OP,ORIGINAL_FINANCIAL_APPROVAL_SHA as APPROVAL_SHA} from './on-demand-production-purchase-resume.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=v=>sha(buyerCanonical(v)),fail=c=>{throw Error(c);};
const base='.vercel/on-demand-production-purchase-'+OP;
export const EXISTING_PURCHASE_DIAGNOSTIC=Object.freeze({operationId:OP,journal:base+'.journal.dpapi',approval:base+'.approval.json',runtimeSha256:'902c77b7180bd37ef81a88c2f1b1f66128d674009dd7ff2384816e4da4b65e07',resumeSha256:'cad85a26958b65b239cccb27ea72b5f609d041d41cf4f16ef7505ec929e66003',buyerSha256:'a266765ef86d29794e1c94bd1acb414f9da0c2da52e13383c75d6b4be3e0ac9d'});
const P=EXISTING_PURCHASE_DIAGNOSTIC,zero={networkRequests:0,newOrders:0,newSignatures:0,newPaymentSubmissions:0,journalWrites:0,cloudWrites:0,secretValuesInOutput:0,ownerIdsInOutput:0};
const iso=x=>x===undefined?null:typeof x==='string'&&Number.isFinite(Date.parse(x))?x:fail('VALID_SAVED_DIAGNOSTIC_TIMESTAMP_REQUIRED');
const hex=x=>x===undefined?null:typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)?x:fail('VALID_SAVED_DIAGNOSTIC_HASH_REQUIRED');
export function summarizeExistingPurchaseJournal(intent,approval,{journalSha256}={}){
 if(intent?.operationId!==OP||!/^([a-f0-9]{64})$/.test(journalSha256??''))fail('EXACT_EXISTING_OPERATION_DIAGNOSTIC_REQUIRED');
 validateProductionPurchaseApproval(intent,approval);validateResumePurchaseControl(intent,approval);
 if(!['payment-started','payment-uncertain','paid'].includes(intent.phase))fail('EXISTING_SUBMITTED_PURCHASE_DIAGNOSTIC_REQUIRED');
 const c=intent.purchaseControl,o=intent.order;
 if(c.signatures!==1||c.payments!==1||c.gates.join(',')!=='admission,authorization,submission'||c.reservations.length!==1||!intent.resumeControl?.attempted)fail('EXISTING_ONCE_PURCHASE_CONTROLS_REQUIRED');
 if(o&&(o.operationId!==OP||o.cardHash!==C.cardHash||o.inputHash!==intent.inputHash||o.payer!==C.payer||o.destination!==C.destination||o.amount!==C.amount||!['awaiting-payment','payment-submitting','payment-uncertain','paid','executing','execution-uncertain','delivered','delivery-failed'].includes(o.phase)))fail('SAVED_ORDER_IMMUTABLE_BINDING_REQUIRED');
 const lastFailure=intent.lastFailure===undefined?null:['MARKET_CAPACITY','X402_SETTLEMENT_CAPACITY','CAPACITY_WRITE_UNCONFIRMED'].includes(intent.lastFailure)?intent.lastFailure:'REDACTED_UNSTRUCTURED_FAILURE';
 return {status:'READ_ONLY_EXISTING_PRODUCTION_PURCHASE_JOURNAL_DIAGNOSTIC',operationId:OP,journalPhase:intent.phase,orderPhase:o?.phase??null,localSignatures:c.signatures,clientSubmissionAttempts:c.payments,chainSubmissionConfirmed:Boolean(o?.paymentVerifiedAt&&o?.transactionHash),serverSettlementAttemptPresent:Boolean(o?.settlementAttemptId),gates:[...c.gates],reservationCount:c.reservations.length,reservationFingerprint:hash(c.reservations[0]),reservationAmountAtomic:c.reservations[0].amount,maximumSponsoredFeeStroops:C.maxSponsoredFeeStroops,financialApprovalSha256:APPROVAL_SHA,approvalCanonicalSha256:hash(approval),journalSha256,cardHash:intent.cardHash,inputHash:intent.inputHash,challengeHash:hex(intent.challengeHash),payloadHash:hex(intent.payloadHash),paymentSignatureHash:typeof intent.paymentSignature==='string'?sha(intent.paymentSignature):null,expirationLedger:Number.isSafeInteger(intent.expirationLedger)?intent.expirationLedger:null,lastFailure,transactionHash:hex(o?.transactionHash),settlementAttemptFingerprint:typeof o?.settlementAttemptId==='string'?sha(o.settlementAttemptId):null,paymentVerifiedAt:iso(o?.paymentVerifiedAt),deliveryPresent:Boolean(o?.delivery),createdAt:iso(intent.createdAt),lastReadAt:iso(intent.lastReadAt),orderCreatedAt:iso(o?.createdAt),orderUpdatedAt:iso(o?.updatedAt),interpretation:o?.paymentVerifiedAt&&o?.transactionHash?'SAVED_ORDER_HAS_VERIFIED_PAYMENT':'CLIENT_SUBMISSION_ATTEMPT_RECORDED_CHAIN_OUTCOME_UNCONFIRMED',resubmitPermitted:false,...zero};
}
function own(root,path){const p=resolve(root,path),r=relative(root,p);if(!r||r==='..'||r.startsWith('..'+sep)||isAbsolute(r))fail('EXACT_EXISTING_DIAGNOSTIC_PATH_REQUIRED');return p;}
async function bounded(root,path){const p=own(root,path),s=await lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size>2097152)fail('BOUNDED_EXISTING_DIAGNOSTIC_FILE_REQUIRED');return readFile(p);}
export async function existingPurchaseJournalDiagnostic(action='check',root=process.cwd()){
 if(action==='check')return {status:'PREPARED_LOCAL_READ_ONLY_EXISTING_PURCHASE_DIAGNOSTIC',operationId:OP,dpapiReads:0,...zero};
 if(action!=='read')fail('EXACT_EXISTING_JOURNAL_READ_ONLY_ACTION_REQUIRED');
 for(const[path,pin]of [['scripts/on-demand-production-purchase.mjs',P.runtimeSha256],['scripts/on-demand-production-purchase-resume.mjs',P.resumeSha256],['examples/marketplace-x402-buyer.mjs',P.buyerSha256]])if(sha(await bounded(root,path))!==pin)fail('SEALED_PURCHASE_DIAGNOSTIC_SOURCE_REQUIRED');
 const before=await bounded(root,P.journal),approvalBytes=await bounded(root,P.approval);if(sha(approvalBytes)!==APPROVAL_SHA)fail('ORIGINAL_FINANCIAL_APPROVAL_UNCHANGED_REQUIRED');
 const intent=await createDpapiBuyerJournal(own(root,P.journal)).read();
 if(sha(await bounded(root,P.journal))!==sha(before))fail('JOURNAL_CHANGED_DURING_READ_ONLY_DIAGNOSTIC');
 return {...summarizeExistingPurchaseJournal(intent,JSON.parse(approvalBytes),{journalSha256:sha(before)}),dpapiReads:1};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{const[action='check',flag,pin]=process.argv.slice(2);if(action==='check'){if(process.argv.length!==3)fail('EXACT_LOCAL_DIAGNOSTIC_CHECK_REQUIRED');}else if(action!=='read'||process.argv.length!==5||flag!=='--approved-helper-sha256'||pin!==sha(await readFile(process.argv[1])))fail('EXACT_REVIEWED_LOCAL_DIAGNOSTIC_HELPER_REQUIRED');console.log(JSON.stringify(await existingPurchaseJournalDiagnostic(action)));}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED_LOCAL_PURCHASE_DIAGNOSTIC',code:/^[A-Z][A-Z0-9_]{2,95}$/.test(e.message??'')?e.message:'LOCAL_PURCHASE_DIAGNOSTIC_UNCONFIRMED',resubmitPermitted:false,...zero}));process.exitCode=1;}
