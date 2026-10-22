// Offline one-file correction of the already frozen private diagnostic candidate.
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';
import {readPlainOnDemandSource} from './prepare-on-demand-v2-sources.mjs';
const root=process.cwd(),sha=b=>createHash('sha256').update(b).digest('hex'),basePath='docs/evidence/payment-diagnostic-bazaar-production-source-2026-10-12.json',baseSha='9a1c71f295ebd2781a6075901230dd109b4c5377050279d7b627ebd98440a410',path='lib/marketplace-http.ts';
const directory='.vercel/payment-diagnostic-origin-bazaar-production-source',manifestPath='docs/evidence/payment-diagnostic-origin-bazaar-production-source-2026-10-12.json';
try{
 if(process.argv.length!==2)throw Error('OFFLINE_SOURCE_HAS_NO_PRIVATE_ARGUMENTS');
 const raw=await readPlainOnDemandSource(root,basePath);if(sha(raw)!==baseSha)throw Error('PREVIOUS_DIAGNOSTIC_SOURCE_CHANGED');const base=JSON.parse(raw),buffers=new Map();
 if(base.sourceDigest!=='9f6bf4423d10b5f0d6dd7eee99f059d3be1ffb28a8bfda484d3bc8f79e3e98d8'||base.files.length!==343)throw Error('EXACT_DIAGNOSTIC_SOURCE_REQUIRED');
 for(const f of base.files){if(!safeSourcePath(f.path))throw Error('PLAIN_REVIEWED_SOURCE_REQUIRED');const b=await readPlainOnDemandSource(root,base.sourceDirectory+'/'+f.path);if(b.length!==f.bytes||sha(b)!==f.sha256)throw Error('PREVIOUS_DIAGNOSTIC_BYTES_CHANGED');buffers.set(f.path,b);}
 const next=await readPlainOnDemandSource(root,path);if(buffers.get(path).equals(next))throw Error('OPERATOR_ORIGIN_CORRECTION_REQUIRED');buffers.set(path,next);
 try{await lstat(resolve(root,directory));throw Error('NEW_IMMUTABLE_ORIGIN_SOURCE_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}
 const files=[...buffers].map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})).sort((a,b)=>a.path.localeCompare(b.path));
 const manifest={version:1,status:'FROZEN_LOCAL_PAYMENT_DIAGNOSTIC_ORIGIN_NOT_DEPLOYED',candidate:'payment-diagnostic-origin-bazaar-2026-10-12',sourceDirectory:directory,sourceDigest:sourceDigest(files),parentSourceDigest:base.sourceDigest,parentManifestSha256:baseSha,changedPaths:[path],files,providerUnchanged:true,productionPublished:false,newPayments:0,cronActivated:false,networkRequests:0,dpapiReads:0};
 for(const [p,b]of buffers){const out=resolve(root,directory,p);await mkdir(dirname(out),{recursive:true});await writeFile(out,b,{flag:'wx'});}
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await writeFile(resolve(root,manifestPath),bytes,{flag:'wx'});console.log(JSON.stringify({status:manifest.status,sourceDigest:manifest.sourceDigest,manifestSha256:sha(bytes),files:files.length,changedPaths:[path],manifestPath,newPayments:0,productionPublished:false,networkRequests:0}));
}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED_OFFLINE_ORIGIN_SOURCE',code:/^[A-Z_]{3,90}$/.test(e.message??'')?e.message:'OFFLINE_SOURCE_UNCONFIRMED',newPayments:0,productionPublished:false,networkRequests:0}));process.exitCode=1;}
