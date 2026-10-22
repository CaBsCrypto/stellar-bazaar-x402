// Local source chain only. No deployment, environment, payment or cloud mutation.
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verify as verifyPreview,safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';

export const PREVIEW_MANIFEST='docs/evidence/hackathon-functional-preview-v3-source-2026-10-11.json';
export const PREVIEW_MANIFEST_SHA256='980a84569c506739d80d00638741c78f31291a8ac4a23285d7121bac592e865f';
export const PREVIEW_SOURCE_DIGEST='3d540c2a2dc0a534b2b53ccd7cc8a54596b1a24535dcef473a32f7e536553347';
export const PRODUCTION_SOURCE='.vercel/hackathon-continuous-production-bazaar-source';
export const PRODUCTION_MANIFEST='docs/evidence/hackathon-continuous-production-bazaar-source-2026-10-11.json';
export const GUARDIAN_CRONS=Object.freeze([{path:'/api/market/guardian/tick',schedule:'*/15 * * * *'}]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Error(code);};
function confined(root,path){const target=resolve(root,path),rel=relative(root,target);if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))fail('SOURCE_BOUNDARY_DENIED');return target;}
async function plainRead(root,path){
 const target=confined(root,path);let current=root;
 for(const part of relative(root,target).split(sep)){current=resolve(current,part);if((await lstat(current)).isSymbolicLink())fail('PLAIN_SOURCE_REQUIRED');}
 const stat=await lstat(target);if(!stat.isFile())fail('PLAIN_SOURCE_REQUIRED');return readFile(target);
}
export function productionVercelConfiguration(previewBytes){
 const before=JSON.parse(Buffer.from(previewBytes).toString('utf8'));
 if(!Array.isArray(before.crons)||before.crons.length!==0)fail('CRON_FREE_PREVIEW_REQUIRED');
 const after={...before,crons:GUARDIAN_CRONS.map(value=>({...value}))};
 return Buffer.from(JSON.stringify(after,null,2)+'\n');
}
async function previewBinding(root){
 const bytes=await plainRead(root,PREVIEW_MANIFEST);if(sha(bytes)!==PREVIEW_MANIFEST_SHA256)fail('REVIEWED_V3_MANIFEST_REQUIRED');
 const manifest=JSON.parse(bytes.toString('utf8'));
 if(manifest.candidate!=='hackathon-functional-3d540c2a2dc0a534'||manifest.sourceDirectory!=='.vercel/hackathon-functional-preview-v3-source'||manifest.effectiveSourceDigest!==PREVIEW_SOURCE_DIGEST||manifest.files?.length!==336)fail('REVIEWED_V3_SOURCE_REQUIRED');
 await verifyPreview(root,PREVIEW_MANIFEST);
 return manifest;
}
export async function inspectProductionSource(root=process.cwd()){
 root=resolve(root);const base=await previewBinding(root),source=confined(root,base.sourceDirectory),files=[];
 let configBytes,change;
 for(const original of base.files){
  if(!safeSourcePath(original.path))fail('PRIVATE_SOURCE_REJECTED');
  const before=await plainRead(source,original.path);if(before.length!==original.bytes||sha(before)!==original.sha256)fail('REVIEWED_V3_SOURCE_CHANGED');
  const bytes=original.path==='vercel.json'?productionVercelConfiguration(before):before;
  files.push({path:original.path,bytes:bytes.length,sha256:sha(bytes),source:original.path==='vercel.json'?'reviewed-guardian-cron-overlay':'accepted-v3-preview'});
  if(original.path==='vercel.json'){configBytes=bytes;change={path:'vercel.json',beforeSha256:original.sha256,afterSha256:sha(bytes),onlySemanticChange:'crons',beforeCrons:[],afterCrons:GUARDIAN_CRONS};}
 }
 if(!configBytes||!change)fail('REVIEWED_VERCEL_CONFIGURATION_REQUIRED');
 const effectiveSourceDigest=sourceDigest(files),chain={baseManifest:PREVIEW_MANIFEST,baseManifestSha256:PREVIEW_MANIFEST_SHA256,baseSourceDigest:PREVIEW_SOURCE_DIGEST,files,changes:[change]};
 const plan={version:1,status:'LOCAL_PRODUCTION_SOURCE_PLAN',candidate:'hackathon-continuous-production-'+effectiveSourceDigest.slice(0,16),sourceDirectory:PRODUCTION_SOURCE,effectiveSourceDigest,planDigest:sha(Buffer.from(JSON.stringify(chain))),basePreview:{candidate:base.candidate,sourceDirectory:base.sourceDirectory,manifest:PREVIEW_MANIFEST,manifestSha256:PREVIEW_MANIFEST_SHA256,effectiveSourceDigest:PREVIEW_SOURCE_DIGEST,fileCount:336},changes:[change],files,identicalSourceFiles:335,changedSourceFiles:1,cronSchedules:GUARDIAN_CRONS,previewCronSchedules:[],privateFilesIncluded:0,productionPublished:false,cronActivated:false,environmentApplied:false,newPayments:0,authorizationRequired:true,hostedPreviewAcceptanceRequired:true};
 return {plan,configBytes};
}
export async function prepareProductionSource(root,expectedPlanDigest){
 root=resolve(root);const {plan,configBytes}=await inspectProductionSource(root);
 if(!/^[a-f0-9]{64}$/.test(expectedPlanDigest??'')||plan.planDigest!==expectedPlanDigest)fail('REVIEWED_PRODUCTION_PLAN_DIGEST_REQUIRED');
 const output=confined(root,PRODUCTION_SOURCE),targetManifest=confined(root,PRODUCTION_MANIFEST),base=confined(root,plan.basePreview.sourceDirectory);
 try{await lstat(targetManifest);fail('NEW_PRODUCTION_MANIFEST_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}
 await mkdir(output); // Exclusive new candidate; no source or manifest replacement.
 for(const file of plan.files){
  const bytes=file.path==='vercel.json'?configBytes:await plainRead(base,file.path);
  if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)fail('SOURCE_CHANGED_DURING_PREPARATION');
  const destination=confined(output,file.path);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes,{flag:'wx'});
 }
 const manifest={...plan,status:'FROZEN_PRODUCTION_SOURCE_PREPARED_NOT_APPLIED',observedAt:new Date().toISOString()};
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await writeFile(targetManifest,bytes,{flag:'wx',mode:0o600});
 return {status:manifest.status,candidate:manifest.candidate,sourceDirectory:PRODUCTION_SOURCE,manifest:PRODUCTION_MANIFEST,manifestSha256:sha(bytes),effectiveSourceDigest:manifest.effectiveSourceDigest,files:336,identicalSourceFiles:335,onlyChangedFile:'vercel.json',cronSchedules:GUARDIAN_CRONS,productionPublished:false,cronActivated:false,environmentApplied:false};
}
async function inventory(source,prefix=''){
 const paths=[];
 for(const entry of await readdir(resolve(source,prefix),{withFileTypes:true})){
  const path=prefix?prefix+'/'+entry.name:entry.name;
  if(!prefix&&['node_modules','.next'].includes(entry.name))continue;
  if(!prefix&&entry.name==='.vercel'){
   if(entry.isSymbolicLink()||!entry.isDirectory())fail('PRIVATE_CONTROL_FILES_REJECTED');
   const controls=await readdir(resolve(source,path),{withFileTypes:true});if(controls.some(v=>v.name!=='project.json'||!v.isFile()||v.isSymbolicLink()))fail('PRIVATE_CONTROL_FILES_REJECTED');continue;
  }
  if(entry.isSymbolicLink())fail('UNREVIEWED_SOURCE_LINK');
  if(entry.isDirectory())paths.push(...await inventory(source,path));else if(entry.isFile())paths.push(path);else fail('PLAIN_SOURCE_REQUIRED');
 }
 return paths;
}
export async function verifyProductionSource(root=process.cwd()){
 root=resolve(root);const base=await previewBinding(root),bytes=await plainRead(root,PRODUCTION_MANIFEST),manifest=JSON.parse(bytes.toString('utf8'));
 if(manifest.status!=='FROZEN_PRODUCTION_SOURCE_PREPARED_NOT_APPLIED'||manifest.sourceDirectory!==PRODUCTION_SOURCE||manifest.basePreview?.manifestSha256!==PREVIEW_MANIFEST_SHA256||manifest.basePreview.effectiveSourceDigest!==PREVIEW_SOURCE_DIGEST||manifest.files?.length!==336||manifest.changes?.length!==1||manifest.changes[0].path!=='vercel.json'||manifest.identicalSourceFiles!==335||manifest.changedSourceFiles!==1||JSON.stringify(manifest.cronSchedules)!==JSON.stringify(GUARDIAN_CRONS)||manifest.productionPublished!==false||manifest.cronActivated!==false||manifest.environmentApplied!==false)fail('PREPARED_PRODUCTION_MANIFEST_REQUIRED');
 const source=confined(root,PRODUCTION_SOURCE),expectedPaths=new Set(),baseFiles=new Map(base.files.map(file=>[file.path,file]));
 for(const file of manifest.files){
  if(!safeSourcePath(file.path)||expectedPaths.has(file.path))fail('SAFE_UNIQUE_SOURCE_REQUIRED');expectedPaths.add(file.path);
  const actual=await plainRead(source,file.path);if(actual.length!==file.bytes||sha(actual)!==file.sha256)fail('PREPARED_PRODUCTION_SOURCE_CHANGED');
  const accepted=baseFiles.get(file.path);if(!accepted)fail('UNREVIEWED_PRODUCTION_SOURCE');
  if(file.path!=='vercel.json'&&(accepted.sha256!==file.sha256||accepted.bytes!==file.bytes))fail('ONLY_CRON_CONFIGURATION_MAY_CHANGE');
 }
 const actual=await inventory(source);if(actual.length!==expectedPaths.size||actual.some(path=>!expectedPaths.has(path)))fail('UNMANIFESTED_PRODUCTION_SOURCE');
 const previewConfig=await plainRead(confined(root,base.sourceDirectory),'vercel.json');
 if(!(await plainRead(source,'vercel.json')).equals(productionVercelConfiguration(previewConfig)))fail('ONLY_CRON_CONFIGURATION_MAY_CHANGE');
 const ignore=(await plainRead(source,'.vercelignore')).toString('utf8').split(/\r?\n/);if(!['.vercel','node_modules','.next','.env*','build-provenance'].every(value=>ignore.includes(value)))fail('PRIVATE_EXCLUSIONS_REQUIRED');
 if(sourceDigest(manifest.files)!==manifest.effectiveSourceDigest||manifest.candidate!=='hackathon-continuous-production-'+manifest.effectiveSourceDigest.slice(0,16))fail('PRODUCTION_DIGEST_CHANGED');
 const chain={baseManifest:PREVIEW_MANIFEST,baseManifestSha256:PREVIEW_MANIFEST_SHA256,baseSourceDigest:PREVIEW_SOURCE_DIGEST,files:manifest.files,changes:manifest.changes};
 if(sha(Buffer.from(JSON.stringify(chain)))!==manifest.planDigest)fail('PRODUCTION_PROVENANCE_CHANGED');
 return {status:'PREPARED_PRODUCTION_SOURCE_VERIFIED',candidate:manifest.candidate,sourceDirectory:PRODUCTION_SOURCE,manifest:PRODUCTION_MANIFEST,manifestSha256:sha(bytes),effectiveSourceDigest:manifest.effectiveSourceDigest,files:336,identicalSourceFiles:335,changedSourceFiles:1,cronSchedules:GUARDIAN_CRONS,privateFilesIncluded:0,productionPublished:false,cronActivated:false,environmentApplied:false};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const action=process.argv[2];if(!['inspect','prepare','verify'].includes(action)||process.argv.length!==(action==='prepare'?4:3))fail('PRODUCTION_SOURCE_ACTION_REQUIRED');
  const result=action==='inspect'?(await inspectProductionSource()).plan:action==='prepare'?await prepareProductionSource(process.cwd(),process.argv[3]):await verifyProductionSource();
  console.log(JSON.stringify(action==='inspect'?{...result,files:result.files.length}:result));
 }catch(error){console.error(JSON.stringify({status:'UNCONFIRMED',code:/^[A-Z][A-Z0-9_]{1,95}$/.test(error?.message??'')?error.message:'PRODUCTION_SOURCE_UNCONFIRMED',productionPublished:false,cronActivated:false,environmentApplied:false}));process.exitCode=1;}
}
