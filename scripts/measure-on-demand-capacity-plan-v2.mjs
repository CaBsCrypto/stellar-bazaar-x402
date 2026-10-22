// Local deterministic capacity review. No deployment, real Redis, signing,
// provider execution or quota refresh; the worker uses explicit HTTP fixtures.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {continuousFreeBudgetConfiguration,continuousFreeReservation,CONTINUOUS_FREE_OPERATION_RESERVATION} from '../lib/continuous-free-budget.ts';
import {CONTINUOUS_FREE_STORAGE_MAX,CONTINUOUS_FREE_STORAGE_TECHNICAL_RESERVE} from '../lib/continuous-free-storage.ts';
import {classifyOperationalRequest} from '../lib/operational-pressure.ts';
import {createWorkerRedisCommands,createSellerRedisSecretStore,initializeSellerStorage} from '../examples/seller-redis-secret-store.mjs';
import {sellerCanonical,sellerHash} from '../examples/seller-service-card.mjs';
import {fixture,config as sellerConfig,started,paidOrder} from './fixtures/seller-hosted.mjs';
import {sellerRedisMemory} from './fixtures/seller-redis-memory.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),OUTPUT='docs/evidence/on-demand-free-capacity-plan-v2-2026-10-11.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
if(process.env.VERCEL||process.env.VERCEL_ENV||process.env.NODE_ENV==='production')throw Error('LOCAL_ONLY');
if(process.argv.slice(2).some(arg=>arg!=='--write-evidence'))throw Error('UNKNOWN_ARGUMENT');
const free=continuousFreeBudgetConfiguration({BAZAAR_FREE_DEMO_MODE:'continuous'}),days=31,ticks=days*24;
const childEnvironment=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].flatMap(key=>process.env[key]?[[key,process.env[key]]]:[]));childEnvironment.NODE_ENV='test';
const guardian=JSON.parse(execFileSync(process.execPath,['scripts/test-continuous-guardian.mjs'],{cwd:ROOT,env:childEnvironment,timeout:20000,maxBuffer:131072,stdio:['ignore','pipe','pipe']}).toString().trim());
assert.equal(guardian.status,'PASS_LOCAL_CONTINUOUS_GUARDIAN');assert.ok(guardian.idle31DayCommands<=12000);assert.ok(guardian.idleConservativeReservations<=12000);
const summary=()=>({public:0,authenticated:0,recovery:0,background:0,transferBytes:0,httpRequests:0});
function add(target,value,multiplier=1){for(const key of Object.keys(target))target[key]+=(value[key]??0)*multiplier;return target;}
function request(kind,count=1){const reserve=continuousFreeReservation(kind),value=summary();value[kind.profile]=reserve.commands*count;value.transferBytes=reserve.transferBytes*count;value.httpRequests=count;return value;}
const metadata={profile:'public',newOperation:false,workload:'metadata'},verifiedMetadata={...metadata,credentialRead:true,recoveryTransport:true},catalog={profile:'public',newOperation:false},observed={profile:'public',newOperation:false,workload:'observed-metadata'},identity={profile:'recovery',newOperation:false,workload:'identity'},orders={profile:'recovery',newOperation:false,workload:'orders'},newWork={profile:'authenticated',newOperation:true},bootstrap={...newWork,bootstrapCreation:true},recover={profile:'recovery',newOperation:false},capacity={profile:'authenticated',newOperation:true,workload:'capacity'};
const requestDefinitions={anonymousMcpControl:metadata,authenticatedMcpControl:verifiedMetadata,anonymousCatalogOrService:catalog,authenticatedObservedCapabilities:observed,accountIdentity:identity,privateOrderList:orders,newAccount:bootstrap,newOrder:newWork,existingOrderOrPayment:recover,sellerCapacity:capacity};
const perRequest=Object.fromEntries(Object.entries(requestDefinitions).map(([name,kind])=>{const reserve=continuousFreeReservation(kind);return [name,{...kind,...reserve,maximumIfOnlyThisTraffic:Math.min(Math.floor(free.limits[kind.profile]/reserve.commands),Math.floor(free.transferBytes/reserve.transferBytes)),maximumIsNotConcurrentOrDailyGuarantee:true}];}));

