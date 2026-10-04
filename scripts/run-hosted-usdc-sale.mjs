import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Asset,FeeBumpTransaction,Keypair,Networks,TransactionBuilder} from '@stellar/stellar-sdk';
import {loadPacket,savePacket,packetDirectory} from './marketplace-private-packet.mjs';
import {createAutomationPreviewFetch,withProtectedPrivateMcp} from '../examples/protected-preview-client.mjs';
import {createGuionistaIntent,executeGuionistaIntent,failGuionistaIntent,deliverGuionistaIntent} from '../examples/guionista-marketplace-worker.mjs';
import {acquireSaleEffectLock} from '../examples/sale-effect-lock.mjs';
const dir='docs/evidence/sprint-marketplace',readJson=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const sha=v=>createHash('sha256').update(v).digest('hex');
async function main(){
const m=await readJson(dir+'/usdc-sale-manifest.json'),phase=process.argv[2];
assert.ok(['probe','submit','activate','sale','replacement','pause','retire'].includes(phase));
const lock=await acquireSaleEffectLock(packetDirectory,m.planId);let report;
try{
const deployment=await readJson(dir+'/usdc-bazaar-current.json'),packet=await loadPacket(),sale=packet.sale;
assert.equal(sale.planId,m.planId);assert.equal(deployment.planId,m.planId);assert.equal(deployment.sourceSha,m.sourceSha);assert.equal(deployment.payloadFingerprint,m.uploads.bazaar.payloadFingerprint);
const origin=new URL(deployment.url).origin;assert.match(origin,/^https:\/\/stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/);
assert.ok(!sale.completed.includes(phase),'PHASE_ALREADY_COMPLETED_DO_NOT_REPLAY');
assert.equal(m.readiness[phase==='probe'?'canProbe':'canExecute'],true,'MANIFEST_GATE_CLOSED');
const reportPath=dir+'/usdc-hosted-http.json';
try{report=await readJson(reportPath);}catch(e){if(e.code!=='ENOENT')throw e;report={version:1,planId:m.planId,sourceSha:m.sourceSha,status:'IN_PROGRESS',apiRequests:0,redis:0,commandsUpperBound:0,outboundPayloadBytes:0,inboundPayloadBytes:0,external:{horizon:0,'proof-dns':0,'proof-http':0,provider:0},storage:{workspace:0,market:0,review:0,catalog:0},paymentSubmissionIntents:0,activeExecutionMs:0,automaticRetries:0,facilitatorRequests:0,attempts:[],phases:[]};}
assert.equal(report.planId,m.planId);assert.notEqual(report.status,'UNCERTAIN','UNCERTAIN_STOP_USE_EXPLICIT_READ_RECOVERY');
const started=Date.now(),baseMs=report.activeExecutionMs;
async function persist(){report.activeExecutionMs=baseMs+Date.now()-started;await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');}
const reserves=m.browserReserve??{apiRequests:20,redis:80,commandsUpperBound:400};
const requestCosts=new Map();
async function provisioning(){
 let setup;try{setup=await readJson(dir+'/usdc-wallet-provision.json');}catch(e){if(e.code!=='ENOENT')throw e;setup={counts:{horizonReads:0,friendbotClaims:0,trustlineSubmissions:0,faucetApiRequests:0},outboundPayloadBytes:0,inboundPayloadBytes:0};}
 try{const proof=await readJson(dir+'/usdc-provider-proof-check.json');assert.equal(proof.status,'PASS','PROOF_CHECK_UNCONFIRMED');setup.counts.providerProofChecks=proof.proofHttpRequests;setup.outboundPayloadBytes+=proof.outboundPayloadBytes;setup.inboundPayloadBytes+=proof.inboundPayloadBytes;setup.activeExecutionMs=(setup.activeExecutionMs??0)+(proof.activeExecutionMs??0);}catch(e){if(e.code!=='ENOENT')throw e;}
 return setup;
}
async function guard(kind,meta){
 const setup=await provisioning();assert.notEqual(setup.status,'UNCERTAIN');
 const cost=requestCosts.get(meta.path+':'+meta.payloadHash)??{},futureHorizon=cost.horizon??0,futureProof=cost.proof??0;
 const apiTotal=report.apiRequests+Object.values(report.external).reduce((s,v)=>s+v,0)+Object.entries(setup.counts).filter(([key])=>key!=='usdcFaucetClaims').reduce((n,[,v])=>n+v,0);
 assert.ok(apiTotal+1+futureHorizon+futureProof<=m.limits.apiRequests-reserves.apiRequests,'API_BUDGET');
 assert.ok(report.external.horizon+(setup.counts.horizonReads??0)+futureHorizon<=m.limits.horizonReads,'HORIZON_BUDGET');
 assert.ok(report.external['proof-http']+(setup.counts.providerProofChecks??0)+(futureProof?1:0)<=m.limits.proofHttpRequests,'PROOF_HTTP_BUDGET');assert.ok(report.external['proof-dns']+(futureProof?1:0)<=m.limits.proofDnsRequests,'PROOF_DNS_BUDGET');
 assert.ok(report.redis+32<=m.limits.redisRestExchanges-reserves.redis,'REDIS_BUDGET');assert.ok(report.commandsUpperBound+224<=m.limits.redisCommandsUpperBound-reserves.commandsUpperBound,'COMMAND_BUDGET');
 assert.ok(report.outboundPayloadBytes+setup.outboundPayloadBytes+4*1048576+65536<=m.limits.outboundPayloadBytes);assert.ok(report.inboundPayloadBytes+setup.inboundPayloadBytes+9*1048576+futureHorizon*131072<=m.limits.inboundPayloadBytes);
 assert.ok(baseMs+Date.now()-started+(setup.activeExecutionMs??0)+13500<=m.limits.activeExecutionSeconds*1000,'EXECUTION_TIME_BUDGET');
 if(kind==='provider')assert.ok(report.external.provider<m.limits.providerExecutionRequests,'PROVIDER_SINGLE_EXECUTION');
}
async function transport(target,kind,id=deployment.id){return createAutomationPreviewFetch({origin:target,bypassSecret:kind==='provider'?sale.providerBypass:sale.bazaarBypass,timeoutMs:12000,maxResponseBytes:1048576,
 beforeRequest:async meta=>{await guard(kind,meta);if(kind==='provider')report.external.provider++;else report.apiRequests++;report.attempts.push({...meta,kind,phase,deploymentId:kind==='provider'?m.deployments?.providerProof?.id:id,status:'PENDING'});report.outboundPayloadBytes+=meta.requestBytes;await persist();},
 onResponse:async(meta,response)=>{
  const attempt=report.attempts.at(-1);assert.equal(attempt.payloadHash,meta.payloadHash);attempt.httpStatus=response.status;report.inboundPayloadBytes+=meta.responseBytes;
  if(kind==='api'){
   assert.equal(response.headers.get('x-bazaar-acceptance-meter'),'v1','SERVER_METER_MISSING');attempt.requestId=response.headers.get('x-bazaar-acceptance-request-id');assert.match(attempt.requestId,/^[a-f0-9-]{36}$/);
   const numeric=header=>{const value=response.headers.get(header);assert.match(value??'',/^\d+$/,'METER_MISSING:'+header);return Number(value);};
   attempt.redis=numeric('x-bazaar-redis-requests');attempt.commandsUpperBound=numeric('x-bazaar-redis-commands-upper-bound');report.redis+=attempt.redis;report.commandsUpperBound+=attempt.commandsUpperBound;
   report.outboundPayloadBytes+=numeric('x-bazaar-redis-outbound-payload-bytes')+numeric('x-bazaar-external-outbound-payload-bytes');report.inboundPayloadBytes+=numeric('x-bazaar-redis-inbound-payload-bytes')+numeric('x-bazaar-external-inbound-payload-bytes');
   attempt.external={};for(const key of Object.keys(report.external)){const count=numeric('x-bazaar-external-'+key);attempt.external[key]=count;report.external[key]+=count;}
   for(const name of Object.keys(report.storage)){const count=numeric('x-bazaar-'+name+'-stored-bytes-upper-bound');report.storage[name]=Math.max(report.storage[name],count);assert.ok(report.storage[name]<=m.limits.storagePartitions[name]);}
   assert.equal(response.headers.get('x-bazaar-redis-uncertain'),'false','REMOTE_EFFECT_UNCERTAIN');
   const setup=await provisioning();assert.ok(report.external.horizon+setup.counts.horizonReads<=m.limits.horizonReads);assert.ok(report.redis<=m.limits.redisRestExchanges);assert.ok(report.commandsUpperBound<=m.limits.redisCommandsUpperBound);assert.ok(Object.values(report.storage).reduce((n,v)=>n+v,0)<=m.limits.storedBytes);
   assert.ok(report.external['proof-dns']<=m.limits.proofDnsRequests&&report.external['proof-http']+(setup.counts.providerProofChecks??0)<=m.limits.proofHttpRequests&&report.external.provider<=m.limits.providerExecutionRequests);
   const total=report.apiRequests+Object.values(report.external).reduce((n,v)=>n+v,0)+Object.entries(setup.counts).filter(([key])=>key!=='usdcFaucetClaims').reduce((n,[,v])=>n+v,0);assert.ok(total<=m.limits.apiRequests);assert.ok(report.outboundPayloadBytes+setup.outboundPayloadBytes<=m.limits.outboundPayloadBytes&&report.inboundPayloadBytes+setup.inboundPayloadBytes<=m.limits.inboundPayloadBytes);
  }
  attempt.status='CONFIRMED';await persist();
 },onUncertain:async(meta)=>{const attempt=report.attempts.at(-1);attempt.status='UNCERTAIN';report.status='UNCERTAIN';await persist();}
});}
const appFetch=await transport(origin,'api'),providerFetch=await transport(sale.providerOrigin,'provider');
async function http(path,token,body,expected=200,at={origin,fetcher:appFetch}){const payload=body===undefined?'':JSON.stringify(body);requestCosts.set(path+':'+sha(payload),{horizon:body?.action==='prepare'?3:body?.action==='pay'?5:body?.action==='reconcile'?1:0,proof:body?.action==='verify-http'||body?.action==='verify-dns'?2:0});const response=await at.fetcher(at.origin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:payload})});assert.equal(response.status,expected,'STATUS_MISMATCH:'+path);return response.json();}
const a=packet.identities[0],b=packet.identities[1],aHuman=a.rotatedHuman,aAgent=a.rotatedAgent;
const ordersPath='/api/market/orders',servicesPath='/api/market/services';
try{
 if(phase==='probe'){
  const value=await http(ordersPath,aHuman);assert.ok(Array.isArray(value.orders));assert.equal(report.external.horizon,0);report.probe={requestId:report.attempts.at(-1).requestId,deploymentId:deployment.id,redis:report.attempts.at(-1).redis};
 }else if(phase==='submit'){
  const services=await http(servicesPath,aHuman);if(services.paused)await http('/api/market/control',sale.operator,m.payloads.resume);
  const result=await http(servicesPath,aHuman,{submissionId:m.payloads.submissionId,card:m.payloads.card,controlProof:m.payloads.controlProof},201);
  assert.equal(result.submission.status,'awaiting-control-proof');assert.equal(result.submission.card.id,m.payloads.card.id);assert.match(result.submission.control.expectedRecord,/^stellar-bazaar-verification=[A-Za-z0-9_-]{24}$/);
  sale.submission=result.submission;await savePacket(packet);m.payloads.expectedRecord=result.submission.control.expectedRecord;await writeFile(dir+'/usdc-sale-manifest.json',JSON.stringify(m,null,2)+'\n');
 }else if(phase==='activate'){
  assert.ok(sale.completed.includes('submit'));assert.equal(m.readiness.providerProofReady,true);
  for(const body of [{submissionId:sale.submissionId,action:'verify-http'},{submissionId:sale.submissionId,action:'approve',reason:'Control HTTPS verificado. Contrato USDC Circle testnet y generador algorítmico de texto revisados; ejecución externa con una intención durable.'},{submissionId:sale.submissionId,action:'activate'}])await http('/api/market/review',sale.operator,body);
  const value=await http(servicesPath,b.human);assert.equal(value.services.find(v=>v.card.id===sale.serviceId)?.cardHash,m.payloads.cardHash);
 }else if(phase==='sale'){
  assert.ok(sale.completed.includes('activate'));assert.equal(m.readiness.walletProvisioned,true);assert.ok(!sale.paymentIntents?.length,'EXISTING_SALE_INTENT_DO_NOT_REPEAT');sale.paymentIntents=[];await savePacket(packet);
  for(const [index,intent]of m.payloads.orderIntents.entries()){
   const order=(await http(ordersPath,b.human,intent,201)).order;assert.equal(order.destination,m.participants[0].wallet);assert.equal(order.amount,'0.01');assert.deepEqual(order.settlement,m.config.identity);
   if(index===0){assert.deepEqual((await http(ordersPath,b.human,intent,201)).order,order);await http(ordersPath,b.human,{...intent,input:{...intent.input,topic:'Contenido diferente'}},409);}
   const path=ordersPath+'/'+intent.operationId,draft=(await http(path,b.human,{action:'prepare'})).payment;
   assert.deepEqual(draft.identity,m.config.identity);assert.equal(draft.destination,order.destination);assert.equal(draft.payer,m.participants[1].wallet);assert.equal(draft.amount,'0.01');
   const key=Keypair.fromSecret(sale.wallets[1].secret);assert.equal(key.publicKey(),draft.payer);
   assert.equal(draft.network,'stellar:testnet');assert.equal(draft.asset,'USDC');
   const tx=TransactionBuilder.fromXDR(draft.unsignedXdr,Networks.TESTNET);assert.ok(!(tx instanceof FeeBumpTransaction));assert.equal(tx.signatures.length,0);assert.equal(tx.timeBounds.minTime,'0');assert.ok(!tx.ledgerBounds&&!tx.minAccountSequence&&!tx.minAccountSequenceAge&&!tx.minAccountSequenceLedgerGap&&!tx.extraSigners?.length);
   const operation=tx.operations[0];assert.equal(tx.operations.length,1);assert.equal(operation.type,'payment');assert.equal(operation.destination,order.destination);assert.ok(!operation.source||operation.source===key.publicKey());assert.equal(operation.amount,'0.0100000');assert.ok(operation.asset.equals(new Asset('USDC',m.config.identity.issuer)));assert.equal(tx.source,key.publicKey());assert.equal(tx.memo.type,'hash');assert.equal(Buffer.from(tx.memo.value).toString('hex'),order.memoHash);assert.equal(tx.fee,'100');assert.ok(Number(tx.timeBounds.maxTime)>Date.now()/1000&&Number(tx.timeBounds.maxTime)<=Date.now()/1000+180);
   tx.sign(key);const payment={operationId:intent.operationId,transactionHash:tx.hash().toString('hex'),signedXdr:tx.toXDR(),phase:'submission-intent'};sale.paymentIntents.push(payment);await savePacket(packet);
   report.paymentIntents??=[];report.paymentIntents.push({operationId:intent.operationId,transactionHash:payment.transactionHash,signedXdrHash:sha(payment.signedXdr),feeStroops:tx.fee,expiresAt:tx.timeBounds.maxTime,destination:order.destination,amount:order.amount,identity:order.settlement});assert.ok(++report.paymentSubmissionIntents<=m.limits.marketPaymentSubmissions);await persist();
   const paid=(await http(path,b.human,{action:'pay',signedXdr:payment.signedXdr})).order;assert.equal(paid.phase,'paid');assert.equal(paid.transactionHash,payment.transactionHash);assert.ok(paid.paymentVerifiedAt);payment.phase='paid';await savePacket(packet);
   if(index===0)await http(path,b.human,{action:'pay',signedXdr:payment.signedXdr},409);
   const worker=createGuionistaIntent({...m.payloads.orders[index],serviceId:sale.serviceId,cardHash:m.payloads.cardHash,providerOrigin:sale.providerOrigin});sale.intents.push(worker);await savePacket(packet);
   await withProtectedPrivateMcp(origin,aAgent,appFetch,async client=>{
    const options={persistIntent:async value=>{sale.intents[index]=value;await savePacket(packet);},callTool:(name,args)=>client.callTool({name,arguments:args},undefined,{timeout:12000}),providerFetch,providerToken:sale.worker};
    const delivered=index===0?await executeGuionistaIntent(worker,options):await failGuionistaIntent(worker,options,m.payloads.failureReason);
    assert.equal(delivered.phase,index===0?'delivered':'delivery-failed');if(index===0){assert.equal(delivered.delivery.sha256,worker.textHash);assert.equal(worker.textHash,sha(worker.text));assert.ok(worker.text.length<=2000);await deliverGuionistaIntent(worker,options);}else assert.equal(delivered.delivery,undefined);
   });
   const buyer=(await http(path,b.human)).order,seller=(await http(path,aHuman)).order;assert.deepEqual(buyer,seller);assert.equal(buyer.phase,index===0?'delivered':'delivery-failed');sale.orders[index].original=buyer;await savePacket(packet);
  }
  await http(ordersPath+'/'+sale.orders[0].operationId,'q'.repeat(43),undefined,401);
  sale.histories={a:(await http(ordersPath,aHuman)).orders,b:(await http(ordersPath,b.human)).orders};assert.equal(sale.histories.a.filter(v=>v.cardHash===m.payloads.cardHash).length,2);assert.equal(sale.histories.b.filter(v=>v.cardHash===m.payloads.cardHash).length,2);await savePacket(packet);
 }else if(phase==='replacement'){
  assert.ok(sale.completed.includes('sale'));for(const order of sale.orders)assert.deepEqual((await http(ordersPath+'/'+order.operationId,b.human)).order,order.original);
  assert.deepEqual((await http(ordersPath,aHuman)).orders,sale.histories.a);assert.deepEqual((await http(ordersPath,b.human)).orders,sale.histories.b);
 }else if(phase==='pause'){
  assert.ok(sale.completed.includes('replacement'));await http('/api/market/control',sale.operator,m.payloads.pause);await http(ordersPath,b.human,{...m.payloads.orderIntents[0],operationId:m.payloads.pauseOperationId},503);
  for(const order of sale.orders)assert.deepEqual((await http(ordersPath+'/'+order.operationId,b.human)).order,order.original);
  await http('/api/workspaces',b.bootstrap,packet.pauseProbe,503);
  const old=m.deployments.bazaarCandidate;assert.ok(old.id!==deployment.id);const previous={origin:new URL(old.url).origin,fetcher:await transport(new URL(old.url).origin,'api',old.id)};
  await http(ordersPath,b.human,{...m.payloads.orderIntents[0],operationId:m.payloads.pauseOperationId},503,previous);assert.deepEqual((await http(ordersPath+'/'+sale.orders[0].operationId,b.human,undefined,200,previous)).order,sale.orders[0].original);
 }else{
  assert.ok(sale.completed.includes('pause'));assert.equal(m.readiness.hostedBrowserPassed,true,'BROWSER_ACCEPTANCE_REQUIRED_BEFORE_REVOKE');
  await http(servicesPath+'/'+sale.submissionId,aHuman,{action:'withdraw'});await http('/api/workspaces/'+packet.receipt[0].workspaceId+'/access',a.bootstrap,{action:'revoke',expectedGeneration:3});await http(ordersPath,aHuman,undefined,401);await http(ordersPath,aAgent,undefined,401);assert.deepEqual((await http(ordersPath,b.human)).orders,sale.histories.b);
 }
 sale.completed.push(phase);await savePacket(packet);report.phases.push({phase,deploymentId:deployment.id,passed:true});report.status='PASS_EXECUTED_PHASES';await persist();console.log(JSON.stringify({status:'PASS',phase,apiRequests:report.apiRequests,redis:report.redis,commandsUpperBound:report.commandsUpperBound,external:report.external,storage:report.storage,paymentSubmissionIntents:report.paymentSubmissionIntents,productionChanges:0}));
}catch(error){if(report.status!=='UNCERTAIN')report.status='FAILED_CONFIRMED';await persist();console.error(error.message);process.exitCode=1;}
}finally{if(report?.status==='UNCERTAIN'||report?.attempts.some(v=>v.status==='PENDING'))await lock.preserve();else await lock.release();}
}
await main().catch(error=>{console.error(error.message);process.exitCode=1;});
