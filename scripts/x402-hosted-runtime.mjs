import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {open,readFile,unlink,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createAutomationPreviewFetch} from '../examples/protected-preview-client.mjs';
import {createBoundedBuyerFetch} from '../examples/marketplace-x402-buyer.mjs';
import {X402_ACCEPTANCE_LIMITS} from './x402-acceptance-manifest.mjs';
import {contractRequestProfile} from './x402-hosted-contract-checks.mjs';

const externalNames=['horizon','proof-dns','proof-http','provider','facilitator','rpc'];
const partitions=['workspace','market','review','catalog','settlement'];
const natural=value=>Number.isSafeInteger(value)&&value>=0;
const hash=value=>createHash('sha256').update(value).digest('hex');
const emptyTotals=()=>Object.fromEntries(Object.keys(X402_ACCEPTANCE_LIMITS).map(key=>[key,0]));
const httpsOrigin=value=>{const u=new URL(value);assert.ok(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&u.origin===value,'EXACT_HTTPS_ORIGIN_REQUIRED');return u.origin;};
export const x402ExternalNames=Object.freeze(externalNames);

/** Arithmetic proof only; it does not certify the provenance of hard bounds. */
export function x402PlannedBudget(manifest){
 const runtime=manifest.runtime,requests=emptyTotals(),combined=emptyTotals();
 for(const [name,b]of Object.entries(runtime.requestBudgets)){
  const perCall={apiRequests:1+(name.startsWith('api:')?Object.values(b.external).reduce((n,v)=>n+v,0):0),redisRestExchanges:b.redisRestExchanges,redisCommandsUpperBound:b.redisCommandsUpperBound,outboundPayloadBytes:b.outboundPayloadBytes,inboundPayloadBytes:b.inboundPayloadBytes};
  for(const [key,value]of Object.entries(perCall)){requests[key]+=b.maximumCalls*value;assert.ok(natural(requests[key]),'PLANNED_BOUND_OVERFLOW:'+key);}
 }
 // Existing bytes and future writes share these maxima; do not add baseline twice.
 requests.storedBytes=partitions.reduce((sum,key)=>sum+manifest.storageAllocation[key],0);
 requests.paymentSubmissionIntents=2;
 for(const key of Object.keys(combined)){
  combined[key]=(key==='storedBytes'?0:runtime.initialCounters[key])+requests[key]+runtime.reserves[key];
  assert.ok(natural(combined[key])&&combined[key]<=X402_ACCEPTANCE_LIMITS[key],'PLANNED_BUDGET_EXCEEDED:'+key);
 }
 return {requests,combined,remaining:Object.fromEntries(Object.keys(combined).map(key=>[key,X402_ACCEPTANCE_LIMITS[key]-combined[key]])),storageBasis:'Partition maxima include the baseline and future writes; no cumulative write-byte accounting.'};
}

/** Public routing categories. Dynamic JSON-RPC IDs and signed headers never enter reports. */
export function x402RequestProfile(kind,input,init={}){
 const url=new URL(input instanceof Request?input.url:String(input)),method=String(init.method??'GET').toUpperCase();
 const body=typeof init.body==='string'&&init.body?JSON.parse(init.body):{};
 if(kind==='rpc'){assert.equal(url.pathname,'/');assert.ok(['getLatestLedger','simulateTransaction'].includes(body.method),'RPC_METHOD_DENIED');return 'rpc:'+body.method;}
 if(kind==='provider'){assert.equal(method,'POST');assert.equal(url.pathname,'/v1/marketplace-text');return 'provider:execute';}
 const path=url.pathname;
 if(path==='/api/mcp')return 'api:mcp:'+(method==='POST'?(body.method==='tools/call'?'tool:'+body.params?.name:body.method):method.toLowerCase());
 if(path==='/api/market/orders')return 'api:orders:'+(method==='GET'?'list':'create');
 if(/^\/api\/market\/orders\/[0-9a-f-]{36}\/x402$/.test(path))return 'api:x402:'+(new Headers(init.headers).has('payment-signature')?'pay':'challenge');
 if(/^\/api\/market\/orders\/[0-9a-f-]{36}$/.test(path))return 'api:orders:'+(method==='GET'?'read':body.action);
 if(path==='/api/market/services')return 'api:services:'+(method==='GET'?'list':'submit');
 if(/^\/api\/market\/services\/[0-9a-f-]{36}$/.test(path))return 'api:services:'+body.action;
 if(path==='/api/market/review')return 'api:review:'+body.action;
 if(path==='/api/market/control')return 'api:control:'+body.action;
 if(/^\/api\/workspaces\/[0-9a-f-]{36}\/access$/.test(path))return 'api:access:'+body.action;
 if(path==='/api/workspaces')return 'api:workspaces:create';
 throw Error('UNMANIFESTED_ROUTE');
}

