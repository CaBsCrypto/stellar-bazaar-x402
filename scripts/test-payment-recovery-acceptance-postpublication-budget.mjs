// Offline fixtures only: no Redis, filesystem intent, DPAPI or fetch.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PRODUCTION_BUDGET_READ as C,PRODUCTION_BUDGET_COMMANDS,summarizeProductionBudgetPipeline as summarize,validatePostpublicationBudgetAuthority} from './payment-recovery-acceptance-postpublication-budget-read.mjs';
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const ok=v=>{assert.ok(v);checks++;};
const sha=v=>createHash('sha256').update(v).digest('hex');
const now='2026-10-12T20:00:00.000Z',last=Date.parse('2026-10-12T12:00:00.000Z'),day=Math.floor(last/86400000),oldest=Math.floor((last-C.windowMs)/86400000);
const zero=()=>({public:0,authenticated:0,recovery:0,background:0});
const bucket=(d,used={},bytes=0)=>({day:d,used:{...zero(),...used},bytes});
const hold=(extra={})=>({operationId:C.originalOperationId,principalHash:'a'.repeat(64),recoveryCommands:12000,backgroundCommands:4000,transferBytes:2_000_000_000,...extra});
const budget=()=>({version:2,configuration:C.configurationId,last,buckets:[],held:[]});
const storage=()=>({version:1,scope:C.scope,initialized:true,entries:{}});
const rows=(b=budget(),s=storage())=>[{result:JSON.stringify(b)},{result:JSON.stringify(s)}];
const report=(b=budget(),s=storage(),at=now)=>summarize(rows(b,s),{observedAt:at});
function denied(mutator,code='PRODUCTION_BUDGET_SCHEMA_UNCONFIRMED') {
 const r=rows();mutator(r);
 assert.throws(()=>summarize(r,{observedAt:now}),e=>e.message===code);checks++;
}

eq(C.limits,{public:115000,authenticated:90000,recovery:105000,background:50000});
eq(C.configurationId,sha(JSON.stringify(C.limits)));
eq(PRODUCTION_BUDGET_COMMANDS,[['GET',`${C.prefix}:{${C.scope}}:continuous-free-budget:v1`],['GET',`${C.prefix}:{${C.scope}}:continuous-free-storage:v1`]]);
ok(Object.isFrozen(PRODUCTION_BUDGET_COMMANDS)&&PRODUCTION_BUDGET_COMMANDS.every(Object.isFrozen));
const initial=report();
eq([initial.restRequests,initial.redisCommands],[1,2]);
eq(initial.budget.remainingCommands,360000);
eq(initial.budget.remainingCommandsByProfile,C.limits);
eq(initial.budget.remainingTransferBytes,8_500_000_000);
eq(initial.storage.nativeAccountedBytes,10_000_000+Buffer.byteLength(JSON.stringify(storage())));
eq(initial.storage.conservativeAccountedBytes,initial.storage.nativeAccountedBytes+10_000_000);
eq(initial.legacyDefaultOperationProjection,{recoveryCommands:12000,backgroundCommands:4000,transferBytes:2_000_000_000,commandsFit:true,transferFits:true,storageReservationNotEvaluated:true,admissionNotAuthorized:true});
for(const key of ['redisWrites','evalOperations','ttlOperations','scanOperations','newOrders','newPayments','signatures','settlements','providerExecutions','credentialValuesReturned','ownerIdsReturned','payloadsReturned','promptsReturned','operationIdsReturned','rawKeysReturned'])eq(initial[key],0);

