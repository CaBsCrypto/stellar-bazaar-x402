import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {packetDirectory} from './marketplace-private-packet.mjs';
import {acquireSaleEffectLock} from '../examples/sale-effect-lock.mjs';
import {protectionOtherBudget} from './check-usdc-bazaar-protection.mjs';

const directory='docs/evidence/sprint-marketplace';
const reportPath=directory+'/usdc-toolbar-assets.json';
const exactUrls=['https://vercel.live/_next-live/feedback/feedback.js','https://vercel.live/_next-live/feedback/feedback.html'];
const headerLimit=32768;
const json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const number=(value,label)=>{assert.ok(Number.isSafeInteger(value)&&value>=0,'INVALID_BUDGET_COUNTER:'+label);return value;};
const emptyBudget=()=>({apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0,activeExecutionMs:0});
const hash=value=>createHash('sha256').update(value).digest('hex');
const optional=async(read,path)=>{try{return await read(path);}catch(error){if(error.code==='ENOENT')return undefined;throw error;}};
const requestKey=value=>value.deploymentId+':'+value.requestId;

function binding(value,manifest,label){
 assert.equal(value.planId,manifest.planId,'OTHER_PLAN_MISMATCH:'+label);
 assert.equal(value.sourceSha,manifest.sourceSha,'OTHER_SOURCE_SHA_MISMATCH:'+label);
 assert.ok(!['UNCERTAIN','PENDING','IN_PROGRESS'].includes(value.status),'OTHER_EFFECT_UNCONFIRMED:'+label);
 assert.ok(!value.attempts?.some(attempt=>attempt.status!=='CONFIRMED'),'OTHER_EFFECT_PENDING:'+label);
}

/** No reservation is inferred from an absent byte/time field or a partial browser observation. */
export async function toolbarFrozenReserves({manifest,readBytes=readFile}){
 const reserve=manifest.browserReserve;
 assert.ok(reserve&&number(reserve.apiRequests,'browser-api')>0,'FROZEN_BROWSER_API_RESERVE_REQUIRED');
 const result={apiRequests:reserve.apiRequests,outboundPayloadBytes:reserve.outboundPayloadBytes,inboundPayloadBytes:reserve.inboundPayloadBytes,activeExecutionMs:reserve.activeExecutionMs};
 if(manifest.browserReadOnlyExecution){
  const frozen=manifest.browserReadOnlyExecution;
  assert.match(frozen.budgetSha256??'',/^[a-f0-9]{64}$/,'FROZEN_BROWSER_BUDGET_HASH_REQUIRED');
  const bytes=await readBytes(directory+'/usdc-browser-readonly-budget.json');
  assert.ok(bytes.byteLength>0&&bytes.byteLength<=65536,'FROZEN_BROWSER_BUDGET_SIZE');
  assert.equal(hash(bytes),frozen.budgetSha256,'FROZEN_BROWSER_BUDGET_HASH_MISMATCH');
  const budget=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  assert.equal(budget.sourceSha,manifest.sourceSha,'FROZEN_BROWSER_SOURCE_MISMATCH');
  assert.equal(budget.deploymentId,manifest.deployments?.bazaarReplacement?.id,'FROZEN_BROWSER_DEPLOYMENT_MISMATCH');
  assert.equal(budget.origin,new URL(manifest.deployments.bazaarReplacement.url).origin,'FROZEN_BROWSER_ORIGIN_MISMATCH');
  assert.equal(frozen.readOnly,true);assert.equal(frozen.retries,0);assert.equal(frozen.openingApproved,false);
  assert.equal(budget.apiReserve,reserve.apiRequests);assert.equal(frozen.maxApiRequests,reserve.apiRequests);
  assert.equal(budget.activeBrowserSecondsUpper,frozen.maxActiveSeconds);
  result.inboundPayloadBytes=number(budget.inboundControlledJourneyUpperBytes,'browser-inbound');
  result.activeExecutionMs=number(frozen.maxActiveSeconds,'browser-seconds')*1000;
  // The frozen journey consists of GETs. This counter measures payloads, excluding request headers.
  result.outboundPayloadBytes=reserve.outboundPayloadBytes??0;
 }
 for(const [field,value]of Object.entries(result))number(value,'browser-reserve:'+field);
 assert.ok(result.inboundPayloadBytes>0&&result.activeExecutionMs>0,'FROZEN_BROWSER_BYTE_TIME_RESERVES_REQUIRED');
 return result;
}

