import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {createMarketStore,validateMarketState} from '../lib/marketplace-store.ts';
import {createMarketX402Store} from '../lib/marketplace-x402-store.ts';
import {capacityRedis} from './fixtures/market-capacity-redis.mjs';
import {projectCapacity,capacityReservationKey,MARKET_CAPACITY_BYTES,SETTLEMENT_CAPACITY_BYTES} from '../lib/marketplace-capacity.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {sha,canonical,orderMemo} from '../lib/marketplace-identity.ts';

let tests=0;const check=value=>{assert.ok(value);tests++;};
const prefix='bazaar-market:pilot-'+randomBytes(16).toString('hex'),payer=Keypair.random().publicKey(),destination=Keypair.random().publicKey(),now=new Date().toISOString();
const card={version:'bazaar.service-card/v0',id:'capacity-fixture',name:'Capacity',description:'Offline capacity fixture',kind:'http',url:'https://provider.example',routeTemplate:'/text',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',identity:USDC_TESTNET_PAYMENT_IDENTITY,amount:'0.01',destination,marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Fixture'},tags:['testnet'],delivery:{...syncDeliveryContract(),result:{...syncDeliveryContract().result,contentType:'text/plain'}}};
function order(topic='x'){
 const operationId=randomUUID(),buyerOwnerId='ow_'+'b'.repeat(32),input={topic},cardHash=computeCanonicalServiceCardHash(card);
 return {operationId,buyerOwnerId,sellerOwnerId:'ow_'+'a'.repeat(32),serviceId:card.id,cardHash,card,input,payer,destination,amount:'0.01',settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',inputHash:sha(canonical(input)),memoHash:orderMemo(buyerOwnerId,operationId,cardHash,input),phase:'awaiting-payment',createdAt:now,updatedAt:now};
}
const binding=o=>sha(canonical({operationId:o.operationId,owner:o.buyerOwnerId,protocol:o.paymentProtocol,cardHash:o.cardHash,inputHash:o.inputHash,payer:o.payer,destination:o.destination,amount:o.amount,settlement:o.settlement}));
const challenge=o=>({operationId:o.operationId,buyerOwnerId:o.buyerOwnerId,orderBinding:binding(o),phase:'challenged',createdAt:now,updatedAt:now,challenge:{x402Version:2,resource:{url:'https://market.example/api/market/orders/'+o.operationId+'/x402'},accepts:[{scheme:'exact',network:'stellar:testnet',amount:'100000',asset:USDC_TESTNET_PAYMENT_IDENTITY.sacContract,payTo:destination}]}});
const envelope=state=>JSON.stringify({version:1,revision:randomUUID(),state});
const redis=capacityRedis(),market=createMarketStore(redis,prefix),settlement=createMarketX402Store(redis,prefix),ledgerKey=capacityReservationKey(prefix);
const admitted=order();await market.transact(s=>s.orders.push(admitted));await settlement.transact(s=>s.records.push(challenge(admitted)));
check(!redis.data.has(ledgerKey));
const attemptId=randomUUID();
await settlement.transact(s=>Object.assign(s.records[0],{phase:'verifying',attemptId,payload:{transaction:'signed-offline-fixture'},payloadHash:'a'.repeat(64),authorizationFingerprint:'b'.repeat(64)}));
check(JSON.parse(redis.data.get(ledgerKey)).entries.length===1);
const measure=()=>projectCapacity(redis.data.get(prefix+':state')??null,redis.data.get(prefix+':x402-settlements:state')??null,redis.data.get(ledgerKey)??null);
check(measure().marketRemaining>30000&&measure().settlementRemaining>0);

// More than the old lifetime cap survives. Then byte pressure rejects new records,
// preserving the admitted payment's future completion space in both stores.
await market.transact(s=>{for(let i=0;i<105;i++)s.orders.push(order());});
check((await market.transact(s=>s.orders.length))===106);
let rejected=false,extra=0,capacityCode;
while(!rejected){try{await market.transact(s=>s.orders.push(order('x'.repeat(2000))));extra++;}catch(e){assert.ok(['MARKET_CAPACITY','PAYMENT_RECOVERY_CAPACITY'].includes(e.code));capacityCode=e.code;rejected=true;}}
check(extra>0);
const reserved=measure();check(reserved.marketUsed<MARKET_CAPACITY_BYTES&&reserved.marketUsed+reserved.marketRemaining<=MARKET_CAPACITY_BYTES);
const bytesBefore=redis.data.get(prefix+':state');
await assert.rejects(()=>market.transact(s=>s.orders.push(order('x'.repeat(2000)))),e=>e.code===capacityCode);tests++;
assert.equal(redis.data.get(prefix+':state'),bytesBefore);tests++;

await settlement.transact(s=>{s.records[0].phase='settling';});
await settlement.transact(s=>Object.assign(s.records[0],{phase:'confirmed',transactionHash:'c'.repeat(64),responseHash:'d'.repeat(64),outcome:{success:true,network:'stellar:testnet',payer,transaction:'c'.repeat(64)}}));
const readAgain=createMarketStore(redis,prefix),privateAgain=createMarketX402Store(redis,prefix);
await readAgain.transact(s=>{const o=s.orders[0];Object.assign(o,{phase:'executing',settlementAttemptId:attemptId,transactionHash:'c'.repeat(64),paymentVerifiedAt:now,attemptId:randomUUID(),agentId:'agent_'+'f'.repeat(32)});});
await readAgain.transact(s=>{s.paused=true;s.orders[0].phase='execution-uncertain';s.orders[0].executionUncertainty='\u0000'.repeat(2000);});
check(JSON.parse(redis.data.get(ledgerKey)).entries.length===1);
await readAgain.transact(s=>{const o=s.orders[0],text='\u0000'.repeat(2000);o.phase='delivered';o.failure=text;o.delivery={text,sha256:sha(text),recordedAt:now,reference:'bazaar-order:'+o.operationId};});
check(JSON.parse(redis.data.get(ledgerKey)).entries.length===0);
check((await privateAgain.transact(s=>s.records[0])).phase==='confirmed');
check((await createMarketStore(redis,prefix).transact(s=>s.orders[0])).delivery.text.length===2000);
validateMarketState(await readAgain.transact(s=>s));tests++;

// Atomic snapshots include both documents and generation-bound permission keys.
const tinyPrefix='bazaar-market:pilot-'+randomBytes(16).toString('hex'),tiny=capacityRedis(),m=createMarketStore(tiny,tinyPrefix),x=createMarketX402Store(tiny,tinyPrefix),o=order();
await m.transact(s=>s.orders.push(o));await x.transact(s=>s.records.push(challenge(o)));
let arrived=0,release;const barrier=new Promise(resolve=>release=resolve);
const racing=capacityRedis({data:tiny.data,beforeEval:async()=>{if(++arrived===2)release();await barrier;}});
const races=await Promise.allSettled([createMarketStore(racing,tinyPrefix).transact(s=>s.operatorQuota={minute:1,count:1}),createMarketX402Store(racing,tinyPrefix).transact(s=>Object.assign(s.records[0],{phase:'verifying',attemptId:randomUUID(),payload:{transaction:'signed'},payloadHash:'a'.repeat(64),authorizationFingerprint:'b'.repeat(64)}))]);
check(races.filter(r=>r.status==='fulfilled').length===1);
check(races.find(r=>r.status==='rejected').reason.code==='CAPACITY_WRITE_UNCONFIRMED');
let changed=false;const guarded=capacityRedis({data:tiny.data,beforeEval:()=>{if(!changed){changed=true;tiny.data.set('permission-key','revoked');}}});
tiny.data.set('permission-key','allowed');const unchanged=tiny.data.get(tinyPrefix+':state');
await assert.rejects(()=>createMarketStore(guarded,tinyPrefix).transact(s=>s.paused=true,{keys:['permission-key'],values:['allowed']}),e=>e.code==='CAPACITY_WRITE_UNCONFIRMED');tests++;
assert.equal(tiny.data.get(tinyPrefix+':state'),unchanged);tests++;

// A lost acknowledgement retains the durable reservation; explicit reconstruction
// reads the same attempt and cannot silently free it.
const ackPrefix='bazaar-market:pilot-'+randomBytes(16).toString('hex'),ack=capacityRedis(),am=createMarketStore(ack,ackPrefix),ax=createMarketX402Store(ack,ackPrefix),ao=order();
await am.transact(s=>s.orders.push(ao));await ax.transact(s=>s.records.push(challenge(ao)));
const broken=capacityRedis({data:ack.data,afterWrite(){throw Error('lost acknowledgement');}});
await assert.rejects(()=>createMarketX402Store(broken,ackPrefix).transact(s=>Object.assign(s.records[0],{phase:'verifying',attemptId:randomUUID(),payload:{transaction:'signed'},payloadHash:'a'.repeat(64),authorizationFingerprint:'b'.repeat(64)})));tests++;
check(JSON.parse(ack.data.get(capacityReservationKey(ackPrefix))).entries.length===1);
check((await createMarketX402Store(ack,ackPrefix).transact(s=>s.records[0])).phase==='verifying');
await ax.transact(s=>{s.records[0].phase='uncertain';});
check(JSON.parse(ack.data.get(capacityReservationKey(ackPrefix))).entries.length===1);
await ax.transact(s=>{s.records[0].phase='rejected';});
check(JSON.parse(ack.data.get(capacityReservationKey(ackPrefix))).entries.length===0);

// Settlement growth is reserved too, and corrupt companion state fails closed.
const full=challenge(ao);full.challenge.resource.url='https://provider.example/'+'x'.repeat(SETTLEMENT_CAPACITY_BYTES-900);
ack.data.set(ackPrefix+':x402-settlements:state',envelope({version:1,records:[full]}));
await assert.rejects(()=>ax.transact(s=>Object.assign(s.records[0],{phase:'verifying',attemptId:randomUUID(),payload:{transaction:'x'.repeat(500)},payloadHash:'a'.repeat(64),authorizationFingerprint:'b'.repeat(64)})),e=>e.code==='X402_SETTLEMENT_CAPACITY');tests++;
ack.data.set(ackPrefix+':x402-settlements:state',envelope({version:1,records:[{...challenge(ao),phase:'invented'}]}));
await assert.rejects(()=>am.transact(s=>s.paused=true),e=>e.code==='CAPACITY_STATE_UNAVAILABLE');tests++;
console.log(JSON.stringify({status:'PASS',tests,ordersAboveOldCap:106+extra,networkRequests:0,realRedisLuaVerified:false,checks:['byte pressure preserves paid completion','two-store concurrency CAS','permission revocation race','lost acknowledgement durable recovery','uncertainty retains reservation','terminal release without historical deletion','companion corruption rejected']}));
