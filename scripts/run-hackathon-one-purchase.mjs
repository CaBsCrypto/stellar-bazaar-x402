import {createHash} from 'node:crypto';
import {authorizeBuyerOnce,payBuyerOnce,recoverBuyerIntent,createMarketplaceBuyerIntent,createDpapiBuyerJournal,createBuyerSpendBudget,createBoundedBuyerFetch,buyerCanonical,buyerIdentity,buyerAccessValid} from '../examples/marketplace-x402-buyer.mjs';
import {marketAmountAtomic} from '../examples/market-price.mjs';

// Local invocation only: no CLI, wallet loading, funding, admission or deployment.
// The broker owns authorization, an atomic durable once gate, and sealed state.
const hash=value=>createHash('sha256').update(buyerCanonical(value)).digest('hex');
const retired='GC3CK5A4KCNE44LGMU6PYPEAAZVQOFATJCEMBAASGCXK5EKECTB2VDL4';
const active=new Set(),rpcOrigin='https://soroban-testnet.stellar.org';
const expectedApprovalKeys=['version','approved','sourceSha','origin','cardHash','operationId','payer','destination','amount','maximumAtomic','maxSponsoredFeeStroops'];
export const createHackathonPurchaseJournal=(path,options)=>createDpapiBuyerJournal(path,options);

