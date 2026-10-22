import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Keypair} from '@stellar/stellar-sdk';
import {exampleAcceptancePlan,createExampleAcceptanceTransport,runExamplePreviewAcceptance} from '../.vercel/recovery-example-budget-preview-acceptance.mjs';
import {EXAMPLE_PREVIEW as P,sha} from './recovery-example-budget-preview-lib.mjs';
import {createRecoveryExampleCard} from '../examples/recovery-example-text-service.mjs';

const origin='https://'+P.bazaarAlias,provider='https://'+P.providerAlias;
const source={bazaar:'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',provider:'f87082dbb24b0f420cfecfc855b9a77c5995332623c5c9692d711eff30bdeee2'};
function profile(){
 const publication=createRecoveryExampleCard({providerOrigin:provider,destination:Keypair.fromRawEd25519Seed(Buffer.alloc(32,24)).publicKey()});
 const actor=(letter,index)=>({agent:letter.repeat(43),human:String(index).repeat(43),bootstrap:(index===1?'b':'z').repeat(43),receipt:{ownerId:'ow_'+String(index).repeat(32),agentId:'agent_'+String(index).repeat(32),generation:1}});
 return {candidateSources:source,budgetVersion:'example-text-wire/v1',providerIoProfile:'example-bounded-provider-v1',budgetTargetSha256:'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',phase:'native-ready',family:'pilot-'+'a'.repeat(32),purpose:'bazaar-recovery-example-budget-preview-v2',...publication,submissionId:randomUUID(),operationId:randomUUID(),seller:actor('s',1),buyer:actor('u',2),operator:'o'.repeat(43),workerToken:'w'.repeat(43),providerToken:'p'.repeat(43),storeKey:'k'.repeat(43),scopedToken:'q'.repeat(43),scopedNativeToken:'n'.repeat(43),reviewSecret:'r'.repeat(43),bazaarProtection:'protected-bazaar-synthetic-only',providerProtection:'protected-provider-synthetic-only',controlRecord:'stellar-bazaar-verification='+'N'.repeat(24),deployments:Object.fromEntries(['bazaar','provider'].map(stage=>[stage,{phase:'ready',alias:stage==='bazaar'?P.bazaarAlias:P.providerAlias,deploymentId:'dpl_Synthetic'+stage,sourceDigest:source[stage],project:stage==='bazaar'?P.bazaarProject:P.providerProject,intentId:randomUUID()}]))};
}
let checks=0;const j=profile();assert.equal(exampleAcceptancePlan(j).newOrdersMaximum,1);assert.equal(exampleAcceptancePlan(j).orderMustRemainUnpaid,true);checks+=2;
for(const change of [{phase:'prepared'},{operationId:'bad'},{cardHash:'b'.repeat(64)},{deployments:{...j.deployments,bazaar:{...j.deployments.bazaar,phase:'created'}}},{buyer:{...j.buyer,receipt:j.seller.receipt}}]){assert.throws(()=>exampleAcceptancePlan({...j,...change}));checks++;}
let calls=0;
const transport=createExampleAcceptanceTransport(j,{fetcher:async(url,init)=>{calls++;assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(new Headers(init.headers).get('x-vercel-protection-bypass'),new URL(url).origin===origin?j.bazaarProtection:j.providerProtection);return Response.json({ok:true});}});
const rpc=(name,args={})=>({method:'POST',headers:{authorization:'Bearer '+j.buyer.agent,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
for(const [url,init]of [['https://bazaar.browns.studio/api/mcp',rpc('get_bazaar_identity')],[origin+'/api/market/orders/'+j.operationId+'/x402',{}],[origin+'/api/market/review?diagnostic=facilitator',{headers:{authorization:'Bearer '+j.operator}}],[origin+'/api/market/orders/'+randomUUID(),{headers:{authorization:'Bearer '+j.buyer.agent}}],[provider+'/api/bazaar/example/tick',{method:'POST',headers:{authorization:'Bearer '+j.workerToken,'content-type':'application/json'},body:'{"mode":"deliver"}'}],[origin+'/api/mcp',rpc('request_wallet_binding')],[origin+'/api/mcp',rpc('create_market_order')],[origin+'/api/mcp',rpc('claim_market_order',{operationId:j.operationId,attemptId:randomUUID()})],[origin+'/api/mcp',rpc('get_service',{id:'other'})],[origin+'/api/mcp',rpc('get_market_order',{operationId:randomUUID()})],[origin+'/api/mcp',{...rpc('get_bazaar_identity'),headers:{...rpc('get_bazaar_identity').headers,cookie:'private'}}],[origin+'/api/mcp',{...rpc('get_bazaar_identity'),body:'x'.repeat(32769)}]]){await assert.rejects(transport.send(url,init));checks++;}
assert.equal(calls,0);checks++;
await transport.send(origin+'/api/mcp',rpc('get_bazaar_capabilities'));assert.equal(calls,1);checks++;
const secret=createExampleAcceptanceTransport(j,{fetcher:async()=>Response.json({secret:j.providerToken})});await assert.rejects(secret.send(origin+'/api/mcp',rpc('get_bazaar_identity')),/PRIVATE_VALUE/);checks++;
const redirect=createExampleAcceptanceTransport(j,{fetcher:async()=>{const value=Response.json({ok:true});Object.defineProperty(value,'redirected',{value:true});return value;}});await assert.rejects(redirect.send(origin+'/api/mcp',rpc('get_bazaar_identity')),/REDIRECT/);checks++;
const large=createExampleAcceptanceTransport(j,{fetcher:async()=>new Response('x'.repeat(131073))});await assert.rejects(large.send(origin+'/api/mcp',rpc('get_bazaar_identity')),/RESPONSE_BOUND/);checks++;
const bound=createExampleAcceptanceTransport(j,{maximumRequests:1,fetcher:async()=>Response.json({ok:true})});await bound.send(origin+'/api/mcp',rpc('get_bazaar_identity'));await assert.rejects(bound.send(origin+'/api/mcp',rpc('get_bazaar_identity')),/FIXED_PREVIEW_REQUEST/);checks++;

function fixture({lostCreation=false}={}){
 let current=profile(),status='awaiting-control-proof',order,creationCalls=0,reviewActions=[];const receipts=[],queries={buyer:[],seller:[]},writes=[];
 const callApi=async path=>{const stage=path.includes(P.bazaarProject)||path.includes('Syntheticbazaar')||path.includes(P.bazaarAlias)?'bazaar':'provider',d=current.deployments[stage];if(path.startsWith('/v9/projects/'))return {targets:{production:{id:stage==='bazaar'?P.baselineBazaar:P.baselineProvider}},ssoProtection:{deploymentType:'all_except_custom_domains'}};if(path.startsWith('/v13/deployments/'))return {target:'preview',readyState:'READY',projectId:d.project,meta:{sourceDigest:d.sourceDigest,recoveryExampleIntent:d.intentId}};if(path.startsWith('/v4/aliases/'))return {deployment:{id:d.deploymentId}};throw Error('UNEXPECTED_AUTHORITY_READ');};
 const fetcher=async(url,init)=>{
  const u=new URL(url),authorization=new Headers(init.headers).get('authorization'),role=authorization==='Bearer '+current.buyer.agent?'buyer':'seller';
  if(u.pathname==='/api/market/agent-permissions')return Response.json({permission:{allowServiceSubmission:true}});
  if(u.pathname==='/.well-known/stellar-bazaar-provider.txt')return new Response(current.controlRecord,{headers:{'content-type':'text/plain'}});
  if(u.pathname==='/api/market/review'){
   if(authorization!=='Bearer '+current.operator)return Response.json({error:{code:'UNAUTHORIZED'}},{status:401});
   const submission=()=>({submissionId:current.submissionId,card:current.card,status,publiclyActive:status==='activated'});
   if(init.method==='POST'){const body=JSON.parse(init.body);reviewActions.push(body.action);status=body.action==='verify-http'?'pending-manual-review':body.action==='approve'?'approved-for-staging':'activated';return Response.json({submission:submission()});}
   return Response.json({submissions:[submission()],total:1,totalPages:1});
  }
  if(u.pathname==='/api/market/services/'+current.submissionId)return Response.json({submission:{card:current.card,cardHash:current.cardHash,status}});
  if(u.pathname==='/v1/bazaar-recovery-example/availability')return Response.json({ready:true,network:'stellar:testnet'});
  if(u.pathname==='/api/market/catalog')return Response.json({services:[{card:current.card,cardHash:current.cardHash}]});
  if(u.pathname.endsWith('/qr.svg'))return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>',{headers:{'content-type':'image/svg+xml'}});
  if(u.pathname==='/api/market/orders/'+current.operationId)return Response.json({order});
  assert.equal(u.pathname,'/api/mcp');
  if(init.method==='GET')return new Response(null,{status:405});if(init.method==='DELETE')return new Response(null,{status:405});
  const rpc=JSON.parse(init.body);if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
  let result;
  if(rpc.method==='initialize')result={protocolVersion:rpc.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'local-acceptance-fixture',version:'1'}};
  else if(rpc.method==='tools/list')result={tools:['get_bazaar_capabilities','create_market_order','get_market_order','claim_market_order','deliver_market_order'].map(name=>({name,inputSchema:{type:'object',properties:{}}}))};
  else{
   const {name,arguments:args}=rpc.params;let body,isError=false;const queryId=new Headers(init.headers).get('x-bazaar-query-id');if(queryId)queries[role].push({requestId:queryId,agentId:current[role].receipt.agentId});
   if(name==='get_bazaar_identity')body={...current[role].receipt,network:'stellar:testnet'};
   else if(name==='get_bazaar_capabilities')body={effectiveFeatures:{purchases:{enabled:role==='buyer'},privateFiles:{enabled:false}},workspace:{marketplace:{admission:{mode:'restricted'}}}};
   else if(name==='get_market_submission'){body={httpStatus:404,error:{code:'NOT_FOUND'}};isError=true;}
   else if(name==='get_service')body={status:'activated',cardHash:current.cardHash,resource:current.card,availability:{ready:order!==undefined,mode:'on-demand'}};
   else if(name==='create_market_order'){
    creationCalls++;assert.equal(current.acceptance.order.phase,'started');assert.equal(args.operationId,current.operationId);
    order={...args,buyerOwnerId:current.buyer.receipt.ownerId,sellerOwnerId:current.seller.receipt.ownerId,card:current.card,destination:current.card.payment.destination,amount:'0.01',executionMode:'on-demand',phase:'awaiting-payment',createdAt:'2026-10-12T12:00:00.000Z',updatedAt:'2026-10-12T12:00:00.000Z',memoHash:'a'.repeat(64)};
    if(lostCreation){lostCreation=false;throw Error('LOST_CREATION_RESPONSE');}body={order};
   }else if(name==='get_market_order')body={order};
   else if(name==='claim_market_order'){body={httpStatus:409,error:{code:'PAYMENT_REQUIRED'}};isError=true;}
   else if(name==='deliver_market_order'){body={httpStatus:409,error:{code:'CLAIM_CONFLICT'}};isError=true;}
   else if(name==='get_bazaar_query_history')body={queries:queries[role]};
   else if(name==='list_market_orders')body={orders:[{...order,perspective:role==='buyer'?'purchase':'sale'}]};
   else throw Error('UNEXPECTED_FIXTURE_TOOL');
   result={isError,content:[{type:'text',text:JSON.stringify(body)}]};
  }
  return Response.json({jsonrpc:'2.0',id:rpc.id,result});
 };
 return {context:{readJournal:async()=>current,writeJournal:async value=>{current=value;writes.push(structuredClone(value));},writeReceipt:async(path,value)=>receipts.push({path,value}),callApi,checkOriginal:async()=>true,fetcher},get creationCalls(){return creationCalls;},get reviewActions(){return reviewActions;},get current(){return current;},receipts,writes};
}
const f=fixture();const reviewed=await runExamplePreviewAcceptance('review',f.context);assert.match(reviewed.status,/^PASS/);assert.deepEqual(f.reviewActions,['verify-http','approve','activate']);assert.equal(f.current.acceptance.reviewIntents.activate.phase,'acknowledged');checks+=3;
const accepted=await runExamplePreviewAcceptance('run',f.context);assert.match(accepted.status,/^PASS/,JSON.stringify({status:accepted.status,stage:accepted.stage,code:accepted.code,checks:accepted.checks}));assert.equal(f.creationCalls,1);assert.equal(accepted.paymentVerified,false);assert.equal(accepted.deliveryVerified,false);assert.equal(accepted.automaticReadinessObserved,true);assert.ok(accepted.requests<=100);checks+=6;
const recovered=await runExamplePreviewAcceptance('recover',f.context);assert.match(recovered.status,/^PASS/);assert.equal(f.creationCalls,1);assert.equal(recovered.creationRequestsThisRun,0);checks+=3;
await assert.rejects(runExamplePreviewAcceptance('run',f.context),/RECEIPT_ALREADY_EXISTS/);assert.equal(f.creationCalls,1);checks+=2;
const lost=fixture({lostCreation:true});await runExamplePreviewAcceptance('review',lost.context);const uncertain=await runExamplePreviewAcceptance('run',lost.context);assert.match(uncertain.status,/UNCONFIRMED/);assert.equal(lost.creationCalls,1);assert.equal(lost.current.acceptance.order.phase,'started');checks+=3;
const recoveredLost=await runExamplePreviewAcceptance('recover',lost.context);assert.match(recoveredLost.status,/^PASS/);assert.equal(lost.creationCalls,1);assert.equal(lost.current.acceptance.order.phase,'created');checks+=3;
const moduleBytes=await readFile('.vercel/recovery-example-budget-preview-acceptance.mjs');
const evidence={status:'PASS_LOCAL_PROTECTED_PREVIEW_ACCEPTANCE_CONTROLLER',recordedAt:new Date().toISOString(),moduleSha256:sha(moduleBytes),checks,realSdk:true,syntheticReviewActions:f.reviewActions,syntheticCreationCalls:f.creationCalls,responseLossRecoveredWithoutRepeat:true,externalRequests:0,realRedis:false,payments:0,productionWrites:0,limitations:['Actual MCP SDK and controller were executed with isolated HTTP dependency fixtures. No hosted Preview result is claimed.','The synthetic unpaid order never authorizes payment, signing, execution or settlement.']};
await writeFile('docs/evidence/recovery-example-budget-preview-v5-acceptance-controller-local-2026-10-13.json',JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:evidence.status,checks,realSdk:true,externalRequests:0,payments:0}));
