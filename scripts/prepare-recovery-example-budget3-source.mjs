// Public local variant only. Retain all V2 trees and execution evidence.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const parentManifest='docs/evidence/recovery-example-budget2-final-bazaar-source-2026-10-13.json',parent=JSON.parse(await readFile(parentManifest));
if(parent.sourceDigest!=='0102c02fb47d7d8a33fd4a100db836df57f535c33683b5374bf1dd022a70f642'||sourceDigest(parent.files)!==parent.sourceDigest||parent.cronSchedules.length)throw Error('EXACT_V2_PARENT_REQUIRED');
const overlays=['lib/continuous-free-budget.ts','lib/marketplace-store.ts','lib/demo-http.ts','lib/operational-pressure.ts'],sourceDirectory='.vercel/recovery-example-budget3-bazaar-source',files=[];
await mkdir(sourceDirectory);
for(const row of parent.files){
 if(!safeSourcePath(row.path))throw Error('PUBLIC_SOURCE_REQUIRED');
 const inherited=resolve(parent.sourceDirectory,row.path),old=await readFile(inherited);if(sha(old)!==row.sha256||old.length!==row.bytes)throw Error('V2_PARENT_CHANGED');
 const input=resolve(overlays.includes(row.path)?'.':parent.sourceDirectory,row.path),info=await lstat(input),bytes=await readFile(input);
 if(!info.isFile()||info.isSymbolicLink())throw Error('PLAIN_SOURCE_REQUIRED');
 const target=resolve(sourceDirectory,row.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});files.push({path:row.path,bytes:bytes.length,sha256:sha(bytes)});
}
const manifest={version:1,status:'FROZEN_REVIEWED_EXAMPLE_BUDGET_PREVIEW_SOURCE',sourceDirectory,sourceDigest:sourceDigest(files),parentSourceDigest:parent.sourceDigest,parentManifest,fileCount:files.length,files,overlays,privateFilesIncluded:0,financialFixturesIncluded:0,cronSchedules:[],productionPublished:false,payments:0,budgetVersion:'example-text-wire/v3'};
const evidence='docs/evidence/recovery-example-budget3-bazaar-source-2026-10-13.json';await writeFile(evidence,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
let build=await readFile('.vercel/recovery-example-budget2-final-build.mjs','utf8');build=build.replaceAll('recovery-example-budget2-final-bazaar','recovery-example-budget3-bazaar').replaceAll('recovery-example-budget2-final-build-offline','recovery-example-budget3-build-offline');await writeFile('.vercel/recovery-example-budget3-build.mjs',build,{flag:'wx'});
console.log(JSON.stringify({status:manifest.status,sourceDigest:manifest.sourceDigest,fileCount:files.length,evidence,productionPublished:false,payments:0}));
