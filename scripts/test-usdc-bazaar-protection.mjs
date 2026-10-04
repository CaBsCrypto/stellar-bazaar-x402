import assert from 'node:assert/strict';
import {checkProtectedBazaar} from './check-usdc-bazaar-protection.mjs';

function fixture({status=302,otherApi=0,lose=false}={}){
 const manifest={planId:'public-protection-double',sourceSha:'a'.repeat(40),readiness:{canDeployPreview:true},uploads:{bazaar:{payloadFingerprint:'b'.repeat(64)}},limits:{apiRequests:120,outboundPayloadBytes:16777216,inboundPayloadBytes:33554432,activeExecutionSeconds:300},browserReserve:{apiRequests:20}};
 const deployment={planId:manifest.planId,sourceSha:manifest.sourceSha,payloadFingerprint:manifest.uploads.bazaar.payloadFingerprint,id:'dpl_public_fixture',url:'https://stellar-bazaar-x402-public000-cabscryptocontacto-6028s-projects.vercel.app',readyState:'READY',target:'preview'};
 const report={planId:manifest.planId,sourceSha:manifest.sourceSha,deploymentId:deployment.id,apiRequests:0,inboundPayloadBytes:0,outboundPayloadBytes:0,attempts:[]};let calls=0,saved=[];
 const run=()=>checkProtectedBazaar({manifest,deployment,report,otherBudget:async()=>({apiRequests:otherApi,inboundPayloadBytes:0,outboundPayloadBytes:0,activeExecutionMs:0}),persistReport:async value=>saved.push(structuredClone(value)),fetcher:async(url,init)=>{calls++;assert.equal(url,deployment.url+'/history');assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');assert.equal(init.headers,undefined);assert.equal(saved.at(-1).attempts[0].status,'PENDING');assert.equal(saved.at(-1).apiRequests,1);if(lose)throw Error('lost response');return new Response('',{status});}});
 return {run,report,get calls(){return calls;}};
}
const denied=fixture();await denied.run();assert.equal(denied.calls,1);assert.equal(denied.report.status,'PASS');assert.equal(denied.report.unauthenticatedDenied,true);await assert.rejects(denied.run(),/ALREADY_ATTEMPTED/);assert.equal(denied.calls,1);
const publicPage=fixture({status:200});await assert.rejects(publicPage.run(),/PROTECTION_NOT_EFFECTIVE/);assert.equal(publicPage.report.status,'FAILED_PROTECTION');assert.equal(publicPage.report.unauthenticatedDenied,false);assert.equal(publicPage.calls,1);
const exhausted=fixture({otherApi:100});await assert.rejects(exhausted.run(),/COMBINED_API_REQUEST_LIMIT/);assert.equal(exhausted.calls,0);assert.equal(exhausted.report.apiRequests,0);
const lost=fixture({lose:true});await assert.rejects(lost.run(),/lost response/);assert.equal(lost.report.status,'UNCERTAIN');assert.equal(lost.calls,1);assert.equal(lost.report.attempts[0].status,'UNCERTAIN');
console.log(JSON.stringify({status:'PASS',oneUnauthenticatedRequest:true,public200Rejected:true,budgetGuardBeforeFetch:true,lostResponsePreserved:true,networkRequests:0,secretReads:0}));
