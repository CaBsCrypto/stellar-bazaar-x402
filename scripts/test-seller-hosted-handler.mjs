import assert from 'node:assert/strict';
import {createHostedSellerHandler} from '../examples/seller-hosted-handler.mjs';
import {createSellerCard} from '../examples/seller-service-card.mjs';

const card=createSellerCard({id:'synthetic-hosted-text',name:'Synthetic worker fixture',description:'Offline acceptance',providerName:'Synthetic provider',providerOrigin:'https://synthetic-provider.vercel.app',destination:'GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C',amount:'0.01'});
const config={...card,bazaarOrigin:'https://synthetic-bazaar.vercel.app',ownerId:'ow_synthetic',agentId:'agent_synthetic',allowedOrigins:[card.card.url],controlProof:{method:'http-well-known',domain:'synthetic-provider.vercel.app'},agentAccess:'a'.repeat(43),providerAccess:'b'.repeat(43)};
const environment={CRON_SECRET:'c'.repeat(43),VERCEL:'1',VERCEL_ENV:'preview',BAZAAR_HOSTED_SELLER_ENABLED:'true',BAZAAR_HOSTED_SELLER_CONFIG:JSON.stringify(config),BAZAAR_HOSTED_SELLER_REDIS_REST_URL:'https://synthetic.upstash.io',BAZAAR_HOSTED_SELLER_REDIS_REST_TOKEN:'PRIVATE_SYNTHETIC_REDIS_TOKEN',BAZAAR_HOSTED_SELLER_PREFIX:'bazaar-seller:preview-'+'d'.repeat(32),BAZAAR_HOSTED_SELLER_KEY:Buffer.alloc(32,4).toString('base64url'),BAZAAR_HOSTED_SELLER_MCP_PROTECTION:'e'.repeat(32),BAZAAR_HOSTED_SELLER_PROVIDER_PROTECTION:'f'.repeat(32)};
const request=(path='/api/bazaar/seller/tick',extra={})=>new Request('https://worker.vercel.app'+path,{...extra,headers:{authorization:'Bearer '+environment.CRON_SECRET,...extra.headers}});
let checks=0,runs=0,fetches=0;
const dependencies={fetcher:async(url,init)=>{fetches++;const headers=new Headers(init.headers);assert.equal(init.redirect,'error');if(String(url)===config.bazaarOrigin+'/api/mcp')assert.equal(headers.get('x-vercel-protection-bypass'),environment.BAZAAR_HOSTED_SELLER_MCP_PROTECTION);else if(String(url)===config.card.url+config.card.routeTemplate)assert.equal(headers.get('x-vercel-protection-bypass'),environment.BAZAAR_HOSTED_SELLER_PROVIDER_PROTECTION);else assert.fail('Unpinned endpoint');return Response.json({ok:true});},runTick:async input=>{runs++;assert.equal(input.config.cardHash,config.cardHash);await assert.rejects(input.fetcher('https://evil.example/api/mcp',{}),/ENDPOINT_DENIED/);await input.fetcher(config.bazaarOrigin+'/api/mcp',{method:'POST'});await input.providerFetcher(config.card.url+config.card.routeTemplate,{method:'POST'});return {version:1,status:'completed',reason:'idle',mcpRequests:4,providerRequests:0,executed:0};}};
const handler=createHostedSellerHandler(environment,dependencies);
for(const authorization of ['', 'Bearer wrong', 'Bearer '+'x'.repeat(43)]){
 const result=await handler(request(undefined,{headers:{authorization}}));assert.equal(result.status,401);checks++;
}
assert.equal(runs,0);
for(const [path,extra]of [['/api/bazaar/seller/tick?operationId=synthetic',{}],['/other',{}],['/api/bazaar/seller/tick',{method:'POST'}],['/api/bazaar/seller/tick',{headers:{origin:'https://worker.vercel.app'}}],['/api/bazaar/seller/tick',{headers:{'content-length':'1'}}]]){
 assert.equal((await handler(request(path,extra))).status,400);checks++;
}
assert.equal(runs,0);assert.equal(fetches,0);
const idle=await handler(request());assert.equal(idle.status,200);const body=await idle.json();assert.equal(body.reason,'idle');assert.equal(body.productionScheduler,false);assert.equal(body.paymentSubmissions,0);assert.equal(idle.headers.get('cache-control'),'no-store');assert.ok(!JSON.stringify(body).includes('PRIVATE_SYNTHETIC'));assert.equal(runs,1);checks++;
const disabled=await createHostedSellerHandler({...environment,BAZAAR_HOSTED_SELLER_ENABLED:'false'},dependencies)(request());assert.equal((await disabled.json()).reason,'disabled');assert.equal(runs,1);checks++;
for(const patch of [{BAZAAR_HOSTED_SELLER_KEY:'bad'},{BAZAAR_HOSTED_SELLER_PREFIX:'bazaar-seller:production-'+'d'.repeat(32)},{BAZAAR_HOSTED_SELLER_CONFIG:'{}'},{BAZAAR_HOSTED_SELLER_REDIS_REST_URL:'https://evil.example'},{VERCEL_ENV:'production',BAZAAR_HOSTED_SELLER_PREFIX:'bazaar-seller:production-'+'d'.repeat(32)}]){
 const result=await createHostedSellerHandler({...environment,...patch},dependencies)(request());assert.equal(result.status,503);assert.equal((await result.json()).error,'WORKER_UNAVAILABLE');checks++;
}
const foreign=createSellerCard({id:'synthetic-hosted-foreign',name:'Synthetic worker fixture',description:'Offline acceptance',providerName:'Synthetic provider',providerOrigin:'https://owned-provider.example',destination:card.card.payment.destination,amount:'0.01'});
const beforeForeign=runs;
for(const replacement of [{...config,...foreign,allowedOrigins:[foreign.card.url],controlProof:{method:'http-well-known',domain:'owned-provider.example'}},{...config,bazaarOrigin:'https://owned-bazaar.example'}]){
 const result=await createHostedSellerHandler({...environment,BAZAAR_HOSTED_SELLER_CONFIG:JSON.stringify(replacement)},dependencies)(request());assert.equal(result.status,503);assert.equal(runs,beforeForeign);checks++;
}
const production=await createHostedSellerHandler({...environment,VERCEL_ENV:'production',BAZAAR_HOSTED_SELLER_PREFIX:'bazaar-seller:production-'+'d'.repeat(32),BAZAAR_HOSTED_SELLER_MCP_PROTECTION:undefined,BAZAAR_HOSTED_SELLER_PROVIDER_PROTECTION:undefined},{runTick:async()=>({reason:'idle',providerRequests:0,executed:0})})(request());assert.equal(production.status,200);assert.equal((await production.json()).productionScheduler,true);checks++;
for(const reason of ['quota','backoff','tick-bound','provider-bound','request-bound','unconfirmed','clock','time-bound','uncertainty']){
 const result=await createHostedSellerHandler(environment,{runTick:async()=>({reason,mcpRequests:0,providerRequests:0,executed:0})})(request());
 assert.equal(result.status,['unconfirmed','clock','time-bound'].includes(reason)?503:reason==='uncertainty'?200:429);checks++;
}
const failure=await createHostedSellerHandler(environment,{runTick:async()=>{throw Error('PRIVATE_SYNTHETIC_TOKEN');}})(request());assert.equal(failure.status,503);assert.ok(!JSON.stringify(await failure.json()).includes('PRIVATE_SYNTHETIC'));checks++;
console.log(JSON.stringify({status:'PASS',checks,httpDoubles:fetches,externalRequests:0,redisWrites:0,payments:0,productionPublished:false}));
