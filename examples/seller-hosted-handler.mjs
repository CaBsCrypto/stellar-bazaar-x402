import {timingSafeEqual} from 'node:crypto';
import {runHostedSellerTick} from './seller-hosted-tick.mjs';
import {validateSellerConfiguration} from './seller-mcp-transport.mjs';
import {sellerCanonical,sellerHash} from './seller-service-card.mjs';
import {createWorkerRedisCommands,createSellerRedisSecretStore} from './seller-redis-secret-store.mjs';

const endpointPath='/api/bazaar/seller/tick';
const access=/^[A-Za-z0-9_-]{43}$/;
const protection=/^[A-Za-z0-9_-]{16,256}$/;
const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const response=(status,body,extra={})=>Response.json(body,{status,headers:{...headers,...extra}});
const binding=config=>sellerHash(sellerCanonical({bazaarOrigin:config.bazaarOrigin,ownerId:config.ownerId,agentId:config.agentId,cardHash:config.cardHash,allowedOrigins:config.allowedOrigins,agentAccessHash:sellerHash(config.agentAccess),providerAccessHash:sellerHash(config.providerAccess)}));

/** Provider-owned HTTP trigger. The caller cannot supply a seller, service,
 * destination, URL or credential. Only the frozen private configuration runs.
 * This endpoint has no wallet signer, payment simulation or administrator role.
 */
export function createHostedSellerHandler(environment=process.env,{runTick=runHostedSellerTick,fetcher=fetch}={}){
 return async request=>{
  const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')??'')?.[1],expected=environment.CRON_SECRET;
  if(!access.test(expected??'')||!access.test(token??'')||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))return response(401,{error:'UNAUTHORIZED'});
  const target=new URL(request.url);
  if(request.method!=='GET'||target.pathname!==endpointPath||target.search||target.hash||target.username||target.password||request.headers.has('origin')||request.headers.get('content-length')&&request.headers.get('content-length')!=='0')return response(400,{error:'INVALID_WORKER_REQUEST'});
  if(target.protocol!=='https:'&&!(environment.VERCEL!=='1'&&target.protocol==='http:'&&['localhost','127.0.0.1'].includes(target.hostname)))return response(400,{error:'INVALID_WORKER_REQUEST'});
  if(environment.BAZAAR_HOSTED_SELLER_ENABLED!=='true')return response(200,{version:1,status:'completed',reason:'disabled',mcpRequests:0,providerRequests:0,executed:0});
  let store,redisCommands=0;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{
   const raw=environment.BAZAAR_HOSTED_SELLER_CONFIG;if(typeof raw!=='string'||Buffer.byteLength(raw)>32768)throw Error();
   const config=validateSellerConfiguration(JSON.parse(raw));
   if(!access.test(config.agentAccess??'')||!access.test(config.providerAccess??'')||config.providerFetchModule!==undefined||config.providerProtection!==undefined)throw Error();
   const stage=environment.VERCEL_ENV==='production'?'production':'preview';
   for(const [url,privateProtection]of [[config.bazaarOrigin,environment.BAZAAR_HOSTED_SELLER_MCP_PROTECTION],[config.card.url,environment.BAZAAR_HOSTED_SELLER_PROVIDER_PROTECTION]])if(privateProtection&&(!protection.test(privateProtection)||stage!=='preview'||!new URL(url).hostname.endsWith('.vercel.app')))throw Error('WORKER_PREVIEW_ACCESS_INVALID');
   if(!environment.BAZAAR_HOSTED_SELLER_PREFIX?.startsWith('bazaar-seller:'+stage+'-'))throw Error();
   const command=createWorkerRedisCommands({url:environment.BAZAAR_HOSTED_SELLER_REDIS_REST_URL,token:environment.BAZAAR_HOSTED_SELLER_REDIS_REST_TOKEN,fetcher,signal:controller.signal});
   store=createSellerRedisSecretStore({command:values=>{if(++redisCommands>180)throw Error('WORKER_STORAGE_BOUND');return command(values);},prefix:environment.BAZAAR_HOSTED_SELLER_PREFIX,key:environment.BAZAAR_HOSTED_SELLER_KEY,bindingHash:binding(config)});
   const pinned=(expectedUrl,privateProtection,availabilityUrl)=>async(url,init)=>{
    const href=new URL(url instanceof Request?url.url:String(url)).href;
    if(href!==expectedUrl&&!(availabilityUrl&&href===availabilityUrl&&init?.method==='GET'))throw Error('WORKER_ENDPOINT_DENIED');
    const ownHeaders=new Headers(init?.headers);
    if(privateProtection)ownHeaders.set('x-vercel-protection-bypass',privateProtection);
    return await fetcher(url,{...init,headers:ownHeaders,redirect:'error',signal:AbortSignal.any([controller.signal,...(init?.signal?[init.signal]:[])])});
   };
   const result=await runTick({enabled:true,config,store,signal:controller.signal,fetcher:pinned(config.bazaarOrigin+'/api/mcp',environment.BAZAAR_HOSTED_SELLER_MCP_PROTECTION),providerFetcher:pinned(new URL(config.card.routeTemplate,config.card.url).href,environment.BAZAAR_HOSTED_SELLER_PROVIDER_PROTECTION,new URL(config.card.routeTemplate+'/availability',config.card.url).href)});
   const body={...result,redisCommands,productionScheduler:stage==='production',paymentSubmissions:0};
   if(['unconfirmed','clock','time-bound'].includes(result.reason))return response(503,body,{'retry-after':'120'});
   if(['quota','backoff','tick-bound','provider-bound','request-bound'].includes(result.reason))return response(429,body,{'retry-after':String(result.retryAfterSeconds??120)});
   return response(200,body);
  }catch{return response(503,{error:'WORKER_UNAVAILABLE',redisCommands,paymentSubmissions:0},{'retry-after':'120'});}
  finally{clearTimeout(timer);store?.dispose();}
 };
}
