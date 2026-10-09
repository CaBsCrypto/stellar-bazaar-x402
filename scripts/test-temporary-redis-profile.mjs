// Every profile and client below is synthetic. No network or Redis database.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {
 validateTemporaryProfile,readStdinJson,childEnvironment,createSyntheticManifest,
 buildSyntheticScope,createScopedRedis,redactedValidationFailure,VALIDATION_CODES,
} from './validate-workspace-redis-isolated.mjs';

const clock=Date.now(),token='SYNTHETIC_PRIVATE_TOKEN_'+randomBytes(32).toString('base64url');
const ready={version:1,purpose:'bazaar-local-redis-validation',mode:'temporary-exclusive',phase:'ready',
 databaseId:randomUUID(),localLabel:'bazaar-local-validation-'+randomBytes(8).toString('hex'),
 createdAt:new Date(clock).toISOString(),expiresAt:new Date(clock+72*3600000).toISOString(),
 basis:'upstash-unclaimed-three-days',url:'https://synthetic-temporary-validation.upstash.io',token};
const {url:ignoredUrl,token:ignoredToken,...pendingMetadata}=ready;
const pending={...pendingMetadata,phase:'pending'};
let cases=0;
function rejects(fn,code){assert.throws(fn,error=>error.code===code);cases++;}
assert.equal(validateTemporaryProfile(ready,{now:clock}).token,token);cases++;
assert.equal(validateTemporaryProfile(pending,{now:clock,phase:'pending'}).phase,'pending');cases++;
for(const endpoint of [
 'http://synthetic-temporary-validation.upstash.io','https://user:password@synthetic-temporary-validation.upstash.io',
 'https://synthetic-temporary-validation.upstash.io:443','https://synthetic-temporary-validation.upstash.io:444',
 'https://synthetic-temporary-validation.upstash.io/rest','https://synthetic-temporary-validation.upstash.io?key='+token,
 'https://synthetic-temporary-validation.upstash.io#'+token,'https://synthetic-temporary-validation.upstash.io.attacker.example',
 'https://sub.synthetic-temporary-validation.upstash.io','https://127.0.0.1','https://%73ynthetic.upstash.io',
 'https://synthetic-temporary-validation.upstash.io\\@attacker.example',
])rejects(()=>validateTemporaryProfile({...ready,url:endpoint},{now:clock}),'PROFILE_ENDPOINT_INVALID');
for(const endpoint of ['https://smooth-dory-323957.upstash.io','https://smooth-dory-323957.upstash.io/','https://smooth-dory-other.upstash.io'])
 rejects(()=>validateTemporaryProfile({...ready,url:endpoint},{now:clock}),'SHARED_DATABASE_FORBIDDEN');
for(const [patch,code] of [
 [{version:2},'PROFILE_VERSION_INVALID'],[{purpose:'production'},'PROFILE_PURPOSE_INVALID'],
 [{mode:'shared'},'PROFILE_MODE_INVALID'],[{phase:'pending'},'PROFILE_PHASE_INVALID'],
 [{databaseId:'secret-not-uuid'},'PROFILE_ID_INVALID'],[{localLabel:'production'},'PROFILE_LABEL_INVALID'],
 [{token:'short'},'PROFILE_TOKEN_INVALID'],[{token:token+'\r\nSecret: '+token},'PROFILE_TOKEN_INVALID'],
 [{basis:'unbounded'},'PROFILE_BASIS_INVALID'],[{createdAt:new Date(clock+60001).toISOString()},'PROFILE_DATES_INVALID'],
 [{createdAt:'2026-02-30T00:00:00.000Z'},'PROFILE_DATES_INVALID'],
 [{expiresAt:new Date(clock).toISOString()},'PROFILE_EXPIRED'],
 [{expiresAt:new Date(clock+73*3600000).toISOString()},'PROFILE_LIFETIME_INVALID'],
 [{expiresAt:new Date(clock+3600000).toISOString()},'PROFILE_LIFETIME_INVALID'],
 [{unexpectedSecret:token},'PROFILE_FIELDS_INVALID'],
])rejects(()=>validateTemporaryProfile({...ready,...patch},{now:clock}),code);
assert.ok(validateTemporaryProfile({...ready,basis:'upstash-reported',expiresAt:new Date(clock+3600000).toISOString()},{now:clock}));cases++;
rejects(()=>validateTemporaryProfile(ready,{now:clock+72*3600000}),'PROFILE_EXPIRED');
rejects(()=>validateTemporaryProfile(pending,{now:clock}),'PROFILE_FIELDS_INVALID');
await assert.rejects(readStdinJson(Readable.from(['{"token":"'+token+'"'])),{code:'PROFILE_JSON_INVALID'});cases++;
await assert.rejects(readStdinJson(Readable.from(['x'.repeat(32769)])),{code:'PROFILE_TOO_LARGE'});cases++;
const injected=Object.assign(Error(token),{code:token.toUpperCase()});
const redacted=redactedValidationFailure(injected,token,true);
assert.equal(redacted.code,'VALIDATION_FAILED');assert.equal(redacted.stage,'profile-validation');
assert.ok(!JSON.stringify(redacted).includes(token));cases++;
const safeEnv=childEnvironment({SystemRoot:'C:/Windows',TEMP:'synthetic-temp',NODE_ENV:'production',
 BAZAAR_WORKSPACE_REDIS_REST_URL:ready.url,BAZAAR_WORKSPACE_REDIS_REST_TOKEN:token,
 UPSTASH_REDIS_REST_TOKEN:token,BAZAAR_MARKET_REDIS_REST_TOKEN:token,DATABASE_ID:ready.databaseId,
 NODE_OPTIONS:'--eval '+token,VERCEL:'1',PATH:token});
