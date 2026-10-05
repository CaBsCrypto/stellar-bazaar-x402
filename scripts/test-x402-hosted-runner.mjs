import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {assertHostedX402Preflight,runHostedX402Agent} from './run-hosted-x402-agent.mjs';
import {createX402HostedRuntime,newX402HostedReport,x402PublicHash,x402RequestProfile,x402PhaseListingProfile,x402NegativeReadProfile,assertX402HostedReport,preservePendingX402Counters,x402PlannedBudget} from './x402-hosted-runtime.mjs';
import {X402_ACCEPTANCE_LIMITS,X402_LOCAL_REQUIRED_RESULTS} from './x402-acceptance-manifest.mjs';
import {buyerCanonical,createMarketplaceBuyerIntent} from '../examples/marketplace-x402-buyer.mjs';
import {createAutomationPreviewFetch} from '../examples/protected-preview-client.mjs';

const draft=JSON.parse(await readFile('docs/evidence/sprint-x402-agent/service-preparation.json','utf8'));
const totals=()=>Object.fromEntries(Object.keys(X402_ACCEPTANCE_LIMITS).map(k=>[k,0]));
const external=()=>Object.fromEntries(['horizon','proof-dns','proof-http','provider','facilitator','rpc'].map(k=>[k,0]));
const source={sha:'a'.repeat(40),clean:true},origin='https://stellar-bazaar-x402-fixture-cabscryptocontacto-6028s-projects.vercel.app';
const local={status:'PASS_NATIVE_X402_LOCAL',sourceSha:source.sha,sourceBinding:{candidateCommitted:true,finalShaRequired:false},totals:totals(),coverage:{agentHttp:true,redis:true,facilitator:true,horizon:true,rpc:true,provider:true},remoteRequests:0,automaticRetries:0,requestProfiles:[],...Object.fromEntries(X402_LOCAL_REQUIRED_RESULTS.map(k=>[k,true]))};
const capture={status:'PASS_LOCAL_CAPTURE',captureComplete:true,physicalWireObserved:false,coverage:{httpRetries:0}};
const captureTotals={...totals(),apiRequests:1,redisRestExchanges:4,redisCommandsUpperBound:12,outboundPayloadBytes:300,inboundPayloadBytes:500};
const agentCapture={version:1,kind:"x402-agent-preflight-capture",status:"PASS_REAL_AGENT_PREFLIGHT_CAPTURE",evidenceKind:"real-hosted-agent-transport",testDoubles:false,captureComplete:true,automaticRetries:0,signatureAuthorizations:0,paymentSubmissions:0,providerExecutions:0,binding:{planId:draft.planId,sourceSha:source.sha,deploymentId:"dpl_fixture",origin},requests:[{requestId:randomUUID(),origin,path:"/api/market/orders",method:"GET",status:"CONFIRMED",meterVersion:"v2",httpStatus:200,external:external(),totals:captureTotals}],totals:captureTotals};
const budget={maximumCalls:3,redisRestExchanges:8,redisCommandsUpperBound:30,outboundPayloadBytes:262144,inboundPayloadBytes:262144,responsePayloadBytes:65536,external:external()};
function manifest(){
 return {...structuredClone(draft),kind:'x402-agent-first-acceptance',sourceSha:source.sha,limits:{...X402_ACCEPTANCE_LIMITS},
  config:{...draft.config,marketplaceOrigin:origin,purchases:true,marketplaceX402:true},
  deployments:{application:{id:'dpl_fixture',origin,sourceSha:source.sha,readyState:'READY',target:'preview',protectionVerified:true,configurationVerified:true,payloadFingerprint:'b'.repeat(64),configurationHash:'c'.repeat(64)},provider:{...draft.deployments.provider,newProofDeploymentId:'dpl_providerfixture',protectionVerified:true}},
  agentCapturePreflight:{sha256:x402PublicHash(agentCapture)},localEvidence:{sha256:x402PublicHash(local)},capturePreflight:{sha256:x402PublicHash(capture)},payloadsSha256:x402PublicHash(draft.payloads),executionPolicy:{gateVersion:2,automaticTransportRetries:0,newWalletProvisions:0,mainnetPayments:false},
  readiness:{agentCapturePreflightVerified:true,localMeasured:true,nativeCapturePreflight:true,payloadsFrozen:true,deploymentsVerified:true,canExecute:true,canOpen:false},
  runtime:{budgetBoundsReviewed:true,budgetScope:"complete-sprint",localProfilesSha256:x402PublicHash(local.requestProfiles),requestBudgets:{'api:services:list':structuredClone(budget),'api:services:submit':structuredClone(budget),'api:orders:list':structuredClone(budget),'api:orders:read':structuredClone(budget),'rpc:getLatestLedger':{...budget,redisRestExchanges:0,redisCommandsUpperBound:0}},reserves:totals(),initialCounters:totals(),initialStorage:{workspace:0,market:0,review:0,catalog:0,settlement:0}}};
}
function measured(body,{status=200,redis=2,commands=5,uncertain=false}={}){
 const h={'x-bazaar-acceptance-meter':'v2','x-bazaar-acceptance-request-id':randomUUID(),'x-bazaar-redis-requests':String(redis),'x-bazaar-redis-commands-upper-bound':String(commands),'x-bazaar-redis-outbound-payload-bytes':'100','x-bazaar-redis-inbound-payload-bytes':'80','x-bazaar-external-outbound-payload-bytes':'0','x-bazaar-external-inbound-payload-bytes':'0','x-bazaar-redis-uncertain':String(uncertain)};
 for(const k of ['workspace','market','review','catalog','settlement'])h['x-bazaar-'+k+'-stored-bytes-upper-bound']='0';for(const k of Object.keys(external()))h['x-bazaar-external-'+k]='0';return Response.json(body,{status,headers:h});
}
let tests=0;
for(const mutate of [m=>m.readiness.canExecute=false,m=>m.executionPolicy.gateVersion=1,m=>m.runtime.budgetBoundsReviewed=false,m=>m.config.rpcOrigin='https://attacker.example',m=>m.deployments.application.protectionVerified=false,m=>m.payloads.orders[0].create.paymentProtocol=undefined]){
 const m=manifest();mutate(m);let loads=0,locks=0,requests=0;
 await assert.rejects(()=>runHostedX402Agent({command:'submit',paths:{manifest:'m',local:'l',capture:'c',hostedCapture:'h',report:'r'},dependencies:{readJson:async p=>p==='m'?m:p==='l'?local:capture,optionalJson:async p=>p.endsWith("agent-capture-preflight-public.json")?agentCapture:undefined,sourceBinding:async()=>source,loadPacket:async()=>{loads++;},acquireLock:async()=>{locks++;},fetchImpl:async()=>{requests++;}}}));assert.equal(loads+locks+requests,0);tests++;
}
const dirty={...source,clean:false};assert.throws(()=>assertHostedX402Preflight({manifest:manifest(),localReport:local,agentCapturePreflight:agentCapture,source:dirty,command:'submit'}));tests++;
const missingContracts=manifest();missingContracts.readiness.walletsPreflightPassed=true;
let prematurePacketReads=0;
await assert.rejects(()=>runHostedX402Agent({command:'buy',index:0,paths:{manifest:'m',local:'l',capture:'c',hostedCapture:'h',report:'r'},dependencies:{readJson:async p=>p==='m'?missingContracts:p==='l'?local:capture,optionalJson:async p=>p.endsWith("agent-capture-preflight-public.json")?agentCapture:undefined,sourceBinding:async()=>source,loadPacket:async()=>{prematurePacketReads++;}}}),/FROZEN_HOSTED_CONTRACT_CHECKS_REQUIRED/);
assert.equal(prematurePacketReads,0);tests++;
const sellerProfiles={'api:mcp:tool:claim_market_order':4,'api:mcp:tool:deliver_market_order':2,'api:mcp:tool:fail_market_order':2};
const contracts=manifest();contracts.readiness.walletsPreflightPassed=true;
contracts.runtime.contractChecksPlan={version:1,mutations:['price','recipient','asset','network','content'],operationIds:draft.payloads.orders.map(o=>o.operationId),timing:'after-confirmed-payment-and-terminal-delivery'};
for(const [name,maximumCalls]of Object.entries({'api:x402:reject-requirements':4,'api:orders:reject-content':1,'api:orders:replay':2,'api:x402:replay':2,...sellerProfiles}))contracts.runtime.requestBudgets[name]={...structuredClone(budget),maximumCalls};
assert.equal(assertHostedX402Preflight({manifest:contracts,localReport:local,agentCapturePreflight:agentCapture,source,command:'buy',index:0}).origin,origin);tests++;
// A replay policy must reject every possible external execution before private access.
for(const name of Object.keys(sellerProfiles))for(const kind of Object.keys(external())){
 const altered=structuredClone(contracts);altered.runtime.requestBudgets[name].external[kind]=1;let packetReads=0,locks=0,requests=0;
 await assert.rejects(()=>runHostedX402Agent({command:'buy',index:0,paths:{manifest:'m',local:'l',capture:'c',hostedCapture:'h',report:'r'},dependencies:{readJson:async p=>p==='m'?altered:p==='l'?local:capture,optionalJson:async p=>p.endsWith("agent-capture-preflight-public.json")?agentCapture:undefined,sourceBinding:async()=>source,loadPacket:async()=>{packetReads++;},acquireLock:async()=>{locks++;},fetchImpl:async()=>{requests++;}}}),/SELLER_REPLAY_MUST_HAVE_NO_EXTERNAL_EXECUTION/);
 assert.equal(packetReads+locks+requests,0);tests++;
}
// MCP sees responses only after the runtime has checked the server meter.
for(const kind of ['provider','rpc','facilitator']){
 const replayReport=newX402HostedReport(contracts);let requests=0;
 const replayRuntime=createX402HostedRuntime({manifest:contracts,report:replayReport,phase:'test',persist:async()=>{},fetchImpl:async()=>{requests++;const response=measured({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:JSON.stringify({order:{phase:'delivered'}})}]}});response.headers.set('x-bazaar-external-'+kind,'1');return response;}});
 const replayFetch=await replayRuntime.preview(origin,'z'.repeat(32),'dpl_fixture');
 await assert.rejects(()=>replayFetch(origin+'/api/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'claim_market_order',arguments:{operationId:draft.payloads.orders[0].operationId,attemptId:randomUUID()}}})}));
 assert.equal(requests,1);assert.equal(replayReport.status,'UNCERTAIN');assert.equal(replayReport.attempts[0].status,'UNCERTAIN');assert.equal(replayReport.attempts[0].external[kind],1);tests++;
}
const arithmeticCases=[
 ['apiRequests',m=>{m.runtime.initialCounters.apiRequests=106;}],
 ['redisRestExchanges',m=>{m.runtime.initialCounters.redisRestExchanges=305;}],
 ['redisCommandsUpperBound',m=>{m.runtime.initialCounters.redisCommandsUpperBound=2041;}],
 ['outboundPayloadBytes',m=>{m.runtime.initialCounters.outboundPayloadBytes=16777216-3932160+1;}],
 ['inboundPayloadBytes',m=>{m.runtime.initialCounters.inboundPayloadBytes=33554432-3932160+1;}],
 ['storedBytes',m=>{m.storageAllocation.workspace++;}],
 ['paymentSubmissionIntents',m=>{m.runtime.reserves.paymentSubmissionIntents=1;}]
];
for(const [resource,mutate]of arithmeticCases){
 const m=manifest();mutate(m);let packetReads=0,locks=0,requests=0;
 await assert.rejects(()=>runHostedX402Agent({command:'submit',paths:{manifest:'m',local:'l',capture:'c',hostedCapture:'h',report:'r'},dependencies:{readJson:async p=>p==='m'?m:p==='l'?local:capture,optionalJson:async p=>p.endsWith("agent-capture-preflight-public.json")?agentCapture:undefined,sourceBinding:async()=>source,loadPacket:async()=>{packetReads++;},acquireLock:async()=>{locks++;},fetchImpl:async()=>{requests++;}}}),new RegExp('PLANNED_BUDGET_EXCEEDED:'+resource));
 assert.equal(packetReads+locks+requests,0);tests++;
}
const arithmetic=x402PlannedBudget(manifest());assert.equal(arithmetic.combined.redisRestExchanges,96);assert.equal(arithmetic.combined.apiRequests,15);assert.equal(arithmetic.combined.paymentSubmissionIntents,2);tests++;
const weighted=manifest();weighted.runtime.requestBudgets['api:services:list'].external['proof-dns']=1;
assert.equal(x402PlannedBudget(weighted).combined.apiRequests,18);tests++;
const baselineStorage=manifest();baselineStorage.runtime.initialStorage.workspace=1000;baselineStorage.runtime.initialCounters.storedBytes=1000;
assert.equal(newX402HostedReport(baselineStorage).storage.workspace,1000);assert.equal(x402PlannedBudget(baselineStorage).combined.storedBytes,49164);tests++;
assert.equal(x402RequestProfile('api',origin+'/api/market/orders/'+draft.payloads.orders[0].operationId+'/x402',{method:'POST',body:'{}',headers:{'payment-signature':'not-emitted'}}),'api:x402:pay');tests++;
assert.throws(()=>x402RequestProfile('rpc','https://soroban-testnet.stellar.org/',{method:'POST',body:JSON.stringify({method:'sendTransaction'})}));tests++;

// The only successful phase below uses literal in-memory HTTPS transport doubles.
const m=manifest(),packet={sale:{providerOrigin:draft.config.providerOrigin,bazaarBypass:'q'.repeat(32),providerBypass:'r'.repeat(32),operator:'o'.repeat(43),wallets:[],worker:'w'.repeat(43),historic:'preserve me exactly'},identities:[{rotatedHuman:'a'.repeat(43),rotatedAgent:'b'.repeat(43)},{human:'c'.repeat(43),agent:'d'.repeat(43)}],receipt:draft.participants.map(p=>({ownerId:p.ownerId,workspaceId:p.workspaceId}))};
const historic=x402PublicHash(buyerCanonical(packet.sale));let requests=0,loads=0,saves=0,locks=0,releases=0,preserves=0,publicReport;
const result=await runHostedX402Agent({command:'submit',paths:{manifest:'m',local:'l',capture:'c',hostedCapture:'h',report:'r'},dependencies:{readJson:async p=>p==='m'?m:p==='l'?local:capture,optionalJson:async p=>p.endsWith("agent-capture-preflight-public.json")?agentCapture:undefined,sourceBinding:async()=>source,loadPacket:async()=>{loads++;return packet;},savePacket:async()=>{saves++;},writeReport:async report=>{publicReport=structuredClone(report);},acquireLock:async()=>{locks++;return {release:async()=>{releases++;},preserve:async()=>{preserves++;}};},fetchImpl:async(url,init)=>{requests++;assert.equal(new URL(url).origin,origin);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.headers.get('x-vercel-protection-bypass'),'q'.repeat(32));return init.method==='GET'?measured({services:[],mine:[],paused:false}):measured({submission:{card:draft.payloads.card,status:'awaiting-control-proof',control:{expectedRecord:'stellar-bazaar-verification='+'a'.repeat(24)}}},{status:201});}}});
assert.equal(result.status,'PASS');assert.equal(requests,2);assert.equal(loads,1);assert.equal(locks,1);assert.equal(releases,1);assert.equal(preserves,0);assert.ok(saves>=3);assert.equal(x402PublicHash(buyerCanonical(packet.sale)),historic);assert.deepEqual(packet.x402.completed,['submit']);assert.equal(publicReport.totals.apiRequests,2);assert.equal(publicReport.totals.redisRestExchanges,4);assert.ok(!JSON.stringify(publicReport).includes('q'.repeat(32))&&!JSON.stringify(publicReport).includes('a'.repeat(43)));tests++;

