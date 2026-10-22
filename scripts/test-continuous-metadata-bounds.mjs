// Native workspace quota paths and SDK list serialization, entirely local.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {extname} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createRedisWorkspaceStore,READ_WORKSPACE_LUA,READ_MARKET_PERMISSION_LUA,COMMIT_WORKSPACE_LUA} from '../lib/workspace-store.ts';
import {WORKSPACE_LIMITS} from '../lib/workspace-types.ts';
import {initializeContinuousStorageLedger} from '../lib/continuous-free-storage.ts';
import {continuousFreeReservation} from '../lib/continuous-free-budget.ts';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!extname(specifier))return next(specifier+'.ts',context);throw error;}}});
const {createOnboardingMcpServer}=await import('../lib/mcp-onboarding-server.ts');
const names=['BAZAAR_FREE_DEMO_MODE','BAZAAR_FREE_DEMO_ADMISSION_UNTIL','BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON','BAZAAR_PUBLIC_DEMO','BAZAAR_ENABLE_OPEN_WORKSPACES','BAZAAR_WORKSPACE_ADMISSION','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE','BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY','BAZAAR_ACCEPTANCE_METER','BAZAAR_ACCEPTANCE_X402','BAZAAR_ENABLE_MARKETPLACE'];
const old=Object.fromEntries(names.map(k=>[k,process.env[k]])),hash=s=>createHash('sha256').update(s).digest('hex'),prefix='bazaar-workspace:pilot-'+randomUUID().replaceAll('-',''),data=new Map(),samples=[];
let checks=0,rejectNext=false,loseNext=false,barrier,counts={reads:0,cas:0,outbound:0,inbound:0};
const emptyCounts=()=>({reads:0,cas:0,outbound:0,inbound:0});
function receive(value){counts.inbound+=Buffer.byteLength(JSON.stringify({result:value}));return value;}
const redis={async get(key){counts.outbound+=Buffer.byteLength(JSON.stringify(['GET',key]));return receive(data.get(key)??null);},async eval(script,keys,args){
 counts.outbound+=Buffer.byteLength(JSON.stringify(['EVAL',script,keys.length,...keys,...args]));
 if(script===READ_WORKSPACE_LUA||script===READ_MARKET_PERMISSION_LUA){counts.reads++;const result=keys.map(k=>data.get(k)??'');await barrier?.();return receive(result);}
 if(script.includes('continuous-free-storage-initialize-v1')){if(data.has(keys[0]))return receive(0);for(let i=1;i<keys.length;i++)if(args[i]==='missing'?data.has(keys[i]):data.get(keys[i])!==args[i].slice(8))return receive(0);data.set(keys[0],args[0]);return receive(1);}
 assert.ok(script===COMMIT_WORKSPACE_LUA||script.includes('local storageOld='));counts.cas++;
 if(rejectNext){rejectNext=false;return receive(0);}for(let i=0;i<3;i++)if((data.get(keys[i])??'')!==args[i])return receive(0);
 if(keys.length===5){const storage=JSON.parse(data.get(keys[4]));for(const row of JSON.parse(args[7])){const old=storage.entries[row.key];if(old?old.bytes!==row.expected:row.expected!==0)return receive(-20);const reserved=row.reserved??old?.reserved??0;if(!row.bytes&&!reserved)delete storage.entries[row.key];else storage.entries[row.key]={bytes:row.bytes,reserved};}data.set(keys[4],JSON.stringify(storage));}
 data.set(keys[0],args[3]);if(args[4])data.set(keys[1],args[4]);data.set(keys[2],'workspace-v1');if(keys.length>=4)data.set(keys[3],args[5]);
 if(loseNext){loseNext=false;throw Error('Synthetic acknowledgement loss');}return receive(1);
}};
const store=()=>createRedisWorkspaceStore(redis,prefix,()=>({ownerIds:[],hashes:[]}));
try{
 for(const k of names)delete process.env[k];process.env.BAZAAR_PUBLIC_DEMO='true';
 const token='a'.repeat(43),agentHash=hash(token),humanHash=hash('human'),created=await store().createWorkspace({creationId:randomUUID(),humanAccessHash:humanHash,agentAccessHash:agentHash},hash('bootstrap'),'synthetic-ip');
 const registryKey=[...data.keys()].find(k=>k.endsWith(':registry')),ownerKey=[...data.keys()].find(k=>k.includes(':owner:')),registry=JSON.parse(data.get(registryKey)),doc=JSON.parse(data.get(ownerKey));
 doc.replayMarkers=[];let raw=JSON.stringify(doc),last=raw;
 while(Buffer.byteLength(raw)<WORKSPACE_LIMITS.ownerBytes-400){last=raw;doc.replayMarkers.push({kind:'query',id:randomUUID(),digest:'a'.repeat(64),resultHash:'b'.repeat(64)});raw=JSON.stringify(doc);}if(Buffer.byteLength(raw)>WORKSPACE_LIMITS.ownerBytes)raw=last;
 data.set(ownerKey,raw);registry.workspaces[0].documentBytes=Buffer.byteLength(raw);
 let count=0;while(Buffer.byteLength(JSON.stringify(registry))<WORKSPACE_LIMITS.registryBytes-5000)registry.creationWindows.push({key:'padding-'+count+++'-'+ 'a'.repeat(64),count:0,until:Date.now()+60000});
 data.set(registryKey,JSON.stringify(registry));assert.ok(Buffer.byteLength(data.get(registryKey))>=WORKSPACE_LIMITS.registryBytes-6000);assert.ok(Buffer.byteLength(raw)>=WORKSPACE_LIMITS.ownerBytes-700);checks++;
 await initializeContinuousStorageLedger(redis,prefix,[...data].map(([key,raw])=>({key,expectedRaw:raw,nextRaw:raw})));
 process.env.BAZAAR_FREE_DEMO_MODE='continuous';
 const bounds=async(name,action,light=false)=>{counts=emptyCounts();await action();const measured={name,...counts};assert.ok(counts.outbound<=(light?20:8)*1048576);assert.ok(counts.inbound<=(light?16:4)*1048576);if(light)assert.ok(counts.outbound+counts.inbound<=32*1048576);samples.push(measured);checks++;return measured;};
 const authenticated=await bounds('authenticated-metadata',async()=>{await store().resolveHash(agentHash);await store().consumeIngress('synthetic-ip');});assert.equal(authenticated.reads,2);assert.equal(authenticated.cas,1);checks++;
 const anonymous=await bounds('anonymous-metadata',()=>store().consumeIngress('synthetic-ip'));assert.equal(anonymous.reads,1);assert.equal(anonymous.cas,1);checks++;
 rejectNext=true;const conflict=await bounds('definite-ingress-conflict',async()=>{await assert.rejects(()=>store().consumeIngress('synthetic-ip'),{code:'WORKSPACE_UNAVAILABLE'});});assert.equal(conflict.cas,1);assert.equal(conflict.reads,1);checks++;
 rejectNext=true;const quotaConflict=await bounds('definite-account-conflict',async()=>{await assert.rejects(()=>store().consumeRequest(created.record.ownerId,1),{code:'WORKSPACE_UNAVAILABLE'});});assert.equal(quotaConflict.cas,1);assert.equal(quotaConflict.reads,1);checks++;
 loseNext=true;const uncertain=await bounds('uncertain-ingress-ack',async()=>{await assert.rejects(()=>store().consumeIngress('synthetic-ip'),{code:'WORKSPACE_UNAVAILABLE'});});assert.equal(uncertain.cas,1);assert.equal(uncertain.reads,1);checks++;
 let arrivals=0,release;const ready=new Promise(resolve=>release=resolve);barrier=async()=>{if(++arrivals===2)release();await ready;};
 counts=emptyCounts();const races=await Promise.allSettled([store().consumeIngress('synthetic-ip'),store().consumeIngress('synthetic-ip')]);barrier=undefined;assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected').length,1);assert.equal(counts.cas,2);checks++;
 const reserve=continuousFreeReservation({profile:'public',newOperation:false,workload:'metadata',credentialRead:true});assert.equal(reserve.commands,176);assert.equal(reserve.transferBytes,12*1048576+262144);checks++;
 assert.ok(continuousFreeReservation({profile:'recovery',newOperation:false}).transferBytes>100*1048576,'Only metadata is optimized');checks++;
 // Make room for one new query while retaining a near-limit owner snapshot.
 const currentRegistry=JSON.parse(data.get(registryKey)),currentDoc=JSON.parse(data.get(ownerKey));currentDoc.replayMarkers.splice(-15);const smaller=JSON.stringify(currentDoc);currentRegistry.workspaces[0].documentBytes=Buffer.byteLength(smaller);data.set(ownerKey,smaller);data.set(registryKey,JSON.stringify(currentRegistry));
 // Updating synthetic snapshots also updates their owned local byte ledger.
 const ledgerKey=[...data.keys()].find(k=>k.endsWith(':continuous-free-storage:v1')),ledger=JSON.parse(data.get(ledgerKey));ledger.entries[hash(ownerKey)].bytes=Buffer.byteLength(smaller);ledger.entries[hash(registryKey)].bytes=Buffer.byteLength(data.get(registryKey));data.set(ledgerKey,JSON.stringify(ledger));
 const principal=await store().resolveHash(agentHash);
 const observed=await bounds('authenticated-observed-metadata',async()=>{await store().consumeIngress('synthetic-ip');await store().resolveHash(agentHash);await store().consumeRequest(principal.ownerId,1);await store().walletIdentity(principal);await store().resolveHash(agentHash);await store().forPrincipal(principal).recordQuery(principal.ownerId,{requestId:randomUUID(),tool:'get_bazaar_capabilities',agentId:principal.agentId,recordedAt:new Date().toISOString(),outcome:'ok',inputHash:'a'.repeat(64),resultHash:'b'.repeat(64),evidence:'bazaar-observed'});},true);
 assert.equal(observed.cas,3);assert.equal(observed.reads,6);checks++;
 for(const kind of [{profile:'public',newOperation:false,workload:'observed-metadata'},{profile:'recovery',newOperation:false,workload:'identity'},{profile:'recovery',newOperation:false,workload:'orders'},{profile:'authenticated',newOperation:true,workload:'capacity'}]){assert.equal(continuousFreeReservation(kind).transferBytes,32*1048576+262144);checks++;}
 // Analytical upper bounds count even fully JSON-escaped native snapshots.
 // Capacity adds a reviewed document and two market reads; its guarded CAS
 // transmits registry, market, settlement and completion-ledger snapshots.
 const registryWrapped=2*WORKSPACE_LIMITS.registryBytes,ownerWrapped=2*WORKSPACE_LIMITS.ownerBytes;
 const lightUpper={observed:{inbound:6*registryWrapped+3*ownerWrapped,outbound:6*registryWrapped+3*ownerWrapped},capacity:{inbound:5*registryWrapped+2*ownerWrapped+2*1048576+2*524288*2+2*131072+2*65536,outbound:5*registryWrapped+ownerWrapped+4*524288+2*131072+4*65536}};
 for(const value of Object.values(lightUpper)){assert.ok(value.inbound+value.outbound+262144+65536<32*1048576);checks++;}
 process.env.BAZAAR_ENABLE_OPEN_WORKSPACES='true';process.env.BAZAAR_ENABLE_MARKETPLACE='true';
 const server=createOnboardingMcpServer(),client=new Client({name:'local-metadata-bound',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
 let sdkToolsListBytes;try{const tools=await client.listTools();sdkToolsListBytes=Buffer.byteLength(JSON.stringify({jsonrpc:'2.0',id:1,result:tools}));assert.ok(sdkToolsListBytes<=128*1024);checks++;}finally{await client.close();await server.close();}
 console.log(JSON.stringify({status:'PASS_LOCAL_CONTINUOUS_METADATA_BOUND',checks,maximumRegistryBytes:Buffer.byteLength(data.get(registryKey)),maximumOwnerBytes:Buffer.byteLength(raw),samples,lightAnalyticalUpperBounds:lightUpper,sdkToolsListBytes,metadataReservedBytes:reserve.transferBytes,lightControlReservedBytes:32*1048576+262144,quotaCasAttempts:1,legacyQuotaAttempts:8,unknownAcknowledgementRetries:0,concurrentQuotaOneWinner:true,realRedis:false,networkRequests:0,realPayments:0,cloudWrites:0,productionChanged:false}));
}finally{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}
