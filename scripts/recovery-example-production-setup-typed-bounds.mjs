// Offline sizing of an explicitly authorized private native operator helper.
// No API bypass endpoint, cloud connection or runtime profile is created here.
import {controlTypedEvalRow as e,controlTypedGetRow as g,controlTypedWorkspaceRead as w,controlTypedWorkspaceCommit as wc,controlTypedPermissionRead as p,controlTypedMarketCommit as mc,controlTypedTotal as total} from './recovery-example-control-typed-bounds.mjs';
const MiB=1048576;
function literalEval(label,keyCount,argsRawCaps,commandsUpper){
 // Extra scripts not in the normal request catalog remain separately bounded:
 // exact empty-inventory initialization, dynamic-card insert and pool sidecar.
 // 64-KiB script size is intentionally wider than these reviewed sources.
 const requestBodyUpper=256+2*65536+2+keyCount*(2*512+2)+argsRawCaps.reduce((n,cap)=>n+2*cap+2,0);
 return {label,restRequests:1,commandsUpper,requestBodyUpper,responseBodyUpper:256,outboundUpperBytes:requestBodyUpper+4096,inboundUpperBytes:4352};
}
function reviewMutation(catalog,label){return [g(label+'-read','review'),e(catalog,label+'-cas','review-cas-storage',[8,1048576,1048576,64,180])];}
function permissionCommit(catalog){return e(catalog,'permission-change-cas','permission-cas-storage',[1048576,131072,12,4096,4096,64,180]);}
function group(catalog,name,rows,extraBytes=0){
 const debit=e(catalog,name+'-budget-before-effects','continuous-budget',[512,512]);
 const all=[debit,...rows],bound=total(all);bound.combinedUpperBytes+=extraBytes;
 return {name,rows:all,typedUpper:bound,proposalOnly:{profile:'background',commands:bound.commandsUpper,transferBytes:Math.ceil(bound.combinedUpperBytes/MiB)*MiB+262144},requiresPreEffectBudgetDebit:true};
}
export function deriveProductionExampleSetupTypedBounds(catalog){
 // Source creation uses two initial reads. A definite CAS conflict may cause
 // two more read-only reconciliation reads; no second creation write occurs.
 const create=[w(catalog,'new-account-registry-proof'),w(catalog,'new-account-owner-slot-proof',true),g('new-account-maintenance-index','index'),wc(catalog,'new-account-native-cas',true,true),w(catalog,'definite-creation-conflict-registry-read'),w(catalog,'definite-creation-conflict-owner-read',true)];
 const permission=[p(catalog,'permission-change-generation-proof'),permissionCommit(catalog)];
 const submit=[p(catalog,'native-publication-permission-proof'),g('native-publication-market-read','market'),g('native-publication-settlement-read','settlement'),g('native-publication-reservation-ledger-read','capacity'),g('native-publication-maintenance-index','index'),mc(catalog,'native-publication-joint-guard',2),...reviewMutation(catalog,'new-provider-review')];
 // getSubmissionForOperator can expire OTHER pending reviews. Both its read
 // and possible CAS are budgeted before the bounded HTTP control proof.
 const verify=[...reviewMutation(catalog,'operator-control-proof-current-state'),...reviewMutation(catalog,'operator-control-proof-result')];
 const approve=reviewMutation(catalog,'operator-human-approval'),stage=reviewMutation(catalog,'operator-approved-staging');
 const activate=[...reviewMutation(catalog,'operator-activation-current-state'),...reviewMutation(catalog,'operator-activation-started'),literalEval('exact-example-dynamic-card-insert',2,[16384,100],4),...reviewMutation(catalog,'operator-activation-finished'),...reviewMutation(catalog,'operator-activation-uncertain-fallback')];
 const groups=[group(catalog,'create-one-new-seller',create),group(catalog,'grant-new-seller-publication',permission),group(catalog,'submit-exact-example-service',submit),group(catalog,'verify-public-endpoint-control',verify,32768),group(catalog,'human-review-approve',approve),group(catalog,'stage-approved-submission',stage),group(catalog,'activate-exact-example-service',activate),group(catalog,'initialize-new-worker-ledger', [literalEval('empty-inventory-worker-storage-initialize',1,[512],3)]),group(catalog,'initialize-new-runtime-ledger',[literalEval('empty-inventory-runtime-storage-initialize',1,[512],3)]),group(catalog,'reserve-native-provider-pool',[{...g('provider-pool-native-ledger-before','review'),role:'storage',responseRawCaps:[2000000],responseBodyUpper:4000258,inboundUpperBytes:4004354},literalEval('preserving-existing-ledger-pool-sidecar',1,[2000000,64,180],4),{...g('provider-pool-native-ledger-after','review'),role:'storage',responseRawCaps:[2000000],responseBodyUpper:4000258,inboundUpperBytes:4004354}])];
 const summary=groups.reduce((out,row)=>({commands:out.commands+row.proposalOnly.commands,transferBytes:out.transferBytes+row.proposalOnly.transferBytes}),{commands:0,transferBytes:0});
 return {version:1,status:'OFFLINE_DIRECT_NATIVE_SETUP_BOUND_NOT_EXECUTED',groups,proposalOnlyTotal:summary,storageAdmission:{workerAndRuntimePoolReservedBytes:20000000,catalogCardAndIndexGrowthBytes:32768,catalogStorageAccountingConfirmed:false,requiresExplicitCatalogReservationOrTechnicalCapacityProof:true},unknownPrerequisites:['New scoped Redis ACL preparation must receive its own reviewed bounded command/byte allowance; it is not a native application call modeled here.','Fresh budget/storage authority reads, operator journal checkpoints, deployment metadata and provider health acceptance need their separately bounded measured allowance.','Catalog card and index growth must be explicitly reserved or proved against the existing technical storage reserve before activation.','Only a brand-new worker/runtime namespace with exact empty inventories may use the three-command initialization bound. Existing namespaces must not be reinitialized.'],rootPrivateControllerRequired:true,publicBypassEndpoints:0,networkRequests:0,ledgerWrites:0,realPayments:0,runtimeCostsSelected:false};
}
