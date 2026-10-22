// Pure offline sizing. Never receives credentials, fetches, or writes Redis.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sellerCanonical} from '../examples/seller-service-card.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex'),bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v),'utf8');
const id=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
const CAPS={registry:1048576,owner:131072,market:524288,settlement:131072,review:1048576,capacity:65536,storage:2000000,budget:65536,permission:4096,workerRecord:65536,catalog:16384,index:131072};
const clone=v=>structuredClone(v);

function fitRepeated(value,arrayName,make,maximum){
 for(let n=1;n<=20000;n++){const next=make(n);value[arrayName].push(next);if(bytes(value)>maximum){value[arrayName].pop();break;}}
 assert.ok(bytes(value)<=maximum);return value;
}
function parse(raw){try{return JSON.parse(raw);}catch{return undefined;}}
function role(raw){
 const value=parse(raw);if(!value||typeof value!=='object')return undefined;
 if(value.version===1&&Array.isArray(value.workspaces))return 'registry';
 if(value.version===1&&typeof value.ownerId==='string'&&Array.isArray(value.conversations))return 'owner';
 if(value.version===1&&value.state?.version===1&&Array.isArray(value.state.orders))return 'market';
 if(value.version===1&&value.state?.version===1&&Array.isArray(value.state.records))return value.state.records.some(r=>r.submission)?'review':'settlement';
 if(value.version===1&&value.initialized===true&&typeof value.scope==='string'&&value.entries&&!Array.isArray(value.entries))return 'storage';
 if(value.version===2&&Array.isArray(value.buckets)&&Array.isArray(value.held))return 'budget';
 if(value.version===1&&Array.isArray(value.entries))return 'capacity';
 if(value.version===1&&typeof value.allowServiceSubmission==='boolean')return 'permission';
 if(value.v===1&&typeof value.ciphertext==='string')return 'workerRecord';
 if(value.card&&value.hash&&value.id)return 'catalog';
 return undefined;
}
function roleForKey(key){
 if(/:registry$/.test(key))return 'registry';if(/:owner:/.test(key))return 'owner';
 if(/:x402-settlements:state$/.test(key))return 'settlement';if(/^bazaar-review:.*:state$/.test(key))return 'review';
 if(/^bazaar-market:.*:state$/.test(key))return 'market';if(/:capacity-reservations:v1$/.test(key))return 'capacity';
 if(/:continuous-free-storage:v1$/.test(key))return 'storage';if(/:free-demo-budget:/.test(key))return 'budget';
 if(/:market-permissions:/.test(key))return 'permission';if(/^bazaar-seller:.*:data:/.test(key))return 'workerRecord';
 if(/:catalog:card:/.test(key))return 'catalog';if(/:catalog:index$/.test(key))return 'index';return undefined;
}
function firstRaw(trace,wanted){
 for(let i=trace.length-1;i>=0;i--){const row=trace[i],found=[];const walk=value=>{if(typeof value==='string'&&role(value)===wanted)found.push(value);else if(Array.isArray(value))value.forEach(walk);};walk(row.response.result);if(found.length)return found[0];}
 throw Error('REPRESENTATIVE_NATIVE_'+wanted.toUpperCase()+'_SNAPSHOT_REQUIRED');
}
async function wideWorkspace(registryRaw,ownerRaw){
 const {createRedisWorkspaceStore}=await import('../lib/workspace-store.ts');
 const registry=clone(parse(registryRaw)),owner=clone(parse(ownerRaw)),meta=registry.workspaces.find(m=>m.ownerId===owner.ownerId);assert.ok(meta);
 // Native message limits and digests are retained; quote-heavy content proves
 // the second JSON escaping layer rather than padding invalid envelopes.
 owner.conversations=[];owner.tasks=[];owner.operations=[];owner.events=[];owner.queries=[];owner.replayMarkers=[];
 const conversation={digest:'',record:{conversationId:'offline-conversation',title:'"'.repeat(160),createdAt:meta.createdAt,messages:[]}};
 conversation.digest=sha(sellerCanonical({conversationId:conversation.record.conversationId,title:conversation.record.title}));owner.conversations.push(conversation);
 const pair=(n,text)=>{const message={messageId:'offline-message-'+n,conversationId:conversation.record.conversationId,taskId:'offline-task-'+n,actor:'human',text,recordedAt:meta.createdAt},task={digest:sha(sellerCanonical({conversationId:message.conversationId,messageId:message.messageId,taskId:message.taskId,text})),record:{taskId:message.taskId,conversationId:message.conversationId,humanMessageId:message.messageId,text,status:'pending',createdAt:meta.createdAt}};return {message,task};};
 for(let n=1;n<500;n++){const value=pair(n,'"'.repeat(2000));conversation.record.messages.push(value.message);owner.tasks.push(value.task);if(bytes(owner)>CAPS.owner){conversation.record.messages.pop();owner.tasks.pop();break;}}
 const spare=CAPS.owner-bytes(owner);if(spare>800){const tail=pair('tail','x');conversation.record.messages.push(tail.message);owner.tasks.push(tail.task);const left=CAPS.owner-bytes(owner),text='x'.repeat(Math.min(2000,Math.max(1,Math.floor(left/2)+1)));tail.message.text=text;tail.task.record.text=text;tail.task.digest=sha(sellerCanonical({conversationId:tail.message.conversationId,messageId:tail.message.messageId,taskId:tail.message.taskId,text}));}
 assert.ok(bytes(owner)<=CAPS.owner);meta.documentBytes=bytes(owner);meta.documentRevision=owner.revision;
 // Every synthetic workspace has distinct valid identities and credentials.
 const template=clone(registry.workspaces.find(m=>m.ownerId!==owner.ownerId)??meta);
 const old=registry.workspaces.length;for(let n=1;n<2500;n++){
  const other={...clone(template),creationId:id(10000+n),workspaceId:id(20000+n),ownerId:'ow_'+sha('offline-owner:'+n).slice(0,32),agentId:'agent_'+sha('offline-agent:'+n).slice(0,32),bootstrapHash:sha('offline-bootstrap:'+n),initialHumanHash:sha('offline-human:'+n),humanHash:sha('offline-human:'+n),initialAgentHash:sha('offline-agent-access:'+n),agentHash:sha('offline-agent-access:'+n),retiredHashes:[],accessIntents:[],generation:1,revoked:false,documentBytes:250,nextContentExpiryAt:null};delete other.wallet;delete other.walletChallenge;
  registry.workspaces.push(other);if(bytes(registry)>CAPS.registry){registry.workspaces.pop();break;}
 }
 assert.ok(registry.workspaces.length>old);const selected=registry.workspaces.at(-1);
 for(let n=1;n<=4094;n++){const retired=selected.humanHash,next=sha('offline-rotated:'+n);selected.retiredHashes.push(retired);selected.accessIntents.push({expectedGeneration:selected.generation,digest:sha('offline-intent:'+n),generation:selected.generation+1,revoked:false});selected.generation++;selected.humanHash=next;if(bytes(registry)>CAPS.registry){selected.humanHash=retired;selected.generation--;selected.retiredHashes.pop();selected.accessIntents.pop();break;}}
 // A native read validates full registry/document semantics without Lua or IO.
 let calls=0;const local={eval:async(_script,keys)=>{calls++;return keys.length===4?[JSON.stringify(registry),JSON.stringify(owner),'workspace-v1','']:[JSON.stringify(registry),JSON.stringify(owner),'workspace-v1'];}};
 const store=createRedisWorkspaceStore(local,'bazaar-workspace:local-test',()=>({ownerIds:[],hashes:[]}));await store.queries(owner.ownerId);
 assert.ok(calls>0);return {registry:JSON.stringify(registry),owner:JSON.stringify(owner)};
}
function wideMarket(raw,validate,orderMemo){
 const envelope=clone(parse(raw)),base=envelope.state.orders.find(o=>o.phase==='delivered');assert.ok(base);
 envelope.state.orders=[];envelope.state.archived=[];envelope.state.fileCleanup=[];
 fitRepeated(envelope.state,'orders',n=>{const order=clone(base);order.operationId=id(30000+n);order.memoHash=orderMemo(order.buyerOwnerId,order.operationId,order.cardHash,order.input);order.failure='"'.repeat(2000);order.executionUncertainty='"'.repeat(2000);order.delivery.text='"'.repeat(2000);order.delivery.sha256=sha(order.delivery.text);order.delivery.reference='bazaar-order:'+order.operationId;if(order.textWake)order.textWake.wakeId=id(40000+n);return order;},CAPS.market-bytes({...envelope,state:{version:1}})+bytes({version:1}));
 while(bytes(envelope)>CAPS.market)envelope.state.orders.pop();validate(envelope.state);return JSON.stringify(envelope);
}
function wideSettlement(raw,validate){
 const envelope=clone(parse(raw)),base=envelope.state.records.at(-1);assert.ok(base);envelope.state.records=[];
 fitRepeated(envelope.state,'records',n=>{const record=clone(base);record.operationId=id(50000+n);if(record.authorizationFingerprint)record.authorizationFingerprint=sha('offline-auth:'+n);return record;},CAPS.settlement-bytes({...envelope,state:{version:1}})+bytes({version:1}));
 while(bytes(envelope)>CAPS.settlement)envelope.state.records.pop();validate(envelope.state);return JSON.stringify(envelope);
}
function wideReview(raw,validate,cardHash,validateCardRules){
 const envelope=clone(parse(raw)),base=envelope.state.records[0];assert.ok(base);envelope.state.records=[];
 fitRepeated(envelope.state,'records',n=>{const record=clone(base),s=record.submission;s.submissionId=id(60000+n);s.card.id='offline-wire-'+n;const hash=cardHash(s.card);s.control.challengeId=id(70000+n);s.control.evidence.cardHash=hash;s.review.reasons=['"'.repeat(500)];if(s.activation){s.activation.intentId=id(80000+n);s.activation.cardHash=hash;s.activation.entryHash=hash;}s.conformance=validateCardRules(s.card).outcomes;record.digest=sha(sellerCanonical({card:s.card,control:{method:s.control.method,domain:s.control.domain}}));record.tokenHash=sha('offline-review:'+n);return record;},CAPS.review-bytes({...envelope,state:{version:1}})+bytes({version:1}));
 while(bytes(envelope)>CAPS.review)envelope.state.records.pop();validate(envelope.state);return JSON.stringify(envelope);
}
/** Replay is in-memory and gives both concrete native-validated widest cases
 * and a conservative bound for every serialized known-state position. It does
 * not claim all cap combinations can coexist or execute another operation. */
