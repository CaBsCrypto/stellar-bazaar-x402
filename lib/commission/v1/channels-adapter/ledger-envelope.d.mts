import type {Transaction,FeeBumpTransaction,xdr} from '@stellar/stellar-sdk';
export interface DecodedEnvelope {envelope:Transaction|FeeBumpTransaction;transaction:Transaction;outerResult:xdr.TransactionResult;executionResult:xdr.TransactionResult|xdr.InnerTransactionResult;feeBump:boolean;feeSource:string}
export function decodeSuccessfulEnvelope(envelopeXdr:string,resultXdr:string,transactionHash:string):DecodedEnvelope;
export function assertEnvelopeFeePolicy(decoded:DecodedEnvelope,limits:{payer:string;maximumFeeStroops:string;feeBump?:{source:string;sponsor:string}}):true;
export function pinFeeBumpSources(value?:{source:string;sponsor:string}):Readonly<{source:string;sponsor:string}>|undefined;
