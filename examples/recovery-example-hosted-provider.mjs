import {timingSafeEqual} from 'node:crypto';
import {createHostedSellerHandler} from './seller-hosted-handler.mjs';
import {runHostedSellerTick} from './seller-hosted-tick.mjs';
import {validateSellerConfiguration} from './seller-mcp-transport.mjs';
import {sellerCanonical,sellerHash} from './seller-service-card.mjs';
import {createWorkerRedisCommands,createSellerRedisSecretStore} from './seller-redis-secret-store.mjs';
import {sellerUuid,validateSellerIntent} from './seller-marketplace-worker.mjs';
import {createSellerRuntime} from './seller-runtime.mjs';
import * as example from './recovery-example-text-service.mjs';
import {exampleProviderIoEnabled,boundExampleProviderFetcher,EXAMPLE_PROVIDER_IO_LIMITS} from './recovery-example-provider-io.mjs';

export const RECOVERY_EXAMPLE_TICK_PATH='/api/bazaar/example/tick';
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
const prefixPattern=/^bazaar-seller:(preview|production)-[a-f0-9]{32}$/;
const headers={'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const response=(status,value)=>Response.json(value,{status,headers});
function authorized(request,expected){
 const candidate=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')??'')?.[1];
 return tokenPattern.test(expected??'')&&tokenPattern.test(candidate??'')&&timingSafeEqual(Buffer.from(candidate),Buffer.from(expected));
}
function contract(environment){
 const workerPrefix=environment.BAZAAR_HOSTED_SELLER_PREFIX,workerBinding=environment.BAZAAR_HOSTED_SELLER_BINDING_HASH;
 const runtimePrefix=environment.BAZAAR_EXAMPLE_RUNTIME_PREFIX;
 const stage=environment.VERCEL_ENV==='production'?'production':'preview';
 if(!prefixPattern.test(workerPrefix??'')||!prefixPattern.test(runtimePrefix??'')||workerPrefix===runtimePrefix||
     !workerPrefix.startsWith('bazaar-seller:'+stage+'-')||!runtimePrefix.startsWith('bazaar-seller:'+stage+'-')||
     !/^[a-f0-9]{64}$/.test(workerBinding??''))throw Error('EXAMPLE_STORAGE_CONFIGURATION_REQUIRED');
 const runtimeBinding=sellerHash(sellerCanonical({role:'recovery-example-runtime/v1',workerBinding}));
 return {workerPrefix,workerBinding,runtimePrefix,runtimeBinding};
}
/** Public names and hashes only, used to initialize both isolated ledgers once. */
export function recoveryExampleStorageContract(environment){
 const value=contract(environment);
 return {...value,workerStorageKey:value.workerPrefix+':'+value.workerBinding+':storage:v1',runtimeStorageKey:value.runtimePrefix+':'+value.runtimeBinding+':storage:v1'};
}
function fixedConfiguration(environment){
 if(environment.BAZAAR_SELLER_EXECUTION_MODE!=='on-demand'||typeof environment.BAZAAR_HOSTED_SELLER_CONFIG!=='string'||Buffer.byteLength(environment.BAZAAR_HOSTED_SELLER_CONFIG)>32768)throw Error('EXAMPLE_CONFIGURATION_REQUIRED');
 const config=validateSellerConfiguration(JSON.parse(environment.BAZAAR_HOSTED_SELLER_CONFIG));
 const expected=example.createRecoveryExampleCard({providerOrigin:config.card.url,destination:config.card.payment.destination});
 if(config.cardHash!==expected.cardHash||sellerCanonical(config.card)!==sellerCanonical(expected.card)||
     !tokenPattern.test(config.agentAccess??'')||!tokenPattern.test(config.providerAccess??'')||
     config.providerFetchModule!==undefined||config.providerProtection!==undefined)throw Error('EXAMPLE_CONFIGURATION_REQUIRED');
 return config;
}
function requestTarget(request,environment,path,methods){
 const target=new URL(request.url);
 if(!methods.includes(request.method)||target.pathname!==path||target.search||target.hash||target.username||target.password||request.headers.has('origin')||
     target.protocol!=='https:'&&!(environment.VERCEL!=='1'&&target.protocol==='http:'&&['localhost','127.0.0.1'].includes(target.hostname))||
     request.method==='GET'&&(request.headers.has('transfer-encoding')||request.headers.get('content-length')&&request.headers.get('content-length')!=='0'))throw Error('EXAMPLE_REQUEST_REQUIRED');
 return target;
}
async function boundedBody(request,maximum){
 if(request.headers.get('content-type')!=='application/json'||request.headers.has('content-encoding')||!request.body)throw Error('EXAMPLE_REQUEST_REQUIRED');
 const reader=request.body.getReader(),parts=[];let size=0,timer;
 try{return await Promise.race([(async()=>{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum)throw Error('EXAMPLE_REQUEST_REQUIRED');parts.push(Buffer.from(value));}return Buffer.concat(parts);})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('EXAMPLE_BODY_TIMEOUT')),1000);})]);}
 finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
}
function strictPacket(bytes){
 const packet=JSON.parse(bytes.toString('utf8'));
 if(!packet||Array.isArray(packet)||Object.keys(packet).sort().join(',')!=='attemptId,input,operationId'||!sellerUuid.test(packet.operationId??'')||!sellerUuid.test(packet.attemptId??'')||
     !packet.input||Array.isArray(packet.input)||Object.keys(packet.input).join(',')!=='format'||packet.input.format!=='text')throw Error('EXAMPLE_REQUEST_REQUIRED');
 return packet;
}
/** External route is fixed. It cannot request a scan, recovery, URL or service override. */
export function createRecoveryExampleTickHandler(environment=process.env,{fetcher=fetch,runTick=runHostedSellerTick}={}){
 return async request=>{
  if(!authorized(request,environment.CRON_SECRET))return response(401,{error:'UNAUTHORIZED'});
  let body,target;
  try{
   target=requestTarget(request,environment,RECOVERY_EXAMPLE_TICK_PATH,['POST']);
   body=await boundedBody(request,256);
   const packet=JSON.parse(body.toString('utf8')),keys=Object.keys(packet??{}).sort().join(',');
   if(!packet||Array.isArray(packet)||!(keys==='mode'&&packet.mode==='readiness'||keys==='mode,operationId,wakeId'&&packet.mode==='deliver'&&sellerUuid.test(packet.operationId??'')&&sellerUuid.test(packet.wakeId??'')))throw Error();
  }catch{return response(400,{error:'INVALID_WORKER_REQUEST'});}
  let io;
  if(environment.BAZAAR_HOSTED_SELLER_ENABLED==='true')try{const config=fixedConfiguration(environment);contract(environment);if(exampleProviderIoEnabled(environment,config))io=boundExampleProviderFetcher({environment,config,role:'worker',fetcher});}catch{return response(503,{error:'EXAMPLE_CONFIGURATION_UNAVAILABLE',paymentSubmissions:0});}
  target.pathname='/api/bazaar/seller/tick';
  const result=await createHostedSellerHandler(environment,{fetcher:io?.send??fetcher,runTick})(new Request(target,{method:'POST',headers:request.headers,body}));
  if(!io)return result;
  const packet=await result.json();return Response.json({...packet,providerIo:{limits:EXAMPLE_PROVIDER_IO_LIMITS,observed:io.snapshot()}},{status:result.status,headers:result.headers});
 };
}
/** Runtime and worker use distinct encrypted Redis ledgers. No filesystem or
 * memory fallback exists; the worker's paid, claimed journal authorizes a run. */
