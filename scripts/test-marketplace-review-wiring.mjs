import assert from 'node:assert/strict';
import {getReviewRedis,getReviewPrefix,reviewSharedConfigured,setReviewRedisForTests} from '../lib/provider-review-runtime.ts';
const names=['BAZAAR_ENABLE_MARKETPLACE','BAZAAR_PROVIDER_REVIEW_BACKEND','BAZAAR_REVIEW_PREFIX','BAZAAR_REVIEW_REDIS_REST_URL','BAZAAR_REVIEW_REDIS_REST_TOKEN','BAZAAR_WORKSPACE_REDIS_REST_URL','BAZAAR_WORKSPACE_REDIS_REST_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','BAZAAR_ACCEPTANCE_METER','BAZAAR_OPERATIONAL_METER'];
const old=Object.fromEntries(names.map(name=>[name,process.env[name]])),originalFetch=globalThis.fetch;
const prefix='bazaar-review:pilot-be8432d7255e0a3b0dca564d8aa769a0',requests=[];
globalThis.fetch=async(url,options)=>{requests.push({url:String(url),authorization:new Headers(options.headers).get('authorization'),body:JSON.parse(options.body)});return Response.json({result:null});};
Object.assign(process.env,{BAZAAR_ENABLE_MARKETPLACE:'false',BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',BAZAAR_REVIEW_PREFIX:prefix,BAZAAR_REVIEW_REDIS_REST_URL:'https://legacy-review.invalid',BAZAAR_REVIEW_REDIS_REST_TOKEN:'legacy-synthetic',BAZAAR_WORKSPACE_REDIS_REST_URL:'https://workspace-review.invalid',BAZAAR_WORKSPACE_REDIS_REST_TOKEN:'workspace-synthetic',UPSTASH_REDIS_REST_URL:'https://generic.invalid',UPSTASH_REDIS_REST_TOKEN:'generic-synthetic',KV_REST_API_URL:'https://alias.invalid',KV_REST_API_TOKEN:'alias-synthetic',BAZAAR_ACCEPTANCE_METER:'false',BAZAAR_OPERATIONAL_METER:'false'});
try{
 setReviewRedisForTests(undefined);
 await getReviewRedis().get(prefix+':state');assert.equal(new URL(requests.at(-1).url).origin,'https://legacy-review.invalid');assert.equal(requests.at(-1).authorization,'Bearer legacy-synthetic');assert.equal(requests.at(-1).body[1],prefix+':state');
 process.env.BAZAAR_ENABLE_MARKETPLACE='true';
 await getReviewRedis().get(prefix+':state');assert.equal(new URL(requests.at(-1).url).origin,'https://workspace-review.invalid');assert.equal(requests.at(-1).authorization,'Bearer workspace-synthetic');assert.equal(requests.at(-1).body[1],prefix+':state');assert.equal(getReviewPrefix(),prefix);
 const before=requests.length;
 for(const key of ['BAZAAR_WORKSPACE_REDIS_REST_URL','BAZAAR_WORKSPACE_REDIS_REST_TOKEN']){const value=process.env[key];delete process.env[key];assert.throws(getReviewRedis,/REVIEW_REDIS_REQUIRED/);assert.equal(reviewSharedConfigured(),false);process.env[key]=value;}
 for(const url of ['http://workspace-review.invalid','https://user:pass@workspace-review.invalid','https://workspace-review.invalid?secret=x','https://workspace-review.invalid#fragment']){process.env.BAZAAR_WORKSPACE_REDIS_REST_URL=url;assert.throws(getReviewRedis,/INVALID_REVIEW_REDIS_URL/);}process.env.BAZAAR_WORKSPACE_REDIS_REST_URL='https://workspace-review.invalid';
 for(const backend of ['file',undefined]){backend===undefined?delete process.env.BAZAAR_PROVIDER_REVIEW_BACKEND:process.env.BAZAAR_PROVIDER_REVIEW_BACKEND=backend;assert.throws(getReviewRedis,/REVIEW_REDIS_REQUIRED/);}
 assert.equal(requests.length,before,'Missing/bad marketplace config never contacts fallback Redis');
 process.env.BAZAAR_ENABLE_MARKETPLACE='false';process.env.BAZAAR_PROVIDER_REVIEW_BACKEND='file';assert.equal(getReviewRedis(),null);delete process.env.BAZAAR_PROVIDER_REVIEW_BACKEND;assert.equal(getReviewRedis(),null);
 process.env.BAZAAR_PROVIDER_REVIEW_BACKEND='redis';delete process.env.BAZAAR_REVIEW_REDIS_REST_TOKEN;assert.throws(getReviewRedis,/REVIEW_REDIS_REQUIRED/,'Legacy mode never aliases workspace credentials');
 console.log(JSON.stringify({status:'PASS',marketplaceUsesExplicitWorkspaceRedis:true,existingReviewPrefixAndKeyPreserved:true,legacyModeUnchanged:true,missingConfigNeverFallsBack:true,externalNetworkRequests:0}));
}finally{globalThis.fetch=originalFetch;setReviewRedisForTests(undefined);for(const[name,value]of Object.entries(old))value===undefined?delete process.env[name]:process.env[name]=value;}
