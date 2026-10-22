// Offline fixtures only: no Redis, filesystem intent, DPAPI or fetch.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PRODUCTION_BUDGET_READ as C,PRODUCTION_BUDGET_COMMANDS,summarizeProductionBudgetPipeline as summarize} from './read-current-production-free-budget.mjs';
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
eq(initial.budget.remainingTransferBytes,8_000_000_000);
eq(initial.storage.nativeAccountedBytes,10_000_000+Buffer.byteLength(JSON.stringify(storage())));
eq(initial.storage.conservativeAccountedBytes,initial.storage.nativeAccountedBytes+10_000_000);
eq(initial.additionalOperationProjection,{recoveryCommands:12000,backgroundCommands:4000,transferBytes:2_000_000_000,commandsFit:true,transferFits:true,storageReservationNotEvaluated:true,admissionNotAuthorized:true});
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
const exhausted=budget();exhausted.buckets=[bucket(day,{public:115001,authenticated:90001,recovery:105001,background:50001},8_000_000_001)];
const full=report(exhausted);
eq(full.budget.remainingCommandsByProfile,zero());eq(full.budget.remainingCommands,0);eq(full.budget.remainingTransferBytes,0);
eq(full.additionalOperationProjection.commandsFit,false);eq(full.additionalOperationProjection.transferFits,false);
const almost=budget();almost.held=[hold({recoveryCommands:93001,backgroundCommands:46001,transferBytes:6_000_000_001})];
eq(report(almost).additionalOperationProjection.commandsFit,false);eq(report(almost).additionalOperationProjection.transferFits,false);

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
console.log(JSON.stringify({status:'PASS_OFFLINE_CURRENT_PRODUCTION_FREE_BUDGET',checks,networkRequests:0,dpapiReads:0,redisWrites:0,filesystemIntents:0,newPayments:0}));
