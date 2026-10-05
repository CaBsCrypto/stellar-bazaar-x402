import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Keypair,Networks} from '@stellar/stellar-sdk';
import {basicNodeSigner} from '@stellar/stellar-sdk/contract';
import {assertX402ExecutionGate} from './x402-acceptance-manifest.mjs';
import {loadPacket,savePacket,packetDirectory,packetPath} from './marketplace-private-packet.mjs';
import {assertX402RuntimePolicy,newX402HostedReport,createX402HostedRuntime,acquireX402RunLock,x402PublicHash,preservePendingX402Counters,assertX402HostedReport} from './x402-hosted-runtime.mjs';
import {createMarketplaceBuyerIntent,runMarketplaceBuyerIntent,recoverBuyerIntent,createBuyerSpendBudget,buyerCanonical,buyerIdentity} from '../examples/marketplace-x402-buyer.mjs';
import {createGuionistaIntent,executeGuionistaIntent,failGuionistaIntent} from '../examples/guionista-marketplace-worker.mjs';
import {withProtectedPrivateMcp} from '../examples/protected-preview-client.mjs';
import {verifyHostedBuyerContracts,verifyHostedSellerReplays} from './x402-hosted-contract-checks.mjs';

const root=resolve('docs/evidence/sprint-x402-agent');
const defaults={manifest:join(root,'acceptance-manifest.json'),local:join(root,'native-local.json'),capture:join(root,'capture-preflight-public.json'),hostedCapture:join(root,'hosted-browser-capture-public.json'),report:join(packetDirectory,'x402-hosted-agent-http.json')};
const readJson=async path=>{const bytes=await readFile(path);assert.ok(bytes.length<=2097152,'PUBLIC_ARTIFACT_TOO_LARGE');return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));};
const optionalJson=async path=>{try{return await readJson(path);}catch(error){if(error.code==='ENOENT')return undefined;throw error;}};
const exactOrigin=value=>{const u=new URL(value);assert.ok(u.origin===value&&u.protocol==='https:'&&u.pathname==='/'&&!u.username&&!u.password&&!u.search&&!u.hash,'EXACT_ORIGIN_REQUIRED');return u.origin;};
const applicationOrigin=deployment=>{assert.ok(deployment&&/^dpl_[A-Za-z0-9]+$/.test(deployment.id??''),'DEPLOYMENT_ID_REQUIRED');const origin=exactOrigin(deployment.origin??deployment.url?.replace(/\/$/,''));assert.match(origin,/^https:\/\/stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/,'EXACT_PROTECTED_PREVIEW_REQUIRED');return origin;};
const mustComplete=(section,phases)=>assert.ok(phases.every(phase=>section.completed.includes(phase)),'PREVIOUS_CONFIRMED_PHASE_REQUIRED');

const writeDurableReport=async(path,value)=>{const file=await open(path,'w',0o600);try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}};
const saveDurablePacket=async packet=>{await savePacket(packet);const file=await open(packetPath,'r+');try{await file.sync();}finally{await file.close();}};
/** Public evidence may change between phases. Executable source/config must match HEAD exactly. */
export async function currentX402SourceBinding(manifest){
 const run=promisify(execFile),options={cwd:process.cwd(),windowsHide:true,maxBuffer:1048576};
 const [{stdout:sha},{stdout:dirty}]=await Promise.all([run('git',['rev-parse','HEAD'],options),run('git',['status','--porcelain','-z','--untracked-files=all'],options)]);
 const entries=dirty.split('\0').filter(Boolean),dirtySourceFiles=[],publicArtifactChanges=[];
 for(let i=0;i<entries.length;i++){
  const record=entries[i],paths=[record.slice(3)];if(/[RC]/.test(record.slice(0,2)))paths.push(entries[++i]);
  for(const path of paths){
   // Existing public evidence and prose stay outside the executable upload.
   // Code, scripts and configuration inside docs are still source changes.
   let publicArtifact=/^docs\//.test(path??'')&&(/\.md$/i.test(path)||/^docs\/(evidence|review)\//.test(path)&&/\.(json|har|txt|png|jpg|webp|csv)$/i.test(path));
   const retainedHash=manifest?.sourceBinding?.allowedHistoricalArtifacts?.[path];
   if(!publicArtifact&&/^docs\/(evidence|review)\//.test(path??'')&&/^[a-f0-9]{64}$/.test(retainedHash??'')){
    const bytes=await readFile(path);assert.ok(bytes.length<=2097152,'HISTORICAL_ARTIFACT_TOO_LARGE');publicArtifact=x402PublicHash(bytes)===retainedHash;
   }
   (publicArtifact?publicArtifactChanges:dirtySourceFiles).push(path);
  }
 }
 return {sha:sha.trim(),clean:dirtySourceFiles.length===0,dirtySourceFiles,publicArtifactChanges};
}

