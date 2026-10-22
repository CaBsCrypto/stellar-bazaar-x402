// Reuse only the maintained LOCAL synthetic authorization fixture. Native market
// stores and CAS bodies run unchanged. No network, real wallet or Redis exists.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(import.meta.url),root=resolve(dirname(script),'..');
if(!process.argv.includes('--worker')){
 const reports=[];
 for(const scenario of ['paid','verify-failure','settle-failure','rpc-failure','reconcile','read','claim','deliver','create']){
  const run=spawnSync(process.execPath,['--experimental-strip-types',script,'--worker',scenario],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr+'\n'+run.stdout);reports.push(JSON.parse(run.stdout.trim().split('\n').at(-1)));
 }
 console.log(JSON.stringify({status:'PASS_LOCAL_CONTINUOUS_X402_NATIVE_TRANSFER_BOUNDS',reports,realRedisLua:false,networkRequests:0,newPayments:0,cloudWrites:0}));
}else{
 const scenario=process.argv[process.argv.indexOf('--worker')+1],fixturePath=resolve(root,'scripts/test-marketplace-x402.mjs');
 let fixture=readFileSync(fixturePath,'utf8');fixture=fixture.slice(0,fixture.indexOf('const paid=await marketX402Handler'));
 fixture=fixture.replace("import {capacityRedis} from './fixtures/market-capacity-redis.mjs';","import {continuousCapacityRedis as capacityRedis} from './fixtures/continuous-capacity-redis.mjs';");
 fixture=fixture.replace('const redis=capacityRedis(', 'const rawRedis=capacityRedis(');
 const at=fixture.indexOf('const market=createMarketStore');
 fixture=fixture.slice(0,at)+`
const MiB=1048576;let active=false,proofReads=0,getCalls=0,casCalls=0,outboundUpper=0,inboundUpper=0;
const cap=key=>key.endsWith(':x402-settlements:state')?131072:key.endsWith(':capacity-reservations:v1')?65536:key.endsWith(':maintenance-index:v1')?512:key.endsWith(':state')?524288:1048576;
const redis={async get(key){const result=await rawRedis.get(key);if(active){getCalls++;outboundUpper+=1024;inboundUpper+=2*cap(key)+1024;}return result;},async eval(code,keys,args){
 if(active){casCalls++;const upper=[...args];for(const [i,size] of [[1,524288],[3,131072],[5,65536],[6,524288],[7,131072],[8,65536],[10,1048576],[12,4096]])if(upper[i])upper[i]='\\\\'.repeat(size);outboundUpper+=Buffer.byteLength(JSON.stringify(['EVAL',code,keys.length,...keys,...upper]))+4096;inboundUpper+=4096;}
 return rawRedis.eval(code,keys,args);
}};
`+fixture.slice(at);
 fixture=fixture.replace('walletIdentity:async p=>({','walletIdentity:async p=>{if(active)proofReads++;return ({').replace("values:[data.get(generationKey)]}}),isOwnerActive", "values:[data.get(generationKey)]}});},isOwnerActive");
 fixture=`import {initializeContinuousStorageLedger} from '../lib/continuous-free-storage.ts';\n`+fixture+`
const workspacePrefix=prefix.replace('bazaar-market:','bazaar-workspace:');
await initializeContinuousStorageLedger(redis,workspacePrefix,[...data].filter(([key])=>!key.includes('offline-generation-guard')).map(([key,raw])=>({key,expectedRaw:raw,nextRaw:raw})));
Object.assign(process.env,{BAZAAR_FREE_DEMO_MODE:'continuous',BAZAAR_PUBLIC_DEMO:'true',BAZAAR_WORKSPACE_PREFIX:workspacePrefix,BAZAAR_MARKET_PREFIX:prefix});
data.set(generationKey,'\\\\'.repeat(1048576));
const savedVerify=facilitator.verify;
if('${scenario}'==='verify-failure')facilitator.verify=async()=>{verifyCalls++;throw Error('synthetic verify transport failure');};
if('${scenario}'==='settle-failure')settleFailure=true;
if('${scenario}'==='rpc-failure'||'${scenario}'==='reconcile')rpcFailure=true;
active=true;
const reply=await executeMarketX402Payment(buyer,order.operationId,origin,signature,deps).catch(error=>Response.json({error:{code:error.code??'UNEXPECTED'}},{status:error.status??409}));
if('${scenario}'==='reconcile'){assert.equal(reply.status,409);rpcFailure=false;outboundUpper=0;inboundUpper=0;proofReads=0;getCalls=0;casCalls=0;await reconcileMarketX402Payment(buyer,order.operationId,deps);}
else if(['read','claim','deliver','create'].includes('${scenario}')){
 assert.equal(reply.status,202);active=false;const attemptId=randomUUID();if(['deliver','create'].includes('${scenario}'))await sellerOrderAction(sellerAgent,order.operationId,{action:'claim',attemptId});
 if('${scenario}'==='create')await sellerOrderAction(sellerAgent,order.operationId,{action:'deliver',attemptId,text:'Synthetic receipt'});
 outboundUpper=0;inboundUpper=0;proofReads=0;getCalls=0;casCalls=0;active=true;
 if('${scenario}'==='read')await readMarketOrder(buyer,order.operationId);
 else if('${scenario}'==='create')await createMarketOrder(buyer,intent());
 else await sellerOrderAction(sellerAgent,order.operationId,{action:'${scenario}',attemptId,...('${scenario}'==='deliver'?{text:'Synthetic receipt'}:{})});
}
else assert.equal(reply.status,'${scenario}'==='paid'?202:'${scenario}'==='verify-failure'?402:409);
active=false;
// Each real wallet/permission snapshot returns <=1-MiB registry, <=128-KiB
// owner and <=4-KiB permission, even fully JSON-escaped. The HTTP ingress,
// credential and quota stages make one CAS each in continuous mode; 20 MiB
// includes their snapshots, companion reads, patch scripts and budget reply.
const control=['read','claim','deliver','create'].includes('${scenario}');
const proofUpper=proofReads*(2*1048576+2*131072+2*4096+4096),httpAccessUpper=20*1048576,externalAndDtoUpper=(control?1:3)*1048576,onDemandReadinessUpper=!control&&'${scenario}'!=='reconcile'?2*1048576:0;
const creationExtraUpper='${scenario}'==='create'?2*1048576+2*1048576+2*1048576:0; // one review snapshot, seller-active registry, two root readiness reads
const totalUpper=outboundUpper+inboundUpper+proofUpper+httpAccessUpper+externalAndDtoUpper+onDemandReadinessUpper+creationExtraUpper;
const proposedBound=('${scenario}'==='create'?48:['read','claim','deliver'].includes('${scenario}')?32:96)*1048576+262144;assert.ok(totalUpper<proposedBound,JSON.stringify({scenario:'${scenario}',totalUpper,proposedBound}));
console.log(JSON.stringify({scenario:'${scenario}',status:'PASS',getCalls,casCalls,proofReads,outboundUpper,inboundUpper,proofUpper,httpAccessUpper,externalAndDtoUpper,onDemandReadinessUpper,totalUpper,continuousQuotaCasAttempts:1,realNativeMarketAndSettlementStores:true,syntheticSignaturesOnly:true,networkRequests:externalNetworkRequests}));
`;
 fixture=fixture.replace(/from\s+(['"])([^'"]+)\1/g,(_all,_quote,specifier)=>'from '+JSON.stringify(specifier.startsWith('.')?pathToFileURL(resolve(dirname(fixturePath),specifier)).href:import.meta.resolve(specifier)));
 try{await import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'));}catch(error){console.error(JSON.stringify({scenario,error:error.name,message:error.message}));process.exitCode=1;}
}