export function createRecoveryExampleRuntimeHandler(environment=process.env,{fetcher=fetch,now=Date.now,adapter=example}={}){
 return async request=>{
  let config,layout,bounded;
  try{config=fixedConfiguration(environment);layout=contract(environment);bounded=exampleProviderIoEnabled(environment,config);}catch{return response(503,{error:'EXAMPLE_CONFIGURATION_UNAVAILABLE'});}
  if(!authorized(request,config.providerAccess))return response(401,{error:'UNAUTHORIZED'});
  const health=request.method==='GET'&&new URL(request.url).pathname===example.RECOVERY_EXAMPLE_ROUTE+'/availability';
  let packet,bytes;
  try{
   requestTarget(request,environment,example.RECOVERY_EXAMPLE_ROUTE+(health?'/availability':''),health?['GET']:['POST']);
   if(!health){bytes=await boundedBody(request,512);packet=strictPacket(bytes);}
  }catch{return response(400,{error:'INVALID_REQUEST'});}
  let worker,runtime,count=0;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const io=bounded?boundExampleProviderFetcher({environment,config,role:health?'runtime-health':'runtime-execute',fetcher}):undefined;
   const command=createWorkerRedisCommands({url:environment.BAZAAR_HOSTED_SELLER_REDIS_REST_URL,token:environment.BAZAAR_HOSTED_SELLER_REDIS_REST_TOKEN,fetcher:io?.send??fetcher,signal:controller.signal});
   const boundedCommand=values=>{if(++count>40)throw Error('EXAMPLE_STORAGE_BOUND');return command(values);};
   const options={command:boundedCommand,key:environment.BAZAAR_HOSTED_SELLER_KEY,storageBudget:true,now};
   worker=createSellerRedisSecretStore({...options,prefix:layout.workerPrefix,bindingHash:layout.workerBinding});
   runtime=createSellerRedisSecretStore({...options,prefix:layout.runtimePrefix,bindingHash:layout.runtimeBinding});
   // Health must verify both initialized storage ledgers without an execution.
   const capacity=await Promise.all([worker.capacityHeadroom(),runtime.capacityHeadroom()]);
   if(health&&capacity.some(value=>value.admissionReady!==true))return response(503,{ready:false,network:'stellar:testnet'});
   let source;
   if(!health){
    source=await worker.read('seller.'+packet.operationId);validateSellerIntent(source);
    const binding=source.binding,expiry=Date.parse(source.contentExpiresAt);
    if(source.operationId!==packet.operationId||source.attemptId!==packet.attemptId||source.ownerId!==config.ownerId||source.agentId!==config.agentId||source.serviceId!==example.RECOVERY_EXAMPLE_SERVICE_ID||source.cardHash!==config.cardHash||source.providerOrigin!==config.card.url||source.providerRoute!==example.RECOVERY_EXAMPLE_ROUTE||
        !['provider-started','generated','delivery-started','delivery-uncertain','delivered'].includes(source.phase)||!Number.isFinite(expiry)||expiry<=now()||
        !/^[a-f0-9]{64}$/.test(binding?.transactionHash??'')||binding.inputHash!==sellerHash(sellerCanonical(packet.input))||sellerCanonical(binding.input)!==sellerCanonical(packet.input)||binding.amount!==config.card.payment.amount||binding.destination!==config.card.payment.destination||sellerCanonical(binding.identity)!==sellerCanonical(config.card.payment.identity)||binding.paymentProtocol!=='x402-stellar-exact-v2')return response(409,{error:'UNBOUND_OR_UNPAID_ORDER'});
    // A worker that has already conserved its result authorizes recovery only.
    // Even a newly initialized or accidentally replaced runtime namespace must
    // never turn a missing prior result into another adapter execution.
    if(source.phase!=='provider-started'){
     const conserved=await runtime.read('seller.'+packet.operationId);
     if(!conserved||conserved.phase!=='generated'||conserved.operationId!==packet.operationId||conserved.attemptId!==packet.attemptId||conserved.cardHash!==config.cardHash||conserved.contentExpiresAt!==source.contentExpiresAt||
         conserved.inputHash!==binding.inputHash||typeof conserved.text!=='string'||conserved.textHash!==sellerHash(conserved.text)||conserved.text!==source.text||conserved.textHash!==source.textHash)return response(409,{error:'EXECUTION_UNCERTAIN_DO_NOT_REEXECUTE'});
    }
   }
   const mapName=name=>{if(typeof name!=='string'||!name.startsWith('runtime.')||!sellerUuid.test(name.slice(8)))throw Error('EXAMPLE_RUNTIME_OPERATION_REQUIRED');return 'seller.'+name.slice(8);};
   const store={
    read:async name=>{if(name!=='seller-config')throw Error('EXAMPLE_CONFIGURATION_REQUIRED');return config;},
    acquireLock:name=>runtime.acquireLock(mapName(name)),
    journal:name=>{
     const underlying=runtime.journal(mapName(name));
     const bind=value=>({...value,cardHash:config.cardHash,contentExpiresAt:source.contentExpiresAt});
     return {read:underlying.read,initialize:value=>underlying.initialize(bind(value)),append:value=>underlying.append(bind(value))};
    },
   };
   const handler=createSellerRuntime({adapter,store,providerAccess:config.providerAccess,route:example.RECOVERY_EXAMPLE_ROUTE,maxRequests:60,now});
   const result=await handler(health?request:new Request(request.url,{method:'POST',headers:request.headers,body:bytes}));
   const outputHeaders=new Headers(result.headers);for(const [key,value]of Object.entries(headers))outputHeaders.set(key,value);
   return new Response(result.body,{status:result.status,headers:outputHeaders});
  }catch{return response(503,{error:'EXAMPLE_STORAGE_UNAVAILABLE'});}
  finally{clearTimeout(timer);worker?.dispose();runtime?.dispose();}
 };
}
