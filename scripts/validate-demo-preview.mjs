// Hosted acceptance only. Configuration and recovery credentials stay in ignored
// .vercel files. No signing, funding, transaction or production publication.
import {readFile,writeFile,unlink,realpath,access} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {MCP_VERSION,MCP_TOOLS} from '../lib/mcp-tool-contract.ts';

const execute=promisify(execFile),privateRoot=await realpath(resolve('.vercel'));
const arg=process.argv.indexOf('--config');
if(arg<0||!process.argv[arg+1])throw Error('IGNORED_CONFIG_FILE_REQUIRED');
function privatePath(name){
 const value=resolve(name),local=relative(privateRoot,value);
 if(!local||isAbsolute(local)||local==='..'||local.startsWith('..'+sep))throw Error('IGNORED_CONFIG_FILE_REQUIRED');
 return value;
}
const cfgFile=privatePath(process.argv[arg+1]);
if(privatePath(await realpath(cfgFile))!==cfgFile)throw Error('CONFIG_FILE_SYMLINK_FORBIDDEN');
const cfg=JSON.parse(await readFile(cfgFile,'utf8'));
const deployment=new URL(cfg.url);
if(deployment.protocol!=='https:'||deployment.origin!==cfg.url||deployment.username||deployment.password||deployment.search||deployment.hash||!/^stellar-bazaar-x402-[a-z0-9-]+\.vercel\.app$/.test(deployment.hostname))throw Error('PREVIEW_DEPLOYMENT_REQUIRED');
if(!/^dpl_[a-zA-Z0-9]+$/.test(cfg.deploymentId??'')||!/^([a-f0-9]{7,64}|working-tree-[a-f0-9]{64})$/.test(cfg.candidate??''))throw Error('CANDIDATE_AND_DEPLOYMENT_REQUIRED');
if(!/^[a-zA-Z0-9_-]{43}$/.test(cfg.operatorToken??''))throw Error('PRIVATE_OPERATOR_TOKEN_REQUIRED');
const origin=deployment.origin,cli=cfg.cliPath??'C:/Users/MGC/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
const runId=randomUUID(),credentialsFile=privatePath(cfg.credentialsFile??`.vercel/demo-preview-${runId}-accounts.json`),evidenceFile=privatePath(cfg.evidenceFile??`.vercel/demo-preview-${runId}-evidence.json`);
const resume=process.argv.includes('--resume');
if(credentialsFile===cfgFile||evidenceFile===cfgFile||credentialsFile===evidenceFile)throw Error('PRIVATE_ARTIFACT_PATH_COLLISION');
let savedAccounts;
let priorEvidence;
if(resume){
 if(privatePath(await realpath(credentialsFile))!==credentialsFile)throw Error('CREDENTIAL_FILE_SYMLINK_FORBIDDEN');
 savedAccounts=JSON.parse(await readFile(credentialsFile,'utf8'));
 if(savedAccounts.version!==1||savedAccounts.url!==origin||savedAccounts.candidate!==cfg.candidate||savedAccounts.deploymentId!==cfg.deploymentId)throw Error('RESUME_CANDIDATE_MISMATCH');
 try{priorEvidence=JSON.parse(await readFile(evidenceFile,'utf8'));if(priorEvidence.url!==origin||priorEvidence.candidate!==cfg.candidate||priorEvidence.deploymentId!==cfg.deploymentId)throw Error('RESUME_EVIDENCE_MISMATCH');}catch(error){if(error.code!=='ENOENT')throw error;}
}else try{await access(credentialsFile);throw Error('NEW_CREDENTIAL_FILE_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}
const checks=[],notRun=[],temporaryFiles=new Set();
let requests=0,stage='metadata',accounts=savedAccounts?.accounts,validationState=savedAccounts?.validationState??{},storageProbe,runtimeConfiguration,guardianTick;
const hash=value=>createHash('sha256').update(value).digest('hex');
function must(condition,code){if(!condition)throw Object.assign(Error(code),{safeCode:code});}
function passed(code){checks.push(code);if(cfg.progress===true)process.stderr.write(JSON.stringify({stage:code,requests})+'\n');}
async function persistAccounts(){await writeFile(credentialsFile,JSON.stringify({version:1,url:origin,candidate:cfg.candidate,deploymentId:cfg.deploymentId,accounts,validationState}),{mode:0o600});}
function packet(){const tokens=Object.fromEntries(['human','agent','bootstrap'].map(role=>[role,randomBytes(32).toString('base64url')]));return {tokens,input:{creationId:randomUUID(),humanAccessHash:hash(tokens.human),agentAccessHash:hash(tokens.agent)}};}
async function request(path,{token,body,queryId,browserOrigin}={}){
 must(path.startsWith('/')&&!path.startsWith('//')&&!path.includes('#'),'RELATIVE_REQUEST_PATH_REQUIRED');
 const requestId=randomUUID(),headersFile=privatePath(`.vercel/demo-validation-${requestId}.headers`),bodyFile=privatePath(`.vercel/demo-validation-${requestId}.json`);
 temporaryFiles.add(headersFile);
 await writeFile(headersFile,['Accept: application/json, text/event-stream',...(token?['Authorization: Bearer '+token]:[]),...(queryId?['X-Bazaar-Query-Id: '+queryId]:[]),...(browserOrigin?['Origin: '+browserOrigin]:[]),...(body!==undefined?['Content-Type: application/json']:[])].join('\n'),{mode:0o600});
 const args=[cli,'curl',path,'--deployment',origin,'--','--silent','--show-error','--max-time','25','--proto','=https','--header','@'+headersFile,'--write-out','\n%{http_code}'];
 if(body!==undefined){temporaryFiles.add(bodyFile);await writeFile(bodyFile,JSON.stringify(body),{mode:0o600});args.push('--data-binary','@'+bodyFile);}
 requests++;
 try{
  const {stdout}=await execute(process.execPath,args,{cwd:process.cwd(),timeout:45000,maxBuffer:1024*1024});
  const at=stdout.lastIndexOf('\n'),status=Number(stdout.slice(at+1));must(Number.isInteger(status)&&status>=100&&status<=599,'INVALID_HTTP_STATUS');
  let value;try{value=JSON.parse(stdout.slice(0,at));}catch{throw Object.assign(Error('NON_JSON_RESPONSE'),{safeCode:'NON_JSON_RESPONSE',httpStatus:status});}
  return {status,value};
 }catch(error){if(error.safeCode)throw error;throw Object.assign(Error('HTTP_OUTCOME_UNCONFIRMED'),{safeCode:'HTTP_OUTCOME_UNCONFIRMED'});}
 finally{for(const file of [headersFile,bodyFile]){try{await unlink(file);temporaryFiles.delete(file);}catch(error){if(error.code==='ENOENT')temporaryFiles.delete(file);}}}
}
let rpcId=0;
const rpc=(method,params)=>({jsonrpc:'2.0',id:++rpcId,method,params});
async function tool(name,args={},options={}){
 const response=await request('/api/mcp',{...options,body:rpc('tools/call',{name,arguments:args})});
 // The route boundary can reject a missing credential before JSON-RPC starts.
 if([401,403].includes(response.status)&&response.value.error)return {isError:true,value:response.value,status:response.status};
 if(response.status!==200)throw Object.assign(Error('MCP_HTTP_FAILURE'),{safeCode:'MCP_HTTP_FAILURE',httpStatus:response.status});
 must(response.status===200,'MCP_HTTP_FAILURE');must(response.value.result&&!response.value.error,'MCP_PROTOCOL_FAILURE');
 const result=response.value.result;let value;
 try{value=result.structuredContent??JSON.parse(result.content.find(item=>item.type==='text').text);}catch{
  const text=result.content?.find(item=>item.type==='text')?.text,code=result.isError&&typeof text==='string'&&/MCP error -32602|Input validation error|Invalid arguments/i.test(text)?'SDK_TOOL_INPUT_REJECTED':'MCP_TOOL_ENVELOPE_INVALID';
  throw Object.assign(Error(code),{safeCode:code});
 }
 return {isError:Boolean(result.isError),value,status:value.httpStatus??value.http?.status??200};
}
async function successfulTool(name,args={},options={}){const result=await tool(name,args,options);must(!result.isError&&result.status>=200&&result.status<300,'MCP_TOOL_REJECTED');return result.value;}
try{
 let a,b,catalog,payer;
 const continueAfterHistory=resume&&priorEvidence?.checks?.includes('PRIVATE_HISTORY_SEPARATE_FROM_VERIFIED_PAYMENTS')&&validationState.declared;
 if(continueAfterHistory){
  must(priorEvidence.checks.every(code=>typeof code==='string'&&/^[A-Z0-9_]{1,80}$/.test(code)),'RESUME_EVIDENCE_INVALID');checks.push(...priorEvidence.checks);notRun.push(...(priorEvidence.notRun??[]));
  runtimeConfiguration=priorEvidence.runtimeConfiguration;storageProbe=priorEvidence.storageProbe;guardianTick=priorEvidence.guardianTick;
  a=accounts.a;b=accounts.b;payer=validationState.declared.payment.recipient;
  for(const account of [a,b]){must(/^[a-zA-Z0-9_-]{43}$/.test(account.tokens?.agent??''),'PRIVATE_ACCOUNT_PACKET_INVALID');let identity=await request('/api/account/identity',{token:account.tokens.agent});if(identity.status===401&&account.rotation){identity=await request('/api/account/identity',{token:account.rotation.newAgent});if(identity.status===200){account.tokens.agent=account.rotation.newAgent;await persistAccounts();}}must(identity.status===200&&identity.value.ownerId===account.record.ownerId,'RESUME_ACCOUNT_IDENTITY_MISMATCH');}
  catalog=await request('/api/market/catalog');must(catalog.status===200&&Array.isArray(catalog.value.services),'ANONYMOUS_CATALOG_FAILED');
 }else{
 const metadata=await request('/api/mcp');must(metadata.status===200,'METADATA_HTTP_FAILURE');must(metadata.value.version===MCP_VERSION&&MCP_VERSION==='1.0.0','MCP_VERSION_MISMATCH');
 must(metadata.value.endpoint==='/api/mcp'&&metadata.value.transport==='streamable-http'&&metadata.value.signing===false&&metadata.value.custody===false,'MCP_METADATA_INCOHERENT');passed('MCP_1_0_0_METADATA');
 const initialized=await request('/api/mcp',{body:rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'bazaar-synthetic-preview-acceptance',version:'1'}})});
 must(initialized.status===200&&initialized.value.result?.serverInfo?.version===MCP_VERSION,'MCP_INITIALIZE_FAILED');
 const instructions=initialized.value.result.instructions;must(typeof instructions==='string'&&/testnet/i.test(instructions)&&/x402/i.test(instructions)&&/provider|seller|proveedor/i.test(instructions),'MCP_INSTRUCTIONS_INCOMPLETE');passed('STREAMABLE_MCP_INITIALIZE');
 const tools=await request('/api/mcp',{body:rpc('tools/list',{})}),names=tools.value.result?.tools?.map(t=>t.name);
 must(tools.status===200&&Array.isArray(names)&&names.length===34&&JSON.stringify([...names].sort())===JSON.stringify([...MCP_TOOLS].sort()),'MCP_TOOL_SUITE_MISMATCH');passed('EXACT_34_TOOL_SUITE');
 stage='capabilities-and-skills';
 const capabilities=await successfulTool('get_bazaar_capabilities');
 must(capabilities.demo?.network==='stellar:testnet'&&capabilities.demo.walletRequiredForNewOrders===false&&capabilities.demo.emailRequired===false,'IDENTITY_CAPABILITIES_INCOHERENT');
 must(capabilities.demo.quotas?.registrationsPerDay===200&&capabilities.demo.quotas.registrationsPerIpHour===200&&capabilities.demo.quotas.authenticatedPerAccountMinute===60&&capabilities.demo.quotas.ingressGlobalMinute===120,'QUOTA_CAPABILITIES_INCOHERENT');
 must(capabilities.workspace?.fileDelivery?.generalUploads===false&&capabilities.workspace.fileDelivery.uploads==='paid-claimed-orders-only'&&capabilities.workspace.retention?.days===7&&capabilities.workspace.retention.readsExtendExpiry===false,'STORAGE_CAPABILITIES_INCOHERENT');
 must(capabilities.paymentFlow?.walletBindingRequired===false&&capabilities.paymentFlow.automaticSigning===false&&capabilities.architecture?.network==='stellar:testnet','X402_CAPABILITIES_INCOHERENT');passed('PUBLIC_CAPABILITIES_AND_RESTRICTIONS');
 for(const role of ['buyer','seller','recovery']){
  const result=await successfulTool('get_bazaar_skills',{role});must(Array.isArray(result.skills)&&result.skills.length===1&&result.skills[0].role===role&&result.skills[0].download===`/skills/${role}/SKILL.md`&&typeof result.skills[0].instructions==='string'&&result.skills[0].instructions.includes('/api/mcp'),'ROLE_SKILL_INCOMPLETE');
 }
 passed('BUYER_SELLER_RECOVERY_INSTRUCTIONS');
 stage='operator-runtime-and-storage';
 const guardian=await request('/api/market/guardian',{token:cfg.operatorToken});must(guardian.status===200,'OPERATOR_GUARDIAN_UNAVAILABLE');
 const configuration=guardian.value.configuration,required=['r2Bucket','r2Region','r2Endpoint','r2AccessKey','r2SecretKey','workspaceRedisBackend','workspaceRedisUrl','workspaceRedisToken','reviewRedisBackend','reviewRedisUrl','reviewRedisToken','workspaceNamespace','marketNamespace','reviewNamespace','namespacesIndependent','namespaceFamilyMatches','namespaceStageMatches','fileNamespace','noServerPayer','guardianCronCredential','guardianCronMatchesOperator'];
 runtimeConfiguration={r2Configured:configuration?.r2Configured===true,checks:Object.fromEntries(required.map(key=>[key,configuration?.checks?.[key]===true]))};
 must(configuration?.r2Configured===true&&required.every(key=>configuration.checks?.[key]===true),'DEPLOYED_CONFIGURATION_INCOMPLETE');
 must(guardian.value.actions?.paymentResubmission===false&&guardian.value.actions?.providerSuspension==='human-only','GUARDIAN_POLICY_INCOHERENT');
 if(cfg.namespaceFingerprints)for(const [name,expected]of Object.entries(cfg.namespaceFingerprints))must(/^[a-f0-9]{64}$/.test(expected)&&guardian.value.namespaceFingerprints?.[name]===expected,'DEPLOYED_NAMESPACE_MISMATCH');
 passed('DEPLOYED_R2_REDIS_NAMESPACE_CONFIGURATION');
 const storage=await request('/api/market/guardian',{token:cfg.operatorToken,body:{action:'probe-storage'}});must(storage.status===200&&storage.value.configured===true&&storage.value.reachable===true&&storage.value.code==='STORAGE_REACHABLE','DEPLOYED_HEAD_BUCKET_FAILED');
 storageProbe={configured:true,reachable:true,readOnly:true,method:'HeadBucket'};passed('DEPLOYED_READ_ONLY_R2_BUCKET_PROBE');
 must((await request('/api/market/guardian')).status===401,'OPERATOR_STATUS_ANONYMOUS_LEAK');passed('OPERATOR_STATUS_REQUIRES_AUTH');
 stage='manual-hosted-guardian-tick';
 must((await request('/api/market/guardian/tick')).status===401,'GUARDIAN_TICK_ANONYMOUS_ACCESS');
 must((await request('/api/market/guardian/tick',{token:randomBytes(32).toString('base64url')})).status===401,'GUARDIAN_TICK_WRONG_CREDENTIAL_ACCESS');
 must((await request('/api/market/guardian/tick',{token:cfg.operatorToken,browserOrigin:origin})).status===403,'GUARDIAN_TICK_BROWSER_ORIGIN_ACCESS');
 const tick=await request('/api/market/guardian/tick',{token:cfg.operatorToken});must(tick.status===200&&tick.value.paymentResubmission===false&&Number.isInteger(tick.value.processedWorkspaceCount),'GUARDIAN_TICK_AUTHENTICATED_RUN_FAILED');
 guardianTick={manualProtectedClient:true,correctCredentialAccepted:true,anonymousRejected:true,wrongCredentialRejected:true,browserOriginRejected:true,paymentResubmission:false,scheduledExecutionValidated:false};
 passed('MANUAL_HOSTED_GUARDIAN_TICK_AUTH_AND_EXECUTION');
 notRun.push({case:'SCHEDULED_VERCEL_GUARDIAN_EXECUTION',reason:'VERCEL_CRON_RUNS_ONLY_ON_PRODUCTION_NOT_PREVIEW'});
 stage='synthetic-public-registration';
 // Persist all accesses before the first server write, including lost-response recovery.
 if(!resume)accounts={a:packet(),b:packet()};
 for(const account of [accounts?.a,accounts?.b]){
  must(account&&['human','agent','bootstrap'].every(role=>/^[a-zA-Z0-9_-]{43}$/.test(account.tokens?.[role]??''))&&account.input?.humanAccessHash===hash(account.tokens.human)&&/^[a-f0-9]{64}$/.test(account.input?.agentAccessHash??''),'PRIVATE_ACCOUNT_PACKET_INVALID');
  // Agent hashes can differ after a completed saved rotation; creation replays
  // always use the immutable original packet and original bootstrap credential.
  if(!account.rotation)must(account.input.agentAccessHash===hash(account.tokens.agent),'PRIVATE_ACCOUNT_PACKET_INVALID');
 }
 await persistAccounts();
 for(const account of [accounts.a,accounts.b]){const priorRecord=account.record,created=await request('/api/workspaces',{token:account.tokens.bootstrap,body:account.input});must(created.status===(resume?200:201)&&created.value.created===!resume&&created.value.record?.creationId===account.input.creationId,'PUBLIC_REGISTRATION_FAILED');if(resume)must(priorRecord?.ownerId===created.value.record.ownerId&&priorRecord?.workspaceId===created.value.record.workspaceId,'REGISTRATION_REPLAY_IDENTITY_MISMATCH');account.record=created.value.record;await persistAccounts();}
 ({a,b}=accounts);passed('TWO_PUBLIC_SYNTHETIC_ACCOUNTS');
 const replay=await request('/api/workspaces',{token:a.tokens.bootstrap,body:a.input});must(replay.status===200&&replay.value.created===false&&replay.value.record?.ownerId===a.record.ownerId,'REGISTRATION_REPLAY_FAILED');passed('DURABLE_REGISTRATION_REPLAY');
 if(resume&&b.rotation){const replacement=await request('/api/account/identity',{token:b.rotation.newAgent});if(replacement.status===200){must(replacement.value.ownerId===b.record.ownerId,'RESUME_ROTATION_IDENTITY_MISMATCH');b.tokens.agent=b.rotation.newAgent;await persistAccounts();}else must(replacement.status===401,'RESUME_ROTATION_UNCONFIRMED');}
 for(const account of [a,b]){const identity=await request('/api/account/identity',{token:account.tokens.agent});must(identity.status===200&&identity.value.ownerId===account.record.ownerId&&identity.value.agentId===account.record.agentId&&identity.value.wallet===null,'PRIVATE_IDENTITY_FAILED');}
 const mcpIdentity=await successfulTool('get_bazaar_identity',{}, {token:a.tokens.agent});must(mcpIdentity.ownerId===a.record.ownerId&&mcpIdentity.wallet===null,'AUTHENTICATED_MCP_IDENTITY_FAILED');passed('AUTHENTICATED_MCP_WITHOUT_WALLET_BINDING');
 stage='query-history-and-isolation';
 if(!validationState.queryId&&resume){const existing=await request('/api/account/queries',{token:a.tokens.human});must(existing.status===200&&Array.isArray(existing.value.queries)&&existing.value.queries.length<=1,'RESUME_QUERY_HISTORY_MISMATCH');if(existing.value.queries.length){must(existing.value.queries[0].tool==='list_market_services','RESUME_QUERY_HISTORY_MISMATCH');validationState.queryId=existing.value.queries[0].requestId;}}
 const queryId=validationState.queryId??randomUUID();must(/^[a-f0-9-]{36}$/.test(queryId),'RESUME_QUERY_IDENTIFIER_INVALID');validationState.queryId=queryId;await persistAccounts();
 for(let i=0;i<2;i++)await successfulTool('list_market_services',{}, {token:a.tokens.agent,queryId});
 catalog=await request('/api/market/catalog');must(catalog.status===200&&Array.isArray(catalog.value.services),'ANONYMOUS_CATALOG_FAILED');
 const historyA=await request('/api/account/queries',{token:a.tokens.human}),historyB=await request('/api/account/queries',{token:b.tokens.human});
 must(historyA.status===200&&historyA.value.queries?.length===1&&historyA.value.queries[0].requestId===queryId&&historyA.value.queries[0].evidence==='bazaar-observed','QUERY_DEDUP_FAILED');
 must(historyB.status===200&&historyB.value.queries?.length===0,'QUERY_ACCOUNT_ISOLATION_FAILED');passed('OBSERVED_QUERY_DEDUP_AND_ANONYMOUS_PRIVACY');
 if(!validationState.declared&&resume){const existing=await request('/api/operations',{token:a.tokens.human});must(existing.status===200&&Array.isArray(existing.value.records)&&existing.value.records.length<=1,'RESUME_DECLARED_HISTORY_MISMATCH');if(existing.value.records.length){const record=existing.value.records[0];must(record.service?.id==='synthetic-preview-report'&&record.mode==='mock'&&record.payment?.status==='not-requested'&&record.payment.amountAtomic==='0'&&record.evidence==='agent-reported','RESUME_DECLARED_HISTORY_MISMATCH');validationState.declared={clientOperationId:record.clientOperationId,mode:record.mode,service:record.service,payment:record.payment,delivery:record.delivery};}}
 const declared=validationState.declared??{clientOperationId:randomUUID(),mode:'mock',service:{id:'synthetic-preview-report',title:'Synthetic unpaid preview report',provider:'preview-acceptance',url:'https://synthetic-provider.invalid'},payment:{status:'not-requested',network:'stellar:testnet',asset:'USDC',amountAtomic:'0',recipient:Keypair.random().publicKey()},delivery:{status:'reported-delivered',result:{summary:'Synthetic private response'}}};
 validationState.declared=declared;await persistAccounts();const declaredId=declared.clientOperationId;payer=declared.payment.recipient;
 const recorded=await successfulTool('record_bazaar_operation',{operation:declared},{token:a.tokens.agent});must((recorded.created===true||(resume&&recorded.created===false))&&recorded.record?.clientOperationId===declaredId&&recorded.record.evidence==='agent-reported','DECLARED_OPERATION_RECORD_FAILED');
 const operationsA=await request('/api/operations',{token:a.tokens.human}),operationsB=await request('/api/operations',{token:b.tokens.human});
 must(operationsA.status===200&&operationsA.value.records?.length===1&&operationsA.value.records[0].clientOperationId===declaredId&&operationsA.value.records[0].payment.status==='not-requested','PRIVATE_DECLARED_HISTORY_FAILED');
 must(operationsB.status===200&&operationsB.value.records?.length===0,'DECLARED_HISTORY_ACCOUNT_ISOLATION_FAILED');
 must((await request('/api/account/queries')).status===401,'ANONYMOUS_HISTORY_LEAK');passed('PRIVATE_HISTORY_SEPARATE_FROM_VERIFIED_PAYMENTS');
 }
 stage='file-tool-permissions';
 const unknownOrder=randomUUID(),attemptId=randomUUID(),versionId=randomUUID(),file={id:'synthetic-preview-file',name:'synthetic.txt',mediaType:'text/plain',size:1,sha256:hash('x')};
 const fileTools=[['prepare_market_delivery',{operationId:unknownOrder,attemptId,versionId,files:[file]}],['confirm_market_delivery',{operationId:unknownOrder,attemptId,versionId,fileId:file.id}],['get_market_delivery',{operationId:unknownOrder}]];
 for(const [name,args]of fileTools){const denied=await tool(name,args);must(denied.isError&&denied.status===401,'FILE_TOOL_ANONYMOUS_ACCESS');const missing=await tool(name,args,{token:a.tokens.agent});must(missing.isError&&missing.status===404,'FILE_TOOL_UNKNOWN_ORDER_ACCESS');}
 passed('THREE_FILE_TOOLS_REQUIRE_AUTH_AND_BOUND_ORDER');
 stage='unpaid-order-gate';
 const active=catalog.value.services.filter(s=>s.status==='activated'&&s.card?.network==='stellar:testnet');
 if(!active.length)notRun.push({case:'UNPAID_OWNING_SELLER_FILE_GATE',reason:'NO_REVIEWED_ACTIVE_SERVICE_IN_ISOLATED_PREVIEW'});
 else if(!cfg.unpaidService?.serviceId||!/^[a-zA-Z0-9_-]{43}$/.test(cfg.unpaidService?.sellerAgentToken??''))notRun.push({case:'UNPAID_OWNING_SELLER_FILE_GATE',reason:'OWNING_SYNTHETIC_SELLER_CREDENTIAL_REQUIRED'});
 else{
  const service=active.find(s=>s.card.id===cfg.unpaidService.serviceId);must(service,'SYNTHETIC_TEST_SERVICE_NOT_ACTIVE');
  const input=cfg.unpaidService.input??Object.fromEntries(service.card.input.filter(field=>field.required).map(field=>[field.name,field.type==='number'?1:field.type==='boolean'?true:'Synthetic preview request']));
  const intent=validationState.unpaidIntent??{operationId:randomUUID(),serviceId:service.card.id,cardHash:service.cardHash,payer,input,paymentProtocol:'x402-stellar-exact-v2'};must(intent.serviceId===service.card.id&&intent.cardHash===service.cardHash,'RESUME_UNPAID_INTENT_MISMATCH');validationState.unpaidIntent=intent;await persistAccounts();
  const operationId=intent.operationId,order=await successfulTool('create_market_order',intent,{token:a.tokens.agent});
  must(order.order?.phase==='awaiting-payment'&&!order.order?.transactionHash,'UNPAID_ORDER_NOT_AWAITING_PAYMENT');
  a.unpaidOperationId=operationId;await persistAccounts();
  const denied=await tool('prepare_market_delivery',{operationId,attemptId,versionId,files:[file]},{token:cfg.unpaidService.sellerAgentToken});must(denied.isError&&denied.status===409&&denied.value.error?.code==='PAYMENT_REQUIRED','UNPAID_SELLER_UPLOAD_NOT_REJECTED');
  const cross=await successfulTool('list_market_orders',{}, {token:b.tokens.agent});must(!cross.orders?.some(o=>o.operationId===operationId),'ORDER_ACCOUNT_ISOLATION_FAILED');
  passed('UNPAID_OWNING_SELLER_CANNOT_PREPARE_FILES');
 }
 stage='agent-revocation';
 const rotation=b.rotation??{priorAgent:b.tokens.agent,newAgent:randomBytes(32).toString('base64url'),expectedGeneration:b.record.generation};must(/^[a-zA-Z0-9_-]{43}$/.test(rotation.priorAgent)&&/^[a-zA-Z0-9_-]{43}$/.test(rotation.newAgent)&&Number.isInteger(rotation.expectedGeneration),'RESUME_ROTATION_INTENT_INVALID');
 const retiredAgent=rotation.priorAgent,replacementAgent=rotation.newAgent;b.rotation=rotation;await persistAccounts();
 const rotate=await request('/api/workspaces/'+b.record.workspaceId+'/access',{token:b.tokens.bootstrap,body:{action:'rotate',role:'agent',accessHash:hash(replacementAgent),expectedGeneration:rotation.expectedGeneration}});
 must(rotate.status===200&&rotate.value.record?.generation===rotation.expectedGeneration+1,'AGENT_REVOCATION_FAILED');
 b.tokens.agent=replacementAgent;b.record=rotate.value.record;await persistAccounts();
 must((await request('/api/account/identity',{token:retiredAgent})).status===401,'RETIRED_AGENT_ACCESS_SURVIVED');
 const revokedMcp=await tool('get_bazaar_identity',{}, {token:retiredAgent});must(revokedMcp.isError&&revokedMcp.status===401,'RETIRED_AGENT_MCP_ACCESS_SURVIVED');
 const recovered=await request('/api/account/identity',{token:replacementAgent}),humanStillActive=await request('/api/account/queries',{token:b.tokens.human});
 must(recovered.status===200&&recovered.value.ownerId===b.record.ownerId&&humanStillActive.status===200,'ROTATION_BROKE_ACCOUNT_RECOVERY');passed('AGENT_ROTATION_REVOKES_OLD_ACCESS_PRESERVES_ACCOUNT');
 must(temporaryFiles.size===0,'TEMPORARY_SECRET_FILE_CLEANUP_FAILED');
 const evidence={status:'PASS',category:'Hosted preview via Vercel operator protection bypass',candidate:cfg.candidate,deploymentId:cfg.deploymentId,url:origin,mcpVersion:MCP_VERSION,tools:MCP_TOOLS.length,requests,resumed:resume,checksInheritedFromEarlierRun:Boolean(continueAfterHistory),checks,notRun,runtimeConfiguration,storageProbe,guardianTick,privateCredentialsStored:true,temporaryRequestFilesRemoved:temporaryFiles.size===0,realPayments:0,mainnetRequests:0,productionPublished:false,publicExternalClientValidated:false,pending:['Authorized Testnet payment and image/video delivery','Positive file upload, checksum, download and expiry through a paid hosted order','Seven-day physical cloud cleanup over time','Paired preview/production namespace evidence','Actual scheduled Vercel guardian execution after authorized production publication','Public production QR acceptance']};
 await writeFile(evidenceFile,JSON.stringify(evidence,null,2),{mode:0o600});console.log(JSON.stringify(evidence));
}catch(error){
 const evidence={status:'FAIL',category:'Hosted preview acceptance',candidate:cfg.candidate,deploymentId:cfg.deploymentId,url:origin,stage,requests,checks,notRun,...(runtimeConfiguration?{runtimeConfiguration}:{}),...(guardianTick?{guardianTick}:{}),code:error.safeCode??'VALIDATION_FAILED',...(Number.isInteger(error.httpStatus)?{httpStatus:error.httpStatus}:{}),realPayments:0,mainnetRequests:0,productionPublished:false,privateCredentialsStored:Boolean(accounts),temporaryRequestFilesRemoved:temporaryFiles.size===0};
 await writeFile(evidenceFile,JSON.stringify(evidence,null,2),{mode:0o600});console.error(JSON.stringify(evidence));process.exitCode=1;
}finally{for(const file of temporaryFiles)await unlink(file).catch(()=>{});}
