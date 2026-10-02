import {Account,Asset,FeeBumpTransaction,Memo,Networks,Operation,TransactionBuilder,type Transaction} from '@stellar/stellar-sdk';
import {configuredMarketStore,type MarketOrder} from './marketplace-store.ts';
import {readMarketOrder} from './marketplace.ts';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {decimalToAtomic} from './operation-history-client.ts';

const HORIZON='https://horizon-testnet.stellar.org';
export interface MarketLedger {
  account(payer:string):Promise<{sequence:string}>;
  submit(signedXdr:string):Promise<{hash:string}>;
  transaction(hash:string):Promise<{hash:string;successful:boolean;envelope_xdr:string}>;
}
async function horizon(path:string,init?:RequestInit){
 const response=await fetch(HORIZON+path,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new WorkspaceError('TESTNET_UNAVAILABLE');
 const reader=response.body?.getReader();if(!reader)throw new WorkspaceError('TESTNET_UNAVAILABLE');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072){await reader.cancel();throw new WorkspaceError('TESTNET_RESPONSE_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export const marketLedger:MarketLedger={
 account:payer=>horizon('/accounts/'+payer),
 submit:signedXdr=>horizon('/transactions',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({tx:signedXdr})}),
 transaction:hash=>horizon('/transactions/'+hash),
};
function buyer(p:WorkspacePrincipal,o:MarketOrder){if(p.role!=='human'||o.buyerOwnerId!==p.ownerId)throw new WorkspaceError('FORBIDDEN',403);}
export function boundMarketTransaction(xdr:string,o:MarketOrder):Transaction {
 try{
  const decoded=TransactionBuilder.fromXDR(xdr,Networks.TESTNET);if(decoded instanceof FeeBumpTransaction)throw Error();
  const tx=decoded,op=tx.operations[0];
  if(tx.source!==o.payer||tx.operations.length!==1||op.type!=='payment'||!op.asset.isNative()||op.destination!==o.destination||(op.source&&op.source!==o.payer)||BigInt(decimalToAtomic(op.amount))!==BigInt(decimalToAtomic(o.amount))||tx.memo.type!=='hash'||Buffer.from(tx.memo.value as Buffer).toString('hex')!==o.memoHash||!tx.timeBounds||Number(tx.timeBounds.maxTime)===0||Number(tx.fee)>1000)throw Error();
  return tx;
 }catch{throw new WorkspaceError('PAYMENT_BINDING_MISMATCH',400);}
}
export async function prepareMarketPayment(p:WorkspacePrincipal,id:string,ledger:MarketLedger=marketLedger){
 const o=await readMarketOrder(p,id);buyer(p,o);if(o.phase!=='awaiting-payment')throw new WorkspaceError('PAYMENT_ALREADY_STARTED',409);
 const account=await ledger.account(o.payer);
 const tx=new TransactionBuilder(new Account(o.payer,account.sequence),{fee:'100',networkPassphrase:Networks.TESTNET})
  .addOperation(Operation.payment({destination:o.destination,asset:Asset.native(),amount:o.amount})).addMemo(Memo.hash(o.memoHash)).setTimeout(180).build();
 return {network:'stellar:testnet',asset:'XLM',amount:o.amount,destination:o.destination,payer:o.payer,unsignedXdr:tx.toXDR(),expiresAt:tx.timeBounds!.maxTime,signing:'buyer-wallet-only',custody:false};
}
export async function verifyMarketPayment(p:WorkspacePrincipal,id:string,ledger:MarketLedger=marketLedger){
 const o=await readMarketOrder(p,id);buyer(p,o);if(!o.transactionHash)throw new WorkspaceError('PAYMENT_NOT_STARTED',409);
 const record=await ledger.transaction(o.transactionHash);
 const tx=boundMarketTransaction(record.envelope_xdr,o);
 if(!record.successful||record.hash!==o.transactionHash||tx.hash().toString('hex')!==o.transactionHash)throw new WorkspaceError('PAYMENT_NOT_VERIFIED',409);
 return configuredMarketStore().transact(s=>{const current=s.orders.find(v=>v.operationId===id)!;
 if(current.transactionHash!==record.hash)throw new WorkspaceError('OPERATION_CONFLICT',409);
 if(['payment-submitting','payment-uncertain'].includes(current.phase)){current.phase='paid';current.paymentVerifiedAt=new Date().toISOString();current.updatedAt=current.paymentVerifiedAt;}
 return current;});
}
export async function payMarketOrder(p:WorkspacePrincipal,id:string,signedXdr:string,ledger:MarketLedger=marketLedger){
 const o=await readMarketOrder(p,id);buyer(p,o);
 const tx=boundMarketTransaction(signedXdr,o),transactionHash=tx.hash().toString('hex');
 if(!tx.signatures.length||Number(tx.timeBounds!.maxTime)<=Math.floor(Date.now()/1000)||Number(tx.timeBounds!.maxTime)>Math.floor(Date.now()/1000)+300)throw new WorkspaceError('PAYMENT_SIGNATURE_OR_TIME_INVALID',400);
 const shouldSubmit=await configuredMarketStore().transact(s=>{const current=s.orders.find(v=>v.operationId===id)!;
 if(s.paused)throw new WorkspaceError('MARKET_PAUSED');
 if(current.transactionHash){if(current.transactionHash!==transactionHash)throw new WorkspaceError('OPERATION_CONFLICT',409);return false;}
 if(current.phase!=='awaiting-payment'||s.orders.some(v=>v.transactionHash===transactionHash))throw new WorkspaceError('OPERATION_CONFLICT',409);
 current.transactionHash=transactionHash;current.phase='payment-submitting';current.updatedAt=new Date().toISOString();return true;});
 if(!shouldSubmit)throw new WorkspaceError('PAYMENT_REQUIRES_RECONCILIATION',409);
 try{
  const result=await ledger.submit(signedXdr);if(result.hash!==transactionHash)throw new WorkspaceError('PAYMENT_NOT_VERIFIED');
  return await verifyMarketPayment(p,id,ledger);
 }catch{
  try{await configuredMarketStore().transact(s=>{const current=s.orders.find(v=>v.operationId===id)!;if(current.phase==='payment-submitting'){current.phase='payment-uncertain';current.updatedAt=new Date().toISOString();}});}catch{}
  throw new WorkspaceError('PAYMENT_OUTCOME_UNCERTAIN',409);
 }
}
