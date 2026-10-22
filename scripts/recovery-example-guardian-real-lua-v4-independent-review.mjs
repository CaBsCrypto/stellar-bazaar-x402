// Independent LOCAL review. Reads public source and manifests only; never
// loads a private profile, connects to Redis, or executes the validation driver.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GUARDIAN_LUA_VALIDATION_V4 as P,GUARDIAN_LUA_VALIDATION_KEYS_V4 as K,GUARDIAN_LUA_HASHES_V4 as H,loadFrozenGuardianLuaV4,createBoundedGuardianLuaTransportV4} from './recovery-example-guardian-real-lua-v4.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const pins=Object.freeze({
 'scripts/recovery-example-guardian-real-lua-v4.mjs':'76ff84b1db100bcbd3bd5787592d46b41499668891ad077a9acea4b2f8cc087b',
 'scripts/recovery-example-guardian-real-lua-v4-access.mjs':'8caeab73ae6f3228f7963883b9f42a4096e4a18741adcc49563863d1fe969345',
 '.vercel/recovery-example-guardian-real-lua-v4.ps1':'20bb243d4408e7c4ba8ae27a4d54db9985737bdc29cc254e5bac2f6eac527ec2',
});
export async function reviewGuardianRealLuaV4(root=process.cwd()){
 let checks=0,fakeExchanges=0;const require=(value,code)=>{if(!value)throw Error(code);checks++;};
 for(const [path,digest]of Object.entries(pins)){const bytes=await readFile(new URL('../'+path,import.meta.url));require(sha(bytes)===digest,'EXACT_V4_LOCAL_LUA_HELPERS_REQUIRED');}
 const modules=await loadFrozenGuardianLuaV4();require(JSON.stringify(modules.scriptHashes)===JSON.stringify(H),'EXACT_FROZEN_GUARDIAN_SCRIPTS_REQUIRED');
 const keys=Object.values(K);require(keys.length===12&&new Set(keys).size===12,'TWELVE_DISPOSABLE_KEYS_REQUIRED');
 for(const key of keys)require(new RegExp('^bazaar-(?:workspace|market):'+P.family+':guardian-validation:v4:20261013-b626:(?:ledger-(?:normal|missing|invalid|full|claim-race)|policy-(?:normal|missing|invalid|full|init-race|claim-race)|index)$').test(key),'EXACT_DISPOSABLE_KEY_SCOPE_REQUIRED');
 const profile={purpose:P.purpose,family:P.family,url:P.url,token:'synthetic-not-a-live-credential'};
 const transport=createBoundedGuardianLuaTransportV4(profile,{scriptHashes:H,fetchImpl:async(url,request)=>{fakeExchanges++;require(url===P.url&&request.redirect==='error'&&request.credentials==='omit'&&request.cache==='no-store','FIXED_LOCAL_REDIS_PACKET_REQUIRED');return Response.json({result:null});}});
 const deny=async(body,weight=1)=>{const before=fakeExchanges;let stopped=false;try{await transport.send(body,weight);}catch{stopped=true;}require(stopped&&fakeExchanges===before,'UNREVIEWED_EFFECT_MUST_STOP_BEFORE_TRANSPORT');};
 await deny(['EVAL',"redis.call('SET','outside','x');return 1",1,K['ledger-normal']]);
 await deny(['EVAL',modules.guardian.CAS_GUARDIAN_POLICY_LUA,1,K['policy-normal'],'missing','','{}'],1);
 await deny(['GET','bazaar-workspace:'+P.family+':{'+P.family+'}:continuous-free-budget:v1']);
 await deny(['SET',K['ledger-normal'],'overwrite','XX']);await deny(['DEL',K['ledger-normal']]);await deny(['SCAN','0']);
 await transport.send(['GET',K['ledger-normal']],1);require(fakeExchanges===1,'EXACT_SYNTHETIC_GET_ONLY');
 let release,inflight=0;const gate=new Promise(r=>{release=r;}),parallel=createBoundedGuardianLuaTransportV4(profile,{scriptHashes:H,fetchImpl:async()=>{inflight++;await gate;return Response.json({result:null});}}),pending=[];
 for(let i=0;i<30;i++)pending.push(parallel.send(['GET',K['ledger-normal']],1));
 let blocked=false;try{await parallel.send(['GET',K['ledger-normal']],1);}catch{blocked=true;}
 require(blocked&&inflight===30&&parallel.snapshot().reservedInbound===30*65536,'CONCURRENT_RESPONSES_RESERVED_BEFORE_SEND');release();await Promise.all(pending);require(parallel.snapshot().reservedInbound===0,'INBOUND_RESERVATIONS_FINISHED');
 const g=modules.guardian,now=1770000000000,p=g.initialGuardianPolicy(now),claim=g.claimGuardianPolicy(p,now,'11111111-1111-4111-8111-111111111111');
 for(const phase of ['claimed','debited','uncertain']){const state={...claim,attempts:claim.attempts.map(a=>({...a,phase}))};let denied=false;try{g.claimGuardianPolicy(state,now+100*86400000,'22222222-2222-4222-8222-222222222222');}catch(error){denied=error.code==='GUARDIAN_PRIOR_ATTEMPT_UNCERTAIN';}require(denied,'UNCERTAIN_ATTEMPT_MUST_NOT_EXPIRE');}
 require(g.guardianExistingIdleBudgetLua().includes("if not existing then return {-2,0,'background',60} end"),'MISSING_LEDGER_MUST_NOT_INITIALIZE');
 require(g.claimGuardianBudgetLua().includes("if not budgetRaw then redis.call('SET',KEYS[1],ARGV[2]);return {-2"),'MISSING_LEDGER_RETAINS_ONLY_CLAIM');
 return {status:'PASS_LOCAL_INDEPENDENT_REAL_LUA_EXECUTION_PREPARATION_V4',checks,sourceDigest:P.source,manifestSha256:P.manifestSha256,helperPins:pins,scriptHashes:H,allowedLocalFamilyFingerprint:sha(P.family),disposableKeyFingerprints:keys.map(sha),guard:{maximumAuditedCommands:200,maximumApplicationJsonBodyBytes:2000000,maximumResponseBodyBytes:65536,concurrentResponsesReserved:true,unknownLuaDeniedBeforeSend:true},privateProfileReads:0,realNetworkRequests:0,actualRedisLuaExecutions:0,payments:0,providerExecutions:0,productionChanges:0,limitations:['Real Redis cjson and competing Lua commits have not been executed by this independent review.','Application JSON body bytes and audited command upper bounds are not an upstream billing invoice.','The pinned driver will stop on a disposable-key collision and does not automatically retry an uncertain response.']};
}