// Measure the real hosted SDK/worker/encrypted journal through fixed synthetic
// transport. Retain only public tool-name counts and integer resource totals.
const order={...paidOrder(),executionMode:'on-demand',textWake:{version:1,wakeId:randomUUID(),status:'dispatching',createdAt:new Date(started).toISOString(),updatedAt:new Date(started).toISOString(),attempts:1}},plain=new Map();let f;
const memory=sellerRedisMemory(()=>f?.clock??started),bindingHash=sellerHash(sellerCanonical({bazaarOrigin:sellerConfig.bazaarOrigin,ownerId:sellerConfig.ownerId,agentId:sellerConfig.agentId,cardHash:sellerConfig.cardHash,allowedOrigins:sellerConfig.allowedOrigins,agentAccessHash:sellerHash(sellerConfig.agentAccess),providerAccessHash:sellerHash(sellerConfig.providerAccess)}));
const command=createWorkerRedisCommands({url:'https://synthetic.upstash.io',token:'PRIVATE_SYNTHETIC_TOKEN',fetcher:async(_url,init)=>Response.json({result:memory.execute(JSON.parse(init.body))})});
await initializeSellerStorage(command,'bazaar-seller:preview-'+'b'.repeat(32),bindingHash,[]);
function createStore(){const actual=createSellerRedisSecretStore({command,prefix:'bazaar-seller:preview-'+'b'.repeat(32),key:Buffer.alloc(32,8).toString('base64url'),bindingHash,now:()=>f?.clock??started,storageBudget:true});return {...actual,values:plain,write:async(name,value)=>{await actual.write(name,value);plain.set(name,structuredClone(value));},journal(name){const journal=actual.journal(name);return {...journal,initialize:async value=>{await journal.initialize(value);plain.set(name,structuredClone(value));},append:async value=>{await journal.append(value);plain.set(name,structuredClone(value));}};}};}
f=fixture({orders:[order],store:createStore()});
const toolNames=new Set(['get_bazaar_identity','report_market_capacity','get_market_order','list_market_orders','claim_market_order','deliver_market_order','uncertain_market_order']);
const workerSamples={};
async function sample(name,input){const store=createStore(),before=memory.snapshot(),eventsBefore=f.events.length;try{
 const result=await f.run({store,executionMode:'on-demand',...input}),after=memory.snapshot(),events=f.events.slice(eventsBefore),tools=events.filter(value=>toolNames.has(value)),controls=result.mcpRequests-tools.length,resource=summary();
 add(resource,request(verifiedMetadata,controls));
 for(const name of tools){const req=new Request('https://synthetic.invalid/api/mcp',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+ 'a'.repeat(43)},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{ready:true}}})});add(resource,request(await classifyOperationalRequest(req)));}
 const ownCommands=after.executionsIncludingEval-before.executionsIncludingEval;assert.ok(ownCommands<=1000);
 // Root's background gate reserves 1,000 native worker commands plus 4 for
 // accounting, and 100 MB plus 4 KiB for transport. Bazaar MCP is additional.
 resource.background+=1004;resource.transferBytes+=100_004_096;
 workerSamples[name]={reason:result.reason,ownRedisMeasuredCommandsIncludingLua:ownCommands,ownRedisRestRequests:after.restRequests-before.restRequests,mcpHttpRequests:result.mcpRequests,toolCounts:Object.fromEntries([...toolNames].flatMap(tool=>tools.includes(tool)?[[tool,tools.filter(t=>t===tool).length]]:[])),controlHttpRequests:controls,providerExecutions:result.providerRequests,safetyReservation:resource};
 return resource;
}finally{store.dispose();}}
await sample('readinessCold',{requestMode:'readiness'});await sample('readinessWarm',{requestMode:'readiness'});await sample('deliveryWarm',{requestMode:'deliver',operationId:order.operationId,wakeId:order.textWake.wakeId});order.textWake.status='completed';await sample('deliveryReplay',{requestMode:'deliver',operationId:order.operationId,wakeId:order.textWake.wakeId});

