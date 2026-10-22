import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {marketOperator} from '../lib/marketplace.ts';
import {WorkspaceError} from '../lib/workspace-types.ts';
import {assertWorkspaceRequest,workspaceFailure,workspaceHeaders} from '../lib/workspace-http.ts';
import {assertMarketDto} from '../lib/market-pagination.ts';
import * as diagnosticOrigin from '../lib/market-operator-diagnostic-origin.ts';
const require=createRequire(import.meta.url),token='u'.repeat(43),other='v'.repeat(43);
const canonical='https://bazaar.browns.studio',host='stellar-bazaar-x402-offlineabc-cabscryptocontacto-6028s-projects.vercel.app',staged='https://'+host;
const originalEnv={...process.env};let checks=0,health=0,payments=0,queues=0,authCalls=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const base={BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:canonical,BAZAAR_MARKET_OPERATOR_HASH:createHash('sha256').update(token).digest('hex'),VERCEL:'1',VERCEL_ENV:'production',VERCEL_URL:host,VERCEL_PROJECT_ID:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',BAZAAR_ENABLE_MARKET_PURCHASES:'false'};
function environment(patch={}){for(const key of [...Object.keys(base),'BAZAAR_OPERATIONAL_METER','BAZAAR_ACCEPTANCE_METER','BAZAAR_FREE_DEMO_MODE'])delete process.env[key];for(const[key,value]of Object.entries({...base,...patch}))if(value!==undefined)process.env[key]=value;}
environment();
const source=ts.transpileModule(await readFile(new URL('../lib/marketplace-http.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={};
const mapping={
 'node:crypto':require('node:crypto'),'zod':require('zod'),
 './marketplace.ts':{marketOperator:async auth=>{authCalls++;return marketOperator(auth);},assertMarketEnabled:()=>{}},
 './workspace-http.ts':{assertWorkspaceRequest,workspaceFailure,workspaceHeaders},'./workspace-types.ts':{WorkspaceError},'./market-pagination.ts':{assertMarketDto},
 './market-operator-diagnostic-origin.ts':diagnosticOrigin,
 './market-facilitator-health.ts':{inspectMarketFacilitatorConfiguration:async()=>{health++;return {status:'available',protocolAdvertised:true,credentialValidated:false};}},
 './marketplace-x402.ts':{inspectMarketPaymentVerification:async()=>{payments++;return {stage:'verify',isValid:false,payerMatches:false,newPayments:0,stateWrites:0};}},
 './provider-self-listing.ts':{listProviderSubmissionsForOperator:async()=>{queues++;return {ok:true,value:{submissions:[]}};}}
};
vm.runInNewContext(source,{exports,require:n=>mapping[n]??{},process,Request,Response,URL,Buffer,console},{filename:'marketplace-http.ts'});
const request=(url=staged+'/api/market/review?diagnostic=facilitator',headers={},auth=token,method='GET')=>new Request(url,{method,headers:{host:new URL(url).host,...(auth?{authorization:'Bearer '+auth}:{}),...headers}});
try{
 // Reproduce the published native-origin rejection before the narrow exception.
 assert.throws(()=>assertWorkspaceRequest(request(),true),error=>error.code==='INVALID_REQUEST');checks++;
 const good=await exports.marketHandlers.review(request());eq(good.status,200);eq(health,1);eq(authCalls,1);eq((await good.json()).facilitator.credentialValidated,false);
 const paidQuery='?diagnostic=payment&operationId=31c97193-be74-4b9d-b0a3-f3890b0a41e8';
 eq((await exports.marketHandlers.review(request(staged+'/api/market/review'+paidQuery))).status,200);eq(payments,1);
 eq((await exports.marketHandlers.review(request(undefined,{origin:staged,'x-forwarded-host':host,'x-forwarded-proto':'https','x-forwarded-port':'443'}))).status,200);eq(health,2);
 environment({VERCEL_PROJECT_ID:undefined});eq((await exports.marketHandlers.review(request())).status,200);environment();
 for(const auth of [null,other]){const before=[health,payments,queues,authCalls];eq((await exports.marketHandlers.review(request(undefined,{},auth))).status,401);eq([health,payments,queues],before.slice(0,3));eq(authCalls,before[3]+1);}
 const patches=[{VERCEL:'0'},{VERCEL:undefined},{VERCEL_ENV:'preview'},{VERCEL_ENV:undefined},{BAZAAR_ENABLE_MARKET_PURCHASES:'true'},{BAZAAR_ENABLE_MARKET_PURCHASES:undefined},{VERCEL_URL:undefined},{VERCEL_URL:'https://'+host},{VERCEL_URL:'other.vercel.app'},{VERCEL_PROJECT_ID:'prj_ForeignProject'}];
 for(const patch of patches){environment(patch);const before=[health,payments,queues];eq((await exports.marketHandlers.review(request())).status,400);eq([health,payments,queues],before);}environment();
 for(const headers of [{host:'bazaar.browns.studio'},{host:host+',evil.invalid'},{origin:canonical},{origin:'null'},{forwarded:'host='+host+';proto=https'},{'x-forwarded-host':'evil.invalid'},{'x-forwarded-proto':'http'},{'x-forwarded-port':'8443'}]){const before=[health,payments,queues];eq((await exports.marketHandlers.review(request(undefined,headers))).status,400);eq([health,payments,queues],before);}
 for(const url of ['https://foreign.invalid/api/market/review?diagnostic=facilitator','https://stellar-bazaar-x402-offlineabc-other-team.vercel.app/api/market/review?diagnostic=facilitator','http://'+host+'/api/market/review?diagnostic=facilitator',staged+':8443/api/market/review?diagnostic=facilitator',staged+'/api/market/review?diagnostic=facilitator#secret']){const before=[health,payments,queues];eq((await exports.marketHandlers.review(request(url))).status,400);eq([health,payments,queues],before);}
 for(const query of ['','?page=1','?diagnostic=other','?diagnostic=facilitator&diagnostic=facilitator','?diagnostic=facilitator&page=1','?diagnostic=facilitator&url=https://evil.invalid','?diagnostic=payment','?diagnostic=payment&operationId=31c97193-be74-1b9d-b0a3-f3890b0a41e8','?diagnostic=payment&operationId=31c97193-be74-4b9d-b0a3-f3890b0a41e8&operationId=31c97193-be74-4b9d-b0a3-f3890b0a41e8']){const before=[health,payments,queues];eq((await exports.marketHandlers.review(request(staged+'/api/market/review'+query))).status,400);eq([health,payments,queues],before);}
 for(const method of ['POST','PUT','HEAD']){const before=[health,payments,queues];eq((await exports.marketHandlers.review(request(undefined,{},token,method))).status,400);eq([health,payments,queues],before);}
 // Ordinary canonical review and diagnostics keep the original origin rules.
 environment({VERCEL_ENV:'preview',BAZAAR_ENABLE_MARKET_PURCHASES:'true',VERCEL_URL:'foreign.invalid'});
 eq((await exports.marketHandlers.review(request(canonical+'/api/market/review'))).status,200);eq(queues,1);
 eq((await exports.marketHandlers.review(request(canonical+'/api/market/review?diagnostic=facilitator'))).status,200);
 eq((await exports.marketHandlers.review(request(canonical+'/api/market/review?diagnostic=facilitator',{origin:'https://foreign.invalid'}))).status,400);
 eq((await exports.marketHandlers.review(request(canonical+'/api/market/review?diagnostic=facilitator',{},other))).status,401);
 console.log(JSON.stringify({status:'PASS_OFFLINE_OPERATOR_ONLY_PRIVATE_DIAGNOSTIC_ORIGIN',checks,realOperatorAuthentication:true,realNativeOriginGateReproduced:true,networkRequests:0,credentialReads:0,newOrders:0,newPayments:0,stateWrites:0,frozenFilesEdited:0}));
}finally{for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);}
