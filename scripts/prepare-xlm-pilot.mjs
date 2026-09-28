/** Read-only preflight. No key loading, signing, faucet or settlement. */
import assert from 'node:assert/strict';
import { Asset, Networks, Address, xdr, rpc } from '@stellar/stellar-sdk';
import { decodePaymentRequiredHeader } from '@x402/core/http';
import { TESTNET_ASSETS, assertPaymentOptions } from '../lib/payment-options.ts';
import { paymentBinding } from '../lib/pilot-payment-store.ts';
const origin=new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3215');
assert.ok(origin.protocol==='http:' && ['127.0.0.1','localhost'].includes(origin.hostname),'LOCAL_PILOT_ONLY');
const response=await fetch(new URL('/api/discovery/resources',origin),{redirect:'error'});
assert.equal(response.status,200);const body=await response.json();const card=body.results.find(c=>c.id==="swap-risk-quote" && c.paymentOptions);assertPaymentOptions(card);assert.equal(card.paymentOptions?.length,2);
const challenge=await fetch(new URL('/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy',origin),{redirect:'error'});assert.equal(challenge.status,402);
const requirements=decodePaymentRequiredHeader(challenge.headers.get('payment-required'));
for(const [symbol,atomic] of [['USDC','10000'],['XLM','100000']]){const option=requirements.accepts.find(o=>o.asset===TESTNET_ASSETS[symbol]);assert.equal(option?.amount,atomic);assert.equal(option?.network,'stellar:testnet');assert.equal(option?.scheme,'exact');assert.equal(option?.payTo,card.paymentOptions.find(o=>o.asset===symbol).destination);}
const contract=Asset.native().contractId(Networks.TESTNET);assert.equal(contract,TESTNET_ASSETS.XLM);
const key=xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:Address.fromString(contract).toScAddress(),key:xdr.ScVal.scvLedgerKeyContractInstance(),durability:xdr.ContractDataDurability.persistent()}));
const ledger=await new rpc.Server('https://soroban-testnet.stellar.org').getLedgerEntries(key);assert.equal(ledger.entries.length,1);
console.log(JSON.stringify({mode:'read-only-preflight',origin:origin.origin,service:card.id,cardHash:paymentBinding(card),options:card.paymentOptions,facilitator:'https://channels.openzeppelin.com/x402/testnet',xlmContractConfirmedAtLedger:ledger.latestLedger,signed:false,payments:0},null,2));
