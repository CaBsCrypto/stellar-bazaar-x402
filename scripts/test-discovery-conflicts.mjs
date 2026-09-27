import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {services,getService} from '../lib/catalog.ts';
import {toServiceCard,toPaidService} from '../lib/service-card.ts';
import {parseServiceCardShape} from '../lib/service-card-schema.ts';
import {filterServices} from '../lib/discovery.ts';
import {readPublicDiscovery} from '../lib/public-discovery.ts';
import {registerBazaarTools} from '../lib/webmcp/register.ts';
const require=createRequire(import.meta.url);
let ids=[], values=[], writes=0;
class FakeRedis { async smembers(){return ids} async mget(){return values} async eval(){writes++;throw Error('unexpected write')} }
function load(file,deps){
 const module={exports:{}};
 const compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,{module,exports:module.exports,process:{env:{UPSTASH_REDIS_REST_URL:'https://fixture.invalid',UPSTASH_REDIS_REST_TOKEN:'synthetic',BAZAAR_ENABLE_REGISTRY_MUTATIONS:'true',BAZAAR_PROVIDER_SECRET:'synthetic'}},Buffer,require:name=>deps[name]??require(name)});
 return module.exports;
}
const shared={'./catalog.ts':{getService},'./service-card-schema.ts':{parseServiceCardShape}};
const registry=load('lib/dynamic-registry.ts',{...shared,'@upstash/redis':{Redis:FakeRedis},'./canonical-service-card.ts':{computeCanonicalServiceCardHash:()=> 'fixture'}});
const card={...toServiceCard(services[0]),id:'valid-dynamic',name:'Valid dynamic'};
const entry={id:card.id,card,hash:'fixture',revision:1};
const check=async(index,records,available,count)=>{ids=index;values=records;const result=await registry.readDynamicServiceCards();assert.equal(result.available,available);assert.equal(result.entries.length,count);return result};
await check([card.id],[entry],true,1);
await check([card.id,'missing'],[entry,null],false,1);
await check([card.id,'missing'],[entry],false,1);
await check([card.id,'bad'],[entry,{id:'bad',card:{id:'bad'}}],false,1);
await check([card.id,'mismatch'],[entry,{id:'mismatch',card}],false,1);
await check([card.id,card.id],[entry,entry],false,1);
const collision={...entry,id:services[0].id,card:{...toServiceCard(services[0]),name:'Conflicting provider',payment:{...services[0].payment,amount:'99'}}};
await check([card.id,collision.id],[entry,collision],false,1);
assert.equal(values[1],collision,'old record is not mutated or deleted');
assert.equal((await registry.createDynamicServiceCard(collision.card,'fixture')).exists,true);assert.equal(writes,0);
const ingest=load('lib/service-ingest.ts',{...shared,'./dynamic-registry.ts':registry,'./discovery.ts':{validateServiceCard:()=>[]}});
assert.equal((await ingest.createService(collision.card,'synthetic')).error.code,'CARD_EXISTS');assert.equal(writes,0);
const resources=load('app/api/discovery/resources/route.ts',{'next/server':{NextResponse:Response},'@/lib/catalog':{services},'@/lib/discovery':{filterServices},'@/lib/service-card':{toServiceCard,toPaidService},'@/lib/dynamic-registry':registry});
const response=await resources.GET({nextUrl:new URL('http://127.0.0.1/api/discovery/resources')});const body=await response.json();
assert.equal(body.partialResults,true);assert.equal(body.dynamicRegistry,'unavailable');
assert.equal(body.results.filter(item=>item.id===collision.id).length,1);assert.equal(body.results.find(item=>item.id===collision.id).name,services[0].name);
const priorWindow=globalThis.window, priorFetch=globalThis.fetch;
globalThis.window={location:{origin:'http://127.0.0.1'},dispatchEvent(){}};globalThis.fetch=async()=>Response.json(body);
try{
 const snapshot=await readPublicDiscovery();assert.equal(snapshot.partialResults,true);
 const tools=new Map();registerBazaarTools({registerTool:tool=>tools.set(tool.name,tool)},{discoverySource:async()=>snapshot});
 const list=await tools.get('bazaar_list_services').execute({});assert.equal(list.data.services.filter(item=>item.id===collision.id).length,1);
 const detail=await tools.get('bazaar_get_service').execute({serviceId:collision.id});assert.equal(detail.data.name,services[0].name);
}finally{globalThis.fetch=priorFetch;if(priorWindow===undefined)delete globalThis.window;else globalThis.window=priorWindow;}
console.log('PASS reserved IDs rejected before storage, existing collisions retained but excluded, null/malformed/duplicate index is partial, REST/browser/WebMCP static precedence matches; Redis double only');