/** These are reviewed hard bounds, not observed maxima promoted to guarantees. */
export function assertX402RuntimePolicy(manifest){
 const runtime=manifest.runtime;assert.ok(runtime&&runtime.budgetBoundsReviewed===true,'REVIEWED_RUNTIME_BOUNDS_REQUIRED');
 assert.match(runtime.localProfilesSha256??'',/^[a-f0-9]{64}$/,'LOCAL_PROFILE_BINDING_REQUIRED');
 assert.ok(runtime.requestBudgets&&Object.keys(runtime.requestBudgets).length,'REQUEST_BUDGETS_REQUIRED');
 for(const [name,b]of Object.entries(runtime.requestBudgets)){
  assert.match(name,/^(api|provider|rpc):[a-zA-Z0-9:/_-]+$/);
  for(const key of ['maximumCalls','redisRestExchanges','redisCommandsUpperBound','outboundPayloadBytes','inboundPayloadBytes','responsePayloadBytes'])assert.ok(natural(b[key]),'INVALID_REQUEST_BOUND:'+name+':'+key);
  assert.ok(b.maximumCalls>0&&b.maximumCalls<=120&&b.responsePayloadBytes>0&&b.responsePayloadBytes<=1048576,'INVALID_REQUEST_BOUND');
  assert.ok(b.redisRestExchanges<=32&&b.redisCommandsUpperBound<=224,'SERVER_BOUND_EXCEEDED');
  assert.ok(b.external&&Object.keys(b.external).length===externalNames.length&&externalNames.every(key=>natural(b.external[key])&&b.external[key]<=8),'EXTERNAL_REQUEST_BOUNDS_REQUIRED');
  if(!name.startsWith('api:'))assert.ok(b.redisRestExchanges===0&&b.redisCommandsUpperBound===0&&Object.values(b.external).every(v=>v===0),'PUBLIC_TRANSPORT_HAS_NO_SERVER_METER');
 }
 for(const key of Object.keys(X402_ACCEPTANCE_LIMITS))assert.ok(natural(runtime.reserves?.[key]),'FROZEN_CAPTURE_RESERVE_REQUIRED:'+key);
 assert.ok(runtime.initialCounters&&runtime.initialStorage,'PREVIOUS_PLAN_EFFECTS_ACCOUNTING_REQUIRED');
 for(const key of Object.keys(X402_ACCEPTANCE_LIMITS))assert.ok(natural(runtime.initialCounters[key]),'INITIAL_COUNTER_REQUIRED:'+key);
 for(const key of partitions)assert.ok(natural(runtime.initialStorage[key])&&runtime.initialStorage[key]<=manifest.storageAllocation[key],'INITIAL_STORAGE_BOUND_REQUIRED:'+key);
 assert.equal(runtime.initialCounters.storedBytes,Object.values(runtime.initialStorage).reduce((n,v)=>n+v,0),'INITIAL_STORAGE_TOTAL_MISMATCH');
 assert.equal(runtime.initialCounters.paymentSubmissionIntents,0,'NEW_PLAN_PAYMENT_COUNTER_REQUIRED');
 for(const key of ['friendbotClaims','trustlineSubmissions','usdcFaucetClaims'])assert.equal(runtime.initialCounters[key],0,'PROVISIONING_FORBIDDEN');
 assert.equal(manifest.config.facilitatorOrigin,'https://channels.openzeppelin.com');assert.equal(manifest.config.facilitatorPath,'/x402/testnet');
 assert.equal(manifest.config.rpcOrigin,'https://soroban-testnet.stellar.org');assert.equal(manifest.config.previewProtectionRequired,true);
 assert.equal(manifest.config.transportRetries,0);assert.equal(manifest.config.automaticRetries,0);assert.equal(manifest.config.maximumSpendAtomic,'200000');
 for(const key of Object.keys(X402_ACCEPTANCE_LIMITS))assert.ok(runtime.initialCounters[key]+runtime.reserves[key]<=X402_ACCEPTANCE_LIMITS[key],'INITIAL_BUDGET_EXHAUSTED:'+key);
 x402PlannedBudget(manifest);
 return runtime;
}

