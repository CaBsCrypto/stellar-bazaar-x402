import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {registerHooks} from 'node:module';
import {extname} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Keypair} from '@stellar/stellar-sdk';
import {setWorkspaceStoreForTests} from '../lib/workspace-store.ts';
import {setMarketStoreForTests} from '../lib/marketplace-store.ts';
import {setReviewStoreForTests,submitProviderDraft,validateReviewState} from '../lib/provider-self-listing.ts';
import {createMemoryReviewStoreForTests} from '../lib/provider-review-store.ts';
import {createSellerCard} from '../examples/seller-service-card.mjs';
import {WorkspaceError} from '../lib/workspace-types.ts';
import {historyConnection} from '../lib/history-connection.ts';
import {MCP_TOOLS} from '../lib/mcp-tool-contract.ts';
import {consumeMarketOperatorFragment,parseMarketOperatorCapsule} from '../lib/market-review-access.ts';
import {pilotRoutePolicy} from '../lib/pilot-route-policy.ts';
import {setOperationalBudgetStoreForTests} from '../lib/operational-budget.ts';
import {NextRequest} from 'next/server.js';
import {proxy} from '../proxy.ts';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!extname(specifier))return next(specifier+'.ts',context);throw error;}}});
const {createOnboardingMcpServer}=await import('../lib/mcp-onboarding-server.ts');
const {marketHandlers}=await import('../lib/marketplace-http.ts');
const {GET:reviewGET}=await import('../app/api/market/review/route.ts');
const previous={...process.env},origin='https://bazaar.example',family='a'.repeat(32),operator='o'.repeat(43),secret='synthetic-test-secret-not-real-credentials';
const hash=value=>createHash('sha256').update(value).digest('hex');
const owner='ow_'+'b'.repeat(32),outsider='ow_'+'c'.repeat(32);
const tokens={human:'h'.repeat(43),agent:'a'.repeat(43),bootstrap:'b'.repeat(43),outsider:'x'.repeat(43)};
const identity=(ownerId,role)=>({ownerId,role,workspaceId:randomUUID(),agentId:'agent-'+ownerId,generation:1});
const principals=new Map(Object.entries(tokens).map(([role,token])=>[hash(token),identity(role==='outsider'?outsider:owner,role==='outsider'?'agent':role)]));
const request=(path,token,body)=>new Request(origin+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
let reviewReads=0,marketState={version:1,services:[],orders:[]},checks=0,measuredRouteCases=0;
async function capabilities(token){
  const server=createOnboardingMcpServer(undefined,undefined,undefined,request('/api/mcp',token));const client=new Client({name:'offline-native-capabilities',version:'1'});const [c,s]=InMemoryTransport.createLinkedPair();
  try{await server.connect(s);await client.connect(c);assert.deepEqual((await client.listTools()).tools.map(t=>t.name),MCP_TOOLS);return JSON.parse((await client.callTool({name:'get_bazaar_capabilities',arguments:{}})).content[0].text);}
  finally{await client.close();await server.close();}
}
try{
  for(const key of Object.keys(process.env))if(/^(BAZAAR_|VERCEL|STELLAR_X402_|X402_|CRON_SECRET)/.test(key))delete process.env[key];
  const reserved=[];setOperationalBudgetStoreForTests({async reserve(kind){reserved.push(kind.profile);},async read(){},async refresh(){}});
  setWorkspaceStoreForTests({async resolveHash(digest){const p=principals.get(digest);if(!p)throw new WorkspaceError('UNAUTHORIZED',401);return p;}});
  setMarketStoreForTests({async transact(fn){return fn(marketState);}});
  const memory=createMemoryReviewStoreForTests(validateReviewState);setReviewStoreForTests({async transact(fn){reviewReads++;return memory.transact(fn);}});
  Object.assign(process.env,{VERCEL:'1',VERCEL_ENV:'production',BAZAAR_PUBLIC_DEMO:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_WORKSPACE_ADMISSION:'open',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_WORKSPACE_REDIS_REST_URL:'https://synthetic.upstash.io',BAZAAR_WORKSPACE_REDIS_REST_TOKEN:secret,BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',BAZAAR_DEMO_NAMESPACE_ENV:'production',BAZAAR_WORKSPACE_PREFIX:'bazaar-workspace:pilot-'+family,BAZAAR_MARKET_PREFIX:'bazaar-market:pilot-'+family,BAZAAR_REVIEW_PREFIX:'bazaar-review:pilot-'+family,BAZAAR_MARKET_FILE_PREFIX:'market-deliveries/v1/production/'+family,BAZAAR_WORKSPACE_PUBLIC_ORIGIN:origin,BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_MARKET_REVIEW_SECRET:secret,BAZAAR_MARKET_OPERATOR_HASH:hash(operator),BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_X402_MARKETPLACE_ENABLED:'true',STELLAR_X402_FACILITATOR_URL:'https://channels.openzeppelin.com/x402/testnet',STELLAR_X402_FACILITATOR_API_KEY:secret,X402_ENABLE_LOCAL_PAYER:'false'});
  // The legacy intake is deliberately unavailable; the native path remains usable.
  let cap=await capabilities();assert.equal(cap.providerOnboarding.intakeEnabled,true);assert.equal(cap.providerOnboarding.publicIntakeEnabled,true);assert.equal(cap.providerOnboarding.submissionStorage,'shared-redis');assert.equal(cap.providerOnboarding.intakeReason,null);assert.equal(cap.effectiveFeatures.serviceSubmission.enabled,true);assert.equal(cap.providerOnboarding.submissionTool,'submit_market_service');assert.equal(cap.historyConnection.purchasesEndpoint,'/api/market/orders');assert.equal(cap.historyConnection.queriesEndpoint,'/api/account/queries');assert.ok(!JSON.stringify(cap.historyConnection).includes('writeToken'));assert.equal(cap.operationHistory.marketplaceHistory,false);checks++;
  process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE='false';cap=await capabilities();assert.equal(cap.providerOnboarding.intakeEnabled,false);assert.equal(cap.providerOnboarding.intakeReason,'PROVIDER_INTAKE_DISABLED');checks++;
  process.env.BAZAAR_ENABLE_SELF_LISTING_INTAKE='true';process.env.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON=JSON.stringify([owner]);
  cap=await capabilities();assert.equal(cap.effectiveFeatures.purchases.enabled,false);assert.equal(cap.workspace.marketplace.admission.mode,'restricted');assert.equal(cap.effectiveFeatures.purchases.reason,'BUYER_ADMISSION_RESTRICTED');assert.ok(!JSON.stringify(cap).includes(owner));checks++;
  for(const token of [tokens.agent,tokens.human]){cap=await capabilities(token);assert.equal(cap.effectiveFeatures.purchases.enabled,true);assert.ok(!JSON.stringify(cap).includes(owner));}checks++;
  for(const token of [tokens.outsider,tokens.bootstrap,'z'.repeat(43)]){cap=await capabilities(token);assert.equal(cap.effectiveFeatures.purchases.enabled,false);}checks++;
  process.env.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON='invalid';cap=await capabilities(tokens.agent);assert.equal(cap.effectiveFeatures.purchases.enabled,false);assert.equal(cap.effectiveFeatures.purchases.reason,'PURCHASE_ADMISSION_CONFIGURATION_INCOMPLETE');checks++;
  delete process.env.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON;
  process.env.BAZAAR_ENABLE_MARKETPLACE='false';cap=await capabilities();assert.equal(cap.providerOnboarding.intakeEnabled,false);assert.deepEqual(cap.historyConnection,historyConnection);assert.equal(cap.operationHistory.marketplaceHistory,undefined);checks++;
  process.env.BAZAAR_ENABLE_MARKETPLACE='true';
  const destination=Keypair.random().publicKey();
  for(let index=0;index<13;index++){const {card}=createSellerCard({id:'review-fixture-'+index,name:'Synthetic '+index,description:'Only synthetic offline review fixture',providerName:'Offline fixture',providerOrigin:'https://provider.example',destination});const result=await submitProviderDraft(card,{method:'http-well-known',domain:'provider.example'},{submissionId:randomUUID(),submissionToken:'t'.repeat(43)});assert.equal(result.ok,true);}
  for(const token of [undefined,'z'.repeat(43),...Object.values(tokens)]){
    const before=reviewReads;let result=await marketHandlers.review(request('/api/market/review',token));assert.equal(result.status,401);assert.equal(reviewReads,before);assert.equal((await result.json()).submissions,undefined);
    result=await marketHandlers.review(request('/api/market/review',token,{submissionId:randomUUID(),action:'approve',reason:'Unauthorized must not modify'}));assert.equal(result.status,401);assert.equal(reviewReads,before);
  }checks++;
  const page1=await marketHandlers.review(request('/api/market/review?page=1&pageSize=5',operator));assert.equal(page1.status,200);assert.match(page1.headers.get('cache-control'),/private.*no-store/);assert.equal(page1.headers.get('vary'),'Authorization');const first=await page1.json();assert.equal(first.total,13);assert.equal(first.totalPages,3);assert.equal(first.submissions.length,5);
  const second=await(await marketHandlers.review(request('/api/market/review?page=2&pageSize=5',operator))).json();assert.equal(new Set([...first.submissions,...second.submissions].map(s=>s.submissionId)).size,10);
  const third=await(await marketHandlers.review(request('/api/market/review?page=3&pageSize=5',operator))).json();assert.equal(third.submissions.length,3);checks++;
  // Exercise the actual measured proxy and measured GET route, not only its handler.
  const info=console.info,logs=[];console.info=row=>logs.push(JSON.parse(row));
  const fullRoute=async(path,token=operator)=>{measuredRouteCases++;const req=new NextRequest(origin+path,{headers:token?{Authorization:'Bearer '+token}:{}}),boundary=await proxy(req);return boundary.headers.get('x-middleware-next')==='1'?reviewGET(req):boundary;};
  try {
    Object.assign(process.env,{BAZAAR_ROUTE_BOUNDARY:'true',BAZAAR_OPERATIONAL_METER:'true',BAZAAR_OPERATIONAL_BUDGET:'true'});
    for(const query of ['', '?page=1&pageSize=20','?pageSize=1','?page=2&pageSize=5','?page=10000&pageSize=20']) {
      const before=reviewReads,quotaBefore=reserved.length,result=await fullRoute('/api/market/review'+query);
      assert.equal(result.status,200,'Measured review route must accept bounded pagination '+query);assert.equal(reviewReads,before+1);assert.equal(reserved.length,quotaBefore+1);assert.equal(reserved.at(-1),'recovery');
      assert.equal(result.headers.get('x-bazaar-operational-meter'),'v1');assert.match(result.headers.get('cache-control'),/private.*no-store/);
      const page=await result.json();assert.equal(page.pageSize,query.includes('pageSize=20')?20:query.includes('pageSize=1')?1:5);
    }
    for(const query of ['?page=0','?page=01','?page=10001','?page=9007199254740993','?pageSize=0','?pageSize=01','?pageSize=21','?page=1&page=2','?pageSize=2&pageSize=3','?page=','?pageSize=','?page=-1','?page=1.0','?page=%20','?cursor=legacy','?token='+operator,'?page=1&extra=2']) {
      const before=reviewReads,quotaBefore=reserved.length,result=await fullRoute('/api/market/review'+query);assert.equal(result.status,400,'Invalid query rejected by actual boundary '+query);assert.equal(reviewReads,before);assert.equal(reserved.length,quotaBefore);
    }
    for(const token of [undefined,'z'.repeat(43),tokens.human,tokens.agent,tokens.bootstrap,tokens.outsider]) {
      const before=reviewReads,result=await fullRoute('/api/market/review?page=1&pageSize=20',token??null);assert.equal(result.status,401);assert.equal(reviewReads,before);
    }
    assert.ok(logs.length>0);assert.ok(logs.every(row=>!JSON.stringify(row).includes(operator)),'Actual measured routes never log operator access');checks++;
  } finally {console.info=info;process.env.BAZAAR_OPERATIONAL_METER='false';process.env.BAZAAR_OPERATIONAL_BUDGET='false';}
  for(const query of ['?page=0','?page=01','?pageSize=21','?page=10001','?page=1&page=2','?token='+operator,'?cursor=legacy']){const before=reviewReads;const result=await marketHandlers.review(request('/api/market/review'+query,operator));assert.equal(result.status,400);assert.equal(reviewReads,before);}checks++;
  const wrongOrigin=new Request('https://other.example/api/market/review',{headers:{Authorization:'Bearer '+operator}});assert.equal((await marketHandlers.review(wrongOrigin)).status,400);checks++;
  const capsule=JSON.stringify({kind:'bazaar-market-operator-access',version:1,origin,token:operator});assert.equal(parseMarketOperatorCapsule(capsule,origin),operator);assert.throws(()=>parseMarketOperatorCapsule(capsule,'https://other.example'));assert.throws(()=>parseMarketOperatorCapsule(JSON.stringify({kind:'bazaar-private-read-access',version:1,token:tokens.human}),origin));checks++;
  const privateLink=consumeMarketOperatorFragment(origin+'/market-review#token='+operator);assert.equal(privateLink.token,operator);assert.equal(privateLink.cleanPath,'/market-review');const queryLink=consumeMarketOperatorFragment(origin+'/market-review?token='+operator);assert.equal(queryLink.token,'');assert.equal(queryLink.cleanPath,'/market-review');assert.equal(consumeMarketOperatorFragment(origin+'/market-review#token='+operator+'&token='+operator).token,'');checks++;
  for(const method of ['GET','HEAD'])assert.equal(pilotRoutePolicy('/market-review',method),'allow');assert.equal(pilotRoutePolicy('/api/market/review','GET'),'allow');assert.equal(pilotRoutePolicy('/api/market/review','POST'),'allow');checks++;
  setReviewStoreForTests({async transact(){throw Error('private-secret-must-not-leak');}});const unavailable=await marketHandlers.review(request('/api/market/review',operator));assert.equal(unavailable.status,503);assert.deepEqual(await unavailable.json(),{error:{code:'REVIEW_UNAVAILABLE'}});checks++;
  console.log(JSON.stringify({status:'PASS',checks,measuredRouteCases,actualMeasuredProxyAndGet:true,networkRequests:0,payments:0,scope:'offline doubles; native capabilities, private operator roles, complete route pagination, access cleanup and legacy compatibility'}));
}finally{delete process.env.VERCEL;setOperationalBudgetStoreForTests(undefined);setWorkspaceStoreForTests(undefined);setMarketStoreForTests(undefined);setReviewStoreForTests(undefined);for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
