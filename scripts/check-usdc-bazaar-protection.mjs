import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {packetDirectory} from './marketplace-private-packet.mjs';
import {acquireSaleEffectLock} from '../examples/sale-effect-lock.mjs';

const directory='docs/evidence/sprint-marketplace',json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const denied=new Set([302,303,307,308,401,403]);
const emptyBudget=()=>({apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0,activeExecutionMs:0});

/** One exact public HTML request, before any authenticated application probe. */
export async function checkProtectedBazaar({manifest,deployment,report,fetcher=fetch,persistReport,otherBudget=async()=>emptyBudget()}){
 assert.equal(manifest.readiness.canDeployPreview,true);assert.equal(deployment.planId,manifest.planId);
 assert.equal(deployment.sourceSha,manifest.sourceSha);assert.equal(deployment.readyState,'READY');
 assert.equal(deployment.payloadFingerprint,manifest.uploads.bazaar.payloadFingerprint);
 assert.ok(deployment.target!=='production');assert.match(deployment.id,/^dpl_/);
 const origin=new URL(deployment.url).origin;
 assert.match(origin,/^https:\/\/stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/);
 assert.equal(report.planId,manifest.planId);assert.equal(report.sourceSha,manifest.sourceSha);assert.equal(report.deploymentId,deployment.id);
 assert.equal(report.apiRequests,0,'PROTECTION_CHECK_ALREADY_ATTEMPTED');
 const other=await otherBudget();assert.ok(Object.values(other).every(value=>Number.isSafeInteger(value)&&value>=0),'BUDGET_EVIDENCE_INVALID');
 assert.ok(other.apiRequests+1<=manifest.limits.apiRequests-(manifest.browserReserve?.apiRequests??20),'COMBINED_API_REQUEST_LIMIT');
 assert.ok(other.inboundPayloadBytes+131072<=manifest.limits.inboundPayloadBytes,'COMBINED_INBOUND_PAYLOAD_LIMIT');
 assert.ok(other.outboundPayloadBytes<=manifest.limits.outboundPayloadBytes,'COMBINED_OUTBOUND_PAYLOAD_LIMIT');
 assert.ok(other.activeExecutionMs+12000<=manifest.limits.activeExecutionSeconds*1000,'COMBINED_EXECUTION_TIME_LIMIT');
 const started=Date.now(),persist=async()=>{report.activeExecutionMs=Date.now()-started;await persistReport(report);};
 report.origin=origin;report.apiRequests=1;report.status='PENDING';report.attempts=[{method:'GET',path:'/history',authentication:'none',status:'PENDING'}];await persist();
 try{
  const response=await fetcher(origin+'/history',{redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
  const attempt=report.attempts[0];attempt.httpStatus=response.status;
  assert.equal(response.redirected,false,'UNEXPECTED_FOLLOWED_REDIRECT');
  let bytes=0;for(const [key,value]of response.headers)bytes+=Buffer.byteLength(key+': '+value+'\r\n');
  if(response.body){for await(const chunk of response.body){bytes+=chunk.length;report.inboundPayloadBytes=bytes;if(bytes>131072)throw Error('PROTECTION_RESPONSE_OVERSIZE');}}
  report.inboundPayloadBytes=bytes;assert.ok(bytes<=131072,'PROTECTION_RESPONSE_OVERSIZE');
  attempt.status='CONFIRMED';report.unauthenticatedDenied=denied.has(response.status);
  report.status=report.unauthenticatedDenied?'PASS':'FAILED_PROTECTION';await persist();
  assert.equal(report.unauthenticatedDenied,true,'PROTECTION_NOT_EFFECTIVE');return report;
 }catch(error){if(report.status!=='FAILED_PROTECTION')report.status='UNCERTAIN';await persist();throw error;}
}

async function main(){
 const manifest=await json(directory+'/usdc-sale-manifest.json'),lock=await acquireSaleEffectLock(packetDirectory,manifest.planId);let report;
 try{
  const path=directory+'/usdc-bazaar-protection-check.json';try{await readFile(path);throw Error('PROTECTION_CHECK_ALREADY_ATTEMPTED_DO_NOT_RETRY');}catch(error){if(error.code!=='ENOENT')throw error;}
  const deployment=await json(directory+'/usdc-bazaar-probe.json');
  manifest.readiness.canProbe=false;await writeFile(directory+'/usdc-sale-manifest.json',JSON.stringify(manifest,null,2)+'\n');
  report={version:1,planId:manifest.planId,sourceSha:manifest.sourceSha,deploymentId:deployment.id,path:'/history',status:'PREPARATION',apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0,activeExecutionMs:0,automaticRetries:0,unauthenticatedDenied:false,attempts:[]};
  const otherBudget=async()=>{
   const total=emptyBudget();for(const name of ['usdc-hosted-http','usdc-wallet-provision','usdc-provider-proof-check']){
    let value;try{value=await json(directory+'/'+name+'.json');}catch(error){if(error.code==='ENOENT')continue;throw error;}
    assert.equal(value.planId,manifest.planId);assert.equal(value.sourceSha,manifest.sourceSha);assert.notEqual(value.status,'UNCERTAIN');assert.ok(!value.attempts?.some(attempt=>attempt.status==='PENDING'),'OTHER_EFFECT_PENDING');
    total.apiRequests+=(value.apiRequests??0)+Object.values(value.external??{}).reduce((sum,count)=>sum+count,0)+Object.entries(value.counts??{}).filter(([key])=>key!=='usdcFaucetClaims').reduce((sum,[,count])=>sum+count,0)+(value.proofHttpRequests??0);
    for(const key of ['outboundPayloadBytes','inboundPayloadBytes','activeExecutionMs'])total[key]+=value[key]??0;
   }return total;
  };
  await checkProtectedBazaar({manifest,deployment,report,otherBudget,persistReport:value=>writeFile(path,JSON.stringify(value,null,2)+'\n')});
  manifest.readiness.canProbe=true;await writeFile(directory+'/usdc-sale-manifest.json',JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({...report,attempts:undefined,secretReads:0}));
 }catch(error){console.error(error.message);process.exitCode=1;}
 finally{if(report?.status==='UNCERTAIN'||report?.attempts.some(attempt=>attempt.status==='PENDING'))await lock.preserve();else await lock.release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
