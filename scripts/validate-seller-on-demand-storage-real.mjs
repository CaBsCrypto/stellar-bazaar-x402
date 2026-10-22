import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorkerRedisCommands,createSellerRedisSecretStore,initializeSellerStorage,SELLER_STORAGE_READ_LUA,SELLER_STORAGE_WRITE_LUA} from '../examples/seller-redis-secret-store.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),TARGET='https://smooth-dory-323957.upstash.io',EVIDENCE=join(ROOT,'docs/evidence/seller-on-demand-storage-real-2026-10-11.json'),sources=['scripts/validate-seller-on-demand-storage-real.mjs','examples/seller-redis-secret-store.mjs','examples/seller-hosted-handler.mjs','examples/seller-hosted-tick.mjs'],hash=v=>createHash('sha256').update(v).digest('hex');
async function review(){const pins=Object.fromEntries(await Promise.all(sources.map(async p=>[p,hash(await readFile(join(ROOT,p)))])));return {sources:pins,sourceDigest:hash(JSON.stringify(pins))};}
function fail(code){throw Object.assign(Error(code),{code});}
async function input(){let count=0;const chunks=[];for await(const chunk of process.stdin){count+=chunk.length;if(count>16384)fail('INPUT_INVALID');chunks.push(chunk);}let packet;try{packet=JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{chunks.forEach(v=>v.fill(0));}if(Object.keys(packet??{}).sort().join(',')!=='token,url'||packet.url!==TARGET||typeof packet.token!=='string'||!/^[\x21-\x7e]{20,4096}$/.test(packet.token))fail('INPUT_INVALID');return packet;}
async function run(profile,pins){
 const started=Date.now(),prefix='bazaar-seller:preview-'+randomBytes(16).toString('hex'),bindingHash=randomBytes(32).toString('hex'),key=randomBytes(32).toString('base64url'),operationId=randomUUID(),name='seller.'+operationId,base=prefix+':'+bindingHash+':',keys=[base+'lock:seller.hosted',base+'data:seller.hosted.tick',base+'guard:seller.hosted.tick',base+'lock:'+name,base+'data:'+name,base+'guard:'+name,base+'storage:v1'],allowed=new Set(keys),raw=createWorkerRedisCommands({url:profile.url,token:profile.token});
 let rest=0,commands=0,evals=0,lose=false,owned=false,cleanup=false,release,opRelease,store,code,assertions=0,verifiedCleanup=0,deleted=0;const checks={};
 const check=(label,value)=>{assert.ok(value);assertions++;checks[label]=true;};
 const command=async values=>{
  if(++rest>160||Date.now()-started>110000&&!cleanup)fail('LIMIT');const op=values[0];if(!['GET','SET','EVAL','DEL','PTTL'].includes(op))fail('COMMAND');
  if(op==='EVAL'){const [script,n,...parts]=values.slice(1);if(!Number.isInteger(n)||n<1||n>7||parts.slice(0,n).some(k=>!allowed.has(k))||!['-- seller-storage-',"if redis.call('GET',KEYS[1])",'for i=1,#KEYS do'].some(s=>script.startsWith(s)))fail('KEY_SCOPE');evals++;commands+=40;}
  else{if(!allowed.has(values[1])||op==='DEL'&&values.length!==2)fail('KEY_SCOPE');commands++;}
  if(commands>2000)fail('LIMIT');const result=await raw(values);if(lose){lose=false;throw Error('SYNTHETIC_ACK_LOST');}return result;
 };
 try{
  for(const k of keys)check('fresh-'+keys.indexOf(k),await command(['GET',k])===null);owned=true;
  store=createSellerRedisSecretStore({command,prefix,key,bindingHash,storageBudget:true});
  await assert.rejects(store.capacityHeadroom(),/UNINITIALIZED/);check('missing-index-stops',true);
  await initializeSellerStorage(command,prefix,bindingHash,[]);check('explicit-bootstrap',true);
  const beforeRead=await command(['GET',keys[6]]),capacity=await store.capacityHeadroom();check('fresh-headroom',capacity.admissionReady);check('headroom-read-does-not-write',await command(['GET',keys[6]])===beforeRead);
  release=await store.acquireLock('seller.hosted');await store.write('seller.hosted.tick',{version:1,ticks:1});check('encrypted-checkpoint',(await store.read('seller.hosted.tick')).ticks===1);
  opRelease=await store.acquireLock(name);const record={version:1,operationId,attemptId:randomUUID(),cardHash:'c'.repeat(64),phase:'provider-started',contentExpiresAt:new Date(Date.now()+90000).toISOString(),binding:{input:{topic:'PRIVATE_SYNTHETIC_STORAGE'},transactionHash:'d'.repeat(64)}};
  await store.journal(name).initialize(record);check('encrypted-journal',!(await command(['GET',keys[4]])).includes('PRIVATE_SYNTHETIC_STORAGE'));check('native-ttl-fixed',(await command(['PTTL',keys[4]]))>0);
  await assert.rejects(store.journal(name).append({...record,contentExpiresAt:new Date(Date.now()+120000).toISOString()}),/BINDING_CHANGED/);check('expiry-cannot-extend',true);
  const wrong=createSellerRedisSecretStore({command,prefix,key,bindingHash:'f'.repeat(64),storageBudget:true});
  // Wrong binding uses the same exact ledger key and never obtains another key.
  const wrongRead=await command(['EVAL',SELLER_STORAGE_READ_LUA,1,keys[6],'f'.repeat(64)]);check('wrong-binding-stops',wrongRead[0]===-3);wrong.dispose();
  lose=true;await assert.rejects(store.journal(name).append({...record,phase:'generated',text:'PRIVATE_SYNTHETIC_RESULT',textHash:'e'.repeat(64)}),/SYNTHETIC_ACK_LOST/);
  check('lost-ack-readable-same-attempt',(await store.journal(name).read()).attemptId===record.attemptId);check('minimal-guard-no-result',!(await command(['GET',keys[5]])).includes('PRIVATE_SYNTHETIC_RESULT'));
  const good=await command(['GET',keys[6]]),filled=JSON.parse(good);filled.entries['f'.repeat(64)]={bytes:9000000,expiresAt:0};await command(['SET',keys[6],JSON.stringify(filled)]);
  check('full-store-no-admission',!(await store.capacityHeadroom()).admissionReady);const before=await command(['GET',keys[1]]);await assert.rejects(store.write('seller.hosted.tick',{version:1,ticks:2}),/STORAGE_CAPACITY/);check('full-store-no-partial-write',await command(['GET',keys[1]])===before);await command(['SET',keys[6],good]);
  await opRelease();opRelease=undefined;await release();release=undefined;
 }catch(error){code=error?.name==='AssertionError'?'ASSERTION':new Set(['LIMIT','INPUT_INVALID','KEY_SCOPE','COMMAND']).has(error?.code)?error.code:'VALIDATION_UNCONFIRMED';}
 finally{store?.dispose();cleanup=true;if(owned)try{for(const k of keys){deleted+=await command(['DEL',k]);if(await command(['GET',k])!==null)fail('CLEANUP_UNCONFIRMED');verifiedCleanup++;}}catch{code='CLEANUP_UNCONFIRMED';}}
 return {version:1,status:!code&&verifiedCleanup===7?'PASS':'FAIL',...(code?{code}:{}),observedAt:new Date(started).toISOString(),sources:pins.sources,sourceDigest:pins.sourceDigest,checks,assertions,isolatedKeys:7,keyFingerprints:keys.map(hash),networkUsed:rest>0,restRequests:rest,evalCalls:evals,conservativeRedisCommandsUpperBound:commands,exactOwnedKeysDeleted:deleted,verifiedCleanupKeys:verifiedCleanup,isolatedSyntheticKeysRemoved:verifiedCleanup===7,elapsedMs:Date.now()-started,realPayments:0,providerExecutions:0,realAccountsCreated:0,productionChanged:false,cronChanged:false};
}
if(process.argv.slice(2).join(',')==='--review')process.stdout.write(JSON.stringify(await review())+'\n');
else{let report;try{const argv=process.argv.slice(2),pins=await review();if(argv.length!==3||argv[0]!=='--execute'||argv[1]!=='--source-digest'||argv[2]!==pins.sourceDigest||process.env.VERCEL||process.env.VERCEL_ENV||process.env.NODE_ENV==='production')fail('REVIEW_REQUIRED');try{await lstat(EVIDENCE);fail('EVIDENCE_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}report=await run(await input(),pins);}catch{report={version:1,status:'FAIL',code:'PRECHECK_UNCONFIRMED',networkUsed:false,realPayments:0,providerExecutions:0};}if(report.networkUsed)await writeFile(EVIDENCE,JSON.stringify(report,null,2)+'\n',{flag:'wx'});process.stdout.write(JSON.stringify(report)+'\n');process.exitCode=report.status==='PASS'?0:1;}
