// Local evidence bridge only. No network, DPAPI, signer, order or payment.
import {readFile,lstat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PRODUCTION_PURCHASE_POLICY as B} from './on-demand-production-purchase.mjs';
import {buyerCanonical} from '../examples/marketplace-x402-buyer.mjs';
import {validateSupplementalPurchaseDeployment,ORIGINAL_RESUME_OPERATION,ORIGINAL_FINANCIAL_APPROVAL_SHA} from './on-demand-production-purchase-resume.mjs';
import {CORRECTIVE_PUBLIC_VALIDATION as R,validateCorrectivePublicReceipts,composeCorrectiveAcceptance} from './validate-isolated-readiness-production-public.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=v=>sha(buyerCanonical(v)),same=(a,b)=>buyerCanonical(a)===buyerCanonical(b),fail=c=>{throw Error(c);};
export const CORRECTIVE_DEPLOYMENT_EVIDENCE_POLICY=Object.freeze({deploymentId:'dpl_FvQkLb6mjhHm75SeETDhniFFqkZs',readyReceiptSha256:'6dcc078b074f7ccbf4ce62e96f8942ab433595384debfce2717b59022f99bb84',supplementalApprovalSha256:'b7294c1bedaa72114cbda9acb75f450cf79b7f268ed8b710b94067d6235dcf4e',approval:'.vercel/on-demand-production-purchase-resume-deployment-approval.json',financialApproval:'.vercel/on-demand-production-purchase-'+ORIGINAL_RESUME_OPERATION+'.approval.json',output:'docs/evidence/on-demand-v3-purchase-corrective-bazaar-deployment-2026-10-12.json'});
const C=CORRECTIVE_DEPLOYMENT_EVIDENCE_POLICY,zero={newAccounts:0,newOrders:0,newPayments:0,signatures:0,providerExecutions:0,providerTicks:0,readinessInvocations:0,networkRequests:0,cloudWrites:0,dpapiReads:0,secretValuesInOutput:0,ownerIdsInOutput:0};
export function composeCorrectivePurchaseDeployment(input,now=Date.now()){
 const {receipts,acceptance,publicEvidence,qrProof,identityProof,supplementalApproval}=input;
 if(input.supplementalApprovalSha256!==C.supplementalApprovalSha256||input.financialApprovalSha256!==ORIGINAL_FINANCIAL_APPROVAL_SHA||input.readyReceiptSha256!==C.readyReceiptSha256)fail('SEALED_REAL_RECEIPT_AND_APPROVAL_HASHES_REQUIRED');
 const b=receipts?.bazaar;validateCorrectivePublicReceipts(receipts,now);
 if(b.deploymentId!==C.deploymentId||b.canonicalAssignmentSource!=='V4_ALIAS_AND_PROJECT_PRODUCTION_TARGET'||!same(b.canonicalAliasProof,{host:'bazaar.browns.studio',deploymentId:C.deploymentId,projectId:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3'})||b.projectProductionTarget!==C.deploymentId||b.projectCronDeploymentId!==C.deploymentId||!same(b.providerCanonicalAliasProof,{host:'ai-video-scriptwriter.vercel.app',deploymentId:B.deploymentIds.provider,projectId:'prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K'})||b.readOnly!==true||b.cloudWrites!==0||b.promotions!==0||b.deployments!==0)fail('REAL_AUTHORITATIVE_CANONICAL_CONFIRMATION_REQUIRED');
 const observed=Date.parse(acceptance?.observedAt??'');if(!Number.isFinite(observed)||observed>now||now-observed>600000)fail('FRESH_REAL_CORRECTIVE_ACCEPTANCE_REQUIRED');
 // Reconstruct the already observed acceptance at its original time. Never invent
 // a new observation or replace private identity evidence with public discovery.
 const reconstructed=composeCorrectiveAcceptance(receipts,publicEvidence,qrProof,identityProof,observed);
 if(!same(reconstructed,acceptance))fail('EXACT_REAL_PUBLIC_QR_IDENTITY_ACCEPTANCE_REQUIRED');
 const proof={version:4,status:'CANONICAL_RESTRICTED_PURCHASE_CORRECTIVE_PRODUCTION_READY',readyState:'READY',target:'production',canonicalOrigin:B.origin,operationId:ORIGINAL_RESUME_OPERATION,planHash:B.planHash,reviewHash:B.reviewHash,sourceDigest:R.sourceDigest,deploymentId:C.deploymentId,previousSourceDigest:B.sourceDigests.bazaar,previousDeploymentId:B.deploymentIds.bazaar,providerSourceDigest:B.sourceDigests.provider,providerDeploymentId:B.deploymentIds.provider,correctiveReleasePlanHash:R.releasePlanHash,correctiveReviewHash:R.reviewHash,supplementalReviewHash:R.supplementalReviewHash,validationFamily:R.validationFamily,validationPreviewPlanHash:R.validationPreviewPlanHash,manifestSha256:R.manifestSha256,url:b.url,crons:b.crons,generalPurchasesEnabled:false,financialApprovalSha256:ORIGINAL_FINANCIAL_APPROVAL_SHA,financialApprovalPreserved:true,newPaymentAuthorization:false,supplementalApprovalSha256:C.supplementalApprovalSha256,readyReceiptSha256:C.readyReceiptSha256,readyReceiptCanonicalSha256:hash(b),publicProtectionEvidenceSha256:hash(receipts.protection),acceptanceEvidenceSha256:hash(acceptance),publicEvidenceSha256:hash(publicEvidence),identityEvidenceSha256:hash(identityProof),qrEvidenceSha256:hash(qrProof),canonicalAssignmentSource:b.canonicalAssignmentSource,canonicalAliasProof:b.canonicalAliasProof,publicProtectionPreserved:true,privateAccountBindingPreserved:true,observedAt:new Date(now).toISOString(),...zero};
 validateSupplementalPurchaseDeployment(supplementalApproval,proof,acceptance);
 return proof;
}
const pinned={
 'scripts/on-demand-production-purchase.mjs':'902c77b7180bd37ef81a88c2f1b1f66128d674009dd7ff2384816e4da4b65e07',
 'scripts/on-demand-production-purchase-resume.mjs':'cad85a26958b65b239cccb27ea72b5f609d041d41cf4f16ef7505ec929e66003',
 '.vercel/on-demand-production-purchase-v3-control.mjs':'bd6546df7e3ff30a28b6bc7dbe7c5e5ea7e3a4a719da85f16b00644326896e5f',
 'scripts/validate-isolated-readiness-production-public.mjs':'883df63583b9e4a1a03fc0b21e7d31a09be45122e0f8f17ffe46956b3b7c6798',
 [R.deploymentReceipt]:C.readyReceiptSha256,[C.approval]:C.supplementalApprovalSha256,[C.financialApproval]:ORIGINAL_FINANCIAL_APPROVAL_SHA
};
function own(root,path){const p=resolve(root,path),r=relative(root,p);if(!r||r==='..'||r.startsWith('..'+sep)||isAbsolute(r))fail('EXACT_LOCAL_EVIDENCE_PATH_REQUIRED');return p;}
async function bytes(root,path){const p=own(root,path),s=await lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size>1048576)fail('BOUNDED_PLAIN_LOCAL_EVIDENCE_REQUIRED');return readFile(p);}
async function exclusive(root,path,value){const f=await open(own(root,path),'wx',0o600);try{await f.writeFile(JSON.stringify(value,null,2)+'\n');await f.sync();}finally{await f.close();}}
export async function correctivePurchaseDeploymentEvidence(action='check',root=process.cwd(),deps={}){
 if(action==='check')return {status:'PREPARED_LOCAL_REAL_CORRECTIVE_DEPLOYMENT_EVIDENCE',operationId:ORIGINAL_RESUME_OPERATION,deploymentId:C.deploymentId,output:C.output,...zero};
 if(action!=='compose')fail('LOCAL_EVIDENCE_COMPOSE_ONLY');root=resolve(root);
 const read=deps.readBytes??(p=>bytes(root,p)),write=deps.writeExclusive??((p,v)=>exclusive(root,p,v)),now=deps.now??Date.now;
 for(const[path,pin]of Object.entries(pinned))if(sha(await read(path))!==pin)fail('SEALED_ORIGINAL_SOURCE_RECEIPT_OR_APPROVAL_CHANGED');
 const json=async p=>JSON.parse((await read(p)).toString('utf8'));
 const input={receipts:{bazaar:await json(R.deploymentReceipt),provider:await json(R.providerReceipt),protection:await json(R.protectionReceipt)},acceptance:await json(R.finalEvidence),publicEvidence:await json(R.evidence),qrProof:await json(R.qrProof),identityProof:await json(R.identityEvidence),supplementalApproval:await json(C.approval),supplementalApprovalSha256:C.supplementalApprovalSha256,financialApprovalSha256:ORIGINAL_FINANCIAL_APPROVAL_SHA,readyReceiptSha256:C.readyReceiptSha256};
 const result=composeCorrectivePurchaseDeployment(input,now());await write(C.output,result);return {status:result.status,evidence:C.output,operationId:result.operationId,deploymentId:result.deploymentId,evidenceCanonicalSha256:hash(result),...zero};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{const[action='check',flag,pin]=process.argv.slice(2);if(action==='check'){if(process.argv.length!==3)fail('EXACT_LOCAL_CHECK_REQUIRED');}else if(action!=='compose'||process.argv.length!==5||flag!=='--approved-helper-sha256'||pin!==sha(await readFile(process.argv[1])))fail('EXACT_REVIEWED_LOCAL_EVIDENCE_HELPER_REQUIRED');console.log(JSON.stringify(await correctivePurchaseDeploymentEvidence(action)));}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED_LOCAL_DEPLOYMENT_EVIDENCE',code:/^[A-Z][A-Z0-9_]{2,95}$/.test(e.message??'')?e.message:'LOCAL_DEPLOYMENT_EVIDENCE_UNCONFIRMED',...zero}));process.exitCode=1;}
