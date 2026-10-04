import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {packetDirectory} from './marketplace-private-packet.mjs';
import {acquireSaleEffectLock} from '../examples/sale-effect-lock.mjs';

const directory='docs/evidence/sprint-marketplace',json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const verificationPath='/.well-known/stellar-bazaar-provider.txt',denied=new Set([302,303,307,308,401,403]);
const emptyBudget=()=>({apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0,activeExecutionMs:0});

export function providerProtectionArtifacts(label='initial'){
 assert.ok(['initial','proof'].includes(label),'INVALID_PROVIDER_PROTECTION_LABEL');
 return {deploymentLabel:'provider-'+label,deploymentPath:directory+'/usdc-provider-'+label+'.json',reportPath:directory+(label==='initial'?'/usdc-provider-protection-check.json':'/usdc-provider-proof-protection-check.json')};
}

/** One anonymous request to the selected frozen deployment; no access or gate changes. */
export async function checkProtectedProvider({manifest,deployment,report,label='initial',fetcher=fetch,persistReport,otherBudget=async()=>emptyBudget()}){
 const {deploymentLabel}=providerProtectionArtifacts(label);
 assert.equal(manifest.readiness.canDeployPreview,true);assert.equal(manifest.readiness.localSaleMeasured,true);assert.equal(manifest.readiness.payloadsFrozen,true);
 assert.equal(deployment.planId,manifest.planId);assert.equal(deployment.sourceSha,manifest.sourceSha);assert.equal(deployment.readyState,'READY');
 assert.equal(deployment.payloadFingerprint,manifest.uploads.provider.payloadFingerprint);assert.ok(deployment.target!=='production');assert.match(deployment.id,/^dpl_/);
 const target=new URL(deployment.url);
 assert.equal(target.protocol,'https:');assert.ok(!target.username&&!target.password&&!target.search&&!target.hash&&target.pathname==='/','INVALID_DEPLOYMENT_ORIGIN');
 assert.match(target.hostname,/^ai-video-scriptwriter-[a-z0-9]+(?:-cabscryptocontacto-6028s-projects)?\.vercel\.app$/);
 const origin=target.origin;
 assert.equal(report.planId,manifest.planId);assert.equal(report.sourceSha,manifest.sourceSha);assert.equal(report.deploymentId,deployment.id);assert.equal(report.deploymentLabel,deploymentLabel,'PROTECTION_LABEL_BINDING_MISMATCH');
 assert.equal(report.apiRequests,0,'PROTECTION_CHECK_ALREADY_ATTEMPTED');assert.ok(!report.attempts?.length,'PROTECTION_CHECK_ALREADY_ATTEMPTED');
 const other=await otherBudget();assert.ok(Object.values(other).every(value=>Number.isSafeInteger(value)&&value>=0),'BUDGET_EVIDENCE_INVALID');
 assert.ok(other.apiRequests+1<=manifest.limits.apiRequests-(manifest.browserReserve?.apiRequests??20),'COMBINED_API_REQUEST_LIMIT');
 assert.ok(other.inboundPayloadBytes+131072<=manifest.limits.inboundPayloadBytes,'COMBINED_INBOUND_PAYLOAD_LIMIT');
 assert.ok(other.outboundPayloadBytes<=manifest.limits.outboundPayloadBytes,'COMBINED_OUTBOUND_PAYLOAD_LIMIT');
 assert.ok(other.activeExecutionMs+12000<=manifest.limits.activeExecutionSeconds*1000,'COMBINED_EXECUTION_TIME_LIMIT');
 const started=Date.now(),persist=async()=>{report.activeExecutionMs=Date.now()-started;await persistReport(report);};
 report.origin=origin;report.path=verificationPath;report.apiRequests=1;report.status='PENDING';report.attempts=[{method:'GET',path:verificationPath,authentication:'none',status:'PENDING'}];await persist();
 try{
  const response=await fetcher(origin+verificationPath,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
  const attempt=report.attempts[0];attempt.httpStatus=response.status;assert.equal(response.redirected,false,'UNEXPECTED_FOLLOWED_REDIRECT');
  if(response.url)assert.equal(response.url,origin+verificationPath,'UNBOUND_RESPONSE_URL');
  let headerBytes=0,bodyBytes=0;for(const[key,value]of response.headers)headerBytes+=Buffer.byteLength(key+': '+value+'\r\n');
  report.responseHeaderBytes=headerBytes;report.rawResponseBytes=headerBytes;report.inboundPayloadBytes=headerBytes;
  if(headerBytes>131072){await response.body?.cancel();throw Error('PROTECTION_RESPONSE_OVERSIZE');}
  if(response.body)for await(const chunk of response.body){
   bodyBytes+=chunk.byteLength;report.responseBodyBytes=bodyBytes;report.rawResponseBytes=headerBytes+bodyBytes;report.inboundPayloadBytes=report.rawResponseBytes;
   if(report.rawResponseBytes>131072)throw Error('PROTECTION_RESPONSE_OVERSIZE');
  }
  report.responseBodyBytes=bodyBytes;attempt.status='CONFIRMED';report.unauthenticatedDenied=denied.has(response.status);
  report.status=report.unauthenticatedDenied?'PASS':'FAILED_PROTECTION';await persist();
  assert.equal(report.unauthenticatedDenied,true,'PROTECTION_NOT_EFFECTIVE');return report;
 }catch(error){if(report.status!=='FAILED_PROTECTION'){report.status='UNCERTAIN';report.attempts[0].status='UNCERTAIN';}await persist();throw error;}
}

async function main(){
 const label=process.argv[2]??'initial',{deploymentPath,reportPath:path,deploymentLabel}=providerProtectionArtifacts(label);
 const manifest=await json(directory+'/usdc-sale-manifest.json'),lock=await acquireSaleEffectLock(packetDirectory,manifest.planId);let report;
 try{
  try{await readFile(path);throw Error('PROTECTION_CHECK_ALREADY_ATTEMPTED_DO_NOT_RETRY');}catch(error){if(error.code!=='ENOENT')throw error;}
  const deployment=await json(deploymentPath);
  report={version:1,planId:manifest.planId,sourceSha:manifest.sourceSha,deploymentId:deployment.id,deploymentLabel,path:verificationPath,status:'PREPARATION',apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0,rawResponseBytes:0,responseBodyBytes:0,responseHeaderBytes:0,activeExecutionMs:0,automaticRetries:0,unauthenticatedDenied:false,attempts:[]};
  const otherBudget=async()=>{
   const sibling=label==='proof'?'usdc-provider-protection-check':'usdc-provider-proof-protection-check';
   const total=emptyBudget();for(const name of ['usdc-hosted-http','usdc-wallet-provision','usdc-provider-proof-check','usdc-bazaar-protection-check',sibling]){
    let value;try{value=await json(directory+'/'+name+'.json');}catch(error){if(error.code==='ENOENT'&&!(label==='proof'&&name===sibling))continue;throw error;}
    assert.equal(value.planId,manifest.planId);assert.equal(value.sourceSha,manifest.sourceSha);assert.notEqual(value.status,'UNCERTAIN');assert.ok(!value.attempts?.some(attempt=>attempt.status==='PENDING'),'OTHER_EFFECT_PENDING');
    if(name===sibling){assert.equal(value.status,'PASS');assert.equal(value.apiRequests,1);assert.equal(value.unauthenticatedDenied,true);}
    total.apiRequests+=(value.apiRequests??0)+Object.values(value.external??{}).reduce((sum,count)=>sum+count,0)+Object.entries(value.counts??{}).filter(([key])=>key!=='usdcFaucetClaims').reduce((sum,[,count])=>sum+count,0)+(value.proofHttpRequests??0);
    for(const key of ['outboundPayloadBytes','inboundPayloadBytes','activeExecutionMs'])total[key]+=value[key]??0;
   }return total;
  };
  await checkProtectedProvider({manifest,deployment,report,label,otherBudget,persistReport:value=>writeFile(path,JSON.stringify(value,null,2)+'\n')});
  console.log(JSON.stringify({...report,attempts:undefined,secretReads:0,gateChanges:0}));
 }catch(error){console.error(error.message);process.exitCode=1;}
 finally{if(report?.status==='UNCERTAIN'||report?.attempts.some(attempt=>attempt.status==='PENDING'))await lock.preserve();else await lock.release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
