import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { selectedEnv } from './lib/private-pilot-state.mjs';
import { configuredSettlementRedis, settleRedisOnce } from '../lib/redis-payment-settlement.ts';
import { paymentBinding } from '../lib/pilot-payment-store.ts';
Object.assign(process.env,selectedEnv('.env.local',['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN']));
const redis=configuredSettlementRedis(), prefix=process.env.SETTLEMENT_TEST_PREFIX??'bazaar:settlement:test:'+randomUUID();
const payload={test:true}, requirements={asset:'fixture-USDC',amount:'10000',network:'stellar:testnet',payTo:'fixture-recipient',extra:{inputHash:'fixture-input'}};
const settle=async()=>{await redis.incr(prefix+':calls');return {success:true,transaction:'a'.repeat(64),network:'stellar:testnet'}}; // Synthetic hash, no transfer.
const run=(id,r=requirements,client=redis,fn=settle)=>settleRedisOnce(client,prefix,id,payload,r,fn);
if(process.argv[2]==='child'){try{await run('concurrent');console.log('completed')}catch(e){if(e.message!=='PAYMENT_PENDING')throw e;console.log('pending')}process.exit(0)}
const child=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[import.meta.filename,'child'],{env:{...process.env,SETTLEMENT_TEST_PREFIX:prefix},stdio:['ignore','pipe','pipe']});let err='';p.stderr.on('data',d=>err+=d);p.on('exit',code=>code?reject(Error(err)):resolve());});
await Promise.all([child(),child(),child()]);assert.equal(await redis.get(prefix+':calls'),'1');await child();assert.equal(await redis.get(prefix+':calls'),'1');
for(const changed of [{asset:'fixture-XLM'},{amount:'100000'},{network:'wrong'},{payTo:'other'},{extra:{inputHash:'changed'}}])await assert.rejects(run('concurrent',{...requirements,...changed}),/OPERATION_CONFLICT/);
const before=Number(await redis.get(prefix+':calls'));
const lostClaim={eval:async(...args)=>{await redis.eval(...args);throw Error('lost claim response')}};
await assert.rejects(run('lost-claim',requirements,lostClaim),/lost claim/);await assert.rejects(run('lost-claim'),/PAYMENT_PENDING/);assert.equal(Number(await redis.get(prefix+':calls')),before);
await assert.rejects(run('offline',requirements,{eval:async()=>{throw Error('offline')}}),/offline/);
await assert.rejects(run('after-send',requirements,redis,async()=>{await redis.incr(prefix+':calls');throw Error('lost facilitator response')}),/lost facilitator/);await assert.rejects(run('after-send'),/PAYMENT_PENDING/);
let writes=0;const finalFailure={eval:async(...args)=>{if(++writes>1)throw Error('save unavailable');return redis.eval(...args)}};
await assert.rejects(run('save-failure',requirements,finalFailure),/save unavailable/);await assert.rejects(run('save-failure'),/PAYMENT_PENDING/);
let updates=0;const lostFinal={eval:async(...args)=>{const v=await redis.eval(...args);if(++updates===2)throw Error('final response lost');return v}};
await assert.rejects(run('lost-final',requirements,lostFinal),/final response lost/);assert.equal((await run('lost-final')).transaction,'fixture-only-no-transfer');
assert.equal(await redis.ttl(prefix+':'+paymentBinding('concurrent')),-1);
// Read-only provider diagnostics; these do not establish backup/restore guarantees.
const diagnostics={};for(const command of ['INFO','CONFIG']){try{const r=command==='INFO'?await redis.info():await redis.configGet('maxmemory-policy');diagnostics[command]=typeof r==='string'?r.split('\n').filter(l=>/aof_enabled|rdb_last_bgsave_status|maxmemory_policy/.test(l)).join(';')||'supported, durability not established':'supported';}catch{diagnostics[command]='unavailable'}}
console.log(JSON.stringify({realRedis:true,facilitator:'simulated',transfers:0,concurrentProcesses:3,singleSettlement:true,newProcessRecovery:true,conflictsRejected:true,lostClaim:true,uncertainBlocked:true,finalizationFailure:true,noExpiry:true,diagnostics,namespace:prefix}));

const {handleSandboxPayment}=await import('../lib/sandbox-payment-handler.ts');
process.env.X402_SETTLEMENT_STORE='redis';
let facilitatorCalls=0;
const deps={config:()=>({seller:'fixture-seller'}),pilot:()=>true,directory:()=>undefined,payments:()=>true,facilitator:()=>{facilitatorCalls++;throw Error('must not be reached')}};
const denied=await handleSandboxPayment(new Request('https://preview.example/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy',{headers:{'payment-signature':'fixture'}}),deps);
assert.equal(denied.status,503);assert.equal(facilitatorCalls,0);delete process.env.X402_SETTLEMENT_STORE;
console.log('PASS shared HTTP gate blocks facilitator even when payments flag is enabled');
