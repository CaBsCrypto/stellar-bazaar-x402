import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {packetDirectory} from './marketplace-private-packet.mjs';
import {acquireSaleEffectLock} from '../examples/sale-effect-lock.mjs';

const directory='docs/evidence/sprint-marketplace',json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const denied=new Set([302,303,307,308,401,403]);
const emptyBudget=()=>({apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0,activeExecutionMs:0});
export const bazaarProtectionLabels=['probe','candidate','replacement','closed'];
export const protectionBudgetReportNames=[
 'usdc-hosted-http','usdc-wallet-provision','usdc-provider-proof-check',
 'usdc-bazaar-protection-check','usdc-bazaar-candidate-protection-check',
 'usdc-bazaar-replacement-protection-check','usdc-bazaar-closed-protection-check',
 'usdc-provider-protection-check','usdc-provider-proof-protection-check',
];

export function bazaarProtectionFiles(label='probe'){
 assert.ok(bazaarProtectionLabels.includes(label),'EXPLICIT_BAZAAR_DEPLOYMENT_LABEL_REQUIRED');
 return {label,deploymentName:'usdc-bazaar-'+label,reportName:label==='probe'?'usdc-bazaar-protection-check':'usdc-bazaar-'+label+'-protection-check'};
}

/** Add known receipts. The optional public counter bound is specific to the anonymous Bazaar guard. */
export async function protectionOtherBudget({manifest,excludeName,read=json,includeLatestCounterBound=false}){
 const total=emptyBudget();
 const counter=value=>{assert.ok(Number.isSafeInteger(value)&&value>=0,'BUDGET_EVIDENCE_INVALID');return value;};
 const optional=async name=>{try{return await read(directory+'/'+name+'.json');}catch(error){if(error.code==='ENOENT')return undefined;throw error;}};
 const bound=(value,label)=>{
  assert.equal(value.planId,manifest.planId,'OTHER_PLAN_MISMATCH:'+label);assert.equal(value.sourceSha,manifest.sourceSha,'OTHER_SOURCE_SHA_MISMATCH:'+label);
  assert.ok(!['UNCERTAIN','PENDING','IN_PROGRESS'].includes(value.status),'OTHER_EFFECT_UNCONFIRMED:'+label);
  assert.ok(!value.attempts?.some(attempt=>attempt.status!=='CONFIRMED'),'OTHER_EFFECT_PENDING:'+label);
 };
 for(const name of protectionBudgetReportNames){
  if(name===excludeName)continue;
  const value=await optional(name);if(!value)continue;bound(value,name);
  const requests=[value.apiRequests??0,value.proofHttpRequests??0,...Object.values(value.external??{}),...Object.entries(value.counts??{}).filter(([key])=>key!=='usdcFaucetClaims').map(([,count])=>count)];
  total.apiRequests+=requests.reduce((sum,count)=>sum+counter(count),0);
  for(const key of ['outboundPayloadBytes','inboundPayloadBytes','activeExecutionMs'])total[key]+=counter(value[key]??0);
 }
 if(includeLatestCounterBound){
  const toolbar=await optional('usdc-toolbar-assets');
  if(toolbar){
   bound(toolbar,'toolbar');assert.equal(toolbar.status,'PASS','TOOLBAR_NOT_CONFIRMED');assert.equal(toolbar.apiRequests,2,'TOOLBAR_EXACT_COUNT');assert.equal(toolbar.attempts?.length,2,'TOOLBAR_EXACT_ATTEMPTS');assert.equal(toolbar.automaticRetries,0);assert.equal(toolbar.credentials,'none');
   total.apiRequests+=2;for(const key of ['outboundPayloadBytes','inboundPayloadBytes','activeExecutionMs'])total[key]+=counter(toolbar[key]);
  }
  const browser=await optional('usdc-browser-traffic');
  if(browser){
   bound(browser,'browser');assert.ok(Array.isArray(browser.requests),'BROWSER_REQUESTS_REQUIRED');
   total.activeExecutionMs+=counter(browser.activeExecutionMs);
   for(const request of browser.requests){
    assert.equal(request.status,'CONFIRMED','BROWSER_EFFECT_UNCONFIRMED');
    total.outboundPayloadBytes+=counter(request.requestBytes);total.inboundPayloadBytes+=counter(request.responseBytes);
   }
  }
  const reconciled=await optional('usdc-counter-reconciliation');
  if(reconciled){
   bound(reconciled,'counter-reconciliation');assert.equal(reconciled.version,1);
   assert.ok(['PARTIAL_COUNTERS','PASS_COUNTERS','INCOMPLETE_EVIDENCE'].includes(reconciled.status),'PUBLIC_COUNTER_STATUS_INVALID');
   assert.ok(Array.isArray(reconciled.pending),'PUBLIC_COUNTER_PENDING_REQUIRED');
   const observed=counter(reconciled.coverage?.browserPrivateApi);
   assert.ok(observed<=(manifest.browserReserve?.apiRequests??20),'OBSERVED_BROWSER_API_RESERVE_EXCEEDED');
   // Include these API calls before releasing their reservation. A stale smaller total cannot subtract known costs.
   total.apiRequests+=observed;
   for(const key of Object.keys(emptyBudget()))total[key]=Math.max(total[key],counter(reconciled.totals?.[key]));
   total.browserObservedApiRequests=observed;
  }else if(browser?.requests.some(request=>request.kind==='api'))throw Error('BROWSER_API_RECONCILIATION_REQUIRED');
  // This upper bound has no observed server UUID, so it cannot release another reserved request.
  if(browser?.knownUnmeteredUpper)total.apiRequests+=counter(browser.knownUnmeteredUpper.apiRequests);
 }
 assert.ok(Object.values(total).every(value=>Number.isSafeInteger(value)&&value>=0),'BUDGET_EVIDENCE_INVALID');return total;
}