// Durable Redis time keeps the oldest partial day and never uses the later
// workstation clock to release either bucket usage or pending holds.
const b=budget();b.buckets=[bucket(oldest-1,{public:900},900),bucket(oldest,{public:2,recovery:3},50),bucket(day,{public:100,authenticated:40,background:5},1000)];b.held=[hold()];
const input=rows(b),snapshot=JSON.stringify(input),r=summarize(input,{observedAt:now});
eq(JSON.stringify(input),snapshot);
eq(r.budget.windowReferenceAt,new Date(last).toISOString());
eq(r.budget.referenceUsesDurableLedgerTime,true);
eq(r.budget.observedClockAheadOfLedgerMs,8*3600000);
eq([r.budget.dayBucketsCounted,r.budget.oldBucketsExcludedByDurableClock],[2,1]);
eq(r.budget.committedCommandsByProfile,{public:102,authenticated:40,recovery:3,background:5});
eq(r.budget.reservedCommandsByProfile,{public:0,authenticated:0,recovery:12000,background:4000});
eq(r.budget.accountedCommandsByProfile,{public:102,authenticated:40,recovery:12003,background:4005});
eq([r.budget.committedTransferBytes,r.budget.reservedTransferBytes,r.budget.accountedTransferBytes],[1050,2_000_000_000,2_000_001_050]);
eq([r.budget.originalOperationHoldPresent,r.budget.heldOperationsNeverExpired,r.pendingHoldsReleased],[true,true,false]);
const later=report(b,storage(),'2027-10-12T20:00:00.000Z');
eq(later.budget.accountedCommandsByProfile,r.budget.accountedCommandsByProfile);
eq(later.budget.accountedTransferBytes,r.budget.accountedTransferBytes);
eq([later.commandLedgerReset,later.originalPaymentStateRead,later.originalPaymentStateChanged,later.additionalOperationAdmitted],[false,false,false,false]);
const exhausted=budget();exhausted.buckets=[bucket(day,{public:115001,authenticated:90001,recovery:105001,background:50001},8_500_000_001)];
const full=report(exhausted);
eq(full.budget.remainingCommandsByProfile,zero());eq(full.budget.remainingCommands,0);eq(full.budget.remainingTransferBytes,0);
eq(full.legacyDefaultOperationProjection.commandsFit,false);eq(full.legacyDefaultOperationProjection.transferFits,false);
const almost=budget();almost.held=[hold({recoveryCommands:93001,backgroundCommands:46001,transferBytes:6_500_000_001})];
eq(report(almost).legacyDefaultOperationProjection.commandsFit,false);eq(report(almost).legacyDefaultOperationProjection.transferFits,false);

// Lua cjson represents an empty table as {}. No nonempty map is accepted.
const lua=budget();lua.buckets={};lua.held={};eq(report(lua).budget.totalAccountedCommands,0);
const empty=budget();empty.last=0;empty.buckets={};empty.held={};eq(report(empty).budget.referenceUsesDurableLedgerTime,false);
denied(r=>{const x=budget();x.buckets={named:bucket(day)};r[0].result=JSON.stringify(x);});
denied(r=>{const x=budget();x.held={named:hold()};r[0].result=JSON.stringify(x);});
for(const edit of [
 x=>x.version=1,x=>x.configuration='b'.repeat(64),x=>x.extra='SECRET_SENTINEL',x=>x.last=-1,x=>x.last=Date.parse(now)+1,
 x=>{x.last=0;x.held=[hold()];},x=>x.buckets=[bucket(day+1)],x=>x.buckets=[bucket(day),bucket(day)],
 x=>x.buckets=[bucket(day),bucket(day-1)],x=>x.buckets=[bucket(day,{public:-1})],x=>x.buckets=[bucket(day,{public:1.5})],
 x=>x.buckets=[bucket(day,{public:'1'})],x=>x.buckets=[bucket(day,{public:Number.MAX_SAFE_INTEGER}),bucket(day+0.5)],
 x=>{const a=bucket(day);a.used.secret='SECRET_SENTINEL';x.buckets=[a];},
 x=>x.held=[hold({operationId:'not-uuid'})],x=>x.held=[hold({principalHash:'secret'})],x=>x.held=[hold(),hold()],
 x=>x.held=[hold({transferBytes:-1})],x=>x.held=[hold({recoveryCommands:Number.MAX_SAFE_INTEGER}),hold({operationId:'00000000-0000-4000-8000-000000000002',recoveryCommands:1})],
 x=>{const h=hold();h.token='SECRET_SENTINEL';x.held=[h];}
])denied(r=>{const x=budget();edit(x);r[0].result=JSON.stringify(x);});
denied(r=>r.pop());denied(r=>r.push({result:'{}'}));denied(r=>r[0].error='SECRET_SENTINEL');denied(r=>r[0].result=null);denied(r=>r[0].result='not JSON');denied(r=>r[0].result=' '.repeat(262145));
assert.throws(()=>summarize(rows(),{observedAt:'2026-10-12'}),/PRODUCTION_BUDGET_SCHEMA_UNCONFIRMED/);checks++;

