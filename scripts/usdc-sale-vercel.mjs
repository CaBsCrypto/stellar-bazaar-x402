import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {loadPacket,savePacket,packetDirectory} from './marketplace-private-packet.mjs';
import {acquireSaleEffectLock} from '../examples/sale-effect-lock.mjs';
import {parseVercelMeterExport} from './parse-usdc-vercel-meter.mjs';
const directory='docs/evidence/sprint-marketplace',manifestPath=directory+'/usdc-sale-manifest.json';
const readJson=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
async function main(){
const manifest=await readJson(manifestPath),phase=process.argv[2];
const lock=await acquireSaleEffectLock(packetDirectory,manifest.planId);let journal,mutationAttempted=false;
try{
const cli=join(tmpdir(),'bazaar-vercel-cli-preview/node_modules/vercel/dist/index.js'),authDirectory=join(tmpdir(),'bazaar-vercel-auth-preview');
const journalPath=directory+'/usdc-vercel-control.json';
try{journal=await readJson(journalPath);}catch(e){if(e.code!=='ENOENT')throw e;journal={planId:manifest.planId,status:'PREPARATION',requests:0,creates:0,aliases:0,secretWrites:0,bypassCreates:0,attempts:[],deployments:{}};}
assert.equal(journal.planId,manifest.planId);assert.notEqual(journal.status,'UNCERTAIN','CONTROL_OUTCOME_UNCONFIRMED_DO_NOT_RETRY');
const persist=()=>writeFile(journalPath,JSON.stringify(journal,null,2)+'\n');
async function command(args,{body,cwd=process.cwd(),effect,decode='json'}={}){
 assert.ok(journal.requests+1<=manifest.limits.vercelControlRequests,'CONTROL_BUDGET');
 const attempt={phase,path:args[0],method:args.includes('--method')?args[args.indexOf('--method')+1]:'CLI',status:'PENDING',...(effect??{})};
 if(args[0]==='deploy'||args[0]==='api'&&attempt.method!=='GET')mutationAttempted=true;
 journal.requests++;journal.attempts.push(attempt);await persist();
 try{
  const stdout=await new Promise((done,reject)=>{const child=spawn(process.execPath,[cli,...args,'--scope','cabscryptocontacto-6028s-projects','--global-config',authDirectory],{cwd,env:{...process.env,VERCEL_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',bytes=0;const timer=setTimeout(()=>{child.kill();reject(Error('CONTROL_TIMEOUT'));},45000);child.stdout.on('data',v=>{bytes+=v.length;if(bytes>2097152){child.kill();reject(Error('CONTROL_RESPONSE_LIMIT'));}else output+=v;});child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(Error('CONTROL_TRANSPORT_UNCONFIRMED'));});child.on('close',code=>{clearTimeout(timer);code?reject(Error('CONTROL_REJECTED_OR_UNCONFIRMED')):done(output);});child.stdin.end(body);});
  const result=decode==='json'?JSON.parse(stdout):stdout;attempt.status='CONFIRMED';await persist();return result;
 }catch(error){attempt.status='UNCERTAIN';journal.status='UNCERTAIN';await persist();throw error;}
}
const api=(path,method='GET',body)=>command(['api',path,'--method',method,...(body===undefined?[]:['--input','-'])],{body:body===undefined?undefined:JSON.stringify(body)});
function deployGate(){assert.equal(manifest.readiness.localSaleMeasured,true);assert.equal(manifest.readiness.payloadsFrozen,true);assert.equal(manifest.readiness.freeMarginRefreshed,true);assert.equal(manifest.readiness.canDeployPreview,true);assert.match(manifest.sourceSha,/^[a-f0-9]{40}$/);assert.equal(journal.projects?.provider.protection,true,'PROVIDER_PROTECTION_REQUIRED');assert.equal(journal.projects?.bazaar.protection,true,'BAZAAR_PROTECTION_REQUIRED');}
function summaryDeployment(value){const protectionMetadataReported=['ssoProtection','passwordProtection','deploymentProtection'].some(key=>Object.hasOwn(value,key));return {id:value.id??value.uid,url:value.url?.startsWith('https://')?value.url:'https://'+value.url,readyState:value.readyState??value.state,sourceSha:value.meta?.usdcSourceSha??value.meta?.gitCommitSha??value.meta?.githubCommitSha,gitCommitSha:value.meta?.gitCommitSha??value.meta?.githubCommitSha,payloadFingerprint:value.meta?.usdcPayloadFingerprint,target:value.target??'preview',protectionEnabled:protectionMetadataReported?Boolean(value.ssoProtection||value.passwordProtection||value.deploymentProtection?.length):null,protectionObservation:protectionMetadataReported?'reported':'unknown'};}
async function deploy(target,step){
 deployGate();const label=target+'-'+step;assert.ok(!journal.deployments[label],'DEPLOYMENT_ALREADY_CREATED_USE_STATUS');
 assert.ok(journal.creates+1<=manifest.limits.vercelDeploymentCreates);
 const audit=await readJson(directory+`/usdc-${target}-upload-audit.json`);
 for(const file of audit.files){const contents=await readFile(resolve(target==='provider'?'../provider-guionista-recovered':'.',file.path));assert.equal(contents.length,file.bytes);assert.equal(digest(contents),file.sha256,'SOURCE_INPUT_CHANGED');}
 assert.equal(audit.payloadFingerprint,manifest.uploads[target].payloadFingerprint);
 const projectId=target==='provider'?manifest.providerProjectId:manifest.projectId;
 const args=['deploy','--project',projectId,'--yes','--no-wait','--json','--meta','usdcSalePlanId='+manifest.planId,'--meta','usdcSourceSha='+manifest.sourceSha,'--meta','usdcPayloadFingerprint='+audit.payloadFingerprint];
 const runtimeFlags={},buildFlags={};
 const add=(type,values)=>{Object.assign(type==='--env'?runtimeFlags:buildFlags,values);for(const [key,value]of Object.entries(values))args.push(type,key+'='+value);};
 if(target==='provider'){
  assert.ok(['initial','proof'].includes(step));
  add('--env',{BAZAAR_MARKETPLACE_TEXT_ENABLED:'true',BAZAAR_MARKETPLACE_WORKER_TOKEN_SHA256:manifest.payloads.workerHash,BAZAAR_MARKETPLACE_CONTROL_PROOF:step==='proof'?manifest.payloads.expectedRecord:''});
  if(step==='proof')assert.match(manifest.payloads.expectedRecord,/^stellar-bazaar-verification=[A-Za-z0-9_-]{24}$/);
 }else{
  assert.ok(['probe','candidate','replacement','closed'].includes(step));
  const open=step==='candidate'||step==='replacement';
  const flags={NEXT_PUBLIC_BAZAAR_MARKETPLACE:'true',BAZAAR_ENABLE_OPEN_WORKSPACES:'true',BAZAAR_ENABLE_MARKETPLACE:'true',BAZAAR_ENABLE_MARKET_PURCHASES:String(open),BAZAAR_ENABLE_SELF_LISTING_INTAKE:String(open),BAZAAR_ENABLE_PROVIDER_ACTIVATION:String(open),BAZAAR_ACCEPTANCE_METER:'true',BAZAAR_ACCEPTANCE_SALE:'true',BAZAAR_ACCEPTANCE_CATALOG_CARD_ID:manifest.payloads.serviceId,BAZAAR_WORKSPACE_CREATION_PAUSED:'true',BAZAAR_WORKSPACE_ADMISSION:'invite-only',BAZAAR_WORKSPACE_PUBLIC_ORIGIN:'vercel-preview',BAZAAR_WORKSPACE_BACKEND:'redis',BAZAAR_PROVIDER_REVIEW_BACKEND:'redis',BAZAAR_WORKSPACE_PREFIX:manifest.config.workspacePrefix,BAZAAR_MARKET_PREFIX:manifest.config.marketPrefix,BAZAAR_REVIEW_PREFIX:manifest.config.reviewPrefix,BAZAAR_DYNAMIC_PREFIX:manifest.config.dynamicPrefix,BAZAAR_WORKSPACE_INVITE_HASHES_JSON:JSON.stringify(manifest.payloads.admissionHashes),BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE:'120',BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY:'1000',BAZAAR_MARKET_OPERATOR_HASH:manifest.payloads.operatorHash,BAZAAR_PROVIDER_PREVIEW_HOST:new URL(manifest.config.providerOrigin).hostname,BAZAAR_ENABLE_PROVIDER_REVIEW_ADMIN:'false',BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW:'false',BAZAAR_ENABLE_REGISTRY_MUTATIONS:'false',X402_PILOT_PAYMENTS_ENABLED:'false',X402_LEGACY_PAYMENTS_ENABLED:'false',X402_ENABLE_LOCAL_PAYER:'false',NEXT_PUBLIC_X402_XLM_PILOT:'false',UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:''};
  add('--env',flags);
  add('--build-env',{...flags,BAZAAR_ENABLE_OPEN_WORKSPACES:'false',BAZAAR_ENABLE_MARKETPLACE:'false',BAZAAR_ENABLE_MARKET_PURCHASES:'false',BAZAAR_ACCEPTANCE_METER:'false',BAZAAR_ACCEPTANCE_SALE:'false',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'false',BAZAAR_ENABLE_PROVIDER_ACTIVATION:'false',BAZAAR_WORKSPACE_REDIS_REST_URL:'',BAZAAR_WORKSPACE_REDIS_REST_TOKEN:'',BAZAAR_REVIEW_REDIS_REST_URL:'',BAZAAR_REVIEW_REDIS_REST_TOKEN:'',BAZAAR_MARKET_REVIEW_SECRET:'',BAZAAR_PROVIDER_PREVIEW_BYPASS:''});
 }
 const runtimeHash=digest(runtimeFlags),buildHash=digest(buildFlags);args.push('--meta','usdcRuntimeHash='+runtimeHash,'--meta','usdcBuildHash='+buildHash);
 journal.deploymentIntents??={};assert.ok(!journal.deploymentIntents[label],'DEPLOYMENT_INTENT_ALREADY_EXISTS');journal.deploymentIntents[label]={sourceSha:manifest.sourceSha,payloadFingerprint:audit.payloadFingerprint,runtimeFlags,buildFlags,runtimeHash,buildHash,target:'preview',projectId};journal.creates++;await persist();
 const result=await command(args,{cwd:target==='provider'?resolve('../provider-guionista-recovered'):process.cwd(),effect:{deploymentCreates:1,projectId,target:'preview',productionChanges:0}});
 const deployment=summaryDeployment(result.deployment??result);journal.deployments[label]=deployment;await persist();
 try{assert.match(deployment.id,/^dpl_/);assert.ok(deployment.url.startsWith('https://'));}catch(error){journal.status='UNCERTAIN';await persist();throw error;}
 console.log(JSON.stringify({phase,label,...deployment}));
}
try{
 if(phase==='inspect'){
  const provider=await api('/v9/projects/'+manifest.providerProjectId),bazaar=await api('/v9/projects/'+manifest.projectId);
  const packet=await loadPacket();const bypass=Object.entries(provider.protectionBypass??{}).find(([,v])=>v.scope==='automation-bypass');
  if(bypass){packet.sale.providerBypass=bypass[0];await savePacket(packet);}
  const bazaarBypass=Object.entries(bazaar.protectionBypass??{}).find(([,v])=>v.scope==='automation-bypass');if(bazaarBypass){packet.sale.bazaarBypass=bazaarBypass[0];await savePacket(packet);}
  journal.projects={provider:{id:provider.id,name:provider.name,protection:Boolean(provider.ssoProtection),automationBypassExists:Boolean(bypass)},bazaar:{id:bazaar.id,name:bazaar.name,protection:Boolean(bazaar.ssoProtection),automationBypassExists:Boolean(bazaarBypass)}};await persist();console.log(JSON.stringify(journal.projects));
 }else if(phase==='preview-toolbar-off'){
  deployGate();const plan=manifest.previewToolbarControl;assert.equal(plan?.projectId,manifest.projectId);assert.equal(plan.maxWrites,1);assert.deepEqual(plan.payload,{enablePreviewFeedback:false});assert.ok(!journal.previewToolbar,'TOOLBAR_CONTROL_ALREADY_COMPLETE');
  const before=await api('/v9/projects/'+manifest.projectId);assert.ok(before.ssoProtection,'PREVIEW_PROTECTION_REQUIRED');
  const protectionHash=digest(before.ssoProtection),productionFeedback=before.enableProductionFeedback??null;
  journal.previewToolbar={previousEnablePreviewFeedback:before.enablePreviewFeedback??null,previousEnableProductionFeedback:productionFeedback,protectionHash,status:'PREPARED',writes:0};await persist();
  if(before.enablePreviewFeedback!==false){journal.previewToolbar.writes++;await persist();await api('/v9/projects/'+manifest.projectId,'PATCH',plan.payload);}
  const after=await api('/v9/projects/'+manifest.projectId);assert.equal(after.enablePreviewFeedback,false);assert.equal(digest(after.ssoProtection),protectionHash);assert.equal(after.enableProductionFeedback??null,productionFeedback);
  journal.previewToolbar.status='CONFIRMED';await persist();console.log(JSON.stringify({previewFeedback:false,protectionUnchanged:true,productionFeedbackUnchanged:true,writes:journal.previewToolbar.writes}));
 }else if(phase==='bypass'){
  deployGate();const packet=await loadPacket();assert.equal(packet.sale.providerBypass,undefined,'EXISTING_BYPASS_DO_NOT_REPLACE');assert.ok(journal.bypassCreates+1<=manifest.limits.vercelBypassCreates);journal.bypassCreates++;await persist();
  const result=await api('/v1/projects/'+manifest.providerProjectId+'/protection-bypass','PATCH',{}),entry=Object.entries(result.protectionBypass??{}).find(([,v])=>v.scope==='automation-bypass');assert.ok(entry,'BYPASS_RESPONSE_UNCONFIRMED');packet.sale.providerBypass=entry[0];await savePacket(packet);console.log(JSON.stringify({automationBypassPrepared:true,protectionDisabled:false}));
 }else if(phase==='secrets'){
  deployGate();const packet=await loadPacket();assert.match(packet.sale.providerBypass??'',/^[A-Za-z0-9_-]{16,256}$/);
  const values=[{key:'BAZAAR_MARKET_REVIEW_SECRET',value:packet.sale.reviewSecret},{key:'BAZAAR_PROVIDER_PREVIEW_BYPASS',value:packet.sale.providerBypass}];
  for(const value of values){assert.ok(!packet.sale.secretKeys?.includes(value.key),'SECRET_ALREADY_PREPARED');assert.ok(journal.secretWrites+1<=manifest.limits.vercelSecretWrites);journal.secretWrites++;await persist();const result=await api('/v10/projects/'+manifest.projectId+'/env','POST',{...value,type:'sensitive',target:['preview'],comment:'USDC sale '+manifest.planId});if(result.failed?.length)throw Error('SECRET_PREPARATION_REJECTED');const record=result.created??result;assert.ok(record.id||Array.isArray(record)&&record[0]?.id,'SECRET_RESPONSE_UNCONFIRMED');packet.sale.secretKeys??=[];packet.sale.secretKeys.push(value.key);await savePacket(packet);}
  console.log(JSON.stringify({previewSecretsPrepared:2,productionChanges:0,localPlaintextFiles:0}));
 }else if(phase==='status'){
  const label=process.argv[3],value=journal.deployments[label];assert.ok(value,'UNKNOWN_DEPLOYMENT');const actual=await api('/v13/deployments/'+value.id),summary=summaryDeployment(actual);
  assert.equal(summary.sourceSha,manifest.sourceSha,'ACTUAL_SOURCE_SHA_MISMATCH');assert.equal(summary.payloadFingerprint,manifest.uploads[label.startsWith('provider')?'provider':'bazaar'].payloadFingerprint);assert.ok(actual.target!=='production');journal.deployments[label]=summary;await persist();
  if(label.startsWith('bazaar-'))assert.equal(summary.gitCommitSha,manifest.sourceSha,'ACTUAL_GIT_SOURCE_SHA_MISMATCH');
  const binding=journal.deploymentIntents[label];assert.equal(actual.meta?.usdcRuntimeHash,binding.runtimeHash);assert.equal(actual.meta?.usdcBuildHash,binding.buildHash);
  if(summary.readyState==='READY'){const evidence={...summary,planId:manifest.planId,runtimeHash:binding.runtimeHash,buildHash:binding.buildHash,runtimeFlags:binding.runtimeFlags,buildFlags:binding.buildFlags};await writeFile(directory+'/usdc-'+label+'.json',JSON.stringify(evidence,null,2)+'\n');if(label.startsWith('bazaar-'))await writeFile(directory+'/usdc-bazaar-current.json',JSON.stringify(evidence,null,2)+'\n');const manifestKey=label.replace(/-([a-z])/g,(_,character)=>character.toUpperCase());manifest.deployments??={};manifest.deployments[manifestKey]=evidence;await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');}
  console.log(JSON.stringify(summary));
 }else if(phase==='alias'){
  deployGate();const label=process.argv[3],value=journal.deployments[label];assert.ok(['provider-initial','provider-proof'].includes(label)&&value?.readyState==='READY');const protection=await readJson(directory+(label==='provider-initial'?'/usdc-provider-protection-check.json':'/usdc-provider-proof-protection-check.json'));assert.equal(protection.status,'PASS');assert.equal(protection.unauthenticatedDenied,true);assert.equal(protection.deploymentId,value.id);assert.equal(protection.sourceSha,manifest.sourceSha);assert.ok(journal.aliases+1<=manifest.limits.vercelAliasWrites);journal.aliases++;await persist();await api('/v2/deployments/'+value.id+'/aliases','POST',{alias:new URL(manifest.config.providerOrigin).hostname});
  const actual=await api('/v4/aliases/'+new URL(manifest.config.providerOrigin).hostname);assert.equal(actual.projectId,manifest.providerProjectId);assert.equal(actual.deploymentId,value.id);assert.ok(!actual.redirect);journal.providerAlias={alias:actual.alias,projectId:actual.projectId,deploymentId:actual.deploymentId,verifiedAt:new Date().toISOString()};await persist();console.log(JSON.stringify({...journal.providerAlias,productionAliasChanged:false}));
 }else if(phase==='logs'){
  const label=process.argv[3],value=journal.deployments[label];assert.ok(value?.readyState==='READY');
  const since='2026-10-04T20:00:00.000Z';
  const raw=await command(['logs',value.id,'--query','acceptanceMeter','--json','--limit','100','--since',since],{decode:'text'});
  const {records,rawRecords,skipped}=parseVercelMeterExport(raw,{deploymentId:value.id});
  const collectionComplete=rawRecords<100&&skipped.every(v=>['non-json-message','non-v1-meter-message'].includes(v.type));
  const reportPath=directory+'/usdc-meter-'+label+'.json';
  try{const prior=await readFile(reportPath);await writeFile(directory+'/usdc-meter-'+label+'-snapshot-'+journal.requests+'.json',prior,{flag:'wx'});}catch(error){if(error.code!=='ENOENT')throw error;}
  await writeFile(reportPath,JSON.stringify({planId:manifest.planId,sourceSha:manifest.sourceSha,deploymentId:value.id,collection:{complete:collectionComplete,limit:100,rawRecords,meterObservationCount:records.length,since},records,skipped},null,2)+'\n');console.log(JSON.stringify({label,deploymentId:value.id,records:records.length,rawRecords,collectionComplete,uncertain:records.some(v=>v.uncertain),skippedMessages:skipped.length}));
 }else if(phase?.startsWith('provider-'))await deploy('provider',phase.slice(9));
 else if(phase?.startsWith('bazaar-'))await deploy('bazaar',phase.slice(7));
 else throw Error('EXPLICIT_CONTROL_PHASE_REQUIRED');
}catch(error){if(mutationAttempted){journal.status='UNCERTAIN';await persist();}console.error(error.message);process.exitCode=1;}
}finally{if(journal?.status==='UNCERTAIN'||journal?.attempts.some(v=>v.status==='PENDING'))await lock.preserve();else await lock.release();}
}
await main().catch(error=>{console.error(error.message);process.exitCode=1;});
