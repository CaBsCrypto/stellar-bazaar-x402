import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {ON_DEMAND_BASES,ON_DEMAND_OVERLAYS,onDemandTargets,onDemandVercelConfiguration,validateOnDemandCandidate,readPlainOnDemandSource,validateOnDemandDependencies} from './prepare-on-demand-sources.mjs';
import {onDemandReleasePlan,onDemandReleaseApproval,matchOnDemandReleaseDeployment} from './continuous-on-demand-release-controls.mjs';
import {sourceDigest} from './prepare-functional-preview-source.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');let checks=0,networkRequests=0;
const oldFetch=globalThis.fetch;globalThis.fetch=()=>{networkRequests++;throw Error('OFFLINE_ONLY');};
const root=resolve(process.cwd()),fixture=await mkdtemp(resolve(root,'.vercel/on-demand-source-test-'));
try{
 for(const kind of ['bazaar','provider'])for(const environment of ['preview','production']){
  const targets=onDemandTargets(kind,environment);assert.ok(targets.sourceDirectory.startsWith('.vercel/continuous-on-demand-'));assert.ok(!targets.sourceDirectory.includes('free-demo'));checks++;
  const before={regions:['iad1'],functions:{[kind==='bazaar'?'app/api/**/route.ts':'server.ts']:{maxDuration:60}},crons:[{path:kind==='bazaar'?'/api/market/guardian/tick':'/api/bazaar/seller/tick',schedule:kind==='bazaar'?'*/15 * * * *':'*/2 * * * *'}]};
  const baseBuffers=new Map([['vercel.json',Buffer.from(JSON.stringify(before))],['package.json',Buffer.from('{"name":"synthetic-unchanged"}')]]),baseFiles=[...baseBuffers].map(([path,b])=>({path,bytes:b.length,sha256:sha(b)}));
  const buffers=new Map(baseBuffers);for(const [path]of Object.entries(ON_DEMAND_OVERLAYS[kind]))buffers.set(path,Buffer.from('synthetic reviewed runtime '+path));buffers.set('vercel.json',onDemandVercelConfiguration(kind,environment,baseBuffers.get('vercel.json')));
  const config=JSON.parse(buffers.get('vercel.json'));assert.deepEqual(config.crons,kind==='bazaar'&&environment==='production'?[{path:'/api/market/guardian/tick',schedule:'0 * * * *'}]:[]);assert.deepEqual({...config,crons:before.crons},before);checks++;
  const files=[...buffers].map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})).sort((a,b)=>a.path.localeCompare(b.path)),digest=sourceDigest(files),original=new Map(baseFiles.map(f=>[f.path,f]));
  const changes=files.filter(f=>!original.has(f.path)||original.get(f.path).sha256!==f.sha256).map(f=>({path:f.path,beforeSha256:original.get(f.path)?.sha256??null,afterSha256:f.sha256,added:!original.has(f.path),overlaySource:f.path==='vercel.json'?'local-cron-configuration-only':ON_DEMAND_OVERLAYS[kind][f.path]}));
  const manifest={version:1,status:'ON_DEMAND_LOCAL_NOT_APPLIED',kind,environment,...targets,candidate:`continuous-on-demand-${kind}-${environment}-${digest.slice(0,16)}`,sourceDigest:digest,base:ON_DEMAND_BASES[kind],files,changes,identicalSourceFiles:files.length-changes.length,changedSourceFiles:changes.length,addedSourceFiles:changes.filter(c=>c.added).length,cronSchedules:config.crons,operationMode:'continuous-on-demand',hasAdmissionDeadline:false,previewAcceptancePending:true,realPayments:0,privateFilesIncluded:0,credentialsCopied:false,productionPublished:false,cronActivated:false,environmentApplied:false,networkRequests:0};
  assert.equal(validateOnDemandCandidate(manifest,buffers,baseFiles,baseBuffers),true);checks++;
  for(const patch of [{hasAdmissionDeadline:true},{operationMode:'24h'},{realPayments:1},{productionPublished:true},{sourceDigest:'0'.repeat(64)},{changes:[]},{base:{...manifest.base,sourceDigest:'f'.repeat(64)}}]){assert.throws(()=>validateOnDemandCandidate({...manifest,...patch},buffers,baseFiles,baseBuffers));checks++;}
  const corrupted=new Map(buffers);corrupted.set('package.json',Buffer.from('unauthorized change'));assert.throws(()=>validateOnDemandCandidate(manifest,corrupted,baseFiles,baseBuffers),/SOURCE_BYTES_CHANGED/);checks++;
  const added=new Map(buffers);added.set('.env',Buffer.from('private'));assert.throws(()=>validateOnDemandCandidate(manifest,added,baseFiles,baseBuffers),/FILE_SET_CHANGED/);checks++;
 }
 assert.ok(Object.hasOwn(ON_DEMAND_OVERLAYS.bazaar,'lib/continuous-free-budget.ts'));assert.equal(Object.keys(ON_DEMAND_OVERLAYS.provider).length,4);checks++;
 const dependencies=new Map([['lib/a.ts',Buffer.from("import {b} from './b.ts';")],['lib/b.ts',Buffer.from('export const b=1;')]]);assert.equal(validateOnDemandDependencies(dependencies),true);checks++;
 dependencies.delete('lib/b.ts');assert.throws(()=>validateOnDemandDependencies(dependencies),/MISSING_ON_DEMAND_SOURCE_DEPENDENCY/);checks++;
 const source={kind:'provider',environment:'production',candidate:'continuous-on-demand-provider-production-test',sourceDigest:'a'.repeat(64),manifestSha256:'b'.repeat(64),sourceDirectory:'.vercel/continuous-on-demand-provider-production-source',manifest:'docs/evidence/test.json',files:22,cronSchedules:[]};
 const proposal={status:'FROZEN_ON_DEMAND_SOURCES_PREVIEW_PENDING',operationMode:'continuous-on-demand',hasAdmissionDeadline:false,productionPublished:false,cronActivated:false,payments:0,outputs:[source]},proposalHash='c'.repeat(64),plan=onDemandReleasePlan('provider','production',source,proposal,proposalHash);
 assert.deepEqual(plan.crons,[]);assert.equal(plan.nonSecretSettings.BAZAAR_SELLER_EXECUTION_MODE,'on-demand');assert.equal(plan.mutationAdapterPrepared,false);checks++;
 assert.throws(()=>onDemandReleaseApproval(plan,{approvedPlanHash:plan.planHash,approvedReviewHash:'0'.repeat(64)},proposalHash),/EXACT_NEW_JOINT_RELEASE_APPROVAL_REQUIRED/);assert.equal(onDemandReleaseApproval(plan,{approvedPlanHash:plan.planHash,approvedReviewHash:proposalHash},proposalHash),true);checks++;
 const intent={intentId:'91e79e2f-7f8f-4f1a-bbd1-8dd08e09b2dc'},d={id:'dpl_Synthetic',projectId:plan.projectId,target:'production',url:'ai-video-scriptwriter-test.vercel.app',crons:[],readyState:'READY',meta:{sourceDigest:plan.sourceDigest,onDemandPlanHash:plan.planHash,onDemandIntentId:intent.intentId}};
 assert.equal(matchOnDemandReleaseDeployment(d,intent,plan,{ready:true}).deploymentId,d.id);checks++;
 for(const patch of [{target:'preview'},{projectId:'other'},{crons:[{path:'/tick',schedule:'*/4 * * * *'}]},{meta:{...d.meta,sourceDigest:'f'.repeat(64)}}]){assert.throws(()=>matchOnDemandReleaseDeployment({...d,...patch},intent,plan,{ready:true}));checks++;}
 assert.throws(()=>onDemandReleasePlan('provider','production',source,{...proposal,hasAdmissionDeadline:true},proposalHash));checks++;
 await mkdir(resolve(fixture,'public'));await writeFile(resolve(fixture,'public/code.mjs'),'public');assert.equal((await readPlainOnDemandSource(fixture,'public/code.mjs')).toString(),'public');checks++;
 for(const path of ['../outside','.env.local','.vercel/key.dpapi','private/key.json']){await assert.rejects(readPlainOnDemandSource(fixture,path));checks++;}
 const module=await readFile('scripts/prepare-on-demand-sources.mjs','utf8');assert.ok(!module.includes('durationHours: 24'));assert.ok(!module.includes("schedule: '*/4 * * * *'"));checks++;
 assert.equal(networkRequests,0);checks++;
 console.log(JSON.stringify({status:'PASS',checks,runtimeFreezePending:true,snapshotsPrepared:false,existingSourcesModified:false,cloudWrites:0,networkRequests,privateProfilesRead:0,payments:0,cronActivated:false}));
}finally{globalThis.fetch=oldFetch;const rel=relative(root,fixture);if(!rel.startsWith('.vercel'+sep+'on-demand-source-test-')||rel.includes('..')||isAbsolute(rel))throw Error('OWN_LOCAL_TEST_CLEANUP_ONLY');await rm(fixture,{recursive:true,force:false});}