assert.deepEqual(Object.keys(safeEnv).sort(),[
 'SystemRoot','TEMP','NODE_ENV','BAZAAR_PUBLIC_DEMO','BAZAAR_WORKSPACE_ADMISSION','BAZAAR_ACCEPTANCE_METER',
 'BAZAAR_ACCEPTANCE_X402','BAZAAR_OPERATIONAL_METER','BAZAAR_OPERATIONAL_BUDGET',
].sort());assert.equal(safeEnv.NODE_ENV,'test');assert.ok(!JSON.stringify(safeEnv).includes(token));cases++;

const scripts={readWorkspace:'synthetic-read',readPermission:'synthetic-permission-read',commitWorkspace:'synthetic-commit'};
const scope=buildSyntheticScope(createSyntheticManifest(clock)),data=new Map([['unrelated-production-key',token]]),calls=[];
const client={
 async get(key){calls.push(['get',key]);return data.get(key)??null;},
 async eval(script,keys,args){calls.push(['eval',script,keys]);return keys.map(key=>data.get(key)??'');},
 async del(...keys){calls.push(['del',keys]);for(const key of keys)data.delete(key);return keys.length;},
};
let windowOpen=true;
const scoped=createScopedRedis(client,scope,{scripts,assertWindow:()=>{if(!windowOpen)throw Object.assign(Error('synthetic'),{code:'PROFILE_WINDOW_ENDED'});}});
assert.equal(scope.ownedKeys.length,4);
await scoped.assertFreshNamespace();cases++;
await assert.rejects(scoped.get('unrelated-production-key'),{code:'FOREIGN_KEY_FORBIDDEN'});cases++;
await assert.rejects(scoped.eval(scripts.readWorkspace,[scope.ownedKeys[0],'unrelated-production-key'],[]),{code:'FOREIGN_KEY_FORBIDDEN'});cases++;
await assert.rejects(scoped.eval('UNTRUSTED_SCRIPT',scope.ownedKeys,[]),{code:'FOREIGN_SCRIPT_FORBIDDEN'});cases++;
await assert.rejects(scoped.eval(scripts.commitWorkspace,[scope.ownedKeys[0],scope.readableKeys.at(-1),scope.ownedKeys.at(-1)],[]),{code:'FOREIGN_KEY_FORBIDDEN'});cases++;
await assert.rejects(scoped.eval(scripts.commitWorkspace,[scope.ownedKeys[1],scope.ownedKeys[0],scope.ownedKeys.at(-1)],[]),{code:'FOREIGN_KEY_FORBIDDEN'});cases++;
await scoped.eval(scripts.readWorkspace,scope.ownedKeys.slice(0,3),[]);cases++;
for(const key of scope.ownedKeys)data.set(key,'synthetic-created-content');
windowOpen=false;await assert.rejects(scoped.get(scope.ownedKeys[0]),{code:'PROFILE_WINDOW_ENDED'});cases++;
assert.equal(await scoped.cleanupCreatedKeys(),true,'Exact owned cleanup remains available after expiry');cases++;
assert.equal(data.get('unrelated-production-key'),token);
assert.deepEqual(calls.find(call=>call[0]==='del')[1],scope.ownedKeys);
assert.ok(!calls.some(call=>JSON.stringify(call).includes('unrelated-production-key')));cases++;
const collision=createScopedRedis(client,scope,{scripts});data.set(scope.ownedKeys[0],'pre-existing-content');
await assert.rejects(collision.assertFreshNamespace(),{code:'NEW_NAMESPACE_NOT_EMPTY'});cases++;
const delCount=calls.filter(call=>call[0]==='del').length;
assert.equal(await collision.cleanupCreatedKeys(),true);assert.equal(calls.filter(call=>call[0]==='del').length,delCount);
assert.equal(data.get(scope.ownedKeys[0]),'pre-existing-content');cases++;
const reader=createScopedRedis(client,scope,{scripts,readOnly:true});
await assert.rejects(reader.eval(scripts.commitWorkspace,scope.ownedKeys.slice(0,3),[]),{code:'READ_ONLY_RESTART_CHECK'});cases++;
await assert.rejects(reader.cleanupCreatedKeys(),{code:'READ_ONLY_RESTART_CHECK'});cases++;

