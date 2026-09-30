import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Redis } from '@upstash/redis';
import { createRedisWorkspaceStore, createFileWorkspaceStore, configuredWorkspaceStore, setWorkspaceStoreForTests, READ_WORKSPACE_LUA, COMMIT_WORKSPACE_LUA } from '../lib/workspace-store.ts';
import { WORKSPACE_LIMITS } from '../lib/workspace-types.ts';
import { createWorkspaceHandlers } from '../lib/workspace-http.ts';
import { requireWorkspacePrincipal } from '../lib/workspace-auth.ts';
import { createHistoryHandlers } from '../lib/operation-history-http.ts';
import { createActivityHandlers } from '../lib/activity-http.ts';
import { createDeliverableHandlers } from '../lib/deliverable-http.ts';
const hash = value => createHash('sha256').update(value).digest('hex');
const credentials = () => Object.fromEntries(['bootstrap','human','agent'].map(role => [role, randomBytes(32).toString('base64url')]));
const body = c => ({ creationId: randomUUID(), humanAccessHash: hash(c.human), agentAccessHash: hash(c.agent) });
const request = (path, token, value, extra = {}) => new Request('http://127.0.0.1:43210'+path, { method: value === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer '+token, ...(value === undefined ? {} : { 'content-type':'application/json' }), ...extra }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
const dir = await mkdtemp(join(tmpdir(), 'bazaar-workspace-core-'));
const previous = { ...process.env };
const isolatedEnv = Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP'].filter(k => process.env[k]).map(k => [k,process.env[k]]));
let children = [], server;
try {
  for (const key of Object.keys(process.env)) if (/BAZAAR|UPSTASH|KV_REST|VERCEL/.test(key)) delete process.env[key];
  process.env.BAZAAR_ENABLE_OPEN_WORKSPACES='true'; process.env.BAZAAR_WORKSPACE_BACKEND='file'; process.env.BAZAAR_WORKSPACE_FILE_DIRECTORY=dir; process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN='http://127.0.0.1:43210';
  const store = configuredWorkspaceStore(), c=credentials(), input=body(c);
  const http=createWorkspaceHandlers(), history=createHistoryHandlers(), activity=createActivityHandlers(), deliverables=createDeliverableHandlers();
  const created=await http.POST(request('/api/workspaces',c.bootstrap,input)); assert.equal(created.status,201); const receipt=(await created.json()).record;
  assert.match(receipt.ownerId,/^ow_[a-f0-9]{32}$/); assert.match(receipt.agentId,/^agent_[a-f0-9]{32}$/); assert.equal(receipt.generation,1);
  const replay=await http.POST(request('/api/workspaces',c.bootstrap,input)); assert.equal(replay.status,200); assert.deepEqual((await replay.json()).record,receipt);
  assert.equal((await http.POST(request('/api/workspaces',credentials().bootstrap,{...input,humanAccessHash:hash('changed')}))).status,401);
  assert.equal((await http.POST(request('/api/workspaces',c.bootstrap,{...input,humanAccessHash:hash('changed')}))).status,409);
  assert.equal((await http.POST(request('/api/workspaces',c.bootstrap,{...input,ownerId:'legacy'}))).status,400);
  assert.equal((await http.POST(new Request('https://outside.example/api/workspaces',{method:'POST',headers:{authorization:'Bearer '+c.bootstrap,'content-type':'application/json'},body:JSON.stringify(input)}))).status,403);
  const human=await requireWorkspacePrincipal('Bearer '+c.human,'human'), agent=await requireWorkspacePrincipal('Bearer '+c.agent,'agent');
  assert.deepEqual({...human,role:'agent'},agent); await assert.rejects(()=>requireWorkspacePrincipal('Bearer '+c.human,'agent'),{code:'FORBIDDEN'}); await assert.rejects(()=>requireWorkspacePrincipal('Bearer '+c.bootstrap),{code:'FORBIDDEN'});
  const hs=store.forPrincipal(human), as=store.forPrincipal(agent);
  assert.equal((await hs.createConversation(receipt.ownerId,{conversationId:'conversation-a',title:'Synthetic test'})).created,true);
  assert.equal((await hs.sendHumanMessage(receipt.ownerId,{conversationId:'conversation-a',messageId:'human-1',taskId:'task-1',text:'Synthetic request'})).created,true);
  assert.equal((await hs.sendHumanMessage(receipt.ownerId,{conversationId:'conversation-a',messageId:'human-1',taskId:'task-1',text:'Synthetic request'})).created,false);
  await assert.rejects(()=>hs.sendHumanMessage(receipt.ownerId,{conversationId:'conversation-a',messageId:'human-1',taskId:'task-1',text:'Changed'}),{code:'WORKSPACE_CONFLICT'});
  await assert.rejects(()=>hs.claimTask(receipt.ownerId,{taskId:'task-1',attemptId:'a',agentId:receipt.agentId}),{code:'FORBIDDEN'});
  assert.equal((await as.claimTask(receipt.ownerId,{taskId:'task-1',attemptId:'attempt-a',agentId:receipt.agentId})).record.status,'claimed');
  await assert.rejects(()=>as.claimTask(receipt.ownerId,{taskId:'task-1',attemptId:'attempt-b',agentId:receipt.agentId}),{code:'TASK_ALREADY_CLAIMED'});
  const operation={clientOperationId:'operation-1',mode:'mock',service:{id:'fixture',title:'Fixture',provider:'Synthetic provider',url:'http://127.0.0.1:43210/mock'},payment:{status:'not-requested',network:'stellar:testnet',asset:'USDC',amountAtomic:'0',recipient:'G'+'A'.repeat(55)},delivery:{status:'reported-delivered',result:{synthetic:true}}};
  assert.equal((await history.POST(request('/api/operations',c.human,operation))).status,403);
  assert.equal((await history.POST(request('/api/operations',c.bootstrap,operation))).status,403);
  assert.equal((await history.POST(request('/api/operations',c.agent,operation))).status,201);
  assert.equal((await history.POST(request('/api/operations',c.agent,{...operation,agentId:'spoofed'}))).status,403);
  const own=await history.GET(request('/api/operations',c.human)); assert.equal(own.status,200); assert.equal((await own.json()).records[0].agentId,receipt.agentId);
  assert.equal((await history.POST(request('/api/operations',c.agent,{...operation,clientOperationId:'paid',mode:'testnet',service:{...operation.service,url:'https://synthetic.example/report'}}))).status,403);
  assert.equal((await history.POST(request('/api/operations',c.agent,{...operation,clientOperationId:'upload',delivery:{status:'reported-delivered',artifact:{kind:'file',filename:'synthetic.txt',mediaType:'text/plain',base64:Buffer.from('synthetic').toString('base64')}}}))).status,403);
  assert.equal((await deliverables.upload(request('/api/deliverables/upload',c.agent,{versionId:'fake',fileId:'fake'}))).status,403);
  assert.equal((await activity.POST(request('/api/activity',c.agent,{eventId:'e1',taskId:'task-1',mode:'mock',kind:'task-completed',title:'Synthetic',operationId:'operation-1'}))).status,201);
  assert.equal((await activity.POST(request('/api/activity',c.human,{eventId:'e2',taskId:'task-1',mode:'mock',kind:'task-completed',title:'Synthetic'}))).status,403);
  assert.equal((await as.respondToTask(receipt.ownerId,{taskId:'task-1',attemptId:'attempt-a',messageId:'agent-1',text:'Synthetic response',operationId:'operation-1'})).record.status,'responded');
  assert.equal((await as.respondToTask(receipt.ownerId,{taskId:'task-1',attemptId:'attempt-a',messageId:'agent-1',text:'Synthetic response',operationId:'operation-1'})).created,false);
  const other=credentials(), otherCreated=await http.POST(request('/api/workspaces',other.bootstrap,body(other))); assert.equal(otherCreated.status,201); const otherOwner=(await otherCreated.json()).record.ownerId;
  assert.deepEqual((await (await history.GET(request('/api/operations',other.human))).json()).records,[]); assert.equal((await createFileWorkspaceStore(dir).getConversation(otherOwner,'conversation-a')),null);
  const rotated=randomBytes(32).toString('base64url'); const access=await http.access(request('/api/workspaces/'+receipt.workspaceId+'/access',c.bootstrap,{action:'rotate',role:'human',accessHash:hash(rotated),expectedGeneration:1}),receipt.workspaceId); assert.equal(access.status,200); assert.equal((await access.json()).record.generation,2);
  await assert.rejects(()=>requireWorkspacePrincipal('Bearer '+c.human),{code:'UNAUTHORIZED'}); await assert.rejects(()=>hs.createConversation(receipt.ownerId,{conversationId:'stale',title:'Stale principal'}),{code:'UNAUTHORIZED'});
  assert.equal((await http.access(request('/api/workspaces/'+receipt.workspaceId+'/access',c.bootstrap,{action:'revoke',expectedGeneration:1}),receipt.workspaceId)).status,409);
  const afterRotate=await http.POST(request('/api/workspaces',c.bootstrap,input)); assert.equal(afterRotate.status,200); assert.equal((await afterRotate.json()).record.generation,2);
  assert.equal((await http.access(request('/api/workspaces/'+receipt.workspaceId+'/access',c.bootstrap,{action:'revoke',expectedGeneration:2}),receipt.workspaceId)).status,200);
  const revokeReplay=await http.access(request('/api/workspaces/'+receipt.workspaceId+'/access',c.bootstrap,{action:'revoke',expectedGeneration:2}),receipt.workspaceId);assert.equal(revokeReplay.status,200);assert.equal((await revokeReplay.json()).created,false);
  await assert.rejects(()=>requireWorkspacePrincipal('Bearer '+rotated),{code:'UNAUTHORIZED'}); await assert.rejects(()=>requireWorkspacePrincipal('Bearer '+c.agent),{code:'UNAUTHORIZED'});
  const tombstone=await http.POST(request('/api/workspaces',c.bootstrap,input)); assert.equal(tombstone.status,200); assert.equal((await tombstone.json()).record.revoked,true);
  const persisted=await readFile(join(dir,'local-test','registry.json'),'utf8'); for(const token of [...Object.values(c),rotated]) assert.equal(persisted.includes(token),false);
  process.env.BAZAAR_HISTORY_ACCOUNTS_JSON=JSON.stringify([{ownerId:'legacy',readTokenHash:hash('l'.repeat(43)),writeTokenHash:hash('w'.repeat(43))}]);
  const collision=await http.POST(request('/api/workspaces',credentials().bootstrap,{...body(credentials()),humanAccessHash:hash('l'.repeat(43))})); assert.equal(collision.status,409); delete process.env.BAZAAR_HISTORY_ACCOUNTS_JSON;
  const registryPath=join(dir,'local-test','registry.json'); await writeFile(registryPath,'{bad'); assert.equal((await http.POST(request('/api/workspaces',c.bootstrap,input))).status,503); await writeFile(registryPath,persisted);
  const documentPath=join(dir,'local-test','owner-'+otherOwner+'.json'); const validDocument=await readFile(documentPath,'utf8'); await writeFile(documentPath,'{bad'); assert.equal((await history.GET(request('/api/operations',other.human))).status,503); await writeFile(documentPath,validDocument);
  await writeFile(join(dir,'local-test','pending.json'),'{}'); assert.equal((await history.GET(request('/api/operations',other.human))).status,503); await rm(join(dir,'local-test','pending.json'));
  process.env.VERCEL='1'; assert.throws(()=>configuredWorkspaceStore(),{code:'WORKSPACE_UNAVAILABLE'}); delete process.env.VERCEL;
  process.env.BAZAAR_WORKSPACE_BACKEND='redis'; delete process.env.BAZAAR_WORKSPACE_REDIS_REST_URL; delete process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN; process.env.UPSTASH_REDIS_REST_URL='https://unused.invalid'; process.env.UPSTASH_REDIS_REST_TOKEN='unused'; assert.throws(()=>configuredWorkspaceStore(),{code:'WORKSPACE_UNAVAILABLE'});
  delete process.env.BAZAAR_ENABLE_OPEN_WORKSPACES; assert.throws(()=>configuredWorkspaceStore(),{code:'WORKSPACES_DISABLED'}); process.env.BAZAAR_ENABLE_OPEN_WORKSPACES='true';

  // A loopback Redis REST protocol double verifies command encoding, namespaces and CAS.
  const data=new Map(); let loseAck=false, commits=0;
  server=createServer(async(req,res)=>{try { let text=''; for await(const chunk of req) text+=chunk; const command=JSON.parse(text); assert.equal(command[0].toUpperCase(),'EVAL'); const script=command[1], count=Number(command[2]), keys=command.slice(3,3+count), args=command.slice(3+count); assert.equal(count,3); assert.ok(keys.every(k=>k.startsWith('bazaar-workspace:local-test:{local-test}:'))); assert.ok(!/EXPIRE|SETEX/.test(script)); let result; if(script===READ_WORKSPACE_LUA) result=keys.map(k=>data.get(k)??''); else {assert.equal(script,COMMIT_WORKSPACE_LUA); if(keys.some((k,i)=>(data.get(k)??'')!==args[i])) result=0; else {data.set(keys[0],args[3]);if(args[4])data.set(keys[1],args[4]);data.set(keys[2],'workspace-v1'); commits++; result=1;if(loseAck){loseAck=false;res.destroy();return;}}}res.setHeader('content-type','application/json');res.end(JSON.stringify({result})); }catch{res.statusCode=500;res.end('{}');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); const redisUrl='http://127.0.0.1:'+server.address().port;
  const redisStore=()=>createRedisWorkspaceStore(new Redis({url:redisUrl,token:'synthetic',automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false}));
  const rc=credentials(), rb=body(rc); const concurrent=await Promise.allSettled(Array.from({length:8},()=>redisStore().createWorkspace(rb,hash(rc.bootstrap)))); const winners=concurrent.filter(v=>v.status==='fulfilled'&&v.value.created); assert.equal(winners.length,1); const rr=winners[0].value.record;
  const recovered=await redisStore().createWorkspace(rb,hash(rc.bootstrap));assert.equal(recovered.created,false);assert.equal(recovered.record.ownerId,rr.ownerId);
  const before=commits;await redisStore().resolveHash(hash(rc.human));assert.equal(commits,before);
  loseAck=true;const uncertain=credentials(), ub=body(uncertain);await assert.rejects(()=>redisStore().createWorkspace(ub,hash(uncertain.bootstrap)),{code:'WORKSPACE_UNAVAILABLE'});assert.equal((await redisStore().createWorkspace(ub,hash(uncertain.bootstrap))).created,false);
  const rotatedRedis=randomBytes(32).toString('base64url'), rotation={action:'rotate',role:'human',accessHash:hash(rotatedRedis),expectedGeneration:1};loseAck=true;const beforeRotation=commits;
  await assert.rejects(()=>redisStore().changeAccess(rr.workspaceId,hash(rc.bootstrap),rotation),{code:'WORKSPACE_UNAVAILABLE'});assert.equal(commits,beforeRotation+1);
  const rotationRecovered=await redisStore().changeAccess(rr.workspaceId,hash(rc.bootstrap),rotation);assert.equal(rotationRecovered.created,false);assert.equal(rotationRecovered.record.generation,2);assert.deepEqual(rotationRecovered.current,{generation:2,revoked:false});
  await assert.rejects(()=>redisStore().changeAccess(rr.workspaceId,hash(rc.bootstrap),{...rotation,accessHash:hash('altered')}),{code:'WORKSPACE_CONFLICT'});await assert.rejects(()=>redisStore().resolveHash(hash(rc.human)),{code:'UNAUTHORIZED'});assert.equal((await redisStore().resolveHash(hash(rotatedRedis))).role,'human');
  const registryKey='bazaar-workspace:local-test:{local-test}:registry', savedRegistry=data.get(registryKey);data.delete(registryKey);await assert.rejects(()=>redisStore().resolveHash(hash(rc.human)),{code:'WORKSPACE_UNAVAILABLE'});data.set(registryKey,savedRegistry);
  await new Promise(r=>server.close(r));server=undefined;

  // Two HTTP processes use the same file directory; no process-local storage injection.
  const shared=join(dir,'processes'); const urlFor=p=>new URL('../lib/'+p,import.meta.url).href;
  const childSource=`import {createServer} from 'node:http'; import {createWorkspaceHandlers} from ${JSON.stringify(urlFor('workspace-http.ts'))}; import {createHistoryHandlers} from ${JSON.stringify(urlFor('operation-history-http.ts'))}; const workspaces=createWorkspaceHandlers(),history=createHistoryHandlers(); const server=createServer(async(req,res)=>{try{let data='';for await(const part of req)data+=part;const url=process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN+req.url;const r=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:data}: {})});const out=await (req.url==='/api/workspaces'?workspaces.POST(r):req.method==='POST'?history.POST(r):history.GET(r));res.writeHead(out.status,Object.fromEntries(out.headers));res.end(Buffer.from(await out.arrayBuffer()));}catch{res.statusCode=500;res.end('{}');}});server.listen(0,'127.0.0.1',()=>{process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN='http://127.0.0.1:'+server.address().port;console.log(server.address().port);});`;
  async function childServer(){return new Promise((resolveChild,reject)=>{const child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',childSource],{cwd:process.cwd(),env:{...isolatedEnv,NODE_ENV:'test',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'file',BAZAAR_WORKSPACE_FILE_DIRECTORY:shared}});children.push(child);let error='';child.stderr.on('data',v=>error+=v);child.stdout.once('data',v=>resolveChild('http://127.0.0.1:'+Number(v.toString().trim())));child.on('error',reject);child.on('exit',code=>{if(code)reject(Error(error));});});}
  const urls=await Promise.all([childServer(),childServer()]), pc=credentials(), pb=body(pc);
  const invoke=async(index,path,token,value)=>{const response=await fetch(urls[index]+path,{method:value===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,...(value===undefined?{}:{'content-type':'application/json'})},...(value===undefined?{}:{body:JSON.stringify(value)})});return {status:response.status,body:await response.json()};};
  const parallel=await Promise.all(Array.from({length:8},(_,i)=>invoke(i%2,'/api/workspaces',pc.bootstrap,pb)));assert.equal(parallel.filter(r=>r.status===201).length,1);assert.ok(parallel.every(r=>[200,201,409].includes(r.status)));const pr=parallel.find(r=>r.status===201).body.record;
  assert.equal((await invoke(1,'/api/workspaces',pc.bootstrap,pb)).body.record.ownerId,pr.ownerId);
  assert.equal((await invoke(0,'/api/operations',pc.agent,operation)).status,201);const processRead=await invoke(1,'/api/operations',pc.human);assert.equal(processRead.status,200);assert.equal(processRead.body.records.length,1);assert.equal(processRead.body.records[0].agentId,pr.agentId);
  await Promise.all(children.map(child=>new Promise(r=>{child.once('exit',r);child.kill();})));children=[];
  const rebooted=await childServer(); const restartResponse=await fetch(rebooted+'/api/operations',{headers:{authorization:'Bearer '+pc.human}});assert.equal(restartResponse.status,200);assert.equal((await restartResponse.json()).records[0].clientOperationId,'operation-1');
  await Promise.all(children.map(child=>new Promise(r=>{child.once('exit',r);child.kill();})));children=[];

  // Limits stay at the beta defaults. Time advances in this isolated process only.
  const quotaDir=join(dir,'quotas'), quotas=createFileWorkspaceStore(quotaDir), realNow=Date.now; let fakeNow=realNow(); Date.now=()=>fakeNow;
  try {
    let first;
    for(let i=0;i<50;i++){const q=credentials(),result=await quotas.createWorkspace(body(q),hash(q.bootstrap),'one-ip');if(i===0)first=result.record;}
    const q=credentials();await assert.rejects(()=>quotas.createWorkspace(body(q),hash(q.bootstrap),'another-ip'),{code:'WORKSPACE_RATE_LIMIT'});
    fakeNow+=86400000;
    for(let i=0;i<50;i++){const q=credentials();await quotas.createWorkspace(body(q),hash(q.bootstrap),'one-ip');}
    fakeNow+=86400000;const q2=credentials();await assert.rejects(()=>quotas.createWorkspace(body(q2),hash(q2.bootstrap)),{code:'WORKSPACE_CAPACITY'});
    for(let i=0;i<120;i++)await quotas.consumeRequest(first.ownerId,1);
    await assert.rejects(()=>quotas.consumeRequest(first.ownerId,1),{code:'WORKSPACE_RATE_LIMIT'});
    await quotas.createConversation(first.ownerId,{conversationId:'capacity',title:'Capacity'});
    let limited=false;
    for(let i=0;i<100;i++){try{await quotas.sendHumanMessage(first.ownerId,{conversationId:'capacity',messageId:'m'+i,taskId:'t'+i,text:'x'.repeat(2000)});}catch(e){assert.equal(e.code,'WORKSPACE_CAPACITY');limited=true;break;}}
    assert.equal(limited,true);assert.ok(Buffer.byteLength(await readFile(join(quotaDir,'local-test','owner-'+first.ownerId+'.json'),'utf8'))<=WORKSPACE_LIMITS.ownerBytes);
  }finally{Date.now=realNow;}
  console.log(JSON.stringify({ok:true,fileHttpProcesses:3,fileReboot:true,concurrentCreates:8,redisRestProtocolDouble:true,redisConcurrentCreates:8,atomicGeneration:true,rotationTombstones:true,lostAckRecovery:true,corruptionFailsClosed:true,legacyCollision:true,unpaidOnly:true,noExternalUploads:true,noCredentialAliases:true,limitsEnforced:true,limits:WORKSPACE_LIMITS}));
} finally { setWorkspaceStoreForTests(undefined); children.forEach(c=>c.kill()); if(server)await new Promise(r=>server.close(r)); assert.ok(resolve(dir).startsWith(resolve(tmpdir()))); assert.ok(dir.includes('bazaar-workspace-core-')); await rm(dir,{recursive:true,force:true}); for(const key of Object.keys(process.env)) if(!(key in previous))delete process.env[key];Object.assign(process.env,previous); }
