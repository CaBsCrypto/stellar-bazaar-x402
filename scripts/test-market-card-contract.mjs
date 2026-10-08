import assert from 'node:assert/strict';
import {Keypair} from '@stellar/stellar-sdk';
import {marketAmountAtomic,MAX_MARKET_AMOUNT_ATOMIC} from '../lib/market-price.ts';
import {marketAmountAtomic as portableAmount} from '../examples/market-price.mjs';
import {parseServiceCardShape} from '../lib/service-card-schema.ts';
import {marketCard} from '../lib/marketplace.ts';
import {syncDeliveryContract,deliveryStorage} from '../lib/delivery-contract.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {publicServiceSkills} from '../lib/bazaar-skills.ts';

const card={version:'bazaar.service-card/v0',id:'variable-service',name:'Contract fixture',description:'A synthetic contract fixture for reviewed delivery.',kind:'http',url:'https://provider.example',routeTemplate:'/work',input:[],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',amount:'0.0234567',destination:Keypair.random().publicKey(),identity:USDC_TESTNET_PAYMENT_IDENTITY,marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Fixture'},tags:['testnet'],delivery:{...syncDeliveryContract(),result:{...syncDeliveryContract().result,contentType:'text/plain'}},skill:{version:'1.0.0',title:'Produce a summary',instructions:'Request the reviewed service and recover by operationId.'}};
for(const value of ['0.0000001','0.010','0.0234567','1','922337203685.4775807']){
 assert.equal(marketAmountAtomic(value),portableAmount(value));assert.ok(BigInt(marketAmountAtomic(value))<=MAX_MARKET_AMOUNT_ATOMIC);
 assert.equal(marketCard({...card,payment:{...card.payment,amount:value}}).payment.amount,value);
}
for(const value of ['0','0.0000000','-1','NaN','Infinity','1e3','1.00000001','922337203685.4775808','01',' 1','1.']){
 assert.throws(()=>marketAmountAtomic(value));assert.throws(()=>portableAmount(value));
 assert.equal(parseServiceCardShape({...card,payment:{...card.payment,amount:value}}).ok,false);
}
assert.deepEqual(deliveryStorage(card.delivery),{mode:'text'});
for(const storage of [{mode:'external',maxFiles:10},{mode:'bazaar',maxFiles:10,maxTotalBytes:100_000_000,maxFileBytes:50_000_000}]){
 const media={...card,delivery:{...card.delivery,storage,result:{...card.delivery.result,contentType:'video/mp4'}}};
 assert.deepEqual(marketCard(media).delivery.storage,storage);
 assert.notEqual(computeCanonicalServiceCardHash(media),computeCanonicalServiceCardHash(card));
}
for(const storage of [{mode:'bazaar',maxFiles:11,maxTotalBytes:100,maxFileBytes:100},{mode:'bazaar',maxFiles:1,maxTotalBytes:100_000_001,maxFileBytes:50_000_000},{mode:'bazaar',maxFiles:1,maxTotalBytes:100_000_000,maxFileBytes:50_000_001},{mode:'bazaar',maxFiles:1,maxTotalBytes:10,maxFileBytes:11},{mode:'text',url:'https://other.example'}])assert.equal(parseServiceCardShape({...card,delivery:{...card.delivery,storage}}).ok,false);
assert.throws(()=>marketCard({...card,delivery:{...card.delivery,result:{...card.delivery.result,contentType:'video/mp4'}}}));
const hash=computeCanonicalServiceCardHash(card),changed={...card,skill:{...card.skill,instructions:'Different instructions'}};
assert.notEqual(computeCanonicalServiceCardHash(changed),hash);
assert.deepEqual(publicServiceSkills([{card,cardHash:hash,status:'submitted'},{card,cardHash:hash,status:'withdrawn'}]),[]);
const published=publicServiceSkills([{card,cardHash:hash,status:'activated'}]);
assert.equal(published.length,1);assert.equal(published[0].reading,'free');assert.equal(published[0].cardHash,hash);assert.equal(published[0].version,'1.0.0');
assert.equal(parseServiceCardShape({...card,skill:{...card.skill,instructions:'a'.repeat(8192)}}).ok,true);
for(const instructions of ['a'.repeat(8193),'💰'.repeat(2049)])assert.equal(parseServiceCardShape({...card,skill:{...card.skill,instructions}}).ok,false);
console.log(JSON.stringify({status:'PASS',checks:['exact signed64 integer price boundaries and portable parity','immutable media storage descriptor and bounds','legacy text default','reviewed versioned skill hash and public activation filter','UTF-8 instruction byte limit'],externalRequests:0,payments:0}));
