import {recoverRecordedPurchase} from './lib/automatic-recovery.mjs';
import {writePrivateJSON,selectedEnv} from './lib/private-pilot-state.mjs';
// Real Redis only; synthetic reports and signed test envelopes; no facilitator/network payment.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { RedisLiveStore } from '../../website-intelligence-recovery/work/build/src/x402/live-store.js';
import { createAppServer } from '../../website-intelligence-recovery/work/build/src/server.js';
import { createPaymentReplayStore } from '../../website-intelligence-recovery/work/build/src/x402/settlement-attempt-guard.js';
import { recoveryProofForToken } from '../../website-intelligence-recovery/work/build/src/x402/recovery.js';
import { encodeX402Header, decodeX402Header } from '../../website-intelligence-recovery/work/build/src/x402/encoding.js';
import { analyzeHtml } from '../../website-intelligence-recovery/work/build/src/live-audit.js';
import { Account, TransactionBuilder, Operation, Networks, Keypair } from '@stellar/stellar-sdk';
const env=selectedEnv('.env.local',['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN']);
process.env.LIVE_QA_REDIS_URL ??= env.UPSTASH_REDIS_REST_URL;
process.env.LIVE_QA_REDIS_TOKEN ??= env.UPSTASH_REDIS_REST_TOKEN;
const prefix=process.env.LIVE_QA_PREFIX ?? 'qa:auto-recovery:'+randomBytes(12).toString('hex');
const store=new RedisLiveStore(process.env.LIVE_QA_REDIS_URL,process.env.LIVE_QA_REDIS_TOKEN,prefix);
if (process.argv[2]==='read-child') {
  const state=await store.get(process.argv[3]);
  assert.equal(state.phase,'delivered');assert.equal(state.result.mode,'live');assert.ok(state.resultHash);
  console.log(JSON.stringify({newProcess:true,phase:state.phase,resultHash:state.resultHash}));
} else {
  assert.equal(process.argv[2],'--run-isolated-test');
  const payer=Keypair.random(), id=randomBytes(16).toString('hex'), token=randomBytes(32).toString('base64url');
  const config={enabled:true,settlementEnabled:true,liveEnabled:true,executionMode:'durable-multi-instance',configurationErrors:[],publicBaseUrl:'https://provider.test',endpointPath:'/v1/x402/audits',network:'stellar:testnet',asset:'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',payTo:payer.publicKey(),amount:'10000',maxTimeoutSeconds:60};
  let audits=0,settles=0,failFinalization=true;
  const faultStore={get:id=>store.get(id),create:value=>store.create(value),replace:async(a,b)=>{if(b.phase==="delivered"&&failFinalization){failFinalization=false;throw Error("INDUCED_FINALIZATION_FAILURE");}return store.replace(a,b);}};
  const deps={config,liveStore:faultStore,paymentReplayStore:createPaymentReplayStore(),settlementAttemptGuard:{tryConsume:()=>true},
    liveAudit:async input=>{audits++;return analyzeHtml({html:'<html lang="es"><title>Redis QA</title><h1>QA</h1>',finalUrl:input.url,fetchedAt:new Date().toISOString(),status:200,redirects:0},input.url);},
    facilitator:{supported:async()=>({kinds:[{x402Version:2,scheme:'exact',network:'stellar:testnet',extra:{areFeesSponsored:true}}],extensions:[],signers:{}}),verify:async()=>({isValid:true,payer:payer.publicKey()}),settle:async()=>{settles++;return{success:true,network:'stellar:testnet',transaction:'a'.repeat(64),amount:'10000',ledger:1};}},
    settlementEvidenceVerifier:{reconcile:async(_request,result)=>({...result,success:true,amount:'10000',ledger:1})},
  };
  const server=createAppServer(deps).listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const input={mode:'live',url:'https://example.com/',language:'es'}, headers={'content-type':'application/json','x-bazaar-request-id':id,'x-bazaar-recovery-proof':recoveryProofForToken(token)};
  const post=(path,body,extra={})=>fetch(base+path,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  try {
    const initial=await post(config.endpointPath,input);assert.equal(initial.status,402,await initial.clone().text());
    const required=decodeX402Header(initial.headers.get('payment-required'));
    const tx=new TransactionBuilder(new Account(payer.publicKey(),'1'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.manageData({name:'QA-NO-PAYMENT',value:'test'})).setTimeout(60).build();tx.sign(payer);
    const payment=encodeX402Header({x402Version:2,resource:required.resource,accepted:required.accepts[0],extensions:required.extensions,payload:{transaction:tx.toXDR()}});
    const paid=await post(config.endpointPath,input,{'payment-signature':payment});assert.equal(paid.status,503);assert.equal(settles,1);
    const prepared=await store.get(id);assert.equal(prepared.phase,'settled');
    const recovery={version:'website-intelligence.delivery-recovery/v1',requestId:id,recoveryId:prepared.recoveryId,recoveryToken:token};
    assert.equal((await post('/v1/x402/audits/recover',{...recovery,recoveryToken:randomBytes(32).toString('base64url')})).status,403);
    let queries=0,stores=0;const waits=[];const run={operationId:'isolated-'+id,paymentAttempted:true,status:'payment-uncertain'};
    const persist=r=>writePrivateJSON('work/automatic-recovery-qa/'+id+'.json',r);
    const io={persist,wait:async ms=>waits.push(ms),requestRecovery:async()=>{queries++;if(queries===1)throw Error('INDUCED_RESPONSE_LOSS');const response=await post('/v1/x402/audits/recover',recovery);assert.equal(response.status,200);return response.json();},accept:async(body,r)=>{assert.equal(body.resultHash,prepared.resultHash);r.result=body.result;persist(r);},store:async()=>{stores++;throw Error('INDUCED_BAZAAR_UNAVAILABLE');}};
    const first=await recoverRecordedPurchase(run,io);assert.equal(first.storage,'pending-storage');assert.equal(queries,2);assert.deepEqual(waits,[2000]);assert.deepEqual(run.result,prepared.result);
    const second=await recoverRecordedPurchase(run,{...io,store:async r=>{stores++;r.status='stored';persist(r);return {status:'stored'};}});assert.equal(second.ok,true);assert.equal(queries,2);assert.equal(stores,2);assert.equal(settles,1);assert.equal(audits,1);
    const state=await store.get(id);assert.equal(state.phase,'delivered');assert.equal(state.resultHash,prepared.resultHash);
    const child=spawn(process.execPath,[process.argv[1],'read-child',id],{env:{...process.env,LIVE_QA_PREFIX:prefix},stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>errors+=c);
    const [code]=await once(child,'exit');assert.equal(code,0,errors);assert.equal(JSON.parse(output).resultHash,state.resultHash);
    console.log(JSON.stringify({ok:true,redis:'real',prefix,keysRetained:1,audits,simulatedSettlementCalls:settles,recoveryQueries:queries,inducedFinalizationFailure:true,inducedResponseLoss:true,storageOnlyRetry:true,newProcessRecovery:true,wrongTokenDenied:true,realPayment:false}));
  } finally {await new Promise(r=>server.close(r));}
}
