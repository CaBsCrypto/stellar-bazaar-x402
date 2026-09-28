import assert from 'node:assert/strict';
import { Account, Address, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk';
import { matchesTestnetTransfer } from '../lib/verify-testnet-transfer.ts';
import { TESTNET_ASSETS } from '../lib/payment-options.ts';
const payer=Keypair.random().publicKey(), seller=Keypair.random().publicKey();
for(const asset of ['USDC','XLM']) {
 const atomic=asset==='USDC'?'10000':'100000';
 const tx=new TransactionBuilder(new Account(payer,'0'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeContractFunction({contract:TESTNET_ASSETS[asset],function:'transfer',args:[new Address(payer).toScVal(),new Address(seller).toScVal(),nativeToScVal(BigInt(atomic),{type:'i128'})]})).setTimeout(60).build();
 const record={successful:true,hash:tx.hash().toString('hex'),envelope_xdr:tx.toXDR()};
 const context={receipt:{success:true,transaction:record.hash,network:'stellar:testnet',payer},expected:{network:'stellar:testnet',asset,contract:TESTNET_ASSETS[asset],amount:asset==='USDC'?'0.001':'0.01',destination:seller,scheme:'exact'}};
 assert.ok(matchesTestnetTransfer(record,context,payer));
 for(const change of [{destination:payer},{amount:'0.02'},{contract:'C'+'A'.repeat(55)},{network:'stellar:pubnet'}])assert.equal(matchesTestnetTransfer(record,{...context,expected:{...context.expected,...change}},payer),false);
 assert.equal(matchesTestnetTransfer({...record,successful:false},context,payer),false);
 assert.equal(matchesTestnetTransfer({...record,hash:'a'.repeat(64)},context,payer),false);
}
console.log('PASS receipt evidence matching, unsigned synthetic envelopes only; no transactions');
