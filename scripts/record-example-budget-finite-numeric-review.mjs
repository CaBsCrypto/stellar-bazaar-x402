// Local, import-safe arithmetic review. No credentials, HTTP, SDK commands,
// initialization, signing, payments or deployment actions are performed here.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {continuousFreeReservation,continuousExampleOperationReservation,continuousFreeBudgetConfiguration,CONTINUOUS_FREE_OPERATION_RESERVATION,CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION,CONTINUOUS_FREE_BUDGET_LUA,CONTINUOUS_EXAMPLE_TEXT_NATIVE_BACKGROUND_BOUND} from '../lib/continuous-free-budget.ts';
import {EXPECTED_EXAMPLE_PROVIDER_IO_LIMITS} from '../lib/example-provider-readiness-proof.ts';
import {deriveRecoveryExampleBudgetPolicyMatrix} from './recovery-example-budget-policy-matrix.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const cost=kind=>continuousFreeReservation(kind);
const publicationReceiptPaths=[
 'docs/evidence/recovery-example-native-local-measurement-new-v2-2026-10-13.json',
 'docs/evidence/recovery-example-native-claim-local-v2-2026-10-13.json',
 'docs/evidence/recovery-example-native-delivery-local-v2-2026-10-13.json',
];
export async function createFiniteNumericReview(){
 let checks=0;
 const check=(actual,expected,reason)=>{assert.deepEqual(actual,expected,reason);checks++;};
 const sources=['lib/continuous-free-budget.ts','lib/example-budget-wire.ts','lib/example-budget-command-weight.ts','lib/example-provider-readiness-proof.ts','lib/market-text-seller-runtime.ts','scripts/recovery-example-budget-policy-matrix.mjs','scripts/record-example-budget-finite-numeric-review.mjs'];
 const pins=await Promise.all(sources.map(async path=>({path,sha256:digest(await readFile(path))})));
 const prior=await import('../.vercel/free-margin-repair-bazaar-source/lib/continuous-free-budget.ts');
 check(CONTINUOUS_FREE_BUDGET_LUA,prior.CONTINUOUS_FREE_BUDGET_LUA,'Existing atomic held-entry branch is byte-for-byte identical.');
 check(CONTINUOUS_FREE_OPERATION_RESERVATION,{recoveryCommands:12000,backgroundCommands:4000,transferBytes:2000000000},'Unmarked existing/default orders keep their credit.');
 check(CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION,{recoveryCommands:12000,backgroundCommands:4000,transferBytes:900000000},'The separately accepted Guion reservation is unchanged.');
 check(continuousFreeBudgetConfiguration({BAZAAR_FREE_DEMO_MODE:'continuous'}).configurationId,prior.continuousFreeBudgetConfiguration({BAZAAR_FREE_DEMO_MODE:'continuous'}).configurationId,'Configuration identity and command partitions are unchanged.');
 const costs={metadata:cost({profile:'public',newOperation:false,workload:'metadata',credentialRead:true}),identity:cost({profile:'recovery',newOperation:false,workload:'identity'}),capacity:cost({profile:'authenticated',newOperation:false,workload:'capacity'}),orders:cost({profile:'recovery',newOperation:false,workload:'orders'}),financial:cost({profile:'recovery',newOperation:false,workload:'financial'})};
 const globalRequests=[
  {family:'buyer-sdk-metadata',profile:'public',count:3,unit:costs.metadata,reason:'One stateless authenticated client handshake, including the subscription HTTP attempt.'},
  {family:'buyer-identity',profile:'recovery',count:1,unit:costs.identity,reason:'One cold buyer identity request; cache hits cannot worsen this bound.'},
  {family:'buyer-catalog',profile:'public',count:1,unit:cost({profile:'public',newOperation:false}),reason:'One catalog/list request retains its generic public envelope.'},
  {family:'buyer-create-order',profile:'authenticated',count:1,unit:cost({profile:'authenticated',newOperation:true,workload:'order-create'}),reason:'Admission request is globally charged, not borrowed from the yet-uncreated hold.'},
  {family:'buyer-private-history',profile:'recovery',count:1,unit:costs.orders,reason:'A general account history request has no operation ID and is globally charged.'},
 ];
 const input={providerIoLimits:EXPECTED_EXAMPLE_PROVIDER_IO_LIMITS,nativeCosts:costs,nativeBackground:CONTINUOUS_EXAMPLE_TEXT_NATIVE_BACKGROUND_BOUND,buyerScenario:{financialCalls:3,orderReads:2,globalRequests},remaining:null};
 const matrix=deriveRecoveryExampleBudgetPolicyMatrix(input),selected=continuousExampleOperationReservation();
 check(matrix.held.transferBytes,selected.transferBytes,'Finite formula matches the selected new-order envelope.');
 check(matrix.held.commandsByProfile.recovery,selected.recoveryCommands,'All financial, seller-order and archived commands are funded.');
 check(matrix.held.commandsByProfile.background,selected.backgroundCommands,'Five ticks include native, provider and command-ledger costs.');
 check(selected,{recoveryCommands:8736,backgroundCommands:6300,transferBytes:1508921344},'Exact independently derived numerical matrix.');
 check(matrix.heldRows.map(row=>[row.family,row.count]),[['background',5],['seller-orders',21],['buyer-financial',3],['buyer-order-recovery',2],['archived-financial',1],['archived-get',1]],'No finite recovery branch is omitted.');
 check(matrix.globalRows.filter(row=>row.family.startsWith('seller-')).map(row=>[row.family,row.count]),[['seller-sdk-metadata',18],['seller-identity',6],['seller-capacity',12]],'Seller control work is charged globally across all six invocations.');
 check(matrix.nativeBackgroundBound,{commands:256,transferBytes:16*1048576},'Native background is separate from the provider contract.');
 check(matrix.completeTickBound,{commands:1260,transferBytes:56*1048576+4096},'Per-tick bound includes central command-ledger framing.');
 const previousBytes=CONTINUOUS_FREE_OPERATION_RESERVATION.transferBytes,saving=previousBytes-selected.transferBytes;
 const priorReceipts=await Promise.all(publicationReceiptPaths.map(async path=>{const raw=await readFile(path),value=JSON.parse(raw);return {path,sha256:digest(raw),value};}));
 const [financial,claim,delivery]=priorReceipts.map(row=>row.value);
 check(financial.familyFingerprint,claim.familyFingerprint,'Claim diagnostic continues the same synthetic isolated family.');
 check(claim.familyFingerprint,delivery.familyFingerprint,'Delivery continues the same synthetic isolated family.');
 check(delivery.providerExecutions,1,'Only one synthetic provider execution occurred.');
 check(financial.syntheticFacilitator.settleCalls,1,'Only one simulated settlement occurred.');
 check(delivery.noPaymentResubmission,true,'Delivery recovery did not resubmit payment.');
 const actualTrace={restRequests:financial.realRedis.restRequests+claim.redis.requests+delivery.realRedis.restRequests,combinedBodyBytes:financial.realRedis.combinedBodyBytes+claim.redis.combinedBodyBytes+delivery.realRedis.combinedBodyBytes};
 check(actualTrace,{restRequests:1136,combinedBodyBytes:5756714},'Aggregate includes partial paid flow, claim diagnostic and completed delivery.');
 check(delivery.lostDeliveryAckRecovered&&delivery.sameExistingPaidOperation&&delivery.sameSavedClaimAttempt&&delivery.sameWakeIdentifierRecovered&&delivery.humanPrivateOrderAndHistory&&delivery.deliveryIntegrity,true,'ACK loss recovers the existing order, attempt, wake, private history and integrity.');
 const knownProductionMargin=1021000000;
 return {version:1,status:'PASS_LOCAL_FINITE_EXAMPLE_BUDGET_REVIEW_NOT_PRODUCTION',recordedAt:new Date().toISOString(),checks,pins,selectedOnlyForNewMarkedOrders:selected,defaultAndOldHeldBytes:previousBytes,guionScopedHeldBytes:CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION.transferBytes,savingBytes:saving,savingPercent:100*saving/previousBytes,configurationIdUnchanged:true,existingLuaByteForByteUnchanged:true,localRealRedisAntecedents:priorReceipts.map(({path,sha256})=>({path,sha256})),actualLocalApplicationBodyTrace:actualTrace,syntheticSettlements:1,providerExecutions:1,actualInternalLuaCommandsNotInstrumented:true,upstreamBillingNotMeasured:true,finiteForecastForOneExistingAcceptanceBuyer:matrix,productionMarginArithmeticOnly:{lastKnownRemainingBytes:knownProductionMargin,freshReadPerformed:false,holdAloneFits:false,holdGapBytes:selected.transferBytes-knownProductionMargin,fullWorkflowGapBytes:matrix.completeForecast.transferBytes-knownProductionMargin},networkRequestsByThisReview:0,credentialReads:0,ledgerWrites:0,realPayments:0,productionChanged:false,limitations:['The 5.756714 MB trace is observed application body traffic for isolated synthetic data; it is not an invoice or a worst-case reservation.','Financial raw replay was not captured for the complete earlier phase; its existing 96-MiB typed-snapshot envelope is retained and independently guarded.','The lost delivery acknowledgment is counted in aggregate Redis and replay data but is absent from that failed HTTP request observation.','One existing reviewed buyer is forecast. New account onboarding, extra catalog queries, arbitrary polling and other users are additional globally charged work.','Only newly persisted exact example markers use this finite envelope; existing Lua returns any matching previously held entry unchanged.','The last-known production internal margin is insufficient even for the reduced hold. This review does not authorize production or changing limits.']};
}
async function main(){const receipt=await createFiniteNumericReview();const target='docs/evidence/example-budget-finite-numeric-review-local-2026-10-13.json';await writeFile(target,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:receipt.status,checks:receipt.checks,target,selected:receipt.selectedOnlyForNewMarkedOrders,savingPercent:receipt.savingPercent,completeForecast:receipt.finiteForecastForOneExistingAcceptanceBuyer.completeForecast,productionMargin:receipt.productionMarginArithmeticOnly,networkRequests:0,ledgerWrites:0,payments:0}));}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL('file:///'+process.argv[1].replaceAll('\\','/'))))await main();
