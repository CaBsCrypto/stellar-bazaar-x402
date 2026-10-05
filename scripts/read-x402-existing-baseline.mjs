import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadPacket,savePacket,packetDirectory} from './marketplace-private-packet.mjs';
import {acquireX402RunLock} from './x402-hosted-runtime.mjs';
import {acquireSaleEffectLock} from '../examples/sale-effect-lock.mjs';
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const root='docs/evidence/sprint-x402-agent';
const output=resolve(root,'existing-redis-baseline-20261005-01.json');
const draft=JSON.parse(await readFile(resolve(root,'service-preparation.json'),'utf8'));
const old=JSON.parse(await readFile('docs/evidence/sprint-marketplace/usdc-sale-manifest.json','utf8'));
const oldReceipt=JSON.parse(await readFile('docs/evidence/sprint-marketplace/usdc-sale-receipt.json','utf8'));
const prefix=draft.config.workspacePrefix,tag=prefix.split(':')[1],market=draft.config.marketPrefix,review=draft.config.reviewPrefix;
const keys=[`${prefix}:{${tag}}:registry`,`${prefix}:{${tag}}:initialized`,...draft.participants.map(p=>`${prefix}:{${tag}}:owner:${p.ownerId}`),market+':state',review+':state',market+':catalog:card:'+old.payloads.serviceId,market+':x402-settlements:state',market+':catalog:card:'+draft.payloads.serviceId];
const indexKey=market+':catalog:index';
const policy={planId:draft.planId,origin:'https://smooth-dory-323957.upstash.io',method:'POST',path:'/pipeline',
  commands:[['MGET',...keys],['SMEMBERS',indexKey]],maxCalls:1,maxCommands:2,maxOutBytes:8192,maxInBytes:131072,timeoutMs:12000,
  retries:0,redirects:0,mutations:0,payments:0,keyEnumeration:false,storageAllocation:draft.storageAllocation,
  preparationSHA256:hash(draft),previousManifestSHA256:hash(old),previousReceiptSHA256:hash(oldReceipt)};
const report={schemaVersion:1,status:'PENDING',policy,policySHA256:hash(policy),startedAt:new Date().toISOString(),
  counters:{apiRequests:0,redisRestExchanges:0,redisCommandsUpperBound:0,outboundPayloadBytes:0,inboundPayloadBytes:0},attempts:[]};
