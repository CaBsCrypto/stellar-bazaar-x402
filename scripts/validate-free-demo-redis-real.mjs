import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Redis} from '@upstash/redis';
import {freeDemoBudgetConfiguration,createFreeDemoBudgetStore,classifyFreeDemoRequest,FREE_DEMO_BUDGET_LUA} from '../lib/free-demo-budget.ts';
import {WorkspaceError} from '../lib/workspace-types.ts';

// LOCAL isolated validation only. No wallet/account/order, deployment or cron.
// Existing Upstash access arrives via stdin; only one fresh random key is legal.
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),TARGET='https://smooth-dory-323957.upstash.io';
const EVIDENCE=join(ROOT,'docs/evidence/free-demo-redis-real-2026-10-11.json');
const SOURCES={
 'lib/free-demo-budget.ts':'7f1d97159df7c70d13fe60d7cbca6bb866c96cbc886a4b6e187714d65f0cc47e',
 'lib/operational-envelopes.ts':'709cfd356ca4c65003d338c528709fce90e99cf589087a266c87eead1a071c68',
 'lib/operational-pressure.ts':'adebc25de02ff2ceef1bb353c35d0704da115142d33d86c0ae0fc629bcaeed9b',
 'lib/operational-budget.ts':'f3cd50dc2b65b75ea9a634032ecd3cf5b128b2bc3813de41388193e4430a799d',
};
const sha=value=>createHash('sha256').update(value).digest('hex');
const codes=new Set(['EXECUTION_REQUIRED','LOCAL_ONLY','SOURCE_CHANGED','EVIDENCE_EXISTS','INPUT_INVALID','PATH_INVALID','KEY_COLLISION','LIMIT','TARGET','REDIS_UNCONFIRMED','ASSERTION','CLEANUP_UNCONFIRMED']);
function fail(code){throw Object.assign(Error(code),{code});}
const safeCode=error=>codes.has(error?.code)?error.code:error?.name==='AssertionError'?'ASSERTION':'REDIS_UNCONFIRMED';
async function precheck(){
 if(process.argv.slice(2).join(',')!=='--execute')fail('EXECUTION_REQUIRED');
 if(process.env.VERCEL||process.env.VERCEL_ENV||process.env.NODE_ENV==='production')fail('LOCAL_ONLY');
 for(const[file,expected]of Object.entries(SOURCES))if(sha(await readFile(join(ROOT,file)))!==expected)fail('SOURCE_CHANGED');
 const parent=dirname(EVIDENCE),info=await lstat(parent);if(!info.isDirectory()||info.isSymbolicLink()||resolve(await realpath(parent))!==parent)fail('PATH_INVALID');
 try{await lstat(EVIDENCE);fail('EVIDENCE_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
}
async function privateInput(){
 let size=0;const chunks=[],timer=setTimeout(()=>process.stdin.destroy(Error('INPUT_INVALID')),10000);
 try{for await(const chunk of process.stdin){size+=chunk.length;if(size>16384)fail('INPUT_INVALID');chunks.push(chunk);}
  let profile;try{profile=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INPUT_INVALID');}
  if(!profile||Object.keys(profile).sort().join(',')!=='token,url'||profile.url!==TARGET||typeof profile.token!=='string'||!/^[\x21-\x7e]{20,4096}$/.test(profile.token))fail('INPUT_INVALID');return profile;
 }finally{clearTimeout(timer);for(const chunk of chunks)chunk.fill(0);}
}
async function run(profile){
 const started=Date.now(),deadline=started+60000,prefix='bazaar-workspace:isolated-'+randomBytes(16).toString('hex');
 const configuration=freeDemoBudgetConfiguration({BAZAAR_FREE_DEMO_ADMISSION_UNTIL:new Date(started+86400000).toISOString(),BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON:JSON.stringify({public:244,authenticated:448,recovery:428})});
 const key=`${prefix}:{${prefix.split(':')[1]}}:free-demo-budget:${configuration.windowId}`;
 let rest=0,commands=0,held=0,evals=0,owned=false,deleted=0,cleaned=false,errorCode,stage='FRESH',loseReply=false,cleanup=false;
 const checks={},originalFetch=globalThis.fetch;
 const report={version:1,status:'FAIL',category:'Real Redis isolated Free demo command-reservation validation',observedAt:new Date(started).toISOString(),sources:SOURCES,scriptSha256:sha(await readFile(fileURLToPath(import.meta.url))),isolatedKeys:1,keyFingerprint:sha(key),checks,realPayments:0,providerExecutions:0,realAccountsCreated:0,productionChanged:false,cronChanged:false};
 globalThis.fetch=async(input,init={})=>{
  const target=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(target.origin!==TARGET||target.pathname!=='/'||target.search||target.hash||target.username||target.password||init.method!=='POST')fail('TARGET');
  let command;try{command=JSON.parse(init.body);}catch{fail('TARGET');}
  const name=String(command?.[0]).toLowerCase();
  if(!Array.isArray(command)||!['eval','get','set','ttl','del'].includes(name)||name==='eval'&&(command[1]!==FREE_DEMO_BUDGET_LUA||command[2]!==1||command[3]!==key)||name!=='eval'&&command[1]!==key)fail('TARGET');
  if(++rest>40)fail('LIMIT');
  return originalFetch(input,{...init,redirect:'error'});
 };
 const redis=new Redis({url:profile.url,token:profile.token,automaticDeserialization:false,retry:false,enableAutoPipelining:false,signal:()=>AbortSignal.timeout(8000)});
 const command=async(bound,action)=>{
  if(commands+held+bound>(cleanup?100:97)||!cleanup&&Date.now()>=deadline)fail('LIMIT');held+=bound;
  try{const result=await action();held-=bound;commands+=bound;return result;}catch(error){held-=bound;commands+=bound;throw error;}
 };
 const get=()=>command(1,()=>redis.get(key));
 const adapter={async eval(script,keys,args){
  if(script!==FREE_DEMO_BUDGET_LUA||keys.length!==1||keys[0]!==key||args.length!==7)fail('TARGET');evals++;
  const result=await command(4,()=>redis.eval(script,keys,args));
  // An unequivocal rejected/invalid response proves there was no SET. TIME may
  // still have run: reserve three commands, including the top-level EVAL.
  if(Array.isArray(result)&&[0,-2].includes(result[0]))commands--;
  if(loseReply){loseReply=false;throw Error('Synthetic response lost after Redis ACK');}
  return result;
 }};
 const store=()=>createFreeDemoBudgetStore(adapter,prefix,configuration);
 try{
  assert.equal(await get(),null);owned=true;checks.freshSingleKey=true;
  stage='CONCURRENCY';const outcomes=await Promise.allSettled(Array.from({length:8},()=>store().reserve({profile:'public',newOperation:false})));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.code==='FREE_DEMO_REQUEST_LIMIT').length,7);checks.eightConcurrentOneWinner=true;
  const first=await get(),parsed=JSON.parse(first);assert.equal(parsed.used.public,244);assert.ok(parsed.last>=started-60000&&parsed.last<=Date.now()+60000);checks.redisTimeRecorded=true;
  assert.equal(await command(1,()=>redis.ttl(key)),-1);checks.noExpiryOrRolloverReset=true;
  stage='RESTART';const beforeRestart=evals;await assert.rejects(()=>store().reserve({profile:'public',newOperation:false}),{code:'FREE_DEMO_REQUEST_LIMIT',status:429});assert.equal(evals-beforeRestart,1);assert.equal(await get(),first);checks.restartDeniedWithoutWrite=true;
  const control=new Request('https://synthetic.invalid/api/mcp',{method:'POST',headers:{authorization:'Bearer '+randomBytes(32).toString('base64url'),'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize'})});
  // Account proof is an explicit local dependency, not a real account lookup.
  stage='FALLBACK';const verified=await classifyFreeDemoRequest(control,async()=>({role:'agent'})),beforeFallback=evals;
  const receipt=await store().reserve(verified);assert.equal(receipt.profile,'recovery');assert.equal(receipt.reservedCommands,100);assert.equal(evals-beforeFallback,1);checks.authenticatedTransportFallbackSingleLua=true;
  const invalid=await classifyFreeDemoRequest(control,async()=>{throw new WorkspaceError('UNAUTHORIZED',401);}),beforeInvalid=await get();
  await assert.rejects(()=>store().reserve(invalid),{code:'FREE_DEMO_REQUEST_LIMIT'});assert.equal(await get(),beforeInvalid);checks.invalidCredentialCannotUseRecovery=true;
  stage='LOST_ACK';loseReply=true;const beforeLost=evals;
  await assert.rejects(()=>store().reserve({profile:'authenticated',newOperation:true}),{code:'FREE_DEMO_BUDGET_UNAVAILABLE'});assert.equal(evals-beforeLost,1);
  assert.equal(JSON.parse(await get()).used.authenticated,448);await assert.rejects(()=>store().reserve({profile:'authenticated',newOperation:true}),{code:'FREE_DEMO_REQUEST_LIMIT'});checks.lostAcknowledgementNeverReplayed=true;
  assert.equal(await command(1,()=>redis.ttl(key)),-1);checks.readAndRetryDoNotSetTtl=true;
  stage='MALFORMED';assert.equal(await command(1,()=>redis.set(key,'synthetic-malformed-ledger')),'OK');
  await assert.rejects(()=>store().reserve({profile:'recovery',newOperation:false}),{code:'FREE_DEMO_BUDGET_UNAVAILABLE',status:503});assert.equal(await get(),'synthetic-malformed-ledger');checks.malformedLedgerFailsWithoutWrite=true;
  stage='REGRESSION';const future={version:1,window:configuration.windowId,last:Date.now()+86400000,used:{public:0,authenticated:0,recovery:0}},raw=JSON.stringify(future);
  assert.equal(await command(1,()=>redis.set(key,raw)),'OK');await assert.rejects(()=>store().reserve({profile:'recovery',newOperation:false}),{code:'FREE_DEMO_BUDGET_UNAVAILABLE'});assert.equal(await get(),raw);checks.redisClockRegressionFailsClosed=true;
  stage='COMPLETE';
 }catch(error){errorCode=safeCode(error);}
 finally{
  cleanup=true;if(owned)try{deleted=await command(1,()=>redis.del(key));cleaned=await get()===null;if(!cleaned)fail('CLEANUP_UNCONFIRMED');}catch{errorCode='CLEANUP_UNCONFIRMED';}
  globalThis.fetch=originalFetch;
 }
 Object.assign(report,{status:!errorCode&&cleaned?'PASS':'FAIL',stage,...(errorCode?{code:errorCode}:{}),networkUsed:rest>0,restRequests:rest,conservativeRedisCommandsUpperBound:commands,evalCalls:evals,exactOwnedKeysDeleted:deleted,isolatedSyntheticKeysRemoved:cleaned,elapsedMs:Date.now()-started,limits:{rest:40,conservativeCommands:100,concurrency:8,deadlineMs:60000},accountVerification:'local dependency only; Redis Lua and TIME are real',budgetEvidence:'conservative reservation, not provider billing'});
 return report;
}
async function main(){
 let report;try{await precheck();const profile=await privateInput();report=await run(profile);}catch(error){report={version:1,status:'FAIL',code:safeCode(error),networkUsed:false,realPayments:0,providerExecutions:0};}
 if(report.networkUsed)try{await writeFile(EVIDENCE,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}catch{report.status='FAIL';report.code='EVIDENCE_EXISTS';}
 process.stdout.write(JSON.stringify(report)+'\n');process.exitCode=report.status==='PASS'?0:1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
