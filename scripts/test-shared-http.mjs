import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {selectedEnv} from './lib/private-pilot-state.mjs';
import {configuredSettlementRedis,settleRedisOnce} from '../lib/redis-payment-settlement.ts';
import {paymentBinding} from '../lib/pilot-payment-store.ts';
import {handleSandboxPayment} from '../lib/sandbox-payment-handler.ts';
import {encodePaymentSignatureHeader} from '@x402/core/http';
Object.assign(process.env,selectedEnv('.env.local',['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN']));
process.env.NODE_ENV='test';process.env.X402_SETTLEMENT_STORE='redis';delete process.env.VERCEL;
const redis=configuredSettlementRedis(), prefix=process.env.HTTP_TEST_PREFIX??'bazaar:http:test:'+randomUUID();
const seller='GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ', path='/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy';
if(process.argv[2]==='worker'){
 const server=createServer(async(req,res)=>{try{
 const op=req.headers['idempotency-key'];let writes=0;
 const fault=process.env.HTTP_TEST_FAULT;
 const storage={eval:async(...args)=>{writes++;if(fault==='offline'||(fault==='final-fail'&&writes>1))throw Error('INJECTED_STORAGE_FAILURE');const v=await redis.eval(...args);if(fault==='lost-claim'&&writes===1)throw Error('INJECTED_CLAIM_RESPONSE_LOST');return v}};
 const deps={config:()=>({seller,apiKey:'unused-fixture'}),pilot:()=>true,payments:()=>true,directory:()=>undefined,facilitator:()=>({verify:async()=>({isValid:true}),settle:async()=>{await redis.incr(prefix+':calls:'+op);if(fault==='settle-lost')throw Error('INJECTED_RESPONSE_LOST');return {success:true,transaction:'a'.repeat(64),network:'stellar:testnet',payer:seller}}})};
 const response=await handleSandboxPayment(new Request('https://preview.example'+req.url,{headers:req.headers}),deps,(id,p,r,fn)=>settleRedisOnce(storage,prefix,id,p,r,fn));
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
 }catch{res.writeHead(500);res.end('TEST_FAILURE')}});server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
}else{
 const workers=[];
 async function worker(fault=''){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[import.meta.filename,'worker'],{env:{...process.env,HTTP_TEST_PREFIX:prefix,HTTP_TEST_FAULT:fault},stdio:['ignore','pipe','pipe']});workers.push(p);p.once('error',reject);p.stdout.once('data',d=>resolve({p,url:'http://127.0.0.1:'+String(d).trim()}));p.stderr.on('data',()=>{});p.once('exit',c=>{if(c)reject(Error('worker failed'))})})}
 try{
 const a=await worker(), b=await worker();const required=await (await fetch(a.url+path)).json();assert.equal(required.accepts.length,2);
 const req=(host,id,option=required.accepts[0])=>fetch(host.url+path,{headers:{'idempotency-key':id,'payment-signature':encodePaymentSignatureHeader({x402Version:2,resource:required.resource,accepted:option,payload:{fixture:true}})}});
 const responses=await Promise.all([req(a,'http-concurrent'),req(b,'http-concurrent')]);assert(responses.some(r=>r.status===200));assert.equal(await redis.get(prefix+':calls:http-concurrent'),'1');
 const original=await (await req(a,'http-concurrent')).json();a.p.kill();const fresh=await worker();assert.deepEqual(await (await req(fresh,'http-concurrent')).json(),original);assert.equal(await redis.get(prefix+':calls:http-concurrent'),'1');
 assert.equal((await req(b,'http-concurrent',required.accepts[1])).status,502);
 for(const tamper of [{amount:'1'},{payTo:seller.slice(0,-1)+'A'},{network:'stellar:pubnet'},{extra:{...required.accepts[0].extra,inputHash:'changed'}}])assert.equal((await req(b,'http-tamper',{...required.accepts[0],...tamper})).status,402);
 for(const fault of ['lost-claim','settle-lost','final-fail','offline']){const w=await worker(fault),id='http-'+fault;assert.equal((await req(w,id)).status,502);w.p.kill();if(fault!=='offline'){assert.equal((await req(b,id)).status,502);assert.equal(await redis.get(prefix+':calls:'+id),fault==='lost-claim'?null:'1')}else assert.equal(await redis.get(prefix+':calls:'+id),null)}
 for(const [i,value]of ['broken-json','null','{}',JSON.stringify({version:1,binding:'a'.repeat(64),owner:'owner',phase:'completed',createdAt:new Date().toISOString()})].entries()){const id='http-corrupt-'+i;await redis.set(prefix+':'+paymentBinding(id),value);const r=await req(b,id);assert.equal(r.status,502);assert((await r.text()).includes('SETTLEMENT_RECORD_INVALID'));assert.equal(await redis.get(prefix+':calls:'+id),null)}
 const xlm=await req(b,'http-xlm-result',required.accepts[1]);assert.equal(xlm.status,200);assert.deepEqual((await xlm.json()).result,original.result);
 console.log(JSON.stringify({http:true,realRedis:true,simulatedFacilitator:true,transfers:0,concurrentProcesses:true,restartRecovery:true,uncertainBlocked:true,corruptionRejected:true,usdcAndXlm:true,namespace:prefix}));
 }finally{for(const w of workers)w.kill()}
}
