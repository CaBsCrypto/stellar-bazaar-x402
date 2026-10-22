// Native workspace methods with exact, isolated Lua protocol semantics.
// No remote Redis, credentials, production data, payment or scheduling.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRedisWorkspaceStore,READ_WORKSPACE_LUA,COMMIT_WORKSPACE_LUA,COMMIT_CONTINUOUS_WORKSPACE_LUA,READ_WORKSPACE_MAINTENANCE_LUA,READ_CONTINUOUS_WORKSPACE_STORAGE_LUA,READ_MARKET_PERMISSION_LUA} from '../lib/workspace-store.ts';
import {initializeContinuousStorageLedger,continuousStorageKey} from '../lib/continuous-free-storage.ts';
import {WORKSPACE_LIMITS} from '../lib/workspace-types.ts';
const changed=['BAZAAR_FREE_DEMO_MODE','BAZAAR_FREE_DEMO_ADMISSION_UNTIL','BAZAAR_PUBLIC_DEMO','BAZAAR_WORKSPACE_ADMISSION','BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON'],prior=Object.fromEntries(changed.map(k=>[k,process.env[k]])),realNow=Date.now;
let clock=Date.parse('2026-10-11T00:00:00.000Z'),checks=0;
Date.now=()=>clock;delete process.env.BAZAAR_FREE_DEMO_MODE;delete process.env.BAZAAR_FREE_DEMO_ADMISSION_UNTIL;delete process.env.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON;process.env.BAZAAR_PUBLIC_DEMO='true';process.env.BAZAAR_WORKSPACE_ADMISSION='open';
const hash=v=>createHash('sha256').update(v).digest('hex'),prefix='bazaar-workspace:pilot-'+randomUUID().replaceAll('-',''),tag=prefix.split(':')[1],indexKey=`${prefix}:{${tag}}:maintenance`;
const data=new Map(),calls=[],writes=[];let loseAck=false,rejectCas=false;
const redis={async get(key){calls.push({name:'GET',key});return data.get(key)??null;},async eval(script,keys,args){
 calls.push({name:'EVAL',script,keys,args});
 if(script===READ_CONTINUOUS_WORKSPACE_STORAGE_LUA)return data.get(keys[0])??null;
 if(script===READ_WORKSPACE_LUA||script===READ_MARKET_PERMISSION_LUA)return keys.map(k=>data.get(k)??'');
 if(script===READ_WORKSPACE_MAINTENANCE_LUA)return [data.get(keys[0])??'',String(Math.floor(clock/1000)),String(clock%1000*1000)];
 if(script.includes('-- continuous-free-storage-initialize-v1')){
  if(data.has(keys[0]))return 0;
  for(let i=1;i<keys.length;i++)if(args[i]==='missing'?data.has(keys[i]):data.get(keys[i])!==args[i].slice(8))return 0;
  data.set(keys[0],args[0]);writes.push(keys[0]);return 1;
 }
 assert.ok(script===COMMIT_WORKSPACE_LUA||script===COMMIT_CONTINUOUS_WORKSPACE_LUA||script.includes('storageOld')||script.includes('storageLedger'),'Unreviewed workspace Lua');
 if(rejectCas){rejectCas=false;return 0;}
 for(let i=0;i<3;i++)if((data.get(keys[i])??'')!==args[i])return 0;
 if(keys.length===5){
  const ledger=JSON.parse(data.get(keys[4]));
  // Support the storage sidecar's current atomic patch representation.
  if(script.includes('storageOld~=ARGV')){if(data.get(keys[4])!==args[6])return -20;data.set(keys[4],args[7]);}
  else{
   const patch=JSON.parse(args[7]);
   for(const row of patch.writes??patch){const old=ledger.entries[row.key??row.hash],expected=row.expectedBytes??row.expected;if(old?old.bytes!==expected:expected!==0)return -20;const bytes=row.bytes??row.nextBytes,reserved=row.reserved??old?.reserved??0;if(!bytes&&!reserved)delete ledger.entries[row.key??row.hash];else ledger.entries[row.key??row.hash]={bytes,reserved};}
   data.set(keys[4],JSON.stringify(ledger));
  }
  writes.push(keys[4]);
 }
 data.set(keys[0],args[3]);writes.push(keys[0]);if(args[4]){data.set(keys[1],args[4]);writes.push(keys[1]);}data.set(keys[2],'workspace-v1');writes.push(keys[2]);
 if(keys.length>=4){data.set(keys[3],args[5]);writes.push(keys[3]);}
 if(loseAck){loseAck=false;throw Error('SYNTHETIC_LOST_ACK');}return 1;
}};
const fresh=()=>createRedisWorkspaceStore(redis,prefix,()=>({ownerIds:[],hashes:[]}));
async function account(n){const agentHash=hash('synthetic-agent-'+n),humanHash=hash('synthetic-human-'+n),created=await fresh().createWorkspace({creationId:randomUUID(),humanAccessHash:humanHash,agentAccessHash:agentHash},hash('synthetic-recovery-'+n),'synthetic-ip-'+n);return {created,agent:await fresh().resolveHash(agentHash),human:await fresh().resolveHash(humanHash)};}
try{
 const a=await account(1),b=await account(2),registryKey=`${prefix}:{${tag}}:registry`,ownerKey=id=>`${prefix}:{${tag}}:owner:${id}`;
 const initialDocuments=[data.get(ownerKey(a.agent.ownerId)),data.get(ownerKey(b.agent.ownerId))];
 await initializeContinuousStorageLedger(redis,prefix,[...data].map(([key,raw])=>({key,expectedRaw:raw,nextRaw:raw})));
 process.env.BAZAAR_FREE_DEMO_MODE='continuous';
 let index=await fresh().maintenanceIndex();assert.equal(index.initialized,false);assert.equal(index.needsBootstrap,true);checks++;
 let result=await fresh().bootstrapMaintenanceIndex(1);assert.equal(result.processed,1);assert.equal(result.initialized,false);checks++;
 result=await fresh().bootstrapMaintenanceIndex(1);assert.equal(result.initialized,true);assert.equal(result.nextExpiryAt,null);checks++;
 assert.deepEqual([data.get(ownerKey(a.agent.ownerId)),data.get(ownerKey(b.agent.ownerId))],initialDocuments,'Bootstrap only writes registry/index metadata');checks++;
 const c=await account(3);assert.equal((await fresh().maintenanceIndex()).initialized,true);checks++;
 const query={requestId:randomUUID(),tool:'list_market_services',agentId:a.agent.agentId,recordedAt:new Date(clock).toISOString(),outcome:'ok',inputHash:hash('input'),resultHash:hash('result'),evidence:'bazaar-observed'};
 await fresh().forPrincipal(a.agent).recordQuery(a.agent.ownerId,query);
 index=await fresh().maintenanceIndex();assert.equal(index.nextExpiryAt,clock+WORKSPACE_LIMITS.contentRetentionMs);checks++;
 const originalExpiry=index.nextExpiryAt,recordedWrites=writes.length;
 clock+=1000;await fresh().forPrincipal(a.agent).recordQuery(a.agent.ownerId,query);assert.equal(writes.length,recordedWrites);assert.equal((await fresh().maintenanceIndex()).nextExpiryAt,originalExpiry);checks++;
 await assert.rejects(fresh().forPrincipal(a.human).maintenanceIndex(),{code:'FORBIDDEN'});await assert.rejects(fresh().forPrincipal(a.agent).bootstrapMaintenanceIndex(),{code:'FORBIDDEN'});checks++;
 assert.deepEqual(await fresh().retentionOwnerIds(clock),[]);clock=originalExpiry;assert.deepEqual(await fresh().retentionOwnerIds(clock),[a.agent.ownerId]);checks++;
 const before=data.get(ownerKey(a.agent.ownerId));rejectCas=true;await assert.rejects(fresh().pruneExpiredContent(a.agent.ownerId),{code:'WORKSPACE_CONFLICT'});assert.equal(data.get(ownerKey(a.agent.ownerId)),before);checks++;
 loseAck=true;await assert.rejects(fresh().pruneExpiredContent(a.agent.ownerId),{code:'WORKSPACE_UNAVAILABLE'});
 assert.equal((await fresh().maintenanceIndex()).nextExpiryAt,null);const afterLost=writes.length;assert.equal((await fresh().pruneExpiredContent(a.agent.ownerId)).removed,0);assert.equal(writes.length,afterLost);checks++;
 await fresh().forPrincipal(c.human).createConversation(c.human.ownerId,{conversationId:'synthetic-conversation',title:'private synthetic title'});assert.equal((await fresh().maintenanceIndex()).nextExpiryAt,clock+WORKSPACE_LIMITS.contentRetentionMs);checks++;
 const indexCalls=calls.length,indexWrites=writes.length;await fresh().maintenanceIndex();assert.equal(calls.length-indexCalls,1);assert.equal(writes.length,indexWrites);assert.deepEqual(calls.at(-1).keys,[indexKey]);assert.ok(!calls.at(-1).keys.includes(registryKey));checks++;
 assert.ok(!data.get(indexKey).includes('private synthetic title'));assert.ok(!data.get(indexKey).includes(a.agent.ownerId));checks++;
 const ledger=JSON.parse(data.get(continuousStorageKey(prefix))),entries=ledger.entries;
 for(const [key,raw] of data)if(key!==continuousStorageKey(prefix)){assert.equal(entries[hash(key)]?.bytes,Buffer.byteLength(raw));checks++;}
 console.log(JSON.stringify({status:'PASS_LOCAL_CONTINUOUS_WORKSPACE_INDEX',checks,legacyBootstrapBound:1,contentRewritesDuringBootstrap:0,indexReadCommandsIncludingEval:3,oneTimeReadOnlyIndexSnapshot:true,uncertainWriteRetries:0,externalRequests:0,cloudWrites:0,payments:0,cronActivated:false}));
}finally{Date.now=realNow;for(const [key,value]of Object.entries(prior))value===undefined?delete process.env[key]:process.env[key]=value;}