function assertApproval(intent,approval,sourceSha){
 if(!approval||Object.keys(approval).sort().join(',')!==expectedApprovalKeys.sort().join(',')||approval.version!==1||approval.approved!==true||!/^[a-f0-9]{40}$/.test(sourceSha??'')||approval.sourceSha!==sourceSha||!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(approval.origin??'')||approval.origin!==intent.origin||approval.cardHash!==intent.cardHash||approval.operationId!==intent.operationId||approval.payer!==intent.payer||approval.destination!==intent.card?.payment?.destination||approval.amount!==intent.card.payment.amount||!/^\d+$/.test(approval.maximumAtomic??'')||BigInt(approval.maximumAtomic)<1n||BigInt(approval.maximumAtomic)>100000n||intent.maxAtomic!==approval.maximumAtomic||BigInt(marketAmountAtomic(approval.amount))>BigInt(approval.maximumAtomic)||!Number.isSafeInteger(approval.maxSponsoredFeeStroops)||approval.maxSponsoredFeeStroops<1||approval.maxSponsoredFeeStroops>1000000)throw Error('EXACT_PURCHASE_APPROVAL_REQUIRED');
 if(intent.payer===retired||approval.destination===retired)throw Error('RETIRED_TESTNET_WALLET');
 // Pure native validation, no new order or signature is created by this check.
 createMarketplaceBuyerIntent({origin:intent.origin,card:intent.card,input:intent.input,payer:intent.payer,operationId:intent.operationId,maxAtomic:intent.maxAtomic});
 if(hash(intent.card)!==intent.cardHash||hash(intent.input)!==intent.inputHash||hash(intent.challenge)!==intent.challengeHash)throw Error('FROZEN_PURCHASE_CHANGED');
 const requirement=intent.challenge?.accepts?.[0];
 if(intent.challenge?.accepts?.length!==1||requirement.network!==buyerIdentity.network||requirement.asset!==buyerIdentity.sacContract||requirement.amount!==marketAmountAtomic(approval.amount)||requirement.payTo!==approval.destination||requirement.extra?.areFeesSponsored!==true||requirement.extra?.operationId!==approval.operationId||requirement.extra?.cardHash!==approval.cardHash||requirement.extra?.inputHash!==intent.inputHash)throw Error('APPROVED_CHALLENGE_CHANGED');
 return hash(approval);
}
function measuredTransports({intent,marketFetch,rpcFetch,now=Date.now}){
 if(typeof marketFetch!=='function'||typeof now!=='function'||rpcFetch!==undefined&&typeof rpcFetch!=='function')throw Error('MEASURED_TRANSPORT_REQUIRED');
 const start=now();if(!Number.isSafeInteger(start)||start<0)throw Error('PURCHASE_CLOCK_REQUIRED');
 const deadline=start+120000,counts={market:0,rpc:0};let observed=start;
 const check=()=>{const time=now();if(!Number.isSafeInteger(time)||time<observed||time>=deadline)throw Error('PURCHASE_TIME_BOUND');observed=time;};
 const bound=(kind,origin,transport)=>createBoundedBuyerFetch({origin,fetchImpl:async(url,init)=>{check();const path=new URL(url).pathname;
  if(kind==='market'&&(path!=='/api/market/orders/'+intent.operationId&&path!=='/api/market/orders/'+intent.operationId+'/x402'||init.method==='POST'&&(path!=='/api/market/orders/'+intent.operationId+'/x402'||init.body!=='{}')||init.method==='GET'&&path!=='/api/market/orders/'+intent.operationId))throw Error('PURCHASE_TARGET_DENIED');
  if(kind==='rpc'&&(path!=='/'||init.method!=='POST'||!['getLatestLedger','simulateTransaction'].includes(JSON.parse(init.body).method)))throw Error('PURCHASE_RPC_DENIED');
  if(counts[kind]>=(kind==='market'?6:4))throw Error('PURCHASE_REQUEST_BOUND');counts[kind]++;return transport(url,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(Math.max(1,deadline-observed))])});
 },maxResponseBytes:262144,timeoutMs:12000});
 return {marketFetch:bound('market',intent.origin,marketFetch),...(rpcFetch?{rpcFetch:bound('rpc',rpcOrigin,rpcFetch)}:{}),counts,deadline,check,async sign(action){check();let timer;try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PURCHASE_TIME_BOUND')),Math.max(1,deadline-observed));})]);}finally{clearTimeout(timer);}}};
}
function outcome(intent,transport,uncertain=false){return {status:uncertain?'REQUIRES_READ_RECOVERY':'CONFIRMED',operationId:intent.operationId,phase:intent.phase,orderPhase:intent.order?.phase,paymentVerified:Boolean(intent.order?.paymentVerifiedAt),...(intent.order?.transactionHash?{transactionHash:intent.order.transactionHash}:{}),marketRequests:transport.counts.market,rpcRequests:transport.counts.rpc,needsOwner:uncertain};}

/** consumeOnce must atomically persist and return this approvalHash + UUID.
 * persistSpend must seal/fsync the sole reservation before returning. The caller
 * holds its broker lock; creating another journal never resets this once gate.
 * marketFetch is the audited private exact-origin preview transport, not global
 * fetch. The injected signer stays local and receives no other payment intent.
 */
export async function runHackathonOnePurchase(input){
 const {sourceSha,journal,agentAccess,signer,consumeOnce,persistSpend}=input;
 const intent=structuredClone(input.intent),approval=Object.freeze(structuredClone(input.approval));
 if(!intent||intent.phase!=='challenge-received'||['signedPayload','paymentSignature','unsignedTransaction','signedAuthorizationTransaction','payloadHash','expirationLedger'].some(key=>key in intent))throw Error('FRESH_CHECKED_CHALLENGE_REQUIRED');
 const approvalHash=assertApproval(intent,approval,sourceSha);
 if(!journal?.read||!journal?.append||!buyerAccessValid(agentAccess)||signer?.address!==intent.payer||typeof signer.signAuthEntry!=='function'||typeof consumeOnce!=='function'||typeof persistSpend!=='function')throw Error('PRIVATE_PURCHASE_BROKER_REQUIRED');
 const signerAddress=signer.address,signAuthEntry=signer.signAuthEntry.bind(signer);
 const key=intent.origin+':'+intent.operationId;if(active.has(key))throw Error('CONCURRENT_PURCHASE_DENIED');active.add(key);
 let transport;
 try{
  if(buyerCanonical(await journal.read())!==buyerCanonical(intent))throw Error('SEALED_INTENT_CHANGED');
  transport=measuredTransports({...input,intent});
  const gate=await consumeOnce({approvalHash,operationId:intent.operationId,sourceSha,deadlineAt:transport.deadline,maximumAtomic:approval.maximumAtomic});
  if(gate?.consumed!==true||gate.approvalHash!==approvalHash||gate.operationId!==intent.operationId)throw Error('DURABLE_ONCE_GATE_REQUIRED');
  const budget=createBuyerSpendBudget({maximumAtomic:approval.maximumAtomic,reservations:[],persistReservations:persistSpend});
  const options={agentToken:agentAccess,rpcUrl:rpcOrigin,...transport,maxSponsoredFeeStroops:approval.maxSponsoredFeeStroops,persistIntent:value=>journal.append(structuredClone(value)),reserveSpend:value=>budget.reserve(value),signer:{address:signerAddress,signAuthEntry:(...args)=>transport.sign(()=>signAuthEntry(...args))}};
  try{transport.check();await authorizeBuyerOnce(intent,options);transport.check();await payBuyerOnce(intent,options);return outcome(intent,transport);}
  catch{return outcome(intent,transport,true);}
 }finally{active.delete(key);}
}

/** Explicit same-order GET only; never signs, POSTs, or reopens the once gate. */
export async function recoverHackathonOnePurchase(input){
 const {sourceSha,journal,agentAccess}=input;const intent=structuredClone(input.intent),approval=Object.freeze(structuredClone(input.approval));assertApproval(intent,approval,sourceSha);
 if(!journal?.read||!journal?.append||!buyerAccessValid(agentAccess))throw Error('PRIVATE_PURCHASE_BROKER_REQUIRED');
 const key=intent.origin+':'+intent.operationId;if(active.has(key))throw Error('CONCURRENT_PURCHASE_DENIED');active.add(key);
 try{if(buyerCanonical(await journal.read())!==buyerCanonical(intent))throw Error('SEALED_INTENT_CHANGED');const transport=measuredTransports({...input,intent});
  try{await recoverBuyerIntent(intent,{agentToken:agentAccess,marketFetch:transport.marketFetch,persistIntent:value=>journal.append(structuredClone(value))});return outcome(intent,transport,!intent.order?.paymentVerifiedAt);}
  catch{return outcome(intent,transport,true);}
 }finally{active.delete(key);}
}