/** Known effects and additional server records; duplicate UUIDs do not double-count a driver call. */
export async function toolbarOtherBudget({manifest,read=json,list=readdir}){
 const total=await protectionOtherBudget({manifest,read});
 const driver=await optional(read,directory+'/usdc-hosted-http.json');
 const matched=new Set((driver?.attempts??[]).filter(value=>value.kind==='api').map(requestKey));
 const browser=await optional(read,directory+'/usdc-browser-traffic.json');
 if(browser){
  binding(browser,manifest,'browser');assert.ok(Array.isArray(browser.requests),'BROWSER_REQUESTS_REQUIRED');
  total.activeExecutionMs+=number(browser.activeExecutionMs,'browser-time');
  for(const request of browser.requests){
   assert.equal(request.status,'CONFIRMED','BROWSER_EFFECT_UNCONFIRMED');
   assert.ok(['api','html','static','redirect'].includes(request.kind),'UNKNOWN_BROWSER_REQUEST_KIND');
   total.outboundPayloadBytes+=number(request.requestBytes,'browser-request-bytes');
   total.inboundPayloadBytes+=number(request.responseBytes,'browser-response-bytes');
  }
  // API requests are counted from server UUIDs below. A browser-only API without its server receipt is unsafe.
 }
 const records=new Map(),deployments=new Set(Object.values(manifest.deployments??{}).map(value=>value.id));
 for(const name of(await list(directory)).filter(name=>/^usdc-meter-[a-z0-9-]+\.json$/.test(name))){
  const report=await read(directory+'/'+name);binding(report,manifest,name);
  assert.ok(deployments.has(report.deploymentId),'UNBOUND_SERVER_DEPLOYMENT');assert.ok(Array.isArray(report.records),'SERVER_RECORDS_REQUIRED');
  for(const raw of report.records){
   assert.equal(raw.deploymentId,report.deploymentId);assert.equal(raw.uncertain,false,'SERVER_EFFECT_UNCERTAIN');
   assert.match(raw.requestId??'',/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,'SERVER_REQUEST_ID_REQUIRED');
   assert.ok(['api','ssr'].includes(raw.source),'SERVER_RECORD_SOURCE_REQUIRED');
   const row={deploymentId:raw.deploymentId,requestId:raw.requestId,source:raw.source,
    outboundPayloadBytes:number(raw.outboundPayloadBytes,'server-out')+number(raw.externalOutboundPayloadBytes,'server-external-out'),
    inboundPayloadBytes:number(raw.inboundPayloadBytes,'server-in')+number(raw.externalInboundPayloadBytes,'server-external-in'),
    external:Object.fromEntries(Object.entries(raw.external??{}).map(([key,value])=>[key,number(value,'server-external:'+key)]))};
   const key=requestKey(row),previous=records.get(key);
   if(previous)assert.deepEqual(row,previous,'CONFLICTING_SERVER_REQUEST_ID');else records.set(key,row);
  }
 }
 for(const request of browser?.requests??[])if(request.kind==='api'){
  assert.ok(!matched.has(requestKey(request)),'BROWSER_DUPLICATES_DRIVER_API');
  assert.equal(records.get(requestKey(request))?.source,'api','BROWSER_API_SERVER_RECEIPT_REQUIRED');
 }
 for(const [key,row]of records){
  if(matched.has(key))continue;
  total.apiRequests+=(row.source==='api'?1:0)+Object.values(row.external).reduce((sum,value)=>sum+value,0);
  total.outboundPayloadBytes+=row.outboundPayloadBytes;total.inboundPayloadBytes+=row.inboundPayloadBytes;
 }
 // The full frozen browser reserve remains in addition to these observed costs. Incomplete capture never reduces it.
 for(const [field,value]of Object.entries(total))number(value,'other-total:'+field);
 return total;
}

export function assertToolbarBudget({manifest,report,other,reserves,elapsedMs=report.activeExecutionMs}){
 for(const value of [report,other,reserves])for(const field of Object.keys(emptyBudget()))number(value[field],field);
 const limits=manifest.limits,plan=manifest.browserResourceProbes;
 assert.ok(report.apiRequests<plan.maxRequests,'RESOURCE_REQUEST_COUNT_LIMIT');
 assert.ok(other.apiRequests+report.apiRequests+1+reserves.apiRequests<=number(limits.apiRequests,'limit-api'),'COMBINED_API_REQUEST_LIMIT');
 assert.ok(other.outboundPayloadBytes+report.outboundPayloadBytes+reserves.outboundPayloadBytes<=number(limits.outboundPayloadBytes,'limit-out'),'COMBINED_OUTBOUND_PAYLOAD_LIMIT');
 assert.ok(other.inboundPayloadBytes+report.inboundPayloadBytes+plan.maxResponseBodyBytes+headerLimit+reserves.inboundPayloadBytes<=number(limits.inboundPayloadBytes,'limit-in'),'COMBINED_INBOUND_PAYLOAD_LIMIT');
 assert.ok(other.activeExecutionMs+number(elapsedMs,'elapsed')+plan.timeoutMs+reserves.activeExecutionMs<=number(limits.activeExecutionSeconds,'limit-seconds')*1000,'COMBINED_EXECUTION_TIME_LIMIT');
}

