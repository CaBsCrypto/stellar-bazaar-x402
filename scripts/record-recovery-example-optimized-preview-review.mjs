// Aggregate existing public receipts; no environment, credentials or network.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const paths={
 source:'docs/evidence/recovery-example-optimized-bazaar-wire-source-2026-10-13.json',
 build:'docs/evidence/recovery-example-optimized-bazaar-wire-build-2026-10-13.json',
 providerSource:'docs/evidence/recovery-example-provider-v5-source-2026-10-13.json',
 providerBuild:'docs/evidence/recovery-example-provider-v5-build-2026-10-13.json',
 numeric:'docs/evidence/example-budget-finite-numeric-review-local-2026-10-13.json',
 review:'docs/evidence/recovery-example-budget-preview-review-2026-10-12.json',
 run:'docs/evidence/recovery-example-budget-preview-run-2026-10-12.json',
 recover:'docs/evidence/recovery-example-budget-preview-recover-2026-10-12.json',
 holdBefore:'docs/evidence/recovery-example-budget-preview-hold-before-recover-2026-10-13.json',
 holdAfter:'docs/evidence/recovery-example-budget-preview-hold-after-recover-2026-10-13.json',
 qr:'docs/evidence/recovery-example-budget-preview-qr-decoded-2026-10-12.json',
 oldHolds:'docs/evidence/recovery-example-budget-old-holds-after-2026-10-13.json',
 restoredBazaar:'docs/evidence/recovery-example-budget-bazaar-preview-waf-restore-2026-10-13.json',
 restoredProvider:'docs/evidence/recovery-example-budget-provider-preview-waf-restore-2026-10-13.json',
 productionConfig:'docs/evidence/recovery-example-production-budget-config-observation-2026-10-13.json',
};
const entries=await Promise.all(Object.entries(paths).map(async([name,path])=>{const bytes=await readFile(path);return [name,{path,sha256:hash(bytes),value:JSON.parse(bytes)}];}));
const e=Object.fromEntries(entries),v=name=>e[name].value;
const expect=(condition,reason)=>{if(!condition)throw Error(reason);};
const source='5f998f9f089e1e1b0493fe94e66cb455f414df6cd77fe12b40c19a76c0d7231f';
expect(v('source').sourceDigest===source&&v('build').sourceDigest===source&&v('build').typeScriptSucceeded&&v('build').sourceUntouched,'FROZEN_FINAL_BUILD_REQUIRED');
expect(v('providerSource').sourceDigest===v('providerBuild').sourceDigest&&v('providerBuild').status.startsWith('PASS'),'PROVIDER_BUILD_REQUIRED');
for(const name of ['review','run','recover'])expect(v(name).status.startsWith('PASS')&&v(name).source.bazaar===source&&v(name).payments===0&&v(name).providerExecutions===0&&v(name).originalFinancialJournalUnchanged,'SAME_FINAL_PREVIEW_REQUIRED');
expect(v('run').creationRequestsThisRun===1&&v('recover').creationRequestsThisRun===0&&v('run').automaticReadinessObserved&&!v('run').paymentVerified&&!v('run').deliveryVerified,'SINGLE_UNPAID_ORDER_REQUIRED');
expect(v('holdBefore').status==='PASS_READ_ONLY_NEW_PREVIEW_HOLD'&&v('holdAfter').comparison.remainingNeverIncreased&&v('holdAfter').summary.initialReservation.transferBytes===1508921344,'NEW_FINITE_HOLD_REQUIRED');
expect(v('qr').independentlyDecoded&&v('qr').exactReencodingMatched,'INDEPENDENT_QR_REQUIRED');
expect(v('oldHolds').preservation.status==='PASS_ROOT_OBSERVED_OLD_HOLDS_AND_CONSUMPTION_CONSERVED','OLD_HOLDS_REQUIRED');
for(const name of ['restoredBazaar','restoredProvider'])expect(v(name).status==='PASS_ORIGINAL_FIREWALL_RESTORED'&&v(name).productionPerimeterChanged===false,'FIREWALL_RESTORE_REQUIRED');
const production=v('oldHolds').snapshots.find(row=>row.role==='production');
const accounted=production.committedTransferBytes+production.heldTransferBytes;
const forecasts=[8000000000,8500000000,9250000000].map(cap=>({hypotheticalCapBytes:cap,remainingBytes:cap-accounted,newHoldMarginBytes:cap-accounted-1508921344,completeForecastMarginBytes:cap-accounted-v('numeric').finiteForecastForOneExistingAcceptanceBuyer.completeForecast.transferBytes,confirmedEffectiveRuntimeCap:false}));
const result={version:1,status:'PASS_OPTIMIZED_EXAMPLE_PROTECTED_PREVIEW_REVIEW_NOT_PRODUCTION',recordedAt:new Date().toISOString(),candidate:{bazaar:source,provider:v('providerSource').sourceDigest,deployments:v('run').deployments,files:347,previewCrons:[]},selection:'Only newly admitted orders with the server-minted exact example marker. Default and previous holds are unchanged.',budget:{previousGenericHoldBytes:2000000000,newExampleHold:v('holdAfter').summary.initialReservation,savingBytes:491078656,savingPercent:24.5539328,completeFiniteExistingBuyerForecast:v('numeric').finiteForecastForOneExistingAcceptanceBuyer.completeForecast},measurement:{source:'Earlier real isolated Redis full synthetic flow; separate financial, claim and delivery processes.',redisBodyBytes:5756714,redisRestRequests:1136,syntheticSettlementCalls:1,providerExecutions:1,privateHistory:true,lostPaymentAckRecovered:true,lostDeliveryAckRecovered:true,realPayments:0,finalFiniteProfileAppliedThroughoutEarlierFlow:false},preview:{checks:v('review').checks.length+v('run').checks.length+v('recover').checks.length,httpRequests:v('review').requests+v('run').requests+v('recover').requests+1,oneUnpaidOrder:true,automaticReadiness:true,newFiniteReservationObserved:true,privateOrderAndQueryIsolation:true,unpaidClaimAndDeliveryDenied:true,independentlyDecodedQr:v('qr').decodedDestination,paidDeliveryValidated:false,publicOnboardingValidated:false,externalConcurrentClientsValidated:false},preservation:v('oldHolds').preservation,temporaryWafExceptionsRemoved:true,upstashPlan:'Free; no contract or upgrade',productionConfiguration:{runtimeNumericCapConfirmed:false,observation:e.productionConfig.path,committedAndHeldBytesObserved:accounted,hypotheticalArithmeticOnly:forecasts},evidence:entries.map(([name,row])=>({name,path:row.path,sha256:row.sha256})),pendingBeforeAnyPublication:['Confirm the effective immutable production transfer cap and enough shared margin for the hold AND globally charged controls; project metadata was insufficient.','Choose and review the production binding/configuration of the example worker. Preview has no cron; production must preserve its previously approved guardian.','Present a joint candidate review for authorization before production or limit changes.','Obtain separate authorization for one new real Testnet purchase; test payment, hosted delivery, private link/history and same-operation recovery before general opening.'],limitations:['5.76 MB is actual Redis request/response body traffic with small synthetic data, excluding transport headers and upstream billing. It is not the worst-case allocation.','The finite forecast includes five ticks, bounded seller and buyer recovery, and globally charged controls. It does not promise unlimited polling or retries.','The financial 96-MiB typed maximum is retained from prior evidence; the complete new maximum financial error matrix was not rerun against real payments.','The new protected Preview proves readiness and an unpaid order using the final finite profile, not a paid hosted execution.','SDK validation serializes requests; universal concurrent clients are still a separate admission/concurrency concern.','Preview accounts, unpaid order, quota usage and technical provider reservations remain conserved in their isolated namespace.'],productionPublished:false,productionLimitsChanged:false,productionReservationsChanged:false,realPayments:0,cronActivated:false};
await writeFile('docs/release/recovery-example-optimized-preview-review-2026-10-13.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,candidate:source,previewChecks:result.preview.checks,newHoldBytes:result.budget.newExampleHold.transferBytes,measuredRedisBodyBytes:result.measurement.redisBodyBytes,oldHoldsPreserved:true,firewallRestored:true,productionPublished:false,realPayments:0}));
