// Freeze the production-only hourly guardian variant. No cloud/private access.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const parentManifest='docs/evidence/recovery-example-budget3-bazaar-source-2026-10-13.json';
const parent=JSON.parse(await readFile(parentManifest));
const parentDigest='47323858269c8f50b08f6cbd2d49cd6c2dddf75284b2e7f9683b67fb36aa1cf4';
if(parent.sourceDigest!==parentDigest||sourceDigest(parent.files)!==parentDigest||parent.privateFilesIncluded||parent.financialFixturesIncluded||parent.cronSchedules.length)throw Error('EXACT_FINAL_PREVIEW_SOURCE_REQUIRED');
const sourceDirectory='.vercel/recovery-example-budget3-production-bazaar-source',files=[];
const cronSchedules=[{path:'/api/market/guardian/tick',schedule:'0 * * * *'}];
await mkdir(sourceDirectory);
for(const row of parent.files){
 if(!safeSourcePath(row.path))throw Error('PUBLIC_SOURCE_REQUIRED');
 const input=resolve(parent.sourceDirectory,row.path),info=await lstat(input);let bytes=await readFile(input);
 if(!info.isFile()||info.isSymbolicLink()||sha(bytes)!==row.sha256||bytes.length!==row.bytes)throw Error('FINAL_SOURCE_CHANGED');
 if(row.path==='vercel.json'){const config=JSON.parse(bytes);if(config.crons?.length)throw Error('PREVIEW_MUST_BE_CRONLESS');config.crons=cronSchedules;bytes=Buffer.from(JSON.stringify(config,null,2)+'\n');}
 const target=resolve(sourceDirectory,row.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});files.push({path:row.path,bytes:bytes.length,sha256:sha(bytes)});
}
const manifest={version:1,status:'FROZEN_REVIEWED_EXAMPLE_RESTRICTED_PRODUCTION_SOURCE',sourceDirectory,sourceDigest:sourceDigest(files),parentManifest,parentSourceDigest:parentDigest,fileCount:files.length,files,overlays:['vercel.json'],privateFilesIncluded:0,financialFixturesIncluded:0,cronSchedules,productionPublished:false,payments:0};
const evidence='docs/evidence/recovery-example-budget3-production-bazaar-source-2026-10-13.json';await writeFile(evidence,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
let build=await readFile('.vercel/recovery-example-budget3-build.mjs','utf8');
build=build.replaceAll('recovery-example-budget3-bazaar','recovery-example-budget3-production-bazaar').replaceAll('recovery-example-budget3-build-offline','recovery-example-budget3-production-build-offline').replaceAll('FROZEN_REVIEWED_EXAMPLE_BUDGET_PREVIEW_SOURCE','FROZEN_REVIEWED_EXAMPLE_RESTRICTED_PRODUCTION_SOURCE').replace('manifest.cronSchedules.length)',"JSON.stringify(manifest.cronSchedules)!==JSON.stringify([{path:'/api/market/guardian/tick',schedule:'0 * * * *'}]))").replace('crons:[],productionPublished:false','crons:manifest.cronSchedules,productionPublished:false');
await writeFile('.vercel/recovery-example-budget3-production-build.mjs',build,{flag:'wx'});
console.log(JSON.stringify({status:manifest.status,sourceDigest:manifest.sourceDigest,parentDigest,fileCount:files.length,evidence,guardianPrepared:cronSchedules,cronActivated:false,productionPublished:false,payments:0}));