/** One exact anonymous HTML request. Protection metadata is not a proof of denial. */
export async function checkProtectedBazaar({manifest,deployment,report,fetcher=fetch,persistReport,otherBudget=async()=>emptyBudget()}){
 assert.equal(manifest.readiness.canDeployPreview,true);assert.equal(deployment.planId,manifest.planId);
 assert.equal(deployment.sourceSha,manifest.sourceSha);assert.equal(deployment.readyState,'READY');
 assert.equal(deployment.payloadFingerprint,manifest.uploads.bazaar.payloadFingerprint);
 assert.equal(deployment.target,'preview');assert.match(deployment.id,/^dpl_/);
 const target=new URL(deployment.url);
 assert.equal(target.protocol,'https:');assert.ok(!target.username&&!target.password&&!target.search&&!target.hash&&target.pathname==='/','INVALID_PREVIEW_ORIGIN');
 const origin=target.origin;
 assert.match(origin,/^https:\/\/stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/);
 assert.equal(report.planId,manifest.planId);assert.equal(report.sourceSha,manifest.sourceSha);assert.equal(report.deploymentId,deployment.id);
 assert.equal(report.apiRequests,0,'PROTECTION_CHECK_ALREADY_ATTEMPTED');assert.ok(!report.attempts?.length,'PROTECTION_CHECK_ALREADY_ATTEMPTED');
 const other=await otherBudget();assert.ok(Object.values(other).every(value=>Number.isSafeInteger(value)&&value>=0),'BUDGET_EVIDENCE_INVALID');
 const browserReserved=manifest.browserReserve?.apiRequests??20,browserObserved=other.browserObservedApiRequests??0;
 assert.ok(Number.isSafeInteger(browserReserved)&&browserReserved>=0&&browserObserved<=browserReserved,'BROWSER_API_RESERVE_INVALID');
 const browserRemaining=browserReserved-browserObserved;
 assert.ok(other.apiRequests+1<=manifest.limits.apiRequests-browserRemaining,'COMBINED_API_REQUEST_LIMIT');
 assert.ok(other.inboundPayloadBytes+131072<=manifest.limits.inboundPayloadBytes,'COMBINED_INBOUND_PAYLOAD_LIMIT');
 assert.ok(other.outboundPayloadBytes<=manifest.limits.outboundPayloadBytes,'COMBINED_OUTBOUND_PAYLOAD_LIMIT');
 assert.ok(other.activeExecutionMs+12000<=manifest.limits.activeExecutionSeconds*1000,'COMBINED_EXECUTION_TIME_LIMIT');
 const started=Date.now(),persist=async()=>{report.activeExecutionMs=Date.now()-started;await persistReport(report);};
 report.budgetBeforeRequest={...other,browserApiReserved:browserReserved,browserApiObserved:browserObserved,browserApiRemaining:browserRemaining,transportCoverageCertified:false};
 report.origin=origin;report.url=origin+'/history';report.path='/history';report.apiRequests=1;report.status='PENDING';report.attempts=[{method:'GET',path:'/history',authentication:'none',status:'PENDING'}];await persist();
 try{
  const response=await fetcher(report.url,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
  const attempt=report.attempts[0];attempt.httpStatus=response.status;
  assert.equal(response.redirected,false,'UNEXPECTED_FOLLOWED_REDIRECT');if(response.url)assert.equal(response.url,report.url,'UNBOUND_RESPONSE_URL');
  let headerBytes=0,bodyBytes=0;for(const [key,value]of response.headers)headerBytes+=Buffer.byteLength(key+': '+value+'\r\n');
  report.responseHeaderBytes=headerBytes;report.rawResponseBytes=headerBytes;report.inboundPayloadBytes=headerBytes;
  if(headerBytes>131072){await response.body?.cancel();throw Error('PROTECTION_RESPONSE_OVERSIZE');}
  if(response.body)for await(const chunk of response.body){
   bodyBytes+=chunk.byteLength;report.responseBodyBytes=bodyBytes;report.rawResponseBytes=headerBytes+bodyBytes;report.inboundPayloadBytes=report.rawResponseBytes;
   if(report.rawResponseBytes>131072)throw Error('PROTECTION_RESPONSE_OVERSIZE');
  }
  report.responseBodyBytes=bodyBytes;
  attempt.status='CONFIRMED';report.unauthenticatedDenied=denied.has(response.status);
  report.status=report.unauthenticatedDenied?'PASS':'FAILED_PROTECTION';await persist();
  assert.equal(report.unauthenticatedDenied,true,'PROTECTION_NOT_EFFECTIVE');return report;
 }catch(error){if(report.status!=='FAILED_PROTECTION'){report.status='UNCERTAIN';report.attempts[0].status='UNCERTAIN';}await persist();throw error;}
}

/** Injectable I/O permits local gate/lock tests without network or DPAPI. */
export async function runBazaarProtectionCheck({label='probe',read=json,write=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n'),fetcher=fetch,acquireLock=acquireSaleEffectLock}={}){
 const files=bazaarProtectionFiles(label),manifestPath=directory+'/usdc-sale-manifest.json';
 const manifest=await read(manifestPath),lock=await acquireLock(packetDirectory,manifest.planId);let report;
 try{
  const path=directory+'/'+files.reportName+'.json';try{await read(path);throw Error('PROTECTION_CHECK_ALREADY_ATTEMPTED_DO_NOT_RETRY');}catch(error){if(error.code!=='ENOENT')throw error;}
  const deployment=await read(directory+'/'+files.deploymentName+'.json');
  if(label==='probe'){manifest.readiness.canProbe=false;await write(manifestPath,manifest);}
  report={version:1,label,planId:manifest.planId,sourceSha:manifest.sourceSha,deploymentId:deployment.id,path:'/history',status:'PREPARATION',apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0,rawResponseBytes:0,responseBodyBytes:0,responseHeaderBytes:0,activeExecutionMs:0,automaticRetries:0,unauthenticatedDenied:false,attempts:[]};
  await checkProtectedBazaar({manifest,deployment,report,fetcher,otherBudget:()=>protectionOtherBudget({manifest,excludeName:files.reportName,read,includeLatestCounterBound:true}),persistReport:value=>write(path,value)});
  if(label==='probe'){manifest.readiness.canProbe=true;await write(manifestPath,manifest);}
  return report;
 }finally{if(report?.status==='UNCERTAIN'||report?.attempts.some(attempt=>['PENDING','UNCERTAIN'].includes(attempt.status)))await lock.preserve();else await lock.release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{assert.ok(process.argv.length<=3,'ONE_DEPLOYMENT_LABEL_ONLY');const report=await runBazaarProtectionCheck({label:process.argv[2]??'probe'});console.log(JSON.stringify({...report,attempts:undefined,secretReads:0,gateChanges:report.label==='probe'?1:0}));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