export function assertHostedX402Preflight({manifest,localReport,capturePreflight,hostedCapture,source,command,index,readRecovery=false}){
 // This is intentionally the first authority check: no packet, lock, signer,
 // authenticated transport, or hosted request has been constructed yet.
 assertX402ExecutionGate(manifest,{localReport,capturePreflight,hostedCapture,expectedSha:source.sha});
 assert.equal(source.clean,true,'DIRTY_SOURCE_REQUIRES_FINAL_SHA_BINDING');assertX402RuntimePolicy(manifest);
 assert.equal(manifest.runtime.localProfilesSha256,x402PublicHash(localReport.requestProfiles),'LOCAL_REQUEST_PROFILES_CHANGED');
 assert.ok(['submit','activate','buy','recover','pause','retire'].includes(command),'INVALID_COMMAND');
 const p=manifest.participants;assert.ok(Array.isArray(p)&&p.length===2&&p[0].role==='seller'&&p[1].role==='buyer'&&p[0].ownerId!==p[1].ownerId&&p[0].workspaceId!==p[1].workspaceId,'EXACT_PARTICIPANTS_REQUIRED');
 assert.deepEqual(manifest.config.identity,buyerIdentity);assert.equal(manifest.payloads.card.payment.destination,p[0].wallet);assert.equal(manifest.payloads.card.payment.amount,'0.01');
 assert.equal(x402PublicHash(buyerCanonical(manifest.payloads.card)),manifest.payloads.cardHash,'CARD_HASH_CHANGED');
 assert.equal(manifest.payloads.card.payment.marketplace.protocol,'x402-stellar-exact-v2');assert.equal(manifest.payloads.card.payment.marketplace.resourceTemplate,'/api/market/orders/{operationId}/x402');
 const app=manifest.deployments.application,origin=applicationOrigin(app);assert.equal(manifest.config.marketplaceOrigin,origin);
 const checkDeployment=d=>{applicationOrigin(d);assert.equal(d.sourceSha,manifest.sourceSha);assert.equal(d.readyState,'READY');assert.equal(d.target,'preview');assert.equal(d.protectionVerified,true);assert.equal(d.configurationVerified,true);assert.match(d.payloadFingerprint??'',/^[a-f0-9]{64}$/);assert.match(d.configurationHash??'',/^[a-f0-9]{64}$/);};checkDeployment(app);
 const provider=manifest.deployments.provider;assert.equal(exactOrigin(provider.stableAlias),manifest.config.providerOrigin);assert.equal(new URL(manifest.payloads.card.url).origin,provider.stableAlias);assert.match((command==='submit'?provider.previousDeploymentId:provider.newProofDeploymentId)??'',/^dpl_[A-Za-z0-9]+$/);assert.equal(provider.protectionVerified,true);
 const c=manifest.config,suffix=c.workspacePrefix?.slice('bazaar-workspace:'.length);assert.match(c.workspacePrefix??'',/^bazaar-workspace:pilot-[a-f0-9]{32}$/);assert.equal(c.marketPrefix,'bazaar-market:'+suffix);assert.equal(c.reviewPrefix,'bazaar-review:'+suffix);assert.equal(c.dynamicPrefix,c.marketPrefix+':catalog');
 assert.equal(c.admission,'invite-only');assert.equal(c.ownerLifetimeLimit,5);assert.equal(c.syntheticParticipants,2);assert.equal(c.invitedDevelopers,3);assert.equal(c.legacyX402Payments,false);assert.equal(c.usdt0Payments,false);
 assert.ok(Array.isArray(manifest.payloads.orders)&&manifest.payloads.orders.length===2&&new Set(manifest.payloads.orders.map(o=>o.operationId)).size===2,'TWO_FROZEN_ORDERS_REQUIRED');
 for(const o of manifest.payloads.orders){const intent=createMarketplaceBuyerIntent({origin,card:manifest.payloads.card,input:o.create.input,payer:p[1].wallet,operationId:o.operationId});assert.deepEqual(o.create,{operationId:intent.operationId,serviceId:intent.card.id,cardHash:intent.cardHash,payer:intent.payer,input:intent.input,paymentProtocol:intent.paymentProtocol});}
 if(command==='activate'){assert.equal(manifest.readiness.providerProofReady,true,'PROVIDER_CONTROL_RECORD_NOT_BOUND');assert.ok(Array.isArray(manifest.payloads.reviewActions)&&manifest.payloads.reviewActions.length===3);assert.deepEqual(manifest.payloads.reviewActions.map(a=>a.action),['verify-http','approve','activate']);}
 if(command==='buy'){
  assert.ok(index===0||index===1,'BUY_INDEX_REQUIRED');assert.equal(c.purchases,true,'PURCHASES_DISABLED');assert.equal(c.marketplaceX402,true,'X402_DISABLED');assert.equal(manifest.readiness.walletsPreflightPassed,true,'EXISTING_WALLET_PREFLIGHT_REQUIRED');assert.equal(manifest.payloads.orders[index].expected,index===0?'delivered':'delivery-failed');if(index===1)assert.ok(typeof manifest.payloads.failureReason==='string'&&manifest.payloads.failureReason.length>0);
  assert.deepEqual(manifest.runtime.contractChecksPlan,{version:1,mutations:['price','recipient','asset','network','content'],operationIds:manifest.payloads.orders.map(o=>o.operationId),timing:'after-confirmed-payment-and-terminal-delivery'},'FROZEN_HOSTED_CONTRACT_CHECKS_REQUIRED');
  for(const [name,calls]of Object.entries({'api:x402:reject-requirements':4,'api:orders:reject-content':1,'api:orders:replay':2,'api:x402:replay':2})){
   const bound=manifest.runtime.requestBudgets[name];assert.equal(bound?.maximumCalls,calls,'CONTRACT_CHECK_CALL_BUDGET_REQUIRED:'+name);assert.ok(Object.values(bound.external).every(n=>n===0),'CONTRACT_CHECK_MUST_HAVE_NO_EXTERNAL_EXECUTION');
  }
  for(const [name,calls]of Object.entries({'api:mcp:tool:claim_market_order':4,'api:mcp:tool:deliver_market_order':2,'api:mcp:tool:fail_market_order':2}))assert.equal(manifest.runtime.requestBudgets[name]?.maximumCalls,calls,'SELLER_REPLAY_BUDGET_REQUIRED:'+name);
 }
 const requiresReplacement=['pause','retire'].includes(command)||command==='recover'&&(!readRecovery||manifest.deployments.replacement);
 if(requiresReplacement){checkDeployment(manifest.deployments.replacement);assert.notEqual(manifest.deployments.replacement.id,app.id);assert.notEqual(applicationOrigin(manifest.deployments.replacement),origin);assert.equal(manifest.deployments.replacement.payloadFingerprint,app.payloadFingerprint,'REPLACEMENT_SOURCE_PAYLOAD_CHANGED');}
 if(command==='pause'){assert.deepEqual(manifest.payloads.pause,{action:'pause'});assert.equal(manifest.payloads.pauseCreate.operationId,manifest.payloads.pauseOperationId);assert.ok(manifest.payloads.pauseWorkspaceProbe,'FROZEN_ADMISSION_PAUSE_PROBE_REQUIRED');}
 if(command==='retire'){
  assert.equal(manifest.readiness.canRetireSynthetic,true,'RETIREMENT_GATE_CLOSED');assert.equal(manifest.readiness.independentReviewPassed,true,'INDEPENDENT_REVIEW_REQUIRED');
  assert.equal(hostedCapture?.status,'PASS_BROWSER_NETWORK_CAPTURE');assert.equal(hostedCapture.captureComplete,true);assert.equal(hostedCapture.coverage?.httpRetries,0);assert.equal(manifest.browserAcceptance.nativeZoom200,'PASS');
  assert.equal(x402PublicHash(hostedCapture),manifest.browserAcceptance.hostedCaptureSha256);assert.equal(hostedCapture.binding.planId,manifest.planId);assert.equal(hostedCapture.binding.sourceSha,manifest.sourceSha);assert.equal(hostedCapture.binding.deploymentId,manifest.deployments.replacement.id);assert.equal(hostedCapture.binding.origin,applicationOrigin(manifest.deployments.replacement));
  assert.equal(manifest.payloads.closure.revokeOwnerId,p[0].ownerId);assert.equal(manifest.payloads.closure.preserveOwnerId,p[1].ownerId);assert.deepEqual(manifest.payloads.revocation,{action:'revoke',expectedGeneration:3});
 }
 return {origin,replacement:requiresReplacement?applicationOrigin(manifest.deployments.replacement):undefined,providerOrigin:provider.stableAlias};
}

