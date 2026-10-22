// Candidate arithmetic from REAL exported reservations, local public evidence.
// No network, DPAPI, financial state or real Redis access.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {continuousFreeReservation,CONTINUOUS_FREE_OPERATION_RESERVATION,CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION} from '../lib/continuous-free-budget.ts';
const ledger=JSON.parse(await readFile('docs/evidence/current-production-free-budget-2026-10-12.json','utf8'));
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},check=v=>{assert.ok(v);checks++;};
equal(ledger.status,'PASS_READ_ONLY_CURRENT_PRODUCTION_FREE_BUDGET');equal(ledger.budget.originalOperationHoldPresent,true);
const charge=(profile,workload)=>continuousFreeReservation({profile,newOperation:false,...(workload?{workload}:{})}).transferBytes;
const metadata=charge('public','metadata'),light=charge('recovery','orders'),financial=charge('recovery','financial'),creation=charge('authenticated','order-create');
equal([metadata,light,financial,creation],[12845056,33816576,100925440,50593792]);
equal(CONTINUOUS_FREE_OPERATION_RESERVATION.transferBytes,2_000_000_000);
equal(CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION.transferBytes,900_000_000);
const background=100_000_000+4096,beforeOrderReadiness=3*metadata+2*light+background,postOrderCallback=3*metadata+light;
const buyerPreflight=3*light,existingBrokerProtocolRequests=0,oneGuardianPass=(32768+4096)+(64_000_000+4096),privateValidationBound=80_000_000;
const proposedPeak=buyerPreflight+existingBrokerProtocolRequests*metadata+creation+beforeOrderReadiness+CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION.transferBytes+2*postOrderCallback+oneGuardianPass+privateValidationBound;
const actualAccounted=ledger.budget.accountedTransferBytes,oldRemaining=ledger.budget.remainingTransferBytes,newRemaining=8_500_000_000-actualAccounted;
equal(beforeOrderReadiness,206172416);equal(postOrderCallback,72351744);equal(oneGuardianPass,64040960);
equal(proposedPeak,1546960384);check(proposedPeak>oldRemaining);check(proposedPeak<newRemaining);equal(newRemaining-proposedPeak,169435392);
const happyHold=2*financial+6*light+2*background;
const onePaymentReconciliation=happyHold+financial+light;
const lostClaimRecovery=2*financial+8*light+3*background+2*light;
equal(happyHold,604758528);equal(onePaymentReconciliation,739500544);equal(lostClaimRecovery,840028928);check(lostClaimRecovery<900_000_000);
// A 31-day projection is not a promise of unlimited paid recovery. No-hash
// operator incidents retain their hold and use only the initialized idle gate.
equal(31*24*16,11904);check(31*24*16<12000);
equal(ledger.budget.accountedTransferBytes,actualAccounted);equal(ledger.budget.reservedTransferBytes,1421972480);equal(ledger.commandLedgerReset,false);
console.log(JSON.stringify({status:'PASS_OFFLINE_CANDIDATE_TEXT_RECOVERY_TRANSFER_PROJECTION_V2',checks,candidateBytes:{metadata,typedOrderControl:light,financial,creation,newTextHold:CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION.transferBytes},actualAccountedBytes:actualAccounted,old8GbRemainingBytes:oldRemaining,proposed8Point5GbRemainingBytes:newRemaining,finitePeakBytes:proposedPeak,remainingAfterFinitePeakBytes:newRemaining-proposedPeak,components:{buyerPreflight,existingBrokerProtocolRequests,creation,beforeOrderReadiness,postOrderCallbacks:2*postOrderCallback,oneGuardianPass,privateValidationBound},protectedRecovery:{happyHoldBytes:happyHold,onePaymentReconciliationBytes:onePaymentReconciliation,lostClaimAndTwoReadsBytes:lostClaimRecovery},old8GbCannotAdmitThisFullScenario:true,originalHoldChanged:false,historicalConsumptionChanged:false,requiresExplicitCapApproval:true,actualHostedAdmissionProven:false,networkRequests:0,dpapiReads:0,ledgerWrites:0,newOrders:0,newPayments:0}));
