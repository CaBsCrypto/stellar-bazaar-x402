import {WorkspaceError} from './workspace-types.ts';
import {textSellerConfiguration} from './market-text-seller-runtime.ts';
import {isPerOrderPaymentEnabled,perOrderPaymentCapabilityKind} from './per-order-payment-profile.ts';
import {configuredMultisellerPolicy,multisellerRuntimeBinding,type SellerIdentity} from './multiseller-pilot.ts';
import {createHash} from 'node:crypto';
import {meteredExternal} from './acceptance-meter.ts';

type Environment=Readonly<Record<string,string|undefined>>;
export const PER_ORDER_PROVIDER_PROTOCOL='bazaar.per-order-provider/v1';
export const PER_ORDER_PROVIDER_URL='https://ai-video-scriptwriter.vercel.app/api/bazaar/seller/tick';
export const PER_ORDER_PROVIDER_BOUNDS=Object.freeze({requestBytes:768,responseBytes:8192,responseHeaderBytes:4096,timeoutMs:45000,retries:0,redirects:0,redisWireBytes:3*1048576,redisCommands:1000});
type Configuration=Readonly<{url:string;token:string;serviceId:string;cardHash:string;ownerFingerprint:string;protection?:string;profile?:'multiseller-v2'}>;
export type PerOrderProviderDispatch={operationId:string;wakeId:string;dispatchAttemptId:string;executionAttemptId:string;mode?:'deliver'|'recover-known-result'};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const original='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
const unavailable=()=>new WorkspaceError('PER_ORDER_PROVIDER_UNAVAILABLE',503,60);
export function readPerOrderProductionProviderConfiguration(environment:Environment=process.env,identity?:SellerIdentity):Configuration|undefined{
 const mode=environment.BAZAAR_PER_ORDER_PROVIDER_PROTOCOL;if(mode===undefined||mode==='disabled')return undefined;
 if(mode!==PER_ORDER_PROVIDER_PROTOCOL||environment.NODE_ENV!=='production'||environment.VERCEL!=='1'||environment.VERCEL_ENV!=='production')throw unavailable();
 const binding=textSellerConfiguration(environment,identity);if(!binding||binding.profile!=='multiseller-v2'&&(binding.url!==PER_ORDER_PROVIDER_URL||binding.protection))throw unavailable();
 return Object.freeze({...binding});
}
function assertOperation(operationId:string){if(operationId===original||!uuid.test(operationId)||!isPerOrderPaymentEnabled(operationId)||perOrderPaymentCapabilityKind(operationId)!=='production')throw unavailable();}
function assertConfiguration(config:Configuration){
 if(config?.profile==='multiseller-v2'){try{const p=configuredMultisellerPolicy(),s=p?.sellers.find(s=>s.serviceId===config.serviceId&&s.cardHash===config.cardHash&&createHash('sha256').update(s.sellerOwnerId).digest('hex')===config.ownerFingerprint),expected=s&&multisellerRuntimeBinding({serviceId:s.serviceId,cardHash:s.cardHash,sellerOwnerId:s.sellerOwnerId});if(!expected||JSON.stringify(Object.entries(config).sort())!==JSON.stringify(Object.entries(expected).sort()))throw Error();return;}catch{throw unavailable();}}
 if(!config||Object.keys(config).sort().join(',')!=='cardHash,ownerFingerprint,serviceId,token,url'||config.url!==PER_ORDER_PROVIDER_URL||!/^[A-Za-z0-9_-]{43}$/.test(config.token)||!/^[a-f0-9]{64}$/.test(config.cardHash)||!/^[a-f0-9]{64}$/.test(config.ownerFingerprint)||!['guionista-bazaar-production-text-v1','guionista-bazaar-pilot-text-funded-v1'].includes(config.serviceId))throw unavailable();}
/** A private, pinned and bounded HTTP client. The optional transport is accepted
 * only by an offline test; it cannot be supplied by a deployed caller. */
