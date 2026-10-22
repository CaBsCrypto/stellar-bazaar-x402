import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {composeCorrectivePurchaseDeployment,correctivePurchaseDeploymentEvidence,CORRECTIVE_DEPLOYMENT_EVIDENCE_POLICY as C} from './compose-isolated-corrective-purchase-deployment.mjs';
import {CORRECTIVE_PUBLIC_VALIDATION as R,composeCorrectiveAcceptance} from './validate-isolated-readiness-production-public.mjs';
import {PRODUCTION_PURCHASE_POLICY as B} from './on-demand-production-purchase.mjs';
import {ORIGINAL_RESUME_OPERATION,ORIGINAL_FINANCIAL_APPROVAL_SHA,validateSupplementalPurchaseDeployment} from './on-demand-production-purchase-resume.mjs';
import {buyerCanonical} from '../examples/marketplace-x402-buyer.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=v=>sha(buyerCanonical(v));let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=(f,re)=>{assert.throws(f,re);checks++;};
const readyBytes=await readFile(R.deploymentReceipt),ready=JSON.parse(readyBytes),provider=JSON.parse(await readFile(R.providerReceipt)),approvalBytes=await readFile(C.approval),approval=JSON.parse(approvalBytes),now=Date.parse('2026-10-12T06:00:00Z'),observedAt=new Date(now).toISOString();
eq(sha(readyBytes),C.readyReceiptSha256);eq(sha(approvalBytes),C.supplementalApprovalSha256);
const zero={newAccounts:0,newOrders:0,newPayments:0,signatures:0,providerExecutions:0,providerTicks:0,readinessInvocations:0,secretValuesInOutput:0,ownerIdsInOutput:0};
function fixture(){
 const protection={status:'PASS_READINESS_GUARD_FIX_PRODUCTION_PUBLIC_READBACK',releasePlanHash:R.releasePlanHash,reviewHash:R.reviewHash,supplementalReviewHash:R.supplementalReviewHash,validationFamily:R.validationFamily,validationPreviewPlanHash:R.validationPreviewPlanHash,sourceDigest:R.sourceDigest,deploymentId:C.deploymentId,url:ready.url,providerSourceDigest:R.providerSourceDigest,providerDeploymentId:R.providerDeploymentId,originalSsoPreserved:true,environmentReferencesUnchanged:true,newImmutableHostAllowed:true,oldImmutableHostBlocked:true,publicConditionGroups:22,temporaryMcpExceptionActive:false,otherPreviewHostsPreserved:true,noSystemBypasses:true,activeProtectionsHash:'f'.repeat(64),newPayments:0,observedAt};
 const publicEvidence={status:'PASS_CORRECTIVE_PUBLIC_DISCOVERY_QR_DECODE_PENDING',sourceDigest:R.sourceDigest,deploymentId:C.deploymentId,correctiveReleasePlanHash:R.releasePlanHash,supplementalReviewHash:R.supplementalReviewHash,validationFamily:R.validationFamily,validationPreviewPlanHash:R.validationPreviewPlanHash,canonicalOrigin:R.origin,generalPurchasesEnabled:false,publicProtectionPreserved:true,privateAccountBindingPreserved:false,requests:12,observedAt,qr:{service:{sha256:'a'.repeat(64)},general:{sha256:'b'.repeat(64)}},...zero};
 const qrProof={status:'PASS_CORRECTIVE_PRODUCTION_QR_INDEPENDENTLY_DECODED',sourceDigest:R.sourceDigest,deploymentId:C.deploymentId,correctiveReleasePlanHash:R.releasePlanHash,supplementalReviewHash:R.supplementalReviewHash,publicEvidenceSha256:hash(publicEvidence),service:{sha256:publicEvidence.qr.service.sha256,destination:R.origin+'/resources/'+R.serviceId,independentlyDecoded:true},general:{sha256:publicEvidence.qr.general.sha256,destination:R.origin+'/demo',independentlyDecoded:true},networkRequests:0,credentialReads:0,newOrders:0,newPayments:0,signatures:0,providerExecutions:0};
 const identityProof={status:'PASS_REAL_SEALED_CORRECTIVE_BUYER_IDENTITY',correctiveReleasePlanHash:R.releasePlanHash,supplementalReviewHash:R.supplementalReviewHash,sourceDigest:R.sourceDigest,deploymentId:C.deploymentId,canonicalOrigin:R.origin,publicEvidenceSha256:hash(publicEvidence),ownerFingerprint:B.ownerFingerprint,generation:1,privateAccountBindingPreserved:true,authenticatedRequests:1,credentialInAuthorizationHeaderOnly:true,observedAt,...zero};
 const receipts={bazaar:structuredClone(ready),provider:structuredClone(provider),protection};
 return {receipts,publicEvidence,qrProof,identityProof,acceptance:composeCorrectiveAcceptance(receipts,publicEvidence,qrProof,identityProof,now),supplementalApproval:structuredClone(approval),supplementalApprovalSha256:C.supplementalApprovalSha256,financialApprovalSha256:ORIGINAL_FINANCIAL_APPROVAL_SHA,readyReceiptSha256:C.readyReceiptSha256};
}
const good=fixture(),proof=composeCorrectivePurchaseDeployment(good,now);
eq(proof.status,'CANONICAL_RESTRICTED_PURCHASE_CORRECTIVE_PRODUCTION_READY');eq(proof.planHash,B.planHash);eq(proof.reviewHash,B.reviewHash);eq(proof.correctiveReleasePlanHash,R.releasePlanHash);eq(proof.correctiveReviewHash,R.reviewHash);eq(proof.operationId,ORIGINAL_RESUME_OPERATION);eq(proof.deploymentId,C.deploymentId);eq(proof.providerDeploymentId,B.deploymentIds.provider);eq(proof.financialApprovalSha256,ORIGINAL_FINANCIAL_APPROVAL_SHA);eq(proof.newPaymentAuthorization,false);eq(proof.newOrders,0);eq(proof.newPayments,0);eq(proof.signatures,0);eq(proof.dpapiReads,0);eq(proof.networkRequests,0);eq(proof.publicProtectionEvidenceSha256,hash(good.receipts.protection));eq(proof.acceptanceEvidenceSha256,hash(good.acceptance));eq(proof.privateAccountBindingPreserved,true);eq(validateSupplementalPurchaseDeployment(good.supplementalApproval,proof,good.acceptance).deploymentId,C.deploymentId);
for(const mutate of [
 x=>x.readyReceiptSha256='bad',x=>x.supplementalApprovalSha256='bad',x=>x.financialApprovalSha256='bad',
 x=>x.receipts.bazaar.deploymentId=B.deploymentIds.bazaar,
 x=>x.receipts.bazaar.projectProductionTarget=B.deploymentIds.bazaar,
 x=>x.receipts.bazaar.canonicalAliasProof.deploymentId=B.deploymentIds.bazaar,
 x=>x.receipts.bazaar.canonicalAssignmentSource='HISTORICAL_DEPLOYMENT_ALIAS',
 x=>x.receipts.bazaar.generalPurchasesEnabled=true,
 x=>x.receipts.provider.deploymentId='dpl_Other',
 x=>x.receipts.protection.temporaryMcpExceptionActive=true,
 x=>x.receipts.protection.oldImmutableHostBlocked=false,
 x=>x.receipts.protection.originalSsoPreserved=false,
 x=>x.receipts.protection.environmentReferencesUnchanged=false,
 x=>x.receipts.protection.observedAt='2026-10-12T05:40:00Z',
 x=>x.acceptance.privateAccountBindingPreserved=false,
 x=>x.acceptance.observedAt='2026-10-12T05:40:00Z',
 x=>x.acceptance.observedAt='2026-10-12T06:01:00Z',
 x=>x.acceptance.inventedObservation=true,
 x=>x.publicEvidence.newOrders=1,
 x=>x.qrProof.service.destination='https://foreign.example/',
 x=>x.identityProof.ownerFingerprint='f'.repeat(64),
 x=>x.identityProof.authenticatedRequests=0,
 x=>x.supplementalApproval.newPaymentAuthorization=true,
 x=>x.supplementalApproval.current.deploymentId='dpl_Other',
 x=>x.supplementalApproval.reviewHash=R.reviewHash
]){const x=fixture();mutate(x);reject(()=>composeCorrectivePurchaseDeployment(x,now),/REQUIRED|CHANGED|FORBIDDEN|BEFORE|ACCEPTANCE/);}
const expected=await correctivePurchaseDeploymentEvidence('check');eq(expected.networkRequests,0);eq(expected.dpapiReads,0);eq(expected.newOrders,0);
await assert.rejects(()=>correctivePurchaseDeploymentEvidence('execute'),/LOCAL_EVIDENCE_COMPOSE_ONLY/);checks++;
let writes=0;await assert.rejects(()=>correctivePurchaseDeploymentEvidence('compose',process.cwd(),{readBytes:async()=>Buffer.from('changed'),writeExclusive:async()=>{writes++;}}),/SEALED_ORIGINAL_SOURCE_RECEIPT_OR_APPROVAL_CHANGED/);checks++;eq(writes,0);
eq(JSON.stringify(proof).includes('agentAccess'),false);eq(JSON.stringify(proof).includes('ownerId'),true);eq(Object.hasOwn(proof,'ownerId'),false);
console.log(JSON.stringify({status:'PASS_OFFLINE_REAL_CORRECTIVE_DEPLOYMENT_EVIDENCE',checks,outputReceiptsWritten:0,networkRequests:0,cloudWrites:0,dpapiReads:0,newOrders:0,newPayments:0,signatures:0}));
