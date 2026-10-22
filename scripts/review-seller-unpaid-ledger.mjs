import {sellerCanonical,sellerHash} from '../examples/seller-service-card.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const effects=['attemptId','payload','payloadHash','authorizationFingerprint','outcome','transactionHash','responseHash'];
const fields=new Set(['operationId','buyerOwnerId','orderBinding','challenge','phase','createdAt','updatedAt',...effects]);
const phases=['challenged','verifying','rejected','settling','uncertain','settled','confirmed'];
const binding=order=>sellerHash(sellerCanonical({operationId:order.operationId,owner:order.buyerOwnerId,protocol:order.paymentProtocol,cardHash:order.cardHash,inputHash:order.inputHash,payer:order.payer,destination:order.destination,amount:order.amount,settlement:order.settlement}));
/** Local review only. No provider/payment function; no IDs, prompts or payloads
 * are returned. Missing or unsubmitted challenge is sufficient only alongside
 * a stable owned-sale snapshot and globally closed purchases checked separately.
 */
export function reviewUnpaidSaleLedger(orders,records){
 if(!Array.isArray(orders)||orders.length>100||!Array.isArray(records)||records.length>1000)throw Error('BOUNDED_LEDGER_REVIEW_REQUIRED');
 if(records.some(record=>!uuid.test(record?.operationId??''))||new Set(records.map(record=>record.operationId)).size!==records.length)throw Error('COMPLETE_UNAMBIGUOUS_LEDGER_REQUIRED');
 const stats={awaitingSales:0,absentLedger:0,unsubmittedChallenge:0,attemptOrOutcomePresent:0,changedBinding:0,unknownRecord:0,nonterminalOtherSales:0,ledgerPhases:Object.fromEntries([...phases,'absent','unknown'].map(phase=>[phase,0]))};
 const byId=new Map(records.map(record=>[record.operationId,record]));
 for(const order of orders){
  if(order?.perspective!=='sale'||!uuid.test(order.operationId??''))throw Error('OWNED_SALE_REQUIRED');
  if(['delivered','delivery-failed','expired-unpaid'].includes(order.phase))continue;
  if(order.phase!=='awaiting-payment'){stats.nonterminalOtherSales++;continue;}
  stats.awaitingSales++;
  if(order.paymentProtocol!=='x402-stellar-exact-v2'||['paymentVerifiedAt','transactionHash','settlementAttemptId','attemptId','agentId'].some(key=>Object.hasOwn(order,key))){stats.attemptOrOutcomePresent++;continue;}
  const record=byId.get(order.operationId);if(!record){stats.absentLedger++;stats.ledgerPhases.absent++;continue;}
  const phase=phases.includes(record.phase)?record.phase:'unknown';stats.ledgerPhases[phase]++;
  if(Object.keys(record).some(key=>!fields.has(key))||phase==='unknown'){stats.unknownRecord++;continue;}
  if(record.buyerOwnerId!==order.buyerOwnerId||record.orderBinding!==binding(order)){stats.changedBinding++;continue;}
  if(phase!=='challenged'||effects.some(key=>Object.hasOwn(record,key))){stats.attemptOrOutcomePresent++;continue;}
  const challenge=record.challenge;let resource;try{resource=new URL(challenge?.resource?.url);}catch{}
  if(challenge?.x402Version!==2||!Array.isArray(challenge.accepts)||challenge.accepts.length!==1||challenge.accepts[0]?.network!=='stellar:testnet'||!resource||resource.protocol!=='https:'||resource.pathname!==`/api/market/orders/${order.operationId}/x402`||resource.search||resource.hash){stats.unknownRecord++;continue;}
  stats.unsubmittedChallenge++;
 }
 const unsafe=stats.nonterminalOtherSales+stats.attemptOrOutcomePresent+stats.changedBinding+stats.unknownRecord;
 return {...stats,noSubmittedAwaitingPaymentProven:unsafe===0&&stats.awaitingSales===stats.absentLedger+stats.unsubmittedChallenge,proofScope:'Snapshot only; requires unchanged owned-sale and ledger reads plus purchases globally closed before and after.',guardApplied:false,manualTickAuthorized:false,orderIdentifiersReturned:0,orderContentReturned:false};
}
