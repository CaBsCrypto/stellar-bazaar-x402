import {sellerHttpsOrigin,sellerRoute,sellerHash} from './seller-service-card.mjs';

async function boundedResponse(response,maxBytes){
 const reader=response.body?.getReader();if(!reader)throw Error('PROVIDER_BODY_REQUIRED');const chunks=[];let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw Error('PROVIDER_RESPONSE_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** A trusted participant HTTP runtime. No paid provider route, redirects or retries. */
export function createSellerHttpAdapter({providerOrigin,route='/v1/marketplace-text',allowedOrigins,providerAccess,fetcher=fetch,timeoutMs=10000}){
 const origin=sellerHttpsOrigin(providerOrigin);sellerRoute(route);
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.includes(origin)||allowedOrigins.some(v=>sellerHttpsOrigin(v)!==v)||!/^[a-zA-Z0-9_-]{43}$/.test(providerAccess??'')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('PROVIDER_ALLOWLIST_CONFIGURATION_REQUIRED');
 const endpoint=new URL(route,origin).href;
 return {async execute({operationId,attemptId,input}){
  const response=await fetcher(endpoint,{method:'POST',headers:{authorization:'Bearer '+providerAccess,'content-type':'application/json'},body:JSON.stringify({operationId,attemptId,input}),redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok||response.redirected||response.url&&response.url!==endpoint)throw Error('PROVIDER_RESULT_UNCONFIRMED');
  const output=await boundedResponse(response,16384);
  if(output.operationId!==operationId||output.attemptId!==attemptId||output.contentType!=='text/plain'||typeof output.text!=='string'||!output.text.length||output.text.length>2000||output.textHash!==sellerHash(output.text))throw Error('PROVIDER_RESULT_CHANGED');return {text:output.text};
 }};
}