export async function replayNativeTraceAtMaximumSnapshots(trace){
 if(!Array.isArray(trace)||!trace.length||trace.length>2000)throw Error('BOUNDED_NATIVE_TRACE_REQUIRED');
 const market=await import('../lib/marketplace-store.ts'),settlement=await import('../lib/marketplace-x402-store.ts'),review=await import('../lib/provider-self-listing.ts'),identity=await import('../lib/marketplace-identity.ts'),cards=await import('../lib/canonical-service-card.ts'),ingest=await import('../lib/service-ingest.ts');
 const workspace=await wideWorkspace(firstRaw(trace,'registry'),firstRaw(trace,'owner'));
 const cases={...workspace,market:wideMarket(firstRaw(trace,'market'),market.validateMarketState,identity.orderMemo),settlement:wideSettlement(firstRaw(trace,'settlement'),settlement.validateMarketX402State),review:wideReview(firstRaw(trace,'review'),review.validateReviewState,cards.computeCanonicalServiceCardHash,ingest.validateCardRules)};
 const evidence=Object.fromEntries(Object.entries(cases).map(([name,raw])=>[name,{validatedByNativeStore:true,rawBytes:bytes(raw),maximumRawBytes:CAPS[name],outerJsonStringBytes:bytes(JSON.stringify(raw)),utilization:Math.floor(bytes(raw)*10000/CAPS[name])/100}]));
 const stages={},unknown={},classified={};
 for(const row of trace){
  if(!row||!Array.isArray(row.command)||typeof row.stage!=='string')throw Error('NATIVE_TRACE_SHAPE_REQUIRED');
  const command=clone(row.command),response=clone(row.response),name=String(command[0]).toUpperCase(),keys=name==='EVAL'?command.slice(3,3+Number(command[2])):[command[1]];
  let outboundExtra=0,inboundExtra=0;
  const encodedResponse=row.responseEncoding==='base64',encodeResult=value=>typeof value==='string'?value==='OK'?value:Buffer.from(value).toString('base64'):Array.isArray(value)?value.map(encodeResult):value;
  function expand(value,direction){
   if(typeof value==='string'){const detected=role(value);if(!detected)return value;classified[detected]=(classified[detected]??0)+1;const max=CAPS[detected],actual=bytes(JSON.stringify(value));
    // JSON serializing a string adds at most one extra byte per source byte
    // plus its quotes; cap*2+2 also covers valid quote/backslash heavy values.
    const maximum=direction==='response'&&encodedResponse?4*Math.ceil(max/3)+2:2*max+2,current=direction==='response'&&encodedResponse?bytes(JSON.stringify(encodeResult(value))):actual,extra=Math.max(0,maximum-current);if(direction==='request')outboundExtra+=extra;else inboundExtra+=extra;return cases[detected]??value;
   }
   if(Array.isArray(value))return value.map(v=>expand(v,direction));return value;
  }
  if(name==='EVAL'){for(let at=3+Number(command[2]);at<command.length;at++)command[at]=expand(command[at],'request');}
  else if(name==='SET')command[2]=expand(command[2],'request');
  response.result=expand(response.result,'response');
  // Empty GET states are charged their key-specific cap as well; a newly
  // absent ledger is not incorrectly counted as permanently zero bytes.
  const encodedMaximum=cap=>encodedResponse?4*Math.ceil(cap/3)+2:2*cap+2;
  if(name==='GET'&&row.response.result===null){const detected=roleForKey(keys[0]);if(detected){inboundExtra+=encodedMaximum(CAPS[detected]);classified[detected]=(classified[detected]??0)+1;}}
  if(name==='GET'&&row.response.result!==null&&!role(row.response.result)&&typeof row.response.result==='string'){const detected=roleForKey(keys[0]);if(detected){inboundExtra+=Math.max(0,encodedMaximum(CAPS[detected])-bytes(JSON.stringify(encodedResponse?encodeResult(row.response.result):row.response.result)));classified[detected]=(classified[detected]??0)+1;}else unknown[keys[0].replace(/pilot-[a-f0-9]{32}/g,'pilot-isolated')]=(unknown[keys[0].replace(/pilot-[a-f0-9]{32}/g,'pilot-isolated')]??0)+1;}
  if(encodedResponse)response.result=encodeResult(response.result);
  const metric=stages[row.stage]??(stages[row.stage]={restRequests:0,evalCommands:0,actualRequestBodyBytes:0,actualResponseBodyBytes:0,representativeRequestBodyBytes:0,representativeResponseBodyBytes:0,conservativeRequestBodyBytes:0,conservativeResponseBodyBytes:0,maximumRequestBodyBytes:0,maximumResponseBodyBytes:0,maximumCombinedBodyBytes:0});
  const out=row.requestBytes+outboundExtra,inc=row.responseBytes+inboundExtra;
  metric.restRequests++;if(name==='EVAL')metric.evalCommands++;metric.actualRequestBodyBytes+=row.requestBytes;metric.actualResponseBodyBytes+=row.responseBytes;metric.representativeRequestBodyBytes+=bytes(command);metric.representativeResponseBodyBytes+=bytes(response);metric.conservativeRequestBodyBytes+=out;metric.conservativeResponseBodyBytes+=inc;metric.maximumRequestBodyBytes=Math.max(metric.maximumRequestBodyBytes,out);metric.maximumResponseBodyBytes=Math.max(metric.maximumResponseBodyBytes,inc);metric.maximumCombinedBodyBytes=Math.max(metric.maximumCombinedBodyBytes,out+inc);
 }
 const total=Object.values(stages).reduce((out,value)=>{for(const [key,count]of Object.entries(value))out[key]=key.startsWith('maximum')?Math.max(out[key]??0,count):(out[key]??0)+count;return out;},{});
 return {version:1,status:'PASS_OFFLINE_NATIVE_SNAPSHOT_WIRE_REPLAY',snapshots:evidence,stages,total,classifiedStringPositions:classified,unclassifiedGetCount:Object.values(unknown).reduce((n,v)=>n+v,0),networkRequests:0,redisWrites:0,financialExecutions:0,limitations:['Representative snapshots pass native semantic validators and retain JSON escape layers. Snapshot cap combinations are conservative sizing, not a claim that every maximum can coexist.','Conservative bytes use two outer JSON bytes per snapshot source byte plus quotes, including CAS old/new strings. This is an upper bound on known serialized state positions, not Redis billing or HTTP/TLS overhead.','Native trace request counts do not cover unexercised branches; additional request caps and bounded recovery attempts must be reserved separately.']};
}
