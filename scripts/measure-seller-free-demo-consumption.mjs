import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createWorkerRedisCommands,createSellerRedisSecretStore} from '../examples/seller-redis-secret-store.mjs';
import {sellerCanonical,sellerHash} from '../examples/seller-service-card.mjs';
import {fixture,config,started} from './fixtures/seller-hosted.mjs';
import {sellerRedisMemory} from './fixtures/seller-redis-memory.mjs';
const deadline=new Date(started+86400000).toISOString();
let f;const clock=()=>f?.clock??started,memory=sellerRedisMemory(clock),plain=new Map();
const bindingHash=sellerHash(sellerCanonical({bazaarOrigin:config.bazaarOrigin,ownerId:config.ownerId,agentId:config.agentId,cardHash:config.cardHash,allowedOrigins:config.allowedOrigins,agentAccessHash:sellerHash(config.agentAccess),providerAccessHash:sellerHash(config.providerAccess)}));
function createStore(){
 const command=createWorkerRedisCommands({url:'https://synthetic.upstash.io',token:'PRIVATE_SYNTHETIC_TOKEN',fetcher:async(url,init)=>Response.json({result:memory.execute(JSON.parse(init.body))})});
 const actual=createSellerRedisSecretStore({command,prefix:'bazaar-seller:preview-'+'a'.repeat(32),key:Buffer.alloc(32,8).toString('base64url'),bindingHash,now:clock});
 return {...actual,values:plain,write:async(name,value)=>{await actual.write(name,value);plain.set(name,structuredClone(value));}};
}
const subtract=(a,b)=>({restRequests:a.restRequests-b.restRequests,executionsIncludingEval:a.executionsIncludingEval-b.executionsIncludingEval,topLevel:Object.fromEntries(Object.keys(a.topLevel).map(k=>[k,a.topLevel[k]-(b.topLevel[k]??0)])),lua:Object.fromEntries(Object.keys(a.lua).map(k=>[k,a.lua[k]-(b.lua[k]??0)]))});
f=fixture({orders:[],store:createStore()});
const samples=[];
for(let tick=0;tick<360;tick++){
 // Every serverless invocation gets a fresh store, preserving only Redis.
 const store=createStore(),before=memory.snapshot();
 const result=await f.run({store,freeDemoAdmissionUntil:deadline});
 assert.equal(result.reason,'idle');assert.equal(result.providerRequests,0);assert.equal(result.executed,0);assert.equal(result.identityCacheHit,result.identityRequests===0);
 const sample=subtract(memory.snapshot(),before);samples.push({...sample,mcpHttpRequests:result.mcpRequests,identityRequests:result.identityRequests});store.dispose();f.clock+=240000;
}
const active=memory.snapshot();
let before=memory.snapshot(),store=createStore();const close=await f.run({store,freeDemoAdmissionUntil:deadline});store.dispose();
assert.equal(close.reportedCapacityReady,false);assert.equal(plain.get('seller.hosted.tick').freeDemoDrain.complete,true);
const closeCost=subtract(memory.snapshot(),before);
before=memory.snapshot();store=createStore();const idle=await f.run({store,freeDemoAdmissionUntil:deadline});store.dispose();
const drainCost=subtract(memory.snapshot(),before);assert.equal(idle.reason,'drained');assert.equal(drainCost.restRequests,1);assert.equal(drainCost.executionsIncludingEval,1);assert.equal(idle.mcpRequests,0);
const warm=samples.find(s=>s.identityRequests===0),refresh=samples.find((s,i)=>i>0&&s.identityRequests===1);
const evidence={schema:'bazaar.free-demo-worker-consumption/v1',evidenceNonce:randomUUID(),recordedAt:new Date().toISOString(),status:'PASS_OFFLINE_ENCRYPTED_REDIS_STORE',externalRequests:0,cloudWrites:0,payments:0,productionValidated:false,billableSemanticsVerified:false,method:'actual hosted worker, SDK and encrypted store; fixed REST transport with isolated Lua evaluator; fresh store every invocation',cadence:'*/4 * * * *',windowHours:24,ticks:360,mcpHttpRequests:samples.reduce((sum,s)=>sum+s.mcpHttpRequests,0),identityRefreshes:samples.reduce((sum,s)=>sum+s.identityRequests,0),worker24h:active,cold:samples[0],warm,refresh,closedDrainScan:closeCost,drained:drainCost};
const sources=['examples/seller-hosted-tick.mjs','examples/seller-hosted-handler.mjs','examples/seller-redis-secret-store.mjs','scripts/measure-seller-free-demo-consumption.mjs','scripts/fixtures/seller-hosted.mjs','scripts/fixtures/seller-redis-memory.mjs','scripts/fixtures/free-demo-provider-server.ts.txt'];
evidence.sources=Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
if(process.argv[2]==='--write-evidence')await writeFile('docs/evidence/seller-free-demo-offline-consumption-2026-10-11.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