export function newX402HostedReport(manifest){
 const policy=assertX402RuntimePolicy(manifest);
 return {version:1,kind:'x402-hosted-agent-measurement',planId:manifest.planId,sourceSha:manifest.sourceSha,status:'IN_PROGRESS',totals:{...policy.initialCounters},storage:{...policy.initialStorage},ownedRequests:0,external:Object.fromEntries(externalNames.map(key=>[key,0])),profileCalls:{},attempts:[],phases:[],paymentReservationCount:0,automaticRetries:0,unknownRequestsChargedAtUpperBound:0,measurementScope:'Application payloads and explicit transport invocations; no physical-wire claim.'};
}

/** Reject edited, reset or incomplete public counters before constructing credentials. */
export function assertX402HostedReport(report,manifest){
 assert.equal(report.version,1);assert.equal(report.kind,'x402-hosted-agent-measurement');assert.equal(report.planId,manifest.planId);assert.equal(report.sourceSha,manifest.sourceSha);assert.equal(report.automaticRetries,0);
 assert.ok(['IN_PROGRESS','PASS_EXECUTED_PHASES','FAILED_CONFIRMED','UNCERTAIN'].includes(report.status),'INVALID_HOSTED_STATUS');assert.ok(Array.isArray(report.attempts)&&report.attempts.length<=120&&Array.isArray(report.phases),'INVALID_HOSTED_ATTEMPTS');
 assert.equal(report.ownedRequests,report.attempts.length,'OWNED_REQUEST_COUNTER_CHANGED');assert.ok(natural(report.paymentReservationCount)&&report.paymentReservationCount<=2,'PAYMENT_COUNTER_CHANGED');
 const expected={...manifest.runtime.initialCounters},calls={};let unknown=0;
 for(const a of report.attempts){
  assert.ok(['PENDING','CONFIRMED','UNCERTAIN'].includes(a.status)&&manifest.runtime.requestBudgets[a.profile],'UNMANIFESTED_RECORDED_ATTEMPT');calls[a.profile]=(calls[a.profile]??0)+1;
  const charged=a.status==='CONFIRMED'?a.actual:a.status==='UNCERTAIN'?a.chargedUpperBound:undefined;
  if(charged){for(const key of Object.keys(X402_ACCEPTANCE_LIMITS)){assert.ok(natural(charged[key]),'INVALID_RECORDED_COUNTER');expected[key]+=charged[key];}}
  if(a.status==='UNCERTAIN')unknown++;
 }
 expected.paymentSubmissionIntents+=report.paymentReservationCount;
 for(const key of partitions){assert.ok(natural(report.storage?.[key])&&report.storage[key]>=manifest.runtime.initialStorage[key]&&report.storage[key]<=manifest.storageAllocation[key],'STORAGE_COUNTER_CHANGED');}
 expected.storedBytes=Object.values(report.storage).reduce((n,v)=>n+v,0);assert.deepEqual(report.totals,expected,'HOSTED_COUNTER_RESET_OR_EDIT');assert.deepEqual(report.profileCalls,calls,'PROFILE_COUNTER_CHANGED');assert.equal(report.unknownRequestsChargedAtUpperBound,unknown,'UNCERTAINTY_COUNTER_CHANGED');
 for(const key of Object.keys(expected))assert.ok(expected[key]<=manifest.limits[key],'HOSTED_BUDGET_EXHAUSTED:'+key);
 return report;
}

