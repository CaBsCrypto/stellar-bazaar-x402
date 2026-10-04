import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Account,Asset,Keypair,Networks,Operation,TransactionBuilder} from '@stellar/stellar-sdk';
import {loadPacket,savePacket,packetDirectory} from './marketplace-private-packet.mjs';
import {acquireSaleEffectLock} from '../examples/sale-effect-lock.mjs';

export const issuer='GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const asset=new Asset('USDC',issuer),horizon='https://horizon-testnet.stellar.org',faucet='https://faucet.sozu.capital';
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
export function provisioningBinding(manifest){return sha({planId:manifest.planId,sourceSha:manifest.sourceSha,asset:manifest.config.identity,wallets:manifest.participants.map(v=>v.wallet),limits:{apiRequests:manifest.limits.apiRequests??120,friendbotClaims:manifest.limits.friendbotClaims,trustlineSubmissions:manifest.limits.trustlineSubmissions,usdcFaucetClaims:manifest.limits.usdcFaucetClaims,faucetApiRequests:manifest.limits.faucetApiRequests??2,horizonReads:manifest.limits.horizonReads,maxFeeStroopsPerTransaction:manifest.limits.maxFeeStroopsPerTransaction,activeExecutionSeconds:manifest.limits.activeExecutionSeconds,inboundPayloadBytes:manifest.limits.inboundPayloadBytes,outboundPayloadBytes:manifest.limits.outboundPayloadBytes,provisioningHorizonReads:manifest.limits.provisioningHorizonReads,faucetPowMaxMs:manifest.limits.faucetPowMaxMs,faucetPowMaxHashes:manifest.limits.faucetPowMaxHashes,faucetPowWorkers:manifest.limits.faucetPowWorkers}});}
export function faucetRecoveryBaselineHash(report){return sha({planId:report.planId,sourceSha:report.sourceSha,provisioningBinding:report.provisioningBinding,status:report.status,counts:report.counts,attempts:report.attempts,activeExecutionMs:report.activeExecutionMs,outboundPayloadBytes:report.outboundPayloadBytes,inboundPayloadBytes:report.inboundPayloadBytes,automaticRetries:report.automaticRetries});}
export function solveFaucetPow(challenge,to,{maxHashes=16777216,maxMs=20000}={}){
 if(challenge?.prefix!=='sozu-faucet-v1'||challenge.to!==to||typeof challenge.challengeId!=='string'||!challenge.challengeId.length||challenge.challengeId.length>128||!Number.isInteger(challenge.difficulty)||challenge.difficulty<0||challenge.difficulty>24)throw Error('UNBOUND_POW_CHALLENGE');
 if(!Number.isSafeInteger(maxHashes)||maxHashes<1||maxHashes>268435456||!Number.isSafeInteger(maxMs)||maxMs<1||maxMs>90000)throw Error('INVALID_POW_LIMIT');
 const start=Date.now(),prefix=createHash('sha256').update(`${challenge.prefix}:${challenge.challengeId}:${to}:`);
 for(let nonce=0;nonce<maxHashes;nonce++){
  if(nonce%1024===0&&Date.now()-start>=maxMs)throw Error('POW_LIMIT_EXHAUSTED');
  const digest=prefix.copy().update(String(nonce)).digest();
  if(challenge.difficulty===0||(digest.readUInt32BE(0) >>> (32-challenge.difficulty))===0)return {nonce:String(nonce),hashes:nonce+1};
 }
 throw Error('POW_LIMIT_EXHAUSTED');
}
export async function solveFaucetPowParallel(challenge,to,{maxHashes=268435456,maxMs=90000,workers=4}={}){
 if(challenge?.prefix!=='sozu-faucet-v1'||challenge.to!==to||typeof challenge.challengeId!=='string'||!challenge.challengeId.length||challenge.challengeId.length>128||!Number.isInteger(challenge.difficulty)||challenge.difficulty<0||challenge.difficulty>24)throw Error('UNBOUND_POW_CHALLENGE');
 if(!Number.isSafeInteger(maxHashes)||maxHashes<1||maxHashes>268435456||!Number.isSafeInteger(maxMs)||maxMs<1||maxMs>90000||!Number.isSafeInteger(workers)||workers<1||workers>4)throw Error('INVALID_POW_LIMIT');
 const prefix=`${challenge.prefix}:${challenge.challengeId}:${to}:`,stop=new SharedArrayBuffer(4),flag=new Int32Array(stop),threads=[],deadline=Date.now()+Math.max(1,maxMs-250);let timedOut=false;
 const source=`const{parentPort,workerData:d}=require('node:worker_threads');const{createHash}=require('node:crypto');const flag=new Int32Array(d.stop),prefix=createHash('sha256').update(d.prefix);let hashes=0,nonce;for(let candidate=d.index;candidate<d.maxHashes;candidate+=d.workers){if(hashes%256===0&&(Atomics.load(flag,0)||Date.now()>=d.deadline))break;const digest=prefix.copy().update(String(candidate)).digest();hashes++;if(d.difficulty===0||(digest.readUInt32BE(0)>>>(32-d.difficulty))===0){nonce=String(candidate);Atomics.store(flag,0,1);break;}}parentPort.postMessage({hashes,nonce});`;
 const timer=setTimeout(()=>{timedOut=true;Atomics.store(flag,0,1);for(const thread of threads)void thread.terminate();},Math.max(1,maxMs-250));
 try{
  const results=await Promise.all(Array.from({length:workers},(_,index)=>new Promise((resolve,reject)=>{
   const thread=new Worker(source,{eval:true,env:{},execArgv:[],workerData:{prefix,difficulty:challenge.difficulty,maxHashes,workers,index,stop,deadline}});threads.push(thread);
   let result;thread.once('message',value=>{result=value;});thread.once('error',()=>{Atomics.store(flag,0,1);reject(Error('POW_WORKER_FAILED'));});thread.once('exit',code=>code||!result?reject(Error(timedOut?'POW_LIMIT_EXHAUSTED':'POW_WORKER_FAILED')):resolve(result));
  })));
  const found=results.find(value=>value.nonce!==undefined);if(!found)throw Error('POW_LIMIT_EXHAUSTED');
  if(!/^\d+$/.test(found.nonce)||Number(found.nonce)>=maxHashes||results.some(value=>!Number.isSafeInteger(value.hashes)||value.hashes<0))throw Error('POW_WORKER_FAILED');
  const digest=createHash('sha256').update(prefix+found.nonce).digest();if(challenge.difficulty!==0&&(digest.readUInt32BE(0)>>>(32-challenge.difficulty))!==0)throw Error('POW_WORKER_FAILED');
  return {nonce:found.nonce,hashes:results.reduce((sum,value)=>sum+value.hashes,0),workers};
 }finally{clearTimeout(timer);Atomics.store(flag,0,1);await Promise.all(threads.map(thread=>thread.terminate()));}
}
function challengeExpiryMs(challenge){
 if(challenge.expiresAt===undefined)return undefined;
 const raw=challenge.expiresAt;let expiry;
 if(typeof raw==='number'||typeof raw==='string'&&/^\d+(?:\.\d+)?$/.test(raw)){const number=Number(raw);expiry=number>=1e12?number:number*1000;}
 else if(typeof raw==='string')expiry=Date.parse(raw);
 if(!Number.isFinite(expiry))throw Error('INVALID_CHALLENGE_EXPIRY');return expiry;
}
const trustline=account=>account.balances?.find(v=>v.asset_type==='credit_alphanum4'&&v.asset_code==='USDC'&&v.asset_issuer===issuer);
function checkedAccount(body,address){
 if(body?.account_id!==address||!/^\d+$/.test(body.sequence??'')||!Array.isArray(body.balances))throw Error('UNBOUND_HORIZON_ACCOUNT');
 const native=body.balances.find(v=>v.asset_type==='native');if(!native||!/^\d+(?:\.\d{1,7})?$/.test(native.balance??'')||!Number.isFinite(Number(native.balance))||Number(native.balance)<2.0001)throw Error('INSUFFICIENT_TESTNET_XLM_FOR_SETUP');
 return body;
}
function checkedTrustline(account,address){checkedAccount(account,address);const line=trustline(account);if(!line||line.is_authorized!==true||[line.balance,line.limit,line.buying_liabilities??'0'].some(value=>!/^\d+(?:\.\d{1,7})?$/.test(value??'')||!Number.isFinite(Number(value)))||Number(line.limit)<0.02||Number(line.buying_liabilities??'0')>Number(line.limit)-0.02)throw Error('USDC_TRUSTLINE_UNAVAILABLE');return line;}

