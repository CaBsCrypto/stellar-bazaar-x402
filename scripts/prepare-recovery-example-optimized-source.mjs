// Freeze the reviewed new budget code without modifying the previous candidate.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';
const basePath='docs/evidence/recovery-example-bazaar-source-2026-10-12.json';
const finalWire=process.argv.length===3&&process.argv[2]==='--final-wire';
const sourceDirectory=finalWire?'.vercel/recovery-example-optimized-bazaar-wire-source':'.vercel/recovery-example-optimized-bazaar-source';
const evidence=finalWire?'docs/evidence/recovery-example-optimized-bazaar-wire-source-2026-10-13.json':'docs/evidence/recovery-example-optimized-bazaar-source-2026-10-13.json';
const overlays=['lib/marketplace-store.ts','lib/marketplace.ts','lib/marketplace-capacity.ts','lib/market-text-seller-runtime.ts','lib/continuous-free-budget.ts','lib/free-demo-budget.ts','lib/demo-http.ts','lib/acceptance-meter.ts','lib/example-budget-wire.ts','lib/example-budget-command-weight.ts','lib/example-provider-readiness-proof.ts'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(!finalWire&&process.argv.length!==2)throw Error('SOURCE_FREEZE_HAS_NO_PRIVATE_ARGUMENTS');
const base=JSON.parse(await readFile(basePath));
if(base.sourceDigest!=='8181954b49bcb0e9bbb5a75d65de60c14c5e50dece60d9cea6e7f3d2df16094e'||sourceDigest(base.files)!==base.sourceDigest||base.cronSchedules.length||base.privateFilesIncluded!==0)throw Error('PREVIOUS_FROZEN_CANDIDATE_REQUIRED');
await mkdir(sourceDirectory);
const files=[];
for(const path of [...new Set([...base.files.map(file=>file.path),...overlays])].sort()){
 if(!safeSourcePath(path))throw Error('PLAIN_PUBLIC_SOURCE_PATH_REQUIRED');
 const previous=base.files.find(file=>file.path===path),input=resolve(overlays.includes(path)?'.':base.sourceDirectory,path);
 if(!(await lstat(input)).isFile()||(await lstat(input)).isSymbolicLink())throw Error('PLAIN_SOURCE_REQUIRED');
 const bytes=await readFile(input);
 if(!overlays.includes(path)&&(sha(bytes)!==previous.sha256||bytes.length!==previous.bytes))throw Error('PREVIOUS_SOURCE_CHANGED');
 const target=resolve(sourceDirectory,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});
 files.push({path,bytes:bytes.length,sha256:sha(bytes)});
}
const configuration=JSON.parse(await readFile(resolve(sourceDirectory,'vercel.json')));
if(configuration.crons?.length)throw Error('PREVIEW_CRONS_FORBIDDEN');
const manifest={version:1,status:'FROZEN_REVIEWED_EXAMPLE_BUDGET_PREVIEW_SOURCE',sourceDirectory,sourceDigest:sourceDigest(files),parentSourceDigest:base.sourceDigest,parentManifest:basePath,fileCount:files.length,files,overlays,privateFilesIncluded:0,financialFixturesIncluded:0,cronSchedules:[],productionPublished:false,payments:0};
await writeFile(evidence,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:manifest.status,sourceDigest:manifest.sourceDigest,fileCount:files.length,evidence,productionPublished:false,payments:0}));
