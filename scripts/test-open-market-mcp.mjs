import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRedisWorkspaceStore, setWorkspaceStoreForTests, READ_WORKSPACE_LUA, COMMIT_WORKSPACE_LUA, READ_MARKET_PERMISSION_LUA, COMMIT_MARKET_PERMISSION_LUA } from '../lib/workspace-store.ts';
import { setMarketStoreForTests } from '../lib/marketplace-store.ts';
import { marketHandlers } from '../lib/marketplace-http.ts';
import { submitMarketService, sha, marketCard, marketServiceSnapshot, createMarketOrder } from '../lib/marketplace.ts';
import { requireWorkspacePrincipal } from '../lib/workspace-auth.ts';
import { resetSelfListingStateForTests, recordControlProofResult, recordManualReview, stageApprovedSubmission, beginActivation, finishActivation, getSubmissionForOperator, submitProviderDraft, setReviewStoreForTests, validateReviewState } from '../lib/provider-self-listing.ts';
import { createMemoryReviewStoreForTests } from '../lib/provider-review-store.ts';
import { computeCanonicalServiceCardHash } from '../lib/canonical-service-card.ts';
import { syncDeliveryContract } from '../lib/delivery-contract.ts';
import { USDC_TESTNET_PAYMENT_IDENTITY } from '../lib/payment-assets.ts';
import { marketPage, MARKET_DTO_BYTES } from '../lib/market-pagination.ts';
import { MCP_TOOLS, MCP_WRITES } from '../lib/mcp-tool-contract.ts';
import { orderMemo } from '../lib/marketplace-identity.ts';

