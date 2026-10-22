// Record non-sensitive local/reported evidence and refresh prepared review only.
// Does not import private controllers, read DPAPI or call any external service.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {continuousProductionWafReview} from './prepare-continuous-production-waf-proposal.mjs';

const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const now=new Date().toISOString();
const localPath='docs/evidence/continuous-release-preparation-local-2026-10-11.json';
const local={version:1,status:'PASS',environment:'local-synthetic-and-read-only-source',observedAt:now,
 sourceSha256:Object.fromEntries(await Promise.all(['lib/operational-route-gate.ts','lib/market-guardian-cron.ts','lib/market-guardian.ts','scripts/test-market-guardian-cron.mjs','.vercel/continuous-production-acceptance-binding.mjs','.vercel/test-continuous-production-acceptance-binding.mjs','scripts/prepare-continuous-production-waf-proposal.mjs','scripts/test-continuous-production-waf-proposal.mjs','scripts/prepare-continuous-production-bazaar-source.mjs','scripts/test-continuous-production-bazaar-source.mjs'].map(async path=>[path,await digest(path)]))),
 results:[
  {file:'scripts/test-market-guardian-cron.mjs',status:'PASS',actualNextProxyCases:27,networkRequests:0,scheduledExecutionValidated:false},
  {file:'scripts/test-operational-boundary.mjs',status:'PASS',networkRequests:0},
  {file:'scripts/test-market-review.mjs',status:'PASS',checkGroups:16,measuredRouteCases:28,actualMeasuredProxyAndGet:true,networkRequests:0},
  {file:'node_modules/typescript/bin/tsc --noEmit --incremental false',status:'PASS',exitCode:0},
  {file:'.vercel/test-continuous-production-acceptance-binding.mjs',status:'PASS',checks:65,actualPrivateReads:0,dpapiExecutions:0,realFilesWritten:0,networkRequests:0},
  {file:'scripts/test-continuous-production-waf-proposal.mjs',status:'PASS',truthTableCases:9828,inputRejections:9,proposedConditionGroups:22,networkRequests:0,vercelSchemaAcceptance:false},
  {file:'scripts/test-continuous-production-bazaar-source.mjs',status:'PASS',checks:11,filesInspected:336,identicalFiles:335,onlyChange:'vercel.json crons proposal',networkRequests:0},
 ],
 actualPrivateReadsByThisAgent:0,newPayments:0,cloudMutations:0,productionPublished:false,cronActivated:false,
 limitations:['Local proxy proof is not scheduled Vercel execution','WAF predicate truth table is not remote schema acceptance','Binding real preparation was executed and reported separately by release owner','Production source preparation changes local vercel.json only; no production activation'],
};
await writeFile(localPath,JSON.stringify(local,null,2)+'\n',{flag:'wx',mode:0o600});
const cloud=await readJson('docs/evidence/continuous-cloud-current-2026-10-11.json');
const waf=continuousProductionWafReview(cloud);waf.localPredicateEvidence={path:localPath,status:'PASS',truthTableCases:9828,inputRejections:9,proposedConditionGroups:22,remoteSchemaAcceptance:false};
await writeFile('docs/release/continuous-production-waf-proposal-2026-10-11.json',JSON.stringify(waf,null,2)+'\n',{mode:0o600});
const reviewPath='docs/release/continuous-production-review-2026-10-11.json',review=await readJson(reviewPath);
const previewManifestPath='docs/evidence/hackathon-functional-preview-v3-source-2026-10-11.json';
const previewManifest=await readJson(previewManifestPath),previewDeployment=await readJson('docs/evidence/functional-preview-v3-deployment-2026-10-11.json'),previewAcceptance=await readJson('docs/evidence/functional-preview-v3-acceptance-2026-10-11.json');
if(previewAcceptance.status!=='PASS'||previewAcceptance.candidate!==previewManifest.candidate||previewAcceptance.effectiveSourceDigest!==previewManifest.effectiveSourceDigest||previewAcceptance.deploymentId!==previewDeployment.deploymentId)throw Error('MATCHED_V3_ACCEPTANCE_REQUIRED');
const productionManifestPath='docs/evidence/hackathon-continuous-production-bazaar-source-2026-10-11.json',productionManifest=await readJson(productionManifestPath);
review.updatedAt=now;
review.candidate={
 frozenPreviewCandidate:previewManifest.candidate,sourceDirectory:previewManifest.sourceDirectory,effectiveSourceDigest:previewManifest.effectiveSourceDigest,manifest:previewManifestPath,manifestSha256:await digest(previewManifestPath),deploymentFileCount:336,previewCronSchedules:[],buildPassedReportedByReleaseOwner:true,
 protectedPreview:{deploymentId:previewDeployment.deploymentId,url:previewDeployment.url,readyState:'READY',acceptance:'PASS',checks:previewAcceptance.checks.length,requests:previewAcceptance.requests,externalPublicAccessValidated:false},
 productionPrepared:{candidate:productionManifest.candidate,sourceDirectory:productionManifest.sourceDirectory,effectiveSourceDigest:productionManifest.effectiveSourceDigest,manifest:productionManifestPath,manifestSha256:await digest(productionManifestPath),files:336,identicalSourceFiles:335,onlyChangedFile:'vercel.json',onlySemanticChange:'guardian crons */15 * * * *',localVerificationPassed:true,productionPublished:false,cronActivated:false},
 providerProductionSource:{status:'PREPARATION_BY_PROVIDER_OWNER_PENDING',effectiveSourceDigest:null,manifest:null,manifestSha256:null},
};
review.evidence.protectedPreviewFinal={path:'docs/evidence/functional-preview-v3-acceptance-2026-10-11.json',status:'PASS',candidate:previewManifest.candidate,checks:previewAcceptance.checks.length,requests:previewAcceptance.requests,newAccountsBound:previewAcceptance.newAccountsBound,newOrders:previewAcceptance.newOrders,newPayments:previewAcceptance.newPayments,providerExecutions:previewAcceptance.providerExecutions,privateReviewPaginationPassed:previewAcceptance.checks.includes('REVIEW_PAGINATION_BOUND'),providerSubmissionPassed:previewAcceptance.checks.includes('NATIVE_AGENT_SUBMISSION'),revocationPassed:previewAcceptance.checks.includes('REVOKED_AGENT_ACCESS_DENIED'),purchasesClosed:true,privateFilesDisabled:true,protectedPreview:true,externalPublicAccessValidated:false,limitations:previewAcceptance.limitations};
review.evidence.releasePreparationLocal={path:localPath,status:'PASS',guardianActualNextProxyCases:27,bindingFixtureChecks:65,wafTruthTableCases:9828,productionSourceChecks:11,actualPrivateReadsByThisAgent:0,newPayments:0,scheduledExecutionValidated:false};
review.evidence.buyerGuidePresence={publicBUYERmd:true,frozenV3BUYERmd:true,publicBUYER_AGENT_KITmd:true,frozenV3BUYER_AGENT_KITmd:true,providerKitDownloadInV3:true,providerKitManifestInV3:true,providerKitSha256:previewAcceptance.providerKit.sha256,providerKitBytes:previewAcceptance.providerKit.bytes};
review.evidence.reviewRouteLocalFix.hostedV3Acceptance=true;
delete review.evidence.reviewRouteLocalFix.hostedV2Acceptance;delete review.evidence.reviewRouteLocalFix.v2OverlayRequired;
review.bazaar.purchaseAdmission.sealedBinding={status:'PREPARED_NOT_APPLIED',executionReportedBy:'release-owner',file:'.vercel/continuous-production-acceptance-binding.dpapi',bindingSha256:'474b1c144612ab9ed6a578a0ac89ac4f483420497ea7deaf537f3cf3c67f0c18',accountFingerprint:'0aaf1bf4b2a3f960df6d6438429cb1487f7cf16fb87fa434b134345aa1b89173',accountCountBound:1,ownerIdsInPublicEvidence:0,productionEnvironmentApplied:false,plannedPayerIsNotWalletIdentityProof:true};
review.publicPerimeterProposal={...review.publicPerimeterProposal,proposalFile:'docs/release/continuous-production-waf-proposal-2026-10-11.json',baselineConfigurationSha256:waf.baselineConfigurationSha256,additions:waf.publicAdditions,readyProductionDeploymentHostname:null,actualRequestBody:null,localTruthTableCases:9828,localInputRejections:9,proposedConditionGroups:22,remoteSchemaAcceptance:false};
review.blockingAcceptance=[
 'Provider final production source-chain and configuration digest; Bazaar production chain is prepared and verified',
 'User payment method and explicit authorization before Upstash Fixed subscription',
 'Measure actual versus conservative reserved Redis resources; review sizing and checkpoint before any future operational ledger enablement',
 'Apply reviewed private exactly-one-owner restricted admission binding only after authorization, and verify allowed/denied runtime calls',
 'Exact final READY production hostname and fresh WAF hash; remote schema/condition-group validation before applying prepared perimeter',
 'User review and authorization before production publication, subscription or scheduler activation',
 'Separate authorization for any specific new Testnet transaction',
 'External production payment-delivery-history-recovery and actual scheduled invocations',
];
await writeFile(reviewPath,JSON.stringify(review,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:'REVIEW_PREPARED_NOT_APPLIED',localEvidence:localPath,previewAcceptance:'PASS',previewChecks:previewAcceptance.checks.length,productionCandidate:productionManifest.candidate,reviewSha256:await digest(reviewPath),wafProposalSha256:await digest('docs/release/continuous-production-waf-proposal-2026-10-11.json'),productionPublished:false,cronActivated:false,cloudMutations:0}));
