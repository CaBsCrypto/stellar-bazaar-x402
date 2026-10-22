import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {assertSellerCard,sellerHash,sellerCanonical,sellerHttpsOrigin} from './seller-service-card.mjs';

export const SELLER_BAZAAR_ORIGIN='https://bazaar.browns.studio';
export const SELLER_BAZAAR_ENDPOINT=SELLER_BAZAAR_ORIGIN+'/api/mcp';
export function sellerBazaarOrigin(raw){
 try{const origin=sellerHttpsOrigin(raw);if(origin!==raw)throw Error();return origin;}
 catch{throw Error('BAZAAR_HTTPS_ORIGIN_REQUIRED');}
}
/** This private opt-in belongs to the new bounded example deployment. A
 * transport option is also available for reviewed local client acceptance;
 * neither is read from a tool argument, URL, header or provider response. */
export function sellerMcpSerializationPolicy({agentAccess,origin,serializeRequests},environment=process.env){
 if(serializeRequests!==undefined){if(typeof serializeRequests!=='boolean')throw Error('MCP_SERIALIZATION_CONFIGURATION_REQUIRED');return serializeRequests;}
 const profile=environment.BAZAAR_EXAMPLE_PROVIDER_IO_PROFILE;if(profile===undefined)return false;
 try{
  if(profile!=='example-bounded-provider-v1'||typeof environment.BAZAAR_HOSTED_SELLER_CONFIG!=='string'||Buffer.byteLength(environment.BAZAAR_HOSTED_SELLER_CONFIG)>8192)throw Error();
  const config=validateSellerConfiguration(JSON.parse(environment.BAZAAR_HOSTED_SELLER_CONFIG));
  if(config.card.id!=='bazaar-recovery-example-text-v1'||config.card.routeTemplate!=='/v1/bazaar-recovery-example'||config.card.network!=='stellar:testnet'||config.agentAccess!==agentAccess||config.bazaarOrigin!==origin)throw Error();
  return true;
 }catch{throw Error('MCP_SERIALIZATION_CONFIGURATION_REQUIRED');}
}
/** Public Bazaar transport, one connection, bounded requests, no reconnect or redirect. */
export async function withSellerMcp({agentAccess,origin=SELLER_BAZAAR_ORIGIN,fetcher=fetch,maxRequests=100,serializeRequests},action){
 if(!/^[a-zA-Z0-9_-]{43}$/.test(agentAccess??'')||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>1000)throw Error('AGENT_ACCESS_REQUIRED');
 let requests=0,quotaError,httpTail=Promise.resolve();const client=new Client({name:'bazaar-external-seller',version:'1'});const endpoint=new URL('/api/mcp',sellerBazaarOrigin(origin)),serialized=sellerMcpSerializationPolicy({agentAccess,origin:endpoint.origin,serializeRequests});
 const transport=new StreamableHTTPClientTransport(endpoint,{reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},requestInit:{headers:{Authorization:'Bearer '+agentAccess}},fetch:async(url,init)=>{
  if(new URL(url instanceof Request?url.url:String(url)).href!==endpoint.href)throw Error('MCP_ENDPOINT_DENIED');if(++requests>maxRequests)throw Error('MCP_REQUEST_BOUND_REACHED');
  const send=async()=>{if(quotaError)throw quotaError;if(serialized&&init?.signal?.aborted)throw init.signal.reason??new DOMException('MCP connection closed','AbortError');const timeout=AbortSignal.timeout(15000),signal=serialized&&init?.signal?AbortSignal.any([timeout,init.signal]):timeout;const response=await fetcher(url,{...init,redirect:'error',signal});if(response.status===429){quotaError=Object.assign(Error('MCP_QUOTA_STOP'),{httpStatus:429,retryAfter:response.headers.get('retry-after')});throw quotaError;}if(response.redirected||response.url&&response.url!==endpoint.href)throw Error('MCP_REDIRECT_DENIED');return response;};
  if(!serialized)return send();
  // The SDK starts its SSE GET without awaiting it after the notification.
  // Keep that actual GET, its HTTP response and quota charge, but wait for it
  // before the next POST. Failed requests are never replayed.
  const pending=httpTail.then(send);httpTail=pending.catch(()=>{});return pending;
 }});
 try{await client.connect(transport);return await action({callTool:async(name,args)=>{if(quotaError)throw quotaError;try{return await client.callTool({name,arguments:args},undefined,{timeout:12000});}catch(error){throw quotaError??error;}},requestCount:()=>requests});}catch(error){throw quotaError??error;}finally{await client.close().catch(()=>{});}
}
export function validateSellerConfiguration(config){
 assertSellerCard(config?.card);if(!config.ownerId||!config.agentId||config.cardHash!==sellerHash(sellerCanonical(config.card))||!Array.isArray(config.allowedOrigins)||!config.allowedOrigins.includes(config.card.url)||config.allowedOrigins.some(v=>sellerHttpsOrigin(v)!==v)||!['dns-txt','http-well-known'].includes(config.controlProof?.method)||config.controlProof.domain!==new URL(config.card.url).hostname)throw Error('INVALID_SELLER_CONFIGURATION');
 // Older encrypted configurations continue to use the original public origin.
 // New configurations persist the exact origin; later commands cannot replace it.
 return {...config,bazaarOrigin:sellerBazaarOrigin(config.bazaarOrigin===undefined?SELLER_BAZAAR_ORIGIN:config.bazaarOrigin)};
}
export function sellerSetupConfiguration(config,origin){
 if(origin!==undefined){
  sellerBazaarOrigin(origin);
  if(config?.bazaarOrigin!==undefined&&config.bazaarOrigin!==origin)throw Error('BAZAAR_ORIGIN_CONFLICT');
 }
 return validateSellerConfiguration({...config,...(origin!==undefined?{bazaarOrigin:origin}:{})});
}