// Next handles extensionless TypeScript imports; this local harness provides the same resolution.
registerHooks({ resolve(specifier, context, next) { try { return next(specifier, context); } catch (error) { if (specifier.startsWith('.') && !extname(specifier)) return next(specifier + '.ts', context); throw error; } } });
const { createOnboardingMcpServer } = await import('../lib/mcp-onboarding-server.ts');
const previous = { ...process.env };
const clock = Date.now;
const data = new Map(); let registryReads = 0, reviewReads = 0, permissionCommits = 0, losePermissionAck = false;
const redis = { async eval(script, keys, args) {
  if (script === READ_WORKSPACE_LUA || script === READ_MARKET_PERMISSION_LUA) { registryReads++; return keys.map(key => data.get(key) ?? ''); }
  if (script === COMMIT_WORKSPACE_LUA) { if (keys.some((key, i) => (data.get(key) ?? '') !== args[i])) return 0; data.set(keys[0], args[3]); if (args[4]) data.set(keys[1], args[4]); data.set(keys[2], 'workspace-v1'); return 1; }
  assert.equal(script, COMMIT_MARKET_PERMISSION_LUA);
  if (keys.some((key, i) => (data.get(key) ?? '') !== args[i])) return 0;
  data.set(keys[3], args[4]); permissionCommits++;if(losePermissionAck){losePermissionAck=false;throw Error('Lost permission acknowledgement');}return 1;
} };
const state = { version: 1, services: [], orders: [] };
let beforeCommit;
const market = { async transact(operation, guard) {
  const draft = structuredClone(state), result = operation(draft);
  assert.equal(result instanceof Promise, false);
  if (beforeCommit) { const effect = beforeCommit; beforeCommit = undefined; await effect(); }
  if (guard && guard.keys.some((key, i) => (data.get(key) ?? null) !== guard.values[i])) { const error = Error('guard rejected'); error.code = 'MARKET_GUARD_CONFLICT'; error.status = 409; const { WorkspaceError } = await import('../lib/workspace-types.ts'); throw new WorkspaceError(error.code, error.status); }
  Object.assign(state, draft); return structuredClone(result);
} };
const creds = () => Object.fromEntries(['bootstrap','human','agent'].map(role => [role, randomBytes(32).toString('base64url')]));
const prefix = 'bazaar-workspace:pilot-' + randomBytes(16).toString('hex');
const request = (path, token, body) => new Request('https://market.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'content-type':'application/json' }) }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
const seller = creds(), buyer = creds(), stranger = creds();
let store, human, agent, buyerAgent, outsider, client, server;
const destination = Keypair.random().publicKey();
const cardFor = id => ({ version:'bazaar.service-card/v0',id,name:'Text service '+id,description:'Synthetic seller text service',kind:'http',url:'https://provider.example.com',routeTemplate:'/text',input:[{name:'topic',type:'string',required:true}],network:'stellar:testnet',payment:{scheme:'exact',asset:'USDC',identity:{...USDC_TESTNET_PAYMENT_IDENTITY},amount:'0.01',destination,marketplace:{protocol:'x402-stellar-exact-v2',resourceTemplate:'/api/market/orders/{operationId}/x402'}},provider:{name:'Synthetic seller'},tags:['text','testnet'],delivery:{...syncDeliveryContract(),result:{...syncDeliveryContract().result,contentType:'text/plain'}} });
const submitInput = id => ({ submissionId: randomUUID(),card:cardFor(id),controlProof:{method:'dns-txt',domain:'provider.example.com'} });
const activate = async id => {
  const { value:s } = await getSubmissionForOperator(id, false), hash = computeCanonicalServiceCardHash(s.card);
  assert.equal((await recordControlProofResult(id,{challengeId:s.control.challengeId,domain:s.control.domain,verified:true,source:'dns-txt',observedAt:new Date().toISOString(),challengeHash:sha(s.control.expectedRecord),cardHash:hash})).ok,true);
  assert.equal((await recordManualReview(id,{decision:'approve',reviewerId:'local-fixture',reasons:['Offline fixture']})).ok,true);
  assert.equal((await stageApprovedSubmission(id)).ok,true);
  const intentId = randomUUID(); assert.equal((await beginActivation(id,{intentId,cardHash:hash})).ok,true);
  assert.equal((await finishActivation(id,{intentId,cardHash:hash,entryHash:hash})).ok,true);
};
try {
  for (const key of Object.keys(process.env)) if (/BAZAAR|UPSTASH|KV_REST|VERCEL/.test(key)) delete process.env[key];
  Object.assign(process.env,{BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_PREFIX:prefix,BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'https://market.example',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_X402_MARKETPLACE_ENABLED:'true',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_MARKET_REVIEW_SECRET:randomBytes(32).toString('hex')});
  store = createRedisWorkspaceStore(redis,prefix,()=>({ownerIds:[],hashes:[]})); setWorkspaceStoreForTests(store); setMarketStoreForTests(market);
  for (const c of [seller,buyer,stranger]) await store.createWorkspace({creationId:randomUUID(),humanAccessHash:sha(c.human),agentAccessHash:sha(c.agent)},sha(c.bootstrap));
  human=await requireWorkspacePrincipal('Bearer '+seller.human,'human'); agent=await requireWorkspacePrincipal('Bearer '+seller.agent,'agent'); buyerAgent=await requireWorkspacePrincipal('Bearer '+buyer.agent,'agent'); outsider=await requireWorkspacePrincipal('Bearer '+stranger.agent,'agent');
  const reviews = createMemoryReviewStoreForTests(validateReviewState);
  await setReviewStoreForTests({transact(fn){reviewReads++;return reviews.transact(fn);}});
  assert.equal((await marketHandlers.permissions(request('/api/market/agent-permissions',seller.agent))).status,403);
  assert.equal((await marketHandlers.submit(request('/api/market/services',seller.agent,submitInput('denied')))).status,403);
  assert.equal(state.services.length,0);
  const grant = {changeId:randomUUID(),expectedRevision:0,allowServiceSubmission:true};
  assert.equal((await marketHandlers.permissions(request('/api/market/agent-permissions',seller.agent,grant))).status,403);
  assert.equal((await marketHandlers.permissions(request('/api/market/agent-permissions',seller.human,{...grant,ownerId:human.ownerId}))).status,400);
  assert.equal((await marketHandlers.permissions(request('/api/market/agent-permissions',seller.human,grant))).status,200);
  const replay = await marketHandlers.permissions(request('/api/market/agent-permissions',seller.human,grant)); assert.equal(replay.status,200); assert.equal((await replay.json()).created,false);
  assert.equal((await marketHandlers.permissions(request('/api/market/agent-permissions',seller.human,{...grant,changeId:randomUUID()}))).status,409);
  assert.equal((await marketHandlers.permissions(request('/api/market/agent-permissions',seller.human,{...grant,allowServiceSubmission:false}))).status,409);
  const first=submitInput('active-text-0');first.card.skill={version:'1.0.0',title:'Synthetic reviewed text instructions',instructions:'Call this Testnet service only within your authorized budget.'}; assert.equal((await marketHandlers.submit(request('/api/market/services',seller.agent,first))).status,201);
  const saved = await marketHandlers.submission(request('/api/market/services/'+first.submissionId,seller.agent),first.submissionId); assert.equal(saved.status,200); assert.deepEqual((await saved.json()).submission.card,first.card);
  assert.equal((await marketHandlers.submission(request('/api/market/services/'+first.submissionId,stranger.agent),first.submissionId)).status,404);
  assert.equal((await marketHandlers.catalog(request('/api/market/catalog'))).status,200); assert.equal((await (await marketHandlers.catalog(request('/api/market/catalog'))).json()).services.length,0);
  await activate(first.submissionId);
  for (let i=1;i<24;i++){const input=submitInput('active-text-'+i);await submitMarketService(agent,input);await activate(input.submissionId);}
  assert.equal(state.services.length,24,'No ten-service count cap remains');
  registryReads=reviewReads=0;
  const catalogResponse=await marketHandlers.catalog(request('/api/market/catalog')), catalog=await catalogResponse.json();
  assert.equal(catalogResponse.status,200); assert.equal(catalog.services.length,10); assert.equal(registryReads,1); assert.equal(reviewReads,1); assert.equal(catalogResponse.headers.get('cache-control'),'public, no-store');
  assert.ok(catalog.nextCursor); assert.ok(Buffer.byteLength(JSON.stringify(catalog))<=MARKET_DTO_BYTES);
  for(const service of catalog.services){assert.equal(service.status,'activated');assert.equal(service.cardHash,computeCanonicalServiceCardHash(service.card));assert.equal(service.purchase.protocol,'x402-stellar-exact-v2');assert.equal(service.purchase.orderCreateUrl,'https://market.example/api/market/orders');assert.equal('ownerId' in service,false);assert.equal('control' in service,false);assert.equal('mine' in service,false);}
  const catalog2=await (await marketHandlers.catalog(request('/api/market/catalog?cursor='+catalog.nextCursor))).json();assert.equal(catalog2.services.length,10);assert.equal(new Set([...catalog.services,...catalog2.services].map(s=>s.submissionId)).size,20);
  for(const query of ['?limit=21','?limit=0','?cursor=wrong','?ownerId='+human.ownerId,'?limit=10&limit=20'])assert.equal((await marketHandlers.catalog(request('/api/market/catalog'+query))).status,400);
  const privateList=await (await marketHandlers.services(request('/api/market/services',seller.agent))).json();assert.equal(privateList.mine.length,10);assert.ok(privateList.mineNextCursor);assert.ok(privateList.mine.every(s=>'control' in s));
  const mine2=await (await marketHandlers.services(request('/api/market/services?mineCursor='+privateList.mineNextCursor,seller.agent))).json();assert.equal(new Set([...privateList.mine,...mine2.mine].map(s=>s.submissionId)).size,20);
  // A permission revocation between validation and service commit rejects before durable submission.
  beforeCommit=()=>store.changeMarketPermissions(human,{changeId:randomUUID(),expectedRevision:1,allowServiceSubmission:false});
  const race=submitInput('race-rejected');await assert.rejects(()=>submitMarketService(agent,race),e=>e.code==='MARKET_GUARD_CONFLICT');assert.equal(state.services.some(s=>s.submissionId===race.submissionId),false);
  await store.changeMarketPermissions(human,{changeId:randomUUID(),expectedRevision:2,allowServiceSubmission:true});
  const rotatedHumanToken=randomBytes(32).toString('base64url');const rotate=await store.changeAccess(human.workspaceId,sha(seller.bootstrap),{action:'rotate',role:'human',accessHash:sha(rotatedHumanToken),expectedGeneration:1});assert.equal(rotate.record.generation,2);
  await assert.rejects(()=>submitMarketService(agent,submitInput('stale-generation')),e=>e.code==='UNAUTHORIZED');
  agent=await requireWorkspacePrincipal('Bearer '+seller.agent,'agent');assert.equal((await store.readMarketPermissionSnapshot(agent)).permission.allowServiceSubmission,false);
  await assert.rejects(()=>submitMarketService(agent,submitInput('new-generation-ungranted')),e=>e.code==='MARKET_SUBMISSION_NOT_ALLOWED');
  human=await requireWorkspacePrincipal('Bearer '+rotatedHumanToken,'human');await store.changeMarketPermissions(human,{changeId:randomUUID(),expectedRevision:3,allowServiceSubmission:true});
  for(const amount of ['0.02','1','0.010','0.0000001','922337203685.4775807'])assert.equal(marketCard({...first.card,payment:{...first.card.payment,amount}}).payment.amount,amount);
  for(const amount of ['0','-1','NaN','Infinity','1.00000001','922337203685.4775808','01','1e3'])assert.throws(()=>marketCard({...first.card,payment:{...first.card.payment,amount}}),e=>e.code==='INVALID_SERVICE');
  const purchase={operationId:randomUUID(),serviceId:first.card.id,cardHash:computeCanonicalServiceCardHash(first.card),payer:Keypair.random().publicKey(),input:{topic:'Synthetic'},paymentProtocol:'x402-stellar-exact-v2'};
  assert.equal((await marketHandlers.create(request('/api/market/orders',buyer.agent,purchase))).status,503,'Visible service without a current owner report cannot admit an order');
  const capacityReport={serviceId:purchase.serviceId,cardHash:purchase.cardHash,reportId:randomUUID(),ready:true,day:new Date().toISOString().slice(0,10),usedToday:0,observedAt:new Date().toISOString()};
  assert.equal((await marketHandlers.capacity(request('/api/market/capacity',rotatedHumanToken,capacityReport))).status,403);
  assert.equal((await marketHandlers.capacity(request('/api/market/capacity',seller.agent,capacityReport))).status,200);
  const created=await marketHandlers.create(request('/api/market/orders',buyer.agent,purchase));assert.equal(created.status,201);assert.equal((await created.json()).order.amount,'0.01');
  assert.equal((await marketHandlers.create(request('/api/market/orders',buyer.agent,purchase))).status,201);
  assert.equal((await marketHandlers.read(request('/api/market/orders/'+purchase.operationId,stranger.agent),purchase.operationId)).status,404);
  assert.equal((await marketHandlers.action(request('/api/market/orders/'+purchase.operationId,buyer.agent,{action:'prepare'}),purchase.operationId)).status,409);
  assert.equal((await marketHandlers.create(request('/api/market/orders',buyer.agent,{...purchase,operationId:randomUUID(),paymentProtocol:undefined}))).status,400);
  await assert.rejects(()=>createMarketOrder(buyerAgent,{...purchase,operationId:randomUUID()}),e=>e.code==='SELLER_CAPACITY_EXHAUSTED','A second live seat is rejected');
  // Seed prior synthetic records for the pagination contract. They do not go
  // through new admission and do not bypass the single live seat in production.
  const historical=structuredClone(state.orders[0]);delete historical.sellerReservation;
  await market.transact(s=>{for(let i=0;i<104;i++){const operationId=randomUUID();s.orders.push({...structuredClone(historical),operationId,memoHash:orderMemo(historical.buyerOwnerId,operationId,historical.cardHash,historical.input)});}});
  const history=await (await marketHandlers.orders(request('/api/market/orders',buyer.agent))).json();assert.equal(history.orders.length,10);assert.ok(history.nextCursor);
  const next=await (await marketHandlers.orders(request('/api/market/orders?cursor='+history.nextCursor,buyer.agent))).json();assert.equal(new Set([...history.orders,...next.orders].map(o=>o.operationId)).size,20);
  assert.equal((await marketHandlers.orders(request('/api/market/orders?cursor='+history.nextCursor,stranger.agent))).status,400,'A cursor is bound to its owner scope');
  server=createOnboardingMcpServer(undefined,undefined,undefined,request('/api/mcp',buyer.agent));client=new Client({name:'offline-open-market',version:'1'});
  const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name),MCP_TOOLS);assert.ok(MCP_WRITES.includes('uncertain_market_order'));
  const tool=async(name,args={})=>JSON.parse((await client.callTool({name,arguments:args})).content[0].text);
  assert.equal((await tool('list_market_services')).services.length,10);assert.equal((await tool('list_market_orders')).orders.length,10);assert.equal((await tool('get_market_order',{operationId:purchase.operationId})).order.operationId,purchase.operationId);
  const listed=await tool('list_services',{includePilots:true});assert.equal(listed.services.length,10);assert.deepEqual(listed.pilots,[]);assert.ok(listed.services.every(s=>s.payment.amount==='0.01'&&s.payment.marketplace.protocol==='x402-stellar-exact-v2'&&typeof s.availability.ready==='boolean'));
  const inspected=await tool('get_service',{id:first.card.id});assert.deepEqual(inspected.resource,first.card);assert.equal(inspected.cardHash,purchase.cardHash);assert.equal(inspected.purchase.protocol,'x402-stellar-exact-v2');
  let skills=await tool('get_bazaar_skills');const providerSkills=[...skills.providerSkills];while(skills.nextCursor){skills=await tool('get_bazaar_skills',{cursor:skills.nextCursor});providerSkills.push(...skills.providerSkills);}assert.equal(providerSkills.length,1);assert.equal(providerSkills[0].serviceId,first.card.id);assert.equal(providerSkills[0].cardHash,purchase.cardHash);assert.equal(providerSkills[0].version,'1.0.0');assert.equal(providerSkills[0].readPrice,'free');assert.equal(providerSkills[0].instructionsTrusted,false);
  const found=await tool('search_services',{query:'text',limit:5});assert.equal(found.results.length,5);assert.ok(found.nextCursor);assert.ok(found.results.every(r=>r.status==='activated'&&r.cardHash===computeCanonicalServiceCardHash(r.resource)));
  assert.equal((await tool('get_service',{id:'swap-risk-quote'})).code,'RESOURCE_NOT_FOUND');
  const capabilities=await tool('get_bazaar_capabilities');assert.equal(capabilities.workspace.payments,'x402-stellar-exact-v2');assert.equal(capabilities.architecture.settlementIdentity.issuer,USDC_TESTNET_PAYMENT_IDENTITY.issuer);assert.equal(JSON.stringify(capabilities).includes('native-XLM-testnet-direct'),false);
  assert.equal(capabilities.workspace.humanView,'/history','An external marketplace agent must send its human to private orders and publication consent');
  assert.equal(capabilities.providerOnboarding.guide,'/SELLER_AGENT_KIT.md');
  assert.equal(capabilities.demo.walletRequiredForNewOrders,false);
  assert.equal(capabilities.workspace.marketplace.admission.pendingPerSeller,1);assert.equal(capabilities.workspace.marketplace.admission.dailyPerSeller,50);assert.ok(capabilities.workspace.marketplace.sellerTools.includes('report_market_capacity'));
  assert.equal(inspected.availability.ready,false,'get_service preserves capacity metadata while the seat is held');
  process.env.BAZAAR_PUBLIC_DEMO='true';
  const identity=await tool(capabilities.demo.identityTool);assert.equal(identity.ownerId,buyerAgent.ownerId);assert.equal(identity.agentId,buyerAgent.agentId);assert.equal(identity.wallet,null,'A new account can discover its identity before linking a wallet');
  delete process.env.BAZAAR_PUBLIC_DEMO;
  process.env.BAZAAR_ENABLE_MARKETPLACE='false';
  const legacyCapabilities=await tool('get_bazaar_capabilities');assert.equal(legacyCapabilities.workspace.humanView,'/agent-chat');assert.equal(legacyCapabilities.providerOnboarding.guide,'/PROVIDER_ONBOARDING.md');
  process.env.BAZAAR_ENABLE_MARKETPLACE='true';
  await client.close();await server.close();client=server=undefined;
  const revokeGrant={changeId:randomUUID(),expectedRevision:4,allowServiceSubmission:false},beforeLostAck=permissionCommits;losePermissionAck=true;
  await assert.rejects(()=>store.changeMarketPermissions(human,revokeGrant),e=>e.code==='WORKSPACE_UNAVAILABLE');assert.equal(permissionCommits,beforeLostAck+1,'A lost acknowledgement never retries a grant write');
  const freshStore=createRedisWorkspaceStore(redis,prefix,()=>({ownerIds:[],hashes:[]})),recoveredGrant=await freshStore.changeMarketPermissions(human,revokeGrant);assert.equal(recoveredGrant.created,false);assert.equal(recoveredGrant.permission.revision,5);assert.equal((await freshStore.readMarketPermissionSnapshot(agent)).permission.allowServiceSubmission,false);
  assert.equal((await (await marketHandlers.catalog(request('/api/market/catalog'))).json()).services.length,10,'Revoking future submission permission preserves active services and purchase recovery');
  process.env.BAZAAR_PUBLIC_DEMO='true';
  const observedId=randomUUID();for(let i=0;i<2;i++){const r=request('/api/market/catalog',buyer.agent);r.headers.set('x-bazaar-query-id',observedId);assert.equal((await marketHandlers.catalog(r)).status,200);}
  assert.equal((await store.forPrincipal(buyerAgent).queries(buyerAgent.ownerId)).length,1);
  await marketHandlers.catalog(request('/api/market/catalog'));assert.equal((await store.forPrincipal(buyerAgent).queries(buyerAgent.ownerId)).length,1);
  // Controlled expiry of only these unpaid synthetic reservations exercises
  // distinct payer binding cases; no paid or uncertain record is cleared.
  const expireUnpaidFixture=async()=>market.transact(s=>{for(const o of s.orders)if(o.phase==='awaiting-payment'&&o.sellerReservation&&!o.sellerReservation.committed)o.sellerReservation.expiresAt=new Date(Date.now()-1).toISOString();});
  await expireUnpaidFixture();
  assert.equal((await createMarketOrder(buyerAgent,{...purchase,operationId:randomUUID()})).payer,purchase.payer,'x402 payer is admitted without prior wallet binding');
  const demoKey=Keypair.random(),dc=await store.walletChallenge(buyerAgent,demoKey.publicKey(),'https://market.example');await store.bindWallet(buyerAgent,dc.challengeId,'https://market.example',demoKey.sign(Buffer.from(dc.message)).toString('base64'));
  await expireUnpaidFixture();const demoPurchase={...purchase,operationId:randomUUID(),payer:demoKey.publicKey()};assert.equal((await createMarketOrder(buyerAgent,demoPurchase)).payer,demoKey.publicKey());
  await expireUnpaidFixture();
  assert.equal((await createMarketOrder(buyerAgent,{...purchase,operationId:randomUUID()})).payer,purchase.payer,'Optional binding does not constrain subsequent signed x402 payers');
  const root=await requireWorkspacePrincipal('Bearer '+buyer.bootstrap,'bootstrap'),nextKey=Keypair.random(),rc=await store.walletChallenge(root,nextKey.publicKey(),'https://market.example');await store.bindWallet(root,rc.challengeId,'https://market.example',nextKey.sign(Buffer.from(rc.message)).toString('base64'));
  assert.equal((await createMarketOrder(buyerAgent,demoPurchase)).payer,demoKey.publicKey(),'Recovery preserves the original payer after wallet rotation');
  delete process.env.BAZAAR_PUBLIC_DEMO;
  await store.changeAccess(agent.workspaceId,sha(seller.bootstrap),{action:'revoke',expectedGeneration:2});
  assert.equal((await (await marketHandlers.catalog(request('/api/market/catalog'))).json()).services.length,0,'Revoked seller disappears from public discovery');
  await assert.rejects(()=>store.readMarketPermissionSnapshot(agent),e=>e.code==='UNAUTHORIZED');
  // Existing strict v1 workspace documents stay unchanged by grant writes.
  for(const raw of data.values()){if(raw.startsWith('{')){const value=JSON.parse(raw);if(value.workspaces)assert.ok(value.workspaces.every(m=>!('marketPermissions' in m)));}}
  // Registry/window schemas permit 100+ owners while still retaining byte and creation rate limits.
  let now=clock();Date.now=()=>now;
  for(let i=0;i<103;i++){now+=86400000;const c=creds();await store.createWorkspace({creationId:randomUUID(),humanAccessHash:sha(c.human),agentAccessHash:sha(c.agent)},sha(c.bootstrap));}
  const registryKey=prefix+':{'+prefix.split(':')[1]+'}:registry',registry=JSON.parse(data.get(registryKey));assert.equal(registry.workspaces.length,106);
  for(const meta of registry.workspaces.filter(m=>!m.revoked))await store.consumeRequest(meta.ownerId,meta.generation);assert.equal(JSON.parse(data.get(registryKey)).requestWindows.length,105);
  Date.now=clock;
  // Retain 100+ reviews and reject oversized review state even without count caps.
  await resetSelfListingStateForTests();
  for(let i=0;i<105;i++){const input=submitInput('review-'+i);const result=await submitProviderDraft(input.card,input.controlProof,{submissionId:input.submissionId,submissionToken:randomBytes(32).toString('base64url')});assert.equal(result.ok,true);}
  assert.throws(()=>validateReviewState({version:1,records:[{padding:'x'.repeat(1024*1024)}]}));
  const largePage=marketPage(Array.from({length:20},(_,i)=>({createdAt:'2026-10-01T00:00:00.000Z',id:String(i),text:'x'.repeat(20000)})),{limit:20},'bytes',r=>({createdAt:r.createdAt,id:r.id}),r=>r);assert.ok(largePage.items.length<20);assert.ok(largePage.nextCursor);assert.ok(Buffer.byteLength(JSON.stringify(largePage))<=MARKET_DTO_BYTES);
  console.log(JSON.stringify({status:'PASS',remoteRequests:0,payments:0,checks:['human-owned generation-bound grant CAS/replay','agent HTTP permission enforcement','atomic grant race rejection','grant lost acknowledgement explicit replay across store instances','public canonical catalog privacy','one owner snapshot and one review snapshot per public page','opaque stable pagination and bounded DTO','MCP tools/discovery canonical parity','native human history route and authenticated identity without wallet; legacy route fallback','demo HTTP query dedup and anonymous privacy','optional wallet binding and immutable original payer recovery','private submission and order isolation','positive integer-precision USDC prices and exact protocol','revoked catalog owner filtering','106 retained owners and 105 live request windows','105 retained reviews with 1MiB byte guard']}));
} finally { Date.now=clock;await client?.close();await server?.close();setWorkspaceStoreForTests(undefined);setMarketStoreForTests(undefined);await setReviewStoreForTests(undefined);for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous); }