/** Dependency injection exists solely for offline fail-closed tests. */
export async function runHostedX402Agent({command,index,paths=defaults,dependencies={}}){
 const read=dependencies.readJson??readJson,optional=dependencies.optionalJson??optionalJson;
 const [m,localReport,capturePreflight,hostedCapture,previousReport]=await Promise.all([read(paths.manifest),read(paths.local),read(paths.capture),optional(paths.hostedCapture),optional(paths.report)]);
 const source=await(dependencies.sourceBinding??currentX402SourceBinding)(m);
 const uncertain=previousReport?.status==='UNCERTAIN'||previousReport?.attempts?.some(a=>a.status==='PENDING'),readRecovery=command==='recover'&&uncertain;
 const origins=assertHostedX402Preflight({manifest:m,localReport,capturePreflight,hostedCapture,source,command,index,readRecovery});
 if(previousReport)assertX402HostedReport(previousReport,m);
 if(uncertain)assert.ok(readRecovery&&m.readiness.canReadRecovery===true,'UNCERTAIN_STOP_NO_NEW_EFFECTS');
 const lock=await(dependencies.acquireLock??acquireX402RunLock)(packetDirectory,m.planId,{readRecovery});
 let report=previousReport??newX402HostedReport(m),packet,section,runtime,readSucceeded=false;const firstAttempt=report.attempts.length;
 try{
  assert.equal(report.planId,m.planId);assert.equal(report.sourceSha,m.sourceSha);assert.equal(report.automaticRetries,0);
  if(readRecovery)preservePendingX402Counters(report);
  assertX402HostedReport(report,m);
  packet=await(dependencies.loadPacket??loadPacket)();const originalSaleHash=x402PublicHash(buyerCanonical(packet.sale));
  for(let i=0;i<2;i++){assert.equal(packet.receipt?.[i]?.ownerId,m.participants[i].ownerId);assert.equal(packet.receipt[i].workspaceId,m.participants[i].workspaceId);}
  const coreHash=x402PublicHash(buyerCanonical({planId:m.planId,sourceSha:m.sourceSha,payloadsSha256:m.payloadsSha256,participants:m.participants,identity:m.config.identity,workspacePrefix:m.config.workspacePrefix,marketPrefix:m.config.marketPrefix,providerOrigin:m.config.providerOrigin}));
  section=packet.x402;
  if(!section){assert.equal(command,'submit','INITIAL_PHASE_MUST_BE_SUBMIT');section=packet.x402={version:1,planId:m.planId,sourceSha:m.sourceSha,coreHash,startedPhases:[],completed:[],buyerIntents:[],workerIntents:[],spendReservations:[],orders:[],histories:{}};}
  assert.equal(section.version,1);assert.equal(section.planId,m.planId);assert.equal(section.sourceSha,m.sourceSha);assert.equal(section.coreHash,coreHash,'EXISTING_INTENT_MANIFEST_CHANGED');
  const phase=command==='buy'?'buy-'+(index+1):command;assert.ok(!section.completed.includes(phase)||command==='recover','COMPLETED_EFFECT_MUST_NOT_BE_REPLAYED');assert.ok(!section.startedPhases.includes(phase)||command==='recover','STARTED_PHASE_REQUIRES_EXPLICIT_SUPPORT_RECOVERY');
  const persistPacket=async()=>{assert.equal(x402PublicHash(buyerCanonical(packet.sale)),originalSaleHash,'HISTORICAL_SALE_MUST_REMAIN_EXACT');try{await(dependencies.savePacket??saveDurablePacket)(packet);}catch{report.status='UNCERTAIN';throw Error('PRIVATE_JOURNAL_UNCONFIRMED');}};
  const persist=async value=>{assert.equal(value.planId,m.planId);try{await(dependencies.writeReport??(v=>writeDurableReport(paths.report,v)))(value);}catch{report.status='UNCERTAIN';throw Error('COUNTER_JOURNAL_UNCONFIRMED');}};
  if(command!=='recover')section.startedPhases.push(phase);
  await persistPacket();await persist(report);
  runtime=createX402HostedRuntime({manifest:m,report,persist,phase,fetchImpl:dependencies.fetchImpl??fetch,readRecovery});
  const privateSale=packet.sale;assert.equal(privateSale.providerOrigin,origins.providerOrigin);
  const a=packet.identities[0],b=packet.identities[1],aHuman=a.rotatedHuman,aAgent=a.rotatedAgent;
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(aHuman)&&/^[A-Za-z0-9_-]{43}$/.test(aAgent)&&/^[A-Za-z0-9_-]{43}$/.test(b.human)&&/^[A-Za-z0-9_-]{43}$/.test(b.agent),'EXISTING_ACCESS_REQUIRED');
  const origin=origins.replacement??origins.origin,deployment=origins.replacement?m.deployments.replacement:m.deployments.application;
  const appFetch=await runtime.preview(origin,privateSale.bazaarBypass,deployment.id);
  const http=async(path,token,body,expected=200,at={origin,fetcher:appFetch})=>{const response=await at.fetcher(at.origin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(response.status,expected,'EXPECTED_HTTP_STATUS_NOT_CONFIRMED');return response.json();};
  const orders='/api/market/orders',services='/api/market/services';
  if(command==='submit'){
   const listings=await http(services,aHuman);if(listings.paused){assert.deepEqual(m.payloads.resume,{action:'resume'});await http('/api/market/control',privateSale.operator,m.payloads.resume);}
   const result=await http(services,aHuman,m.payloads.submission,201);assert.equal(result.submission.card.id,m.payloads.serviceId);assert.equal(result.submission.status,'awaiting-control-proof');assert.match(result.submission.control.expectedRecord,/^stellar-bazaar-verification=[A-Za-z0-9_-]{24}$/);
   section.submission=result.submission;await persistPacket();report.submission={submissionId:m.payloads.submissionId,cardHash:m.payloads.cardHash,expectedRecord:result.submission.control.expectedRecord,resultHash:x402PublicHash(buyerCanonical(result.submission))};
  }else if(command==='activate'){
   mustComplete(section,['submit']);assert.equal(m.runtime.providerProof?.submissionId,m.payloads.submissionId);assert.equal(m.runtime.providerProof?.origin,origins.providerOrigin);assert.equal(m.runtime.providerProof?.deploymentId,m.deployments.provider.newProofDeploymentId);assert.equal(m.runtime.providerProof?.expectedRecordSha256,x402PublicHash(section.submission.control.expectedRecord),'CONTROL_PROOF_BINDING_REQUIRED');
   for(const action of m.payloads.reviewActions){assert.equal(action.submissionId,m.payloads.submissionId);await http('/api/market/review',privateSale.operator,action);}
   const listings=await http(services,b.agent);const active=listings.services.find(s=>s.card.id===m.payloads.serviceId);assert.equal(active?.cardHash,m.payloads.cardHash);assert.equal(active.purchase.protocol,'x402-stellar-exact-v2');assert.equal(active.purchase.orderCreateUrl,origin+orders);
  }else if(command==='buy'){
   mustComplete(section,index===0?['activate']:['buy-1']);assert.equal(section.buyerIntents[index],undefined,'BUY_INTENT_ALREADY_EXISTS_USE_RECOVERY');assert.equal(section.spendReservations.length,index,'SPEND_JOURNAL_OUT_OF_SEQUENCE');assert.equal(report.totals.paymentSubmissionIntents,index,'PAYMENT_COUNTER_OUT_OF_SEQUENCE');
   const frozen=m.payloads.orders[index],intent=createMarketplaceBuyerIntent({origin,card:m.payloads.card,input:frozen.create.input,payer:m.participants[1].wallet,operationId:frozen.operationId});section.buyerIntents[index]=intent;await persistPacket();
   const key=Keypair.fromSecret(privateSale.wallets[1].secret);assert.equal(key.publicKey(),m.participants[1].wallet);
   const spend=createBuyerSpendBudget({maximumAtomic:m.config.maximumSpendAtomic,reservations:section.spendReservations,persistReservations:async reservations=>{await runtime.reservePayment();section.spendReservations=reservations;await persistPacket();}});
   const options={marketFetch:appFetch,agentToken:b.agent,persistIntent:async value=>{section.buyerIntents[index]=value;await persistPacket();},signer:{address:key.publicKey(),...basicNodeSigner(key,Networks.TESTNET)},rpcFetch:await runtime.rpc(),rpcUrl:m.config.rpcOrigin,reserveSpend:value=>spend.reserve(value)};
   const paid=await runMarketplaceBuyerIntent(intent,options);assert.equal(paid.order.phase,'paid');assert.equal(paid.order.buyerOwnerId,m.participants[1].ownerId);assert.equal(paid.order.sellerOwnerId,m.participants[0].ownerId);
   const worker=createGuionistaIntent({...frozen,serviceId:m.payloads.serviceId,cardHash:m.payloads.cardHash,providerOrigin:origins.providerOrigin});section.workerIntents[index]=worker;await persistPacket();
   const providerFetch=await runtime.provider(origins.providerOrigin,privateSale.providerBypass,m.deployments.provider.newProofDeploymentId);
   await(dependencies.withMcp??withProtectedPrivateMcp)(origin,aAgent,appFetch,async client=>{
    const workerOptions={persistIntent:async value=>{section.workerIntents[index]=value;await persistPacket();},callTool:(name,args)=>client.callTool({name,arguments:args},undefined,{timeout:12000}),providerFetch,providerToken:privateSale.worker};
    const delivered=index===0?await executeGuionistaIntent(worker,workerOptions):await failGuionistaIntent(worker,workerOptions,m.payloads.failureReason);assert.equal(delivered.phase,frozen.expected);if(index===0)assert.equal(delivered.delivery.sha256,x402PublicHash(delivered.delivery.text));else assert.equal(delivered.delivery,undefined);
    report.contractChecks??=[];
    report.contractChecks[index]={seller:await verifyHostedSellerReplays({worker,order:delivered,client,failureReason:m.payloads.failureReason})};
   });
   const buyer=(await http(orders+'/'+frozen.operationId,b.agent)).order,seller=(await http(orders+'/'+frozen.operationId,aAgent)).order;assert.deepEqual(seller,buyer);assert.equal(buyer.phase,frozen.expected);section.orders[index]=buyer;
   section.contractChecks??=[];section.contractChecks[index]={phase:'started'};await persistPacket();
   const contractFetch=await runtime.contractPreview(origin,privateSale.bazaarBypass,m.deployments.application.id,{intent,create:frozen.create,order:buyer});
   report.contractChecks[index].buyer=await verifyHostedBuyerContracts({intent,create:frozen.create,order:buyer,fetcher:contractFetch,agentToken:b.agent,includeMutations:index===0});
   section.contractChecks[index]={phase:'verified',...report.contractChecks[index]};await persistPacket();
   await http(orders+'/'+frozen.operationId,'q'.repeat(43),undefined,401);section.histories={a:(await http(orders,aHuman)).orders,b:(await http(orders,b.human)).orders};
   assert.ok(section.histories.b.some(o=>o.operationId===frozen.operationId));for(const priorId of m.payloads.priorOperationIds)assert.ok(section.histories.b.some(o=>o.operationId===priorId),'HISTORICAL_ORDER_MISSING');await persistPacket();
  }else if(command==='recover'){
   if(!readRecovery)mustComplete(section,['buy-1','buy-2']);assert.ok(section.buyerIntents.length>0,'NO_INTENT_TO_RECOVER');
   for(const [i,intent]of section.buyerIntents.entries()){
    const order=await recoverBuyerIntent(intent,{marketFetch:appFetch,agentToken:b.agent,recoveryOrigin:origin,allowedRecoveryOrigins:[origin],persistIntent:async value=>{section.buyerIntents[i]=value;await persistPacket();}});
    if(section.orders[i])assert.deepEqual(order,section.orders[i],'REPLACEMENT_ORDER_CHANGED');else section.recoveredOrders??=[],section.recoveredOrders[i]=order;
   }
   if(!readRecovery){assert.deepEqual((await http(orders,aHuman)).orders,section.histories.a);assert.deepEqual((await http(orders,b.human)).orders,section.histories.b);}else report.recovery={readOnly:true,originalUncertaintyPreserved:true,orders:section.recoveredOrders?.map(o=>({operationId:o.operationId,phase:o.phase,transactionHash:o.transactionHash}))};
  }else if(command==='pause'){
   mustComplete(section,['buy-1','buy-2','recover']);await http('/api/market/control',privateSale.operator,m.payloads.pause);await http(orders,b.agent,m.payloads.pauseCreate,503);
   assert.deepEqual(m.payloads.pauseWorkspaceProbe,packet.pauseProbe,'FROZEN_ADMISSION_PROBE_CHANGED');await http('/api/workspaces',b.bootstrap,m.payloads.pauseWorkspaceProbe,503);
   for(const order of section.orders)assert.deepEqual((await http(orders+'/'+order.operationId,b.agent)).order,order);
   const old={origin:origins.origin,fetcher:await runtime.preview(origins.origin,privateSale.bazaarBypass,m.deployments.application.id)};
   await http(orders,b.agent,m.payloads.pauseCreate,503,old);await http('/api/workspaces',b.bootstrap,m.payloads.pauseWorkspaceProbe,503,old);assert.deepEqual((await http(orders,b.human,undefined,200,old)).orders,section.histories.b);
  }else{
   mustComplete(section,['buy-1','buy-2','recover','pause']);const retireIds=m.payloads.closure.withdrawServiceIds;assert.ok(Array.isArray(retireIds)&&retireIds.includes(m.payloads.serviceId));
   const listings=await http(services,aHuman);for(const id of retireIds){const mine=listings.mine?.find(s=>s.card.id===id);assert.ok(mine?.submissionId,'RETIRE_SUBMISSION_NOT_OWNED');await http(services+'/'+mine.submissionId,aHuman,{action:'withdraw'});}
   await http('/api/workspaces/'+m.participants[0].workspaceId+'/access',a.bootstrap,m.payloads.revocation);await http(orders,aHuman,undefined,401);await http(orders,aAgent,undefined,401);assert.deepEqual((await http(orders,b.human)).orders,section.histories.b);report.syntheticRetirement={sellerOwnerId:m.participants[0].ownerId,buyerOwnerId:m.participants[1].ownerId,expectedGeneration:3,historicalRecordsPreserved:true};
  }
  if(!readRecovery&&!section.completed.includes(phase))section.completed.push(phase);await persistPacket();report.phases.push({phase,deploymentId:deployment.id,passed:true,readOnly:readRecovery});if(!readRecovery)report.status='PASS_EXECUTED_PHASES';await persist(report);await runtime.drain();
  readSucceeded=readRecovery;return {status:readRecovery?'PASS_READ_RECOVERY_UNCERTAINTY_PRESERVED':'PASS',phase,planId:m.planId,sourceSha:m.sourceSha,deploymentId:deployment.id,totals:report.totals,automaticRetries:0,productionChanges:0,invitationMessages:0};
 }catch(error){
  const uncertainIntent=[...(section?.buyerIntents??[]),...(section?.workerIntents??[])].some(i=>/uncertain|started$/.test(i.phase));
  if(report.status!=='UNCERTAIN')report.status=uncertainIntent||report.attempts.some(a=>a.status==='PENDING')?'UNCERTAIN':'FAILED_CONFIRMED';
  await(dependencies.writeReport??(v=>writeDurableReport(paths.report,v)))(report);throw Error('HOSTED_PHASE_NOT_COMPLETED_PRESERVE_INTENTS');
 }finally{
  if(readSucceeded&&report.attempts.slice(firstAttempt).every(a=>a.status==='CONFIRMED'))await lock.release();
  else if(report.status==='UNCERTAIN'||report.attempts.some(a=>a.status==='PENDING'))await lock.preserve();else await lock.release();
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [command,selection]=process.argv.slice(2);const index=command==='buy'?Number(selection)-1:undefined;
 runHostedX402Agent({command,index}).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('X402 acceptance is closed or the phase is unconfirmed. Preserve the original manifest, counters and encrypted intents. No automatic retry.');process.exitCode=1;});
}
