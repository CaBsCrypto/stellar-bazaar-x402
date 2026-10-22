import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {checkCorrectiveIdentityTransport,createIdentityTransportFetcher} from '../.vercel/readiness-guard-fix-isolated-production-identity-transport.mjs';
import {CORRECTIVE_PUBLIC_VALIDATION as C,checkCorrectivePrivateIdentity} from './validate-isolated-readiness-production-public.mjs';
import {PRODUCTION_PURCHASE_POLICY as B} from './on-demand-production-purchase.mjs';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(f,re)=>{await assert.rejects(f,re);checks++;},sha=s=>createHash('sha256').update(s).digest('hex'),now=Date.now(),at=new Date(now).toISOString();
const context={ownerId:'ow_'+'11'.repeat(16),agentId:'agent_'+'11'.repeat(16),generation:1,agentAccess:'A'.repeat(43)},policy={...B,ownerFingerprint:sha(context.ownerId)},identity={httpStatus:200,ownerId:context.ownerId,agentId:context.agentId,generation:1};
const bazaar={status:'READY_READINESS_GUARD_FIX_PRODUCTION_PENDING_ACCEPTANCE',planHash:C.releasePlanHash,reviewHash:C.reviewHash,supplementalReviewHash:C.supplementalReviewHash,validationFamily:C.validationFamily,validationPreviewPlanHash:C.validationPreviewPlanHash,sourceDigest:C.sourceDigest,manifestSha256:C.manifestSha256,projectId:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',readyState:'READY',target:'production',metadataStage:'production',deploymentId:'dpl_OfflineIdentityCorrective',url:'https://stellar-bazaar-x402-offlineidentity-cabscryptocontacto-6028s-projects.vercel.app',canonicalOrigin:C.origin,canonicalAssigned:true,productionPublished:true,generalPurchasesEnabled:false,projectEnvironmentReferencesUnchanged:true,providerUnchanged:true,providerSourceDigest:C.providerSourceDigest,providerDeploymentId:C.providerDeploymentId,crons:[{path:'/api/market/guardian/tick',schedule:'0 * * * *'}],environmentWrites:0,providerDeployments:0,storageInitializations:0,newPayments:0,signatures:0,dpapiReads:0,secretValuesInOutput:0,ownerIdsInOutput:0};
const provider={status:'CANONICAL_ON_DEMAND_PRODUCTION_READY_ACCEPTANCE_PENDING',kind:'provider',planHash:B.planHash,reviewHash:B.reviewHash,sourceDigest:C.providerSourceDigest,deploymentId:C.providerDeploymentId,readyState:'READY',target:'production',canonicalOrigin:'https://ai-video-scriptwriter.vercel.app',generalPurchasesEnabled:false,newPayments:0,crons:[]};
const protection={status:'PASS_READINESS_GUARD_FIX_PRODUCTION_PUBLIC_READBACK',releasePlanHash:C.releasePlanHash,reviewHash:C.reviewHash,supplementalReviewHash:C.supplementalReviewHash,validationFamily:C.validationFamily,validationPreviewPlanHash:C.validationPreviewPlanHash,environmentReferencesUnchanged:true,sourceDigest:C.sourceDigest,deploymentId:bazaar.deploymentId,url:bazaar.url,providerSourceDigest:C.providerSourceDigest,providerDeploymentId:C.providerDeploymentId,originalSsoPreserved:true,newImmutableHostAllowed:true,oldImmutableHostBlocked:true,publicConditionGroups:22,temporaryMcpExceptionActive:false,otherPreviewHostsPreserved:true,noSystemBypasses:true,activeProtectionsHash:'a'.repeat(64),newPayments:0,observedAt:at},receipts={bazaar,provider,protection};
const publicEvidence={status:'PASS_CORRECTIVE_PUBLIC_DISCOVERY_QR_DECODE_PENDING',sourceDigest:C.sourceDigest,deploymentId:bazaar.deploymentId,correctiveReleasePlanHash:C.releasePlanHash,privateAccountBindingPreserved:false};
const url=C.origin+'/api/mcp',body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_bazaar_identity',arguments:{}}}),init={method:'POST',headers:{authorization:'Bearer '+context.agentAccess,'content-type':'application/json',accept:'application/json'},body,redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)};
// Real SDK negotiation and request processing, in memory: no socket/server/network.
const sdkCalls=[];const sdkFetch=async(u,i)=>{sdkCalls.push({url:u,headers:new Headers(i.headers),method:i.method});const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true}),server=new McpServer({name:'offline-identity-fixture',version:'1'});server.registerTool('get_bazaar_identity',{inputSchema:{}},async()=>({content:[{type:'text',text:JSON.stringify(identity)}],structuredContent:identity}));await server.connect(transport);try{return await transport.handleRequest(new Request(u,i));}finally{await server.close();}};
await reject(()=>checkCorrectivePrivateIdentity(receipts,publicEvidence,context,{fetcher:sdkFetch,now:()=>now,policy}),/IDENTITY_TRANSPORT/);eq(sdkCalls.length,1);eq(sdkCalls[0].headers.get('accept'),'application/json');
const result=await checkCorrectiveIdentityTransport(receipts,publicEvidence,context,{fetcher:sdkFetch,now:()=>now,policy});eq(result.status,'PASS_REAL_SEALED_CORRECTIVE_BUYER_IDENTITY');eq(result.authenticatedRequests,1);eq(result.ownerFingerprint,policy.ownerFingerprint);eq(sdkCalls.length,2);eq(sdkCalls[1].headers.get('accept'),'application/json, text/event-stream');eq(sdkCalls[1].headers.get('authorization'),'Bearer '+context.agentAccess);eq(result.newOrders,0);eq(result.newPayments,0);eq(result.signatures,0);
for(const s of [context.agentAccess,context.ownerId,context.agentId])eq(JSON.stringify(result).includes(s),false);
let adaptedCalls=0,lastInit;const wrapped=createIdentityTransportFetcher(async(u,i)=>{adaptedCalls++;eq(u,url);lastInit=i;return Response.json({jsonrpc:'2.0',id:1,result:{structuredContent:identity}});},context);
await wrapped.fetcher(url,init);eq(adaptedCalls,1);eq(new Headers(lastInit.headers).get('accept'),'application/json, text/event-stream');eq(lastInit.body,init.body);eq(lastInit.method,init.method);eq(lastInit.redirect,init.redirect);eq(lastInit.credentials,init.credentials);eq(lastInit.cache,init.cache);eq(new Headers(init.headers).get('accept'),'application/json');
await reject(()=>wrapped.fetcher(url,init),/ONE|ONCE|BOUND|EXACT|REQUEST/);eq(adaptedCalls,1);
const summary=wrapped.summary();for(const s of [context.agentAccess,context.ownerId,context.agentId])eq(JSON.stringify(summary).includes(s),false);eq(JSON.stringify(summary).includes('Bearer'),false);
for(const patch of [
 {url:'https://foreign.invalid/api/mcp'}, {url:url+'?token=secret'},
 {init:{method:'GET'}}, {init:{redirect:'follow'}}, {init:{credentials:'include'}},
 {init:{body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'create_market_order',arguments:{}}})}},
 {init:{body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_bazaar_identity',arguments:{}}})}},
 {init:{headers:{...init.headers,authorization:'Bearer '+'B'.repeat(43)}}},
 {init:{headers:{...init.headers,cookie:'private=secret'}}},
 {init:{headers:{...init.headers,'x-vercel-protection-bypass':'secret'}}},
 {init:{headers:{...init.headers,'content-type':'text/plain'}}},
 {init:{body:'x'.repeat(65537)}}
]){let calls=0;const f=createIdentityTransportFetcher(async()=>{calls++;return Response.json({});},context);await reject(()=>f.fetcher(patch.url??url,{...init,...patch.init}),/IDENTITY|EXACT|BOUND|HEADER|TRANSPORT|REQUEST|CANONICAL|ONCE/);eq(calls,0);}
for(const reply of [
 ()=>new Response(null,{status:406}),
 ()=>new Response(null,{status:307,headers:{location:'https://vercel.com/login'}}),
 ()=>Response.json({jsonrpc:'2.0',id:1,result:{structuredContent:identity}},{headers:{'mcp-session-id':'unexpected'}}),
 ()=>Response.json({jsonrpc:'2.0',id:2,result:{structuredContent:identity}}),
 ()=>Response.json({jsonrpc:'2.0',id:1,result:{isError:true,structuredContent:identity}}),
 ()=>Response.json({jsonrpc:'2.0',id:1,result:{structuredContent:{...identity,generation:2}}}),
 ()=>Response.json({jsonrpc:'2.0',id:1,result:{structuredContent:identity,content:[{type:'text',text:JSON.stringify({...identity,httpStatus:201})}]}}),
 ()=>new Response(context.agentAccess),
 ()=>new Response('x'.repeat(65537))
]){let calls=0;await reject(()=>checkCorrectiveIdentityTransport(receipts,publicEvidence,context,{fetcher:async()=>{calls++;return reply();},now:()=>now,policy}),/IDENTITY|BOUND|CONTENT|TRANSPORT|RESPONSE/);eq(calls,1);}
let invalidCalls=0;await reject(()=>checkCorrectiveIdentityTransport(receipts,publicEvidence,context,{fetcher:async()=>{invalidCalls++;return Response.json({});},now:()=>now}),/SEALED|IDENTITY|CONTEXT/);eq(invalidCalls,0);
console.log(JSON.stringify({status:'PASS_OFFLINE_CORRECTIVE_IDENTITY_ACCEPT_NEGOTIATION',checks,realSdkNegotiationTested:true,networkRequests:0,dpapiReads:0,newOrders:0,newPayments:0,signatures:0,providerExecutions:0}));
