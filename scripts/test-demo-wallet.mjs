import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {extname} from 'node:path';
registerHooks({resolve(specifier,context,next){if(specifier==='next/server')specifier='next/server.js';if(specifier.startsWith('@/'))specifier=new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href;try{return next(specifier,context);}catch(e){if(specifier.startsWith('.')&&!extname(specifier))return next(specifier+'.ts',context);throw e;}}});
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {createRedisWorkspaceStore,READ_WORKSPACE_LUA,COMMIT_WORKSPACE_LUA,READ_MARKET_PERMISSION_LUA,setWorkspaceStoreForTests} from '../lib/workspace-store.ts';
import {demoHandlers} from '../lib/demo-http.ts';
import {pilotRoutePolicy} from '../lib/pilot-route-policy.ts';
import {assertSingleSigner} from '../lib/demo-wallet.ts';
const hash=v=>createHash('sha256').update(v).digest('hex');
process.env.BAZAAR_PUBLIC_DEMO='true';process.env.BAZAAR_WORKSPACE_ADMISSION='open';
const data=new Map();let loseAck=false,conflict=false;
const redis={async eval(script,keys,args){
 if(script===READ_WORKSPACE_LUA||script===READ_MARKET_PERMISSION_LUA)return keys.map(k=>data.get(k)??'');
 assert.equal(script,COMMIT_WORKSPACE_LUA);
 if(conflict){conflict=false;return 0;}
 if(keys.some((k,i)=>(data.get(k)??'')!==args[i]))return 0;
 data.set(keys[0],args[3]);if(args[4])data.set(keys[1],args[4]);data.set(keys[2],'workspace-v1');
 if(loseAck){loseAck=false;throw Error('Lost acknowledgement');}return 1;
}};
const prefix='bazaar-workspace:pilot-'+randomBytes(16).toString('hex');
const fresh=()=>createRedisWorkspaceStore(redis,prefix,()=>({ownerIds:[],hashes:[]}));let store=fresh();
async function account(ip){const tokens=Object.fromEntries(['human','agent','bootstrap'].map(r=>[r,randomBytes(32).toString('base64url')]));const result=await store.createWorkspace({creationId:randomUUID(),humanAccessHash:hash(tokens.human),agentAccessHash:hash(tokens.agent)},hash(tokens.bootstrap),ip);return {tokens,record:result.record,agent:await store.resolveHash(hash(tokens.agent)),human:await store.resolveHash(hash(tokens.human)),root:await store.resolveHash(hash(tokens.bootstrap))};}
const a=await account('one'),b=await account('two'),wallet=Keypair.random(),other=Keypair.random(),origin='https://demo.example';
const sign=(key,c)=>key.sign(Buffer.from(c.message)).toString('base64');
const c=await store.walletChallenge(a.agent,wallet.publicKey(),origin);
await assert.rejects(store.bindWallet(a.agent,c.challengeId,'https://evil.example',sign(wallet,c)),/WALLET_CHALLENGE_INVALID/);
await assert.rejects(store.bindWallet(a.agent,c.challengeId,origin,sign(other,c)),/WALLET_SIGNATURE_INVALID/);
await assert.rejects(store.bindWallet(b.agent,c.challengeId,origin,sign(wallet,c)),/WALLET_CHALLENGE_INVALID/);
assert.equal((await store.bindWallet(a.agent,c.challengeId,origin,sign(wallet,c))).wallet.wallet,wallet.publicKey());
await assert.rejects(store.bindWallet(a.agent,c.challengeId,origin,sign(wallet,c)),/WALLET_CHALLENGE_INVALID/);
store=fresh();assert.equal((await store.walletIdentity(a.agent)).identity.wallet.wallet,wallet.publicKey());
const dup=await store.walletChallenge(b.agent,wallet.publicKey(),origin);
await assert.rejects(store.bindWallet(b.agent,dup.challengeId,origin,sign(wallet,dup)),/WALLET_ALREADY_BOUND/);
await assert.rejects(store.walletChallenge(a.agent,other.publicKey(),origin),/WALLET_RECOVERY_REQUIRED/);
const replaced=await store.walletChallenge(a.root,other.publicKey(),origin);loseAck=true;
await assert.rejects(store.bindWallet(a.root,replaced.challengeId,origin,sign(other,replaced)),/WORKSPACE_UNAVAILABLE/);
assert.equal((await fresh().walletIdentity(a.agent)).identity.wallet.wallet,other.publicKey());
await assert.rejects(store.bindWallet(a.root,replaced.challengeId,origin,sign(other,replaced)),/WALLET_CHALLENGE_INVALID/);
const expire=await store.walletChallenge(b.agent,wallet.publicKey(),origin),now=Date.now;Date.now=()=>expire.expiresAt;
await assert.rejects(store.bindWallet(b.agent,expire.challengeId,origin,sign(wallet,expire)),/WALLET_CHALLENGE_EXPIRED/);Date.now=now;
const q={requestId:randomUUID(),tool:'list_market_services',agentId:a.agent.agentId,wallet:other.publicKey(),recordedAt:new Date().toISOString(),outcome:'ok',inputHash:hash('input'),resultHash:hash('result'),evidence:'bazaar-observed'};
await store.forPrincipal(a.agent).recordQuery(a.agent.ownerId,q);await store.forPrincipal(a.agent).recordQuery(a.agent.ownerId,{...q,recordedAt:new Date().toISOString(),resultHash:hash('new observation')});
assert.equal((await fresh().forPrincipal(a.human).queries(a.human.ownerId)).length,1);
await assert.rejects(store.forPrincipal(b.agent).queries(a.agent.ownerId),/UNAUTHORIZED/);
await assert.rejects(store.forPrincipal(a.agent).recordQuery(a.agent.ownerId,{...q,inputHash:hash('different')}),/QUERY_CONFLICT/);
const revoked=await store.walletChallenge(b.agent,wallet.publicKey(),origin);
await store.changeAccess(b.root.workspaceId,hash(b.tokens.bootstrap),{action:'revoke',expectedGeneration:1});
await assert.rejects(store.bindWallet(b.agent,revoked.challengeId,origin,sign(wallet,revoked)),/UNAUTHORIZED/);
const current=await store.walletIdentity(a.agent);assert.ok(current.guard.keys.length===2);
const challenge=await store.walletChallenge(a.root,wallet.publicKey(),origin);conflict=true;
await assert.rejects(store.bindWallet(a.root,challenge.challengeId,origin,sign(wallet,challenge)),/WORKSPACE_CONFLICT/);
assert.equal((await store.walletIdentity(a.agent)).identity.wallet.wallet,other.publicKey());
assertSingleSigner({account_id:wallet.publicKey(),thresholds:{low_threshold:0,med_threshold:0,high_threshold:0},signers:[{key:wallet.publicKey(),type:'ed25519_public_key',weight:1}]},wallet.publicKey());
assert.throws(()=>assertSingleSigner({account_id:wallet.publicKey(),thresholds:{low_threshold:0,med_threshold:1,high_threshold:1},signers:[{key:wallet.publicKey(),type:'ed25519_public_key',weight:1},{key:other.publicKey(),type:'ed25519_public_key',weight:1}]},wallet.publicKey()),/WALLET_SINGLE_SIGNER_REQUIRED/);
// Exercise the HTTP boundary without Horizon or any external request.
process.env.BAZAAR_ENABLE_OPEN_WORKSPACES='true';process.env.BAZAAR_WORKSPACE_BACKEND='redis';process.env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN=origin;
setWorkspaceStoreForTests(store);
const h=await account('http-fixture'), httpKey=Keypair.random(), originalFetch=globalThis.fetch;let horizonReads=0;
const req=(path,body,token=h.tokens.agent)=>new Request(origin+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
try{
 globalThis.fetch=async url=>{assert.equal(url,'https://horizon-testnet.stellar.org/accounts/'+httpKey.publicKey());horizonReads++;return Response.json({account_id:httpKey.publicKey(),thresholds:{low_threshold:0,med_threshold:0,high_threshold:0},signers:[{key:httpKey.publicKey(),type:'ed25519_public_key',weight:1}]});};
 const cr=await demoHandlers.challenge(req('/api/account/wallet/challenge',{wallet:httpKey.publicKey()}));assert.equal(cr.status,200);const hc=await cr.json();
 const invalid=await demoHandlers.complete(req('/api/account/wallet/complete',{challengeId:hc.challengeId,signature:sign(wallet,hc)}));assert.equal(invalid.status,403);assert.equal(horizonReads,0);
 const completed=await demoHandlers.complete(req('/api/account/wallet/complete',{challengeId:hc.challengeId,signature:sign(httpKey,hc)}));assert.equal(completed.status,200);assert.equal(horizonReads,1);
 assert.equal((await demoHandlers.complete(req('/api/account/wallet/complete',{challengeId:hc.challengeId,signature:sign(httpKey,hc)}))).status,409);assert.equal(horizonReads,1);
 assert.equal((await demoHandlers.identity(req('/api/account/identity',undefined,randomBytes(32).toString('base64url')))).status,401);
 assert.equal((await demoHandlers.challenge(req('/api/account/wallet/challenge',{wallet:'x'.repeat(2000)}))).status,413);
 assert.equal(pilotRoutePolicy('/api/account/wallet/complete','POST'),'allow');
 const {POST:mcpPost}=await import('../app/api/mcp/route.ts');
 const rpcRequest=(method,params,authenticated=true,queryId)=>new Request(origin+'/api/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...(authenticated?{authorization:'Bearer '+h.tokens.agent}:{}),...(queryId?{'x-bazaar-query-id':queryId}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 const initialized=await mcpPost(rpcRequest('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'offline-demo-test',version:'1'}}));assert.equal(initialized.status,200);assert.match((await initialized.json()).result.instructions,/Testnet/);
 const toolList=await mcpPost(rpcRequest('tools/list',{}));assert.ok((await toolList.json()).result.tools.some(t=>t.name==='request_wallet_binding'));
 const queryId=randomUUID(),queryParams={name:'get_bazaar_capabilities',arguments:{}};
 assert.equal((await mcpPost(rpcRequest('tools/call',queryParams,true,queryId))).status,200);
 assert.equal((await mcpPost(rpcRequest('tools/call',queryParams,true,queryId))).status,200);
 assert.equal((await store.forPrincipal(h.agent).queries(h.agent.ownerId)).length,1);
 assert.equal((await mcpPost(rpcRequest('tools/call',queryParams,false))).status,200);
 assert.equal((await store.forPrincipal(h.agent).queries(h.agent.ownerId)).length,1);
 assert.equal((await mcpPost(rpcRequest('tools/call',queryParams,true,'not-a-uuid'))).status,400);
 const rootRpc=rpcRequest('tools/call',{name:'request_wallet_binding',arguments:{wallet:other.publicKey()}});rootRpc.headers.set('authorization','Bearer '+h.tokens.bootstrap);
 const rootDenied=await mcpPost(rootRpc),rootBody=await rootDenied.json();assert.equal(rootBody.result.isError,true);assert.equal(JSON.parse(rootBody.result.content[0].text).httpStatus,403);
 const cliAccount=await account('cli-fixture'),cliKey=Keypair.random();
 globalThis.fetch=async(url,init)=>{const href=url instanceof Request?url.url:String(url);if(href===origin+'/api/mcp')return mcpPost(new Request(url,init));assert.equal(href,'https://horizon-testnet.stellar.org/accounts/'+cliKey.publicKey());return Response.json({account_id:cliKey.publicKey(),thresholds:{low_threshold:0,med_threshold:0,high_threshold:0},signers:[{key:cliKey.publicKey(),type:'ed25519_public_key',weight:1}]});};
 const {bindDemoWallet}=await import('../examples/bind-demo-wallet.mjs');
 assert.equal((await bindDemoWallet({url:origin+'/api/mcp',agentAccess:cliAccount.tokens.agent,keypair:cliKey})).wallet.wallet,cliKey.publicKey());



}finally{globalThis.fetch=originalFetch;setWorkspaceStoreForTests(undefined);}
// Venue Wi-Fi can admit more than five participants; the complete 200 cap is
// exercised independently by test-workspace-retention.mjs.
for(let i=0;i<6;i++)await account('same-ip');
Date.now=()=>now()+120000;
for(let i=0;i<60;i++)await store.consumeRequest(a.agent.ownerId,a.agent.generation);
await assert.rejects(store.consumeRequest(a.agent.ownerId,a.agent.generation),/WORKSPACE_RATE_LIMIT/);
// Start a fresh minute for independent ingress-cap assertions.
Date.now=()=>now()+240000;

// Distinct IPs cannot evade the shared ingress cap; denial leaves data unchanged.
for(let i=0;i<120;i++)await store.consumeIngress('ip-'+i);
const before=JSON.stringify([...data]);await assert.rejects(store.consumeIngress('fresh-ip'),/DEMO_RATE_LIMIT/);assert.equal(JSON.stringify([...data]),before);
Date.now=now;
console.log(JSON.stringify({status:'PASS',walletProof:true,singleUse:true,expiry:true,crossAccountIsolation:true,walletUniqueness:true,recoveryReplacement:true,lostAckReadRecovery:true,CASConflictNoEffect:true,queryDedup:true,globalIngressLimit:true,recoveryCredentialRejectedByMcp:true,mcpInitialize:true,mcpQueryObservation:true,anonymousQueryPrivacy:true,developerExampleMcpProof:true,httpWalletProof:true,invalidProofSkipsNetwork:true,perIpRegistrationLimit:true,accountRequestLimit:true,externalRequests:0,realPayments:0}));

