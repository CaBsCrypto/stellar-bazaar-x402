// Freeze only the account HTTP correction and bounded guardian integration.
// This script never retrieves credentials or contacts a deployment.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const parentManifest='docs/evidence/recovery-example-budget3-bazaar-source-2026-10-13.json',parent=JSON.parse(await readFile(parentManifest));
if(parent.sourceDigest!=='47323858269c8f50b08f6cbd2d49cd6c2dddf75284b2e7f9683b67fb36aa1cf4'||sourceDigest(parent.files)!==parent.sourceDigest||parent.cronSchedules.length)throw Error('EXACT_V3_PARENT_REQUIRED');
const overlays=['app/api/account/identity/route.ts','app/api/account/queries/route.ts','lib/acceptance-meter.ts','lib/example-budget-wire.ts','lib/market-guardian.ts','lib/marketplace-store.ts'];
const additions=['lib/guardian-finite-budget.ts'];
const sourceDirectory='.vercel/recovery-example-budget4-bazaar-source',files=[];
await mkdir(sourceDirectory);
for(const row of parent.files){
 if(!safeSourcePath(row.path))throw Error('PUBLIC_SOURCE_REQUIRED');
 const inherited=resolve(parent.sourceDirectory,row.path),old=await readFile(inherited);if(sha(old)!==row.sha256||old.length!==row.bytes)throw Error('V3_PARENT_CHANGED');
 const input=resolve(overlays.includes(row.path)?'.':parent.sourceDirectory,row.path),info=await lstat(input),bytes=await readFile(input);
 if(!info.isFile()||info.isSymbolicLink())throw Error('PLAIN_SOURCE_REQUIRED');
 const target=resolve(sourceDirectory,row.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});files.push({path:row.path,bytes:bytes.length,sha256:sha(bytes)});
}
for(const path of additions){
 if(!safeSourcePath(path)||files.some(f=>f.path===path))throw Error('EXACT_NEW_PUBLIC_MODULE_REQUIRED');
 const input=resolve(path),info=await lstat(input),bytes=await readFile(input);if(!info.isFile()||info.isSymbolicLink())throw Error('PLAIN_NEW_PUBLIC_SOURCE_REQUIRED');
 const target=resolve(sourceDirectory,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});files.push({path,bytes:bytes.length,sha256:sha(bytes)});
}
files.sort((a,b)=>a.path.localeCompare(b.path));
const manifest={version:1,status:'FROZEN_REVIEWED_EXAMPLE_BUDGET_PREVIEW_SOURCE',sourceDirectory,sourceDigest:sourceDigest(files),parentSourceDigest:parent.sourceDigest,parentManifest,fileCount:files.length,files,overlays,additions,privateFilesIncluded:0,financialFixturesIncluded:0,cronSchedules:[],productionPublished:false,payments:0,budgetVersion:'example-text-wire/v3',candidateRevision:4,guardianPolicy:'two-full-attempts-per-32-days-with-atomic-credit-and-wire-guards'};
const evidence='docs/evidence/recovery-example-budget4-bazaar-source-2026-10-13.json';await writeFile(evidence,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
let build=await readFile('.vercel/recovery-example-budget3-build.mjs','utf8');build=build.replaceAll('recovery-example-budget3-bazaar','recovery-example-budget4-bazaar').replaceAll('recovery-example-budget3-build-offline','recovery-example-budget4-build-offline');await writeFile('.vercel/recovery-example-budget4-build.mjs',build,{flag:'wx'});
console.log(JSON.stringify({status:manifest.status,sourceDigest:manifest.sourceDigest,fileCount:files.length,evidence,productionPublished:false,payments:0}));