/** A process crash can leave an acknowledged local request marker without a response. */
export function preservePendingX402Counters(report){
 for(const attempt of report.attempts.filter(a=>a.status==='PENDING')){
  assert.ok(attempt.reserved&&Object.keys(X402_ACCEPTANCE_LIMITS).every(key=>natural(attempt.reserved[key])),'PENDING_RESERVATION_UNCONFIRMED');
  const charged={...attempt.reserved};for(const key of Object.keys(charged))charged[key]=Math.max(charged[key],attempt.actual?.[key]??0);
  for(const[key,n]of Object.entries(charged))report.totals[key]+=n;attempt.chargedUpperBound=charged;attempt.status='UNCERTAIN';attempt.reason='PROCESS_RESPONSE_NOT_RECORDED';report.unknownRequestsChargedAtUpperBound++;report.status='UNCERTAIN';
 }
 return report;
}

/** One global queue includes MCP notifications/GET/DELETE, provider and client RPC. */
export function createX402HostedRuntime({manifest,report,persist,phase,fetchImpl=fetch,readRecovery=false}){
 const policy=assertX402RuntimePolicy(manifest);assert.equal(report.planId,manifest.planId);assert.equal(report.sourceSha,manifest.sourceSha);assert.equal(typeof persist,'function');
 let tail=Promise.resolve();
 const enqueue=action=>{const result=tail.then(action);tail=result.then(()=>undefined,()=>undefined);return result;};
 const reserveFor=(kind,b,requestBytes)=>{
  assert.ok(requestBytes<=b.outboundPayloadBytes,'REQUEST_PAYLOAD_BOUND_EXCEEDED');
  const costs=emptyTotals();costs.apiRequests=1+(kind==='api'?Object.values(b.external).reduce((n,v)=>n+v,0):0);
  costs.redisRestExchanges=b.redisRestExchanges;costs.redisCommandsUpperBound=b.redisCommandsUpperBound;costs.outboundPayloadBytes=b.outboundPayloadBytes;costs.inboundPayloadBytes=b.inboundPayloadBytes;return costs;
 };
 function guard(costs){
  assert.ok(report.status!=='UNCERTAIN'||readRecovery,'UNCERTAIN_STOP_EXPLICIT_READ_RECOVERY');
  for(const key of Object.keys(costs))assert.ok(report.totals[key]+costs[key]+policy.reserves[key]<=manifest.limits[key],'BUDGET_EXHAUSTED:'+key);
 }
 function charge(costs){for(const[key,value]of Object.entries(costs))report.totals[key]+=value;}
 async function transport(kind,origin,bypassSecret,deploymentId,profileResolver){
  httpsOrigin(origin);
  if(kind==='rpc')assert.equal(origin,manifest.config.rpcOrigin);
  if(kind==='provider'){assert.equal(origin,manifest.config.providerOrigin);assert.equal(deploymentId,manifest.deployments.provider.newProofDeploymentId,'PROVIDER_DEPLOYMENT_BINDING_REQUIRED');}
  if(kind==='api')assert.ok([manifest.deployments.application,manifest.deployments.replacement].filter(Boolean).some(d=>d.id===deploymentId&&(d.origin??d.url?.replace(/\/$/,''))===origin),'UNMANIFESTED_PROTECTED_ORIGIN');
  return (input,init={})=>enqueue(async()=>{
   if(readRecovery)assert.equal(String(init.method??'GET').toUpperCase(),'GET','RECOVERY_IS_READ_ONLY');
   const profile=profileResolver?profileResolver(input,init):x402RequestProfile(kind,input,init),budget=policy.requestBudgets[profile];assert.ok(budget,'UNMANIFESTED_REQUEST_PROFILE:'+profile);
   if(kind==='rpc')for(const key of ['authorization','cookie','host','x-vercel-protection-bypass'])assert.equal(new Headers(init.headers).has(key),false,'RPC_PRIVATE_HEADER_DENIED');
   const calls=report.profileCalls[profile]??0;assert.ok(calls<budget.maximumCalls,'PROFILE_REQUEST_LIMIT:'+profile);
   let headerBytes=0;for(const[key,value]of new Headers(init.headers))headerBytes+=Buffer.byteLength(key+': '+value+'\r\n');
   if(kind!=='rpc')headerBytes+=Buffer.byteLength('x-vercel-protection-bypass: '+bypassSecret+'\r\n');
   let attempt;
   const hooks={
    beforeRequest:async meta=>{
     const requestBytes=meta.requestBytes+(kind==='rpc'?0:headerBytes),reserved=reserveFor(kind,budget,requestBytes);guard(reserved);
     attempt={origin,path:meta.path,method:meta.method,profile,kind,phase,...(deploymentId?{deploymentId}:{}),payloadHash:meta.payloadHash,status:'PENDING',requestPayloadBytes:requestBytes,reserved};
     report.profileCalls[profile]=calls+1;report.attempts.push(attempt);report.ownedRequests++;report.status=report.status==='UNCERTAIN'?'UNCERTAIN':'IN_PROGRESS';await persist(report);
    },
    onResponse:async(meta,response)=>{
     const actual=emptyTotals();attempt.actual=actual;actual.apiRequests=1;actual.outboundPayloadBytes=attempt.requestPayloadBytes;actual.inboundPayloadBytes=meta.responseBytes;
     const ext=Object.fromEntries(externalNames.map(key=>[key,0]));
     if(kind==='api'){
      assert.equal(response.headers.get('x-bazaar-acceptance-meter'),'v2','SERVER_METER_REQUIRED');
      const numeric=name=>{const v=response.headers.get(name);assert.match(v??'',/^\d+$/,'METER_MISSING:'+name);const n=Number(v);assert.ok(natural(n),'METER_NOT_NATURAL');return n;};
      attempt.requestId=response.headers.get('x-bazaar-acceptance-request-id');assert.match(attempt.requestId??'',/^[a-f0-9-]{36}$/);
      actual.redisRestExchanges=numeric('x-bazaar-redis-requests');actual.redisCommandsUpperBound=numeric('x-bazaar-redis-commands-upper-bound');
      actual.outboundPayloadBytes+=numeric('x-bazaar-redis-outbound-payload-bytes')+numeric('x-bazaar-external-outbound-payload-bytes');
      actual.inboundPayloadBytes+=numeric('x-bazaar-redis-inbound-payload-bytes')+numeric('x-bazaar-external-inbound-payload-bytes');
      for(const key of externalNames){ext[key]=numeric('x-bazaar-external-'+key);actual.apiRequests+=ext[key];}
      for(const key of partitions){const n=numeric('x-bazaar-'+key+'-stored-bytes-upper-bound');report.storage[key]=Math.max(report.storage[key],n);assert.ok(report.storage[key]<=manifest.storageAllocation[key],'STORAGE_PARTITION_BOUND:'+key);}
      assert.equal(response.headers.get('x-bazaar-redis-uncertain'),'false','REMOTE_RESULT_UNCERTAIN');
     }else ext[kind]++;
     const stored=Object.values(report.storage).reduce((n,v)=>n+v,0);assert.ok(stored<=manifest.limits.storedBytes,'STORAGE_BUDGET_EXHAUSTED');report.totals.storedBytes=stored;
     attempt.httpStatus=meta.status;attempt.actual=actual;attempt.external=ext;
     for(const[key,value]of Object.entries(actual))assert.ok(value<=attempt.reserved[key],'MEASURED_REQUEST_BOUND_EXCEEDED:'+key);
     if(kind==='api')for(const key of externalNames)assert.ok(ext[key]<=budget.external[key],'EXTERNAL_REQUEST_BOUND_EXCEEDED:'+key);
     charge(actual);for(const key of externalNames)report.external[key]+=ext[key];attempt.status='CONFIRMED';await persist(report);
    },
    onUncertain:async meta=>{
     // A response lost after a request may hide server effects. Charge its full
     // reserved upper bound; do not report that as an observed exchange count.
     if(attempt&&attempt.status!=='CONFIRMED'&&attempt.status!=='UNCERTAIN'){
      const conservative={...attempt.reserved};for(const key of Object.keys(conservative))conservative[key]=Math.max(conservative[key],attempt.actual?.[key]??0);
      conservative.inboundPayloadBytes=Math.max(conservative.inboundPayloadBytes,meta.responseBytes??0);charge(conservative);attempt.chargedUpperBound=conservative;attempt.status='UNCERTAIN';attempt.partialResponsePayloadBytes=meta.responseBytes??null;report.unknownRequestsChargedAtUpperBound++;
     }
     report.status='UNCERTAIN';await persist(report);
    }
   };
   const fetcher=kind==='rpc'?createBoundedBuyerFetch({origin,fetchImpl,maxResponseBytes:budget.responsePayloadBytes,...hooks}):createAutomationPreviewFetch({origin,bypassSecret,fetchImpl,maxResponseBytes:budget.responsePayloadBytes,...hooks});
   return fetcher(input,init);
  });
 }
 return {preview:(origin,bypassSecret,deploymentId)=>transport('api',origin,bypassSecret,deploymentId),provider:(origin,bypassSecret,deploymentId)=>transport('provider',origin,bypassSecret,deploymentId),rpc:()=>transport('rpc',manifest.config.rpcOrigin),
  contractPreview(origin,bypassSecret,deploymentId,context){
   const frozen=structuredClone(context),path='/api/market/orders/'+frozen.intent.operationId+'/x402';
   assert.equal(frozen.intent.origin,origin);assert.equal(frozen.intent.phase,'paid');
   assert.ok(report.attempts.some(a=>a.origin===origin&&a.path===path&&a.profile==='api:x402:pay'&&a.status==='CONFIRMED'&&[200,202].includes(a.httpStatus)),'CONFIRMED_PAYMENT_REQUIRED_FOR_CONTRACT_CHECKS');
   assert.ok(manifest.payloads.orders.some(o=>o.operationId===frozen.intent.operationId&&JSON.stringify(o.create)===JSON.stringify(frozen.create)),'FROZEN_ORDER_REQUIRED');
   return transport('api',origin,bypassSecret,deploymentId,(input,init)=>contractRequestProfile(frozen,input,init));
  },
  async reservePayment(){const delta=emptyTotals();delta.paymentSubmissionIntents=1;guard(delta);charge(delta);report.paymentReservationCount++;await persist(report);},async drain(){await tail;}};
}

