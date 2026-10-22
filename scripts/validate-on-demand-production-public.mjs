// Root executes only after canonical READY receipts and real WAF restoration.
// No credential inputs, environment reads, private journals or operator client.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {readFile,lstat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MCP_VERSION,MCP_TOOLS} from '../.vercel/continuous-on-demand-v2-bazaar-production-source/lib/mcp-tool-contract.ts';
import {continuousFreeReservation} from '../.vercel/continuous-on-demand-v2-bazaar-production-source/lib/continuous-free-budget.ts';

export const PUBLIC_PRODUCTION_VALIDATION=Object.freeze({
 origin:'https://bazaar.browns.studio',serviceId:'guionista-bazaar-production-text-v1',
 cardHash:'fa0890b56563deb08a983fb6e75d020a6105babc0b4bd3a6b834f4468897cefc',
 planHash:'5d7ef135f78cf9be801d6b7b58bd49eb305749f161eaaf3b18ee527c5d576266',
 reviewHash:'9f536603152df78703f01002d7f6c861ea313364d9d781e09d3583e1d1d6c636',
 wafPlanHash:'d638dcaf3c1d847adda7ce0b3de5eea53e2818a770280f1b1bb82c13172ed8fe',
 sourceDigests:{bazaar:'034f25235cbbcc89f8f7e51633e93b372e7f531c2cf191f9b114920052b40c52',provider:'9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232'},
 requestMaximum:12,conservativeTransferMaximum:1_200_000_000,responseMaximum:1_048_576,
 protectionReceipt:'docs/evidence/on-demand-v3-production-public-protection-2026-10-12.json',
 evidence:'docs/evidence/on-demand-v3-production-public-acceptance-2026-10-12.json',
 qrService:'docs/evidence/on-demand-v3-production-service-qr-2026-10-12.svg',
 qrGeneral:'docs/evidence/on-demand-v3-production-general-qr-2026-10-12.svg'
});
const C=PUBLIC_PRODUCTION_VALIDATION,sha=b=>createHash('sha256').update(b).digest('hex'),fail=code=>{throw Error(code);};
const safeCode=e=>/^[A-Z][A-Z0-9_]{2,95}$/.test(e?.message??'')?e.message:'PUBLIC_VALIDATION_UNCONFIRMED';
const publicPaths=new Set(['/open','/catalogo','/api/market/catalog?limit=20','/api/market/catalog?q=guion&limit=20','/resources/'+C.serviceId,'/resources/'+C.serviceId+'/qr.svg','/demo-qr.svg']);
const generic=continuousFreeReservation({profile:'public',newOperation:false}),metadata=continuousFreeReservation({profile:'public',newOperation:false,workload:'metadata'});
export function publicValidationPlan(){return {status:'PREPARED_ANONYMOUS_PRODUCTION_VALIDATION_NOT_EXECUTED',...C,getRoutes:[...publicPaths],mcpMethods:['initialize','notifications/initialized','tools/list','tools/call:get_bazaar_capabilities'],maximumGetRequests:7,maximumMcpRequests:5,conservativeTransferUpper:7*generic.transferBytes+5*metadata.transferBytes,conservativeCommandUpper:7*generic.commands+5*metadata.commands,credentialInputs:0,privateProfilesRead:0,networkRequests:0,newAccounts:0,newOrders:0,newPayments:0,providerExecutions:0,providerTicks:0,readinessInvocations:0,qrDecode:'Independent local decoding required after SVG capture'};}
export function validatePublicProductionReceipts(receipts,now=Date.now()){
 for(const kind of ['bazaar','provider']){
  const d=receipts[kind];if(d?.status!=='CANONICAL_ON_DEMAND_PRODUCTION_READY_ACCEPTANCE_PENDING'||d.kind!==kind||d.planHash!==C.planHash||d.reviewHash!==C.reviewHash||d.sourceDigest!==C.sourceDigests[kind]||d.readyState!=='READY'||d.target!=='production'||!/^dpl_[A-Za-z0-9]+$/.test(d.deploymentId??'')||d.generalPurchasesEnabled!==false||d.canonicalOrigin!==(kind==='bazaar'?C.origin:'https://ai-video-scriptwriter.vercel.app')||JSON.stringify(d.crons)!==JSON.stringify(kind==='bazaar'?[{path:'/api/market/guardian/tick',schedule:'0 * * * *'}]:[]))fail('EXACT_CANONICAL_READY_RECEIPTS_REQUIRED');
 }
 const p=receipts.protection,at=Date.parse(p?.observedAt??'');
 if(p?.status!=='PASS_PRODUCTION_PUBLIC_PROTECTION_READBACK'||p.planHash!==C.planHash||p.wafPlanHash!==C.wafPlanHash||p.bazaarSourceDigest!==C.sourceDigests.bazaar||p.providerSourceDigest!==C.sourceDigests.provider||p.bothQuarantinesActive!==true||p.temporaryMaintenanceRemoved!==true||p.originalSsoPreserved!==true||p.publicConditionGroups!==22||p.newPayments!==0||!Number.isFinite(at)||now-at<0||now-at>600000)fail('FRESH_REAL_PUBLIC_PROTECTION_READBACK_REQUIRED');
 return {bazaarDeploymentId:receipts.bazaar.deploymentId,providerDeploymentId:receipts.provider.deploymentId};
}
export function createBoundedAnonymousTransport(fetcher=globalThis.fetch,now=Date.now){
 const requests=[],started=now();let virtualTransfer=0,commands=0;
 async function send(path,{method='GET',body,headers}={}){
  const mcp=path==='/api/mcp';if(!mcp&&!publicPaths.has(path)||!['GET','POST'].includes(method)||!mcp&&method!=='GET'||now()-started>180000)fail('EXACT_ANONYMOUS_REQUEST_REQUIRED');
  const provided=new Headers(headers);for(const key of provided.keys())if(!['accept','content-type','mcp-protocol-version'].includes(key))fail('NO_CREDENTIAL_OR_COOKIE_HEADERS');
  if(mcp&&method==='POST'){
   if(typeof body!=='string'||Buffer.byteLength(body)>8192)fail('BOUNDED_MCP_BODY_REQUIRED');const rpc=JSON.parse(body);
   if(Array.isArray(rpc)||rpc.jsonrpc!=='2.0'||!['initialize','notifications/initialized','tools/list','tools/call'].includes(rpc.method)||rpc.method==='tools/call'&&(rpc.params?.name!=='get_bazaar_capabilities'||JSON.stringify(rpc.params.arguments??{})!=='{}'))fail('ONLY_DISCOVERY_MCP_METHODS_ALLOWED');
  }else if(body!==undefined)fail('BODYLESS_PUBLIC_REQUEST_REQUIRED');
  const reservation=mcp?metadata:generic;
  if(requests.length>=C.requestMaximum||virtualTransfer+reservation.transferBytes>C.conservativeTransferMaximum)fail('PUBLIC_VALIDATION_ENVELOPE_EXHAUSTED');
  virtualTransfer+=reservation.transferBytes;commands+=reservation.commands;
  const record={method,category:mcp?'mcp':'public',status:null,bodyBytes:0};requests.push(record);
  const signal=AbortSignal.timeout(15000),r=await fetcher(C.origin+path,{method,headers:{accept:mcp?'application/json, text/event-stream':'text/html, application/json, image/svg+xml',...(mcp&&method==='POST'?{'content-type':'application/json'}:{}),...Object.fromEntries(provided)},...(body===undefined?{}:{body}),redirect:'manual',credentials:'omit',cache:'no-store',signal});record.status=r.status;
  if(r.redirected||r.url&&r.url!==C.origin+path||r.status>=300&&r.status<400||r.headers.has('location')||r.headers.has('mcp-session-id'))fail('PUBLIC_RESPONSE_REDIRECT_OR_SESSION_FORBIDDEN');
  const reader=r.body?.getReader(),chunks=[];let count=0;
  try{if(reader)for(;;){const v=await reader.read();if(v.done)break;count+=v.value.byteLength;if(count>C.responseMaximum){await reader.cancel();fail('PUBLIC_RESPONSE_BOUND');}chunks.push(v.value);}}finally{reader?.releaseLock();}
  const raw=Buffer.concat(chunks).toString('utf8');record.bodyBytes=count;
  if(/vercel\.com\/(?:login|sso)|Vercel Authentication|Authentication Required/i.test(raw))fail('PUBLIC_ROUTE_REACHED_DEPLOYMENT_LOGIN');
  return {status:r.status,headers:r.headers,raw};
 }
 return {send,requests,summary:()=>({requests:requests.length,conservativeTransferBytes:virtualTransfer,conservativeCommands:commands,receivedBodyBytes:requests.reduce((n,r)=>n+r.bodyBytes,0)})};
}
export async function validatePublicProduction(receipts,{fetcher=globalThis.fetch,now=Date.now}={}){
 const identities=validatePublicProductionReceipts(receipts,now()),transport=createBoundedAnonymousTransport(fetcher,now),checks=[];
 const evidence={version:1,status:'UNCONFIRMED',observedAt:new Date(now()).toISOString(),origin:C.origin,planHash:C.planHash,sourceDigests:C.sourceDigests,...identities,checks,requestMaximum:C.requestMaximum,conservativeTransferMaximum:C.conservativeTransferMaximum,anonymousClient:true,protectionBypassUsed:false,originalSsoPreserved:true,newAccounts:0,newOrders:0,newPayments:0,providerExecutions:0,providerTicks:0,readinessInvocations:0,paidFlowValidated:false,independentOperatorEgressValidated:false,limitations:['Requests originate from this computer; independent team validation remains pending','No purchase, identity, paid recovery or readiness invoked','Physical provider transfer/billing is not proven by conservative reservations','QR destinations require independent decoding of captured SVGs']};
 const check=(v,name)=>{if(!v)fail(name);checks.push(name);};let client,qrService,qrGeneral;
 try{
  for(const path of ['/open','/catalogo']){const r=await transport.send(path);check(r.status===200&&r.headers.get('content-type')?.includes('text/html'),'PUBLIC_'+path.slice(1).toUpperCase());}
  const catalog=await transport.send('/api/market/catalog?limit=20');check(catalog.status===200,'PUBLIC_CATALOG');const c=JSON.parse(catalog.raw);check(c.purchasesEnabled===false&&c.purchaseAdmission==='restricted'&&Array.isArray(c.services),'ANONYMOUS_PURCHASES_RESTRICTED');
  const row=c.services.find(s=>s.card?.id===C.serviceId);check(row?.cardHash===C.cardHash&&row.card.network==='stellar:testnet'&&row.card.payment?.amount==='0.01','EXACT_REVIEWED_TESTNET_SERVICE');
  check(c.services.every(s=>!['ownerId','control','mine','token','agentAccess','providerAccess'].some(k=>k in s)),'CATALOG_PRIVATE_FIELDS_ABSENT');
  const search=await transport.send('/api/market/catalog?q=guion&limit=20');check(search.status===200&&JSON.parse(search.raw).services?.some(s=>s.card?.id===C.serviceId&&s.cardHash===C.cardHash),'PUBLIC_SEARCH_FINDS_SAME_SERVICE');
  const detail=await transport.send('/resources/'+C.serviceId);check(detail.status===200&&detail.raw.includes('Enlace público del servicio')&&detail.raw.includes('/hub?service='+C.serviceId),'PUBLIC_SERVICE_LINK_AND_CONTINUITY');
  const qr=await transport.send('/resources/'+C.serviceId+'/qr.svg');check(qr.status===200&&qr.headers.get('content-type')?.startsWith('image/svg+xml')&&qr.raw.startsWith('<svg')&&Buffer.byteLength(qr.raw)<=20000&&!/<!DOCTYPE|<!ENTITY|<script|<image|href=/i.test(qr.raw),'SERVICE_QR_SAFE_SVG_CAPTURE');qrService=qr.raw;
  const general=await transport.send('/demo-qr.svg');check(general.status===200&&general.headers.get('content-type')?.startsWith('image/svg+xml')&&general.raw.startsWith('<svg')&&Buffer.byteLength(general.raw)<=60000&&!/<!DOCTYPE|<!ENTITY|<script|<image|href=/i.test(general.raw),'GENERAL_QR_SAFE_SVG_CAPTURE');qrGeneral=general.raw;
  client=new Client({name:'bazaar-on-demand-production-anonymous',version:'1'},{});
  const sdk=new StreamableHTTPClientTransport(new URL('/api/mcp',C.origin),{reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},fetch:async(input,init={})=>{
   const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(url.href!==C.origin+'/api/mcp')fail('EXACT_CANONICAL_MCP_REQUIRED');
   const r=await transport.send('/api/mcp',{method:init.method??'GET',body:init.body,headers:init.headers});return new Response([204,205,304].includes(r.status)?null:r.raw,{status:r.status,headers:r.headers});
  }});
  await client.connect(sdk);check(client.getServerVersion()?.version===MCP_VERSION&&client.getInstructions()?.includes('get_service'),'SDK_CANONICAL_INITIALIZE');
  const listed=await client.listTools(undefined,{timeout:15000});check(JSON.stringify(listed.tools.map(t=>t.name))===JSON.stringify(MCP_TOOLS)&&listed.tools.length===35,'EXACT_UNCHANGED_35_MCP_TOOLS');
  const result=await client.callTool({name:'get_bazaar_capabilities',arguments:{}},undefined,{timeout:15000});check(!result.isError,'PUBLIC_CAPABILITIES_TOOL');const text=result.content.find(v=>v.type==='text')?.text;check(!!text,'PUBLIC_CAPABILITIES_JSON');const caps=JSON.parse(text);
  check(caps.demo?.network==='stellar:testnet'&&caps.demo.walletRequiredForNewOrders===false,'TESTNET_OPTIONAL_ACCOUNT_WALLET');
  const f=caps.effectiveFeatures;check(f?.registration?.enabled&&f.catalogue?.enabled&&f.serviceSubmission?.enabled,'OPEN_ONBOARDING_CATALOG_AND_REVIEWED_INTAKE');check(f.purchases?.enabled===false&&f.purchases.reason==='BUYER_ADMISSION_RESTRICTED'&&f.privateFiles?.enabled===false&&f.guardianAutomation?.enabled===true,'RESTRICTED_PURCHASES_TEXT_ONLY_PRODUCTION_GUARDIAN');
  check(caps.freeDemo?.mode==='continuous'&&caps.freeDemo.sellerMode==='owned-text-on-demand'&&caps.freeDemo.anonymousVisitsWakeSeller===false&&caps.freeDemo.rollingWindowDays===31&&caps.freeDemo.pendingReservationsExpireWithHistory===false,'CONTINUOUS_ON_DEMAND_NO_ANONYMOUS_WAKE');
  check(JSON.stringify(caps.freeDemo.sharedCommandReservations)===JSON.stringify({public:115000,authenticated:90000,recovery:105000,background:50000}),'EXACT_360K_COMMAND_CONFIGURATION');
  check(caps.freeDemo.admissionWindow?.expiresAt===null&&caps.freeDemo.admissionWindow?.admissionOpen===true,'NO_ADMISSION_DEADLINE');
  evidence.service={id:C.serviceId,cardHash:C.cardHash,amount:'0.01',network:'stellar:testnet',availabilityReady:row.availability?.ready===true};
  evidence.qr={service:{path:C.qrService,sha256:sha(qrService),expectedDestination:C.origin+'/resources/'+C.serviceId,independentlyDecoded:false},general:{path:C.qrGeneral,sha256:sha(qrGeneral),expectedDestination:C.origin+'/demo',independentlyDecoded:false}};evidence.status='PASS_ANONYMOUS_PUBLIC_DISCOVERY_QR_DECODE_PENDING';
 }catch(e){evidence.code=safeCode(e);}finally{try{await client?.close();}catch{}}
 Object.assign(evidence,transport.summary());evidence.requestSummary=transport.requests;return {evidence,qrService,qrGeneral};
}
async function boundedPublicFile(root,path){const p=resolve(root,path),r=relative(root,p);if(!r||r==='..'||r.startsWith('..'+sep))fail('OWN_PUBLIC_EVIDENCE_REQUIRED');const stat=await lstat(p);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144)fail('BOUNDED_PUBLIC_EVIDENCE_REQUIRED');return readFile(p);}
async function saveExclusive(root,path,data){const f=await open(resolve(root,path),'wx');try{await f.writeFile(data);await f.sync();}finally{await f.close();}}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{
 const [action='check',flag,pin]=process.argv.slice(2),root=process.cwd();if(action==='check'){if(process.argv.length>3)fail('EXACT_CHECK_ARGUMENTS_REQUIRED');console.log(JSON.stringify(publicValidationPlan()));}
 else{
  if(action!=='execute'||process.argv.length!==5||flag!=='--approved-helper-sha256'||pin!==sha(await readFile(process.argv[1])))fail('EXACT_REVIEWED_HELPER_REQUIRED');
  const receipts={};for(const kind of ['bazaar','provider'])receipts[kind]=JSON.parse(await boundedPublicFile(root,'docs/evidence/on-demand-v3-production-'+kind+'-deployment-2026-10-11.json'));receipts.protection=JSON.parse(await boundedPublicFile(root,C.protectionReceipt));validatePublicProductionReceipts(receipts);
  for(const path of [C.evidence,C.qrService,C.qrGeneral]){try{await lstat(resolve(root,path));fail('EXISTING_EVIDENCE_NO_NETWORK_RETRY');}catch(e){if(e.code!=='ENOENT')throw e;}}
  const result=await validatePublicProduction(receipts);if(result.qrService)await saveExclusive(root,C.qrService,result.qrService);if(result.qrGeneral)await saveExclusive(root,C.qrGeneral,result.qrGeneral);await saveExclusive(root,C.evidence,JSON.stringify(result.evidence,null,2)+'\n');
  console.log(JSON.stringify({status:result.evidence.status,code:result.evidence.code,checks:result.evidence.checks.length,requests:result.evidence.requests,conservativeTransferBytes:result.evidence.conservativeTransferBytes,evidence:C.evidence,newAccounts:0,newOrders:0,newPayments:0,providerExecutions:0,providerTicks:0,readinessInvocations:0}));if(!result.evidence.status.startsWith('PASS_'))process.exitCode=1;
 }
}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED',code:safeCode(e),secretValuesInOutput:0,privateProfilesRead:0,newPayments:0,providerExecutions:0}));process.exitCode=1;}}