const persist=()=>writeFile(output,JSON.stringify(report,null,2)+'\n',{flush:true});
let reportCreated=false;
const check=(ok,code)=>{if(!ok)throw Error(code);};
const same=(actual,expected,code)=>{try{assert.deepEqual(actual,expected);}catch{throw Error(code);}};
export const preserveBaselineLocks=report=>report.attempts.some(v=>['PENDING','UNCERTAIN'].includes(v.status))||/^BASELINE_PRIVATE_/.test(report.failureCode??'');
export function assertFrozenBaselineInputs(){
 const expectedTag='pilot-be8432d7255e0a3b0dca564d8aa769a0';
 same(draft.planId,'aa002e77-b950-442f-bb41-df5fa4a7f45f','BASELINE_PLAN_BINDING');
 same(prefix,'bazaar-workspace:'+expectedTag,'BASELINE_NAMESPACE_BINDING');
 same(market,'bazaar-market:'+expectedTag,'BASELINE_NAMESPACE_BINDING');same(review,'bazaar-review:'+expectedTag,'BASELINE_NAMESPACE_BINDING');
 same(draft.participants,old.participants,'BASELINE_PARTICIPANT_BINDING');check(draft.participants.length===2,'BASELINE_PARTICIPANT_COUNT');
 same(draft.participants.map(p=>({ownerId:p.ownerId,workspaceId:p.workspaceId,role:p.role})),[
  {ownerId:'ow_4d899972c5f0439eab611c996b54e2e9',workspaceId:'122de08a-ccfa-468d-8333-fcf516c2ee9a',role:'seller'},
  {ownerId:'ow_47431fe9e36e4538896cf94f0ca428c1',workspaceId:'9e0a88d8-9873-46ad-be81-355c21c1c750',role:'buyer'}],'BASELINE_PARTICIPANT_BINDING');
 same(old.payloads.serviceId,'guionista-algorithmic-text-pilot','BASELINE_SERVICE_BINDING');same(draft.payloads.serviceId,'guionista-algorithmic-text-x402-pilot','BASELINE_SERVICE_BINDING');
 same(draft.payloads.priorOperationIds.toSorted(),old.payloads.orders.map(o=>o.operationId).toSorted(),'BASELINE_ORDER_BINDING');
 same(oldReceipt.planId,old.planId,'BASELINE_RECEIPT_BINDING');same(oldReceipt.status,'PASS_CONFIRMED_SALE_RECEIPT','BASELINE_RECEIPT_BINDING');
 check(keys.length===9&&new Set(keys).size===9,'BASELINE_EXACT_KEY_COUNT');
 same([...keys,indexKey].toSorted(),[...old.keys.written,...old.keys.ownerKeys,market+':x402-settlements:state',market+':catalog:card:'+draft.payloads.serviceId].toSorted(),'BASELINE_EXACT_KEY_BINDING');
 same(draft.storageAllocation,{workspace:7000,market:18000,review:9000,catalog:5000,settlement:10164},'BASELINE_STORAGE_BINDING');
}
export function validateX402ExistingBaseline(results,packet){
 check(Array.isArray(results)&&results.length===2&&!results.some(v=>v.error),'BASELINE_PIPELINE_RESULT');
 const values=results[0].result,members=results[1].result;
 check(Array.isArray(values)&&values.length===keys.length&&values.every(v=>v===null||typeof v==='string'),'BASELINE_VALUES_SHAPE');same(members,[old.payloads.serviceId],'BASELINE_CATALOG_MEMBERS');
 const registry=JSON.parse(values[0]);check(registry?.version===1&&Array.isArray(registry.workspaces)&&registry.workspaces.length===2,'BASELINE_REGISTRY_SHAPE');same(values[1],'workspace-v1','BASELINE_INITIALIZED');
 const identities=packet.identities,currentHashes=[];check(Array.isArray(identities)&&identities.length===2,'BASELINE_PRIVATE_IDENTITIES');
 const owners=draft.participants.map((p,i)=>{
  const meta=registry.workspaces.find(v=>v.ownerId===p.ownerId);check(meta,'BASELINE_OWNER_MISSING');same(meta.workspaceId,p.workspaceId,'BASELINE_WORKSPACE_BINDING');same(meta.revoked,false,'BASELINE_OWNER_REVOKED');same(meta.generation,i===0?3:1,'BASELINE_OWNER_GENERATION');
  const access=identities[i];for(const name of ['bootstrap','human','agent',...(i===0?['rotatedHuman','rotatedAgent']:[])])check(typeof access?.[name]==='string'&&access[name].length>0,'BASELINE_PRIVATE_ACCESS_MISSING');
  same(meta.bootstrapHash,hash(access.bootstrap),'BASELINE_ACCESS_BINDING');same(meta.initialHumanHash,hash(access.human),'BASELINE_ACCESS_BINDING');same(meta.initialAgentHash,hash(access.agent),'BASELINE_ACCESS_BINDING');
  same(meta.humanHash,hash(i===0?access.rotatedHuman:access.human),'BASELINE_ACCESS_BINDING');same(meta.agentHash,hash(i===0?access.rotatedAgent:access.agent),'BASELINE_ACCESS_BINDING');
  same(meta.retiredHashes.toSorted(),i===0?[hash(access.human),hash(access.agent)].toSorted():[],'BASELINE_RETIRED_ACCESS_BINDING');
  check(typeof values[2+i]==='string'&&Buffer.byteLength(values[2+i])===meta.documentBytes,'BASELINE_OWNER_DOCUMENT_SIZE');const document=JSON.parse(values[2+i]);same(document.ownerId,p.ownerId,'BASELINE_OWNER_DOCUMENT_BINDING');same(document.revision,meta.documentRevision,'BASELINE_OWNER_DOCUMENT_BINDING');
  currentHashes.push(...[meta.bootstrapHash,meta.initialHumanHash,meta.initialAgentHash,meta.humanHash,meta.agentHash,...meta.retiredHashes]);
  return {ownerId:p.ownerId,workspaceId:p.workspaceId,generation:meta.generation,revoked:meta.revoked};
 });
 const decodeEnvelope=(raw,code)=>{check(typeof raw==='string',code);const envelope=JSON.parse(raw);check(envelope?.version===1&&typeof envelope.revision==='string'&&Object.keys(envelope).sort().join(',')==='revision,state,version'&&envelope.state?.version===1,code);return envelope.state;};
 const state=decodeEnvelope(values[4],'BASELINE_MARKET_ENVELOPE'),reviewState=decodeEnvelope(values[5],'BASELINE_REVIEW_ENVELOPE');
 check(Array.isArray(state.orders)&&state.orders.length===2&&Array.isArray(state.services)&&state.services.length===1,'BASELINE_MARKET_COUNTS');same(state.orders.map(v=>v.operationId).toSorted(),draft.payloads.priorOperationIds.toSorted(),'BASELINE_ORDER_IDS');
 check(packet.sale?.planId===old.planId&&Array.isArray(packet.sale.orders)&&packet.sale.orders.length===2,'BASELINE_PRIVATE_SALE_BINDING');
 const orders=state.orders.map(order=>{
  const prior=packet.sale.orders.find(v=>v.operationId===order.operationId),receipt=oldReceipt.orders.find(v=>v.operationId===order.operationId);
  check(prior?.original&&receipt,'BASELINE_RETAINED_ORDER_MISSING');same(order,prior.original,'BASELINE_ORDER_CHANGED');same(hash(order),receipt.fullRecordHash,'BASELINE_RETAINED_RECORD_HASH');
  same(order.transactionHash,receipt.transactionHash,'BASELINE_TRANSACTION_CHANGED');same(order.phase,receipt.phase,'BASELINE_PHASE_CHANGED');
  same(order.buyerOwnerId,draft.participants[1].ownerId,'BASELINE_ORDER_OWNER_BINDING');same(order.sellerOwnerId,draft.participants[0].ownerId,'BASELINE_ORDER_OWNER_BINDING');
  return {operationId:order.operationId,phase:order.phase,transactionHash:order.transactionHash,recordSHA256:hash(order)};
 });
 const service=state.services[0];same(service.card?.id,old.payloads.serviceId,'BASELINE_SERVICE_BINDING');same(service.submissionId,old.payloads.submissionId,'BASELINE_SERVICE_BINDING');same(service.ownerId,draft.participants[0].ownerId,'BASELINE_SERVICE_OWNER');same(service.withdrawn,false,'BASELINE_SERVICE_WITHDRAWN');same(service.cardHash,old.payloads.cardHash,'BASELINE_SERVICE_CARD');same(service.card,old.payloads.card,'BASELINE_SERVICE_CARD');
 check(Array.isArray(reviewState.records)&&reviewState.records.length===1,'BASELINE_REVIEW_COUNT');const submission=reviewState.records[0]?.submission;same(submission?.submissionId,service.submissionId,'BASELINE_REVIEW_BINDING');same(submission.status,'activated','BASELINE_REVIEW_STATUS');same(submission.publiclyActive,true,'BASELINE_REVIEW_STATUS');same(submission.card,service.card,'BASELINE_REVIEW_CARD');
 check(typeof values[6]==='string','BASELINE_CATALOG_CARD_MISSING');const catalog=JSON.parse(values[6]);same(catalog.id,service.card.id,'BASELINE_CATALOG_BINDING');same(catalog.hash,service.cardHash,'BASELINE_CATALOG_BINDING');same(catalog.card,service.card,'BASELINE_CATALOG_BINDING');check(catalog.withdrawn!==true,'BASELINE_CATALOG_WITHDRAWN');
 same(values[7],null,'BASELINE_SETTLEMENT_ALREADY_EXISTS');same(values[8],null,'BASELINE_X402_CARD_ALREADY_EXISTS');
 const storage={workspace:0,market:0,review:0,catalog:Buffer.byteLength(indexKey)+members.reduce((n,v)=>n+Buffer.byteLength(v),0),settlement:0};
 const records=keys.map((key,i)=>{const value=values[i],partition=key.startsWith(prefix+':')?'workspace':key.startsWith(review+':')?'review':key.startsWith(market+':catalog:')?'catalog':key.includes(':x402-settlements:')?'settlement':'market';if(value!==null)storage[partition]+=Buffer.byteLength(key)+Buffer.byteLength(value);return {key,partition,present:value!==null,bytes:value===null?0:Buffer.byteLength(key)+Buffer.byteLength(value),valueSHA256:value===null?null:hash(value)};});
 for(const [partition,count]of Object.entries(storage))check(count<=draft.storageAllocation[partition],'BASELINE_STORAGE_EXCEEDED');
 const accessHashes=[...new Set(currentHashes)].sort();check(!accessHashes.includes(hash('q'.repeat(43))),'BASELINE_THIRD_PARTY_ACCESS');
 return {owners,orders,paused:state.paused===true,initialServices:[{serviceId:old.payloads.serviceId,ownerId:service.ownerId,status:submission.status,withdrawn:false}],registrySHA256:hash(values[0]),accessHashes,records,catalogMembers:members,storage,storedBytes:Object.values(storage).reduce((n,v)=>n+v,0)};
}
async function main(){
 assertFrozenBaselineInputs();
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',flush:true});
 reportCreated=true;
 assert.match(prefix,/^bazaar-workspace:pilot-[a-f0-9]{32}$/);assert.equal(market,'bazaar-market:'+tag);assert.equal(review,'bazaar-review:'+tag);
 const connection=JSON.parse(await readFile(join(tmpdir(),'bazaar-native-network-private-289ed243-6571-44fa-a183-335dbca63c25','connection.private.json'),'utf8'));
 assert.equal(connection.BAZAAR_ISOLATED_REDIS_REST_URL,policy.origin);const token=connection.BAZAAR_ISOLATED_REDIS_REST_TOKEN;assert.ok(typeof token==='string'&&token.length>0&&token.length<=8192&&!/[\r\n\0]/.test(token));
 const lock=await acquireX402RunLock(packetDirectory,draft.planId,{readRecovery:true});
 let previousLock;
 try{
  previousLock=await acquireSaleEffectLock(packetDirectory,old.planId);
  const packet=await loadPacket(),historicalSaleHash=hash(packet.sale),historicalX402Hash=hash(packet.x402??null);assert.equal(packet.x402Baseline,undefined,'BASELINE_ALREADY_CAPTURED');assert.equal(packet.x402BaselineRawCapture,undefined,'BASELINE_RAW_ALREADY_CAPTURED');
  const persistPrivate=async()=>{assert.equal(hash(packet.sale),historicalSaleHash,'BASELINE_HISTORICAL_SALE_CHANGED');assert.equal(hash(packet.x402??null),historicalX402Hash,'BASELINE_X402_CONTEXT_CHANGED');await savePacket(packet);};
  const body=JSON.stringify(policy.commands),headers=new Headers({authorization:'Bearer '+token,'content-type':'application/json'});
  const outgoing=Buffer.byteLength(body)+Array.from(headers).reduce((n,[k,v])=>n+Buffer.byteLength(k+': '+v+'\r\n'),Buffer.byteLength('POST /pipeline\r\nhost: '+new URL(policy.origin).host+'\r\n\r\n'));
  assert.ok(outgoing<=policy.maxOutBytes);report.counters={apiRequests:1,redisRestExchanges:1,redisCommandsUpperBound:2,outboundPayloadBytes:outgoing,inboundPayloadBytes:policy.maxInBytes};
  const attempt={status:'PENDING',origin:policy.origin,path:policy.path,method:'POST'};report.attempts.push(attempt);await persist();
  let observed=0,failureCode='BASELINE_TRANSPORT_FAILED';
  try{
   const response=await fetch(policy.origin+policy.path,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(policy.timeoutMs)});
   observed=Array.from(response.headers).reduce((n,[k,v])=>n+Buffer.byteLength(`${k}: ${v}\r\n`),Buffer.byteLength(`HTTP/1.1 ${response.status} ${response.statusText}\r\n\r\n`));if(observed>policy.maxInBytes){await response.body?.cancel().catch(()=>{});throw Error('BASELINE_RESPONSE_HEADERS_EXCEEDED');}
   const chunks=[],reader=response.body?.getReader();if(reader)for(;;){const n=await reader.read();if(n.done)break;observed+=n.value.byteLength;if(observed>policy.maxInBytes){await reader.cancel();throw Error('BOUND');}chunks.push(Buffer.from(n.value));}
   const bytes=Buffer.concat(chunks);attempt.httpStatus=response.status;attempt.responseSHA256=hash(bytes.toString('utf8'));attempt.inBytes=observed;report.counters.inboundPayloadBytes=observed;
   attempt.status=response.ok?'CONFIRMED':'REJECTED';await persist();
   failureCode='BASELINE_PRIVATE_RAW_CAPTURE_FAILED';packet.x402BaselineRawCapture={planId:draft.planId,policySHA256:report.policySHA256,responseSHA256:attempt.responseSHA256,httpStatus:response.status,responseHeaders:Array.from(response.headers),responseUtf8:bytes.toString('utf8'),capturedAt:new Date().toISOString(),validated:false};await persistPrivate();report.privateRawCaptureSaved=true;await persist();
   if(!response.ok){failureCode='BASELINE_HTTP_REJECTED';throw Error(failureCode);}
   failureCode='BASELINE_RESULT_PARSE_FAILED';const results=JSON.parse(bytes.toString('utf8'));failureCode='BASELINE_VALIDATION_FAILED';report.baseline=validateX402ExistingBaseline(results,packet);
   const values=results[0].result,members=results[1].result;
   report.completedAt=new Date().toISOString();
   packet.x402Baseline={planId:draft.planId,baselineSHA256:hash(report.baseline),registryRaw:values[0],values:Object.fromEntries(keys.map((key,i)=>[key,values[i]])),members,capturedAt:report.completedAt};
   failureCode='BASELINE_PRIVATE_SAVE_FAILED';packet.x402BaselineRawCapture.validated=true;await persistPrivate();report.status='PASS_REAL_EXISTING_BASELINE';await persist();
   console.log(JSON.stringify({status:report.status,owners:report.baseline.owners,orders:report.baseline.orders,storage:report.baseline.storage,counters:report.counters,payments:0,mutations:0}));
  }catch(error){if(attempt.status==='PENDING'){attempt.status='UNCERTAIN';attempt.partialResponseBytes=observed;report.counters.inboundPayloadBytes=Math.max(policy.maxInBytes,observed);}report.status='BASELINE_STOPPED_NO_RETRY';report.failureCode=/^BASELINE_[A-Z_]+$/.test(error.message)?error.message:failureCode;await persist();throw Error('BASELINE_STOPPED');}
 }finally{const method=preserveBaselineLocks(report)?'preserve':'release';try{if(previousLock)await previousLock[method]();}finally{await lock[method]();}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(async error=>{if(reportCreated){report.status='BASELINE_STOPPED_NO_RETRY';report.failureCode??=/^BASELINE_[A-Z_]+$/.test(error.message)?error.message:'BASELINE_PREFLIGHT_OR_PRIVATE_ACCESS_FAILED';await persist();}console.error(JSON.stringify({status:'BASELINE_STOPPED_NO_RETRY',failureCode:report.failureCode??'BASELINE_OUTPUT_OR_FROZEN_INPUTS_FAILED'}));process.exitCode=1;});
