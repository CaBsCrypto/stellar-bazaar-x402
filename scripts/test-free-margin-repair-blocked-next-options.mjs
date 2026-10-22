// Offline alternatives after the conditional promotion gate rejected its fresh ledger.
// This file changes no runtime, limit, existing evidence, order or held reservation.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {continuousFreeReservation,CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION} from '../.vercel/payment-recovery-acceptance-bazaar-source-v2/lib/continuous-free-budget.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=v=>{assert.ok(v);checks++;};
const currentPath='docs/evidence/free-margin-repair-production-budget-promotion-2026-10-12.json';
const previousPath='docs/evidence/free-margin-repair-fresh-budget-read-2026-10-12.json';
const currentRaw=await readFile(currentPath),previousRaw=await readFile(previousPath);
const current=JSON.parse(currentRaw),previous=JSON.parse(previousRaw);
eq(current.status,'BLOCKED_READ_ONLY_FREE_MARGIN_REPAIR_PRODUCTION_BUDGET');
eq(current.blockedCode,'FRESH_FINITE_MARGIN_INSUFFICIENT');
eq(current.sourceDigest,'3c3fe5ad3dc886e770c5aec1e1cee2762686558036c3bf55ec310899a35173ed');
eq(current.budget.transferLimitBytes,8500000000);
eq(current.currentTransferCapBytes,8500000000);
eq(current.proposedTransferCapBytes,9250000000);
eq(current.budget.accountedTransferBytes,7427323392);
eq(current.budget.reservedTransferBytes,1421972480);
eq(current.budget.originalOperationHoldPresent,true);
eq(current.originalHoldConservationProven,true);
eq(current.monotonicConsumptionAndStorageProven,true);
eq(current.pendingHoldsReleased,false);eq(current.commandLedgerReset,false);
eq(current.financialStateReads,0);eq(current.limitChanges,0);
const light=continuousFreeReservation({profile:'recovery',newOperation:false,workload:'orders'}).transferBytes;
const guardian=32768+4096+64000000+4096;
eq(light,33816576);eq(guardian,64040960);
eq(CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION.transferBytes,900000000);
eq(current.budget.accountedTransferBytes-previous.budget.accountedTransferBytes,guardian);
eq(current.budget.committedCommandsByProfile.background-previous.budget.committedCommandsByProfile.background,1120);
const accounted=current.budget.accountedTransferBytes,peak=current.remainingRequiredTransferBytes;
eq(peak,1843137024);eq(9250000000-accounted,1822676608);
eq(accounted+peak,9270460416);eq(9250000000-accounted-peak,-20460416);
const alternatives=[
  {name:'Approved 9.25 GB with original route',capBytes:9250000000,proposedSavedBytes:0,extraGuardianPasses:0,requiresNewApproval:false,routeChangeRequired:false},
  {name:'Reuse one exact fresh capabilities result',capBytes:9250000000,proposedSavedBytes:light,extraGuardianPasses:0,requiresNewApproval:true,routeChangeRequired:true},
  {name:'Reuse capabilities plus another full guardian',capBytes:9250000000,proposedSavedBytes:light,extraGuardianPasses:1,requiresNewApproval:true,routeChangeRequired:true},
  {name:'Hypothetically remove two controls plus another guardian',capBytes:9250000000,proposedSavedBytes:2*light,extraGuardianPasses:1,requiresNewApproval:true,routeChangeRequired:true,secureRemovalProven:false},
  {name:'Proposed 9.5 GB with unchanged original route',capBytes:9500000000,proposedSavedBytes:0,extraGuardianPasses:0,requiresNewApproval:true,routeChangeRequired:false},
  {name:'Proposed 9.5 GB with one additional guardian',capBytes:9500000000,proposedSavedBytes:0,extraGuardianPasses:1,requiresNewApproval:true,routeChangeRequired:false},
  {name:'Proposed 9.5 GB with three additional guardians',capBytes:9500000000,proposedSavedBytes:0,extraGuardianPasses:3,requiresNewApproval:true,routeChangeRequired:false},
  {name:'Proposed 9.5 GB with four additional guardians',capBytes:9500000000,proposedSavedBytes:0,extraGuardianPasses:4,requiresNewApproval:true,routeChangeRequired:false}
].map(v=>({...v,remainingAtProposedCapBytes:v.capBytes-accounted,finiteRouteBytes:peak-v.proposedSavedBytes+v.extraGuardianPasses*guardian,marginBytes:v.capBytes-accounted-peak+v.proposedSavedBytes-v.extraGuardianPasses*guardian,physicalHeadroomBytes:10000000000-v.capBytes,applied:false,newPurchaseAuthorized:false}));
eq(alternatives.map(v=>v.marginBytes),[-20460416,13356160,-50684800,-16868224,229539584,165498624,37416704,-26624256]);
ok(alternatives[1].marginBytes>0);ok(alternatives[2].marginBytes<0);ok(alternatives[3].marginBytes<0);
eq(accounted+peak+guardian,9334501376);
eq(alternatives[5].physicalHeadroomBytes,500000000);
const publicGeneric=continuousFreeReservation({profile:'public',newOperation:false}).transferBytes;
eq(publicGeneric,140771328);
eq(alternatives[5].marginBytes-publicGeneric,24727296);
ok(alternatives[5].marginBytes-publicGeneric-guardian<0);
const report={version:1,status:'PASS_OFFLINE_BLOCKED_PROMOTION_ALTERNATIVES',observedAt:new Date().toISOString(),checks,
 baseline:{evidence:currentPath,sha256:sha(currentRaw),observedAt:current.observedAt,currentSourceDigest:current.sourceDigest,currentCapBytes:8500000000,accountedTransferBytes:accounted,heldBytes:current.budget.reservedTransferBytes,holdPreserved:true,conditionalPromotionBlocked:true},
 previousBaseline:{evidence:previousPath,sha256:sha(previousRaw),accountedTransferBytes:previous.budget.accountedTransferBytes},
 dynamicConsumption:{deltaBytes:guardian,deltaBackgroundCommands:1120,consistentWithOneFullGuardianReservation:true,physicalBandwidthNotInferred:true},
 nativeCharges:{authenticatedLightControlBytes:light,oneFullGuardianBytes:guardian,anonymousGenericRequestBytes:publicGeneric},
 minimumCapForUnchangedFiniteCaseBytes:accounted+peak,minimumCapWithOneAdditionalGuardianBytes:accounted+peak+guardian,
 alternatives,
 capabilitiesReuse:{proposalOnly:true,existingBuyerOrchestrationWouldNeedReviewedChange:true,exactFreshReceiptAndSameDeploymentAndAcceptanceAccountRequired:true,nativeOrderAuthenticationAndFreshGetServiceRequired:true,savingsInsufficientForAnotherFullGuardian:true},
 recommendation:'Keep the rejected 9.25 GB package unpromoted. Propose 9.5 GB with unchanged finite route only after a new review, explicit authorization, new candidate and fresh capacity gates; otherwise implement and prove typed transfer optimizations before another publication attempt.',
 limitations:['Every projection is finite and excludes unbounded traffic or retries.','A fresh ledger and physical Free quota gate remain mandatory before any future publication or payment.','This local evidence authorizes no 9.5 GB limit and no purchase.','Current production remains the 8.5 GB source in the blocked receipt; private a8bb is not promoted.'],
 networkRequests:0,dpapiReads:0,realRedisWrites:0,cloudWrites:0,runtimeSourceChanges:0,limitChanges:0,newOrders:0,newPayments:0,signatures:0,oldHoldChanged:false,consumptionReset:false};
if(process.argv.length>2){if(process.argv.length!==3||process.argv[2]!=='--write-evidence')throw Error('ONLY_EXCLUSIVE_OFFLINE_EVIDENCE_SUPPORTED');const path='docs/evidence/free-margin-repair-blocked-next-options-local-2026-10-12.json';await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});report.evidence=path;}
console.log(JSON.stringify({status:report.status,checks,minimumCapBytes:report.minimumCapForUnchangedFiniteCaseBytes,minimumCapWithExtraGuardianBytes:report.minimumCapWithOneAdditionalGuardianBytes,unchanged925MarginBytes:alternatives[0].marginBytes,proposed950MarginWithExtraGuardianBytes:alternatives[5].marginBytes,networkRequests:0,dpapiReads:0,limitChanges:0,newPayments:0,...(report.evidence?{evidence:report.evidence}:{})}));
