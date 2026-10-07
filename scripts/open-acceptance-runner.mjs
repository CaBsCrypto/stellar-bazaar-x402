import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createMarketplaceBuyerIntent,runMarketplaceBuyerIntent,recoverBuyerIntent} from '../examples/marketplace-x402-buyer.mjs';
import {createBuyerMcpTool,createPortableBuyerRuntime} from '../examples/buyer-portable-runtime.mjs';
import {openPortableSecretStore} from '../examples/buyer-portable-secret-store.mjs';
import {readPrivateInput} from '../examples/buyer-private-input.mjs';
import {createOpenAcceptanceController,createOpenRedisExchange} from './open-acceptance-controller.mjs';
import {assertOpenExecutionGate,currentOpenSourceBinding,openAssert,openHash} from './open-acceptance-plan.mjs';

export function createOpenMcpTransport({plan,controller,agentAccess}){openAssert(/^[A-Za-z0-9_-]{43}$/.test(agentAccess??''),'AGENT_ACCESS_REQUIRED');let id=0;return {async callTool(name,args={}){const requestId=++id;const response=await controller.fetch(plan.origin+'/api/mcp',{method:'POST',headers:{authorization:'Bearer '+agentAccess,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method:'tools/call',params:{name,arguments:args}}),redirect:'error'});openAssert(response.ok,'MCP_HTTP_UNCONFIRMED');const body=await response.json();openAssert(body.jsonrpc==='2.0'&&body.id===requestId&&!body.error&&body.result,'MCP_RESULT_UNCONFIRMED');return body.result;}};}
async function existing(journal){try{return await journal.read();}catch(error){if(error.code==='ENOENT')return undefined;throw error;}}

/** loadPrivateRuntime runs only after the independent source/deployment/owner gate.
 * It may unwrap the owner's existing DPAPI packet in memory and return externally
 * owned buyer/seller options and encrypted journals. No new wallet is created.
 */
export async function runOpenAcceptanceOrder({plan,authorization,index,readRecovery=false,controllerOptions,loadPrivateRuntime,dependencies={}}){
 openAssert(index===0||index===1,'FROZEN_ORDER_INDEX_REQUIRED');await assertOpenExecutionGate({plan,...authorization,readOnly:readRecovery});openAssert(typeof loadPrivateRuntime==='function','PRIVATE_RUNTIME_CALLBACK_REQUIRED');
 const controller=await createOpenAcceptanceController({...controllerOptions,plan,authorization,readRecovery});const frozen=plan.orders[index],phase='buy-'+index;let privateRuntime;
 try{
  if(authorization.deployment.serverWindow&&!controller.snapshot().serverWindows.some(window=>window.windowId===authorization.deployment.serverWindow.windowId))await controller.reserveServerWindow(authorization.deployment.serverWindow);
  if(!readRecovery)await controller.verifyHostedPreflight();
  if(readRecovery)await controller.reconcileControllerLedger();else{if(index===1)openAssert(controller.snapshot().phaseMarkers.some(p=>p.name==='buy-0'&&p.status==='complete'),'FIRST_TERMINAL_ORDER_REQUIRED');await controller.beginPhase(phase);}
  privateRuntime=await loadPrivateRuntime({plan,operationId:frozen.operationId,index,readOnly:readRecovery,controller});const buyer=privateRuntime.buyer;
  openAssert(buyer?.options?.signer?.address===plan.participants[1].wallet&&buyer.journal?.read&&buyer.journal?.append&&buyer.journal?.initialize,'EXISTING_BUYER_RUNTIME_REQUIRED');
  const options={...buyer.options,marketFetch:controller.fetch,rpcFetch:controller.fetch,marketTool:createBuyerMcpTool({origin:plan.origin,agentToken:buyer.options.agentToken,marketFetch:controller.fetch}),persistIntent:value=>buyer.journal.append(value),reserveSpend:async value=>{await controller.reservePayment(value);await buyer.options.reserveSpend(value);}};
  let intent=await existing(buyer.journal);
  if(readRecovery){openAssert(intent,'ORIGINAL_BUYER_INTENT_REQUIRED');const order=await recoverBuyerIntent(intent,options);if(['delivered','delivery-failed'].includes(order.phase)&&controller.snapshot().phaseMarkers.some(p=>p.name===phase&&p.status==='started'))await controller.completePhase(phase);return {status:'READ_RECOVERED',operationId:intent.operationId,phase:order.phase,transactionHash:order.transactionHash,controller:controller.snapshot()};}
  openAssert(!intent,'EXISTING_BUYER_INTENT_REQUIRES_READ_RECOVERY');intent=createMarketplaceBuyerIntent({origin:plan.origin,card:plan.card,input:frozen.input,payer:plan.participants[1].wallet,operationId:frozen.operationId});await buyer.journal.initialize(intent);await runMarketplaceBuyerIntent(intent,options);
  const seller=privateRuntime.seller;openAssert(seller?.journal?.initialize&&seller.agentAccess&&seller.providerAccess,'EXTERNAL_SELLER_RUNTIME_REQUIRED');
  const worker=dependencies.worker??await import('../examples/seller-marketplace-worker.mjs'),http=dependencies.http??await import('../examples/seller-http-adapter.mjs');
  openAssert(!await existing(seller.journal),'EXISTING_SELLER_ATTEMPT_REQUIRES_READ_RECOVERY');const sellerIntent=worker.createSellerIntent({operationId:frozen.operationId,attemptId:frozen.attemptId,cardHash:plan.cardHash,serviceId:plan.card.id,providerOrigin:plan.providerOrigin,providerRoute:plan.card.routeTemplate,ownerId:plan.participants[0].ownerId,agentId:plan.participants[0].agentId});await seller.journal.initialize(sellerIntent);
  const transport=createOpenMcpTransport({plan,controller,agentAccess:seller.agentAccess});const adapter=http.createSellerHttpAdapter({providerOrigin:plan.providerOrigin,route:plan.card.routeTemplate,allowedOrigins:[plan.providerOrigin],providerAccess:seller.providerAccess,fetcher:controller.fetch});
  const sellerOptions={...transport,adapter,persistIntent:value=>seller.journal.append(value)};
  const order=index===0?await worker.executeSellerIntent(sellerIntent,sellerOptions):await worker.failSellerIntent(sellerIntent,sellerOptions,plan.failureReason);openAssert(order.phase===frozen.expected,'EXPECTED_TERMINAL_STATE_REQUIRED');await recoverBuyerIntent(intent,options);await controller.completePhase(phase);
  return {status:'EXECUTED_AUTHORIZED_ORDER',operationId:frozen.operationId,phase:order.phase,transactionHash:order.transactionHash,deliverySha256:order.delivery?.sha256,controller:controller.snapshot()};
 }finally{await privateRuntime?.dispose?.();await controller.close();}
}

