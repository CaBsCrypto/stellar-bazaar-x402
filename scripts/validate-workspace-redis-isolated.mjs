// Local-only validation. A dedicated, expiring profile arrives through stdin;
// this script never loads .env files or uses inherited Redis credentials.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const PURPOSE='bazaar-local-redis-validation', MODE='temporary-exclusive';
const PROFILE_MAX_AGE=72*60*60*1000, STDIN_LIMIT=32768;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const HASH=/^[a-f0-9]{64}$/;
const TOKEN=/^[A-Za-z0-9_.+/=-]{32,4096}$/;
const PROFILE_FIELDS=['version','purpose','mode','phase','databaseId','localLabel','createdAt','expiresAt','basis'];
export const VALIDATION_CODES=Object.freeze([
 'LOCAL_EXECUTION_REQUIRED','EXPLICIT_TEMPORARY_PROFILE_REQUIRED','INVALID_ARGUMENTS',
 'PROFILE_TOO_LARGE','PROFILE_READ_FAILED','PROFILE_JSON_INVALID','PROFILE_FIELDS_INVALID',
 'PROFILE_VERSION_INVALID','PROFILE_PURPOSE_INVALID','PROFILE_MODE_INVALID','PROFILE_PHASE_INVALID',
 'PROFILE_ID_INVALID','PROFILE_LABEL_INVALID','PROFILE_DATES_INVALID','PROFILE_EXPIRED',
 'PROFILE_LIFETIME_INVALID','PROFILE_BASIS_INVALID','PROFILE_ENDPOINT_INVALID',
 'SHARED_DATABASE_FORBIDDEN','PROFILE_TOKEN_INVALID','PROFILE_WINDOW_ENDED',
 'MANIFEST_INVALID','FOREIGN_KEY_FORBIDDEN','FOREIGN_SCRIPT_FORBIDDEN',
 'READ_ONLY_RESTART_CHECK','NEW_NAMESPACE_NOT_EMPTY','RESTART_CHECK_FAILED',
 'RESTART_OUTPUT_INVALID','VALIDATION_ASSERTION_FAILED','VALIDATION_FAILED',
 'WORKSPACE_CONFLICT','WORKSPACE_UNAVAILABLE','WORKSPACE_CAPACITY','WORKSPACE_RATE_LIMIT',
 'CLEANUP_FAILED',
]);
export const VALIDATION_STAGES=Object.freeze([
 'profile-validation','restart-validation','fresh-namespace-check','create-two-synthetic-accounts',
 'history-and-process-restart','atomic-retention-cleanup','shared-atomic-quotas','complete',
]);
class ValidationFailure extends Error {
 constructor(code){super('Temporary Redis validation failed');this.code=VALIDATION_CODES.includes(code)?code:'VALIDATION_FAILED';}
}
function fail(code){throw new ValidationFailure(code);}
function exactFields(value,fields){
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===fields.length&&fields.every(k=>Object.hasOwn(value,k));
}
function timestamp(value){
 if(typeof value!=='string'||!ISO.test(value))fail('PROFILE_DATES_INVALID');
 const number=Date.parse(value);
 if(!Number.isFinite(number)||new Date(number).toISOString()!==value)fail('PROFILE_DATES_INVALID');
 return number;
}
export function validateTemporaryProfile(value,{now=Date.now(),phase='ready'}={}){
 if(!exactFields(value,phase==='ready'?[...PROFILE_FIELDS,'url','token']:PROFILE_FIELDS))fail('PROFILE_FIELDS_INVALID');
 if(value.version!==1)fail('PROFILE_VERSION_INVALID');
 if(value.purpose!==PURPOSE)fail('PROFILE_PURPOSE_INVALID');
 if(value.mode!==MODE)fail('PROFILE_MODE_INVALID');
 if(value.phase!==phase||!['pending','ready'].includes(phase))fail('PROFILE_PHASE_INVALID');
 if(typeof value.databaseId!=='string'||!UUID.test(value.databaseId))fail('PROFILE_ID_INVALID');
 if(typeof value.localLabel!=='string'||!/^bazaar-local-validation-[a-f0-9]{16}$/.test(value.localLabel))fail('PROFILE_LABEL_INVALID');
 const created=timestamp(value.createdAt),expires=timestamp(value.expiresAt);
 if(!Number.isSafeInteger(now)||created>now+60000)fail('PROFILE_DATES_INVALID');
 if(expires<=now)fail('PROFILE_EXPIRED');
 if(expires<=created||expires-created>PROFILE_MAX_AGE||now-created>PROFILE_MAX_AGE)fail('PROFILE_LIFETIME_INVALID');
 if(!['upstash-unclaimed-three-days','upstash-reported'].includes(value.basis))fail('PROFILE_BASIS_INVALID');
 if(value.basis==='upstash-unclaimed-three-days'&&expires-created!==PROFILE_MAX_AGE)fail('PROFILE_LIFETIME_INVALID');
 if(phase==='ready'){
  // Canonical input also rejects explicit :443, userinfo, escaped hostname
  // tricks, paths, queries and fragments hidden by URL normalization.
  if(typeof value.url!=='string'||!/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.upstash\.io\/?$/.test(value.url))fail('PROFILE_ENDPOINT_INVALID');
  const parsed=new URL(value.url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||parsed.pathname!=='/'||parsed.search||parsed.hash)fail('PROFILE_ENDPOINT_INVALID');
  if(parsed.hostname.split('.')[0].startsWith('smooth-dory'))fail('SHARED_DATABASE_FORBIDDEN');
  if(typeof value.token!=='string'||!TOKEN.test(value.token))fail('PROFILE_TOKEN_INVALID');
 }
 return Object.freeze({...value});
}
export async function readStdinJson(input=process.stdin){
 const chunks=[];let size=0;
 try{for await(const part of input){const chunk=Buffer.from(part);size+=chunk.length;if(size>STDIN_LIMIT)fail('PROFILE_TOO_LARGE');chunks.push(chunk);}}
 catch(error){if(error instanceof ValidationFailure)throw error;fail('PROFILE_READ_FAILED');}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('PROFILE_JSON_INVALID');}
}
export function childEnvironment(source=process.env){
 const safe={};
 for(const key of ['SystemRoot','WINDIR','TEMP','TMP'])if(typeof source[key]==='string')safe[key]=source[key];
 return {...safe,NODE_ENV:'test',BAZAAR_PUBLIC_DEMO:'true',BAZAAR_WORKSPACE_ADMISSION:'open',
  BAZAAR_ACCEPTANCE_METER:'false',BAZAAR_ACCEPTANCE_X402:'false',
  BAZAAR_OPERATIONAL_METER:'false',BAZAAR_OPERATIONAL_BUDGET:'false'};
}
function isolateProcessEnvironment(){
 const safe=childEnvironment();
 for(const key of Object.keys(process.env))delete process.env[key];
 Object.assign(process.env,safe);
}
const hash=value=>createHash('sha256').update(value).digest('hex');
export function createSyntheticManifest(now=Date.now()){
 return {prefix:'bazaar-workspace:pilot-'+randomBytes(16).toString('hex'),started:now,
  accounts:Array.from({length:2},()=>({creationId:randomUUID(),ownerUuid:randomUUID(),
   tokens:Object.fromEntries(['human','agent','bootstrap'].map(role=>[role,randomBytes(32).toString('base64url')]))}))};
}
export function buildSyntheticScope(manifest,{readOnly=false}={}){
 const fields=readOnly?['prefix','started','expectQueries','accounts']:['prefix','started','accounts'];
 if(!exactFields(manifest,fields)||!/^bazaar-workspace:pilot-[a-f0-9]{32}$/.test(manifest.prefix)||
  !Number.isSafeInteger(manifest.started)||manifest.started<0||!Array.isArray(manifest.accounts)||manifest.accounts.length!==2)fail('MANIFEST_INVALID');
 if(readOnly&&![0,1].includes(manifest.expectQueries))fail('MANIFEST_INVALID');
 for(const account of manifest.accounts){
  const valid=exactFields(account,readOnly?['creationId','ownerUuid','agentHash']:['creationId','ownerUuid','tokens'])&&
   UUID.test(account.creationId)&&UUID.test(account.ownerUuid);
  if(!valid)fail('MANIFEST_INVALID');
  if(readOnly){if(!HASH.test(account.agentHash))fail('MANIFEST_INVALID');}
  else if(!exactFields(account.tokens,['human','agent','bootstrap'])||!Object.values(account.tokens).every(t=>typeof t==='string'&&/^[A-Za-z0-9_-]{43}$/.test(t)))fail('MANIFEST_INVALID');
 }
 if(new Set(manifest.accounts.map(a=>a.ownerUuid)).size!==2||new Set(manifest.accounts.map(a=>a.creationId)).size!==2)fail('MANIFEST_INVALID');
 const prefix=manifest.prefix,tag=prefix.split(':')[1],base=prefix+':{'+tag+'}';
 const ownerIds=manifest.accounts.map(a=>'ow_'+a.ownerUuid.replaceAll('-',''));
 const ownedKeys=Object.freeze([base+':registry',...ownerIds.map(owner=>base+':owner:'+owner),base+':initialized']);
 const readableKeys=Object.freeze([...ownedKeys,base+':owner:none',...ownerIds.map(owner=>base+':market-permissions:'+owner)]);
 return Object.freeze({prefix,base,ownerIds:Object.freeze(ownerIds),ownedKeys,readableKeys});
}
export function createScopedRedis(client,scope,{scripts,readOnly=false,assertWindow=()=>{}}){
 const reads=new Set(scope.readableKeys),owned=new Set(scope.ownedKeys);let fresh=false,exchanges=0;
 function check(keys,allowed){if(!Array.isArray(keys)||!keys.length||keys.some(key=>typeof key!=='string'||!allowed.has(key)))fail('FOREIGN_KEY_FORBIDDEN');}
 const api={
  get exchanges(){return exchanges;},
  async get(key){check([key],owned);assertWindow();exchanges++;return client.get(key);},
  async eval(script,keys,args){
   if(![scripts.readWorkspace,scripts.readPermission,scripts.commitWorkspace].includes(script))fail('FOREIGN_SCRIPT_FORBIDDEN');
   if(readOnly&&script===scripts.commitWorkspace)fail('READ_ONLY_RESTART_CHECK');
   check(keys,script===scripts.commitWorkspace?owned:reads);
   if(script===scripts.commitWorkspace&&(keys.length!==3||keys[0]!==scope.ownedKeys[0]||
    !scope.ownedKeys.slice(1,-1).includes(keys[1])||keys[2]!==scope.ownedKeys.at(-1)))fail('FOREIGN_KEY_FORBIDDEN');
   assertWindow();exchanges++;return client.eval(script,keys,args);
  },
  async assertFreshNamespace(){
   if(readOnly)fail('READ_ONLY_RESTART_CHECK');
   const values=await Promise.all(scope.ownedKeys.map(key=>api.get(key)));
   if(values.some(value=>value!==null))fail('NEW_NAMESPACE_NOT_EMPTY');
   fresh=true;
  },
  async cleanupCreatedKeys(){
   if(readOnly)fail('READ_ONLY_RESTART_CHECK');
   // A collision or incomplete preflight grants no deletion authority.
   if(!fresh)return true;
   check(scope.ownedKeys,owned);
   // No SCAN, key pattern or database-wide cleanup. Expiry stops test writes
   // but permits removal of precisely the keys proved absent beforehand.
   exchanges++;await client.del(...scope.ownedKeys);
   const remaining=await Promise.all(scope.ownedKeys.map(key=>{exchanges++;return client.get(key);}));
   return remaining.every(value=>value===null);
  },
 };
 return Object.freeze(api);
}
function safeCode(error){
 if(error instanceof ValidationFailure)return error.code;
 if(error?.code==='ERR_ASSERTION')return 'VALIDATION_ASSERTION_FAILED';
 // Closed names only: a remote error string never becomes diagnostic output.
 if(['WORKSPACE_CONFLICT','WORKSPACE_UNAVAILABLE','WORKSPACE_CAPACITY','WORKSPACE_RATE_LIMIT'].includes(error?.code))return error.code;
 return 'VALIDATION_FAILED';
}
export function redactedValidationFailure(error,stage,networkUsed=false){return {status:'FAIL',stage:VALIDATION_STAGES.includes(stage)?stage:'profile-validation',code:safeCode(error),networkUsed,realPayments:0};}
function parseMode(args){
 const allowed=['--execute','--verify','--validate-profile','--validate-pending-profile','--temporary-profile-stdin'];
 if(args.some(a=>!allowed.includes(a))||new Set(args).size!==args.length)fail('INVALID_ARGUMENTS');
 if(!args.includes('--temporary-profile-stdin'))fail('EXPLICIT_TEMPORARY_PROFILE_REQUIRED');
 const modes=args.filter(a=>a!=='--temporary-profile-stdin');
 if(modes.length!==1)fail('INVALID_ARGUMENTS');
 return modes[0];
}
async function restartCheck(profile,manifest,clock,expectQueries){
 const child=spawn(process.execPath,['--experimental-strip-types',fileURLToPath(import.meta.url),'--verify','--temporary-profile-stdin'],
  {stdio:['pipe','pipe','pipe'],env:childEnvironment(),windowsHide:true});
 const input={profile,manifest:{prefix:manifest.prefix,started:clock,expectQueries,
  accounts:manifest.accounts.map(a=>({creationId:a.creationId,ownerUuid:a.ownerUuid,agentHash:hash(a.tokens.agent)}))}};
 let stdout='',overflow=false;child.stdout.on('data',part=>{if(Buffer.byteLength(stdout)+part.length>8192){overflow=true;child.kill();}else stdout+=part;});
 child.stderr.resume();child.stdin.on('error',()=>{});
 const timeout=setTimeout(()=>child.kill(),45000);
 try{
  const completion=new Promise((accept,reject)=>{child.once('error',()=>reject(new ValidationFailure('RESTART_CHECK_FAILED')));child.once('exit',code=>code===0?accept():reject(new ValidationFailure('RESTART_CHECK_FAILED')));});
  child.stdin.end(JSON.stringify(input));await completion;
  if(overflow)fail('RESTART_OUTPUT_INVALID');
  let output;try{output=JSON.parse(stdout);}catch{fail('RESTART_OUTPUT_INVALID');}
  if(!exactFields(output,['readOnlyRestart'])||output.readOnlyRestart!==true)fail('RESTART_OUTPUT_INVALID');
 }finally{clearTimeout(timeout);if(child.exitCode===null)child.kill();}
}
async function executeValidation(profile,manifest,{readOnly=false}={}){
 const scope=buildSyntheticScope(manifest,{readOnly}),realNow=Date.now;
 // Import only after the local guards. The adapter receives the explicit
 // client rather than the application's environment credential factory.
 const [{Redis},workspace]=await Promise.all([import('@upstash/redis'),import('../lib/workspace-store.ts')]);
 const client=new Redis({url:profile.url,token:profile.token,automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false});
 const redis=createScopedRedis(client,scope,{readOnly,scripts:{readWorkspace:workspace.READ_WORKSPACE_LUA,
  readPermission:workspace.READ_MARKET_PERMISSION_LUA,commitWorkspace:workspace.COMMIT_WORKSPACE_LUA},
  assertWindow:()=>{if(realNow()>=Date.parse(profile.expiresAt))fail('PROFILE_WINDOW_ENDED');}});
 const fresh=()=>workspace.createRedisWorkspaceStore(redis,scope.prefix,()=>({ownerIds:[],hashes:[]}),id=>manifest.accounts.find(a=>a.creationId===id)?.ownerUuid);
 Date.now=()=>manifest.started;
 if(readOnly){
  try{
   const store=fresh();
   for(let i=0;i<manifest.accounts.length;i++){
    const principal=await store.resolveHash(manifest.accounts[i].agentHash);
    assert.equal(principal.ownerId,scope.ownerIds[i]);
    assert.equal((await store.forPrincipal(principal).queries(principal.ownerId)).length,i===0?manifest.expectQueries:0);
   }
   return {readOnlyRestart:true};
  }finally{Date.now=realNow;}
 }
 let cleanup=false,stage='fresh-namespace-check',outcome;
 try{
  await redis.assertFreshNamespace();
  const store=fresh(),principals=[];
  const creation=a=>({creationId:a.creationId,humanAccessHash:hash(a.tokens.human),agentAccessHash:hash(a.tokens.agent)});
  stage='create-two-synthetic-accounts';
  for(const account of manifest.accounts){
   const result=await store.createWorkspace(creation(account),hash(account.tokens.bootstrap),'synthetic-shared-wifi');
   assert.equal(result.created,true);principals.push(await store.resolveHash(hash(account.tokens.agent)));
  }
  const query={requestId:randomUUID(),tool:'list_market_services',agentId:principals[0].agentId,
   recordedAt:new Date(manifest.started).toISOString(),outcome:'ok',inputHash:hash('synthetic input'),resultHash:hash('synthetic result'),evidence:'bazaar-observed'};
  stage='history-and-process-restart';
  await store.forPrincipal(principals[0]).recordQuery(principals[0].ownerId,query);
  await restartCheck(profile,manifest,manifest.started,1);
  await assert.rejects(store.forPrincipal(principals[1]).queries(principals[0].ownerId),{code:'UNAUTHORIZED'});
  const before=JSON.parse(await redis.get(scope.ownedKeys[0])).workspaces.find(m=>m.ownerId===scope.ownerIds[0]).documentBytes;
  const expired=manifest.started+7*86400000;Date.now=()=>expired;
  await restartCheck(profile,manifest,expired,0);
  stage='atomic-retention-cleanup';
  assert.equal((await store.pruneExpiredContent(principals[0].ownerId)).removed,1);
  const after=JSON.parse(await redis.get(scope.ownedKeys[0])).workspaces.find(m=>m.ownerId===scope.ownerIds[0]).documentBytes;
  assert.ok(after<before);
  await store.forPrincipal(principals[0]).recordQuery(principals[0].ownerId,query);
  assert.equal((await store.forPrincipal(principals[0]).queries(principals[0].ownerId)).length,0);
  assert.equal((await fresh().createWorkspace(creation(manifest.accounts[0]),hash(manifest.accounts[0].tokens.bootstrap),'synthetic-shared-wifi',false)).created,false);
  stage='shared-atomic-quotas';
  const parallel=await Promise.allSettled(Array.from({length:8},(_,i)=>fresh().consumeRequest(principals[i%2].ownerId,1)));
  assert.ok(parallel.some(result=>result.status==='fulfilled'));
  let registry=JSON.parse(await redis.get(scope.ownedKeys[0]));
  assert.equal(registry.globalRequestQuota.minuteCount,parallel.filter(result=>result.status==='fulfilled').length);
  for(const principal of principals){let count=registry.requestWindows.find(w=>w.ownerId===principal.ownerId)?.count??0;for(;count<60;count++)await fresh().consumeRequest(principal.ownerId,1);}
  registry=JSON.parse(await redis.get(scope.ownedKeys[0]));assert.equal(registry.globalRequestQuota.minuteCount,120);
  await assert.rejects(fresh().consumeRequest(principals[0].ownerId,1),{code:'WORKSPACE_RATE_LIMIT'});
  stage='complete';
  outcome={status:'PASS',category:'Local application with temporary exclusive Upstash Redis',
   namespaceDigest:hash(scope.prefix),syntheticAccounts:2,persistedAfterProcessRestart:true,
   expiredReplayCannotRevive:true,retentionDays:7,atomicByteAccounting:true,privateAccountIsolation:true,
   recoveryWhenAdmissionsClosed:true,concurrentAtomicQuota:true,sharedMinuteCap:120,perAccountMinuteCap:60,
   redisExchanges:redis.exchanges,networkUsed:true,profileExpiresAt:profile.expiresAt,profileBasis:profile.basis,
   realPayments:0,r2Validated:false};
 }catch(error){outcome=redactedValidationFailure(error,stage,true);}
 finally{
  try{cleanup=await redis.cleanupCreatedKeys();}catch{cleanup=false;}
  Date.now=realNow;
 }
 return {...outcome,isolatedSyntheticKeysRemoved:cleanup};
}
export async function main(args=process.argv.slice(2)){
 let stage='profile-validation';
 try{
  if(process.env.VERCEL||process.env.VERCEL_ENV||process.env.NODE_ENV==='production')fail('LOCAL_EXECUTION_REQUIRED');
  const mode=parseMode(args);isolateProcessEnvironment();
  const input=await readStdinJson();
  if(mode==='--verify'){
   stage='restart-validation';
   if(!exactFields(input,['profile','manifest']))fail('MANIFEST_INVALID');
   const profile=validateTemporaryProfile(input.profile);
   return await executeValidation(profile,input.manifest,{readOnly:true});
  }
  const profile=validateTemporaryProfile(input,{phase:mode==='--validate-pending-profile'?'pending':'ready'});
  if(mode==='--validate-profile'||mode==='--validate-pending-profile')return {
   status:'PASS',category:'Temporary exclusive Redis validation profile',profileValid:true,
   purpose:PURPOSE,mode:MODE,phase:profile.phase,expiresAt:profile.expiresAt,basis:profile.basis,networkUsed:false,
  };
  return await executeValidation(profile,createSyntheticManifest());
 }catch(error){return redactedValidationFailure(error,stage,false);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const outcome=await main();
 console.log(JSON.stringify(outcome));
 if(outcome.status==='FAIL'||outcome.isolatedSyntheticKeysRemoved===false)process.exitCode=1;
}
