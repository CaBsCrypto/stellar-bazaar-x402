// Explicit local cloud validation: writes only a fresh frozen workspace prefix,
// then removes its exact keys. Never loads or prints unrelated credentials.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Redis} from '@upstash/redis';
import {createRedisWorkspaceStore,READ_WORKSPACE_LUA,READ_MARKET_PERMISSION_LUA,COMMIT_WORKSPACE_LUA} from '../lib/workspace-store.ts';

if(process.env.VERCEL||process.env.VERCEL_ENV)throw Error('LOCAL_EXECUTION_REQUIRED');
const verifying=process.argv.includes('--verify');
if(!verifying&&!process.argv.includes('--execute'))throw Error('EXPLICIT_EXECUTE_REQUIRED');
process.env.NODE_ENV='test';process.env.BAZAAR_PUBLIC_DEMO='true';process.env.BAZAAR_WORKSPACE_ADMISSION='open';
delete process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE;delete process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY;
delete process.env.BAZAAR_ACCEPTANCE_METER;delete process.env.BAZAAR_ACCEPTANCE_X402;
const hash=v=>createHash('sha256').update(v).digest('hex');
let url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN;
if(!url||!token){
 const raw=await readFile(new URL('../.vercel/.env.production.local',import.meta.url),'utf8');
 const onlyNeeded={};
 for(const key of ['BAZAAR_WORKSPACE_REDIS_REST_URL','BAZAAR_WORKSPACE_REDIS_REST_TOKEN']){
  const line=raw.split(/\r?\n/).find(line=>line.startsWith(key+'='));if(!line)continue;
  const value=line.slice(key.length+1).trim();onlyNeeded[key]=value.startsWith('"')?JSON.parse(value):value.replace(/^'|'$/g,'');
 }
 url??=onlyNeeded.BAZAAR_WORKSPACE_REDIS_REST_URL;token??=onlyNeeded.BAZAAR_WORKSPACE_REDIS_REST_TOKEN;
}
assert.ok(url==='https://smooth-dory-323957.upstash.io','VALIDATION_DATABASE_REQUIRED');
assert.ok(token?.trim(),'REDIS_CREDENTIAL_REQUIRED');
const client=new Redis({url,token,automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false});
let manifest;
if(verifying){let raw='';for await(const part of process.stdin)raw+=part;assert.ok(raw.length<8192);manifest=JSON.parse(raw);}
else manifest={prefix:'bazaar-workspace:pilot-'+randomBytes(16).toString('hex'),started:Date.now(),accounts:Array.from({length:2},()=>({creationId:randomUUID(),ownerUuid:randomUUID(),tokens:Object.fromEntries(['human','agent','bootstrap'].map(role=>[role,randomBytes(32).toString('base64url')]))}))};
assert.match(manifest.prefix,/^bazaar-workspace:pilot-[a-f0-9]{32}$/);assert.equal(manifest.accounts.length,2);
const prefix=manifest.prefix,tag=prefix.split(':')[1],base=prefix+':{'+tag+'}',ownerIds=manifest.accounts.map(a=>'ow_'+a.ownerUuid.replaceAll('-',''));
for(const a of manifest.accounts){assert.match(a.creationId,/^[a-f0-9-]{36}$/);assert.match(a.ownerUuid,/^[a-f0-9-]{36}$/);}
const ownedKeys=[base+':registry',...ownerIds.map(owner=>base+':owner:'+owner),base+':initialized'];
const readableKeys=new Set([...ownedKeys,base+':owner:none',...ownerIds.map(owner=>base+':market-permissions:'+owner)]);
let exchanges=0;
const scopedRedis={async eval(script,keys,args){
 assert.ok([READ_WORKSPACE_LUA,READ_MARKET_PERMISSION_LUA,COMMIT_WORKSPACE_LUA].includes(script));
 assert.ok(keys.every(key=>readableKeys.has(key)),'FOREIGN_KEY_FORBIDDEN');
 if(verifying)assert.notEqual(script,COMMIT_WORKSPACE_LUA,'READ_ONLY_RESTART_CHECK');
 exchanges++;return client.eval(script,keys,args);
}};
const fresh=()=>createRedisWorkspaceStore(scopedRedis,prefix,()=>({ownerIds:[],hashes:[]}),id=>manifest.accounts.find(a=>a.creationId===id)?.ownerUuid);
const creation=a=>({creationId:a.creationId,humanAccessHash:hash(a.tokens.human),agentAccessHash:hash(a.tokens.agent)});
const realNow=Date.now;Date.now=()=>manifest.started;
async function restartCheck(clock,expectQueries){
 const child=spawn(process.execPath,['--experimental-strip-types',fileURLToPath(import.meta.url),'--verify'],{stdio:['pipe','pipe','pipe']});
 const input={...manifest,started:clock,expectQueries,accounts:manifest.accounts.map(a=>({creationId:a.creationId,ownerUuid:a.ownerUuid,agentHash:hash(a.tokens.agent)}))};
 child.stdin.end(JSON.stringify(input));let stdout='';child.stdout.on('data',part=>stdout+=part);child.stderr.resume();
 await new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('RESTART_CHECK_FAILED')));child.once('exit',code=>code===0?resolve():reject(Error('RESTART_CHECK_FAILED')));});
 assert.equal(JSON.parse(stdout).readOnlyRestart,true);
}
if(verifying){
 const store=fresh();
 for(let i=0;i<manifest.accounts.length;i++){
  const p=await store.resolveHash(manifest.accounts[i].agentHash);assert.equal(p.ownerId,ownerIds[i]);
  assert.equal((await store.forPrincipal(p).queries(p.ownerId)).length,i===0?manifest.expectQueries:0);
 }
 console.log(JSON.stringify({readOnlyRestart:true}));Date.now=realNow;
}else{
 let cleanup=false,namespaceWasEmpty=false,stage='fresh-namespace-check',outcome;
 try{
  assert.ok((await Promise.all(ownedKeys.map(key=>client.get(key)))).every(value=>value===null),'NEW_NAMESPACE_NOT_EMPTY');
  namespaceWasEmpty=true;
  const store=fresh(),principals=[];
  stage='create-two-synthetic-accounts';
  for(const a of manifest.accounts){const result=await store.createWorkspace(creation(a),hash(a.tokens.bootstrap),'synthetic-shared-wifi');assert.equal(result.created,true);principals.push(await store.resolveHash(hash(a.tokens.agent)));}
  const q={requestId:randomUUID(),tool:'list_market_services',agentId:principals[0].agentId,recordedAt:new Date(manifest.started).toISOString(),outcome:'ok',inputHash:hash('synthetic input'),resultHash:hash('synthetic result'),evidence:'bazaar-observed'};
  stage='history-and-process-restart';
  await store.forPrincipal(principals[0]).recordQuery(principals[0].ownerId,q);
  await restartCheck(manifest.started,1);
  await assert.rejects(store.forPrincipal(principals[1]).queries(principals[0].ownerId),{code:'UNAUTHORIZED'});
  const before=JSON.parse(await client.get(ownedKeys[0])).workspaces.find(m=>m.ownerId===ownerIds[0]).documentBytes;
  const expired=manifest.started+7*86400000;Date.now=()=>expired;
  await restartCheck(expired,0);
  stage='atomic-retention-cleanup';
  assert.equal((await store.pruneExpiredContent(principals[0].ownerId)).removed,1);
  const after=JSON.parse(await client.get(ownedKeys[0])).workspaces.find(m=>m.ownerId===ownerIds[0]).documentBytes;assert.ok(after<before);
  await store.forPrincipal(principals[0]).recordQuery(principals[0].ownerId,q);
  assert.equal((await store.forPrincipal(principals[0]).queries(principals[0].ownerId)).length,0);
  assert.equal((await fresh().createWorkspace(creation(manifest.accounts[0]),hash(manifest.accounts[0].tokens.bootstrap),'synthetic-shared-wifi',false)).created,false,'Existing-account recovery remains available when registration is closed');
  stage='shared-atomic-quotas';
  const parallel=await Promise.allSettled(Array.from({length:8},(_,i)=>fresh().consumeRequest(principals[i%2].ownerId,1)));
  assert.ok(parallel.some(r=>r.status==='fulfilled'));
  let registry=JSON.parse(await client.get(ownedKeys[0]));const successful=parallel.filter(r=>r.status==='fulfilled').length;
  assert.equal(registry.globalRequestQuota.minuteCount,successful);
  for(const p of principals){let count=registry.requestWindows.find(w=>w.ownerId===p.ownerId)?.count??0;for(;count<60;count++)await fresh().consumeRequest(p.ownerId,1);}
  registry=JSON.parse(await client.get(ownedKeys[0]));assert.equal(registry.globalRequestQuota.minuteCount,120);
  await assert.rejects(fresh().consumeRequest(principals[0].ownerId,1),{code:'WORKSPACE_RATE_LIMIT'});
  outcome={status:'PASS',category:'Local application with real isolated Upstash Redis',namespaceDigest:hash(prefix),syntheticAccounts:2,persistedAfterProcessRestart:true,expiredReplayCannotRevive:true,retentionDays:7,atomicByteAccounting:true,privateAccountIsolation:true,recoveryWhenAdmissionsClosed:true,concurrentAtomicQuota:true,sharedMinuteCap:120,perAccountMinuteCap:60,redisExchanges:exchanges,realPayments:0,r2Validated:false};
 }catch(e){outcome={status:'FAIL',stage,code:typeof e.code==='string'&&/^[A-Z_]+$/.test(e.code)?e.code:'VALIDATION_FAILED',realPayments:0};}
 finally{
  try{
   // Exact frozen keys only: no SCAN, broad match or deletion of other owners.
   assert.ok(ownedKeys.every(key=>key.startsWith(base+':')&&readableKeys.has(key)));
   if(namespaceWasEmpty){await client.del(...ownedKeys);cleanup=(await Promise.all(ownedKeys.map(key=>client.get(key)))).every(value=>value===null);}
   else cleanup=true; // A collision stops before writes and must never be deleted.
  }catch{cleanup=false;}
  Date.now=realNow;
 }
 console.log(JSON.stringify({...outcome,isolatedSyntheticKeysRemoved:cleanup}));if(outcome.status!=='PASS'||!cleanup)process.exitCode=1;
}