const s=storage();s.entries={['b'.repeat(64)]:{bytes:1500,reserved:3000},['c'.repeat(64)]:{bytes:70,reserved:90}};
const sr=report(budget(),s).storage,rawBytes=Buffer.byteLength(JSON.stringify(s));
eq([sr.entries,sr.committedBytes,sr.reservedBytes,sr.ledgerBytes],[2,1570,3090,rawBytes]);
eq(sr.nativeAccountedBytes,1570+3090+rawBytes+10_000_000);
eq(sr.conservativeAccountedBytes,sr.nativeAccountedBytes+10_000_000);
const over=storage();over.entries['d'.repeat(64)]={bytes:200_000_000,reserved:1};
eq([report(budget(),over).storage.remainingNativeBytes,report(budget(),over).storage.remainingConservativeBytes],[0,0]);
for(const edit of [x=>x.version=2,x=>x.scope='other-family',x=>x.initialized=false,x=>x.entries=[],x=>x.extra='SECRET_SENTINEL',x=>x.entries.bad={bytes:1,reserved:0},x=>x.entries['a'.repeat(64)]={bytes:-1,reserved:0},x=>x.entries['a'.repeat(64)]={bytes:0,reserved:0,secret:'SECRET_SENTINEL'},x=>x.entries['a'.repeat(64)]={bytes:Number.MAX_SAFE_INTEGER,reserved:1}])
 denied(r=>{const x=storage();edit(x);r[1].result=JSON.stringify(x);},'PRODUCTION_STORAGE_SCHEMA_UNCONFIRMED');
denied(r=>r[1].result=' '.repeat(2_000_001),'PRODUCTION_STORAGE_SCHEMA_UNCONFIRMED');
const publicJson=JSON.stringify(r);
for(const privateValue of [C.originalOperationId,'a'.repeat(64),C.scope,C.prefix,...PRODUCTION_BUDGET_COMMANDS.map(c=>c[1])])ok(!publicJson.includes(privateValue));
eq(r.monthlyPrecaution.maximumConfiguredConservativeCommands,490000);
eq([r.monthlyPrecaution.physicalMonthlyUsageNotRead,r.monthlyPrecaution.physicalDashboardRequiredForNewAdmission],[true,true]);

// Approved cap is a projection only: no ledger reset or resize of original hold.
eq(C.proposedTransferLimit,8_500_000_000);
eq(C.finiteAcceptancePeakBytes,1_546_960_384);
eq(C.scopedAcceptanceReserveBytes,900_000_000);
eq(initial.candidateSourceDigest,'3c3fe5ad3dc886e770c5aec1e1cee2762686558036c3bf55ec310899a35173ed');
eq(initial.additionalOperationProjection.proposedRemainingTransferBytes,8_500_000_000);
eq(initial.additionalOperationProjection.finiteAcceptancePeakFits,true);
eq(initial.additionalOperationProjection.scopedReserveFits,true);
eq(initial.additionalOperationProjection.transferBytes,900_000_000);
eq(initial.additionalOperationProjection.admissionNotAuthorized,true);
eq(initial.additionalOperationProjection.physicalDashboardStillRequired,true);
const exactPeak=budget();exactPeak.buckets=[bucket(day,{},8_500_000_000-1_546_960_384)];
eq(report(exactPeak).additionalOperationProjection.finiteAcceptancePeakFits,true);
eq(report(exactPeak).additionalOperationProjection.remainingAfterFiniteAcceptancePeakBytes,0);
const insufficient=budget();insufficient.buckets=[bucket(day,{},8_500_000_000-1_546_960_384+1)];
eq(report(insufficient).additionalOperationProjection.finiteAcceptancePeakFits,false);
eq(report(insufficient).additionalOperationProjection.scopedReserveFits,true);
const currentFixture=budget();currentFixture.buckets=[bucket(day,{public:1000,authenticated:2000,recovery:3000,background:4000},5_361_631_744)];currentFixture.held=[hold({recoveryCommands:9984,transferBytes:1_421_972_480})];
const currentProjection=report(currentFixture).additionalOperationProjection;
eq(currentProjection.proposedRemainingTransferBytes,1_716_395_776);
eq(currentProjection.remainingAfterFiniteAcceptancePeakBytes,169_435_392);
eq(currentProjection.finiteAcceptancePeakFits,true);
eq(currentProjection.commandsFit,true);
eq(report(currentFixture).budget.reservedTransferBytes,1_421_972_480);
for(const k of ['commandLedgerReset','pendingHoldsReleased','originalPaymentStateChanged','additionalOperationAdmitted'])eq(report(currentFixture)[k],false);
for(const value of [C.originalOperationId,C.scope,C.prefix])ok(!JSON.stringify(report(currentFixture)).includes(value));


