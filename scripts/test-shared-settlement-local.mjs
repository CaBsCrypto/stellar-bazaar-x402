// Offline orchestration test. This models atomic eval semantics, not real Redis/Lua durability.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {settleRedisOnce} from '../lib/redis-payment-settlement.ts';
import {paymentBinding} from '../lib/pilot-payment-store.ts';
import {handleSandboxPayment} from '../lib/sandbox-payment-handler.ts';
import {encodePaymentSignatureHeader} from '@x402/core/http';

const prefix='bazaar:local:simulated';
const payload={fixture:true};
const requirements={asset:'fixture-USDC',amount:'10000',network:'stellar:testnet',payTo:'fixture-seller',extra:{inputHash:'fixture-input'}};
const outcome={success:true,transaction:'a'.repeat(64),network:'stellar:testnet'}; // Synthetic hash, no transfer.
if(process.argv[2]==='worker') {
  const url=process.argv[3];
  const redis={eval:async(script,keys,args)=>(await fetch(url,{method:'POST',body:JSON.stringify({script,keys,args})})).json()};
  try {await settleRedisOnce(redis,prefix,'concurrent',payload,requirements,async()=>{await fetch(url+'/settle',{method:'POST'});return outcome});}
  catch(error){if(error.message!=='PAYMENT_PENDING')throw error;}
} else {
  const records=new Map();let calls=0;
  const redis={eval:async(_script,keys,args)=>{
    const key=keys[0],raw=records.get(key);
    if(args.length===1){if(raw!==undefined)return [0,raw];records.set(key,args[0]);return [1,args[0]];}
    if(!raw)return 0;
    const prior=JSON.parse(raw);
    if(prior.owner!==args[0]||prior.binding!==args[1]||prior.phase==='completed')return 0;
    records.set(key,args[2]);return 1;
  }};
  const server=createServer(async(req,res)=>{
    if(req.url==='/settle'){calls++;res.end('{}');return;}
    let body='';for await(const chunk of req)body+=chunk;
    const {script,keys,args}=JSON.parse(body);res.end(JSON.stringify(await redis.eval(script,keys,args)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const worker=()=>new Promise((resolve,reject)=>{
    const p=spawn(process.execPath,[import.meta.filename,'worker',url],{stdio:['ignore','ignore','pipe']});
    let error='';p.stderr.on('data',data=>error+=data);p.on('error',reject);p.on('exit',code=>code?reject(Error(error)):resolve());
  });
  const settle=async()=>{calls++;return outcome};
  const run=(id,client=redis,fn=settle,r=requirements)=>settleRedisOnce(client,prefix,id,payload,r,fn);
  try {
    await Promise.all([worker(),worker(),worker()]);assert.equal(calls,1);
    await worker();assert.equal(calls,1);
    for(const changed of [{asset:'fixture-XLM'},{amount:'1'},{network:'wrong'},{payTo:'other'},{extra:{inputHash:'changed'}}])await assert.rejects(run('concurrent',redis,settle,{...requirements,...changed}),/CONFLICT/);
    const before=calls;
    await assert.rejects(run('offline',{eval:async()=>{throw Error('offline')}}),/offline/);assert.equal(calls,before);
    await assert.rejects(run('lost-claim',{eval:async(...args)=>{await redis.eval(...args);throw Error('lost claim')}}),/lost claim/);
    await assert.rejects(run('lost-claim'),/PENDING/);assert.equal(calls,before);
    await assert.rejects(run('lost-settle',redis,async()=>{calls++;throw Error('lost settle')}),/lost settle/);
    const lostCount=calls;await assert.rejects(run('lost-settle'),/PENDING/);assert.equal(calls,lostCount);
    let writes=0;
    await assert.rejects(run('failed-save',{eval:async(...args)=>{if(++writes>1)throw Error('save failed');return redis.eval(...args)}}),/save failed/);
    const savedCount=calls;await assert.rejects(run('failed-save'),/PENDING/);assert.equal(calls,savedCount);
    let updates=0;
    await assert.rejects(run('lost-final',{eval:async(...args)=>{const result=await redis.eval(...args);if(++updates===2)throw Error('lost final');return result}}),/lost final/);
    const finalCount=calls;assert.deepEqual(await run('lost-final'),outcome);assert.equal(calls,finalCount);
    for(const [i,raw]of ['broken-json','null','{}',JSON.stringify({version:1,binding:'a'.repeat(64),owner:'fixture',phase:'completed',createdAt:new Date().toISOString()})].entries()){
      const id='corrupt-'+i;records.set(prefix+':'+paymentBinding(id),raw);
      await assert.rejects(run(id),/RECORD_INVALID/);
    }
    assert.equal(calls,finalCount);

    for(const [i,invalid] of [{...outcome,transaction:'wrong'},{...outcome,payer:42}].entries()){
      const id='invalid-evidence-'+i;
      records.set(prefix+':'+paymentBinding(id),JSON.stringify({version:1,binding:paymentBinding({payload,requirements}),owner:'fixture',phase:'completed',createdAt:new Date().toISOString(),outcome:invalid}));
      await assert.rejects(run(id),/RECORD_INVALID/);
    }
    assert.equal(calls,finalCount);

    const original=process.env.X402_SETTLEMENT_STORE;
    let facilitatorCalls=0;
    const deps={config:()=>({seller:'GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ'}),pilot:()=>false,directory:()=>undefined,payments:()=>false,facilitator:()=>{facilitatorCalls++;throw Error('unexpected facilitator')}};
    const target='http://127.0.0.1/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy';
    try {
      delete process.env.X402_SETTLEMENT_STORE;
      const challenge=await (await handleSandboxPayment(new Request(target),deps)).json();
      const request=()=>new Request(target,{headers:{'payment-signature':encodePaymentSignatureHeader({x402Version:2,resource:challenge.resource,accepted:challenge.accepts[0],payload})}});
      assert.equal((await handleSandboxPayment(request(),deps)).status,503);
      process.env.X402_SETTLEMENT_STORE='redis';
      assert.equal((await handleSandboxPayment(request(),{...deps,payments:()=>true})).status,503);
      assert.equal(facilitatorCalls,0);
    }finally{if(original===undefined)delete process.env.X402_SETTLEMENT_STORE;else process.env.X402_SETTLEMENT_STORE=original;}
    console.log(JSON.stringify({ok:true,storage:'simulated atomic eval, not Redis',facilitator:'simulated',transfers:0,concurrentProcesses:3,newProcessRecovery:true,tampering:true,uncertaintyBlocked:true,corruptionRejected:true,httpPaymentsDisabled:true}));
  }finally{await new Promise(resolve=>server.close(resolve));}
}
