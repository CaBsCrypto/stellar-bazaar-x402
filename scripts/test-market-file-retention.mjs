import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {createMarketStore} from '../lib/marketplace-store.ts';
import {capacityRedis} from './fixtures/market-capacity-redis.mjs';
import {pruneExpiredMarketContent} from '../lib/market-maintenance.ts';
import {reserveMarketFilesInState,marketFileCleanupKeys} from '../lib/market-file-delivery.ts';
import {marketFilesManifestHash,marketContentExpiresAt,MARKET_CONTENT_RETENTION_MS,MARKET_FILE_CLEANUP_GRACE_MS} from '../lib/market-file-delivery-schema.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {sha,canonical,orderMemo} from '../lib/marketplace-identity.ts';

Object.assign(process.env,{BAZAAR_MARKET_FILES_ENABLED:'true',BAZAAR_S3_BUCKET:'offline-fixture',BAZAAR_S3_REGION:'auto',BAZAAR_S3_ENDPOINT:'https://r2-fixture.example',BAZAAR_S3_ACCESS_KEY_ID:'offline-fixture',BAZAAR_S3_SECRET_ACCESS_KEY:'offline-fixture',BAZAAR_MARKET_FILE_PREFIX:'market-deliveries/v1/local/'+randomBytes(16).toString('hex')});
delete process.env.VERCEL_ENV;delete process.env.BAZAAR_ACCEPTANCE_METER;
const originalNow=Date.now;let clock=Date.now();Date.now=()=>clock;
let tests=0;const check=v=>{assert.ok(v);tests++;},buyerOwnerId='ow_'+'b'.repeat(32),sellerOwnerId='ow_'+'a'.repeat(32),destination=Keypair.random().publicKey(),payer=Keypair.random().publicKey();
const card={version:'bazaar.service-card/v0',id:'retention-video',name:'Retention fixture',description:'No network or real payment',kind:'http',url:'https://provider.example',routeTemplate:'/video',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',identity:USDC_TESTNET_PAYMENT_IDENTITY,amount:'0.01',destination,marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Fixture'},tags:['testnet'],delivery:{...syncDeliveryContract(),storage:{mode:'bazaar',maxFiles:2,maxTotalBytes:60000000,maxFileBytes:50000000}}};
function order(expired=true){const operationId=randomUUID(),input={topic:'PRIVATE PROMPT TO BE ERASED'},cardHash=computeCanonicalServiceCardHash(card),createdAt=new Date(clock-(expired?MARKET_CONTENT_RETENTION_MS+1000:0)).toISOString();return {operationId,buyerOwnerId,sellerOwnerId,serviceId:card.id,cardHash,card,input,payer,destination,amount:card.payment.amount,settlement:USDC_TESTNET_PAYMENT_IDENTITY,paymentProtocol:'x402-stellar-exact-v2',inputHash:sha(canonical(input)),memoHash:orderMemo(buyerOwnerId,operationId,cardHash,input),phase:'executing',createdAt,updatedAt:createdAt,settlementAttemptId:randomUUID(),attemptId:randomUUID(),agentId:'agent_'+'a'.repeat(32),transactionHash:'c'.repeat(64),paymentVerifiedAt:createdAt};}
function files(o){const value={mode:'bazaar',attemptId:o.attemptId,versionId:randomUUID(),files:[{id:'video',name:'PRIVATE-FILENAME.mp4',mediaType:'video/mp4',size:64,sha256:'d'.repeat(64)}]};o.fileDelivery={...value,manifestHash:marketFilesManifestHash(value),createdAt:o.createdAt,expiresAt:marketContentExpiresAt(o),files:value.files.map(f=>({...f,status:'pending'}))};}
try{
 const prefix='bazaar-market:pilot-'+randomBytes(16).toString('hex');let failed=true,loseAck=false,deletionAck=false,deletes=0;
 const redis=capacityRedis({afterWrite(){if(loseAck&&deletionAck){loseAck=false;deletionAck=false;throw Error('lost acknowledgement after persisted cleanup');}}}),market=createMarketStore(redis,prefix),storedObjects=new Map();
 const first=order();await market.transact(s=>{reserveMarketFilesInState(first,s);files(first);s.orders.push(first);});const objectKeys=marketFileCleanupKeys(first);storedObjects.set(objectKeys[0],'synthetic-bytes');
 const storage={async removeKey(key){deletes++;if(failed)throw Error('synthetic storage outage');storedObjects.delete(key);deletionAck=true;}};
 const initial=await pruneExpiredMarketContent({redis,prefix,objects:storage,now:clock});
 check(initial.removed.length===1&&initial.incidents.length===1&&initial.cleanupPending===1);
 let state=await market.transact(s=>s);check(state.orders.length===0&&state.archived.length===1&&state.fileCleanup.length===1);
 check(!JSON.stringify(state).includes('PRIVATE PROMPT')&&!JSON.stringify(state).includes('PRIVATE-FILENAME'));
 check(state.archived[0].paymentPhase==='confirmed'&&state.archived[0].transactionHash===first.transactionHash);
 // A corrupted persisted deletion capability must stop before any R2 call.
 const safeRaw=redis.data.get(prefix+':state'),safeDeletes=deletes;
 const secondKey=key=>{const parts=key.split('/');parts[6]=sha('another synthetic file');return parts;};
 const corruptions=[
  entry=>{const parts=entry.objectKeys[0].split('/');parts[4]=sha('another-owner');entry.objectKeys=[parts.join('/')];},
  entry=>{const parts=secondKey(entry.objectKeys[0]);parts[3]='e'.repeat(32);entry.objectKeys.push(parts.join('/'));},
  entry=>{const parts=secondKey(entry.objectKeys[0]);parts[5]='f'.repeat(64);entry.objectKeys.push(parts.join('/'));},
  entry=>entry.objectKeys.push(entry.objectKeys[0]),
 ];
 for(const corrupt of corruptions){
  const invalid=JSON.parse(safeRaw);corrupt(invalid.state.fileCleanup[0]);redis.data.set(prefix+':state',JSON.stringify(invalid));
  await assert.rejects(()=>pruneExpiredMarketContent({redis,prefix,objects:storage,now:clock}));tests++;
  check(deletes===safeDeletes);check(redis.data.get(prefix+':state')===JSON.stringify(invalid));redis.data.set(prefix+':state',safeRaw);
 }
 assert.throws(()=>reserveMarketFilesInState(order(false),state),e=>e.code==='ACCOUNT_FILE_CAPACITY');tests++;
 failed=false;loseAck=true;clock+=1000;
 await assert.rejects(()=>pruneExpiredMarketContent({redis,prefix,objects:storage,now:clock}),/lost acknowledgement/);tests++;
 state=await market.transact(s=>s);check(Boolean(state.fileCleanup[0].firstDeletedAt));check(storedObjects.size===0);
 const before=deletes;clock+=1000;const early=await pruneExpiredMarketContent({redis,prefix,objects:storage,now:clock});check(early.cleanupPending===1&&deletes===before);
 // A request begun before expiry can complete after the first delete; re-delete it.
 storedObjects.set(objectKeys[0],'late synthetic upload');clock+=MARKET_FILE_CLEANUP_GRACE_MS;loseAck=true;
 await assert.rejects(()=>pruneExpiredMarketContent({redis,prefix,objects:storage,now:clock}),/lost acknowledgement/);tests++;
 state=await market.transact(s=>s);check(state.fileCleanup.length===0&&storedObjects.size===0);
 const recovered=await pruneExpiredMarketContent({redis,prefix,objects:storage,now:clock});check(recovered.cleanupPending===0&&recovered.removed.length===0);
 const newOrder=order(false);reserveMarketFilesInState(newOrder,state);check(newOrder.fileReservation.maxBytes===60000000);
 // Definite CAS rejection occurs before any object deletion.
 const racePrefix='bazaar-market:pilot-'+randomBytes(16).toString('hex'),race=capacityRedis(),raceMarket=createMarketStore(race,racePrefix),racingOrder=order();
 await raceMarket.transact(s=>{reserveMarketFilesInState(racingOrder,s);files(racingOrder);s.orders.push(racingOrder);});
 let injected=false,objectCalls=0;const contention=capacityRedis({data:race.data,beforeEval(){if(!injected){injected=true;const raw=JSON.parse(race.data.get(racePrefix+':state'));raw.revision=randomUUID();race.data.set(racePrefix+':state',JSON.stringify(raw));}}});
 await assert.rejects(()=>pruneExpiredMarketContent({redis:contention,prefix:racePrefix,objects:{async removeKey(){objectCalls++;}},now:clock}),e=>e.code==='MAINTENANCE_WRITE_UNCONFIRMED');tests++;
 check(objectCalls===0&&(await raceMarket.transact(s=>s.orders)).length===1);
 // Text expiry needs no R2 configuration, credentials or deletion adapter.
 const textPrefix='bazaar-market:pilot-'+randomBytes(16).toString('hex'),textRedis=capacityRedis(),textMarket=createMarketStore(textRedis,textPrefix),textOrder=order();textOrder.card={...card,delivery:{...card.delivery,storage:{mode:'text'}}};textOrder.cardHash=computeCanonicalServiceCardHash(textOrder.card);textOrder.memoHash=orderMemo(buyerOwnerId,textOrder.operationId,textOrder.cardHash,textOrder.input);
 await textMarket.transact(s=>s.orders.push(textOrder));delete process.env.BAZAAR_MARKET_FILE_PREFIX;delete process.env.BAZAAR_S3_ACCESS_KEY_ID;delete process.env.BAZAAR_S3_SECRET_ACCESS_KEY;
 const textResult=await pruneExpiredMarketContent({redis:textRedis,prefix:textPrefix,now:clock});check(textResult.removed.length===1&&textResult.cleanupPending===0);
 console.log(JSON.stringify({status:'PASS',tests,networkRequests:0,realRedis:false,realR2:false,checks:['expired content erased during object outage','minimal recovery retained','hashed cleanup quota preserved','corrupt buyer/prefix/version/duplicate cleanup keys rejected before deletion','two deletion acknowledgements and grace','late synthetic upload re-deleted','lost acknowledgement recovery','CAS rejection before deletion','text expiry without R2'],lifecycleBackstopRequired:true}));
}finally{Date.now=originalNow;}
