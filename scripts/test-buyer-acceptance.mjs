import assert from 'node:assert/strict';
import { mkdtemp, open, unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const hostileEnv={...process.env,X402_SETTLEMENT_STORE:'redis',X402_PILOT_STATE_DIR:'never-used',X402_PILOT_PAYMENTS_ENABLED:'false',STELLAR_X402_FACILITATOR_URL:'https://unreachable.invalid',UPSTASH_REDIS_REST_URL:'https://unreachable.invalid',UPSTASH_REDIS_REST_TOKEN:'synthetic-hostile-token',BAZAAR_HISTORY_ACCOUNTS_JSON:'invalid',VERCEL:'1'};
const root=await mkdtemp(join(tmpdir(),'buyer-acceptance-')),dir=join(root,'isolated');
function run(command,extras=[],ok=true){const p=spawnSync(process.execPath,['scripts/buyer-acceptance.mjs',command,'--dir',dir,...extras],{encoding:'utf8',env:hostileEnv});assert.equal(p.status,ok?0:1,p.stderr+p.stdout);return JSON.parse(p.stdout.trim())}
const args=(id,extra=[])=>['--operation',id,'--asset','XLM','--budget','0.01',...extra];
run('prepare');
let r=run('buy',['--operation','missing-budget','--asset','XLM'],false);assert.match(r.error,/BUDGET/);
r=run('buy',['--operation','missing-asset','--budget','0.01'],false);assert.match(r.error,/ASSET/);
r=run('buy',args('missing-signer',['--fault','signer']),false);assert.match(r.error,/PAYER/);assert.equal(r.counters.signatures,0);
r=run('buy',args('tampered-terms',['--fault','tamper']),false);assert.match(r.error,/REQUIREMENTS_MISMATCH/);assert.equal(r.counters.signatures,0);
r=run('buy',args('history-retry',['--fault','history']));assert.equal(r.outcome.history.status,'failed');assert.equal(r.outcome.delivery.resultAvailable,true);assert.equal(r.counters.signatures,1);assert.equal(r.counters.settlements,1);
const delivered=r.outcome.data;
r=run('recover',args('history-retry'));assert.equal(r.outcome.history.status,'recorded');assert.deepEqual(r.outcome.data,delivered);assert.equal(r.historyRecords.length,1);assert.equal(r.otherOwnerRecords.length,0);assert.equal(r.counters.signatures,1);assert.equal(r.counters.settlements,1);
r=run('recover',args('history-retry'));assert.equal(r.historyRecords.length,1);assert.equal(r.counters.signatures,1);
r=run('recover',['--operation','history-retry','--asset','USDC','--budget','0.001'],false);assert.match(r.error,/CONFLICT/);assert.equal(r.counters.signatures,1);
r=run('buy',args('no-history-op',['--no-history']));assert.equal(r.outcome.history.status,'disabled');assert.equal(r.humanHistoryLink,null);assert.equal(r.counters.signatures,2);
r=run('recover',args('no-history-op',['--no-history']));assert.equal(r.counters.signatures,2);
r=run('buy',args('uncertain-op',['--fault','uncertain']),false);assert.match(r.error,/LOST_AFTER/);assert.equal(r.counters.signatures,3);assert.equal(r.counters.settlements,3);
r=run('recover',args('uncertain-op'),false);assert.match(r.error,/PAYMENT_PENDING/);assert.equal(r.counters.signatures,3);
r=run('buy',args('uncertain-op'),false);assert.match(r.error,/PAYMENT_PENDING/);assert.equal(r.counters.signatures,3);
r=run('recover',args('nonexistent-op'),false);assert.match(r.error,/NO_OPERATION/);
const lock=await open(join(dir,'session.lock'),'wx');try{r=run('buy',args('concurrent-op'),false);assert.match(r.error,/session locked/)}finally{await lock.close();await unlink(join(dir,'session.lock'))}
r=run('buy',['--operation','low-budget-op','--asset','XLM','--budget','0.001'],false);assert.match(r.error,/NO_AUTHORIZED/);assert.equal(r.counters.signatures,3);
r=run('buy',['--operation','usdc-success-op','--asset','USDC','--budget','0.001']);assert.equal(r.outcome.payment.asset,'USDC');assert.equal(r.counters.signatures,4);assert.equal(r.counters.settlements,4);
const raced=await Promise.all([1,2].map(()=>new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,['scripts/buyer-acceptance.mjs','buy','--dir',dir,...args('process-race-op')],{stdio:['ignore','pipe','pipe'],env:hostileEnv});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>{try{const result=JSON.parse(out.trim());if(code!==0)assert.match(result.error,/PAYMENT_PENDING/);resolve(result)}catch(e){reject(new Error(err+out+e.message))}});
})));
assert.ok(raced.some(r=>r.ok));
const state=JSON.parse(await readFile(join(dir,'simulation.json'),'utf8'));assert.deepEqual(state.counters,{signatures:5,settlements:5});
console.log(JSON.stringify({ok:true,simulation:true,realPayments:0,newProcessRecovery:true,historyRetryOnly:true,uncertaintyBlocked:true,concurrencyBlocked:true,explicitPolicy:true,ownerIsolation:true}));
