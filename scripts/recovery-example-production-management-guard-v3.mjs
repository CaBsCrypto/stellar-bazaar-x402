// Import-safe private-controller building block. There is deliberately no
// default fetch, token input, CLI, environment mutation or ledger connection.
// It does not prove approval or integrate itself into a production controller.
import {createHash} from 'node:crypto';
import {CONTINUOUS_FREE_BUDGET_LUA} from '../lib/continuous-free-budget.ts';
import {validateSellerConfiguration} from '../.vercel/recovery-example-provider-v5-source/seller/seller-mcp-transport.mjs';
import {sellerCanonical} from '../.vercel/recovery-example-provider-v5-source/seller/seller-service-card.mjs';
const MiB=1048576,hash=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=code=>{throw Error(code);};
export const V3_TEMPLATE_PINS=Object.freeze({team:'team_XjolcoWJ9V9yamVnCdpC7EMY',bazaarProject:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',providerProject:'prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K',nativeSource:'255443a679645418603f7b46a7aab82436a8014e55445f9b7d244e20dbbcfa08',providerSource:'f87082dbb24b0f420cfecfc855b9a77c5995332623c5c9692d711eff30bdeee2',cardHash:'c96bdee6b8a9bdeba35b4e723f5aea79a62b579d488cb70aa6ab2e939d2b45e1',providerOrigin:'https://ai-video-scriptwriter-example.vercel.app',bazaarOrigin:'https://bazaar.browns.studio'});
const templateKinds={
 'provider-control-record':{projectId:V3_TEMPLATE_PINS.providerProject,key:'BAZAAR_EXAMPLE_CONTROL_RECORD',sourceDigest:V3_TEMPLATE_PINS.providerSource,secretRoles:[]},
 'provider-worker-config':{projectId:V3_TEMPLATE_PINS.providerProject,key:'BAZAAR_HOSTED_SELLER_CONFIG',sourceDigest:V3_TEMPLATE_PINS.providerSource,secretRoles:['agent','provider']},
 'provider-worker-binding':{projectId:V3_TEMPLATE_PINS.providerProject,key:'BAZAAR_HOSTED_SELLER_BINDING_HASH',sourceDigest:V3_TEMPLATE_PINS.providerSource,secretRoles:[]},
 'bazaar-example-binding':{projectId:V3_TEMPLATE_PINS.bazaarProject,key:'BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON',sourceDigest:V3_TEMPLATE_PINS.nativeSource,secretRoles:['wake']},
};
export function validateV3Template(value){
 const expected=templateKinds[value?.kind];if(!expected||!value||Object.keys(value).sort().join(',')!=='id,key,kind,projectId,secretReferenceHashes,sourceDigest'||!/^[a-z][a-z0-9-]{0,79}$/.test(value.id)||value.projectId!==expected.projectId||value.key!==expected.key||value.sourceDigest!==expected.sourceDigest||!value.secretReferenceHashes||Object.keys(value.secretReferenceHashes).sort().join(',')!==[...expected.secretRoles].sort().join(',')||Object.values(value.secretReferenceHashes).some(v=>!digest(v)))fail('MANAGEMENT_EXACT_DERIVED_TEMPLATE_REQUIRED');
 return Object.freeze({...structuredClone(value),url:'https://api.vercel.com/v10/projects/'+expected.projectId+'/env?teamId='+V3_TEMPLATE_PINS.team});
}
function validateV3NativeBinding(value){
 if(!value||Object.keys(value).sort().join(',')!=='agentFingerprint,controlRecordFingerprint,nativeSourceDigest,ownerFingerprint,providerSourceDigest'||value.nativeSourceDigest!==V3_TEMPLATE_PINS.nativeSource||value.providerSourceDigest!==V3_TEMPLATE_PINS.providerSource||![value.ownerFingerprint,value.agentFingerprint,value.controlRecordFingerprint].every(digest))fail('MANAGEMENT_NATIVE_OUTPUT_BINDING_REQUIRED');return Object.freeze({...value});
}
function validateV3DerivedValue(template,value,binding,workerBinding){
 if(typeof value!=='string'||Buffer.byteLength(value)>32768)fail('MANAGEMENT_EXACT_PRIVATE_DERIVED_VALUE_REQUIRED');
 if(template.kind==='provider-control-record'){if(!/^stellar-bazaar-verification=[A-Za-z0-9_-]{24}$/.test(value)||hash(value)!==binding.controlRecordFingerprint)fail('MANAGEMENT_NATIVE_CONTROL_CHANGED');return {};}
 if(template.kind==='provider-worker-binding'){if(!digest(value)||!workerBinding||value!==workerBinding)fail('MANAGEMENT_NATIVE_WORKER_BINDING_CHANGED');return {};}
 let input;try{input=JSON.parse(value);}catch{fail('MANAGEMENT_EXACT_PRIVATE_DERIVED_VALUE_REQUIRED');}
 if(template.kind==='bazaar-example-binding'){
  if(!input||Object.keys(input).sort().join(',')!=='cardHash,ownerFingerprint,serviceId,token,url'||input.serviceId!=='bazaar-recovery-example-text-v1'||input.cardHash!==V3_TEMPLATE_PINS.cardHash||input.ownerFingerprint!==binding.ownerFingerprint||input.url!==V3_TEMPLATE_PINS.providerOrigin+'/api/bazaar/example/tick'||!/^[A-Za-z0-9_-]{43}$/.test(input.token??'')||hash(input.token)!==template.secretReferenceHashes.wake)fail('MANAGEMENT_NATIVE_EXAMPLE_BINDING_CHANGED');return {};
 }
 const fields=['agentAccess','agentId','allowedOrigins','bazaarOrigin','card','cardHash','controlProof','ownerId','providerAccess'];if(!input||Object.keys(input).sort().join(',')!==fields.sort().join(','))fail('MANAGEMENT_NATIVE_WORKER_CONFIGURATION_CHANGED');
 try{validateSellerConfiguration(input);}catch{fail('MANAGEMENT_NATIVE_WORKER_CONFIGURATION_CHANGED');}
 if(!/^ow_[a-f0-9]{32}$/.test(input.ownerId??'')||!/^agent_[a-f0-9]{32}$/.test(input.agentId??'')||hash(input.ownerId)!==binding.ownerFingerprint||hash(input.agentId)!==binding.agentFingerprint||input.bazaarOrigin!==V3_TEMPLATE_PINS.bazaarOrigin||input.cardHash!==V3_TEMPLATE_PINS.cardHash||JSON.stringify(input.allowedOrigins)!==JSON.stringify([V3_TEMPLATE_PINS.providerOrigin])||input.controlProof?.method!=='http-well-known'||input.controlProof?.domain!==new URL(V3_TEMPLATE_PINS.providerOrigin).hostname||!['agentAccess','providerAccess'].every(k=>/^[A-Za-z0-9_-]{43}$/.test(input[k]??''))||hash(input.agentAccess)!==template.secretReferenceHashes.agent||hash(input.providerAccess)!==template.secretReferenceHashes.provider)fail('MANAGEMENT_NATIVE_WORKER_CONFIGURATION_CHANGED');
 return {workerBinding:hash(sellerCanonical({bazaarOrigin:input.bazaarOrigin,ownerId:input.ownerId,agentId:input.agentId,cardHash:input.cardHash,allowedOrigins:input.allowedOrigins,agentAccessHash:hash(input.agentAccess),providerAccessHash:hash(input.providerAccess)}))};
}
export const EXAMPLE_MANAGEMENT_CREDIT=Object.freeze({commands:128,transferBytes:16*MiB+262144,guardedCombinedBytes:16*MiB,maximumLedgerGets:4,maximumAdministrativeExchanges:20,maximumAdministrativeOutboundBytes:65536,maximumAdministrativeInboundBytes:262144,maximumCombinedHeadersBytes:8192,maximumLedgerOutboundBytes:4096,maximumLedgerInboundBytes:524546,maximumPrechargeInboundBytes:512});
export const EXAMPLE_NATIVE_SETUP_PRECHARGE_CONTRACT=Object.freeze({commands:173,transferBytes:107479040,groups:10,centralBudgetCommandsPerGroup:4,centralBudgetBytesPerGroup:4096,requiresEachGroupBeforeEffects:true,realIntegration:false});
export const EXAMPLE_NATIVE_SETUP_GROUPS=Object.freeze([
 {name:'create-one-new-seller',commands:31,transferBytes:14942208},{name:'grant-new-seller-publication',commands:17,transferBytes:5505024},{name:'submit-exact-example-service',commands:33,transferBytes:15990784},{name:'verify-public-endpoint-control',commands:16,transferBytes:13893632},{name:'human-review-approve',commands:10,transferBytes:7602176},{name:'stage-approved-submission',commands:10,transferBytes:7602176},{name:'activate-exact-example-service',commands:32,transferBytes:26476544},{name:'initialize-new-worker-ledger',commands:7,transferBytes:1310720},{name:'initialize-new-runtime-ledger',commands:7,transferBytes:1310720},{name:'reserve-native-provider-pool',commands:10,transferBytes:12845056},
].map(value=>Object.freeze(value)));
const nativeBudgetScriptHash=hash(CONTINUOUS_FREE_BUDGET_LUA);
function privateUrl(value,administrative=false){
 let url;try{url=new URL(value);}catch{fail('MANAGEMENT_EXACT_PRIVATE_URL_REQUIRED');}
 if(url.href!==value||url.protocol!=='https:'||url.username||url.password||url.port||url.hash||administrative&&!['https://api.vercel.com','https://api.upstash.com'].includes(url.origin)||!administrative&&!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.upstash\.io$/.test(url.hostname))fail('MANAGEMENT_EXACT_PRIVATE_URL_REQUIRED');
 return url;
}
function packetBody(value){if(value===null||value===undefined)return Buffer.alloc(0);if(typeof value!=='string'&&!(value instanceof Uint8Array))fail('MANAGEMENT_EXACT_BYTE_BODY_REQUIRED');return Buffer.from(value);}
function headerBytes(value){
 const headers=new Headers(value),entries=[...headers];if(entries.length>64)fail('MANAGEMENT_HEADERS_BOUND');
 // Application header framing only. Hidden platform/TLS/network framing is
 // not measurable here and is never presented as an Upstash invoice.
 return {headers,bytes:entries.reduce((n,[name,value])=>n+Buffer.byteLength(name)+Buffer.byteLength(value)+4,2)};
}
function validLedgerKey(key){return typeof key==='string'&&Buffer.byteLength(key)<=512&&/^bazaar-workspace:(pilot-[a-f0-9]{32}):\{\1\}:continuous-free-budget:v1$/.test(key);}
function adminDescriptor(value){
 if(!value||Object.keys(value).sort().join(',')!=='bodySha256,id,method,url'||!/^[a-z][a-z0-9-]{0,79}$/.test(value.id)||!['GET','POST','PATCH','PUT'].includes(value.method)||value.bodySha256!==null&&!digest(value.bodySha256))fail('MANAGEMENT_EXACT_ADMIN_DESCRIPTOR_REQUIRED');
 privateUrl(value.url,true);if(value.method==='GET'&&value.bodySha256!==null)fail('MANAGEMENT_ADMIN_GET_BODY_FORBIDDEN');
 return Object.freeze({...value});
}
function snapshot(state){return Object.freeze({administrativeExchanges:state.admin,ledgerGets:state.gets,prechargeRequests:state.debit,requests:state.requests,redisCommandsUpper:state.commands,combinedReservedApplicationBytes:state.reserved,observedOutboundApplicationBytes:state.outbound,observedInboundApplicationBytes:state.inbound,observedApplicationHeaderBytes:state.headers,uncertain:state.uncertain,creditConfirmed:state.confirmed,guardActive:!state.closed,rawKeysReturned:0,secretValuesReturned:0,controllerIntegration:false,physicalBillingProven:false});}
/** Descriptors and hashes come from a reviewed private plan, never MCP input.
 * An injected transport receives a prepared packet with redirects forbidden.
 * A failed/uncertain exchange retains its complete preflight reservation.
 */
export function createExampleProductionManagementGuardV3({redisOrigin,knownLedgerKeySha256,administrativeDescriptors,prechargeConfigurationSha256,reviewedTemplates=[]}){
 const redis=privateUrl(redisOrigin);if(redis.pathname!=='/'||redis.search||!Array.isArray(knownLedgerKeySha256)||knownLedgerKeySha256.length<1||knownLedgerKeySha256.length>4||knownLedgerKeySha256.some(value=>!digest(value))||new Set(knownLedgerKeySha256).size!==knownLedgerKeySha256.length||!Array.isArray(administrativeDescriptors)||administrativeDescriptors.length>20||!digest(prechargeConfigurationSha256))fail('MANAGEMENT_EXACT_PRIVATE_PLAN_REQUIRED');
 const allowedKeys=new Set(knownLedgerKeySha256),descriptors=new Map(administrativeDescriptors.map(value=>{const row=adminDescriptor(value);return [row.id,row];}));if(descriptors.size!==administrativeDescriptors.length)fail('MANAGEMENT_DUPLICATE_DESCRIPTOR');
 const templateMap=new Map(reviewedTemplates.map(value=>{const template=validateV3Template(value);return [template.id,template];}));if(templateMap.size!==reviewedTemplates.length||descriptors.size+templateMap.size>20||[...templateMap.keys()].some(id=>descriptors.has(id)))fail('MANAGEMENT_TEMPLATE_PLAN_REQUIRED');const preparedPackets=new WeakSet(),verifiedBindings=new WeakSet(),preparedIds=new Set();let preparedWorkerBinding;
 const usedIds=new Set(),state={admin:0,gets:0,debit:0,requests:0,commands:0,reserved:0,outbound:0,inbound:0,headers:0,uncertain:false,confirmed:false,closed:false};
 let running=false;
 async function exchange({role,id,url,method,body,headers,maximumOutbound,maximumInbound,commands},next){
  if(typeof next!=='function')fail('MANAGEMENT_EXPLICIT_INJECTED_TRANSPORT_REQUIRED');if(running||state.closed)fail('MANAGEMENT_GUARD_UNAVAILABLE');
  const data=packetBody(body),h=headerBytes(headers);
  if(data.length>maximumOutbound||h.bytes>EXAMPLE_MANAGEMENT_CREDIT.maximumCombinedHeadersBytes)fail('MANAGEMENT_REQUEST_BOUND');
  if(role==='admin'&&(state.admin>=20||usedIds.has(id))||role==='get'&&state.gets>=4||role==='precharge'&&state.debit!==0)fail('MANAGEMENT_EXCHANGE_COUNT_BOUND');
  const reserved=data.length+maximumInbound+EXAMPLE_MANAGEMENT_CREDIT.maximumCombinedHeadersBytes;
  if(state.reserved+reserved>EXAMPLE_MANAGEMENT_CREDIT.guardedCombinedBytes||state.commands+commands>EXAMPLE_MANAGEMENT_CREDIT.commands)fail('MANAGEMENT_PREFLIGHT_CREDIT_EXHAUSTED');
  // Reserve before the transport; no retries and no release after a failed ACK.
  state.reserved+=reserved;state.commands+=commands;state.requests++;state.outbound+=data.length;if(role==='admin'){state.admin++;usedIds.add(id);}else if(role==='get')state.gets++;else state.debit++;
  running=true;let response,parts=[],inbound=0;
  try{
   response=await next(Object.freeze({url,method,headers:h.headers,body:data.length?data:undefined,redirect:'error',credentials:'omit',cache:'no-store'}));
   if(!(response instanceof Response)||response.status<200||response.status>=300||response.redirected||response.url&&response.url!==url||response.headers.has('location'))fail('MANAGEMENT_RESPONSE_UNCONFIRMED');
   const responseHeaders=headerBytes(response.headers);if(h.bytes+responseHeaders.bytes>8192)fail('MANAGEMENT_HEADERS_BOUND');state.headers+=h.bytes+responseHeaders.bytes;
   const contentLength=response.headers.get('content-length');if(contentLength!==null&&(!/^\d+$/.test(contentLength)||!Number.isSafeInteger(Number(contentLength))||Number(contentLength)>maximumInbound))fail('MANAGEMENT_RESPONSE_BOUND');
   if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')fail('MANAGEMENT_RESPONSE_TYPE_REQUIRED');
   const reader=response.body?.getReader();if(!reader)fail('MANAGEMENT_RESPONSE_BODY_REQUIRED');
   try{for(;;){const row=await reader.read();if(row.done)break;inbound+=row.value.byteLength;if(inbound>maximumInbound){await reader.cancel();fail('MANAGEMENT_RESPONSE_BOUND');}parts.push(Buffer.from(row.value));}}finally{reader.releaseLock();}
   state.inbound+=inbound;return Buffer.concat(parts);
  }catch(error){state.uncertain=true;state.closed=true;await response?.body?.cancel().catch(()=>{});throw error;}
  finally{parts.forEach(value=>value.fill(0));data.fill(0);running=false;}
 }
 return Object.freeze({
  snapshot:()=>snapshot(state),
  verifiedNativeOutputs(value){if(state.closed||!state.confirmed)fail('MANAGEMENT_CONFIRMED_CREDIT_BEFORE_DERIVATION_REQUIRED');const binding=validateV3NativeBinding(value);verifiedBindings.add(binding);return binding;},
  prepareTemplate(id,value,binding,headers={}){
   if(state.closed||!state.confirmed||!verifiedBindings.has(binding))fail('MANAGEMENT_VERIFIED_NATIVE_BINDING_REQUIRED');
   const template=templateMap.get(id);if(!template||preparedIds.has(id))fail('MANAGEMENT_TEMPLATE_BINDING_ONCE_REQUIRED');
   const validated=validateV3DerivedValue(template,value,binding,preparedWorkerBinding),body=JSON.stringify({key:template.key,value,type:'secret',target:['production']});
   if(Buffer.byteLength(body)>65536)fail('MANAGEMENT_TEMPLATE_BODY_BOUND');
   const packet={method:'POST',url:template.url,headers:new Headers(headers),body},descriptor={id,method:'POST',url:template.url,bodySha256:hash(body)},publicBinding={templateId:id,kind:template.kind,key:template.key,projectId:template.projectId,sourceDigest:template.sourceDigest,bodySha256:descriptor.bodySha256,ownerFingerprint:binding.ownerFingerprint,agentFingerprint:binding.agentFingerprint,controlRecordFingerprint:binding.controlRecordFingerprint};
   const prepared=Object.freeze({descriptor:Object.freeze(descriptor),packet:Object.freeze(packet),publicBinding:Object.freeze(publicBinding)});preparedPackets.add(prepared);preparedIds.add(id);if(validated.workerBinding)preparedWorkerBinding=validated.workerBinding;return prepared;
  },
  bindTemplate(prepared,durableReceipt){
   if(state.closed||!state.confirmed||!preparedPackets.has(prepared)||descriptors.has(prepared.descriptor.id)||durableReceipt?.confirmed!==true||durableReceipt.templateId!==prepared.descriptor.id||durableReceipt.bodySha256!==prepared.descriptor.bodySha256||!Number.isSafeInteger(durableReceipt.revision)||durableReceipt.revision<1)fail('MANAGEMENT_DURABLE_TEMPLATE_BINDING_REQUIRED');
   if(hash(prepared.packet.body)!==prepared.descriptor.bodySha256)fail('MANAGEMENT_TEMPLATE_PACKET_CHANGED');
   descriptors.set(prepared.descriptor.id,adminDescriptor(prepared.descriptor));return prepared.packet;
  },
  async administrative(id,{method,url,headers,body=null},next){
   const expected=descriptors.get(id),bytes=packetBody(body);if(!expected||method!==expected.method||url!==expected.url||(bytes.length?hash(bytes):null)!==expected.bodySha256)fail('MANAGEMENT_ADMIN_DESCRIPTOR_MISMATCH');
   if(method!=='GET'&&!state.confirmed)fail('MANAGEMENT_CONFIRMED_CREDIT_BEFORE_MUTATION_REQUIRED');
   // Administrative APIs are not Redis data commands. Their application I/O
   // is nevertheless covered by this conservative private management credit.
   return exchange({role:'admin',id,url,method,headers,body:bytes,maximumOutbound:65536,maximumInbound:262144,commands:0},next);
  },
  async ledgerGet({body,headers},next){
   if(!Array.isArray(body)||body.length!==2||body[0]!=='GET'||!validLedgerKey(body[1])||!allowedKeys.has(hash(body[1])))fail('MANAGEMENT_KNOWN_LEDGER_GET_REQUIRED');
   const raw=await exchange({role:'get',url:redis.origin+'/',method:'POST',headers,body:JSON.stringify(body),maximumOutbound:4096,maximumInbound:524546,commands:1},next);
   try{
    const reply=JSON.parse(raw.toString('utf8'));if(!reply||Object.keys(reply).sort().join(',')!=='result'||reply.result!==null&&typeof reply.result!=='string')fail('MANAGEMENT_LEDGER_RESPONSE_REQUIRED');
    const encoding=new Headers(headers).get('upstash-encoding');if(encoding!==null&&encoding!=='base64')fail('MANAGEMENT_LEDGER_ENCODING_REQUIRED');
    if(typeof reply.result==='string'){
     if(encoding==='base64'&&(!/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(reply.result)||Buffer.from(reply.result,'base64').toString('base64')!==reply.result))fail('MANAGEMENT_LEDGER_ENCODING_REQUIRED');
     const value=Buffer.from(reply.result,encoding==='base64'?'base64':'utf8');try{if(value.length>262144)fail('MANAGEMENT_LEDGER_RAW_BOUND');}finally{value.fill(0);}
    }
    return raw;
   }catch(error){raw.fill(0);state.uncertain=true;state.closed=true;throw error;}
  },
  async precharge({body,headers},next){
   if(!Array.isArray(body)||body.length!==6||body[0]!=='EVAL'||typeof body[1]!=='string'||hash(body[1])!==nativeBudgetScriptHash||body[2]!==1||!validLedgerKey(body[3])||!allowedKeys.has(hash(body[3]))||typeof body[4]!=='string'||Buffer.byteLength(body[4])>512||hash(body[4])!==prechargeConfigurationSha256||typeof body[5]!=='string'||Buffer.byteLength(body[5])>512)fail('MANAGEMENT_EXACT_PRECHARGE_EVAL_REQUIRED');
   let debit;try{debit=JSON.parse(body[5]);}catch{fail('MANAGEMENT_EXACT_PRECHARGE_DEBIT_REQUIRED');}
   if(!debit||Object.keys(debit).sort().join(',')!=='action,commands,profile,transferBytes'||debit.action!=='debit'||debit.profile!=='background'||debit.commands!==128||debit.transferBytes!==EXAMPLE_MANAGEMENT_CREDIT.transferBytes)fail('MANAGEMENT_EXACT_PRECHARGE_DEBIT_REQUIRED');
   const raw=await exchange({role:'precharge',url:redis.origin+'/',method:'POST',headers,body:JSON.stringify(body),maximumOutbound:65536,maximumInbound:512,commands:4},next);
   try{const reply=JSON.parse(raw.toString('utf8'));if(Object.keys(reply).sort().join(',')!=='result'||!Array.isArray(reply.result)||reply.result.length!==4||reply.result[0]!==1||!Number.isSafeInteger(reply.result[1])||reply.result[1]<128||reply.result[2]!=='background'||!Number.isSafeInteger(reply.result[3])||reply.result[3]<0)fail('MANAGEMENT_PRECHARGE_UNCONFIRMED');state.confirmed=true;return snapshot(state);}catch(error){state.uncertain=true;state.closed=true;throw error;}finally{raw.fill(0);}
  },
 });
}
/** Pure contract conversion for a private controller calling background().
 * The real store adds four commands and4096 bytes: subtract them exactly once.
 * This is not a reservation, execution or confirmation of a ledger mutation.
 */
export function nativeSetupPrechargeInput(group){
 const expected=EXAMPLE_NATIVE_SETUP_GROUPS.find(value=>value.name===group?.name);
 if(!group||Object.keys(group).sort().join(',')!=='commands,name,transferBytes'||!expected||group.commands!==expected.commands||group.transferBytes!==expected.transferBytes)fail('EXACT_NATIVE_SETUP_GROUP_REQUIRED');
 return Object.freeze({commands:group.commands-4,transferBytes:group.transferBytes-4096,reason:'guardian',confirmationRequiredBeforeEffects:true,ledgerWrites:0});
}
