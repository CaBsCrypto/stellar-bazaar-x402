import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {createRedisWorkspaceStore,READ_WORKSPACE_LUA,READ_MARKET_PERMISSION_LUA,COMMIT_WORKSPACE_LUA} from '../lib/workspace-store.ts';
import {WORKSPACE_LIMITS} from '../lib/workspace-types.ts';

const hash=v=>createHash('sha256').update(v).digest('hex');
const realNow=Date.now,previousDemo=process.env.BAZAAR_PUBLIC_DEMO;
let clock=Date.UTC(2026,9,8,12,0,1),conflicts=0,loseAck=false;
Date.now=()=>clock;process.env.BAZAAR_PUBLIC_DEMO='true';
delete process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE;
delete process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY;
process.env.BAZAAR_WORKSPACE_ADMISSION='open';
function fixture(){
 const data=new Map(),prefix='bazaar-workspace:pilot-'+randomBytes(16).toString('hex');
 const redis={async eval(script,keys,args){
  if(script===READ_WORKSPACE_LUA||script===READ_MARKET_PERMISSION_LUA)return keys.map(k=>data.get(k)??'');
  assert.equal(script,COMMIT_WORKSPACE_LUA);
  if(conflicts){conflicts--;return 0;}
  if(keys.some((k,i)=>(data.get(k)??'')!==args[i]))return 0;
  data.set(keys[0],args[3]);if(args[4])data.set(keys[1],args[4]);data.set(keys[2],'workspace-v1');
  if(loseAck){loseAck=false;throw Error('Synthetic lost acknowledgement');}return 1;
 }};
 const fresh=()=>createRedisWorkspaceStore(redis,prefix,()=>({ownerIds:[],hashes:[]}));
 const document=ownerId=>JSON.parse([...data].find(([key])=>key.endsWith(':owner:'+ownerId))[1]);
 const registry=()=>JSON.parse([...data].find(([key])=>key.endsWith(':registry'))[1]);
 async function account(ip='event-wifi'){
  const tokens=Object.fromEntries(['human','agent','bootstrap'].map(role=>[role,randomBytes(32).toString('base64url')]));
  const input={creationId:randomUUID(),humanAccessHash:hash(tokens.human),agentAccessHash:hash(tokens.agent)},store=fresh();
  const created=await store.createWorkspace(input,hash(tokens.bootstrap),ip);
  return {tokens,input,record:created.record,agent:await store.resolveHash(hash(tokens.agent)),human:await store.resolveHash(hash(tokens.human))};
 }
 return {data,fresh,document,registry,account};
}
try{
 const f=fixture(),store=f.fresh(),a=await f.account(),b=await f.account('different');
 const buyer=store.forPrincipal(a.human),agent=store.forPrincipal(a.agent),started=clock;
 const q={requestId:randomUUID(),tool:'list_market_services',agentId:a.agent.agentId,recordedAt:new Date(clock+86400000).toISOString(),outcome:'ok',inputHash:hash('input'),resultHash:hash('result'),evidence:'bazaar-observed'};
 await agent.recordQuery(a.agent.ownerId,q);
 assert.equal((await buyer.queries(a.human.ownerId))[0].recordedAt,new Date(started).toISOString(),'The recording timestamp is server-owned');
 await buyer.createConversation(a.human.ownerId,{conversationId:'expired-conversation',title:'expired private title'});
 await buyer.sendHumanMessage(a.human.ownerId,{conversationId:'expired-conversation',messageId:'expired-message',taskId:'expired-task',text:'expired private prompt'});
 const operation={clientOperationId:'old-operation',mode:'mock',service:{id:'service',title:'expired service title',provider:'synthetic',url:'https://provider.example'},payment:{status:'not-requested',network:'stellar:testnet',asset:'USDC',amountAtomic:'0',recipient:Keypair.random().publicKey()},delivery:{status:'reported-delivered',result:'expired private result'}};
 await agent.operations.append(a.agent.ownerId,operation);
 const activity={eventId:'old-event',taskId:'expired-task',mode:'mock',kind:'search',title:'expired activity',result:'expired event result'};
 await agent.events.append(a.agent.ownerId,activity);
 clock+=6*86400000;
 await agent.recordQuery(a.agent.ownerId,{...q,resultHash:hash('second result')});
 assert.equal((await buyer.queries(a.human.ownerId))[0].recordedAt,new Date(started).toISOString(),'A retry does not extend visibility');
 await buyer.createConversation(a.human.ownerId,{conversationId:'fresh-conversation',title:'fresh title'});
 await buyer.sendHumanMessage(a.human.ownerId,{conversationId:'fresh-conversation',messageId:'fresh-message',taskId:'fresh-task',text:'fresh prompt'});
 await agent.claimTask(a.agent.ownerId,{taskId:'fresh-task',attemptId:'fresh-attempt',agentId:a.agent.agentId});
 await agent.respondToTask(a.agent.ownerId,{taskId:'fresh-task',attemptId:'fresh-attempt',messageId:'fresh-response',text:'fresh response',operationId:'old-operation'});
 await agent.events.append(a.agent.ownerId,{eventId:'fresh-event',taskId:'fresh-task',operationId:'old-operation',mode:'mock',kind:'task-completed',title:'fresh activity'});
 const beforeBytes=f.registry().workspaces.find(m=>m.ownerId===a.agent.ownerId).documentBytes;
 clock=started+WORKSPACE_LIMITS.contentRetentionMs;
 assert.equal((await buyer.queries(a.human.ownerId)).length,0);
 assert.equal((await buyer.operations.all(a.human.ownerId)).length,0);
 assert.deepEqual((await buyer.listConversations(a.human.ownerId)).map(c=>c.conversationId),['fresh-conversation']);
 await assert.rejects(store.forPrincipal(b.human).queries(a.human.ownerId),{code:'UNAUTHORIZED'});
 await assert.rejects(store.forPrincipal(b.human).pruneExpiredContent(a.human.ownerId),{code:'UNAUTHORIZED'});
 await assert.rejects(buyer.pruneExpiredContent(a.human.ownerId,clock+1),{code:'FORBIDDEN'});
 const cleaned=await store.pruneExpiredContent(a.agent.ownerId);assert.ok(cleaned.removed>=6);
 const persisted=f.document(a.agent.ownerId),raw=JSON.stringify(persisted);
 for(const text of ['expired private title','expired private prompt','expired private result','expired event result','expired service title'])assert.ok(!raw.includes(text));
 assert.ok(f.registry().workspaces.find(m=>m.ownerId===a.agent.ownerId).documentBytes<beforeBytes,'Cleanup releases accounted capacity');
 for(const marker of persisted.replayMarkers)assert.deepEqual(Object.keys(marker).sort(),marker.kind==='query'?['digest','id','kind','resultHash']:['digest','id','kind']);
 assert.equal((await store.pruneExpiredContent(a.agent.ownerId)).removed,0,'Cleanup is idempotent');
 await agent.recordQuery(a.agent.ownerId,q);assert.equal((await buyer.queries(a.human.ownerId)).length,0,'An old UUID cannot revive a query');
 await assert.rejects(agent.recordQuery(a.agent.ownerId,{...q,inputHash:hash('different input')}),{code:'QUERY_CONFLICT'});
 await assert.rejects(agent.operations.append(a.agent.ownerId,operation),{code:'WORKSPACE_CONTENT_EXPIRED'});
 await assert.rejects(agent.events.append(a.agent.ownerId,activity),{code:'WORKSPACE_CONTENT_EXPIRED'});
 await assert.rejects(buyer.createConversation(a.human.ownerId,{conversationId:'expired-conversation',title:'expired private title'}),{code:'WORKSPACE_CONTENT_EXPIRED'});
 await assert.rejects(agent.claimTask(a.agent.ownerId,{taskId:'expired-task',attemptId:'attempt',agentId:a.agent.agentId}),{code:'WORKSPACE_CONTENT_EXPIRED'});
 assert.equal((await buyer.listConversations(a.human.ownerId))[0].messages.length,2,'Fresh response references remain valid after its unpaid operation expires');
 assert.equal((await store.walletIdentity(a.agent)).identity.ownerId,a.agent.ownerId,'Retention never removes account identity');
 process.env.BAZAAR_PUBLIC_DEMO='false';
 assert.equal((await buyer.queries(a.human.ownerId)).length,0,'Turning off admission does not reopen expired history');
 await assert.rejects(agent.operations.append(a.agent.ownerId,operation),{code:'WORKSPACE_CONTENT_EXPIRED'});
 process.env.BAZAAR_PUBLIC_DEMO='true';
 await store.changeAccess(b.record.workspaceId,hash(b.tokens.bootstrap),{action:'revoke',expectedGeneration:1});
 await assert.rejects(store.forPrincipal(b.human).pruneExpiredContent(b.human.ownerId),{code:'WORKSPACE_REVOKED'});
 assert.equal((await store.pruneExpiredContent(b.human.ownerId)).removed,0,'Maintenance also visits revoked accounts');
 assert.deepEqual(await buyer.retentionOwnerIds(),[a.human.ownerId]);
 assert.equal((await store.retentionOwnerIds()).length,2);
 // A definite compare failure never releases bytes; a lost acknowledgement is
 // reconciled by reading, without a second mutation.
 clock+=WORKSPACE_LIMITS.contentRetentionMs;conflicts=1;const beforeConflict=JSON.stringify([...f.data]);
 await assert.rejects(store.pruneExpiredContent(a.agent.ownerId),{code:'WORKSPACE_CONFLICT'});assert.equal(JSON.stringify([...f.data]),beforeConflict);
 loseAck=true;await assert.rejects(store.pruneExpiredContent(a.agent.ownerId),{code:'WORKSPACE_UNAVAILABLE'});
 assert.equal((await buyer.listConversations(a.human.ownerId)).length,0);
 assert.equal((await f.fresh().pruneExpiredContent(a.agent.ownerId)).removed,0);
 // Replay records themselves are bounded; once full no new private history is
 // admitted. Deleting content cannot erase the identity needed to deduplicate.
 const capacity=fixture(),cap=await capacity.account();const capAgent=capacity.fresh().forPrincipal(cap.agent);
 let exhausted=false;
 for(let i=0;i<1100;i++){
  try{await capAgent.recordQuery(cap.agent.ownerId,{...q,requestId:randomUUID(),agentId:cap.agent.agentId});}
  catch(e){assert.equal(e.code,'WORKSPACE_CAPACITY');exhausted=true;break;}
 }
 assert.equal(exhausted,true);assert.ok(capacity.registry().workspaces[0].documentBytes<=WORKSPACE_LIMITS.ownerBytes);
 const capacityBeforeCleanup=capacity.registry().workspaces[0].documentBytes;
 clock+=WORKSPACE_LIMITS.contentRetentionMs;
 assert.equal((await capacity.fresh().pruneExpiredContent(cap.agent.ownerId)).removed,100,'Full admission still reserves every marker needed for expiry cleanup');
 assert.ok(capacity.registry().workspaces[0].documentBytes<capacityBeforeCleanup);
 assert.equal((await capAgent.queries(cap.agent.ownerId)).length,0);
 // Simulate 200 guests sharing the same Wi-Fi, spanning two admission minutes.
 const quota=fixture();clock=Date.UTC(2026,9,20,12,0,1);
 for(let i=0;i<200;i++){if(i===100)clock+=60000;await quota.account();}
 const quotaBefore=JSON.stringify([...quota.data]);
 await assert.rejects(quota.account(),e=>{assert.equal(e.code,'WORKSPACE_RATE_LIMIT');assert.equal(e.status,429);assert.ok(e.retryAfter>0);return true;});
 assert.equal(JSON.stringify([...quota.data]),quotaBefore);assert.equal(quota.registry().workspaces.length,200);
 const shared=quota.registry().creationWindows.find(w=>w.key.startsWith('ip:'));assert.equal(shared.count,200);
 clock+=60000;
 const parallel=await Promise.allSettled(Array.from({length:16},()=>quota.fresh().consumeIngress('shared-venue-ip')));
 assert.ok(parallel.some(r=>r.status==='fulfilled'));
 const ingress=quota.registry().creationWindows.find(w=>w.key==='ingress:global:'+Math.floor(clock/60000));
 assert.equal(ingress.count,parallel.filter(r=>r.status==='fulfilled').length,'Concurrent ingress cannot overcount or overshoot');
 for(let i=ingress.count;i<120;i++)await quota.fresh().consumeIngress('shared-venue-ip');
 const blocked=JSON.stringify([...quota.data]);await assert.rejects(quota.fresh().consumeIngress('another-ip'),{code:'DEMO_RATE_LIMIT'});assert.equal(JSON.stringify([...quota.data]),blocked);
 console.log(JSON.stringify({status:'PASS',retentionDays:7,clockControlled:true,serverOwnedQueryTimestamp:true,expiredReplayCannotRevive:true,privateContentPruned:true,atomicByteAccounting:true,accountIdentityPreserved:true,generationGuard:true,scopedMaintenance:true,uncertainAckRecovery:true,replayCapacityBounded:true,eventWifiRegistrations:200,sharedIngressCap:120,concurrentQuotaAtomic:true,externalRequests:0,realPayments:0}));
}finally{Date.now=realNow;if(previousDemo===undefined)delete process.env.BAZAAR_PUBLIC_DEMO;else process.env.BAZAAR_PUBLIC_DEMO=previousDemo;}