const workflows={};
workflows.universalMcpConnection={calls:'initialize, notification, GET transport and tools/list with an existing agent credential; no catalogue, registration or order',reservation:request(verifiedMetadata,4)};
const anonymous=summary();add(anonymous,request(metadata,4));add(anonymous,request(catalog,2));workflows.anonymousDiscovery={calls:'initialize, notification, GET transport, capabilities, search, service',reservation:anonymous};
const onboarding=summary();add(onboarding,request(bootstrap));add(onboarding,request(verifiedMetadata,3));add(onboarding,request(identity));add(onboarding,request(observed));add(onboarding,request(catalog,2));workflows.newBuyerOnboarding={calls:'browser registration, one MCP connection, identity, capabilities, catalog, service',reservation:onboarding};
const purchase=summary();add(purchase,request(newWork));add(purchase,workerSamples.readinessCold.safetyReservation);add(purchase,request(recover,2));add(purchase,workerSamples.readinessWarm.safetyReservation);add(purchase,workerSamples.deliveryWarm.safetyReservation);add(purchase,request(recover));add(purchase,request(orders));workflows.existingConnectedBuyerPurchase={calls:'new order with cold stale-lease health, HTTP 402, signed proof with warm health, targeted delivery, private result and list; one reused buyer MCP session',reservation:purchase};
const complete=add(add(summary(),onboarding),purchase);workflows.newBuyerCompleteTextDemo={calls:'newBuyerOnboarding plus existingConnectedBuyerPurchase',reservation:complete};
const idle={background:guardian.idleConservativeReservations,transferBytes:(32768+4096)*ticks};
for(const scenario of Object.values(workflows)){
 const value=scenario.reservation,profileLimits=Object.fromEntries(Object.keys(free.limits).map(profile=>[profile,value[profile]===0?null:Math.floor((free.limits[profile]-(idle[profile]??0))/value[profile])]));
 scenario.independentWorkloadCeiling31Days={profileLimits,transferBytes:Math.floor((free.transferBytes-idle.transferBytes)/value.transferBytes)};
 scenario.maximumCompleteWorkloadsIfNothingElseRuns=Math.min(...Object.values(profileLimits).filter(n=>n!==null),scenario.independentWorkloadCeiling31Days.transferBytes);
 if(value.recovery>0&&value.background>0){
  // Adding the whole held byte envelope to a whole completed-flow envelope
  // double-counts work already moved from held to spent, intentionally yielding
  // a safe upper peak rather than pretending to measure a real concurrency cap.
  scenario.conservativeTransferPeakBytes=value.transferBytes+CONTINUOUS_FREE_OPERATION_RESERVATION.transferBytes+idle.transferBytes;
  scenario.holdAwareConservativeCompleteFlowCount=Math.floor((free.transferBytes-idle.transferBytes)/(value.transferBytes+CONTINUOUS_FREE_OPERATION_RESERVATION.transferBytes));
 }
 scenario.providerInvoiceOrActualVisitorCapacityVerified=false;
}
const priorQuota=JSON.parse(await readFile(resolve(ROOT,'docs/evidence/free-demo-upstash-quota-2026-10-11.json'),'utf8')),priorConservative=priorQuota.commandsUsedConservative,sharedMargin=50000;
assert.equal(priorConservative,30000);assert.ok(Object.values(free.limits).reduce((n,v)=>n+v,0)+priorConservative+sharedMargin<=500000);
const initializer=await readFile(resolve(ROOT,'scripts/initialize-on-demand-preview-storage.mjs'),'utf8'),technicalMatch=initializer.match(/row\(wp\+':technical-reservation:v1',([\d_]+)\)/);assert.ok(technicalMatch);
const rowReserve=Number(technicalMatch[1].replaceAll('_','')),effectiveTechnical=rowReserve+CONTINUOUS_FREE_STORAGE_TECHNICAL_RESERVE;
const paths=['scripts/measure-on-demand-capacity-plan-v2.mjs','lib/continuous-free-budget.ts','lib/free-demo-budget.ts','lib/continuous-free-storage.ts','lib/operational-envelopes.ts','lib/operational-budget.ts','lib/operational-pressure.ts','lib/market-guardian.ts','lib/market-text-seller-runtime.ts','lib/workspace-store.ts','lib/marketplace-capacity.ts','examples/seller-hosted-tick.mjs','examples/seller-redis-secret-store.mjs','scripts/initialize-on-demand-preview-storage.mjs','scripts/test-continuous-guardian.mjs','scripts/fixtures/seller-hosted.mjs'];
const sources=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(resolve(ROOT,path)))])));
const evidence={version:1,status:'PASS_LOCAL_CAPACITY_MODEL_REQUIRES_ROLLOUT_REVIEW',observedAt:new Date().toISOString(),sources,sourceDigest:hash(JSON.stringify(sources)),mode:'continuous-on-demand',windowDays:31,partialBoundaryDayRetained:true,commandLimits:free.limits,transferLimitBytes:free.transferBytes,operationHeldReservation:CONTINUOUS_FREE_OPERATION_RESERVATION,storage:{maximumBytes:CONTINUOUS_FREE_STORAGE_MAX,providerPoolBytes:10000000,nativeTechnicalReserveBytes:CONTINUOUS_FREE_STORAGE_TECHNICAL_RESERVE,initializerAdditionalReserveBytes:rowReserve,effectiveTechnicalReserveBytes:effectiveTechnical,payloadBytesCeilingBeforeLedgerOverhead:CONTINUOUS_FREE_STORAGE_MAX-effectiveTechnical,plannedTechnicalReserveBytes:20000000,reserveAlignmentPending:effectiveTechnical!==20000000},quotaRolloutArithmetic:{providerLimit:500000,previousObservationAt:priorQuota.observedAt,previousDisplayed:priorQuota.commandsDisplayed,previousWasRounded:priorQuota.commandsRounded,previousConservativeCommands:priorConservative,applicationPartitionMaximum:400000,sharedUnknownOrDeniedTrafficMargin:sharedMargin,totalUsingOldObservation:400000+priorConservative+sharedMargin,remainingUsingOldObservation:500000-(400000+priorConservative+sharedMargin),freshCurrentUsageMaximumBefore400kActivation:50000,freshObservationRequired:true,currentProviderQuotaVerified:false},guardian:{schedule:'0 * * * *',ticks31Days:ticks,measuredIdleCommands:guardian.idleCommandsIncludingEval,measuredIdle31DayCommands:guardian.idle31DayCommands,reservedIdle31DayCommands:guardian.idleConservativeReservations,reservedIdle31DayTransferBytes:idle.transferBytes,idleWithin12000:true,providerTicksWhileIdle:0,bootstrapAndDueWorkExcluded:true,bootstrapOrDueReservation:{commands:1104,transferBytes:64004096}},perRequest,workerSamples,workflows,acceptancePolicy:{registrationDaily200IsOnlyAbuseCeiling:true,guaranteedDailyUsers:null,guaranteedConcurrentUsers:null,guaranteedDailyPurchases:null,initialProductionPurchaseAccounts:1,initialProductionPayments:1,publicOpeningRequiresSeparateReview:true,admissionStopsBeforeNewPaymentOnInsufficientCredit:true},networkRequests:0,redisRemoteRequests:0,realPayments:0,providerRealExecutions:0,productionChanged:false,cronActivated:false,limitations:['Reservations are conservative envelopes, not provider billing or throughput benchmarks.','Continuous metadata and light native controls use bounded single-CAS snapshots; generic financial and public catalogue envelopes remain conservative, making transfer quota the controlling bound; the theoretical 200 registrations/day and 50 deliveries/day are not an availability guarantee.','Shared Redis current usage must be refreshed before production; the 25k display is an earlier rounded observation.','Unlimited denied traffic and other projects can consume physical quota beyond the application margin.','Held payment/delivery credits survive request-window expiry; aged uncertain operations reduce future admission.','Due reconciliation, retention and recovery work spend additional background capacity; idle forecast excludes that work.','Examples reuse one buyer MCP connection and one service; additional connections, queries or retries reduce available capacity.']};
if(process.argv.includes('--write-evidence'))await writeFile(resolve(ROOT,OUTPUT),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:evidence.status,sourceDigest:evidence.sourceDigest,guardian:evidence.guardian,storage:evidence.storage,workflows:Object.fromEntries(Object.entries(workflows).map(([name,value])=>[name,{reservation:value.reservation,maximumIfNothingElseRuns:value.maximumCompleteWorkloadsIfNothingElseRuns}])),quotaRolloutArithmetic:evidence.quotaRolloutArithmetic,networkRequests:0,realPayments:0,...(process.argv.includes('--write-evidence')?{evidence:OUTPUT}:{})}));
