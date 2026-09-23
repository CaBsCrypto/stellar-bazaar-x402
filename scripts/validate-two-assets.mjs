// Authorized two-purchase LOCAL Testnet pilot. Never print private access or keys.
import assert from 'node:assert/strict';
import {Keypair} from '@stellar/stellar-sdk';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:https';
import {selectedEnv,writePrivateJSON,readPrivateJSON,acquirePilotLock} from './lib/private-pilot-state.mjs';
import {generateHistoryKeypair} from '../lib/operation-history-auth.ts';
import {assertActiveTestnetPayerSecret} from '../lib/testnet-payer-safety.ts';
import {readTestnetBalances} from '../lib/testnet-balances.ts';
import {TESTNET_ASSETS,assertPaymentOptions} from '../lib/payment-options.ts';
import {FilePaymentJournal,paymentBinding} from '../lib/pilot-payment-store.ts';
import {BazaarAgentClient} from '../lib/bazaar-agent-client.ts';
import {verifyTestnetTransfer} from '../lib/verify-testnet-transfer.ts';
import {parseOperationHistoryInput} from '../lib/operation-history.ts';
import {appendActivity} from '../lib/activity-client.ts';
import {decodePaymentRequiredHeader,decodePaymentSignatureHeader} from '@x402/core/http';
const directory=resolve('work/private-dual-asset-pilot'), runPath=join(directory,'run.json'),accessPath=join(directory,'access.json'), gatePath=join(directory,'gate.json');
const ui='http://127.0.0.1:3215',provider='https://127.0.0.1:3216';
const seller='GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ';
const facilitator='https://channels.openzeppelin.com/x402/testnet';
const amounts={USDC:'10000',XLM:'100000'},prices={USDC:'0.001',XLM:'0.01'};
const redisKeys=['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN'];
const privateConfig=()=>({...selectedEnv('.env.local',redisKeys),...selectedEnv('.env.local',['STELLAR_X402_FACILITATOR_API_KEY'])});
const wallet=()=>selectedEnv('.env.x402.local',['X402_PAYER_SECRET']).X402_PAYER_SECRET;
const access=()=>readPrivateJSON(accessPath),run=()=>readPrivateJSON(runPath);
function disabled(){writePrivateJSON(gatePath,{enabled:false})}
function accounts(){
 const a=access();const entries=[a.owner,a.other].map(({ownerId,readTokenHash,writeTokenHash})=>({ownerId,readTokenHash,writeTokenHash}));
 const old=resolve('work/private-website-report-pilot/access.json');
 if(existsSync(old)){const p=readPrivateJSON(old);for(const prefix of ['', 'other']){const ownerId=prefix?p.otherOwnerId:p.ownerId,read=prefix?p.otherReadToken:p.readToken,write=prefix?p.otherWriteToken:p.writeToken;if(ownerId&&read&&write)entries.push({ownerId,readTokenHash:createHash('sha256').update(read).digest('hex'),writeTokenHash:createHash('sha256').update(write).digest('hex')})}}
 return JSON.stringify(entries);
}
async function api(path,token,init={}){const r=await fetch(ui+path,{...init,headers:{...init.headers,Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});assert.ok(r.ok,`PRIVATE_API_${r.status}`);return r.json()}
async function validatePreparation(state){
 assert.equal(assertActiveTestnetPayerSecret(wallet()),state.payer);assert.notEqual(state.payer,seller);
 assertPaymentOptions(state.card);assert.equal(state.card.url,provider);assert.equal(state.card.network,'stellar:testnet');
 assert.equal(paymentBinding(state.card),state.cardHash);
 const r=await fetch(provider+'/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy',{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(r.status,402);
 const challenge=decodePaymentRequiredHeader(r.headers.get('payment-required'));assert.equal(challenge.accepts.length,2);
 for(const asset of ['USDC','XLM']){const option=challenge.accepts.find(o=>o.asset===TESTNET_ASSETS[asset]);assert.equal(option?.amount,amounts[asset]);assert.equal(option?.payTo,seller);assert.equal(option?.network,'stellar:testnet');assert.equal(option?.scheme,'exact');assert.equal(option?.extra?.areFeesSponsored,true);const declared=state.card.paymentOptions.find(o=>o.asset===asset);assert.equal(declared?.amount,prices[asset]);assert.equal(declared?.contract,TESTNET_ASSETS[asset]);assert.equal(declared?.destination,seller)}
 const balances=await readTestnetBalances(wallet());for(const asset of ['USDC','XLM'])assert.ok(BigInt(balances[asset])>=BigInt(amounts[asset]),'INSUFFICIENT_'+asset);
 const supported=await fetch(facilitator+'/supported',{headers:{Authorization:`Bearer ${privateConfig().STELLAR_X402_FACILITATOR_API_KEY}`},signal:AbortSignal.timeout(15000)});assert.equal(supported.status,200);const capabilities=await supported.json();assert.ok(capabilities.kinds.some(k=>k.network==='stellar:testnet'&&k.scheme==='exact'));
 return balances;
}
async function historyProbe(state){const a=access();for(const asset of ['USDC','XLM']){const op=state.operations[asset];const event={eventId:op.id+':preparation',taskId:op.taskId,agentId:state.agentId,mode:'testnet',kind:'request-started',title:`Preparación ${asset} · sin pago · resultado Sandbox de ejemplo`};assert.equal(await appendActivity(ui,{writeToken:a.owner.writeToken},event),'recorded');const own=await api('/api/activity?view=events&taskId='+op.taskId,a.owner.readToken);assert.ok(JSON.stringify(own).includes(event.eventId));const other=await api('/api/activity?view=events&taskId='+op.taskId,a.other.readToken);assert.ok(!JSON.stringify(other).includes(event.eventId));parseOperationHistoryInput({clientOperationId:op.id,taskId:op.taskId,agentId:state.agentId,mode:'testnet',service:{id:state.card.id,title:state.card.name,provider:state.card.provider.name,url:provider},payment:{status:'reported-unverified',network:'stellar:testnet',asset,amountAtomic:amounts[asset],recipient:seller},delivery:{status:'pending'}})}return true}
async function recordsCheck(state){const a=access(),own=await api('/api/operations?limit=100',a.owner.readToken),other=await api('/api/operations?limit=100',a.other.readToken);const evidence=[];
 for(const asset of ['USDC','XLM']){const op=state.operations[asset];if(op.status!=='completed')continue;const matching=own.records.filter(r=>r.clientOperationId===op.id);assert.equal(matching.length,1);const r=matching[0];assert.equal(r.payment.asset,asset);assert.equal(r.payment.amountAtomic,amounts[asset]);assert.equal(r.payment.transactionHash,op.transaction);assert.equal(paymentBinding(r.delivery.result),op.resultHash);assert.ok(!other.records.some(r=>r.clientOperationId===op.id));evidence.push({asset,transaction:op.transaction,records:1,resultHash:op.resultHash})}return evidence;
}
async function executeAsset(asset,recovery){
 assert.ok(['USDC','XLM'].includes(asset));const release=acquirePilotLock(directory);
 const originalSign=Keypair.prototype.sign, originalFetch=globalThis.fetch;
 if(recovery){Keypair.prototype.sign=()=>{throw Error('RECOVERY_MUST_NOT_SIGN')};globalThis.fetch=(url,init)=>{const target=new URL(typeof url==='string'||url instanceof URL ? url : url.url);if(target.origin===provider || /\/(settle|verify)$/.test(target.pathname))throw Error('RECOVERY_MUST_NOT_CALL_PROVIDER_OR_FACILITATOR');return originalFetch(url,init)}}
 try{let state=run(),op=state.operations[asset];
 if(recovery){assert.ok(op.attempted,'NOT_ATTEMPTED');disabled()}else{assert.ok(!op.attempted,'ALREADY_ATTEMPTED_USE_RECOVERY');if(asset==='XLM')assert.equal(state.operations.USDC.status,'completed','USDC_MUST_COMPLETE_FIRST');await validatePreparation(state);await historyProbe(state);op.attempted=true;op.status='pending';writePrivateJSON(runPath,state);writePrivateJSON(gatePath,{enabled:true,operationId:op.id,asset,expiresAt:Date.now()+120000})}
 const a=access(),journal=new FilePaymentJournal(join(directory,'buyer'));
 if(recovery){const stored=await journal.exclusive(op.id,async read=>read());assert.ok(stored?.response||stored?.outcome,'PAYMENT_UNCERTAIN_NO_RESPONSE_DO_NOT_RETRY')}
 const client=new BazaarAgentClient({baseUrl:ui,payerSecretKey:wallet(),allowedAssets:['USDC','XLM'],maxAmountByAsset:{USDC:'0.001',XLM:'0.01'},paymentJournal:journal,receiptVerifier:c=>verifyTestnetTransfer(c,state.payer),history:{writeToken:a.owner.writeToken,readToken:a.owner.readToken,agentId:state.agentId,taskId:op.taskId,taskTitle:`Compra ${asset} · Sandbox · datos de ejemplo`,mode:'testnet',includeResult:true}});
 const outcome=await client.executeService(state.card,state.inputs,{operationId:op.id,preferredAsset:asset});
 assert.ok(outcome.payment.receiptVerified && outcome.delivery.resultAvailable && outcome.history.status==='recorded','DELIVERY_OR_HISTORY_INCOMPLETE');
 assert.equal(outcome.payment.asset,asset);assert.equal(outcome.payment.declaredAmount,prices[asset]);
 await client.finishTask();op.status='completed';op.transaction=outcome.payment.transactionHash;op.resultHash=paymentBinding(outcome.data);writePrivateJSON(runPath,state);
 return {asset,transaction:op.transaction,resultHash:op.resultHash,recovery,history:'recorded',explorer:outcome.payment.receiptUrl};
 }finally{globalThis.fetch=originalFetch;Keypair.prototype.sign=originalSign;disabled();release()}
}
async function main(){const command=process.argv[2];
 if(command==='prepare'){
  if(existsSync(runPath))return {prepared:true,reused:true};
  mkdirSync(directory,{recursive:true,mode:0o700});
  const credentials={owner:generateHistoryKeypair(),other:generateHistoryKeypair()};if(!existsSync(accessPath))writePrivateJSON(accessPath,credentials);
  const response=await fetch(ui+'/api/discovery/resources');assert.equal(response.status,200);const catalog=await response.json();const card=catalog.results.find(c=>c.id==='swap-risk-quote'&&c.paymentOptions);assert.ok(card);card.url=provider;assertPaymentOptions(card);
  const state={createdAt:new Date().toISOString(),payer:assertActiveTestnetPayerSecret(wallet()),ownerId:access().owner.ownerId,agentId:'dual-asset-pilot',card,cardHash:paymentBinding(card),inputs:{pair:'XLM/USDC',amount:2500,side:'buy'},operations:Object.fromEntries(['USDC','XLM'].map(asset=>[asset,{id:randomUUID(),taskId:'dual-'+asset.toLowerCase()+'-'+randomUUID(),attempted:false,status:'prepared'}]))};
  writePrivateJSON(runPath,state);disabled();return {prepared:true,assets:['USDC','XLM'],payments:0};
 }
 if(command==='serve-ui'){
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3215'],{stdio:'inherit',windowsHide:true,env:{...process.env,...privateConfig(),BAZAAR_HISTORY_ACCOUNTS_JSON:accounts(),NEXT_PUBLIC_X402_XLM_PILOT:'true',NEXT_PUBLIC_APP_URL:ui,X402_PILOT_PAYMENTS_ENABLED:'false',X402_PILOT_STATE_DIR:join(directory,'provider'),X402_SELLER_ADDRESS:seller}});process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',code=>process.exitCode=code??0);return;
 }
 if(command==='serve-provider'){
  Object.assign(process.env,privateConfig(),{X402_SELLER_ADDRESS:seller,STELLAR_X402_FACILITATOR_URL:facilitator});
  const {handleSandboxPayment}=await import('../lib/sandbox-payment-handler.ts'),{requireServerX402Config}=await import('../lib/x402-config.ts'),{getFacilitatorClient}=await import('../lib/x402-facilitator.ts');
  disabled();
  const server=createServer({key:readFileSync(join(directory,'tls/key.pem')),cert:readFileSync(join(directory,'tls/cert.pem'))},async(req,res)=>{
   try{const url=new URL(req.url,provider);if(req.method!=='GET'||url.pathname!=='/api/x402/swap-risk'){res.writeHead(404);res.end();return}
    const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(typeof value==='string')headers.set(key,value);
    const gate=readPrivateJSON(gatePath);let allowed=gate.enabled===true && gate.expiresAt>Date.now() && headers.get('idempotency-key')===gate.operationId;
    if(headers.has('payment-signature')){try{allowed &&= decodePaymentSignatureHeader(headers.get('payment-signature')).accepted.asset===TESTNET_ASSETS[gate.asset]}catch{allowed=false}}
    const response=await handleSandboxPayment(new Request(url,{headers}),{config:requireServerX402Config,facilitator:getFacilitatorClient,pilot:()=>true,directory:()=>join(directory,'provider'),payments:()=>allowed});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch{res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"LOCAL_PILOT_UNAVAILABLE"}')} });server.listen(3216,'127.0.0.1',()=>console.log('HTTPS pilot ready; payments gated by operation and 120s window'));return;
 }
 if(command==='preflight'){const state=run();const balances=await validatePreparation(state);await historyProbe(state);return {preflight:true,balancesSufficient:true,redisWriteRead:true,ownerIsolation:true,payer:state.payer,assets:['USDC','XLM'],payments:0}}
 if(command==='buy')return executeAsset(process.argv[3],false);
 if(command==='recover')return executeAsset(process.argv[3],true);
 if(command==='check')return {evidence:await recordsCheck(run()),gateEnabled:readPrivateJSON(gatePath).enabled};
 if(command==='disable'){disabled();return {paymentsEnabled:false}}
 throw Error('COMMAND_REQUIRED');
}
main().then(value=>{if(value)console.log(JSON.stringify(value,null,2))}).catch(error=>{if(existsSync(gatePath))disabled();console.error(JSON.stringify({ok:false,error:error.message.replace(/Bearer\\s+\\S+/gi,'Bearer [REDACTED]').slice(0,240)}));process.exitCode=1});
