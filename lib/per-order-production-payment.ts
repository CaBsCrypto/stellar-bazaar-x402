import type {PaymentPayload,PaymentRequirements,SettleResponse,VerifyResponse} from '@x402/core/types';
import {WorkspaceError} from './workspace-types.ts';
import {assertPerOrderStorageProfile} from './per-order-storage-profile.ts';

type Environment=Readonly<Record<string,string|undefined>>;
export const PER_ORDER_PRODUCTION_PAYMENT_MODE='stellar-testnet-v1';
export const PER_ORDER_FACILITATOR_ORIGIN='https://channels.openzeppelin.com';
export const PER_ORDER_FACILITATOR_URL=PER_ORDER_FACILITATOR_ORIGIN+'/x402/testnet';
export const PER_ORDER_RPC_URL='https://soroban-testnet.stellar.org';
export const PER_ORDER_PRODUCTION_TRANSPORT_BOUNDS=Object.freeze({requestBytes:65536,responseBytes:131072,responseHeaderBytes:8192,timeoutMs:10000,retries:0,redirects:0});
export type ProductionPaymentConfiguration=Readonly<{version:1;mode:typeof PER_ORDER_PRODUCTION_PAYMENT_MODE;origin:'https://bazaar.browns.studio';facilitatorUrl:typeof PER_ORDER_FACILITATOR_URL;rpcUrl:typeof PER_ORDER_RPC_URL;apiKey:string}>;
const configurationError=()=>new WorkspaceError('PER_ORDER_PAYMENT_CONFIGURATION_INCOMPLETE',503);
const transportError=()=>new WorkspaceError('PER_ORDER_X402_TRANSPORT_UNCONFIRMED',409);
function validKey(value:unknown):value is string{return typeof value==='string'&&/^[\x21-\x7e]{20,1024}$/.test(value);}
function validateConfiguration(value:ProductionPaymentConfiguration){
 if(!value||Object.keys(value).sort().join(',')!=='apiKey,facilitatorUrl,mode,origin,rpcUrl,version'||value.version!==1||value.mode!==PER_ORDER_PRODUCTION_PAYMENT_MODE||value.origin!=='https://bazaar.browns.studio'||value.facilitatorUrl!==PER_ORDER_FACILITATOR_URL||value.rpcUrl!==PER_ORDER_RPC_URL||!validKey(value.apiKey))throw configurationError();
}
/** Pure server configuration. The absent/disabled mode returns before reading
 * any payment credential. No request argument can supply an endpoint or key. */
export function readPerOrderProductionPaymentConfiguration(environment:Environment=process.env):ProductionPaymentConfiguration|undefined{
 const mode=environment.BAZAAR_PER_ORDER_X402_MODE;if(mode===undefined||mode==='disabled')return undefined;
 if(mode!==PER_ORDER_PRODUCTION_PAYMENT_MODE||environment.NODE_ENV!=='production'||environment.VERCEL!=='1'||environment.VERCEL_ENV!=='production'||environment.BAZAAR_MARKET_ORDER_STORAGE!=='per-order-v1'||environment.BAZAAR_ENABLE_MARKETPLACE!=='true'||environment.BAZAAR_X402_MARKETPLACE_ENABLED!=='true'||environment.BAZAAR_ENABLE_MARKET_PURCHASES!=='true'||environment.BAZAAR_WORKSPACE_PUBLIC_ORIGIN!=='https://bazaar.browns.studio'||environment.BAZAAR_PER_ORDER_PROVIDER_PROTOCOL!=='bazaar.per-order-provider/v1')throw configurationError();
 try{if(assertPerOrderStorageProfile(environment)!=='continuous')throw Error();}catch{throw configurationError();}
 const value:ProductionPaymentConfiguration={version:1,mode,origin:'https://bazaar.browns.studio',facilitatorUrl:(environment.STELLAR_X402_FACILITATOR_URL??PER_ORDER_FACILITATOR_URL) as typeof PER_ORDER_FACILITATOR_URL,rpcUrl:(environment.STELLAR_X402_RPC_URL??PER_ORDER_RPC_URL) as typeof PER_ORDER_RPC_URL,apiKey:environment.STELLAR_X402_FACILITATOR_API_KEY??''};
 validateConfiguration(value);return Object.freeze(value);
}
export function perOrderProductionPaymentsConfigured(environment:Environment=process.env){try{return readPerOrderProductionPaymentConfiguration(environment)!==undefined;}catch{return false;}}

/** No transport begins at construction. A custom fetch exists solely for
 * offline unit tests; a deployed factory cannot accept that override. */
