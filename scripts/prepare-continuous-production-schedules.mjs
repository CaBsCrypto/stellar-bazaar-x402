// Offline only: no cloud/client, environment/profile, scheduler, signer or
// deployment API exists here. Prepared sources require later explicit review.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname,join,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {verify,sourceDigest} from './prepare-functional-preview-source.mjs';
import {CONTINUOUS_PROVIDER_FROZEN_FILES,CONTINUOUS_PROVIDER_RUNTIME_FILES} from './prepare-continuous-provider-preview.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const specifications={
 bazaar:{manifest:'docs/evidence/hackathon-functional-preview-v2-source-2026-10-11.json',manifestSha256:'8874c78faa58a64f6445ac4b822bcc680e81d2b6074230bacd19911c8cd5a1a7',sourceDigest:'d6d0ac502cf6b0f7ae3a1c6110beb5060faf8f0a9a320c3a025422aa0adb5402',files:333,projectId:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',path:'/api/market/guardian/tick',schedule:'*/15 * * * *',dailyInvocations:96},
 provider:{manifest:'docs/evidence/continuous-provider-source-2026-10-11.json',manifestSha256:'4bc7acfb96a158a1512fb6893de3a40076ca76f0a253431158a3db0337ae51b3',sourceDigest:'1b11b1131bbe8010288953ad4ff609512b198ebf60c6b535a260842aec7cd210',files:22,projectId:'prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K',path:'/api/bazaar/seller/tick',schedule:'*/2 * * * *',dailyInvocations:720}
};
const fail=code=>{throw Error(code);};
const contained=(root,path)=>{const part=relative(root,path);return part!==''&&part!=='..'&&!part.startsWith('..'+sep)&&!isAbsolute(part);};
async function regularRead(root,path){if(!contained(root,path))fail('OWNED_PUBLIC_PATH_REQUIRED');let cursor=root;for(const part of relative(root,path).split(sep)){cursor=join(cursor,part);if((await lstat(cursor)).isSymbolicLink())fail('REGULAR_PUBLIC_PATH_REQUIRED');}return readFile(path);}
export function productionScheduleConfig(role,raw){const spec=specifications[role];if(!spec||!raw||!Array.isArray(raw.crons)||raw.crons.length)fail('UNSCHEDULED_EXACT_ROLE_REQUIRED');const config=structuredClone(raw);config.crons=[{path:spec.path,schedule:spec.schedule}];return config;}
export async function prepareContinuousProductionSchedules({repo=process.cwd(),action='dry-run',destination}={}){
 if(!['dry-run','source'].includes(action))fail('OFFLINE_ACTION_REQUIRED');const root=resolve(repo),groups={};
 for(const [role,spec]of Object.entries(specifications)){
  const manifestBytes=await regularRead(root,resolve(root,spec.manifest));if(sha(manifestBytes)!==spec.manifestSha256)fail('EXACT_SCHEDULE_BASE_MANIFEST_REQUIRED');const manifest=JSON.parse(manifestBytes);
  if(manifest.files.length!==spec.files||(role==='bazaar'?manifest.effectiveSourceDigest:manifest.sourceDigest)!==spec.sourceDigest||manifest.cronSchedules.length)fail('EXACT_UNSCHEDULED_SOURCE_REQUIRED');
  if(role==='bazaar')await verify(root,spec.manifest);
  const allowedProvider=new Set([...CONTINUOUS_PROVIDER_FROZEN_FILES,...CONTINUOUS_PROVIDER_RUNTIME_FILES.map(path=>'seller/'+path)]),files=[];
  for(const entry of manifest.files){if(role==='provider'&&!allowedProvider.has(entry.path))fail('EXACT_PUBLIC_PROVIDER_ALLOWLIST_REQUIRED');const bytes=await regularRead(root,resolve(root,manifest.sourceDirectory,entry.path));if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)fail('EXACT_SCHEDULE_BASE_SOURCE_REQUIRED');files.push({path:entry.path,bytes});}
  const configFile=files.find(entry=>entry.path==='vercel.json');configFile.bytes=Buffer.from(JSON.stringify(productionScheduleConfig(role,JSON.parse(configFile.bytes)),null,2)+'\n');
  const inventory=files.map(entry=>({path:entry.path,bytes:entry.bytes.length,sha256:sha(entry.bytes)})).sort((a,b)=>a.path.localeCompare(b.path));
  groups[role]={spec,files,review:{projectId:spec.projectId,baseManifest:spec.manifest,baseManifestSha256:spec.manifestSha256,baseSourceDirectory:manifest.sourceDirectory,baseSourceDigest:spec.sourceDigest,preparedSourceDigest:role==='bazaar'?sourceDigest(inventory):sha(JSON.stringify(inventory)),fileCount:files.length,onlyChangedPath:'vercel.json',config:JSON.parse(configFile.bytes),files:inventory}};
 }
 const plan={version:1,status:'PREPARED_PRODUCTION_SCHEDULES_NOT_APPLIED',preparedAt:new Date().toISOString(),controllerModes:['dry-run','source'],applySupported:false,previewSchedulesRemainEmpty:true,roles:Object.fromEntries(Object.entries(groups).map(([role,group])=>[role,group.review])),expectedReadyAcceptance:{bazaar:{deploymentId:'dpl_34HSB6e6SgxGd591EgF4KtwtZBiv',url:'https://stellar-bazaar-x402-8p3krrci9-cabscryptocontacto-6028s-projects.vercel.app',projectId:specifications.bazaar.projectId,sourceDigest:specifications.bazaar.sourceDigest,requiredState:'READY',liveRecheckedByThisController:false},provider:{projectId:specifications.provider.projectId,sourceDigest:specifications.provider.sourceDigest,requiredState:'READY',deploymentId:null,status:'EXACT_UPDATED_PREVIEW_REQUIRED',liveRecheckedByThisController:false}},activationGates:['Explicit review and authorization of candidate, environment, production publication and schedules','Live READY/project/source digest match for both updated previews','Manual idle seller acceptance with stable unsubmitted-ledger proof and purchases closed','Production scoped seller credentials and guardian authentication confirmed without exposure','Actual Vercel/Upstash cadence, capacity and plan accepted separately','Exact machine-route ingress and CRON_SECRET authentication accepted','Purchase opening and new transaction remain separate decisions'],cadence:{providerDailyInvocations:720,guardianDailyInvocations:96,leaseMinutes:6},workerLimits:{admissionMcpHttpDaily:4900,recoveryMcpHttpReserved:100,hardMcpHttpDaily:5000,executionsDaily:50},profilesRead:0,credentialsCopied:false,networkRequests:0,environmentChanges:0,deployments:0,manualTicks:0,payments:0,cronActivated:false,productionPublished:false};
 if(action==='source'){
  const target=resolve(root,destination??'.vercel/continuous-production-scheduled-source-20261011');if(!contained(resolve(root,'.vercel'),target)||!/^continuous-production-scheduled-source-[a-z0-9-]+$/.test(relative(resolve(root,'.vercel'),target)))fail('NEW_PREPARED_SOURCE_DIRECTORY_REQUIRED');
  if((await lstat(dirname(target))).isSymbolicLink())fail('REGULAR_PREPARED_PARENT_REQUIRED');try{await lstat(target);fail('NEW_PREPARED_SOURCE_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}await mkdir(target);
  for(const [role,group]of Object.entries(groups)){const folder=join(target,role);await mkdir(folder);for(const entry of group.files){const path=join(folder,entry.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,entry.bytes,{flag:'wx'});}plan.roles[role].preparedSourceDirectory=relative(root,folder).replaceAll('\\','/');}
  plan.sourceDirectory=relative(root,target).replaceAll('\\','/');await writeFile(join(target,'release-manifest.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 }
 return plan;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2);if(args.length===1&&args[0]==='--dry-run')console.log(JSON.stringify(await prepareContinuousProductionSchedules()));else if(args.length===2&&args[0]==='--source')console.log(JSON.stringify(await prepareContinuousProductionSchedules({action:'source',destination:args[1]})));else fail('USE_DRY_RUN_OR_NEW_SOURCE_ONLY');}
