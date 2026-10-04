import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runToolbarAssetCheck,toolbarFrozenReserves,toolbarOtherBudget} from './check-usdc-toolbar-assets.mjs';
import {protectionBudgetReportNames} from './check-usdc-bazaar-protection.mjs';

const directory='docs/evidence/sprint-marketplace',reportPath=directory+'/usdc-toolbar-assets.json';
const missing=()=>Object.assign(Error('missing local fixture'),{code:'ENOENT'});
const manifest={planId:'7f3e80be-d9be-47e1-81c8-49445b3bc0d9',sourceSha:'a'.repeat(40),
 limits:{apiRequests:120,outboundPayloadBytes:16777216,inboundPayloadBytes:33554432,activeExecutionSeconds:300},
 browserReserve:{apiRequests:20,outboundPayloadBytes:128,inboundPayloadBytes:1024,activeExecutionMs:500},
 deployments:{bazaarReplacement:{id:'dpl_publicfixture',url:'https://fixture.vercel.app'}},
 browserResourceProbes:{urls:['https://vercel.live/_next-live/feedback/feedback.js','https://vercel.live/_next-live/feedback/feedback.html'],maxRequests:2,credentials:'none',redirects:0,retries:0,maxResponseBodyBytes:1048576,timeoutMs:12000}};
const prior=overrides=>({planId:manifest.planId,sourceSha:manifest.sourceSha,status:'PASS',apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0,activeExecutionMs:0,attempts:[],...overrides});