// Published receipt is checked before either GET: no inference from the clock or old source.
const published={status:'READY_PAYMENT_RECOVERY_ACCEPTANCE_PRODUCTION_PENDING_NONFINANCIAL_ACCEPTANCE',planHash:C.publishedPlanHash,reviewSha256:'34abf017e578885638f780831a53f6d7ac4f6a299acd73a57d51e857849068d4',sourceDigest:C.candidateSourceDigest,sourceManifestSha256:'2252de2a1849488ca5998e54f4f77d467327b7547ff1c9296e78147780e1c42c',keyUpdateReceiptSha256:'b0e3e92be938e8eec5071cb249eeab6dd39d601194ce3575ec849e9d89c2104b',canonicalOrigin:'https://bazaar.browns.studio',canonicalAssigned:true,canonicalAssignmentSource:'V4_ALIAS_AND_PROJECT_PRODUCTION_TARGET',deploymentId:'dpl_SyntheticPostpublication',projectId:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',target:'production',readyState:'READY',generalPurchasesEnabled:false,activeGuardianDeploymentId:'dpl_SyntheticPostpublication',providerDeploymentId:'dpl_59zNf8MCvktnzTgci3eppUriS2Un',providerSourceDigest:'9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232',purchaseAdmission:{mode:'restricted',accountCountBound:1,accountFingerprint:'0aaf1bf4b2a3f960df6d6438429cb1487f7cf16fb87fa434b134345aa1b89173',bindingSha256:'474b1c144612ab9ed6a578a0ac89ac4f483420497ea7deaf537f3cf3c67f0c18'},url:'https://stellar-bazaar-x402-syntheticpostpublication-cabscryptocontacto-6028s-projects.vercel.app'};
eq(validatePostpublicationBudgetAuthority(published).canonicalAssignmentProvedByPublishedReceipt,true);
for(const patch of [{sourceDigest:'f'.repeat(64)},{planHash:'f'.repeat(64)},{canonicalAssigned:false},{generalPurchasesEnabled:true},{target:'preview'},{activeGuardianDeploymentId:'dpl_Wrong'},{providerDeploymentId:'dpl_Wrong'},{url:'https://attacker.example'},{url:published.url+'?secret=synthetic'},{purchaseAdmission:{...published.purchaseAdmission,accountCountBound:2}}]){assert.throws(()=>validatePostpublicationBudgetAuthority({...published,...patch}),/POSTPUBLICATION_CANONICAL_SOURCE_UNCONFIRMED/);checks++;}
eq(report().sourceDigest,C.candidateSourceDigest);
eq(report().budget.transferLimitBytes,8_500_000_000);
eq(report().futureFinancialEstimate.estimatedRemainingFinancialRouteBytes,1_466_960_384);
eq(C.finiteAcceptancePeakBytes-C.alreadyPerformedPrivateValidationProjectionBytes,C.futureFinancialRouteBytes);
eq(report().futureFinancialEstimate.estimateIsFiniteNotAdmission,true);
eq(report().futureFinancialEstimate.previousPublicationReadsNotSubtractedAgain,true);
eq(report().futureFinancialEstimate.admissionNotAuthorized,true);
const futureExact=budget();futureExact.buckets=[bucket(day,{},8_500_000_000-C.futureFinancialRouteBytes)];
eq(report(futureExact).futureFinancialEstimate.estimatedRouteFits,true);
eq(report(futureExact).futureFinancialEstimate.estimatedShortfallBytes,0);
eq(report(futureExact).additionalOperationProjection.finiteAcceptancePeakFits,false);
const futureInsufficient=budget();futureInsufficient.buckets=[bucket(day,{},8_500_000_000-C.futureFinancialRouteBytes+1)];
eq(report(futureInsufficient).futureFinancialEstimate.estimatedRouteFits,false);
eq(report(futureInsufficient).futureFinancialEstimate.estimatedShortfallBytes,1);
const postObserved=budget();postObserved.buckets=[bucket(day,{},7_225_000_000)];
eq(report(postObserved).futureFinancialEstimate.availableCurrentTransferBytes,1_275_000_000);
eq(report(postObserved).futureFinancialEstimate.estimatedShortfallBytes,191_960_384);

console.log(JSON.stringify({status:'PASS_OFFLINE_PAYMENT_RECOVERY_ACCEPTANCE_POSTPUBLICATION_BUDGET',checks,networkRequests:0,dpapiReads:0,redisWrites:0,filesystemIntents:0,newPayments:0}));