/** No network effect occurs until an explicit method is invoked after its gate. */
export function createProvisioner({manifest,packet,report,fetcher=fetch,persistPacket,persistReport,otherActiveExecutionMs=async()=>0,otherBudget=async()=>({apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0})}){
 const sale=packet.sale;assert.equal(sale.planId,manifest.planId);assert.equal(sale.wallets.length,2);
 assert.deepEqual(sale.wallets.map(v=>v.publicKey),manifest.participants.map(v=>v.wallet));
 assert.equal(manifest.config.identity.network,'stellar:testnet');assert.equal(manifest.config.identity.code,'USDC');assert.equal(manifest.config.identity.issuer,issuer);assert.equal(manifest.config.identity.sacContract,asset.contractId(Networks.TESTNET));
 sale.provisioning??={wallets:sale.wallets.map(v=>({publicKey:v.publicKey})),phase:'prepared'};
 const state=sale.provisioning;
 let recoveringFaucet=false;
 report.activeExecutionMs??=0;
 const persist=async()=>{await persistPacket(packet);await persistReport(report);};
 const timeBudget=async reservedMs=>{const other=await otherActiveExecutionMs();assert.ok(Number.isFinite(other)&&other>=0);assert.ok(report.activeExecutionMs+other+reservedMs<=manifest.limits.activeExecutionSeconds*1000,'COMBINED_EXECUTION_TIME_LIMIT');};
 async function request(kind,url,init={},effectDetails={}){
  if(report.status==='UNCERTAIN'&&kind!=='horizon-read')throw Error('UNCERTAIN_STOP_NO_RETRY');
  if(recoveringFaucet&&!['horizon-read','faucet-challenge','faucet-claim'].includes(kind))throw Error('RECOVERY_SETUP_EFFECT_DENIED');
  const target=new URL(url);assert.ok([horizon,'https://friendbot.stellar.org',faucet].includes(target.origin));
  const countName=kind==='horizon-read'?'horizonReads':kind==='friendbot'?'friendbotClaims':kind==='trustline'?'trustlineSubmissions':'faucetApiRequests';
  const limit=kind==='horizon-read'?Math.min(manifest.limits.provisioningHorizonReads??8,8,manifest.limits.horizonReads-16):kind==='friendbot'?Math.min(2,manifest.limits.friendbotClaims):kind==='trustline'?Math.min(2,manifest.limits.trustlineSubmissions):Math.min(recoveringFaucet?3:2,manifest.limits.faucetApiRequests??2);
  assert.ok(report.counts[countName]+1<=limit,'PROVISION_LIMIT_EXHAUSTED');
  if(kind==='faucet-claim')assert.ok(report.counts.usdcFaucetClaims+1<=Math.min(1,manifest.limits.usdcFaucetClaims));
  const attempt={kind,path:target.pathname,origin:target.origin,method:init.method??'GET',payloadHash:sha(init.body??target.href),...effectDetails,status:'PENDING'};
  const other=await otherBudget();assert.ok(['apiRequests','outboundPayloadBytes','inboundPayloadBytes'].every(key=>Number.isSafeInteger(other[key])&&other[key]>=0),'OTHER_BUDGET_EVIDENCE_INVALID');
  const apiRequests=Object.entries(report.counts).filter(([key])=>key!=='usdcFaucetClaims').reduce((total,[,count])=>total+count,0),sentBytes=Buffer.byteLength(init.body??'');
  assert.ok(apiRequests+other.apiRequests+1<=(manifest.limits.apiRequests??120),'COMBINED_API_REQUEST_LIMIT');
  assert.ok(report.outboundPayloadBytes+other.outboundPayloadBytes+sentBytes<=manifest.limits.outboundPayloadBytes,'COMBINED_OUTBOUND_PAYLOAD_LIMIT');
  assert.ok(report.inboundPayloadBytes+other.inboundPayloadBytes+1048576<=manifest.limits.inboundPayloadBytes,'COMBINED_INBOUND_PAYLOAD_LIMIT');
  await timeBudget(12000);
  if(kind==='faucet-claim')report.counts.usdcFaucetClaims++;
  report.attempts.push(attempt);report.counts[countName]++;report.outboundPayloadBytes+=sentBytes;await persist();
  let response,body;const started=Date.now();
  try{
   response=await fetcher(target,{...init,redirect:'error',signal:AbortSignal.timeout(12000)});
   const parts=[];let bytes=0;
   if(response.body){for await(const part of response.body){bytes+=part.length;if(bytes>1048576)throw Error('RESPONSE_TOO_LARGE');parts.push(part);}}
   report.inboundPayloadBytes+=bytes;
   assert.ok(report.inboundPayloadBytes+other.inboundPayloadBytes<=manifest.limits.inboundPayloadBytes&&report.outboundPayloadBytes+other.outboundPayloadBytes<=manifest.limits.outboundPayloadBytes,'PAYLOAD_LIMIT_EXHAUSTED');
   const raw=Buffer.concat(parts).toString('utf8');body=raw?JSON.parse(raw):null;
  }catch{attempt.activeExecutionMs=Date.now()-started;report.activeExecutionMs+=attempt.activeExecutionMs;attempt.status='UNCERTAIN';report.status='UNCERTAIN';state.phase='uncertain';await persist();throw Error('PROVISION_OUTCOME_UNCONFIRMED');}
  attempt.activeExecutionMs=Date.now()-started;report.activeExecutionMs+=attempt.activeExecutionMs;
  attempt.httpStatus=response.status;attempt.status='CONFIRMED';await persist();return {response,body,attempt};
 }
 const account=async address=>{const value=await request('horizon-read',horizon+'/accounts/'+address,{}, {wallet:address});if(value.response.status===404)return undefined;if(!value.response.ok)throw Error('HORIZON_ACCOUNT_READ_REJECTED');return checkedAccount(value.body,address);};
 async function inspect(){
  assert.equal(manifest.readiness.canInspectProvisioning,true,'READ_ONLY_PROVISION_INSPECTION_NOT_AUTHORIZED');
  const out=[];for(const wallet of sale.wallets){const value=await account(wallet.publicKey);out.push({wallet:wallet.publicKey,exists:Boolean(value),usdcTrustline:Boolean(value&&trustline(value)),usdcBalance:value?trustline(value)?.balance??'0':'0'});}return out;
 }
 async function solveAndClaim(challenge,buyerAddress,{maxMs=manifest.limits.faucetPowMaxMs??20000,maxHashes=manifest.limits.faucetPowMaxHashes??16777216,parallel=false,workers=manifest.limits.faucetPowWorkers??4}={}){
  // A confirmed challenge must survive a CPU stop or process replacement.
  state.faucet.challenge=structuredClone(challenge);state.faucet.phase='challenge-confirmed';await persist();
  await timeBudget(maxMs);state.faucet.phase='pow-started';await persist();
  const powStarted=Date.now();let solution;
  try{const expiry=challengeExpiryMs(challenge);if(expiry!==undefined&&expiry-Date.now()<maxMs+13000)throw Error('CHALLENGE_EXPIRES_TOO_SOON');solution=parallel?await solveFaucetPowParallel(challenge,buyerAddress,{maxMs,maxHashes,workers}):solveFaucetPow(challenge,buyerAddress,{maxMs,maxHashes});if(expiry!==undefined&&expiry-Date.now()<12000)throw Error('CHALLENGE_EXPIRES_TOO_SOON');}
  catch(error){
   state.faucet.phase=error.message==='POW_LIMIT_EXHAUSTED'?'pow-exhausted':'invalid-challenge';
   report.status=error.message==='POW_LIMIT_EXHAUSTED'?'KNOWN_POW_EXHAUSTED':'KNOWN_CHALLENGE_REJECTED';
   report.knownFailure={code:error.message,stage:'before-faucet-claim',claimSubmissions:report.counts.usdcFaucetClaims};
   if(report.recovery)report.recovery.phase=state.faucet.phase;
   throw error;
  }finally{const elapsed=Date.now()-powStarted;report.activeExecutionMs+=elapsed;state.faucet.powActiveExecutionMs=elapsed;await persist();}
  const claimPayload=JSON.stringify({to:buyerAddress,pow:{challengeId:challenge.challengeId,nonce:solution.nonce}});
  state.faucet.nonce=solution.nonce;state.faucet.hashes=solution.hashes;state.faucet.claimPayload=claimPayload;state.faucet.claimPayloadHash=sha(claimPayload);state.faucet.phase='claim-started';await persist();
  const claimResult=await request('faucet-claim',faucet+'/api/v1/faucet/claim',{method:'POST',headers:{'content-type':'application/json'},body:state.faucet.claimPayload},{wallet:buyerAddress});
  // Official CLI requires success only; optional echoed fields cannot change identity.
  if(!claimResult.response.ok||claimResult.body?.success!==true||claimResult.body.to!==undefined&&claimResult.body.to!==buyerAddress){claimResult.attempt.status='UNCERTAIN';report.status='UNCERTAIN';state.phase='uncertain';await persist();throw Error('FAUCET_CLAIM_UNCONFIRMED');}
  state.faucet.phase='claim-confirmed';state.faucet.claim={to:buyerAddress,amount:claimResult.body.amount,transactionHash:claimResult.body.transactionHash??claimResult.body.hash??null};await persist();
  const current=await account(buyerAddress);if(!current||Number(checkedTrustline(current,buyerAddress).balance)<0.02){report.status='UNCERTAIN';state.phase='uncertain';await persist();throw Error('USDC_FUNDS_NOT_VISIBLE_NO_POLL');}
  state.wallets[1].usdcBalance=trustline(current).balance;
 }
 async function recoverFaucet(){
  assert.equal(manifest.readiness.canRecoverFaucet,true,'FAUCET_RECOVERY_GATE_CLOSED');assert.equal(manifest.readiness.canProvision,false,'FULL_PROVISION_MUST_REMAIN_CLOSED');
  assert.equal(manifest.readiness.localSaleMeasured,true);assert.equal(manifest.readiness.payloadsFrozen,true);
  assert.ok(report.status==='PAUSED_LOCAL_POW_EXHAUSTED'&&report.stopReason==='POW_LIMIT_EXHAUSTED_BEFORE_CLAIM'||report.status==='KNOWN_POW_EXHAUSTED'&&report.knownFailure?.code==='POW_LIMIT_EXHAUSTED','KNOWN_POW_STOP_REQUIRED');assert.equal(report.planId,manifest.planId);assert.equal(report.sourceSha,manifest.sourceSha);
  assert.deepEqual(report.counts,{horizonReads:6,friendbotClaims:2,trustlineSubmissions:2,faucetApiRequests:1,usdcFaucetClaims:0},'RECOVERY_COUNTS_MISMATCH');
  assert.equal(report.attempts.length,11);assert.ok(report.attempts.every(v=>v.status==='CONFIRMED'),'RECOVERY_UNCONFIRMED_ATTEMPT');
  for(const[kind,count]of Object.entries({'horizon-read':6,friendbot:2,trustline:2,'faucet-challenge':1}))assert.equal(report.attempts.filter(v=>v.kind===kind).length,count);
  assert.ok(!report.attempts.some(v=>v.kind==='faucet-claim'));assert.ok(!report.recovery&&!state.faucetRecovery,'ONE_FAUCET_RECOVERY_ONLY');
  assert.deepEqual(state.wallets.map(v=>v.publicKey),sale.wallets.map(v=>v.publicKey));assert.ok(state.wallets.every(v=>v.phase==='complete'),'WALLETS_SETUP_NOT_COMPLETE');
  const buyerAddress=sale.wallets[1].publicKey;assert.ok(Number(state.wallets[1].usdcBalance)<0.02);
  assert.equal(state.faucet?.to,buyerAddress);assert.ok(['challenge-started','pow-exhausted'].includes(state.faucet.phase));
  assert.ok(!state.faucet.challenge&&!state.faucet.nonce&&!state.faucet.claim,'ONLY_LOST_UNCLAIMED_CHALLENGE_RECOVERY');
  assert.equal(manifest.limits.faucetApiRequests,3);assert.equal(manifest.limits.provisioningHorizonReads,7);
  for(const[key,value]of Object.entries({apiRequests:120,redisRestExchanges:400,redisCommandsUpperBound:2400,storedBytes:49164,outboundPayloadBytes:16777216,inboundPayloadBytes:33554432,activeExecutionSeconds:300,marketPaymentSubmissions:2,friendbotClaims:2,trustlineSubmissions:2,usdcFaucetClaims:1,horizonReads:24,automaticRetries:0,facilitatorRequests:0,realMoney:0}))assert.equal(manifest.limits[key],value,'PRIMARY_LIMIT_CHANGED:'+key);
  const maxMs=manifest.limits.faucetPowMaxMs,maxHashes=manifest.limits.faucetPowMaxHashes,workers=manifest.limits.faucetPowWorkers??4;
  assert.ok(Number.isSafeInteger(maxMs)&&maxMs>=1&&maxMs<=90000);assert.ok(Number.isSafeInteger(maxHashes)&&maxHashes>=1&&maxHashes<=268435456);
  assert.ok(Number.isSafeInteger(workers)&&workers>=1&&workers<=4);
  const transition=manifest.faucetRecovery;assert.equal(transition?.version,1);assert.equal(transition.reason,'known-pow-exhausted-old-challenge-lost');assert.equal(transition.maxRecoveryCount,1);
  const nextBinding=provisioningBinding(manifest);assert.equal(manifest.provisioningBinding,nextBinding);assert.equal(transition.toBinding,nextBinding);assert.equal(transition.fromBinding,report.provisioningBinding);assert.notEqual(transition.fromBinding,nextBinding);
  assert.equal(transition.baselineHash,faucetRecoveryBaselineHash(report),'RECOVERY_BASELINE_CHANGED');
  await timeBudget(maxMs+36000);
  const other=await otherBudget(),used=Object.entries(report.counts).filter(([key])=>key!=='usdcFaucetClaims').reduce((sum,[,value])=>sum+value,0);
  assert.ok(['apiRequests','outboundPayloadBytes','inboundPayloadBytes'].every(key=>Number.isSafeInteger(other[key])&&other[key]>=0),'OTHER_BUDGET_EVIDENCE_INVALID');
  assert.ok(used+other.apiRequests+3<=manifest.limits.apiRequests-(manifest.browserReserve?.apiRequests??0),'RECOVERY_API_RESERVE');
  assert.ok(report.inboundPayloadBytes+other.inboundPayloadBytes+3*1048576<=manifest.limits.inboundPayloadBytes,'RECOVERY_PAYLOAD_RESERVE');
  assert.ok(report.outboundPayloadBytes+other.outboundPayloadBytes+1024<=manifest.limits.outboundPayloadBytes,'RECOVERY_OUTBOUND_RESERVE');
  const baseline=structuredClone(report);
  report.bindingHistory??=[];report.bindingHistory.push({...transition,baseline});report.provisioningBinding=nextBinding;
  report.recovery={attempt:1,phase:'prepared',fromBinding:transition.fromBinding,toBinding:nextBinding,baselineHash:transition.baselineHash};
  state.faucetRecovery={...report.recovery,originalFaucet:structuredClone(state.faucet)};
  state.faucet={phase:'recovery-challenge-started',to:buyerAddress};report.status='IN_PROGRESS_RECOVERY';await persist();recoveringFaucet=true;
  const challengeResult=await request('faucet-challenge',faucet+'/api/v1/faucet/pow/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({to:buyerAddress})},{wallet:buyerAddress,recoveryAttempt:1});
  if(!challengeResult.response.ok){report.status='KNOWN_CHALLENGE_REJECTED';report.recovery.phase='challenge-rejected';await persist();throw Error('FAUCET_CHALLENGE_REJECTED_STOP');}
  await solveAndClaim(challengeResult.body,buyerAddress,{maxMs,maxHashes,parallel:true,workers});
  state.phase='complete';state.faucetRecovery.phase='complete';report.recovery.phase='complete';report.status='PASS_PROVISIONED';await persist();
  return {wallets:state.wallets.map(v=>({wallet:v.publicKey,usdcBalance:v.usdcBalance})),counts:report.counts,recoveryAttempt:1};
 }
 async function provision(){
  assert.equal(manifest.readiness.canProvision,true,'PROVISION_PLAN_NOT_READY');assert.equal(manifest.readiness.localSaleMeasured,true);assert.equal(manifest.readiness.payloadsFrozen,true);assert.match(manifest.sourceSha??'',/^[a-f0-9]{40}$/);assert.equal(manifest.provisioningBinding,provisioningBinding(manifest),'PROVISION_BINDING_MISMATCH');
  if(report.status==='UNCERTAIN')throw Error('UNCERTAIN_STOP_NO_RETRY');if(report.status.startsWith('KNOWN_')||report.status.startsWith('PAUSED_LOCAL_')||report.recovery||state.faucetRecovery)throw Error('KNOWN_FAILURE_REQUIRES_EXPLICIT_RECOVERY');if(state.phase==='complete')throw Error('PROVISION_ALREADY_COMPLETE_DO_NOT_REPLAY');
  for(const [index,wallet]of sale.wallets.entries()){
   const saved=state.wallets[index];if(saved.phase==='complete')continue;
   if(saved.phase&&saved.phase!=='prepared')throw Error('PARTIAL_PROVISION_REQUIRES_EXPLICIT_RECOVERY');
   let current=await account(wallet.publicKey);
   if(!current){
    saved.phase='friendbot-started';await persist();
    const value=await request('friendbot','https://friendbot.stellar.org/?addr='+encodeURIComponent(wallet.publicKey),{}, {wallet:wallet.publicKey});
    // SDK Friendbot.Api.Response guarantees hash/result_meta_xdr, not successful.
    // The following exact-address Horizon read proves the account was funded.
    if(!value.response.ok||value.body?.successful===false||!/^[a-f0-9]{64}$/.test(value.body?.hash??'')){value.attempt.status='UNCERTAIN';report.status='UNCERTAIN';state.phase='uncertain';await persist();throw Error('FRIENDBOT_RESULT_UNCONFIRMED');}
    saved.friendbotHash=value.body.hash;saved.phase='friendbot-confirmed';await persist();
    current=await account(wallet.publicKey);if(!current){report.status='UNCERTAIN';state.phase='uncertain';await persist();throw Error('FRIENDBOT_ACCOUNT_NOT_VISIBLE_NO_POLL');}
   }
   if(!trustline(current)){
    // Friendbot accounts are fresh synthetic wallets, with enough native reserve.
    if(current.subentry_count!==0||Number(current.num_sponsoring??0)!==0||Number(current.num_sponsored??0)!==0||![0,1].includes(Number(current.thresholds?.med_threshold??0))||current.signers?.length!==1||current.signers[0].key!==wallet.publicKey||current.signers[0].weight!==1)throw Error('UNEXPECTED_SYNTHETIC_ACCOUNT');
    const key=Keypair.fromSecret(wallet.secret);assert.equal(key.publicKey(),wallet.publicKey);
    const fee=100;assert.ok(fee<=manifest.limits.maxFeeStroopsPerTransaction);
    const tx=new TransactionBuilder(new Account(wallet.publicKey,current.sequence),{fee:String(fee),networkPassphrase:Networks.TESTNET}).addOperation(Operation.changeTrust({asset})).setTimeout(180).build();tx.sign(key);
    saved.trustline={transactionHash:tx.hash().toString('hex'),signedXdr:tx.toXDR(),payloadHash:sha(tx.toXDR()),feeStroops:fee};saved.phase='trustline-started';await persist();
    const value=await request('trustline',horizon+'/transactions',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({tx:saved.trustline.signedXdr}).toString()}, {wallet:wallet.publicKey,transactionHash:saved.trustline.transactionHash,xdrHash:saved.trustline.payloadHash});
    if(!value.response.ok||value.body?.successful!==true||value.body.hash!==saved.trustline.transactionHash){value.attempt.status='UNCERTAIN';report.status='UNCERTAIN';state.phase='uncertain';await persist();throw Error('TRUSTLINE_RESULT_UNCONFIRMED');}
    saved.phase='trustline-confirmed';saved.trustline.ledger=value.body.ledger;await persist();current=await account(wallet.publicKey);if(!current){report.status='UNCERTAIN';state.phase='uncertain';await persist();throw Error('TRUSTLINE_ACCOUNT_NOT_VISIBLE_NO_POLL');}
   }
   const line=checkedTrustline(current,wallet.publicKey);saved.phase='complete';saved.usdcBalance=line.balance;await persist();
  }
  const buyer=state.wallets[1],buyerAddress=sale.wallets[1].publicKey;
  if(Number(buyer.usdcBalance)<0.02){
   if(state.faucet)throw Error('FAUCET_INTENT_ALREADY_EXISTS_DO_NOT_RETRY');
   state.faucet={phase:'challenge-started',to:buyerAddress};await persist();
   const challengeResult=await request('faucet-challenge',faucet+'/api/v1/faucet/pow/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({to:buyerAddress})},{wallet:buyerAddress});
   if(!challengeResult.response.ok)throw Error('FAUCET_CHALLENGE_REJECTED_STOP');
   await solveAndClaim(challengeResult.body,buyerAddress);
  }
  state.phase='complete';report.status='PASS_PROVISIONED';await persist();return {wallets:state.wallets.map(v=>({wallet:v.publicKey,usdcBalance:v.usdcBalance})),counts:report.counts};
 }
 return {inspect,provision,recoverFaucet};
}

async function main(){
 const phase=process.argv[2]??'validate';assert.ok(['validate','inspect','provision','recover-faucet'].includes(phase));
 const manifest=await json('docs/evidence/sprint-marketplace/usdc-sale-manifest.json');
 if(phase==='validate'){console.log(JSON.stringify({planId:manifest.planId,provisioningBinding:provisioningBinding(manifest),canProvision:manifest.readiness.canProvision===true,networkRequests:0}));return;}
 const lock=await acquireSaleEffectLock(packetDirectory,manifest.planId);let report;
 try{
 const packet=await loadPacket(),reportPath='docs/evidence/sprint-marketplace/usdc-wallet-provision.json';
 try{report=await json(reportPath);}catch(error){if(error.code!=='ENOENT')throw error;report={version:1,planId:manifest.planId,sourceSha:manifest.sourceSha,provisioningBinding:provisioningBinding(manifest),status:'IN_PROGRESS',counts:{horizonReads:0,friendbotClaims:0,trustlineSubmissions:0,faucetApiRequests:0,usdcFaucetClaims:0},outboundPayloadBytes:0,inboundPayloadBytes:0,activeExecutionMs:0,automaticRetries:0,attempts:[]};}
 assert.equal(report.planId,manifest.planId);assert.equal(report.provisioningBinding,phase==='recover-faucet'?manifest.faucetRecovery?.fromBinding:provisioningBinding(manifest),'PROVISION_REPORT_BINDING_MISMATCH');
 const otherReports=async()=>{
  const reports=[];for(const name of ['usdc-hosted-http','usdc-provider-proof-check','usdc-bazaar-protection-check','usdc-provider-protection-check','usdc-provider-proof-protection-check','usdc-bazaar-candidate-protection-check','usdc-bazaar-replacement-protection-check','usdc-bazaar-closed-protection-check']){try{const value=await json('docs/evidence/sprint-marketplace/'+name+'.json');assert.equal(value.planId,manifest.planId);assert.notEqual(value.status,'UNCERTAIN');reports.push(value);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return reports;
 };
 const otherActiveExecutionMs=async()=>(await otherReports()).reduce((total,value)=>total+(value.activeExecutionMs??0),0);
 const otherBudget=async()=>(await otherReports()).reduce((total,value)=>({apiRequests:total.apiRequests+(value.apiRequests??0)+Object.values(value.external??{}).reduce((sum,count)=>sum+count,0)+(value.proofHttpRequests??0),outboundPayloadBytes:total.outboundPayloadBytes+(value.outboundPayloadBytes??0),inboundPayloadBytes:total.inboundPayloadBytes+(value.inboundPayloadBytes??0)}),{apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0});
 const runner=createProvisioner({manifest,packet,report,persistPacket:savePacket,persistReport:value=>writeFile(reportPath,JSON.stringify(value,null,2)+'\n'),otherActiveExecutionMs,otherBudget});
 const result=phase==='inspect'?await runner.inspect():phase==='recover-faucet'?await runner.recoverFaucet():await runner.provision();console.log(JSON.stringify({status:phase==='inspect'?'READ_ONLY_INSPECTED':'PASS_PROVISIONED',result}));
 }finally{if(report?.status==='UNCERTAIN'||report?.attempts.some(attempt=>attempt.status==='PENDING'))await lock.preserve();else await lock.release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
