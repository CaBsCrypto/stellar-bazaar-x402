import assert from 'node:assert/strict';
import {createMarketX402Rpc} from '../lib/marketplace-x402.ts';
let calls=0;
function response(url,redirected=false){const r=Response.json({jsonrpc:'2.0',id:'market-x402-read',result:{status:'SUCCESS',envelopeXdr:'synthetic-envelope'}});Object.defineProperties(r,{url:{value:url},redirected:{value:redirected}});return r;}
const tx='a'.repeat(64),rpc=createMarketX402Rpc({fetcher:async(url,init)=>{calls++;assert.equal(url,'https://soroban-testnet.stellar.org');assert.equal(init.redirect,'error');return response(new URL(url).href);}});
assert.deepEqual(await rpc.transaction(tx),{status:'SUCCESS',envelopeXdr:'synthetic-envelope'});assert.equal(calls,1);
for(const [url,redirected]of [['https://foreign.example/',false],['https://soroban-testnet.stellar.org/other',false],['https://soroban-testnet.stellar.org/',true]]){const bad=createMarketX402Rpc({fetcher:async()=>response(url,redirected)});await assert.rejects(bad.transaction(tx),e=>e.code==='X402_TRANSPORT_UNCONFIRMED');}
console.log('PASS_RPC_NORMALIZED_URL_4');
