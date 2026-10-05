import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
export const X402_ACCEPTANCE_LIMITS={apiRequests:120,redisRestExchanges:400,redisCommandsUpperBound:2400,storedBytes:49164,outboundPayloadBytes:16*1048576,inboundPayloadBytes:32*1048576,paymentSubmissionIntents:2,friendbotClaims:0,trustlineSubmissions:0,usdcFaucetClaims:0};
const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const natural=value=>Number.isSafeInteger(value)&&value>=0;
export const X402_LOCAL_REQUIRED_RESULTS=['nativeNext','externalMcpClient','actualAlgorithmicProvider','serverMeterMatchesProtocol','processReplacement','purchasePausePreservesHistory','successfulDeliveryExact','verifiedPaymentWithFailedDelivery','discoveryApiAndSsrMetered','privateBuyerSellerHistory','historicalClassicPreserved','paymentResponseLossRecoveredByRead','singleProviderInvocation','accessRotationPreservesHistory','magicLinkServerRecoversOrders','sellerRevocationPreservesBuyerAccess','syntheticServicesWithdrawn'];
function publicMetadata(value){
 if(typeof value==='string'){assert.ok(!/^S[A-Z2-7]{55}$/.test(value),'PRIVATE_STELLAR_KEY_IN_PUBLIC_MANIFEST');return;}
 if(!value||typeof value!=='object')return;
 for(const [key,child]of Object.entries(value)){
  assert.ok(!(/secret|seed|privatekey|authorization|cookie|bypass|apikey|token/i.test(key)&&!/hash(?:es)?$/i.test(key)),'PRIVATE_FIELD_IN_PUBLIC_MANIFEST');publicMetadata(child);
 }
}
export function localX402Failures(report,sourceSha){
 const failures=[];
 if(report?.status!=='PASS_NATIVE_X402_LOCAL'||report?.sourceSha!==sourceSha||report?.remoteRequests!==0||report?.automaticRetries!==0)failures.push('MEASURED_NATIVE_LOCAL_REPORT_REQUIRED');
 for(const [key,cap]of Object.entries(X402_ACCEPTANCE_LIMITS))if(!natural(report?.totals?.[key])||report.totals[key]>cap)failures.push('LOCAL_COUNTER_MISSING_OR_EXCEEDED:'+key);
 for(const key of ['agentHttp','redis','facilitator','horizon','rpc','provider'])if(report?.coverage?.[key]!==true)failures.push('LOCAL_TRANSPORT_COVERAGE_REQUIRED:'+key);
 for(const key of X402_LOCAL_REQUIRED_RESULTS)if(report?.[key]!==true)failures.push('LOCAL_RESULT_REQUIRED:'+key);
 return failures;
}
/** Preparation never grants an effect. Previous partial evidence remains immutable and linked by exact hashes. */
export function prepareX402Manifest({draft,localReport,capturePreflight,previousManifestBytes,previousCountersBytes}){
 publicMetadata(draft);
 assert.match(draft?.sourceSha??'',/^[a-f0-9]{40}$/,'EXACT_SOURCE_SHA_REQUIRED');
 assert.ok(Buffer.isBuffer(previousManifestBytes)&&Buffer.isBuffer(previousCountersBytes),'PREVIOUS_EVIDENCE_BYTES_REQUIRED');
 const previous=JSON.parse(previousManifestBytes.toString('utf8').replace(/^\uFEFF/,'')),counters=JSON.parse(previousCountersBytes.toString('utf8').replace(/^\uFEFF/,''));
 assert.equal(counters.planId,previous.planId,'PREVIOUS_EVIDENCE_PLAN_MISMATCH');assert.equal(counters.complete,false,'PREVIOUS_PARTIAL_HISTORY_REQUIRED');
 const planId=draft.planId??randomUUID();assert.notEqual(planId,previous.planId,'NEW_PLAN_ID_REQUIRED');assert.match(planId,/^[a-f0-9-]{36}$/);
 const allocation=draft.storageAllocation;assert.ok(allocation&&Object.keys(allocation).length===5,'FROZEN_STORAGE_ALLOCATION_REQUIRED');
 for(const key of ['workspace','market','review','catalog','settlement'])assert.ok(natural(allocation[key]),'INVALID_STORAGE_ALLOCATION');assert.ok(Object.values(allocation).reduce((n,v)=>n+v,0)<=49164,'AGGREGATE_STORAGE_ALLOCATION_EXCEEDED');
 const capturePassed=capturePreflight?.status==='PASS_LOCAL_CAPTURE'&&capturePreflight.captureComplete===true&&capturePreflight.physicalWireObserved===false&&capturePreflight.coverage?.httpRetries===0;
 const localFailures=localX402Failures(localReport,draft.sourceSha);
 return {version:1,kind:'x402-agent-first-acceptance',planId,sourceSha:draft.sourceSha,status:'PREPARED_GATES_CLOSED',limits:{...X402_ACCEPTANCE_LIMITS},storageAllocation:allocation,
 previousEvidence:{planId:previous.planId,manifestSha256:digest(previousManifestBytes),countersSha256:digest(previousCountersBytes),status:counters.status,complete:false,observedTotals:counters.totals,limitation:'Historical browser transport stays incomplete. This plan does not modify or reset historical attempts.'},
 sourceBinding:draft.sourceBinding??{},config:draft.config??{},deployments:draft.deployments??{},participants:draft.participants??[],keys:draft.keys??{},runtime:draft.runtime??{},payloads:draft.payloads??{},payloadsSha256:digest(draft.payloads??{}),
 localEvidence:localReport?{sha256:digest(localReport),status:localReport.status,failures:localFailures}:null,
 capturePreflight:capturePreflight?{sha256:digest(capturePreflight),status:capturePreflight.status,captureComplete:capturePreflight.captureComplete===true}:null,
 agentCapturePreflight:null,
 readiness:{localMeasured:localFailures.length===0,nativeCapturePreflight:capturePassed,agentCapturePreflightVerified:false,payloadsFrozen:false,deploymentsVerified:false,canExecute:false,retirementPlanReviewed:false,canRetireSynthetic:false,independentReviewPassed:false,canOpen:false},
 browserAcceptance:{required:true,target:draft.browserTarget??null,coverageScope:'entire-isolated-browser-network-stack-session',allHttpRedirectsStreamsAndRetriesCounted:true,physicalWireObserved:false,humanWalletRequired:false,nativeZoom200:'PENDING',fullCapture:'PENDING'},
 executionPolicy:{gateVersion:2,nativeFixture:'optional-diagnostic',automaticTransportRetries:0,settlementSubmissionsPerOperation:1,uncertainOutcome:'preserve-original-intent-and-stop',newWalletProvisions:0,sendInvitations:false,mainnetPayments:false},remoteEffects:0};
}
/** Validate a sanitized real transport segment; its producer must forbid injected transports. */
export function assertX402AgentCapturePreflight(manifest,capture){
 assert.equal(manifest.readiness?.agentCapturePreflightVerified,true,'AGENT_CAPTURE_PREFLIGHT_NOT_VERIFIED');
 assert.ok(capture,'REAL_AGENT_CAPTURE_REQUIRED');assert.equal(manifest.agentCapturePreflight?.sha256,digest(capture),'AGENT_CAPTURE_CHANGED');
 assert.equal(capture.version,1);assert.equal(capture.kind,'x402-agent-preflight-capture');assert.equal(capture.status,'PASS_REAL_AGENT_PREFLIGHT_CAPTURE');
 assert.equal(capture.evidenceKind,'real-hosted-agent-transport','REAL_AGENT_TRANSPORT_REQUIRED');assert.equal(capture.testDoubles,false,'SYNTHETIC_AGENT_CAPTURE_DENIED');assert.equal(capture.captureComplete,true);
 assert.equal(capture.automaticRetries,0);for(const key of ['signatureAuthorizations','paymentSubmissions','providerExecutions'])assert.equal(capture[key],0,'PREFLIGHT_EFFECT_DENIED:'+key);
 const deployment=manifest.deployments.application,origin=deployment?.origin??deployment?.url?.replace(/\/$/,'');
 assert.match(deployment?.id??'',/^dpl_[A-Za-z0-9]+$/);assert.equal(new URL(origin).protocol,'https:');assert.equal(new URL(origin).origin,origin);
 assert.deepEqual(capture.binding,{planId:manifest.planId,sourceSha:manifest.sourceSha,deploymentId:deployment.id,origin},'AGENT_CAPTURE_BINDING_MISMATCH');
 assert.ok(Array.isArray(capture.requests)&&capture.requests.length>0&&capture.requests.length<=120,'AGENT_CAPTURE_REQUESTS_REQUIRED');
 const sum=Object.fromEntries(Object.keys(X402_ACCEPTANCE_LIMITS).map(key=>[key,0])),ids=new Set();
 for(const request of capture.requests){
  assert.match(request.requestId??'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,'AGENT_REQUEST_ID_REQUIRED');assert.ok(!ids.has(request.requestId),'DUPLICATE_AGENT_REQUEST_ID');ids.add(request.requestId);
  assert.equal(request.origin,origin);assert.equal(request.status,'CONFIRMED');assert.equal(request.meterVersion,'v2','AGENT_SERVER_METER_REQUIRED');assert.equal(request.method,'GET','AGENT_PREFLIGHT_READ_ONLY');
  assert.ok(typeof request.path==='string'&&request.path.startsWith('/api/')&&new URL(request.path,origin).origin===origin&&!new URL(request.path,origin).search&&!new URL(request.path,origin).hash,'AGENT_CAPTURE_ROUTE_REQUIRED');
  assert.ok(Number.isInteger(request.httpStatus)&&(request.httpStatus>=200&&request.httpStatus<300||request.httpStatus>=400&&request.httpStatus<500),'AGENT_REDIRECT_OR_FAILURE_DENIED');
  assert.ok(request.external&&Object.keys(request.external).length===6&&['horizon','proof-dns','proof-http','provider','facilitator','rpc'].every(key=>request.external[key]===0),'AGENT_PREFLIGHT_EXTERNAL_EXECUTION_DENIED');
  for(const [key,limit]of Object.entries(X402_ACCEPTANCE_LIMITS)){
   const count=request.totals?.[key];assert.ok(natural(count)&&count<=limit,'AGENT_CAPTURE_COUNTER_REQUIRED:'+key);
   sum[key]=key==='storedBytes'?Math.max(sum[key],count):sum[key]+count;assert.ok(natural(sum[key]),'AGENT_CAPTURE_COUNTER_OVERFLOW');
  }
  assert.equal(request.totals.apiRequests,1);assert.ok(request.totals.outboundPayloadBytes>0&&request.totals.inboundPayloadBytes>0,'REAL_AGENT_PAYLOAD_MEASUREMENT_REQUIRED');
 }
 assert.deepEqual(capture.totals,sum,'AGENT_CAPTURE_COUNTERS_MISMATCH');
 for(const [key,limit]of Object.entries(X402_ACCEPTANCE_LIMITS))assert.ok(sum[key]<=limit,'AGENT_CAPTURE_BUDGET_EXCEEDED:'+key);
 for(const key of ['paymentSubmissionIntents','friendbotClaims','trustlineSubmissions','usdcFaucetClaims'])assert.equal(sum[key],0,'PREFLIGHT_EFFECT_DENIED:'+key);
 return {status:'PASS_AGENT_CAPTURE_PREFLIGHT',requestIds:[...ids],totals:sum};
}
export function assertX402ExecutionGate(manifest,{localReport,agentCapturePreflight,hostedCapture,expectedSha,phase}){
 assert.ok(['submit','activate','agent-preflight','buy','recover','pause','retire','open'].includes(phase),'EXPLICIT_EXECUTION_PHASE_REQUIRED');
 assert.equal(manifest.kind,'x402-agent-first-acceptance');assert.deepEqual(manifest.limits,X402_ACCEPTANCE_LIMITS,'EXACT_LIMITS_REQUIRED');assert.equal(manifest.sourceSha,expectedSha,'SOURCE_SHA_MISMATCH');
 assert.deepEqual(localX402Failures(localReport,expectedSha),[],'LOCAL_ACCEPTANCE_INCOMPLETE');assert.equal(manifest.localEvidence?.sha256,digest(localReport),'LOCAL_REPORT_CHANGED');
 assert.equal(localReport.sourceBinding?.candidateCommitted,true,'COMMITTED_LOCAL_CANDIDATE_REQUIRED');assert.equal(localReport.sourceBinding?.finalShaRequired,false,'FINAL_SOURCE_BINDING_REQUIRED');
 assert.equal(manifest.payloadsSha256,digest(manifest.payloads),'FROZEN_PAYLOAD_CHANGED');
 for(const name of ['localMeasured','payloadsFrozen','deploymentsVerified','canExecute'])assert.equal(manifest.readiness?.[name],true,'CLOSED_GATE:'+name);
 assert.equal(manifest.executionPolicy.gateVersion,2,'PHASED_GATE_POLICY_REQUIRED');assert.equal(manifest.runtime?.budgetBoundsReviewed,true,'REVIEWED_RUNTIME_BOUNDS_REQUIRED');
 assert.ok(['preparation','complete-sprint'].includes(manifest.runtime?.budgetScope),'EXPLICIT_BUDGET_SCOPE_REQUIRED');
 if(['buy','recover','pause','retire','open'].includes(phase))assert.equal(manifest.runtime.budgetScope,'complete-sprint','COMPLETE_SPRINT_BUDGET_REQUIRED');
 assert.equal(manifest.executionPolicy.automaticTransportRetries,0);assert.equal(manifest.executionPolicy.newWalletProvisions,0);assert.equal(manifest.executionPolicy.mainnetPayments,false);
 if(phase==='buy')assertX402AgentCapturePreflight(manifest,agentCapturePreflight);
 if(phase==='retire'){assert.equal(manifest.readiness.canRetireSynthetic,true,'RETIREMENT_GATE_CLOSED');assert.equal(manifest.readiness.retirementPlanReviewed,true,'RETIREMENT_PLAN_REVIEW_REQUIRED');}
 // A completed UI capture is separately required for opening. Never manufacture a hosted capture before it exists.
 if(phase==='open'||manifest.readiness.canOpen===true){
  assert.equal(manifest.readiness.canOpen,true,'OPENING_GATE_CLOSED');assert.equal(manifest.readiness.independentReviewPassed,true,'FINAL_INDEPENDENT_REVIEW_REQUIRED');
  assert.equal(manifest.finalReview?.includesRetirementResult,true,'RETIREMENT_RESULT_REVIEW_REQUIRED');assert.match(manifest.retirementResultSha256??'',/^[a-f0-9]{64}$/,'RETIREMENT_RESULT_HASH_REQUIRED');assert.equal(manifest.finalReview.retirementResultSha256,manifest.retirementResultSha256,'RETIREMENT_RESULT_REVIEW_MISMATCH');
  assert.equal(hostedCapture?.status,'PASS_BROWSER_NETWORK_CAPTURE');assert.equal(hostedCapture?.captureComplete,true);assert.equal(hostedCapture?.coverage?.httpRetries,0);assert.equal(manifest.browserAcceptance.nativeZoom200,'PASS');
  assert.equal(manifest.browserAcceptance.hostedCaptureSha256,digest(hostedCapture),'HOSTED_CAPTURE_HASH_REQUIRED');
  assert.equal(hostedCapture.binding?.planId,manifest.planId,'HOSTED_CAPTURE_PLAN_MISMATCH');assert.equal(hostedCapture.binding?.sourceSha,manifest.sourceSha,'HOSTED_CAPTURE_SHA_MISMATCH');
  const target=manifest.browserAcceptance.target;assert.ok(target?.deploymentId&&target?.origin,'HOSTED_CAPTURE_TARGET_REQUIRED');assert.equal(hostedCapture.binding?.deploymentId,target.deploymentId);assert.equal(hostedCapture.binding?.origin,target.origin);
 }
 return {status:'PASS_EFFECT_GATE',phase,canOpen:manifest.readiness.canOpen===true};
}
