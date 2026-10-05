import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {prepareX402Manifest,assertX402ExecutionGate,X402_ACCEPTANCE_LIMITS,X402_LOCAL_REQUIRED_RESULTS} from './x402-acceptance-manifest.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),sourceSha='a'.repeat(40),previousManifestBytes=Buffer.from(JSON.stringify({planId:randomUUID()}));
const prior=JSON.parse(previousManifestBytes),previousCountersBytes=Buffer.from(JSON.stringify({planId:prior.planId,status:'INCOMPLETE_EVIDENCE',complete:false,totals:{apiRequests:104}}));
const origin='https://protected-fixture.vercel.app',totals=()=>Object.fromEntries(Object.keys(X402_ACCEPTANCE_LIMITS).map(key=>[key,0])),external=()=>Object.fromEntries(['horizon','proof-dns','proof-http','provider','facilitator','rpc'].map(key=>[key,0]));
const draft={sourceSha,storageAllocation:{workspace:6000,market:22000,review:5000,catalog:3000,settlement:13164},config:{network:'stellar:testnet'},runtime:{budgetBoundsReviewed:true,budgetScope:'preparation'},deployments:{application:{id:'dpl_fixture',origin}},payloads:{operations:['public-op-1','public-op-2']}};
const localReport={status:'PASS_NATIVE_X402_LOCAL',sourceSha,sourceBinding:{candidateCommitted:true,finalShaRequired:false},automaticRetries:0,remoteRequests:0,totals:totals(),coverage:Object.fromEntries(['agentHttp','redis','facilitator','horizon','rpc','provider'].map(key=>[key,true])),...Object.fromEntries(X402_LOCAL_REQUIRED_RESULTS.map(key=>[key,true]))};
const capturePreflight={status:'PASS_LOCAL_CAPTURE',captureComplete:true,physicalWireObserved:false,coverage:{httpRetries:0}};
const options=phase=>({localReport,expectedSha:sourceSha,phase});
let scenarios=0;const manifest=prepareX402Manifest({draft,localReport,capturePreflight,previousManifestBytes,previousCountersBytes});
assert.notEqual(manifest.planId,prior.planId);assert.equal(manifest.previousEvidence.complete,false);for(const key of ['canExecute','canRetireSynthetic','canOpen','deploymentsVerified','payloadsFrozen','agentCapturePreflightVerified','retirementPlanReviewed','independentReviewPassed'])assert.equal(manifest.readiness[key],false);assert.equal(manifest.agentCapturePreflight,null);assert.deepEqual(manifest.limits,X402_ACCEPTANCE_LIMITS);scenarios++;
assert.throws(()=>assertX402ExecutionGate(manifest,options('submit')),/CLOSED_GATE/);scenarios++;
const ready=structuredClone(manifest);for(const key of ['canExecute','deploymentsVerified','payloadsFrozen'])ready.readiness[key]=true;
for(const phase of ['submit','activate','agent-preflight']){const result=assertX402ExecutionGate(ready,options(phase));assert.equal(result.phase,phase);assert.equal(result.canOpen,false);scenarios++;}
assert.throws(()=>assertX402ExecutionGate(ready,{localReport,expectedSha:sourceSha}),/EXPLICIT_EXECUTION_PHASE_REQUIRED/);scenarios++;
const noNativeFixture=structuredClone(ready);noNativeFixture.capturePreflight=null;noNativeFixture.readiness.nativeCapturePreflight=false;assert.equal(assertX402ExecutionGate(noNativeFixture,options('submit')).status,'PASS_EFFECT_GATE');scenarios++;
const changed=structuredClone(ready);changed.payloads.operations.push('changed');assert.throws(()=>assertX402ExecutionGate(changed,options('submit')),/PAYLOAD_CHANGED/);scenarios++;
const missing=structuredClone(localReport);delete missing.totals.redisRestExchanges;assert.equal(prepareX402Manifest({draft,localReport:missing,previousManifestBytes,previousCountersBytes}).readiness.localMeasured,false);scenarios++;
const provision=structuredClone(localReport);provision.totals.friendbotClaims=1;assert.equal(prepareX402Manifest({draft,localReport:provision,previousManifestBytes,previousCountersBytes}).readiness.localMeasured,false);scenarios++;
const fakeCapture={...capturePreflight,status:'PASS_PARSER_FIXTURE',captureComplete:false};assert.equal(prepareX402Manifest({draft,localReport,capturePreflight:fakeCapture,previousManifestBytes,previousCountersBytes}).readiness.nativeCapturePreflight,false);scenarios++;
for(const mutate of [m=>m.executionPolicy.gateVersion=1,m=>m.runtime.budgetBoundsReviewed=false,m=>delete m.runtime.budgetScope]){const altered=structuredClone(ready);mutate(altered);assert.throws(()=>assertX402ExecutionGate(altered,options('submit')));scenarios++;}
const complete=structuredClone(noNativeFixture);complete.runtime.budgetScope='complete-sprint';
assert.throws(()=>assertX402ExecutionGate(complete,options('buy')),/AGENT_CAPTURE_PREFLIGHT_NOT_VERIFIED/);scenarios++;
complete.readiness.agentCapturePreflightVerified=true;assert.throws(()=>assertX402ExecutionGate(complete,options('buy')),/REAL_AGENT_CAPTURE_REQUIRED/);scenarios++;
// In-memory metadata fixtures exercise validation only: no real evidence is written or enabled.
const request={requestId:randomUUID(),origin,status:'CONFIRMED',meterVersion:'v2',method:'GET',path:'/api/market/orders',httpStatus:200,external:external(),totals:{...totals(),apiRequests:1,redisRestExchanges:4,redisCommandsUpperBound:16,outboundPayloadBytes:100,inboundPayloadBytes:200,storedBytes:1000}};
const agentCapture={version:1,kind:'x402-agent-preflight-capture',status:'PASS_REAL_AGENT_PREFLIGHT_CAPTURE',evidenceKind:'real-hosted-agent-transport',testDoubles:false,captureComplete:true,binding:{planId:complete.planId,sourceSha,deploymentId:'dpl_fixture',origin},automaticRetries:0,signatureAuthorizations:0,paymentSubmissions:0,providerExecutions:0,requests:[request],totals:structuredClone(request.totals)};
complete.agentCapturePreflight={sha256:hash(agentCapture)};
assert.equal(assertX402ExecutionGate(complete,{...options('buy'),agentCapturePreflight:agentCapture}).status,'PASS_EFFECT_GATE');scenarios++;
const tampered=structuredClone(agentCapture);tampered.requests[0].totals.outboundPayloadBytes++;assert.throws(()=>assertX402ExecutionGate(complete,{...options('buy'),agentCapturePreflight:tampered}),/AGENT_CAPTURE_CHANGED/);scenarios++;
const invalidCaptures=[
 [c=>c.testDoubles=true,/SYNTHETIC_AGENT_CAPTURE_DENIED/],
 [c=>c.evidenceKind='synthetic-parser-fixture',/REAL_AGENT_TRANSPORT_REQUIRED/],
 [c=>c.status='PASS_LOCAL_CAPTURE',/AssertionError/],
 [c=>c.captureComplete=false,/AssertionError/],
 [c=>c.binding.sourceSha='b'.repeat(40),/AGENT_CAPTURE_BINDING_MISMATCH/],
 [c=>c.binding.planId=randomUUID(),/AGENT_CAPTURE_BINDING_MISMATCH/],
 [c=>c.binding.deploymentId='dpl_other',/AGENT_CAPTURE_BINDING_MISMATCH/],
 [c=>c.binding.origin='https://other.vercel.app',/AGENT_CAPTURE_BINDING_MISMATCH/],
 [c=>c.requests[0].origin='https://other.vercel.app',/AssertionError/],
 [c=>c.requests[0].meterVersion='v1',/AGENT_SERVER_METER_REQUIRED/],
 [c=>delete c.requests[0].requestId,/AGENT_REQUEST_ID_REQUIRED/],
 [c=>c.requests.push(structuredClone(c.requests[0])),/DUPLICATE_AGENT_REQUEST_ID/],
 [c=>c.requests[0].status='UNCERTAIN',/AssertionError/],
 [c=>c.requests[0].method='POST',/AGENT_PREFLIGHT_READ_ONLY/],
 [c=>c.requests[0].path+='?hidden=1',/AGENT_CAPTURE_ROUTE_REQUIRED/],
 [c=>delete c.requests[0].totals.redisRestExchanges,/AGENT_CAPTURE_COUNTER_REQUIRED/],
 [c=>c.requests[0].totals.redisRestExchanges='unknown',/AGENT_CAPTURE_COUNTER_REQUIRED/],
 [c=>c.requests[0].totals.redisRestExchanges=Number.NaN,/AGENT_CAPTURE_COUNTER_REQUIRED/],
 [c=>c.requests[0].totals.inboundPayloadBytes=0,/REAL_AGENT_PAYLOAD_MEASUREMENT_REQUIRED/],
 [c=>c.totals.redisRestExchanges++,/AGENT_CAPTURE_COUNTERS_MISMATCH/],
 [c=>c.signatureAuthorizations=1,/PREFLIGHT_EFFECT_DENIED/],
 [c=>c.paymentSubmissions=1,/PREFLIGHT_EFFECT_DENIED/],
 [c=>c.providerExecutions=1,/PREFLIGHT_EFFECT_DENIED/],
 [c=>c.automaticRetries=1,/AssertionError/]
];
for(const key of Object.keys(external()))invalidCaptures.push([c=>c.requests[0].external[key]=1,/AGENT_PREFLIGHT_EXTERNAL_EXECUTION_DENIED/]);
for(const [mutate,reason]of invalidCaptures){const altered=structuredClone(agentCapture);mutate(altered);const gate=structuredClone(complete);gate.agentCapturePreflight.sha256=hash(altered);assert.throws(()=>assertX402ExecutionGate(gate,{...options('buy'),agentCapturePreflight:altered}),reason);scenarios++;}
// Storage is a high-water mark; traffic and requests add across the captured segment.
const twoRequests=structuredClone(agentCapture);twoRequests.requests.push({...structuredClone(request),requestId:randomUUID(),totals:{...structuredClone(request.totals),storedBytes:900}});
for(const key of Object.keys(totals()))twoRequests.totals[key]=key==='storedBytes'?1000:2*request.totals[key];const twoGate=structuredClone(complete);twoGate.agentCapturePreflight.sha256=hash(twoRequests);assert.equal(assertX402ExecutionGate(twoGate,{...options('buy'),agentCapturePreflight:twoRequests}).status,'PASS_EFFECT_GATE');scenarios++;
const limited=structuredClone(complete);limited.runtime.budgetScope='preparation';for(const phase of ['buy','recover','pause','retire','open']){assert.throws(()=>assertX402ExecutionGate(limited,{...options(phase),agentCapturePreflight:agentCapture}),/COMPLETE_SPRINT_BUDGET_REQUIRED/);scenarios++;}
for(const phase of ['recover','pause']){assert.equal(assertX402ExecutionGate(complete,options(phase)).status,'PASS_EFFECT_GATE');scenarios++;}
const retirement=structuredClone(complete);assert.throws(()=>assertX402ExecutionGate(retirement,options('retire')),/RETIREMENT_GATE_CLOSED/);scenarios++;
retirement.readiness.canRetireSynthetic=true;assert.throws(()=>assertX402ExecutionGate(retirement,options('retire')),/RETIREMENT_PLAN_REVIEW_REQUIRED/);scenarios++;
retirement.readiness.retirementPlanReviewed=true;assert.equal(retirement.readiness.independentReviewPassed,false);assert.equal(assertX402ExecutionGate(retirement,options('retire')).status,'PASS_EFFECT_GATE');scenarios++;
assert.throws(()=>assertX402ExecutionGate(retirement,options('open')),/OPENING_GATE_CLOSED/);scenarios++;
const opening=structuredClone(retirement);opening.readiness.canOpen=true;assert.throws(()=>assertX402ExecutionGate(opening,options('open')),/FINAL_INDEPENDENT_REVIEW_REQUIRED/);scenarios++;
opening.readiness.independentReviewPassed=true;assert.throws(()=>assertX402ExecutionGate(opening,options('open')),/RETIREMENT_RESULT_REVIEW_REQUIRED/);scenarios++;
opening.retirementResultSha256='c'.repeat(64);opening.finalReview={includesRetirementResult:true,retirementResultSha256:opening.retirementResultSha256};assert.throws(()=>assertX402ExecutionGate(opening,options('open')));scenarios++;
const hostedCapture={status:'PASS_BROWSER_NETWORK_CAPTURE',captureComplete:true,coverage:{httpRetries:0},binding:{planId:opening.planId,sourceSha,deploymentId:'dpl_replacement',origin:'https://replacement-fixture.vercel.app'}};
opening.browserAcceptance.target={deploymentId:hostedCapture.binding.deploymentId,origin:hostedCapture.binding.origin};opening.browserAcceptance.hostedCaptureSha256=hash(hostedCapture);
assert.throws(()=>assertX402ExecutionGate(opening,{...options('open'),hostedCapture}));scenarios++;
opening.browserAcceptance.nativeZoom200='PASS';assert.equal(assertX402ExecutionGate(opening,{...options('open'),hostedCapture}).canOpen,true);scenarios++;
for(const mutate of [m=>m.finalReview.retirementResultSha256='d'.repeat(64),m=>m.browserAcceptance.nativeZoom200='PENDING',m=>m.browserAcceptance.hostedCaptureSha256='e'.repeat(64)]){const altered=structuredClone(opening);mutate(altered);assert.throws(()=>assertX402ExecutionGate(altered,{...options('open'),hostedCapture}));scenarios++;}
const incomplete=structuredClone(localReport);incomplete.syntheticServicesWithdrawn=false;assert.equal(prepareX402Manifest({draft,localReport:incomplete,previousManifestBytes,previousCountersBytes}).readiness.localMeasured,false);scenarios++;
const uncommitted=structuredClone(localReport);uncommitted.sourceBinding={candidateCommitted:false,finalShaRequired:true};const uncommittedGate=structuredClone(ready);uncommittedGate.localEvidence.sha256=hash(uncommitted);assert.throws(()=>assertX402ExecutionGate(uncommittedGate,{...options('submit'),localReport:uncommitted}),/COMMITTED_LOCAL_CANDIDATE_REQUIRED/);scenarios++;
assert.equal(hash(localReport),manifest.localEvidence.sha256);console.log(JSON.stringify({status:'PASS',scenarios,scope:'synthetic manifest/gate fixtures only; no artifacts saved or enabled',remoteRequests:0,secretReads:0}));
