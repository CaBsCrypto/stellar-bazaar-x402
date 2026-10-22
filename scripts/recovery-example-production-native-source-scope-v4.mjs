// Standalone private-source execution container. It imports frozen native code,
// disables every default Redis constructor, and injects only the controller's
// precharged IO. No fetch/Redis transport, CLI or credential lookup is provided.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const sha=v=>createHash('sha256').update(v).digest('hex'),names=['workspace-store','marketplace-store','provider-review-redis','provider-self-listing','provider-review-operator','marketplace','continuous-free-storage','continuous-free-budget','guardian-finite-budget'],envNames=()=>Object.keys(process.env).filter(k=>/^(?:BAZAAR_|UPSTASH_|KV_|X402_|STELLAR_X402_)/.test(k)).concat(['NODE_ENV','VERCEL','VERCEL_ENV']);
const stoppedRedis='data:text/javascript,'+encodeURIComponent("export class Redis {constructor(){throw Error('UNGUARDED_NATIVE_REDIS_FORBIDDEN');}}");
export async function createPrivateFrozenNativeSourceScopeV4({plan,reviewSecret,redisHeaders={},manifestPath,factory}){
 if(process.env.NODE_ENV!=='test'||process.env.VERCEL||plan?.schema!=='bazaar.example-production-bootstrap/v4'||typeof reviewSecret!=='string'||reviewSecret.length<32||reviewSecret.length>1024)throw Error('LOCAL_ISOLATED_NATIVE_SOURCE_SCOPE_REQUIRED');
 const BOOTSTRAP_PINS=factory.BOOTSTRAP_PINS,assertAuthenticatedBootstrapNativeContext=factory.assertAuthenticatedBootstrapNativeContext,manifest=JSON.parse(await readFile(manifestPath,'utf8')),root=pathToFileURL(resolve(manifest.sourceDirectory)+ '/');if(manifest.sourceDigest!==BOOTSTRAP_PINS.productionSourceDigest)throw Error('FROZEN_NATIVE_SOURCE_REQUIRED');
 const sourcePins=[];for(const name of names){const path='lib/'+name+'.ts',row=manifest.files.find(v=>v.path===path),bytes=await readFile(new URL(path,root));if(!row||sha(bytes)!==row.sha256)throw Error('FROZEN_NATIVE_SOURCE_CHANGED');sourcePins.push({path,sha256:row.sha256});}
 const snapshot=Object.fromEntries(envNames().map(k=>[k,process.env[k]]));for(const k of Object.keys(snapshot))delete process.env[k];process.env.NODE_ENV='test';
 const hook=registerHooks({resolve(specifier,context,next){if(specifier==='@upstash/redis'&&context.parentURL?.startsWith(root.href))return {url:stoppedRedis,shortCircuit:true};return next(specifier,context);}});let sources;
 try{sources=Object.fromEntries(await Promise.all(names.map(async name=>[name,await import(new URL('lib/'+name+'.ts',root).href)])));}catch(error){hook.deregister();throw error;}finally{for(const k of envNames())delete process.env[k];for(const[k,v]of Object.entries(snapshot))if(v!==undefined)process.env[k]=v;}
 let busy=false,closed=false;
 const decode=async response=>{let value;try{value=await response.json();}catch{throw Error('NATIVE_REDIS_RESPONSE_UNCONFIRMED');}if(!value||Object.keys(value).join(',')!=='result')throw Error('NATIVE_REDIS_RESPONSE_UNCONFIRMED');return value.result;};
 return Object.freeze({sources,sourcePins,liveEntryPointBound:false,async withScope(context,callback){
  assertAuthenticatedBootstrapNativeContext(context);if(closed||busy||typeof callback!=='function')throw Error('EXCLUSIVE_LOCAL_NATIVE_SOURCE_SCOPE_REQUIRED');busy=true;
  const before=Object.fromEntries(envNames().map(k=>[k,process.env[k]])),fetchBefore=globalThis.fetch;
  const redis={get:async key=>decode(await context.io.redis(['GET',key],redisHeaders)),eval:async(script,keys,args)=>decode(await context.io.redis(['EVAL',script,keys.length,...keys,...args],redisHeaders))};
  try{
   for(const k of Object.keys(before))delete process.env[k];Object.assign(process.env,{NODE_ENV:'test',VERCEL_ENV:'production',BAZAAR_FREE_DEMO_MODE:'continuous',BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE:'example-text-wire/v3',BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON:JSON.stringify({public:140000,authenticated:80000,recovery:95000,background:45000}),BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',BAZAAR_WORKSPACE_PREFIX:plan.nativePrefixes[0],BAZAAR_MARKET_PREFIX:plan.nativePrefixes[1],BAZAAR_REVIEW_PREFIX:plan.nativePrefixes[2],BAZAAR_MARKET_REVIEW_SECRET:reviewSecret});
   globalThis.fetch=async()=>{throw Error('UNGUARDED_NATIVE_FETCH_FORBIDDEN');};
   const workspace=sources['workspace-store'].createRedisWorkspaceStore(redis,plan.nativePrefixes[0]),market=sources['marketplace-store'].createMarketStore(redis,plan.nativePrefixes[1]),review=sources['provider-review-redis'].createRedisReviewStore(redis,plan.nativePrefixes[2],sources['provider-self-listing'].validateReviewState);
   sources['workspace-store'].setWorkspaceStoreForTests(workspace);sources['marketplace-store'].setMarketStoreForTests(market);await sources['provider-self-listing'].setReviewStoreForTests(review);
   return await callback(Object.freeze({sources,redis,workspace,market,review}));
  }finally{sources['workspace-store'].setWorkspaceStoreForTests(undefined);sources['marketplace-store'].setMarketStoreForTests(undefined);await sources['provider-self-listing'].setReviewStoreForTests(undefined);globalThis.fetch=fetchBefore;for(const k of envNames())delete process.env[k];for(const[k,v]of Object.entries(before))if(v!==undefined)process.env[k]=v;busy=false;}
 },dispose(){if(busy)throw Error('NATIVE_SCOPE_BUSY');closed=true;hook.deregister();}});
}
