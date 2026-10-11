import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createWorkerRedisCommands,createSellerRedisSecretStore} from '../examples/seller-redis-secret-store.mjs';

/** Shared isolated contract; command can be a real Redis REST transport.
 * Caller supplies a fresh test prefix. Only this exact prefix's named keys
 * are written/deleted. No payment or Bazaar order is created.
 */
export async function validateSellerRedisContract(command,{prefix,key=randomBytes(32).toString('base64url'),bindingHash=randomBytes(32).toString('hex')}){
 assert.match(prefix,/^bazaar-seller:preview-[a-f0-9]{32}$/);
 const touched=new Set(),tracked=async values=>{if(values[0]==='EVAL'){const count=Number(values[2]);for(const name of values.slice(3,3+count)){assert.ok(name.startsWith(prefix+':'));touched.add(name);}}else if(['GET','SET','DEL','PTTL'].includes(values[0])){assert.ok(String(values[1]).startsWith(prefix+':'));touched.add(values[1]);}return await command(values);};
 const context={command:tracked,prefix,key,bindingHash};
 const store=createSellerRedisSecretStore(context),other=createSellerRedisSecretStore(context);
 const name='seller.'+randomUUID(),dataKey=prefix+':'+bindingHash+':data:'+name,guardKey=prefix+':'+bindingHash+':guard:'+name;
 const expiry=new Date(Date.now()+60000).toISOString();
 const record={version:1,operationId:name.slice(7),attemptId:randomUUID(),cardHash:'c'.repeat(64),phase:'provider-started',contentExpiresAt:expiry,binding:{input:{topic:'PRIVATE_SYNTHETIC_INPUT'},transactionHash:'d'.repeat(64)}};
 let checks=0,releaseGlobal,releaseOperation;
 try{
  await assert.rejects(store.write('seller.hosted.tick',{version:1}),/LOCK_REQUIRED/);checks++;
  releaseGlobal=await store.acquireLock('seller.hosted');
  await assert.rejects(other.acquireLock('seller.hosted'),/LOCK_BUSY/);checks++;
  await assert.rejects(store.journal(name).initialize(record),/ORDER_LOCK_REQUIRED/);checks++;
  releaseOperation=await store.acquireLock(name);
  await store.journal(name).initialize(record);
  const raw=await tracked(['GET',dataKey]);assert.ok(!raw.includes('PRIVATE_SYNTHETIC_INPUT'));assert.equal((await store.journal(name).read()).phase,'provider-started');checks++;
  const minimal=JSON.parse(await tracked(['GET',guardKey]));assert.equal(minimal.phase,'provider-started');assert.ok(!JSON.stringify(minimal).includes('PRIVATE_SYNTHETIC_INPUT'));checks++;
  await assert.rejects(store.journal(name).initialize(record),/ALREADY_EXISTS/);checks++;
  const ttl=await tracked(['PTTL',dataKey]);assert.ok(ttl>0&&ttl<=60000);checks++;
  await assert.rejects(store.journal(name).append({...record,contentExpiresAt:new Date(Date.now()+120000).toISOString()}),/BINDING_CHANGED/);checks++;
  await assert.rejects(store.journal(name).append({...record,attemptId:randomUUID()}),/BINDING_CHANGED/);checks++;
  await store.journal(name).append({...record,phase:'generated',text:'PRIVATE_SYNTHETIC_RESULT',textHash:'e'.repeat(64)});
  assert.ok(await tracked(['PTTL',dataKey])<=ttl);checks++;
  const wrong=createSellerRedisSecretStore({...context,key:randomBytes(32).toString('base64url')});try{await assert.rejects(wrong.journal(name).read(),/RECORD_UNCONFIRMED/);checks++;}finally{wrong.dispose();}
  // Delete only this synthetic payload to emulate content expiry. The durable
  // no-execution guard survives and forbids a new intent with the same UUID.
  await tracked(['DEL',dataKey]);
  await assert.rejects(store.journal(name).read(),/CONTENT_EXPIRED/);
  await assert.rejects(other.journal(name).read(),/CONTENT_EXPIRED/);checks++;
  const guardAfter=JSON.parse(await tracked(['GET',guardKey]));assert.equal(guardAfter.phase,'generated');assert.ok(!JSON.stringify(guardAfter).includes('PRIVATE_SYNTHETIC_RESULT'));checks++;
  await releaseOperation();releaseOperation=undefined;
  await releaseGlobal();releaseGlobal=undefined;
  await assert.rejects(store.assertLocks(),/LEASE_LOST/);checks++;
  releaseGlobal=await other.acquireLock('seller.hosted');
  await other.write('seller.hosted.tick',{version:1,ticks:1});
  assert.equal((await store.read('seller.hosted.tick')).ticks,1);checks++;
  // A changed lease fences out the stale holder and cannot be removed by it.
  const lockKey=prefix+':'+bindingHash+':lock:seller.hosted';
  await tracked(['SET',lockKey,'NEW_SYNTHETIC_LEASE','PX',90000]);
  await assert.rejects(other.write('seller.hosted.tick',{version:1,ticks:2}),/LEASE_LOST/);checks++;
  await assert.rejects(releaseGlobal(),/LEASE_RELEASE_UNCONFIRMED/);releaseGlobal=undefined;
  assert.equal(await tracked(['GET',lockKey]),'NEW_SYNTHETIC_LEASE');checks++;
  return {status:'PASS',checks,prefixFingerprint:bindingHash,encryptedPayload:true,fixedContentExpiry:true,minimalGuardSurvivesExpiry:true,leaseFencing:true,payments:0,bazaarOrders:0};
 }finally{
  if(releaseOperation)await releaseOperation().catch(()=>{});
  if(releaseGlobal)await releaseGlobal().catch(()=>{});
  store.dispose();other.dispose();
  // All keys were individually observed inside a fresh synthetic prefix.
  for(const name of touched)await command(['DEL',name]);
 }
}

