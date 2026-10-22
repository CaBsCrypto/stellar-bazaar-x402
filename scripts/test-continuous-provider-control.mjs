import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {continuousProviderPreviewControl,safeContinuousControlFailure} from '../.vercel/continuous-provider-preview-prepared.mjs';
import {createSellerCard} from '../examples/seller-service-card.mjs';

// No encrypted profile, CLI, deployment, credential or cloud request is used.
const source=createSellerCard({id:'synthetic-continuous-review',name:'Synthetic review',description:'Offline prepared control review',providerName:'Fixture',providerOrigin:'https://synthetic-provider.vercel.app',destination:'GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C'});
const config={...source,bazaarOrigin:'https://synthetic-old.vercel.app',ownerId:'ow_synthetic',agentId:'agent_synthetic',allowedOrigins:[source.card.url],controlProof:{method:'http-well-known',domain:'synthetic-provider.vercel.app'},agentAccess:'a'.repeat(43),providerAccess:'b'.repeat(43)};
const profile={purpose:'bazaar-hosted-seller-preview',prefix:'bazaar-seller:preview-2dea99ac5bc7c7b0896f57f97d94adaa',aclValidation:{status:'PASS'},config,redisUrl:'https://synthetic.upstash.io',redisToken:'SYNTHETIC_REDIS_ACCESS',key:Buffer.alloc(32,7).toString('base64url'),cronSecret:'c'.repeat(43),bazaarProtection:'d'.repeat(32),providerProtection:'e'.repeat(32)};
const bazaarOrigin='https://synthetic-new.vercel.app',prior=globalThis.fetch;let networkRequests=0,checks=0;
globalThis.fetch=async()=>{networkRequests++;throw Error('PREPARED_REVIEW_NETWORK_FORBIDDEN');};
try{
 const result=await continuousProviderPreviewControl({profile,action:'prepare',bazaarOrigin});
 assert.equal(result.status,'PREPARED_NOT_APPLIED');assert.equal(result.bazaarOrigin,bazaarOrigin);assert.deepEqual(result.previewCronSchedules,[]);assert.equal(result.proposedProductionCron.activation,'NOT_APPLIED');assert.equal(result.payments,0);assert.equal(result.productionPublished,false);assert.equal(result.cronActivated,false);checks++;
 assert.equal(profile.config.bazaarOrigin,'https://synthetic-old.vercel.app');assert.equal(profile.config.cardHash,config.cardHash);checks++;
 const text=JSON.stringify(result);for(const value of [profile.redisToken,profile.key,profile.cronSecret,profile.config.agentAccess,profile.config.providerAccess,profile.bazaarProtection,profile.providerProtection])assert.ok(!text.includes(value));checks++;
 for(const origin of ['https://bazaar.browns.studio','http://synthetic-new.vercel.app',bazaarOrigin+'/catalogo',bazaarOrigin+'?private=fixture',bazaarOrigin+':444'])await assert.rejects(continuousProviderPreviewControl({profile,action:'prepare',bazaarOrigin:origin}),/PREVIEW_ORIGIN_REQUIRED/);checks++;
 for(const patch of [{purpose:'production'},{prefix:'bazaar-seller:production-'+'a'.repeat(32)},{aclValidation:{status:'UNCONFIRMED'}},{redisToken:''}])await assert.rejects(continuousProviderPreviewControl({profile:{...profile,...patch},action:'prepare',bazaarOrigin}),/EXISTING_SCOPED_PREVIEW_PROFILE_REQUIRED/);checks++;
 await assert.rejects(continuousProviderPreviewControl({profile,action:'enable-cron',bazaarOrigin}),/PREPARED_ACTION_REQUIRED/);checks++;
 const wrapper=await readFile(new URL('../.vercel/continuous-provider-preview-prepared.ps1',import.meta.url),'utf8');assert.match(wrapper,/EnvironmentVariables\.Clear\(\)/);assert.match(wrapper,/StandardInput\.BaseStream\.Write/);assert.doesNotMatch(wrapper,/ExecutionPolicy|Bypass|Write-Host|\.env/);checks++;
 const diagnostic=safeContinuousControlFailure(Error('MCP_HTTP_403'),'authenticated-mcp-connection');assert.equal(diagnostic.code,'MCP_HTTP_403');assert.equal(diagnostic.stage,'authenticated-mcp-connection');assert.equal(diagnostic.privateDetailsReturned,false);checks++;
 for(const message of ['PRIVATE TOKEN '+profile.redisToken,'https://synthetic.example/?token='+profile.config.agentAccess,'A'.repeat(65),'camelCaseError']){const failure=safeContinuousControlFailure(Error(message),'arbitrary-private-stage');assert.equal(failure.code,'PREVIEW_ACTION_UNCONFIRMED_REQUIRES_READ_REVIEW');assert.equal(failure.stage,'public-arguments');assert.ok(!JSON.stringify(failure).includes(message));}checks++;
 assert.equal(networkRequests,0);checks++;
 console.log(JSON.stringify({status:'PASS',checks,syntheticProfileOnly:true,networkRequests,privateProfileReads:0,deployments:0,manualTicks:0,payments:0,productionPublished:false,cronActivated:false}));
}finally{globalThis.fetch=prior;}
