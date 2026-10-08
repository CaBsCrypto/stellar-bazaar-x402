// Read-only hosted delta acceptance. This uses the official MCP SDK with a
// Vercel CLI fetch adapter for operator protection bypass on a private preview.
// Original acceptance and credentials are read without being rewritten.
import {readFile,writeFile,unlink,realpath,access} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {MCP_VERSION,MCP_TOOLS} from '../lib/mcp-tool-contract.ts';

const run=promisify(execFile),privateRoot=await realpath(resolve('.vercel'));
const arg=process.argv.indexOf('--config');
if(arg<0||!process.argv[arg+1])throw Error('IGNORED_CONFIG_FILE_REQUIRED');
function privatePath(name){const path=resolve(name),local=relative(privateRoot,path);if(!local||isAbsolute(local)||local==='..'||local.startsWith('..'+sep))throw Error('IGNORED_CONFIG_FILE_REQUIRED');return path;}
async function privateRead(name){const path=privatePath(name);if(privatePath(await realpath(path))!==path)throw Error('PRIVATE_FILE_SYMLINK_FORBIDDEN');return {path,raw:await readFile(path,'utf8')};}
const cfgFile=await privateRead(process.argv[arg+1]),cfg=JSON.parse(cfgFile.raw);
const baselineConfig=await privateRead(cfg.baselineConfigFile??'.vercel/demo-candidate-preview-520ea2a.json');
const baselineEvidence=await privateRead(cfg.baselineEvidenceFile??'.vercel/demo-candidate-preview-evidence.json');
const credentials=await privateRead(cfg.credentialsFile??'.vercel/demo-candidate-preview-accounts.json');
const originalCfg=JSON.parse(baselineConfig.raw),original=JSON.parse(baselineEvidence.raw),saved=JSON.parse(credentials.raw);
const target=new URL(cfg.url);
if(target.protocol!=='https:'||target.origin!==cfg.url||target.username||target.password||target.search||target.hash||!/^stellar-bazaar-x402-[a-z0-9-]+\.vercel\.app$/.test(target.hostname))throw Error('PREVIEW_DEPLOYMENT_REQUIRED');
if(!/^dpl_[a-zA-Z0-9]+$/.test(cfg.deploymentId??'')||!/^[a-f0-9]{7,64}$/.test(cfg.candidate??''))throw Error('CANDIDATE_AND_DEPLOYMENT_REQUIRED');
if(original.status!=='PASS'||original.productionPublished!==false||original.realPayments!==0||saved.version!==1||saved.candidate!==original.candidate||saved.deploymentId!==original.deploymentId||saved.url!==original.url||originalCfg.url!==original.url||originalCfg.deploymentId!==original.deploymentId)throw Error('MATCHING_BASELINE_ACCEPTANCE_REQUIRED');
if(cfg.deploymentId===original.deploymentId||cfg.url===original.url)throw Error('NEW_DELTA_DEPLOYMENT_REQUIRED');
const token=cfg.operatorToken??originalCfg.operatorToken;
if(!/^[a-zA-Z0-9_-]{43}$/.test(token??''))throw Error('PRIVATE_OPERATOR_TOKEN_REQUIRED');
const fingerprints=cfg.namespaceFingerprints??originalCfg.namespaceFingerprints;
const namespaces=['BAZAAR_WORKSPACE_PREFIX','BAZAAR_MARKET_PREFIX','BAZAAR_REVIEW_PREFIX','BAZAAR_MARKET_FILE_PREFIX'];
if(!fingerprints||!namespaces.every(name=>/^[a-f0-9]{64}$/.test(fingerprints[name]??'')))throw Error('BASELINE_NAMESPACE_FINGERPRINTS_REQUIRED');
const {a,b}=saved.accounts??{};
if(![a,b].every(account=>account?.record?.ownerId&&account.record.agentId&&/^[a-zA-Z0-9_-]{43}$/.test(account.tokens?.agent??''))||!saved.validationState?.queryId||!saved.validationState?.declared?.clientOperationId)throw Error('EXISTING_SYNTHETIC_ACCOUNTS_REQUIRED');
const evidenceArg=process.argv.indexOf('--evidence');
const evidenceFile=privatePath(evidenceArg<0?(cfg.deltaEvidenceFile??`.vercel/demo-preview-delta-${randomUUID()}-evidence.json`):process.argv[evidenceArg+1]);
if([cfgFile.path,baselineConfig.path,baselineEvidence.path,credentials.path].includes(evidenceFile))throw Error('PRIVATE_ARTIFACT_PATH_COLLISION');
try{await access(evidenceFile);throw Error('NEW_DELTA_EVIDENCE_FILE_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}
const cli=cfg.cliPath??originalCfg.cliPath??'C:/Users/MGC/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
const temporaryFiles=new Set(),pendingFetches=new Set(),checks=[],protocolErrors=[];
const readTools=new Set(['get_bazaar_identity','get_bazaar_query_history','get_operation_history']);
let requests=0,stage='metadata',sdkClients=0;
function must(condition,code){if(!condition)throw Object.assign(Error(code),{safeCode:code});}
function passed(code){checks.push(code);if(cfg.progress===true)process.stderr.write(JSON.stringify({stage:code,requests})+'\n');}
function permit(url,method,body){
 must(url.origin===target.origin&&!url.search&&!url.hash&&!url.username&&!url.password,'DELTA_TARGET_REQUIRED');
 if(method==='GET'){must(['/api/mcp','/api/market/guardian'].includes(url.pathname),'READ_ONLY_DELTA_REQUEST_REQUIRED');return;}
 must(method==='POST'&&url.pathname==='/api/mcp'&&typeof body==='string','READ_ONLY_DELTA_REQUEST_REQUIRED');
 let rpc;try{rpc=JSON.parse(body);}catch{throw Object.assign(Error('VALID_MCP_REQUEST_REQUIRED'),{safeCode:'VALID_MCP_REQUEST_REQUIRED'});}
 must(!Array.isArray(rpc)&&['initialize','notifications/initialized','tools/list','tools/call'].includes(rpc.method),'READ_ONLY_DELTA_REQUEST_REQUIRED');
 if(rpc.method==='tools/call')must(readTools.has(rpc.params?.name)&&rpc.params.arguments&&Object.keys(rpc.params.arguments).length===0,'READ_ONLY_MCP_TOOL_REQUIRED');
}
async function fetchThroughVercel(input,init={}){
 const url=new URL(input instanceof Request?input.url:String(input)),method=(init.method??(input instanceof Request?input.method:'GET')).toUpperCase(),body=init.body;
 permit(url,method,body);
 const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(init.headers).forEach((value,name)=>headers.set(name,value));
 must(!headers.has('cookie')&&!headers.has('origin'),'NO_BROWSER_CREDENTIALS_REQUIRED');
 for(const name of headers.keys())must(['accept','authorization','content-type','mcp-protocol-version','mcp-session-id','last-event-id'].includes(name),'SUPPORTED_MCP_HEADERS_REQUIRED');
 const id=randomUUID(),headerFile=privatePath(`.vercel/demo-delta-${id}.headers`),bodyFile=privatePath(`.vercel/demo-delta-${id}.body`),responseHeadersFile=privatePath(`.vercel/demo-delta-${id}.response-headers`);
 temporaryFiles.add(headerFile);temporaryFiles.add(responseHeadersFile);
 await writeFile(headerFile,[...headers].map(([name,value])=>name+': '+value).join('\n'),{mode:0o600});
 const args=[cli,'curl',url.pathname,'--deployment',target.origin,'--','--silent','--show-error','--max-time','25','--proto','=https','--request',method,'--header','@'+headerFile,'--dump-header',responseHeadersFile,'--write-out','\n%{http_code}'];
 if(body!==undefined){temporaryFiles.add(bodyFile);await writeFile(bodyFile,body,{mode:0o600});args.push('--data-binary','@'+bodyFile);}
 requests++;
 try{
  const {stdout}=await run(process.execPath,args,{cwd:process.cwd(),timeout:45000,maxBuffer:1024*1024});
  const cut=stdout.lastIndexOf('\n'),status=Number(stdout.slice(cut+1));must(Number.isInteger(status)&&status>=100&&status<=599,'INVALID_HTTP_STATUS');
  const responseHeaders=new Headers();
  // Response headers can contain the protection bypass cookie; forward only
  // transport fields needed by the SDK and never print any raw header.
  for(const row of (await readFile(responseHeadersFile,'utf8')).split(/\r?\n/)){const at=row.indexOf(':');if(at<0)continue;const name=row.slice(0,at).toLowerCase();if(['content-type','allow','cache-control','mcp-session-id','mcp-protocol-version'].includes(name))responseHeaders.set(name,row.slice(at+1).trim());}
  const content=stdout.slice(0,cut);return new Response([204,205,304].includes(status)?null:content,{status,headers:responseHeaders});
 }catch(error){if(error.safeCode)throw error;throw Object.assign(Error('HOSTED_HTTP_OUTCOME_UNCONFIRMED'),{safeCode:'HOSTED_HTTP_OUTCOME_UNCONFIRMED'});}
 finally{for(const file of [headerFile,bodyFile,responseHeadersFile]){try{await unlink(file);temporaryFiles.delete(file);}catch(error){if(error.code==='ENOENT')temporaryFiles.delete(file);}}}
}
function sdkFetch(input,init){const job=fetchThroughVercel(input,init);pendingFetches.add(job);void job.finally(()=>pendingFetches.delete(job)).catch(()=>{});return job;}
function toolValue(result){must(result&&!result.isError,'MCP_READ_TOOL_REJECTED');try{return result.structuredContent??JSON.parse(result.content.find(item=>item.type==='text').text);}catch{throw Object.assign(Error('MCP_TOOL_ENVELOPE_INVALID'),{safeCode:'MCP_TOOL_ENVELOPE_INVALID'});}}
async function sdkAccount(account,expectedQueries,expectedOperations){
 const client=new Client({name:'bazaar-read-only-preview-delta',version:'1'},{capabilities:{}});
 const transport=new StreamableHTTPClientTransport(new URL('/api/mcp',target),{requestInit:{headers:{Authorization:'Bearer '+account.tokens.agent}},fetch:sdkFetch,reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1}});
 client.onerror=()=>protocolErrors.push('MCP_SDK_PROTOCOL_ERROR');
 try{
  await client.connect(transport,{timeout:60000});sdkClients++;
  must(client.getServerVersion()?.version===MCP_VERSION,'MCP_SDK_SERVER_VERSION_MISMATCH');
  const listed=await client.listTools({}, {timeout:60000}),names=listed.tools.map(item=>item.name);must(names.length===34&&JSON.stringify([...names].sort())===JSON.stringify([...MCP_TOOLS].sort()),'MCP_SDK_TOOL_SUITE_MISMATCH');
  const identity=toolValue(await client.callTool({name:'get_bazaar_identity',arguments:{}},undefined,{timeout:60000}));must(identity.ownerId===account.record.ownerId&&identity.agentId===account.record.agentId,'EXISTING_ACCOUNT_IDENTITY_CHANGED');
  const queries=toolValue(await client.callTool({name:'get_bazaar_query_history',arguments:{}},undefined,{timeout:60000}));must(queries.queries?.length===expectedQueries,'PERSISTED_QUERY_ACCOUNT_ISOLATION_FAILED');
  if(expectedQueries)must(queries.queries[0].requestId===saved.validationState.queryId&&queries.queries[0].tool==='list_market_services'&&queries.queries[0].evidence==='bazaar-observed','PERSISTED_QUERY_CHANGED');
  const history=toolValue(await client.callTool({name:'get_operation_history',arguments:{}},undefined,{timeout:60000}));must(history.records?.length===expectedOperations,'PERSISTED_HISTORY_ACCOUNT_ISOLATION_FAILED');
  if(expectedOperations)must(history.records[0].clientOperationId===saved.validationState.declared.clientOperationId&&history.records[0].evidence==='agent-reported'&&history.records[0].payment.status==='not-requested','PERSISTED_DECLARED_OPERATION_CHANGED');
  await Promise.allSettled([...pendingFetches]);must(protocolErrors.length===0,'MCP_SDK_ASYNC_PROTOCOL_FAILED');
 }finally{await client.close();}
}
try{
 const metadata=await fetchThroughVercel(new URL('/api/mcp',target),{headers:{Accept:'application/json'}});must(metadata.status===200,'MCP_METADATA_GET_FAILED');const body=await metadata.json();must(body.version===MCP_VERSION&&body.endpoint==='/api/mcp'&&body.transport==='streamable-http'&&body.tools.length===34,'MCP_METADATA_CHANGED');passed('JSON_METADATA_GET_200');
 const sse=await fetchThroughVercel(new URL('/api/mcp',target),{headers:{Accept:'text/event-stream'}});must(sse.status===405&&!sse.headers.get('content-type')?.includes('text/event-stream'),'MCP_SSE_GET_NOT_REJECTED');must(sse.headers.get('allow')?.split(',').map(value=>value.trim()).includes('POST'),'MCP_SSE_GET_ALLOW_HEADER_INVALID');passed('SSE_GET_405_ALLOW_POST');
 stage='namespace-persistence';
 const guardian=await fetchThroughVercel(new URL('/api/market/guardian',target),{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});must(guardian.status===200,'OPERATOR_NAMESPACE_STATUS_FAILED');const state=await guardian.json();must(namespaces.every(name=>state.namespaceFingerprints?.[name]===fingerprints[name]),'REDEPLOY_NAMESPACE_CHANGED');passed('UNCHANGED_REDIS_AND_R2_NAMESPACE_FINGERPRINTS');
 stage='native-sdk-existing-account-a';await sdkAccount(a,1,1);passed('NATIVE_MCP_SDK_ACCOUNT_A_AND_PERSISTED_PRIVATE_HISTORY');
 stage='native-sdk-existing-account-b';await sdkAccount(b,0,0);passed('NATIVE_MCP_SDK_ACCOUNT_B_PRIVATE_ISOLATION');
 must((await readFile(baselineEvidence.path,'utf8'))===baselineEvidence.raw&&(await readFile(credentials.path,'utf8'))===credentials.raw&&(await readFile(baselineConfig.path,'utf8'))===baselineConfig.raw,'BASELINE_FILES_CHANGED');
 must(temporaryFiles.size===0,'TEMPORARY_SECRET_FILE_CLEANUP_FAILED');passed('ORIGINAL_ACCEPTANCE_AND_CREDENTIAL_FILES_UNCHANGED');
 const evidence={status:'PASS',category:'Read-only hosted delta using official MCP SDK through Vercel CLI operator protection bypass',candidate:cfg.candidate,deploymentId:cfg.deploymentId,url:target.origin,baselineCandidate:original.candidate,baselineDeploymentId:original.deploymentId,mcpVersion:MCP_VERSION,tools:MCP_TOOLS.length,sdkClients,requests,checks,baselineFilesUnchanged:true,namespaceFingerprintsMatched:true,publicExternalClientValidated:false,temporaryRequestFilesRemoved:true,newAccounts:0,credentialRotations:0,newOrders:0,realPayments:0,productionPublished:false,pending:['Public production MCP client without operator protection bypass','Authorized Testnet purchase and paid file delivery remain part of the original acceptance roadmap']};
 await writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(evidence));
}catch(error){
 const evidence={status:'FAIL',category:'Read-only hosted MCP transport delta',candidate:cfg.candidate,deploymentId:cfg.deploymentId,url:target.origin,baselineCandidate:original.candidate,baselineDeploymentId:original.deploymentId,stage,requests,checks,code:error.safeCode??'DELTA_VALIDATION_FAILED',sdkClients,temporaryRequestFilesRemoved:temporaryFiles.size===0,newAccounts:0,credentialRotations:0,newOrders:0,realPayments:0,productionPublished:false};
 await writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});console.error(JSON.stringify(evidence));process.exitCode=1;
}finally{await Promise.allSettled([...pendingFetches]);for(const file of temporaryFiles)await unlink(file).catch(()=>{});}
