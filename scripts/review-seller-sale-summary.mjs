const knownPhases=['awaiting-payment','payment-submitting','payment-uncertain','paid','executing','execution-uncertain','delivered','delivery-failed','expired-unpaid'];
const terminal=new Set(['delivered','delivery-failed','expired-unpaid']);
/** Aggregate only. Order DTO absence does not prove absence of a settlement
 * record: verification starts in the independent x402 ledger before markOrder.
 * This review never approves a tick or changes the conservative preflight.
 */
export function summarizeSellerSales(orders){
 if(!Array.isArray(orders)||orders.length>100)throw Error('BOUNDED_SALE_LIST_REQUIRED');
 const phases=Object.fromEntries([...knownPhases,'unknown'].map(phase=>[phase,0]));
 const payment={verifiedOrderMarkers:0,uncertainOrderMarkers:0,noOrderPaymentMarkers:0,malformedOrderPaymentMarkers:0};let nonterminalSales=0,unprovenAwaitingPayment=0;
 for(const order of orders){
  if(order?.perspective!=='sale')throw Error('SALE_PERSPECTIVE_REQUIRED');
  const phase=knownPhases.includes(order.phase)?order.phase:'unknown';phases[phase]++;if(!terminal.has(phase))nonterminalSales++;
  const hashPresent=order.transactionHash!==undefined,verifiedPresent=order.paymentVerifiedAt!==undefined,attemptPresent=order.settlementAttemptId!==undefined;
  const validHash=/^[a-f0-9]{64}$/.test(order.transactionHash??''),validVerified=typeof order.paymentVerifiedAt==='string'&&Number.isFinite(Date.parse(order.paymentVerifiedAt));
  if(validHash&&validVerified)payment.verifiedOrderMarkers++;
  else if(verifiedPresent&&!validVerified||hashPresent&&!validHash)payment.malformedOrderPaymentMarkers++;
  else if(hashPresent||verifiedPresent||attemptPresent||['payment-submitting','payment-uncertain','execution-uncertain','paid','executing'].includes(phase))payment.uncertainOrderMarkers++;
  else payment.noOrderPaymentMarkers++;
  if(phase==='awaiting-payment')unprovenAwaitingPayment++;
 }
 return {saleOrders:orders.length,phases,payment,nonterminalSales,terminalOnly:nonterminalSales===0,unprovenAwaitingPayment,definitivelyUnpaidSales:0,settlementLedgerPhaseAvailable:false,guardRelaxationProven:false,readOnly:true,orderIdentifiersReturned:0,orderContentReturned:false,paymentMeaning:'Order markers only. No markers is not proof that the independent x402 ledger is unchallenged or not verifying.'};
}