const report=newX402HostedReport(m);let persisted=0,calls=0;
const runtime=createX402HostedRuntime({manifest:m,report,phase:'test',persist:async()=>{persisted++;},fetchImpl:async()=>{calls++;assert.ok(persisted>0);throw Error('response lost');}});
const preview=await runtime.preview(origin,'z'.repeat(32),'dpl_fixture');await assert.rejects(()=>preview(origin+'/api/market/orders',{headers:{authorization:'Bearer '+'k'.repeat(43)}}));assert.equal(calls,1);assert.equal(report.status,'UNCERTAIN');assert.equal(report.unknownRequestsChargedAtUpperBound,1);assert.equal(report.totals.redisRestExchanges,budget.redisRestExchanges);assert.equal(report.totals.inboundPayloadBytes,budget.inboundPayloadBytes);await assert.rejects(()=>preview(origin+'/api/market/orders'));assert.equal(calls,1);tests++;
const limited=manifest();limited.runtime.reserves.apiRequests=120;assert.throws(()=>newX402HostedReport(limited),/PLANNED_BUDGET_EXCEEDED:apiRequests/);tests++;
const recoveryRuntime=createX402HostedRuntime({manifest:m,report,phase:'recover',readRecovery:true,persist:async()=>{},fetchImpl:async()=>{calls++;return measured({orders:[]});}});const recoverFetch=await recoveryRuntime.preview(origin,'z'.repeat(32),'dpl_fixture');await assert.rejects(()=>recoverFetch(origin+'/api/market/orders',{method:'POST',body:'{}'}));assert.equal(calls,1);await recoverFetch(origin+'/api/market/orders');assert.equal(calls,2);assert.equal(report.status,'UNCERTAIN');tests++;
const meterReport=newX402HostedReport(m);const meterRuntime=createX402HostedRuntime({manifest:m,report:meterReport,phase:'test',persist:async()=>{},fetchImpl:async()=>measured({},{redis:9})});const meterFetch=await meterRuntime.preview(origin,'z'.repeat(32),'dpl_fixture');await assert.rejects(()=>meterFetch(origin+'/api/market/orders'));assert.equal(meterReport.status,'UNCERTAIN');assert.equal(meterReport.totals.redisRestExchanges,9);tests++;
await assert.rejects(()=>runtime.preview('https://attacker.example','z'.repeat(32),'dpl_fixture'));assert.equal(calls,2);tests++;
assertX402HostedReport(publicReport,m);const edited=structuredClone(publicReport);edited.totals.redisRestExchanges=0;assert.throws(()=>assertX402HostedReport(edited,m));tests++;
const pending=structuredClone(publicReport),last=pending.attempts.at(-1);for(const[key,value]of Object.entries(last.actual))pending.totals[key]-=value;delete last.actual;last.status='PENDING';pending.status='IN_PROGRESS';assertX402HostedReport(pending,m);preservePendingX402Counters(pending);assertX402HostedReport(pending,m);const before=JSON.stringify(pending);preservePendingX402Counters(pending);assert.equal(JSON.stringify(pending),before);assert.equal(pending.status,'UNCERTAIN');tests++;
const recoveryManifest=manifest();recoveryManifest.readiness.canReadRecovery=true;recoveryManifest.config.purchases=false;
const recoveryPacket=structuredClone(packet),frozen=draft.payloads.orders[0];const buyer=createMarketplaceBuyerIntent({origin,card:draft.payloads.card,input:frozen.create.input,payer:draft.participants[1].wallet,operationId:frozen.operationId});buyer.phase='payment-uncertain';recoveryPacket.x402.buyerIntents=[buyer];recoveryPacket.x402.startedPhases.push('buy-1');
const uncertainReport=structuredClone(publicReport);uncertainReport.status='UNCERTAIN';let recoveryCalls=0,recoveryReleased=0,recoveryPreserved=0;
const recovered=await runHostedX402Agent({command:'recover',paths:{manifest:'m',local:'l',capture:'c',hostedCapture:'h',report:'r'},dependencies:{readJson:async p=>p==='m'?recoveryManifest:p==='l'?local:capture,optionalJson:async p=>p==='r'?uncertainReport:p.endsWith("agent-capture-preflight-public.json")?agentCapture:undefined,sourceBinding:async()=>source,loadPacket:async()=>recoveryPacket,savePacket:async()=>{},writeReport:async()=>{},acquireLock:async(_dir,_id,options)=>{assert.equal(options.readRecovery,true);return {release:async()=>{recoveryReleased++;},preserve:async()=>{recoveryPreserved++;}};},fetchImpl:async(url,init)=>{recoveryCalls++;assert.equal(init.method,'GET');assert.equal(new URL(url).origin,origin);return measured({order:{...frozen.create,card:draft.payloads.card,inputHash:buyer.inputHash,destination:draft.participants[0].wallet,amount:'0.01',settlement:draft.config.identity,phase:'payment-uncertain'}});}}});
assert.equal(recovered.status,'PASS_READ_RECOVERY_UNCERTAINTY_PRESERVED');assert.equal(recoveryCalls,1);assert.equal(recoveryReleased,1);assert.equal(recoveryPreserved,0);assert.equal(uncertainReport.status,'UNCERTAIN');assert.equal(recoveryPacket.x402.buyerIntents[0].phase,'payment-uncertain');assert.equal(x402PublicHash(buyerCanonical(recoveryPacket.sale)),historic);tests++;
let partial,cancelled=0;
const partialFetch=createAutomationPreviewFetch({origin,bypassSecret:'x'.repeat(32),maxResponseBytes:128,fetchImpl:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(200));},cancel(){cancelled++;}}),{status:200,headers:{'x-partial':'seen'}}),onUncertain:async meta=>{partial=meta;}});
await assert.rejects(()=>partialFetch(origin+'/api/market/orders'),/RESPONSE_OVERSIZE/);assert.equal(partial.responseBodyBytes,200);assert.ok(partial.responseHeaderBytes>0);assert.equal(partial.responseBytes,partial.responseBodyBytes+partial.responseHeaderBytes);assert.equal(partial.status,200);assert.equal(cancelled,1);assert.ok(!JSON.stringify(partial).includes('x'.repeat(32)));tests++;
const partialManifest=manifest();partialManifest.runtime.requestBudgets['api:orders:list']={...budget,inboundPayloadBytes:100,responsePayloadBytes:100};const partialReport=newX402HostedReport(partialManifest);
const partialRuntime=createX402HostedRuntime({manifest:partialManifest,report:partialReport,phase:'test',persist:async()=>{},fetchImpl:async()=>new Response(new Uint8Array(200))});const measuredPartial=await partialRuntime.preview(origin,'z'.repeat(32),'dpl_fixture');await assert.rejects(()=>measuredPartial(origin+'/api/market/orders'));
assert.equal(partialReport.status,'UNCERTAIN');assert.equal(partialReport.attempts[0].partialResponsePayloadBytes,200);assert.equal(partialReport.totals.inboundPayloadBytes,200);tests++;

