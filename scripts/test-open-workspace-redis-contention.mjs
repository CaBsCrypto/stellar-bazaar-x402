import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Redis } from '@upstash/redis';
import { createRedisWorkspaceStore, setWorkspaceStoreForTests, READ_WORKSPACE_LUA, COMMIT_WORKSPACE_LUA } from '../lib/workspace-store.ts';
import { createWorkspaceHandlers } from '../lib/workspace-http.ts';

const previous={...process.env},realFetch=globalThis.fetch;
for(const key of Object.keys(process.env))if(/BAZAAR|UPSTASH|KV_REST|VERCEL/.test(key))delete process.env[key];
process.env.NODE_ENV='test';process.env.BAZAAR_ENABLE_OPEN_WORKSPACES='true';
const hash=v=>createHash('sha256').update(v).digest('hex'),token=()=>randomBytes(32).toString('base64url');
const fixture=()=>{const bootstrap=token();return{bootstrap,body:{creationId:randomUUID(),humanAccessHash:hash(token()),agentAccessHash:hash(token())}};};
const registryKey='bazaar-workspace:local-test:{local-test}:registry',data=new Map();
let calls=[],commits=0,cas0=0,serverErrors=0,mode='normal',creationGates,quotaGate,beforeCommit;
function gate(size){let seen=0,release;const ready=new Promise(r=>release=r);return async()=>{if(seen>=size)return;seen++;if(seen===size)release();await ready;};}
function creationBarrier(){creationGates={initial:gate(6),transaction:gate(6)};}
function registry(){return JSON.parse(data.get(registryKey));}
function requestCount(ownerId){return registry().requestWindows.find(w=>w.ownerId===ownerId)?.count??0;}
const server=createServer(async(req,res)=>{
  try{
    let text='';for await(const part of req)text+=part;
    const command=JSON.parse(text);assert.equal(command[0].toUpperCase(),'EVAL');assert.equal(Number(command[2]),3);
    const script=command[1],keys=command.slice(3,6),args=command.slice(6);
    assert.ok(keys.every(k=>k.startsWith('bazaar-workspace:local-test:{local-test}:')));assert.ok(!/EXPIRE|SETEX/.test(script));
    let result;
    if(script===READ_WORKSPACE_LUA){
      calls.push('read');result=keys.map(k=>data.get(k)??'');
      if(creationGates)await(keys[1].endsWith(':owner:none')?creationGates.initial:creationGates.transaction)();
      if(quotaGate)await quotaGate();
    }else{
      assert.equal(script,COMMIT_WORKSPACE_LUA);calls.push('commit');
      if(beforeCommit){const hook=beforeCommit;beforeCommit=undefined;await hook();}
      if(mode==='reject'||keys.some((k,i)=>(data.get(k)??'')!==args[i])){result=0;cas0++;}
      else if(mode==='unknown'){result=2;}
      else{data.set(keys[0],args[3]);if(args[4])data.set(keys[1],args[4]);data.set(keys[2],'workspace-v1');commits++;result=1;if(mode==='lost-ack'){mode='normal';res.destroy();return;}}
    }
    res.setHeader('content-type','application/json');res.end(JSON.stringify({result}));
  }catch{serverErrors++;res.statusCode=500;res.end('{}');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(url.origin,base,'Only the synthetic loopback REST server is permitted');return realFetch(input,init);};
const store=createRedisWorkspaceStore(new Redis({url:base,token:'synthetic',automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false}),undefined,()=>({ownerIds:[],hashes:[]}));
try{
  creationBarrier();const first=fixture();
  const created=await Promise.all(Array.from({length:6},()=>store.createWorkspace(first.body,hash(first.bootstrap))));
  creationGates=undefined;assert.equal(created.filter(r=>r.created).length,1);assert.equal(new Set(created.map(r=>r.record.ownerId)).size,1);
  assert.equal(commits,1);assert.equal(cas0,5);assert.equal(registry().workspaces.length,1);const owner=created[0].record;

  quotaGate=gate(6);const beforeQuota=commits,beforeQuotaCas=cas0;
  await Promise.all(Array.from({length:6},()=>store.consumeRequest(owner.ownerId,1)));
  quotaGate=undefined;assert.equal(commits-beforeQuota,6);assert.ok(cas0>beforeQuotaCas);assert.equal(requestCount(owner.ownerId),6);

  // Native handlers include quota consumption after the creation receipt.
  setWorkspaceStoreForTests(store);process.env.BAZAAR_WORKSPACE_BACKEND='file';process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN=base;
  const handlers=createWorkspaceHandlers(),second=fixture();creationBarrier();
  const native=await Promise.all(Array.from({length:6},()=>handlers.POST(new Request(base+'/api/workspaces',{method:'POST',headers:{authorization:'Bearer '+second.bootstrap,'content-type':'application/json',origin:base},body:JSON.stringify(second.body)}))));
  creationGates=undefined;assert.deepEqual(native.map(r=>r.status).sort(),[200,200,200,200,200,201]);
  const records=await Promise.all(native.map(async r=>(await r.json()).record));assert.equal(new Set(records.map(r=>r.ownerId)).size,1);assert.equal(requestCount(records[0].ownerId),6);setWorkspaceStoreForTests(undefined);

  calls=[];let before=commits;const uncertain=fixture();mode='lost-ack';
  await assert.rejects(()=>store.createWorkspace(uncertain.body,hash(uncertain.bootstrap)),{code:'WORKSPACE_UNAVAILABLE'});
  assert.deepEqual(calls,['read','read','commit']);assert.equal(commits,before+1);
  const recovered=await store.createWorkspace(uncertain.body,hash(uncertain.bootstrap));assert.equal(recovered.created,false);assert.equal(commits,before+1);

  calls=[];before=commits;const beforeCount=requestCount(owner.ownerId);mode='lost-ack';
  await assert.rejects(()=>store.consumeRequest(owner.ownerId,1),{code:'WORKSPACE_UNAVAILABLE'});
  assert.deepEqual(calls,['read','commit']);assert.equal(commits,before+1);assert.equal(requestCount(owner.ownerId),beforeCount+1);

  calls=[];before=commits;const unchanged=data.get(registryKey);mode='reject';
  await assert.rejects(()=>store.consumeRequest(owner.ownerId,1),{code:'WORKSPACE_UNAVAILABLE'});
  assert.deepEqual(calls,Array.from({length:8},()=>['read','commit']).flat());assert.equal(commits,before);assert.equal(data.get(registryKey),unchanged);
  calls=[];const notCommitted=fixture();await assert.rejects(()=>store.createWorkspace(notCommitted.body,hash(notCommitted.bootstrap)),{code:'WORKSPACE_UNAVAILABLE'});
  assert.deepEqual(calls,['read','read','commit','read']);assert.equal(commits,before);assert.equal(data.get(registryKey),unchanged);

  calls=[];mode='unknown';await assert.rejects(()=>store.consumeRequest(owner.ownerId,1),{code:'WORKSPACE_UNAVAILABLE'});
  assert.deepEqual(calls,['read','commit']);assert.equal(commits,before);mode='normal';
  await assert.rejects(()=>store.createWorkspace(first.body,hash(token())),{code:'UNAUTHORIZED'});
  await assert.rejects(()=>store.createWorkspace({...first.body,humanAccessHash:hash(token())},hash(first.bootstrap)),{code:'WORKSPACE_CONFLICT'});assert.equal(commits,before);

  // CAS0 reconciliation must authenticate before accepting a different body.
  creationBarrier();const altered=fixture(),beforeAltered=commits;
  const alteredRace=await Promise.allSettled(Array.from({length:6},()=>store.createWorkspace({...altered.body,humanAccessHash:hash(token())},hash(altered.bootstrap))));
  creationGates=undefined;assert.equal(alteredRace.filter(r=>r.status==='fulfilled'&&r.value.created).length,1);
  assert.equal(alteredRace.filter(r=>r.status==='rejected').length,5);
  assert.ok(alteredRace.filter(r=>r.status==='rejected').every(r=>r.reason.code==='WORKSPACE_CONFLICT'));assert.equal(commits,beforeAltered+1);
  creationBarrier();const unauthorized=fixture(),beforeUnauthorized=commits;
  const unauthorizedRace=await Promise.allSettled(Array.from({length:6},()=>store.createWorkspace(unauthorized.body,hash(token()))));
  creationGates=undefined;assert.equal(unauthorizedRace.filter(r=>r.status==='fulfilled'&&r.value.created).length,1);
  assert.equal(unauthorizedRace.filter(r=>r.status==='rejected').length,5);
  assert.ok(unauthorizedRace.filter(r=>r.status==='rejected').every(r=>r.reason.code==='UNAUTHORIZED'));assert.equal(commits,beforeUnauthorized+1);
  before=commits;

  // A competing rotation between quota read and CAS forces a fresh auth check.
  const beforeRotationCount=requestCount(owner.ownerId);calls=[];
  beforeCommit=()=>store.changeAccess(owner.workspaceId,hash(first.bootstrap),{action:'rotate',role:'human',accessHash:hash(token()),expectedGeneration:1});
  await assert.rejects(()=>store.consumeRequest(owner.ownerId,1),{code:'UNAUTHORIZED'});
  assert.equal(requestCount(owner.ownerId),beforeRotationCount);assert.equal(commits,before+1);
  const capped=registry();capped.requestWindows.find(w=>w.ownerId===owner.ownerId).count=120;data.set(registryKey,JSON.stringify(capped));calls=[];
  await assert.rejects(()=>store.consumeRequest(owner.ownerId,2),{code:'WORKSPACE_RATE_LIMIT'});assert.deepEqual(calls,['read']);assert.equal(commits,before+1);
  assert.equal(serverErrors,0);
  console.log(JSON.stringify({ok:true,node:process.version,redisRestSdk:true,creationBarrierRequests:6,creationCasLosers:5,creationMutations:1,nativeIdenticalRequests:6,nativeStatuses:[200,200,200,200,200,201],quotaBarrierRequests:6,quotaIncrements:6,quotaAttemptsBound:8,casReconciliationNegatives:true,noRetryLostCreateAck:true,noRetryLostQuotaAck:true,noRetryUnknownOutcome:true,unresolvedContention503:true,revalidatesAuthAfterCas0:true,rateLimitPreserved:true,externalRequests:0,realPayments:0}));
}finally{
  setWorkspaceStoreForTests(undefined);globalThis.fetch=realFetch;await new Promise(r=>server.close(r));
  for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
}
