import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {previewV2Plan,onDemandPreviewV2Control,validateV2Antecedents,matchDeployment} from '../.vercel/on-demand-preview-v2-control.mjs';
import {config} from './fixtures/seller-hosted.mjs';
import {sourceDigest} from './prepare-functional-preview-source.mjs';
import {validateFreeProviderProfile} from '../.vercel/free-demo-provider-preview-control.mjs';
const root=resolve(process.cwd()),current=await previewV2Plan(root),sha=b=>createHash('sha256').update(b).digest('hex'),fixture=await mkdtemp(resolve(root,'.vercel/on-demand-preview-v2-test-'));let checks=0,realNetworkRequests=0;const oldFetch=globalThis.fetch;globalThis.fetch=()=>{realNetworkRequests++;throw Error('OFFLINE_ONLY');};
try{
 assert.equal(current.pending,undefined);const plan=current.plan,antecedents=plan.antecedents;assert.equal(plan.stages.join(','),'final-v2');checks++;
 const ancestorReceipts={bootstrap:antecedents.bootstrap,provider:antecedents.provider},intents={};await mkdir(resolve(fixture,'.vercel'),{recursive:true});await mkdir(resolve(fixture,'docs/evidence'),{recursive:true});
 for(const stage of ['bootstrap','provider']){const path='.vercel/on-demand-preview-'+stage+'-intent.json',bytes=await readFile(resolve(root,path));await writeFile(resolve(fixture,path),bytes);intents[stage]=JSON.parse(bytes);}
 assert.equal(validateV2Antecedents(ancestorReceipts,intents),true);checks++;
 for(const patch of [{planHash:'f'.repeat(64)},{deploymentId:'bad'},{sourceDigest:'f'.repeat(64)},{purchasesEnabled:true},{providerBindingHash:'f'.repeat(64)}]){assert.throws(()=>validateV2Antecedents({...ancestorReceipts,provider:{...ancestorReceipts.provider,...patch}},intents));checks++;}
 const sourceDirectory='.vercel/continuous-on-demand-v2-bazaar-preview-source';await mkdir(resolve(fixture,sourceDirectory));const files=[];for(const[path,value]of [['vercel.json','{"crons":[]}'],['package.json','{"name":"synthetic-final-v2"}']]){const b=Buffer.from(value);await writeFile(resolve(fixture,sourceDirectory,path),b);files.push({path,bytes:b.length,sha256:sha(b)});}
 const source={...current.sources.bazaar,sourceDirectory,sourceDigest:sourceDigest(files),manifestValue:{files}},testCurrent={...current,sources:{...current.sources,bazaar:source}},bazaarProfile={purpose:'continuous-bazaar-review-preview',overrides:{...current.baseline.overrides,BAZAAR_ENABLE_MARKET_PURCHASES:'true'}},sellerProfile={purpose:'bazaar-hosted-seller-preview',prefix:'bazaar-seller:preview-2dea99ac5bc7c7b0896f57f97d94adaa',aclValidation:{status:'PASS'},redisUrl:'https://smooth-dory-323957.upstash.io',redisToken:'SYNTHETIC_SCOPED_TOKEN',key:'k'.repeat(43),cronSecret:'c'.repeat(43),bazaarProtection:'b'.repeat(43),providerProtection:'p'.repeat(43),config};
 let rows=[],calls=[],created;
 const command=async(args,input)=>{
  calls.push({args,input});assert.ok(!args.join(' ').includes(sellerProfile.redisToken));assert.ok(!args.join(' ').includes(sellerProfile.cronSecret));const arg=name=>args[args.indexOf(name)+1];
  if(args[0]==='deploy'){assert.equal(arg('--target'),'preview');assert.equal(arg('--project'),plan.projectIds.bazaar);const meta={};for(let i=0;i<args.length;i++)if(args[i]==='--meta'){const p=args[++i],at=p.indexOf('=');meta[p.slice(0,at)]=p.slice(at+1);}created={id:'dpl_SyntheticFinalV2',projectId:plan.projectIds.bazaar,target:null,url:'stellar-bazaar-x402-finalv2fake-cabscryptocontacto-6028s-projects.vercel.app',readyState:'READY',crons:[],meta};checks++;return {id:created.id};}
  const path=args[1],method=arg('--method');
  if(path.startsWith('/v13/deployments/')){assert.equal(method,'GET');const id=path.split('/')[3].split('?')[0];if(created?.id===id)return created;const stage=id===antecedents.provider.deploymentId?'provider':'bootstrap',r=antecedents[stage],i=intents[stage];assert.equal(id,r.deploymentId);return {id,projectId:r.projectId,target:null,url:new URL(r.url).hostname,readyState:'READY',crons:[],meta:{sourceDigest:r.sourceDigest,demoCandidate:r.candidate,onDemandPreviewPlan:antecedents.planHash,onDemandPreviewIntent:i.intentId,onDemandPreviewStage:stage}};}
  if(!path.includes('/env'))return {id:path.includes(plan.projectIds.provider)?plan.projectIds.provider:plan.projectIds.bazaar,accountId:plan.teamId,ssoProtection:{deploymentType:'all_except_custom_domains'}};
  if(method==='GET')return {envs:rows.map(r=>({...r}))};assert.equal(method,'POST');const data=JSON.parse(input);assert.deepEqual(data.target,['preview']);assert.ok(!data.key.includes('REDIS_REST_TOKEN'));const existing=rows.find(r=>r.key===data.key);if(existing)Object.assign(existing,data);else rows.push({id:'fake_'+rows.length,...data});checks++;return {};
 };
 const deps={command,planResolver:async()=>testCurrent,bindingValidator:p=>{validateFreeProviderProfile(p,'https://stellar-bazaar-x402-gwbzxq0qm-cabscryptocontacto-6028s-projects.vercel.app');return plan.providerBindingHash;}},options={bazaarProfile,sellerProfile,approvedPlanHash:plan.planHash};
 const readonly=await onDemandPreviewV2Control('private-check','final-v2',options,fixture,deps);assert.equal(readonly.metadataGets,4);assert.ok(calls.every(c=>c.args.includes('GET')));checks++;
 await assert.rejects(onDemandPreviewV2Control('deploy','final',options,fixture,deps),/EXPLICIT_NEW_PREVIEW_PLAN/);checks++;
 const ready=await onDemandPreviewV2Control('deploy','final-v2',options,fixture,deps);assert.equal(ready.stage,'final-v2');assert.equal(ready.purchasesEnabled,false);assert.equal(rows.find(r=>r.key==='BAZAAR_TEXT_SELLER_WAKE_URL').value,antecedents.provider.url+'/api/bazaar/seller/tick');assert.equal(rows.find(r=>r.key==='BAZAAR_ENABLE_MARKET_PURCHASES').value,'false');checks++;
 const before=calls.length;const recovered=await onDemandPreviewV2Control('recover','final-v2',options,fixture,deps);assert.equal(recovered.recoveredReadOnly,true);assert.ok(calls.slice(before).every(c=>c.args.includes('GET')));checks++;
 const intent=JSON.parse(await readFile(resolve(fixture,'.vercel/on-demand-v2-preview-final-v2-intent.json'),'utf8'));assert.equal(intent.parentDeploymentId,antecedents.provider.deploymentId);assert.ok(await readFile(resolve(fixture,'.vercel/on-demand-v2-preview-final-v2-upload-request.json')));checks++;
 assert.throws(()=>matchDeployment({...created,meta:{...created.meta,onDemandPreviewPlan:antecedents.planHash}},intent,plan,true));checks++;
 const output=JSON.stringify({readonly,ready,recovered});assert.ok(!output.includes(sellerProfile.redisToken));assert.ok(!output.includes(sellerProfile.cronSecret));checks++;
 assert.equal(realNetworkRequests,0);checks++;
 console.log(JSON.stringify({status:'PASS_OFFLINE_V2_FINAL_CONTROLLER',checks,simulatedDeployments:1,oldProviderAndBootstrapAntecedentsVerified:true,privateProfileFilesRead:0,realNetworkRequests,cloudWrites:0,realDeployments:0,purchasesEnabled:false,productionPublished:false,cronActivated:false,payments:0,privateValuesReturned:0}));
}finally{globalThis.fetch=oldFetch;const r=relative(root,fixture);if(!r.startsWith('.vercel'+sep+'on-demand-preview-v2-test-')||r.includes('..')||isAbsolute(r))throw Error('OWN_FIXTURE_CLEANUP_ONLY');await rm(fixture,{recursive:true,force:false});}