// Cheaper read branches require exact reviewed baseline, role, phase and payload
// bindings. No role or revocation is inferred from an expected response status.
const readTokens={sellerHuman:'h'.repeat(43),sellerAgent:'j'.repeat(43),buyerHuman:'k'.repeat(43),buyerAgent:'m'.repeat(43),sellerBootstrap:'n'.repeat(43),buyerBootstrap:'p'.repeat(43),invalid:'q'.repeat(43)};
const readHashes=Object.fromEntries(Object.entries(readTokens).map(([name,token])=>[name,x402PublicHash(token)]));
const replacementOrigin=origin.replace('fixture-','replacement-');
function readProfileManifest(){
 const value=manifest();value.deployments.replacement={...value.deployments.application,id:'dpl_replacementfixture',origin:replacementOrigin};
 value.runtime.phaseListingPlan={version:1,planId:value.planId,sourceSha:value.sourceSha,baselineSha256:'d'.repeat(64),sellerOwnerId:value.participants[0].ownerId,buyerOwnerId:value.participants[1].ownerId,initialServices:[{serviceId:value.payloads.closure.withdrawServiceIds.find(id=>id!==value.payloads.serviceId),ownerId:value.participants[0].ownerId,status:'activated',withdrawn:false}],credentialHashes:{sellerHuman:readHashes.sellerHuman,buyerAgent:readHashes.buyerAgent}};
 value.runtime.negativeReadPlan={version:1,planId:value.planId,sourceSha:value.sourceSha,baselineSha256:'d'.repeat(64),sellerOwnerId:value.participants[0].ownerId,credentialHashes:{invalid:readHashes.invalid,sellerHuman:readHashes.sellerHuman,sellerAgent:readHashes.sellerAgent},baselineAccessHashes:Object.entries(readHashes).filter(([name])=>name!=='invalid').map(([,digest])=>digest)};
 for(const [name,maximumCalls,redis,commands]of [['api:services:list:submit',1,9,24],['api:services:list:activate',1,10,28],['api:services:list:retire',1,12,30],['api:orders:negative-invalid',2,1,4],['api:orders:negative-revoked',2,1,4],['api:access:revoke',1,6,30]])value.runtime.requestBudgets[name]={...structuredClone(budget),maximumCalls,redisRestExchanges:redis,redisCommandsUpperBound:commands};
 return value;
}
const plannedReads=readProfileManifest();newX402HostedReport(plannedReads);tests++;
const getWith=token=>({method:'GET',headers:{authorization:'Bearer '+token}});
for(const [phase,at,token]of [['submit',origin,readTokens.sellerHuman],['activate',origin,readTokens.buyerAgent],['retire',replacementOrigin,readTokens.sellerHuman]]){
 assert.equal(x402PhaseListingProfile({manifest:plannedReads,phase,origin:at},at+'/api/market/services',getWith(token)),'api:services:list:'+phase);tests++;
}
const listingContext={manifest:plannedReads,phase:'submit',origin};
for(const [url,init,context]of [[origin+'/api/market/services',getWith(readTokens.buyerAgent),listingContext],[origin+'/api/market/services?x=1',getWith(readTokens.sellerHuman),listingContext],[origin+'/api/market/services',{...getWith(readTokens.sellerHuman),body:'{}'},listingContext],[origin+'/api/market/services',{...getWith(readTokens.sellerHuman),method:'POST'},listingContext],['https://attacker.example/api/market/services',getWith(readTokens.sellerHuman),listingContext],[origin+'/api/market/services',getWith(readTokens.sellerHuman),{...listingContext,phase:'buy-1'}]]){assert.throws(()=>x402PhaseListingProfile(context,url,init));tests++;}
for(const mutate of [v=>delete v.runtime.phaseListingPlan,v=>v.runtime.phaseListingPlan.baselineSha256='bad',v=>v.runtime.phaseListingPlan.initialServices.push({...v.runtime.phaseListingPlan.initialServices[0]}),v=>v.runtime.negativeReadPlan.baselineAccessHashes.push(readHashes.invalid),v=>v.runtime.requestBudgets['api:orders:negative-revoked'].redisCommandsUpperBound=3]){
 const altered=readProfileManifest();mutate(altered);assert.throws(()=>newX402HostedReport(altered));tests++;
}
const negativeContext={manifest:plannedReads,report:newX402HostedReport(plannedReads),phase:'buy-1',origin,probe:'invalid',tokenSha256:readHashes.invalid,operationId:plannedReads.payloads.orders[0].operationId};
const negativeUrl=origin+'/api/market/orders/'+negativeContext.operationId;
assert.equal(x402NegativeReadProfile(negativeContext,negativeUrl,getWith(readTokens.invalid)),'api:orders:negative-invalid');tests++;
for(const [url,init,context]of [[negativeUrl,getWith(readTokens.buyerAgent),negativeContext],[negativeUrl+'?x=1',getWith(readTokens.invalid),negativeContext],[negativeUrl,{...getWith(readTokens.invalid),body:'{}'},negativeContext],[negativeUrl,{...getWith(readTokens.invalid),method:'POST'},negativeContext],[negativeUrl,getWith(readTokens.invalid),{...negativeContext,phase:'recover'}],[origin+'/api/market/orders/'+plannedReads.payloads.orders[1].operationId,getWith(readTokens.invalid),negativeContext],['https://attacker.example/api/market/orders/'+negativeContext.operationId,getWith(readTokens.invalid),negativeContext]]){assert.throws(()=>x402NegativeReadProfile(context,url,init));tests++;}
const revokedContext={manifest:plannedReads,report:negativeContext.report,phase:'retire',origin:replacementOrigin,probe:'revoked',tokenSha256:readHashes.sellerHuman};
assert.throws(()=>x402NegativeReadProfile(revokedContext,replacementOrigin+'/api/market/orders',getWith(readTokens.sellerHuman)),/CONFIRMED_REVOCATION_REQUIRED/);tests++;
const revokeMarker={origin:replacementOrigin,phase:'retire',path:'/api/workspaces/'+plannedReads.participants[0].workspaceId+'/access',profile:'api:access:revoke',status:'CONFIRMED',httpStatus:200,payloadHash:x402PublicHash(JSON.stringify(plannedReads.payloads.revocation))};
revokedContext.report.attempts.push(revokeMarker);
assert.equal(x402NegativeReadProfile(revokedContext,replacementOrigin+'/api/market/orders',getWith(readTokens.sellerHuman)),'api:orders:negative-revoked');tests++;
for(const mutate of [v=>v.report.attempts[0].status='UNCERTAIN',v=>v.report.attempts[0].payloadHash='e'.repeat(64),v=>v.report.attempts[0].httpStatus=401,v=>v.phase='recover',v=>v.origin=origin,v=>v.tokenSha256=readHashes.buyerAgent]){const altered=structuredClone(revokedContext);mutate(altered);assert.throws(()=>x402NegativeReadProfile(altered,altered.origin+'/api/market/orders',getWith(altered.tokenSha256===readHashes.buyerAgent?readTokens.buyerAgent:readTokens.sellerHuman)));tests++;}
let boundReadRequests=0;const boundReadReport=newX402HostedReport(plannedReads);
const listingRuntime=createX402HostedRuntime({manifest:plannedReads,report:boundReadReport,phase:'submit',persist:async()=>{},fetchImpl:async()=>{boundReadRequests++;return measured({services:[],mine:[],paused:true},{redis:9,commands:24});}});
const listingFetch=await listingRuntime.preview(origin,'z'.repeat(32),'dpl_fixture');
await assert.rejects(()=>listingFetch(origin+'/api/market/services',getWith(readTokens.buyerAgent)));assert.equal(boundReadRequests,0);
await listingFetch(origin+'/api/market/services',getWith(readTokens.sellerHuman));assert.equal(boundReadReport.attempts[0].profile,'api:services:list:submit');assert.equal(boundReadReport.attempts[0].reserved.redisRestExchanges,9);tests++;
const negativeRuntime=createX402HostedRuntime({manifest:plannedReads,report:boundReadReport,phase:'buy-1',persist:async()=>{},fetchImpl:async()=>{boundReadRequests++;return measured({error:{code:'UNAUTHORIZED'}},{status:401,redis:1,commands:4});}});
const negativeFetch=await negativeRuntime.negativeReadPreview(origin,'z'.repeat(32),'dpl_fixture',{probe:'invalid',tokenSha256:readHashes.invalid,operationId:negativeContext.operationId});
await assert.rejects(()=>negativeFetch(negativeUrl,getWith(readTokens.buyerAgent)));assert.equal(boundReadRequests,1);
const invalidResponse=await negativeFetch(negativeUrl,getWith(readTokens.invalid));assert.equal(invalidResponse.status,401);assert.equal(boundReadReport.attempts[1].profile,'api:orders:negative-invalid');assert.equal(boundReadReport.attempts[1].reserved.redisRestExchanges,1);assert.equal(boundReadReport.attempts[1].reserved.redisCommandsUpperBound,4);assertX402HostedReport(boundReadReport,plannedReads);assert.ok(!JSON.stringify(boundReadReport).includes(readTokens.invalid));tests++;
console.log(JSON.stringify({status:'PASS',tests,remoteRequests:0,actualDpapiReads:0,closedGateCredentialReads:0,automaticRetries:0,historicalSalePreserved:true}));
