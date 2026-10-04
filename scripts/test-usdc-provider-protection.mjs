import assert from 'node:assert/strict';
import {checkProtectedProvider,providerProtectionArtifacts} from './check-usdc-provider-protection.mjs';

function fixture({status=302,other={},lose=false,oversize=false,url,gate=true,label='initial',reportLabel=label}={}){
 const manifest={planId:'synthetic-provider-protection',sourceSha:'a'.repeat(40),readiness:{canDeployPreview:gate,localSaleMeasured:true,payloadsFrozen:true},uploads:{provider:{payloadFingerprint:'b'.repeat(64)}},limits:{apiRequests:120,outboundPayloadBytes:16777216,inboundPayloadBytes:33554432,activeExecutionSeconds:300},browserReserve:{apiRequests:20}};
 const deployment={planId:manifest.planId,sourceSha:manifest.sourceSha,payloadFingerprint:manifest.uploads.provider.payloadFingerprint,id:'dpl_synthetic_'+label,url:url??'https://ai-video-scriptwriter-public000.vercel.app',readyState:'READY',target:'preview'};
 const report={planId:manifest.planId,sourceSha:manifest.sourceSha,deploymentId:deployment.id,deploymentLabel:'provider-'+reportLabel,apiRequests:0,inboundPayloadBytes:0,outboundPayloadBytes:0,attempts:[]};let calls=0,cancelled=0;const saved=[];
 const run=()=>checkProtectedProvider({manifest,deployment,report,label,otherBudget:async()=>({apiRequests:0,inboundPayloadBytes:0,outboundPayloadBytes:0,activeExecutionMs:0,...other}),persistReport:async value=>saved.push(structuredClone(value)),fetcher:async(target,init)=>{
  calls++;assert.equal(target,deployment.url+'/.well-known/stellar-bazaar-provider.txt');assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');assert.equal(init.headers,undefined);assert.equal(saved.at(-1).status,'PENDING');assert.equal(saved.at(-1).attempts[0].authentication,'none');assert.equal(saved.at(-1).apiRequests,1);
  if(lose)throw Error('synthetic lost response');
  if(oversize)return new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(131073));},cancel(){cancelled++;}}),{status});
  return new Response('Vercel access required',{status,headers:{'content-type':'text/plain'}});
 }});
 return {run,report,manifest,get calls(){return calls;},get cancelled(){return cancelled;}};
}
const denied=fixture();await denied.run();assert.equal(denied.calls,1);assert.equal(denied.report.status,'PASS');assert.equal(denied.report.unauthenticatedDenied,true);assert.equal(denied.report.rawResponseBytes,denied.report.responseHeaderBytes+denied.report.responseBodyBytes);assert.equal(denied.report.inboundPayloadBytes,denied.report.rawResponseBytes);assert.equal(denied.manifest.readiness.canDeployPreview,true);await assert.rejects(denied.run(),/ALREADY_ATTEMPTED/);assert.equal(denied.calls,1);
const publicEndpoint=fixture({status:200});await assert.rejects(publicEndpoint.run(),/PROTECTION_NOT_EFFECTIVE/);assert.equal(publicEndpoint.report.status,'FAILED_PROTECTION');assert.equal(publicEndpoint.report.unauthenticatedDenied,false);assert.equal(publicEndpoint.report.attempts[0].status,'CONFIRMED');assert.equal(publicEndpoint.calls,1);
for(const other of [{apiRequests:100},{inboundPayloadBytes:33554432},{outboundPayloadBytes:16777217},{activeExecutionMs:288001}]){const exhausted=fixture({other});await assert.rejects(exhausted.run(),/COMBINED_/);assert.equal(exhausted.calls,0);assert.equal(exhausted.report.apiRequests,0);}
for(const url of ['http://ai-video-scriptwriter-public000.vercel.app','https://different.example','https://ai-video-scriptwriter-public000.vercel.app?secret=bad','https://user:password@ai-video-scriptwriter-public000.vercel.app']){const invalid=fixture({url});await assert.rejects(invalid.run());assert.equal(invalid.calls,0);}
const closedGate=fixture({gate:false});await assert.rejects(closedGate.run());assert.equal(closedGate.calls,0);
const tooLarge=fixture({oversize:true});await assert.rejects(tooLarge.run(),/PROTECTION_RESPONSE_OVERSIZE/);assert.equal(tooLarge.calls,1);assert.equal(tooLarge.cancelled,1);assert.equal(tooLarge.report.status,'UNCERTAIN');assert.equal(tooLarge.report.attempts[0].status,'UNCERTAIN');
const lost=fixture({lose:true});await assert.rejects(lost.run(),/synthetic lost response/);assert.equal(lost.calls,1);assert.equal(lost.report.status,'UNCERTAIN');await assert.rejects(lost.run(),/ALREADY_ATTEMPTED/);assert.equal(lost.calls,1);
assert.deepEqual(providerProtectionArtifacts(),{deploymentLabel:'provider-initial',deploymentPath:'docs/evidence/sprint-marketplace/usdc-provider-initial.json',reportPath:'docs/evidence/sprint-marketplace/usdc-provider-protection-check.json'});
assert.deepEqual(providerProtectionArtifacts('proof'),{deploymentLabel:'provider-proof',deploymentPath:'docs/evidence/sprint-marketplace/usdc-provider-proof.json',reportPath:'docs/evidence/sprint-marketplace/usdc-provider-proof-protection-check.json'});
assert.throws(()=>providerProtectionArtifacts('replacement'),/INVALID_PROVIDER_PROTECTION_LABEL/);
const proof=fixture({label:'proof',other:{apiRequests:1}});await proof.run();assert.equal(proof.report.deploymentLabel,'provider-proof');assert.equal(proof.report.deploymentId,'dpl_synthetic_proof');assert.equal(proof.calls,1);
const mismatchedLabel=fixture({label:'proof',reportLabel:'initial'});await assert.rejects(mismatchedLabel.run(),/PROTECTION_LABEL_BINDING_MISMATCH/);assert.equal(mismatchedLabel.calls,0);
const mismatchedDeployment=fixture({label:'proof'});mismatchedDeployment.report.deploymentId='dpl_synthetic_initial';await assert.rejects(mismatchedDeployment.run());assert.equal(mismatchedDeployment.calls,0);
console.log(JSON.stringify({status:'PASS',oneAnonymousGetPerLabel:true,labelAndDeploymentBound:true,public200Rejected:true,budgetsBeforeEffect:true,fixedOrigin:true,bounded128KiB:true,retries:0,gateChanges:0,secretReads:0,externalRequests:0}));
