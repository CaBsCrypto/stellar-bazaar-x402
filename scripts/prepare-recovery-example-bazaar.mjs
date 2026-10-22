import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {sourceDigest} from './prepare-functional-preview-source.mjs';
import {sha,exclusive,fail} from './recovery-example-preview-lib.mjs';

const root=resolve(import.meta.dirname,'..'),parentPath='docs/evidence/payment-recovery-acceptance-bazaar-source-v2-2026-10-12.json';
const destination='.vercel/recovery-example-bazaar-source',output='docs/evidence/recovery-example-bazaar-source-2026-10-12.json';
const parent=JSON.parse(await readFile(resolve(root,parentPath)));
if(parent.sourceDigest!=='3c3fe5ad3dc886e770c5aec1e1cee2762686558036c3bf55ec310899a35173ed'||parent.files.length!==344||sourceDigest(parent.files)!==parent.sourceDigest)fail('EXAMPLE_LIVE_SOURCE_PARENT_REQUIRED');
try{await lstat(resolve(root,destination));fail('EXAMPLE_NEW_SOURCE_DIRECTORY_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}
const replacements=new Set(['lib/market-text-seller-runtime.ts','lib/demo-configuration.ts']);
const buffers=new Map(),changes=[];
for(const file of parent.files){
  const baseline=await readFile(resolve(root,parent.sourceDirectory,file.path));
  if(sha(baseline)!==file.sha256||baseline.length!==file.bytes)fail('EXAMPLE_FROZEN_PARENT_CHANGED');
  let bytes=replacements.has(file.path)?await readFile(resolve(root,file.path)):baseline;
  if(file.path==='vercel.json'){const config=JSON.parse(baseline);delete config.crons;bytes=Buffer.from(JSON.stringify(config,null,2)+'\n');}
  if(!bytes.equals(baseline))changes.push({path:file.path,before:file.sha256,after:sha(bytes)});
  buffers.set(file.path,bytes);
}
if(changes.length!==3||!changes.some(v=>v.path==='vercel.json')||!buffers.get('lib/market-text-seller-runtime.ts').includes(Buffer.from('bazaar-recovery-example-text-v1'))||!buffers.get('lib/demo-configuration.ts').includes(Buffer.from('exampleTextSellerConfiguration')))fail('EXAMPLE_EXACT_SOURCE_DIFF_REQUIRED');
const files=[...buffers].map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes)})).sort((a,b)=>a.path.localeCompare(b.path));
await mkdir(resolve(root,destination));
for(const [path,bytes]of buffers){const target=resolve(root,destination,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});}
const receipt={version:1,status:'FROZEN_LOCAL_EXAMPLE_PREVIEW_SOURCE',sourceDirectory:destination,sourceDigest:sourceDigest(files),parentSourceDigest:parent.sourceDigest,parentManifest:parentPath,files,fileCount:files.length,changes,cronSchedules:[],limitsSourceUnchanged:files.find(v=>v.path==='lib/continuous-free-budget.ts').sha256===parent.files.find(v=>v.path==='lib/continuous-free-budget.ts').sha256,providerProductionUnchanged:true,privateFilesIncluded:0,productionPublished:false,payments:0};
await exclusive(resolve(root,output),receipt);
console.log(JSON.stringify({...receipt,files:files.length,manifest:output}));