async function offline(){
 let checks=0;
 for(const url of ['http://localhost','https://upstash.io.evil.example','https://example.com','https://test.upstash.io/?token=x']){
  assert.throws(()=>createWorkerRedisCommands({url,token:'x'.repeat(32)}),/CONFIGURATION/);checks++;
 }
 let requests=0;const command=createWorkerRedisCommands({url:'https://synthetic.upstash.io',token:'PRIVATE_SYNTHETIC_TOKEN',fetcher:async(url,init)=>{requests++;assert.equal(url,'https://synthetic.upstash.io');assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).get('authorization'),'Bearer PRIVATE_SYNTHETIC_TOKEN');return Response.json({result:'OK'});}});
 assert.equal(await command(['SET','synthetic','value']),'OK');checks++;
 for(const response of [Response.json({error:'PRIVATE_SYNTHETIC_TOKEN'}),Response.json({}, {status:503})]){
  const broken=createWorkerRedisCommands({url:'https://synthetic.upstash.io',token:'PRIVATE_SYNTHETIC_TOKEN',fetcher:async()=>response});
  await assert.rejects(broken(['GET','synthetic']),error=>error.message==='WORKER_STORAGE_UNAVAILABLE');checks++;
 }
 const valid={command:async()=>null,prefix:'bazaar-seller:preview-'+'a'.repeat(32),key:randomBytes(32).toString('base64url'),bindingHash:'b'.repeat(64)};
 for(const patch of [{prefix:'bazaar-market:production-real'},{key:'x'.repeat(42)},{bindingHash:'bad'},{leaseMs:30000}]){assert.throws(()=>createSellerRedisSecretStore({...valid,...patch}),/CONFIGURATION/);checks++;}
 const store=createSellerRedisSecretStore(valid);await assert.rejects(store.read('../credentials'),/NAME_REQUIRED/);store.dispose();await assert.rejects(store.read('seller.hosted'),/DISPOSED/);checks+=2;
 console.log(JSON.stringify({status:'PASS',checks,httpDoubleRequests:requests,externalRequests:0,realRedisValidated:false,payments:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await offline();
