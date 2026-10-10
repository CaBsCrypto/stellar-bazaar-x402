// Explicit operator preparation for synthetic Preview H2/H3. No signer,
// PAYMENT-SIGNATURE, provider execution, R2 upload or production operation.
import {readFile,writeFile,unlink,realpath,rename,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {StrKey} from '@stellar/stellar-sdk';
import {decodePaymentRequiredHeader} from '@x402/core/http';
import {assertSellerCard,sellerCanonical,sellerHash} from '../examples/seller-service-card.mjs';
import {createMarketplaceBuyerIntent} from '../examples/marketplace-x402-buyer.mjs';
import {marketAmountAtomic} from '../examples/market-price.mjs';

const execute=promisify(execFile),uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const steps=['grant','submit','submission','verify-control','approve','activate','order','order-read','inspect402','reject-unpaid','catalog-check','status','withdraw'];
const readSteps=new Set(['submission','order-read','catalog-check','status']);
const toolNames=new Set(['get_market_submission','submit_market_service','list_market_services','create_market_order','get_market_order','claim_market_order','prepare_market_delivery']);
const safeCodes=new Set(['PRIVATE_PATH_REQUIRED','SYMLINK_FORBIDDEN','PRIVATE_ARTIFACT_TOO_LARGE','PRIVATE_JSON_INVALID','PREVIEW_ORIGIN_REQUIRED','REQUEST_SCOPE_FORBIDDEN','UNSIGNED_402_ONLY','TOOL_SCOPE_FORBIDDEN','PRIVATE_ACCESS_INVALID','HTTP_STATUS_INVALID','HTTP_JSON_REQUIRED','HTTP_OUTCOME_UNCONFIRMED','MCP_RESPONSE_INVALID','MCP_TOOL_CONTRACT_INVALID','MCP_ACTION_REJECTED','DEPLOYED_MCP_MISMATCH','DEPLOYED_NAMESPACE_MISMATCH','ACCOUNT_IDENTITY_MISMATCH','ORDER_BINDING_MISMATCH','SUBMISSION_BINDING_MISMATCH','PERMISSION_READ_FAILED','PERMISSION_GRANT_UNCONFIRMED','EXPLICIT_REVIEW_REASON_REQUIRED','VERIFIED_CONTROL_REQUIRED','OPERATOR_REVIEW_UNCONFIRMED','ACTIVE_REVIEWED_SERVICE_REQUIRED','UNPAID_ORDER_REQUIRED','HTTP_402_REQUIRED','PAYMENT_REQUIRED_INVALID','PAYMENT_TERMS_MISMATCH','UNPAID_CLAIM_NOT_REJECTED','UNPAID_FILES_NOT_REJECTED','UNPAID_ORDER_WAS_MUTATED','LOCAL_EXECUTION_REQUIRED','LOCAL_PRIVATE_ARTIFACT_UNAVAILABLE','EXPLICIT_MODE_AND_CONFIG_REQUIRED','EXPLICIT_STEP_REQUIRED','PLAN_CONFIGURATION_INVALID','PRIVATE_ARTIFACT_COLLISION','BAZAAR_PREVIEW_CONFIG_INVALID','BASELINE_NAMESPACE_MISMATCH','BASELINE_CREDENTIALS_MISMATCH','EXISTING_ACCOUNT_REQUIRED','SEPARATE_BUYER_SELLER_REQUIRED','FROZEN_CARD_HASH_REQUIRED','BUYER_PUBLIC_INTENT_REQUIRED','SUBMISSION_ID_INVALID','STEP_NOT_AUTHORIZED','FROZEN_STATE_CHANGED','STATE_IDENTIFIERS_INVALID','BASELINE_CREDENTIALS_CHANGED','EVIDENCE_BINDING_MISMATCH','LOCAL_OUTPUT_PATH_REQUIRED','ARGUMENT_NOT_ALLOWED']);
const temporary=new Set(),checks=[];let privateRoot,requests=0,stage='configuration',networkUsed=false;
for(const code of ['QUERY_CONTEXT_INVALID','CONFIGURATION_SNAPSHOT_INVALID','QUERY_HISTORY_INVALID','CATALOG_BINDING_MISMATCH','CATALOG_QUERY_NOT_RECORDED','CATALOG_QUERY_REPLAY_CHANGED','QUERY_HISTORY_ISOLATION_FAILED','SERVICE_WITHDRAWAL_UNCONFIRMED'])safeCodes.add(code);
const configurationCheckNames=['publicDemo','workspacesEnabled','marketplaceEnabled','publicAdmission','newAdmissionsOpen','workspaceRedisBackend','workspaceRedisUrl','workspaceRedisToken','workspaceNamespace','marketNamespace','reviewRedisBackend','reviewRedisUrl','reviewRedisToken','reviewNamespace','namespacesIndependent','namespaceFamilyMatches','namespaceStageMatches','publicOrigin','providerIntakeEnabled','reviewSecret','manualOperator','guardianCronCredential','guardianCronMatchesOperator','purchasesEnabled','x402Enabled','testnetFacilitator','facilitatorCredential','testnetRpc','noServerPayer','r2Bucket','r2Region','r2Endpoint','r2AccessKey','r2SecretKey','fileNamespace','privateFilesEnabled','fileLifecycleBackstop'];
const featureNames=['registration','catalogue','serviceSubmission','moderation','guardianAutomation','purchases','privateFiles'];
const featureReasons=new Set(['WORKSPACE_CONFIGURATION_INCOMPLETE','PUBLIC_DEMO_DISABLED','REGISTRATION_NOT_PUBLIC','ADMISSIONS_PAUSED','MARKET_CONFIGURATION_INCOMPLETE','PROVIDER_INTAKE_DISABLED','PROVIDER_REVIEW_CONFIGURATION_INCOMPLETE','OPERATOR_CONFIGURATION_INCOMPLETE','GUARDIAN_CRON_CONFIGURATION_INCOMPLETE','GUARDIAN_SCHEDULER_PRODUCTION_ONLY','PURCHASES_DISABLED','SERVER_PAYER_FORBIDDEN','X402_CONFIGURATION_INCOMPLETE','FILE_STORAGE_DISABLED','FILE_NAMESPACE_REQUIRED','FILE_LIFECYCLE_BACKSTOP_REQUIRED','PRIVATE_FILES_NOT_CONFIGURED']);
const digest=value=>createHash('sha256').update(value).digest('hex');
function must(value,code){if(!value)throw Object.assign(Error('H2/H3 validation stopped'),{safeCode:code});}
function effectiveConfiguration(value){
 const cronNames=['credentialConfigured','operatorHashMatches','productionDeployment','scheduledExecutionValidated'];
 must(value&&configurationCheckNames.every(name=>typeof value.checks?.[name]==='boolean')&&featureNames.every(name=>typeof value.features?.[name]?.enabled==='boolean')&&typeof value.r2Configured==='boolean'&&cronNames.every(name=>typeof value.guardianCron?.[name]==='boolean'),'CONFIGURATION_SNAPSHOT_INVALID');
 return {checks:Object.fromEntries(configurationCheckNames.map(name=>[name,value.checks[name]])),features:Object.fromEntries(featureNames.map(name=>{const f=value.features[name];return [name,{enabled:f.enabled,reason:f.reason===null?null:featureReasons.has(f.reason)?f.reason:'UNRECOGNIZED_CONFIGURATION_REASON'}];})),r2Configured:value.r2Configured,guardianCron:Object.fromEntries(cronNames.map(name=>[name,value.guardianCron[name]]))};
}
async function privatePath(name,{existing=false}={}){
 const path=resolve(name??''),local=relative(privateRoot,path);
 must(local&&!isAbsolute(local)&&local!=='..'&&!local.startsWith('..'+sep),'PRIVATE_PATH_REQUIRED');
 const parent=await realpath(resolve(path,'..'));must(parent===resolve(path,'..'),'SYMLINK_FORBIDDEN');
 if(existing){must((await lstat(path)).isFile()&&await realpath(path)===path,'SYMLINK_FORBIDDEN');}
 else try{must(!(await lstat(path)).isSymbolicLink(),'SYMLINK_FORBIDDEN');}catch(error){if(error.code!=='ENOENT')throw error;}
 return path;
}
async function json(path){const raw=await readFile(path);must(raw.length<=262144,'PRIVATE_ARTIFACT_TOO_LARGE');try{return JSON.parse(raw);}catch{must(false,'PRIVATE_JSON_INVALID');}}
async function save(path,value){
 const temp=await privatePath(path+'.'+randomUUID()+'.pending');temporary.add(temp);
 await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temp,path);temporary.delete(temp);
}
function previewOrigin(raw){
 let url;try{url=new URL(raw);}catch{must(false,'PREVIEW_ORIGIN_REQUIRED');}
 must(url.protocol==='https:'&&url.origin===raw&&!url.username&&!url.password&&!url.search&&!url.hash&&/^stellar-bazaar-x402-[a-z0-9-]+\.vercel\.app$/.test(url.hostname),'PREVIEW_ORIGIN_REQUIRED');return raw;
}
async function request(context,path,{token,body,queryId}={}){
 const orderPath='/api/market/orders/'+context.state.operationId;
 const validGet=['/api/mcp','/api/account/identity','/api/account/queries','/api/market/guardian','/api/market/catalog','/api/market/agent-permissions',orderPath].includes(path);
 const validPost=['/api/mcp','/api/market/agent-permissions','/api/market/review',orderPath+'/x402','/api/market/services/'+context.state.submissionId].includes(path);
 must(body===undefined?validGet:validPost,'REQUEST_SCOPE_FORBIDDEN');
 if(path===orderPath+'/x402')must(sellerCanonical(body)==='{}'&&token===context.accounts.a.tokens.agent,'UNSIGNED_402_ONLY');
 if(path==='/api/mcp'&&body!==undefined)must(body.method==='tools/call'&&toolNames.has(body.params?.name),'TOOL_SCOPE_FORBIDDEN');
 if(queryId!==undefined)must(path==='/api/mcp'&&body?.params?.name==='list_market_services'&&token===context.accounts.a.tokens.agent&&uuid.test(queryId),'QUERY_CONTEXT_INVALID');
 must(token===undefined||/^[A-Za-z0-9_-]{43}$/.test(token),'PRIVATE_ACCESS_INVALID');
 const name=randomUUID(),headers=await privatePath('.vercel/h2-h3-'+name+'.headers'),payload=await privatePath('.vercel/h2-h3-'+name+'.json'),responseHeaders=await privatePath('.vercel/h2-h3-'+name+'.response-headers');
 temporary.add(headers);temporary.add(responseHeaders);
 await writeFile(headers,['Accept: application/json, text/event-stream',...(token?['Authorization: Bearer '+token]:[]),...(queryId?['X-Bazaar-Query-Id: '+queryId]:[]),...(body===undefined?[]:['Content-Type: application/json'])].join('\n'),{flag:'wx',mode:0o600});
 await writeFile(responseHeaders,'',{flag:'wx',mode:0o600});
 const args=[context.cli,'curl',path,'--deployment',context.origin,'--','--silent','--show-error','--max-time','25','--proto','=https','--header','@'+headers,'--dump-header',responseHeaders,'--write-out','\n%{http_code}'];
 if(body!==undefined){temporary.add(payload);await writeFile(payload,JSON.stringify(body),{flag:'wx',mode:0o600});args.push('--data-binary','@'+payload);}
 networkUsed=true;requests++;
 try{
  const {stdout}=await execute(process.execPath,args,{cwd:process.cwd(),timeout:45000,maxBuffer:1024*1024,windowsHide:true});
  const at=stdout.lastIndexOf('\n'),status=Number(stdout.slice(at+1));must(Number.isInteger(status)&&status>=100&&status<=599,'HTTP_STATUS_INVALID');
  let value;try{value=JSON.parse(stdout.slice(0,at));}catch{must(false,'HTTP_JSON_REQUIRED');}
  const blocks=(await readFile(responseHeaders,'utf8')).trim().split(/\r?\n\r?\n/),last=blocks.filter(block=>/^HTTP\//.test(block)).at(-1)??'',safeHeaders={};
  for(const line of last.split(/\r?\n/).slice(1)){const p=line.indexOf(':');if(p>0&&line.slice(0,p).toLowerCase()==='payment-required')safeHeaders.paymentRequired=line.slice(p+1).trim();}
  return {status,value,headers:safeHeaders};
 }catch(error){if(safeCodes.has(error.safeCode))throw error;must(false,'HTTP_OUTCOME_UNCONFIRMED');}
 finally{for(const path of [headers,payload,responseHeaders])try{await unlink(path);temporary.delete(path);}catch(error){if(error.code==='ENOENT')temporary.delete(path);}}
}
let rpc=0;
async function tool(context,name,args,token,queryId){
 const response=await request(context,'/api/mcp',{token,queryId,body:{jsonrpc:'2.0',id:++rpc,method:'tools/call',params:{name,arguments:args}}});
 if([401,403].includes(response.status))return {status:response.status,isError:true,value:response.value};
 must(response.status===200&&response.value.result&&!response.value.error,'MCP_RESPONSE_INVALID');
 const result=response.value.result;let value;
 try{value=result.structuredContent??JSON.parse(result.content.find(item=>item.type==='text').text);}catch{must(false,'MCP_TOOL_CONTRACT_INVALID');}
 must(value&&typeof value==='object'&&!Array.isArray(value)&&Number.isInteger(value.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599&&typeof result.isError==='boolean'&&result.isError===(value.httpStatus<200||value.httpStatus>=300),'MCP_TOOL_CONTRACT_INVALID');
 return {status:value.httpStatus,isError:result.isError,value};
}
async function success(context,name,args,token,queryId){const result=await tool(context,name,args,token,queryId);must(!result.isError&&result.status>=200&&result.status<300,'MCP_ACTION_REJECTED');return result.value;}
function binding(context){return {version:1,purpose:'bazaar-h2-h3-nonpayment-preview',origin:context.origin,candidate:context.bazaar.candidate,deploymentId:context.bazaar.deploymentId,
 namespaceFingerprints:context.bazaar.namespaceFingerprints,credentialsDigest:context.credentialsDigest,
 sellerOwnerId:context.accounts.b.record.ownerId,sellerAgentId:context.accounts.b.record.agentId,buyerOwnerId:context.accounts.a.record.ownerId,
 card:context.card,cardHash:context.cardHash,payer:context.cfg.payer,input:context.cfg.input};}
async function guard(context){
 const metadata=await request(context,'/api/mcp');must(metadata.status===200&&metadata.value.version==='1.0.0','DEPLOYED_MCP_MISMATCH');
 const guardian=await request(context,'/api/market/guardian',{token:context.bazaar.operatorToken});
 must(guardian.status===200&&Object.entries(context.bazaar.namespaceFingerprints).every(([key,value])=>guardian.value.namespaceFingerprints?.[key]===value),'DEPLOYED_NAMESPACE_MISMATCH');
 context.state.effectiveConfiguration=effectiveConfiguration(guardian.value.configuration);
 for(const [account,role]of [[context.accounts.a,'agent'],[context.accounts.b,'agent'],[context.accounts.b,'human']]){
  const identity=await request(context,'/api/account/identity',{token:account.tokens[role]});must(identity.status===200&&identity.value.ownerId===account.record.ownerId&&identity.value.agentId===account.record.agentId,'ACCOUNT_IDENTITY_MISMATCH');
 }
 checks.push('MCP_NAMESPACE_AND_TWO_ACCOUNT_IDENTITIES');
 checks.push('SANITIZED_RUNTIME_CONFIGURATION');
}
async function queryHistory(context,account){
 const response=await request(context,'/api/account/queries',{token:account.tokens.agent});
 must(response.status===200&&Array.isArray(response.value.queries)&&response.value.queries.length<=100,'QUERY_HISTORY_INVALID');
 must(response.value.queries.every(query=>query.agentId===account.record.agentId),'QUERY_HISTORY_ISOLATION_FAILED');return response.value.queries;
}
function activeCard(context,catalog){
 must(Array.isArray(catalog?.services),'CATALOG_BINDING_MISMATCH');
 const matches=catalog.services.filter(service=>service.card?.id===context.card.id);
 must(matches.length===1&&matches[0].status==='activated'&&matches[0].cardHash===context.cardHash&&sellerHash(sellerCanonical(matches[0].card))===context.cardHash&&matches[0].card.payment.amount===context.card.payment.amount,'CATALOG_BINDING_MISMATCH');return matches[0];
}
function observedQuery(context,queries){
 const matches=queries.filter(query=>query.requestId===context.state.catalogQueryId);
 must(matches.length===1&&matches[0].tool==='list_market_services'&&matches[0].agentId===context.accounts.a.record.agentId&&matches[0].outcome==='ok'&&matches[0].evidence==='bazaar-observed'&&matches[0].inputHash===digest(JSON.stringify({name:'list_market_services',arguments:{}}))&&Number.isFinite(Date.parse(matches[0].recordedAt)),'CATALOG_QUERY_NOT_RECORDED');return matches[0];
}
async function catalogCheck(context){
 const state=context.state,a=context.accounts.a,b=context.accounts.b;
 if(!state.catalogQueryId){state.catalogQueryId=randomUUID();await save(context.stateFile,state);}must(uuid.test(state.catalogQueryId),'QUERY_CONTEXT_INVALID');
 const beforeA=await queryHistory(context,a),beforeB=await queryHistory(context,b),beforeMatches=beforeA.filter(query=>query.requestId===state.catalogQueryId);
 must(beforeMatches.length<=1&&!beforeB.some(query=>query.requestId===state.catalogQueryId),'QUERY_HISTORY_ISOLATION_FAILED');
 const publicResponse=await request(context,'/api/market/catalog');must(publicResponse.status===200,'CATALOG_BINDING_MISMATCH');activeCard(context,publicResponse.value);
 const authenticated=await success(context,'list_market_services',{},a.tokens.agent,state.catalogQueryId);activeCard(context,authenticated);
 const afterA=await queryHistory(context,a),afterB=await queryHistory(context,b),query=observedQuery(context,afterA);
 must(afterA.length===Math.min(100,beforeA.length+(beforeMatches.length?0:1))&&sellerCanonical(afterB)===sellerCanonical(beforeB)&&!afterB.some(q=>q.requestId===state.catalogQueryId),'QUERY_HISTORY_ISOLATION_FAILED');
 if(beforeMatches.length)must(sellerCanonical(beforeMatches[0])===sellerCanonical(query),'CATALOG_QUERY_REPLAY_CHANGED');
 state.catalogQueryWitness={recordedAt:query.recordedAt,inputHash:query.inputHash,resultHash:query.resultHash};await save(context.stateFile,state);
 const replay=await success(context,'list_market_services',{},a.tokens.agent,state.catalogQueryId);activeCard(context,replay);
 const replayA=await queryHistory(context,a),replayB=await queryHistory(context,b);
 must(sellerCanonical(observedQuery(context,replayA))===sellerCanonical(query)&&sellerCanonical(replayA)===sellerCanonical(afterA),'CATALOG_QUERY_REPLAY_CHANGED');
 must(sellerCanonical(replayB)===sellerCanonical(beforeB)&&!replayB.some(q=>q.requestId===state.catalogQueryId),'QUERY_HISTORY_ISOLATION_FAILED');
 context.catalogEvidence={anonymousAndAuthenticatedCardMatch:true,authenticatedQueryRegisteredOnce:true,replayPreservedOriginalQuery:true,sellerHistoryIsolated:true,buyerHistoryBefore:beforeA.length,buyerHistoryAfter:afterA.length,buyerHistoryAfterReplay:replayA.length,sellerHistoryBefore:beforeB.length,sellerHistoryAfter:replayB.length};
 checks.push('ANONYMOUS_HTTP_AND_AUTHENTICATED_MCP_CATALOG_MATCH','AUTHENTICATED_CATALOG_QUERY_RECORDED_ONCE','QUERY_REPLAY_PRESERVES_ORIGINAL_TIMESTAMP','BUYER_AND_SELLER_QUERY_HISTORY_ISOLATED');
}
function boundOrder(context,order){
 must(order&&order.operationId===context.state.operationId&&order.buyerOwnerId===context.accounts.a.record.ownerId&&order.sellerOwnerId===context.accounts.b.record.ownerId&&order.serviceId===context.card.id&&order.cardHash===context.cardHash&&sellerHash(sellerCanonical(order.card))===context.cardHash&&order.payer===context.cfg.payer&&order.destination===context.card.payment.destination&&order.amount===context.card.payment.amount&&sellerCanonical(order.settlement)===sellerCanonical(context.card.payment.identity)&&order.paymentProtocol==='x402-stellar-exact-v2'&&sellerCanonical(order.input)===sellerCanonical(context.cfg.input)&&order.inputHash===digest(sellerCanonical(context.cfg.input)),'ORDER_BINDING_MISMATCH');
 return order;
}
async function submission(context){
 const body=await success(context,'get_market_submission',{submissionId:context.state.submissionId},context.accounts.b.tokens.agent);
 must(body.submission?.submissionId===context.state.submissionId&&sellerHash(sellerCanonical(body.submission.card))===context.cardHash,'SUBMISSION_BINDING_MISMATCH');
 context.state.submission=body.submission;await save(context.stateFile,context.state);return body.submission;
}
async function action(context,step){
 const state=context.state,a=context.accounts.a,b=context.accounts.b;
 await guard(context);
 if(step==='grant'){
  if(!state.permissionInput){const response=await request(context,'/api/market/agent-permissions',{token:b.tokens.human});must(response.status===200&&Number.isSafeInteger(response.value.permission?.revision),'PERMISSION_READ_FAILED');state.permissionInput={changeId:randomUUID(),expectedRevision:response.value.permission.revision,allowServiceSubmission:true};await save(context.stateFile,state);}
  const response=await request(context,'/api/market/agent-permissions',{token:b.tokens.human,body:state.permissionInput});must(response.status===200&&response.value.permission?.allowServiceSubmission===true,'PERMISSION_GRANT_UNCONFIRMED');state.permission=response.value.permission;checks.push('HUMAN_SUBMISSION_GRANT');
 }else if(step==='submit'){
  state.submissionStarted=true;await save(context.stateFile,state);
  const body=await success(context,'submit_market_service',{submissionId:state.submissionId,card:context.card,controlProof:{method:'http-well-known',domain:new URL(context.card.url).hostname}},b.tokens.agent);
  must(body.submission?.submissionId===state.submissionId&&sellerHash(sellerCanonical(body.submission.card))===context.cardHash,'SUBMISSION_BINDING_MISMATCH');state.submission=body.submission;checks.push('FROZEN_PROVIDER_SUBMISSION');
 }else if(step==='submission'){await submission(context);checks.push('EXISTING_SUBMISSION_RECOVERED');
 }else if(step==='withdraw'){
  await submission(context);
  const response=await request(context,'/api/market/services/'+state.submissionId,{token:b.tokens.human,body:{action:'withdraw'}});
  must(response.status===200&&response.value.withdrawn===true,'SERVICE_WITHDRAWAL_UNCONFIRMED');
  const withdrawn=await submission(context);must(withdrawn.status==='withdrawn','SERVICE_WITHDRAWAL_UNCONFIRMED');checks.push('OWN_SYNTHETIC_SERVICE_WITHDRAWN_ORDERS_PRESERVED');
 }else if(['verify-control','approve','activate'].includes(step)){
  const current=await submission(context);
  const body={submissionId:state.submissionId,action:{'verify-control':'verify-http',approve:'approve',activate:'activate'}[step]};
  if(step==='approve'){must(typeof context.cfg.reviewReason==='string'&&context.cfg.reviewReason.length>=1&&context.cfg.reviewReason.length<=500,'EXPLICIT_REVIEW_REASON_REQUIRED');body.reason=context.cfg.reviewReason;}
  must(step!=='approve'||current.status==='pending-manual-review'&&current.control?.status==='verified','VERIFIED_CONTROL_REQUIRED');
  state.reviewStarted=step;await save(context.stateFile,state);
  const response=await request(context,'/api/market/review',{token:context.bazaar.operatorToken,body}),expectedStatus={'verify-control':'pending-manual-review',approve:'approved-for-staging',activate:'activated'}[step];
  must(response.status===200&&response.value.submission?.submissionId===state.submissionId&&response.value.submission.status===expectedStatus&&response.value.submission.control?.status==='verified'&&sellerHash(sellerCanonical(response.value.submission.card))===context.cardHash,'OPERATOR_REVIEW_UNCONFIRMED');state.submission=response.value.submission;checks.push({'verify-control':'HTTPS_CONTROL_VERIFIED',approve:'EXPLICIT_MANUAL_APPROVAL',activate:'SERVICE_ACTIVATED'}[step]);
 }else if(step==='order'){
  const catalog=await request(context,'/api/market/catalog'),service=catalog.value.services?.find(value=>value.cardHash===context.cardHash&&value.card?.id===context.card.id&&value.status==='activated');
  must(catalog.status===200&&service&&sellerHash(sellerCanonical(service.card))===context.cardHash,'ACTIVE_REVIEWED_SERVICE_REQUIRED');
  state.orderStarted=true;await save(context.stateFile,state);
  const body=await success(context,'create_market_order',{operationId:state.operationId,serviceId:context.card.id,cardHash:context.cardHash,payer:context.cfg.payer,input:context.cfg.input,paymentProtocol:'x402-stellar-exact-v2'},a.tokens.agent);
  state.order=boundOrder(context,body.order);must(state.order.phase==='awaiting-payment'&&!state.order.paymentVerifiedAt&&!state.order.transactionHash,'UNPAID_ORDER_REQUIRED');checks.push('BOUND_UNPAID_ORDER');
 }else if(['order-read','inspect402','reject-unpaid'].includes(step)){
  const body=await success(context,'get_market_order',{operationId:state.operationId},a.tokens.agent);state.order=boundOrder(context,body.order);
  if(step==='order-read'){checks.push('EXISTING_ORDER_READ');}
  else{
   must(state.order.phase==='awaiting-payment'&&!state.order.paymentVerifiedAt&&!state.order.transactionHash&&!state.order.attemptId,'UNPAID_ORDER_REQUIRED');
   if(step==='inspect402'){
    state.challengeStarted=true;await save(context.stateFile,state);
    const response=await request(context,'/api/market/orders/'+state.operationId+'/x402',{token:a.tokens.agent,body:{}});must(response.status===402&&typeof response.headers.paymentRequired==='string','HTTP_402_REQUIRED');
    let challenge;try{challenge=decodePaymentRequiredHeader(response.headers.paymentRequired);}catch{must(false,'PAYMENT_REQUIRED_INVALID');}
    const terms=challenge?.accepts?.[0],url=context.origin+'/api/market/orders/'+state.operationId+'/x402';
    must(sellerCanonical(challenge)===sellerCanonical(response.value)&&challenge.x402Version===2&&challenge.accepts.length===1&&challenge.resource?.url===url&&challenge.resource.mimeType==='application/json'&&terms?.scheme==='exact'&&terms.network==='stellar:testnet'&&terms.asset===context.card.payment.identity.sacContract&&terms.amount===marketAmountAtomic(context.card.payment.amount)&&terms.payTo===context.card.payment.destination&&Number.isInteger(terms.maxTimeoutSeconds)&&terms.maxTimeoutSeconds>=1&&terms.maxTimeoutSeconds<=300&&terms.extra?.areFeesSponsored===true&&terms.extra.operationId===state.operationId&&terms.extra.cardHash===context.cardHash&&terms.extra.inputHash===digest(sellerCanonical(context.cfg.input))&&terms.extra.resourceUrl===url&&terms.extra.route==='/api/market/orders/'+state.operationId+'/x402'&&terms.extra.method==='POST','PAYMENT_TERMS_MISMATCH');
    state.challenge=challenge;checks.push('UNSIGNED_HTTP_402_AND_FROZEN_TERMS');
   }else{
    const claim=await tool(context,'claim_market_order',{operationId:state.operationId,attemptId:state.attemptId},b.tokens.agent);
    must(claim.isError&&claim.status===409&&claim.value.error?.code==='PAYMENT_REQUIRED','UNPAID_CLAIM_NOT_REJECTED');
    const prepare=await tool(context,'prepare_market_delivery',{operationId:state.operationId,attemptId:state.attemptId,versionId:state.versionId,files:[{id:'unpaid-synthetic',name:'unpaid-synthetic.txt',mediaType:'text/plain',size:1,sha256:digest('x')}]},b.tokens.agent);
    must(prepare.isError&&prepare.status===409&&prepare.value.error?.code==='PAYMENT_REQUIRED'&&!prepare.value.uploads,'UNPAID_FILES_NOT_REJECTED');
    const after=await success(context,'get_market_order',{operationId:state.operationId},a.tokens.agent);const order=boundOrder(context,after.order);
    must(order.phase==='awaiting-payment'&&!order.attemptId&&!order.fileDelivery&&!order.delivery,'UNPAID_ORDER_WAS_MUTATED');state.order=order;checks.push('UNPAID_CLAIM_AND_FILE_PREPARATION_REJECTED');
   }
  }
 }else if(step==='catalog-check'){await catalogCheck(context);
 }else if(step==='status'){checks.push('READ_ONLY_STATUS');}
 state.completedSteps??=[];if(!state.completedSteps.includes(step))state.completedSteps.push(step);await save(context.stateFile,state);
}
async function main(){
 try{
  must(!process.env.VERCEL&&!process.env.VERCEL_ENV,'LOCAL_EXECUTION_REQUIRED');
  const args=process.argv.slice(2);for(let i=0;i<args.length;i++){must(['--config','--step','--prepare','--execute'].includes(args[i])&&args.indexOf(args[i])===i,'ARGUMENT_NOT_ALLOWED');if(['--config','--step'].includes(args[i])){must(typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'ARGUMENT_NOT_ALLOWED');i++;}}
  const at=args.indexOf('--config'),stepAt=args.indexOf('--step'),prepare=args.includes('--prepare');
  must(at>=0&&args[at+1]&&(prepare!==args.includes('--execute')),'EXPLICIT_MODE_AND_CONFIG_REQUIRED');
  const step=stepAt>=0?args[stepAt+1]:undefined;must(prepare?!step:steps.includes(step),'EXPLICIT_STEP_REQUIRED');
  try{privateRoot=await realpath(resolve('.vercel'));}catch{must(false,'LOCAL_PRIVATE_ARTIFACT_UNAVAILABLE');}
  const configFile=await privatePath(args[at+1],{existing:true}),cfg=await json(configFile);
  must(cfg.version===1&&cfg.purpose==='bazaar-h2-h3-nonpayment-preview'&&Array.isArray(cfg.allowedSteps)&&cfg.allowedSteps.every(s=>steps.includes(s)),'PLAN_CONFIGURATION_INVALID');
  const bazaarFile=await privatePath(cfg.bazaarConfigFile,{existing:true}),accountsFile=await privatePath(cfg.accountsFile,{existing:true}),baselineFile=await privatePath(cfg.baselineConfigFile,{existing:true}),serviceFile=await privatePath(cfg.serviceFile,{existing:true});
  const stateFile=await privatePath(cfg.stateFile),evidenceFile=await privatePath(cfg.evidenceFile);
  must(basename(stateFile).startsWith('h2-h3-')&&basename(evidenceFile).startsWith('h2-h3-'),'LOCAL_OUTPUT_PATH_REQUIRED');
  must(new Set([configFile,bazaarFile,accountsFile,baselineFile,serviceFile,stateFile,evidenceFile]).size===7,'PRIVATE_ARTIFACT_COLLISION');
  const [bazaar,credentials,baseline,service]=await Promise.all([json(bazaarFile),json(accountsFile),json(baselineFile),json(serviceFile)]),origin=previewOrigin(bazaar.url);
  must(/^[a-f0-9]{40}$/.test(bazaar.candidate??'')&&/^dpl_[A-Za-z0-9]+$/.test(bazaar.deploymentId??'')&&/^[A-Za-z0-9_-]{43}$/.test(bazaar.operatorToken??''),'BAZAAR_PREVIEW_CONFIG_INVALID');
  const names=['BAZAAR_WORKSPACE_PREFIX','BAZAAR_REVIEW_PREFIX','BAZAAR_MARKET_PREFIX','BAZAAR_MARKET_FILE_PREFIX'];
  must(names.every(name=>/^[a-f0-9]{64}$/.test(bazaar.namespaceFingerprints?.[name]??'')&&bazaar.namespaceFingerprints[name]===baseline.namespaceFingerprints?.[name]),'BASELINE_NAMESPACE_MISMATCH');
  must(credentials.version===1&&credentials.url===baseline.url&&credentials.candidate===baseline.candidate&&credentials.deploymentId===baseline.deploymentId,'BASELINE_CREDENTIALS_MISMATCH');
  const accounts=credentials.accounts;for(const account of [accounts?.a,accounts?.b])must(account?.record?.ownerId&&account.record.agentId&&['human','agent'].every(role=>/^[A-Za-z0-9_-]{43}$/.test(account.tokens?.[role]??'')),'EXISTING_ACCOUNT_REQUIRED');
  must(accounts.a.record.ownerId!==accounts.b.record.ownerId,'SEPARATE_BUYER_SELLER_REQUIRED');
  assertSellerCard(service.card);must(service.cardHash===sellerHash(sellerCanonical(service.card)),'FROZEN_CARD_HASH_REQUIRED');
  must(typeof cfg.payer==='string'&&StrKey.isValidEd25519PublicKey(cfg.payer)&&cfg.input&&typeof cfg.input==='object'&&!Array.isArray(cfg.input),'BUYER_PUBLIC_INTENT_REQUIRED');
  const context={cfg,bazaar,origin,accounts,card:service.card,cardHash:service.cardHash,credentialsDigest:digest(await readFile(accountsFile)),stateFile,evidenceFile,
   cli:bazaar.cliPath??'C:/Users/MGC/AppData/Roaming/npm/node_modules/vercel/dist/vc.js'};
  if(prepare){
   stage='local-prepare';
   const operationId=randomUUID(),buyerIntent=createMarketplaceBuyerIntent({origin,card:service.card,input:cfg.input,payer:cfg.payer,operationId,maxAtomic:marketAmountAtomic(service.card.payment.amount)});
   const state={...binding(context),submissionId:cfg.existingSubmissionId??randomUUID(),operationId,attemptId:randomUUID(),versionId:randomUUID(),buyerIntent,completedSteps:[]};must(uuid.test(state.submissionId),'SUBMISSION_ID_INVALID');
   await writeFile(stateFile,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});
   return {status:'PREPARED',phase:'local-only',networkUsed:false,accountsReused:2,newAccounts:0,amount:service.card.payment.amount,asset:'USDC',network:'stellar:testnet',realPayments:0,providerExecutions:0};
  }
  must(readSteps.has(step)||cfg.allowedSteps.includes(step),'STEP_NOT_AUTHORIZED');
  context.state=await json(await privatePath(stateFile,{existing:true}));
  must(sellerCanonical(Object.fromEntries(Object.keys(binding(context)).map(key=>[key,context.state[key]])))===sellerCanonical(binding(context)),'FROZEN_STATE_CHANGED');
  must([context.state.submissionId,context.state.operationId,context.state.attemptId,context.state.versionId].every(value=>uuid.test(value)),'STATE_IDENTIFIERS_INVALID');
  let priorEvidence;try{priorEvidence=await json(await privatePath(evidenceFile,{existing:true}));must(priorEvidence.version===1&&priorEvidence.purpose==='bazaar-h2-h3-nonpayment-evidence'&&priorEvidence.candidate===bazaar.candidate&&priorEvidence.deploymentId===bazaar.deploymentId&&priorEvidence.cardHash===service.cardHash&&priorEvidence.operationId===context.state.operationId&&Array.isArray(priorEvidence.steps),'EVIDENCE_BINDING_MISMATCH');}catch(error){if(error.code!=='ENOENT')throw error;}
  stage=step;await action(context,step);
  must(digest(await readFile(accountsFile))===context.credentialsDigest,'BASELINE_CREDENTIALS_CHANGED');
  const evidence={status:'PASS',category:'Hosted synthetic Preview H2/H3 through operator protection bypass',step,candidate:bazaar.candidate,deploymentId:bazaar.deploymentId,
   requests,checks,networkUsed,accountsReused:2,newAccounts:0,serviceId:service.card.id,cardHash:service.cardHash,amount:service.card.payment.amount,asset:'USDC',network:'stellar:testnet',
   operationId:context.state.operationId,effectiveConfiguration:context.state.effectiveConfiguration,...(context.catalogEvidence?{catalogHistory:context.catalogEvidence}:{}),realPayments:0,providerExecutions:0,filesUploaded:0,productionPublished:false,publicExternalClientValidated:false,temporaryFilesRemoved:temporary.size===0};
  await save(evidenceFile,{version:1,purpose:'bazaar-h2-h3-nonpayment-evidence',candidate:bazaar.candidate,deploymentId:bazaar.deploymentId,cardHash:service.cardHash,operationId:context.state.operationId,steps:[...(priorEvidence?.steps??[]),evidence]});return evidence;
 }catch(error){return {status:'FAIL',stage:steps.includes(stage)||['configuration','local-prepare'].includes(stage)?stage:'configuration',code:safeCodes.has(error.safeCode)?error.safeCode:'H2_H3_PREPARATION_UNCONFIRMED',networkUsed,realPayments:0,providerExecutions:0,productionPublished:false};}
 finally{for(const path of temporary)try{await unlink(path);temporary.delete(path);}catch{}}
}
const outcome=await main();console.log(JSON.stringify(outcome));if(outcome.status==='FAIL'||temporary.size)process.exitCode=1;
