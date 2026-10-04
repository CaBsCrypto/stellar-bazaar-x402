import assert from 'node:assert/strict';
import {protectionOtherBudget,checkProtectedBazaar} from './check-usdc-bazaar-protection.mjs';

const directory='docs/evidence/sprint-marketplace';
const manifest={planId:'public-counter-bound-fixture',sourceSha:'a'.repeat(40),readiness:{canDeployPreview:true},uploads:{bazaar:{payloadFingerprint:'b'.repeat(64)}},limits:{apiRequests:57,outboundPayloadBytes:16777216,inboundPayloadBytes:33554432,activeExecutionSeconds:300},browserReserve:{apiRequests:20}};
const deployment={planId:manifest.planId,sourceSha:manifest.sourceSha,payloadFingerprint:manifest.uploads.bazaar.payloadFingerprint,id:'dpl_publicclosed',url:'https://stellar-bazaar-x402-publicclosed-cabscryptocontacto-6028s-projects.vercel.app',readyState:'READY',target:'preview',protectionEnabled:null};
const bound=overrides=>({planId:manifest.planId,sourceSha:manifest.sourceSha,status:'PASS',attempts:[],...overrides});
const data=new Map([
 ['usdc-hosted-http',bound({apiRequests:33,outboundPayloadBytes:3,inboundPayloadBytes:5,activeExecutionMs:7})],
 ['usdc-toolbar-assets',bound({apiRequests:2,outboundPayloadBytes:0,inboundPayloadBytes:11,activeExecutionMs:13,credentials:'none',automaticRetries:0,attempts:[{status:'CONFIRMED'},{status:'CONFIRMED'}]})],
 ['usdc-browser-traffic',bound({status:'PARTIAL_DOM_ONLY',activeExecutionMs:17,complete:false,requests:[{kind:'html',status:'CONFIRMED',requestBytes:2,responseBytes:3}],knownUnmeteredUpper:{apiRequests:1,reason:'prime without a server UUID'}})],
 ['usdc-counter-reconciliation',bound({version:1,status:'PARTIAL_COUNTERS',complete:false,pending:['BROWSER_TRANSPORT_COVERAGE_UNCONFIRMED'],totals:{apiRequests:49,outboundPayloadBytes:50,inboundPayloadBytes:70,activeExecutionMs:37},coverage:{browserPrivateApi:14,driverApi:33}})],
]);
const read=async path=>{const name=path.split('/').at(-1).replace(/\.json$/,'');if(!data.has(name))throw Object.assign(Error('missing public fixture'),{code:'ENOENT'});return structuredClone(data.get(name));};
const calculate=()=>protectionOtherBudget({manifest,excludeName:'usdc-bazaar-closed-protection-check',read,includeLatestCounterBound:true});
const original=structuredClone([...data]),total=await calculate();
assert.deepEqual(total,{apiRequests:50,outboundPayloadBytes:50,inboundPayloadBytes:70,activeExecutionMs:37,browserObservedApiRequests:14});
assert.deepEqual([...data],original,'public evidence is read-only');
assert.equal(data.get('usdc-counter-reconciliation').complete,false);assert.deepEqual(data.get('usdc-counter-reconciliation').pending,['BROWSER_TRANSPORT_COVERAGE_UNCONFIRMED']);
assert.equal(total.apiRequests,33+14+2+1,'toolbar and observed APIs included exactly once; prime upper remains additional');

async function gate({limit=57,other=total}={}){
 let calls=0;const persisted=[];
 const report={planId:manifest.planId,sourceSha:manifest.sourceSha,deploymentId:deployment.id,apiRequests:0,attempts:[]};
 const run=()=>checkProtectedBazaar({manifest:{...manifest,limits:{...manifest.limits,apiRequests:limit}},deployment,report,otherBudget:async()=>other,
  persistReport:async value=>persisted.push(structuredClone(value)),fetcher:async(url,options)=>{calls++;assert.equal(url,deployment.url+'/history');assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);assert.equal(options.redirect,'manual');assert.equal(persisted.at(-1).attempts[0].status,'PENDING');assert.equal(persisted.at(-1).apiRequests,1);return new Response('protected',{status:302});}});
 return{run,report,persisted,get calls(){return calls;}};
}
const allowed=await gate();await allowed.run();assert.equal(allowed.calls,1);assert.equal(allowed.report.status,'PASS');assert.equal(allowed.report.budgetBeforeRequest.browserApiObserved,14);assert.equal(allowed.report.budgetBeforeRequest.browserApiRemaining,6);assert.equal(allowed.report.budgetBeforeRequest.transportCoverageCertified,false);
const exhausted=await gate({limit:56});await assert.rejects(exhausted.run(),/COMBINED_API_REQUEST_LIMIT/);assert.equal(exhausted.calls,0);
const noObservation=await gate({other:{...total,browserObservedApiRequests:0}});await assert.rejects(noObservation.run(),/COMBINED_API_REQUEST_LIMIT/);assert.equal(noObservation.calls,0);

// A stale lower report cannot erase newly counted receipts or the APIs whose reservations are being released.
data.get('usdc-counter-reconciliation').totals={apiRequests:20,outboundPayloadBytes:1,inboundPayloadBytes:1,activeExecutionMs:1};
assert.deepEqual(await calculate(),{apiRequests:50,outboundPayloadBytes:5,inboundPayloadBytes:19,activeExecutionMs:37,browserObservedApiRequests:14});
data.get('usdc-counter-reconciliation').totals={apiRequests:60,outboundPayloadBytes:500,inboundPayloadBytes:700,activeExecutionMs:99};
assert.deepEqual(await calculate(),{apiRequests:61,outboundPayloadBytes:500,inboundPayloadBytes:700,activeExecutionMs:99,browserObservedApiRequests:14});
for(const mutation of [{sourceSha:'c'.repeat(40)},{planId:'different'},{status:'UNCERTAIN'},{coverage:{browserPrivateApi:21}},{totals:{apiRequests:NaN}}]){
 const saved=structuredClone(data.get('usdc-counter-reconciliation'));Object.assign(data.get('usdc-counter-reconciliation'),mutation);await assert.rejects(calculate());data.set('usdc-counter-reconciliation',saved);
}
data.delete('usdc-counter-reconciliation');const noCounter=await calculate();assert.equal(noCounter.apiRequests,36);assert.equal(noCounter.browserObservedApiRequests,undefined);
const legacy=await protectionOtherBudget({manifest,read});assert.deepEqual(legacy,{apiRequests:33,outboundPayloadBytes:3,inboundPayloadBytes:5,activeExecutionMs:7});
console.log(JSON.stringify({status:'PASS',baseApi:33,observedBrowserApi:14,toolbarRequests:2,knownUnmeteredUpper:1,remainingBrowserReserve:6,aggregateDeduplicated:true,pendingCoveragePreserved:true,oneAnonymousGetPreregistered:true,networkRequests:0,secretReads:0}));
