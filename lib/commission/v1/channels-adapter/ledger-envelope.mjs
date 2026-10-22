// Pure decoding only. No signer, network client, credential or dispatch authority.
import {TransactionBuilder,FeeBumpTransaction,Networks,StrKey,xdr} from '@stellar/stellar-sdk';
const need=(ok,c)=>{if(!ok)throw Error(c);};
export function pinFeeBumpSources(value){if(value===undefined)return undefined;need(value&&Object.keys(value).sort().join(',')==='source,sponsor','LEDGER_SPONSOR_PINS_INVALID');const copy={source:value.source,sponsor:value.sponsor};need(StrKey.isValidEd25519PublicKey(copy.source??'')&&StrKey.isValidEd25519PublicKey(copy.sponsor??''),'LEDGER_SPONSOR_PINS_INVALID');return Object.freeze(copy);}
function canonical(value,kind,max){need(typeof value==='string'&&value.length>0&&value.length<=Math.ceil(max/3)*4&&/^[A-Za-z0-9+/]+={0,2}$/.test(value)&&Buffer.from(value,'base64').byteLength<=max,'LEDGER_XDR_BOUND');let parsed;try{parsed=kind.fromXDR(value,'base64');}catch{throw Error('LEDGER_XDR_INVALID');}need(parsed.toXDR('base64')===value,'LEDGER_XDR_NONCANONICAL');return parsed;}
export function decodeSuccessfulEnvelope(envelopeXdr,resultXdr,transactionHash){
 need(typeof transactionHash==='string'&&/^[a-f0-9]{64}$/.test(transactionHash),'LEDGER_HASH_INVALID');
 canonical(envelopeXdr,xdr.TransactionEnvelope,65536);
 const envelope=TransactionBuilder.fromXDR(envelopeXdr,Networks.TESTNET),outerResult=canonical(resultXdr,xdr.TransactionResult,16384);
 need(envelope.hash().toString('hex')===transactionHash,'LEDGER_HASH_MISMATCH');
 const feeBump=envelope instanceof FeeBumpTransaction,transaction=feeBump?envelope.innerTransaction:envelope;
 const charged=outerResult.feeCharged().toBigInt();need(charged>=0n&&charged<=BigInt(envelope.fee),'LEDGER_FEE_INVALID');
 let executionResult=outerResult;
 if(feeBump){
  need(outerResult.result().switch().name==='txFeeBumpInnerSuccess','LEDGER_OUTER_RESULT_INVALID');
  const pair=outerResult.result().innerResultPair();
  need(pair.transactionHash().toString('hex')===transaction.hash().toString('hex'),'LEDGER_INNER_HASH_MISMATCH');
  executionResult=pair.result();
  need(executionResult.feeCharged().toBigInt()===0n,'LEDGER_INNER_FEE_INVALID');
 }
 need(executionResult.result().switch().name==='txSuccess','LEDGER_INNER_RESULT_INVALID');
 return {envelope,transaction,outerResult,executionResult,feeBump,feeSource:feeBump?envelope.feeSource:transaction.source};
}
export function assertEnvelopeFeePolicy(decoded,{payer,maximumFeeStroops,feeBump}={}){
 need(StrKey.isValidEd25519PublicKey(payer??'')&&typeof maximumFeeStroops==='string'&&/^[1-9][0-9]{0,18}$/.test(maximumFeeStroops),'FEE_CAP_REQUIRED');
 const {envelope,transaction,outerResult,feeSource}=decoded,cap=BigInt(maximumFeeStroops);
 need(transaction.source!==payer&&feeSource!==payer,'BUYER_FEE_DEBIT_BLOCKED');
 need(BigInt(envelope.fee)<=cap&&BigInt(transaction.fee)<=cap&&outerResult.feeCharged().toBigInt()<=cap,'LEDGER_FEE_CAP_EXCEEDED');
 if(decoded.feeBump){need(feeBump&&Object.keys(feeBump).sort().join(',')==='source,sponsor'&&StrKey.isValidEd25519PublicKey(feeBump.source??'')&&StrKey.isValidEd25519PublicKey(feeBump.sponsor??'')&&transaction.source===feeBump.source&&feeSource===feeBump.sponsor,'LEDGER_SPONSOR_NOT_PINNED');}
 return true;
}
