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
 readiness:{localMeasured:localFailures.length===0,nativeCapturePreflight:capturePassed,payloadsFrozen:false,deploymentsVerified:false,canExecute:false,canRetireSynthetic:false,canOpen:false},
 browserAcceptance:{required:true,target:draft.browserTarget??null,coverageScope:'entire-isolated-browser-network-stack-session',allHttpRedirectsStreamsAndRetriesCounted:true,physicalWireObserved:false,humanWalletRequired:false,nativeZoom200:'PENDING',fullCapture:'PENDING'},
 executionPolicy:{automaticTransportRetries:0,settlementSubmissionsPerOperation:1,uncertainOutcome:'preserve-original-intent-and-stop',newWalletProvisions:0,sendInvitations:false,mainnetPayments:false},remoteEffects:0};
}
export function assertX402ExecutionGate(manifest,{localReport,capturePreflight,hostedCapture,expectedSha}){
 assert.equal(manifest.kind,'x402-agent-first-acceptance');assert.deepEqual(manifest.limits,X402_ACCEPTANCE_LIMITS,'EXACT_LIMITS_REQUIRED');assert.equal(manifest.sourceSha,expectedSha,'SOURCE_SHA_MISMATCH');
 assert.deepEqual(localX402Failures(localReport,expectedSha),[],'LOCAL_ACCEPTANCE_INCOMPLETE');assert.equal(manifest.localEvidence?.sha256,digest(localReport),'LOCAL_REPORT_CHANGED');
 assert.equal(localReport.sourceBinding?.candidateCommitted,true,'COMMITTED_LOCAL_CANDIDATE_REQUIRED');assert.equal(localReport.sourceBinding?.finalShaRequired,false,'FINAL_SOURCE_BINDING_REQUIRED');
 assert.equal(capturePreflight?.status,'PASS_LOCAL_CAPTURE','NATIVE_PREFLIGHT_REQUIRED');assert.equal(capturePreflight?.captureComplete,true);assert.equal(manifest.capturePreflight?.sha256,digest(capturePreflight),'CAPTURE_PREFLIGHT_CHANGED');
 assert.equal(capturePreflight.physicalWireObserved,false,'CAPTURE_SCOPE_MISMATCH');assert.equal(capturePreflight.coverage?.httpRetries,0,'CAPTURE_HTTP_RETRIES_NOT_ZERO');
 assert.equal(manifest.payloadsSha256,digest(manifest.payloads),'FROZEN_PAYLOAD_CHANGED');
 for(const name of ['localMeasured','nativeCapturePreflight','payloadsFrozen','deploymentsVerified','canExecute'])assert.equal(manifest.readiness?.[name],true,'CLOSED_GATE:'+name);
 assert.equal(manifest.executionPolicy.automaticTransportRetries,0);assert.equal(manifest.executionPolicy.newWalletProvisions,0);assert.equal(manifest.executionPolicy.mainnetPayments,false);
 // A completed UI capture is separately required for opening. Never manufacture a hosted capture before it exists.
 if(manifest.readiness.canOpen===true){
  assert.equal(hostedCapture?.status,'PASS_BROWSER_NETWORK_CAPTURE');assert.equal(hostedCapture?.captureComplete,true);assert.equal(hostedCapture?.coverage?.httpRetries,0);assert.equal(manifest.browserAcceptance.nativeZoom200,'PASS');
  assert.equal(manifest.browserAcceptance.hostedCaptureSha256,digest(hostedCapture),'HOSTED_CAPTURE_HASH_REQUIRED');
  assert.equal(hostedCapture.binding?.planId,manifest.planId,'HOSTED_CAPTURE_PLAN_MISMATCH');assert.equal(hostedCapture.binding?.sourceSha,manifest.sourceSha,'HOSTED_CAPTURE_SHA_MISMATCH');
  const target=manifest.browserAcceptance.target;assert.ok(target?.deploymentId&&target?.origin,'HOSTED_CAPTURE_TARGET_REQUIRED');assert.equal(hostedCapture.binding?.deploymentId,target.deploymentId);assert.equal(hostedCapture.binding?.origin,target.origin);
 }
 return {status:'PASS_EFFECT_GATE',canOpen:manifest.readiness.canOpen===true};
}