export function createPerOrderProductionProvider(config:Configuration,options:{fetcher?:typeof fetch}={}){
 assertConfiguration(config);
 if(Object.keys(options).some(k=>k!=='fetcher')||options.fetcher!==undefined&&(process.env.NODE_ENV!=='test'||process.env.VERCEL!==undefined||typeof options.fetcher!=='function'))throw unavailable();
 const fetcher=options.fetcher??globalThis.fetch,configuration=Object.freeze({...config});
 async function request(operationId:string,body?:PerOrderProviderDispatch){
  assertOperation(operationId);
  const method=body?'POST':'GET',headers:Record<string,string>={authorization:'Bearer '+configuration.token,accept:'application/json',...(configuration.protection?{'x-vercel-protection-bypass':configuration.protection}:{}),'X-Bazaar-Provider-Protocol':PER_ORDER_PROVIDER_PROTOCOL,...(body?{'content-type':'application/json'}:{})};
  const encoded=body?JSON.stringify({protocol:PER_ORDER_PROVIDER_PROTOCOL,mode:body.mode??'deliver',operationId,wakeId:body.wakeId,dispatchAttemptId:body.dispatchAttemptId,executionAttemptId:body.executionAttemptId,budgetProfile:'bazaar-text-redis-wire/v2'}):undefined;
  if(encoded&&Buffer.byteLength(encoded)>PER_ORDER_PROVIDER_BOUNDS.requestBytes)throw unavailable();
  let incoming=0;const outgoing=Buffer.byteLength(encoded??'')+Buffer.byteLength(JSON.stringify(headers));
  return meteredExternal('provider',async()=>{
   // A capability that escaped its request callback cannot initiate HTTP.
   assertOperation(operationId);
   const response=await fetcher(configuration.url,{method,headers,...(encoded?{body:encoded}:{}),redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(body?PER_ORDER_PROVIDER_BOUNDS.timeoutMs:10000)});
   incoming=Buffer.byteLength(JSON.stringify([...response.headers]));
   if(response.status!==200||response.redirected||response.url&&response.url!==configuration.url||response.headers.has('location')||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||incoming>PER_ORDER_PROVIDER_BOUNDS.responseHeaderBytes){await response.body?.cancel().catch(()=>{});throw unavailable();}
   const reader=response.body?.getReader();if(!reader)throw unavailable();const parts:Uint8Array[]=[];
   try{for(;;){const part=await reader.read();if(part.done)break;incoming+=part.value.byteLength;if(incoming>PER_ORDER_PROVIDER_BOUNDS.responseBytes){await reader.cancel();throw unavailable();}parts.push(part.value);}}finally{reader.releaseLock();}
   let result:Record<string,unknown>;try{result=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw unavailable();}
   if(!result||typeof result!=='object'||Array.isArray(result)||result.protocol!==PER_ORDER_PROVIDER_PROTOCOL||result.paymentSubmissions!==0)throw unavailable();
   return result;
  },{origin:new URL(configuration.url).origin,path:new URL(configuration.url).pathname,method},()=>({outboundBytes:outgoing,inboundBytes:incoming}));
 }
 return Object.freeze({
  async ready(operationId:string){const r=await request(operationId);if(r.supported!==true||r.network!=='stellar:testnet'||r.serviceId!==configuration.serviceId||r.cardHash!==configuration.cardHash||r.ownerFingerprint!==configuration.ownerFingerprint||r.executionAttemptId!=='wakeId'||JSON.stringify(r.modes)!==JSON.stringify(['deliver','recover-known-result'])||r.redisCommands!==0||r.providerRequests!==0||r.executed!==0||r.redisWireProfile!=='bazaar-text-redis-wire/v2'||r.redisWireLimitBytes!==PER_ORDER_PROVIDER_BOUNDS.redisWireBytes)throw unavailable();},
  async invoke(dispatch:PerOrderProviderDispatch){
   if(!dispatch||dispatch.operationId===original||[dispatch.operationId,dispatch.wakeId,dispatch.dispatchAttemptId,dispatch.executionAttemptId].some(id=>!uuid.test(id))||dispatch.executionAttemptId!==dispatch.wakeId||dispatch.mode!==undefined&&!['deliver','recover-known-result'].includes(dispatch.mode))throw unavailable();
   const r=await request(dispatch.operationId,dispatch);
   if(r.operationId!==dispatch.operationId||r.wakeId!==dispatch.wakeId||r.dispatchAttemptId!==dispatch.dispatchAttemptId||r.executionAttemptId!==dispatch.executionAttemptId||![0,1].includes(Number(r.executed))||!Number.isSafeInteger(r.executed)||dispatch.mode==='recover-known-result'&&(r.executed!==0||r.providerRequests!==0)||r.redisWireProfile!=='bazaar-text-redis-wire/v2'||r.redisWireLimitBytes!==PER_ORDER_PROVIDER_BOUNDS.redisWireBytes||!Number.isSafeInteger(r.redisCommandsUpperBound)||Number(r.redisCommandsUpperBound)<0||Number(r.redisCommandsUpperBound)>PER_ORDER_PROVIDER_BOUNDS.redisCommands||!Number.isSafeInteger(r.redisWireAllocatedBytes)||Number(r.redisWireAllocatedBytes)<0||Number(r.redisWireAllocatedBytes)>PER_ORDER_PROVIDER_BOUNDS.redisWireBytes)throw unavailable();
   return {operationId:dispatch.operationId,wakeId:dispatch.wakeId,dispatchAttemptId:dispatch.dispatchAttemptId,executionAttemptId:dispatch.executionAttemptId,paymentSubmissions:0 as const,executed:r.executed as 0|1};
  },
 });
}
export async function assertPerOrderProductionProviderReady(operationId:string,identity?:SellerIdentity){
 assertOperation(operationId);const configuration=readPerOrderProductionProviderConfiguration(process.env,identity);if(!configuration)throw unavailable();
 await createPerOrderProductionProvider(configuration).ready(operationId);
}