/** An uncertain effect lock is preserved. Read recovery never silently removes it. */
export async function acquireX402RunLock(directory,planId,{readRecovery=false}={}){
 assert.match(planId,/^[a-f0-9-]{36}$/);await mkdir(directory,{recursive:true});
 const effectPath=join(directory,'x402-'+planId+'.lock'),readPath=join(directory,'x402-'+planId+'.read.lock');
 const exists=async path=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
 const previous=await exists(effectPath);
 if(readRecovery&&previous){assert.ok(['ACTIVE','PRESERVED_UNCERTAIN'].includes(previous.state),'EFFECT_LOCK_STATE_UNCONFIRMED');try{process.kill(previous.pid,0);throw Error('ACTIVE_EFFECT_PROCESS');}catch(error){if(error.message==='ACTIVE_EFFECT_PROCESS')throw error;if(error.code!=='ESRCH')throw Error('EFFECT_PROCESS_STATE_UNCONFIRMED');}}
 if(!readRecovery)assert.equal(await exists(readPath),null,'READ_RECOVERY_LOCKED');
 const path=readRecovery?readPath:effectPath,handle=await open(path,'wx',0o600);let closed=false;
 const record={version:1,planId,pid:process.pid,state:'ACTIVE',readRecovery};
 const write=async()=>{await handle.truncate(0);await handle.write(JSON.stringify(record)+'\n',0,'utf8');await handle.sync();};await write();
 return {async release(){if(closed)return;closed=true;await handle.close();await unlink(path);},async preserve(){if(closed)return;record.state='PRESERVED_UNCERTAIN';await write();closed=true;await handle.close();}};
}

export const x402PublicHash=value=>hash(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));