async function publicJson(path){return JSON.parse(await readFile(path,'utf8'));}
/** This CLI consumes previously configured encrypted stores and existing wallets.
 * Root may instead call runOpenAcceptanceOrder with its existing DPAPI adapter.
 */
async function main(){
 const [command,indexText,planPath,deploymentPath,reviewPath,consentPath,flag]=process.argv.slice(2);openAssert(['buy','recover'].includes(command)&&flag==='--secret-stdin','USE_BUY_OR_RECOVER_INDEX_PLAN_DEPLOYMENT_REVIEW_CONSENT_SECRET_STDIN');
 const [plan,deployment,review,consent,source]=await Promise.all([publicJson(planPath),publicJson(deploymentPath),publicJson(reviewPath),publicJson(consentPath),currentOpenSourceBinding()]);const authorization={deployment,review,consent,source};await assertOpenExecutionGate({plan,...authorization,readOnly:command==='recover'});
 const bytes=await readPrivateInput({allowPipe:true});let secret;try{secret=JSON.parse(bytes);}finally{bytes.fill(0);}const password=Buffer.from(secret.controllerPassword??'');let controlStore,buyerStore,sellerStore,release;
 try{
  controlStore=await openPortableSecretStore({directory:secret.controllerDirectory,password,create:secret.createController===true});password.fill(0);release=await controlStore.acquireLock('open-acceptance');const redisExchange=createOpenRedisExchange({origin:plan.redisOrigin,credential:secret.redisCredential,planId:plan.planId});
  const result=await runOpenAcceptanceOrder({plan,authorization,index:Number(indexText),readRecovery:command==='recover',controllerOptions:{journal:controlStore.journal('open.'+plan.planId),redisExchange},loadPrivateRuntime:async({operationId})=>{
   const buyerPassword=Buffer.from(secret.buyerPassword??''),sellerPassword=Buffer.from(secret.sellerPassword??'');try{buyerStore=await openPortableSecretStore({directory:secret.buyerDirectory,password:buyerPassword});sellerStore=await openPortableSecretStore({directory:secret.sellerDirectory,password:sellerPassword});}finally{buyerPassword.fill(0);sellerPassword.fill(0);}
   const buyer=await createPortableBuyerRuntime({store:buyerStore,operationId}),seller=await sellerStore.read('seller-config');openAssert(seller.ownerId===plan.participants[0].ownerId&&seller.agentId===plan.participants[0].agentId&&seller.cardHash===plan.cardHash&&openHash(seller.card)===plan.cardHash,'EXISTING_C_SELLER_CONFIGURATION_REQUIRED');const buyerRelease=await buyerStore.acquireLock('buyer');let sellerRelease;try{sellerRelease=await sellerStore.acquireLock('seller.'+operationId);}catch(error){await buyerRelease();buyer.dispose();throw error;}
   return {buyer:{options:buyer,journal:buyer.journal},seller:{...seller,journal:sellerStore.journal('seller.'+operationId)},dispose:async()=>{buyer.dispose();await sellerRelease();await buyerRelease();}};
  }});
  console.log(JSON.stringify({status:result.status,operationId:result.operationId,phase:result.phase,transactionHash:result.transactionHash,deliverySha256:result.deliverySha256,totals:result.controller.totals,uncertain:result.controller.uncertain,automaticRetries:0}));
 }finally{password.fill(0);await release?.();controlStore?.dispose();buyerStore?.dispose();sellerStore?.dispose();secret=undefined;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({status:'STOPPED',code:/^[A-Z][A-Z0-9_:.-]+$/.test(error.message)?error.message:'OPEN_ACCEPTANCE_UNCONFIRMED',next:'Preserve controller and original encrypted intents. Recovery reads only; never repost payment or reexecute provider.'}));process.exitCode=1;});