async function invoke(args,input,envPatch={}){
 const child=spawn(process.execPath,['--experimental-strip-types',fileURLToPath(new URL('./validate-workspace-redis-isolated.mjs',import.meta.url)),...args],
  {stdio:['pipe','pipe','pipe'],env:{...childEnvironment(),
   BAZAAR_WORKSPACE_REDIS_REST_URL:'https://smooth-dory-323957.upstash.io',
   BAZAAR_WORKSPACE_REDIS_REST_TOKEN:token,UPSTASH_REDIS_REST_TOKEN:token,DATABASE_ID:ready.databaseId,...envPatch},windowsHide:true});
 let stdout='',stderr='';child.stdout.on('data',part=>stdout+=part);child.stderr.on('data',part=>stderr+=part);child.stdin.on('error',()=>{});
 const done=new Promise((accept,reject)=>{child.once('error',reject);child.once('exit',code=>accept(code));});
 child.stdin.end(typeof input==='string'?input:JSON.stringify(input));const exitCode=await done;
 for(const secret of [token,ready.url,ready.databaseId])assert.ok(!(stdout+stderr).includes(secret),'No profile secrets in stdout or stderr');
 assert.equal(stderr,'');const result=JSON.parse(stdout);
 assert.equal(result.networkUsed,false);if(result.status==='FAIL')assert.ok(VALIDATION_CODES.includes(result.code));
 return {result,exitCode};
}
for(const [args,input,expected] of [
 [['--validate-profile','--temporary-profile-stdin'],ready,'PASS'],
 [['--validate-pending-profile','--temporary-profile-stdin'],pending,'PASS'],
 [['--execute'],ready,'EXPLICIT_TEMPORARY_PROFILE_REQUIRED'],
 [['--execute','--temporary-profile-stdin'],'','PROFILE_JSON_INVALID'],
 [['--execute','--temporary-profile-stdin'],{...ready,url:'https://smooth-dory-323957.upstash.io'},'SHARED_DATABASE_FORBIDDEN'],
 [['--execute','--temporary-profile-stdin'],pending,'PROFILE_FIELDS_INVALID'],
 [['--verify','--temporary-profile-stdin'],{manifest:createSyntheticManifest(clock)},'MANIFEST_INVALID'],
 [['--validate-profile','--temporary-profile-stdin'],'{"token":"'+token+'"','PROFILE_JSON_INVALID'],
 [['--validate-profile','--execute','--temporary-profile-stdin'],ready,'INVALID_ARGUMENTS'],
]){
 const output=await invoke(args,input);assert.equal(output.result.status,expected==='PASS'?'PASS':'FAIL');
 assert.equal(output.exitCode,expected==='PASS'?0:1);if(expected!=='PASS')assert.equal(output.result.code,expected);cases++;
}
for(const envPatch of [{NODE_ENV:'production'},{VERCEL:'1'},{VERCEL_ENV:'preview'}]){
 const output=await invoke(['--validate-profile','--temporary-profile-stdin'],ready,envPatch);
 assert.equal(output.result.code,'LOCAL_EXECUTION_REQUIRED');assert.equal(output.exitCode,1);cases++;
}
console.log(JSON.stringify({status:'PASS',category:'Synthetic local guards for temporary Redis validation',
 cases,networkUsed:false,cloudDatabaseCreated:false,profileSecretsEchoed:false,
 inheritedProductionCredentialsUsed:false,exactScopedCleanup:true,restartReadOnlyGuards:true}));
