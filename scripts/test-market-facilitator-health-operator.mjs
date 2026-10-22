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
const require=createRequire(import.meta.url),token='u'.repeat(43),other='v'.repeat(43);
Object.assign(process.env,{BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_MARKET_OPERATOR_HASH:createHash('sha256').update(token).digest('hex'),BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://operator.example',NEXT_PUBLIC_APP_URL:'https://operator.example'});
for(const k of ['VERCEL','BAZAAR_OPERATIONAL_METER','BAZAAR_ACCEPTANCE_METER','BAZAAR_FREE_DEMO_MODE'])delete process.env[k];
let probes=0,queueReads=0,paymentProbes=0;
const source=ts.transpileModule(await readFile(new URL('../lib/marketplace-http.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={},mapping={
 'node:crypto':require('node:crypto'),'zod':require('zod'),
 './marketplace.ts':{marketOperator,assertMarketEnabled:()=>{}},
 './workspace-http.ts':{assertWorkspaceRequest,workspaceFailure,workspaceHeaders},
 './workspace-types.ts':{WorkspaceError},
 './market-pagination.ts':{assertMarketDto},
 './market-facilitator-health.ts':{inspectMarketFacilitatorConfiguration:async()=>{probes++;return {status:'available',protocolAdvertised:true,credentialValidated:false};}},
 './marketplace-x402.ts':{inspectMarketPaymentVerification:async operationId=>{paymentProbes++;return {operationId,isValid:false,stage:'verify'};}},
 './provider-self-listing.ts':{listProviderSubmissionsForOperator:async()=>{queueReads++;return {ok:true,value:{submissions:[]}};}}
};
vm.runInNewContext(source,{exports,require:n=>mapping[n]??{},process,Request,Response,URL,Buffer,console},{filename:'marketplace-http.ts'});
const get=async(query,auth)=>exports.marketHandlers.review(new Request('https://operator.example/api/market/review'+query,{headers:auth?{authorization:'Bearer '+auth}:{}}));
for(const auth of [undefined,other]){const r=await get('?diagnostic=facilitator',auth);assert.equal(r.status,401);assert.equal(probes,0);}
for(const query of ['?diagnostic=other','?diagnostic=facilitator&diagnostic=facilitator','?diagnostic=facilitator&page=1','?diagnostic=facilitator&url=https://attacker.example']){const r=await get(query,token);assert.equal(r.status,400);assert.equal(probes,0);}
const good=await get('?diagnostic=facilitator',token);assert.equal(good.status,200);assert.equal(probes,1);assert.equal(queueReads,0);assert.equal((await good.json()).facilitator.credentialValidated,false);
assert.equal((await get('',token)).status,200);assert.equal(queueReads,1);assert.equal(probes,1);
for(const auth of [undefined,other]){assert.equal((await get('?diagnostic=payment&operationId=31c97193-be74-4b9d-b0a3-f3890b0a41e8',auth)).status,401);assert.equal(paymentProbes,0);}
for(const query of ['?diagnostic=payment','?diagnostic=payment&operationId=invalid','?diagnostic=payment&operationId=31c97193-be74-4b9d-b0a3-f3890b0a41e8&url=https://attacker.example','?diagnostic=payment&operationId=31c97193-be74-4b9d-b0a3-f3890b0a41e8&operationId=31c97193-be74-4b9d-b0a3-f3890b0a41e8']){assert.equal((await get(query,token)).status,400);assert.equal(paymentProbes,0);}
assert.equal((await get('?diagnostic=payment&operationId=31c97193-be74-4b9d-b0a3-f3890b0a41e8',token)).status,200);assert.equal(paymentProbes,1);assert.equal(probes,1);
console.log(JSON.stringify({status:'PASS_OPERATOR_ONLY_FACILITATOR_HEALTH',cases:15,realOperatorAuthentication:true,networkRequests:0,probesForUnauthorized:0,payments:0}));
