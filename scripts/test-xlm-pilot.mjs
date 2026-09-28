import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Keypair, Asset, Networks } from '@stellar/stellar-sdk';
import { encodePaymentSignatureHeader, decodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { TESTNET_ASSETS,sandboxOptions,selectPaymentOption } from '../lib/payment-options.ts';
import { spendableTestnetBalances } from '../lib/testnet-balances.ts';
import { FilePaymentJournal, paymentBinding } from '../lib/pilot-payment-store.ts';
import { settlePilotOnce } from '../lib/pilot-settlement.ts';
import { handleSandboxPayment } from '../lib/sandbox-payment-handler.ts';
import { BazaarAgentClient } from '../lib/bazaar-agent-client.ts';
import { parseServiceCardShape } from '../lib/service-card-schema.ts';
import { toPaidService,toServiceCard } from '../lib/service-card.ts';
import { filterServices } from '../lib/discovery.ts';
import { generateHistoryKeypair, authenticateHistory } from '../lib/operation-history-auth.ts';
import { createHistoryHandlers } from '../lib/operation-history-http.ts';
import { createHistoryStore } from '../lib/operation-history-store.ts';
const directory=await mkdtemp(join(tmpdir(),'bazaar-xlm-'));
const payer=Keypair.random(),seller=Keypair.random().publicKey(); // Ephemeral, unfunded test keys. Never printed.
const card={version:'bazaar.service-card/v0',id:'swap-risk-quote',name:'Sandbox',description:'Deterministic sandbox result for isolated tests.',kind:'http',url:'http://127.0.0.1:3215',routeTemplate:'/api/x402/swap-risk?pair={pair}&amount={amount}&side={side}',input:['pair','amount','side'].map(name=>({name,type:name==='amount'?'number':'string',required:true})),network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.001',destination:seller},paymentOptions:sandboxOptions(seller),provider:{name:'Test'},tags:['sandbox']};
const params={pair:'XLM/USDC',amount:2500,side:'buy'};
// Existing malformed records are never absence and can never authorize another attempt.
const corruptDir=join(directory,'corrupt');await mkdir(corruptDir);
const corruptStore=new FilePaymentJournal(corruptDir);let corruptSettlements=0;
const corruptRequirements={network:'stellar:testnet'},corruptPayload={fixture:true};
for(const [i,raw] of ['null','false','0','""','[]','{}','broken-json',JSON.stringify({binding:paymentBinding({payload:corruptPayload,requirements:corruptRequirements}),phase:'completed',outcome:{success:true,network:'wrong',transaction:'wrong'}})].entries()) {
 const id='corrupt-'+i;await writeFile(join(corruptDir,paymentBinding(id)+'.json'),raw);
 for(let attempt=0;attempt<2;attempt++)await assert.rejects(()=>settlePilotOnce(corruptStore,id,corruptPayload,corruptRequirements,async()=>{corruptSettlements++;return {success:true,network:'stellar:testnet',transaction:'fixture'}}));
}
assert.equal(corruptSettlements,0);
for(const [i,outcome] of [{success:true,network:'stellar:testnet',transaction:'wrong'}, {success:true,network:'stellar:testnet',transaction:'a'.repeat(64),payer:42}].entries()) {
 const id='invalid-receipt-'+i;
 await writeFile(join(corruptDir,paymentBinding(id)+'.json'),JSON.stringify({binding:paymentBinding({payload:corruptPayload,requirements:corruptRequirements}),phase:'completed',outcome}));
 await assert.rejects(()=>settlePilotOnce(corruptStore,id,corruptPayload,corruptRequirements,async()=>{corruptSettlements++;throw Error('MUST NOT SETTLE')}),/JOURNAL_INVALID/);
}
assert.equal(corruptSettlements,0);
assert.equal(Asset.native().contractId(Networks.TESTNET),TESTNET_ASSETS.XLM);
assert.ok(parseServiceCardShape(card).ok);
assert.deepEqual(toServiceCard(toPaidService(card)),card);
const items=[toPaidService(card)];
assert.equal(filterServices(items,{asset:'XLM',maxPrice:0.005}).length,0);
assert.equal(filterServices(items,{asset:'XLM',maxPrice:0.01}).length,1);
assert.equal(filterServices(items,{maxPrice:0.001}).length,1);
assert.equal(filterServices(items,{maxPrice:NaN}).length,0);
const xlmOnly={...items[0],payment:{...items[0].payment,asset:'XLM',amount:'0.0001'},paymentOptions:undefined};
assert.equal(filterServices([xlmOnly],{maxPrice:0.001}).length,0,'implicit price limit compares USDC only');
assert.equal(filterServices([xlmOnly],{asset:'XLM',maxPrice:0.001}).length,1);
const policy={allowedAssets:['USDC','XLM'],budgets:{USDC:'0.001',XLM:'0.01'},balances:{USDC:'10000',XLM:'100000'}};
assert.equal(selectPaymentOption(card,policy).asset,'USDC');
assert.equal(selectPaymentOption(card,{...policy,balances:{USDC:'0',XLM:'100000'}}).asset,'XLM');
assert.throws(()=>selectPaymentOption(card,{...policy,balances:{USDC:'0',XLM:'100000'},budgets:{USDC:'1'}}),/NO_AUTHORIZED/);
assert.throws(()=>selectPaymentOption(card,{...policy,preferredAsset:'USDC',balances:{USDC:'0',XLM:'100000'}}),/NO_AUTHORIZED/);
assert.throws(()=>selectPaymentOption(card,{...policy,allowedAssets:['USDC'],balances:{USDC:'0',XLM:'100000'}}),/NO_AUTHORIZED/);
assert.throws(()=>selectPaymentOption({...card,paymentOptions:[{...card.paymentOptions[0],contract:TESTNET_ASSETS.XLM}]},policy),/INVALID/);
assert.throws(()=>selectPaymentOption({...card,paymentOptions:card.paymentOptions.map(o=>({...o,amount:'0.00000001'}))},policy));
assert.throws(()=>selectPaymentOption(card,{...policy,budgets:{USDC:'0.0001',XLM:'0.001'}}),/NO_AUTHORIZED/);
assert.equal(spendableTestnetBalances({subentry_count:0,balances:[{asset_type:'native',balance:'1.0050000',selling_liabilities:'0'}]},'5000000').XLM,'50000');
assert.throws(()=>selectPaymentOption(card,{...policy,balances:{USDC:'0',XLM:'50000'}}),/NO_AUTHORIZED/);
let settleCalls=0,verifyCalls=0,settleThrows=false;
const deps={config:()=>({seller,apiKey:'simulated'}),pilot:()=>true,payments:()=>true,directory:()=>join(directory,'provider'),facilitator:()=>({verify:async()=>{verifyCalls++;return {isValid:true,payer:payer.publicKey()}},settle:async()=>{settleCalls++;await new Promise(r=>setTimeout(r,20));if(settleThrows)throw Error('simulated lost settlement response');return {success:true,network:'stellar:testnet',transaction:'a'.repeat(64),payer:payer.publicKey()}}})};
const url=card.url+'/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy';
const challenge=await handleSandboxPayment(new Request(url),deps);assert.equal(challenge.status,402);
const required=decodePaymentRequiredHeader(challenge.headers.get('payment-required'));assert.equal(required.accepts.length,2);
const legacy=await handleSandboxPayment(new Request(url),{...deps,pilot:()=>false});assert.equal(decodePaymentRequiredHeader(legacy.headers.get('payment-required')).accepts.length,1);
function request(requirements,key){return new Request(url,{headers:{'idempotency-key':key,'payment-signature':encodePaymentSignatureHeader({x402Version:2,resource:required.resource,accepted:requirements,payload:{simulatedAuthorization:true}})}})}
assert.equal((await handleSandboxPayment(request(required.accepts[1],'disabled-payment'),{...deps,payments:()=>false})).status,503);assert.equal(settleCalls,0);
const results=[];
for(const [i,option] of required.accepts.entries()){
 const response=await handleSandboxPayment(request(option,'simulated-'+i),deps);assert.equal(response.status,200);results.push(await response.json());
 const repeated=await handleSandboxPayment(request(option,'simulated-'+i),deps);assert.equal(repeated.status,200);
 assert.equal(settleCalls,i+1);
}
assert.deepEqual(results[0].result,results[1].result);assert.equal(results[1].payment.asset,TESTNET_ASSETS.XLM);assert.equal(results[1].payment.amount,'100000');
const before=settleCalls;
for(const tamper of [{asset:'C'+'A'.repeat(55)},{network:'stellar:pubnet'},{payTo:payer.publicKey()},{amount:'1'},{extra:{...required.accepts[1].extra,inputHash:'wrong'}}]){assert.equal((await handleSandboxPayment(request({...required.accepts[1],...tamper},'tampered'),deps)).status,402)}
assert.equal(settleCalls,before);
const concurrent=await Promise.all([1,2].map(()=>handleSandboxPayment(request(required.accepts[1],'concurrent'),deps)));
assert.equal(settleCalls,before+1);assert.ok(concurrent.some(r=>r.status===200));
settleThrows=true;assert.equal((await handleSandboxPayment(request(required.accepts[1],'lost-response'),deps)).status,502);const lostCount=settleCalls;
assert.equal((await handleSandboxPayment(request(required.accepts[0],'lost-response'),deps)).status,502);assert.equal(settleCalls,lostCount);settleThrows=false;
// Client journal: no facilitator or signing in these injections. Persistence precedes the callback.
let purchaseCalls=0;
const store=new FilePaymentJournal(join(directory,'buyer'));
const opts={baseUrl:card.url,payerSecretKey:payer.secret(),allowedAssets:['USDC','XLM'],maxAmountByAsset:{USDC:'0.001',XLM:'0.01'},paymentJournal:store,readBalances:async()=>({USDC:'0',XLM:'100000'}),receiptVerifier:()=>true};
const client=new BazaarAgentClient(opts);
client.executeServiceCore=async(selected,_params,durable)=>{if(!durable.response){purchaseCalls++;await durable.saveResponse({status:200,body:'{"example":true}',headers:{}})}assert.equal(selected.payment.asset,'XLM');return {ok:true,data:{example:true},status:200,serviceCard:selected,payment:{asset:selected.payment.asset,transactionHash:'b'.repeat(64)},delivery:{resultAvailable:true}}};
await client.executeService(card,params,{operationId:'durable-test'});await client.executeService(card,params,{operationId:'durable-test'});assert.equal(purchaseCalls,1);
await assert.rejects(()=>client.executeService(card,params,{operationId:'durable-test',preferredAsset:'USDC'}),/CONFLICT/);
const fresh=new BazaarAgentClient(opts);fresh.executeServiceCore=client.executeServiceCore;assert.equal((await fresh.executeService(card,params,{operationId:'durable-test'})).data.example,true);assert.equal(purchaseCalls,1);
const concurrentClient=await Promise.allSettled([1,2].map(()=>client.executeService(card,params,{operationId:'concurrent-client'})));assert.equal(purchaseCalls,2);assert.ok(concurrentClient.some(r=>r.status==='fulfilled'));
const pending=new BazaarAgentClient(opts);let lost=0;pending.executeServiceCore=async()=>{lost++;throw Error('lost network response')};await assert.rejects(()=>pending.executeService(card,params,{operationId:'pending-client'}),/lost network/);await assert.rejects(()=>pending.executeService(card,params,{operationId:'pending-client'}),/PAYMENT_PENDING/);assert.equal(lost,1);
const failedStore=new BazaarAgentClient({...opts,paymentJournal:{exclusive:async(_key,fn)=>fn(async()=>undefined,async()=>{throw Error('disk failed')})}});failedStore.executeServiceCore=()=>{throw Error('SHOULD NOT PAY')};await assert.rejects(()=>failedStore.executeService(card,params,{operationId:'disk-failure'}),/disk failed/);
const isolated=new BazaarAgentClient({...opts,history:{writeToken:'different-owner'}});await assert.rejects(()=>isolated.executeService(card,params,{operationId:'durable-test'}),/CONFLICT/);
// A separate process reads the completed response without any wallet or network access.
const child=spawnSync(process.execPath,['--input-type=module','-e',`import {FilePaymentJournal} from './lib/pilot-payment-store.ts'; const s=new FilePaymentJournal(${JSON.stringify(join(directory,'buyer'))}); await s.exclusive('durable-test',async read=>{const s=await read();if(s.phase!=='completed'||!s.outcome.data.example)process.exit(1)});`],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);
const originalFetch=globalThis.fetch;let historyStatus=503,journalWrites=0;
globalThis.fetch=async(_url,init)=>{journalWrites++;const body=JSON.parse(init.body);assert.equal(body.payment.asset,'XLM');assert.equal(body.payment.amountAtomic,'100000');return new Response('{}',{status:historyStatus})};
try{const journaling=new BazaarAgentClient({...opts,history:{writeToken:'simulated-owner',includeResult:true}});journaling.executeServiceCore=client.executeServiceCore;const first=await journaling.executeService(card,params,{operationId:'history-failure'});assert.equal(first.history.status,'failed');const count=purchaseCalls;historyStatus=201;const second=await journaling.executeService(card,params,{operationId:'history-failure'});assert.equal(second.history.status,'recorded');assert.equal(purchaseCalls,count);assert.equal(journalWrites,2)}finally{globalThis.fetch=originalFetch}
console.log(JSON.stringify({ok:true,simulation:true,realPayments:0,selection:true,reserves:true,tamperRejected:true,singleSettlement:true,durableBuyer:true,newProcess:true,historyRetryOnly:true,oldUSDCChallenge:true}));

// Exercise the actual buyer -> 402 handler -> receipt path. Replace only cryptographic signing and facilitator.
const {ExactStellarScheme}=await import('@x402/stellar/exact/client');
const originalSign=ExactStellarScheme.prototype.createPaymentPayload;
let signatures=0;
ExactStellarScheme.prototype.createPaymentPayload=async(_version,requirements)=>{signatures++;return {x402Version:2,payload:{simulatedAuthorization:true}}};
globalThis.fetch=async(url,init)=>handleSandboxPayment(new Request(url,init),deps);
try {
 for(const asset of ['USDC','XLM']) {
  const actual=new BazaarAgentClient({...opts,readBalances:async()=>policy.balances,receiptVerifier:({expected})=>expected.contract===TESTNET_ASSETS[asset]});
  const result=await actual.executeService(card,params,{operationId:'integrated-'+asset,preferredAsset:asset});
  assert.equal(result.payment.asset,asset);assert.equal(result.delivery.resultAvailable,true);
  const count=signatures;await actual.executeService(card,params,{operationId:'integrated-'+asset,preferredAsset:asset});assert.equal(signatures,count);
 }
 const completedFile=join(directory,'buyer',paymentBinding('integrated-XLM')+'.json');
 const conserved=JSON.parse(await readFile(completedFile,'utf8'));
 const safeSignatures=signatures,safeSettlements=settleCalls;
 for(const mutate of [s=>({...s,phase:'started'}),s=>({...s,card:{...s.card,payment:{...s.card.payment,amount:'0.0001'}}}),s=>({...s,response:undefined}),s=>({...s,outcome:{...s.outcome,data:{injected:true}}})]) {
  await writeFile(completedFile,JSON.stringify(mutate(structuredClone(conserved))));
  await assert.rejects(()=>new BazaarAgentClient({...opts,readBalances:async()=>policy.balances}).executeService(card,params,{operationId:'integrated-XLM',preferredAsset:'XLM'}),/JOURNAL_INVALID/);
 }
 await writeFile(completedFile,JSON.stringify(conserved));
 await assert.rejects(()=>new BazaarAgentClient({...opts,receiptVerifier:()=>false}).executeService(card,params,{operationId:'integrated-XLM',preferredAsset:'XLM'}),/PAYMENT_RECEIPT_MISMATCH/);
 assert.equal(signatures,safeSignatures);assert.equal(settleCalls,safeSettlements);
 console.log('PASS malformed journals, changed selected card/outcome and completed receipt revalidation: no additional effects');
 const tampered=new BazaarAgentClient(opts);
 globalThis.fetch=async(url,init)=>{const r=await handleSandboxPayment(new Request(url,init),deps);if(r.status!==402)return r;const body=await r.json();body.accepts.forEach(o=>o.amount='999999');const {encodePaymentRequiredHeader}=await import('@x402/core/http');return Response.json(body,{status:402,headers:{'payment-required':encodePaymentRequiredHeader(body)}})};
 const count=signatures;await assert.rejects(()=>tampered.executeService(card,params,{operationId:'tampered-challenge'}),/PAYMENT_REQUIREMENTS_MISMATCH/);assert.equal(signatures,count);
 // Persist raw provider response, retry only receipt reconciliation after a verifier interruption.
 globalThis.fetch=async(url,init)=>handleSandboxPayment(new Request(url,init),deps);
 let verificationFails=true;
 const reconcile=new BazaarAgentClient({...opts,receiptVerifier:()=>!verificationFails});
 await assert.rejects(()=>reconcile.executeService(card,params,{operationId:'verifier-interruption'}),/PAYMENT_RECEIPT_MISMATCH/);
 const paid=signatures;verificationFails=false;
 assert.equal((await reconcile.executeService(card,params,{operationId:'verifier-interruption'})).payment.asset,'XLM');assert.equal(signatures,paid);
 // A response lost after settlement cannot trigger a new signature on another execution.
 const lostClient=new BazaarAgentClient(opts);
 globalThis.fetch=async(url,init)=>{const r=await handleSandboxPayment(new Request(url,init),deps);if(r.status===200)throw Error('response lost after settlement');return r};
 await assert.rejects(()=>lostClient.executeService(card,params,{operationId:'integrated-lost'}),/response lost/);
 const signatureCount=signatures, settlementCount=settleCalls;
 await assert.rejects(()=>new BazaarAgentClient(opts).executeService(card,params,{operationId:'integrated-lost'}),/PAYMENT_PENDING/);
 assert.equal(signatures,signatureCount);assert.equal(settleCalls,settlementCount);
 // Full local chain: real credential association and HTTP handlers, simulated storage/payment only.
 const alice=generateHistoryKeypair('combined-alice'),bob=generateHistoryKeypair('combined-bob');
 const config=JSON.stringify([alice,bob].map(({ownerId,readTokenHash,writeTokenHash})=>({ownerId,readTokenHash,writeTokenHash})));
 assert.equal(authenticateHistory(`Bearer ${alice.readToken}`,false,config).ownerId,authenticateHistory(`Bearer ${alice.writeToken}`,true,config).ownerId);
 const hashes=new Map(),indexes=new Map();let storageAvailable=false;
 const historyRedis={
  async eval(_script,[key,index],[id,digest,entry]){
   if(!storageAvailable)throw Error('simulated history outage');
   const records=hashes.get(key)??new Map();
   if(records.has(id))return [JSON.parse(records.get(id)).digest===digest?'existing':'conflict',records.get(id)];
   records.set(id,entry);hashes.set(key,records);indexes.set(index,[id,...(indexes.get(index)??[])]);return ['created',entry];
  },
  async lrange(key,start,stop){return(indexes.get(key)??[]).slice(start,stop+1)},
  async hmget(key,...fields){return Object.fromEntries(fields.map(field=>[field,hashes.get(key)?.get(field)]))},
 };
 const handlers=()=>createHistoryHandlers({authenticate:(authorization,write)=>authenticateHistory(authorization,write,config),store:()=>createHistoryStore(historyRedis)});
 globalThis.fetch=async(url,init)=>{
  const request=new Request(url,init),pathname=new URL(request.url).pathname;
  if(pathname==='/api/operations')return handlers()[request.method](request);
  if(pathname==='/api/x402/swap-risk')return handleSandboxPayment(request,deps);
  throw Error('UNEXPECTED_OUTBOUND_REQUEST');
 };
 const combinedCard={...card,url:'https://localhost:3215'};
 const combinedOptions={...opts,baseUrl:combinedCard.url,history:{writeToken:alice.writeToken,includeResult:true,mode:'fixture'}};
 const firstCombined=await new BazaarAgentClient(combinedOptions).executeService(combinedCard,params,{operationId:'combined-history',preferredAsset:'XLM'});
 assert.equal(firstCombined.history.status,'failed');
 const combinedSignatures=signatures,combinedSettlements=settleCalls;storageAvailable=true;
 const recovered=await new BazaarAgentClient(combinedOptions).executeService(combinedCard,params,{operationId:'combined-history',preferredAsset:'XLM'});
 assert.equal(recovered.history.status,'recorded');assert.deepEqual(recovered.data,firstCombined.data);
 assert.equal(recovered.payment.transactionHash,firstCombined.payment.transactionHash);
 const ownRequest=()=>new Request(card.url+'/api/operations',{headers:{Authorization:`Bearer ${alice.readToken}`}});
 const saved=(await (await handlers().GET(ownRequest())).json()).records;
 assert.equal(saved.length,1);assert.equal(saved[0].clientOperationId,'combined-history');
 assert.equal(saved[0].payment.asset,'XLM');assert.equal(saved[0].payment.amountAtomic,'100000');
 assert.deepEqual(saved[0].delivery.result,firstCombined.data);assert.equal(saved[0].payment.transactionHash,firstCombined.payment.transactionHash);
 await new BazaarAgentClient(combinedOptions).executeService(combinedCard,params,{operationId:'combined-history',preferredAsset:'XLM'});
 assert.deepEqual((await (await handlers().GET(ownRequest())).json()).records,saved);
 assert.deepEqual((await (await handlers().GET(new Request(card.url+'/api/operations',{headers:{Authorization:`Bearer ${bob.readToken}`}}))).json()).records,[]);
 assert.equal((await handlers().POST(new Request(card.url+'/api/operations',{method:'POST',headers:{Authorization:`Bearer ${alice.readToken}`,'Content-Type':'application/json'},body:'{}'}))).status,403);
 assert.equal(signatures,combinedSignatures);assert.equal(settleCalls,combinedSettlements);
 console.log('PASS combined buyer -> simulated 402 settlement -> persisted response -> authenticated history -> owner read -> fresh client recovery; no duplicate payment');
 console.log('PASS integrated buyer, selected challenge, raw response recovery; signatures/facilitator simulated only');
} finally {globalThis.fetch=originalFetch;ExactStellarScheme.prototype.createPaymentPayload=originalSign;}
