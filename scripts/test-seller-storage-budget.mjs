import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createSellerRedisSecretStore,initializeSellerStorage,SELLER_STORAGE_READ_LUA,SELLER_STORAGE_WRITE_LUA,SELLER_STORAGE_BUDGET} from '../examples/seller-redis-secret-store.mjs';
const prefix='bazaar-seller:preview-'+'8d'.repeat(16),bindingHash='e'.repeat(64),key=randomBytes(32).toString('base64url'),ledgerKey=prefix+':'+bindingHash+':storage:v1',data=new Map(),expiries=new Map();let clock=Date.now(),writes=0,loseAck=false,calls=0,checks=0;
const current=k=>{if(expiries.has(k)&&expiries.get(k)<=clock){data.delete(k);expiries.delete(k);}return data.get(k)??null;};
function project(raw){if(!raw)return;const ledger=JSON.parse(raw);for(const[id,e]of Object.entries(ledger.entries))if(e.expiresAt&&e.expiresAt<=clock)delete ledger.entries[id];return ledger;}
const total=ledger=>SELLER_STORAGE_BUDGET.leaseBufferBytes+Object.values(ledger.entries).reduce((n,e)=>n+e.bytes,0)+Buffer.byteLength(JSON.stringify(ledger));
const command=async values=>{
 calls++;const [name,...args]=values;if(name==='GET')return current(args[0]);
 if(name==='SET'){if(args.includes('NX')&&current(args[0])!==null)return null;data.set(args[0],String(args[1]));if(args.includes('PX'))expiries.set(args[0],clock+Number(args.at(-1)));writes++;return 'OK';}
 assert.equal(name,'EVAL');const [script,n,...rest]=args,keys=rest.slice(0,n),argv=rest.slice(n);
 if(script.startsWith('-- seller-storage-initialize-v1')){if(current(keys[0]))return 0;for(let i=1;i<keys.length;i++)if(argv[i]==='missing'?current(keys[i])!==null:current(keys[i])!==argv[i].slice(8))return 0;data.set(keys[0],argv[0]);writes++;return 1;}
 if(script===SELLER_STORAGE_READ_LUA){const ledger=project(current(keys[0]));return ledger?[1,10_000_000-total(ledger)]:[-3,0];}
 if(script.includes('local locks=')){
  const locks=Number(argv[0]);for(let i=0;i<locks;i++)if(current(keys[i])!==argv[i+1])return -1;
  const dataKey=keys[locks],guardKey=keys[locks+1],at=locks+1,prior=current(dataKey);
  if(argv[at]==='missing'?prior!==null||current(guardKey)!==null:prior!==argv[at+1])return 0;
  const expiry=Number(argv[at+4]);if(expiry&&expiry<=clock)return -2;let ledger;
  if(script===SELLER_STORAGE_WRITE_LUA){
   ledger=project(current(keys[locks+2]));if(!ledger||ledger.binding!==argv[at+5])return -3;
   const id=argv[at+6],old=ledger.entries[id],expected=prior?Buffer.byteLength(prior)+Buffer.byteLength(dataKey):0;
   if(old?old.bytes!==expected:expected!==0)return -3;ledger.entries[id]={bytes:Buffer.byteLength(argv[at+2])+Buffer.byteLength(dataKey),expiresAt:expiry};
   if(argv[at+3]){const guardId=argv[at+7],oldGuard=ledger.entries[guardId],raw=current(guardKey),expectedGuard=raw?Buffer.byteLength(raw)+Buffer.byteLength(guardKey):0;if(oldGuard?oldGuard.bytes!==expectedGuard:expectedGuard!==0)return -3;ledger.entries[guardId]={bytes:Buffer.byteLength(argv[at+3])+Buffer.byteLength(guardKey),expiresAt:0};}
   if(total(ledger)>10_000_000)return -4;
  }
  data.set(dataKey,argv[at+2]);writes++;if(expiry)expiries.set(dataKey,expiry);if(argv[at+3]){data.set(guardKey,argv[at+3]);writes++;}if(ledger){data.set(keys[locks+2],JSON.stringify(ledger));writes++;}
  if(loseAck){loseAck=false;throw Error('SYNTHETIC_STORAGE_ACK_LOST');}return 1;
 }
 if(script.includes("redis.call('DEL'")){if(current(keys[0])!==argv[0])return 0;data.delete(keys[0]);return 1;}
 assert.ok(script.includes('for i=1,#KEYS'));return keys.every((k,i)=>current(k)===argv[i])?1:0;
};
const context={command,prefix,key,bindingHash,now:()=>clock},legacy=createSellerRedisSecretStore(context),budgeted=()=>createSellerRedisSecretStore({...context,storageBudget:true});
try{
 let release=await legacy.acquireLock('seller.hosted');await legacy.write('seller.hosted.tick',{version:1,ticks:1});await release();
 const native=budgeted();await assert.rejects(native.capacityHeadroom(),/STORAGE_UNINITIALIZED/);checks++;
 await initializeSellerStorage(command,prefix,bindingHash,[{name:'seller.hosted.tick',dataRaw:data.get(prefix+':'+bindingHash+':data:seller.hosted.tick'),guardRaw:null}]);
 const sameLedger=data.get(ledgerKey);await assert.rejects(initializeSellerStorage(command,prefix,bindingHash,[]),/INITIALIZATION_UNCONFIRMED/);assert.equal(data.get(ledgerKey),sameLedger);checks++;
 const beforeWrites=writes,beforeCalls=calls;assert.equal((await native.capacityHeadroom()).admissionReady,true);assert.equal(writes,beforeWrites);assert.equal(calls-beforeCalls,1);checks++;
 release=await native.acquireLock('seller.hosted');await native.write('seller.hosted.tick',{version:1,ticks:2});assert.equal((await native.read('seller.hosted.tick')).ticks,2);checks++;
 const operationId=randomUUID(),name='seller.'+operationId,opRelease=await native.acquireLock(name),record={version:1,operationId,attemptId:randomUUID(),cardHash:'c'.repeat(64),phase:'provider-started',contentExpiresAt:new Date(clock+60000).toISOString(),binding:{input:{topic:'PRIVATE_SYNTHETIC'},transactionHash:'d'.repeat(64)}};
 loseAck=true;await assert.rejects(native.journal(name).initialize(record),/SYNTHETIC_STORAGE_ACK_LOST/);const restarted=budgeted();assert.equal((await restarted.journal(name).read()).operationId,operationId);assert.ok(!data.get(ledgerKey).includes('PRIVATE_SYNTHETIC'));checks++;
 const usedBefore=total(JSON.parse(data.get(ledgerKey)));clock+=60001;const headroom=await restarted.capacityHeadroom();assert.ok(10_000_000-headroom.availableBytes<usedBefore);await assert.rejects(restarted.journal(name).read(),/CONTENT_EXPIRED/);assert.ok(current(prefix+':'+bindingHash+':guard:'+name));checks++;
 clock-=60001;const ledger=JSON.parse(data.get(ledgerKey));ledger.entries['f'.repeat(64)]={bytes:8_850_000,expiresAt:0};data.set(ledgerKey,JSON.stringify(ledger));assert.equal((await restarted.capacityHeadroom()).admissionReady,false);checks++;
 ledger.entries['f'.repeat(64)].bytes=9_000_000;data.set(ledgerKey,JSON.stringify(ledger));const snapshot=data.get(prefix+':'+bindingHash+':data:seller.hosted.tick');await assert.rejects(native.write('seller.hosted.tick',{version:1,ticks:3}),/STORAGE_CAPACITY/);assert.equal(data.get(prefix+':'+bindingHash+':data:seller.hosted.tick'),snapshot);checks++;
 await opRelease();await release();native.dispose();restarted.dispose();
 console.log(JSON.stringify({status:'PASS_LOCAL_SELLER_STORAGE_BUDGET',checks,maximumBytes:10_000_000,leaseBufferBytes:1_000_000,pendingHeadroomBytes:200_000,explicitInventoryBootstrap:true,readonlyHeadroomCommandsIncludingEval:3,nativeWriteAtomicCap:true,encryptedContent:true,expiredContentReleasesQuota:true,permanentAntiReplayGuardsRetained:true,uncertainAcknowledgementRetries:0,externalRequests:0,payments:0,cloudWrites:0}));
}finally{legacy.dispose();}
