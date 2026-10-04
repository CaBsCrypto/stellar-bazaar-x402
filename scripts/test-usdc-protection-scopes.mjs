import assert from 'node:assert/strict';
import {bazaarProtectionFiles,protectionOtherBudget,protectionBudgetReportNames,runBazaarProtectionCheck} from './check-usdc-bazaar-protection.mjs';
import {validateRecoveryDeployment} from './serve-usdc-recovery-once.mjs';

const directory='docs/evidence/sprint-marketplace';
const manifest={planId:'public-scope-fixture',sourceSha:'a'.repeat(40),readiness:{canDeployPreview:true,canProbe:false,canExecute:true},uploads:{bazaar:{payloadFingerprint:'b'.repeat(64)}},limits:{apiRequests:120,outboundPayloadBytes:16777216,inboundPayloadBytes:33554432,activeExecutionSeconds:300},browserReserve:{apiRequests:20}};
const deployment={planId:manifest.planId,sourceSha:manifest.sourceSha,payloadFingerprint:manifest.uploads.bazaar.payloadFingerprint,id:'dpl_publicfixture',url:'https://stellar-bazaar-x402-public000-cabscryptocontacto-6028s-projects.vercel.app',readyState:'READY',target:'preview',protectionEnabled:null,protectionObservation:'unknown'};
const missing=()=>Object.assign(Error('missing public fixture'),{code:'ENOENT'});

async function scoped(label,{lose=false,preexisting=false}={}){
 const files=bazaarProtectionFiles(label),data=new Map([[directory+'/usdc-sale-manifest.json',structuredClone(manifest)],[directory+'/'+files.deploymentName+'.json',structuredClone(deployment)]]),writes=[];let fetches=0,releases=0,preserves=0;
 if(preexisting)data.set(directory+'/'+files.reportName+'.json',{status:'UNCERTAIN'});
 const run=()=>runBazaarProtectionCheck({label,
  read:async path=>{if(!data.has(path))throw missing();return structuredClone(data.get(path));},
  write:async(path,value)=>{writes.push({path,value:structuredClone(value)});data.set(path,structuredClone(value));},
  acquireLock:async()=>({release:async()=>{releases++;},preserve:async()=>{preserves++;}}),
  fetcher:async(url,init)=>{fetches++;assert.equal(url,deployment.url+'/history');assert.equal(init.method,'GET');assert.equal(init.headers,undefined);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'manual');assert.equal(data.get(directory+'/'+files.reportName+'.json').status,'PENDING');if(lose)throw Error('synthetic lost response');return new Response('Vercel access required',{status:302});},
 });
 return {run,data,writes,files,get fetches(){return fetches;},get releases(){return releases;},get preserves(){return preserves;}};
}

assert.equal(bazaarProtectionFiles().reportName,'usdc-bazaar-protection-check');
const receipts=new Map();
for(const label of ['probe','candidate','replacement','closed']){
 const value=await scoped(label),report=await value.run();assert.equal(report.status,'PASS');assert.equal(report.label,label);assert.equal(report.apiRequests,1);assert.equal(report.automaticRetries,0);assert.equal(report.url,deployment.url+'/history');assert.equal(report.rawResponseBytes,report.responseBodyBytes+report.responseHeaderBytes);assert.equal(value.fetches,1);assert.equal(value.releases,1);assert.equal(value.preserves,0);
 const manifestWrites=value.writes.filter(write=>write.path.endsWith('/usdc-sale-manifest.json'));
 if(label==='probe'){assert.deepEqual(manifestWrites.map(write=>write.value.readiness.canProbe),[false,true]);}
 else{assert.equal(manifestWrites.length,0);assert.deepEqual(value.data.get(directory+'/usdc-sale-manifest.json'),manifest);}
 receipts.set(label,report);
 await assert.rejects(value.run(),/ALREADY_ATTEMPTED/);assert.equal(value.fetches,1);
}
assert.throws(()=>bazaarProtectionFiles('production'),/EXPLICIT_/);
const lost=await scoped('replacement',{lose:true});await assert.rejects(lost.run(),/synthetic lost response/);assert.equal(lost.preserves,1);assert.equal(lost.releases,0);assert.equal(lost.data.get(directory+'/'+lost.files.reportName+'.json').status,'UNCERTAIN');
const existing=await scoped('candidate',{preexisting:true});await assert.rejects(existing.run(),/ALREADY_ATTEMPTED/);assert.equal(existing.fetches,0);

const reports=new Map(protectionBudgetReportNames.map(name=>[name,{planId:manifest.planId,sourceSha:manifest.sourceSha,status:'PASS',apiRequests:1,outboundPayloadBytes:2,inboundPayloadBytes:3,activeExecutionMs:4,attempts:[{status:'CONFIRMED'}]}]));
reports.get('usdc-hosted-http').external={horizon:2,provider:1};
reports.get('usdc-wallet-provision').counts={horizonReads:2,faucetApiRequests:2,usdcFaucetClaims:1};
reports.get('usdc-provider-proof-check').proofHttpRequests=2;
const read=async path=>{const name=path.split('/').at(-1).slice(0,-5);if(!reports.has(name))throw missing();return structuredClone(reports.get(name));};
const totals=await protectionOtherBudget({manifest,excludeName:'usdc-bazaar-replacement-protection-check',read});
assert.deepEqual(totals,{apiRequests:17,outboundPayloadBytes:16,inboundPayloadBytes:24,activeExecutionMs:32});
reports.get('usdc-provider-proof-protection-check').status='UNCERTAIN';await assert.rejects(protectionOtherBudget({manifest,read}),/OTHER_EFFECT_UNCONFIRMED/);reports.get('usdc-provider-proof-protection-check').status='PASS';
reports.get('usdc-bazaar-closed-protection-check').attempts[0].status='PENDING';await assert.rejects(protectionOtherBudget({manifest,read}),/OTHER_EFFECT_PENDING/);reports.get('usdc-bazaar-closed-protection-check').attempts[0].status='CONFIRMED';
reports.get('usdc-bazaar-candidate-protection-check').inboundPayloadBytes=NaN;await assert.rejects(protectionOtherBudget({manifest,read}),/BUDGET_EVIDENCE_INVALID/);

const protection=receipts.get('replacement');
assert.equal(validateRecoveryDeployment({manifest,deployment,protection}),deployment.url);
for(const mutation of [
 {deploymentId:'dpl_different'},{sourceSha:'c'.repeat(40)},{planId:'different'},{label:'candidate'},
 {origin:'https://different.example'},{url:deployment.url+'/resources'},{status:'UNCERTAIN'},
 {unauthenticatedDenied:false},{apiRequests:2},{automaticRetries:1},
 {attempts:[{...protection.attempts[0],httpStatus:200}]},
 {attempts:[{...protection.attempts[0],authentication:'bypass'}]},
])assert.throws(()=>validateRecoveryDeployment({manifest,deployment,protection:{...protection,...mutation}}));
assert.throws(()=>validateRecoveryDeployment({manifest,deployment:{...deployment,protectionEnabled:true},protection:undefined}),/REPLACEMENT_PROTECTION_BINDING_REQUIRED/);
console.log(JSON.stringify({status:'PASS',deploymentScopes:4,probeOnlyGateChanges:true,allPriorReportsCounted:true,sameEffectLock:true,exactReplacementReceipt:true,metadataUnknownAcceptedWithDenial:true,retries:0,networkRequests:0,secretReads:0}));
