import {Account,Asset,FeeBumpTransaction,Keypair,Memo,Networks,Operation,TransactionBuilder,type Transaction} from '@stellar/stellar-sdk';
import {configuredMarketStore,type MarketOrder} from './marketplace-store.ts';
import {readMarketOrder} from './marketplace.ts';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {decimalToAtomic} from './operation-history-client.ts';
import {isCanonicalUsdcTestnet,sameCreditIdentity} from './payment-assets.ts';
import {meteredExternal} from './acceptance-meter.ts';

const HORIZON='https://horizon-testnet.stellar.org';
export interface MarketAccount {
  account_id:string;sequence:string;subentry_count:number;num_sponsored?:number;num_sponsoring?:number;
  balances:Array<{asset_type:string;balance:string;selling_liabilities?:string;buying_liabilities?:string;asset_code?:string;asset_issuer?:string;limit?:string;is_authorized?:boolean}>;
  thresholds:{med_threshold:number};signers:Array<{key:string;type:string;weight:number}>;
}
export interface MarketLedger {
  account(publicKey:string):Promise<MarketAccount>;
  reserve():Promise<{baseReserveAtomic:string}>;
  submit(signedXdr:string):Promise<{hash:string}>;
  transaction(hash:string):Promise<{hash:string;successful:boolean;envelope_xdr:string}>;
}
async function horizon(path:string,init?:RequestInit){
 let receivedBytes=0;const sentBytes=init?.body==null?0:Buffer.byteLength(init.body.toString());
 return meteredExternal('horizon',async()=>{
  const response=await fetch(HORIZON+path,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new WorkspaceError('TESTNET_UNAVAILABLE');
  const reader=response.body?.getReader();if(!reader)throw new WorkspaceError('TESTNET_UNAVAILABLE');const chunks:Uint8Array[]=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;receivedBytes+=value.byteLength;if(receivedBytes>131072){await reader.cancel();throw new WorkspaceError('TESTNET_RESPONSE_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 },{path,method:init?.method??'GET'},()=>({outboundBytes:sentBytes,inboundBytes:receivedBytes}));
}
export const marketLedger:MarketLedger={
 account:publicKey=>horizon('/accounts/'+publicKey),
 reserve:async()=>{const response=await horizon('/ledgers?order=desc&limit=1');return {baseReserveAtomic:String(response._embedded?.records?.[0]?.base_reserve_in_stroops??'')};},
 submit:signedXdr=>horizon('/transactions',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({tx:signedXdr})}),
 transaction:hash=>horizon('/transactions/'+hash),
};
function buyer(p:WorkspacePrincipal,o:MarketOrder){if(o.paymentProtocol)throw new WorkspaceError('PAYMENT_PROTOCOL_MISMATCH',409);if(p.role!=='human'||o.buyerOwnerId!==p.ownerId)throw new WorkspaceError('FORBIDDEN',403);}
function settlementAsset(o:MarketOrder):Asset {
 if(o.paymentProtocol)throw new WorkspaceError('PAYMENT_PROTOCOL_MISMATCH',409);
 if(!isCanonicalUsdcTestnet(o.settlement)||o.card.network!==o.settlement.network||o.card.payment.asset!==o.settlement.code||!sameCreditIdentity(o.card.payment.identity,o.settlement))throw new WorkspaceError('PAYMENT_ASSET_DISABLED',400);
 return new Asset(o.settlement.code,o.settlement.issuer);
}
const atomic=(value:string)=>BigInt(decimalToAtomic(value));
/** Reject missing or malformed Horizon evidence instead of treating an unknown balance as spendable. */
export function preflightMarketAccounts(o:MarketOrder,payer:MarketAccount,destination:MarketAccount,baseReserveAtomic:string,feeAtomic=100n){
 settlementAsset(o);
 try{
  if(o.payer===o.destination||payer.account_id!==o.payer||destination.account_id!==o.destination||!/^\d+$/.test(payer.sequence)||!/^\d+$/.test(baseReserveAtomic)||BigInt(baseReserveAtomic)<=0n||feeAtomic<100n||feeAtomic>1000n)throw Error();
  const amount=atomic(o.amount);if(amount<=0n)throw Error();
  for(const [account,role] of [[payer,'buyer'],[destination,'seller']] as const){
   if([account.subentry_count,account.num_sponsoring??0,account.num_sponsored??0].some(value=>!Number.isSafeInteger(value)||value<0))throw Error();
   const units=2+account.subentry_count+(account.num_sponsoring??0)-(account.num_sponsored??0);
   if(!Number.isSafeInteger(units)||units<0)throw Error();
   const native=account.balances.find(balance=>balance.asset_type==='native');
   if(!native)throw new WorkspaceError('XLM_RESERVE_REQUIRED',409);
   const spendable=atomic(native.balance)-atomic(native.selling_liabilities??'0')-BigInt(units)*BigInt(baseReserveAtomic);
   if(spendable<(role==='buyer'?feeAtomic:0n))throw new WorkspaceError('XLM_RESERVE_OR_FEE_INSUFFICIENT',409);
   const credit=account.balances.find(balance=>balance.asset_type==='credit_alphanum4'&&balance.asset_code===o.settlement!.code&&balance.asset_issuer===o.settlement!.issuer);
   if(!credit)throw new WorkspaceError(role==='buyer'?'BUYER_TRUSTLINE_REQUIRED':'SELLER_TRUSTLINE_REQUIRED',409);
   if(credit.is_authorized!==true)throw new WorkspaceError(role==='buyer'?'BUYER_TRUSTLINE_UNAUTHORIZED':'SELLER_TRUSTLINE_UNAUTHORIZED',409);
   if(role==='buyer'&&atomic(credit.balance)-atomic(credit.selling_liabilities??'0')<amount)throw new WorkspaceError('USDC_BALANCE_INSUFFICIENT',409);
   if(role==='seller'&&(!credit.limit||atomic(credit.limit)-atomic(credit.balance)-atomic(credit.buying_liabilities??'0')<amount))throw new WorkspaceError('SELLER_TRUSTLINE_CAPACITY_INSUFFICIENT',409);
  }
 }catch(error){if(error instanceof WorkspaceError)throw error;throw new WorkspaceError('PAYMENT_ACCOUNT_EVIDENCE_INVALID',409);}
}
async function preflight(o:MarketOrder,ledger:MarketLedger,feeAtomic=100n){
 settlementAsset(o);
 // Sequential requests keep accounting and failure boundaries explicit. No SDK transport retries.
 const payer=await ledger.account(o.payer),destination=await ledger.account(o.destination),reserve=await ledger.reserve();
 preflightMarketAccounts(o,payer,destination,reserve.baseReserveAtomic,feeAtomic);return payer;
}
export function boundMarketTransaction(xdr:string,o:MarketOrder):Transaction {
 try{
  const expected=settlementAsset(o),decoded=TransactionBuilder.fromXDR(xdr,Networks.TESTNET);if(decoded instanceof FeeBumpTransaction)throw Error();
  const tx=decoded,op=tx.operations[0];
  if(tx.source!==o.payer||tx.operations.length!==1||op.type!=='payment'||!op.asset.equals(expected)||op.destination!==o.destination||(op.source&&op.source!==o.payer)||atomic(op.amount)!==atomic(o.amount)||tx.memo.type!=='hash'||Buffer.from(tx.memo.value as Buffer).toString('hex')!==o.memoHash||!tx.timeBounds||Number(tx.timeBounds.maxTime)===0||Number(tx.timeBounds.minTime)!==0||Number(tx.fee)<100||Number(tx.fee)>1000||tx.ledgerBounds||tx.minAccountSequence||tx.minAccountSequenceAge||tx.minAccountSequenceLedgerGap||tx.extraSigners?.length)throw Error();
  return tx;
 }catch(error){if(error instanceof WorkspaceError&&error.code==='PAYMENT_ASSET_DISABLED')throw error;throw new WorkspaceError('PAYMENT_BINDING_MISMATCH',400);}
}
export function verifyMarketSignatures(tx:Transaction,payer:MarketAccount){
 try{
  const threshold=payer.thresholds.med_threshold;if(!Number.isInteger(threshold)||threshold<0||threshold>255||!tx.signatures.length)throw Error();
  const authorized=new Map(payer.signers.filter(signer=>signer.type==='ed25519_public_key'&&Number.isInteger(signer.weight)&&signer.weight>0&&signer.weight<=255).map(signer=>[signer.key,signer.weight]));
  const matched=new Set<string>();let weight=0;
  for(const signature of tx.signatures){
   const found=[...authorized.keys()].find(key=>!matched.has(key)&&Keypair.fromPublicKey(key).signatureHint().equals(signature.hint())&&Keypair.fromPublicKey(key).verify(tx.hash(),signature.signature()));
   if(!found)throw Error();matched.add(found);weight+=authorized.get(found)!;
  }
  if(weight<threshold)throw Error();
 }catch{throw new WorkspaceError('PAYMENT_SIGNATURE_OR_TIME_INVALID',400);}
}
export async function prepareMarketPayment(p:WorkspacePrincipal,id:string,ledger:MarketLedger=marketLedger){
 const o=await readMarketOrder(p,id);buyer(p,o);if(o.phase!=='awaiting-payment')throw new WorkspaceError('PAYMENT_ALREADY_STARTED',409);
 const account=await preflight(o,ledger);
 const tx=new TransactionBuilder(new Account(o.payer,account.sequence),{fee:'100',networkPassphrase:Networks.TESTNET})
  .addOperation(Operation.payment({destination:o.destination,asset:settlementAsset(o),amount:o.amount})).addMemo(Memo.hash(o.memoHash)).setTimeout(180).build();
 return {network:'stellar:testnet',asset:o.settlement!.code,identity:o.settlement!,amount:o.amount,destination:o.destination,payer:o.payer,unsignedXdr:tx.toXDR(),expiresAt:tx.timeBounds!.maxTime,signing:'buyer-wallet-only',custody:false};
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
 // A repeated envelope is read-only reconciliation. Never submit it or build a replacement automatically.
 if(o.transactionHash){if(o.transactionHash!==transactionHash)throw new WorkspaceError('OPERATION_CONFLICT',409);throw new WorkspaceError('PAYMENT_REQUIRES_RECONCILIATION',409);}
 const now=Math.floor(Date.now()/1000);
 if(Number(tx.timeBounds!.maxTime)<=now||Number(tx.timeBounds!.maxTime)>now+300)throw new WorkspaceError('PAYMENT_SIGNATURE_OR_TIME_INVALID',400);
 const payer=await preflight(o,ledger,BigInt(tx.fee));verifyMarketSignatures(tx,payer);
 if(BigInt(tx.sequence)!==BigInt(payer.sequence)+1n)throw new WorkspaceError('PAYMENT_SEQUENCE_CHANGED',409);
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
