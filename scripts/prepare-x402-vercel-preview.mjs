import assert from 'node:assert/strict';
import {readFile,writeFile,realpath,lstat} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {currentX402SourceBinding} from './run-hosted-x402-agent.mjs';
import {localX402Failures} from './x402-acceptance-manifest.mjs';
const root=resolve('.'),evidence='docs/evidence/sprint-x402-agent';
const planPath=join(evidence,'preparation-preview-plan-20261005-01.json'),reportPath=join(evidence,'preparation-preview-control-20261005-01.json');
const json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const projectId='prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',teamId='team_XjolcoWJ9V9yamVnCdpC7EMY';
const policy=Object.freeze({origin:'https://api.vercel.com',createPath:'/v13/deployments',maxCreates:1,maxStatusReads:6,maxRequestBytes:8*1048576,maxResponseBytes:524288,timeoutMs:20000,retries:0,redirects:0,productionChanges:0,protectionChanges:0,projectEnvironmentWrites:0,payments:0,providerExecutions:0});
const allowedRoot=new Set(['.gitattributes','.vercelignore','LICENSE','next-env.d.ts','package.json','package-lock.json','proxy.ts','tsconfig.json','vercel.json']);
const draft=await json(join(evidence,'service-preparation.json'));
const old=await json('docs/evidence/sprint-marketplace/usdc-sale-manifest.json');
const infra=await json(join(evidence,'existing-vercel-read-preparation-20261005-02.json'));
assert.equal(draft.planId,'aa002e77-b950-442f-bb41-df5fa4a7f45f');
assert.equal(draft.config.workspacePrefix,'bazaar-workspace:pilot-be8432d7255e0a3b0dca564d8aa769a0');assert.equal(draft.config.marketPrefix,'bazaar-market:pilot-be8432d7255e0a3b0dca564d8aa769a0');assert.equal(draft.config.reviewPrefix,'bazaar-review:pilot-be8432d7255e0a3b0dca564d8aa769a0');assert.equal(draft.config.dynamicPrefix,draft.config.marketPrefix+':catalog');
assert.equal(draft.config.providerOrigin,'https://guionista-market-7f3e80bed9be.vercel.app');assert.equal(draft.payloads.serviceId,'guionista-algorithmic-text-x402-pilot');
assert.deepEqual(draft.storageAllocation,{workspace:7000,market:18000,review:9000,catalog:5000,settlement:10164});assert.deepEqual(draft.config.catalogValueCaps,{'guionista-algorithmic-text-pilot':2250,'guionista-algorithmic-text-x402-pilot':2250});
assert.equal(old.payloads.operatorHash,'750ec4fcd5eccd7570940494c7d79b129945cc5da3d528d834b8062edc951736');
assert.deepEqual(old.payloads.admissionHashes,['e1c944d64e80835b61c5932e43ea20260d430c1c43d9ef5c0f326186039cadec','58599d6a9719cbc6bf3f4a5ef86bdb226d7b59b87f5f5fe3df98615ea57aa420','0c3e196c6b503d3b7b319890b632167fd950ffc183719fb3fd4568096f3e8ad4','d454dfd159eedb4d759f09821fd636e5e2e4f9b14737cca0f9a92689aa589e4d','f280c53b0a36ca6d1a55bb5cfbf0d09a592eda7e5bb18e83753de735b75cee3b']);
async function sourceFiles(dryPath){
 const dry=await json(dryPath),files=[],paths=new Set();assert.ok(Array.isArray(dry.files)&&dry.files.length>0&&dry.files.length<500);
 for(const file of dry.files){
  const path=file.path.replaceAll('\\','/');assert.ok(!path.split('/').some(p=>p==='..'||p==='')&&(/^(app|lib|components|public|styles)\//.test(path)||allowedRoot.has(path)),'UPLOAD_ALLOWLIST');
  assert.ok(!paths.has(path),'UPLOAD_DUPLICATE_PATH');paths.add(path);
  const absolute=resolve(root,path);assert.ok(absolute.startsWith(root+sep));assert.equal((await lstat(absolute)).isSymbolicLink(),false);assert.ok((await realpath(absolute)).startsWith((await realpath(root))+sep));const content=await readFile(absolute);
  assert.equal(content.length,file.size);assert.equal(createHash('sha1').update(content).digest('hex'),file.sha,'UPLOAD_INPUT_CHANGED');
  if(/\.(ts|tsx|js|mjs|json|txt|html|css)$/.test(path))assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bS[A-Z2-7]{55}\b|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/.test(content.toString('utf8')),'LITERAL_SECRET_SCAN');
  files.push({path,bytes:content.length,sha1:file.sha,sha256:hash(content),data:content.toString('base64')});
 }
 return files;
}
function flags(){
 const runtime={NEXT_PUBLIC_BAZAAR_MARKETPLACE:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_ENABLE_MARKETPLACE:'true',
  BAZAAR_ENABLE_MARKET_PURCHASES:'false',BAZAAR_X402_MARKETPLACE_ENABLED:'false',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true',BAZAAR_ENABLE_PROVIDER_ACTIVATION:'true',
  BAZAAR_ACCEPTANCE_METER:'true',BAZAAR_ACCEPTANCE_SALE:'true',BAZAAR_ACCEPTANCE_X402:'true',BAZAAR_ACCEPTANCE_STORAGE_CAPS_JSON:JSON.stringify(draft.storageAllocation),
  BAZAAR_ACCEPTANCE_CATALOG_VALUE_CAPS_JSON:JSON.stringify(draft.config.catalogValueCaps),BAZAAR_ACCEPTANCE_SETTLEMENT_KEY:draft.config.marketPrefix+':x402-settlements:state',BAZAAR_ACCEPTANCE_CATALOG_CARD_ID:draft.payloads.serviceId,
  BAZAAR_WORKSPACE_CREATION_PAUSED:'true',BAZAAR_WORKSPACE_ADMISSION:'invite-only',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'vercel-preview',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',
  BAZAAR_WORKSPACE_PREFIX:draft.config.workspacePrefix,BAZAAR_MARKET_PREFIX:draft.config.marketPrefix,BAZAAR_REVIEW_PREFIX:draft.config.reviewPrefix,BAZAAR_DYNAMIC_PREFIX:draft.config.dynamicPrefix,
  BAZAAR_WORKSPACE_INVITE_HASHES_JSON:JSON.stringify(old.payloads.admissionHashes),BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE:'120',BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY:'1000',
  BAZAAR_MARKET_OPERATOR_HASH:old.payloads.operatorHash,BAZAAR_PROVIDER_PREVIEW_HOST:new URL(draft.config.providerOrigin).hostname,
  BAZAAR_ENABLE_PROVIDER_REVIEW_ADMIN:'false',BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW:'false',BAZAAR_ENABLE_REGISTRY_MUTATIONS:'false',
  X402_PILOT_PAYMENTS_ENABLED:'false',X402_LEGACY_PAYMENTS_ENABLED:'false',X402_ENABLE_LOCAL_PAYER:'false',NEXT_PUBLIC_X402_XLM_PILOT:'false',
  STELLAR_X402_FACILITATOR_URL:'https://channels.openzeppelin.com/x402/testnet',STELLAR_X402_RPC_URL:'https://soroban-testnet.stellar.org',
  UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:'',KV_REST_API_URL:'',KV_REST_API_TOKEN:''};
 const build={...runtime};for(const key of ['BAZAAR_ENABLE_OPEN_WORKSPACES','BAZAAR_ENABLE_MARKETPLACE','BAZAAR_ENABLE_SELF_LISTING_INTAKE','BAZAAR_ENABLE_PROVIDER_ACTIVATION','BAZAAR_ACCEPTANCE_METER','BAZAAR_ACCEPTANCE_SALE','BAZAAR_ACCEPTANCE_X402'])build[key]='false';
 for(const key of ['BAZAAR_WORKSPACE_REDIS_REST_URL','BAZAAR_WORKSPACE_REDIS_REST_TOKEN','BAZAAR_REVIEW_REDIS_REST_URL','BAZAAR_REVIEW_REDIS_REST_TOKEN','BAZAAR_MARKET_REVIEW_SECRET','BAZAAR_PROVIDER_PREVIEW_BYPASS','STELLAR_X402_FACILITATOR_API_KEY'])build[key]='';
 return {runtime,build};
}
function bodyFor(plan,files){return {name:'stellar-bazaar-x402',project:projectId,files:files.map(v=>({file:v.path,data:v.data,encoding:'base64'})),env:plan.runtimeFlags,build:{env:plan.buildFlags},
 autoAssignCustomDomains:false,gitMetadata:{commitRef:'mission/open-bazaar-local',commitSha:plan.sourceSha,dirty:false},
 meta:{x402PlanId:plan.planId,x402SourceSha:plan.sourceSha,x402PayloadFingerprint:plan.payloadFingerprint,x402RuntimeHash:plan.runtimeHash,x402BuildHash:plan.buildHash,x402Phase:'protected-preparation-no-payments'}};}
async function main(){
 const [command='prepare']=process.argv.slice(2);
 if(command==='prepare'){
  const source=await currentX402SourceBinding(draft);assert.ok(source.clean,'CANDIDATE_SOURCE_DIRTY');
  assert.equal(infra.status,'EXISTING_INFRA_READ_COMPLETE');const project=infra.reads.find(v=>v.label==='bazaar-project').summary;assert.equal(project.id,projectId);assert.equal(project.accountId,teamId);assert.equal(project.deploymentProtectionEnabled,true);
  const dryPath=join(evidence,'candidate-upload-dry-20261005-02.json'),files=await sourceFiles(dryPath),audited=files.map(({data,...v})=>v),f=flags();
  const plan={version:1,status:'PREPARED_NO_REMOTE_EFFECT',planId:draft.planId,sourceSha:source.sha,projectId,teamId,dryPath,infraSHA256:hash(infra),files:audited,
   fileCount:files.length,sourceBytes:files.reduce((n,v)=>n+v.bytes,0),payloadFingerprint:hash(audited),runtimeFlags:f.runtime,buildFlags:f.build,runtimeHash:hash(f.runtime),buildHash:hash(f.build),
   policy,
   captureScope:'Explicit deployment-control HTTP representation; retained separately and must be included in aggregate pre-payment reconciliation.'};
  const body=JSON.stringify(bodyFor(plan,files));plan.bodyBytes=Buffer.byteLength(body);plan.bodySHA256=hash(body);assert.ok(plan.bodyBytes+8192<=plan.policy.maxRequestBytes);
  await writeFile(planPath,JSON.stringify(plan,null,2)+'\n',{flag:'wx',flush:true});console.log(JSON.stringify({status:plan.status,sourceSha:plan.sourceSha,fileCount:plan.fileCount,sourceBytes:plan.sourceBytes,bodyBytes:plan.bodyBytes,payloadFingerprint:plan.payloadFingerprint}));return;
 }
 const plan=await json(planPath);assert.deepEqual(plan.policy,policy);assert.equal(plan.projectId,projectId);assert.equal(plan.teamId,teamId);assert.equal(plan.planId,draft.planId);
 const f=flags();assert.deepEqual(plan.runtimeFlags,f.runtime);assert.deepEqual(plan.buildFlags,f.build);assert.equal(plan.runtimeHash,hash(f.runtime));assert.equal(plan.buildHash,hash(f.build));assert.equal(plan.infraSHA256,hash(infra));
 const source=await currentX402SourceBinding(draft);assert.equal(source.sha,plan.sourceSha);assert.ok(source.clean);
 const files=await sourceFiles(plan.dryPath);assert.deepEqual(files.map(({data,...v})=>v),plan.files);assert.equal(hash(files.map(({data,...v})=>v)),plan.payloadFingerprint);
 let report;
 if(command==='create'){
  const local=await json(join(evidence,'native-local-phased-preparation-20261005-01.json'));assert.deepEqual(localX402Failures(local,plan.sourceSha),[]);assert.equal(local.sourceBinding.candidateCommitted,true);assert.equal(local.sourceBinding.finalShaRequired,false);
  report={version:1,planId:plan.planId,sourceSha:plan.sourceSha,planSHA256:hash(plan),status:'CREATION_PENDING',creates:1,statusReads:0,counters:{controlApiRequests:0,outBytes:0,inBytes:0},attempts:[]};
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',flush:true});
 }else{assert.equal(command,'status');report=await json(reportPath);assert.equal(report.planSHA256,hash(plan));assert.equal(report.planId,plan.planId);assert.equal(report.sourceSha,plan.sourceSha);assert.ok(['CREATED','BUILDING','READY'].includes(report.status));assert.match(report.deployment?.id??'',/^dpl_[A-Za-z0-9]+$/);assert.ok(report.statusReads<plan.policy.maxStatusReads);report.statusReads++;}
 const persist=()=>writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flush:true});
 const auth=JSON.parse(await readFile(join(tmpdir(),'bazaar-vercel-auth-preview','auth.json'),'utf8'));assert.ok(typeof auth.token==='string'&&auth.token.length>0&&auth.token.length<=4096&&!/[\r\n\0]/.test(auth.token));
 const path=command==='create'?plan.policy.createPath:'/v13/deployments/'+report.deployment.id,url=new URL(path,plan.policy.origin);url.searchParams.set('teamId',teamId);
 const method=command==='create'?'POST':'GET',body=command==='create'?JSON.stringify(bodyFor(plan,files)):undefined;if(body){assert.equal(hash(body),plan.bodySHA256);assert.equal(Buffer.byteLength(body),plan.bodyBytes);}
 const headers=new Headers({authorization:'Bearer '+auth.token,'content-type':'application/json'}),outBytes=Buffer.byteLength(body??'')+Array.from(headers).reduce((n,[k,v])=>n+Buffer.byteLength(`${k}: ${v}\r\n`),Buffer.byteLength(`${method} ${url.pathname}${url.search} HTTP/1.1\r\nhost: ${url.host}\r\n\r\n`));assert.ok(outBytes<=plan.policy.maxRequestBytes);
 const attempt={method,path,status:'PENDING',startedAt:new Date().toISOString()};report.attempts.push(attempt);report.counters.controlApiRequests++;report.counters.outBytes+=outBytes;report.counters.inBytes+=plan.policy.maxResponseBytes;await persist();let observed=0;
 try{
  const response=await fetch(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(plan.policy.timeoutMs)});observed=Array.from(response.headers).reduce((n,[k,v])=>n+Buffer.byteLength(`${k}: ${v}\r\n`),Buffer.byteLength(`HTTP/1.1 ${response.status} ${response.statusText}\r\n\r\n`));if(observed>plan.policy.maxResponseBytes){await response.body?.cancel();throw Error('RESPONSE_CAP');}
  const chunks=[],reader=response.body?.getReader();if(reader)for(;;){const n=await reader.read();if(n.done)break;observed+=n.value.byteLength;if(observed>plan.policy.maxResponseBytes){await reader.cancel();throw Error('RESPONSE_CAP');}chunks.push(Buffer.from(n.value));}
  const bytes=Buffer.concat(chunks);attempt.httpStatus=response.status;attempt.inBytes=observed;attempt.responseSHA256=hash(bytes);report.counters.inBytes-=plan.policy.maxResponseBytes-observed;
  if(!response.ok){attempt.status='HTTP_REJECTED';report.status='STOPPED_CONFIRMED';await persist();throw Error('HTTP_REJECTED');}
  const value=JSON.parse(bytes.toString('utf8'));assert.match(value.id??'',/^dpl_[A-Za-z0-9]+$/);assert.equal(value.projectId,projectId);assert.notEqual(value.target,'production');
  assert.equal(value.meta?.x402SourceSha,plan.sourceSha);assert.equal(value.meta?.x402PayloadFingerprint,plan.payloadFingerprint);assert.equal(value.meta?.x402RuntimeHash,plan.runtimeHash);assert.equal(value.meta?.x402BuildHash,plan.buildHash);
  assert.match(value.url,/^stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/);
  assert.ok(['QUEUED','INITIALIZING','BUILDING','READY','ERROR','CANCELED'].includes(value.readyState),'DEPLOYMENT_STATE_UNRECOGNIZED');
  if(report.deployment)assert.equal(value.id,report.deployment.id);
  report.deployment={id:value.id,origin:'https://'+value.url,sourceSha:plan.sourceSha,target:'preview',readyState:value.readyState,payloadFingerprint:plan.payloadFingerprint,runtimeHash:plan.runtimeHash,buildHash:plan.buildHash,
   protectionObservation:'project-configured; anonymous HTTP probe still pending',configurationObservation:'metadata hashes bound; runtime values must still be independently inspected'};
  attempt.status='CONFIRMED';report.status=value.readyState==='READY'?'READY':['ERROR','CANCELED'].includes(value.readyState)?'BUILD_ERROR':command==='create'?'CREATED':'BUILDING';await persist();console.log(JSON.stringify({status:report.status,deployment:report.deployment,counters:report.counters}));
 }catch{if(attempt.status==='PENDING'){attempt.status='UNCERTAIN';attempt.partialResponseBytes=observed;report.counters.inBytes+=Math.max(0,observed-plan.policy.maxResponseBytes);report.status='UNCERTAIN';await persist();}throw Error('STOPPED_NO_RETRY');}
}
main().catch(()=>{console.error(JSON.stringify({status:'PREPARATION_CLOSED_OR_UNCONFIRMED_NO_RETRY'}));process.exitCode=1;});
