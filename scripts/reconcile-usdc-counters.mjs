import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const externalKeys=['horizon','proof-dns','proof-http','provider'];
const storageFields={workspace:'workspaceStoredBytesUpperBound',market:'marketStoredBytesUpperBound',review:'reviewStoredBytesUpperBound',catalog:'catalogStoredBytesUpperBound'};
const meterFields=['redis','commandsUpperBound','outboundPayloadBytes','inboundPayloadBytes',...Object.values(storageFields),'externalOutboundPayloadBytes','externalInboundPayloadBytes'];
const protectionTargets={'provider-initial':{key:'providerInitial',path:'/.well-known/stellar-bazaar-provider.txt'},'provider-proof':{key:'providerProof',path:'/.well-known/stellar-bazaar-provider.txt'},'bazaar-probe':{key:'bazaarProbe',path:'/history'},'bazaar-candidate':{key:'bazaarCandidate',path:'/history'},'bazaar-replacement':{key:'bazaarReplacement',path:'/history'},'bazaar-closed':{key:'bazaarClosed',path:'/history'}};
const requestIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const number=(value,label)=>{assert.ok(Number.isSafeInteger(value)&&value>=0,'INVALID_COUNTER:'+label);return value;};
const sum=values=>values.reduce((total,value)=>total+value,0);
const emptyExternal=()=>Object.fromEntries(externalKeys.map(key=>[key,0]));
const emptyStorage=()=>Object.fromEntries(Object.keys(storageFields).map(key=>[key,0]));
const keyFor=value=>value.deploymentId+':'+value.requestId;
const cleanPath=value=>{assert.equal(typeof value,'string','INVALID_PUBLIC_PATH');assert.ok(value===''||value.startsWith('/'),'INVALID_PUBLIC_PATH');assert.ok(!/[?#]/.test(value),'QUERY_OR_FRAGMENT_IN_PUBLIC_METADATA');return value;};
const digest=value=>createHash('sha256').update(value).digest('hex');
const recoveryBaselineHash=report=>digest(JSON.stringify({planId:report.planId,sourceSha:report.sourceSha,provisioningBinding:report.provisioningBinding,status:report.status,counts:report.counts,attempts:report.attempts,activeExecutionMs:report.activeExecutionMs,outboundPayloadBytes:report.outboundPayloadBytes,inboundPayloadBytes:report.inboundPayloadBytes,automaticRetries:report.automaticRetries}));

export function assertProvisionRecovery(manifest,provision,snapshotBytes){
 const transition=manifest.faucetRecovery;
 if(!transition){assert.ok(!provision.recovery&&!provision.bindingHistory?.length,'UNBOUND_PROVISION_RECOVERY');return;}
 assert.equal(transition.version,1,'RECOVERY_VERSION');assert.equal(transition.reason,'known-pow-exhausted-old-challenge-lost','RECOVERY_REASON');assert.equal(transition.maxRecoveryCount,1,'RECOVERY_COUNT_LIMIT');
 assert.equal(transition.firstNewAttemptIndex,11,'RECOVERY_FIRST_NEW_ATTEMPT');
 for(const field of ['fromBinding','toBinding','baselineHash','snapshotHash'])assert.match(transition[field],/^[a-f0-9]{64}$/,'RECOVERY_HASH:'+field);
 assert.notEqual(transition.fromBinding,transition.toBinding,'RECOVERY_BINDING_NOT_CHANGED');
 assert.equal(provision.provisioningBinding,transition.toBinding,'RECOVERY_ACTIVE_BINDING');assert.equal(manifest.provisioningBinding,transition.toBinding,'RECOVERY_MANIFEST_BINDING');
 assert.ok(Array.isArray(provision.bindingHistory)&&provision.bindingHistory.length===1,'RECOVERY_HISTORY_REQUIRED');
 const {baseline,...historyTransition}=provision.bindingHistory[0];assert.deepEqual(historyTransition,transition,'RECOVERY_TRANSITION_CHANGED');
 binding(baseline,manifest,'recovery-baseline');assert.equal(baseline.status,'PAUSED_LOCAL_POW_EXHAUSTED','RECOVERY_BASELINE_STATUS');assert.equal(baseline.stopReason,'POW_LIMIT_EXHAUSTED_BEFORE_CLAIM','RECOVERY_BASELINE_REASON');
 assert.equal(baseline.provisioningBinding,transition.fromBinding,'RECOVERY_BASELINE_BINDING');assert.equal(recoveryBaselineHash(baseline),transition.baselineHash,'RECOVERY_BASELINE_HASH');
 assert.ok(Buffer.isBuffer(snapshotBytes)&&snapshotBytes.length>0&&snapshotBytes.length<=262144,'RECOVERY_SNAPSHOT_BYTES_REQUIRED');assert.equal(digest(snapshotBytes),transition.snapshotHash,'RECOVERY_SNAPSHOT_HASH');
 assert.deepEqual(JSON.parse(snapshotBytes.toString('utf8').replace(/^\uFEFF/,'')),baseline,'RECOVERY_ARCHIVED_BASELINE_CHANGED');
 const original={horizonReads:6,friendbotClaims:2,trustlineSubmissions:2,faucetApiRequests:1,usdcFaucetClaims:0};assert.deepEqual(baseline.counts,original,'RECOVERY_BASELINE_COUNTS');assert.equal(baseline.attempts.length,11,'RECOVERY_BASELINE_ATTEMPTS');
 assert.deepEqual(provision.attempts.slice(0,11),baseline.attempts,'RECOVERY_PRIOR_ATTEMPTS_CHANGED');
 assert.deepEqual(provision.counts,{horizonReads:7,friendbotClaims:2,trustlineSubmissions:2,faucetApiRequests:3,usdcFaucetClaims:1},'RECOVERY_FINAL_COUNTS');
 const fresh=provision.attempts.slice(11);assert.equal(fresh.length,3,'RECOVERY_NEW_ATTEMPT_COUNT');assert.deepEqual(fresh.map(value=>value.kind),['faucet-challenge','faucet-claim','horizon-read'],'RECOVERY_NEW_ATTEMPT_SCOPE');assert.deepEqual(fresh.map(value=>value.method),['POST','POST','GET'],'RECOVERY_NEW_ATTEMPT_METHOD');
 assert.ok(fresh.every(value=>value.wallet===manifest.participants?.[1]?.wallet),'RECOVERY_EXACT_BUYER_WALLET');
 assert.deepEqual(fresh.map(value=>value.origin),['https://faucet.sozu.capital','https://faucet.sozu.capital','https://horizon-testnet.stellar.org'],'RECOVERY_EXACT_ORIGINS');assert.deepEqual(fresh.map(value=>value.path),['/api/v1/faucet/pow/challenge','/api/v1/faucet/claim','/accounts/'+manifest.participants[1].wallet],'RECOVERY_EXACT_PATHS');
 assert.deepEqual(provision.recovery,{attempt:1,phase:'complete',fromBinding:transition.fromBinding,toBinding:transition.toBinding,baselineHash:transition.baselineHash},'RECOVERY_NOT_COMPLETED_ONCE');
 for(const field of ['activeExecutionMs','outboundPayloadBytes','inboundPayloadBytes'])assert.ok(number(provision[field],'recovery:'+field)>=number(baseline[field],'baseline:'+field),'RECOVERY_COUNTER_RESET:'+field);
 for(const key of Object.keys(transition.revisedLimits))assert.deepEqual(manifest.limits[key],transition.revisedLimits[key],'RECOVERY_REVISED_LIMITS_CHANGED:'+key);
 const allowed=new Set(['faucetApiRequests','provisioningHorizonReads','faucetPowMaxMs','faucetPowMaxHashes','faucetPowWorkers']);
 for(const key of new Set([...Object.keys(transition.previousLimits),...Object.keys(transition.revisedLimits)]))if(!allowed.has(key))assert.deepEqual(transition.revisedLimits[key],transition.previousLimits[key],'RECOVERY_GLOBAL_LIMIT_CHANGED:'+key);
 assert.equal(transition.previousLimits.faucetApiRequests,2);assert.equal(transition.revisedLimits.faucetApiRequests,3);assert.equal(transition.revisedLimits.provisioningHorizonReads,7);
}

function binding(value,manifest,label,{checkAutomaticRetries=true}={}){
 assert.equal(value.planId,manifest.planId,'PLAN_MISMATCH:'+label);
 assert.equal(value.sourceSha,manifest.sourceSha,'SHA_MISMATCH:'+label);
 assert.ok(!['UNCERTAIN','PENDING','IN_PROGRESS'].includes(value.status),'UNCONFIRMED_REPORT:'+label);
 assert.ok(!value.attempts?.some(attempt=>attempt.status!=='CONFIRMED'),'UNCONFIRMED_ATTEMPT:'+label);
 if(checkAutomaticRetries&&value.automaticRetries!==undefined)assert.equal(value.automaticRetries,0,'RETRY_NOT_ALLOWED:'+label);
}
function external(value,label){
 assert.ok(value&&typeof value==='object','MISSING_EXTERNAL_COUNTERS:'+label);
 assert.ok(Object.keys(value).every(key=>externalKeys.includes(key)),'UNKNOWN_EXTERNAL_COUNTER:'+label);
 return Object.fromEntries(externalKeys.map(key=>[key,number(value[key],label+':'+key)]));
}
function canonicalRecord(value,knownDeployments){
 assert.ok(knownDeployments.has(value.deploymentId),'UNKNOWN_DEPLOYMENT:'+value.deploymentId);
 assert.match(value.requestId,requestIdPattern,'INVALID_REQUEST_ID');
 assert.ok(['api','ssr'].includes(value.source),'UNKNOWN_METER_SOURCE');
 assert.equal(value.uncertain,false,'SERVER_EFFECT_UNCERTAIN:'+value.requestId);
 return {deploymentId:value.deploymentId,source:value.source,requestId:value.requestId,path:cleanPath(value.path),...Object.fromEntries(meterFields.map(field=>[field,number(value[field],value.requestId+':'+field)])),external:external(value.external,value.requestId),uncertain:false};
}
function totalsFor(records){
 const value={redis:0,commandsUpperBound:0,outboundPayloadBytes:0,inboundPayloadBytes:0,external:emptyExternal(),storage:emptyStorage()};
 for(const row of records){
  value.redis+=row.redis;value.commandsUpperBound+=row.commandsUpperBound;
  value.outboundPayloadBytes+=row.outboundPayloadBytes+row.externalOutboundPayloadBytes;
  value.inboundPayloadBytes+=row.inboundPayloadBytes+row.externalInboundPayloadBytes;
  for(const field of externalKeys)value.external[field]+=row.external[field];
  for(const [field,meterField]of Object.entries(storageFields))value.storage[field]=Math.max(value.storage[field],row[meterField]);
 }return value;
}

/** Public, already redacted metadata only. No HTTP, auth packet, DPAPI, wallet seeds or effects. */
export function reconcileUsdcCounters({manifest,driver,logReports,provision,provisionSnapshotBytes,providerProof,bazaarProtection,providerProtection,additionalProtectionReports=[],browserResourceProbes,browser,control,final=false}){
 assert.match(manifest.sourceSha,/^[a-f0-9]{40}$/,'INVALID_SOURCE_SHA');
 binding(driver,manifest,'driver');
 assert.equal(driver.automaticRetries,0,'DRIVER_RETRY_EVIDENCE_MISSING');
 assert.equal(driver.facilitatorRequests,0,'FACILITATOR_NOT_ALLOWED');
 const knownDeployments=new Set(Object.values(manifest.deployments??{}).map(value=>value.id));
 assert.ok(knownDeployments.size>0,'MISSING_DEPLOYMENT_BINDINGS');
 const records=new Map(),pending=[],collection=[];let duplicates=0;
 for(const [index,report]of logReports.entries()){
  binding(report,manifest,'logs:'+index);assert.ok(knownDeployments.has(report.deploymentId),'UNKNOWN_LOG_DEPLOYMENT');assert.ok(Array.isArray(report.records),'MISSING_SERVER_RECORDS');
  for(const raw of report.records){
   assert.equal(raw.deploymentId,report.deploymentId,'RECORD_DEPLOYMENT_MISMATCH');
   const record=canonicalRecord(raw,knownDeployments),key=keyFor(record),existing=records.get(key);
   if(existing){assert.deepEqual(record,existing,'CONFLICTING_DUPLICATE_REQUEST_ID:'+key);duplicates++;}else records.set(key,record);
  }
  // A bounded export must say whether its query exhausted the result set. IDs alone cannot prove missing SSR traffic.
  const observed=report.collection?.meterObservationCount;
  if(observed!==undefined)assert.equal(number(observed,'log-observation-count'),report.records.length,'LOG_OBSERVATION_COUNT_MISMATCH');
  const observationCoverage=observed!==undefined?observed===report.records.length:report.collection?.rawRecords>=report.records.length;
  const complete=report.collection?.complete===true&&Number.isSafeInteger(report.collection.limit)&&report.collection.limit>0&&Number.isSafeInteger(report.collection.rawRecords)&&report.collection.rawRecords>=0&&report.collection.rawRecords<report.collection.limit&&observationCoverage;
  collection.push({deploymentId:report.deploymentId,complete,rows:report.collection?.rawRecords,records:report.records.length});
 }
 if(!logReports.length||collection.some(value=>!value.complete))pending.push('LOG_COVERAGE_UNCONFIRMED');
 const attempts=driver.attempts??[];assert.ok(Array.isArray(attempts),'MISSING_DRIVER_ATTEMPTS');
 const matched=new Map(),providerAttempts=[];
 for(const attempt of attempts){
  assert.equal(attempt.status,'CONFIRMED','DRIVER_ATTEMPT_UNCONFIRMED');number(attempt.requestBytes,'driver-request-bytes');cleanPath(attempt.path);
  assert.ok(knownDeployments.has(attempt.deploymentId),'DRIVER_DEPLOYMENT_UNBOUND');
  if(attempt.kind==='provider'){providerAttempts.push(attempt);continue;}
  assert.equal(attempt.kind,'api','UNKNOWN_DRIVER_REQUEST_KIND');assert.match(attempt.requestId,requestIdPattern);
  const key=keyFor(attempt);assert.ok(!matched.has(key),'DUPLICATE_DRIVER_REQUEST:'+key);const server=records.get(key);assert.ok(server,'DRIVER_REQUEST_MISSING_FROM_LOGS:'+key);
  assert.equal(server.source,'api','DRIVER_REQUEST_MATCHED_SSR');if(server.path)assert.equal(server.path,attempt.path,'DRIVER_PATH_MISMATCH');
  assert.equal(server.redis,attempt.redis,'DRIVER_REDIS_MISMATCH');assert.equal(server.commandsUpperBound,attempt.commandsUpperBound,'DRIVER_COMMANDS_MISMATCH');
  assert.deepEqual(server.external,external(attempt.external,'driver:'+key),'DRIVER_EXTERNAL_MISMATCH');matched.set(key,server);
 }
 const matchedTotals=totalsFor([...matched.values()]);
 assert.equal(number(driver.apiRequests,'driver-api'),matched.size,'DRIVER_API_MISMATCH');
 assert.equal(number(driver.redis,'driver-redis'),matchedTotals.redis,'DRIVER_REDIS_SUM_MISMATCH');
 assert.equal(number(driver.commandsUpperBound,'driver-commands'),matchedTotals.commandsUpperBound,'DRIVER_COMMAND_SUM_MISMATCH');
 const driverExternal=external(driver.external,'driver-total');for(const field of externalKeys)assert.equal(driverExternal[field],matchedTotals.external[field]+(field==='provider'?providerAttempts.length:0),'DRIVER_EXTERNAL_SUM_MISMATCH:'+field);
 for(const field of Object.keys(storageFields))assert.equal(number(driver.storage?.[field],'driver-storage:'+field),matchedTotals.storage[field],'DRIVER_STORAGE_MISMATCH:'+field);
 const ownOut=number(driver.outboundPayloadBytes,'driver-out'),ownIn=number(driver.inboundPayloadBytes,'driver-in');
 assert.ok(ownOut>=matchedTotals.outboundPayloadBytes+sum(attempts.map(value=>value.requestBytes)),'DRIVER_OUTBOUND_BYTES_TOO_LOW');
 assert.ok(ownIn>=matchedTotals.inboundPayloadBytes,'DRIVER_INBOUND_BYTES_TOO_LOW');
 const extraApi=[...records.values()].filter(value=>value.source==='api'&&!matched.has(keyFor(value))),ssr=[...records.values()].filter(value=>value.source==='ssr');
 const browserApi=new Map();let browserOut=0,browserIn=0,browserMs=0;const browserCounts={api:0,html:0,static:0,redirect:0};
 if(browser){
  binding(browser,manifest,'browser',{checkAutomaticRetries:false});browserMs=number(browser.activeExecutionMs,'browser-time');
  if(browser.complete===true)assert.equal(browser.automaticRetries,0,'BROWSER_RETRY_EVIDENCE_MISSING');
  else{
   assert.equal(browser.automaticRetries,null,'PARTIAL_BROWSER_RETRIES_MUST_REMAIN_UNKNOWN');
   assert.equal(browser.automaticRetriesConfigured,0,'PARTIAL_BROWSER_CONFIGURED_RETRIES_MUST_BE_ZERO');
   assert.equal(browser.automaticRetriesScope,'configured-application-only','PARTIAL_BROWSER_RETRY_SCOPE_REQUIRED');
  }
  assert.ok(Array.isArray(browser.requests),'BROWSER_REQUESTS_MISSING');
  for(const request of browser.requests){
   assert.equal(request.status,'CONFIRMED','BROWSER_ATTEMPT_UNCONFIRMED');assert.ok(Object.hasOwn(browserCounts,request.kind),'UNKNOWN_BROWSER_REQUEST_KIND');cleanPath(request.path);
   browserOut+=number(request.requestBytes,'browser-request-bytes');browserIn+=number(request.responseBytes,'browser-response-bytes');browserCounts[request.kind]++;
   if(request.kind!=='api')continue;
   assert.ok(knownDeployments.has(request.deploymentId),'BROWSER_DEPLOYMENT_UNBOUND');assert.match(request.requestId,requestIdPattern);
   const key=keyFor(request);assert.ok(!browserApi.has(key),'DUPLICATE_BROWSER_REQUEST');assert.ok(!matched.has(key),'BROWSER_DUPLICATES_DRIVER_REQUEST');
   const server=records.get(key);assert.ok(server&&server.source==='api','BROWSER_REQUEST_MISSING_FROM_LOGS');if(server.path)assert.equal(server.path,request.path,'BROWSER_PATH_MISMATCH');browserApi.set(key,server);
  }
  if(browser.complete!==true)pending.push('BROWSER_TRANSPORT_COVERAGE_UNCONFIRMED');
 }else pending.push('BROWSER_TRANSPORT_NOT_MEASURED');
 if(extraApi.some(value=>!browserApi.has(keyFor(value))))pending.push('UNATTRIBUTED_SERVER_API');
 const reserve=manifest.browserReserve??{apiRequests:20,redis:80,commandsUpperBound:400},browserTotals=totalsFor(extraApi);
 assert.ok(extraApi.length<=reserve.apiRequests,'BROWSER_API_RESERVE_EXCEEDED');assert.ok(browserTotals.redis<=reserve.redis,'BROWSER_REDIS_RESERVE_EXCEEDED');assert.ok(browserTotals.commandsUpperBound<=reserve.commandsUpperBound,'BROWSER_COMMAND_RESERVE_EXCEEDED');
 let setupRequests=0,setupTime=0,auxOut=0,auxIn=0;const setup={horizonReads:0,friendbotClaims:0,trustlineSubmissions:0,faucetApiRequests:0,usdcFaucetClaims:0};
 if(provision){
  binding(provision,manifest,'provision');assert.equal(provision.status,'PASS_PROVISIONED','PROVISION_NOT_COMPLETE');
  assertProvisionRecovery(manifest,provision,provisionSnapshotBytes);
  assert.equal(provision.automaticRetries,0,'PROVISION_RETRY_EVIDENCE_MISSING');
  assert.deepEqual(Object.keys(provision.counts).sort(),Object.keys(setup).sort(),'UNKNOWN_PROVISION_COUNTER');
  for(const field of Object.keys(setup))setup[field]=number(provision.counts[field],'provision:'+field);
  setupRequests=sum(Object.entries(setup).filter(([field])=>field!=='usdcFaucetClaims').map(([,count])=>count));
  assert.equal(provision.attempts.length,setupRequests,'PROVISION_ATTEMPT_COUNT_MISMATCH');
  setupTime=number(provision.activeExecutionMs,'provision-time');auxOut+=number(provision.outboundPayloadBytes,'provision-out');auxIn+=number(provision.inboundPayloadBytes,'provision-in');
 }else pending.push('PROVISION_EVIDENCE_MISSING');
 const proofCounts={providerProof:0,bazaarProtection:0,providerProtection:0,additionalProtection:0};let proofTime=0,duplicateProtectionObservations=0;
 const protectionReceipts=new Map(),protectionLabels=new Set();
 for(const [label,value,countField]of [['providerProof',providerProof,'proofHttpRequests'],['bazaarProtection',bazaarProtection,'apiRequests'],['providerProtection',providerProtection,'apiRequests']]){
  if(!value){pending.push('PROOF_EVIDENCE_MISSING:'+label);continue;}
  binding(value,manifest,label);assert.equal(value.status,'PASS','PROOF_NOT_PASS:'+label);assert.ok(knownDeployments.has(value.deploymentId),'PROOF_DEPLOYMENT_UNBOUND');assert.equal(value.unauthenticatedDenied,true,'PROTECTION_NOT_OBSERVED:'+label);
  assert.equal(value.automaticRetries,0,'PROOF_RETRY_EVIDENCE_MISSING:'+label);
  const deploymentKey={providerProof:'providerProof',bazaarProtection:'bazaarProbe',providerProtection:'providerInitial'}[label];
  assert.equal(value.deploymentId,manifest.deployments[deploymentKey]?.id,'EXACT_PROOF_DEPLOYMENT_MISMATCH:'+label);
  if(label==='providerProof'){
   assert.equal(value.exactChallenge,true,'EXACT_CHALLENGE_MISSING');assert.equal(value.origin,manifest.config.providerOrigin,'EXACT_PROOF_ORIGIN_MISMATCH');
   assert.equal(value.challengeHash,createHash('sha256').update(manifest.payloads.expectedRecord).digest('hex'),'EXACT_PROOF_CHALLENGE_MISMATCH');
  }else assert.equal(value.path,label==='bazaarProtection'?'/history':'/.well-known/stellar-bazaar-provider.txt','EXACT_PROTECTION_PATH_MISMATCH');
  proofCounts[label]=number(value[countField],label+':requests');assert.equal(proofCounts[label],label==='providerProof'?2:1,'PROOF_REQUEST_COUNT_MISMATCH');assert.equal(value.attempts.length,proofCounts[label],'PROOF_ATTEMPT_COUNT_MISMATCH');
  if(label!=='providerProof'){
   const deploymentLabel=label==='bazaarProtection'?'bazaar-probe':'provider-initial';
   if(value.deploymentLabel!==undefined)assert.equal(value.deploymentLabel,deploymentLabel,'EXACT_PROTECTION_LABEL_MISMATCH');
   protectionReceipts.set(value.deploymentId+':'+value.path,value);protectionLabels.add(deploymentLabel);
  }
  proofTime+=number(value.activeExecutionMs,label+':time');auxOut+=number(value.outboundPayloadBytes,label+':out');auxIn+=number(value.inboundPayloadBytes,label+':in');
 }
 assert.ok(Array.isArray(additionalProtectionReports),'INVALID_ADDITIONAL_PROTECTION_REPORTS');
 for(const [index,value]of additionalProtectionReports.entries()){
  binding(value,manifest,'additionalProtection:'+index);assert.equal(value.status,'PASS','ADDITIONAL_PROTECTION_NOT_PASS');assert.equal(value.apiRequests,1,'ADDITIONAL_PROTECTION_REQUEST_COUNT');assert.equal(value.attempts.length,1,'ADDITIONAL_PROTECTION_ATTEMPT_COUNT');assert.equal(value.automaticRetries,0,'ADDITIONAL_PROTECTION_RETRY');assert.equal(value.unauthenticatedDenied,true,'ADDITIONAL_PROTECTION_NOT_OBSERVED');
  const label=value.deploymentLabel??Object.entries(protectionTargets).find(([,target])=>manifest.deployments[target.key]?.id===value.deploymentId&&target.path===value.path)?.[0];
  assert.ok(Object.hasOwn(protectionTargets,label??''),'UNKNOWN_ADDITIONAL_PROTECTION_LABEL');const target=protectionTargets[label];
  assert.equal(value.deploymentId,manifest.deployments[target.key]?.id,'EXACT_ADDITIONAL_PROTECTION_DEPLOYMENT_MISMATCH');assert.equal(value.path,target.path,'EXACT_ADDITIONAL_PROTECTION_PATH_MISMATCH');
  const key=value.deploymentId+':'+value.path,previous=protectionReceipts.get(key);
  if(previous){assert.deepEqual(value,previous,'CONFLICTING_DUPLICATE_PROTECTION_RECEIPT');duplicateProtectionObservations++;continue;}
  assert.ok(!protectionLabels.has(label),'DUPLICATE_PROTECTION_LABEL');protectionReceipts.set(key,value);protectionLabels.add(label);proofCounts.additionalProtection++;
  proofTime+=number(value.activeExecutionMs,label+':time');auxOut+=number(value.outboundPayloadBytes,label+':out');auxIn+=number(value.inboundPayloadBytes,label+':in');
 }
 for(const label of ['provider-proof','bazaar-candidate','bazaar-replacement','bazaar-closed'])if(!protectionLabels.has(label))pending.push('ADDITIONAL_PROTECTION_EVIDENCE_MISSING:'+label);
 let resourceRequests=0,resourceTime=0;
 if(browserResourceProbes){
  const value=browserResourceProbes,urls=['https://vercel.live/_next-live/feedback/feedback.js','https://vercel.live/_next-live/feedback/feedback.html'];
  binding(value,manifest,'browser-resource-probes');assert.equal(value.status,'PASS','RESOURCE_PROBES_NOT_PASS');assert.equal(value.apiRequests,2,'RESOURCE_PROBE_REQUEST_COUNT');assert.equal(value.attempts.length,2,'RESOURCE_PROBE_ATTEMPT_COUNT');assert.equal(value.credentials,'none','RESOURCE_PROBE_CREDENTIALS');assert.equal(value.automaticRetries,0,'RESOURCE_PROBE_RETRY');
  assert.deepEqual(manifest.browserResourceProbes?.urls,urls,'RESOURCE_PROBE_PLAN_URLS');assert.equal(manifest.browserResourceProbes.maxRequests,2,'RESOURCE_PROBE_PLAN_COUNT');assert.equal(manifest.browserResourceProbes.credentials,'none');assert.equal(manifest.browserResourceProbes.redirects,0);assert.equal(manifest.browserResourceProbes.retries,0);
  let responseBytes=0;
  for(const [index,attempt]of value.attempts.entries()){
   const url=new URL(urls[index]);assert.equal(attempt.url,urls[index],'RESOURCE_PROBE_EXACT_URL');assert.equal(attempt.origin,url.origin,'RESOURCE_PROBE_EXACT_ORIGIN');assert.equal(attempt.path,url.pathname,'RESOURCE_PROBE_EXACT_PATH');assert.equal(attempt.method,'GET');assert.equal(attempt.authentication,'none');assert.equal(attempt.status,'CONFIRMED');assert.equal(attempt.httpStatus,200);
   const body=number(attempt.bodyBytes,'resource-probe-body'),headers=number(attempt.headerBytes,'resource-probe-headers');assert.ok(body<=1048576&&headers<=32768,'RESOURCE_PROBE_BYTE_CAP');assert.equal(number(attempt.responseBytes,'resource-probe-response'),body+headers,'RESOURCE_PROBE_RESPONSE_BYTE_MISMATCH');assert.match(attempt.bodySha256,/^[a-f0-9]{64}$/);if(attempt.bodyHash!==undefined)assert.equal(attempt.bodyHash,attempt.bodySha256,'RESOURCE_PROBE_BODY_HASH_MISMATCH');responseBytes+=body+headers;
  }
  assert.equal(number(value.outboundPayloadBytes,'resource-probe-out'),0,'RESOURCE_PROBE_GET_BODY');assert.equal(number(value.inboundPayloadBytes,'resource-probe-in'),responseBytes,'RESOURCE_PROBE_TOTAL_BYTE_MISMATCH');
  resourceRequests=2;resourceTime=number(value.activeExecutionMs,'resource-probe-time');auxIn+=responseBytes;
 }else if(manifest.browserResourceProbes)pending.push('BROWSER_RESOURCE_PROBE_EVIDENCE_MISSING');
 const serverTotals=totalsFor([...records.values()]),extraTotals=totalsFor([...extraApi,...ssr]);
 const totals={apiRequests:[...records.values()].filter(value=>value.source==='api').length+sum(Object.values(serverTotals.external))+providerAttempts.length+setupRequests+sum(Object.values(proofCounts))+resourceRequests,redisRestExchanges:serverTotals.redis,redisCommandsUpperBound:serverTotals.commandsUpperBound,storage:serverTotals.storage,storedBytes:sum(Object.values(serverTotals.storage)),outboundPayloadBytes:ownOut+extraTotals.outboundPayloadBytes+auxOut+browserOut,inboundPayloadBytes:ownIn+extraTotals.inboundPayloadBytes+auxIn+browserIn,activeExecutionMs:number(driver.activeExecutionMs,'driver-time')+setupTime+proofTime+resourceTime+browserMs,horizonRequests:serverTotals.external.horizon+setup.horizonReads,proofDnsRequests:serverTotals.external['proof-dns'],proofHttpRequests:serverTotals.external['proof-http']+proofCounts.providerProof,providerExecutionRequests:serverTotals.external.provider+providerAttempts.length,paymentSubmissionIntents:number(driver.paymentSubmissionIntents,'payment-intents'),friendbotClaims:setup.friendbotClaims,trustlineSubmissions:setup.trustlineSubmissions,faucetApiRequests:setup.faucetApiRequests,usdcFaucetClaims:setup.usdcFaucetClaims};
 const limits=manifest.limits;
 for(const field of ['apiRequests','redisRestExchanges','redisCommandsUpperBound','storedBytes','outboundPayloadBytes','inboundPayloadBytes','proofDnsRequests','proofHttpRequests','providerExecutionRequests','friendbotClaims','trustlineSubmissions','faucetApiRequests','usdcFaucetClaims'])assert.ok(totals[field]<=number(limits[field],'limit:'+field),'TOTAL_LIMIT_EXCEEDED:'+field);
 assert.ok(totals.activeExecutionMs<=limits.activeExecutionSeconds*1000,'TOTAL_LIMIT_EXCEEDED:activeExecutionMs');assert.ok(totals.horizonRequests<=limits.horizonReads,'TOTAL_LIMIT_EXCEEDED:horizon');assert.ok(totals.paymentSubmissionIntents<=limits.marketPaymentSubmissions,'TOTAL_LIMIT_EXCEEDED:paymentSubmissions');
 for(const [field,count]of Object.entries(totals.storage))assert.ok(count<=limits.storagePartitions[field],'STORAGE_PARTITION_EXCEEDED:'+field);
 const requiredPhases=['probe','submit','activate','sale','replacement','pause','retire'];if(!requiredPhases.every(phase=>driver.phases?.some(value=>value.phase===phase&&value.passed===true)))pending.push('HOSTED_PHASES_INCOMPLETE');
 let controlCounters;
 if(control){
  assert.equal(control.planId,manifest.planId,'CONTROL_PLAN_MISMATCH');assert.notEqual(control.status,'UNCERTAIN','CONTROL_UNCERTAIN');assert.ok(!control.attempts?.some(value=>value.status!=='CONFIRMED'),'CONTROL_PENDING');
  controlCounters={};for(const [field,limitField]of [['requests','vercelControlRequests'],['creates','vercelDeploymentCreates'],['aliases','vercelAliasWrites'],['secretWrites','vercelSecretWrites'],['bypassCreates','vercelBypassCreates']]){controlCounters[field]=number(control[field],'control:'+field);assert.ok(controlCounters[field]<=limits[limitField],'CONTROL_LIMIT_EXCEEDED:'+field);}
 }else pending.push('CONTROL_COUNTERS_MISSING');
 const uniquePending=[...new Set(pending)],complete=uniquePending.length===0;
 return {version:1,planId:manifest.planId,sourceSha:manifest.sourceSha,status:complete?'PASS_COUNTERS':final?'INCOMPLETE_EVIDENCE':'PARTIAL_COUNTERS',complete,pending:uniquePending,totals,coverage:{uniqueServerRecords:records.size,duplicateObservationsDiscarded:duplicates,driverApi:matched.size,browserPrivateApi:extraApi.length,unattributedApi:extraApi.filter(value=>!browserApi.has(keyFor(value))).length,ssr:ssr.length,browserTransport:browserCounts,browserAutomaticRetriesVerified:browser?.complete===true&&browser.automaticRetries===0,browserResourceProbes:resourceRequests,logCollections:collection,anonymousProtectionChecks:protectionLabels.size,additionalProtectionChecks:proofCounts.additionalProtection,duplicateProtectionObservationsDiscarded:duplicateProtectionObservations},control:controlCounters,automaticRetries:0,automaticRetriesScope:'reconciliation-helper-and-measured-actors; browser only when coverage.browserAutomaticRetriesVerified',facilitatorRequests:0,networkRequests:0,secretReads:0,limitation:'Counter reconciliation only; it does not certify the sale, browser accessibility, human Freighter or production opening. Partial totals are observed costs, not complete browser upper bounds.'};
}

async function main(){
 const directory='docs/evidence/sprint-marketplace',json=async name=>JSON.parse((await readFile(directory+'/'+name+'.json','utf8')).replace(/^\uFEFF/,''));
 const optional=async name=>{try{return await json(name);}catch(error){if(error.code==='ENOENT')return undefined;throw error;}};
 assert.ok(['partial','final'].includes(process.argv[2]),'USE_PARTIAL_OR_FINAL');
 const names=(await readdir(directory)).filter(name=>/^usdc-meter-[a-z0-9-]+\.json$/.test(name));
 const logReports=await Promise.all(names.map(name=>json(name.slice(0,-5))));
 const additionalProtectionReports=(await Promise.all(['usdc-provider-proof-protection-check','usdc-bazaar-candidate-protection-check','usdc-bazaar-replacement-protection-check','usdc-bazaar-closed-protection-check'].map(optional))).filter(Boolean);
 let provisionSnapshotBytes;try{provisionSnapshotBytes=await readFile(directory+'/usdc-wallet-provision-before-recovery.json');}catch(error){if(error.code!=='ENOENT')throw error;}
 const result=reconcileUsdcCounters({manifest:await json('usdc-sale-manifest'),driver:await json('usdc-hosted-http'),logReports,provision:await optional('usdc-wallet-provision'),provisionSnapshotBytes,providerProof:await optional('usdc-provider-proof-check'),bazaarProtection:await optional('usdc-bazaar-protection-check'),providerProtection:await optional('usdc-provider-protection-check'),additionalProtectionReports,browserResourceProbes:await optional('usdc-toolbar-assets'),browser:await optional('usdc-browser-traffic'),control:await optional('usdc-vercel-control'),final:process.argv[2]==='final'});
 await writeFile(directory+'/usdc-counter-reconciliation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(process.argv[2]==='final'&&!result.complete)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main().catch(error=>{console.error(error.message);process.exitCode=1;});