/** Injectable transport and storage. Importing this module performs no request or secret read. */
export async function runToolbarAssetCheck({read=json,readBytes=readFile,list=readdir,write=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n'),fetcher=fetch,acquireLock=acquireSaleEffectLock,now=Date.now}={}){
 const manifest=await read(directory+'/usdc-sale-manifest.json'),lock=await acquireLock(packetDirectory,manifest.planId);let report;
 try{
  const existing=await optional(read,reportPath);
  if(existing){if(existing.status==='UNCERTAIN'||existing.attempts?.some(value=>['UNCERTAIN','PENDING'].includes(value.status)))report=existing;throw Error('RESOURCE_PROBES_ALREADY_RECORDED_DO_NOT_RETRY');}
  const plan=manifest.browserResourceProbes;
  assert.deepEqual(plan?.urls,exactUrls);assert.equal(plan.maxRequests,2);assert.equal(plan.credentials,'none');assert.equal(plan.redirects,0);assert.equal(plan.retries,0);
  assert.equal(plan.maxResponseBodyBytes,1048576);assert.equal(plan.timeoutMs,12000);
  const reserves=await toolbarFrozenReserves({manifest,readBytes});
  report={version:1,planId:manifest.planId,sourceSha:manifest.sourceSha,status:'PREPARATION',apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0,activeExecutionMs:0,automaticRetries:0,credentials:'none',attempts:[],reserves};
  const started=now(),persist=async()=>{report.activeExecutionMs=Math.max(0,now()-started);await write(reportPath,report);};
  for(const url of plan.urls){
   // Read the other runners' receipts again under the shared lock before each effect.
   try{assertToolbarBudget({manifest,report,other:await toolbarOtherBudget({manifest,read,list}),reserves,elapsedMs:Math.max(0,now()-started)});}
   catch(error){report.status=/UNCONFIRMED|UNCERTAIN|PENDING|CONFLICTING_SERVER_REQUEST_ID/.test(error.message)?'UNCERTAIN':'BUDGET_STOP';await persist();throw error;}
   const parsed=new URL(url),attempt={url,origin:parsed.origin,path:parsed.pathname,method:'GET',authentication:'none',status:'PENDING',bodyBytes:0,headerBytes:0,responseBytes:0};
   report.attempts.push(attempt);report.apiRequests++;report.status='IN_PROGRESS';
   try{
    await persist();
    const response=await fetcher(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(plan.timeoutMs)});
    attempt.httpStatus=response.status;
    attempt.headerBytes=Buffer.byteLength('HTTP/1.1 '+response.status+' '+response.statusText+'\r\n')+[...response.headers].reduce((sum,[key,value])=>sum+Buffer.byteLength(key+': '+value+'\r\n'),2);
    report.inboundPayloadBytes+=attempt.headerBytes;attempt.responseBytes=attempt.headerBytes;
    assert.equal(response.redirected,false,'UNEXPECTED_FOLLOWED_REDIRECT');if(response.url)assert.equal(response.url,url,'UNBOUND_RESPONSE_URL');
    if(attempt.headerBytes>headerLimit){await response.body?.cancel();throw Error('RESOURCE_HEADERS_LIMIT');}
    const digest=createHash('sha256');
    for await(const chunk of response.body??[]){
     const bytes=chunk.byteLength;attempt.bodyBytes+=bytes;attempt.responseBytes+=bytes;report.inboundPayloadBytes+=bytes;
     if(attempt.bodyBytes>plan.maxResponseBodyBytes)throw Error('RESOURCE_RESPONSE_LIMIT');
     digest.update(chunk);
    }
    attempt.bodyHash=digest.digest('hex');attempt.bodySha256=attempt.bodyHash;attempt.status='CONFIRMED';
    if(response.status!==200){report.status='KNOWN_REJECTED';throw Error('RESOURCE_HTTP_STATUS:'+response.status);}
   }catch(error){
    if(attempt.status==='PENDING'){attempt.status='UNCERTAIN';report.status='UNCERTAIN';}
    throw error;
   }finally{
    // Partial chunks and elapsed time survive a lost response; no second GET can follow it.
    try{await persist();}catch(error){report.status='UNCERTAIN';if(attempt.status==='PENDING')attempt.status='UNCERTAIN';throw error;}
   }
  }
  report.status='PASS';report.limitation='Anonymous bootstrap resource sizes only; prior browser retransmissions or feedback API traffic are not a complete capture.';
  try{await persist();}catch(error){report.status='UNCERTAIN';throw error;}return report;
 }finally{
  if(report?.status==='UNCERTAIN'||report?.attempts.some(value=>['PENDING','UNCERTAIN'].includes(value.status)))await lock.preserve();else await lock.release();
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{assert.equal(process.argv.length,2,'NO_EXTRA_RESOURCE_ARGUMENTS');const report=await runToolbarAssetCheck();console.log(JSON.stringify({status:report.status,apiRequests:report.apiRequests,inboundPayloadBytes:report.inboundPayloadBytes,secretReads:0,resources:report.attempts.map(value=>({url:value.url,bodyBytes:value.bodyBytes}))}));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