export function createPerOrderProductionPaymentTransports(configuration:ProductionPaymentConfiguration,options:{fetcher?:typeof fetch}={},assertCapability?:()=>void){
 validateConfiguration(configuration);
 if(Object.keys(options).some(key=>key!=='fetcher')||options.fetcher!==undefined&&(process.env.NODE_ENV!=='test'||process.env.VERCEL!==undefined||typeof options.fetcher!=='function')||assertCapability!==undefined&&typeof assertCapability!=='function'||process.env.NODE_ENV==='production'&&assertCapability===undefined)throw configurationError();
 const config=Object.freeze({...configuration}),fetcher=options.fetcher??globalThis.fetch;
 async function send(kind:'facilitator'|'rpc',url:string,body:unknown){
  assertCapability?.();
  const allowed=kind==='facilitator'?[PER_ORDER_FACILITATOR_URL+'/verify',PER_ORDER_FACILITATOR_URL+'/settle']:[new URL(PER_ORDER_RPC_URL).href];
  const target=new URL(url).href;if(!allowed.includes(target))throw configurationError();
  let encoded:string;try{encoded=JSON.stringify(body);}catch{throw transportError();}
  if(typeof encoded!=='string'||Buffer.byteLength(encoded)>PER_ORDER_PRODUCTION_TRANSPORT_BOUNDS.requestBytes)throw new WorkspaceError('X402_REQUEST_TOO_LARGE',413);
  const headers:Record<string,string>={'content-type':'application/json',accept:'application/json',...(kind==='facilitator'?{authorization:'Bearer '+config.apiKey}:{})};
  let incoming=0;const outgoing=Buffer.byteLength(encoded)+Buffer.byteLength(JSON.stringify(headers));
  const {meteredExternal}=await import('./acceptance-meter.ts');
  try{return await meteredExternal(kind,async()=>{
   // The lazy meter import may yield beyond the originating callback lifetime.
   // Recheck immediately before the sole externally observable dispatch.
   assertCapability?.();
   const response=await fetcher(target,{method:'POST',headers,body:encoded,redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(PER_ORDER_PRODUCTION_TRANSPORT_BOUNDS.timeoutMs)});
   incoming=Buffer.byteLength(JSON.stringify([...response.headers]));
   if(response.status!==200||response.redirected||response.url&&response.url!==target||response.headers.has('location')||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||incoming>PER_ORDER_PRODUCTION_TRANSPORT_BOUNDS.responseHeaderBytes){await response.body?.cancel();throw transportError();}
   const reader=response.body?.getReader();if(!reader)throw transportError();const chunks:Uint8Array[]=[];
   try{for(;;){const part=await reader.read();if(part.done)break;incoming+=part.value.byteLength;if(incoming>PER_ORDER_PRODUCTION_TRANSPORT_BOUNDS.responseBytes){await reader.cancel();throw transportError();}chunks.push(part.value);}}finally{reader.releaseLock();}
   try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{throw transportError();}
  },{origin:new URL(target).origin,path:new URL(target).pathname,method:'POST'},()=>({outboundBytes:outgoing,inboundBytes:incoming}));}
  catch(error){if(error instanceof WorkspaceError&&['X402_REQUEST_TOO_LARGE','EXTERNAL_REQUEST_BUDGET','CONTINUOUS_CONTROL_TRANSPORT_BUDGET'].includes(error.code))throw error;throw transportError();}
 }
 return Object.freeze({
  facilitator:Object.freeze({
   async verify(payload:PaymentPayload,requirements:PaymentRequirements):Promise<VerifyResponse>{const value=await send('facilitator',PER_ORDER_FACILITATOR_URL+'/verify',{x402Version:2,paymentPayload:payload,paymentRequirements:requirements}) as VerifyResponse;if(!value||typeof value.isValid!=='boolean'||value.payer!==undefined&&(typeof value.payer!=='string'||value.payer.length>128))throw transportError();return value;},
   async settle(payload:PaymentPayload,requirements:PaymentRequirements):Promise<SettleResponse>{const value=await send('facilitator',PER_ORDER_FACILITATOR_URL+'/settle',{x402Version:2,paymentPayload:payload,paymentRequirements:requirements}) as SettleResponse;if(!value||typeof value.success!=='boolean'||typeof value.network!=='string'||value.network.length>100||typeof value.transaction!=='string'||value.transaction.length>128||value.payer!==undefined&&(typeof value.payer!=='string'||value.payer.length>128))throw transportError();return value;},
  }),
  rpc:Object.freeze({async transaction(transactionHash:string){
   if(!/^[a-f0-9]{64}$/.test(transactionHash))throw new WorkspaceError('INVALID_TRANSACTION',400);
   const value=await send('rpc',PER_ORDER_RPC_URL,{jsonrpc:'2.0',id:'bazaar-per-order-x402',method:'getTransaction',params:{hash:transactionHash}}) as {jsonrpc?:unknown;id?:unknown;error?:unknown;result?:{status?:unknown;envelopeXdr?:unknown;resultXdr?:unknown;ledger?:unknown}};
   const r=value?.result;if(value?.jsonrpc!=='2.0'||value.id!=='bazaar-per-order-x402'||value.error||!r||typeof r.status!=='string'||!/^[A-Z_]{1,32}$/.test(r.status)||r.envelopeXdr!==undefined&&(typeof r.envelopeXdr!=='string'||Buffer.byteLength(r.envelopeXdr)>65536)||r.resultXdr!==undefined&&(typeof r.resultXdr!=='string'||Buffer.byteLength(r.resultXdr)>65536)||r.ledger!==undefined&&(!Number.isSafeInteger(r.ledger)||Number(r.ledger)<0))throw transportError();
   return {status:r.status,...(r.envelopeXdr===undefined?{}:{envelopeXdr:r.envelopeXdr as string}),...(r.resultXdr===undefined?{}:{resultXdr:r.resultXdr as string}),...(r.ledger===undefined?{}:{ledger:r.ledger as number})};
  }}),
 });
}