function fixture({mutation={},effect,existing,lockFailure=false}={}){
 const data=new Map([[directory+'/usdc-sale-manifest.json',{...structuredClone(manifest),...mutation}]]),writes=[];
 let fetches=0,releases=0,preserves=0,clock=1000,lockHeld=false;
 if(existing)data.set(reportPath,structuredClone(existing));
 const read=async path=>{assert.ok(lockHeld||path.endsWith('usdc-sale-manifest.json'),'effect receipts read under shared lock');if(!data.has(path))throw missing();return structuredClone(data.get(path));};
 const options={read,list:async()=>[],readBytes:async()=>{throw Error('UNEXPECTED_PRIVATE_OR_BINARY_READ');},now:()=>clock,
  write:async(path,value)=>{assert.ok(lockHeld);assert.equal(path,reportPath,'no manifest writes');writes.push(structuredClone(value));data.set(path,structuredClone(value));},
  acquireLock:async(_directory,planId)=>{assert.equal(planId,manifest.planId);if(lockFailure)throw Error('SALE_EFFECT_LOCKED_EXPLICIT_RECOVERY_REQUIRED');lockHeld=true;return{release:async()=>{releases++;lockHeld=false;},preserve:async()=>{preserves++;lockHeld=false;}};},
  fetcher:async(url,init)=>{fetches++;clock+=11;assert.ok(lockHeld);assert.equal(data.get(reportPath).attempts.at(-1).status,'PENDING');assert.equal(data.get(reportPath).apiRequests,fetches);assert.equal(url,manifest.browserResourceProbes.urls[fetches-1]);assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');assert.equal(init.headers,undefined);assert.equal(init.body,undefined);return effect?effect({url,init,data,advance:ms=>{clock+=ms;},fetches}):new Response('public resource '+fetches,{status:200});}};
 return{run:()=>runToolbarAssetCheck(options),data,writes,options,get fetches(){return fetches;},get releases(){return releases;},get preserves(){return preserves;}};
}

const success=fixture(),result=await success.run();
assert.equal(result.status,'PASS');assert.equal(result.apiRequests,2);assert.equal(success.fetches,2);assert.equal(success.releases,1);assert.equal(success.preserves,0);assert.equal(result.automaticRetries,0);assert.equal(result.outboundPayloadBytes,0);assert.equal(result.inboundPayloadBytes,result.attempts.reduce((sum,value)=>sum+value.responseBytes,0));
for(const value of result.attempts){assert.equal(value.status,'CONFIRMED');assert.equal(value.httpStatus,200);assert.equal(value.bodyHash,value.bodySha256);assert.match(value.bodySha256,/^[a-f0-9]{64}$/);}
const saved=structuredClone(success.data.get(reportPath));await assert.rejects(success.run(),/ALREADY_RECORDED/);assert.deepEqual(success.data.get(reportPath),saved);assert.equal(success.fetches,2);
const legacy=fixture({existing:prior({apiRequests:2,status:'PASS'})});await assert.rejects(legacy.run(),/ALREADY_RECORDED/);assert.equal(legacy.fetches,0);assert.equal(legacy.writes.length,0);
const locked=fixture({lockFailure:true});await assert.rejects(locked.run(),/SALE_EFFECT_LOCKED/);assert.equal(locked.fetches,0);assert.equal(locked.writes.length,0);
const previousUncertain=fixture({existing:prior({status:'UNCERTAIN',attempts:[{status:'UNCERTAIN'}]})});await assert.rejects(previousUncertain.run(),/ALREADY_RECORDED/);assert.equal(previousUncertain.preserves,1);assert.equal(previousUncertain.writes.length,0);

for(const [field,value,message]of[
 ['apiRequests',100,'COMBINED_API_REQUEST_LIMIT'],['outboundPayloadBytes',16777216-127,'COMBINED_OUTBOUND_PAYLOAD_LIMIT'],
 ['inboundPayloadBytes',33554432-1048576-32768-1024+1,'COMBINED_INBOUND_PAYLOAD_LIMIT'],['activeExecutionMs',300000-12000-500+1,'COMBINED_EXECUTION_TIME_LIMIT'],
]){
 const test=fixture();test.data.set(directory+'/usdc-provider-proof-protection-check.json',prior({[field]:value}));await assert.rejects(test.run(),new RegExp(message));assert.equal(test.fetches,0);assert.equal(test.data.get(reportPath).apiRequests,0);assert.equal(test.data.get(reportPath).status,'BUDGET_STOP');assert.equal(test.releases,1);
}
const secondGuard=fixture({effect:({data})=>{data.set(directory+'/usdc-provider-proof-protection-check.json',prior({apiRequests:99}));return new Response('first response',{status:200});}});
await assert.rejects(secondGuard.run(),/COMBINED_API_REQUEST_LIMIT/);assert.equal(secondGuard.fetches,1);assert.equal(secondGuard.data.get(reportPath).attempts.length,1);assert.equal(secondGuard.data.get(reportPath).attempts[0].status,'CONFIRMED');assert.equal(secondGuard.data.get(reportPath).status,'BUDGET_STOP');assert.equal(secondGuard.releases,1);
const uncertainOther=fixture();uncertainOther.data.set(directory+'/usdc-provider-proof-check.json',prior({status:'UNCERTAIN'}));await assert.rejects(uncertainOther.run(),/OTHER_EFFECT_UNCONFIRMED/);assert.equal(uncertainOther.fetches,0);assert.equal(uncertainOther.preserves,1);assert.equal(uncertainOther.data.get(reportPath).status,'UNCERTAIN');

const lost=fixture({effect:()=>{throw Error('LOST_RESPONSE');}});await assert.rejects(lost.run(),/LOST_RESPONSE/);assert.equal(lost.fetches,1);assert.equal(lost.preserves,1);assert.equal(lost.releases,0);assert.equal(lost.data.get(reportPath).apiRequests,1);assert.equal(lost.data.get(reportPath).activeExecutionMs,11);assert.equal(lost.data.get(reportPath).status,'UNCERTAIN');
const partial=fixture({effect:({url,advance})=>({status:200,statusText:'OK',redirected:false,url,headers:new Headers({'x-public':'1'}),body:{async*[Symbol.asyncIterator](){yield Buffer.from('part');advance(19);throw Error('LOST_PARTIAL_RESPONSE');}}})});
await assert.rejects(partial.run(),/LOST_PARTIAL_RESPONSE/);const partialReport=partial.data.get(reportPath),attempt=partialReport.attempts[0];assert.equal(attempt.bodyBytes,4);assert.equal(attempt.responseBytes,attempt.headerBytes+4);assert.equal(partialReport.inboundPayloadBytes,attempt.responseBytes);assert.equal(partialReport.activeExecutionMs,30);assert.equal(attempt.status,'UNCERTAIN');assert.equal(partial.preserves,1);assert.equal(partial.fetches,1);
const oversized=fixture({effect:()=>new Response(Buffer.alloc(1048577),{status:200})});await assert.rejects(oversized.run(),/RESOURCE_RESPONSE_LIMIT/);assert.equal(oversized.data.get(reportPath).attempts[0].bodyBytes,1048577);assert.equal(oversized.preserves,1);assert.equal(oversized.fetches,1);
const rejected=fixture({effect:()=>new Response('denied',{status:403})});await assert.rejects(rejected.run(),/RESOURCE_HTTP_STATUS:403/);assert.equal(rejected.data.get(reportPath).status,'KNOWN_REJECTED');assert.equal(rejected.data.get(reportPath).attempts[0].status,'CONFIRMED');assert.equal(rejected.fetches,1);assert.equal(rejected.releases,1);
const persistence=fixture();const save=persistence.options.write;persistence.options.write=async(path,value)=>{if(value.attempts[0]?.status==='CONFIRMED')throw Error('WRITE_FAILED_AFTER_RESPONSE');return save(path,value);};await assert.rejects(persistence.run(),/WRITE_FAILED_AFTER_RESPONSE/);assert.equal(persistence.preserves,1);assert.equal(persistence.fetches,1);
const finalPersistence=fixture();const finalSave=finalPersistence.options.write;finalPersistence.options.write=async(path,value)=>{if(value.status==='PASS')throw Error('FINAL_WRITE_FAILED');return finalSave(path,value);};await assert.rejects(finalPersistence.run(),/FINAL_WRITE_FAILED/);assert.equal(finalPersistence.preserves,1);assert.equal(finalPersistence.fetches,2);

const budgetBytes=Buffer.from(JSON.stringify({sourceSha:manifest.sourceSha,deploymentId:manifest.deployments.bazaarReplacement.id,origin:'https://fixture.vercel.app',apiReserve:20,activeBrowserSecondsUpper:90,inboundControlledJourneyUpperBytes:31024060}));
const frozen={...structuredClone(manifest),browserReadOnlyExecution:{budgetSha256:createHash('sha256').update(budgetBytes).digest('hex'),readOnly:true,retries:0,openingApproved:false,maxApiRequests:20,maxActiveSeconds:90}};
assert.equal((await toolbarFrozenReserves({manifest:frozen,readBytes:async()=>budgetBytes})).inboundPayloadBytes,31024060);
await assert.rejects(toolbarFrozenReserves({manifest:frozen,readBytes:async()=>Buffer.concat([budgetBytes,Buffer.from(' ')])}),/FROZEN_BROWSER_BUDGET_HASH_MISMATCH/);
await assert.rejects(toolbarFrozenReserves({manifest:{...manifest,browserReserve:{apiRequests:20}}}),/INVALID_BUDGET_COUNTER/);

const recordsMap=new Map(protectionBudgetReportNames.map(name=>[directory+'/'+name+'.json',prior({apiRequests:1,outboundPayloadBytes:2,inboundPayloadBytes:3,activeExecutionMs:4})]));
recordsMap.get(directory+'/usdc-hosted-http.json').external={horizon:2,provider:1};recordsMap.get(directory+'/usdc-wallet-provision.json').counts={horizonReads:2,faucetApiRequests:2,usdcFaucetClaims:1};recordsMap.get(directory+'/usdc-provider-proof-check.json').proofHttpRequests=2;
const driverId='11111111-1111-1111-1111-111111111111',browserId='22222222-2222-2222-2222-222222222222',ssrId='33333333-3333-3333-3333-333333333333',deploymentId=manifest.deployments.bazaarReplacement.id;
recordsMap.get(directory+'/usdc-hosted-http.json').attempts=[{kind:'api',deploymentId,requestId:driverId,status:'CONFIRMED'}];
const row=(requestId,source='api')=>({deploymentId,requestId,source,outboundPayloadBytes:5,inboundPayloadBytes:7,externalOutboundPayloadBytes:1,externalInboundPayloadBytes:2,external:{horizon:0,provider:0},uncertain:false});
recordsMap.set(directory+'/usdc-browser-traffic.json',prior({activeExecutionMs:10,complete:false,requests:[{kind:'api',deploymentId,requestId:browserId,status:'CONFIRMED',requestBytes:2,responseBytes:3}]}));
recordsMap.set(directory+'/usdc-meter-fixture.json',prior({deploymentId,records:[row(driverId),row(browserId),row(ssrId,'ssr')]}));recordsMap.set(directory+'/usdc-meter-fixture-copy.json',structuredClone(recordsMap.get(directory+'/usdc-meter-fixture.json')));
const read=async path=>{if(!recordsMap.has(path))throw missing();return structuredClone(recordsMap.get(path));},list=async()=>['usdc-meter-fixture.json','usdc-meter-fixture-copy.json'];
const totals=await toolbarOtherBudget({manifest,read,list});assert.deepEqual(totals,{apiRequests:19,outboundPayloadBytes:32,inboundPayloadBytes:48,activeExecutionMs:46});
recordsMap.get(directory+'/usdc-meter-fixture-copy.json').records[1].inboundPayloadBytes++;await assert.rejects(toolbarOtherBudget({manifest,read,list}),/CONFLICTING_SERVER_REQUEST_ID/);
console.log(JSON.stringify({status:'PASS',sharedLock:true,allPriorEffectsCounted:true,serverUuidDeduplication:true,frozenReserves:true,guardBeforeEachGet:true,partialBytesAndTimePersisted:true,uncertainLockPreserved:true,existingEvidencePreserved:true,automaticRetries:0,networkRequests:0,secretReads:0}));
