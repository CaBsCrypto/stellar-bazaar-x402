// NEW local forecast amendment. Preserves the original V3 forecast/receipts,
// all old counters and every operation hold. No source or deployment mutation.
import {recomputeV3FreshCapacity} from './recovery-example-v3-fresh-recomputation.mjs';
import {deriveGuardianIdleTypedBound} from './recovery-example-guardian-idle-typed-bound.mjs';
export const GUARDIAN_POLICY_INITIALIZATION_CREDIT=Object.freeze({commands:7,transferBytes:1310720});
export function deriveV3FiniteGuardianForecast(prior){
 if(prior?.profile!=='example-text-wire/v3'||prior.totalNewTransferBytes!==2403704832||prior.held?.transferBytes!==1071140864||prior.proposedTransferCapBytes!==9900000000||prior.completeHistoryScope?.identityPanelButton!==true||prior.completeHistoryScope?.observedQueryHistoryPanel!==true||prior.setupAndGuardianTotal?.transferBytes!==280838144)throw Error('EXACT_COMPLETE_UI_V3_FORECAST_REQUIRED');
 const forecast=structuredClone(prior),credit=GUARDIAN_POLICY_INITIALIZATION_CREDIT;
 forecast.status='LOCAL_V3_FINITE_GUARDIAN_FORECAST_REQUIRES_NEW_SOURCE_ACCEPTANCE';
 forecast.guardianPolicyInitialization={count:1,profile:'background',...credit,reason:'One new technical policy key. Prefunded source-native CAS, never an inferred zero state or quota reset.'};
 forecast.setupAndGuardian.push({name:'guardian-policy-initialization',count:1,profile:'background',unit:{...credit},...credit,reason:forecast.guardianPolicyInitialization.reason});
 forecast.setupAndGuardianTotal.commands+=credit.commands;forecast.setupAndGuardianTotal.transferBytes+=credit.transferBytes;forecast.setupAndGuardianTotal.commandsByProfile.background+=credit.commands;
 forecast.totalNewTransferBytes+=credit.transferBytes;forecast.requiredTotalWithOldUsageAndHolds+=credit.transferBytes;forecast.knownByteMargin-=credit.transferBytes;forecast.remainingAfterSafety-=credit.transferBytes;
 forecast.commandForecast.background.newWork+=credit.commands;forecast.commandForecast.background.totalAccounted+=credit.commands;forecast.commandForecast.background.remaining-=credit.commands;forecast.commandForecast.background.fits=forecast.commandForecast.background.remaining>=0;
 forecast.guardianSemantics={hourlyCheapCheck:true,maximumFullPassesIn32ConservativeDays:2,backoffMs:86400000,unchangedFullPassCreditCommands:1104,unchangedFullPassCreditBytes:64004096,capacityExhaustionStatus:503,needsOperatorOnExhaustion:true,unknownIndexNeverMeansIdle:true,physicalCleanupCanRemainPending:true,individualAuthenticatedOperationRecoveryRetainsOldHolds:true,guaranteedUninterruptedPhysicalCleanup:false};
 forecast.requiredGates.push('New durable guardian policy, atomic claim/debit, all native wire guards and failure paths must pass local tests, build and protected Preview; old V3 builds do not contain this integration.');
 return forecast;
}
/** Private review evidence is supplied by root; this helper cannot mint it.
 * A successful result is arithmetic only, never publication or payment consent.
 */
export function recomputeV3FiniteGuardianCapacity({priorForecast,enforcedGuardianReview,...input}){
 const forecast=deriveV3FiniteGuardianForecast(priorForecast),r=enforcedGuardianReview,idle=deriveGuardianIdleTypedBound();
 const confirmed=r?.maximumFullPasses===2&&r?.windowMs===32*86400000&&r?.backoffMs===86400000&&r?.creditPerPassCommands===1104&&r?.creditPerPassBytes===64004096&&Number.isSafeInteger(r?.wireMaximumCommands)&&r.wireMaximumCommands<=1104&&r.wireMaximumCommands>=6&&Number.isSafeInteger(r?.wireMaximumBytes)&&r.wireMaximumBytes<=64000000&&r.wireMaximumBytes>0&&r?.idleCreditCommands===16&&r?.idleCreditBytes===36864&&idle.allPrefixesFit&&idle.missingIdleLedgerNeverInitialized===true&&r?.idleTypedSourceBytes===idle.maximumCombinedBytes&&r?.idleWireGuardApplied===true&&r?.atomicClaimAndDebit===true&&r?.unknownIndexNeverIdle===true&&r?.exhaustionReportedToOperator===true&&r?.sourceAndBuildReviewed===true&&r?.protectedPreviewAccepted===true&&/^[a-f0-9]{64}$/.test(r?.sourceDigest??'');
 const guardianBound=confirmed?{maximumFullPasses:2,creditPerPassCommands:1104,creditPerPassBytes:64004096,enforcedDurably:true,unknownIndexNeverIdle:true,exhaustionReportedToOperator:true,sourceAndBuildReviewed:true,sourceDigest:r.sourceDigest}:undefined;
 const result=recomputeV3FreshCapacity({...input,forecast:priorForecast,guardianBound}),delta=GUARDIAN_POLICY_INITIALIZATION_CREDIT;
 result.newFiniteWorkBytes+=delta.transferBytes;result.requiredTotalWithOldUsageAndHolds+=delta.transferBytes;result.knownByteMargin-=delta.transferBytes;result.remainingAfterSafety-=delta.transferBytes;
 const bg=result.commands.background;bg.newWork+=delta.commands;bg.total+=delta.commands;bg.remaining-=delta.commands;bg.fits=bg.remaining>=0;
 result.allCommandPartitionsFit=Object.values(result.commands).every(row=>row.fits);
 if(result.knownByteMargin<result.safetyMarginBytes&&!result.blockedReasons.includes('V3_FULL_FLOW_PLUS_8MIB_MARGIN_REQUIRED'))result.blockedReasons.push('V3_FULL_FLOW_PLUS_8MIB_MARGIN_REQUIRED');
 if(!result.allCommandPartitionsFit&&!result.blockedReasons.includes('V3_COMMAND_PARTITION_MARGIN_REQUIRED'))result.blockedReasons.push('V3_COMMAND_PARTITION_MARGIN_REQUIRED');
 result.version=2;result.guardianPolicyInitialization={...delta};result.guardianSemantics=forecast.guardianSemantics;result.guardianSourceAndPreviewAcceptanceConfirmed=confirmed;
 result.status=result.blockedReasons.length?'BLOCKED_V3_FINITE_GUARDIAN_CAPACITY_GATE':'PASS_V3_FINITE_GUARDIAN_FRESH_ARITHMETIC_ONLY';return result;
}
